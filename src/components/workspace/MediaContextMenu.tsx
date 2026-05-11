import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { MediaContextMenuItem } from "./mediaMenuItems";

export type { MediaContextMenuItem } from "./mediaMenuItems";

interface MediaContextMenuProps {
  position: { x: number; y: number };
  items: MediaContextMenuItem[];
  onClose: () => void;
  /** Optional accessible name for the menu surface. Callers that
   *  need an i18n'd aria-label (e.g. the per-node menu) pass it in;
   *  the default media-asset call sites omit it. */
  ariaLabel?: string;
}

export default function MediaContextMenu({
  position,
  items,
  onClose,
  ariaLabel,
}: MediaContextMenuProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        panelRef.current &&
        target instanceof globalThis.Node &&
        panelRef.current.contains(target)
      ) {
        return;
      }
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const nextLeft = Math.min(position.x, window.innerWidth - rect.width - pad);
    const nextTop = Math.min(position.y, window.innerHeight - rect.height - pad);
    el.style.left = `${Math.max(pad, nextLeft)}px`;
    el.style.top = `${Math.max(pad, nextTop)}px`;
  }, [position.x, position.y, items.length]);

  const fire = (item: MediaContextMenuItem) => {
    if (item.disabled) return;
    item.onSelect();
    onClose();
  };

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={ariaLabel}
      data-testid="media-context-menu"
      className={cn(
        "fixed z-[9999] w-[176px] overflow-hidden rounded-[8px] border border-[#2d2d2d] bg-[#171717] py-[5px] shadow-[0_14px_30px_rgba(0,0,0,.48)]",
      )}
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.key}>
            {item.separatorBefore && <div className="my-[5px] h-px bg-[#2a2a2a]" />}
            <button
              type="button"
              role="menuitem"
              data-testid={`media-context-menu-${item.key}`}
              disabled={item.disabled}
              onClick={() => fire(item)}
              className={cn(
                "flex h-[31px] w-full items-center gap-[10px] px-[12px] text-left text-[13px] font-medium leading-none transition-colors",
                item.disabled
                  ? "cursor-default text-[#6f7175]"
                  : item.danger
                    ? "text-[#ff453a] hover:bg-[#261a1a]"
                    : "text-[#d7d7d7] hover:bg-[#242424] hover:text-white",
              )}
            >
              <span
                className={cn(
                  "flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center text-[#aeb2b7]",
                  item.disabled && "text-[#62656a]",
                  item.danger && "text-[#ff453a]",
                )}
              >
                <Icon size={14} strokeWidth={2} />
              </span>
              <span className="truncate">{item.label}</span>
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
