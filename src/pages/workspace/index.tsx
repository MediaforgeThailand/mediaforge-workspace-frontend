/**
 * Workspace dashboard — Magnific-style aggregator home + slim sidebar.
 *
 * Sidebar is split into 2 groups:
 *
 *   Top — primary surfaces:
 *     Home       → aggregator (this design's centrepiece)
 *     Spaces     → grid of all spaces (the old workspace dashboard)
 *     Community  → mockup placeholder
 *     Projects   → mockup placeholder
 *
 *   Bottom — utilities:
 *     All tools  → mockup placeholder (catalog of node types)
 *     Stock      → mockup placeholder (curated stock library)
 *
 * Home aggregates the user's recent activity in a single scroll:
 *   • Top row: 3 cards
 *       Projects   — list of mock project memberships
 *       Spaces     — horizontal carousel of recent spaces with the
 *                     real per-space minimap thumbnail (same engine
 *                     as the Spaces grid below)
 *       Tools      — pinnable list of node families
 *   • "My work →" link → jumps to Spaces view
 *   • Tabs: What's new / Templates / Academy
 *       Backed by a static deck of showcase cards for now —
 *       intentionally a mockup until product owns the editorial side.
 *
 * The Spaces view (full grid with month buckets) is preserved as-is
 * for the Spaces tab — already battle-tested for cross-device sync.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  loadWorkspacesFromServer,
  upsertWorkspaceToServer,
  deleteWorkspaceFromServer,
  listServerCanvasIds,
  saveCanvasToServer,
} from "@/components/workspace/canvasPersistence";
import {
  Plus,
  Layers,
  LayoutGrid,
  Workflow,
  Heart,
  Search,
  Pencil,
  Trash2,
  Lock,
  Users,
  ChevronDown,
  ChevronRight,
  List,
  Home as HomeIcon,
  Globe,
  FolderKanban,
  Boxes,
  Library,
  Image as ImageIcon,
  Video,
  Mic2,
  Wand2,
  Pin,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

/* ════════════════════════════════════════════════════════════
 * Types + helpers
 * ════════════════════════════════════════════════════════════ */

type Section = "home" | "spaces" | "community" | "projects" | "tools" | "stock";

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
  "community",
  "projects",
  "tools",
  "stock",
];

const WorkspaceDashboard = () => {
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
      <DashboardSidebar section={section} onSection={setSection} />
      <main className="flex flex-1 flex-col overflow-hidden">
        {section === "home" && <HomeView onSection={setSection} />}
        {section === "spaces" && <SpacesView />}
        {section !== "home" && section !== "spaces" && (
          <Placeholder section={section} />
        )}
      </main>
    </div>
  );
};

export default WorkspaceDashboard;

/* ════════════════════════════════════════════════════════════
 * Sidebar
 * ════════════════════════════════════════════════════════════ */

const NAV_TOP: Array<{ id: Section; label: string; icon: LucideIcon }> = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "spaces", label: "Spaces", icon: Workflow },
  { id: "community", label: "Community", icon: Globe },
  { id: "projects", label: "Projects", icon: FolderKanban },
];

const NAV_BOTTOM: Array<{ id: Section; label: string; icon: LucideIcon }> = [
  { id: "tools", label: "All tools", icon: Boxes },
  { id: "stock", label: "Stock", icon: Library },
];

const DashboardSidebar = ({
  section,
  onSection,
}: {
  section: Section;
  onSection: (s: Section) => void;
}) => {
  return (
    <aside className="flex h-full w-[228px] shrink-0 flex-col border-r border-white/5 bg-[hsl(0_0%_4%)]">
      {/* Brand row — placeholder logo + collapse affordance. The real
       *  logo lives in /public; tied in once design hands one over. */}
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold tracking-tight text-zinc-50">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-fuchsia-500 to-violet-600 text-[10px] font-bold text-white shadow-[inset_0_-1px_0_hsl(0_0%_0%/0.25)]">
            M
          </span>
          MediaForge
        </div>
      </div>

      {/* Top group — primary surfaces */}
      <nav className="flex flex-col gap-0.5 px-3 pt-2 pb-1">
        {NAV_TOP.map((it) => (
          <NavLink
            key={it.id}
            label={it.label}
            icon={it.icon}
            active={section === it.id}
            onClick={() => onSection(it.id)}
          />
        ))}
      </nav>

      {/* Mid divider — separates "primary navigation" from "utility
       *  surfaces". Mirrors the Magnific reference. */}
      <div className="mx-4 my-3 h-px bg-white/[0.06]" />

      {/* Bottom group — utility surfaces */}
      <nav className="flex flex-col gap-0.5 px-3">
        {NAV_BOTTOM.map((it) => (
          <NavLink
            key={it.id}
            label={it.label}
            icon={it.icon}
            active={section === it.id}
            onClick={() => onSection(it.id)}
          />
        ))}
      </nav>

      <div className="mt-auto px-4 py-3 text-[10.5px] text-zinc-600">
        v1.5 · workspace
      </div>
    </aside>
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
      "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] transition-colors",
      active
        ? "bg-white/[0.07] text-zinc-50 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.05)]"
        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
    )}
  >
    <Icon className="h-3.5 w-3.5" />
    {label}
  </button>
);

