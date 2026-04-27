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
  Sparkles,
  Upload,
  Layers,
  Users,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useFreshSignedUrl } from "./useFreshSignedUrl";

type AssetSource = "generated" | "uploaded" | "element";
type AssetType = "image" | "video" | "audio";

interface PanelAsset {
  /** Stable across re-renders so React keys behave. */
  id: string;
  source: "generated" | "uploaded" | "element";
  fieldType: "image" | "video" | "audio";
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

/** Heuristic: figure out an asset's media type from a generation entry. */
function genFieldType(gen: { type?: string; url?: string }): "image" | "video" | "audio" | null {
  const t = (gen.type ?? "").toLowerCase();
  if (t === "image" || t === "video" || t === "audio") return t;
  // Sniff from URL extension as a fallback.
  const url = gen.url ?? "";
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
      }),
    );
  }
  e.dataTransfer.effectAllowed = "move";
};

const WorkspaceAssetPanel = () => {
  // Walk EVERY canvas's graph — assets from other tabs surface here
  // automatically, without the user having to re-open them.
  const allGraphs = useWorkspaceStore((s) => s.graphs);
  const currentNodes = useWorkspaceStore((s) => s.current?.nodes ?? []);
  const { user } = useAuth();
  const [sourceFilters, setSourceFilters] = useState<Set<AssetSource>>(
    () => new Set(),
  );
  const [typeFilters, setTypeFilters] = useState<Set<AssetType>>(
    () => new Set(),
  );
  const [brandElements, setBrandElements] = useState<BrandElementRow[]>([]);

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
          if (!ft || !g.url) continue;
          if (seenUrls.has(g.url)) continue;
          seenUrls.add(g.url);
          out.push({
            id: `g_${canvasId}_${n.id}_${g.id ?? i}`,
            source: "generated",
            fieldType: ft,
            url: g.url as string,
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
      image: 0, video: 0, audio: 0,
    };
    for (const a of assets) {
      c[a.source] += 1;
      c[a.fieldType] += 1;
    }
    return c;
  }, [assets]);

  return (
    // Outer wrapper (width / border-l / bg) is provided by the parent
    // WorkspaceRightSidebar tab shell — this panel just supplies the
    // inner column and keeps its own header showing the live count.
    <div className="flex h-full flex-col text-zinc-200">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        <Layers className="h-3.5 w-3.5" />
        Assets
        <span className="ml-auto font-mono text-[10px] text-zinc-500">
          {filtered.length}/{counts.all}
        </span>
      </div>

      {/* Source filter pills — multi-select toggle. Empty = no filter. */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-800 px-2 py-1.5">
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

      {/* Type filter pills — multi-select toggle. Empty = no filter. */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-800 px-2 py-1.5">
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
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs italic text-zinc-500">
            {assets.length === 0
              ? "No assets yet — drop a file or run a tool."
              : "No assets match the current filter."}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
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

      <div className="border-t border-zinc-800 px-3 py-2 text-[11px] leading-snug text-zinc-500">
        Drag a tile onto the canvas to re-use it as an Asset node.
      </div>
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
      "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition-colors",
      active
        ? "border-sky-500/60 bg-sky-500/15 text-sky-200 shadow-[inset_0_0_0_1px_hsl(199_89%_60%/0.25)]"
        : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200",
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
        active ? "text-sky-300/70" : "text-zinc-500",
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
  // active at upload time. If it's expired, the hook re-signs in the
  // background and swaps in the fresh URL. Drag-payload still uses
  // the original `asset.url` (which the receiver can also re-sign).
  const liveUrl = useFreshSignedUrl(asset.url);
  const displayUrl = liveUrl ?? asset.url;
  return (
    <li
      draggable
      onDragStart={(e) => onAssetDragStart(e, asset)}
      className="group cursor-grab overflow-hidden rounded border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600 active:cursor-grabbing"
      title={`${asset.label} (${asset.fieldType}, ${asset.source}) — drag onto canvas to reuse`}
    >
      {/* Preview */}
      <div className="relative aspect-square overflow-hidden bg-black">
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
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-amber-950/30">
            <Music className="h-7 w-7 text-amber-400" />
          </div>
        )}
        {/* Source badge */}
        <span
          className={cn(
            "absolute left-1 top-1 rounded px-1 py-px text-[8px] font-mono uppercase tracking-wide",
            asset.source === "generated"
              ? "bg-violet-900/80 text-violet-200"
              : asset.source === "element"
                ? "bg-pink-900/80 text-pink-200"
                : "bg-blue-900/80 text-blue-200",
          )}
        >
          {asset.source === "generated" ? "gen" : asset.source === "element" ? "el" : "up"}
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
            className="absolute right-1 top-1 rounded bg-black/65 p-1 text-zinc-300 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
            title="Delete this saved element"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-1.5 py-1">
        <div className="truncate text-[10px] font-medium text-zinc-200">
          {asset.label}
        </div>
        <div className="truncate text-[9px] text-zinc-500">
          {asset.fromNodeLabel}
        </div>
      </div>
    </li>
  );
};

export default WorkspaceAssetPanel;
