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

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import useDocumentTitle from "@/hooks/useDocumentTitle";
import WorkspaceErrorBoundary from "@/components/workspace/WorkspaceErrorBoundary";
import {
  loadProjectsFromServer,
  loadWorkspacesFromServer,
  upsertProjectToServer,
  deleteProjectFromServer,
  upsertWorkspaceToServer,
  deleteWorkspaceFromServer,
  listServerCanvasIds,
  loadLatestCanvasPreviewsByWorkspaceIds,
  saveCanvasToServer,
  type ServerWriteResult,
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
  GraduationCap,
  WalletCards,
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
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DEFAULT_PROJECT_NAME,
  useWorkspaceStore,
  type ProjectMeta,
  type WorkspaceMeta,
} from "@/store/useWorkspaceStore";
import { CreateProjectDialog } from "@/components/workspace/CreateProjectDialog";
import { UserMenu } from "@/components/workspace/UserMenu";
import WorkspaceSidebar, {
  type SectionKey,
} from "@/components/workspace/WorkspaceSidebar";
import StandaloneGenerator, {
  type StandaloneProjectOption,
} from "@/components/workspace/StandaloneGenerator";
import StockView from "@/components/workspace/StockView";
import AssetsView from "@/components/workspace/AssetsView";
import {
  STANDALONE_TOOLS,
  STANDALONE_TOOL_ORDER,
  type StandaloneToolKey,
} from "@/components/workspace/standaloneGenerationCatalog";
import { useEducationPresence } from "@/hooks/useEducationPresence";
import {
  useActiveClass,
  useEducationStudentLock,
  useIsOrgAdmin,
  useUserClassMemberships,
  type ClassMembershipInfo,
} from "@/hooks/useIsOrgUser";
import ActiveClassPicker from "@/components/ActiveClassPicker";

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

type PreviewMediaKind = "image" | "video";

interface PreviewMedia {
  url: string;
  kind: PreviewMediaKind;
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
const PREVIEW_HYDRATION_BATCH_SIZE = 12;
const PREVIEW_HYDRATION_BATCH_DELAY_MS = 90;
const MINIMAP_NODE_LIMIT = 80;
const MINIMAP_EDGE_LIMIT = 96;
const MINIMAP_IMAGE_LIMIT = 18;
const SPACE_PREVIEW_MEDIA_LIMIT = 6;
const PREVIEW_CACHE_PREFIX = "mf:workspace-preview:v2:";
const PREVIEW_CACHE_INDEX_KEY = `${PREVIEW_CACHE_PREFIX}index`;
const PREVIEW_CACHE_MAX_ITEMS = 80;
const PREVIEW_CACHE_MAX_DATA_URI_LENGTH = 240_000;

type PreviewCanvasMeta = {
  id: string;
  workspaceId: string;
  updatedAt: number;
};

function buildCanvasIndex(
  canvases: ReadonlyArray<PreviewCanvasMeta>,
): Map<string, PreviewCanvasMeta[]> {
  const index = new Map<string, PreviewCanvasMeta[]>();
  for (const canvas of canvases) {
    const list = index.get(canvas.workspaceId);
    if (list) {
      list.push(canvas);
    } else {
      index.set(canvas.workspaceId, [canvas]);
    }
  }
  for (const list of index.values()) {
    list.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return index;
}

async function persistNewWorkspaceBundle(
  workspaceId: string,
  canvasId: string,
  userId: string,
): Promise<ServerWriteResult> {
  const state = useWorkspaceStore.getState();
  const meta = state.workspaces.find((workspace) => workspace.id === workspaceId);
  if (!meta) return { ok: false, error: "Workspace metadata not found" };

  const project = meta.projectId
    ? state.projects.find((item) => item.id === meta.projectId)
    : null;
  if (project && (!project.ownerId || project.ownerId === userId)) {
    const projectResult = await upsertProjectToServer(project, userId);
    if (!projectResult.ok) return projectResult;
  }

  const workspaceResult = await upsertWorkspaceToServer(meta, userId);
  if (!workspaceResult.ok) return workspaceResult;

  const graph = useWorkspaceStore.getState().graphs[canvasId];
  if (!graph) return { ok: false, error: "Canvas graph not found" };
  return saveCanvasToServer(graph, userId);
}

/** Pull the per-canvas graph for the minimap — picks the
 *  most-recently-updated canvas in the workspace. */
function pickPreviewCanvasId(
  workspaceId: string,
  canvasIndex: Map<string, PreviewCanvasMeta[]>,
  graphs?: Record<string, { nodes?: unknown[]; edges?: unknown[] } | undefined>,
): string | null {
  const matches = canvasIndex.get(workspaceId) ?? [];
  if (matches.length === 0) return null;
  if (!graphs) return matches[0].id;

  const withContent = matches.find((c) => {
    const graph = graphs[c.id];
    return (graph?.nodes?.length ?? 0) > 0;
  });
  return withContent?.id ?? matches[0].id;
}

function graphHasPreviewContent(
  graph: { nodes?: unknown[]; edges?: unknown[] } | undefined,
): boolean {
  return (graph?.nodes?.length ?? 0) > 0;
}

function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function readPreviewCache(cacheKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREVIEW_CACHE_PREFIX + stableHash(cacheKey));
  } catch {
    return null;
  }
}

function writePreviewCache(cacheKey: string, dataUri: string): void {
  if (typeof window === "undefined") return;
  if (dataUri.length > PREVIEW_CACHE_MAX_DATA_URI_LENGTH) return;

  const storageKey = PREVIEW_CACHE_PREFIX + stableHash(cacheKey);
  try {
    window.localStorage.setItem(storageKey, dataUri);
    const raw = window.localStorage.getItem(PREVIEW_CACHE_INDEX_KEY);
    const existing = raw ? (JSON.parse(raw) as unknown) : [];
    const index = Array.isArray(existing)
      ? existing.filter((item): item is string => typeof item === "string")
      : [];
    const next = [storageKey, ...index.filter((item) => item !== storageKey)];
    for (const oldKey of next.slice(PREVIEW_CACHE_MAX_ITEMS)) {
      window.localStorage.removeItem(oldKey);
    }
    window.localStorage.setItem(
      PREVIEW_CACHE_INDEX_KEY,
      JSON.stringify(next.slice(0, PREVIEW_CACHE_MAX_ITEMS)),
    );
  } catch {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage quota / privacy mode failures. The UI can still render live.
    }
  }
}

function selectMinimapNodes(nodes: MiniNode[]): MiniNode[] {
  if (nodes.length <= MINIMAP_NODE_LIMIT) return nodes;

  const originalIndex = new Map(nodes.map((node, index) => [node.id, index] as const));
  const imageNodes = nodes
    .filter((node) => Boolean(node.imageUrl))
    .slice(0, MINIMAP_IMAGE_LIMIT);
  const selectedIds = new Set(imageNodes.map((node) => node.id));
  const remainingSlots = Math.max(MINIMAP_NODE_LIMIT - imageNodes.length, 0);
  const shapeNodes = nodes
    .filter((node) => !selectedIds.has(node.id))
    .slice(0, remainingSlots);

  return [...imageNodes, ...shapeNodes].sort(
    (a, b) => (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0),
  );
}