/* ════════════════════════════════════════════════════════════
 * Home view — Magnific-style aggregator
 * ════════════════════════════════════════════════════════════ */

interface MockProject {
  id: string;
  name: string;
  /** Tone for the leading colour swatch. */
  color: string;
  icon: LucideIcon;
  /** Lock = personal; Users = team. Drives the trailing icon. */
  visibility: "personal" | "team";
}

const MOCK_PROJECTS: MockProject[] = [
  { id: "personal", name: "Personal", color: "hsl(35 90% 55%)", icon: Lock, visibility: "personal" },
  { id: "team", name: "Team project", color: "hsl(210 90% 60%)", icon: Users, visibility: "team" },
  { id: "godprame", name: "God•Prame", color: "hsl(210 90% 60%)", icon: Layers, visibility: "team" },
  { id: "boss", name: "BOSS", color: "hsl(210 90% 60%)", icon: Layers, visibility: "team" },
  { id: "inwgun", name: "InwGun", color: "hsl(35 90% 55%)", icon: Layers, visibility: "personal" },
];

interface MockTool {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Pinned items show a filled pin icon to the right. */
  pinned?: boolean;
}

const MOCK_TOOLS: MockTool[] = [
  { id: "image-gen", label: "Image Generator", icon: ImageIcon, pinned: true },
  { id: "image-upscale", label: "Image Upscaler", icon: Wand2 },
  { id: "image-edit", label: "Image Editor", icon: Pencil },
  { id: "video-gen", label: "Video Generator", icon: Video, pinned: true },
  { id: "voice-gen", label: "Voice Generator", icon: Mic2 },
];

interface NewsCard {
  id: string;
  title: string;
  /** Tailwind gradient classes for the cover — image-less placeholder. */
  cover: string;
}

const MOCK_NEWS: NewsCard[] = [
  { id: "n1", title: "Workspace V2 — chain tools on a canvas", cover: "from-fuchsia-500 via-violet-600 to-indigo-700" },
  { id: "n2", title: "Native 4K image upscaler is here", cover: "from-emerald-400 via-teal-500 to-cyan-600" },
  { id: "n3", title: "Photorealism down to the last pixel", cover: "from-amber-400 via-orange-500 to-rose-600" },
  { id: "n4", title: "The Chronicles of Bone — story mode", cover: "from-zinc-700 via-zinc-800 to-zinc-900" },
  { id: "n5", title: "PixVerse V6: sharper, longer, louder", cover: "from-sky-400 via-blue-500 to-indigo-600" },
  { id: "n6", title: "Seedance 2.0 — 1080p, live now", cover: "from-rose-400 via-fuchsia-500 to-purple-600" },
  { id: "n7", title: "Wan 2.7 — image-guided video", cover: "from-pink-500 via-rose-500 to-red-500" },
  { id: "n8", title: "Multi-reference video control", cover: "from-orange-500 via-red-600 to-rose-700" },
];

