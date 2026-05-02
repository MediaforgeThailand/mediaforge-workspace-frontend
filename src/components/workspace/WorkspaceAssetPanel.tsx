/**
 * Workspace Asset Panel — right sidebar.
 *
 * Inventories every asset across EVERY tab/canvas the user owns:
 *   - Uploaded files (AssetNode → previewUrl + fieldType)
 *   - Generated outputs (any tool node → data.generations[].url)
 *   - Saved Elements (brand_elements table — user-scoped via RLS)
 *
 * Cross-tab rule: assets from a canvas you've never opened in this
 * session DO surface here, because every canvas's nodes live in the
 * persisted Zustand store under `graphs[canvasId]`. The walk is
 * O(canvases × nodes) which stays trivial for the project sizes
 * we're aiming at; bump to a per-user `assets` table later if
 * needed.
 *
 * Filter axes are independent multi-select pills (Figma feel):
 *   - Source: Generated / Uploaded / Elements   (any subset)
 *   - Type:   Image / Video / Audio             (any subset)
 *
 * No "All" pill — empty selection on an axis means "no filter on
 * this axis". Click a pill to add it; click again to clear.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Image as ImageIcon,
  Film,
  Music,
  Box,
  Sparkles,
  Upload,
  Layers,
  Users,
  Trash2,
  Maximize2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useFreshSignedUrl } from "./useFreshSignedUrl";

type AssetSource = "generated" | "uploaded" | "element";
type AssetType = "image" | "video" | "audio" | "model3d";

interface PanelAsset {
  /** Stable across re-renders so React keys behave. */
  id: string;
  source: "generated" | "uploaded" | "element";
  fieldType: AssetType;
  url: string;
  label: string;
  fileName?: string;
  fromNodeId: string;
  fromNodeLabel: string;
  createdAt?: number;
  /** Saved element row id (only set for source="element"). */
  brandElementId?: string;
  referenceImages?: string[];
  frontalImageUrl?: string;
  /** Static thumbnail to show while a 3D model loads (or as a
   *  permanent fallback if the GLB fetch is blocked / fails).
   *  For Tripo3D generations this is the `rendered_image` PNG. */
  posterUrl?: string;
}

interface BrandElementRow {
  id: string;
  element_name: string;
  description: string | null;
  thumbnail_url: string | null;
  reference_images: unknown;
  frontal_image_url: string | null;
  created_at: string;
}

/** Heuristic: figure out an asset's media type from a generation entry.
 *  3D meshes are detected via the dedicated `model_url` field (set by
 *  the Tripo3D run path) — falls back to extension sniffing for both
 *  meshes and the regular media types. */
function genFieldType(
  gen: { type?: string; url?: string; model_url?: string },
): AssetType | null {
  // Prefer the mesh URL if present — Tripo3D returns a rendered_image
  // alongside the GLB; we want the GLB to drive the asset row, not
  // the still preview.
  if (gen.model_url) return "model3d";
  const t = (gen.type ?? "").toLowerCase();
  if (t === "image" || t === "video" || t === "audio") return t;
  if (t === "model3d" || t === "model_3d") return "model3d";
  const url = gen.url ?? "";
  if (/\.(glb|gltf|usdz|obj|fbx)(\?|#|$)/i.test(url)) return "model3d";
  if (/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url)) return "image";
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(url)) return "audio";
  return null;
}

const onAssetDragStart = (e: React.DragEvent, a: PanelAsset) => {
  // Two payload shapes — one for media re-use (spawns AssetNode), one
  // for saved Elements (spawns ElementNode in saved mode). The canvas
  // onDrop reads whichever it finds first.
  if (a.source === "element") {
    e.dataTransfer.setData(
      "application/reactflow-element-reuse",
      JSON.stringify({
        brand_element_id: a.brandElementId,
        name: a.label,
        thumbnail_url: a.url,
        reference_images: a.referenceImages ?? [],
        frontal_image_url: a.frontalImageUrl,
      }),
    );
  } else {
    e.dataTransfer.setData(
      "application/reactflow-asset-reuse",
      JSON.stringify({
        fieldType: a.fieldType,
        url: a.url,
        label: a.label,
        fileName: a.fileName,
        posterUrl: a.posterUrl,
      }),
    );
  }
  e.dataTransfer.effectAllowed = "move";
};

