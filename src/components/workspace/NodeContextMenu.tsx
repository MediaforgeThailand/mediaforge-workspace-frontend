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

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { type LucideIcon } from "lucide-react";
import type { Node as RFNode } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

const PANEL_WIDTH = 232;
/** Floor of the rendered height for the bottom-edge clamp — the actual
 *  height varies with how many rows are visible (4–6 typically), this
 *  is the worst case at 6 rows incl. separators. */
const PANEL_MAX_HEIGHT = 240;

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

  // Edge clamp — never let the menu render off-screen. Mirrors the
  // approach in CanvasContextMenu so behaviour is consistent across
  // the two right-click experiences.
  const left = Math.min(
    position.x,
    Math.max(8, window.innerWidth - PANEL_WIDTH - 8),
  );
  const top = Math.min(
    position.y,
    Math.max(8, window.innerHeight - PANEL_MAX_HEIGHT - 8),
  );

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
        "fixed z-[1310] flex flex-col overflow-hidden",
        "rounded-xl border border-white/10",
        "bg-[hsl(220_10%_8%)]/95 backdrop-blur-2xl",
        "shadow-[0_18px_48px_-16px_hsl(0_0%_0%/0.7),0_0_0_1px_hsl(0_0%_100%/0.04)]",
        "py-1",
      )}
      style={{
        left,
        top,
        width: PANEL_WIDTH,
        fontFamily: "'Prompt', system-ui, sans-serif",
      }}
      onContextMenu={(e) => {
        // Don't let a 2nd right-click on the menu surface re-open
        // the wrapper-level context handler underneath us.
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Top sheen — matches CanvasContextMenu's frosted top edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.key}>
            {item.separatorBefore && (
              <div className="my-1 mx-2 h-px bg-white/5" />
            )}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => fire(item)}
              title={item.label}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] transition-colors",
                item.disabled
                  ? "cursor-not-allowed text-zinc-600"
                  : item.danger
                    ? "text-zinc-300 hover:bg-rose-500/15 hover:text-rose-200"
                    : "text-zinc-200 hover:bg-white/[0.06] hover:text-zinc-50",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
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
