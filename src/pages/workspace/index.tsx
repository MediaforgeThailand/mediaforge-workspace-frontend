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
import { useLanguage, getLanguageLocale, type Language } from "@/contexts/LanguageContext";
import { useSignInModal } from "@/hooks/useSignInModal";
import type { TranslationKey } from "@/contexts/locales/en";
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
  Code2,
  ArrowRight,
  Boxes,
  Download,
  FileVideo,
  List,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  UserCircle2,
  Video,
  WandSparkles,
  Workflow,
  X,
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
import WorkspaceTopBar from "@/components/workspace/WorkspaceTopBar";
import WorkspaceSidebar, {
  type SectionKey,
} from "@/components/workspace/WorkspaceSidebar";
import StandaloneGenerator, {
  type StandaloneProjectOption,
} from "@/components/workspace/StandaloneGenerator";
import { StandaloneToolHeaderCard } from "@/components/workspace/CreateImagePanel";
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
import { getProjectAvatar } from "@/components/workspace/projectAvatars";
import academyHeaderWorkspace from "@/assets/academy-header-workspace.png";
import homeFeatureWorkspaceHero from "@/assets/home-feature-workspace-hero.png";
import homeFeatureCinematicHero from "@/assets/home-feature-cinematic-hero.png";
import homeFeature3dHero from "@/assets/home-feature-3d-model.webp";
import homeFeatureEditingHero from "@/assets/home-feature-editing.png";
import homeFeatureSoundHero from "@/assets/home-feature-sound-voice-hero.png";
import homeFeatureAcademyImage from "@/assets/home-feature-academy.png";
import academyHeaderCinematic from "@/assets/academy-header-cinematic.png";
import academyHeader3d from "@/assets/academy-header-3d.png";
import academyHeaderEditing from "@/assets/academy-header-editing.png";
import academyHeaderVoiceSound from "@/assets/academy-header-voice-sound.png";
import academyHeaderAcademy from "@/assets/academy-header-academy.png";

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
const SHOW_HOME_MOCKUP_SECTIONS = false;

const projectCreatedAt = (project: ProjectMeta): number =>
  project.createdAt ?? project.updatedAt;

const compareProjectsByCreatedAt = (a: ProjectMeta, b: ProjectMeta): number =>
  projectCreatedAt(a) - projectCreatedAt(b) ||
  a.name.localeCompare(b.name) ||
  a.id.localeCompare(b.id);

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
function monthLabel(ts: number, language: Language): string {
  return new Date(ts).toLocaleDateString(getLanguageLocale(language), {
    month: "long",
    year: "numeric",
  });
}

/** Bucket items by their month-of-update. Returns groups sorted
 *  newest-first; items within each group are sorted newest-first too. */
function groupByMonth<T extends { updatedAt: number }>(
  items: T[],
  language: Language,
): MonthBucket<T>[] {
  const map = new Map<string, MonthBucket<T>>();
  for (const it of items) {
    const d = new Date(it.updatedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        label: monthLabel(it.updatedAt, language),
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
  "image_upscale",
  "video_gen",
  "voice_gen",
  "voice_translate",
  "auto_subtitle",
  "smart_frames",
  "image_to_3d",
  "url_asset",
];

const STANDALONE_SECTIONS = new Set<SectionKey>([
  "image_gen",
  "image_upscale",
  "video_gen",
  "voice_gen",
  "voice_translate",
  "auto_subtitle",
  "image_to_3d",
  "url_asset",
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
  useDocumentTitle(t("workspace.home.document_title"));
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
  const openSignInModal = useSignInModal();
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
  const isSignedIn = Boolean(user?.id);
  const visibleProjects = useMemo(
    () => (isSignedIn ? projects : []),
    [isSignedIn, projects],
  );
  const visibleWorkspaces = useMemo(
    () => (isSignedIn ? workspaces : []),
    [isSignedIn, workspaces],
  );
  const visibleActiveProjectId = isSignedIn ? activeProjectId : null;

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
      [...visibleProjects]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((project) => ({
          id: project.id,
          name: project.name,
          updatedAt: project.updatedAt,
        })),
    [visibleProjects],
  );
  const projectIdsWithSpaces = useMemo(() => {
    const knownProjectIds = new Set(visibleProjects.map((project) => project.id));
    const ids = new Set<string>();
    for (const workspace of visibleWorkspaces) {
      if (workspace.projectId && knownProjectIds.has(workspace.projectId)) {
        ids.add(workspace.projectId);
      }
    }
    return ids;
  }, [visibleProjects, visibleWorkspaces]);

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
    if (!user?.id) {
      openSignInModal();
      return;
    }
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
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) return;
    if (project.ownerId && project.ownerId !== user?.id) {
      toast.error(t("workspace.toast.couldnt_delete_shared_project"));
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
          projects={visibleProjects}
          activeProjectId={visibleActiveProjectId}
          onSelectProject={isSignedIn ? setActiveProject : undefined}
          collapsed={section !== "home"}
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
          <div className="relative z-10 h-full w-[240px] max-w-[84vw]">
            <WorkspaceSidebar
              active={section}
              onCreate={handleCreateProject}
              projects={visibleProjects}
              activeProjectId={visibleActiveProjectId}
              onSelectProject={isSignedIn ? setActiveProject : undefined}
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
            projects={visibleProjects}
            activeProjectId={visibleActiveProjectId}
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
              projects={visibleProjects}
              activeProjectId={visibleActiveProjectId}
              onSelectProject={setActiveProject}
              onCreateProject={handleCreateProject}
              onDeleteProject={handleDeleteProject}
              onOpenSidebar={() => setMobileSidebarOpen(true)}
            />
          )
        )}
        {section === "spaces" && (
          <SpacesView
            activeProjectId={visibleActiveProjectId}
            projects={visibleProjects}
            onSelectProject={setActiveProject}
            onCreateProject={handleCreateProject}
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
        {section === "smart_frames" && (
          <HyperFramesSmartView
            projects={standaloneProjects}
            activeProjectId={visibleActiveProjectId}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />
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
              activeProjectId={visibleActiveProjectId}
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
          section !== "smart_frames" &&
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
            visibleProjects.length % PROJECT_COLOR_SWATCHES.length
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
  "hsl(64 100% 50%)",
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

function bindHorizontalScroller(strip: HTMLDivElement): () => void {
  let drag:
    | {
        pointerId: number;
        startX: number;
        scrollLeft: number;
        moved: boolean;
        captured: boolean;
      }
    | null = null;
  let suppressClick = false;
  const DRAG_THRESHOLD = 10;

  const canScroll = () => strip.scrollWidth > strip.clientWidth + 1;
  const clampScroll = (value: number) => {
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    return Math.max(0, Math.min(maxScroll, value));
  };

  const onWheel = (event: WheelEvent) => {
    if (!canScroll()) return;
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (delta === 0) return;

    event.preventDefault();
    event.stopPropagation();
    strip.scrollLeft = clampScroll(strip.scrollLeft + delta);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !canScroll()) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: strip.scrollLeft,
      moved: false,
      captured: false,
    };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(distance) <= DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.captured = true;
      strip.setPointerCapture?.(event.pointerId);
      strip.classList.add("is-dragging");
    }
    strip.scrollLeft = clampScroll(drag.scrollLeft - distance);
    event.preventDefault();
    event.stopPropagation();
  };

  const finishDrag = (pointerId: number) => {
    if (!drag || drag.pointerId !== pointerId) return;
    if (drag.moved) {
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    }
    if (drag.captured) strip.releasePointerCapture?.(pointerId);
    strip.classList.remove("is-dragging");
    drag = null;
  };

  const onPointerUp = (event: PointerEvent) => finishDrag(event.pointerId);
  const onPointerCancel = (event: PointerEvent) => finishDrag(event.pointerId);

  const onClickCapture = (event: MouseEvent) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  strip.addEventListener("wheel", onWheel, { passive: false });
  strip.addEventListener("pointerdown", onPointerDown);
  strip.addEventListener("pointermove", onPointerMove);
  strip.addEventListener("click", onClickCapture, true);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);

  return () => {
    strip.removeEventListener("wheel", onWheel);
    strip.removeEventListener("pointerdown", onPointerDown);
    strip.removeEventListener("pointermove", onPointerMove);
    strip.removeEventListener("click", onClickCapture, true);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    strip.classList.remove("is-dragging");
  };
}

interface HomeInspiration {
  id: string;
  titleKey: TranslationKey;
  src: string;
  kind: "image" | "video";
  previewSrc?: string;
  posterSrc?: string;
  previewVideoSrc?: string;
}

const HOME_INSPIRATIONS: HomeInspiration[] = [
  {
    id: "thumbnail-ui",
    titleKey: "workspace.home.inspiration.thumbnail_ui",
    src: "/inspire/thumbnail-ui.webm",
    previewVideoSrc: "/inspire/previews/thumbnail-ui-preview.webm",
    posterSrc: "/inspire/previews/thumbnail-ui-poster.webp",
    kind: "video",
  },
  {
    id: "full-screen",
    titleKey: "workspace.home.inspiration.full_screen",
    src: "/inspire/full-screen.webm",
    previewVideoSrc: "/inspire/previews/full-screen-preview.webm",
    posterSrc: "/inspire/previews/full-screen-poster.webp",
    kind: "video",
  },
  {
    id: "magnific-2882506457",
    titleKey: "workspace.home.inspiration.magnific_motion_1",
    src: "/inspire/magnific-2882506457.webm",
    previewVideoSrc: "/inspire/previews/magnific-2882506457-preview.webm",
    posterSrc: "/inspire/previews/magnific-2882506457-poster.webp",
    kind: "video",
  },
  {
    id: "magnific-2886588619",
    titleKey: "workspace.home.inspiration.magnific_motion_2",
    src: "/inspire/magnific-2886588619.webm",
    previewVideoSrc: "/inspire/previews/magnific-2886588619-preview.webm",
    posterSrc: "/inspire/previews/magnific-2886588619-poster.webp",
    kind: "video",
  },
  {
    id: "sketch-3",
    titleKey: "workspace.home.inspiration.sketch_3",
    src: "/inspire/sketch-3.png",
    previewSrc: "/inspire/previews/sketch-3.webp",
    kind: "image",
  },
  {
    id: "sketch-1",
    titleKey: "workspace.home.inspiration.sketch_1",
    src: "/inspire/sketch-1.png",
    previewSrc: "/inspire/previews/sketch-1.webp",
    kind: "image",
  },
  {
    id: "concept-art-3-4",
    titleKey: "workspace.home.inspiration.concept_art_3_4",
    src: "/inspire/concept-art-3-4.png",
    previewSrc: "/inspire/previews/concept-art-3-4.webp",
    kind: "image",
  },
  {
    id: "concept-art",
    titleKey: "workspace.home.inspiration.concept_art",
    src: "/inspire/concept-art.png",
    previewSrc: "/inspire/previews/concept-art.webp",
    kind: "image",
  },
  {
    id: "collage",
    titleKey: "workspace.home.inspiration.collage",
    src: "/inspire/collage.png",
    previewSrc: "/inspire/previews/collage.webp",
    kind: "image",
  },
  {
    id: "character-sheet",
    titleKey: "workspace.home.inspiration.character_sheet",
    src: "/inspire/character-sheet.png",
    previewSrc: "/inspire/previews/character-sheet.webp",
    kind: "image",
  },
];

