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
  History as HistoryIcon,
  FolderKanban,
  Workflow,
  Image as ImageIcon,
  Images,
  Video,
  Mic2,
  Plus,
  Settings as SettingsIcon,
  Languages,
  Palette,
  School,
  Box,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsClassTeacher, useIsOrgAdmin } from "@/hooks/useIsOrgUser";
import { useOrgBranding } from "@/hooks/useOrgBranding";
import { useCredits } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import OrgCreditBadge from "@/components/OrgCreditBadge";
import ActiveClassPicker from "@/components/ActiveClassPicker";

// Default brand (no tenant subdomain match). Centralised so the
// org-admin branding preview can re-use the exact same fallback.
export const DEFAULT_BRAND_LOGO = "/mascot-logo.png";
export const DEFAULT_BRAND_NAME = "Workspace";

export type SectionKey =
  | "home"
  | "history"
  | "assets"
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

/** Translation key for sidebar nav labels — resolved inside the
 *  component via `useLanguage().t(...)` so EN/TH switches re-render
 *  the rail. The id stays the same English-stable section key. */
type NavItem = {
  id: SectionKey;
  /** Translation key for the label. Resolved at render time. */
  labelKey:
    | "workspace.sidebar.home"
    | "workspace.sidebar.projects"
    | "workspace.sidebar.all_assets"
    | "workspace.sidebar.stock"
    | "workspace.sidebar.spaces"
    | "workspace.sidebar.image_gen"
    | "workspace.sidebar.video_gen"
    | "workspace.sidebar.voice_gen"
    | "workspace.sidebar.threed_gen";
  icon: LucideIcon;
};

const NAV_TOP: NavItem[] = [
  { id: "home",   labelKey: "workspace.sidebar.home",       icon: HomeIcon },
  { id: "projects", labelKey: "workspace.sidebar.projects", icon: FolderKanban },
  // Sidebar entry points to AssetsView (the Magnific-style asset
  // library that replaced the old HistoryView). The legacy
  // `?section=history` URL still resolves to this view because the
  // dashboard router treats both keys the same.
  { id: "assets", labelKey: "workspace.sidebar.all_assets", icon: HistoryIcon },
];

