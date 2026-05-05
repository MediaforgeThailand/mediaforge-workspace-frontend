/**
 * Workspace sidebar — Magnific-style. Two stacked nav groups + a
 * bottom utility row, all on a deep-black surface that matches the
 * canvas chrome.
 *
 * Layout:
 *   1. Brand row — workspace mascot + wordmark
 *   2. Top nav group — Home
 *   3. Section groups — Create, Assets
 *   4. Bottom utility cluster — Settings
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
 */
import {
  BookOpen,
  Home as HomeIcon,
  History as HistoryIcon,
  Workflow,
  Image as ImageIcon,
  Images,
  Video,
  Mic2,
  Settings as SettingsIcon,
  Palette,
  Plus,
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
  width?: "full" | "half";
};

type SidebarSection = {
  labelKey:
    | "workspace.sidebar.create"
    | "workspace.sidebar.assets";
  variant: "tool" | "list";
  rows: NavItem[][];
};

const NAV_TOP: NavItem[] = [
  { id: "home",   labelKey: "workspace.sidebar.home",       icon: HomeIcon },
];

const NAV_SECTIONS: SidebarSection[] = [
  {
    labelKey: "workspace.sidebar.create",
    variant: "tool",
    rows: [
      [{ id: "video_gen", labelKey: "workspace.sidebar.video_gen", icon: Video, width: "full" }],
      [
        { id: "image_gen", labelKey: "workspace.sidebar.image_gen", icon: ImageIcon },
        { id: "voice_gen", labelKey: "workspace.sidebar.voice_gen", icon: Mic2 },
      ],
      [{ id: "image_to_3d", labelKey: "workspace.sidebar.threed_gen", icon: Box, width: "half" }],
    ],
  },
  {
    labelKey: "workspace.sidebar.assets",
    variant: "list",
    rows: [
      [{ id: "spaces", labelKey: "workspace.sidebar.spaces", icon: Workflow }],
      [{ id: "stock", labelKey: "workspace.sidebar.stock", icon: Images }],
      [{ id: "assets", labelKey: "workspace.sidebar.all_assets", icon: HistoryIcon }],
      [{ id: "projects", labelKey: "workspace.sidebar.projects", icon: BookOpen }],
    ],
  },
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
  /** Reserved for shells that still pass the legacy sidebar create action. */
  onCreate?: () => void;
}

