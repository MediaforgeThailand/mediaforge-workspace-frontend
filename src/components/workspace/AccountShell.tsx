/**
 * Account-page shell — slim workspace sidebar around Settings /
 * Usage / Pricing.
 *
 * Replaces the legacy `DashboardLayout` (which pulled in the
 * consumer-shaped `home/DashboardSidebar` + `MobileBottomNav`
 * tree). Those are gone in Wave 3. This shell mirrors the new
 * workspace dashboard sidebar so the chrome reads consistently
 * across `/app/workspace`, `/app/settings`, `/app/usage`, and
 * `/app/pricing`.
 *
 * The sidebar's primary nav (Home / Spaces / Community / Projects /
 * All tools / Stock) lives in the dashboard. From an account page,
 * clicking any nav item routes back to the dashboard with a section
 * hint (`?section=home`). The dashboard reads the param on mount and
 * jumps to that section.
 *
 * Account-only items (Settings / Usage / Pricing) are exposed via a
 * separate sub-nav row at the top of the content area — small + tab-
 * shaped so they don't compete with the primary sidebar visually.
 */

import { type ReactNode } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import {
  Home as HomeIcon,
  Workflow,
  Globe,
  FolderKanban,
  Boxes,
  Library,
  ChevronLeft,
  Settings as SettingsIcon,
  Receipt,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/workspace/UserMenu";

type SectionKey =
  | "home"
  | "spaces"
  | "community"
  | "projects"
  | "tools"
  | "stock";

const NAV_TOP: Array<{ id: SectionKey; label: string; icon: LucideIcon }> = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "spaces", label: "Spaces", icon: Workflow },
  { id: "community", label: "Community", icon: Globe },
  { id: "projects", label: "Projects", icon: FolderKanban },
];

const NAV_BOTTOM: Array<{ id: SectionKey; label: string; icon: LucideIcon }> = [
  { id: "tools", label: "All tools", icon: Boxes },
  { id: "stock", label: "Stock", icon: Library },
];

const ACCOUNT_TABS: Array<{
  path: string;
  label: string;
  icon: LucideIcon;
}> = [
  { path: "/app/settings", label: "Settings", icon: SettingsIcon },
  { path: "/app/usage", label: "Usage", icon: Receipt },
  { path: "/app/pricing", label: "Pricing", icon: CreditCard },
];

/**
 * The shell renders an `<Outlet />` by default so it can be used
 * directly as a Route element. Pass `children` to opt out of the
 * outlet (mostly handy for tests / storybook).
 */
export default function AccountShell({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const goSection = (s: SectionKey) => {
    navigate(`/app/workspace?section=${s}`);
  };

  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-[hsl(0_0%_5%)] text-zinc-100"
      style={{ fontFamily: "'Prompt', system-ui, sans-serif" }}
    >
      {/* ── Workspace sidebar (mirrors the dashboard) ───────── */}
      <aside className="flex h-full w-[228px] shrink-0 flex-col border-r border-white/5 bg-[hsl(0_0%_4%)]">
        <div className="flex h-12 items-center justify-between px-4">
          <button
            type="button"
            onClick={() => navigate("/app/workspace")}
            className="flex items-center gap-2 text-[13.5px] font-semibold tracking-tight text-zinc-50 transition-colors hover:text-white"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-fuchsia-500 to-violet-600 text-[10px] font-bold text-white shadow-[inset_0_-1px_0_hsl(0_0%_0%/0.25)]">
              M
            </span>
            MediaForge
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 pt-2 pb-1">
          {NAV_TOP.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => goSection(it.id)}
              className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-100"
            >
              <it.icon className="h-3.5 w-3.5" />
              {it.label}
            </button>
          ))}
        </nav>

        <div className="mx-4 my-3 h-px bg-white/[0.06]" />

        <nav className="flex flex-col gap-0.5 px-3">
          {NAV_BOTTOM.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => goSection(it.id)}
              className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-100"
            >
              <it.icon className="h-3.5 w-3.5" />
              {it.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto px-4 py-3 text-[10.5px] text-zinc-600">
          v1.5 · workspace
        </div>
      </aside>

      {/* ── Account content area ─────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/5 px-6">
          <button
            type="button"
            onClick={() => navigate("/app/workspace")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-100"
            title="Back to workspace"
            aria-label="Back to workspace"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[13px] font-medium text-zinc-300">Account</span>
          <span className="text-zinc-600">/</span>
          <nav className="flex items-center gap-0.5">
            {ACCOUNT_TABS.map((tab) => {
              const active = location.pathname === tab.path;
              return (
                <button
                  key={tab.path}
                  type="button"
                  onClick={() => navigate(tab.path)}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors",
                    active
                      ? "bg-white/[0.07] text-zinc-50 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.05)]"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Right edge — user menu (Settings re-link is redundant
           *  since you're on /app/settings, but keeping the same
           *  avatar everywhere means muscle-memory works across
           *  surfaces). */}
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>

        <div className="ws-scroll-hide flex-1 overflow-y-auto bg-[hsl(0_0%_5%)]">
          <div className="mx-auto w-full max-w-5xl px-6 py-8 text-zinc-200">
            {children ?? <Outlet />}
          </div>
        </div>
      </main>
    </div>
  );
}