const NAV_TOOLS: NavItem[] = [
  { id: "spaces",     labelKey: "workspace.sidebar.spaces",      icon: Workflow },
  { id: "stock",      labelKey: "workspace.sidebar.stock",       icon: Images },
  { id: "image_gen",  labelKey: "workspace.sidebar.image_gen",   icon: ImageIcon },
  { id: "video_gen",  labelKey: "workspace.sidebar.video_gen",   icon: Video },
  { id: "voice_gen",  labelKey: "workspace.sidebar.voice_gen",   icon: Mic2 },
  { id: "image_to_3d", labelKey: "workspace.sidebar.threed_gen", icon: Box },
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
  const { t, language, setLanguage } = useLanguage();
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

  // 2026-05 redesign: sidebar floats as a Layer-1 panel.
  //   • Outer wrapper carries the page-bg padding (8px around).
  //   • aside itself is a rounded card sitting inside.
  //   • No more right border — the page bg already separates the
  //     panel from the main content (different elevation).
  //   • Width tightened 198 → 192 keeps the visual rhythm.
  return (
    <div className="ws-scroll-hide h-full shrink-0 bg-[hsl(var(--surface-0))] py-[8px] pl-[8px]">
      <aside className="mf-readable ws-scroll-hide flex h-full w-[221px] flex-col overflow-y-auto rounded-xl bg-[hsl(var(--surface-1))]">
      {/* ── Brand row — PSC : Digital Media ──────────────────────
       *  Logo lives at /public/psc-logo.png. Save the orange
       *  Digital Media wordmark there; the full lockup is wide
       *  so we use object-contain to fit the 34px square slot
       *  without distorting the trefoil + wordmark proportions. */}
      <div className="flex h-[55px] shrink-0 items-center px-[14px]">
        <button
          type="button"
          onClick={() => navigate("/app/workspace")}
          className="flex items-center gap-[9px] text-[16px] font-semibold text-zinc-50 transition-colors hover:text-white"
        >
          {/* Brand logo — defaults to the workspace mascot, swapped
           *  to the tenant org logo when the user is on a claimed
           *  subdomain (e.g. dmd.mediaforge.co → DMD logo). The
           *  square slot uses object-contain so wide wordmark logos
           *  don't get squashed. */}
          <img
            src={brandLogo}
            alt={brandName}
            className="h-[32px] w-[32px] shrink-0 select-none object-contain"
            draggable={false}
          />
          <span className="leading-tight">{brandName}</span>
        </button>
      </div>

      {/* ── Create button (primary action) ─────────────────────── */}
      <div className="px-[14px] pb-[9px] pt-[2px]">
        <button
          type="button"
          onClick={handleCreate}
          className={cn(
            "flex h-[41px] w-full items-center justify-center gap-[7px] rounded-lg px-[14px] text-[16px] font-semibold text-white",
            "bg-gradient-to-b from-[#ff3d8e] to-[#e8327f] shadow-[0_2px_8px_-2px_rgba(255,61,142,0.45)]",
            "transition-[transform,box-shadow] hover:from-[#ff4da0] hover:to-[#ef3a8c] hover:shadow-[0_4px_12px_-2px_rgba(255,61,142,0.55)]",
            "active:scale-[0.98]",
          )}
        >
          <Plus className="h-[16px] w-[16px]" /> {t("workspace.sidebar.create")}
        </button>
      </div>

      {/* ── Top nav group ──────────────────────────────────────── */}
      <nav className="flex flex-col gap-[3px] px-[14px] pb-[9px] pt-[5px]">
        {NAV_TOP.map((it) => (
          <NavLink
            key={it.id}
            label={t(it.labelKey)}
            icon={it.icon}
            active={active === it.id}
            onClick={() => handleClick(it.id)}
          />
        ))}
      </nav>

      {/* ── Section divider with label ─────────────────────────── */}
      <div className="px-[18px] pb-[5px] pt-[14px]">
        <div className="text-[14.5px] font-semibold uppercase text-zinc-400">
          {t("workspace.sidebar.all_tools")}
        </div>
      </div>

      {/* ── Tools nav group ────────────────────────────────────── */}
      <nav className="flex flex-col gap-[3px] px-[14px]">
        {NAV_TOOLS.map((it) => (
          <NavLink
            key={it.id}
            label={t(it.labelKey)}
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
      <div className="mt-auto px-[14px]">
        <ActiveClassPicker variant="compact" className="w-full" />
      </div>

      {/* Org credit badge — visible to org members so they can see
       *  their balance at a glance. Returns null for consumer/guests. */}
      <div className="px-[14px] py-[7px]">
        <OrgCreditBadge variant="card" />
      </div>

      {/* Org admin / class teacher entry to the management surface. */}
      <OrgAdminLink />

      {/* ── Bottom utility row ─────────────────────────────────── */}
      {/* Settings + language toggle sit as a paired "preferences"
       *  cluster at the bottom of the rail. The language icon is a
       *  parallel UtilityBtn — same visual weight, no special
       *  treatment beyond label rendering the TARGET language in its
       *  own script (universal language-switcher convention). */}
      <div className="flex items-center gap-[5px] px-[14px] pb-[14px] pt-[14px]">
        <UtilityBtn icon={SettingsIcon} title={t("workspace.sidebar.settings")} onClick={() => navigate("/app/settings")} />
        <UtilityBtn
          icon={Languages}
          title={language === "th" ? "English" : "ภาษาไทย"}
          onClick={() => setLanguage(language === "th" ? "en" : "th")}
        />
      </div>
      </aside>
    </div>
  );
}

/** Education admins manage institutions/classes; enterprise admins manage teams.
 *  The database still uses "organization" as the tenant primitive, but customer
 *  UI should not expose that internal naming for enterprise accounts. */
const OrgAdminLink = () => {
  const isOrgAdmin = useIsOrgAdmin();
  const isClassTeacher = useIsClassTeacher();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { credits } = useCredits();
  const orgType = String(credits?.organization_type ?? "").toLowerCase();
  const isEnterprise = orgType === "enterprise";
  const isEducation = orgType === "school" || orgType === "university";

  if (!isOrgAdmin) return null;
  if (!isClassTeacher && !isEnterprise && !isEducation) return null;

  const primaryLabel = isEnterprise
    ? t("workspace.sidebar.manage_team")
    : t("workspace.sidebar.university");
  const primaryTip = isEnterprise
    ? t("workspace.sidebar.manage_team_tip")
    : t("workspace.sidebar.university_tip");
  const PrimaryIcon = isEnterprise ? UsersRound : School;

  const handlePrimaryClick = async () => {
    if (isEnterprise) {
      navigate("/app/settings?tab=team");
      return;
    }

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
    /* 2026-05: drop the divider line — we use a small mt gap instead
     *  to keep the floating-panel surface clean. */
    <div className="mt-[12px] space-y-[4px] px-[12px] pb-[8px] pt-[4px]">
      <button
        type="button"
        onClick={() => void handlePrimaryClick()}
        className="flex h-[32px] w-full items-center gap-[8px] rounded-md px-[8px] text-[14px] text-amber-200/90 transition-colors hover:bg-amber-300/10 hover:text-amber-100"
        title={primaryTip}
      >
        <PrimaryIcon className="h-[14px] w-[14px]" />
        {primaryLabel}
      </button>
      <button
        type="button"
        onClick={() => navigate("/app/org-admin/branding")}
        className="flex h-[32px] w-full items-center gap-[8px] rounded-md px-[8px] text-[14px] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-100"
        title={t("workspace.sidebar.branding_tip")}
      >
        <Palette className="h-[14px] w-[14px]" />
        {t("workspace.sidebar.branding")}
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
      /* 2026-05: drop the inset 1px stroke on active — bg lift alone
       *  is enough now that the sidebar is a Layer-1 panel. */
      "flex h-[37px] items-center gap-[9px] rounded-md px-[9px] text-[16px] font-medium transition-colors",
      active
        ? "bg-white/[0.08] text-zinc-50"
        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
    )}
  >
    <Icon className="h-[17px] w-[17px] shrink-0" />
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
    className="relative flex h-[37px] w-[37px] items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-100"
  >
    <Icon className="h-[17px] w-[17px]" />
    {badge && (
      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-400 ring-2 ring-[hsl(0_0%_4%)]" />
    )}
  </button>
);