interface HomeFeatureShowcaseItem {
  id: string;
  titleKey: TranslationKey;
  kickerKey: TranslationKey;
  descriptionKey: TranslationKey;
  bulletKeys: [TranslationKey, TranslationKey, TranslationKey];
  tileImage: string;
  heroImage: string;
  tint: string;
  actionSection?: Section;
  actionAnchor?: string;
}

const HOME_FEATURE_SHOWCASE: HomeFeatureShowcaseItem[] = [
  {
    id: "workspace",
    titleKey: "workspace.home.feature.workspace.title",
    kickerKey: "workspace.home.feature.workspace.kicker",
    descriptionKey: "workspace.home.feature.workspace.description",
    bulletKeys: [
      "workspace.home.feature.workspace.bullet1",
      "workspace.home.feature.workspace.bullet2",
      "workspace.home.feature.workspace.bullet3",
    ],
    tileImage: academyHeaderWorkspace,
    heroImage: homeFeatureWorkspaceHero,
    tint: "from-[#eeff15]/95 via-lime-300/65 to-white/40",
    actionSection: "spaces",
  },
  {
    id: "cinematic",
    titleKey: "workspace.home.feature.cinematic.title",
    kickerKey: "workspace.home.feature.cinematic.kicker",
    descriptionKey: "workspace.home.feature.cinematic.description",
    bulletKeys: [
      "workspace.home.feature.cinematic.bullet1",
      "workspace.home.feature.cinematic.bullet2",
      "workspace.home.feature.cinematic.bullet3",
    ],
    tileImage: academyHeaderCinematic,
    heroImage: homeFeatureCinematicHero,
    tint: "from-[#eeff15]/95 via-yellow-200/55 to-white/35",
    actionSection: "video_gen",
  },
  {
    id: "3d",
    titleKey: "workspace.home.feature.3d.title",
    kickerKey: "workspace.home.feature.3d.kicker",
    descriptionKey: "workspace.home.feature.3d.description",
    bulletKeys: [
      "workspace.home.feature.3d.bullet1",
      "workspace.home.feature.3d.bullet2",
      "workspace.home.feature.3d.bullet3",
    ],
    tileImage: academyHeader3d,
    heroImage: homeFeature3dHero,
    tint: "from-[#eeff15]/90 via-amber-200/55 to-white/35",
    actionSection: "image_to_3d",
  },
  {
    id: "editing",
    titleKey: "workspace.home.feature.editing.title",
    kickerKey: "workspace.home.feature.editing.kicker",
    descriptionKey: "workspace.home.feature.editing.description",
    bulletKeys: [
      "workspace.home.feature.editing.bullet1",
      "workspace.home.feature.editing.bullet2",
      "workspace.home.feature.editing.bullet3",
    ],
    tileImage: academyHeaderEditing,
    heroImage: homeFeatureEditingHero,
    tint: "from-[#eeff15]/90 via-cyan-100/45 to-white/30",
    actionSection: "image_gen",
  },
  {
    id: "sound",
    titleKey: "workspace.home.feature.sound.title",
    kickerKey: "workspace.home.feature.sound.kicker",
    descriptionKey: "workspace.home.feature.sound.description",
    bulletKeys: [
      "workspace.home.feature.sound.bullet1",
      "workspace.home.feature.sound.bullet2",
      "workspace.home.feature.sound.bullet3",
    ],
    tileImage: academyHeaderVoiceSound,
    heroImage: homeFeatureSoundHero,
    tint: "from-[#eeff15]/90 via-emerald-100/45 to-white/30",
    actionSection: "voice_gen",
  },
  {
    id: "academy",
    titleKey: "workspace.home.feature.academy.title",
    kickerKey: "workspace.home.feature.academy.kicker",
    descriptionKey: "workspace.home.feature.academy.description",
    bulletKeys: [
      "workspace.home.feature.academy.bullet1",
      "workspace.home.feature.academy.bullet2",
      "workspace.home.feature.academy.bullet3",
    ],
    tileImage: academyHeaderAcademy,
    heroImage: homeFeatureAcademyImage,
    tint: "from-[#eeff15]/90 via-orange-100/45 to-white/30",
    actionAnchor: "workspace-inspirations",
  },
];

