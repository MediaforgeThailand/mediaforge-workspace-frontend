/**
 * All Assets dialog — full-viewport modal for browsing the user's
 * entire asset library across every workspace + canvas.
 *
 * Why it exists: the right-sidebar `WorkspaceAssetPanel` is great
 * for "what did I just generate", but it's a narrow column and shows
 * one asset row at a time. When the user wants to pull a handful of
 * old assets back onto the canvas, scrolling that strip is painful.
 * This dialog gives the same content a full-bleed grid + a
 * selection tray so multi-add becomes a single click.
 *
 * Layout:
 *   left    →  search + filter pills + paginated grid of every asset
 *              the user owns (uploaded / generated / saved elements)
 *   right   →  the cart: thumbnails of currently-selected assets,
 *              a "drop files here" upload tile, and Clear / Add CTAs
 *
 * Interaction model:
 *   - Click a tile        → toggle selection (cart adds/removes)
 *   - Drag a tile         → spawn an AssetNode on the canvas using
 *                           the same `reactflow-asset-reuse` payload
 *                           the right-sidebar already emits, so the
 *                           canvas drop handler doesn't need a new
 *                           branch.
 *   - "Add" button        → spawn AssetNodes for everything in the
 *                           cart at once via `workspace-spawn-assets`
 *                           window event the canvas listens for.
 *   - Click upload tile   → file picker → upload via the existing
 *                           canvas uploadAsset path.
 *   - Drag a file from OS → upload, same path.
 *
 * The canvas owns the spawn + upload logic so we don't duplicate it
 * here; the dialog just emits intent via DOM events.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Search,
  Sparkles,
  Upload,
  Image as ImageIcon,
  Film,
  Music,
  Box,
  Trash2,
  Plus,
  UploadCloud,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

type AssetSource = "generated" | "uploaded" | "element";
type AssetType = "image" | "video" | "audio" | "model3d";

export interface DialogAsset {
  id: string;
  source: AssetSource;
  fieldType: AssetType;
  url: string;
  posterUrl?: string;
  label: string;
  fileName?: string;
  fromNodeId: string;
  fromNodeLabel: string;
  createdAt?: number;
}

/** Same heuristic as the sidebar panel — keeps both surfaces in
 *  sync without a shared helper file (the sidebar has its own
 *  variant, this one is the more permissive version that handles
 *  Tripo3D model_url + plain URLs). */
