/**
 * Workspace dashboard — top-level home for everything the user owns.
 *
 * Sections (state-driven, no URL changes):
 *   - All spaces  → grid of workspace cards with structural minimap
 *                   thumbnails. Each card shows a real-image preview
 *                   of the workspace's most-recent canvas: AssetNodes
 *                   render their actual artwork in their stored
 *                   positions, with edge curves drawn between them.
 *   - All assets  → flat grid of every asset across every workspace
 *                   (uploads + generations).
 *   - Favorites / Uploads / Trash → mockup placeholders for now.
 *
 * The left sidebar is permanent — same nav available from every
 * section. The bottom of the sidebar lists "projects" as a mockup
 * (the team / personal split lives elsewhere); kept here so the
 * IA mirrors the reference design and we can backfill data later.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  History,
  Workflow,
  Heart,
  Upload,
  Trash,
  Search,
  Pencil,
  Trash2,
  Image as ImageIcon,
  Film,
  Music,
  Box,
  Lock,
  Users,
  ChevronDown,
  Sliders,
  List,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

/* ════════════════════════════════════════════════════════════
 * Types + helpers
 * ════════════════════════════════════════════════════════════ */

type Section =
  | "projects"
  | "assets"
  | "spaces"
  | "favorites"
  | "uploads"
  | "trash";
type AssetType = "all" | "image" | "video" | "audio" | "model3d";

