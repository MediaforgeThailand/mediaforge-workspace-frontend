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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { getNodeDownloadable } from "./NodePreviewLightbox";
import { downloadFromUrl } from "./downloadAsset";
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

  useOnSelectionChange({
    onChange: ({ nodes }) => {
      setSelected(nodes ?? []);
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

  // Single-node download — only surfaces when the selected node has a
  // downloadable artefact (uploaded asset OR a generation with a URL).
  // Multi-select doesn't get a download button: zip-bundling N files
  // is its own UX (queue + progress chip) and isn't worth shipping
  // before the demo. Users can still click each node and hit
  // download individually.
  const downloadable = single ? getNodeDownloadable(single) : null;
  const onDownload = useCallback(() => {
    if (!downloadable) return;
    void downloadFromUrl(downloadable.url, downloadable.label);
  }, [downloadable]);

  if (!screenPos || selected.length === 0) return null;

  // The toolbar sits OUTSIDE the React Flow viewport tree (portal to
  // body) so it never gets clipped or transformed by the canvas pan
  // matrix — we already compute screen-space coords above.
  return createPortal(
    <div
      className="ws-quick-toolbar pointer-events-auto fixed z-[1000] flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-zinc-700/80 bg-zinc-900/95 p-1 shadow-xl shadow-black/40 backdrop-blur"
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
        "flex h-7 w-7 items-center justify-center rounded transition-colors",
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
