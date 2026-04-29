/**
 * Account-page shell — workspace sidebar + Account breadcrumb header
 * around Settings / Usage / Pricing.
 *
 * Replaces the legacy `DashboardLayout` (which pulled in the
 * consumer-shaped `home/DashboardSidebar` + `MobileBottomNav`
 * tree). Those are gone in Wave 3. This shell mirrors the new
 * workspace dashboard sidebar so the chrome reads consistently
 * across `/app/workspace`, `/app/settings`, and `/app/usage`.
 *
 * The sidebar's primary nav (Home / Spaces / Community / Projects /
 * All tools / Stock) is shared with the dashboard via
 * `WorkspaceSidebar`. From an account page, clicking any nav item
 * routes back to the dashboard with a section hint
 * (`?section=home`). The dashboard reads the param on mount and
 * jumps to that section.
 *
 * Account-only items (Settings / Usage / Pricing) are exposed via a
 * separate sub-nav row at the top of the content area — small + tab-
 * shaped so they don't compete with the primary sidebar visually.
 *
 * Note: /app/pricing now lives under WorkspacePageShell (no Account
 * header, no max-width) — see App.tsx.
 */

import { type ReactNode } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import {
  ChevronLeft,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/workspace/UserMenu";
import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar";

/* Wave 2 trim — Usage + Pricing tabs removed from the visible sub-
 * nav until billing on the workspace project is fully wired. The
 * routes themselves still exist (so deep-links don't 404) but they
 * aren't promoted in the chrome. */
const ACCOUNT_TABS: Array<{
  path: string;
  label: string;
  icon: LucideIcon;
}> = [
  { path: "/app/settings", label: "Settings", icon: SettingsIcon },
];

/**
 * The shell renders an `<Outlet />` by default so it can be used
 * directly as a Route element. Pass `children` to opt out of the
 * outlet (mostly handy for tests / storybook).
 */
export default function AccountShell({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-[hsl(0_0%_5%)] text-zinc-100"
      style={{ fontFamily: "'Prompt', system-ui, sans-serif" }}
    >
      {/* ── Workspace sidebar (shared with the dashboard) ───────── */}
      <WorkspaceSidebar />

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