function inferPreviewMediaKind(
  url: string,
  key = "",
  explicitType?: unknown,
): PreviewMediaKind | null {
  const value = url.trim();
  if (!value || value.startsWith("blob:")) return null;
  const type = String(explicitType ?? "").toLowerCase();
  if (/audio|model|glb|gltf|obj|text/.test(type)) return null;
  if (/\.(mp3|wav|m4a|aac|flac|glb|gltf|obj|fbx|zip)(\?|#|$)/i.test(value)) return null;
  if (type === "video" || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(value)) {
    return "video";
  }
  if (
    type === "image" ||
    value.startsWith("data:image/") ||
    /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(value) ||
    /poster|thumb|thumbnail|preview|image|frame|render|cover|file|url/i.test(key)
  ) {
    return "image";
  }
  if (/\/storage\/v1\/object\//i.test(value) && !/\.(mp3|wav|glb|gltf|obj)(\?|#|$)/i.test(value)) {
    return "image";
  }
  return null;
}

function pushPreviewMedia(
  out: PreviewMedia[],
  seen: Set<string>,
  key: string,
  value: unknown,
  explicitType?: unknown,
) {
  if (typeof value !== "string") return;
  const url = value.trim();
  if (!url || seen.has(url)) return;
  const kind = inferPreviewMediaKind(url, key, explicitType);
  if (!kind) return;
  seen.add(url);
  out.push({ url, kind });
}

function collectPreviewMediaFromNodeData(
  data: Record<string, unknown>,
  nodeType?: string,
): PreviewMedia[] {
  const media: PreviewMedia[] = [];
  const seen = new Set<string>();
  const add = (key: string, value: unknown, explicitType?: unknown) => {
    if (media.length >= SPACE_PREVIEW_MEDIA_LIMIT) return;
    pushPreviewMedia(media, seen, key, value, explicitType);
  };

  const generations = Array.isArray(data.generations)
    ? (data.generations as Array<Record<string, unknown>>)
    : [];
  for (const generation of generations) {
    add("rendered_image_url", generation.rendered_image_url, "image");
    add("posterUrl", generation.posterUrl, "image");
    add("poster_url", generation.poster_url, "image");
    add("thumbnailUrl", generation.thumbnailUrl, "image");
    add("thumbnail_url", generation.thumbnail_url, "image");
    add("previewUrl", generation.previewUrl, generation.type);
    add("preview_url", generation.preview_url, generation.type);
    add("image_url", generation.image_url, "image");
    add("output_image", generation.output_image, "image");
    add("url", generation.url, generation.type);
    add("video_url", generation.video_url, "video");
    add("output_video", generation.output_video, "video");
  }

  const outputs =
    data.outputs && typeof data.outputs === "object"
      ? (data.outputs as Record<string, unknown>)
      : null;
  if (outputs) {
    add("image_url", outputs.image_url, "image");
    add("output_image", outputs.output_image, "image");
    add("result_url", outputs.result_url);
    add("url", outputs.url);
    add("video_url", outputs.video_url, "video");
    add("output_video", outputs.output_video, "video");
  }

  add("posterUrl", data.posterUrl, "image");
  add("poster_url", data.poster_url, "image");
  add("thumbnailUrl", data.thumbnailUrl, "image");
  add("thumbnail_url", data.thumbnail_url, "image");
  add("previewUrl", data.previewUrl, nodeType === "assetNode" ? data.fieldType ?? "image" : data.fieldType);
  add("preview_url", data.preview_url, data.fieldType);
  add("imageUrl", data.imageUrl, "image");
  add("image_url", data.image_url, "image");
  add("resultUrl", data.resultUrl);
  add("result_url", data.result_url);
  add("outputUrl", data.outputUrl);
  add("output_url", data.output_url);
  add("fileUrl", data.fileUrl);
  add("file_url", data.file_url);
  add("videoUrl", data.videoUrl, "video");
  add("video_url", data.video_url, "video");
  add("outputVideo", data.outputVideo, "video");
  add("output_video", data.output_video, "video");

  if (Array.isArray(data.reference_image_urls)) {
    for (const url of data.reference_image_urls) add("reference_image_urls", url, "image");
  }
  add("frontal_image_url", data.frontal_image_url, "image");

  return media;
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
  "projects",
  "history",
  "assets",
  "stock",
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
  const { t, t: i18n } = useLanguage();
  useDocumentTitle("Workspace — MediaForge");
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
  const isOrgAdmin = useIsOrgAdmin();
  const educationStudentLock = useEducationStudentLock();
  const educationLockedStudent = !isOrgAdmin && educationStudentLock.locked;
  const navigate = useNavigate();
  const projects = useWorkspaceStore((s) => s.projects);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const createProject = useWorkspaceStore((s) => s.createProject);
  const deleteProject = useWorkspaceStore((s) => s.deleteProject);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);
  const mergeServerProjects = useWorkspaceStore((s) => s.mergeServerProjects);
  const mergeServerWorkspaces = useWorkspaceStore(
    (s) => s.mergeServerWorkspaces,
  );

  useEducationPresence({
    enabled: !authLoading && Boolean(user?.id),
    userId: user?.id ?? null,
    projectId: activeProjectId ?? null,
    workspaceId: null,
    canvasId: null,
    activity: `Workspace ${section}`,
  });

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
  const projectIdsWithSpaces = useMemo(() => {
    const knownProjectIds = new Set(projects.map((project) => project.id));
    const ids = new Set<string>();
    for (const workspace of workspaces) {
      if (workspace.projectId && knownProjectIds.has(workspace.projectId)) {
        ids.add(workspace.projectId);
      }
    }
    return ids;
  }, [projects, workspaces]);

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
        const localState = useWorkspaceStore.getState();
        const serverProjectIds = new Set(serverProjects.map((p) => p.id));
        const hasOwnedServerDefaultProject = serverProjects.some(
          (p) => p.ownerId === user.id && p.name === DEFAULT_PROJECT_NAME,
        );
        const projectHasOwnedWork = (projectId: string) =>
          localState.workspaces.some(
            (workspace) =>
              workspace.projectId === projectId &&
              (!workspace.ownerId || workspace.ownerId === user.id),
          ) ||
          localState.canvases.some(
            (canvas) =>
              canvas.projectId === projectId &&
              (!canvas.ownerId || canvas.ownerId === user.id),
          );
        const localOnlyProjects = localProjectsBefore.filter(
          (p) =>
            !educationLockedStudent &&
            (!p.ownerId || p.ownerId === user.id) &&
            !serverProjectIds.has(p.id) &&
            (
              p.name !== DEFAULT_PROJECT_NAME ||
              (!hasOwnedServerDefaultProject && projectHasOwnedWork(p.id))
            ) &&
            nowMs - p.updatedAt < PENDING_PUSH_WINDOW_MS,
        );
        mergeServerProjects(serverProjects);
        for (const p of localOnlyProjects) void upsertProjectToServer(p, user.id);
        const defaultProject = useWorkspaceStore
          .getState()
          .projects.find((p) => (!p.ownerId || p.ownerId === user.id) && p.name === DEFAULT_PROJECT_NAME);
        if (
          defaultProject &&
          !hasOwnedServerDefaultProject &&
          !serverProjectIds.has(defaultProject.id) &&
          projectHasOwnedWork(defaultProject.id)
        ) {
          void upsertProjectToServer(defaultProject, user.id);
        }
      }
      const server = await loadWorkspacesFromServer();
      if (cancelled || !server) return;
      const localBefore = useWorkspaceStore.getState().workspaces;
      const serverIds = new Set(server.map((w) => w.id));
      const tombstones = useWorkspaceStore.getState().deletedWorkspaceIds;
        const localOnly = localBefore.filter(
          (w) =>
            !educationLockedStudent &&
            (!w.ownerId || w.ownerId === user.id) &&
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
        const knownProjectIds = new Set(stateAfterSync.projects.map((p) => p.id));
        const preferredProjectId =
          server.find((w) => !!w.projectId && knownProjectIds.has(w.projectId))?.projectId ??
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
  }, [authLoading, educationLockedStudent, mergeServerProjects, mergeServerWorkspaces, setActiveProject, user?.id]);

  useEffect(() => {
    if (standaloneProjects.length === 0) {
      if (activeProjectId) setActiveProject(null);
      return;
    }
    const activeProjectExists = standaloneProjects.some((project) => project.id === activeProjectId);
    const activeProjectHasSpaces = Boolean(activeProjectId && projectIdsWithSpaces.has(activeProjectId));
    if (!activeProjectExists || (!activeProjectHasSpaces && projectIdsWithSpaces.size > 0)) {
      const preferred =
        standaloneProjects.find((project) => projectIdsWithSpaces.has(project.id)) ??
        standaloneProjects[0];
      setActiveProject(preferred.id);
    }
  }, [activeProjectId, projectIdsWithSpaces, setActiveProject, standaloneProjects]);

  /* "Create project" dialog state. We replaced the native browser
   * prompt() with a styled dialog (see CreateProjectDialog) that
   * also lets the user pick a colour, write a description, and
   * choose privacy (private / visible-to-team). The actual store
   * write happens inside the dialog's onCreate callback so the
   * dialog stays in control of submitting state + error display. */
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const handleCreateProject = () => {
    if (educationLockedStudent) {
      toast.error(i18n("workspace.education.studentLockedToast"));
      setSection("spaces");
      return;
    }
    setCreateDialogOpen(true);
  };

  const handleConfirmCreateProject = async (meta: {
    name: string;
    description: string | null;
    color: string;
    isPrivate: boolean;
  }) => {
    const projectId = createProject(meta.name, {
      isPrivate: meta.isPrivate,
      color: meta.color,
      description: meta.description ?? undefined,
    });
    if (user?.id) {
      const stored = useWorkspaceStore
        .getState()
        .projects.find((p) => p.id === projectId);
      if (stored) await upsertProjectToServer(stored, user.id);
    }
    toast.success(t("workspace.toast.project_created", { name: meta.name }));
  };

  const handleDeleteProject = (projectId: string) => {
    const state = useWorkspaceStore.getState();
    if (state.projects.length <= 1) {
      toast.error(t("workspace.toast.keep_one_project"));
      return;
    }
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) return;
    if (project.ownerId && project.ownerId !== user?.id) {
      toast.error(t("workspace.toast.couldnt_delete_shared_project"));
      return;
    }
    if (project.name === DEFAULT_PROJECT_NAME) {
      toast.error(t("workspace.toast.keep_one_project"));
      return;
    }
    deleteProject(projectId);
    if (user?.id) void deleteProjectFromServer(projectId);
    toast.success(t("workspace.toast.project_deleted", { name: project.name }));
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
      className="mf-readable flex h-screen w-screen overflow-hidden bg-[hsl(0_0%_5%)] text-zinc-100"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* Persistent sidebar — shown only on tablet+ (md / 768px+). On
       *  mobile the same component renders inside the drawer below
       *  (triggered by the hamburger button in each page's header). */}
      <div className="hidden h-full md:block">
        <WorkspaceSidebar
          active={section}
          onNavigate={setSection}
          onCreate={handleCreateProject}
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={setActiveProject}
        />
      </div>

      {/* Mobile drawer — works for every section (Home, All assets,
       *  Spaces, the standalone tools, etc.). The previous version
       *  only opened on standalone-tool sections, which left Home /
       *  All assets users with the sidebar permanently eating ~50%
       *  of the viewport on a phone. */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            aria-label={t("workspace.spaces.close_sidebar")}
            className="absolute inset-0 bg-black/65"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-10 h-full w-[228px] max-w-[84vw]">
            <WorkspaceSidebar
              active={section}
              onCreate={handleCreateProject}
              projects={projects}
              activeProjectId={activeProjectId}
              onSelectProject={setActiveProject}
              onNavigate={(next) => {
                setSection(next);
                setMobileSidebarOpen(false);
              }}
            />
            <button
              type="button"
              aria-label={t("workspace.spaces.close_sidebar")}
              onClick={() => setMobileSidebarOpen(false)}
              className="absolute -right-12 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/[0.08] text-zinc-100"
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
            onDeleteProject={handleDeleteProject}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            educationLockedStudent={educationLockedStudent}
          />
        )}
        {section === "projects" && (
          educationLockedStudent ? (
            <EducationLockedToolView onOpenSpaces={() => setSection("spaces")} onOpenSidebar={() => setMobileSidebarOpen(true)} />
          ) : (
            <ProjectsManagerView
              projects={projects}
              activeProjectId={activeProjectId}
              onSelectProject={setActiveProject}
              onCreateProject={handleCreateProject}
              onDeleteProject={handleDeleteProject}
              onOpenSidebar={() => setMobileSidebarOpen(true)}
            />
          )
        )}
        {section === "spaces" && (
          <SpacesView
            activeProjectId={activeProjectId}
            projects={projects}
            onSelectProject={setActiveProject}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            educationLockedStudent={educationLockedStudent}
          />
        )}
        {(section === "history" || section === "assets") && (
          <AssetsView onOpenSidebar={() => setMobileSidebarOpen(true)} />
        )}
        {section === "stock" && (
          <StockView onOpenSidebar={() => setMobileSidebarOpen(true)} />
        )}
        {isStandaloneSection(section) && (
          educationLockedStudent ? (
            <EducationLockedToolView onOpenSpaces={() => setSection("spaces")} onOpenSidebar={() => setMobileSidebarOpen(true)} />
          ) : (
            <StandaloneGenerator
              activeTool={section}
              onToolChange={(next) => setSection(next)}
              onOpenSidebar={() => setMobileSidebarOpen(true)}
              projects={standaloneProjects}
              activeProjectId={activeProjectId}
              onSelectProject={setActiveProject}
              onCreateProject={handleCreateProject}
              onDeleteProject={handleDeleteProject}
            />
          )
        )}
        {section !== "home" &&
          section !== "projects" &&
          section !== "spaces" &&
          section !== "history" &&
          section !== "assets" &&
          section !== "stock" &&
          !isStandaloneSection(section) && (
            <Placeholder
              section={section}
              onOpenSidebar={() => setMobileSidebarOpen(true)}
            />
          )}
      </main>

      {/* Create-project dialog — replaces native prompt(). Mounted
       *  at the page level so any of the dashboard's "+ New project"
       *  triggers (sidebar, ProjectsCard, empty state) all open the
       *  same controlled dialog. The default color rotates by
       *  current project count so each new project lands on a
       *  different palette slot without the user picking. */}
      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultColor={
          PROJECT_COLOR_SWATCHES[
            projects.length % PROJECT_COLOR_SWATCHES.length
          ]
        }
        onCreate={handleConfirmCreateProject}
      />
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

interface HomeInspiration {
  id: string;
  title: string;
  src: string;
  kind: "image" | "video";
  previewSrc?: string;
  posterSrc?: string;
  previewVideoSrc?: string;
}

