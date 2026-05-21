import { memo, useCallback, useEffect, useRef } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

export interface BoardTextData {
  text?: string;
  width?: number;
  height?: number;
}

const DEFAULT_W = 260;
const DEFAULT_H = 120;
const MIN_W = 160;
const MIN_H = 72;
const MAX_W = 900;
const MAX_H = 720;

const BoardTextNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as BoardTextData;
  const { setNodes } = useReactFlow();
  const { t } = useLanguage();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const startSizeRef = useRef<{ w: number; h: number; x: number; y: number } | null>(null);

  const width = d.width ?? DEFAULT_W;
  const height = d.height ?? DEFAULT_H;

  useEffect(() => {
    if (!selected || (d.text ?? "").trim()) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [d.text, selected]);

  const onChange = useCallback(
    (next: string) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, text: next } } : n)),
      );
    },
    [id, setNodes],
  );

  const onResizeStart = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget as HTMLElement;
      target.setPointerCapture(event.pointerId);
      startSizeRef.current = {
        w: width,
        h: height,
        x: event.clientX,
        y: event.clientY,
      };

      const onMove = (ev: PointerEvent) => {
        const start = startSizeRef.current;
        if (!start) return;
        const nextW = Math.max(MIN_W, Math.min(MAX_W, start.w + ev.clientX - start.x));
        const nextH = Math.max(MIN_H, Math.min(MAX_H, start.h + ev.clientY - start.y));
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
    [height, id, setNodes, width],
  );

  return (
    <div
      className={cn(
        "relative rounded-[8px] border bg-[#101111]/88 shadow-[0_14px_34px_rgba(0,0,0,0.32)] backdrop-blur",
        selected ? "border-[#dfff1f]/80" : "border-white/10",
      )}
      style={{ width, height }}
      data-testid="board-text-node"
    >
      <textarea
        ref={inputRef}
        value={d.text ?? ""}
        onChange={(event) => onChange(event.target.value)}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        placeholder={t("workspace.node.board_text_placeholder")}
        className="nodrag nopan nowheel h-full w-full resize-none overflow-y-auto bg-transparent px-4 py-3 text-[18px] font-semibold leading-[1.28] text-zinc-50 outline-none placeholder:text-zinc-500"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.22) transparent",
        }}
      />
      {selected && (
        <div
          onPointerDown={onResizeStart}
          className="nodrag nopan absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-full bg-[#dfff1f] shadow-md ring-2 ring-black/70"
          style={{ touchAction: "none" }}
          title="Drag to resize"
        />
      )}
    </div>
  );
});

BoardTextNode.displayName = "BoardTextNode";
export default BoardTextNode;