const HomeFeatureShowcase = ({ onSection }: { onSection: (section: Section) => void }) => {
  const { t } = useLanguage();
  const [activeId, setActiveId] = useState(HOME_FEATURE_SHOWCASE[0].id);
  const activeFeature =
    HOME_FEATURE_SHOWCASE.find((item) => item.id === activeId) ??
    HOME_FEATURE_SHOWCASE[0];
  const handleAction = () => {
    if (activeFeature.actionSection) {
      onSection(activeFeature.actionSection);
      return;
    }
    if (activeFeature.actionAnchor) {
      document.getElementById(activeFeature.actionAnchor)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  return (
    <section className="rounded-[34px] bg-[#0b0b0b] px-4 py-6 shadow-[0_22px_90px_rgba(0,0,0,0.38)] sm:px-6 md:px-8 lg:px-10 lg:py-8">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:gap-3 xl:grid-cols-6">
        {HOME_FEATURE_SHOWCASE.map((item) => {
          const isActive = item.id === activeFeature.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              onPointerEnter={() => setActiveId(item.id)}
              onMouseEnter={() => setActiveId(item.id)}
              onFocus={() => setActiveId(item.id)}
              className={cn(
                "group relative h-[216px] overflow-visible rounded-[22px] border border-transparent p-0 text-left transition duration-300 ease-out sm:h-[246px] xl:h-[224px]",
                isActive
                  ? "z-10"
                  : "hover:z-10",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none absolute bottom-[36px] left-1/2 h-[118px] w-full -translate-x-1/2 rounded-[22px] border border-white/10 bg-gradient-to-br opacity-70 transition duration-300 group-hover:border-[#eeff15]/50 group-focus-visible:border-[#eeff15]/50 sm:bottom-[40px] sm:h-[138px] sm:w-[96%] xl:bottom-[38px] xl:h-[120px] xl:w-[94%]",
                  item.tint,
                )}
              />
              <img
                src={item.tileImage}
                alt=""
                className={cn(
                  "pointer-events-none absolute left-1/2 bottom-[72px] h-[104px] w-[88%] -translate-x-1/2 rounded-[14px] object-contain object-center drop-shadow-[0_18px_22px_rgba(0,0,0,0.48)] transition duration-300 ease-out sm:bottom-[82px] sm:h-[125px] sm:w-[84%] xl:bottom-[76px] xl:h-[110px] xl:w-[82%]",
                  isActive
                    ? "scale-[2.35] group-hover:scale-[2.8] group-focus-visible:scale-[2.8]"
                    : "scale-[2] group-hover:scale-[2.8] group-focus-visible:scale-[2.8]",
                )}
                loading="lazy"
                decoding="async"
              />
              <span
                className={cn(
                  "pointer-events-none absolute inset-x-1 bottom-0 text-center text-[18px] font-extrabold leading-none tracking-[-0.02em] text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.78)] transition duration-300 sm:text-[21px] xl:text-[18px]",
                  isActive && "text-[#eeff15] drop-shadow-[0_0_18px_rgba(238,255,21,0.28)]",
                )}
              >
                {t(item.titleKey)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-7 grid gap-7 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0">
          <h2 className="text-[42px] font-semibold leading-[0.92] tracking-[-0.02em] text-white sm:text-[56px] lg:text-[62px]">
            {t(activeFeature.titleKey)}
          </h2>
          <p className="mt-3 max-w-[560px] text-[15px] font-semibold leading-5 text-[#eeff15]">
            {t(activeFeature.kickerKey)}
          </p>
          <p className="mt-4 max-w-[620px] text-[15px] leading-5 text-white/76">
            {t(activeFeature.descriptionKey)}
          </p>
          <ul className="mt-4 space-y-2">
            {activeFeature.bulletKeys.map((bulletKey) => (
              <li key={bulletKey} className="flex items-start gap-3 text-[14px] font-medium leading-5 text-white/86">
                <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-[#eeff15] text-black">
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
                <span>{t(bulletKey)}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleAction}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#f6ff25_0%,#e5cf35_48%,#fff57a_100%)] px-7 text-[15px] font-semibold text-black shadow-[0_0_24px_rgba(238,255,21,0.24),inset_0_1px_0_rgba(255,255,255,0.72)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_34px_rgba(238,255,21,0.34),inset_0_1px_0_rgba(255,255,255,0.8)]"
          >
            {t("workspace.home.feature.action_label")}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="relative flex min-h-[320px] items-center justify-center">
          <img
            key={activeFeature.heroImage}
            src={activeFeature.heroImage}
            alt={t(activeFeature.titleKey)}
            className="max-h-[520px] w-full object-contain transition duration-500"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
};

interface AcademyVideo {
  id: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  duration: string;
  src: string;
  poster: string;
}

const ACADEMY_VIDEOS: AcademyVideo[] = [
  {
    id: "scene-monitor-fn",
    titleKey: "workspace.home.academy_video.scene_monitor_fn.title",
    descriptionKey: "workspace.home.academy_video.scene_monitor_fn.description",
    duration: "1:21",
    src: "/videos/academy/scene-monitor-fn.mp4",
    poster: "/videos/academy/scene-monitor-fn-poster.jpg",
  },
  {
    id: "full-screen",
    titleKey: "workspace.home.academy_video.full_screen.title",
    descriptionKey: "workspace.home.academy_video.full_screen.description",
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
  const openSignInModal = useSignInModal();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const recentWorkspaceOpenIds = useWorkspaceStore((s) => s.recentWorkspaceOpenIds);
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
  const markWorkspaceOpened = useWorkspaceStore((s) => s.markWorkspaceOpened);
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
      .sort(compareProjectsByCreatedAt)
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

  /* Recent creations — prefer spaces the user actually opened, then
   * fall back to updatedAt. Opening a space is not an edit, so we keep
   * this separate from WorkspaceMeta.updatedAt. */
  const recentWorkspaceIds = useMemo(() => {
    const eligible = [...workspaces].filter((ws) =>
      educationLockedStudent ? Boolean(ws.classId) : true,
    );
    const byId = new Map(eligible.map((ws) => [ws.id, ws]));
    const ordered = recentWorkspaceOpenIds
      .map((id) => byId.get(id))
      .filter((ws): ws is WorkspaceMeta => Boolean(ws));
    const seen = new Set(ordered.map((ws) => ws.id));
    const fallback = eligible
      .filter((ws) => !seen.has(ws.id))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return [...ordered, ...fallback].slice(0, 5).map((ws) => ws.id);
  }, [educationLockedStudent, recentWorkspaceOpenIds, workspaces]);

  useHydrateSpacePreviewGraphs(recentWorkspaceIds, user?.id, authLoading);

  const recentSpaces = useMemo(() => {
    const byId = new Map(workspaces.map((ws) => [ws.id, ws]));
    return recentWorkspaceIds
      .map((id) => byId.get(id))
      .filter((ws): ws is WorkspaceMeta => Boolean(ws))
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
    if (!user?.id) {
      openSignInModal();
      return;
    }
    if (!activeProjectId) {
      toast.error(t("workspace.toast.create_project_first_gen"));
      onCreateProject();
      return;
    }
    const { workspaceId, canvasId } = createWorkspace(t("workspace.spaces.untitled_space"), activeProjectId);
    markWorkspaceOpened(workspaceId);
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
  const featuredTools = HOME_TOOLS.slice(0, 5);
  const featuredTemplates = HOME_FEATURE_SHOWCASE.slice(0, 6);
  const previewInspirationCards = visibleInspirations.slice(0, 3);
  const totalSpaceCount = workspaces.filter(
    (ws) =>
      (educationLockedStudent ? Boolean(ws.classId) : true) &&
      (educationLockedStudent || !activeProjectId || !ws.projectId || ws.projectId === activeProjectId),
  ).length;
  const showRecentCreations = Boolean(user?.id && recentSpaces.length > 0);
  const toolStripRef = useRef<HTMLDivElement | null>(null);
  const recentGridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const strips = [toolStripRef.current, recentGridRef.current].filter(
      (strip): strip is HTMLDivElement => Boolean(strip),
    );
    if (strips.length === 0) return undefined;
    const cleanups = strips.map(bindHorizontalScroller);

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [showRecentCreations, recentSpaces.length]);

  const openFeature = (feature: HomeFeatureShowcaseItem) => {
    if (feature.actionSection) {
      onSection(feature.actionSection);
      return;
    }
    if (feature.actionAnchor) {
      document.getElementById(feature.actionAnchor)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  return (
    <div className="mf-home-page ws-scroll-hide flex-1 overflow-y-auto overflow-x-hidden">
      <WorkspaceTopBar
        title={t("workspace.home.title")}
        onOpenSidebar={onOpenSidebar}
      />

      <div className="mf-home-content">
        {activeClass && (
          <EducationClassDashboard
            active={activeClass}
            classes={studentClasses}
            onOpenSpaces={() => onSection("spaces")}
          />
        )}

        <section className="mf-home-hero" aria-label={t("workspace.home.hero.aria")}>
          <div className="mf-home-hero-copy">
            <div className="mf-home-hero-icon" aria-hidden="true">
              <Workflow className="h-[35px] w-[35px]" strokeWidth={1.45} />
            </div>
            <div>
              <p className="mf-home-hero-kicker">MediaForge Canvas</p>
              <h2 className="mf-home-hero-title">
                {t("workspace.home.hero.line1")}{" "}
                {t("workspace.home.hero.line2_prefix")}{" "}
                <span className="text-[#f4ff00]">{t("workspace.home.hero.line2_accent")}</span>
              </h2>
              <p className="mf-home-hero-subtitle">
                {t("workspace.home.feature.workspace.kicker")}
              </p>
            </div>
            <div className="mf-home-hero-actions">
              <button type="button" onClick={handleNew} className="mf-home-button mf-home-button-primary">
                <Plus className="h-4 w-4" />
                {t("workspace.home.new_space_tooltip")}
              </button>
              <button type="button" onClick={() => onSection("video_gen")} className="mf-home-button mf-home-button-secondary">
                <Video className="h-4 w-4" />
                {STANDALONE_TOOLS.video_gen.title}
              </button>
            </div>
          </div>

          <div className="mf-home-node-scene" aria-hidden="true">
            <span className="mf-home-node mf-home-node-a" />
            <span className="mf-home-node mf-home-node-b" />
            <span className="mf-home-node mf-home-node-c" />
            <span className="mf-home-node mf-home-node-d" />
            <span className="mf-home-connector mf-home-connector-a" />
            <span className="mf-home-connector mf-home-connector-b" />
            <span className="mf-home-connector mf-home-connector-c" />
            <span className="mf-home-label-chip mf-home-label-chip-a">Canvas</span>
            <span className="mf-home-label-chip mf-home-label-chip-b">AI</span>
          </div>
        </section>

        <section className="mf-home-section">
          <div className="mf-home-section-heading">
            <h2>{t("workspace.home.tools")}</h2>
            <button
              type="button"
              onClick={() => onSection("spaces")}
              className="mf-home-section-link"
            >
              {t("workspace.home.my_work")} →
            </button>
          </div>
          <div
            ref={toolStripRef}
            className="mf-home-tool-strip"
            aria-label={t("workspace.home.tools")}
          >
            <button
              type="button"
              onClick={() => onSection("spaces")}
              className="mf-home-tool-card"
              style={{ "--tool-accent": "#f4ff00" } as React.CSSProperties}
            >
              <span className="mf-home-tool-icon">
                <Workflow className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="mf-home-tool-title">{t("workspace.home.spaces")}</span>
                <span className="mf-home-tool-desc">{totalSpaceCount} spaces</span>
              </span>
              <strong className="mf-home-badge">New</strong>
            </button>
            {featuredTools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => onSection(tool.id)}
                className="mf-home-tool-card"
                style={{ "--tool-accent": tool.accent } as React.CSSProperties}
              >
                <span className="mf-home-tool-icon">
                  <tool.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="mf-home-tool-title">{tool.label}</span>
                  <span className="mf-home-tool-desc">{tool.subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {showRecentCreations && (
          <section className="mf-home-section">
            <div className="mf-home-section-heading">
              <h2>Recent creations</h2>
            </div>
            <div ref={recentGridRef} className="mf-home-recent-grid">
              {recentSpaces.slice(0, 5).map((space) => (
                <button
                  key={space.id}
                  type="button"
                  onClick={() => {
                    markWorkspaceOpened(space.id);
                    navigate(`/app/workspace/${space.id}`);
                  }}
                  className="mf-home-recent-card group/space"
                >
                  <div className="mf-home-recent-thumb">
                    <SpaceMediaPreview media={space.previewMedia} />
                    <span className="mf-home-recent-icon" aria-hidden="true">
                      <Workflow className="h-[16px] w-[16px]" />
                    </span>
                  </div>
                  <div className="mf-home-recent-copy">
                    <h3>{space.name}</h3>
                    <p>{timeAgo(space.updatedAt)}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {SHOW_HOME_MOCKUP_SECTIONS && (
          <>
            <section className="mf-home-section">
              <div className="mf-home-section-heading">
                <h2>Templates</h2>
              </div>
              <div className="mf-home-card-grid">
                {featuredTemplates.slice(0, 3).map((feature) => (
                  <button
                    key={feature.id}
                    type="button"
                    onClick={() => openFeature(feature)}
                    className="mf-home-media-card"
                  >
                    <div className="mf-home-media-thumb">
                      <img src={feature.tileImage} alt={t(feature.titleKey)} loading="lazy" decoding="async" />
                    </div>
                    <div className="mf-home-card-copy">
                      <h3>{t(feature.titleKey)}</h3>
                      <p>{t(feature.kickerKey)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section id="workspace-inspirations" className="mf-home-section scroll-mt-8">
              <div className="mf-home-section-heading">
                <h2>What's New</h2>
              </div>
              <div className="mf-home-news-grid">
                <button
                  type="button"
                  onClick={() => onSection("spaces")}
                  className="mf-home-news-card mf-home-canvas-news"
                >
                  <div className="mf-home-news-art">
                    <span className="mf-home-tiny-node" />
                    <span className="mf-home-tiny-node two" />
                    <span className="mf-home-tiny-node three" />
                  </div>
                  <div className="mf-home-news-copy">
                    <h3>Introducing Canvas</h3>
                    <p>Stop prompting, start composing.</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onSection("smart_frames")}
                  className="mf-home-news-card mf-home-key-news"
                >
                  <div className="mf-home-news-art mf-home-checker">
                    <span className="mf-home-mask-circle" />
                  </div>
                  <div className="mf-home-news-copy">
                    <h3>MediaForge Smart Frames</h3>
                    <p>Plan editable AI video cuts in one pass.</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onSection("image_gen")}
                  className="mf-home-news-card mf-home-remover-news"
                >
                  <div className="mf-home-news-art mf-home-sports">
                    <span className="mf-home-cutout" />
                  </div>
                  <div className="mf-home-news-copy">
                    <h3>Background Remover</h3>
                    <p>Clean AI cutouts for production assets.</p>
                  </div>
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
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
    <PageHeader title={i18n("workspace.home.classWorkspace")} onOpenSidebar={onOpenSidebar} />
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

const HYPERFRAMES_SMART_PRESETS = [
  {
    id: "cleancut",
    label: "Clean Cut",
    description: "Remove dead air and keep natural speech rhythm.",
  },
] as const;

type HyperFramesSmartPresetId = (typeof HYPERFRAMES_SMART_PRESETS)[number]["id"];

function smartFramesPresetLabel(id: HyperFramesSmartPresetId, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string {
  if (id === "cleancut") return t("workspace.standalone.smart_frames.preset_clean_cut");
  return HYPERFRAMES_SMART_PRESETS.find((preset) => preset.id === id)?.label ?? id;
}

function smartFramesPresetDescription(id: HyperFramesSmartPresetId, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string {
  if (id === "cleancut") return t("workspace.standalone.smart_frames.preset_clean_cut_desc");
  return HYPERFRAMES_SMART_PRESETS.find((preset) => preset.id === id)?.description ?? "";
}

function stripStandaloneStepPrefix(label: string): string {
  return label.replace(/^\s*\d+\.\s*/, "");
}

const HYPERFRAMES_SMART_STORAGE_VERSION = 2;
const HYPERFRAMES_SMART_STORAGE_PREFIX = "mediaforge:smart-frames:v1";
const HYPERFRAMES_SMART_DB_NAME = "mediaforge-smart-frames";
const HYPERFRAMES_SMART_DB_STORE = "sources";

const HYPERFRAMES_SMART_VISUALS: Record<
  HyperFramesSmartPresetId,
  { title: string; accent: string; glow: string; beats: string[] }
> = {
  cleancut: {
    title: "CLEAN CUT",
    accent: "#eaff00",
    glow: "rgba(234,255,0,.34)",
    beats: ["Detect silence", "Trim dead air", "Preserve speech", "Editable timeline"],
  },
};

function smartFramesStorageKey(userId: string | undefined, projectId: string | null): string {
  return `${HYPERFRAMES_SMART_STORAGE_PREFIX}:${userId ?? "anonymous"}:${projectId ?? "default"}`;
}

function smartFramesSourceBlobKey(userId: string | undefined, projectId: string | null): string {
  return `${userId ?? "anonymous"}:${projectId ?? "default"}:latest-source`;
}

function openSmartFramesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Browser storage is not available."));
      return;
    }
    const request = indexedDB.open(HYPERFRAMES_SMART_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HYPERFRAMES_SMART_DB_STORE)) {
        db.createObjectStore(HYPERFRAMES_SMART_DB_STORE);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open browser storage."));
    request.onsuccess = () => resolve(request.result);
  });
}

async function writeSmartFramesSourceBlob(key: string, file: File): Promise<void> {
  const db = await openSmartFramesDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HYPERFRAMES_SMART_DB_STORE, "readwrite");
    tx.objectStore(HYPERFRAMES_SMART_DB_STORE).put(file, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not save video locally."));
  });
  db.close();
}

async function readSmartFramesSourceBlob(key: string): Promise<Blob | null> {
  const db = await openSmartFramesDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(HYPERFRAMES_SMART_DB_STORE, "readonly");
    const request = tx.objectStore(HYPERFRAMES_SMART_DB_STORE).get(key);
    request.onsuccess = () => {
      const value = request.result;
      resolve(value instanceof Blob ? value : null);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not restore video."));
  });
  db.close();
  return blob;
}

function smartFramesPlanLines(plan: string, fallback: string[]): string[] {
  const lines = plan
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*•\d.)\s]+/, "")
        .replace(/\*\*/g, "")
        .trim(),
    )
    .filter((line) => line.length >= 10 && !/^concept:?$/i.test(line))
    .slice(0, 4);
  return lines.length > 0 ? lines : fallback;
}

type SmartFramesPersistedState = {
  version: number;
  prompt: string;
  presetId: HyperFramesSmartPresetId;
  plan: string;
  outputFileName: string;
  createdAt: number;
  sourceFileName: string;
  sourceFileType: string;
  sourceFileSize: number;
  sourceMeta: SmartFramesVideoMeta | null;
  sourceBlobKey: string;
  editorProjectId?: string;
  renderedOutputUrl?: string;
  renderedBy?: string;
  removedDuration?: number;
};

type SmartFramesDraftCue = {
  startTime: number;
  duration: number;
  text: string;
};

type SmartFramesDemoResult = {
  plan: string;
  outputUrl: string;
  outputFileName: string;
  createdAt: number;
  presetId: HyperFramesSmartPresetId;
  presetLabel: string;
  sourceFileName: string;
  sourceBlobKey?: string;
  editorProjectId?: string;
  editorProjectError?: string;
  renderedBy?: string;
  renderWarning?: string | null;
  cutUrl?: string;
  cutFileName?: string;
  originalDuration?: number;
  renderedDuration?: number;
  removedDuration?: number;
  changedByCut?: boolean;
  cues?: SmartFramesDraftCue[];
  segments?: Array<{ start: number; end: number; duration: number }>;
};

type SmartFramesVideoMeta = {
  width: number;
  height: number;
  duration: number;
};

function formatSmartFramesDuration(seconds?: number): string {
  if (!Number.isFinite(seconds) || !seconds) return "0:00";
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const rest = totalSeconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function smartFramesOutputName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim() || "smart-frames-demo";
  return `${base}-smart-frames-draft.mp4`;
}

function smartFramesRenderedOutputName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim() || "smart-frames";
  return `${base}-hyperframes.mp4`;
}

function smartFramesDraftLineText(line: string): string {
  const compact = line
    .replace(/^\s*(concept|timeline beats?|text overlays?|motion|transition|render notes?)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (compact.length <= 84) return compact;
  return compact.slice(0, 84).replace(/\s+\S*$/, "");
}

function buildSmartFramesDraftBeats({
  plan,
  presetId,
  duration,
}: {
  plan: string;
  presetId: HyperFramesSmartPresetId;
  duration: number;
}): Array<{ startTime: number; duration: number; text: string }> {
  const visual = HYPERFRAMES_SMART_VISUALS[presetId] ?? HYPERFRAMES_SMART_VISUALS.cleancut;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 12;
  const planLines = smartFramesPlanLines(plan, visual.beats)
    .map(smartFramesDraftLineText)
    .filter(Boolean);
  const texts = [visual.title, ...planLines].slice(0, 5);
  const segmentDuration = Math.max(1.2, safeDuration / Math.max(1, texts.length));

  return texts.map((text, index) => {
    const startTime = Math.min(safeDuration - 0.2, index * segmentDuration);
    const endTime =
      index === texts.length - 1
        ? safeDuration
        : Math.min(safeDuration, (index + 1) * segmentDuration);
    return {
      startTime,
      duration: Math.max(0.5, endTime - startTime),
      text,
    };
  });
}

function persistSmartFramesState({
  userId,
  projectId,
  state,
}: {
  userId: string | undefined;
  projectId: string | null;
  state: SmartFramesPersistedState;
}) {
  try {
    localStorage.setItem(smartFramesStorageKey(userId, projectId), JSON.stringify(state));
  } catch {
    /* local persistence is a best-effort demo convenience */
  }
}

function clearPersistedSmartFramesState(userId: string | undefined, projectId: string | null) {
  try {
    localStorage.removeItem(smartFramesStorageKey(userId, projectId));
  } catch {
    /* ignore storage cleanup failures */
  }
}

function readPersistedSmartFramesState(
  userId: string | undefined,
  projectId: string | null,
): SmartFramesPersistedState | null {
  try {
    const raw = localStorage.getItem(smartFramesStorageKey(userId, projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SmartFramesPersistedState>;
    const knownPreset = HYPERFRAMES_SMART_PRESETS.some((preset) => preset.id === parsed.presetId);
    if (
      parsed.version !== HYPERFRAMES_SMART_STORAGE_VERSION ||
      !knownPreset ||
      typeof parsed.plan !== "string" ||
      typeof parsed.sourceBlobKey !== "string" ||
      typeof parsed.sourceFileName !== "string"
    ) {
      return null;
    }
    return parsed as SmartFramesPersistedState;
  } catch {
    return null;
  }
}

async function readSmartFramesVideoMeta(sourceUrl: string): Promise<SmartFramesVideoMeta> {
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = sourceUrl;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
    };
    video.onloadedmetadata = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Could not read video metadata."));
    };
  });
  const meta = {
    width: video.videoWidth || 1920,
    height: video.videoHeight || 1080,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
  };
  video.removeAttribute("src");
  video.load();
  return meta;
}

type SmartFramesWorkerRenderResult = {
  ok: boolean;
  error?: string;
  outputUrl?: string;
  outputFileName?: string;
  cutUrl?: string;
  cutFileName?: string;
  renderedBy?: string;
  renderWarning?: string | null;
  changedByCut?: boolean;
  duration?: number;
  originalDuration?: number;
  removedDuration?: number;
  width?: number;
  height?: number;
  cues?: SmartFramesDraftCue[];
  segments?: Array<{ start: number; end: number; duration: number }>;
};

function smartFramesWorkerBaseUrl(): string {
  const configured = import.meta.env.VITE_SMART_FRAMES_WORKER_URL as string | undefined;
  return (configured || "http://127.0.0.1:8787").replace(/\/+$/, "");
}

async function renderSmartFramesWithLocalWorker({
  file,
  plan,
  prompt,
  presetId,
  presetLabel,
}: {
  file: File;
  plan: string;
  prompt: string;
  presetId: HyperFramesSmartPresetId;
  presetLabel: string;
}): Promise<SmartFramesWorkerRenderResult> {
  const body = new FormData();
  body.set("file", file);
  body.set("plan", plan);
  body.set("prompt", prompt);
  body.set("presetId", presetId);
  body.set("presetLabel", presetLabel);

  const response = await fetch(`${smartFramesWorkerBaseUrl()}/render`, {
    method: "POST",
    body,
  });
  const data = (await response.json().catch(() => null)) as SmartFramesWorkerRenderResult | null;
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Smart Frames worker returned HTTP ${response.status}.`);
  }
  return data;
}

async function fileFromRemoteUrl(url: string, fileName: string, type = "video/mp4"): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download rendered media (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || type, lastModified: Date.now() });
}

async function createSmartFramesEditorProject({
  file,
  sourceUrl,
  meta,
  result,
}: {
  file: File;
  sourceUrl: string;
  meta: SmartFramesVideoMeta | null;
  result: Pick<SmartFramesDemoResult, "plan" | "presetId" | "presetLabel" | "cues">;
}): Promise<string> {
  const [{ useProjectStore }, { saveProject }] = await Promise.all([
    import("@/features/editor/stores/project-store"),
    import("@/features/editor/services/project-cloud"),
  ]);
  const metadata =
    meta ??
    (await readSmartFramesVideoMeta(sourceUrl).catch(() => ({
      width: 1920,
      height: 1080,
      duration: 0,
    })));
  const baseName = file.name.replace(/\.[^.]+$/, "").trim() || "Video";

  useProjectStore.getState().createNewProject(`Smart Frames - ${baseName}`.slice(0, 96), {
    width: metadata.width,
    height: metadata.height,
    frameRate: 30,
  });

  const importResult = await useProjectStore.getState().importMedia(file);
  if (!importResult.success || !importResult.actionId) {
    throw new Error(importResult.error?.message || "Could not import video into the editor.");
  }

  useProjectStore.setState((state) => ({
    project: {
      ...state.project,
      mediaLibrary: {
        ...state.project.mediaLibrary,
        items: state.project.mediaLibrary.items.map((item) =>
          item.id === importResult.actionId
            ? {
                ...item,
                originalUrl: sourceUrl,
              }
            : item,
        ),
      },
    },
  }));

  const clipResult = await useProjectStore.getState().addClipToNewTrack(importResult.actionId, 0);
  if (!clipResult.success) {
    throw new Error(clipResult.error?.message || "Could not add video to the editor timeline.");
  }

  const projectAfterVideo = useProjectStore.getState().project;
  const sourceClip = projectAfterVideo.timeline.tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.mediaId === importResult.actionId);
  const timelineDuration =
    sourceClip?.duration || metadata.duration || projectAfterVideo.timeline.duration || 12;
  const shouldCreateTextTrack = result.presetId !== "cleancut";
  const draftBeats = shouldCreateTextTrack
    ? result.cues && result.cues.length > 0
      ? result.cues.map((cue) => ({
          startTime: Math.max(0, cue.startTime),
          duration: Math.max(0.5, cue.duration),
          text: smartFramesDraftLineText(cue.text),
        }))
      : buildSmartFramesDraftBeats({
          plan: result.plan,
          presetId: result.presetId,
          duration: timelineDuration,
        })
    : [];

  if (sourceClip && draftBeats.length > 1) {
    const splitTimes = draftBeats
      .slice(1)
      .map((beat) => beat.startTime)
      .filter((time) => time > 0.1 && time < sourceClip.duration - 0.1)
      .sort((a, b) => b - a);

    for (const splitTime of splitTimes) {
      const currentClip = useProjectStore
        .getState()
        .project.timeline.tracks.flatMap((track) => track.clips)
        .find(
          (clip) =>
            clip.mediaId === importResult.actionId &&
            splitTime > clip.startTime + 0.05 &&
            splitTime < clip.startTime + clip.duration - 0.05,
        );
      if (currentClip) {
        await useProjectStore.getState().splitClip(currentClip.id, splitTime);
      }
    }
  }

  const existingTrackIds = new Set(
    useProjectStore.getState().project.timeline.tracks.map((track) => track.id),
  );
  const textTrackResult = shouldCreateTextTrack
    ? await useProjectStore.getState().addTrack("text", 0)
    : { success: false };
  if (shouldCreateTextTrack && textTrackResult.success) {
    const textTrack = useProjectStore
      .getState()
      .project.timeline.tracks.find(
        (track) => track.type === "text" && !existingTrackIds.has(track.id),
      );
    if (textTrack) {
      useProjectStore.getState().renameTrack(textTrack.id, "Smart Frames Draft");
      const visual =
        HYPERFRAMES_SMART_VISUALS[result.presetId] ?? HYPERFRAMES_SMART_VISUALS.cleancut;
      const groupId = `smart-frames-${Date.now()}`;
      const createdAt = Date.now();
      for (const beat of draftBeats) {
        useProjectStore.getState().createCaptionTextClip({
          trackId: textTrack.id,
          startTime: beat.startTime,
          duration: beat.duration,
          text: beat.text,
          style: {
            fontFamily: "Inter",
            fontSize: metadata.height >= 1200 ? 54 : 46,
            fontWeight: 800,
            color: "#ffffff",
            strokeColor: "#000000",
            strokeWidth: 4,
            textAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.05,
            letterSpacing: 0,
            effects: {
              shadow: {
                enabled: true,
                color: "rgba(0,0,0,0.72)",
                offsetX: 0,
                offsetY: 8,
                blur: 20,
              },
              glow: {
                enabled: true,
                color: visual.accent,
                intensity: 0.28,
              },
            },
          },
          transform: {
            position: { x: 0.5, y: 0.78 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            anchor: { x: 0.5, y: 0.5 },
            opacity: 1,
          },
          animation: {
            preset: "fade",
            outPreset: "fade",
            inDuration: 0.18,
            outDuration: 0.18,
            params: { fadeOpacity: { start: 0, end: 1 } },
          },
          captionMeta: {
            groupId,
            generatedAt: createdAt,
            language: "draft",
            sourceClipId: sourceClip?.id ?? "",
            animation: "fade",
            accentColor: visual.accent,
            highlightColor: visual.accent,
            role: "subtitle",
            relativePosition: { x: 0, y: 0 },
          },
        });
      }
    }
  }

  const project = useProjectStore.getState().getFullProject();
  const saved = await saveProject(project);
  if (!saved) {
    throw new Error("Could not save the Smart Frames editor project.");
  }
  return project.id;
}

const SmartFramesResultPreview = ({ result }: { result: SmartFramesDemoResult }) => {
  const { t } = useLanguage();
  const visual = HYPERFRAMES_SMART_VISUALS[result.presetId] ?? HYPERFRAMES_SMART_VISUALS.cleancut;
  const beats = smartFramesPlanLines(result.plan, visual.beats);
  const showBeats = result.presetId !== "cleancut";

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black"
      style={{ boxShadow: `0 0 34px ${visual.glow}` }}
    >
      {result.outputUrl ? (
        <video
          src={result.outputUrl}
          controls
          playsInline
          className="aspect-video w-full bg-black object-contain"
        />
      ) : (
        <div className="grid aspect-video w-full place-items-center bg-black text-[13px] font-semibold text-zinc-500">
          {t("workspace.standalone.smart_frames.source_unavailable")}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/75 via-black/20 to-transparent px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div
            className="rounded-full border px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-black"
            style={{
              borderColor: visual.accent,
              backgroundColor: visual.accent,
              boxShadow: `0 0 18px ${visual.glow}`,
            }}
          >
            {visual.title}
          </div>
          <div className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[11px] font-semibold text-white/85">
            {t("workspace.standalone.smart_frames.preview")}
          </div>
        </div>
      </div>
      {showBeats ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-11 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-4 pb-4 pt-12">
          <div className="max-w-[92%]">
            <div
              className="mb-2 inline-flex rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-black"
              style={{ backgroundColor: visual.accent }}
            >
              {result.presetLabel}
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {beats.slice(0, 4).map((beat, index) => (
                <div
                  key={`${beat}-${index}`}
                  className="min-w-0 rounded-lg border border-white/12 bg-black/55 px-3 py-2 backdrop-blur-sm"
                >
                  <div className="text-[10px] font-semibold text-white/40">
                    {t("workspace.standalone.smart_frames.beat", { index: index + 1 })}
                  </div>
                  <div className="truncate text-[12px] font-semibold text-white">{beat}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const HyperFramesSmartView = ({
  projects,
  activeProjectId,
  onOpenSidebar,
}: {
  projects: StandaloneProjectOption[];
  activeProjectId: string | null;
  onOpenSidebar?: () => void;
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const activeStorageProjectId = activeProjectId ?? "default";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [prompt, setPrompt] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceMeta, setSourceMeta] = useState<SmartFramesVideoMeta | null>(null);
  const [presetId, setPresetId] =
    useState<(typeof HYPERFRAMES_SMART_PRESETS)[number]["id"]>("cleancut");
  const [result, setResult] = useState<SmartFramesDemoResult | null>(null);
  const [running, setRunning] = useState(false);
  const [creatingEditor, setCreatingEditor] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const selectedPreset =
    HYPERFRAMES_SMART_PRESETS.find((preset) => preset.id === presetId) ??
    HYPERFRAMES_SMART_PRESETS[0];
  const selectedPresetLabel = smartFramesPresetLabel(selectedPreset.id, t);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const persisted = readPersistedSmartFramesState(user.id, activeStorageProjectId);
    if (!persisted) return;

    setPrompt(persisted.prompt);
    setPresetId(persisted.presetId);
    setSourceMeta(persisted.sourceMeta);
    setRunError(null);
    setRunStatus(t("workspace.standalone.smart_frames.source_restore"));
    void readSmartFramesSourceBlob(persisted.sourceBlobKey)
      .then((blob) => {
        if (cancelled || !blob) return;
        const file = new File([blob], persisted.sourceFileName, {
          type: persisted.sourceFileType || blob.type || "video/mp4",
          lastModified: persisted.createdAt,
        });
        const objectUrl = URL.createObjectURL(blob);
        const preset =
          HYPERFRAMES_SMART_PRESETS.find((item) => item.id === persisted.presetId) ??
          HYPERFRAMES_SMART_PRESETS[0];
        setSourceFile(file);
        setSourceUrl(objectUrl);
        setResult({
          plan: persisted.plan,
          outputUrl: persisted.renderedOutputUrl || objectUrl,
          outputFileName: persisted.outputFileName,
          createdAt: persisted.createdAt,
          presetId: preset.id,
          presetLabel: smartFramesPresetLabel(preset.id, t),
          sourceFileName: persisted.sourceFileName,
          sourceBlobKey: persisted.sourceBlobKey,
          editorProjectId: persisted.editorProjectId,
          renderedBy: persisted.renderedBy,
          removedDuration: persisted.removedDuration,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setRunStatus(null);
          setRunError(t("workspace.standalone.smart_frames.source_restore_failed"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, activeStorageProjectId, t]);

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [sourceUrl]);

  const handleSourceFile = (file: File) => {
    const isVideo =
      file.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
    if (!isVideo) {
      toast.info(t("workspace.standalone.smart_frames.toast_upload_video"));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSourceFile(file);
    setSourceUrl(objectUrl);
    setSourceMeta(null);
    setResult(null);
    setRunError(null);
    setRunStatus(t("workspace.standalone.smart_frames.source_loaded"));
    clearPersistedSmartFramesState(user?.id, activeStorageProjectId);
    void readSmartFramesVideoMeta(objectUrl)
      .then(setSourceMeta)
      .catch(() => setSourceMeta(null));

    if (!prompt.trim()) {
      setPrompt(t("workspace.standalone.smart_frames.default_prompt"));
    }
  };

  const handleGenerate = async () => {
    const source = prompt.trim() || t("workspace.standalone.smart_frames.default_prompt");
    if (!user?.id) {
      toast.info(t("workspace.standalone.smart_frames.toast_sign_in"));
      return;
    }
    if (!sourceFile || !sourceUrl) {
      toast.info(t("workspace.standalone.smart_frames.toast_upload_source"));
      return;
    }

    setRunning(true);
    setResult(null);
    setRunError(null);
    setRunStatus(t("workspace.standalone.smart_frames.cutting"));
    try {
      const meta = sourceMeta;
      const cleaned = [
        selectedPresetLabel,
        "",
        "Goal:",
        source,
        "",
        "Processing rules:",
        "- Detect silence/dead air from the audio waveform.",
        "- Remove pauses longer than the short-form editing threshold.",
        "- Preserve small handles around speech so cuts do not feel abrupt.",
        "- Return a cut MP4 and create an editable MediaForge project.",
      ].join("\n");

      const sourceBlobKey = smartFramesSourceBlobKey(user.id, activeStorageProjectId);
      let sourcePersisted = false;
      try {
        await writeSmartFramesSourceBlob(sourceBlobKey, sourceFile);
        sourcePersisted = true;
      } catch {
        setRunStatus(
          t("workspace.standalone.smart_frames.storage_warning"),
        );
      }

      const workerResult = await renderSmartFramesWithLocalWorker({
        file: sourceFile,
        plan: cleaned,
        prompt: source,
        presetId: selectedPreset.id,
        presetLabel: selectedPresetLabel,
      });

      const nextResult: SmartFramesDemoResult = {
        plan: cleaned,
        outputUrl: workerResult.outputUrl || sourceUrl,
        outputFileName:
          workerResult.outputFileName ||
          (workerResult.renderedBy ? smartFramesRenderedOutputName(sourceFile.name) : smartFramesOutputName(sourceFile.name)),
        createdAt: Date.now(),
        presetId: selectedPreset.id,
        presetLabel: selectedPresetLabel,
        sourceFileName: sourceFile.name,
        sourceBlobKey: sourcePersisted ? sourceBlobKey : undefined,
        renderedBy: workerResult.renderedBy,
        renderWarning: workerResult.renderWarning,
        cutUrl: workerResult.cutUrl,
        cutFileName: workerResult.cutFileName,
        changedByCut: workerResult.changedByCut,
        originalDuration: workerResult.originalDuration,
        renderedDuration: workerResult.duration,
        removedDuration: workerResult.removedDuration,
        segments: workerResult.segments,
        cues: workerResult.cues,
      };
      setRunStatus(t("workspace.standalone.smart_frames.creating_project"));
      try {
        const editorFile =
          workerResult.cutUrl && workerResult.cutFileName
            ? await fileFromRemoteUrl(workerResult.cutUrl, workerResult.cutFileName)
            : sourceFile;
        const editorSourceUrl = workerResult.cutUrl || sourceUrl;
        const editorMeta =
          workerResult.duration && workerResult.width && workerResult.height
            ? {
                duration: workerResult.duration,
                width: workerResult.width,
                height: workerResult.height,
              }
            : meta;
        const editorProjectId = await createSmartFramesEditorProject({
          file: editorFile,
          sourceUrl: editorSourceUrl,
          meta: editorMeta,
          result: nextResult,
        });
        nextResult.editorProjectId = editorProjectId;
      } catch (editorError) {
        nextResult.editorProjectError =
          editorError instanceof Error
            ? editorError.message
            : t("workspace.standalone.smart_frames.create_editable_error");
      }

      setResult(nextResult);
      if (sourcePersisted) {
        persistSmartFramesState({
          userId: user.id,
          projectId: activeStorageProjectId,
          state: {
            version: HYPERFRAMES_SMART_STORAGE_VERSION,
            prompt: source,
            presetId: selectedPreset.id,
            plan: cleaned,
            outputFileName: nextResult.outputFileName,
            createdAt: nextResult.createdAt,
            sourceFileName: sourceFile.name,
            sourceFileType: sourceFile.type || "video/mp4",
            sourceFileSize: sourceFile.size,
            sourceMeta: meta,
            sourceBlobKey,
            editorProjectId: nextResult.editorProjectId,
            renderedOutputUrl: workerResult.outputUrl,
            renderedBy: workerResult.renderedBy,
            removedDuration: workerResult.removedDuration,
          },
        });
      }
      setRunStatus(
        nextResult.changedByCut
          ? t("workspace.standalone.smart_frames.complete_changed")
          : t("workspace.standalone.smart_frames.complete_unchanged"),
      );
      toast.success(
        nextResult.editorProjectId
          ? t("workspace.standalone.smart_frames.toast_project_ready")
          : t("workspace.standalone.smart_frames.toast_project_attention"),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create Smart Frames draft.";
      setRunError(message);
      setRunStatus(null);
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  const handleDownloadDemo = () => {
    if (!result) return;
    const anchor = document.createElement("a");
    anchor.href = result.outputUrl;
    anchor.download = result.outputFileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const handleOpenEditor = async () => {
    if (!sourceFile || !sourceUrl || !result) return;
    if (result.editorProjectId) {
      navigate(`/app/editor/${result.editorProjectId}`);
      return;
    }
    setCreatingEditor(true);
    try {
      const editorFile =
        result.cutUrl && result.cutFileName
          ? await fileFromRemoteUrl(result.cutUrl, result.cutFileName)
          : result.outputUrl && result.outputUrl !== sourceUrl
            ? await fileFromRemoteUrl(result.outputUrl, result.outputFileName)
            : sourceFile;
      const editorSourceUrl =
        result.cutUrl || (result.outputUrl && result.outputUrl !== sourceUrl ? result.outputUrl : sourceUrl);
      const editorMeta =
        result.renderedDuration && sourceMeta
          ? { ...sourceMeta, duration: result.renderedDuration }
          : sourceMeta;
      const editorProjectId = await createSmartFramesEditorProject({
        file: editorFile,
        sourceUrl: editorSourceUrl,
        meta: editorMeta,
        result,
      });
      setResult((current) =>
        current
          ? {
              ...current,
              editorProjectId,
              editorProjectError: undefined,
            }
          : current,
      );
      if (result.sourceBlobKey) {
        const persisted = readPersistedSmartFramesState(user?.id, activeStorageProjectId);
        if (persisted) {
          persistSmartFramesState({
            userId: user?.id,
            projectId: activeStorageProjectId,
            state: { ...persisted, editorProjectId },
          });
        }
      }
      navigate(`/app/editor/${editorProjectId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create the editable project.";
      setResult((current) =>
        current
          ? {
              ...current,
              editorProjectError: message,
            }
          : current,
      );
      toast.error(message);
    } finally {
      setCreatingEditor(false);
    }
  };

  const copyResult = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.plan);
    toast.success(t("workspace.standalone.smart_frames.copied_summary"));
  };

  return (
    <>
      <div className="mf-smart-frames-page ws-scroll-hide flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--bg-app)] lg:flex-row lg:overflow-hidden">
        <aside className="mf-smart-frames-input-shell ws-scroll-hide mx-auto flex min-h-dvh w-full max-w-[480px] shrink-0 flex-col bg-transparent px-[12px] pb-[12px] pt-[4px] lg:mx-0 lg:h-full lg:min-h-0 lg:w-[364px] lg:max-w-none lg:overflow-hidden lg:pb-0 lg:pl-2 lg:pr-0 lg:pt-4 xl:w-[386px]">
          <section className="mf-smart-frames-panel mf-clean-generator flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-white/[0.08] bg-[hsl(0_0%_7%)] shadow-[0_24px_80px_rgba(0,0,0,.28)]">
            <div className="mf-smart-frames-body ws-scroll-hide min-h-0 flex-1 overflow-y-auto p-5">
              <StandaloneToolHeaderCard title={t("workspace.standalone.tool.smart_frames.title")} />

              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm,.m4v"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleSourceFile(file);
                  event.target.value = "";
                }}
              />
              <div className="mf-clean-input-section mf-smart-source-section">
                <div className="mf-clean-step-heading mb-3">
                  {stripStandaloneStepPrefix(t("workspace.standalone.smart_frames.step_source"))}
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const file = event.dataTransfer.files?.[0];
                    if (file) handleSourceFile(file);
                  }}
                  className={cn(
                    "mf-clean-reference-dropzone mf-smart-source-dropzone group relative flex w-full items-center overflow-hidden text-left outline-none transition",
                    sourceUrl
                      ? "is-loaded cursor-pointer"
                      : "cursor-pointer focus:ring-1 focus:ring-[#f4ff00]/60",
                  )}
                >
                  {sourceUrl ? (
                    <div className="mf-smart-source-loaded flex gap-3">
                      <video
                        src={sourceUrl}
                        muted
                        playsInline
                        className="h-[92px] w-[132px] rounded-xl bg-black object-cover"
                      />
                      <div className="min-w-0 flex-1 py-1">
                        <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
                          <FileVideo className="h-4 w-4 text-cyan-200" />
                          <span className="truncate">{sourceFile?.name}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-zinc-300">
                          <span className="rounded-lg bg-white/[0.06] px-2 py-1">
                            {(sourceFile ? sourceFile.size / 1024 / 1024 : 0).toFixed(1)} MB
                          </span>
                          <span className="rounded-lg bg-white/[0.06] px-2 py-1">
                            {sourceMeta ? formatSmartFramesDuration(sourceMeta.duration) : t("workspace.standalone.loading")}
                          </span>
                          <span className="rounded-lg bg-white/[0.06] px-2 py-1">
                            {sourceMeta ? `${sourceMeta.width}x${sourceMeta.height}` : t("workspace.standalone.smart_frames.video_fallback")}
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] leading-4 text-cyan-50/65">
                          {t("workspace.standalone.smart_frames.source_replace")}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mf-smart-source-empty">
                      <span className="mf-media-upload-tile mf-smart-source-tile">
                        <span className="mf-media-upload-tile-icon" aria-hidden="true">
                          <Video className="h-[16px] w-[16px]" />
                        </span>
                        <span className="mf-smart-source-tile-label">
                          {t("workspace.standalone.smart_frames.video_fallback")}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <label className="mf-clean-input-section mf-smart-note-field block">
                <span className="mf-clean-step-heading block">
                  {stripStandaloneStepPrefix(t("workspace.standalone.smart_frames.step_optional_note"))}
                </span>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={t("workspace.standalone.smart_frames.note_placeholder")}
                  className="mf-smart-note-input mt-2 min-h-[92px] w-full resize-none rounded-xl border border-white/[0.08] bg-black/35 px-3 py-3 text-[13px] leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-[#eaff00]/70"
                />
              </label>

              <div className="mf-clean-input-section mf-smart-presets grid grid-cols-1 gap-2">
                <div className="mf-clean-step-heading">
                  {stripStandaloneStepPrefix(t("workspace.standalone.smart_frames.step_mode"))}
                </div>
                {HYPERFRAMES_SMART_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setPresetId(preset.id)}
                    className={cn(
                      "mf-smart-preset-card rounded-xl border px-3 py-2 text-left transition",
                      preset.id === presetId
                        ? "border-[#eaff00] bg-[#eaff00]/10 text-white shadow-[0_0_18px_rgba(234,255,0,.12)]"
                        : "border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:border-white/[0.16] hover:bg-white/[0.06]",
                    )}
                  >
                    <div className="flex items-center gap-2 text-[12px] font-semibold">
                      <WandSparkles className="h-3.5 w-3.5 text-[#eaff00]" />
                      {smartFramesPresetLabel(preset.id, t)}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-4 text-zinc-500">{smartFramesPresetDescription(preset.id, t)}</p>
                  </button>
                ))}
              </div>

              <div className="mf-smart-info-card rounded-xl border border-cyan-300/15 bg-cyan-300/[0.045] p-3 text-[12px] leading-5 text-cyan-50/75">
                {t("workspace.standalone.smart_frames.info")}
              </div>

              {runStatus ? (
                <div className="flex items-start gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 text-[12px] leading-5 text-zinc-200">
                  {running ? (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#eaff00]" />
                  ) : (
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#eaff00]" />
                  )}
                  <span>{runStatus}</span>
                </div>
              ) : null}

              {runError ? (
                <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-[12px] leading-5 text-red-100">
                  <div className="font-semibold">{t("workspace.standalone.smart_frames.error_title")}</div>
                  <div className="mt-1 text-red-100/85">{runError}</div>
                </div>
              ) : null}

            </div>

            <div className="mf-clean-footer mf-smart-frames-footer flex shrink-0">
              <div className="mf-clean-action-stack">
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={running}
                  className="mf-generate-pill-button mf-smart-generate-button inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#fbff2f,#b9ff50)] px-4 text-[13px] font-semibold text-zinc-950 shadow-[0_0_22px_rgba(234,255,0,.18)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                  {running ? t("workspace.standalone.smart_frames.generating") : t("workspace.standalone.smart_frames.generate_one")}
                </button>
              </div>
            </div>
          </section>

        </aside>
        <main className="mf-smart-result-shell ws-scroll-hide min-h-0 flex-1 overflow-visible bg-[var(--bg-app)] px-3 pb-3 pt-3 md:px-4 lg:overflow-hidden lg:pb-0 lg:pl-2 lg:pr-3 lg:pt-4">
          <section className="mf-smart-result-panel relative flex h-full min-h-0 flex-col rounded-[20px] border border-white/[0.08] bg-[hsl(0_0%_6%)] shadow-[0_24px_80px_rgba(0,0,0,.28)]">
            {!running && !result && !sourceUrl ? (
              <div className="mf-smart-result-view-toggle" aria-hidden="true">
                <span className="is-active"><LayoutGrid className="h-[11px] w-[11px]" /></span>
                <span><List className="h-[11px] w-[11px]" /></span>
              </div>
            ) : null}
            {(running || result) ? (
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.06] text-[#eaff00]">
                    <Code2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="whitespace-nowrap text-[15px] font-semibold text-white">
                      {t("workspace.standalone.smart_frames.result")}
                    </h2>
                    <p className="sr-only">
                      {t("workspace.standalone.smart_frames.result_sr")}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyResult()}
                    disabled={!result}
                    className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] font-semibold text-zinc-200 hover:bg-white/[0.08] disabled:opacity-40"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t("workspace.standalone.smart_frames.copy_summary")}
                  </button>
                </div>
              </div>
            ) : null}

            {running ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="max-w-[520px] text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-[#eaff00]/20 bg-[#eaff00]/10 text-[#eaff00]">
                    <Loader2 className="h-7 w-7 animate-spin" />
                  </div>
                  <h3 className="mt-5 text-[18px] font-semibold text-white">
                    {t("workspace.standalone.smart_frames.generating")}
                  </h3>
                  <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                    {runStatus ?? t("workspace.standalone.smart_frames.detecting")}
                  </p>
                </div>
              </div>
            ) : result ? (
              <div className="min-h-0 flex-1 overflow-auto p-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(360px,0.9fr)_1fr]">
                  <div className="space-y-4">
                    <SmartFramesResultPreview result={result} />
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
                      <div className="min-w-0">
                        <h3 className="truncate text-[14px] font-semibold text-white">
                          {result.outputFileName}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-zinc-300">
                          <span className="rounded-lg bg-white/[0.06] px-2 py-1">
                            {result.presetLabel}
                          </span>
                          <span className="rounded-lg bg-white/[0.06] px-2 py-1">
                            {sourceMeta ? formatSmartFramesDuration(sourceMeta.duration) : t("workspace.standalone.smart_frames.video_fallback")}
                          </span>
                          <span className="rounded-lg bg-white/[0.06] px-2 py-1">
                            {result.renderedBy ? result.renderedBy : t("workspace.standalone.smart_frames.editable_draft")}
                          </span>
                          {result.changedByCut ? (
                            <span className="rounded-lg bg-[#eaff00]/15 px-2 py-1 text-[#eaff00]">
                              {t("workspace.standalone.smart_frames.dead_air_cut")}
                            </span>
                          ) : null}
                          {typeof result.removedDuration === "number" && result.removedDuration > 0 ? (
                            <span className="rounded-lg bg-white/[0.06] px-2 py-1">
                              {t("workspace.standalone.smart_frames.removed_duration", { duration: formatSmartFramesDuration(result.removedDuration) })}
                            </span>
                          ) : null}
                          {result.segments?.length ? (
                            <span className="rounded-lg bg-white/[0.06] px-2 py-1">
                              {t("workspace.standalone.smart_frames.clips", { count: result.segments.length })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {result.renderWarning ? (
                        <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[12px] leading-5 text-amber-50">
                          {t("workspace.standalone.smart_frames.render_warning", { warning: result.renderWarning })}
                        </p>
                      ) : null}
                      {result.editorProjectError ? (
                        <p className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-100">
                          {result.editorProjectError}
                        </p>
                      ) : null}
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={handleDownloadDemo}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] text-[13px] font-semibold text-white hover:bg-white/[0.08]"
                        >
                          <Download className="h-4 w-4" />
                          {t("workspace.standalone.smart_frames.download_mp4")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleOpenEditor()}
                          disabled={creatingEditor}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-200 px-4 text-[13px] font-semibold text-zinc-950 hover:brightness-105 disabled:cursor-wait disabled:opacity-70"
                        >
                          {creatingEditor ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowRight className="h-4 w-4" />
                          )}
                          {t("workspace.standalone.smart_frames.edit_mediaforge")}
                        </button>
                      </div>
                    </div>
                  </div>
                  <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/[0.08] bg-black/35 p-5 text-[13px] leading-6 text-zinc-100">
                    {result.plan}
                  </pre>
                </div>
              </div>
            ) : sourceUrl ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="w-full max-w-[760px]">
                  <video
                    src={sourceUrl}
                    controls
                    playsInline
                    className="aspect-video w-full rounded-2xl bg-black object-contain"
                  />
                  <div className="mt-5 text-center">
                    <h3 className="text-[18px] font-semibold text-white">{t("workspace.standalone.smart_frames.source_ready")}</h3>
                    <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                      {t("workspace.standalone.smart_frames.source_ready_desc")}
                    </p>
                    {runError ? (
                      <p className="mx-auto mt-4 max-w-[560px] rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-[12px] leading-5 text-red-100">
                        {runError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="max-w-[520px] text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-zinc-300">
                    <Boxes className="h-7 w-7" />
                  </div>
                  <h3 className="mt-5 text-[18px] font-semibold text-white">
                    {t("workspace.standalone.smart_frames.ready")}
                  </h3>
                  <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                    {t("workspace.standalone.smart_frames.ready_desc")}
                  </p>
                </div>
              </div>
            )}
          </section>
        </main>
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
                          canManage && "group-hover/proj:opacity-0",
                        )}
                      >
                        {t("workspace.home.active")}
                      </span>
                    ) : (
                      <Lock
                        className={cn(
                          "h-2.5 w-2.5 text-zinc-600 transition-opacity",
                          canManage && "group-hover/proj:opacity-0",
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
                  {canManage && (
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

function getEducationStatusLabel(
  status: WorkspaceMeta["educationStatus"],
  t: (key: TranslationKey) => string,
) {
  if (status === "passed") return t("workspace.home.education_status.passed");
  if (status === "ended") return t("workspace.home.education_status.ended");
  if (status === "submitted") return t("workspace.home.education_status.submitted");
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
        .sort(compareProjectsByCreatedAt)
        .map((project) => {
          const active = activeProjectId === project.id;
          const teamProject = Boolean(project.ownerId && project.ownerId !== user?.id);
          const avatar = getProjectAvatar(project);
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
              <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full bg-[#0b0d0d] ring-1 ring-white/12">
                <img
                  src={avatar}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              </span>
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
                      {getEducationStatusLabel(ws.educationStatus, t)}
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

const AcademyVideoTile = ({ video }: { video: AcademyVideo }) => {
  const { t } = useLanguage();
  return (
    <li className="overflow-hidden rounded-2xl bg-[hsl(0_0%_7%)]">
      <video
        className="aspect-video w-full bg-black object-cover"
        controls
        playsInline
        preload="none"
        poster={video.poster}
        aria-label={t(video.titleKey)}
      >
        <source src={video.src} type="video/mp4" />
      </video>
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-[14.5px] font-semibold text-zinc-100">
            {t(video.titleKey)}
          </h3>
          <p className="mt-1 line-clamp-2 text-[14.5px] leading-5 text-zinc-500">
            {t(video.descriptionKey)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-1 text-[13.5px] font-semibold text-zinc-400">
          {video.duration}
        </span>
      </div>
    </li>
  );
};

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

type RenameSpaceTarget = { id: string; name: string };

const RenameSpaceDialog = ({
  target,
  onOpenChange,
  onRename,
}: {
  target: RenameSpaceTarget | null;
  onOpenChange: (open: boolean) => void;
  onRename: (id: string, currentName: string, nextName: string) => void;
}) => {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const open = Boolean(target);
  const trimmedName = name.trim();

  useEffect(() => {
    if (target) setName(target.name);
  }, [target]);

  const close = () => onOpenChange(false);

  const handleSubmit = () => {
    if (!target || !trimmedName) return;
    if (trimmedName !== target.name) {
      onRename(target.id, target.name, trimmedName);
    }
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent
        className="w-[calc(100vw-2rem)] gap-4 overflow-hidden border-white/10 bg-[hsl(0_0%_7.5%)] p-0 text-zinc-100 shadow-2xl shadow-black/60 sm:max-w-[430px]"
        style={{ fontFamily: "'Prompt', system-ui, sans-serif" }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="space-y-4 p-5"
        >
          <DialogHeader className="space-y-1 pr-8">
            <DialogTitle className="flex items-center gap-2 text-[18px] font-semibold leading-6 text-zinc-50">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06] text-[#f4ff00]">
                <Pencil className="h-4 w-4" />
              </span>
              {t("workspace.spaces.action_rename")}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-zinc-400">
              {t("workspace.spaces.rename_prompt")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label htmlFor="rename-space-name" className="sr-only">
              {t("workspace.spaces.rename_prompt")}
            </label>
            <input
              id="rename-space-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, 90))}
              autoFocus
              spellCheck={false}
              className="h-11 w-full rounded-[10px] border border-white/[0.09] bg-black/35 px-3 text-[14px] font-medium text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-[#f4ff00]/70 focus:ring-2 focus:ring-[#f4ff00]/15"
            />
          </div>

          <DialogFooter className="gap-2 pt-1 sm:gap-2">
            <button
              type="button"
              onClick={close}
              className="inline-flex h-9 items-center justify-center rounded-full bg-white/[0.06] px-4 text-[13px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.1]"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={!trimmedName}
              className="ci-gloss-button inline-flex h-9 items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t("common.save")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

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
  const openSignInModal = useSignInModal();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const canvases = useWorkspaceStore((s) => s.canvases);
  const graphs = useWorkspaceStore((s) => s.graphs);
  const canvasIndex = useMemo(() => buildCanvasIndex(canvases), [canvases]);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const markWorkspaceOpened = useWorkspaceStore((s) => s.markWorkspaceOpened);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
  const duplicateWorkspace = useWorkspaceStore((s) => s.duplicateWorkspace);
  const selectedProjectId = educationLockedStudent ? null : activeProjectId ?? projects[0]?.id ?? null;
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  const [filter, setFilter] = useState<"all" | "mine" | "team">("all");
  const [renameTarget, setRenameTarget] = useState<RenameSpaceTarget | null>(null);

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
      .sort(compareProjectsByCreatedAt)
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
    ? t("workspace.home.owner.team_project")
    : t("workspace.home.owner.owned_by_you");

  const handleNewSpace = async () => {
    if (!user?.id) {
      openSignInModal();
      return;
    }
    const projectId = selectedProject?.id ?? activeProjectId;
    if (!projectId) {
      toast.error(t("workspace.toast.create_project_first_gen"));
      onCreateProject();
      return;
    }
    const { workspaceId, canvasId } = createWorkspace(
      t("workspace.spaces.untitled_space"),
      projectId,
    );
    markWorkspaceOpened(workspaceId);
    if (user?.id) {
      const result = await persistNewWorkspaceBundle(workspaceId, canvasId, user.id);
      if (!result.ok) {
        console.warn("[workspace] create space server save failed:", result.error);
      }
    }
    navigate(`/app/workspace/${workspaceId}`);
  };

  const handleRename = (id: string, currentName: string) => {
    setRenameTarget({ id, name: currentName });
  };

  const handleConfirmRename = (id: string, currentName: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === currentName) return;
    renameWorkspace(id, trimmed);
    if (user?.id) {
      const meta = useWorkspaceStore.getState().workspaces.find((w) => w.id === id);
      if (meta) void upsertWorkspaceToServer(meta, user.id);
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
          onClick: () => {
            markWorkspaceOpened(res.workspaceId);
            navigate(`/app/workspace/${res.workspaceId}`);
          },
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
            onClick: () => {
              markWorkspaceOpened(res.workspaceId);
              navigate(`/app/workspace/${res.workspaceId}`);
            },
          },
        });
      } catch (err) {
        console.warn("[workspace-projects] duplicate server push failed:", err);
        toast.warning(t("workspace.toast.duplicated_offline", { name: newName }), {
          id: toastId,
          action: {
            label: t("workspace.toast.open"),
            onClick: () => {
              markWorkspaceOpened(res.workspaceId);
              navigate(`/app/workspace/${res.workspaceId}`);
            },
          },
        });
      }
    })();
  };

  return (
    <>
      <RenameSpaceDialog
        target={renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onRename={handleConfirmRename}
      />
      <PageHeader
        title={t("workspace.home.projects")}
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
                    {canManage && (
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
              <ul className="mf-space-card-grid">
                {spaces.map((space) => (
                  <SpaceCard
                    key={space.id}
                    ws={space}
                    canManage={!space.ownerId || space.ownerId === user?.id}
                    onOpen={() => {
                      markWorkspaceOpened(space.id);
                      navigate(`/app/workspace/${space.id}`);
                    }}
                    onRename={() => handleRename(space.id, space.name)}
                    onDuplicate={() => handleDuplicate(space.id)}
                    onDelete={() => handleDelete(space.id, space.name)}
                  />
                ))}
                <li className="mf-space-card group relative cursor-pointer">
                  <button
                    type="button"
                    onClick={handleNewSpace}
                    className="block w-full text-left"
                  >
                    <div className="flex aspect-video items-center justify-center bg-[hsl(0_0%_5%)] text-zinc-500">
                      <Plus className="h-5 w-5" />
                    </div>
                    <div className="mf-space-card-copy">
                      <div className="mf-space-card-title">
                        {t("workspace.spaces.new_space")}
                      </div>
                      <div className="mf-space-card-meta text-transparent" aria-hidden="true">
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
  onCreateProject,
  onOpenSidebar,
  educationLockedStudent = false,
}: {
  activeProjectId: string | null;
  projects: ProjectMeta[];
  onSelectProject: (id: string | null) => void;
  onCreateProject: () => void;
  onOpenSidebar?: () => void;
  educationLockedStudent?: boolean;
}) => {
  const navigate = useNavigate();
  const { t, t: i18n, language } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const openSignInModal = useSignInModal();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const canvases = useWorkspaceStore((s) => s.canvases);
  const graphs = useWorkspaceStore((s) => s.graphs);
  const canvasIndex = useMemo(() => buildCanvasIndex(canvases), [canvases]);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const markWorkspaceOpened = useWorkspaceStore((s) => s.markWorkspaceOpened);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
  const duplicateWorkspace = useWorkspaceStore((s) => s.duplicateWorkspace);
  const mergeServerWorkspaces = useWorkspaceStore(
    (s) => s.mergeServerWorkspaces,
  );
  const { data: educationSpaceStatuses = EMPTY_EDUCATION_SPACE_STATUS_MAP } =
    useEducationSpaceStatusMap(user?.id, educationLockedStudent);
  const [renameTarget, setRenameTarget] = useState<RenameSpaceTarget | null>(null);

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
    if (!user?.id) {
      openSignInModal();
      return;
    }
    if (!activeProjectId) {
      toast.error(t("workspace.toast.create_project_first_gen"));
      onCreateProject();
      return;
    }
    const { workspaceId, canvasId } = createWorkspace(t("workspace.spaces.untitled_space"), activeProjectId);
    markWorkspaceOpened(workspaceId);
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
      language,
    );
  }, [activeProjectId, educationLockedStudent, tab, user?.id, workspaces, canvasIndex, graphs, educationSpaceStatuses, language]);

  const handleRename = (id: string, currentName: string) => {
    setRenameTarget({ id, name: currentName });
  };

  const handleConfirmRename = (id: string, currentName: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === currentName) return;
    renameWorkspace(id, trimmed);
    if (user?.id) {
      const meta = useWorkspaceStore
        .getState()
        .workspaces.find((w) => w.id === id);
      if (meta) void upsertWorkspaceToServer(meta, user.id);
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
              onClick: () => {
                markWorkspaceOpened(newWorkspaceId);
                navigate(`/app/workspace/${newWorkspaceId}`);
              },
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
              onClick: () => {
                markWorkspaceOpened(newWorkspaceId);
                navigate(`/app/workspace/${newWorkspaceId}`);
              },
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
          onClick: () => {
            markWorkspaceOpened(newWorkspaceId);
            navigate(`/app/workspace/${newWorkspaceId}`);
          },
        },
      });
    }
  };

  const handleOpen = (id: string) => {
    markWorkspaceOpened(id);
    navigate(`/app/workspace/${id}`);
  };

  // Tab state for the Magnific-style segmented control. Only "My
  // spaces" is wired today — Shared and Templates are placeholders
  // we'll hook up once those features land. Switching to one of them
  // shows an inline empty-state so the click isn't a dead-end.
  return (
    <>
      <RenameSpaceDialog
        target={renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onRename={handleConfirmRename}
      />
      {/* Slim chrome bar — keeps the workspace selector + user menu
          visible. Title moved to the hero block below per the new
          Magnific-style layout. */}
      <PageHeader
        title=""
        onOpenSidebar={onOpenSidebar}
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
                <ul className="mf-space-card-grid">
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
    <li ref={cardRef} className="mf-space-card group relative cursor-pointer">
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

        <div className="mf-space-card-copy">
          <div className="flex min-h-0 items-center gap-2">
            <div className="mf-space-card-title min-w-0 flex-1">
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
                {getEducationStatusLabel(ws.educationStatus, t)}
              </span>
            )}
          </div>
          <div className="mf-space-card-meta">
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
  onOpenSidebar,
}: {
  title: string;
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
    {title ? (
      <h1 className="flex-1 truncate text-[15.5px] font-medium tracking-tight text-zinc-300">
        {title}
      </h1>
    ) : (
      <div className="flex-1" aria-hidden="true" />
    )}
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
  <div className="rounded-[18px] bg-white/[0.02] px-5 py-10 text-center md:px-8 md:py-12">
    <div className="text-[16.5px] font-semibold text-zinc-200">{title}</div>
    <p className="mt-2 text-[15.5px] text-zinc-500">{hint}</p>
    {cta && (
      <button
        type="button"
        onClick={cta.onClick}
        className="mt-4 inline-flex h-7 items-center justify-center gap-1.5 rounded-[9px] bg-white/[0.08] px-2.5 text-[12px] font-semibold leading-none text-zinc-100 transition-colors hover:bg-white/[0.12]"
      >
        <Plus className="h-3 w-3 shrink-0" />
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
      case "image_upscale":
        return STANDALONE_TOOLS.image_upscale.title;
      case "video_gen":
        return STANDALONE_TOOLS.video_gen.title;
      case "voice_gen":
        return STANDALONE_TOOLS.voice_gen.title;
      case "voice_translate":
        return STANDALONE_TOOLS.voice_translate.title;
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
      <g stroke="hsl(64 100% 60%)" stroke-opacity="0.55" stroke-width="${strokeW}" fill="none">${edgeSvg}</g>
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
