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
 *   - Drag the bottom-right dot to resize. Width + height persist on
 *     the node data so the size survives reloads / Undo / Redo.
 *   - When typed text exceeds the visible area, the textarea scrolls
 *     internally — `nowheel` + `nopan` so the wheel scrolls inside
 *     the note instead of panning the canvas.
 */

import { memo, useCallback, useRef } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

export interface StickyNoteData {
  text?: string;
  /** Stored size in CSS pixels. Optional — falls back to the
   *  default 220×160 when absent so existing notes don't change
   *  shape after this change ships. */
  width?: number;
  height?: number;
}

const DEFAULT_W = 220;
const DEFAULT_H = 160;
const MIN_W = 160;
const MIN_H = 110;
const MAX_W = 800;
const MAX_H = 800;

const StickyNoteNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as StickyNoteData;
  const { setNodes } = useReactFlow();
  const { t } = useLanguage();

  const width = d.width ?? DEFAULT_W;
  const height = d.height ?? DEFAULT_H;

  const onChange = useCallback(
    (next: string) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, text: next } } : n)),
      );
    },
    [id, setNodes],
  );

  /* Drag-to-resize from the bottom-right corner.
   *
   * Pointer-event based so it works for mouse + pen + touch with the
   * same handler. Pointer capture keeps the drag tracking even when
   * the cursor leaves the dot. We stop propagation so React Flow
   * doesn't interpret the gesture as a node-drag.
   *
   * Width + height clamp into [MIN, MAX]; the result is committed to
   * `node.data` once at pointer-up via setNodes — typing during a
   * resize is fine because the textarea's `value` is independent of
   * the dimensions in the same data object. */
  const startSizeRef = useRef<{ w: number; h: number; x: number; y: number } | null>(null);
  const onResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      startSizeRef.current = {
        w: width,
        h: height,
        x: e.clientX,
        y: e.clientY,
      };

      const onMove = (ev: PointerEvent) => {
        const start = startSizeRef.current;
        if (!start) return;
        const nextW = Math.max(MIN_W, Math.min(MAX_W, start.w + (ev.clientX - start.x)));
        const nextH = Math.max(MIN_H, Math.min(MAX_H, start.h + (ev.clientY - start.y)));
        setNodes((ns) =>
          ns.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, width: Math.round(nextW), height: Math.round(nextH) } }
              : n,
          ),
        );
      };

      const onEnd = () => {
        startSizeRef.current = null;
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onEnd);
        target.removeEventListener("pointercancel", onEnd);
      };

      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onEnd);
      target.addEventListener("pointercancel", onEnd);
    },
    [id, setNodes, width, height],
  );

  return (
    <div
      className={cn(
        "relative rounded-md p-3 shadow-lg transition-shadow",
        selected
          ? "ring-2 ring-amber-300/70"
          : "ring-1 ring-amber-300/15",
      )}
      style={{
        width,
        height,
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
       *  shape; a plain textarea keeps state Zustand-friendly. The
       *  textarea now FILLS the node body (height: 100% of parent
       *  minus padding) and scrolls when content overflows. `nowheel`
       *  + `nopan` so the wheel scrolls the textarea instead of
       *  panning the canvas. `nodrag` prevents React Flow from
       *  intercepting click-to-focus as a node-drag. */}
      <textarea
        value={d.text ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        placeholder={t("workspace.node.sticky_placeholder")}
        className={cn(
          "nodrag nopan nowheel block h-full w-full resize-none overflow-y-auto bg-transparent text-[13px] text-amber-950 outline-none placeholder:text-amber-900/40",
        )}
        style={{
          /* Tighter line-height than the previous `leading-relaxed`
           *  (1.625). The user said lines were too far apart — 1.35
           *  reads as note-style "compact handwriting" while still
           *  giving Thai diacritics + descenders enough room to
           *  breathe. */
          lineHeight: 1.35,
          fontFamily: "var(--font-sans)",
          /* Slim translucent scrollbar so the user can SEE that the
           *  textarea is scrollable when text overflows. The global
           *  `* { scrollbar-width: none !important }` rule in
           *  index.css would otherwise hide it; inline style wins
           *  via specificity. */
          scrollbarWidth: "thin",
          scrollbarColor: "hsl(40 80% 30% / 0.45) transparent",
        }}
      />

      {/* Resize handle — small dot anchored at the bottom-right
       *  corner. `nodrag nopan` so the canvas doesn't grab the
       *  pointer, and `cursor: nwse-resize` makes the affordance
       *  obvious on hover. Hidden until the note is selected so an
       *  unselected note reads as plain paper. */}
      {selected && (
        <div
          onPointerDown={onResizeStart}
          className="nodrag nopan absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-full bg-amber-700 shadow-md ring-2 ring-amber-100/80"
          style={{ touchAction: "none" }}
          title="Drag to resize"
        />
      )}
    </div>
  );
});

StickyNoteNode.displayName = "StickyNoteNode";
export default StickyNoteNode;
