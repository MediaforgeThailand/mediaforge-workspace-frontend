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

const MENU_WIDTH = 184;
const MENU_MAX_HEIGHT = 248;

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

  const left = Math.min(
    position.x,
    Math.max(8, window.innerWidth - MENU_WIDTH - 8),
  );
  const top = Math.min(
    position.y,
    Math.max(8, window.innerHeight - MENU_MAX_HEIGHT - 8),
  );

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
        "fixed z-[1600] overflow-hidden rounded-[10px] py-1",
        "bg-[#151515]/98 text-zinc-100 backdrop-blur-xl",
        "shadow-[0_20px_54px_-20px_rgba(0,0,0,.88),0_0_0_1px_rgba(255,255,255,.055)]",
      )}
      style={{ left, top, width: MENU_WIDTH }}
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
            {item.separatorBefore && <div className="my-1 h-px bg-white/[0.07]" />}
            <button
              type="button"
              role="menuitem"
              data-testid={`media-context-menu-${item.key}`}
              disabled={item.disabled}
              onClick={() => fire(item)}
              className={cn(
                "flex h-[32px] w-full items-center gap-2.5 px-3 text-left text-[13px] font-medium leading-none transition-colors",
                item.disabled
                  ? "cursor-not-allowed text-zinc-600"
                  : item.danger
                    ? "text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    : "text-zinc-300 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={2} />
              <span className="truncate">{item.label}</span>
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
