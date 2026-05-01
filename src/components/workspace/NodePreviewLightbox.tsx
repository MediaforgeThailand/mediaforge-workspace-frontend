/**
 * Full-viewport lightbox that pops up when the user double-clicks a
 * node (or hits the `A` shortcut while a node is selected).
 *
 * Picks the right kind of media to show based on the node type and
 * its data — works uniformly for any node so the user has one
 * "go-large" gesture to inspect output:
 *
 *   - assetNode              → previewUrl   (image / video / audio)
 *   - elementNode (saved)    → reference_images[0] / thumbnail_url
 *   - elementNode (creator)  → walks own input edges for refs
 *   - any tool node          → currently-selected generation's URL
 *   - textNode               → big text pane
 *   - groupNode              → contact sheet of every child
 *
 * Closing: click backdrop, hit Esc, or press `A` again.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ImageOff, Download, Crop as CropIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Node } from "@xyflow/react";
import { useMirroredTripoUrl } from "./useMirroredTripoUrl";
import { downloadFromUrl } from "./downloadAsset";
import { loadModelViewer } from "@/lib/loadModelViewer";
import { ImageCropTool } from "./ImageCropTool";
import { useLanguage } from "@/contexts/LanguageContext";

export interface PreviewPayload {
  type: "image" | "video" | "audio" | "text" | "grid" | "model3d";
  /** image / video / audio source URL */
  url?: string;
  /** plain-text payload (textNode, chat output, video-to-prompt) */
  text?: string;
  /** Multi-image preview (group node = contact sheet). */
  urls?: string[];
  /** GLB / GLTF URL — drives the fullscreen 3D viewer (Tripo3D
   *  outputs). When set, the lightbox renders a `<model-viewer>`
   *  with full orbit controls. */
  model_url?: string;
  /** Optional poster (rendered_image) shown while the GLB loads. */
  poster?: string;
  label?: string;
  caption?: string;
}

interface Props {
  preview: PreviewPayload;
  onClose: () => void;
  /** Optional — when provided, an "Crop" button appears for image
   *  previews. The callback fires with the cropped Blob + a
   *  suggested filename; caller is responsible for uploading the
   *  blob and producing a new asset (e.g. WorkspaceCanvas spawns a
   *  new AssetNode, AssetsView refreshes the library list). */
  onCropConfirmed?: (blob: Blob, filename: string) => Promise<void> | void;
}

