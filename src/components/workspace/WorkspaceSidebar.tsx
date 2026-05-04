/**
 * Workspace sidebar — Magnific-style. Two stacked nav groups + a
 * bottom utility row, all on a deep-black surface that matches the
 * canvas chrome.
 *
 * Layout:
 *   1. Brand row — workspace mascot + wordmark
 *   2. "Create" button (primary action, pink/magenta solid pill)
 *   3. Top nav group — Home
 *   4. Section divider with "ALL TOOLS" label
 *   5. Tools nav group — Spaces, Image / Video / Voice / 3D gen
 *   6. Bottom utility cluster — Settings
 *
 * Behaviour notes:
 *   • If `onNavigate` is provided, clicks drive parent state without
 *     a router round-trip (the dashboard uses this).
 *   • Otherwise clicks navigate to /app/workspace?section=<id> so
 *     deep-linking from /app/settings still lands on the right tab.
 *   • The sidebar is intentionally dumb about routing: pass `active`
 *     to highlight the current section.
 *
 * Design tokens (kept in this file so the chrome can drift slightly
 * from the rest of the app without touching shared CSS):
 *   • Surface           hsl(0 0% 4%)         — deep black
 *   • Active pill       white/[0.07] + ring  — soft white on hover
 *   • Hover pill        white/[0.04]
 *   • Section header    zinc-500, 11px, uppercase, 4px letter-spacing
 *   • Create button     #FF3D8E → #FF4DA0 gradient (workspace pink)
 */
import {
  Home as HomeIcon,
  Workflow,
  Image as ImageIcon,
  Video,
  Mic2,
  Plus,
  Settings as SettingsIcon,
  Palette,
  School,
  Box,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useIsOrgAdmin } from "@/hooks/useIsOrgUser";
import { useOrgBranding } from "@/hooks/useOrgBranding";
import { supabase } from "@/integrations/supabase/client";
import OrgCreditBadge from "@/components/OrgCreditBadge";
import ActiveClassPicker from "@/components/ActiveClassPicker";

// Default brand (no tenant subdomain match). Centralised so the
// org-admin branding preview can re-use the exact same fallback.
export const DEFAULT_BRAND_LOGO = "/mascot-logo.png";
export const DEFAULT_BRAND_NAME = "Workspace";

export type SectionKey =
  | "home"
  | "search"
  | "stock"
  | "community"
  | "projects"
  | "spaces"
  | "image_gen"
  | "video_gen"
  | "voice_gen"
  | "image_to_3d"
  | "assistant"
  | "tools"; // legacy "All tools" placeholder — still accepted

const NAV_TOP: Array<{ id: SectionKey; label: string; icon: LucideIcon }> = [
  { id: "home",       label: "Home",       icon: HomeIcon },
];

const NAV_TOOLS: Array<{ id: SectionKey; label: string; icon: LucideIcon }> = [
  { id: "spaces",     label: "Spaces",          icon: Workflow },
  { id: "image_gen",  label: "Image Generator", icon: ImageIcon },
  { id: "video_gen",  label: "Video Generator", icon: Video },
  { id: "voice_gen",  label: "Voice Generator", icon: Mic2 },
  { id: "image_to_3d", label: "3D Generator",    icon: Box },
];

const DEFAULT_ADMIN_HUB_URL = "https://mediaforge-admin-hub.vercel.app";

function normalizeUniversityHandoffUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, window.location.origin);
    if (url.pathname === "/" || url.pathname === "/school/center") {
      url.pathname = "/school/session-handoff";
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function getUniversityHandoffUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const explicit =
    env.VITE_ERP_SCHOOL_HANDOFF_URL ||
    env.VITE_ERP_SCHOOL_CENTER_URL ||
    env.VITE_UNIVERSITY_PORTAL_URL;

  if (explicit) return normalizeUniversityHandoffUrl(explicit);

  const adminConsoleUrl = env.VITE_ADMIN_CONSOLE_URL;
  if (!adminConsoleUrl) return `${DEFAULT_ADMIN_HUB_URL}/school/session-handoff`;

  try {
    return `${new URL(adminConsoleUrl).origin}/school/session-handoff`;
  } catch {
    return `${DEFAULT_ADMIN_HUB_URL}/school/session-handoff`;
  }
}