export default function WorkspaceSidebar({
  active,
  onNavigate,
  onCreate,
}: WorkspaceSidebarProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
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

  // 2026-05 redesign: sidebar floats as a Layer-1 panel.
  //   • Outer wrapper carries the page-bg padding (8px around).
  //   • aside itself is a rounded card sitting inside.
  //   • No more right border — the page bg already separates the
  //     panel from the main content (different elevation).
  //   • Width tightened 198 → 192 keeps the visual rhythm.
  return (
    <div className="ws-scroll-hide h-full shrink-0 bg-[hsl(var(--surface-0))] py-0 pl-0">
      <aside
        className="mf-readable ws-scroll-hide flex h-full w-[230px] flex-col gap-[4px] overflow-y-auto rounded-[20px] border border-transparent px-[4px] py-[12px] text-[#b0b4ba]"
        style={{
          background:
            "linear-gradient(#121314, #121314) padding-box, linear-gradient(145deg, rgba(255,255,255,.42), rgba(144,80,160,.32) 34%, rgba(96,48,128,.28) 68%, rgba(160,80,160,.16)) border-box",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,.08), inset 0 -1px 0 rgba(144,80,160,.09), 0 0 24px -18px rgba(144,80,160,.9), 0 0 38px -30px rgba(96,48,128,.95)",
        }}
      >
      {/* ── Brand row — PSC : Digital Media ──────────────────────
       *  Logo lives at /public/psc-logo.png. Save the orange
       *  Digital Media wordmark there; the full lockup is wide
       *  so we use object-contain to fit the 34px square slot
       *  without distorting the trefoil + wordmark proportions. */}
      <div className="flex shrink-0 items-center px-[12px] pb-[12px] pt-[4px]">
        <button
          type="button"
          onClick={() => navigate("/app/workspace")}
          className="flex min-w-0 items-center gap-[8px] text-[18px] font-bold text-white transition-colors hover:text-white"
        >
          {/* Brand logo — defaults to the workspace mascot, swapped
           *  to the tenant org logo when the user is on a claimed
           *  subdomain (e.g. dmd.mediaforge.co → DMD logo). The
           *  square slot uses object-contain so wide wordmark logos
           *  don't get squashed. */}
          <img
            src={brandLogo}
            alt={brandName}
            className="h-[26px] w-[26px] shrink-0 select-none rounded-full bg-white object-contain"
            draggable={false}
          />
          <span className="truncate leading-tight">{brandName}</span>
        </button>
      </div>

      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="mx-[8px] mb-[6px] flex h-[36px] shrink-0 items-center justify-center gap-[8px] rounded-xl bg-[linear-gradient(135deg,rgba(155,77,224,.92),rgba(199,125,255,.7),rgba(91,42,140,.92))] px-[12px] text-[12px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.22),inset_0_-5px_12px_rgba(91,42,140,.45),0_10px_24px_-18px_rgba(199,125,255,.95)] transition hover:brightness-110 active:translate-y-px"
          title={t("workspace.standalone.create_project")}
        >
          <Plus className="h-[15px] w-[15px] shrink-0" strokeWidth={2.2} />
          <span className="truncate">{t("workspace.standalone.create_project")}</span>
        </button>
      )}

      {/* ── Top nav group ──────────────────────────────────────── */}
      <nav className="flex flex-col gap-[4px]">
        {NAV_TOP.map((it) => (
          <NavLink
            key={it.id}
            label={t(it.labelKey)}
            icon={it.icon}
            active={active === it.id}
            onClick={() => handleClick(it.id)}
            variant="list"
          />
        ))}
      </nav>

      {/* ── Section divider with label ─────────────────────────── */}
      {/* ── Tools nav group ────────────────────────────────────── */}
      {NAV_SECTIONS.map((section) => (
        <SidebarNavSection
          key={section.labelKey}
          label={t(section.labelKey)}
          rows={section.rows}
          variant={section.variant}
          active={active}
          onSelect={handleClick}
          translate={t}
        />
      ))}

      {/* ── Org / class extras (SSO branch) ────────────────────────
       *  These slots sit above the bottom utility row so the chrome
       *  order from top to bottom is: nav → tools → org context →
       *  utility cluster. `mt-auto` lives on the first of these so
       *  the whole stack hugs the bottom. */}

      {/* Active class switcher — only renders when student is in 2+
       *  classes; consumers/single-class students see nothing. */}
      <div className="mt-auto px-[8px] pt-[10px]">
        <ActiveClassPicker variant="compact" className="w-full" />
      </div>

      {/* Org credit badge — visible to org members so they can see
       *  their balance at a glance. Returns null for consumer/guests. */}
      <div className="px-[8px] py-[6px]">
        <OrgCreditBadge variant="card" />
      </div>

      {/* Org admin / class teacher entry to the management surface. */}
      <OrgAdminLink />

      {/* ── Bottom utility row ─────────────────────────────────── */}
      <div className="flex items-center gap-[4px] px-[8px] pb-[2px] pt-[8px]">
        <UtilityBtn icon={SettingsIcon} title={t("workspace.sidebar.settings")} onClick={() => navigate("/app/settings")} />
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
    <div className="mt-[8px] space-y-[4px] px-[8px] pb-[6px] pt-[2px]">
      <button
        type="button"
        onClick={() => void handlePrimaryClick()}
        className="relative flex h-[32px] w-full items-center gap-[8px] rounded-md px-[4px] text-[12px] text-amber-200/90 transition-colors hover:text-amber-100"
        title={primaryTip}
      >
        <PrimaryIcon className="h-[16px] w-[16px] shrink-0" />
        {primaryLabel}
      </button>
      <button
        type="button"
        onClick={() => navigate("/app/org-admin/branding")}
        className="relative flex h-[32px] w-full items-center gap-[8px] rounded-md px-[4px] text-[12px] text-[#b0b4ba] transition-colors hover:text-white"
        title={t("workspace.sidebar.branding_tip")}
      >
        <Palette className="h-[16px] w-[16px] shrink-0" />
        {t("workspace.sidebar.branding")}
      </button>
    </div>
  );
};

