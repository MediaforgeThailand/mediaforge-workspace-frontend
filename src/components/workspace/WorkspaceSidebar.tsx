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
  ChevronDown,
  FolderOpen,
  Clapperboard,
  Home as HomeIcon,
  History as HistoryIcon,
  Workflow,
  Image as ImageIcon,
  Images,
  Languages,
  Maximize2,
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
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsClassTeacher, useIsOrgAdmin } from "@/hooks/useIsOrgUser";
import { useOrgBranding } from "@/hooks/useOrgBranding";
import { useCredits } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import OrgCreditBadge from "@/components/OrgCreditBadge";
import ActiveClassPicker from "@/components/ActiveClassPicker";
import AllAssetsDialog from "@/components/workspace/AllAssetsDialog";
import { DEFAULT_BRAND_LOGO, DEFAULT_BRAND_NAME } from "@/components/workspace/brandAssets";
import { getProjectAvatar } from "@/components/workspace/projectAvatars";
import type { ProjectMeta } from "@/store/useWorkspaceStore";

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
  | "image_upscale"
  | "video_gen"
  | "voice_gen"
  | "voice_translate"
  | "image_to_3d"
  | "editor"
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
    | "workspace.sidebar.image_upscale"
    | "workspace.sidebar.video_gen"
    | "workspace.sidebar.voice_gen"
    | "workspace.sidebar.voice_translate"
    | "workspace.sidebar.threed_gen"
    | "workspace.sidebar.editor_new";
  displayLabel?: string;
  icon: LucideIcon;
  width?: "full" | "half";
  tone?: "default" | "accent";
};

