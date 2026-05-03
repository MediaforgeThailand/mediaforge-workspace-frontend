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
      <aside className="mf-readable ws-scroll-hide flex h-full w-[192px] flex-col overflow-y-auto rounded-xl bg-[hsl(var(--surface-1))]">
      {/* ── Brand row — PSC : Digital Media ──────────────────────
       *  Logo lives at /public/psc-logo.png. Save the orange
       *  Digital Media wordmark there; the full lockup is wide
       *  so we use object-contain to fit the 34px square slot
       *  without distorting the trefoil + wordmark proportions. */}
      <div className="flex h-[48px] shrink-0 items-center px-[12px]">
        <button
          type="button"
          onClick={() => navigate("/app/workspace")}
          className="flex items-center gap-[8px] text-[14px] font-semibold text-zinc-50 transition-colors hover:text-white"
        >
          {/* Brand logo — defaults to the workspace mascot, swapped
           *  to the tenant org logo when the user is on a claimed
           *  subdomain (e.g. dmd.mediaforge.co → DMD logo). The
           *  square slot uses object-contain so wide wordmark logos
           *  don't get squashed. */}
          <img
            src={brandLogo}
            alt={brandName}
            className="h-[28px] w-[28px] shrink-0 select-none object-contain"
            draggable={false}
          />
          <span className="leading-tight">{brandName}</span>
        </button>
      </div>

      {/* ── Create button (primary action) ─────────────────────── */}
      <div className="px-[12px] pb-[8px] pt-[2px]">
        <button
          type="button"
          onClick={handleCreate}
          className={cn(
            "flex h-[36px] w-full items-center justify-center gap-[6px] rounded-lg px-[12px] text-[14px] font-semibold text-white",
            "bg-gradient-to-b from-[#ff3d8e] to-[#e8327f] shadow-[0_2px_8px_-2px_rgba(255,61,142,0.45)]",
            "transition-[transform,box-shadow] hover:from-[#ff4da0] hover:to-[#ef3a8c] hover:shadow-[0_4px_12px_-2px_rgba(255,61,142,0.55)]",
            "active:scale-[0.98]",
          )}
        >
          <Plus className="h-[14px] w-[14px]" /> {t("workspace.sidebar.create")}
        </button>
      </div>

      {/* ── Top nav group ──────────────────────────────────────── */}
      <nav className="flex flex-col gap-[2px] px-[12px] pb-[8px] pt-[4px]">
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
      <div className="px-[16px] pb-[4px] pt-[12px]">
        <div className="text-[12.75px] font-semibold uppercase text-zinc-400">
          {t("workspace.sidebar.all_tools")}
        </div>
      </div>

      {/* ── Tools nav group ────────────────────────────────────── */}
      <nav className="flex flex-col gap-[2px] px-[12px]">
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
      <div className="mt-auto px-[12px]">
        <ActiveClassPicker variant="compact" className="w-full" />
      </div>

      {/* Org credit badge — visible to org members so they can see
       *  their balance at a glance. Returns null for consumer/guests. */}
      <div className="px-[12px] py-[6px]">
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
      <div className="flex items-center gap-[4px] px-[12px] pb-[12px] pt-[12px]">
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
  const primaryTarget = isEnterprise ? "/app/settings?tab=team" : "/app/org-admin";

  return (
    /* 2026-05: drop the divider line — we use a small mt gap instead
     *  to keep the floating-panel surface clean. */
    <div className="mt-[12px] space-y-[4px] px-[12px] pb-[8px] pt-[4px]">
      <button
        type="button"
        onClick={() => navigate(primaryTarget)}
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
      "flex h-[32px] items-center gap-[8px] rounded-md px-[8px] text-[14px] font-medium transition-colors",
      active
        ? "bg-white/[0.08] text-zinc-50"
        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
    )}
  >
    <Icon className="h-[15px] w-[15px] shrink-0" />
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
    className="relative flex h-[32px] w-[32px] items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-100"
  >
    <Icon className="h-[15px] w-[15px]" />
    {badge && (
      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-400 ring-2 ring-[hsl(0_0%_4%)]" />
    )}
  </button>
);
