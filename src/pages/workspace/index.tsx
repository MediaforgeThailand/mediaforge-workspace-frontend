/**
 * Workspace dashboard — Magnific-style aggregator home + slim sidebar.
 *
 * Sidebar is split into 2 groups:
 *
 *   Top — primary surfaces:
 *     Home       → aggregator (this design's centrepiece)
 *     Spaces     → grid of all spaces (the old workspace dashboard)
 *     Community  → placeholder
 *     Projects   → placeholder
 *
 *   Bottom — utilities:
 *     All tools  → placeholder (catalog of node types)
 *     Stock      → placeholder (curated stock library)
 *
 * Home aggregates the user's recent activity in a single scroll:
 *   • Top row: 3 cards
 *       Projects   — real project list from workspace_projects
 *       Spaces     — horizontal carousel of recent spaces with the
 *                     real per-space minimap thumbnail (same engine
 *                     as the Spaces grid below)
 *       Tools      — real standalone generation tools
 *   • "My work →" link → jumps to Spaces view
 *   • Academy videos
 *       Real video assets, lazy-loaded when the user presses play.
 *
 * The Spaces view (full grid with month buckets) is preserved as-is
 * for the Spaces tab — already battle-tested for cross-device sync.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import WorkspaceErrorBoundary from "@/components/workspace/WorkspaceErrorBoundary";
import {
  loadProjectsFromServer,
  loadWorkspacesFromServer,
  upsertProjectToServer,
  upsertWorkspaceToServer,
  deleteWorkspaceFromServer,
  listServerCanvasIds,
  saveCanvasToServer,
} from "@/components/workspace/canvasPersistence";
import {
  Plus,
  Layers,
  LayoutGrid,
  Heart,
  Search,
  Pencil,
  Trash2,
  Copy,
  Lock,
  Users,
  ChevronDown,
  ChevronRight,
  List,
  SlidersHorizontal,
  UserCircle2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWorkspaceStore, type ProjectMeta } from "@/store/useWorkspaceStore";
import { UserMenu } from "@/components/workspace/UserMenu";
import WorkspaceSidebar, {
  type SectionKey,
} from "@/components/workspace/WorkspaceSidebar";
import StandaloneGenerator, {
  type StandaloneProjectOption,
} from "@/components/workspace/StandaloneGenerator";
import {
  STANDALONE_TOOLS,
  STANDALONE_TOOL_ORDER,
  type StandaloneToolKey,
} from "@/components/workspace/standaloneGenerationCatalog";

/* ════════════════════════════════════════════════════════════
 * Types + helpers
 * ════════════════════════════════════════════════════════════ */

type Section = SectionKey;

interface MiniNode {
  id: string;
  type?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Background image for asset / generation nodes — lets the
   *  minimap show actual artwork at the node's position. */
  imageUrl?: string;
}
interface MiniEdge {
  source: string;
  target: string;
}

interface MonthBucket<T> {
  /** "April 2026" */
  label: string;
  /** Used for sort + the leading bullet circle. */
  ts: number;
  items: T[];
}

const FALLBACK_W = 300;
const FALLBACK_H = 320;

/** Pull the per-canvas graph for the minimap — picks the
 *  most-recently-updated canvas in the workspace. */
function pickPreviewCanvasId(
  workspaceId: string,
  canvases: ReadonlyArray<{ id: string; workspaceId: string; updatedAt: number }>,
): string | null {
  let best: { id: string; updatedAt: number } | null = null;
  for (const c of canvases) {
    if (c.workspaceId !== workspaceId) continue;
    if (!best || c.updatedAt > best.updatedAt) {
      best = { id: c.id, updatedAt: c.updatedAt };
    }
  }
  return best?.id ?? null;
}