export interface WorkspaceSidebarProps {
  /** Highlighted section. Pass undefined when the current surface
   *  isn't one of the sidebar sections (e.g. /app/pricing). */
  active?: SectionKey;
  /** When provided, sidebar clicks call this instead of router-
   *  navigating. The dashboard uses this to drive internal state. */
  onNavigate?: (s: SectionKey) => void;
  /** Click handler for the prominent "Create" button at the top of
   *  the sidebar. Defaults to opening a new space when omitted. */
  onCreate?: () => void;
}

export default function WorkspaceSidebar({
  active,
  onNavigate,
  onCreate,
}: WorkspaceSidebarProps) {
  const navigate = useNavigate();
  // Tenant branding override (e.g. dmd.mediaforge.co → DMD logo +
  // "DMD" short name). Returns null on the bare workspace.mediaforge.co
  // host or while the lookup is in flight; we render the default
  // mascot brand in that case so the chrome doesn't flicker empty.
  const branding = useOrgBranding();
  const brandLogo = branding?.logoUrl ?? DEFAULT_BRAND_LOGO;
  const brandName = branding?.shortName ?? DEFAULT_BRAND_NAME;

  const handleClick = (s: SectionKey) => {
    if (onNavigate) onNavigate(s);
    else navigate(`/app/workspace?section=${s}`);
  };

  const handleCreate = () => {
    if (onCreate) onCreate();
    // Default — jump to spaces and let the user kick off "+ New space"
    // there. The dashboard SpacesView's New-space button is the
    // canonical create action; this just gets them in front of it.
    else handleClick("spaces");
  };

  return (
    <aside className="ws-scroll-hide flex h-full w-[212px] shrink-0 flex-col overflow-y-auto border-r border-white/5 bg-[hsl(0_0%_4%)] lg:w-[228px]">
      {/* ── Brand row — PSC : Digital Media ──────────────────────
       *  Logo lives at /public/psc-logo.png. Save the orange
       *  Digital Media wordmark there; the full lockup is wide
       *  so we use object-contain to fit the 34px square slot
       *  without distorting the trefoil + wordmark proportions. */}
      <div className="flex h-14 shrink-0 items-center px-3 lg:px-4">
        <button
          type="button"
          onClick={() => navigate("/app/workspace")}
          className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-zinc-50 transition-colors hover:text-white"
        >
          {/* Brand logo — defaults to the workspace mascot, swapped
           *  to the tenant org logo when the user is on a claimed
           *  subdomain (e.g. dmd.mediaforge.co → DMD logo). The
           *  square slot uses object-contain so wide wordmark logos
           *  don't get squashed. */}
          <img
            src={brandLogo}
            alt={brandName}
            className="h-[34px] w-[34px] shrink-0 select-none object-contain"
            draggable={false}
          />
          <span className="leading-tight">{brandName}</span>
        </button>
      </div>

      {/* ── Create button (primary action) ─────────────────────── */}
      <div className="px-3 pb-2 pt-1">
        <button
          type="button"
          onClick={handleCreate}
          className={cn(
            "flex h-11 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-white lg:h-9",
            "bg-gradient-to-b from-[#ff3d8e] to-[#e8327f] shadow-[0_2px_8px_-2px_rgba(255,61,142,0.45)]",
            "transition-[transform,box-shadow] hover:from-[#ff4da0] hover:to-[#ef3a8c] hover:shadow-[0_4px_12px_-2px_rgba(255,61,142,0.55)]",
            "active:scale-[0.98]",
          )}
        >
          <Plus className="h-3.5 w-3.5" /> Create
        </button>
      </div>

      {/* ── Top nav group ──────────────────────────────────────── */}
      <nav className="flex flex-col gap-0.5 px-3 pb-2 pt-1">
        {NAV_TOP.map((it) => (
          <NavLink
            key={it.id}
            label={it.label}
            icon={it.icon}
            active={active === it.id}
            onClick={() => handleClick(it.id)}
          />
        ))}
      </nav>

      {/* ── Section divider with label ─────────────────────────── */}
      <div className="px-5 pb-1.5 pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          All tools
        </div>
      </div>

      {/* ── Tools nav group ────────────────────────────────────── */}
      <nav className="flex flex-col gap-0.5 px-3">
        {NAV_TOOLS.map((it) => (
          <NavLink
            key={it.id}
            label={it.label}
            icon={it.icon}
            active={active === it.id}
            onClick={() => handleClick(it.id)}
          />
        ))}
      </nav>

      {/* ── Org / class extras (SSO branch) ────────────────────────
       *  These slots sit above the bottom utility row so the chrome
       *  order from top to bottom is: nav → tools → org context →
       *  utility cluster. `mt-auto` lives on the first of these so
       *  the whole stack hugs the bottom. */}

      {/* Active class switcher — only renders when student is in 2+
       *  classes; consumers/single-class students see nothing. */}
      <div className="mt-auto px-3">
        <ActiveClassPicker variant="compact" className="w-full" />
      </div>

      {/* Org credit badge — visible to org members so they can see
       *  their balance at a glance. Returns null for consumer/guests. */}
      <div className="px-4 py-2">
        <OrgCreditBadge variant="card" />
      </div>

      {/* Org admin / class teacher entry to the management surface. */}
      <OrgAdminLink />

      {/* ── Bottom utility row ─────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 pb-3 pt-4">
        <UtilityBtn icon={SettingsIcon} title="Settings" onClick={() => navigate("/app/settings")} />
      </div>
    </aside>
  );
}

/** "Manage Org" + "Branding" buttons — visible only to
 *  teachers + org_admins. Manage Org → Teacher Command Center;
 *  Branding → logo / short name /
 *  subdomain admin. Branding is also reachable by host-resolved org
 *  admins (no class memberships) via direct URL — useful for the
 *  DMD demo where the admin user hasn't been enrolled into any
 *  class yet. */
const OrgAdminLink = () => {
  const isOrgAdmin = useIsOrgAdmin();
  const navigate = useNavigate();
  if (!isOrgAdmin) return null;

  const handleUniversityClick = async () => {
    const { data, error } = await supabase.auth.getSession();
    const session = data.session;
    if (error || !session?.access_token || !session.refresh_token) {
      navigate("/auth");
      return;
    }

    const target = new URL(getUniversityHandoffUrl(), window.location.origin);
    const handoff = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      token_type: session.token_type || "bearer",
      type: "workspace_handoff",
    });
    if (session.expires_at) handoff.set("expires_at", String(session.expires_at));
    target.hash = handoff.toString();
    window.location.assign(target.toString());
  };

  return (
    <div className="px-3 pt-3 pb-2 border-t border-white/5 mt-3 space-y-1">
      <button
        type="button"
        onClick={() => void handleUniversityClick()}
        className="flex h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-[12.5px] text-amber-200/90 transition-colors hover:bg-amber-300/10 hover:text-amber-100 lg:h-9"
        title="Manage classes, students, and university credits"
      >
        <School className="h-3.5 w-3.5" />
        University
      </button>
      <button
        type="button"
        onClick={() => navigate("/app/org-admin/branding")}
        className="flex h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-[12.5px] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-100 lg:h-9"
        title="Logo, short name, and subdomains"
      >
        <Palette className="h-3.5 w-3.5" />
        Branding
      </button>
    </div>
  );
};

const NavLink = ({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors lg:h-9",
      active
        ? "bg-white/[0.07] text-zinc-50 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.05)]"
        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
    )}
  >
    <Icon className="h-4 w-4 shrink-0" />
    {label}
  </button>
);

/**
 * Bottom-row utility button. Square, 32px, monochrome — the row sits
 * at the bottom of the sidebar where Magnific puts settings/bell/
 * theme. The optional `badge` shows a tiny dot at the top-right
 * (used for the notifications bell).
 */
const UtilityBtn = ({
  icon: Icon,
  title,
  onClick,
  badge,
}: {
  icon: LucideIcon;
  title: string;
  onClick?: () => void;
  badge?: boolean;
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className="relative flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-100 lg:h-8 lg:w-8"
  >
    <Icon className="h-4 w-4" />
    {badge && (
      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-400 ring-2 ring-[hsl(0_0%_4%)]" />
    )}
  </button>
);
