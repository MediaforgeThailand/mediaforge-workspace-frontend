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
  ChevronDown,
  FolderOpen,
  Captions,
  Clapperboard,
  Home as HomeIcon,
  Link,
  Workflow,
  Image as ImageIcon,
  Images,
  Languages,
  Maximize2,
  Video,
  Mic2,
  Sparkles,
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
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/contexts/locales/en";
import { useIsClassTeacher, useIsOrgAdmin } from "@/hooks/useIsOrgUser";
import { useOrgBranding } from "@/hooks/useOrgBranding";
import { useCredits } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import OrgCreditBadge from "@/components/OrgCreditBadge";
import ActiveClassPicker from "@/components/ActiveClassPicker";
import AllAssetsDialog from "@/components/workspace/AllAssetsDialog";
import { UserMenu } from "@/components/workspace/UserMenu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_BRAND_LOGO } from "@/components/workspace/brandAssets";
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
  | "library"
  | "image_gen"
  | "image_upscale"
  | "video_gen"
  | "voice_gen"
  | "voice_translate"
  | "auto_subtitle"
  | "smart_frames"
  | "image_to_3d"
  | "url_asset"
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
    | "workspace.sidebar.library"
    | "workspace.sidebar.all_assets"
    | "workspace.sidebar.stock"
    | "workspace.sidebar.spaces"
    | "workspace.sidebar.image_gen"
    | "workspace.sidebar.image_upscale"
    | "workspace.sidebar.video_gen"
    | "workspace.sidebar.voice_gen"
    | "workspace.sidebar.voice_translate"
    | "workspace.sidebar.auto_subtitle"
    | "workspace.sidebar.smart_frames"
    | "workspace.sidebar.threed_gen"
    | "workspace.sidebar.url_asset"
    | "workspace.sidebar.editing_tools"
    | "workspace.sidebar.editor_new";
  badgeKey?: "workspace.sidebar.editor_new";
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

const SIDEBAR_NAV_ITEMS: NavItem[] = [
  { id: "home", labelKey: "workspace.sidebar.home", icon: HomeIcon },
  { id: "spaces", labelKey: "workspace.sidebar.spaces", badgeKey: "workspace.sidebar.editor_new", icon: Workflow },
  { id: "image_gen", labelKey: "workspace.sidebar.image_gen", icon: ImageIcon },
  { id: "video_gen", labelKey: "workspace.sidebar.video_gen", icon: Video },
  { id: "image_upscale", labelKey: "workspace.sidebar.image_upscale", icon: Maximize2 },
  { id: "url_asset", labelKey: "workspace.sidebar.url_asset", icon: Link },
  { id: "voice_translate", labelKey: "workspace.sidebar.voice_translate", badgeKey: "workspace.sidebar.editor_new", icon: Languages },
  { id: "voice_gen", labelKey: "workspace.sidebar.voice_gen", icon: Mic2 },
  { id: "smart_frames", labelKey: "workspace.sidebar.smart_frames", badgeKey: "workspace.sidebar.editor_new", icon: Sparkles },
  { id: "auto_subtitle", labelKey: "workspace.sidebar.auto_subtitle", icon: Captions },
  { id: "image_to_3d", labelKey: "workspace.sidebar.threed_gen", icon: Box },
  { id: "editor", labelKey: "workspace.sidebar.editing_tools", icon: Clapperboard },
];

// Keep Smart Frames wired, but hide its Home/sidebar entry until the hosted
// renderer is ready for users.
const SHOW_SMART_FRAMES_NAV = false;
const VISIBLE_SIDEBAR_NAV_ITEMS = SIDEBAR_NAV_ITEMS.filter(
  (item) => SHOW_SMART_FRAMES_NAV || item.id !== "smart_frames",
);

