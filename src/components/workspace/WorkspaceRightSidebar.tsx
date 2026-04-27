/**
 * Right sidebar shell — toggles between the Asset library and the
 * AI Assistant (Beta) inside one column.
 *
 * Both panels keep their internal layout intact; this wrapper just
 * provides the outer aside (width / border / bg) and a tab bar at
 * the very top. The non-active panel is rendered with `display:none`
 * (NOT unmounted) so each tab keeps its scroll position, chat input
 * draft, filter selections, etc. when the user flips back and forth.
 */

import { useState } from "react";
import { Layers, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import WorkspaceAssetPanel from "./WorkspaceAssetPanel";
import WorkspaceAIAssistantPanel from "./WorkspaceAIAssistantPanel";

type SidebarTab = "assets" | "ai";

const WorkspaceRightSidebar = () => {
  const [tab, setTab] = useState<SidebarTab>("assets");

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-zinc-800 bg-zinc-950">
        <SidebarTabButton
          active={tab === "assets"}
          onClick={() => setTab("assets")}
          icon={Layers}
        >
          Assets
        </SidebarTabButton>
        <SidebarTabButton
          active={tab === "ai"}
          onClick={() => setTab("ai")}
          icon={Sparkles}
          accent="amber"
        >
          คุยกับ Max
          <span className="ml-1.5 rounded-sm bg-amber-500/15 px-1 py-px font-mono text-[8px] uppercase tracking-wider text-amber-400">
            Beta
          </span>
        </SidebarTabButton>
      </div>

      {/* Panels — keep BOTH mounted so state survives tab switches.
       *  Toggle visibility via display:none rather than conditional
       *  render. */}
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

/* ── Atom ─────────────────────────────────────────────────── */

function SidebarTabButton({
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
        "relative flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors",
        active
          ? "bg-zinc-900 text-zinc-100"
          : "bg-zinc-950 text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-300",
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5",
          active && accent === "amber" && "text-amber-400",
        )}
      />
      {children}
      {active && (
        <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-t bg-zinc-200" />
      )}
    </button>
  );
}
