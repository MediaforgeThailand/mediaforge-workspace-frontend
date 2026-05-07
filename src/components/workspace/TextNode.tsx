/**
 * Text Node — a reusable prompt block.
 *
 * Body uses the legacy `PromptMentionTextarea` so @mentions render as
 * blue chips (atomic — backspace deletes the whole pill in one go).
 * Tokens are serialised on the wire as `@[Label](nodeId)`, which the
 * backend's `workspace-run-node` dispatcher rewrites into positional
 * "image N" references plus a `[Context: …]` block before calling
 * the model.
 *
 * Data shape:
 *   { label: string     // editable; other nodes can @-mention it
 *   , content: string   // raw payload, contains @[Label](nodeId) tokens
 *   , width?: number    // drag-resized box width (px); falls back to default
 *   , height?: number   // drag-resized box height (px); falls back to default
 *   }
 */

import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import { Type, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import PromptMentionTextarea from "@/components/flow/nodes/PromptMentionTextarea";
import { CLEAN_NODE_BODY_TOP_PX, PortIcon } from "./PortIcon";
import { useLanguage } from "@/contexts/LanguageContext";
import NodeQuickActionRail from "./NodeQuickActionRail";

interface TextNodeData {
  label: string;
  content: string;
  width?: number;
  height?: number;
}

const TEXT_COLOR = "hsl(217 91% 60%)"; // blue — text output

/* Resize bounds. Defaults bumped +30% (260→338, 180→234) per user
 *  feedback that the Text node felt too small relative to other
 *  canvas tiles — at 260×180 it read as a small annotation when
 *  the whole point of TextNode is to be the prompt source for
 *  multi-mention chains. Existing nodes already have a saved
 *  `data.width` / `data.height`, so this only affects newly-
 *  created nodes; the corner resize handle can still drag back
 *  down to MIN. */
const DEFAULT_W = 338;
const DEFAULT_H = 234;
const MIN_W = 200;
const MIN_H = 120;
const MAX_W = 900;
const MAX_H = 800;
/* The body has padding/title/handle margin around the textarea.
 *  This subtraction lets the textarea fill the resized box exactly,
 *  with the inline-style cap from PromptMentionTextarea handling
 *  scroll when content exceeds visible height. */
const BODY_CHROME_H = 40;

const TextNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as TextNodeData;
  const { setNodes } = useReactFlow();
  const { t } = useLanguage();
  const [isHovered, setIsHovered] = useState(false);

  const width = d.width ?? DEFAULT_W;
  const height = d.height ?? DEFAULT_H;

  const updateField = useCallback(
    (field: "label" | "content", value: string) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n)),
      );
    },
    [id, setNodes],
  );

  const onContentChange = useCallback(
    (v: string) => updateField("content", v),
    [updateField],
  );

  // Token count derived from serialised form — used by the footer chip.
  const onDeleteNode = useCallback(() => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
  }, [id, setNodes]);

  const mentionCount = useMemo(() => {
    const text = d.content ?? "";
    const matches = text.match(/@\[[^\]]+\]\([^)]+\)/g);
    return matches?.length ?? 0;
  }, [d.content]);

  /* Drag-to-resize from the bottom-right corner. Pointer-event based
   *  so it covers mouse + pen + touch with one handler. Pointer
   *  capture means the drag keeps tracking even when the cursor
   *  leaves the dot. Stop propagation so React Flow doesn't
   *  interpret the gesture as a node-drag. Width + height are
   *  committed to `node.data` on every move so undo/redo + live
   *  multiplayer overlays see the change in real time. */
  const startSizeRef = useRef<{ w: number; h: number; x: number; y: number } | null>(null);
  const onResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      startSizeRef.current = { w: width, h: height, x: e.clientX, y: e.clientY };

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
    // Outer wrapper — `overflow-visible` so the floating title sits
    // OUTSIDE the body box and ports can overhang the corners.
    <div
      className="ws-clean-node relative"
      data-state={selected ? "selected" : "idle"}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ width }}
    >
      {/* Floating title — icon + editable name, NO background, NO
       *  border, sits above the body (matches the design reference). */}
      <NodeQuickActionRail
        visible={selected || isHovered}
        selected={selected}
        onDelete={selected ? onDeleteNode : undefined}
        nodeId={id}
        mediaKind="text"
        bodyTopOffsetPx={CLEAN_NODE_BODY_TOP_PX}
      />

      <div className="ws-clean-title">
        {/* Title icon is neutral grey across every node type — TEXT_COLOR
         *  still drives the output port + wire colour below. */}
        <Type className="ws-clean-title-icon text-zinc-400" />
        <input
          value={d.label ?? ""}
          onChange={(e) => updateField("label", e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="ws-clean-title-input nodrag"
          placeholder={t("workspace.node.text_name_placeholder")}
        />
      </div>

      {/* Body — single clean rounded box, no internal dividers.
       *  Height is now driven by the resized `height` (or default)
       *  so the box is a real container the textarea can fill. */}
      <div
        className={cn(
          "workspace-node-shell ws-clean-body",
          selected && "is-selected",
        )}
        data-state={selected ? "selected" : "idle"}
        style={{ height }}
      >
        <PromptMentionTextarea
          value={d.content ?? ""}
          onChange={onContentChange}
          placeholder={t("workspace.node.text_body_placeholder")}
          excludeNodeId={id}
          // Workspace assets show up under `assetNode`. Include the
          // legacy `inputNode` so a flow imported from the main
          // editor still resolves its mentions here.
          allowedNodeTypes={["assetNode", "inputNode"]}
          /* `leading-snug` (1.375) replaces `leading-relaxed`
           *  (1.625). User reported the lines felt too far apart
           *  on the Text node specifically — same fix as
           *  StickyNote, slightly looser because the body text is
           *  bigger (15.5px vs 13px) and benefits from a touch
           *  more breathing room for Thai diacritics. */
          className="ws-clean-textarea min-h-[80px] text-[15.5px] leading-snug text-zinc-100"
          /* Cap the rendered textarea to the resized body height
           *  minus the body's own padding + footer chip area.
           *  Inline-style cap (set inside PromptMentionTextarea)
           *  beats Tailwind's `max-h-[280px]` so the textarea
           *  always fits the user's chosen height and scrolls
           *  inside the box when content overflows. */
          maxHeightPx={Math.max(60, height - BODY_CHROME_H)}
        />

        {mentionCount > 0 && (
          <div className="mt-1 flex items-center gap-1 text-[9px] text-zinc-500">
            <AtSign className="h-2.5 w-2.5" />
            {mentionCount} {mentionCount === 1 ? t("workspace.node.text_ref_singular") : t("workspace.node.text_ref_plural")}
          </div>
        )}
      </div>

      {/* Resize handle — tiny dot anchored at the bottom-right of
       *  the body. Visible while the node is selected so an idle
       *  text card stays clean. `nodrag nopan` so React Flow
       *  doesn't grab the pointer for canvas pan; `cursor-nwse-
       *  resize` makes the affordance obvious. */}
      {selected && (
        <div
          onPointerDown={onResizeStart}
          className="nodrag nopan absolute -bottom-1 -right-1 z-10 h-3 w-3 cursor-nwse-resize rounded-full bg-blue-500 shadow-md ring-2 ring-zinc-900/80"
          style={{ touchAction: "none" }}
          title="Drag to resize"
        />
      )}

      {/* Output handle — text-typed icon at the top-right cluster. */}
      <PortIcon
        dir="source"
        handleId="default"
        label={t("workspace.node.text_output")}
        portType="text"
        color={TEXT_COLOR}
        index={0}
        bodyTopOffsetPx={CLEAN_NODE_BODY_TOP_PX}
      />
    </div>
  );
});

TextNode.displayName = "TextNode";
export default TextNode;