/** "5 minutes ago" / "yesterday" / "Apr 12". */
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hours ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 14) return `${day} days ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      new Date(ts).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  });
}

/** "April 2026" — header for month-grouped grids. */
function monthLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** Bucket items by their month-of-update. Returns groups sorted
 *  newest-first; items within each group are sorted newest-first too. */
function groupByMonth<T extends { updatedAt: number }>(
  items: T[],
): MonthBucket<T>[] {
  const map = new Map<string, MonthBucket<T>>();
  for (const it of items) {
    const d = new Date(it.updatedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        label: monthLabel(it.updatedAt),
        ts: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
        items: [],
      };
      map.set(key, bucket);
    }
    bucket.items.push(it);
  }
  for (const b of map.values()) {
    b.items.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return Array.from(map.values()).sort((a, b) => b.ts - a.ts);
}

/* ════════════════════════════════════════════════════════════
 * Page
 * ════════════════════════════════════════════════════════════ */

const VALID_SECTIONS: Section[] = [
  "home",
  "spaces",
  "image_gen",
  "video_gen",
  "voice_gen",
  "image_to_3d",
];

const STANDALONE_SECTIONS = new Set<SectionKey>([
  "image_gen",
  "video_gen",
  "voice_gen",
  "image_to_3d",
]);

function isStandaloneSection(section: SectionKey): section is StandaloneToolKey {
  return STANDALONE_SECTIONS.has(section);
}

/* ─── Body class watchdog ─────────────────────────────────────
 *
 * A handful of canvas-only body classes (`ws-lightbox-open` toggled
 * by NodePreviewLightbox; `ws-resizing` toggled by node-resize
 * pointerdown handlers in AssetNode / WorkspaceToolNode) can stick
 * around if the canvas page unmounts mid-interaction — e.g. user
 * hits the browser back button while a resize drag is active and
 * the pointerup never reaches our window listener.
 *
 * Today none of those classes paint a black screen on the dashboard
 * (their CSS rules only target canvas-internal selectors), but the
 * blast radius is still wrong: a stuck `ws-resizing` would leave
 * the dashboard with a `cursor: nwse-resize !important` everywhere
 * until the next refresh. Force-clearing them on every dashboard
 * mount is a one-line guarantee that no canvas-side state can leak.
 *
 * Keep the list narrow on purpose — only `ws-*` classes that are
 * known to exist somewhere in the workspace tree. Don't blanket-
 * remove everything from <body>: theme/mode classes (.dark, .light)
 * are added by ThemeProvider and we'd nuke them.
 */
const STALE_BODY_CLASSES = ["ws-lightbox-open", "ws-resizing"];

const WorkspaceDashboardInner = () => {
  // Force-clear any canvas-only body classes that might have leaked
  // from the previous route. Runs once on mount — the cleanup return
  // is intentionally absent because we do NOT want to re-add them
  // when this dashboard unmounts (the canvas page manages its own
  // class lifecycle).
  useEffect(() => {
    document.body.classList.remove(...STALE_BODY_CLASSES);
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  // Initial section comes from `?section=…` (set by the AccountShell
  // sidebar when the user jumps in from /app/settings etc.). If the
  // param isn't a valid section we fall back to "home".
  const initialSection = (() => {
    const v = searchParams.get("section");
    return (v && VALID_SECTIONS.includes(v as Section)
      ? (v as Section)
      : "home");
  })();
  const [section, setSection] = useState<Section>(initialSection);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const projects = useWorkspaceStore((s) => s.projects);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const createProject = useWorkspaceStore((s) => s.createProject);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);
  const mergeServerProjects = useWorkspaceStore((s) => s.mergeServerProjects);
  const mergeServerWorkspaces = useWorkspaceStore(
    (s) => s.mergeServerWorkspaces,
  );

  const standaloneProjects = useMemo<StandaloneProjectOption[]>(
    () =>
      [...projects]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((project) => ({
          id: project.id,
          name: project.name,
          updatedAt: project.updatedAt,
        })),
    [projects],
  );

  const standaloneSyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      standaloneSyncRef.current = null;
      return;
    }
    if (standaloneSyncRef.current === user.id) return;
    standaloneSyncRef.current = user.id;

    let cancelled = false;
    (async () => {
      const PENDING_PUSH_WINDOW_MS = 60_000;
      const nowMs = Date.now();
      const serverProjects = await loadProjectsFromServer();
      if (cancelled) return;
      if (serverProjects) {
        const localProjectsBefore = useWorkspaceStore.getState().projects;
        const serverProjectIds = new Set(serverProjects.map((p) => p.id));
        const localOnlyProjects = localProjectsBefore.filter(
          (p) =>
            !serverProjectIds.has(p.id) &&
            nowMs - p.updatedAt < PENDING_PUSH_WINDOW_MS,
        );
        mergeServerProjects(serverProjects);
        for (const p of localOnlyProjects) void upsertProjectToServer(p, user.id);
      }
      const server = await loadWorkspacesFromServer();
      if (cancelled || !server) return;
      const localBefore = useWorkspaceStore.getState().workspaces;
      const serverIds = new Set(server.map((w) => w.id));
      const tombstones = useWorkspaceStore.getState().deletedWorkspaceIds;
      const localOnly = localBefore.filter(
        (w) =>
          !serverIds.has(w.id) &&
          !(w.id in tombstones) &&
          nowMs - w.updatedAt < PENDING_PUSH_WINDOW_MS,
      );
      mergeServerWorkspaces(server);
      for (const w of localOnly) void upsertWorkspaceToServer(w, user.id);

      const stateAfterSync = useWorkspaceStore.getState();
      const currentActive = stateAfterSync.activeProjectId;
      const currentActiveHasSpaces =
        !!currentActive &&
        stateAfterSync.workspaces.some((w) => w.projectId === currentActive);
      if (!currentActiveHasSpaces) {
        const preferredProjectId =
          server.find((w) => !!w.projectId)?.projectId ??
          stateAfterSync.projects.find((p) =>
            stateAfterSync.workspaces.some((w) => w.projectId === p.id),
          )?.id ??
          null;
        if (preferredProjectId && preferredProjectId !== currentActive) {
          setActiveProject(preferredProjectId);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, mergeServerProjects, mergeServerWorkspaces, setActiveProject, user?.id]);

  useEffect(() => {
    if (standaloneProjects.length === 0) {
      if (activeProjectId) setActiveProject(null);
      return;
    }
    if (
      !activeProjectId ||
      !standaloneProjects.some((project) => project.id === activeProjectId)
    ) {
      setActiveProject(standaloneProjects[0].id);
    }
  }, [activeProjectId, setActiveProject, standaloneProjects]);

  const handleCreateProject = () => {
    const nextName = prompt("Project name:", "Untitled project");
    if (nextName === null) return;
    const projectName = nextName.trim() || "Untitled project";
    const projectId = createProject(projectName);
    if (user?.id) {
      const meta = useWorkspaceStore.getState().projects.find((p) => p.id === projectId);
      if (meta) void upsertProjectToServer(meta, user.id);
    }
    toast.success(`Project "${projectName}" created`);
  };

  // Two-way bind URL ↔ state. When the user clicks a sidebar item we
  // also update the URL so a refresh / shared link lands on the same
  // section. We use `replace` to avoid stacking history entries for
  // every section toggle.
  useEffect(() => {
    const current = searchParams.get("section");
    if (section === "home") {
      // Strip the param entirely on the default section so the URL
      // stays clean.
      if (current !== null) {
        const next = new URLSearchParams(searchParams);
        next.delete("section");
        setSearchParams(next, { replace: true });
      }
    } else if (current !== section) {
      const next = new URLSearchParams(searchParams);
      next.set("section", section);
      setSearchParams(next, { replace: true });
    }
    // Intentionally only re-runs when `section` changes — we don't
    // want a `searchParams` change (e.g. another effect tweaking an
    // unrelated query key) to ricochet back into our state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-[hsl(0_0%_5%)] text-zinc-100"
      style={{ fontFamily: "'Prompt', system-ui, sans-serif" }}
    >
      <div className={isStandaloneSection(section) ? "hidden h-full lg:block" : "h-full"}>
        <WorkspaceSidebar
          active={section}
          onNavigate={setSection}
          onCreate={handleCreateProject}
        />
      </div>
      {isStandaloneSection(section) && mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            className="absolute inset-0 bg-black/65"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-10 h-full w-[228px] max-w-[84vw]">
            <WorkspaceSidebar
              active={section}
              onCreate={handleCreateProject}
              onNavigate={(next) => {
                setSection(next);
                setMobileSidebarOpen(false);
              }}
            />
            <button
              type="button"
              aria-label="Close sidebar"
              onClick={() => setMobileSidebarOpen(false)}
              className="absolute -right-12 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/[0.08] text-zinc-100 ring-1 ring-inset ring-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {section === "home" && (
          <HomeView
            onSection={setSection}
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={setActiveProject}
            onCreateProject={handleCreateProject}
          />
        )}
        {section === "spaces" && <SpacesView activeProjectId={activeProjectId} />}
        {isStandaloneSection(section) && (
          <StandaloneGenerator
            activeTool={section}
            onToolChange={(next) => setSection(next)}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            projects={standaloneProjects}
            activeProjectId={activeProjectId}
            onSelectProject={setActiveProject}
            onCreateProject={handleCreateProject}
          />
        )}
        {section !== "home" && section !== "spaces" && !isStandaloneSection(section) && (
          <Placeholder section={section} />
        )}
      </main>
    </div>
  );
};

/* Wrap the dashboard in an error boundary so a render-time throw
 * (lazy-chunk failure that escaped the Suspense retry, broken store
 * hydration, third-party hook assertion, etc.) shows the recoverable
 * "Workspace ขัดข้อง" card instead of leaving the user staring at the
 * near-black `--background` of a torn-down React tree. Tightly
 * scoped to the dashboard mount only — global error swallowing
 * elsewhere would hide real bugs.
 *
 * The boundary lives OUTSIDE WorkspaceDashboardInner so a fatal error
 * during the first render still has somewhere to land. The watchdog
 * useEffect for stale body classes runs INSIDE the inner component
 * because it's tied to the dashboard's own mount. */
const WorkspaceDashboard = () => (
  <WorkspaceErrorBoundary>
    <WorkspaceDashboardInner />
  </WorkspaceErrorBoundary>
);

export default WorkspaceDashboard;

/* ════════════════════════════════════════════════════════════
 * Sidebar — see `components/workspace/WorkspaceSidebar.tsx`
 *
 * The dashboard passes `onNavigate={setSection}` so sidebar clicks
 * drive its internal state (no router round-trip). Account /
 * Pricing pages omit `onNavigate` and let the sidebar router-
 * navigate to /app/workspace?section=…
 * ════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════
 * Home view — Magnific-style aggregator
 * ════════════════════════════════════════════════════════════ */

interface ProjectCardItem extends ProjectMeta {
  color: string;
  icon: LucideIcon;
  spaceCount: number;
}

const PROJECT_COLOR_SWATCHES = [
  "hsl(35 90% 55%)",
  "hsl(210 90% 60%)",
  "hsl(258 86% 64%)",
  "hsl(156 72% 42%)",
  "hsl(38 92% 56%)",
];

interface HomeTool {
  id: StandaloneToolKey;
  label: string;
  icon: LucideIcon;
  subtitle: string;
  accent: string;
}

const HOME_TOOLS: HomeTool[] = STANDALONE_TOOL_ORDER.map((key) => {
  const tool = STANDALONE_TOOLS[key];
  return {
    id: key,
    label: tool.title,
    icon: tool.icon,
    subtitle: tool.subtitle,
    accent: tool.accent,
  };
});

interface AcademyVideo {
  id: string;
  title: string;
  description: string;
  duration: string;
  src: string;
  poster: string;
}

const ACADEMY_VIDEOS: AcademyVideo[] = [
  {
    id: "scene-monitor-fn",
    title: "Scene Monitor FN tutorial",
    description: "Workflow tutorial for building a complete scene.",
    duration: "1:21",
    src: "/videos/academy/scene-monitor-fn.mp4",
    poster: "/videos/academy/scene-monitor-fn-poster.jpg",
  },
  {
    id: "full-screen",
    title: "Full Screen workflow",
    description: "Step-by-step full-screen workspace walkthrough.",
    duration: "1:05",
    src: "/videos/academy/full-screen.mp4",
    poster: "/videos/academy/full-screen-poster.jpg",
  },
];

const HomeView = ({
  onSection,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
}: {
  onSection: (s: Section) => void;
  projects: ProjectMeta[];
  activeProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onCreateProject: () => void;
}) => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const canvases = useWorkspaceStore((s) => s.canvases);
  const graphs = useWorkspaceStore((s) => s.graphs);
  // `projects` was previously a free reference inside the projectCards
  // useMemo below — never declared in this scope, never threaded as a
  // prop (the parent passes it but we ignore the prop). That blew up
  // at runtime as `ReferenceError: projects is not defined` and broke
  // the entire workspace shell (no way back to dashboard). Pulling
  // straight from the store mirrors how `workspaces`/`canvases`/`graphs`
  // are wired and avoids relying on a prop the type contract doesn't
  // even declare.
  const projects = useWorkspaceStore((s) => s.projects);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const mergeServerWorkspaces = useWorkspaceStore(
    (s) => s.mergeServerWorkspaces,
  );

  /* Same one-shot cross-device sync as SpacesView — Home is the
   * landing surface so most users hit it first; the dashboard sync
   * needs to run regardless of which tab is active. Guarded by
   * `syncedRef` against re-mount duplication. */
  const syncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      syncedRef.current = null;
      return;
    }
    if (syncedRef.current === user.id) return;
    syncedRef.current = user.id;

    let cancelled = false;
    (async () => {
      const PENDING_PUSH_WINDOW_MS = 60_000;
      const nowMs = Date.now();
      const server = await loadWorkspacesFromServer();
      if (cancelled || !server) return;
      const localBefore = useWorkspaceStore.getState().workspaces;
      const serverIds = new Set(server.map((w) => w.id));
      const tombstones = useWorkspaceStore.getState().deletedWorkspaceIds;
      const localOnly = localBefore.filter(
        (w) =>
          !serverIds.has(w.id) &&
          !(w.id in tombstones) &&
          nowMs - w.updatedAt < PENDING_PUSH_WINDOW_MS,
      );
      mergeServerWorkspaces(server);
      for (const w of localOnly) void upsertWorkspaceToServer(w, user.id);

      const serverCanvasIds = await listServerCanvasIds();
      if (cancelled || serverCanvasIds === null) return;
      const knownWorkspaceIds = new Set([
        ...serverIds,
        ...localOnly.map((w) => w.id),
      ]);
      const localGraphs = useWorkspaceStore.getState().graphs;
      for (const [canvasId, graph] of Object.entries(localGraphs)) {
        if (serverCanvasIds.has(canvasId)) continue;
        const hasContent =
          (graph.nodes?.length ?? 0) > 0 || (graph.edges?.length ?? 0) > 0;
        if (!hasContent) continue;
        if (!knownWorkspaceIds.has(graph.workspaceId)) continue;
        if (graph.workspaceId in tombstones) continue;
        void saveCanvasToServer(graph, user.id);
      }
    })().catch((err) => {
      console.warn("[workspace-home] sync failed:", err);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading, mergeServerWorkspaces]);

  const projectCards = useMemo<ProjectCardItem[]>(() => {
    const spaceCountByProject = new Map<string, number>();
    for (const workspace of workspaces) {
      if (!workspace.projectId) continue;
      spaceCountByProject.set(
        workspace.projectId,
        (spaceCountByProject.get(workspace.projectId) ?? 0) + 1,
      );
    }
    return [...projects]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((project, index) => ({
        ...project,
        color: PROJECT_COLOR_SWATCHES[index % PROJECT_COLOR_SWATCHES.length],
        icon: index === 0 ? Lock : Layers,
        spaceCount: spaceCountByProject.get(project.id) ?? 0,
      }));
  }, [projects, workspaces]);

  /* Recent spaces — top 6 by updatedAt with rendered minimaps so the
   * Home carousel previews are real (not placeholders). */
  const recentSpaces = useMemo(() => {
    return [...workspaces]
      .filter(
        (ws) =>
          !activeProjectId || !ws.projectId || ws.projectId === activeProjectId,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6)
      .map((ws) => buildSpaceCardData(ws, canvases, graphs));
  }, [activeProjectId, workspaces, canvases, graphs]);

  const handleNew = () => {
    const { workspaceId } = createWorkspace("Untitled space", activeProjectId);
    if (user?.id) {
      const state = useWorkspaceStore.getState();
      const meta = state.workspaces.find((w) => w.id === workspaceId);
      const project = meta?.projectId
        ? state.projects.find((p) => p.id === meta.projectId)
        : null;
      if (meta) {
        if (project) {
          void upsertProjectToServer(project, user.id).then(() =>
            upsertWorkspaceToServer(meta, user.id),
          );
        } else {
          void upsertWorkspaceToServer(meta, user.id);
        }
      }
    }
    navigate(`/app/workspace/${workspaceId}`);
  };

  const [newsTab, setNewsTab] = useState<"news" | "templates" | "academy">(
    "news",
  );

  return (
    <>
      <PageHeader title="Home" rightSlot={<UserMenu />} />

      <div className="ws-scroll-hide flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-5 md:px-6 lg:px-8 lg:pt-6">
          {/* ── Top trio: Projects · Spaces · Tools ───────────── */}
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.4fr_1fr]">
            <ProjectsCard
              projects={projectCards}
              activeProjectId={activeProjectId}
              onSelect={onSelectProject}
              onCreate={onCreateProject}
            />
            <SpacesShowcaseCard
              spaces={recentSpaces}
              onOpen={(id) => navigate(`/app/workspace/${id}`)}
              onNew={handleNew}
              onSeeAll={() => onSection("spaces")}
            />
            <ToolsCard tools={HOME_TOOLS} onOpen={(tool) => onSection(tool)} />
          </section>

          {/* ── My work jump-link ─────────────────────────────── */}
          <div className="mt-10 flex items-center justify-center">
            <button
              type="button"
              onClick={() => onSection("spaces")}
              className="flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-zinc-300 transition-colors hover:text-white lg:min-h-0"
            >
              My work
              <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
            </button>
          </div>

          <section className="mt-6">
            <div className="flex items-center justify-center border-b border-white/[0.06]">
              <div className="relative h-11 px-3 text-[12.5px] font-medium text-zinc-50 lg:h-9">
                Academy
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-t-sm bg-zinc-100" />
              </div>
            </div>

            <ul className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {ACADEMY_VIDEOS.map((video) => (
                <AcademyVideoTile key={video.id} video={video} />
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
};

const ProjectsCard = ({
  projects,
  activeProjectId,
  onSelect,
  onCreate,
}: {
  projects: ProjectCardItem[];
  activeProjectId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
}) => (
  <div className="rounded-2xl bg-[hsl(0_0%_7%)] p-4 ring-1 ring-inset ring-white/[0.06]">
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
        Projects
        <ChevronRight className="h-3 w-3 text-zinc-500" />
      </div>
      <button
        type="button"
        onClick={onCreate}
        title="New project"
        className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <Plus className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
      </button>
    </div>

    {projects.length === 0 ? (
      <button
        type="button"
        onClick={onCreate}
        className="flex min-h-[132px] w-full items-center justify-center rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02] px-4 text-[12px] text-zinc-500 transition-colors hover:border-white/[0.20] hover:bg-white/[0.04] hover:text-zinc-200"
      >
        + Create your first project
      </button>
    ) : (
      <ul className="flex flex-col gap-0.5">
        {projects.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              className={cn(
                "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 text-[12.5px] text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white lg:min-h-9",
                activeProjectId === p.id &&
                  "bg-white/[0.07] text-white ring-1 ring-inset ring-white/[0.08]",
              )}
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px]"
                style={{ background: p.color }}
              >
                <p.icon className="h-2.5 w-2.5 text-zinc-950" />
              </span>
              <span className="flex-1 truncate text-left">{p.name}</span>
              <span className="rounded bg-white/[0.05] px-1.5 py-px text-[9px] font-semibold text-zinc-400 ring-1 ring-inset ring-white/[0.06]">
                {p.spaceCount}
              </span>
              {activeProjectId === p.id ? (
                <span className="rounded bg-emerald-500/15 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                  Active
                </span>
              ) : (
                <Lock className="h-3 w-3 text-zinc-600" />
              )}
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
);

interface SpaceCardData {
  id: string;
  name: string;
  updatedAt: number;
  tabCount: number;
  nodes: MiniNode[];
  edges: MiniEdge[];
}

const SpacesShowcaseCard = ({
  spaces,
  onOpen,
  onNew,
  onSeeAll,
}: {
  spaces: SpaceCardData[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onSeeAll: () => void;
}) => (
  <div className="rounded-2xl bg-[hsl(0_0%_7%)] p-4 ring-1 ring-inset ring-white/[0.06]">
    <div className="mb-3 flex items-center justify-between">
      <button
        type="button"
        onClick={onSeeAll}
        className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:text-white"
      >
        Spaces
        <ChevronRight className="h-3 w-3 text-zinc-500" />
      </button>
      <button
        type="button"
        onClick={onNew}
        title="New space"
        className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white lg:h-8 lg:w-8"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>

    {spaces.length === 0 ? (
      <button
        type="button"
        onClick={onNew}
        className="flex min-h-[150px] w-full items-center justify-center rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02] px-4 text-[12px] text-zinc-500 transition-colors hover:border-white/[0.20] hover:bg-white/[0.04] hover:text-zinc-200"
      >
        + Create your first space
      </button>
    ) : (
      <div className="ws-scroll-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {spaces.map((ws) => (
          <button
            key={ws.id}
            type="button"
            onClick={() => onOpen(ws.id)}
            className="group/space flex w-[200px] shrink-0 flex-col gap-2 rounded-xl bg-[hsl(0_0%_4%)] p-1.5 ring-1 ring-inset ring-white/[0.05] transition-all hover:ring-white/[0.14] lg:w-[180px]"
          >
            <div className="aspect-[4/3] overflow-hidden rounded-lg bg-[hsl(0_0%_2%)]">
              <CanvasMinimap nodes={ws.nodes} edges={ws.edges} />
            </div>
            <div className="px-1 pb-0.5 text-left">
              <div className="truncate text-[11.5px] font-medium text-zinc-100">
                {ws.name}
              </div>
              <div className="text-[10px] text-zinc-500">
                {timeAgo(ws.updatedAt)}
              </div>
            </div>
          </button>
        ))}
      </div>
    )}
  </div>
);

const ToolsCard = ({
  tools,
  onOpen,
}: {
  tools: HomeTool[];
  onOpen: (tool: StandaloneToolKey) => void;
}) => (
  <div className="rounded-2xl bg-[hsl(0_0%_7%)] p-4 ring-1 ring-inset ring-white/[0.06]">
    <div className="mb-3 flex items-center justify-between">
      <button
        type="button"
        onClick={() => onOpen(tools[0]?.id ?? "image_gen")}
        className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:text-white"
      >
        Tools
        <ChevronRight className="h-3 w-3 text-zinc-500" />
      </button>
    </div>

    <ul className="flex flex-col gap-0.5">
      {tools.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onOpen(t.id)}
            className="group/tool flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 text-[12.5px] text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white lg:min-h-9"
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-md ring-1 ring-inset ring-white/[0.08]"
              style={{ background: t.accent }}
            >
              <t.icon className="h-3 w-3 text-zinc-950" />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate">{t.label}</span>
              <span className="block truncate text-[10px] text-zinc-600 group-hover/tool:text-zinc-400">
                {t.subtitle}
              </span>
            </span>
            <ChevronRight className="h-3 w-3 text-zinc-700 transition-colors group-hover/tool:text-zinc-300" />
          </button>
        </li>
      ))}
    </ul>
  </div>
);

const AcademyVideoTile = ({ video }: { video: AcademyVideo }) => (
  <li className="overflow-hidden rounded-2xl bg-[hsl(0_0%_7%)] ring-1 ring-inset ring-white/[0.06]">
    <video
      className="aspect-video w-full bg-black object-cover"
      controls
      playsInline
      preload="none"
      poster={video.poster}
      aria-label={video.title}
    >
      <source src={video.src} type="video/mp4" />
    </video>
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <h3 className="truncate text-[13px] font-semibold text-zinc-100">
          {video.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-[11.5px] leading-5 text-zinc-500">
          {video.description}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-zinc-400 ring-1 ring-inset ring-white/[0.08]">
        {video.duration}
      </span>
    </div>
  </li>
);

/* ════════════════════════════════════════════════════════════
 * Spaces view — full grid (the original workspace dashboard)
 * ════════════════════════════════════════════════════════════ */

/** Build minimap-friendly data for a single workspace. Reused by both
 *  HomeView (recent carousel) and SpacesView (full grid). */
function buildSpaceCardData(
  ws: { id: string; name: string; updatedAt: number },
  canvases: ReadonlyArray<{ id: string; workspaceId: string; updatedAt: number }>,
  graphs: Record<string, { nodes?: unknown[]; edges?: unknown[] } | undefined>,
): SpaceCardData {
  const wsCanvases = canvases.filter((c) => c.workspaceId === ws.id);
  const previewCanvasId = pickPreviewCanvasId(ws.id, canvases);
  const graph = previewCanvasId ? graphs[previewCanvasId] : null;

  const rawNodes = (graph?.nodes ?? []) as Array<Record<string, unknown>>;
  const nodes: MiniNode[] = rawNodes.map((n) => {
    const d = (n.data ?? {}) as Record<string, unknown>;
    let imageUrl: string | undefined;
    const nType = n.type as string | undefined;
    if (nType === "assetNode") {
      const ft = d.fieldType as string | undefined;
      if (ft === "image" && typeof d.previewUrl === "string") {
        imageUrl = d.previewUrl;
      } else if (typeof d.posterUrl === "string") {
        imageUrl = d.posterUrl;
      }
    } else {
      const gens = Array.isArray(d.generations)
        ? (d.generations as Array<Record<string, unknown>>)
        : [];
      for (const g of gens) {
        const url = typeof g.url === "string" ? g.url : "";
        if (!url) continue;
        if (
          /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(url) ||
          g.model_url
        ) {
          imageUrl = url;
          break;
        }
      }
    }
    const measured = (n.measured ?? null) as
      | { width?: number; height?: number }
      | null;
    const style = (n.style ?? null) as
      | { width?: number; height?: number }
      | null;
    const position = (n.position ?? null) as
      | { x?: number; y?: number }
      | null;
    return {
      id: String(n.id),
      type: nType,
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      w:
        measured?.width ??
        (n.width as number | undefined) ??
        style?.width ??
        FALLBACK_W,
      h:
        measured?.height ??
        (n.height as number | undefined) ??
        style?.height ??
        FALLBACK_H,
      imageUrl,
    };
  });
  const rawEdges = (graph?.edges ?? []) as Array<Record<string, unknown>>;
  const edges: MiniEdge[] = rawEdges.map((e) => ({
    source: String(e.source),
    target: String(e.target),
  }));
  return {
    id: ws.id,
    name: ws.name,
    updatedAt: ws.updatedAt,
    tabCount: wsCanvases.length,
    nodes,
    edges,
  };
}

const SpacesView = ({ activeProjectId }: { activeProjectId: string | null }) => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const canvases = useWorkspaceStore((s) => s.canvases);
  const graphs = useWorkspaceStore((s) => s.graphs);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
  const duplicateWorkspace = useWorkspaceStore((s) => s.duplicateWorkspace);
  const mergeServerWorkspaces = useWorkspaceStore(
    (s) => s.mergeServerWorkspaces,
  );

  /* Cross-device sync — same one-shot pattern used elsewhere on the
   * dashboard. Ref-guard avoids HMR / re-mount duplicates. The
   * server is the source of truth; local-only entries are pushed up,
   * tombstoned ids are filtered so deletions don't resurrect, and
   * orphaned canvases (parent workspace was deleted) are skipped. */
  const syncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      syncedRef.current = null;
      return;
    }
    if (syncedRef.current === user.id) return;
    syncedRef.current = user.id;

    let cancelled = false;
    (async () => {
      const PENDING_PUSH_WINDOW_MS = 60_000;
      const nowMs = Date.now();
      const server = await loadWorkspacesFromServer();
      if (cancelled || !server) return;
      const localBefore = useWorkspaceStore.getState().workspaces;
      const serverIds = new Set(server.map((w) => w.id));
      const tombstones = useWorkspaceStore.getState().deletedWorkspaceIds;
      const localOnly = localBefore.filter(
        (w) =>
          !serverIds.has(w.id) &&
          !(w.id in tombstones) &&
          nowMs - w.updatedAt < PENDING_PUSH_WINDOW_MS,
      );
      mergeServerWorkspaces(server);
      for (const w of localOnly) void upsertWorkspaceToServer(w, user.id);

      const serverCanvasIds = await listServerCanvasIds();
      if (cancelled || serverCanvasIds === null) return;
      const knownWorkspaceIds = new Set([
        ...serverIds,
        ...localOnly.map((w) => w.id),
      ]);
      const localGraphs = useWorkspaceStore.getState().graphs;
      for (const [canvasId, graph] of Object.entries(localGraphs)) {
        if (serverCanvasIds.has(canvasId)) continue;
        const hasContent =
          (graph.nodes?.length ?? 0) > 0 || (graph.edges?.length ?? 0) > 0;
        if (!hasContent) continue;
        if (!knownWorkspaceIds.has(graph.workspaceId)) continue;
        if (graph.workspaceId in tombstones) continue;
        void saveCanvasToServer(graph, user.id);
      }
    })().catch((err) => {
      console.warn("[workspace-spaces] sync failed:", err);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading, mergeServerWorkspaces]);

  const handleNew = () => {
    const { workspaceId } = createWorkspace("Untitled space", activeProjectId);
    if (user?.id) {
      const state = useWorkspaceStore.getState();
      const meta = state.workspaces.find((w) => w.id === workspaceId);
      const project = meta?.projectId
        ? state.projects.find((p) => p.id === meta.projectId)
        : null;
      if (meta) {
        if (project) {
          void upsertProjectToServer(project, user.id).then(() =>
            upsertWorkspaceToServer(meta, user.id),
          );
        } else {
          void upsertWorkspaceToServer(meta, user.id);
        }
      }
    }
    navigate(`/app/workspace/${workspaceId}`);
  };

  const buckets = useMemo(() => {
    return groupByMonth(
      [...workspaces]
        .filter(
          (ws) =>
            !activeProjectId ||
            !ws.projectId ||
            ws.projectId === activeProjectId,
        )
        .map((ws) => buildSpaceCardData(ws, canvases, graphs)),
    );
  }, [activeProjectId, workspaces, canvases, graphs]);

  const handleRename = (id: string, currentName: string) => {
    const next = prompt("Rename space:", currentName);
    if (next?.trim() && next.trim() !== currentName) {
      renameWorkspace(id, next.trim());
      if (user?.id) {
        const meta = useWorkspaceStore
          .getState()
          .workspaces.find((w) => w.id === id);
        if (meta) void upsertWorkspaceToServer(meta, user.id);
      }
    }
  };
  const handleDelete = (id: string, displayName: string) => {
    if (!confirm(`Delete “${displayName}”? This can't be undone.`)) return;
    deleteWorkspace(id);
    if (user?.id) void deleteWorkspaceFromServer(id);
  };

  /** Clone a space + every canvas inside. Store mutation is sync, the
   *  server push is async — we surface a "Duplicating…" toast that
   *  resolves into "Duplicated" once both legs are done. We push every
   *  canvas in parallel because Supabase upsert-by-id is well-suited
   *  for it and ordering doesn't matter to the UX (the toast lands
   *  whenever the slowest write finishes). */
  const handleDuplicate = (id: string) => {
    const toastId = toast.loading("Duplicating…");
    let newWorkspaceId: string;
    try {
      const res = duplicateWorkspace(id);
      newWorkspaceId = res.workspaceId;
    } catch (err) {
      console.error("[workspace] duplicate failed:", err);
      toast.error("Couldn't duplicate this space.", { id: toastId });
      return;
    }
    // Source vanished — duplicateWorkspace returns the source id
    // unchanged in that case, so bail with an error toast.
    if (newWorkspaceId === id) {
      toast.error("Couldn't duplicate this space.", { id: toastId });
      return;
    }

    const newMeta = useWorkspaceStore
      .getState()
      .workspaces.find((w) => w.id === newWorkspaceId);
    const newName = newMeta?.name ?? "Duplicated space";

    if (user?.id) {
      void (async () => {
        try {
          if (newMeta) await upsertWorkspaceToServer(newMeta, user.id);
          const newCanvases = useWorkspaceStore
            .getState()
            .canvases.filter((c) => c.workspaceId === newWorkspaceId);
          const graphs = useWorkspaceStore.getState().graphs;
          await Promise.all(
            newCanvases.map((c) =>
              graphs[c.id]
                ? saveCanvasToServer(graphs[c.id], user.id)
                : Promise.resolve(),
            ),
          );
          toast.success(`Duplicated as “${newName}”`, {
            id: toastId,
            action: {
              label: "Open",
              onClick: () => navigate(`/app/workspace/${newWorkspaceId}`),
            },
          });
        } catch (err) {
          console.warn("[workspace] duplicate server push failed:", err);
          // Local copy is already there — surface a soft warning, not
          // a hard error. The user can still open the duplicate; the
          // canvas's own autosave will retry the server push.
          toast.warning(`Duplicated as “${newName}” (offline)`, {
            id: toastId,
            description: "Server sync failed — try again from the canvas.",
            action: {
              label: "Open",
              onClick: () => navigate(`/app/workspace/${newWorkspaceId}`),
            },
          });
        }
      })();
    } else {
      // Guest — no server push, resolve the toast right away.
      toast.success(`Duplicated as “${newName}”`, {
        id: toastId,
        action: {
          label: "Open",
          onClick: () => navigate(`/app/workspace/${newWorkspaceId}`),
        },
      });
    }
  };

  const handleOpen = (id: string) => navigate(`/app/workspace/${id}`);

  // Tab state for the Magnific-style segmented control. Only "My
  // spaces" is wired today — Shared and Templates are placeholders
  // we'll hook up once those features land. Switching to one of them
  // shows an inline empty-state so the click isn't a dead-end.
  const [tab, setTab] = useState<"mine" | "shared" | "templates">("mine");

  return (
    <>
      {/* Slim chrome bar — keeps the workspace selector + user menu
          visible. Title moved to the hero block below per the new
          Magnific-style layout. */}
      <PageHeader
        title=""
        rightSlot={
          <div className="flex items-center gap-3">
            <UserMenu />
          </div>
        }
      />

      <div className="ws-scroll-hide flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 md:px-6 lg:px-8 lg:pt-10">
          {/* ── Hero header — big title + subtitle ─────────────── */}
          <header className="mb-8">
            <h1 className="text-[40px] font-bold leading-none tracking-tight text-zinc-50 md:text-[48px] lg:text-[56px]">
              Spaces
            </h1>
            <p className="mt-3 text-[14px] text-zinc-400">
              Build node-based generative workflows and bring your ideas to life.
            </p>
          </header>

          {/* ── Tabs row — left: tab switcher / right: actions ──
              Mirrors the Magnific layout exactly — segmented tabs on
              the left, "+ New space" + filter / favourites / search
              icon row on the right. */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <SpacesTabs tab={tab} onChange={setTab} />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleNew}
                className="flex h-11 items-center gap-1.5 rounded-lg bg-white/[0.06] px-3.5 text-[13px] font-medium text-zinc-100 ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-white/[0.12] lg:h-9"
              >
                <Plus className="h-3.5 w-3.5" /> New space
              </button>
              <SpacesIconBtn icon={Heart} title="Favorites" />
              <SpacesIconBtn icon={SlidersHorizontal} title="Filter" />
              <SpacesIconBtn icon={Search} title="Search" />
            </div>
          </div>

          {/* ── Content — only "My spaces" has data today; Shared /
              Templates render an empty placeholder so the tabs aren't
              dead clicks. */}
          {tab !== "mine" ? (
            <EmptyState
              title={tab === "shared" ? "No shared spaces yet" : "No templates yet"}
              hint={
                tab === "shared"
                  ? "Spaces shared with you by teammates will show up here."
                  : "Pre-built starting points for common workflows are coming soon."
              }
            />
          ) : buckets.length === 0 ? (
            <EmptyState
              title="No spaces yet"
              hint="Create your first space to start chaining AI tools."
              cta={{ label: "New space", onClick: handleNew }}
            />
          ) : (
            buckets.map((b) => (
              <section key={b.label} className="mb-10">
                <MonthHeader label={b.label} />
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {b.items.map((ws) => (
                    <SpaceCard
                      key={ws.id}
                      ws={ws}
                      onOpen={() => handleOpen(ws.id)}
                      onRename={() => handleRename(ws.id, ws.name)}
                      onDuplicate={() => handleDuplicate(ws.id)}
                      onDelete={() => handleDelete(ws.id, ws.name)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </>
  );
};

/* ─── Spaces tab switcher (My spaces / Shared / Templates) ───
 * Pill-style segmented control matching the Magnific reference —
 * active pill gets a soft white surface + subtle ring, inactive
 * pills are just text with a hover. Three tabs total; only "mine"
 * is wired up today. */
const SpacesTabs = ({
  tab,
  onChange,
}: {
  tab: "mine" | "shared" | "templates";
  onChange: (t: "mine" | "shared" | "templates") => void;
}) => {
  const items: { key: "mine" | "shared" | "templates"; label: string; icon: LucideIcon }[] = [
    { key: "mine", label: "My spaces", icon: UserCircle2 },
    { key: "shared", label: "Shared", icon: Users },
    { key: "templates", label: "Templates", icon: LayoutGrid },
  ];
  return (
    <div className="inline-flex rounded-xl bg-white/[0.03] p-1 ring-1 ring-inset ring-white/[0.05]">
      {items.map((it) => {
        const active = tab === it.key;
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={cn(
              "flex h-11 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium transition-colors lg:h-8",
              active
                ? "bg-white/[0.08] text-zinc-50 ring-1 ring-inset ring-white/[0.06]"
                : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {it.label}
          </button>
        );
      })}
    </div>
  );
};

/* Square icon button used in the actions row next to "+ New space".
   Matches the height of the New-space button (h-9) so they line up. */
const SpacesIconBtn = ({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/[0.03] text-zinc-400 ring-1 ring-inset ring-white/[0.05] transition-colors hover:bg-white/[0.08] hover:text-zinc-100 lg:h-9 lg:w-9"
  >
    <Icon className="h-3.5 w-3.5" />
  </button>
);

const SpaceToolbar = ({ onNew }: { onNew: () => void }) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={onNew}
      className="flex items-center gap-1.5 rounded-md bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-zinc-100 ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-white/[0.1]"
    >
      <Plus className="h-3.5 w-3.5" /> New space
    </button>
    <SegmentDivider />
    <ChromePill icon={ChevronDown} label="Project" />
    <ChromeIconBtn icon={List} title="List view" />
    <ChromeIconBtn icon={LayoutGrid} title="Grid view" active />
    <ChromeIconBtn icon={Heart} title="Favorites" />
    <ChromeIconBtn icon={Search} title="Search" />
  </div>
);

const SpaceCard = ({
  ws,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  ws: SpaceCardData;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) => (
  <li
    className={cn(
      "group relative cursor-pointer overflow-hidden rounded-2xl bg-[hsl(0_0%_7%)] ring-1 ring-inset ring-white/[0.06]",
      "transition-all hover:ring-white/[0.14] hover:shadow-[0_18px_40px_-20px_hsl(0_0%_0%/0.7)]",
    )}
  >
    <button
      type="button"
      onClick={onOpen}
      className="block w-full text-left"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-[hsl(0_0%_4%)]">
        <CanvasMinimap nodes={ws.nodes} edges={ws.edges} />
      </div>

      <div className="px-3.5 py-3">
        <div className="truncate text-[13px] font-semibold leading-tight text-zinc-50">
          {ws.name}
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">
          {timeAgo(ws.updatedAt)}
        </div>
      </div>
    </button>

    <div className="pointer-events-auto absolute right-2 top-2 flex gap-1 opacity-100 transition-opacity lg:pointer-events-none lg:opacity-0 lg:group-hover:pointer-events-auto lg:group-hover:opacity-100">
      <ActionButton title="Rename" onClick={(e) => { e.stopPropagation(); onRename(); }} icon={Pencil} />
      <ActionButton title="Duplicate" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} icon={Copy} />
      <ActionButton title="Delete" danger onClick={(e) => { e.stopPropagation(); onDelete(); }} icon={Trash2} />
    </div>
  </li>
);

const ActionButton = ({
  title,
  onClick,
  icon: Icon,
  danger,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  icon: LucideIcon;
  danger?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={cn(
      "flex h-10 w-10 items-center justify-center rounded-md bg-black/65 text-zinc-300 backdrop-blur transition-colors hover:bg-black/85 hover:text-white lg:h-auto lg:w-auto lg:p-1.5",
      danger && "hover:text-red-400",
    )}
  >
    <Icon className="h-3.5 w-3.5" />
  </button>
);

/* ════════════════════════════════════════════════════════════
 * Page chrome — header, month bullets, empty state, etc.
 * ════════════════════════════════════════════════════════════ */

const PageHeader = ({
  title,
  rightSlot,
}: {
  title: string;
  rightSlot?: React.ReactNode;
}) => (
  <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/5 px-4 md:px-6 lg:h-12 lg:px-8">
    <h1 className="text-[14px] font-medium tracking-tight text-zinc-300">
      {title}
    </h1>
    {rightSlot}
  </div>
);

const MonthHeader = ({ label }: { label: string }) => (
  <div className="mb-3 flex items-center gap-2 text-[12.5px] text-zinc-400">
    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full ring-1 ring-inset ring-white/15">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
    </span>
    {label}
  </div>
);

const ChromePill = ({
  icon: Icon,
  label,
}: {
  icon?: LucideIcon;
  label: string;
}) => (
  <button
    type="button"
    className="flex h-8 items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 text-[11.5px] text-zinc-300 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
  >
    <span>{label}</span>
    {Icon && <Icon className="h-3.5 w-3.5 text-zinc-500" />}
  </button>
);

const ChromeIconBtn = ({
  icon: Icon,
  title,
  active,
}: {
  icon: LucideIcon;
  title: string;
  active?: boolean;
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    className={cn(
      "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
      active
        ? "bg-white/[0.08] text-zinc-100 ring-1 ring-inset ring-white/[0.08]"
        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
    )}
  >
    <Icon className="h-3.5 w-3.5" />
  </button>
);

const SegmentDivider = () => <div className="mx-1 h-5 w-px bg-white/10" />;

const EmptyState = ({
  title,
  hint,
  cta,
}: {
  title: string;
  hint: string;
  cta?: { label: string; onClick: () => void };
}) => (
  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-14 text-center md:px-10 md:py-20">
    <div className="text-[15px] font-semibold text-zinc-200">{title}</div>
    <p className="mt-2 text-[12.5px] text-zinc-500">{hint}</p>
    {cta && (
      <button
        type="button"
        onClick={cta.onClick}
        className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-md bg-white/[0.08] px-4 text-[12px] font-medium text-zinc-100 ring-1 ring-inset ring-white/[0.10] transition-colors hover:bg-white/[0.12] lg:min-h-0 lg:py-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        {cta.label}
      </button>
    )}
  </div>
);

const SECTION_LABELS: Record<Section, string> = {
  home: "Home",
  search: "Search",
  spaces: "Spaces",
  image_gen: STANDALONE_TOOLS.image_gen.title,
  video_gen: STANDALONE_TOOLS.video_gen.title,
  voice_gen: STANDALONE_TOOLS.voice_gen.title,
  image_to_3d: STANDALONE_TOOLS.image_to_3d.title,
  community: "Community",
  projects: "Projects",
  tools: "All tools",
  stock: "Stock",
  assistant: "Assistant",
};

const Placeholder = ({ section }: { section: Section }) => (
  <>
    <PageHeader title={SECTION_LABELS[section]} rightSlot={<UserMenu />} />
    <div className="flex flex-1 items-center justify-center p-12">
      <EmptyState
        title="Coming soon"
        hint="This section is not connected yet."
      />
    </div>
  </>
);

/* ════════════════════════════════════════════════════════════
 * Canvas minimap — SVG snapshot with real images at node positions
 * ════════════════════════════════════════════════════════════ */

const NODE_FILL: Record<string, string> = {
  textNode: "hsl(220 15% 22%)",
  groupNode: "transparent",
};
const TOOL_FILL = "hsl(220 15% 18%)";

const CanvasMinimap = ({
  nodes,
  edges,
}: {
  nodes: MiniNode[];
  edges: MiniEdge[];
}) => {
  if (nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-zinc-700">
        <Layers className="h-12 w-12" />
      </div>
    );
  }

  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h));
  const span = Math.max(maxX - minX, maxY - minY);
  const pad = span * 0.06;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = maxX - minX + pad * 2;
  const vbH = maxY - minY + pad * 2;

  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const centerOf = (n: MiniNode) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

  const strokeW = Math.max(span * 0.004, 1);
  const nodeStroke = Math.max(span * 0.0015, 0.5);
  const cornerR = Math.max(span * 0.018, 6);

  return (
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      style={{ background: "hsl(0 0% 4%)" }}
    >
      <defs>
        <pattern
          id="mm-dots"
          width={Math.max(span * 0.025, 8)}
          height={Math.max(span * 0.025, 8)}
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx={0}
            cy={0}
            r={Math.max(span * 0.0012, 0.4)}
            fill="hsl(0 0% 11%)"
          />
        </pattern>
      </defs>
      <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="url(#mm-dots)" />

      <g stroke="hsl(258 60% 65%)" strokeOpacity={0.55} strokeWidth={strokeW} fill="none">
        {edges.map((e, i) => {
          const a = byId.get(e.source);
          const b = byId.get(e.target);
          if (!a || !b) return null;
          const A = centerOf(a);
          const B = centerOf(b);
          const dx = B.x - A.x;
          const offset = Math.max(Math.abs(dx) * 0.4, span * 0.02);
          return (
            <path
              key={i}
              d={`M ${A.x},${A.y} C ${A.x + offset},${A.y} ${B.x - offset},${B.y} ${B.x},${B.y}`}
            />
          );
        })}
      </g>

      <g>
        {nodes.map((n) => {
          const isGroup = n.type === "groupNode";
          const fill = NODE_FILL[n.type ?? ""] ?? TOOL_FILL;

          if (n.imageUrl) {
            const clipId = `mm-clip-${n.id}`;
            return (
              <g key={n.id}>
                <defs>
                  <clipPath id={clipId}>
                    <rect
                      x={n.x}
                      y={n.y}
                      width={n.w}
                      height={n.h}
                      rx={cornerR}
                      ry={cornerR}
                    />
                  </clipPath>
                </defs>
                <image
                  href={n.imageUrl}
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={n.h}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#${clipId})`}
                />
                <rect
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={n.h}
                  rx={cornerR}
                  ry={cornerR}
                  fill="none"
                  stroke="hsl(0 0% 100% / 0.14)"
                  strokeWidth={nodeStroke}
                />
              </g>
            );
          }

          return (
            <rect
              key={n.id}
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx={cornerR}
              ry={cornerR}
              fill={isGroup ? "transparent" : fill}
              stroke={isGroup ? "hsl(220 15% 28%)" : "hsl(0 0% 100% / 0.10)"}
              strokeWidth={nodeStroke}
            />
          );
        })}
      </g>
    </svg>
  );
};