const SidebarNavSection = ({
  label,
  rows,
  variant,
  active,
  onSelect,
  translate,
}: {
  label: string;
  rows: NavItem[][];
  variant: "tool" | "list";
  active?: SectionKey;
  onSelect: (s: SectionKey) => void;
  translate: (key: NavItem["labelKey"]) => string;
}) => (
  <div className="pt-[16px]">
    <div className="workspace-sidebar-section-label px-[16px] pb-[6px] text-[12px] font-semibold uppercase tracking-[0.05px] text-[#43484e]">
      {label}
    </div>
    <div className="flex flex-col gap-[4px]">
      {rows.map((row, rowIndex) => {
        const splitToolRow =
          variant === "tool" && row.some((item) => item.width === "half");
        const compactToolRow = variant === "tool" && (row.length > 1 || splitToolRow);

        return (
          <div
            key={`${label}-${rowIndex}`}
            className={cn((row.length > 1 || splitToolRow) && "flex gap-[4px] px-[4px]")}
          >
            {row.map((item) => (
              <NavLink
                key={item.id}
                label={translate(item.labelKey)}
                icon={item.icon}
                active={active === item.id}
                onClick={() => onSelect(item.id)}
                compact={compactToolRow || row.length > 1}
                variant={variant}
              />
            ))}
            {splitToolRow && row.length === 1 && <span className="flex-1" aria-hidden />}
          </div>
        );
      })}
    </div>
  </div>
);

const NavLink = ({
  label,
  icon: Icon,
  active,
  onClick,
  compact = false,
  variant = "list",
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
  variant?: "tool" | "list";
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      /* 2026-05: drop the inset 1px stroke on active — bg lift alone
       *  is enough now that the sidebar is a Layer-1 panel. */
      "workspace-sidebar-nav-link group relative flex h-[32px] min-w-0 items-center gap-[10px] text-left text-[12px] font-medium transition-colors",
      variant === "tool"
        ? "mx-[8px] overflow-hidden rounded-lg bg-[rgba(216,244,246,.04)] px-[8px]"
        : "mx-[12px] rounded-md bg-transparent px-[4px]",
      variant === "tool" && !compact && "w-[calc(100%-16px)]",
      compact && variant === "tool" && "mx-0 flex-1 gap-[6px] px-[6px] text-[11px]",
      compact && variant === "list" && "mx-[12px]",
      active && variant === "tool"
        ? "rounded-[10px] border border-[#b98ccc] bg-[#0b0c0d] text-white"
        : active
          ? "text-white"
          : variant === "tool"
            ? "text-[#d8dce2] hover:bg-white/12 hover:text-white"
            : "text-[#b0b4ba] hover:text-white",
    )}
  >
    {variant === "tool" && !active && (
      <span className="pointer-events-none absolute inset-0 rounded-lg bg-[linear-gradient(170deg,rgba(211,237,248,.18)_0%,rgba(211,237,248,0)_20%,rgba(211,237,248,0)_80%,rgba(211,237,248,.14)_100%)] transition-opacity group-hover:opacity-0" />
    )}
    {variant === "tool" && active && (
      <span className="pointer-events-none absolute inset-[-1px] rounded-[10px] shadow-[inset_0_-3px_8px_0_#9050a0,inset_0_2px_8px_0_rgba(255,255,255,.32),0_0_12px_rgba(96,48,128,.62)]" />
    )}
    <Icon className="relative h-[16px] w-[16px] shrink-0" />
    <span className="workspace-sidebar-nav-label relative min-w-0 truncate">{label}</span>
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
    className="relative flex h-[32px] w-[32px] items-center justify-center rounded-md text-[#b0b4ba] transition-colors hover:bg-white/20 hover:text-white"
  >
    <Icon className="h-[16px] w-[16px]" />
    {badge && (
      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-400 ring-2 ring-[hsl(0_0%_4%)]" />
    )}
  </button>
);