const NodePreviewLightbox = ({ preview, onClose, onCropConfirmed }: Props) => {
  const { t } = useLanguage();
  // Crop-tool toggle. When true the lightbox renders the
  // ImageCropTool overlay on top of the preview. Esc / Cancel
  // bubbles back here to close the tool without closing the
  // lightbox.
  const [cropOpen, setCropOpen] = useState(false);
  // For 3D previews coming from Tripo3D generations, the model_url
  // is a CORS-blocked Tripo CDN URL — pipe through the mirror hook
  // so model-viewer can actually fetch the GLB. For non-Tripo URLs
  // the hook returns the input unchanged (synchronously).
  const mirroredModelUrl = useMirroredTripoUrl(preview.model_url);

  // Loading-screen state for the 3D viewer.
  //
  // The flow:
  //   1. Open lightbox → model-viewer src = Tripo URL → loader shows
  //   2. Tripo CDN CORS-rejects the fetch → model-viewer fires `error`
  //   3. mirror-on-demand finishes → mirroredModelUrl swaps to a
  //      Supabase signed URL → model-viewer src updates → fires `load`
  //   4. We dismiss the loader.
  //
  // We INTENTIONALLY ignore the `error` event in step 2: the first
  // load attempt is GUARANTEED to fail (that's why we mirror). If we
  // dismissed the loader on `error`, the user would see the loader
  // disappear for ~1s, then come back the moment the mirror lands
  // and the second URL starts loading — a confusing flicker the user
  // reported. The 15s safety timeout below still rescues us if the
  // mirrored URL also fails to load (corrupt GLB, network blip, etc.).
  const modelViewerRef = useRef<HTMLElement | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  useEffect(() => {
    // Reset on every new preview payload — if the user closes one
    // 3D and opens another, the loader has to come back.
    setModelLoaded(false);
    if (preview.type !== "model3d") return;
    // Kick off the lazy-load of the <model-viewer> custom element.
    // Idempotent — the loader caches its promise, so opening multiple
    // 3D previews issues at most one network request per session.
    // We don't await here because the <model-viewer> element below is
    // already mounted; once the script registers the custom element
    // tag definition, the existing tags upgrade in-place.
    void loadModelViewer().catch((err) => {
      console.warn("[NodePreviewLightbox] failed to load model-viewer:", err);
    });
    const el = modelViewerRef.current;
    if (!el) return;
    const onLoad = () => setModelLoaded(true);
    el.addEventListener("load", onLoad);
    // Safety net — never trap the user behind the loader if the
    // load event somehow doesn't fire (cached model, browser quirks,
    // mirror endpoint returning a corrupt GLB, etc.).
    const fallback = window.setTimeout(() => setModelLoaded(true), 15_000);
    return () => {
      el.removeEventListener("load", onLoad);
      window.clearTimeout(fallback);
    };
  }, [preview.type, preview.model_url, mirroredModelUrl]);

  // While the lightbox is mounted, tag <body> with a class so global
  // workspace CSS can suppress every floating node overlay (quick
  // toolbar, compact run anchor, settings cog, node titles, etc.).
  // Those floats live inside the React Flow node tree (or are portal'd
  // to body and positioned over a node's screen coords) and were
  // bleeding into the lightbox view because the canvas behind the
  // backdrop is still painted. Hiding them via body class is cheap,
  // immediately effective, and doesn't require threading a context
  // through every node component.
  //
  // Defensive cleanup: the class MUST be removed on unmount even if
  // the lightbox is unmounted directly (parent flips its `preview`
  // state) — otherwise floats stay hidden after close.
  useEffect(() => {
    document.body.classList.add("ws-lightbox-open");
    return () => {
      document.body.classList.remove("ws-lightbox-open");
    };
  }, []);

  // Close on Esc OR `A` (toggle — same key opens/closes via the global
  // `A` shortcut). The `A` branch DOES NOT fire while the user is
  // typing into a text input/contenteditable somewhere on the page —
  // otherwise typing the letter "a" anywhere would slam the lightbox
  // shut. Esc still works regardless because Esc is universally a
  // "cancel" key with no typing-related side effects.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key.toLowerCase() === "a") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName ?? "";
        const isTyping =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          target?.isContentEditable === true;
        // Modifier keys mean the user is doing Ctrl+A / Cmd+A etc. —
        // never our toggle. Skip.
        if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return;
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Top bar — label + download + close.
       *
       * Download button shows for any preview type that has a single
       * downloadable URL (image / video / audio). For 3D models the
       * inline "Download .glb" pill on the viewer itself is preserved
       * (it's positioned over the model and matches the pattern from
       * Tripo's docs). For text + grid we don't surface a download
       * since there's no obvious single file. */}
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 border-b border-white/5 bg-zinc-950/70 px-4 py-2.5 text-sm text-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1 truncate">
          <span className="font-medium">{preview.label ?? t("workspace.lightbox.preview_fallback")}</span>
          {preview.caption && (
            <span className="ml-2 text-[11px] text-zinc-500">
              {preview.caption}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Crop tool — only for images, only when caller provided
           *  an onCropConfirmed handler (canvas + asset library both
           *  do; standalone gen result strip doesn't yet). */}
          {preview.type === "image" && preview.url && onCropConfirmed && (
            <button
              type="button"
              onClick={() => setCropOpen(true)}
              title={t("workspace.lightbox.crop_image")}
              aria-label={t("workspace.lightbox.crop_image")}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-[11.5px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <CropIcon className="h-3.5 w-3.5" />
              {t("workspace.lightbox.crop")}
            </button>
          )}
          {(preview.type === "image" ||
            preview.type === "video" ||
            preview.type === "audio") &&
            preview.url && (
              <button
                type="button"
                onClick={() =>
                  void downloadFromUrl(preview.url!, preview.label)
                }
                title={t("workspace.lightbox.download")}
                aria-label={t("workspace.lightbox.download")}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-[11.5px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <Download className="h-3.5 w-3.5" />
                {t("workspace.lightbox.download")}
              </button>
            )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("workspace.lightbox.close_preview")}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body — clicking the actual media doesn't bubble to backdrop */}
      <div
        className={cn(
          "max-h-[86vh] max-w-[90vw] overflow-auto",
          preview.type === "text" && "w-[min(720px,90vw)]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {preview.type === "image" && preview.url && (
          <img
            src={preview.url}
            alt={preview.label ?? t("workspace.lightbox.alt_preview")}
            className="max-h-[86vh] max-w-[90vw] rounded-md object-contain shadow-2xl shadow-black"
            draggable={false}
          />
        )}

        {preview.type === "video" && preview.url && (
          <video
            src={preview.url}
            controls
            autoPlay
            className="max-h-[86vh] max-w-[90vw] rounded-md shadow-2xl shadow-black"
          />
        )}

        {preview.type === "audio" && preview.url && (
          <div className="flex flex-col items-center gap-3 rounded-md border border-zinc-700 bg-zinc-900 p-6">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Audio
            </div>
            <audio src={preview.url} controls autoPlay className="w-[480px] max-w-[80vw]" />
          </div>
        )}

        {preview.type === "text" && (
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-6 text-[13px] leading-relaxed text-zinc-100 whitespace-pre-wrap">
            {preview.text || (
              <span className="italic text-zinc-500">(empty text)</span>
            )}
          </div>
        )}

        {preview.type === "model3d" && preview.model_url && (
          // Fullscreen 3D viewer — drag to rotate, scroll to zoom.
          // `pointer-events: auto` and stopPropagation on the wrapper
          // are NOT needed here because the lightbox's outer overlay
          // already swallows pan-canvas gestures; the model-viewer
          // owns the whole rectangle.
          <div className="relative w-[min(900px,90vw)] aspect-square rounded-md bg-zinc-950 shadow-2xl shadow-black overflow-hidden">
            <model-viewer
              ref={(el) => {
                modelViewerRef.current = el as HTMLElement | null;
              }}
              src={mirroredModelUrl ?? preview.model_url}
              alt={preview.label ?? t("workspace.lightbox.alt_3d_model")}
              auto-rotate
              camera-controls
              shadow-intensity="1.2"
              exposure="1"
              loading="eager"
              interaction-prompt="auto"
              style={{
                width: "100%",
                height: "100%",
                background: "hsl(0 0% 4%)",
                cursor: "grab",
              }}
            />
            {/* Loading mascot — keeps the user's brain occupied
             *  while the GLB streams in (mirror + model-viewer
             *  parse can take 3–8s on a fresh tile).
             *
             *  Sized down to ~140px (was 75% of viewport) so it
             *  reads as an "animation badge" rather than a hero
             *  preview, and `mix-blend-mode: screen` was REMOVED:
             *  per-frame compositing against a layered backdrop
             *  caused visible flickering on every frame swap (Chrome
             *  re-rasterises the blend each tick). Letting the video
             *  draw onto its own opaque rectangle keeps decoding on
             *  the GPU's fast path with no per-frame work — looks
             *  smooth even on slower machines.
             *
             *  Faded out the instant model-viewer fires `load` so
             *  the orbit takes over without a hard cut. */}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 transition-opacity duration-500",
                modelLoaded ? "opacity-0" : "opacity-100",
              )}
              style={{ background: "hsl(0 0% 4%)" }}
            >
              <video
                src="/videos/cheeky.webm"
                autoPlay
                loop
                muted
                playsInline
                disablePictureInPicture
                className="h-[140px] w-[140px] rounded-md object-contain"
              />
              <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-zinc-400">
                Loading 3D…
              </span>
            </div>
            <a
              href={mirroredModelUrl ?? preview.model_url}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="absolute bottom-3 right-3 rounded-md border border-zinc-700 bg-black/70 px-3 py-1.5 text-[11px] text-zinc-200 backdrop-blur hover:bg-black/90"
            >
              Download .glb
            </a>
          </div>
        )}

        {preview.type === "grid" && Array.isArray(preview.urls) && (
          <div className="grid w-[min(900px,90vw)] grid-cols-3 gap-3">
            {preview.urls.length === 0 ? (
              <div className="col-span-3 flex h-32 items-center justify-center text-xs text-zinc-500">
                <ImageOff className="mr-2 h-4 w-4" /> Empty group
              </div>
            ) : (
              preview.urls.map((u, i) => (
                <img
                  key={u + i}
                  src={u}
                  alt=""
                  className="aspect-square w-full rounded border border-zinc-800 object-cover"
                  draggable={false}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div
        className="absolute inset-x-0 bottom-0 border-t border-white/5 bg-zinc-950/70 px-4 py-2 text-center text-[11px] text-zinc-500"
        onClick={(e) => e.stopPropagation()}
      >
        Esc · A · click to close
      </div>

      {/* Crop overlay — sits on top of the lightbox at z-[2100]
       *  (lightbox is z-[2000]). When active it captures all
       *  clicks; cancel/confirm bubbles back to close the tool
       *  without closing the lightbox. */}
      {cropOpen && preview.type === "image" && preview.url && onCropConfirmed && (
        <ImageCropTool
          src={preview.url}
          suggestedFilename={`${preview.label ?? "image"}.png`}
          onCancel={() => setCropOpen(false)}
          onCropConfirmed={async (blob, filename) => {
            try {
              await onCropConfirmed(blob, filename);
              setCropOpen(false);
              onClose();
            } catch (err) {
              // Let the caller surface its own error toast — the
              // crop tool's UI remains open so the user can retry.
              console.error("[NodePreviewLightbox] crop save failed:", err);
            }
          }}
        />
      )}
    </div>,
    document.body,
  );
};

export default NodePreviewLightbox;

/* ── Helper: pull a downloadable URL + label from any node ────
 * Used by the floating quick toolbar so the user can save an
 * image / video / audio / 3D output without opening the
 * lightbox first. Mirrors the resolution logic in
 * `getNodePreview` below but returns ONLY what `downloadFromUrl`
 * needs — keeps the toolbar's render path tiny. */
export function getNodeDownloadable(
  node: Node,
): { url: string; label: string } | null {
  const d = (node.data ?? {}) as Record<string, unknown>;
  const labelOf = (fallback?: string): string => {
    const params = d.params as Record<string, unknown> | undefined;
    return (
      (typeof params?.nodeName === "string" && params.nodeName.trim()) ||
      (typeof d.label === "string" && d.label.trim()) ||
      fallback ||
      (node.type ?? "asset")
    );
  };

  // AssetNode — direct upload.
  if (node.type === "assetNode") {
    const url =
      (d.previewUrl as string | undefined) ??
      (d.storagePath as string | undefined);
    if (url) return { url, label: labelOf("asset") };
    return null;
  }

  // Tool node — current generation. Prefer model_url for 3D, else
  // the standard `url` field.
  const gens = Array.isArray(d.generations)
    ? (d.generations as Array<Record<string, unknown>>)
    : [];
  if (gens.length > 0) {
    const idx =
      typeof d.selectedGenIndex === "number"
        ? (d.selectedGenIndex as number)
        : 0;
    const g = gens[idx] ?? gens[0];
    const modelUrl = g.model_url as string | undefined;
    if (modelUrl) return { url: modelUrl, label: labelOf() };
    const url = g.url as string | undefined;
    if (url) return { url, label: labelOf() };
  }
  return null;
}

/* ── Helper: build a PreviewPayload from any node ─────────────── */

export function getNodePreview(
  node: Node,
  allNodes: ReadonlyArray<Node>,
): PreviewPayload | null {
  const d = (node.data ?? {}) as Record<string, unknown>;
  const labelOf = (fallback?: string): string => {
    const params = d.params as Record<string, unknown> | undefined;
    return (
      (typeof params?.nodeName === "string" && params.nodeName.trim()) ||
      (typeof d.label === "string" && d.label.trim()) ||
      fallback ||
      (node.type ?? "node")
    );
  };

  // ── AssetNode — direct media file ──
  if (node.type === "assetNode") {
    const url =
      (d.previewUrl as string | undefined) ??
      (d.storagePath as string | undefined);
    if (!url) return null;
    const ft = (d.fieldType as string | undefined) ?? "image";
    // 3D mesh — open in the model viewer with full orbit. The
    // GLB/GLTF lives at `previewUrl`; there's no separate poster
    // for uploads (vs. Tripo3D-generated nodes which DO have a
    // rendered_image), so the lightbox renders model-viewer with
    // its built-in spinner while the GLB streams in.
    if (ft === "model3d") {
      return {
        type: "model3d",
        model_url: url,
        label: labelOf("3d model"),
        caption:
          ((d.fileName as string | undefined) ?? "") +
          " · drag to rotate",
      };
    }
    const previewType: PreviewPayload["type"] =
      ft === "video" ? "video" : ft === "audio" ? "audio" : "image";
    return {
      type: previewType,
      url,
      label: labelOf("asset"),
      caption: (d.fileName as string | undefined) ?? undefined,
    };
  }

  // ── ElementNode — saved or creator-mode refs ──
  if (node.type === "elementNode") {
    const refs = Array.isArray(d.reference_images)
      ? (d.reference_images as unknown[]).filter(
          (u): u is string => typeof u === "string" && !!u,
        )
      : [];
    const frontal = (d.frontal_image_url as string | undefined) ?? undefined;
    const thumb = (d.thumbnail_url as string | undefined) ?? undefined;
    const all = [thumb, frontal, ...refs].filter(
      (u): u is string => typeof u === "string" && !!u,
    );
    if (all.length === 1) {
      return { type: "image", url: all[0], label: labelOf("element") };
    }
    if (all.length > 1) {
      return {
        type: "grid",
        urls: all,
        label: labelOf("element"),
        caption: `${all.length} references`,
      };
    }
    return null;
  }

  // ── TextNode — big text pane ──
  if (node.type === "textNode") {
    return {
      type: "text",
      text: (d.content as string | undefined) ?? "",
      label: labelOf("text"),
    };
  }

  // ── GroupNode — contact sheet of children ──
  if (node.type === "groupNode") {
    const childUrls: string[] = [];
    for (const child of allNodes) {
      if (child.parentId !== node.id) continue;
      const cd = (child.data ?? {}) as Record<string, unknown>;
      const url =
        (cd.previewUrl as string | undefined) ??
        (cd.thumbnail_url as string | undefined) ??
        (Array.isArray(cd.generations) && cd.generations.length > 0
          ? ((cd.generations as Array<{ url?: string }>)[
              typeof cd.selectedGenIndex === "number"
                ? (cd.selectedGenIndex as number)
                : 0
            ]?.url as string | undefined)
          : undefined) ??
        (Array.isArray(cd.reference_images)
          ? ((cd.reference_images as unknown[])[0] as string | undefined)
          : undefined);
      if (url) childUrls.push(url);
    }
    return {
      type: "grid",
      urls: childUrls,
      label: labelOf("group"),
      caption: `${childUrls.length} item(s)`,
    };
  }

  // ── Tool node — last/selected generation ──
  const gens = Array.isArray(d.generations)
    ? (d.generations as Array<Record<string, unknown>>)
    : [];
  if (gens.length > 0) {
    const idx =
      typeof d.selectedGenIndex === "number"
        ? (d.selectedGenIndex as number)
        : 0;
    const g = gens[idx] ?? gens[0];
    const gType = (g.type as string | undefined) ?? "image";
    // 3D model output (Tripo3D) — render fullscreen viewer rather
    // than the still preview image. `model_url` is set alongside the
    // rendered_image `url` whenever a GLB is available.
    const modelUrl = g.model_url as string | undefined;
    if (modelUrl) {
      return {
        type: "model3d",
        model_url: modelUrl,
        poster: g.url as string | undefined,
        label: labelOf(),
        caption: `Generation ${idx + 1} / ${gens.length} · drag to rotate`,
      };
    }
    if (gType === "text") {
      return {
        type: "text",
        text: (g.text as string | undefined) ?? "",
        label: labelOf(),
        caption: `Generation ${idx + 1} / ${gens.length}`,
      };
    }
    const url = g.url as string | undefined;
    if (!url) return null;
    return {
      type: gType === "video" ? "video" : gType === "audio" ? "audio" : "image",
      url,
      label: labelOf(),
      caption: `Generation ${idx + 1} / ${gens.length}`,
    };
  }

  return null;
}