const NAV_SECTIONS: SidebarSection[] = [
  {
    labelKey: "workspace.sidebar.create",
    variant: "tool",
    rows: [
      [
        { id: "image_gen", labelKey: "workspace.sidebar.image_gen", icon: ImageIcon },
        { id: "video_gen", labelKey: "workspace.sidebar.video_gen", icon: Video },
      ],
      [
        { id: "voice_gen", labelKey: "workspace.sidebar.voice_gen", icon: Mic2 },
        { id: "voice_translate", labelKey: "workspace.sidebar.voice_translate", badgeKey: "workspace.sidebar.editor_new", icon: Languages },
      ],
      [{ id: "image_upscale", labelKey: "workspace.sidebar.image_upscale", icon: Maximize2, width: "full" }],
      [{ id: "auto_subtitle", labelKey: "workspace.sidebar.auto_subtitle", badgeKey: "workspace.sidebar.editor_new", icon: Captions, width: "full" }],
      ...(SHOW_SMART_FRAMES_NAV
        ? [[{ id: "smart_frames", labelKey: "workspace.sidebar.smart_frames", badgeKey: "workspace.sidebar.editor_new", icon: Sparkles, width: "full", tone: "accent" }]]
        : []),
      [{ id: "image_to_3d", labelKey: "workspace.sidebar.threed_gen", icon: Box, width: "full" }],
    ],
  },
  {
    labelKey: "workspace.sidebar.tools",
    variant: "tool",
    rows: [
      [
        {
          id: "editor",
          labelKey: "workspace.sidebar.editing_tools",
          badgeKey: "workspace.sidebar.editor_new",
          icon: Clapperboard,
          width: "full",
          tone: "accent",
        },
      ],
      [{ id: "spaces", labelKey: "workspace.sidebar.spaces", icon: Workflow, width: "full", tone: "accent" }],
    ],
  },
  {
    labelKey: "workspace.sidebar.assets",
    variant: "list",
    rows: [
      [{ id: "library", labelKey: "workspace.sidebar.library", icon: FolderOpen }],
      [{ id: "url_asset", labelKey: "workspace.sidebar.url_asset", icon: Link }],
      [{ id: "stock", labelKey: "workspace.sidebar.stock", icon: Images }],
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
  collapsed?: boolean;
}

export default function WorkspaceSidebar({
  active,
  onNavigate,
  onCreate,
  projects = [],
  activeProjectId = null,
  onSelectProject,
  collapsed = false,
}: WorkspaceSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { user, profile, loading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Tenant branding override (e.g. dmd.mediaforge.co → DMD logo +
  // "DMD" short name). Returns null on the bare workspace.mediaforge.co
  // host or while the lookup is in flight; we render the default
  // mascot brand in that case so the chrome doesn't flicker empty.
  const branding = useOrgBranding();
  const brandLogo = branding?.logoUrl ?? DEFAULT_BRAND_LOGO;
  const brandName = branding?.shortName ?? "Workspace";
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
    if (s === "library") {
      setLibraryOpen(true);
      return;
    }
    if (s === "editor") {
      navigate("/app/editor");
      return;
    }
    if (onNavigate) onNavigate(s);
    else navigate(`/app/workspace?section=${s}`);
  };

  const openAuth = (initialTab: "login" | "signup") => {
    openAuthModal({
      initialTab,
      redirectPath: `${location.pathname}${location.search}${location.hash}`,
    });
  };

  const accountName =
    profile?.display_name?.trim() ||
    user?.email?.split("@")[0] ||
    "Media Forge";
  const accountSubtitle = user?.email ?? "Personal workspace";

  return (
    <div
      className={cn(
        "mf-ref-sidebar-frame ws-scroll-hide",
        collapsed && "is-collapsed",
      )}
    >
      <aside
        className={cn(
          "mf-readable mf-ref-sidebar ws-scroll-hide",
          collapsed && "is-collapsed",
        )}
      >
        <div className="mf-ref-brand-row">
          <button
            type="button"
            onClick={() => navigate("/app/workspace")}
            title={brandName}
            className="mf-ref-brand"
          >
            <span className={cn("mf-ref-brand-mark", usingDefaultBrand && "is-default")} aria-hidden="true">
              <img
                src={brandLogo}
                alt=""
                className={cn(usingDefaultBrand ? "object-contain" : "rounded-full object-cover")}
                draggable={false}
              />
            </span>
            {!collapsed && <span className="mf-ref-brand-name">{brandName}</span>}
          </button>
        </div>

        {!collapsed && (projectOptions.length > 0 || onCreate) && (
          <SidebarProjectPicker
            projects={projectOptions}
            activeProject={selectedProject}
            onSelectProject={(id) => onSelectProject?.(id)}
            onCreateProject={onCreate}
            projectLabel={t("workspace.home.projects")}
            newProjectLabel={t("workspace.standalone.new_project")}
            createProjectLabel={t("workspace.home.projects")}
          />
        )}

        <nav className="mf-ref-nav-stack" aria-label="Primary navigation">
          {VISIBLE_SIDEBAR_NAV_ITEMS.map((it) => (
            <NavLink
              key={it.id}
              label={t(it.labelKey)}
              icon={it.icon}
              active={active === it.id}
              onClick={() => handleClick(it.id)}
              badge={it.badgeKey ? t(it.badgeKey) : undefined}
              iconOnly={collapsed}
              tooltip={collapsed ? t(it.labelKey) : undefined}
            />
          ))}
        </nav>

        {collapsed ? (
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handleClick("library")}
                className="mf-ref-resources is-icon-only"
                aria-label={t("workspace.sidebar.library")}
              >
                <FolderOpen className="mf-ref-nav-icon" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              sideOffset={10}
              className="pointer-events-none border-white/[0.12] bg-black px-[11px] py-[7px] text-[13px] font-semibold leading-[1.35] text-white shadow-[0_18px_48px_-24px_rgba(0,0,0,.95),0_0_24px_-18px_rgba(234,255,0,.75)]"
            >
              {t("workspace.sidebar.library")}
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={() => handleClick("library")}
            className="mf-ref-resources"
            title={t("workspace.sidebar.library")}
            aria-label={t("workspace.sidebar.library")}
          >
            <FolderOpen className="mf-ref-nav-icon" />
            <span>{t("workspace.sidebar.library")}</span>
            <span aria-hidden="true">›</span>
          </button>
        )}

        {!collapsed && (
          <div className="mf-ref-context-stack">
            <ActiveClassPicker variant="compact" className="w-full" />
            <OrgCreditBadge variant="card" />
            <OrgAdminLink />
          </div>
        )}

        <div className={cn("mf-ref-auth-panel", collapsed && "is-collapsed")}>
          {authLoading ? (
            <div className={cn("mf-ref-account-row is-loading", collapsed && "is-collapsed")}>
              <span className="mf-ref-account-skeleton" />
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span />
                  <span />
                </span>
              )}
            </div>
          ) : user ? (
            <UserMenu
              compact
              sidebarAccount={{
                name: accountName,
                subtitle: accountSubtitle,
                collapsed,
              }}
            />
          ) : (
            <>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => openAuth("signup")}
                  className="mf-ref-bottom-button is-primary"
                >
                  Sign Up
                </button>
              )}
              <button
                type="button"
                onClick={() => openAuth("login")}
                className="mf-ref-bottom-button is-secondary"
                title="Sign In"
                aria-label="Sign In"
              >
                {collapsed ? <SettingsIcon className="h-[16px] w-[16px]" /> : "Sign In"}
              </button>
            </>
          )}
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
      const menuWidth = 286;
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
            className="fixed z-[1000] w-[286px] rounded-[12px] border border-[#eaff00]/20 bg-[#101211]/95 p-[8px] text-white shadow-[0_28px_80px_-36px_rgba(0,0,0,.98),0_0_42px_-22px_rgba(234,255,0,.9)] backdrop-blur-xl"
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
            }}
            role="menu"
          >
            <div className="flex items-center justify-between px-[7px] pb-[8px] pt-[1px]">
              <span className="mf-ref-project-menu-heading text-zinc-400">
                {projectLabel}
              </span>
              <span className="h-[5px] w-[5px] rounded-full bg-[#eaff00] shadow-[0_0_14px_rgba(234,255,0,.9)]" />
            </div>
            <div className="flex max-h-[236px] flex-col gap-[6px] overflow-y-auto pr-[1px]">
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
                      "group flex h-[40px] items-center gap-[8px] rounded-[9px] border px-[9px] text-left transition duration-150",
                      active
                        ? "border-[#eaff00]/70 bg-black text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.08),0_0_20px_-8px_rgba(234,255,0,.92)]"
                        : "border-white/[0.075] bg-[#171917] text-zinc-200 hover:border-[#eaff00]/35 hover:bg-[#20231c] hover:text-white",
                    )}
                    role="menuitem"
                  >
                    <span className="grid h-[26px] w-[26px] shrink-0 place-items-center overflow-hidden rounded-full bg-[#0b0d0d] ring-1 ring-white/12">
                      <img
                        src={avatar}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                      />
                    </span>
                    <span className="mf-ref-project-menu-name min-w-0 flex-1 truncate">
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
                className="ci-gloss-button mf-ref-project-create mt-[8px] flex h-[36px] w-full items-center justify-center gap-[8px] rounded-[9px] px-[12px] transition hover:-translate-y-px active:translate-y-px"
                role="menuitem"
              >
                <span className="grid h-[17px] w-[17px] place-items-center rounded-full bg-black/90 text-[#eaff00] shadow-[inset_0_0_0_1px_rgba(234,255,0,.22)]">
                  <Plus className="h-[11px] w-[11px]" strokeWidth={2.5} />
                </span>
                {newProjectLabel}
              </button>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative mx-[4px] mb-[8px] mt-[14px]">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-[36px] w-full items-center gap-[8px] rounded-[8px] border border-white/[0.09] bg-[#1a1d1d] px-[8px] text-left text-white outline-none transition",
          "shadow-[inset_0_1px_0_rgba(255,255,255,.045)] hover:border-[#eaff00]/36 hover:bg-[#202321] focus-visible:ring-1 focus-visible:ring-[#eaff00]/70",
          open && "border-[#eaff00]/70 bg-[#141710] shadow-[0_0_22px_-14px_rgba(234,255,0,.9),inset_0_0_0_1px_rgba(255,255,255,.06)]",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid h-[24px] w-[24px] shrink-0 place-items-center overflow-hidden rounded-full bg-[#0b0d0d] ring-1 ring-white/12">
          <img
            src={projectAvatar}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </span>
        <span className="mf-ref-project-trigger-label min-w-0 flex-1 truncate">
          {projectName}
        </span>
        <ChevronDown
          className={cn(
            "h-[13px] w-[13px] shrink-0 text-zinc-500 transition-transform",
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
  collapsed = false,
}: {
  label: string;
  rows: NavItem[][];
  variant: "tool" | "list";
  active?: SectionKey;
  onSelect: (s: SectionKey) => void;
  translate: (key: TranslationKey) => string;
  collapsed?: boolean;
}) => (
  <div className={cn(collapsed ? "pt-[8px]" : "pt-[16px]", variant === "tool" && (collapsed ? "pt-[10px]" : "pt-[18px]"))}>
    <div
      className={cn(
        "px-[16px] pb-[6px] text-[11px] font-semibold uppercase tracking-[0.04em] text-[#555b61]",
        variant === "tool" && "px-[18px] pb-[7px] text-[#4e5559]",
        collapsed && "sr-only",
      )}
    >
      {label}
    </div>
    <div className={cn("flex flex-col gap-[4px]", variant === "tool" && (collapsed ? "gap-[5px] px-0" : "gap-[5px] px-[10px]"))}>
      {rows.map((row, rowIndex) => {
        const splitToolRow =
          variant === "tool" && row.some((item) => item.width === "half");
        const compactToolRow = collapsed || (variant === "tool" && (row.length > 1 || splitToolRow));

        return (
          <div
            key={`${label}-${rowIndex}`}
            className={cn(
              collapsed ? "flex flex-col items-center gap-[5px]" : variant === "tool" && "flex gap-[5px]",
              !collapsed && variant !== "tool" && (row.length > 1 || splitToolRow) && "flex gap-[4px] px-[4px]",
            )}
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
                tone={item.tone}
                badge={item.badgeKey ? translate(item.badgeKey) : undefined}
                iconOnly={collapsed}
                tooltip={
                  collapsed
                    ? translate(item.labelKey)
                    : variant === "tool" ? getSidebarToolTooltip(item.id, translate) : undefined
                }
              />
            ))}
            {!collapsed && splitToolRow && row.length === 1 && <span className="flex-1" aria-hidden />}
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
  badge,
  tooltip,
  iconOnly = false,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
  variant?: "tool" | "list";
  tone?: "default" | "accent";
  badge?: string;
  tooltip?: string;
  iconOnly?: boolean;
}) => {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label={tooltip ? `${label}: ${tooltip}` : label}
      className={cn(
        "mf-ref-nav-item",
        active && "is-active",
        iconOnly && "is-icon-only",
      )}
    >
      <Icon className="mf-ref-nav-icon" />
      {!iconOnly && <span>{label}</span>}
      {badge && !iconOnly && <strong>{badge}</strong>}
    </button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={10}
        className="pointer-events-none max-w-[260px] whitespace-normal border-white/[0.12] bg-black px-[11px] py-[7px] text-[13px] font-semibold leading-[1.35] text-white shadow-[0_18px_48px_-24px_rgba(0,0,0,.95),0_0_24px_-18px_rgba(234,255,0,.75)]"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

function getSidebarToolTooltip(
  id: SectionKey,
  t: (key: TranslationKey) => string,
): string | undefined {
  switch (id) {
    case "image_gen":
      return t("workspace.sidebar.image_gen_tip");
    case "video_gen":
      return t("workspace.sidebar.video_gen_tip");
    case "voice_gen":
      return t("workspace.sidebar.voice_gen_tip");
    case "voice_translate":
      return t("workspace.sidebar.voice_translate_tip");
    case "image_upscale":
      return t("workspace.sidebar.image_upscale_tip");
    case "url_asset":
      return t("workspace.sidebar.url_asset_tip");
    case "auto_subtitle":
      return t("workspace.sidebar.auto_subtitle_tip");
    case "smart_frames":
      return t("workspace.sidebar.smart_frames_tip");
    case "image_to_3d":
      return t("workspace.sidebar.threed_gen_tip");
    case "editor":
      return t("workspace.sidebar.editor_tip");
    case "spaces":
      return t("workspace.sidebar.spaces_tip");
    default:
      return undefined;
  }
}

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