interface MiniNode {
  id: string;
  type?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Background image — for AssetNodes (`previewUrl`) or tool-node
   *  generations. Lets the minimap show the *content* of a workspace,
   *  not just its skeleton. */
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

const WorkspaceDashboard = () => {
  const [section, setSection] = useState<Section>("spaces");

  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-[hsl(0_0%_5%)] text-zinc-100"
      style={{ fontFamily: "'Prompt', system-ui, sans-serif" }}
    >
      <DashboardSidebar section={section} onSection={setSection} />
      <main className="flex flex-1 flex-col overflow-hidden">
        {section === "spaces" && <SpacesView />}
        {section === "assets" && <AssetsView />}
        {section !== "spaces" && section !== "assets" && (
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

const NAV_ITEMS: Array<{ id: Section; label: string; icon: LucideIcon }> = [
  { id: "projects", label: "All projects", icon: LayoutGrid },
  { id: "assets", label: "All assets", icon: History },
  { id: "spaces", label: "All spaces", icon: Workflow },
  { id: "favorites", label: "Favorites", icon: Heart },
  { id: "uploads", label: "Uploads", icon: Upload },
  { id: "trash", label: "Trash", icon: Trash },
];

interface MockProject {
  id: string;
  name: string;
  /** Tone for the leading colour swatch. */
  color: string;
  icon: LucideIcon;
}

const MOCK_PROJECTS: MockProject[] = [
  { id: "personal", name: "Personal project", color: "hsl(35 90% 55%)", icon: Lock },
  { id: "team", name: "Team project", color: "hsl(210 90% 60%)", icon: Users },
  { id: "godprame", name: "God•Prame", color: "hsl(210 90% 60%)", icon: Layers },
  { id: "boss", name: "BOSS", color: "hsl(210 90% 60%)", icon: Layers },
  { id: "inwgun", name: "InwGun", color: "hsl(35 90% 55%)", icon: Layers },
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
      {/* Top spacer — matches the page-header offset visually. */}
      <div className="h-12" />

      <nav className="flex flex-col gap-0.5 px-3 pb-3">
        {NAV_ITEMS.map((it) => (
          <NavLink
            key={it.id}
            label={it.label}
            icon={it.icon}
            active={section === it.id}
            onClick={() => onSection(it.id)}
          />
        ))}
      </nav>

      {/* Projects section — mockup. The list / counts will pull from
       *  a real `projects` table once the multi-project feature ships;
       *  for now the items are static so the IA still reads correctly
       *  in design reviews. */}
      <div className="mt-2 flex items-center justify-between px-4 pb-2 pt-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Projects{" "}
          <span className="ml-1 rounded-sm bg-white/5 px-1 py-px font-mono text-[8px] uppercase text-zinc-500">
            mockup
          </span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-md p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
            title="Search projects"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="rounded-md p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
            title="New project (mockup)"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-0.5 px-3">
        {MOCK_PROJECTS.map((p) => (
          <ProjectRow key={p.id} project={p} />
        ))}
      </div>

      <div className="mt-auto px-4 py-3 text-[10.5px] text-zinc-600">
        v1.4 · workspace
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

const ProjectRow = ({ project: p }: { project: MockProject }) => (
  <button
    type="button"
    className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-100"
  >
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px]"
      style={{ background: p.color }}
    >
      <p.icon className="h-2.5 w-2.5 text-zinc-950" />
    </span>
    <span className="flex-1 truncate text-left">{p.name}</span>
    {p.id === "personal" && <Lock className="h-3 w-3 text-zinc-600" />}
    {p.id === "team" && <Users className="h-3 w-3 text-zinc-600" />}
  </button>
);

/* ════════════════════════════════════════════════════════════
 * Spaces view (was the old WorkspaceDashboard grid)
 * ════════════════════════════════════════════════════════════ */

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

  /* ── Cross-device sync — pull from the server on mount ────────
   * The dashboard is the natural sync boundary: every visit
   * refreshes the list. Server is read once → merged into local
   * (last-write-wins by updatedAt) → any LOCAL workspaces that
   * don't yet exist on the server get pushed up so a brand-new
   * Device A's data shows up on Device B's next visit.
   *
   * Fire-and-forget — failures fall back to localStorage-only.
   * Guarded with a ref so re-mounts (HMR / route revisits) don't
   * stack duplicate fetches. */
  const syncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      // Reset so a future sign-in re-runs the sync.
      syncedRef.current = null;
      return;
    }
    if (syncedRef.current === user.id) return;
    syncedRef.current = user.id;

    let cancelled = false;
    (async () => {
      const server = await loadWorkspacesFromServer();
      if (cancelled || !server) return;

      // Snapshot what we had locally BEFORE the merge — these are
      // the candidates we need to push up to the server.
      const localBefore = useWorkspaceStore.getState().workspaces;
      const serverIds = new Set(server.map((w) => w.id));
      // Workspaces the user just deleted on this device. The dashboard
      // syncs ONCE per signed-in session, so without this guard a
      // refresh would re-sync local-only workspaces that the user
      // explicitly deleted (the local store already removed them, but
      // any other device's stale store could resurrect them — and the
      // tombstone in `deletedWorkspaceIds` is the only signal of
      // "do not re-create"). Skipping tombstoned ids both in the
      // localOnly push AND in the canvas backfill below stops the
      // resurrection loop reported by the team.
      const tombstones = useWorkspaceStore.getState().deletedWorkspaceIds;
      const localOnly = localBefore.filter(
        (w) => !serverIds.has(w.id) && !(w.id in tombstones),
      );

      mergeServerWorkspaces(server);

      // Push local-only workspaces up. Fire-and-forget — if the
      // user navigates away mid-flight, the next dashboard visit
      // catches up.
      for (const w of localOnly) {
        void upsertWorkspaceToServer(w, user.id);
      }

      /* ── One-shot canvas backfill ─────────────────────────
       * Catches the legacy case where canvases were only ever
       * saved into localStorage on the device that created them
       * (e.g. before the autosave shipped, or before the user
       * upgraded). Without this, a second device opening one of
       * those workspaces sees the empty Page 1 bootstrap and the
       * real nodes appear "lost".
       *
       * Three filters before pushing:
       *   1. Already on server → skip (not orphan, autosave handles).
       *   2. Empty (no nodes / edges) → skip; bootstrap will recreate
       *      a placeholder if the user opens the workspace again.
       *   3. Workspace doesn't exist on server AND isn't local AND
       *      isn't pending push → skip; this canvas's parent
       *      workspace was deleted and pushing the canvas would
       *      generate an orphan that `workspaces_sync` would later
       *      resurrect as "Recovered workspace".
       *
       * Runs ONCE per signed-in session (`syncedRef` above gates
       * the whole effect). Subsequent mutations flow through the
       * canvas-page autosave as before. */
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
          (graph.nodes?.length ?? 0) > 0 ||
          (graph.edges?.length ?? 0) > 0;
        if (!hasContent) continue;
        // Skip orphan canvases — workspace deleted everywhere,
        // pushing this would just feed the resurrection loop.
        if (!knownWorkspaceIds.has(graph.workspaceId)) continue;
        // Skip canvases of tombstoned workspaces (the user just
        // deleted the workspace; the local store may still have
        // graphs cached — those are dead weight now).
        if (graph.workspaceId in tombstones) continue;
        void saveCanvasToServer(graph, user.id);
      }
    })().catch((err) => {
      console.warn("[workspace-dashboard] sync failed:", err);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading, mergeServerWorkspaces]);

  const handleNew = () => {
    const { workspaceId } = createWorkspace("Untitled space");
    // Push to server so the new space appears on every other
    // device the user is signed into. Server is fire-and-forget;
    // we navigate immediately based on local state.
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
      [...workspaces].map((ws) => {
        const wsCanvases = canvases.filter((c) => c.workspaceId === ws.id);
        const previewCanvasId = pickPreviewCanvasId(ws.id, canvases);
        const graph = previewCanvasId ? graphs[previewCanvasId] : null;

        const rawNodes = graph?.nodes ?? [];
        // Build a map of node id → image url (if any) so the minimap
        // can render real artwork at each node's position. We pull
        // from AssetNode `previewUrl` first, then the first valid
        // generation URL on tool nodes (Tripo3D's rendered_image
        // counts even though the node output is technically GLB).
        const nodes: MiniNode[] = rawNodes.map((n) => {
          const d = (n.data ?? {}) as Record<string, unknown>;
          let imageUrl: string | undefined;
          if (n.type === "assetNode") {
            const ft = d.fieldType as string | undefined;
            // Skip 3D / video / audio in the minimap — only image-shape
            // assets render visibly. The poster URL handles 3D models.
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
          const measured = (
            n as unknown as { measured?: { width?: number; height?: number } }
          ).measured;
          const styleW = (n as unknown as { style?: { width?: number } }).style
            ?.width;
          const styleH = (n as unknown as { style?: { height?: number } })
            .style?.height;
          return {
            id: n.id,
            type: n.type,
            x: n.position?.x ?? 0,
            y: n.position?.y ?? 0,
            w: measured?.width ?? n.width ?? styleW ?? FALLBACK_W,
            h: measured?.height ?? n.height ?? styleH ?? FALLBACK_H,
            imageUrl,
          };
        });
        const edges: MiniEdge[] = (graph?.edges ?? []).map((e) => ({
          source: e.source,
          target: e.target,
        }));
        return {
          id: ws.id,
          name: ws.name,
          updatedAt: ws.updatedAt,
          tabCount: wsCanvases.length,
          nodes,
          edges,
        };
      }),
    );
  }, [workspaces, canvases, graphs]);

