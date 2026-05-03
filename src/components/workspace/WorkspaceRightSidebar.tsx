/**
 * Right sidebar shell — translucent floating panel that hosts the
 * Asset library and AI Assistant in a single column.
 *
 * Visual model:
 *   - Detached from the viewport edge (right margin) so it reads as
 *     an overlay, not part of the chrome.
 *   - Glass surface — semi-transparent zinc with backdrop blur, soft
 *     ring + drop shadow for depth.
 *   - Pill-shaped tabs at the head, no underline strip — minimal.
 *   - Collapse button shrinks the whole panel to a vertical rail
 *     where each tab is just an icon. Click an icon to expand back.
 *
 * Implementation notes:
 *   - Both panels stay mounted (display:none on the inactive one)
 *     so internal state — scroll position, draft chat input, filter
 *     selections — survives a tab flip.
 *   - The floating geometry means the canvas now extends UNDER the
 *     sidebar. Canvas controls clipped by the panel's footprint
 *     remain reachable: pan/zoom hits the surface and the right-
 *     click menu still opens. The asset panel itself has solid bg
 *     blocks where it needs to so glass-readability isn't sacrificed
 *     on text-heavy areas.
 */

import { useState } from "react";
import { Layers, Sparkles, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import WorkspaceAssetPanel from "./WorkspaceAssetPanel";
import WorkspaceAIAssistantPanel from "./WorkspaceAIAssistantPanel";

type SidebarTab = "assets" | "ai";

// Bridges for `workspace-open-all-assets` / `workspace-trigger-upload`
// / `workspace-open-stock` are no longer hosted here — they live in
// `WorkspaceCanvasMediaBridges`, mounted directly on the Canvas page so
// the right-click Media menu keeps working even when this sidebar is
// hidden or collapsed.

const WorkspaceRightSidebar = () => {
  const [tab, setTab] = useState<SidebarTab>("assets");
  // Collapsed = thin icon rail. Expand by clicking a tab icon (which
  // also switches to that tab) or by clicking the toggle.
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside
        className={cn(
          "pointer-events-auto fixed right-3 top-1/2 z-30 -translate-y-1/2",
          "flex flex-col items-center gap-1 rounded-2xl bg-[hsl(220_10%_10%)]/95 p-1.5 backdrop-blur-2xl",
          "shadow-[0_24px_60px_-20px_hsl(0_0%_0%/0.7),0_0_0_1px_hsl(0_0%_100%/0.04)]",
        )}
        // `zoom: 0.8` — keeps the collapsed rail visually consistent
        // with the expanded panel (which is also zoomed). The canvas
        // and tab bar stay at native scale; only the sidebar chrome
        // shrinks.
        style={{ fontFamily: "var(--font-sans)", zoom: 0.8 }}
      >
        <RailButton
          title="Expand assets"
          onClick={() => {
            setTab("assets");
            setCollapsed(false);
          }}
          icon={Layers}
        />
        <RailButton
          title="Expand AI assistant"
          onClick={() => {
            setTab("ai");
            setCollapsed(false);
          }}
          icon={Sparkles}
          accent="amber"
        />
        <div className="my-1 h-px w-6 bg-white/10" />
        <RailButton
          title="Expand sidebar"
          onClick={() => setCollapsed(false)}
          icon={ChevronLeft}
        />
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        // Floating geometry — fixed right + a top offset that clears
        // the workspace tab bar (h-11 = 44px) plus a 12px breathing
        // gap, so the sidebar reads as a separate floating layer
        // BELOW the header, not as part of it.
        "pointer-events-auto fixed right-3 z-30 flex w-[340px] flex-col overflow-hidden",
        // Modern surface treatment, matching CanvasContextMenu:
        //  - very dark zinc with a slight blue cool, almost opaque so
        //    image thumbnails stay readable
        //  - rounded-2xl
        //  - subtle white-on-white border to separate from canvas
        //  - heavy drop shadow for depth, paired with a 1px inner
        //    light ring (the "edge of frosted glass" highlight)
        "rounded-2xl bg-[hsl(220_10%_10%)]/95 backdrop-blur-2xl",
        "shadow-[0_24px_60px_-20px_hsl(0_0%_0%/0.7),0_0_0_1px_hsl(0_0%_100%/0.04)]",
      )}
      style={{
        // Geometry note — `zoom: 0.8` scales EVERY length on this
        // element, INCLUDING position offsets like `top` / `bottom`.
        // So if we want an effective gap of ~24px below the 44px
        // tab bar (visible top = 68 from viewport) the raw value
        // has to be 68 / 0.8 = 85. Same for the bottom — raw 16
        // renders as ~13px gap.
        //
        // Using `top` + `bottom` (instead of top + height) lets the
        // sidebar auto-stretch to fill everything between the two
        // anchors, so the panel reaches the bottom of the viewport
        // without us having to recompute the calc() height.
        top: 85,
        bottom: 16,
        fontFamily: "var(--font-sans)",
        // `zoom: 0.8` — shrinks JUST this sidebar to ~80% of native
        // size. The canvas, tab bar, and floating left rail stay at
        // their normal scale; only the asset / AI chrome scales
        // down. We use `zoom` (not transform: scale) so click
        // positions, drag-drop, and contentEditable focus regions
        // all stay correctly aligned.
        zoom: 0.8,
      }}
    >
      {/* Top sheen highlight — single thin gradient at the top edge,
       *  same trick the menu uses so both surfaces feel "lit". */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      {/* Header — minimal pill tabs + collapse. The old underline-
       *  strip pattern read as old-school chrome; this drops the
       *  decoration and uses a rounded background fill on the
       *  active tab instead. */}
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2.5 pb-2">
        <PillTab
          active={tab === "assets"}
          onClick={() => setTab("assets")}
          icon={Layers}
        >
          Assets
        </PillTab>
        <PillTab
          active={tab === "ai"}
          onClick={() => setTab("ai")}
          icon={Sparkles}
          accent="amber"
        >
          คุยกับ Max
          <span className="ml-1.5 rounded-sm bg-amber-400/20 px-1 py-px font-mono text-[8px] uppercase tracking-wider text-amber-300">
            Beta
          </span>
        </PillTab>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="ml-auto rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Subtle hairline below the header — gives the tabs a "lid"
       *  without the heavy old border-b look. */}
      <div className="mx-3 h-px shrink-0 bg-white/8" />

      {/* Panels — keep BOTH mounted so state survives tab switches. */}
      <div className="flex-1 overflow-hidden">
        <div className={cn("h-full", tab !== "assets" && "hidden")}>
          <WorkspaceAssetPanel />
        </div>
        <div className={cn("h-full", tab !== "ai" && "hidden")}>
          <WorkspaceAIAssistantPanel />
        </div>
      </div>
    </aside>
  );
};

export default WorkspaceRightSidebar;

/* ── Atoms ───────────────────────────────────────────────── */

function PillTab({
  active,
  onClick,
  icon: Icon,
  accent,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "amber";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
        active
          ? "bg-white/[0.10] text-zinc-50"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5",
          active && accent === "amber" && "text-amber-300",
        )}
      />
      {children}
    </button>
  );
}

function RailButton({
  title,
  onClick,
  icon: Icon,
  accent,
}: {
  title: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "amber";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/10 hover:text-zinc-50",
        accent === "amber" && "hover:text-amber-300",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
