/**
 * NodeContextMenu — small portal-rendered menu that appears when the
 * user RIGHT-CLICKS on one or more node(s) on the canvas.
 *
 * Activation:
 *   - Right-click on a single node          → single-node mode
 *   - Right-click on any selected node OR
 *     on canvas while ≥2 nodes are selected → multi-selection mode
 *
 * EMPTY-canvas right-click is handled by `CanvasContextMenu` (the
 * full tool palette) — we never spawn there. Wiring lives in
 * `WorkspaceCanvas.tsx`.
 *
 * Visual style mirrors the existing CanvasContextMenu (zinc-on-dark,
 * glass-sheen) but condensed to 4–6 short rows. Click-outside / Esc
 * dismiss; clicking a row fires its handler then closes.
 *
 * Action set is gated by what the selection can offer:
 *
 *   ── 1 node ──
 *     • Download                       (always shown; greyed if no asset)
 *     • Download all generations       (only tool nodes, ≥2 generations)
 *     • Duplicate
 *     • Delete
 *
 *   ── 2+ nodes ──
 *     • Download all (N items) as ZIP  (greyed if 0 downloadable assets)
 *     • Duplicate all
 *     • Delete all
 */

import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { type LucideIcon } from "lucide-react";
import type { Node as RFNode } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

export interface NodeContextMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Greyed out + non-interactive. Used for "Download" on a node with
   *  no asset yet (so the user can SEE the option exists, just not
   *  available right now — better discoverability than hiding). */
  disabled?: boolean;
  /** Hover tint goes red — for delete-style actions. */
  danger?: boolean;
  /** Render a separator ABOVE this row. */
  separatorBefore?: boolean;
}

interface Props {
  /** The node the user right-clicked on (single-mode) or a representative
   *  node from the selection (multi-mode). Currently only used by the
   *  caller; the menu itself is fully data-driven via `items`. */
  anchorNode?: RFNode;
  /** Cursor position in viewport pixels — where the menu opens. */
  position: { x: number; y: number };
  /** Action list — caller computes the gate logic, we just render. */
  items: NodeContextMenuItem[];
  onClose: () => void;
}

const NodeContextMenu = ({ position, items, onClose }: Props) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { t } = useLanguage();

  // Click-outside / Esc / native-context-menu suppression. We listen
  // via `mousedown` (capture) so a click on a panel button doesn't
  // close the menu before its onSelect can fire.
  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      const t = e.target;
      // The panel is portaled to body — `contains` works because the
      // portal preserves DOM hierarchy from the panel root. We guard
      // against non-DOM event targets just to keep TS happy.
      if (
        panelRef.current &&
        t instanceof globalThis.Node &&
        panelRef.current.contains(t)
      ) {
        return;
      }
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    // mousedown (capture) beats subsequent click handlers — the
    // existing canvas wrapper-level onContextMenu is on a child of
    // body, so the capturing listener here sees the event first.
    window.addEventListener("mousedown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
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

  const fire = (item: NodeContextMenuItem) => {
    if (item.disabled) return;
    item.onSelect();
    onClose();
  };

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={t("workspace.nodemenu.aria")}
      className={cn(
        "fixed z-[9999] w-[176px] overflow-hidden rounded-[8px] border border-[#2d2d2d] bg-[#171717] py-[5px] shadow-[0_14px_30px_rgba(0,0,0,.48)]",
      )}
      style={{
        left: position.x,
        top: position.y,
        fontFamily: "var(--font-sans)",
      }}
      onContextMenu={(e) => {
        // Don't let a 2nd right-click on the menu surface re-open
        // the wrapper-level context handler underneath us.
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.key}>
            {item.separatorBefore && (
              <div className="my-[5px] h-px bg-[#2a2a2a]" />
            )}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => fire(item)}
              title={item.label}
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
};

NodeContextMenu.displayName = "NodeContextMenu";
export default NodeContextMenu;