  const handleRename = (id: string, currentName: string) => {
    const next = prompt("Rename space:", currentName);
    if (next?.trim() && next.trim() !== currentName) {
      renameWorkspace(id, next.trim());
      // Mirror to server so the rename shows up on every other
      // device. The local rename also bumped `updatedAt` so the
      // merge logic on the next visit prefers our value.
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
    // Tombstone the row server-side too — without this, the next
    // dashboard visit on this same device (or any other) would
    // re-merge the server copy back in and resurrect the deleted
    // space. RLS guarantees only the owner can delete.
    if (user?.id) void deleteWorkspaceFromServer(id);
  };
  const handleOpen = (id: string) => navigate(`/app/workspace/${id}`);

  return (
    <>
      <PageHeader title="All spaces" rightSlot={<SpaceToolbar onNew={handleNew} />} />

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
  </div>
);

const SpaceCard = ({
  ws,
  onOpen,
  onRename,
  onDelete,
}: {
  ws: {
    id: string;
    name: string;
    updatedAt: number;
    tabCount: number;
    nodes: MiniNode[];
    edges: MiniEdge[];
  };
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
      {/* Mini canvas snapshot — real images at real positions. */}
      <div className="relative aspect-[16/10] overflow-hidden bg-[hsl(0_0%_4%)]">
        <CanvasMinimap nodes={ws.nodes} edges={ws.edges} />
      </div>

      {/* Footer */}
      <div className="px-3.5 py-3">
        <div className="truncate text-[13px] font-semibold leading-tight text-zinc-50">
          {ws.name}
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">
          {timeAgo(ws.updatedAt)}
        </div>
      </div>
    </button>

    {/* Hover-reveal action pills */}
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
 * Assets view
 * ════════════════════════════════════════════════════════════ */

interface FlatAsset {
  id: string;
  source: "uploaded" | "generated";
  fieldType: "image" | "video" | "audio" | "model3d";
  url: string;
  posterUrl?: string;
  label: string;
  createdAt: number;
  updatedAt: number;
  /** Display label for source badge ("GEN" / "UP"). */
}

function genFieldType(
  gen: { type?: string; url?: string; model_url?: string },
): FlatAsset["fieldType"] | null {
  if (gen.model_url) return "model3d";
  const t = (gen.type ?? "").toLowerCase();
  if (t === "image" || t === "video" || t === "audio") return t;
  if (t === "model3d" || t === "model_3d") return "model3d";
  const url = gen.url ?? "";
  if (/\.(glb|gltf|usdz|obj|fbx)(\?|#|$)/i.test(url)) return "model3d";
  if (/\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(url)) return "image";
  if (/\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg)(\?|#|$)/i.test(url)) return "audio";
  return null;
}

const AssetsView = () => {
  const allGraphs = useWorkspaceStore((s) => s.graphs);
  const [typeFilter, setTypeFilter] = useState<AssetType>("all");

  const assets = useMemo<FlatAsset[]>(() => {
    const out: FlatAsset[] = [];
    const seen = new Set<string>();
    for (const canvasId of Object.keys(allGraphs)) {
      const graph = allGraphs[canvasId];
      const nodes = graph?.nodes ?? [];
      for (const n of nodes) {
        const d = (n.data ?? {}) as Record<string, unknown>;
        const ts =
          (graph?.updatedAt as number | undefined) ?? Date.now();

        if (
          n.type === "assetNode" &&
          typeof d.previewUrl === "string" &&
          typeof d.fieldType === "string"
        ) {
          if (!seen.has(d.previewUrl)) {
            seen.add(d.previewUrl);
            out.push({
              id: `u_${canvasId}_${n.id}`,
              source: "uploaded",
              fieldType: d.fieldType as FlatAsset["fieldType"],
              url: d.previewUrl,
              posterUrl:
                typeof d.posterUrl === "string" ? d.posterUrl : undefined,
              label:
                (d.label as string) ||
                (d.fileName as string) ||
                "asset",
              createdAt:
                typeof d.uploadedAt === "number" ? d.uploadedAt : ts,
              updatedAt:
                typeof d.uploadedAt === "number" ? d.uploadedAt : ts,
            });
          }
        }

        const gens = Array.isArray(d.generations)
          ? (d.generations as Array<Record<string, unknown>>)
          : [];
        for (let i = 0; i < gens.length; i++) {
          const g = gens[i] ?? {};
          const ft = genFieldType(g);
          if (!ft) continue;
          const assetUrl =
            ft === "model3d" && typeof g.model_url === "string"
              ? (g.model_url as string)
              : (g.url as string | undefined);
          if (!assetUrl || seen.has(assetUrl)) continue;
          seen.add(assetUrl);
          const posterUrl =
            ft === "model3d" && typeof g.url === "string" && g.url !== assetUrl
              ? (g.url as string)
              : undefined;
          const label =
            (d.label as string) ||
            ((d.params as Record<string, unknown> | undefined)
              ?.nodeName as string) ||
            n.type ||
            "output";
          const createdAt =
            typeof g.createdAt === "number" ? g.createdAt : ts;
          out.push({
            id: `g_${canvasId}_${n.id}_${(g.id as string) ?? i}`,
            source: "generated",
            fieldType: ft,
            url: assetUrl,
            posterUrl,
            label,
            createdAt,
            updatedAt: createdAt,
          });
        }
      }
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }, [allGraphs]);

  const filtered =
    typeFilter === "all"
      ? assets
      : assets.filter((a) => a.fieldType === typeFilter);

  const buckets = useMemo(() => groupByMonth(filtered), [filtered]);

  const counts = useMemo(() => {
    const c = { all: assets.length, image: 0, video: 0, audio: 0, model3d: 0 };
    for (const a of assets) c[a.fieldType] += 1;
    return c;
  }, [assets]);

  return (
    <>
      <PageHeader
        title="All assets"
        rightSlot={
          <AssetToolbar
            counts={counts}
            typeFilter={typeFilter}
            onTypeFilter={setTypeFilter}
          />
        }
      />

      <div className="ws-scroll-hide flex-1 overflow-y-auto">
        <div className="px-8 pb-12 pt-4">
          {buckets.length === 0 ? (
            <EmptyState
              title="No assets yet"
              hint="Upload a file or run a tool to fill the library."
            />
          ) : (
            buckets.map((b) => (
              <section key={b.label} className="mb-10">
                <MonthHeader label={b.label} />
                <ul
                  className="grid auto-rows-[200px] grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"
                  style={{ gridAutoFlow: "dense" }}
                >
                  {b.items.map((a) => (
                    <AssetCard key={a.id} asset={a} />
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

const AssetToolbar = ({
  counts,
  typeFilter,
  onTypeFilter,
}: {
  counts: { all: number; image: number; video: number; audio: number; model3d: number };
  typeFilter: AssetType;
  onTypeFilter: (t: AssetType) => void;
}) => (
  <div className="flex items-center gap-2">
    {/* Type segment — All / image / video / audio / 3D */}
    <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5 ring-1 ring-inset ring-white/[0.06]">
      <SegmentBtn active={typeFilter === "all"} onClick={() => onTypeFilter("all")} label={`All`} count={counts.all} />
      <SegmentBtn active={typeFilter === "image"} onClick={() => onTypeFilter("image")} icon={ImageIcon} count={counts.image} />
      <SegmentBtn active={typeFilter === "video"} onClick={() => onTypeFilter("video")} icon={Film} count={counts.video} />
      <SegmentBtn active={typeFilter === "audio"} onClick={() => onTypeFilter("audio")} icon={Music} count={counts.audio} />
      <SegmentBtn active={typeFilter === "model3d"} onClick={() => onTypeFilter("model3d")} icon={Box} count={counts.model3d} />
    </div>
    <SegmentDivider />
    <ChromePill icon={ChevronDown} label="Project" />
    <ChromeIconBtn icon={List} title="List view" />
    <ChromeIconBtn icon={LayoutGrid} title="Grid view" active />
    <ChromeIconBtn icon={Heart} title="Favorites" />
    <ChromeIconBtn icon={Sliders} title="Filters" />
    <ChromeIconBtn icon={Search} title="Search" />
  </div>
);

const SegmentBtn = ({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  label?: string;
  count?: number;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "flex h-7 items-center gap-1.5 rounded px-2 text-[11px] transition-colors",
      active
        ? "bg-white/[0.10] text-zinc-50 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.06)]"
        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
    )}
    title={label}
  >
    {Icon && <Icon className="h-3.5 w-3.5" />}
    {label && <span>{label}</span>}
    {typeof count === "number" && count > 0 && (
      <span className={cn("font-mono text-[9px]", active ? "text-zinc-300" : "text-zinc-500")}>
        {count}
      </span>
    )}
  </button>
);

const AssetCard = ({ asset: a }: { asset: FlatAsset }) => {
  // Some asset cards span 2 rows for visual rhythm — we mark uploaded
  // image assets (which tend to be the most varied / visually rich)
  // as "tall" so the grid doesn't read as a uniform tile field.
  const isTall = a.source === "uploaded" && a.fieldType === "image";
  // Audio cards get a special "voiceover" treatment with a circular
  // wave pattern and a duration chip — like the reference.
  return (
    <li
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-xl ring-1 ring-inset ring-white/[0.06] transition-all hover:ring-white/[0.14]",
        isTall && "row-span-2",
      )}
    >
      <div className="relative h-full w-full bg-[hsl(0_0%_8%)]">
        {a.fieldType === "image" || a.fieldType === "model3d" ? (
          <img
            src={a.fieldType === "model3d" && a.posterUrl ? a.posterUrl : a.url}
            alt={a.label}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : a.fieldType === "video" ? (
          <video
            src={a.url}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
            onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
            onMouseLeave={(e) => {
              const v = e.target as HTMLVideoElement;
              v.pause();
              v.currentTime = 0;
            }}
          />
        ) : (
          // Audio — concentric ring "vinyl" with the title overlay.
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[hsl(0_0%_12%)] to-[hsl(0_0%_6%)]">
            <div
              aria-hidden
              className="absolute inset-0 opacity-50"
              style={{
                background:
                  "repeating-radial-gradient(circle at 50% 50%, hsl(0 0% 100% / 0.04) 0 1px, transparent 1px 8px)",
              }}
            />
            <span className="relative z-10 text-[12px] font-medium text-zinc-300">
              {a.label || "Voiceover"}
            </span>
          </div>
        )}

        {/* Bottom-left chip: duration / dimensions / src icon */}
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
          {a.fieldType === "audio" && (
            <Chip icon={Music} text="00:21" />
          )}
          {a.fieldType === "video" && (
            <Chip icon={Film} text="0:10" />
          )}
        </div>
      </div>
    </li>
  );
};

const Chip = ({ icon: Icon, text }: { icon: LucideIcon; text: string }) => (
  <span className="flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[9.5px] font-medium text-zinc-200 backdrop-blur">
    <Icon className="h-2.5 w-2.5" />
    {text}
  </span>
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
  <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/5 px-8">
    <h1 className="text-[18px] font-semibold tracking-tight text-zinc-50">
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

const Placeholder = ({ section }: { section: Section }) => (
  <>
    <PageHeader title={NAV_ITEMS.find((n) => n.id === section)?.label ?? ""} />
    <div className="flex flex-1 items-center justify-center p-12">
      <EmptyState
        title="Coming soon"
        hint="This section is part of the dashboard mockup."
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

      {/* Edges */}
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

      {/* Nodes — render real images when available, falling back to a
       *  neutral filled rect for text / tool / group nodes. */}
      <g>
        {nodes.map((n) => {
          const isGroup = n.type === "groupNode";
          const fill = NODE_FILL[n.type ?? ""] ?? TOOL_FILL;

          // Image-bearing nodes (assets, generations) — clip-path the
          // bitmap into a rounded-rect so the corners match the canvas
          // node geometry.
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