const HomeView = ({ onSection }: { onSection: (s: Section) => void }) => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const canvases = useWorkspaceStore((s) => s.canvases);
  const graphs = useWorkspaceStore((s) => s.graphs);
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
      const server = await loadWorkspacesFromServer();
      if (cancelled || !server) return;
      const localBefore = useWorkspaceStore.getState().workspaces;
      const serverIds = new Set(server.map((w) => w.id));
      const tombstones = useWorkspaceStore.getState().deletedWorkspaceIds;
      const localOnly = localBefore.filter(
        (w) => !serverIds.has(w.id) && !(w.id in tombstones),
      );
      mergeServerWorkspaces(server);
      for (const w of localOnly) void upsertWorkspaceToServer(w, user.id);

      const serverCanvasIds = await listServerCanvasIds();
      if (cancelled || serverCanvasIds === null) return;
      const knownWorkspaceIds = new Set([
        ...serverIds,
        ...localBefore.map((w) => w.id),
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

  /* Recent spaces — top 6 by updatedAt with rendered minimaps so the
   * Home carousel previews are real (not placeholders). */
  const recentSpaces = useMemo(() => {
    return [...workspaces]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6)
      .map((ws) => buildSpaceCardData(ws, canvases, graphs));
  }, [workspaces, canvases, graphs]);

  const handleNew = () => {
    const { workspaceId } = createWorkspace("Untitled space");
    if (user?.id) {
      const meta = useWorkspaceStore
        .getState()
        .workspaces.find((w) => w.id === workspaceId);
      if (meta) void upsertWorkspaceToServer(meta, user.id);
    }
    navigate(`/app/workspace/${workspaceId}`);
  };

  const [newsTab, setNewsTab] = useState<"news" | "templates" | "academy">(
    "news",
  );

  return (
    <>
      <PageHeader title="Home" />

      <div className="ws-scroll-hide flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1400px] px-8 pb-16 pt-6">
          {/* ── Top trio: Projects · Spaces · Tools ───────────── */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr_1fr]">
            <ProjectsCard projects={MOCK_PROJECTS} />
            <SpacesShowcaseCard
              spaces={recentSpaces}
              onOpen={(id) => navigate(`/app/workspace/${id}`)}
              onNew={handleNew}
              onSeeAll={() => onSection("spaces")}
            />
            <ToolsCard tools={MOCK_TOOLS} />
          </section>

          {/* ── My work jump-link ─────────────────────────────── */}
          <div className="mt-10 flex items-center justify-center">
            <button
              type="button"
              onClick={() => onSection("spaces")}
              className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-300 transition-colors hover:text-white"
            >
              My work
              <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
            </button>
          </div>

          {/* ── Editorial tabs ────────────────────────────────── */}
          <div className="mt-6 flex items-center justify-center gap-6 border-b border-white/[0.06]">
            <TabBtn
              label="What's new"
              active={newsTab === "news"}
              onClick={() => setNewsTab("news")}
            />
            <TabBtn
              label="Templates"
              active={newsTab === "templates"}
              onClick={() => setNewsTab("templates")}
            />
            <TabBtn
              label="Academy"
              active={newsTab === "academy"}
              onClick={() => setNewsTab("academy")}
            />
          </div>

          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {MOCK_NEWS.map((card) => (
              <NewsTile key={card.id} card={card} />
            ))}
          </ul>
        </div>
      </div>
    </>
  );
};

const ProjectsCard = ({ projects }: { projects: MockProject[] }) => (
  <div className="rounded-2xl bg-[hsl(0_0%_7%)] p-4 ring-1 ring-inset ring-white/[0.06]">
    <div className="mb-3 flex items-center justify-between">
      <button
        type="button"
        className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:text-white"
      >
        Projects
        <ChevronRight className="h-3 w-3 text-zinc-500" />
      </button>
      <button
        type="button"
        title="New project (mockup)"
        className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>

    <ul className="flex flex-col gap-0.5">
      {projects.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-[12.5px] text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px]"
              style={{ background: p.color }}
            >
              <p.icon className="h-2.5 w-2.5 text-zinc-950" />
            </span>
            <span className="flex-1 truncate text-left">{p.name}</span>
            {p.id === "team" && (
              <span className="rounded bg-fuchsia-500/15 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-fuchsia-300 ring-1 ring-inset ring-fuchsia-500/30">
                Upgrade
              </span>
            )}
            {p.visibility === "personal" ? (
              <Lock className="h-3 w-3 text-zinc-600" />
            ) : (
              <Users className="h-3 w-3 text-zinc-600" />
            )}
          </button>
        </li>
      ))}
    </ul>
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
        className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>

    {spaces.length === 0 ? (
      <button
        type="button"
        onClick={onNew}
        className="flex h-[150px] w-full items-center justify-center rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02] text-[12px] text-zinc-500 transition-colors hover:border-white/[0.20] hover:bg-white/[0.04] hover:text-zinc-200"
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
            className="group/space flex w-[180px] shrink-0 flex-col gap-2 rounded-xl bg-[hsl(0_0%_4%)] p-1.5 ring-1 ring-inset ring-white/[0.05] transition-all hover:ring-white/[0.14]"
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

const ToolsCard = ({ tools }: { tools: MockTool[] }) => (
  <div className="rounded-2xl bg-[hsl(0_0%_7%)] p-4 ring-1 ring-inset ring-white/[0.06]">
    <div className="mb-3 flex items-center justify-between">
      <button
        type="button"
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
            className="group/tool flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-[12.5px] text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/[0.05] ring-1 ring-inset ring-white/[0.08]">
              <t.icon className="h-3 w-3 text-zinc-300" />
            </span>
            <span className="flex-1 truncate text-left">{t.label}</span>
            <Pin
              className={cn(
                "h-3 w-3 transition-colors",
                t.pinned
                  ? "fill-zinc-300 text-zinc-300"
                  : "text-zinc-700 opacity-0 group-hover/tool:opacity-100",
              )}
            />
          </button>
        </li>
      ))}
    </ul>
  </div>
);

