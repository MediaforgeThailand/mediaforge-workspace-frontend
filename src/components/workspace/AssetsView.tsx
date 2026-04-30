/**
 * Workspace Asset Library — Magnific-style "All assets" surface.
 *
 * Replaces the legacy HistoryView (which only showed raw generation
 * jobs) with a unified asset browsing experience inspired directly
 * by Magnific's `/all-assets` page:
 *
 *   ┌──────────────┬──────────────────────────────────────────────┐
 *   │ All projects │ All assets                                   │
 *   │ All assets ✓ │  [All|Image|Video|Audio|3D]    [filters]    │
 *   │ All spaces   │                                              │
 *   │ Favorites    │  ── April 2026 ───────────────────────────   │
 *   │ Uploads      │  [card] [card] [card] [card] [card]          │
 *   │ Trash        │  [card] [card] [card] [card] [card]          │
 *   │              │                                              │
 *   │ PROJECTS     │  ── March 2026 ───────────────────────────   │
 *   │ ▸ Project A  │  [card] [card] [card]                        │
 *   │ ▸ Project B  │                                              │
 *   └──────────────┴──────────────────────────────────────────────┘
 *
 * Data sources
 * ────────────
 *   • Generated assets ─ `workspace_generation_jobs` rows where
 *     `status = 'completed'` and `result.url` is non-null. The same
 *     RLS policy that gates HistoryView's realtime subscription
 *     (`auth.uid() = user_id`) applies here so the user only ever
 *     sees their own work.
 *   • Uploads ─ Supabase Storage bucket `ai-media`, listed under the
 *     user's own prefix (`<userId>/...`). The bucket policy already
 *     restricts list/get to that path, so we don't need to filter
 *     server-side.
 *
 * Mobile
 * ──────
 *   The inner sub-sidebar collapses behind a Filters button on
 *   narrow viewports — same pattern as Magnific's mobile view.
 *   Project list moves into the same drawer; the grid below stays
 *   3-up at lg+, 2-up at sm-md, and 1-up under 360px.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Image as ImageIcon,
  Film,
  Music,
  Box,
  Folder,
  Star,
  UploadCloud,
  Trash2,
  LayoutGrid,
  Search as SearchIcon,
  SlidersHorizontal,
  X,
  ChevronDown,
  RefreshCcw,
  ExternalLink,
  Download,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { cn } from "@/lib/utils";

type AssetKind = "image" | "video" | "audio" | "3d";

type GenerationAsset = {
  source: "generation";
  id: string;
  kind: AssetKind;
  url: string;
  thumbnailUrl?: string;
  modelLabel?: string;
  prompt?: string;
  projectId: string | null;
  canvasId: string | null;
  nodeId: string | null;
  createdAt: string;        // ISO
  durationSec?: number;     // for video
  width?: number;           // for image
  height?: number;
  status: string;
};

type UploadAsset = {
  source: "upload";
  id: string;
  kind: AssetKind;
  url: string;
  name: string;
  projectId: string | null;
  createdAt: string;
  size?: number;
};

type Asset = GenerationAsset | UploadAsset;

type FilterKind = "all" | AssetKind;

type SectionKind = "all" | "spaces" | "favorites" | "uploads" | "trash";

const KIND_ICON: Record<AssetKind, LucideIcon> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  "3d":  Box,
};

const FILTER_BUTTONS: Array<{ key: FilterKind; label: string; icon: LucideIcon }> = [
  { key: "all",   label: "All",   icon: LayoutGrid },
  { key: "image", label: "Image", icon: ImageIcon },
  { key: "video", label: "Video", icon: Film },
  { key: "audio", label: "Audio", icon: Music },
  { key: "3d",    label: "3D",    icon: Box },
];

const SIDE_NAV: Array<{ key: SectionKind; label: string; icon: LucideIcon }> = [
  { key: "all",       label: "All assets", icon: LayoutGrid },
  { key: "spaces",    label: "All spaces", icon: Folder },
  { key: "favorites", label: "Favorites",  icon: Star },
  { key: "uploads",   label: "Uploads",    icon: UploadCloud },
  { key: "trash",     label: "Trash",      icon: Trash2 },
];

export default function AssetsView({
  onOpenSidebar,
}: {
  /** Optional — when provided, renders a hamburger button in the
   *  header that opens the workspace dashboard's main sidebar
   *  drawer. Only the dashboard route passes this; standalone uses
   *  of AssetsView (none today) skip it. */
  onOpenSidebar?: () => void;
} = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const projects = useWorkspaceStore((s) => s.projects);

  // Right-panel state.
  const [section, setSection] = useState<SectionKind>("all");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Generation assets — live-paged from workspace_generation_jobs.
  const [genAssets, setGenAssets] = useState<GenerationAsset[]>([]);
  const [genLoading, setGenLoading] = useState(true);
  const [genHasMore, setGenHasMore] = useState(true);

  // Upload assets — paged from `ai-media` storage prefix.
  const [uploadAssets, setUploadAssets] = useState<UploadAsset[]>([]);
  const [uploadLoading, setUploadLoading] = useState(false);

  const PAGE = 60;

  /** Fetch a page of completed generations for the current user. */
  const fetchGenPage = useCallback(
    async (offset: number) => {
      if (!user) return;
      const { data, error } = await supabase
        .from("workspace_generation_jobs")
        .select(
          "id, status, node_type, provider, model, request, result, created_at, project_id, canvas_id, node_id",
        )
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE - 1);

      if (error) {
        toast.error(`Asset load failed: ${error.message}`);
        return;
      }
      const next: GenerationAsset[] = (data ?? [])
        .map((row): GenerationAsset | null => {
          const result = (row.result ?? {}) as {
            url?: string;
            type?: string;
            text?: string;
            provider_meta?: { model_url?: string };
          };
          // 3D wins over image: a hyper3d / tripo3d job stores the
          // GLB url under provider_meta.model_url and a poster image
          // under result.url. Treat the row as a 3D asset whenever
          // model_url is present.
          const modelUrl = result?.provider_meta?.model_url;
          const url = modelUrl ?? result.url;
          if (!url) return null;
          let kind: AssetKind = "image";
          if (modelUrl) kind = "3d";
          else if (result.type === "video") kind = "video";
          else if (result.type === "audio") kind = "audio";
          else kind = "image";

          const params =
            (row.request as { params?: Record<string, unknown> } | null)?.params ?? {};
          const promptText =
            typeof params.prompt === "string"
              ? params.prompt
              : typeof params.system_prompt === "string"
                ? (params.system_prompt as string)
                : "";

          return {
            source: "generation",
            id: row.id as string,
            kind,
            url,
            thumbnailUrl: kind === "3d" ? result.url : undefined,
            modelLabel: (row.model as string | null) ?? (row.node_type as string),
            prompt: promptText,
            projectId: (row.project_id as string | null) ?? null,
            canvasId: (row.canvas_id as string | null) ?? null,
            nodeId: (row.node_id as string | null) ?? null,
            createdAt: row.created_at as string,
            status: row.status as string,
            durationSec:
              typeof params.duration === "number"
                ? (params.duration as number)
                : typeof params.duration === "string"
                  ? Number.parseInt(params.duration as string, 10) || undefined
                  : undefined,
          };
        })
        .filter((x): x is GenerationAsset => x !== null);
      setGenAssets((prev) => (offset === 0 ? next : [...prev, ...next]));
      setGenHasMore(next.length === PAGE);
    },
    [user],
  );

  /** First-load + when user switches to All / Spaces / Favorites
   *  (i.e. anything that consumes the generation feed). */
  useEffect(() => {
    if (!user) return;
    if (section === "uploads" || section === "trash") return;
    setGenLoading(true);
    setGenAssets([]);
    setGenHasMore(true);
    void fetchGenPage(0).finally(() => setGenLoading(false));
  }, [user, section, fetchGenPage]);

  /** Realtime — prepend INSERTs and patch UPDATEs. */
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("workspace-assets-feed")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_generation_jobs",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Tear it down to a single replay path: just refetch the
          // first page when anything in the user's stream changes.
          // Cheap, correct, beats trying to merge insert/update/
          // delete events into a paged list by hand.
          void fetchGenPage(0);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, fetchGenPage]);

  /** Lazy-load uploads when the user opens the Uploads tab. */
  useEffect(() => {
    if (section !== "uploads" || !user) return;
    setUploadLoading(true);
    void (async () => {
      try {
        // List the user's own folder in `ai-media`. Storage RLS
        // already restricts us to `(storage.foldername(name))[1] =
        // auth.uid()`, so we can pass `userId` as the prefix and
        // get back only files we own.
        const { data, error } = await supabase.storage
          .from("ai-media")
          .list(user.id, {
            limit: 200,
            sortBy: { column: "created_at", order: "desc" },
          });
        if (error) throw error;
        const items: UploadAsset[] = [];
        for (const obj of data ?? []) {
          // `list()` at the user's root returns folders too — skip
          // those. A file row has a non-null `id` and a name with an
          // extension; folders come back with id=null.
          if (!obj.id) continue;
          const path = `${user.id}/${obj.name}`;
          const { data: signed } = await supabase.storage
            .from("ai-media")
            .createSignedUrl(path, 60 * 60 * 24);
          const url = signed?.signedUrl;
          if (!url) continue;
          const lower = obj.name.toLowerCase();
          let kind: AssetKind = "image";
          if (/\.(mp4|webm|mov|m4v)$/i.test(lower)) kind = "video";
          else if (/\.(mp3|wav|m4a|ogg|aac)$/i.test(lower)) kind = "audio";
          else if (/\.(glb|gltf|obj|fbx|usdz)$/i.test(lower)) kind = "3d";
          items.push({
            source: "upload",
            id: path,
            kind,
            url,
            name: obj.name,
            projectId: null,
            createdAt: obj.created_at ?? new Date().toISOString(),
            size: (obj.metadata as { size?: number } | null)?.size,
          });
        }
        setUploadAssets(items);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Upload list failed: ${msg}`);
      } finally {
        setUploadLoading(false);
      }
    })();
  }, [section, user]);

  /** Resolve the active dataset based on the current section. */
  const baseAssets: Asset[] = useMemo(() => {
    if (section === "uploads") return uploadAssets;
    if (section === "trash" || section === "favorites" || section === "spaces") {
      // Phase-1 placeholder — these tabs need extra DB tables
      // (favorites flag / soft-delete flag) we don't have yet.
      return [];
    }
    return genAssets;
  }, [section, genAssets, uploadAssets]);

  /** Filter pipeline — kind → project → search. */
  const filteredAssets: Asset[] = useMemo(() => {
    let out = baseAssets;
    if (filter !== "all") out = out.filter((a) => a.kind === filter);
    if (activeProject) out = out.filter((a) => a.projectId === activeProject);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      out = out.filter((a) => {
        if (a.source === "generation") {
          return (
            (a.prompt ?? "").toLowerCase().includes(q) ||
            (a.modelLabel ?? "").toLowerCase().includes(q)
          );
        }
        return a.name.toLowerCase().includes(q);
      });
    }
    return out;
  }, [baseAssets, filter, activeProject, searchQuery]);

  /** Bucket grid by month for the section dividers. */
  const grouped = useMemo(() => {
    const out: Array<{ label: string; items: Asset[] }> = [];
    let cur: { label: string; items: Asset[] } | null = null;
    for (const a of filteredAssets) {
      const d = new Date(a.createdAt);
      const label = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      });
      if (!cur || cur.label !== label) {
        cur = { label, items: [] };
        out.push(cur);
      }
      cur.items.push(a);
    }
    return out;
  }, [filteredAssets]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden text-zinc-100">
      {/* ── Left sub-sidebar (≥ md) ─────────────────────────── */}
      <aside className="hidden h-full w-[212px] shrink-0 flex-col overflow-y-auto border-r border-white/5 bg-[hsl(0_0%_5%)] md:flex">
        <SubNav
          section={section}
          setSection={(s) => {
            setSection(s);
            setActiveProject(null);
          }}
          activeProject={activeProject}
          setActiveProject={(id) => {
            setActiveProject(id);
            setSection("all");
          }}
          projects={projects}
        />
      </aside>

      {/* ── Mobile drawer ──────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 bg-black/65"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative z-10 h-full w-[268px] max-w-[84vw] overflow-y-auto border-r border-white/5 bg-[hsl(0_0%_5%)]">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[13px] font-semibold text-zinc-100">Browse</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1 text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SubNav
              section={section}
              setSection={(s) => {
                setSection(s);
                setActiveProject(null);
                setDrawerOpen(false);
              }}
              activeProject={activeProject}
              setActiveProject={(id) => {
                setActiveProject(id);
                setSection("all");
                setDrawerOpen(false);
              }}
              projects={projects}
            />
          </aside>
        </div>
      )}

      {/* ── Main panel ─────────────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-3 sm:px-6">
          {/* Workspace sidebar toggle (mobile) — only shown when the
           *  dashboard wired in `onOpenSidebar`. Different button from
           *  the filters drawer below; this opens the OUTER sidebar
           *  (Home / All assets nav) while the filters drawer below
           *  opens the INNER sub-nav (sections + projects). */}
          {onOpenSidebar && (
            <button
              type="button"
              onClick={onOpenSidebar}
              aria-label="Open menu"
              className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-zinc-300 hover:bg-white/[0.06] hover:text-white md:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
          {/* Filters drawer toggle (mobile) — opens the inner sub-nav
           *  drawer (sections / projects). Sits to the right of the
           *  hamburger above so they don't collide. */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-zinc-300 hover:bg-white/[0.08] md:hidden"
            aria-label="Open filters"
            title="Filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-base font-semibold leading-snug text-zinc-100 sm:text-lg">
              {sectionTitle(section, projects, activeProject)}
            </h1>
            <span className="text-[11px] text-zinc-500">
              {filteredAssets.length} item{filteredAssets.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {/* Filter pills (desktop) */}
            <div className="hidden items-center gap-1 rounded-lg bg-white/[0.04] p-0.5 sm:flex">
              {FILTER_BUTTONS.map((b) => {
                const Icon = b.icon;
                const active = filter === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setFilter(b.key)}
                    className={cn(
                      "flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] transition-colors",
                      active
                        ? "bg-white/[0.10] text-zinc-50"
                        : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
                    )}
                  >
                    <Icon className="h-3 w-3" /> {b.label}
                  </button>
                );
              })}
            </div>
            {/* Filter pill compact (mobile) */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterKind)}
              className="block rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[12px] text-zinc-200 sm:hidden"
            >
              {FILTER_BUTTONS.map((b) => (
                <option key={b.key} value={b.key} className="bg-zinc-900">
                  {b.label}
                </option>
              ))}
            </select>
            {/* Search */}
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className={cn(
                "rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100",
                searchOpen && "bg-white/[0.06] text-zinc-100",
              )}
              aria-label="Search"
            >
              <SearchIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (section === "uploads") {
                  setUploadLoading(true);
                  setUploadAssets([]);
                  // Triggers the uploads useEffect via state churn.
                  setSection("uploads");
                } else {
                  setGenLoading(true);
                  setGenAssets([]);
                  setGenHasMore(true);
                  void fetchGenPage(0).finally(() => setGenLoading(false));
                }
              }}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
              aria-label="Refresh"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="border-b border-white/5 bg-white/[0.02] px-4 py-2 sm:px-6">
            <div className="flex items-center gap-2">
              <SearchIcon className="h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search prompt, model, or file name…"
                autoFocus
                className="w-full bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="rounded-md p-1 text-zinc-400 hover:bg-white/[0.05]"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {(section === "favorites" || section === "trash" || section === "spaces") ? (
            <PlaceholderTab section={section} onGoTo={() => setSection("all")} />
          ) : genLoading || (section === "uploads" && uploadLoading) ? (
            <CenterLoader />
          ) : filteredAssets.length === 0 ? (
            <EmptyState section={section} hasFilter={filter !== "all" || !!searchQuery || !!activeProject} />
          ) : (
            <div className="flex flex-col gap-7 pb-12">
              {grouped.map((g) => (
                <section key={g.label} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-white/20 bg-white/[0.04] accent-violet-500"
                      aria-label={`Select all in ${g.label}`}
                      onChange={() => undefined}
                    />
                    <h2 className="text-[12px] font-medium text-zinc-300">
                      {g.label}
                    </h2>
                    <span className="text-[11px] text-zinc-600">· {g.items.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {g.items.map((a) => (
                      <AssetCard
                        key={`${a.source}-${a.id}`}
                        asset={a}
                        onOpenCanvas={(canvasId, nodeId) => {
                          const qp = new URLSearchParams({ canvas: canvasId });
                          if (nodeId) qp.set("node", nodeId);
                          navigate(`/app/workspace?${qp.toString()}`);
                        }}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {section !== "uploads" && genHasMore && (
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    onClick={() => void fetchGenPage(genAssets.length)}
                    className="rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                  >
                    Load more
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ─── Pieces ─────────────────────────────────────────────────────── */

function SubNav({
  section,
  setSection,
  activeProject,
  setActiveProject,
  projects,
}: {
  section: SectionKind;
  setSection: (s: SectionKind) => void;
  activeProject: string | null;
  setActiveProject: (id: string | null) => void;
  projects: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="flex flex-col">
      <div className="px-3 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
        Browse
      </div>
      <nav className="flex flex-col gap-0.5 px-2 pb-2">
        {SIDE_NAV.map((it) => {
          const Icon = it.icon;
          const active = section === it.key && !activeProject;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => setSection(it.key)}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
                active
                  ? "bg-white/[0.07] text-zinc-50"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {it.label}
            </button>
          );
        })}
      </nav>
      {projects.length > 0 && (
        <div className="border-t border-white/5 pt-2">
          <div className="flex items-center justify-between px-3 pb-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Projects
            </span>
          </div>
          <div className="flex flex-col gap-0.5 px-2 pb-4">
            {projects.map((p) => {
              const active = activeProject === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveProject(p.id)}
                  className={cn(
                    "flex h-8 items-center gap-2 truncate rounded-md px-2.5 text-[12.5px] transition-colors",
                    active
                      ? "bg-white/[0.07] text-zinc-50"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
                  )}
                  title={p.name}
                >
                  <Folder className="h-3 w-3 shrink-0 text-zinc-500" />
                  <span className="truncate">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  onOpenCanvas,
}: {
  asset: Asset;
  onOpenCanvas: (canvasId: string, nodeId: string | null) => void;
}) {
  const Icon = KIND_ICON[asset.kind];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hovered, setHovered] = useState(false);

  // Lazily play / pause on hover so the grid doesn't choke on a
  // page full of <video autoplay loop>.
  useEffect(() => {
    if (asset.kind !== "video" || !videoRef.current) return;
    if (hovered) {
      void videoRef.current.play().catch(() => undefined);
    } else {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [hovered, asset.kind]);

  const overlayLabel =
    asset.kind === "video"
      ? asset.source === "generation" && asset.durationSec
        ? `${Math.round(asset.durationSec)}s`
        : "Video"
      : asset.kind === "audio"
        ? "Audio"
        : asset.kind === "3d"
          ? "3D"
          : null;

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-lg bg-zinc-900/60 ring-1 ring-inset ring-white/5 transition-colors hover:ring-white/15"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-black/40">
        {asset.kind === "video" ? (
          <video
            ref={videoRef}
            src={asset.url}
            className="h-full w-full object-cover"
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : asset.kind === "audio" ? (
          <div className="grid h-full w-full place-items-center text-zinc-700">
            <Music className="h-10 w-10" />
          </div>
        ) : asset.kind === "3d" ? (
          asset.source === "generation" && asset.thumbnailUrl ? (
            <img
              src={asset.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-zinc-700">
              <Box className="h-10 w-10" />
            </div>
          )
        ) : (
          <img
            src={asset.url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}

        {/* Bottom-left kind chip */}
        {overlayLabel && (
          <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-zinc-100 backdrop-blur-sm">
            <Icon className="h-3 w-3" /> {overlayLabel}
          </span>
        )}

        {/* Hover actions */}
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <a
            href={asset.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-black/60 p-1.5 text-zinc-200 hover:bg-black/80 hover:text-white"
            title="Open / download"
          >
            <Download className="h-3 w-3" />
          </a>
          {asset.source === "generation" && asset.canvasId && (
            <button
              type="button"
              onClick={() => onOpenCanvas(asset.canvasId!, asset.nodeId)}
              className="rounded-md bg-black/60 p-1.5 text-zinc-200 hover:bg-black/80 hover:text-white"
              title="Open in space"
            >
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Caption */}
      <div className="flex flex-col gap-0.5 px-2 py-1.5">
        <div
          className="line-clamp-1 text-[11.5px] text-zinc-200"
          title={asset.source === "generation" ? asset.prompt : asset.name}
        >
          {asset.source === "generation"
            ? asset.prompt || asset.modelLabel || "Generation"
            : asset.name}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-zinc-500">
          {asset.source === "generation" && asset.modelLabel && (
            <span className="truncate">{asset.modelLabel}</span>
          )}
          <span className="ml-auto whitespace-nowrap">
            {formatRelative(asset.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

function CenterLoader() {
  return (
    <div className="flex h-full items-center justify-center text-zinc-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

function EmptyState({
  section,
  hasFilter,
}: {
  section: SectionKind;
  hasFilter: boolean;
}) {
  const msg = hasFilter
    ? "No assets match your filter — try a different type or clear the search."
    : section === "uploads"
      ? "Nothing uploaded here yet — drop a file in any tool's reference slot to populate this list."
      : "No generations yet — run any image, video, or 3D node and it'll show up here.";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-zinc-500">
      <ImageIcon className="h-8 w-8 text-zinc-600" />
      <div className="text-sm">No assets</div>
      <div className="max-w-xs text-xs text-zinc-600">{msg}</div>
    </div>
  );
}

function PlaceholderTab({
  section,
  onGoTo,
}: {
  section: SectionKind;
  onGoTo: () => void;
}) {
  const titles: Record<SectionKind, string> = {
    all: "All assets",
    spaces: "All spaces",
    favorites: "Favorites",
    uploads: "Uploads",
    trash: "Trash",
  };
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-zinc-500">
      <SlidersHorizontal className="h-8 w-8 text-zinc-600" />
      <div className="text-sm font-medium text-zinc-300">{titles[section]}</div>
      <div className="max-w-xs text-xs text-zinc-600">
        Coming soon — this view will let you star and recover assets across
        spaces. For now, head to All assets.
      </div>
      <button
        type="button"
        onClick={onGoTo}
        className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/[0.08]"
      >
        Go to All assets
      </button>
    </div>
  );
}

function sectionTitle(
  section: SectionKind,
  projects: Array<{ id: string; name: string }>,
  activeProject: string | null,
): string {
  if (activeProject) {
    return projects.find((p) => p.id === activeProject)?.name ?? "Project";
  }
  switch (section) {
    case "all":       return "All assets";
    case "spaces":    return "All spaces";
    case "favorites": return "Favorites";
    case "uploads":   return "Uploads";
    case "trash":     return "Trash";
  }
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
