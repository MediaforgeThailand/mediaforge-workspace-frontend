/**
 * Sticky Note — free-floating editable note for canvas annotations.
 *
 * Drops onto the canvas like a Post-it: yellow tinted card, no ports,
 * editable text, drag-resizable corner. Used to leave reminders next
 * to nodes ("rerun w/ wider denoise", "ask the team about this
 * variant"). Not connected to the run pipeline at all — backend never
 * sees stickies.
 *
 * Design choices:
 *   - No connection handles. Stickies are visual annotations, not
 *     dataflow. Wires would add nothing useful and would clutter the
 *     edge palette.
 *   - Editable inline. Click → focus → type. No modal, no toolbar.
 *   - Yellow / amber tint to read as "human note" against the grey
 *     scaffolding of nodes and the dark canvas.
 */

import { memo, useCallback } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

export interface StickyNoteData {
  text?: string;
}

const StickyNoteNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as StickyNoteData;
  const { setNodes } = useReactFlow();
  const { t } = useLanguage();

  const onChange = useCallback(
    (next: string) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, text: next } } : n)),
      );
    },
    [id, setNodes],
  );

  return (
    <div
      className={cn(
        "relative rounded-md p-3 shadow-lg transition-all",
        selected
          ? "ring-2 ring-amber-300/70"
          : "ring-1 ring-amber-300/15",
      )}
      style={{
        width: 220,
        minHeight: 160,
        // Soft amber gradient — feels like a paper Post-it, not a UI
        // chip. Slight edge darkening at the bottom-right hints at a
        // peeled-corner shadow without faking actual paper.
        background:
          "linear-gradient(135deg, hsl(48 95% 70% / 0.92), hsl(40 90% 60% / 0.88))",
        boxShadow:
          "0 8px 24px hsl(40 80% 30% / 0.35), 0 1px 2px hsl(0 0% 0% / 0.4)",
      }}
    >
      {/* Editable text — contentEditable would inflate the node-data
       *  shape; a plain textarea keeps state Zustand-friendly and
       *  auto-grows via row=1 + the field-sizing trick (CSS height
       *  driven by content). `nodrag` prevents React Flow from
       *  intercepting click-to-focus as a node-drag. */}
      <textarea
        value={d.text ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        placeholder={t("workspace.node.sticky_placeholder")}
        className={cn(
          "nodrag block h-full w-full resize-none bg-transparent text-[13px] leading-relaxed text-amber-950 outline-none placeholder:text-amber-900/40",
        )}
        style={{ minHeight: 134, fontFamily: "var(--font-sans)" }}
      />
    </div>
  );
});

StickyNoteNode.displayName = "StickyNoteNode";
export default StickyNoteNode;