// Module-level stable references so the Zustand selector can return
// the same array identity across renders when the underlying state
// is unset. Without this React's `useSyncExternalStore` warns about
// "getSnapshot should be cached" — every `?? []` allocates a new
// array and triggers an infinite re-render loop.
const EMPTY_NODES: ReadonlyArray<{ id: string; data: unknown; type?: string }> = [];

const WorkspaceAssetPanel = () => {
  // Walk EVERY canvas's graph — assets from other tabs surface here
  // automatically, without the user having to re-open them.
  const allGraphs = useWorkspaceStore((s) => s.graphs);
  const currentNodes = useWorkspaceStore(
    (s) => s.current?.nodes ?? (EMPTY_NODES as typeof s.current.nodes),
  );
  const { user } = useAuth();
  const [sourceFilters, setSourceFilters] = useState<Set<AssetSource>>(
    () => new Set(),
  );
  const [typeFilters, setTypeFilters] = useState<Set<AssetType>>(
    () => new Set(),
  );
  const [brandElements, setBrandElements] = useState<BrandElementRow[]>([]);
  // The "Browse all assets" Maximize2 button dispatches the
  // `workspace-open-all-assets` event; the dialog itself, plus the
  // right-click Upload bridge, are mounted by `WorkspaceRightSidebar`
  // so they survive when the sidebar is collapsed (this panel
  // unmounts in that state).

  // Refetch trigger for brand_elements — fires when the *current*
  // canvas creates a new element (which is the only way new elements
  // get into the DB from this UI). Cross-canvas elements show up via
  // the initial fetch on mount.
  const elementIdSig = useMemo(
    () =>
      currentNodes.map((n) => ((n.data as any)?.brand_element_id ?? "")).join("|"),
    [currentNodes],
  );

  const toggleSource = (s: AssetSource) => {
    setSourceFilters((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleType = (t: AssetType) => {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  // Load every saved element this user owns. RLS scopes the SELECT
  // to auth.uid(); the panel re-fetches whenever the user changes
  // or any node's brand_element_id changes.
  useEffect(() => {
    if (!user) {
      setBrandElements([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("brand_elements")
        .select("id, element_name, description, thumbnail_url, reference_images, frontal_image_url, created_at")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.warn("[asset-panel] brand_elements query failed:", error);
        setBrandElements([]);
        return;
      }
      setBrandElements((data ?? []) as BrandElementRow[]);
    })();
    return () => {
      cancelled = true;
    };
    // The signature changes when any node grows a `brand_element_id`
    // (i.e. a Create just resolved) so the panel refetches. We can't
    // depend on `nodes.length` alone — Create flips `data` in place
    // without adding a node.
  }, [user, elementIdSig]);

  // Build the inventory by walking every canvas the user owns. Assets
  // are deduped by URL so re-using an asset across tabs doesn't create
  // duplicate tiles.
  const assets = useMemo<PanelAsset[]>(() => {
    const out: PanelAsset[] = [];
    const seenUrls = new Set<string>();

    for (const canvasId of Object.keys(allGraphs)) {
      const graph = allGraphs[canvasId];
      const graphNodes = graph?.nodes ?? [];
      for (const n of graphNodes) {
        const d = (n.data ?? {}) as any;

        // Uploaded — AssetNode itself.
        if (n.type === "assetNode" && d.previewUrl && d.fieldType) {
          if (!seenUrls.has(d.previewUrl)) {
            seenUrls.add(d.previewUrl);
            out.push({
              id: `u_${canvasId}_${n.id}`,
              source: "uploaded",
              fieldType: d.fieldType,
              url: d.previewUrl,
              label: d.label || d.fileName || "asset",
              fileName: d.fileName,
              fromNodeId: n.id,
              fromNodeLabel: d.label || d.fileName || "asset",
              createdAt:
                typeof d.uploadedAt === "number" ? d.uploadedAt : undefined,
            });
          }
        }

        // Generated — every tool-node generation entry.
        const gens = Array.isArray(d.generations) ? d.generations : [];
        for (let i = 0; i < gens.length; i++) {
          const g = gens[i] ?? {};
          const ft = genFieldType(g);
          if (!ft) continue;
          // For 3D generations the meaningful URL is `model_url`
          // (the GLB), NOT `url` (which is the still preview thumb).
          // The asset library should reuse the GLB so dragging it
          // back onto canvas spawns a 3D AssetNode.
          const assetUrl =
            ft === "model3d" && typeof g.model_url === "string"
              ? (g.model_url as string)
              : (g.url as string | undefined);
          if (!assetUrl) continue;
          if (seenUrls.has(assetUrl)) continue;
          seenUrls.add(assetUrl);
          // For 3D rows, keep the rendered_image as a separate poster
          // so the tile + lightbox can show *something* even if the
          // GLB fetch is blocked (CORS, expired token, network blip).
          // Without this, model-viewer renders an empty rectangle and
          // the tile looks broken.
          const posterUrl =
            ft === "model3d" && typeof g.url === "string" && g.url !== assetUrl
              ? (g.url as string)
              : undefined;
          out.push({
            id: `g_${canvasId}_${n.id}_${g.id ?? i}`,
            source: "generated",
            fieldType: ft,
            url: assetUrl,
            posterUrl,
            label: d.label || d.params?.nodeName || n.type || "output",
            fromNodeId: n.id,
            fromNodeLabel: d.label || d.params?.nodeName || n.type || "node",
            createdAt: typeof g.createdAt === "number" ? g.createdAt : undefined,
          });
        }
      }
    }

    // Saved Elements (cross-canvas — pulled from the brand_elements table).
    for (const r of brandElements) {
      const refs = Array.isArray(r.reference_images)
        ? (r.reference_images as unknown[]).filter((u): u is string => typeof u === "string")
        : [];
      const thumb = r.thumbnail_url ?? refs[0] ?? r.frontal_image_url ?? "";
      if (!thumb) continue;
      out.push({
        id: `e_${r.id}`,
        source: "element",
        fieldType: "image",
        url: thumb,
        label: r.element_name,
        fromNodeId: r.id,
        fromNodeLabel: r.element_name,
        createdAt: new Date(r.created_at).getTime(),
        brandElementId: r.id,
        referenceImages: refs,
        frontalImageUrl: r.frontal_image_url ?? undefined,
      });
    }
    // Newest first — generated items have createdAt; uploads sort last
    // by their node order (stable).
    out.sort((a, b) => {
      if (a.createdAt && b.createdAt) return b.createdAt - a.createdAt;
      if (a.createdAt) return -1;
      if (b.createdAt) return 1;
      return 0;
    });
    return out;
  }, [allGraphs, brandElements]);

  const filtered = useMemo(() => {
    // Empty filter set = "no constraint on this axis" = show everything.
    return assets.filter((a) => {
      if (sourceFilters.size > 0 && !sourceFilters.has(a.source)) return false;
      if (typeFilters.size > 0 && !typeFilters.has(a.fieldType)) return false;
      return true;
    });
  }, [assets, sourceFilters, typeFilters]);

  const counts = useMemo(() => {
    const c = {
      all: assets.length,
      generated: 0, uploaded: 0, element: 0,
      image: 0, video: 0, audio: 0, model3d: 0,
    };
    for (const a of assets) {
      c[a.source] += 1;
      c[a.fieldType] += 1;
    }
    return c;
  }, [assets]);

  return (
    // Outer wrapper (width / border / glass bg) is provided by the
    // parent WorkspaceRightSidebar — this panel just supplies the
    // inner column. Visual language matches CanvasContextMenu so the
    // canvas reads as one cohesive product (rounded-xl tiles, white-
    // alpha surfaces, no chrome borders).
    <div
      className="flex h-full flex-col text-zinc-200"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* Header — soft title strip with the live count + a maximise
       *  shortcut to the All-Assets dialog. No uppercase / mono
       *  styling here; that's the old "API console" vibe we're
       *  moving away from. */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <Layers className="h-4 w-4 text-zinc-400" />
        <span className="text-[13px] font-semibold tracking-tight text-zinc-100">
          Assets
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-zinc-500">
          {filtered.length}/{counts.all}
        </span>
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("workspace-open-all-assets"))
          }
          className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
          title="Browse all assets"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Source filters — three pill row, multi-select. Active state
       *  is a soft white-alpha fill (matches the menu's segment style
       *  rather than the old saturated sky-blue). */}
      <div className="flex flex-wrap gap-1.5 px-3 pb-1.5">
        <FilterPill
          active={sourceFilters.has("generated")}
          onClick={() => toggleSource("generated")}
          icon={Sparkles}
          label="Generated"
          count={counts.generated}
        />
        <FilterPill
          active={sourceFilters.has("uploaded")}
          onClick={() => toggleSource("uploaded")}
          icon={Upload}
          label="Uploaded"
          count={counts.uploaded}
        />
        <FilterPill
          active={sourceFilters.has("element")}
          onClick={() => toggleSource("element")}
          icon={Users}
          label="Elements"
          count={counts.element}
        />
      </div>

      {/* Type filters */}
      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
        <FilterPill
          active={typeFilters.has("image")}
          onClick={() => toggleType("image")}
          icon={ImageIcon}
          label="Image"
          count={counts.image}
        />
        <FilterPill
          active={typeFilters.has("video")}
          onClick={() => toggleType("video")}
          icon={Film}
          label="Video"
          count={counts.video}
        />
        <FilterPill
          active={typeFilters.has("audio")}
          onClick={() => toggleType("audio")}
          icon={Music}
          label="Audio"
          count={counts.audio}
        />
        <FilterPill
          active={typeFilters.has("model3d")}
          onClick={() => toggleType("model3d")}
          icon={Box}
          label="3D"
          count={counts.model3d}
        />
      </div>

      {/* Hairline above the grid — gives the filter rail a "lid"
       *  without the heavy border-b style. */}
      <div className="mx-3 h-px shrink-0 bg-white/5" />

      {/* Grid */}
      <div className="ws-scroll-hide flex-1 overflow-y-auto px-3 py-3">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[12px] italic text-zinc-500">
            {assets.length === 0
              ? "No assets yet — drop a file or run a tool."
              : "Nothing matches the current filter."}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5">
            {filtered.map((a) => (
              <AssetTile
                key={a.id}
                asset={a}
                onDeleteElement={
                  a.source === "element" && a.brandElementId
                    ? async () => {
                        if (!confirm(`Delete element "${a.label}"?`)) return;
                        const { error } = await supabase
                          .from("brand_elements")
                          .delete()
                          .eq("id", a.brandElementId!);
                        if (error) {
                          toast.error(error.message);
                          return;
                        }
                        setBrandElements((rows) =>
                          rows.filter((r) => r.id !== a.brandElementId),
                        );
                        toast.success(`Deleted "${a.label}"`);
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </div>

      {/* Footer hint — dim, mono. Same styling as the context menu's
       *  footer row so users feel they're in a consistent system. */}
      <div className="border-t border-white/5 px-4 py-2.5 text-[11px] text-zinc-500">
        Drag a tile to the canvas to re-use it.
      </div>

      {/* AllAssetsDialog and the hidden upload-trigger input are mounted
       *  by `WorkspaceRightSidebar` so they remain available when this
       *  panel is unmounted (sidebar collapsed). */}
    </div>
  );
};

/* ─── small atoms ─────────────────────────────────────── */

/**
 * Multi-select filter pill — chip-shaped, highlights when active,
 * click-toggles. Used for both the Source and Type filter rows.
 *
 * "Active" colour cue is intentionally bold (sky-tint background +
 * ring) so users can scan the row at a glance and see which filters
 * are biting; clicking the same pill turns it off.
 */
const FilterPill = ({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors ring-1 ring-inset",
      active
        ? "bg-white/[0.10] text-zinc-50 ring-white/15"
        : "bg-white/[0.02] text-zinc-400 ring-white/5 hover:bg-white/[0.06] hover:text-zinc-200",
    )}
    title={
      active
        ? `Click to remove "${label}" filter`
        : `Click to filter by ${label}`
    }
  >
    <Icon className="h-3 w-3" />
    <span>{label}</span>
    <span
      className={cn(
        "font-mono text-[9px] tabular-nums",
        active ? "text-zinc-300" : "text-zinc-500",
      )}
    >
      {count}
    </span>
  </button>
);

const AssetTile = ({
  asset,
  onDeleteElement,
}: {
  asset: PanelAsset;
  onDeleteElement?: () => void;
}) => {
  // The URL we store in node.data was signed with whatever TTL was
  // active at upload time. If it's expired, the hook re-signs in
  // the background and swaps in the fresh URL.
  const liveUrl = useFreshSignedUrl(asset.url);
  const displayUrl = liveUrl ?? asset.url;
  // Click anywhere on the tile (except the delete X) to pop the
  // fullscreen lightbox preview. The canvas owns the lightbox state;
  // we hand over the asset's URL via a window event so this panel
  // doesn't need cross-tree access.
  const openPreview = () => {
    window.dispatchEvent(
      new CustomEvent("workspace-open-asset-preview", {
        detail: {
          url: displayUrl,
          fieldType: asset.fieldType,
          label: asset.label,
          fileName: asset.fileName,
        },
      }),
    );
  };

  return (
    <li
      draggable
      onDragStart={(e) => onAssetDragStart(e, asset)}
      onClick={openPreview}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-xl bg-white/[0.02]",
        "transition-all hover:bg-white/[0.05] hover:ring-white/[0.12] hover:shadow-[0_6px_18px_-8px_hsl(0_0%_0%/0.6)]",
        "active:cursor-grabbing",
      )}
      title={`${asset.label} (${asset.fieldType}, ${asset.source}) — click to preview, drag onto canvas to reuse`}
    >
      {/* Preview */}
      <div className="relative aspect-square overflow-hidden bg-black/60">
        {asset.fieldType === "image" ? (
          <img
            src={displayUrl}
            alt={asset.label}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : asset.fieldType === "video" ? (
          <video
            src={displayUrl}
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
        ) : asset.fieldType === "model3d" ? (
          // Static thumbnail. Spinning up `<model-viewer>` in every
          // tile would mount 5–20 WebGL canvases at once and grind
          // the page to ~5fps. The poster (rendered_image PNG) is
          // cheap to render and instantly visible. The interactive
          // 3D viewer fires up ONLY when the user clicks the tile
          // (one lightbox = one WebGL context). The amber "3D"
          // chip tells the user there's a real model behind it.
          <>
            {asset.posterUrl ? (
              <img
                src={asset.posterUrl}
                alt={asset.label}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-zinc-600">
                <Box className="h-8 w-8" />
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-amber-950/30">
            <Music className="h-7 w-7 text-amber-400" />
          </div>
        )}
        {/* Source badge — small dot+label pill, frosted background.
         *  Less shouty than the saturated old colour blocks. */}
        <span
          className={cn(
            "absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[8.5px] font-medium uppercase tracking-wider backdrop-blur",
            asset.source === "generated"
              ? "text-violet-200"
              : asset.source === "element"
                ? "text-pink-200"
                : "text-sky-200",
          )}
        >
          <span
            className={cn(
              "h-1 w-1 rounded-full",
              asset.source === "generated"
                ? "bg-violet-300"
                : asset.source === "element"
                  ? "bg-pink-300"
                  : "bg-sky-300",
            )}
          />
          {asset.source === "generated" ? "GEN" : asset.source === "element" ? "EL" : "UP"}
        </span>
        {/* Delete X — only on saved elements (DB row), shown on hover. */}
        {onDeleteElement && (
          <button
            type="button"
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              void onDeleteElement();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 text-zinc-300 opacity-0 backdrop-blur transition-opacity hover:text-red-400 group-hover:opacity-100"
            title="Delete this saved element"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Footer — name + sub. Two-tone hierarchy keeps the tile from
       *  feeling like a single block of text. */}
      <div className="px-2.5 pb-2 pt-1.5">
        <div className="truncate text-[11px] font-medium leading-tight text-zinc-100">
          {asset.label}
        </div>
        <div className="mt-0.5 truncate text-[9.5px] leading-tight text-zinc-500">
          {asset.fromNodeLabel}
        </div>
      </div>
    </li>
  );
};

export default WorkspaceAssetPanel;
