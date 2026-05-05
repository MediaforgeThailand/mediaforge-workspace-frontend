import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MediaContextMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
}

interface MediaContextMenuProps {
  position: { x: number; y: number };
  items: MediaContextMenuItem[];
  onClose: () => void;
}

export default function MediaContextMenu({
  position,
  items,
  onClose,
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

  useEffect(() => {
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
      data-testid="media-context-menu"
      className={cn(
        "fixed z-[9999] min-w-[180px] overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 py-1 shadow-xl",
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
            {item.separatorBefore && <div className="my-1 border-t border-neutral-800" />}
            <button
              type="button"
              role="menuitem"
              data-testid={`media-context-menu-${item.key}`}
              disabled={item.disabled}
              onClick={() => fire(item)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                item.disabled
                  ? "cursor-not-allowed text-zinc-600"
                  : item.danger
                    ? "text-neutral-300 hover:bg-red-600/20 hover:text-red-400"
                    : "text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100",
              )}
            >
              <span className={cn("flex-shrink-0", item.danger && "text-red-500")}>
                <Icon size={14} />
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