type SidebarSection = {
  labelKey:
    | "workspace.sidebar.create"
    | "workspace.sidebar.tools"
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
      [{ id: "video_gen", labelKey: "workspace.sidebar.video_gen", displayLabel: "Video", icon: Video, width: "full" }],
      [
        { id: "image_gen", labelKey: "workspace.sidebar.image_gen", displayLabel: "Image", icon: ImageIcon },
        { id: "voice_gen", labelKey: "workspace.sidebar.voice_gen", displayLabel: "Audio", icon: Mic2 },
      ],
      [{ id: "image_upscale", labelKey: "workspace.sidebar.image_upscale", displayLabel: "Upscale", icon: Maximize2, width: "full" }],
      [{ id: "voice_translate", labelKey: "workspace.sidebar.voice_translate", displayLabel: "Translate", icon: Languages, width: "full" }],
      [{ id: "image_to_3d", labelKey: "workspace.sidebar.threed_gen", displayLabel: "3D Generator", icon: Box, width: "full" }],
    ],
  },
  {
    labelKey: "workspace.sidebar.tools",
    variant: "tool",
    rows: [
      [{ id: "editor", labelKey: "workspace.sidebar.editor_new", displayLabel: "New", icon: Clapperboard, width: "full", tone: "accent" }],
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
  projects?: ProjectMeta[];
  activeProjectId?: string | null;
  onSelectProject?: (id: string | null) => void;
}

export default function WorkspaceSidebar({
  active,
  onNavigate,
  onCreate,
  projects = [],
  activeProjectId = null,
  onSelectProject,
}: WorkspaceSidebarProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Tenant branding override (e.g. dmd.mediaforge.co → DMD logo +
  // "DMD" short name). Returns null on the bare workspace.mediaforge.co
  // host or while the lookup is in flight; we render the default
  // mascot brand in that case so the chrome doesn't flicker empty.
  const branding = useOrgBranding();
  const brandLogo = branding?.logoUrl ?? DEFAULT_BRAND_LOGO;
  const brandName = branding?.shortName ?? DEFAULT_BRAND_NAME;
  const usingDefaultBrand = !branding?.logoUrl;
  const projectOptions = [...projects].sort(
    (a, b) =>
      Number(b.id === activeProjectId) - Number(a.id === activeProjectId) ||
      b.updatedAt - a.updatedAt,
  );
  const selectedProjectId =
    activeProjectId && projectOptions.some((project) => project.id === activeProjectId)
      ? activeProjectId
      : projectOptions[0]?.id ?? "";
  const selectedProject =
    projectOptions.find((project) => project.id === selectedProjectId) ??
    projectOptions[0] ??
    null;

  const handleClick = (s: SectionKey) => {
    if (s === "editor") {
      navigate("/app/editor");
      return;
    }
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
    <div className="ws-scroll-hide h-full shrink-0 bg-[#070808] py-2 pl-0">
      <aside
        className="mf-readable ws-scroll-hide flex h-full w-[230px] flex-col gap-[4px] overflow-y-auto rounded-[18px] border border-white/[0.10] px-[6px] py-[12px] text-[#b0b4ba]"
        style={{
          background:
            "radial-gradient(95% 70% at 50% -10%, rgba(234,255,0,.04), transparent 50%), linear-gradient(180deg, #171a19 0%, #111313 46%, #0c0d0d 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,.08), inset 0 -1px 0 rgba(255,255,255,.035), 0 24px 64px -52px rgba(0,0,0,.95), 0 0 28px -26px rgba(234,255,0,.72)",
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
          {/* Brand logo — defaults to the MediaForge mark, swapped
           *  to the tenant org logo when the user is on a claimed
           *  subdomain (e.g. dmd.mediaforge.co → DMD logo). */}
          <img
            src={brandLogo}
            alt={brandName}
            className={cn(
              "shrink-0 select-none object-contain",
              usingDefaultBrand
                ? "h-[28px] w-[42px]"
                : "h-[26px] w-[26px] rounded-full bg-white",
            )}
            draggable={false}
          />
          <span className="truncate leading-tight">{brandName}</span>
        </button>
      </div>

      {(onSelectProject || onCreate) && (
        <SidebarProjectPicker
          projects={projectOptions}
          activeProject={selectedProject}
          onSelectProject={(id) => onSelectProject?.(id)}
          onCreateProject={onCreate}
          projectLabel={t("workspace.standalone.projects")}
          newProjectLabel={t("workspace.standalone.new_project")}
          createProjectLabel={t("workspace.standalone.create_project")}
        />
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
        <NavLink
          label={t("workspace.sidebar.library")}
          icon={FolderOpen}
          active={false}
          onClick={() => setLibraryOpen(true)}
          variant="list"
        />
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
      <AllAssetsDialog open={libraryOpen} onClose={() => setLibraryOpen(false)} />
      </aside>
    </div>
  );
}

function SidebarProjectPicker({
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  projectLabel,
  newProjectLabel,
  createProjectLabel,
}: {
  projects: ProjectMeta[];
  activeProject: ProjectMeta | null;
  onSelectProject: (id: string) => void;
  onCreateProject?: () => void;
  projectLabel: string;
  newProjectLabel: string;
  createProjectLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const projectName = activeProject?.name?.trim() || createProjectLabel;
  const projectAvatar = getProjectAvatar(activeProject ?? { id: "new-project", name: projectName });

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gutter = 10;
      const margin = 12;
      const menuWidth = 306;
      const rightSideLeft = rect.right + gutter;
      const hasRoomOnRight = rightSideLeft + menuWidth + margin <= window.innerWidth;
      const fallbackLeft = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - menuWidth - margin),
      );
      setMenuPosition({
        left: hasRoomOnRight ? rightSideLeft : fallbackLeft,
        top: hasRoomOnRight ? Math.max(margin, rect.top - 2) : rect.bottom + 8,
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[1000] w-[306px] rounded-[14px] border border-[#eaff00]/20 bg-[#101211]/95 p-[10px] text-white shadow-[0_28px_80px_-36px_rgba(0,0,0,.98),0_0_42px_-22px_rgba(234,255,0,.9)] backdrop-blur-xl"
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
            }}
            role="menu"
          >
            <div className="flex items-center justify-between px-[8px] pb-[9px] pt-[2px]">
              <span className="text-[11px] font-semibold text-zinc-400">
                {projectLabel}
              </span>
              <span className="h-[5px] w-[5px] rounded-full bg-[#eaff00] shadow-[0_0_14px_rgba(234,255,0,.9)]" />
            </div>
            <div className="flex max-h-[256px] flex-col gap-[7px] overflow-y-auto pr-[1px]">
              {projects.map((project) => {
                const active = project.id === activeProject?.id;
                const avatar = getProjectAvatar(project);
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      onSelectProject(project.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "group flex h-[46px] items-center gap-[10px] rounded-[10px] border px-[11px] text-left transition duration-150",
                      active
                        ? "border-[#eaff00]/70 bg-black text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.08),0_0_20px_-8px_rgba(234,255,0,.92)]"
                        : "border-white/[0.075] bg-[#171917] text-zinc-200 hover:border-[#eaff00]/35 hover:bg-[#20231c] hover:text-white",
                    )}
                    role="menuitem"
                  >
                    <span className="grid h-[30px] w-[30px] shrink-0 place-items-center overflow-hidden rounded-full bg-[#0b0d0d] ring-1 ring-white/12">
                      <img
                        src={avatar}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                      />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em]">
                      {project.name}
                    </span>
                    {active && (
                      <span className="h-[6px] w-[6px] rounded-full bg-[#eaff00] shadow-[0_0_12px_rgba(234,255,0,.95)]" />
                    )}
                  </button>
                );
              })}
            </div>
            {onCreateProject && (
              <button
                type="button"
                onClick={() => {
                  onCreateProject();
                  setOpen(false);
                }}
                className="ci-gloss-button mt-[10px] flex h-[40px] w-full items-center justify-center gap-[9px] rounded-[10px] px-[14px] text-[13px] font-bold transition hover:-translate-y-px active:translate-y-px"
                role="menuitem"
              >
                <span className="grid h-[19px] w-[19px] place-items-center rounded-full bg-black/90 text-[#eaff00] shadow-[inset_0_0_0_1px_rgba(234,255,0,.22)]">
                  <Plus className="h-[12px] w-[12px]" strokeWidth={2.5} />
                </span>
                {newProjectLabel}
              </button>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative mx-[6px] mb-[10px]">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-[43px] w-full items-center gap-[10px] rounded-[10px] border border-white/[0.09] bg-[#1a1d1d] px-[10px] text-left text-white outline-none transition",
          "shadow-[inset_0_1px_0_rgba(255,255,255,.045)] hover:border-[#eaff00]/36 hover:bg-[#202321] focus-visible:ring-1 focus-visible:ring-[#eaff00]/70",
          open && "border-[#eaff00]/70 bg-[#141710] shadow-[0_0_22px_-14px_rgba(234,255,0,.9),inset_0_0_0_1px_rgba(255,255,255,.06)]",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center overflow-hidden rounded-full bg-[#0b0d0d] ring-1 ring-white/12">
          <img
            src={projectAvatar}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {projectName}
        </span>
        <ChevronDown
          className={cn(
            "h-[14px] w-[14px] shrink-0 text-zinc-500 transition-transform",
            open && "rotate-180 text-zinc-300",
          )}
        />
      </button>
      {menu}
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
        <span className="min-w-0 truncate">{primaryLabel}</span>
      </button>
      <button
        type="button"
        onClick={() => navigate("/app/org-admin/branding")}
        className="relative flex h-[32px] w-full items-center gap-[8px] rounded-md px-[4px] text-[12px] text-[#b0b4ba] transition-colors hover:text-white"
        title={t("workspace.sidebar.branding_tip")}
      >
        <Palette className="h-[16px] w-[16px] shrink-0" />
        <span className="min-w-0 truncate">{t("workspace.sidebar.branding")}</span>
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
  <div className={cn("pt-[16px]", variant === "tool" && "pt-[18px]")}>
    <div
      className={cn(
        "px-[16px] pb-[6px] text-[11px] font-semibold uppercase tracking-[0.04em] text-[#555b61]",
        variant === "tool" && "px-[18px] pb-[7px] text-[#4e5559]",
      )}
    >
      {label}
    </div>
    <div className={cn("flex flex-col gap-[4px]", variant === "tool" && "gap-[5px] px-[10px]")}>
      {rows.map((row, rowIndex) => {
        const splitToolRow =
          variant === "tool" && row.some((item) => item.width === "half");
        const compactToolRow = variant === "tool" && (row.length > 1 || splitToolRow);

        return (
          <div
            key={`${label}-${rowIndex}`}
            className={cn(
              variant === "tool" && "flex gap-[5px]",
              variant !== "tool" && (row.length > 1 || splitToolRow) && "flex gap-[4px] px-[4px]",
            )}
          >
            {row.map((item) => (
              <NavLink
                key={item.id}
                label={item.displayLabel ?? translate(item.labelKey)}
                icon={item.icon}
                active={active === item.id}
                onClick={() => onSelect(item.id)}
                compact={compactToolRow || row.length > 1}
                variant={variant}
                tone={item.tone}
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
  tone = "default",
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
  variant?: "tool" | "list";
  tone?: "default" | "accent";
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      /* 2026-05: drop the inset 1px stroke on active — bg lift alone
       *  is enough now that the sidebar is a Layer-1 panel. */
      "group relative flex h-[32px] min-w-0 items-center gap-[10px] text-left text-[12px] font-medium transition-colors",
      variant === "tool" && tone === "accent"
        ? "overflow-hidden rounded-[7px] border border-cyan-300/35 bg-cyan-950/50 px-[8px] text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_0_18px_-12px_rgba(34,211,238,.95)]"
        : variant === "tool"
        ? "overflow-hidden rounded-[7px] border border-white/[0.075] bg-[#171a19] px-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,.035)]"
        : "mx-[12px] rounded-md bg-transparent px-[4px]",
      variant === "tool" && !compact && "w-full",
      compact && variant === "tool" && "mx-0 flex-1 gap-[7px] px-[7px] text-[12px]",
      compact && variant === "list" && "mx-[12px]",
      active && variant === "tool" && tone === "accent"
        ? "border-cyan-200/80 bg-cyan-500/20 text-white shadow-[0_0_18px_-8px_rgba(34,211,238,.95),inset_0_0_0_1px_rgba(255,255,255,.08)]"
        : active && variant === "tool"
        ? "border-[#eaff00]/70 bg-[#121411] text-white shadow-[0_0_16px_-8px_rgba(234,255,0,.95),inset_0_0_0_1px_rgba(255,255,255,.05)]"
        : active
          ? "text-white"
          : variant === "tool"
            ? tone === "accent"
              ? "hover:border-cyan-200/70 hover:bg-cyan-500/20 hover:text-white"
              : "text-[#e4e7e9] hover:border-[#eaff00]/30 hover:bg-[#20231f] hover:text-white"
            : "text-[#b0b4ba] hover:text-white",
    )}
  >
    {variant === "tool" && !active && (
      <span
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[7px] bg-[linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,0)_44%)] transition-opacity group-hover:opacity-0",
          tone === "accent"
            ? "bg-[linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,0)_44%),radial-gradient(90%_120%_at_0%_0%,rgba(34,211,238,.28),transparent_48%)]"
            : "bg-[linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,0)_44%),radial-gradient(90%_120%_at_0%_0%,rgba(234,255,0,.045),transparent_42%)]",
        )}
      />
    )}
    {variant === "tool" && active && (
      <span className="pointer-events-none absolute inset-[-1px] rounded-[8px] shadow-[inset_0_-3px_8px_0_rgba(234,255,0,.30),inset_0_1px_8px_0_rgba(255,255,255,.16),0_0_12px_rgba(234,255,0,.32)]" />
    )}
    <Icon className={cn("relative shrink-0", variant === "tool" ? "h-[15px] w-[15px]" : "h-[16px] w-[16px]")} />
    <span className="relative min-w-0 truncate">{label}</span>
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