const HOME_INSPIRATIONS: HomeInspiration[] = [
  {
    id: "thumbnail-ui",
    title: "Thumbnail UI",
    src: "/inspire/thumbnail-ui.webm",
    previewVideoSrc: "/inspire/previews/thumbnail-ui-preview.webm",
    posterSrc: "/inspire/previews/thumbnail-ui-poster.webp",
    kind: "video",
  },
  {
    id: "full-screen",
    title: "Full Screen",
    src: "/inspire/full-screen.webm",
    previewVideoSrc: "/inspire/previews/full-screen-preview.webm",
    posterSrc: "/inspire/previews/full-screen-poster.webp",
    kind: "video",
  },
  {
    id: "magnific-2882506457",
    title: "Magnific Motion 1",
    src: "/inspire/magnific-2882506457.webm",
    previewVideoSrc: "/inspire/previews/magnific-2882506457-preview.webm",
    posterSrc: "/inspire/previews/magnific-2882506457-poster.webp",
    kind: "video",
  },
  {
    id: "magnific-2886588619",
    title: "Magnific Motion 2",
    src: "/inspire/magnific-2886588619.webm",
    previewVideoSrc: "/inspire/previews/magnific-2886588619-preview.webm",
    posterSrc: "/inspire/previews/magnific-2886588619-poster.webp",
    kind: "video",
  },
  {
    id: "sketch-3",
    title: "Sketch 3",
    src: "/inspire/sketch-3.png",
    previewSrc: "/inspire/previews/sketch-3.webp",
    kind: "image",
  },
  {
    id: "sketch-1",
    title: "Sketch 1",
    src: "/inspire/sketch-1.png",
    previewSrc: "/inspire/previews/sketch-1.webp",
    kind: "image",
  },
  {
    id: "concept-art-3-4",
    title: "Concept Art 3/4",
    src: "/inspire/concept-art-3-4.png",
    previewSrc: "/inspire/previews/concept-art-3-4.webp",
    kind: "image",
  },
  {
    id: "concept-art",
    title: "Concept Art",
    src: "/inspire/concept-art.png",
    previewSrc: "/inspire/previews/concept-art.webp",
    kind: "image",
  },
  {
    id: "collage",
    title: "Collage",
    src: "/inspire/collage.png",
    previewSrc: "/inspire/previews/collage.webp",
    kind: "image",
  },
  {
    id: "character-sheet",
    title: "Character Sheet",
    src: "/inspire/character-sheet.png",
    previewSrc: "/inspire/previews/character-sheet.webp",
    kind: "image",
  },
];

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

function useHydrateSpacePreviewGraphs(
  workspaceIds: string[],
  userId: string | undefined,
  authLoading: boolean,
) {
  const replaceCanvasGraphs = useWorkspaceStore((s) => s.replaceCanvasGraphs);
  const requestedRef = useRef<Set<string>>(new Set());
  const signature = workspaceIds.join("|");

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      requestedRef.current.clear();
      return;
    }

    const state = useWorkspaceStore.getState();
    const canvasIndex = buildCanvasIndex(state.canvases);
    const missing = workspaceIds.filter((workspaceId) => {
      if (requestedRef.current.has(workspaceId)) return false;
      const previewCanvasId = pickPreviewCanvasId(
        workspaceId,
        canvasIndex,
        state.graphs,
      );
      const previewGraph = previewCanvasId
        ? state.graphs[previewCanvasId]
        : undefined;
      return !graphHasPreviewContent(previewGraph);
    });

    if (missing.length === 0) return;
    for (const workspaceId of missing) requestedRef.current.add(workspaceId);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const hydrateBatch = (startIndex: number) => {
      if (cancelled) return;
      const batch = missing.slice(
        startIndex,
        startIndex + PREVIEW_HYDRATION_BATCH_SIZE,
      );
      if (batch.length === 0) return;

      loadLatestCanvasPreviewsByWorkspaceIds(batch).then((graphs) => {
        if (cancelled) return;
        if (!graphs) {
          for (const workspaceId of batch) requestedRef.current.delete(workspaceId);
          return;
        }
        replaceCanvasGraphs(graphs);
        const nextIndex = startIndex + PREVIEW_HYDRATION_BATCH_SIZE;
        if (nextIndex < missing.length) {
          timer = setTimeout(
            () => hydrateBatch(nextIndex),
            PREVIEW_HYDRATION_BATCH_DELAY_MS,
          );
        }
      }).catch((err) => {
        for (const workspaceId of batch) requestedRef.current.delete(workspaceId);
        console.warn("[workspace-dashboard] preview hydration failed:", err);
      });
    };

    hydrateBatch(0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [authLoading, replaceCanvasGraphs, signature, userId, workspaceIds]);
}