function genFieldType(
  gen: { type?: string; url?: string; model_url?: string },
): AssetType | null {
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

interface Props {
  open: boolean;
  onClose: () => void;
}

const AllAssetsDialog = ({ open, onClose }: Props) => {
  const allGraphs = useWorkspaceStore((s) => s.graphs);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssetType | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<AssetSource | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draggingExternal, setDraggingExternal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Re-build the asset list when graphs mutate. Same walk as
  // WorkspaceAssetPanel — uploads first, then generations, dedup by
  // URL so the same image dragged across canvases shows once.
  const assets = useMemo<DialogAsset[]>(() => {
    const out: DialogAsset[] = [];
    const seenUrls = new Set<string>();
    for (const canvasId of Object.keys(allGraphs)) {
      const graph = allGraphs[canvasId];
      const graphNodes = graph?.nodes ?? [];
      for (const n of graphNodes) {
        const d = (n.data ?? {}) as Record<string, unknown>;

        // Uploaded — AssetNode.
        if (
          n.type === "assetNode" &&
          typeof d.previewUrl === "string" &&
          typeof d.fieldType === "string"
        ) {
          if (!seenUrls.has(d.previewUrl)) {
            seenUrls.add(d.previewUrl);
            out.push({
              id: `u_${canvasId}_${n.id}`,
              source: "uploaded",
              fieldType: d.fieldType as AssetType,
              url: d.previewUrl,
              posterUrl: typeof d.posterUrl === "string" ? d.posterUrl : undefined,
              label:
                (d.label as string | undefined) ||
                (d.fileName as string | undefined) ||
                "asset",
              fileName: d.fileName as string | undefined,
              fromNodeId: n.id,
              fromNodeLabel:
                (d.label as string | undefined) ||
                (d.fileName as string | undefined) ||
                "asset",
              createdAt:
                typeof d.uploadedAt === "number" ? d.uploadedAt : undefined,
            });
          }
        }

        // Generated outputs.
        const gens = Array.isArray(d.generations)
          ? (d.generations as Array<Record<string, unknown>>)
          : [];
        for (let i = 0; i < gens.length; i++) {
          const g = gens[i] ?? {};
          const ft = genFieldType(g as { type?: string; url?: string; model_url?: string });
          if (!ft) continue;
          const assetUrl =
            ft === "model3d" && typeof g.model_url === "string"
              ? (g.model_url as string)
              : (g.url as string | undefined);
          if (!assetUrl) continue;
          if (seenUrls.has(assetUrl)) continue;
          seenUrls.add(assetUrl);
          const posterUrl =
            ft === "model3d" && typeof g.url === "string" && g.url !== assetUrl
              ? (g.url as string)
              : undefined;
          const labelBase =
            (d.label as string | undefined) ||
            ((d.params as Record<string, unknown> | undefined)
              ?.nodeName as string | undefined) ||
            n.type ||
            "output";
          out.push({
            id: `g_${canvasId}_${n.id}_${(g.id as string) ?? i}`,
            source: "generated",
            fieldType: ft,
            url: assetUrl,
            posterUrl,
            label: labelBase,
            fromNodeId: n.id,
            fromNodeLabel: labelBase,
            createdAt: typeof g.createdAt === "number" ? g.createdAt : undefined,
          });
        }
      }
    }
    out.sort((a, b) => {
      if (a.createdAt && b.createdAt) return b.createdAt - a.createdAt;
      if (a.createdAt) return -1;
      if (b.createdAt) return 1;
      return 0;
    });
    return out;
  }, [allGraphs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (typeFilter !== "all" && a.fieldType !== typeFilter) return false;
      if (sourceFilter !== "all" && a.source !== sourceFilter) return false;
      if (q) {
        const hay = `${a.label} ${a.fileName ?? ""} ${a.fromNodeLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assets, query, typeFilter, sourceFilter]);

  const counts = useMemo(() => {
    const c = { all: assets.length, image: 0, video: 0, audio: 0, model3d: 0 };
    for (const a of assets) c[a.fieldType] += 1;
    return c;
  }, [assets]);

  // Reset selection when the dialog re-opens — opening "All assets"
  // is a fresh shopping trip; carrying a stale cart over from the
  // previous open would confuse users.
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  // Esc to close. Captured so it doesn't leak to React Flow's own
  // Esc bindings underneath.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const selectedAssets = filtered.length
    ? assets.filter((a) => selected.has(a.id))
    : [];

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onAssetDragStart = (e: React.DragEvent, a: DialogAsset) => {
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
    e.dataTransfer.effectAllowed = "move";
    // Close the modal so the canvas underneath becomes the drop
    // target. The drag operation outlives the source element — the
    // browser holds the data on the DataTransfer, not the DOM node
    // — so unmounting now is safe. setTimeout pushes the close past
    // the current event tick; closing synchronously inside
    // onDragStart aborts the drag in some browsers (Chromium sees
    // the source disappear before the OS-level drag handle latches).
    setTimeout(() => onClose(), 0);
  };

  /** Spawn AssetNodes on the canvas for everything in the cart. The
   *  canvas listens for this event and runs its own addAssetNode +
   *  re-parenting logic — keeps the spawn rules in one place. */
  const handleAdd = () => {
    if (selectedAssets.length === 0) return;
    window.dispatchEvent(
      new CustomEvent("workspace-spawn-assets", {
        detail: {
          assets: selectedAssets.map((a) => ({
            fieldType: a.fieldType,
            url: a.url,
            label: a.label,
            fileName: a.fileName,
            posterUrl: a.posterUrl,
          })),
        },
      }),
    );
    onClose();
  };

  const handleUploadFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    window.dispatchEvent(
      new CustomEvent("workspace-upload-files", {
        detail: { files: arr },
      }),
    );
    onClose();
  };

  const onExternalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingExternal(false);
    if (e.dataTransfer.files?.length) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDraggingExternal(true);
        }
      }}
      onDragLeave={() => setDraggingExternal(false)}
      onDrop={onExternalDrop}
    >
      <div
        className={cn(
          "relative flex h-[88vh] w-[min(1280px,94vw)] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl",
          draggingExternal && "ring-2 ring-sky-500/70",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* External-drop hint overlay — only visible while dragging
         *  files from the OS. Sits above everything else. */}
        {draggingExternal && (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-sky-500/10 text-sky-200">
            <div className="flex flex-col items-center gap-2">
              <UploadCloud className="h-12 w-12" />
              <div className="text-sm font-semibold">Drop files to upload</div>
            </div>
          </div>
        )}

        {/* ── Left column: browse ── */}
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
            <Layers className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-100">All assets</h2>
            <span className="font-mono text-[10px] text-zinc-500">
              {filtered.length}/{counts.all}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-56 rounded border border-zinc-800 bg-zinc-900 py-1.5 pl-7 pr-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
                />
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                title="Close (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800 px-4 py-2">
            <SegmentPill
              active={typeFilter === "all"}
              onClick={() => setTypeFilter("all")}
              label="All"
              count={counts.all}
            />
            <SegmentPill
              active={typeFilter === "image"}
              onClick={() => setTypeFilter("image")}
              icon={ImageIcon}
              label="Image"
              count={counts.image}
            />
            <SegmentPill
              active={typeFilter === "video"}
              onClick={() => setTypeFilter("video")}
              icon={Film}
              label="Video"
              count={counts.video}
            />
            <SegmentPill
              active={typeFilter === "audio"}
              onClick={() => setTypeFilter("audio")}
              icon={Music}
              label="Audio"
              count={counts.audio}
            />
            <SegmentPill
              active={typeFilter === "model3d"}
              onClick={() => setTypeFilter("model3d")}
              icon={Box}
              label="3D"
              count={counts.model3d}
            />
            <div className="mx-2 h-4 w-px bg-zinc-800" />
            <SegmentPill
              active={sourceFilter === "all"}
              onClick={() => setSourceFilter("all")}
              label="Any source"
            />
            <SegmentPill
              active={sourceFilter === "generated"}
              onClick={() => setSourceFilter("generated")}
              icon={Sparkles}
              label="Generated"
            />
            <SegmentPill
              active={sourceFilter === "uploaded"}
              onClick={() => setSourceFilter("uploaded")}
              icon={Upload}
              label="Uploaded"
            />
          </div>

          {/* Asset grid */}
          <div className="ws-scroll-hide flex-1 overflow-y-auto p-3">
            {filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs italic text-zinc-500">
                {assets.length === 0
                  ? "No assets yet — upload or generate something to get started."
                  : "No assets match the current filter."}
              </div>
            ) : (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {filtered.map((a) => {
                  const isSelected = selected.has(a.id);
                  const thumbUrl =
                    a.fieldType === "model3d" && a.posterUrl
                      ? a.posterUrl
                      : a.url;
                  return (
                    <li
                      key={a.id}
                      draggable
                      onDragStart={(e) => onAssetDragStart(e, a)}
                      onClick={() => toggleSelect(a.id)}
                      className={cn(
                        "group relative cursor-pointer overflow-hidden rounded-md border transition-colors",
                        isSelected
                          ? "border-sky-500 ring-2 ring-sky-500/50"
                          : "border-zinc-800 hover:border-zinc-600",
                      )}
                      title={`${a.label} · ${a.fieldType} · ${a.source}`}
                    >
                      <div className="relative aspect-square overflow-hidden bg-zinc-900">
                        {a.fieldType === "image" || a.fieldType === "model3d" ? (
                          <img
                            src={thumbUrl}
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
                            onMouseEnter={(e) =>
                              (e.target as HTMLVideoElement)
                                .play()
                                .catch(() => {})
                            }
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

                        {/* Type chip — bottom-right */}
                        <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1 py-px font-mono text-[8px] uppercase text-zinc-300">
                          {a.fieldType === "model3d" ? "3D" : a.fieldType}
                        </span>

                        {/* Source chip — bottom-left */}
                        <span
                          className={cn(
                            "absolute bottom-1 left-1 rounded px-1 py-px text-[8px] font-mono uppercase tracking-wide",
                            a.source === "generated"
                              ? "bg-violet-900/80 text-violet-200"
                              : a.source === "element"
                                ? "bg-pink-900/80 text-pink-200"
                                : "bg-blue-900/80 text-blue-200",
                          )}
                        >
                          {a.source === "generated"
                            ? "GEN"
                            : a.source === "element"
                              ? "EL"
                              : "UP"}
                        </span>

                        {/* Selected checkmark */}
                        {isSelected && (
                          <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[11px] font-bold text-white shadow">
                            ✓
                          </div>
                        )}
                      </div>
                      <div className="px-1.5 py-1">
                        <div className="truncate text-[10px] font-medium text-zinc-200">
                          {a.label}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-zinc-800 px-4 py-2 text-[11px] leading-snug text-zinc-500">
            Click to select · Drag onto canvas · Drop files here to upload
          </div>
        </div>

        {/* ── Right column: cart ── */}
        <div className="flex w-[320px] flex-col border-l border-zinc-800 bg-zinc-925">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <span className="text-xs font-semibold text-zinc-200">Selected</span>
            <span className="font-mono text-[11px] text-zinc-400">
              {selectedAssets.length}/{assets.length}
            </span>
          </div>

          <div className="ws-scroll-hide flex-1 overflow-y-auto p-3">
            <ul className="grid grid-cols-2 gap-2">
              {selectedAssets.map((a) => {
                const thumbUrl =
                  a.fieldType === "model3d" && a.posterUrl ? a.posterUrl : a.url;
                return (
                  <li
                    key={a.id}
                    draggable
                    onDragStart={(e) => onAssetDragStart(e, a)}
                    className="group relative aspect-square cursor-grab overflow-hidden rounded-md border border-zinc-800 bg-zinc-900"
                  >
                    {a.fieldType === "image" || a.fieldType === "model3d" ? (
                      <img
                        src={thumbUrl}
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
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-amber-950/30">
                        <Music className="h-6 w-6 text-amber-400" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(a.id);
                      }}
                      className="absolute right-1 top-1 rounded bg-black/70 p-0.5 text-zinc-300 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                      title="Remove from selection"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                );
              })}

              {/* Upload tile — opens the OS file picker. Always sits
               *  at the end of the list so multi-uploaders can grab
               *  it without scrolling. */}
              <li>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-zinc-700 bg-zinc-900 text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300"
                  title="Upload from your computer"
                >
                  <UploadCloud className="h-6 w-6" />
                  <span className="text-[9px] font-mono uppercase tracking-wide">
                    Upload
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,audio/*,.glb,.gltf,.usdz,.obj,.fbx"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      handleUploadFiles(e.target.files);
                    }
                    e.target.value = "";
                  }}
                />
              </li>
            </ul>

            {selectedAssets.length === 0 && (
              <div className="mt-6 px-2 text-center text-[11px] italic text-zinc-600">
                Click any asset on the left to add it here.
              </div>
            )}
          </div>

          {/* CTA bar */}
          <div className="flex items-center gap-2 border-t border-zinc-800 px-3 py-3">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={selectedAssets.length === 0}
              className="flex items-center gap-1.5 rounded border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={selectedAssets.length === 0}
              className="flex flex-1 items-center justify-center gap-1.5 rounded bg-sky-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Add {selectedAssets.length > 0 ? `(${selectedAssets.length})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/* ── small atoms ─────────────────────────────────────── */

const SegmentPill = ({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition-colors",
      active
        ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
        : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
    )}
  >
    {Icon && <Icon className="h-3 w-3" />}
    <span>{label}</span>
    {typeof count === "number" && (
      <span
        className={cn(
          "font-mono text-[9px] tabular-nums",
          active ? "text-sky-300/70" : "text-zinc-500",
        )}
      >
        {count}
      </span>
    )}
  </button>
);

export default AllAssetsDialog;
