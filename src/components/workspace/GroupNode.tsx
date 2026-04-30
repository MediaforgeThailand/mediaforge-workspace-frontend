/**
 * Group Node — visual frame that bundles other nodes (Figma frame style).
 *
 * Children point at a group via React Flow's native `parentId` +
 * `extent: "parent"` props — they're real nodes, just rendered inside
 * the group's bounding box and constrained to it. The group itself
 * is just a sized container with a label, a border, and ONE output
 * port that emits "all my children's URLs as an array" (resolved by
 * WorkspaceToolNode's resolveInputs when something downstream wires
 * into the group's output handle).
 *
 * Group content is read-only from the frame's perspective — children
 * keep their own ports / settings / Run button. The frame only adds:
 *   - rename (inline)
 *   - select-all-children behaviour (handled by ReactFlow when the
 *     user clicks the frame body)
 *   - one shared output that downstream nodes consume as multi-ref
 */

import { memo, useCallback, useEffect, useMemo } from "react";
import {
  NodeResizer,
  useNodes,
  type NodeProps,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { Group as GroupIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PortIcon } from "./PortIcon";

type OutputType = "image" | "video" | "audio";

const PORT_COLOR: Record<OutputType, string> = {
  image: "hsl(160 84% 39%)",
  video: "hsl(258 90% 66%)",
  audio: "hsl(43 96% 56%)",
};

interface GroupNodeData {
  label?: string;
}

const GroupNode = memo(({ id, data, selected }: NodeProps) => {
  const d = (data ?? {}) as GroupNodeData;
  const { setNodes } = useReactFlow();
  const allNodes = useNodes();

  /* ── Compute which output ports to render ──────────────────
   * Walk every child (parentId === this group) and collect the
   * media type each one ACTUALLY EMITS RIGHT NOW. We deliberately
   * DON'T pre-emptively advertise tool-node output types until a
   * Run lands a generation: the audit caught a bug where a freshly
   * dropped Video Gen child lit up a `video` port on the group, the
   * user wired it downstream, and Run produced nothing because
   * resolveInputs only walks `generations[]` (which was empty). The
   * port-advertisement and the URL-resolution have to agree. */
  const outputTypes = useMemo(() => {
    const types = new Set<OutputType>();
    for (const n of allNodes) {
      if (n.parentId !== id) continue;
      const cd = (n.data ?? {}) as Record<string, unknown>;

      // 1. Plain assets — fieldType wins
      if (n.type === "assetNode") {
        const ft = cd.fieldType as string | undefined;
        if (ft === "image" || ft === "video" || ft === "audio") {
          types.add(ft);
        }
        continue;
      }

      // 2. Elements always image-shaped (they have URLs at creation
      //    time — saved-mode has cached refs, creator-mode walks
      //    upstream asset edges).
      if (n.type === "elementNode") {
        types.add("image");
        continue;
      }

      // 3. Tool nodes — only advertise the port if there's a real
      //    generation with a real URL the group can emit.
      const gens = Array.isArray(cd.generations)
        ? (cd.generations as Array<{ type?: string; url?: string }>)
        : [];
      for (const g of gens) {
        if (!g?.url) continue; // skip text-only / placeholder gens
        const t = g.type === "video" ? "video" : g.type === "audio" ? "audio" : "image";
        types.add(t);
      }
      // No URL-bearing generation yet → no port. The user will see
      // the group port appear after they Run the child.
    }
    // Stable order — image / video / audio top-to-bottom.
    return (["image", "video", "audio"] as const).filter((t) => types.has(t));
  }, [allNodes, id]);

  /* When the group's set of output ports changes (a child finishes
   * generating, a child is added/removed, etc.), nudge React Flow
   * to re-measure handles. Without this, downstream wires can't
   * land on the freshly-appeared port — same gotcha as in
   * WorkspaceToolNode and ElementNode. */
  const updateNodeInternals = useUpdateNodeInternals();
  const outputFingerprint = outputTypes.join("|");
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, outputFingerprint, updateNodeInternals]);

  const updateLabel = useCallback(
    (newLabel: string) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, label: newLabel } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  return (
    <>
      {/* ── Resize handles — only visible when selected ─────────
       *  React Flow's NodeResizer overlays 8 drag handles (4 corners
       *  + 4 edges) plus a visible border. Mutates `node.style.width`
       *  / `node.style.height` directly, which feeds straight back
       *  into our store via the existing onNodesChange replace path
       *  (so resize is also undoable via Ctrl+Z). Children stay where
       *  they are — resizing the frame doesn't move them, matching
       *  Figma frame behaviour. */}
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={180}
        lineClassName="ws-group-resize-line"
        handleClassName="ws-group-resize-handle"
      />

      {/* ── Frame body ─────────────────────────────────────── */}
      {/* Sits at z-index 0 inside the node so React Flow's child
       *  nodes (rendered separately) layer on top automatically. */}
      <div
        className={cn(
          "absolute inset-0 rounded-lg border-2 transition-colors",
          selected
            ? "border-zinc-300/70 bg-zinc-800/15"
            : "border-zinc-700/50 bg-zinc-900/10",
        )}
      />

      {/* ── Title bar — floats above the frame, inline rename ─ */}
      <div className="absolute -top-7 left-2 flex items-center gap-1.5 rounded-md bg-zinc-900/90 px-2 py-0.5 text-[11px] font-medium text-zinc-200 shadow-sm backdrop-blur">
        <GroupIcon className="h-3 w-3 shrink-0 text-zinc-500" />
        <input
          value={d.label ?? "New group"}
          onChange={(e) => updateLabel(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="nodrag w-32 truncate bg-transparent text-zinc-200 outline-none"
          placeholder="New group"
        />
      </div>

      {/* ── Output ports — one icon per content TYPE present among
       *  the children. Group of just images → 1 image port.
       *  Mixed (image + video) → 2 ports. Move a video gen node
       *  into the group → its video port appears even before a
       *  generation exists, so the user can pre-wire the chain.
       *  Each port emits the union of every child URL OF THAT
       *  TYPE; resolveInputs in WorkspaceToolNode filters by
       *  edge.sourceHandle so the right media flows down. Icons
       *  cluster at the top-right of the group frame so they read
       *  the same as every other workspace node. */}
      {outputTypes.map((t, i) => (
        <PortIcon
          key={t}
          dir="source"
          handleId={t}
          label={`Group ${t} output`}
          portType={t}
          color={PORT_COLOR[t]}
          index={i}
        />
      ))}
    </>
  );
});

GroupNode.displayName = "GroupNode";
export default GroupNode;
