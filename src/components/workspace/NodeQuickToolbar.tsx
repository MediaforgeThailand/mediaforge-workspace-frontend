/**
 * Floating quick-action toolbar — appears above the bounding box of
 * the current selection (single OR multi).
 *
 * Action set is gated by what makes sense for the current selection:
 *
 *   ── 2+ nodes selected ──
 *     • Group              wrap into a frame, single output port
 *     • Array as grid      arrange in a 2-col grid (snap to bbox top-left)
 *     • Duplicate          clone selection (no edges)
 *     • Delete             remove all
 *
 *   ── 1 group selected ──
 *     • Ungroup            children pop out, frame is removed
 *     • Duplicate
 *     • Delete             (children are auto-rescued by store)
 *
 *   ── 1 tool node ──
 *     • Run                Ctrl+Enter equivalent
 *     • Duplicate
 *     • Delete
 *
 *   ── 1 asset / element / text ──
 *     • Duplicate
 *     • Delete
 *
 * Position math: bbox top-centre in flow coords → screen coords via
 * `flowToScreenPosition`. The toolbar lives in a portal (so it isn't
 * clipped by the canvas overflow box). Pan/zoom updates re-fire the
 * position because we depend on `useViewport()`.
 */

import { memo, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  useReactFlow,
  useViewport,
  useOnSelectionChange,
  type Node,
} from "@xyflow/react";
import {
  Trash2,
  Copy,
  Group as GroupIcon,
  Ungroup,
  LayoutGrid,
  Play,
  Download,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { getNodeDownloadable } from "./NodePreviewLightbox";
import { downloadFromUrl } from "./downloadAsset";
import { bundleNodesAsZip, harvestAssetsFromNode } from "./bundleNodes";
import { cloneNodeFresh } from "./cloneNode";

const TOOL_NODE_TYPES = new Set([
  "imageGenNode",
  "videoGenNode",
  "removeBackgroundNode",
  "mergeAudioNode",
  "videoToPromptNode",
  "chatAiNode",
  "bananaProNode",
  "klingVideoNode",
]);

/** Subset of tool nodes where Multi-Gen (x2 / x3) is meaningful — i.e.
 *  *generators* whose output is non-deterministic per run, so firing N
 *  parallel runs returns N distinct candidates the user can pick from
 *  (mirrors Freepik's x1/x2/x3 button on their generator nodes).
 *
 *  Excluded:
 *   • removeBackgroundNode  — deterministic transform, x3 = same output
 *   • videoToPromptNode      — deterministic captioning of a fixed video
 *   • mergeAudioNode         — deterministic audio mixdown
 *
 *  Included (image / video generators):
 *   • imageGenNode, bananaProNode, videoGenNode, klingVideoNode,
 *     chatAiNode (LLMs are non-deterministic too).
 */
const MULTI_GEN_NODE_TYPES = new Set([
  "imageGenNode",
  "videoGenNode",
  "chatAiNode",
  "bananaProNode",
  "klingVideoNode",
]);

const MULTI_GEN_MAX = 3 as const;
/** Horizontal spacing between source and each clone. ~Default node
 *  width (437) + a 43px gap so the clones sit visually adjacent
 *  without overlapping, matching Freepik's "row of generator nodes"
 *  layout. */
const MULTI_GEN_X_OFFSET = 480;

const NEW_ID = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const NodeQuickToolbar = memo(() => {
  const {
    flowToScreenPosition,
    getEdges,
    getNodes: rfGetNodes,
    setNodes,
    setEdges,
  } = useReactFlow();
  const viewport = useViewport(); // re-render on pan/zoom
  const groupSelectedNodes = useWorkspaceStore((s) => s.groupSelectedNodes);
  const ungroupNode = useWorkspaceStore((s) => s.ungroupNode);
  const arrangeSelectedAsGrid = useWorkspaceStore(
    (s) => s.arrangeSelectedAsGrid,
  );
  const pushHistory = useWorkspaceStore((s) => s.pushHistory);

  const [selected, setSelected] = useState<Node[]>([]);
  const [multiGenOpen, setMultiGenOpen] = useState(false);

  useOnSelectionChange({
    onChange: ({ nodes }) => {
      setSelected(nodes ?? []);
      // Close the multi-gen popover whenever the selection changes —
      // it's anchored to the current single-node selection so leaving
      // it open while the anchor moves looks broken.
      setMultiGenOpen(false);
    },
  });

  /* ── Compute screen position from selection bbox ─────────── */
  const screenPos = useMemo(() => {
    if (selected.length === 0) return null;
    const NODE_W_FALLBACK = 260;
    const NODE_H_FALLBACK = 200;

    // ReactFlow `Node.position` is RELATIVE to parent when `parentId`
    // is set. To get on-screen coords we need ABSOLUTE positions.
    // `useReactFlow().getNodes()` returns nodes with `positionAbsolute`
    // computed by the runtime — use that when available.
    const xs: number[] = [];
    const ys: number[] = [];
    const xs2: number[] = [];
    const ys2: number[] = [];
    for (const n of selected) {
      const abs =
        (n as Node & { positionAbsolute?: { x: number; y: number } })
          .positionAbsolute ?? n.position;
      const w = n.width ?? NODE_W_FALLBACK;
      const h = n.height ?? NODE_H_FALLBACK;
      xs.push(abs.x);
      ys.push(abs.y);
      xs2.push(abs.x + w);
      ys2.push(abs.y + h);
    }

    const top = Math.min(...ys);
    const midX = (Math.min(...xs) + Math.max(...xs2)) / 2;
    return flowToScreenPosition({ x: midX, y: top });
    // Re-run when viewport pan/zoom changes — flowToScreenPosition
    // is a stable reference but its OUTPUT depends on the viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, viewport.x, viewport.y, viewport.zoom, flowToScreenPosition]);

  /* ── Selection-derived flags ────────────────────────────── */
  const single = selected.length === 1 ? selected[0] : null;
  const multi = selected.length >= 2;
  const isGroup = single?.type === "groupNode";
  const isToolNode = single ? TOOL_NODE_TYPES.has(single.type ?? "") : false;
  const isMultiGenNode = single
    ? MULTI_GEN_NODE_TYPES.has(single.type ?? "")
    : false;
  // Disable multi-gen while the source is mid-run — kicking off another
  // 2-3 parallel runs on a node whose own request is still inflight is
  // a foot-gun (would burn double credits before the first completes).
  const sourceIsRunning = single
    ? (single.data as { status?: string } | undefined)?.status === "processing"
    : false;

  /* ── Actions ────────────────────────────────────────────── */
  const onGroup = useCallback(() => {
    groupSelectedNodes();
  }, [groupSelectedNodes]);

  const onUngroup = useCallback(() => {
    if (single) ungroupNode(single.id);
  }, [single, ungroupNode]);

  // Re-arrange selection in a 2-col grid using REAL measured dims.
  // Zustand store doesn't track per-node size, but React Flow does —
  // every rendered node gets `measured: { width, height }` populated
  // by the runtime once layout settles. Reading those here means the
  // cell size is always at least as big as the LARGEST node in the
  // selection, which fixes the overlap that happened when an Asset
  // tile (≈ 280×340) got squeezed into a 200×200 fallback cell.
  const onArrange = useCallback(() => {
    const allNodes = rfGetNodes();
    const sel = allNodes.filter((n) => n.selected);
    if (sel.length < 2) return;

    // Snapshot before mutation so Ctrl+Z can revert the layout in one
    // shot. (Round 1 + 2 audit found this missing → silent data loss.)
    pushHistory();

    // Compute each node's ABSOLUTE position so a mixed selection of
    // group-children + free nodes lays out coherently. Children's
    // `position` is relative-to-parent, so naïve usage would teleport
    // them. We arrange the grid in absolute coords then convert back
    // to relative for any node whose parentId stays the same.
    const dim = (n: Node) => {
      const m =
        (n as Node & { measured?: { width?: number; height?: number } })
          .measured;
      return {
        w: m?.width ?? n.width ?? 300,
        h: m?.height ?? n.height ?? 320,
      };
    };

    const absolutePosOf = (n: Node): { x: number; y: number } => {
      if (!n.parentId) return n.position;
      const parent = allNodes.find((p) => p.id === n.parentId);
      if (!parent) return n.position;
      // Parent is itself a top-level group (no nesting), so parent
      // position IS absolute — single addition is sufficient.
      return {
        x: parent.position.x + n.position.x,
        y: parent.position.y + n.position.y,
      };
    };

    // Sort by absolute coords for stable top-down / left-right layout.
    const enriched = sel
      .map((n) => ({ node: n, abs: absolutePosOf(n) }))
      .sort(
        (a, b) => a.abs.y - b.abs.y || a.abs.x - b.abs.x,
      );

    const baseAbs = enriched[0].abs;
    const cellW = Math.max(...enriched.map((e) => dim(e.node).w), 300);
    const cellH = Math.max(...enriched.map((e) => dim(e.node).h), 320);
    const GAP = 32;
    const COLUMNS = 2;

    // Map id → final ABSOLUTE position. Conversion to relative
    // happens below per-node based on each node's existing parentId.
    const finalAbsolute = new Map<string, { x: number; y: number }>();
    enriched.forEach(({ node }, i) => {
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      finalAbsolute.set(node.id, {
        x: baseAbs.x + col * (cellW + GAP),
        y: baseAbs.y + row * (cellH + GAP),
      });
    });

    setNodes((nds) =>
      nds.map((n) => {
        const abs = finalAbsolute.get(n.id);
        if (!abs) return n;
        // Convert back to whatever coord space this node lives in.
        if (n.parentId) {
          const parent = nds.find((p) => p.id === n.parentId);
          if (parent) {
            return {
              ...n,
              position: {
                x: abs.x - parent.position.x,
                y: abs.y - parent.position.y,
              },
            };
          }
        }
        return { ...n, position: abs };
      }),
    );
  }, [rfGetNodes, setNodes, pushHistory]);

  const onDelete = useCallback(() => {
    if (selected.length === 0) return;
    // Explicit snapshot — React Flow's diff-based onNodesChange path
    // sometimes batches removes in ways that miss the store-side
    // history hook, so we belt-and-brace it here.
    pushHistory();
    const ids = new Set(selected.map((n) => n.id));
    setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
    setEdges((eds) =>
      eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
    );
  }, [selected, setNodes, setEdges, pushHistory]);

  const onDuplicate = useCallback(() => {
    if (selected.length === 0) return;
    pushHistory();
    const idMap = new Map<string, string>();
    const cloned: Node[] = selected.map((n) => {
      const nid = NEW_ID();
      idMap.set(n.id, nid);
      // `cloneNodeFresh` deep-copies data (params, generations,
      // previewUrl, …) so the duplicate keeps the original's image
      // preview + model/param settings, resets the live `status`
      // flag so a copy of an in-flight Image Gen doesn't appear to
      // also be running, and bumps the display label ("Foo" → "Foo
      // copy", "Foo copy" → "Foo copy 2") so the two are
      // distinguishable in the title bar without renaming.
      const fresh = cloneNodeFresh(n, nid);
      // Ctrl+D offsets the duplicate by +30,+30 so it doesn't sit
      // exactly on top of the source. Selected so the user can keep
      // editing / dragging the new copy without a re-click.
      return {
        ...fresh,
        position: { x: n.position.x + 30, y: n.position.y + 30 },
        selected: true,
      };
    });
    // Internal edges (both endpoints duplicated) come along.
    const internalEdges = getEdges()
      .filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e) => ({
        ...e,
        id: NEW_ID(),
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
        selected: false,
      }));
    setNodes((nds) => [
      ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
      ...cloned,
    ]);
    setEdges((eds) => [...eds, ...internalEdges]);
  }, [selected, getEdges, setNodes, setEdges, pushHistory]);

  const onRunSingle = useCallback(() => {
    if (!single) return;
    window.dispatchEvent(
      new CustomEvent("workspace-run-shortcut", {
        detail: { nodeId: single.id },
      }),
    );
  }, [single]);

  /**
   * Multi-gen — clone the source generator node N-1 times to its
   * right, copy every incoming edge to each clone (so all N nodes
   * read the same upstream inputs), then fire Run on every node in
   * the group at once. Mirrors Freepik's "x1 / x2 / x3" button:
   * picking x3 yields a row of three identical generators all
   * processing in parallel, giving the user 3 candidate outputs to
   * choose from for the cost of 3 runs.
   *
   * Edge handling:
   *   • Incoming edges (target === source.id) → cloned for each
   *     new node, preserving `targetHandle` so multi-port wiring
   *     (e.g. Banana's ref_image[1..14]) lands on the same handle.
   *   • Outgoing edges (source === source.id) → NOT cloned. Each
   *     clone is a parallel candidate; the user picks one and
   *     wires its output downstream manually. Auto-cloning out-
   *     edges would fan out the rest of the graph N× which is
   *     almost never what's wanted.
   *
   * Run dispatch:
   *   • The source node is run via the existing `workspace-run-
   *     shortcut` window event.
   *   • Each clone is stamped with `data.runOnMount = true`. The
   *     WorkspaceToolNode mount effect picks up that flag and
   *     auto-calls runNode() once it's mounted + has its event
   *     listener wired. This avoids a fragile setTimeout race
   *     between setNodes() and the new component mounting.
   *
   * Hard cap:
   *   • Count is clamped to MULTI_GEN_MAX (3). The popover UI
   *     only exposes 1/2/3 anyway, but we belt-and-brace.
   */
  const runMulti = useCallback(
    (count: number) => {
      if (!single) return;
      const n = Math.min(Math.max(count, 1), MULTI_GEN_MAX);
      // x1 = same as the regular Run button — short-circuit to keep
      // the code path obvious (no clones, no edge copying).
      if (n === 1) {
        window.dispatchEvent(
          new CustomEvent("workspace-run-shortcut", {
            detail: { nodeId: single.id },
          }),
        );
        return;
      }

      pushHistory();

      const sourceNode = single;
      const incomingEdges = getEdges().filter(
        (e) => e.target === sourceNode.id,
      );

      // Build N-1 clones, each offset to the right of the previous.
      const cloned: Node[] = [];
      const newEdges: typeof incomingEdges = [];
      for (let i = 1; i < n; i++) {
        const cloneId = NEW_ID();
        const fresh = cloneNodeFresh(sourceNode, cloneId);
        cloned.push({
          ...fresh,
          // Stamp `runOnMount` so the WorkspaceToolNode auto-fires
          // its run as soon as it mounts. We can't dispatch the
          // run-shortcut event right after setNodes() because the
          // new <WorkspaceToolNode> hasn't mounted yet → its
          // window listener isn't registered → the event is
          // dropped on the floor.
          data: { ...fresh.data, runOnMount: true },
          position: {
            x: sourceNode.position.x + MULTI_GEN_X_OFFSET * i,
            y: sourceNode.position.y,
          },
          selected: false,
        });
        // Mirror every incoming edge from the source to this clone,
        // preserving `targetHandle` so multi-port handles (Banana's
        // ref_image[1..14], etc.) land on the matching slot.
        for (const e of incomingEdges) {
          newEdges.push({
            ...e,
            id: NEW_ID(),
            target: cloneId,
            selected: false,
          });
        }
      }

      setNodes((nds) => [
        // Deselect everything; the multi-gen group runs as a unit
        // and the toolbar would otherwise re-anchor to a stale
        // selection bbox mid-clone.
        ...nds.map((nd) =>
          nd.selected ? { ...nd, selected: false } : nd,
        ),
        ...cloned,
      ]);
      setEdges((eds) => [...eds, ...newEdges]);

      // Fire the source's run synchronously — its listener is already
      // attached. Clones fire themselves via `runOnMount` in their
      // own mount effect.
      window.dispatchEvent(
        new CustomEvent("workspace-run-shortcut", {
          detail: { nodeId: sourceNode.id },
        }),
      );

      toast.success(`Generating ${n} variations in parallel`);
    },
    [single, getEdges, setNodes, setEdges, pushHistory],
  );

  // Single-node download — only surfaces when the selected node has a
  // downloadable artefact (uploaded asset OR a generation with a URL).
  const downloadable = single ? getNodeDownloadable(single) : null;
  const onDownload = useCallback(() => {
    if (!downloadable) return;
    void downloadFromUrl(downloadable.url, downloadable.label);
  }, [downloadable]);

  // Multi-selection download — bundles every harvestable asset across
  // the selection into a single ZIP via `bundleNodesAsZip`, with a
  // sonner toast pair (loading → success/error) that surfaces partial
  // failures (e.g. one signed URL expired but the other 4 packed
  // fine). Mirrors the right-click "Download all as ZIP" path so the
  // two entry points behave identically.
  const multiDownloadable = useMemo(() => {
    if (!multi) return 0;
    return selected.reduce(
      (acc, n) => acc + harvestAssetsFromNode(n).length,
      0,
    );
  }, [multi, selected]);
  const onDownloadMulti = useCallback(async () => {
    if (selected.length === 0) return;
    const refCount = multiDownloadable;
    if (refCount === 0) {
      toast.error("Nothing to download — selection has no output yet");
      return;
    }
    const id = toast.loading(`Bundling ${refCount} assets...`);
    try {
      const res = await bundleNodesAsZip(selected);
      if (res.succeeded === 0) {
        toast.error(
          `Bundle failed${res.firstError ? `: ${res.firstError}` : ""}`,
          { id },
        );
        return;
      }
      const partial =
        res.failed > 0
          ? ` (${res.failed} failed: ${res.firstError ?? "unknown"})`
          : "";
      toast.success(`Downloaded ${res.bundleName}${partial}`, { id });
    } catch (err) {
      toast.error(
        `Bundle failed: ${err instanceof Error ? err.message : String(err)}`,
        { id },
      );
    }
  }, [selected, multiDownloadable]);

  if (!screenPos || selected.length === 0) return null;

  // The toolbar sits OUTSIDE the React Flow viewport tree (portal to
  // body) so it never gets clipped or transformed by the canvas pan
  // matrix — we already compute screen-space coords above.
  return createPortal(
    <div
      className="ws-quick-toolbar pointer-events-auto fixed z-[1000] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-full items-center gap-1 overflow-x-auto rounded-lg border border-zinc-700/80 bg-zinc-900/95 p-1 shadow-xl shadow-black/40 backdrop-blur lg:gap-0.5"
      style={{ left: screenPos.x, top: screenPos.y - 12 }}
      // Don't let clicks here fall through to the canvas (which would
      // deselect the very nodes the toolbar is acting on).
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {multi && (
        <>
          <ToolbarBtn
            icon={GroupIcon}
            label="Group selection"
            onClick={onGroup}
          />
          <ToolbarBtn
            icon={LayoutGrid}
            label="Arrange as grid"
            onClick={onArrange}
          />
          {/* Download all as ZIP — same handler as the right-click
           *  multi-download. Greyed (still clickable, just toasts
           *  "nothing to download") when the selection has no
           *  harvestable assets. Mirrors the spec's "add Download
           *  next to Copy / Delete" requirement. */}
          <ToolbarBtn
            icon={Download}
            label={`Download all (${selected.length}) as ZIP`}
            onClick={() => void onDownloadMulti()}
          />
          <Separator />
        </>
      )}

      {!multi && isGroup && (
        <>
          <ToolbarBtn
            icon={Ungroup}
            label="Ungroup"
            onClick={onUngroup}
          />
          <Separator />
        </>
      )}

      {!multi && isToolNode && (
        <>
          <ToolbarBtn
            icon={Play}
            label="Run (Ctrl+Enter)"
            onClick={onRunSingle}
          />
          {/* Multi-gen — Freepik-style x1/x2/x3 selector. Only
           *  surfaces on generator nodes (image / video / LLM)
           *  where parallel runs return distinct candidates;
           *  deterministic transforms (remove-bg, video-to-prompt,
           *  audio merge) hide it because x3 = same output 3x. */}
          {isMultiGenNode && (
            <MultiGenButton
              disabled={sourceIsRunning}
              open={multiGenOpen}
              onOpenChange={setMultiGenOpen}
              onPick={(c) => {
                setMultiGenOpen(false);
                runMulti(c);
              }}
            />
          )}
          <Separator />
        </>
      )}

      {!multi && downloadable && (
        <ToolbarBtn
          icon={Download}
          label="Download"
          onClick={onDownload}
        />
      )}

      <ToolbarBtn
        icon={Copy}
        label="Duplicate (Ctrl+D)"
        onClick={onDuplicate}
      />
      <ToolbarBtn
        icon={Trash2}
        label="Delete (Del)"
        onClick={onDelete}
        danger
      />
    </div>,
    document.body,
  );
});

NodeQuickToolbar.displayName = "NodeQuickToolbar";
export default NodeQuickToolbar;

/* ── Subcomponents ──────────────────────────────────────────── */

function ToolbarBtn({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded transition-colors lg:h-7 lg:w-7",
        danger
          ? "text-zinc-400 hover:bg-rose-500/15 hover:text-rose-300"
          : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function Separator() {
  return <div className="mx-0.5 h-5 w-px bg-zinc-800" />;
}

/**
 * Multi-gen control — anchor button + inline x1/x2/x3 picker.
 *
 * Click the anchor to expand the picker; click an x-count to fire
 * `onPick(count)`. When `disabled` (source node mid-run) the anchor
 * is greyed out and click is no-op'd, with a hover title explaining
 * why so the user isn't left guessing.
 *
 * Layout: when `open`, the picker replaces the anchor in the toolbar
 * row so the toolbar's overall horizontal extent stays stable (the
 * portal-positioned toolbar reanchors on each render based on
 * selection bbox; an anchor that grows + collapses inline would
 * cause the toolbar to jitter horizontally as the user opens/closes).
 */
function MultiGenButton({
  disabled,
  open,
  onOpenChange,
  onPick,
}: {
  disabled: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (count: number) => void;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => !disabled && onOpenChange(true)}
        disabled={disabled}
        title={
          disabled
            ? "Wait for the current run to finish before queuing a multi-gen"
            : "Multi-generate (x2 / x3 parallel runs)"
        }
        aria-label="Multi-generate"
        className={cn(
          "flex h-7 items-center gap-1 rounded px-1.5 transition-colors",
          disabled
            ? "cursor-not-allowed text-zinc-600"
            : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
        )}
      >
        <Layers className="h-4 w-4" />
        <span className="text-[10px] font-semibold tabular-nums">x</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-0.5 rounded bg-zinc-800/80 p-0.5 lg:gap-0.5" onMouseLeave={() => onOpenChange(false)}>
      {[1, 2, 3].map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          title={
            c === 1
              ? "Single run (same as Run button)"
              : `Generate ${c} variations in parallel`
          }
          aria-label={`x${c}`}
          className={cn(
            "flex h-10 min-w-10 items-center justify-center rounded px-1 text-[11px] font-semibold tabular-nums transition-colors lg:h-6 lg:min-w-[26px]",
            c === 1
              ? "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
              : "text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200",
          )}
        >
          x{c}
        </button>
      ))}
    </div>
  );
}
