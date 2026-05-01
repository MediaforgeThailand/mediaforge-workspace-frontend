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
import { Link, useNavigate, useLocation, Outlet } from "react-router-dom";
import {
  ChevronLeft,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { UserMenu } from "@/components/workspace/UserMenu";
import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar";

/* Wave 2 trim — Usage + Pricing tabs removed from the visible sub-
 * nav until billing on the workspace project is fully wired. The
 * routes themselves still exist (so deep-links don't 404) but they
 * aren't promoted in the chrome. */
const ACCOUNT_TABS: Array<{
  path: string;
  /** Translation key resolved inside the component via t(). Kept as
   *  a key (not a string) so EN/TH switches re-render the chrome. */
  labelKey: "workspace.account.settings";
  icon: LucideIcon;
}> = [
  { path: "/app/settings", labelKey: "workspace.account.settings", icon: SettingsIcon },
];

/**
 * The shell renders an `<Outlet />` by default so it can be used
 * directly as a Route element. Pass `children` to opt out of the
 * outlet (mostly handy for tests / storybook).
 */
export default function AccountShell({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const isSettingsRoute = location.pathname.startsWith("/app/settings");

  return (
    <div
      className="mf-readable flex h-screen w-screen overflow-hidden bg-[hsl(0_0%_5%)] text-zinc-100"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* ── Workspace sidebar (shared with the dashboard) ───────── */}
      <div className="hidden h-full lg:block">
        <WorkspaceSidebar />
      </div>

      {/* ── Account content area ─────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/5 px-4 md:px-7 lg:h-14">
          <button
            type="button"
            onClick={() => navigate("/app/workspace")}
            className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-white/[0.05] hover:text-zinc-100 lg:h-9 lg:w-9"
            title={t("workspace.account.back")}
            aria-label={t("workspace.account.back")}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-[15px] font-medium leading-5 text-zinc-200">{t("workspace.account.title")}</span>
          <span className="text-zinc-600">/</span>
          <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {ACCOUNT_TABS.map((tab) => {
              const active = location.pathname === tab.path;
              return (
                <button
                  key={tab.path}
                  type="button"
                  onClick={() => navigate(tab.path)}
                  className={cn(
                    "flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-[14.5px] font-medium leading-5 transition-colors lg:h-9 lg:px-3",
                    active
                      ? "bg-white/[0.07] text-zinc-50 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.05)]"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {t(tab.labelKey)}
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
          <div
            className={cn(
              "w-full text-zinc-200",
              isSettingsRoute
                ? "min-h-full"
                : "mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8",
            )}
          >
            {children ?? <Outlet />}
          </div>

          {/* ── Slim legal footer ─────────────────────────────────
           *  Lives inside the scrolling area so it doesn't clip
           *  short pages (Settings is min-h-full → footer pushes
           *  to the natural end of the content). Skipped on
           *  full-screen surfaces (canvas, pricing) because those
           *  use WorkspacePageShell, not AccountShell. */}
          <AccountFooter />
        </div>
      </main>
    </div>
  );
}

function AccountFooter() {
  const { t } = useLanguage();
  const sep = (
    <span className="select-none text-zinc-700" aria-hidden>
      {t("footerSeparator" as any)}
    </span>
  );
  const linkClass =
    "text-zinc-500 transition-colors hover:text-zinc-200 underline-offset-4 hover:underline";
  return (
    <footer className="border-t border-white/5 px-4 py-4 md:px-6">
      <nav
        className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] leading-5 text-zinc-400"
        aria-label="Legal"
      >
        <Link to="/privacy" className={linkClass}>
          {t("footerPrivacy" as any)}
        </Link>
        {sep}
        <Link to="/terms" className={linkClass}>
          {t("footerTerms" as any)}
        </Link>
        {sep}
        <Link to="/refund" className={linkClass}>
          {t("footerRefund" as any)}
        </Link>
        {sep}
        <Link to="/aup" className={linkClass}>
          {t("footerAup" as any)}
        </Link>
        {sep}
        <Link to="/cookies" className={linkClass}>
          {t("footerCookies" as any)}
        </Link>
        {sep}
        <a href="mailto:support@mediaforge.co" className={linkClass}>
          {t("footerContact" as any)}
        </a>
      </nav>
    </footer>
  );
}