const TabBtn = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "relative h-9 px-1 text-[12.5px] transition-colors",
      active ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-200",
    )}
  >
    {label}
    {active && (
      <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-t-sm bg-zinc-100" />
    )}
  </button>
);

const NewsTile = ({ card }: { card: NewsCard }) => (
  <li className="cursor-pointer">
    <div
      className={cn(
        "relative aspect-[16/10] overflow-hidden rounded-xl bg-gradient-to-br ring-1 ring-inset ring-white/[0.06] transition-all hover:ring-white/[0.16]",
        card.cover,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_30%_20%,hsl(0_0%_100%/0.15),transparent)]" />
    </div>
    <div className="mt-2 truncate px-0.5 text-[12.5px] font-medium text-zinc-200">
      {card.title}
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

const SpacesView = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const canvases = useWorkspaceStore((s) => s.canvases);
  const graphs = useWorkspaceStore((s) => s.graphs);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
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
      const server = await loadWorkspacesFromServer();
      if (cancelled || !server) return;
      const localBefore = useWorkspaceStore.getState().workspaces;
      const serverIds = new Set(server.map((w) => w.id));
      const tombstones = useWorkspaceStore.getState().deletedWorkspaceIds;
      const localOnly = localBefore.filter(
        (w) => !serverIds.has(w.id) && !(w.id in tombstones),
      );
      mergeServerWorkspaces(server);
      for (const w of localOnly) void upsertWorkspaceToServer(w, user.id);

      const serverCanvasIds = await listServerCanvasIds();
      if (cancelled || serverCanvasIds === null) return;
      const knownWorkspaceIds = new Set([
        ...serverIds,
        ...localBefore.map((w) => w.id),
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
    const { workspaceId } = createWorkspace("Untitled space");
    if (user?.id) {
      const meta = useWorkspaceStore
        .getState()
        .workspaces.find((w) => w.id === workspaceId);
      if (meta) void upsertWorkspaceToServer(meta, user.id);
    }
    navigate(`/app/workspace/${workspaceId}`);
  };

  const buckets = useMemo(() => {
    return groupByMonth(
      [...workspaces].map((ws) => buildSpaceCardData(ws, canvases, graphs)),
    );
  }, [workspaces, canvases, graphs]);

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
  const handleOpen = (id: string) => navigate(`/app/workspace/${id}`);

  return (
    <>
      <PageHeader title="Spaces" rightSlot={<SpaceToolbar onNew={handleNew} />} />

      <div className="ws-scroll-hide flex-1 overflow-y-auto">
        <div className="px-8 pb-12 pt-4">
          {buckets.length === 0 ? (
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
  onDelete,
}: {
  ws: SpaceCardData;
  onOpen: () => void;
  onRename: () => void;
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

    <div className="pointer-events-none absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
      <ActionButton title="Rename" onClick={(e) => { e.stopPropagation(); onRename(); }} icon={Pencil} />
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
      "rounded-md bg-black/65 p-1.5 text-zinc-300 backdrop-blur transition-colors hover:bg-black/85 hover:text-white",
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
  <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/5 px-8">
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
  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-10 py-20 text-center">
    <div className="text-[15px] font-semibold text-zinc-200">{title}</div>
    <p className="mt-2 text-[12.5px] text-zinc-500">{hint}</p>
    {cta && (
      <button
        type="button"
        onClick={cta.onClick}
        className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-white/[0.08] px-3 py-1.5 text-[12px] font-medium text-zinc-100 ring-1 ring-inset ring-white/[0.10] transition-colors hover:bg-white/[0.12]"
      >
        <Plus className="h-3.5 w-3.5" />
        {cta.label}
      </button>
    )}
  </div>
);

const SECTION_LABELS: Record<Section, string> = {
  home: "Home",
  spaces: "Spaces",
  community: "Community",
  projects: "Projects",
  tools: "All tools",
  stock: "Stock",
};

const Placeholder = ({ section }: { section: Section }) => (
  <>
    <PageHeader title={SECTION_LABELS[section]} />
    <div className="flex flex-1 items-center justify-center p-12">
      <EmptyState
        title="Coming soon"
        hint="This section is part of the workspace mockup — wire-up lands in the next wave."
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