const HomeView = ({
  onSection,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onOpenSidebar,
  educationLockedStudent = false,
}: {
  onSection: (s: Section) => void;
  projects: ProjectMeta[];
  activeProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
  onOpenSidebar?: () => void;
  educationLockedStudent?: boolean;
}) => {
  const navigate = useNavigate();
  const { t, t: i18n } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const canvases = useWorkspaceStore((s) => s.canvases);
  const graphs = useWorkspaceStore((s) => s.graphs);
  const canvasIndex = useMemo(() => buildCanvasIndex(canvases), [canvases]);
  // `projects` was previously a free reference inside the projectCards
  // useMemo below — never declared in this scope, never threaded as a
  // prop (the parent passes it but we ignore the prop). That blew up
  // at runtime as `ReferenceError: projects is not defined` and broke
  // the entire workspace shell (no way back to dashboard). Pulling
  // straight from the store mirrors how `workspaces`/`canvases`/`graphs`
  // are wired and avoids relying on a prop the type contract doesn't
  // even declare.
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const mergeServerWorkspaces = useWorkspaceStore(
    (s) => s.mergeServerWorkspaces,
  );
  const { data: educationSpaceStatuses = EMPTY_EDUCATION_SPACE_STATUS_MAP } =
    useEducationSpaceStatusMap(user?.id, educationLockedStudent);

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
          !educationLockedStudent &&
          (!w.ownerId || w.ownerId === user.id) &&
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
        if (graph.ownerId && graph.ownerId !== user.id) continue;
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
  }, [user?.id, authLoading, educationLockedStudent, mergeServerWorkspaces]);

  const projectCards = useMemo<ProjectCardItem[]>(() => {
    const spaceCountByProject = new Map<string, number>();
    for (const workspace of workspaces) {
      const projectId = workspace.projectId ?? activeProjectId;
      if (!projectId) continue;
      spaceCountByProject.set(
        projectId,
        (spaceCountByProject.get(projectId) ?? 0) + 1,
      );
    }
    let defaultProjectShown = false;
    return projects
      .filter((project) => Boolean(user?.id) && project.ownerId === user?.id)
      .sort(
        (a, b) =>
          Number(b.id === activeProjectId) -
            Number(a.id === activeProjectId) ||
          b.updatedAt - a.updatedAt,
      )
      .filter((project) => {
        if (project.name !== DEFAULT_PROJECT_NAME) return true;
        if (defaultProjectShown) return false;
        defaultProjectShown = true;
        return true;
      })
      .map((project, index) => ({
        ...project,
        color: PROJECT_COLOR_SWATCHES[index % PROJECT_COLOR_SWATCHES.length],
        icon: index === 0 ? Lock : Layers,
        spaceCount: spaceCountByProject.get(project.id) ?? 0,
      }));
  }, [activeProjectId, projects, user?.id, workspaces]);

  /* Recent spaces — top 3 by updatedAt with rendered minimaps so the
   * Home preview stays fixed-width and never pushes the Tools column
   * off-screen when a project has many spaces. */
  const recentWorkspaceIds = useMemo(() => {
    return [...workspaces]
      .filter(
        (ws) =>
          (educationLockedStudent ? Boolean(ws.classId) : true) &&
          (educationLockedStudent || !activeProjectId || !ws.projectId || ws.projectId === activeProjectId),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3)
      .map((ws) => ws.id);
  }, [activeProjectId, educationLockedStudent, workspaces]);

  useHydrateSpacePreviewGraphs(recentWorkspaceIds, user?.id, authLoading);

  const recentSpaces = useMemo(() => {
    const recentIds = new Set(recentWorkspaceIds);
    return [...workspaces]
      .filter((ws) => recentIds.has(ws.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((ws) =>
        applyEducationSpaceStatus(
          buildSpaceCardData(ws, canvasIndex, graphs),
          educationSpaceStatuses,
        ),
      );
  }, [recentWorkspaceIds, workspaces, canvasIndex, graphs, educationSpaceStatuses]);

  const handleNew = async () => {
    if (educationLockedStudent) {
      toast.error(i18n("workspace.home.scanClassQrOrLinkTo"));
      onSection("spaces");
      return;
    }
    const { workspaceId, canvasId } = createWorkspace(t("workspace.spaces.untitled_space"), activeProjectId);
    if (user?.id) {
      const result = await persistNewWorkspaceBundle(workspaceId, canvasId, user.id);
      if (!result.ok) {
        console.warn("[workspace] create space server save failed:", result.error);
      }
    }
    navigate(`/app/workspace/${workspaceId}`);
  };

  const activeClass = useActiveClass();
  const { data: classMemberships } = useUserClassMemberships();
  const studentClasses = (classMemberships ?? []).filter(
    (membership) => membership.role === "member" && membership.status === "active",
  );
  const visibleInspirations = HOME_INSPIRATIONS;

  return (
    <>
      <div className="ws-scroll-hide flex-1 overflow-y-auto overflow-x-hidden">
        <section aria-label="MediaForge hero video" className="relative bg-[var(--bg-app)]">
          <video
            src="/inspire/to-bangkok.webm"
            className="block h-[260px] w-full object-cover sm:h-[360px] lg:h-[clamp(430px,48vw,760px)]"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[46%] bg-[linear-gradient(90deg,rgba(10,10,11,.9)_0%,rgba(10,10,11,.58)_18%,rgba(10,10,11,.24)_42%,rgba(10,10,11,0)_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-[linear-gradient(0deg,rgba(10,10,11,1)_0%,rgba(10,10,11,.72)_34%,rgba(10,10,11,.28)_68%,rgba(10,10,11,0)_100%)] md:h-32" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-[linear-gradient(180deg,rgba(10,10,11,.3)_0%,rgba(10,10,11,0)_100%)]" />
          <div className="absolute inset-x-0 top-0 z-20">
            <PageHeader title="" rightSlot={<UserMenu />} onOpenSidebar={onOpenSidebar} />
          </div>
        </section>

        <div className="mx-auto min-w-0 w-full max-w-[1680px] px-4 pb-16 pt-10 md:px-7 lg:px-10 lg:pt-12">
          {activeClass && (
            <EducationClassDashboard
              active={activeClass}
              classes={studentClasses}
              onOpenSpaces={() => onSection("spaces")}
            />
          )}

          <section className="mt-14">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[26px] font-semibold leading-tight text-white md:text-[30px]">
                {t("workspace.home.inspirations")}
              </h2>
            </div>

            <ul className="mt-5 columns-1 gap-3 md:columns-2 xl:columns-3">
              {visibleInspirations.map((item, index) => (
                <li key={item.id} className="mb-3 break-inside-avoid">
                  <div className="group block w-full overflow-hidden rounded-[13px] bg-[var(--bg-app)]">
                    <div className="relative overflow-hidden rounded-[13px] bg-[var(--bg-app)]">
                      {item.kind === "video" ? (
                        <video
                          src={item.previewVideoSrc ?? item.src}
                          poster={item.posterSrc}
                          className="block h-auto w-full rounded-[13px] object-contain"
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="none"
                        />
                      ) : (
                        <img
                          src={item.previewSrc ?? item.src}
                          alt={item.title}
                          className="block h-auto w-full rounded-[13px] object-contain transition duration-500 group-hover:scale-[1.012]"
                          loading={index < 3 ? "eager" : "lazy"}
                          decoding="async"
                        />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
};

const EducationLockedToolView = ({
  onOpenSpaces,
  onOpenSidebar,
}: {
  onOpenSpaces: () => void;
  onOpenSidebar?: () => void;
}) => {
  const { t: i18n } = useLanguage();
  return (
  <>
    <PageHeader title={i18n("workspace.home.classWorkspace")} rightSlot={<UserMenu />} onOpenSidebar={onOpenSidebar} />
    <div className="flex flex-1 items-center justify-center px-5 py-10">
      <div className="w-full max-w-[520px] rounded-2xl border border-white/[0.08] bg-[hsl(0_0%_7%)] p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-zinc-50">{i18n("workspace.home.classSpacesOnly")}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          {i18n("workspace.education.studentLockedDescription")}
        </p>
        <button
          type="button"
          onClick={onOpenSpaces}
          className="mt-5 inline-flex h-9 items-center justify-center rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-400"
        >
          {i18n("workspace.home.openClassSpaces")}
        </button>
      </div>
    </div>
  </>
  );
};

const EducationClassDashboard = ({
  active,
  classes,
  onOpenSpaces,
}: {
  active: ClassMembershipInfo;
  classes: ClassMembershipInfo[];
  onOpenSpaces: () => void;
}) => {
  const { t: i18n } = useLanguage();
  const pctUsed = active.credits_lifetime_received > 0
    ? Math.min(100, Math.round((active.credits_lifetime_used / active.credits_lifetime_received) * 100))
    : 0;

  return (
    <section className="mt-4 rounded-2xl border border-emerald-400/20 bg-[linear-gradient(135deg,hsl(158_64%_16%/0.92),hsl(220_17%_9%/0.98)_55%,hsl(41_84%_18%/0.8))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[13.5px] font-semibold text-emerald-100">
            <GraduationCap className="h-3.5 w-3.5" />
            {i18n("workspace.home.educationWorkspace")}
          </div>
          <h2 className="truncate text-2xl font-semibold tracking-normal text-white">
            {active.class_name}
          </h2>
          <p className="mt-1 text-sm text-emerald-50/70">
            {active.class_code} · {classes.length} {i18n(classes.length === 1 ? "workspace.class.active_class" : "workspace.class.active_classes")} · {i18n("workspace.home.studentWallet")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ActiveClassPicker variant="compact" className="border-white/10 bg-white/10 text-white hover:bg-white/15" />
          <button
            type="button"
            onClick={onOpenSpaces}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-50"
          >
            {i18n("workspace.home.openClassSpaces")}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-white/[0.06] p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-emerald-100/70">
            <WalletCards className="h-3.5 w-3.5" />
            {i18n("common.balance")}
          </div>
          <p className="mt-2 text-2xl font-semibold text-white">
            {active.credits_balance.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-emerald-50/55">{i18n("workspace.home.creditsAvailableForThisClass")}</p>
        </div>
        <div className="rounded-xl bg-white/[0.06] p-3">
          <div className="text-xs uppercase tracking-[0.14em] text-emerald-100/70">{i18n("common.received")}</div>
          <p className="mt-2 text-2xl font-semibold text-white">
            {active.credits_lifetime_received.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-emerald-50/55">{i18n("workspace.home.teacherAndClassGrants")}</p>
        </div>
        <div className="rounded-xl bg-white/[0.06] p-3">
          <div className="mb-2 flex justify-between text-xs uppercase tracking-[0.14em] text-emerald-100/70">
            <span>{i18n("common.used")}</span>
            <span>{pctUsed}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-amber-300" style={{ width: `${pctUsed}%` }} />
          </div>
          <p className="mt-3 text-lg font-semibold text-white">
            {active.credits_lifetime_used.toLocaleString()}
          </p>
        </div>
      </div>
    </section>
  );
};

/** Phrase the user must type into the delete dialog. Match is
 *  case-insensitive + trimmed so "ยืนยัน" / "ยืนยัน " / "Confirm"
 *  all unlock the destructive button. */
const DELETE_CONFIRM_PHRASE = "ยืนยัน";
const DELETE_CONFIRM_PHRASE_FALLBACK = "confirm";

const ProjectsCard = ({
  projects,
  activeProjectId,
  userId,
  onSelect,
  onCreate,
  onDelete,
}: {
  projects: ProjectCardItem[];
  activeProjectId: string | null;
  userId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) => {
  const { t, t: i18n } = useLanguage();
  /* Type-to-confirm dialog state. We model the in-flight delete as
   * an optional pointer to the candidate project; the input field
   * lives alongside in `confirmText`. Both reset on close. The old
   * window.confirm path was too low-friction for a multi-cascade
   * delete (project → all spaces → all canvases → all generations),
   * so the user asked for an explicit "type ยืนยัน to delete"
   * speed bump. */
  const [pendingDelete, setPendingDelete] = useState<ProjectCardItem | null>(
    null,
  );
  const [confirmText, setConfirmText] = useState("");

  const requestDelete = (e: React.MouseEvent, p: ProjectCardItem) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmText("");
    setPendingDelete(p);
  };

  const closeDialog = () => {
    setPendingDelete(null);
    setConfirmText("");
  };

  const normalised = confirmText.trim().toLowerCase();
  const canConfirm =
    normalised === DELETE_CONFIRM_PHRASE ||
    normalised === DELETE_CONFIRM_PHRASE_FALLBACK;

  const confirmDelete = () => {
    if (!pendingDelete || !canConfirm) return;
    onDelete(pendingDelete.id);
    closeDialog();
  };

  return (
    <>
      {/* 2026-05: drop ring — bg differentiation alone reads as the box. */}
      <div className="min-w-0 rounded-xl bg-[hsl(var(--surface-1))] p-3">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1 text-[13.5px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
            {t("workspace.home.projects")}
            <ChevronRight className="h-3 w-3 text-zinc-500" />
          </div>
          <button
            type="button"
            onClick={onCreate}
            title={t("workspace.home.new_project_tooltip")}
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <Plus className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
          </button>
        </div>

        {projects.length === 0 ? (
          <button
            type="button"
            onClick={onCreate}
            className="flex min-h-[86px] w-full items-center justify-center rounded-xl bg-white/[0.02] px-4 text-[13px] text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
          >
            {t("workspace.home.create_first_project")}
          </button>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {projects.map((p) => {
              const isProtected = p.name === DEFAULT_PROJECT_NAME;
              const canManage = !p.ownerId || p.ownerId === userId;
              return (
                <li key={p.id} className="group/proj relative">
                  {/* 2026-05 redesign: rows match content height. The
                   *  legacy 44px (mobile) / 36px (desktop) gave room for
                   *  2 lines of text but only ever held 1 — the user
                   *  flagged it as the most visible "too big" offender.
                   *  Now: 32px desktop / 36px mobile, 13px text.
                   *  Active state: bg-elevation only, no ring border. */}
                  <button
                    type="button"
                    onClick={() => onSelect(p.id)}
                    className={cn(
                      "flex h-9 w-full items-center gap-2 rounded-md px-2 text-[13px] text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white lg:h-8",
                      activeProjectId === p.id &&
                        "bg-white/[0.08] text-white",
                    )}
                  >
                    <span
                      className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px]"
                      style={{ background: p.color }}
                    >
                      <p.icon className="h-2 w-2 text-zinc-950" />
                    </span>
                    <span className="flex-1 truncate text-left font-medium">{p.name}</span>
                    <span className="rounded bg-white/[0.05] px-1 py-px text-[10px] font-semibold text-zinc-400">
                      {p.spaceCount}
                    </span>
                    {activeProjectId === p.id ? (
                      <span
                        className={cn(
                          "rounded bg-emerald-500/15 px-1 py-px text-[10px] font-bold uppercase tracking-wide text-emerald-300 transition-opacity",
                          /* Fade the badge so the trash button can
                           * take its slot — but only when this row is
                           * actually deletable. The protected project
                           * keeps its badge full-strength on hover. */
                          canManage && !isProtected && "group-hover/proj:opacity-0",
                        )}
                      >
                        {t("workspace.home.active")}
                      </span>
                    ) : (
                      <Lock
                        className={cn(
                          "h-2.5 w-2.5 text-zinc-600 transition-opacity",
                          canManage && !isProtected && "group-hover/proj:opacity-0",
                        )}
                      />
                    )}
                  </button>
                  {/* Delete affordance — absolutely positioned over
                   * the Lock / Active slot so it's only visible on
                   * hover. Sits OUTSIDE the row <button> because
                   * <button> can't legally nest another <button>;
                   * onPointerDown stopPropagation keeps the underlying
                   * row click from firing first.
                   *
                   * Hidden entirely on the protected "Default project"
                   * row — that's the server-side fallback every user
                   * gets, and we never want it deleted. */}
                  {canManage && !isProtected && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => requestDelete(e, p)}
                      title={t("workspace.home.delete_project_tooltip", { name: p.name })}
                      aria-label={t("workspace.home.delete_project_aria", { name: p.name })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 opacity-0 transition-all group-hover/proj:opacity-100 hover:bg-red-500/15 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Type-to-confirm delete dialog. The destructive button stays
       * disabled until the user types `ยืนยัน` (or English `confirm`)
       * — same gesture GitHub uses for repo deletion, scaled down to
       * a single short phrase. Enter on the input also fires confirm
       * once the phrase matches so the user can keyboard through. */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="border-white/10 bg-[hsl(0_0%_8%)] text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base text-zinc-100">
              {t("workspace.home.delete_dialog_title", { name: pendingDelete?.name ?? "" })}
            </DialogTitle>
            <DialogDescription className="text-[14.5px] leading-relaxed text-zinc-400">
              {t("workspace.home.delete_dialog_desc_pre")}
              <span className="font-semibold text-zinc-200">{t("workspace.home.delete_dialog_desc_target")}</span>
              {t("workspace.home.delete_dialog_desc_post")}
              <br />
              {t("workspace.home.delete_dialog_type")}
              <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[13.5px] font-semibold text-red-300 ring-1 ring-inset ring-red-500/30">
                {i18n("workspace.home.confirm")}
              </span>
              {t("workspace.home.delete_dialog_to_confirm")}
            </DialogDescription>
          </DialogHeader>

          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canConfirm) {
                e.preventDefault();
                confirmDelete();
              }
            }}
            autoFocus
            placeholder={t("workspace.home.delete_dialog_placeholder")}
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-[14.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20"
          />

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={closeDialog}
              className="inline-flex h-9 items-center justify-center rounded-md bg-white/[0.06] px-4 text-[14.5px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.09] hover:text-white"
            >
              {t("workspace.home.delete_dialog_cancel")}
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={!canConfirm}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-4 text-[14.5px] font-semibold transition-colors",
                canConfirm
                  ? "bg-red-500/90 text-white hover:bg-red-500"
                  : "cursor-not-allowed bg-red-500/20 text-red-300/50",
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("workspace.home.delete_dialog_confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

interface SpaceCardData {
  id: string;
  ownerId?: string | null;
  classId?: string | null;
  educationStatus?: WorkspaceMeta["educationStatus"];
  name: string;
  updatedAt: number;
  previewCacheKey: string;
  tabCount: number;
  previewMedia: PreviewMedia[];
  nodes: MiniNode[];
  edges: MiniEdge[];
}

type EducationSpaceStatusMap = Record<
  string,
  {
    status: WorkspaceMeta["educationStatus"];
    completedAt: string | null;
  }
>;

const EMPTY_EDUCATION_SPACE_STATUS_MAP: EducationSpaceStatusMap = {};
const EDUCATION_SPACE_STATUSES = new Set(["active", "submitted", "passed", "ended"]);

function normalizeEducationStatus(value: unknown): WorkspaceMeta["educationStatus"] {
  const status = typeof value === "string" ? value : "";
  return EDUCATION_SPACE_STATUSES.has(status)
    ? (status as WorkspaceMeta["educationStatus"])
    : null;
}

function getEducationStatusLabel(status: WorkspaceMeta["educationStatus"]) {
  if (status === "passed") return "Pass";
  if (status === "ended") return "Ended";
  if (status === "submitted") return "Submitted";
  return status;
}

function applyEducationSpaceStatus(
  card: SpaceCardData,
  statuses: EducationSpaceStatusMap,
): SpaceCardData {
  const status = statuses[card.id]?.status;
  return status ? { ...card, educationStatus: status } : card;
}

function useEducationSpaceStatusMap(
  userId: string | null | undefined,
  enabled: boolean,
) {
  return useQuery<EducationSpaceStatusMap>({
    queryKey: ["education-space-status-map", userId],
    enabled: Boolean(enabled && userId),
    staleTime: 5_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!userId) return EMPTY_EDUCATION_SPACE_STATUS_MAP;
      const { data, error } = await supabase
        .from("education_student_spaces")
        .select("workspace_id,status,completed_at")
        .eq("user_id", userId);
      if (error) {
        console.warn("[workspace-dashboard] education space statuses failed:", error.message);
        return EMPTY_EDUCATION_SPACE_STATUS_MAP;
      }

      const map: EducationSpaceStatusMap = {};
      for (const row of data ?? []) {
        const workspaceId = typeof row?.workspace_id === "string" ? row.workspace_id : null;
        const status = normalizeEducationStatus(row?.status);
        if (!workspaceId || !status) continue;
        map[workspaceId] = {
          status,
          completedAt: typeof row?.completed_at === "string" ? row.completed_at : null,
        };
      }
      return map;
    },
  });
}

const ProjectQuickSwitch = ({
  projects,
  workspaces,
  activeProjectId,
  onSelectProject,
}: {
  projects: ProjectMeta[];
  workspaces: WorkspaceMeta[];
  activeProjectId: string | null;
  onSelectProject: (id: string | null) => void;
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  if (projects.length === 0) return null;
  const counts = new Map<string, number>();
  for (const workspace of workspaces) {
    const projectId = workspace.projectId ?? activeProjectId;
    if (!projectId) continue;
    counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {[...projects]
        .sort(
          (a, b) =>
            Number(b.id === activeProjectId) -
              Number(a.id === activeProjectId) ||
            b.updatedAt - a.updatedAt,
        )
        .map((project, index) => {
          const active = activeProjectId === project.id;
          const teamProject = Boolean(project.ownerId && project.ownerId !== user?.id);
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => onSelectProject(project.id)}
              className={cn(
                "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13.5px] font-medium ring-1 ring-inset transition-colors",
                active
                  ? "bg-white/[0.10] text-zinc-50 ring-white/[0.14]"
                  : "bg-white/[0.03] text-zinc-400 ring-white/[0.06] hover:bg-white/[0.07] hover:text-zinc-100",
              )}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background:
                    project.color ?? PROJECT_COLOR_SWATCHES[index % PROJECT_COLOR_SWATCHES.length],
                }}
              />
              <span className="max-w-[150px] truncate">{project.name}</span>
              {teamProject && (
                <span className="rounded bg-sky-400/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-sky-200">
                  {t("common.team")}
                </span>
              )}
              <span className="rounded bg-white/[0.06] px-1.5 py-px text-[10px] font-bold text-zinc-400">
                {counts.get(project.id) ?? 0}
              </span>
            </button>
          );
        })}
    </div>
  );
};

const SpacesShowcaseCard = ({
  spaces,
  onOpen,
  onNew,
  onSeeAll,
}: {
  spaces: SpaceCardData[];
  onOpen: (id: string) => void;
  onNew?: () => void;
  onSeeAll: () => void;
}) => {
  const { t, t: i18n } = useLanguage();
  return (
    <div className="min-w-0 rounded-2xl bg-[hsl(0_0%_7%)] p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <button
          type="button"
          onClick={onSeeAll}
          className="flex items-center gap-1 text-[13.5px] font-semibold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:text-white"
        >
          {t("workspace.home.spaces")}
          <ChevronRight className="h-3 w-3 text-zinc-500" />
        </button>
        {onNew && (
          <button
            type="button"
            onClick={onNew}
            title={t("workspace.home.new_space_tooltip")}
            className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white lg:h-7 lg:w-7"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {spaces.length === 0 ? (
        onNew ? (
          <button
            type="button"
            onClick={onNew}
            className="flex min-h-[86px] w-full items-center justify-center rounded-xl bg-white/[0.02] px-4 text-[13px] text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
          >
            {t("workspace.home.create_first_space")}
          </button>
        ) : (
          <div className="flex min-h-[86px] w-full items-center justify-center rounded-xl bg-white/[0.02] px-4 text-center text-[13px] text-zinc-500">
            {i18n("workspace.home.scanClassQrOrOpenYour")}
          </div>
        )
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
          {spaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => onOpen(ws.id)}
              className="group/space flex min-w-0 flex-col gap-1 rounded-xl bg-[hsl(0_0%_4%)] p-1 transition-all hover:bg-white/[0.04]"
            >
              <div className="aspect-[5/4] overflow-hidden rounded-lg bg-[hsl(0_0%_2%)]">
                <SpaceMediaPreview media={ws.previewMedia} />
              </div>
              <div className="px-0.5 pb-0 text-left">
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="truncate text-[12px] font-medium leading-[15px] text-zinc-100">
                    {ws.name}
                  </div>
                  {ws.educationStatus && ws.educationStatus !== "active" && (
                    <span className="inline-flex shrink-0 rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-emerald-200">
                      {getEducationStatusLabel(ws.educationStatus)}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ToolsCard = ({
  tools,
  onOpen,
}: {
  tools: HomeTool[];
  onOpen: (tool: StandaloneToolKey) => void;
}) => {
  const { t, t: i18n } = useLanguage();
  return (
    <div className="min-w-0 rounded-2xl bg-[hsl(0_0%_7%)] p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onOpen(tools[0]?.id ?? "image_gen")}
          className="flex items-center gap-1 text-[13.5px] font-semibold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:text-white"
        >
          {t("workspace.home.tools")}
          <ChevronRight className="h-3 w-3 text-zinc-500" />
        </button>
      </div>

      <ul className="flex flex-col gap-0">
        {tools.map((tool) => (
          <li key={tool.id}>
            <button
              type="button"
              onClick={() => onOpen(tool.id)}
              className="group/tool flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-[15px] text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              <span
                className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                style={{ background: tool.accent }}
              >
                <tool.icon className="h-3 w-3 text-zinc-950" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col justify-start gap-[2px] text-left">
                <span className="block truncate leading-none">{tool.label}</span>
                <span className="block truncate text-[13px] leading-none text-zinc-600 group-hover/tool:text-zinc-400">
                  {tool.subtitle}
                </span>
              </span>
              <ChevronRight className="h-3 w-3 text-zinc-700 transition-colors group-hover/tool:text-zinc-300" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const AcademyVideoTile = ({ video }: { video: AcademyVideo }) => (
  <li className="overflow-hidden rounded-2xl bg-[hsl(0_0%_7%)]">
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
        <h3 className="truncate text-[14.5px] font-semibold text-zinc-100">
          {video.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-[14.5px] leading-5 text-zinc-500">
          {video.description}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-1 text-[13.5px] font-semibold text-zinc-400">
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
  ws: {
    id: string;
    ownerId?: string | null;
    classId?: string | null;
    educationStatus?: WorkspaceMeta["educationStatus"];
    name: string;
    updatedAt: number;
  },
  canvasIndex: Map<string, PreviewCanvasMeta[]>,
  graphs: Record<string, { nodes?: unknown[]; edges?: unknown[] } | undefined>,
): SpaceCardData {
  const wsCanvases = canvasIndex.get(ws.id) ?? [];
  const previewCanvasId = pickPreviewCanvasId(ws.id, canvasIndex, graphs);
  const graph = previewCanvasId ? graphs[previewCanvasId] : null;

  const rawNodes = (graph?.nodes ?? []) as Array<Record<string, unknown>>;
  const rawById = new Map(rawNodes.map((n) => [String(n.id), n] as const));
  const previewMedia: PreviewMedia[] = [];
  const seenPreviewMedia = new Set<string>();
  const addPreviewMedia = (media: PreviewMedia[]) => {
    for (const item of media) {
      if (previewMedia.length >= SPACE_PREVIEW_MEDIA_LIMIT) break;
      if (!item.url || seenPreviewMedia.has(item.url)) continue;
      seenPreviewMedia.add(item.url);
      previewMedia.push(item);
    }
  };
  const absolutePositionOf = (node: Record<string, unknown>) => {
    let x = ((node.position as { x?: number } | undefined)?.x ?? 0);
    let y = ((node.position as { y?: number } | undefined)?.y ?? 0);
    let parentId =
      typeof node.parentId === "string"
        ? node.parentId
        : typeof node.parentNode === "string"
          ? node.parentNode
          : null;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = rawById.get(parentId);
      if (!parent) break;
      x += (parent.position as { x?: number } | undefined)?.x ?? 0;
      y += (parent.position as { y?: number } | undefined)?.y ?? 0;
      parentId =
        typeof parent.parentId === "string"
          ? parent.parentId
          : typeof parent.parentNode === "string"
            ? parent.parentNode
            : null;
    }
    return { x, y };
  };
  const nodes: MiniNode[] = rawNodes.map((n) => {
    const d = (n.data ?? {}) as Record<string, unknown>;
    const nType = n.type as string | undefined;
    const nodePreviewMedia = collectPreviewMediaFromNodeData(d, nType);
    addPreviewMedia(nodePreviewMedia);
    let imageUrl = nodePreviewMedia.find((item) => item.kind === "image")?.url;
    const fieldType = d.fieldType as string | undefined;
    if (!imageUrl && typeof d.posterUrl === "string") {
      imageUrl = d.posterUrl;
    } else if (!imageUrl &&
      typeof d.previewUrl === "string" &&
      (fieldType === "image" || fieldType === "model3d")
    ) {
      imageUrl = d.previewUrl;
    } else if (!imageUrl) {
      if (nType === "assetNode" && typeof d.posterUrl === "string") {
        imageUrl = d.posterUrl;
      }
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
    const position = absolutePositionOf(n);
    return {
      id: String(n.id),
      type: nType,
      x: position.x,
      y: position.y,
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
  const graphVersion =
    (graph as { updatedAt?: number } | null | undefined)?.updatedAt ?? ws.updatedAt;
  return {
    id: ws.id,
    ownerId: ws.ownerId ?? null,
    classId: ws.classId ?? null,
    educationStatus: ws.educationStatus ?? null,
    name: ws.name,
    updatedAt: ws.updatedAt,
    previewCacheKey: `${previewCanvasId ?? ws.id}:${graphVersion}:${nodes.length}:${edges.length}`,
    tabCount: wsCanvases.length,
    previewMedia,
    nodes,
    edges,
  };
}

const ProjectsManagerView = ({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onOpenSidebar,
  educationLockedStudent = false,
}: {
  projects: ProjectMeta[];
  activeProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
  onOpenSidebar?: () => void;
  educationLockedStudent?: boolean;
}) => {
  const navigate = useNavigate();
  const { t, t: i18n } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const canvases = useWorkspaceStore((s) => s.canvases);
  const graphs = useWorkspaceStore((s) => s.graphs);
  const canvasIndex = useMemo(() => buildCanvasIndex(canvases), [canvases]);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
  const duplicateWorkspace = useWorkspaceStore((s) => s.duplicateWorkspace);
  const selectedProjectId = educationLockedStudent ? null : activeProjectId ?? projects[0]?.id ?? null;
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  const [filter, setFilter] = useState<"all" | "mine" | "team">("all");

  const projectCards = useMemo<ProjectCardItem[]>(() => {
    const spaceCountByProject = new Map<string, number>();
    for (const workspace of workspaces) {
      const projectId = workspace.projectId ?? activeProjectId;
      if (!projectId) continue;
      spaceCountByProject.set(
        projectId,
        (spaceCountByProject.get(projectId) ?? 0) + 1,
      );
    }
    return [...projects]
      .sort(
        (a, b) =>
          Number(b.id === selectedProjectId) -
            Number(a.id === selectedProjectId) ||
          b.updatedAt - a.updatedAt,
      )
      .map((project, index) => ({
        ...project,
        color: project.color ?? PROJECT_COLOR_SWATCHES[index % PROJECT_COLOR_SWATCHES.length],
        icon:
          project.ownerId && project.ownerId !== user?.id
            ? Users
            : index === 0
              ? Lock
              : Layers,
        spaceCount: spaceCountByProject.get(project.id) ?? 0,
      }));
  }, [activeProjectId, projects, selectedProjectId, user?.id, workspaces]);

  const projectWorkspaceIds = useMemo(
    () =>
      workspaces
        .filter((workspace) =>
          selectedProjectId
            ? workspace.projectId === selectedProjectId ||
              (!workspace.projectId && selectedProjectId === activeProjectId)
            : true,
        )
        .map((workspace) => workspace.id),
    [activeProjectId, selectedProjectId, workspaces],
  );
  useHydrateSpacePreviewGraphs(projectWorkspaceIds, user?.id, authLoading);

  const spaces = useMemo(() => {
    return [...workspaces]
      .filter((workspace) =>
        selectedProjectId
          ? workspace.projectId === selectedProjectId ||
            (!workspace.projectId && selectedProjectId === activeProjectId)
          : true,
      )
      .filter((workspace) => {
        if (filter === "team") return Boolean(workspace.ownerId && workspace.ownerId !== user?.id);
        if (filter === "mine") return !workspace.ownerId || workspace.ownerId === user?.id;
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((workspace) => buildSpaceCardData(workspace, canvasIndex, graphs));
  }, [activeProjectId, canvasIndex, filter, graphs, selectedProjectId, user?.id, workspaces]);

  const ownerLabel = selectedProject?.ownerId && selectedProject.ownerId !== user?.id
    ? "Team project"
    : "Owned by you";

  const handleNewSpace = async () => {
    const { workspaceId, canvasId } = createWorkspace(
      t("workspace.spaces.untitled_space"),
      selectedProject?.id ?? activeProjectId,
    );
    if (user?.id) {
      const result = await persistNewWorkspaceBundle(workspaceId, canvasId, user.id);
      if (!result.ok) {
        console.warn("[workspace] create space server save failed:", result.error);
      }
    }
    navigate(`/app/workspace/${workspaceId}`);
  };

  const handleRename = (id: string, currentName: string) => {
    const next = prompt(t("workspace.spaces.rename_prompt"), currentName);
    if (next?.trim() && next.trim() !== currentName) {
      renameWorkspace(id, next.trim());
      if (user?.id) {
        const meta = useWorkspaceStore.getState().workspaces.find((w) => w.id === id);
        if (meta) void upsertWorkspaceToServer(meta, user.id);
      }
    }
  };

  const handleDelete = (id: string, displayName: string) => {
    if (!confirm(t("workspace.spaces.delete_confirm", { name: displayName }))) return;
    deleteWorkspace(id);
    if (user?.id) void deleteWorkspaceFromServer(id);
  };

  const handleDuplicate = (id: string) => {
    const toastId = toast.loading(t("workspace.toast.duplicating"));
    const res = duplicateWorkspace(id);
    if (res.workspaceId === id) {
      toast.error(t("workspace.toast.couldnt_duplicate"), { id: toastId });
      return;
    }
    const newMeta = useWorkspaceStore
      .getState()
      .workspaces.find((workspace) => workspace.id === res.workspaceId);
    const newName = newMeta?.name ?? t("workspace.toast.duplicated_space_fallback");
    if (!user?.id) {
      toast.success(t("workspace.toast.duplicated_as", { name: newName }), {
        id: toastId,
        action: {
          label: t("workspace.toast.open"),
          onClick: () => navigate(`/app/workspace/${res.workspaceId}`),
        },
      });
      return;
    }
    void (async () => {
      try {
        if (newMeta) await upsertWorkspaceToServer(newMeta, user.id);
        const newCanvases = useWorkspaceStore
          .getState()
          .canvases.filter((canvas) => canvas.workspaceId === res.workspaceId);
        const nextGraphs = useWorkspaceStore.getState().graphs;
        await Promise.all(
          newCanvases.map((canvas) =>
            nextGraphs[canvas.id]
              ? saveCanvasToServer(nextGraphs[canvas.id], user.id)
              : Promise.resolve(),
          ),
        );
        toast.success(t("workspace.toast.duplicated_as", { name: newName }), {
          id: toastId,
          action: {
            label: t("workspace.toast.open"),
            onClick: () => navigate(`/app/workspace/${res.workspaceId}`),
          },
        });
      } catch (err) {
        console.warn("[workspace-projects] duplicate server push failed:", err);
        toast.warning(t("workspace.toast.duplicated_offline", { name: newName }), {
          id: toastId,
          action: {
            label: t("workspace.toast.open"),
            onClick: () => navigate(`/app/workspace/${res.workspaceId}`),
          },
        });
      }
    })();
  };

  return (
    <>
      <PageHeader
        title={t("workspace.home.projects")}
        rightSlot={<UserMenu />}
        onOpenSidebar={onOpenSidebar}
      />
      {educationLockedStudent ? (
        <EducationLockedToolView onOpenSpaces={() => onSelectProject(activeProjectId)} onOpenSidebar={onOpenSidebar} />
      ) : (
      <div className="ws-scroll-hide flex-1 overflow-y-auto overflow-x-hidden">
        <div className="grid w-full gap-4 px-4 pb-16 pt-5 md:px-6 lg:grid-cols-[218px_minmax(0,1fr)] lg:px-7">
          <aside className="min-w-0 self-start rounded-md bg-[hsl(0_0%_8.5%)] p-1.5">
            <div className="mb-1 flex items-center justify-between px-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                {t("workspace.home.projects")}
              </div>
              <button
                type="button"
                onClick={onCreateProject}
                className="grid h-5 w-5 place-items-center rounded text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                title={t("workspace.home.new_project_tooltip")}
              >
                <Plus className="h-3 w-3" strokeWidth={2} />
              </button>
            </div>
            <ul className="ws-scroll-hide max-h-[360px] space-y-px overflow-y-auto">
              {projectCards.map((project) => {
                const active = selectedProject?.id === project.id;
                const canManage = !project.ownerId || project.ownerId === user?.id;
                const protectedProject = project.name === DEFAULT_PROJECT_NAME;
                const teamProject = Boolean(project.ownerId && project.ownerId !== user?.id);
                return (
                  <li key={project.id} className="group/project relative">
                    <button
                      type="button"
                      onClick={() => onSelectProject(project.id)}
                      className={cn(
                        "flex h-7 w-full items-center gap-1.5 rounded px-1.5 text-left text-[12px] transition-colors",
                        active
                          ? "bg-[hsl(0_0%_16%)] text-zinc-50"
                          : "text-zinc-500 hover:bg-[hsl(0_0%_13%)] hover:text-zinc-200",
                      )}
                    >
                      <span
                        className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px]"
                        style={{ background: project.color }}
                      >
                        <project.icon className="h-2 w-2 text-zinc-950" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {project.name}
                      </span>
                      <span className="min-w-4 rounded bg-black/20 px-1 py-px text-center text-[10px] font-semibold text-zinc-500">
                        {project.spaceCount}
                      </span>
                      {teamProject && (
                        <span className="rounded bg-sky-400/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-sky-200">
                          {t("common.team")}
                        </span>
                      )}
                    </button>
                    {canManage && !protectedProject && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteProject(project.id);
                        }}
                        className="absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-zinc-500 opacity-0 transition-all hover:bg-red-500/15 hover:text-red-300 group-hover/project:opacity-100"
                        title={t("workspace.home.delete_project_tooltip", { name: project.name })}
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-[hsl(0_0%_8.5%)] px-3 py-2">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                  <Users className="h-3 w-3" />
                  {ownerLabel}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center rounded-md bg-[hsl(0_0%_12%)] p-0.5">
                  {(["all", "mine", "team"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setFilter(item)}
                      className={cn(
                        "h-6 rounded px-2.5 text-[11.5px] font-medium capitalize transition-colors",
                        filter === item
                          ? "bg-white text-zinc-950"
                          : "text-zinc-400 hover:bg-white/[0.05] hover:text-white",
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleNewSpace}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-white/[0.08] px-2.5 text-[11.5px] font-semibold text-zinc-50 transition-colors hover:bg-white/[0.13]"
                >
                  <Plus className="h-3 w-3" />
                  {t("workspace.spaces.new_space")}
                </button>
              </div>
            </div>

            {spaces.length === 0 ? (
              <EmptyState
                title={filter === "team" ? "No team spaces in this project" : t("workspace.spaces.empty_no_spaces")}
                hint={
                  filter === "team"
                    ? "Spaces from teammates in this project will appear here."
                    : t("workspace.spaces.empty_no_spaces_hint")
                }
                cta={
                  filter !== "team"
                    ? { label: t("workspace.spaces.new_space"), onClick: handleNewSpace }
                    : undefined
                }
              />
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                {spaces.map((space) => (
                  <SpaceCard
                    key={space.id}
                    ws={space}
                    canManage={!space.ownerId || space.ownerId === user?.id}
                    onOpen={() => navigate(`/app/workspace/${space.id}`)}
                    onRename={() => handleRename(space.id, space.name)}
                    onDuplicate={() => handleDuplicate(space.id)}
                    onDelete={() => handleDelete(space.id, space.name)}
                  />
                ))}
                <li className="group relative cursor-pointer overflow-hidden rounded-lg bg-[hsl(0_0%_8.5%)] transition-colors hover:bg-[hsl(0_0%_10%)]">
                  <button
                    type="button"
                    onClick={handleNewSpace}
                    className="block w-full text-left"
                  >
                    <div className="flex aspect-[16/10] items-center justify-center bg-[hsl(0_0%_5%)] text-zinc-500">
                      <Plus className="h-5 w-5" />
                    </div>
                    <div className="px-3.5 py-3">
                      <div className="truncate text-[13.5px] font-semibold leading-tight text-zinc-50">
                        {t("workspace.spaces.new_space")}
                      </div>
                      <div className="mt-1 text-[15.5px] leading-normal text-transparent" aria-hidden="true">
                        .
                      </div>
                    </div>
                  </button>
                </li>
              </ul>
            )}
          </section>
        </div>
      </div>
      )}
    </>
  );
};

const SpacesView = ({
  activeProjectId,
  projects,
  onSelectProject,
  onOpenSidebar,
  educationLockedStudent = false,
}: {
  activeProjectId: string | null;
  projects: ProjectMeta[];
  onSelectProject: (id: string | null) => void;
  onOpenSidebar?: () => void;
  educationLockedStudent?: boolean;
}) => {
  const navigate = useNavigate();
  const { t, t: i18n } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const canvases = useWorkspaceStore((s) => s.canvases);
  const graphs = useWorkspaceStore((s) => s.graphs);
  const canvasIndex = useMemo(() => buildCanvasIndex(canvases), [canvases]);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
  const duplicateWorkspace = useWorkspaceStore((s) => s.duplicateWorkspace);
  const mergeServerWorkspaces = useWorkspaceStore(
    (s) => s.mergeServerWorkspaces,
  );
  const { data: educationSpaceStatuses = EMPTY_EDUCATION_SPACE_STATUS_MAP } =
    useEducationSpaceStatusMap(user?.id, educationLockedStudent);

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
          !educationLockedStudent &&
          (!w.ownerId || w.ownerId === user.id) &&
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
        if (graph.ownerId && graph.ownerId !== user.id) continue;
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
  }, [user?.id, authLoading, educationLockedStudent, mergeServerWorkspaces]);

  const handleNew = async () => {
    if (educationLockedStudent) {
      toast.error(i18n("workspace.home.scanClassQrOrOpen"));
      return;
    }
    const { workspaceId, canvasId } = createWorkspace(t("workspace.spaces.untitled_space"), activeProjectId);
    if (user?.id) {
      const result = await persistNewWorkspaceBundle(workspaceId, canvasId, user.id);
      if (!result.ok) {
        console.warn("[workspace] create space server save failed:", result.error);
      }
    }
    navigate(`/app/workspace/${workspaceId}`);
  };

  const [tab, setTab] = useState<"mine" | "shared" | "templates">("mine");

  const visibleWorkspaceIds = useMemo(() => {
    return [...workspaces]
      .filter(
        (ws) =>
          (!educationLockedStudent || Boolean(ws.classId)) &&
          (educationLockedStudent ||
            !activeProjectId ||
            !ws.projectId ||
            ws.projectId === activeProjectId),
      )
      .filter((ws) =>
        tab === "shared"
          ? Boolean(ws.ownerId && ws.ownerId !== user?.id)
          : tab === "mine"
            ? !ws.ownerId || ws.ownerId === user?.id
            : false,
      )
      .map((ws) => ws.id);
  }, [activeProjectId, educationLockedStudent, tab, user?.id, workspaces]);

  useHydrateSpacePreviewGraphs(visibleWorkspaceIds, user?.id, authLoading);

  const buckets = useMemo(() => {
    return groupByMonth(
      [...workspaces]
        .filter(
          (ws) =>
            (!educationLockedStudent || Boolean(ws.classId)) &&
            (educationLockedStudent ||
              !activeProjectId ||
              !ws.projectId ||
              ws.projectId === activeProjectId),
        )
        .filter((ws) =>
          tab === "shared"
            ? Boolean(ws.ownerId && ws.ownerId !== user?.id)
            : tab === "mine"
              ? !ws.ownerId || ws.ownerId === user?.id
              : false,
        )
        .map((ws) =>
          applyEducationSpaceStatus(
            buildSpaceCardData(ws, canvasIndex, graphs),
            educationSpaceStatuses,
          ),
        ),
    );
  }, [activeProjectId, educationLockedStudent, tab, user?.id, workspaces, canvasIndex, graphs, educationSpaceStatuses]);

  const handleRename = (id: string, currentName: string) => {
    const next = prompt(t("workspace.spaces.rename_prompt"), currentName);
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
    if (!confirm(t("workspace.spaces.delete_confirm", { name: displayName }))) return;
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
    const toastId = toast.loading(t("workspace.toast.duplicating"));
    let newWorkspaceId: string;
    try {
      const res = duplicateWorkspace(id);
      newWorkspaceId = res.workspaceId;
    } catch (err) {
      console.error("[workspace] duplicate failed:", err);
      toast.error(t("workspace.toast.couldnt_duplicate"), { id: toastId });
      return;
    }
    // Source vanished — duplicateWorkspace returns the source id
    // unchanged in that case, so bail with an error toast.
    if (newWorkspaceId === id) {
      toast.error(t("workspace.toast.couldnt_duplicate"), { id: toastId });
      return;
    }

    const newMeta = useWorkspaceStore
      .getState()
      .workspaces.find((w) => w.id === newWorkspaceId);
    const newName = newMeta?.name ?? t("workspace.toast.duplicated_space_fallback");

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
          toast.success(t("workspace.toast.duplicated_as", { name: newName }), {
            id: toastId,
            action: {
              label: t("workspace.toast.open"),
              onClick: () => navigate(`/app/workspace/${newWorkspaceId}`),
            },
          });
        } catch (err) {
          console.warn("[workspace] duplicate server push failed:", err);
          // Local copy is already there — surface a soft warning, not
          // a hard error. The user can still open the duplicate; the
          // canvas's own autosave will retry the server push.
          toast.warning(t("workspace.toast.duplicated_offline", { name: newName }), {
            id: toastId,
            description: t("workspace.toast.duplicate_offline_desc"),
            action: {
              label: t("workspace.toast.open"),
              onClick: () => navigate(`/app/workspace/${newWorkspaceId}`),
            },
          });
        }
      })();
    } else {
      // Guest — no server push, resolve the toast right away.
      toast.success(t("workspace.toast.duplicated_as", { name: newName }), {
        id: toastId,
        action: {
          label: t("workspace.toast.open"),
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
  return (
    <>
      {/* Slim chrome bar — keeps the workspace selector + user menu
          visible. Title moved to the hero block below per the new
          Magnific-style layout. */}
      <PageHeader
        title=""
        onOpenSidebar={onOpenSidebar}
        rightSlot={
          <div className="flex items-center gap-3">
            <UserMenu />
          </div>
        }
      />

      <div className="ws-scroll-hide flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-2 md:px-6 md:pt-3 lg:px-8 lg:pt-3">
          {/* ── Compact header + controls ─────────────────────── */}
          <header className="workspace-spaces-compact mb-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="mr-2 text-[40px] font-bold leading-none tracking-tight text-zinc-50 md:text-[48px] lg:text-[56px]">
              {t("workspace.spaces.title")}
              </h1>
              {!educationLockedStudent && (
                <ProjectQuickSwitch
                  projects={projects}
                  workspaces={workspaces}
                  activeProjectId={activeProjectId}
                  onSelectProject={onSelectProject}
                />
              )}
            </div>

            {/* ── Filter/action row — compact by design ────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SpacesTabs tab={tab} onChange={setTab} />
              <div className="flex items-center gap-1.5">
                {!educationLockedStudent && (
                  <button
                    type="button"
                    onClick={handleNew}
                    className="flex h-[34px] items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 text-[14px] font-medium text-zinc-100 transition-colors hover:bg-white/[0.12]"
                  >
                    <Plus className="h-3.5 w-3.5" /> {t("workspace.spaces.new_space")}
                  </button>
                )}
                <SpacesIconBtn icon={Heart} title={t("workspace.spaces.favorites")} />
                <SpacesIconBtn icon={SlidersHorizontal} title={t("workspace.spaces.filter")} />
                <SpacesIconBtn icon={Search} title={t("workspace.spaces.search")} />
              </div>
            </div>
          </header>

          {/* ── Content — only "My spaces" has data today; Shared /
              Templates render an empty placeholder so the tabs aren't
              dead clicks. */}
          {tab === "templates" ? (
            <EmptyState
              title={t("workspace.spaces.empty_no_templates")}
              hint={t("workspace.spaces.empty_no_templates_hint")}
            />
          ) : buckets.length === 0 ? (
            <EmptyState
              title={
                tab === "shared"
                  ? t("workspace.spaces.empty_no_shared")
                  : t("workspace.spaces.empty_no_spaces")
              }
              hint={
                tab === "shared"
                  ? t("workspace.spaces.empty_no_shared_hint")
                  : t("workspace.spaces.empty_no_spaces_hint")
              }
              cta={
                tab === "mine" && !educationLockedStudent
                  ? { label: t("workspace.spaces.new_space"), onClick: handleNew }
                  : undefined
              }
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
                      canManage={!educationLockedStudent && (!ws.ownerId || ws.ownerId === user?.id)}
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
  const { t, t: i18n } = useLanguage();
  const items: { key: "mine" | "shared" | "templates"; label: string; icon: LucideIcon }[] = [
    { key: "mine", label: t("workspace.spaces.tab_my"), icon: UserCircle2 },
    { key: "shared", label: t("workspace.spaces.tab_shared"), icon: Users },
    { key: "templates", label: t("workspace.spaces.tab_templates"), icon: LayoutGrid },
  ];
  return (
    <div className="inline-flex rounded-lg bg-white/[0.03] p-0.5">
      {items.map((it) => {
        const active = tab === it.key;
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={cn(
              "flex h-[34px] items-center gap-1.5 rounded-md px-2.5 text-[14px] font-medium transition-colors",
              active
                ? "bg-white/[0.08] text-zinc-50"
                : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
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
    className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-white/[0.03] text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
  >
    <Icon className="h-3.5 w-3.5" />
  </button>
);

const SpaceToolbar = ({ onNew }: { onNew: () => void }) => {
  const { t, t: i18n } = useLanguage();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onNew}
        className="flex items-center gap-1.5 rounded-md bg-white/[0.06] px-3 py-1.5 text-[13.5px] font-medium text-zinc-100 transition-colors hover:bg-white/[0.1]"
      >
        <Plus className="h-3.5 w-3.5" /> {t("workspace.spaces.new_space")}
      </button>
      <SegmentDivider />
      <ChromePill icon={ChevronDown} label={t("workspace.home.projects")} />
      <ChromeIconBtn icon={List} title={t("workspace.spaces.list_view")} />
      <ChromeIconBtn icon={LayoutGrid} title={t("workspace.spaces.grid_view")} active />
      <ChromeIconBtn icon={Heart} title={t("workspace.spaces.favorites")} />
      <ChromeIconBtn icon={Search} title={t("workspace.spaces.search")} />
    </div>
  );
};

const SpaceMediaTile = ({
  item,
  className,
}: {
  item: PreviewMedia;
  className?: string;
}) => {
  if (item.kind === "video") {
    return (
      <video
        src={item.url}
        muted
        playsInline
        preload="metadata"
        className={cn("h-full w-full bg-black object-cover", className)}
      />
    );
  }
  return (
    <img
      src={item.url}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn("h-full w-full bg-black object-cover", className)}
    />
  );
};

const SpaceMediaPreview = memo(function SpaceMediaPreview({
  media,
}: {
  media: PreviewMedia[];
}) {
  const items = media.slice(0, SPACE_PREVIEW_MEDIA_LIMIT);
  if (items.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,hsl(0_0%_13%),hsl(0_0%_4%)_72%)]">
        <Layers className="h-8 w-8 text-white/12" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <SpaceMediaTile item={items[0]} className="transition-transform duration-500 group-hover:scale-[1.035] group-hover/space:scale-[1.035]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/42 via-black/8 to-transparent" />
      {items.length > 1 && (
        <div className="pointer-events-none absolute bottom-2 right-2 flex max-w-[72%] gap-1">
          {items.slice(1, 4).map((item, index) => (
            <div
              key={`${item.url}-${index}`}
              className="h-10 w-12 overflow-hidden rounded-md bg-black/60 ring-1 ring-white/20 backdrop-blur-sm"
            >
              <SpaceMediaTile item={item} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

const SpaceCard = memo(function SpaceCard({
  ws,
  canManage = true,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  ws: SpaceCardData;
  canManage?: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { t, t: i18n } = useLanguage();
  const cardRef = useRef<HTMLLIElement | null>(null);
  const [renderPreview, setRenderPreview] = useState(false);
  const canDuplicate = canManage && !ws.classId;

  useEffect(() => {
    if (renderPreview) return;
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setRenderPreview(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRenderPreview(true);
          observer.disconnect();
        }
      },
      { rootMargin: "900px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [renderPreview]);

  return (
    <li ref={cardRef} className="group relative cursor-pointer overflow-hidden rounded-lg bg-[hsl(0_0%_8.5%)] transition-colors hover:bg-[hsl(0_0%_10%)]">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
      >
        <div className="relative aspect-video overflow-hidden bg-[hsl(0_0%_5%)]">
          {renderPreview ? (
            <SpaceMediaPreview media={ws.previewMedia} />
          ) : (
            <div className="h-full w-full bg-[hsl(0_0%_5%)]" />
          )}
        </div>

        <div className="flex h-[54px] flex-col justify-center gap-1 px-3.5">
          <div className="flex min-h-0 items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-[16px] text-zinc-50">
              {ws.name}
            </div>
            {!canManage && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                <Users className="h-3 w-3" />
                {t("common.team")}
              </span>
            )}
            {ws.educationStatus && ws.educationStatus !== "active" && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                {getEducationStatusLabel(ws.educationStatus)}
              </span>
            )}
          </div>
          <div className="truncate text-[12px] leading-[15px] text-zinc-500">
            {timeAgo(ws.updatedAt)}
          </div>
        </div>
      </button>

      <div className="pointer-events-auto absolute right-2 top-2 flex gap-1 opacity-100 transition-opacity lg:pointer-events-none lg:opacity-0 lg:group-hover:pointer-events-auto lg:group-hover:opacity-100">
        {canManage && (
          <ActionButton title={t("workspace.spaces.action_rename")} onClick={(e) => { e.stopPropagation(); onRename(); }} icon={Pencil} />
        )}
        {canDuplicate && (
          <ActionButton title={t("workspace.spaces.action_duplicate")} onClick={(e) => { e.stopPropagation(); onDuplicate(); }} icon={Copy} />
        )}
        {canManage && (
          <ActionButton title={t("workspace.spaces.action_delete")} danger onClick={(e) => { e.stopPropagation(); onDelete(); }} icon={Trash2} />
        )}
      </div>
    </li>
  );
});

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
  onOpenSidebar,
}: {
  title: string;
  rightSlot?: React.ReactNode;
  /** When provided, renders a hamburger button on mobile (`md:hidden`)
   *  that calls back into the dashboard to open the WorkspaceSidebar
   *  drawer. Pages that don't pass this (very few — pretty much only
   *  modals / nested screens) keep a plain header. */
  onOpenSidebar?: () => void;
}) => {
  const { t, t: i18n } = useLanguage();
  return (
  /* 2026-05: drop the bottom hairline. Header sits flush on Layer-0
   *  page bg; the content cards underneath are Layer-1/2 so the
   *  header reads as a top strip without needing a divider. */
  <div className="flex h-11 shrink-0 items-center gap-3 px-4 md:px-6 lg:h-10 lg:px-8">
    {onOpenSidebar && (
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label={t("workspace.spaces.open_menu")}
        className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-zinc-300 hover:bg-white/[0.06] hover:text-white md:hidden"
      >
        {/* Inline SVG so we don't pull a new icon import for one button */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
    )}
    <h1 className="flex-1 truncate text-[15.5px] font-medium tracking-tight text-zinc-300">
      {title}
    </h1>
    {rightSlot}
  </div>
  );
};

const MonthHeader = ({ label }: { label: string }) => (
  <div className="mb-3 flex items-center gap-2 text-[15.5px] text-zinc-400">
    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full">
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
    className="flex h-8 items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 text-[14.5px] text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
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
        ? "bg-white/[0.08] text-zinc-100"
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
  <div className="rounded-2xl bg-white/[0.02] px-5 py-12 text-center md:px-10 md:py-16">
    <div className="text-[16.5px] font-semibold text-zinc-200">{title}</div>
    <p className="mt-2 text-[15.5px] text-zinc-500">{hint}</p>
    {cta && (
      <button
        type="button"
        onClick={cta.onClick}
        className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-md bg-white/[0.08] px-4 text-[13.5px] font-medium text-zinc-100 transition-colors hover:bg-white/[0.12] lg:min-h-0 lg:py-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        {cta.label}
      </button>
    )}
  </div>
);

const Placeholder = ({
  section,
  onOpenSidebar,
}: {
  section: Section;
  onOpenSidebar?: () => void;
}) => {
  const { t, t: i18n } = useLanguage();
  // Section title resolver — returns a localised label for the page
  // header. Tool sections still pull from STANDALONE_TOOLS (these
  // carry their own brand-stable names like "Image Generator").
  const title = (() => {
    switch (section) {
      case "home":
        return t("workspace.home.title");
      case "search":
        return t("workspace.spaces.section_search");
      case "spaces":
        return t("workspace.spaces.title");
      case "image_gen":
        return STANDALONE_TOOLS.image_gen.title;
      case "video_gen":
        return STANDALONE_TOOLS.video_gen.title;
      case "voice_gen":
        return STANDALONE_TOOLS.voice_gen.title;
      case "image_to_3d":
        return STANDALONE_TOOLS.image_to_3d.title;
      case "community":
        return t("workspace.spaces.section_community");
      case "projects":
        return t("workspace.spaces.section_projects");
      case "tools":
        return t("workspace.spaces.section_all_tools");
      case "stock":
        return t("workspace.spaces.section_stock");
      case "assistant":
        return t("workspace.spaces.section_assistant");
      default:
        return "";
    }
  })();
  return (
    <>
      <PageHeader
        title={title}
        rightSlot={<UserMenu />}
        onOpenSidebar={onOpenSidebar}
      />
      <div className="flex flex-1 items-center justify-center p-12">
        <EmptyState
          title={t("workspace.spaces.coming_soon")}
          hint={t("workspace.spaces.coming_soon_hint")}
        />
      </div>
    </>
  );
};

/* ════════════════════════════════════════════════════════════
 * Canvas minimap — SVG snapshot with real images at node positions
 * ════════════════════════════════════════════════════════════ */

const NODE_FILL: Record<string, string> = {
  textNode: "hsl(220 15% 22%)",
  groupNode: "transparent",
};
const TOOL_FILL = "hsl(220 15% 18%)";

function buildMinimapDataUri(
  cacheKey: string,
  nodes: MiniNode[],
  edges: MiniEdge[],
): string | null {
  if (nodes.length === 0) return null;
  const previewNodes = selectMinimapNodes(nodes);
  const previewNodeIds = new Set(previewNodes.map((node) => node.id));
  const previewEdges = edges
    .filter((edge) => previewNodeIds.has(edge.source) && previewNodeIds.has(edge.target))
    .slice(0, MINIMAP_EDGE_LIMIT);
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h));
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pad = span * 0.06;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = Math.max(maxX - minX + pad * 2, 1);
  const vbH = Math.max(maxY - minY + pad * 2, 1);

  const byId = new Map(previewNodes.map((n) => [n.id, n] as const));
  const centerOf = (n: MiniNode) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
  const strokeW = Math.max(span * 0.004, 1);
  const nodeStroke = Math.max(span * 0.0015, 0.5);
  const cornerR = Math.max(span * 0.018, 6);
  const seed = stableHash(cacheKey);
  const dotsId = `mm-dots-${seed}`;

  const edgeSvg = previewEdges.map((e, i) => {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) return "";
    const A = centerOf(a);
    const B = centerOf(b);
    const dx = B.x - A.x;
    const offset = Math.max(Math.abs(dx) * 0.4, span * 0.02);
    return `<path data-i="${i}" d="M ${A.x},${A.y} C ${A.x + offset},${A.y} ${B.x - offset},${B.y} ${B.x},${B.y}" />`;
  }).join("");

  const nodeSvg = previewNodes.map((n) => {
    const isGroup = n.type === "groupNode";
    const fill = NODE_FILL[n.type ?? ""] ?? TOOL_FILL;
    const baseStroke = isGroup ? "hsl(0 0% 100% / 0.18)" : "hsl(0 0% 100% / 0.10)";
    const dash = isGroup ? ` stroke-dasharray="${strokeW * 3} ${strokeW * 2}"` : "";

    if (n.imageUrl) {
      return `
        <g>
          <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${cornerR}" ry="${cornerR}" fill="hsl(215 22% 18%)" stroke="${baseStroke}"${dash} stroke-width="${nodeStroke}" />
          <rect x="${n.x + n.w * 0.08}" y="${n.y + n.h * 0.1}" width="${n.w * 0.84}" height="${n.h * 0.8}" rx="${cornerR * 0.65}" ry="${cornerR * 0.65}" fill="hsl(210 18% 30%)" opacity="0.7" />
          <path d="M ${n.x + n.w * 0.12},${n.y + n.h * 0.78} L ${n.x + n.w * 0.38},${n.y + n.h * 0.48} L ${n.x + n.w * 0.56},${n.y + n.h * 0.62} L ${n.x + n.w * 0.86},${n.y + n.h * 0.28} L ${n.x + n.w * 0.88},${n.y + n.h * 0.86} L ${n.x + n.w * 0.12},${n.y + n.h * 0.86} Z" fill="hsl(160 55% 42%)" opacity="0.9" />
          <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${cornerR}" ry="${cornerR}" fill="none" stroke="hsl(0 0% 100% / 0.14)" stroke-width="${nodeStroke}" />
        </g>`;
    }

    return `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${cornerR}" ry="${cornerR}" fill="${isGroup ? "transparent" : fill}" stroke="${isGroup ? "hsl(220 15% 28%)" : "hsl(0 0% 100% / 0.10)"}" stroke-width="${nodeStroke}" />`;
  }).join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" preserveAspectRatio="xMidYMid meet">
      <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="hsl(0 0% 4%)" />
      <defs>
        <pattern id="${dotsId}" width="${Math.max(span * 0.025, 8)}" height="${Math.max(span * 0.025, 8)}" patternUnits="userSpaceOnUse">
          <circle cx="0" cy="0" r="${Math.max(span * 0.0012, 0.4)}" fill="hsl(0 0% 11%)" />
        </pattern>
      </defs>
      <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="url(#${dotsId})" />
      <g stroke="hsl(258 60% 65%)" stroke-opacity="0.55" stroke-width="${strokeW}" fill="none">${edgeSvg}</g>
      <g>${nodeSvg}</g>
    </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const CanvasMinimap = memo(function CanvasMinimap({
  cacheKey,
  nodes,
  edges,
}: {
  cacheKey: string;
  nodes: MiniNode[];
  edges: MiniEdge[];
}) {
  const src = useMemo(() => {
    if (nodes.length === 0) return null;
    const cached = readPreviewCache(cacheKey);
    if (cached) return cached;
    const generated = buildMinimapDataUri(cacheKey, nodes, edges);
    if (generated) writePreviewCache(cacheKey, generated);
    return generated;
  }, [cacheKey, nodes, edges]);

  if (!src) return <div className="h-full w-full bg-[hsl(0_0%_5%)]" />;

  return (
    <img
      src={src}
      alt=""
      decoding="async"
      draggable={false}
      className="h-full w-full object-cover"
    />
  );
});
