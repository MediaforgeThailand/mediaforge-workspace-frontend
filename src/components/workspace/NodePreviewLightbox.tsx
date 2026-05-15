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
 *   - groupNode              → contact sheet of every child
 *
 * Closing: click backdrop, hit Esc, or press `A` again.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ImageOff,
  Download,
  Copy,
  Crop as CropIcon,
  Maximize2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Node } from "@xyflow/react";
import { useMirroredTripoUrl } from "./useMirroredTripoUrl";
import { downloadFromUrl } from "./downloadAsset";
import { loadModelViewer } from "@/lib/loadModelViewer";
import { ImageCropTool } from "./ImageCropTool";
import { useLanguage } from "@/contexts/LanguageContext";
import { AudioPlayButton } from "./AudioPlayButton";

export interface PreviewPayload {
  type: "image" | "video" | "audio" | "text" | "grid" | "model3d";
  /** image / video / audio source URL */
  url?: string;
  /** plain-text payload (chat output, video-to-prompt, etc.) */
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
  /** Prompt or source instruction to show in the inspector sidebar. */
  prompt?: string;
  /** Compact settings chips shown in the inspector sidebar. */
  settings?: PreviewSetting[];
  /** Optional custom download path for media that needs a fresh signed/provider URL. */
  onDownload?: () => Promise<void> | void;
  downloadName?: string;
}

export type PreviewSetting =
  | string
  | {
      label: string;
      value?: string | number | null;
    };

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
  const { language, t, t: i18n } = useLanguage();
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
        if (cropOpen) {
          setCropOpen(false);
          return;
        }
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
  }, [cropOpen, onClose]);

  const canCrop = preview.type === "image" && !!preview.url && !!onCropConfirmed;
  const canDownload =
    (preview.type === "image" ||
      preview.type === "video" ||
      preview.type === "audio") &&
    !!preview.url;
  const modelDownloadUrl =
    preview.type === "model3d"
      ? (mirroredModelUrl ?? preview.model_url)
      : undefined;
  const canDownloadModel = preview.type === "model3d" && !!modelDownloadUrl;
  const isMediaInspector =
    (preview.type === "image" || preview.type === "video") && !!preview.url;
  const inspectorPrompt =
    preview.prompt?.trim() ||
    (preview.label && preview.label !== "asset" ? preview.label : "") ||
    "";
  const inspectorSettings = normalizePreviewSettings(preview);
  const copyPrompt = async () => {
    if (!inspectorPrompt) return;
    try {
      await navigator.clipboard.writeText(inspectorPrompt);
    } catch (err) {
      console.warn("[NodePreviewLightbox] copy prompt failed:", err);
    }
  };
  const copyUrl = async () => {
    if (!preview.url) return;
    try {
      await navigator.clipboard.writeText(preview.url);
    } catch (err) {
      console.warn("[NodePreviewLightbox] copy URL failed:", err);
    }
  };
  const downloadPreview = async () => {
    try {
      if (preview.onDownload) {
        await preview.onDownload();
        return;
      }
      if (preview.url) {
        await downloadFromUrl(preview.url, preview.downloadName ?? preview.label);
      }
    } catch (err) {
      console.warn("[NodePreviewLightbox] download failed:", err);
    }
  };

  const previewTools = (mobile = false) => (
    <div
      className={cn(
        "flex border border-white/10 bg-zinc-950/85 p-2 shadow-2xl shadow-black/40 backdrop-blur-md",
        mobile
          ? "items-center gap-1.5 rounded-2xl"
          : "flex-col items-stretch gap-1.5 rounded-[18px]",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {canCrop && (
        <PreviewToolButton
          icon={CropIcon}
          label={t("workspace.lightbox.crop")}
          title={t("workspace.lightbox.crop_image")}
          onClick={() => setCropOpen(true)}
          mobile={mobile}
        />
      )}
      {canDownload && preview.url && (
        <PreviewToolButton
          icon={Download}
          label={t("workspace.lightbox.download")}
          title={t("workspace.lightbox.download")}
          onClick={() => void downloadPreview()}
          mobile={mobile}
          tone="primary"
        />
      )}
      {canDownloadModel && modelDownloadUrl && (
        <PreviewToolButton
          icon={Download}
          label="GLB"
          title={i18n("workspace.lightbox.downloadGlb")}
          onClick={() =>
            void downloadFromUrl(modelDownloadUrl, preview.label ?? "3d-model")
          }
          mobile={mobile}
          tone="primary"
        />
      )}
      <PreviewToolButton
        icon={X}
        title={t("workspace.lightbox.close_preview")}
        onClick={onClose}
        mobile={mobile}
      />
    </div>
  );

  if (isMediaInspector && preview.url) {
    const actionRows =
      preview.type === "image"
        ? [
            {
              icon: Download,
              label: i18n("common.download"),
              onClick: () => void downloadPreview(),
            },
          ]
        : [
            {
              icon: Download,
              label: i18n("workspace.lightbox.downloadVideo"),
              onClick: () => void downloadPreview(),
            },
          ];

    return createPortal(
      <div
        className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/78 p-5 backdrop-blur-md"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="relative flex h-[min(90vh,820px)] w-[min(94vw,1580px)] overflow-hidden rounded-[18px] border border-white/12 bg-[#0f1012] shadow-[0_24px_90px_rgba(0,0,0,.72)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="min-w-0 flex-1 bg-black">
            {preview.type === "image" ? (
              <img
                src={preview.url}
                alt={preview.label ?? t("workspace.lightbox.alt_preview")}
                className="h-full w-full object-contain"
                draggable={false}
              />
            ) : (
              <video
                src={preview.url}
                controls
                autoPlay
                className="h-full w-full bg-black object-contain"
              />
            )}
          </div>

          <aside className="flex w-[344px] shrink-0 flex-col border-l border-white/8 bg-[#101113] px-4 py-4 text-white">
            <div className="flex items-center justify-end gap-1">
              <InspectorIconButton
                icon={Maximize2}
                label={i18n("workspace.lightbox.fullscreen")}
                onClick={() => {
                  if (document.fullscreenElement) {
                    void document.exitFullscreen();
                  } else {
                    void document.documentElement.requestFullscreen();
                  }
                }}
              />
              {canCrop && (
                <InspectorIconButton
                  icon={CropIcon}
                  label={i18n("workspace.lightbox.crop")}
                  onClick={() => setCropOpen(true)}
                />
              )}
              <InspectorIconButton
                icon={Copy}
                label={i18n("workspace.lightbox.copyUrl")}
                onClick={copyUrl}
              />
              <InspectorIconButton
                icon={Download}
                label={i18n("common.download")}
                onClick={() => void downloadPreview()}
              />
            </div>

            <div className="mt-7">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {i18n("workspace.lightbox.prompt")}
                </p>
                {inspectorPrompt && (
                  <button
                    type="button"
                    onClick={copyPrompt}
                    className="grid h-6 w-6 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                    aria-label={i18n("workspace.lightbox.copyPrompt")}
                    title={i18n("workspace.lightbox.copyPrompt")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-4 text-[13px] font-semibold leading-relaxed text-white">
                {inspectorPrompt || (
                  <span className="font-medium text-zinc-500">
                    {i18n("workspace.lightbox.noPrompt")}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-7">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {i18n("common.settings")}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {inspectorSettings.length > 0 ? (
                  inspectorSettings.map((setting) => (
                    <span
                      key={`${setting.label}:${setting.value ?? ""}`}
                      className="max-w-full truncate rounded-md bg-white/[0.08] px-2 py-1 text-[10px] font-semibold leading-none text-zinc-200"
                    >
                      {setting.value == null || setting.value === ""
                        ? setting.label
                        : `${setting.label}: ${setting.value}`}
                    </span>
                  ))
                ) : (
                  <span className="text-[12px] text-zinc-500">
                    {i18n("workspace.lightbox.noSettings")}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-auto space-y-2 pb-1">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {i18n("common.tools")}
              </p>
              {actionRows.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[12px] font-medium text-zinc-300 transition hover:bg-white/[0.07] hover:text-white"
                >
                  <action.icon className="h-4 w-4 shrink-0 text-zinc-400" />
                  <span>{action.label}</span>
                </button>
              ))}
              {preview.type === "image" && (
                <button
                  type="button"
                  onClick={canCrop ? () => setCropOpen(true) : undefined}
                  disabled={!canCrop}
                  className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white text-[12px] font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CropIcon className="h-4 w-4" />
                  {i18n("workspace.lightbox.editImage")}
                </button>
              )}
            </div>
          </aside>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={t("workspace.lightbox.close_preview")}
          className="absolute right-6 top-6 grid h-9 w-9 place-items-center rounded-full bg-zinc-700 text-white shadow-xl transition hover:bg-zinc-500"
        >
          <X className="h-5 w-5" />
        </button>

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
                console.error("[NodePreviewLightbox] crop save failed:", err);
              }
            }}
          />
        )}
      </div>,
      document.body,
    );
  }

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
        className="absolute inset-x-0 top-0 flex items-center gap-3 bg-zinc-950/80 px-4 py-2.5 text-sm text-zinc-200"
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
        <div className="hidden items-center gap-1">
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
                  void downloadPreview()
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

      {/* Body — clicking the actual media doesn't bubble to backdrop.
       *
       *  Text previews previously used `w-[min(720px,...)]` and
       *  relied solely on `whitespace-pre-wrap` for wrapping. That
       *  works for prose but fails on glued-together strings (the
       *  user's repro: typing "asdasdasd..." with no spaces) — the
       *  unbreakable "word" extended off-screen as a single line
       *  with the X-button floating thousands of pixels to the
       *  right. Bumped to a generous 960×80vh reading box and
       *  fixed the wrapping below. */}
      <div
        className={cn(
          "relative max-h-[86vh] max-w-[calc(90vw-88px)] overflow-visible",
          preview.type === "text" &&
            "w-[min(960px,calc(90vw-88px))] max-h-[80vh]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {preview.type === "image" && preview.url && (
          <img
            src={preview.url}
            alt={preview.label ?? t("workspace.lightbox.alt_preview")}
            className="max-h-[86vh] max-w-[calc(90vw-88px)] rounded-md object-contain shadow-2xl shadow-black"
            draggable={false}
          />
        )}

        {preview.type === "video" && preview.url && (
          <video
            src={preview.url}
            controls
            autoPlay
            className="max-h-[86vh] max-w-[calc(90vw-88px)] rounded-md shadow-2xl shadow-black"
          />
        )}

        {preview.type === "audio" && preview.url && (
          <div className="flex min-h-[220px] min-w-[280px] flex-col items-center justify-center gap-4 rounded-md bg-zinc-900 p-6">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              {i18n("common.audio")}
            </div>
            <AudioPlayButton
              src={preview.url}
              autoPlay
              label={preview.label ?? i18n("workspace.common.playAudio")}
              buttonClassName="h-14 w-14"
            />
          </div>
        )}

        {preview.type === "text" && (
          /* Generous reading-card: 960×80vh max so the lightbox
           *  feels like a proper text viewer, not a tooltip strip.
           *
           *  `break-words` (overflow-wrap: anywhere) makes
           *  unbroken strings like "asdasdasd…" wrap at the box
           *  edge instead of escaping horizontally — the bug the
           *  user reported. `whitespace-pre-wrap` keeps the user's
           *  newlines and runs of spaces intact for prose-style
           *  paragraphs.
           *
           *  `overflow-y-auto` so a long note scrolls inside the
           *  card. Slightly larger 14.5px font + 1.55 line-height
           *  for comfortable reading on the dark surface. */
          <div className="max-h-[80vh] w-full overflow-y-auto rounded-lg bg-zinc-900 p-7 text-[14.5px] leading-[1.55] text-zinc-100 whitespace-pre-wrap break-words shadow-2xl shadow-black">
            {preview.text || (
              <span className="italic text-zinc-500">{i18n("workspace.lightbox.emptyText")}</span>
            )}
          </div>
        )}

        {preview.type === "model3d" && preview.model_url && (
          <div className="relative aspect-square w-[min(900px,calc(90vw-88px))] overflow-hidden rounded-md bg-zinc-950 shadow-2xl shadow-black">
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
                {i18n("workspace.lightbox.loading3d")}
              </span>
            </div>
          </div>
        )}

        {preview.type === "grid" && Array.isArray(preview.urls) && (
          <div className="grid w-[min(900px,calc(90vw-88px))] grid-cols-3 gap-3">
            {preview.urls.length === 0 ? (
              <div className="col-span-3 flex h-32 items-center justify-center text-xs text-zinc-500">
                <ImageOff className="mr-2 h-4 w-4" /> {i18n("workspace.lightbox.emptyGroup")}
              </div>
            ) : (
              preview.urls.map((u, i) => (
                <img
                  key={u + i}
                  src={u}
                  alt=""
                  className="aspect-square w-full rounded object-cover"
                  draggable={false}
                />
              ))
            )}
          </div>
        )}
        <div className="absolute left-full top-1/2 ml-4 hidden -translate-y-1/2 sm:block">
          {previewTools(false)}
        </div>
      </div>

      <div className="absolute bottom-7 left-1/2 z-10 -translate-x-1/2 sm:hidden">
        {previewTools(true)}
      </div>

      {/* Footer hint */}
      <div
        className="absolute inset-x-0 bottom-0 bg-zinc-950/80 px-4 py-2 text-center text-[11px] text-zinc-500"
        onClick={(e) => e.stopPropagation()}
      >
        {i18n("workspace.lightbox.escClickToClose")}
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

function PreviewToolButton({
  icon: Icon,
  label,
  title,
  onClick,
  mobile = false,
  tone = "default",
}: {
  icon: LucideIcon;
  label?: string;
  title: string;
  onClick: () => void;
  mobile?: boolean;
  tone?: "default" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "group inline-flex shrink-0 items-center justify-center rounded-xl text-zinc-200 transition-colors hover:bg-white/10 hover:text-white",
        mobile
          ? "h-12 min-w-12 gap-2 px-2.5 text-[12px]"
          : "min-h-[60px] min-w-[72px] flex-col gap-1.5 px-2.5 py-2 text-[12px]",
        tone === "primary" && "bg-white text-zinc-950 hover:bg-zinc-200 hover:text-zinc-950",
      )}
    >
      <Icon className="h-5 w-5" />
      {label && (
        <span className={cn("max-w-[68px] truncate font-semibold", mobile && "max-w-[90px]")}>
          {label}
        </span>
      )}
    </button>
  );
}

function InspectorIconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.07] hover:text-white"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function normalizePreviewSettings(preview: PreviewPayload) {
  const settings: Array<{ label: string; value?: string | number | null }> = [];
  for (const setting of preview.settings ?? []) {
    if (typeof setting === "string") {
      if (setting.trim()) settings.push({ label: setting.trim() });
      continue;
    }
    if (setting.label?.trim()) {
      settings.push({
        label: setting.label.trim(),
        value: setting.value,
      });
    }
  }
  if (settings.length === 0 && preview.caption?.trim()) {
    for (const part of preview.caption.split(/[·|]/).map((item) => item.trim())) {
      if (part) settings.push({ label: part });
    }
  }
  return settings.slice(0, 8);
}

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

function cleanPreviewText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNodePromptMeta(
  data: Record<string, unknown>,
  generation?: Record<string, unknown>,
) {
  const params = data.params as Record<string, unknown> | undefined;
  return cleanPreviewText(params?.prompt) ??
    cleanPreviewText(data.prompt) ??
    cleanPreviewText(generation?.prompt_used) ??
    cleanPreviewText(generation?.prompt);
}

function getNodePreviewSettings(
  data: Record<string, unknown>,
  generation?: Record<string, unknown>,
): PreviewSetting[] {
  const params = data.params as Record<string, unknown> | undefined;
  const settings: PreviewSetting[] = [];
  const add = (label: string, value?: unknown) => {
    const cleanValue =
      typeof value === "number" || typeof value === "string" ? value : undefined;
    if (cleanValue == null || cleanValue === "") return;
    settings.push({ label, value: cleanValue });
  };

  const model =
    cleanPreviewText(params?.model_name) ??
    cleanPreviewText(data.model) ??
    cleanPreviewText(generation?.model);
  if (model) {
    settings.push({
      label:
        model === "gpt-image-2-enhance" ||
        model === "magnific-upscale-precision-v2"
          ? "Upscale Mediaforge"
          : model,
    });
  }
  add("Aspect", params?.ratio ?? params?.aspect_ratio ?? params?.size);
  add("Duration", params?.duration ? `${params.duration}s` : undefined);
  add("Quality", params?.quality ?? params?.resolution);
  add("Format", params?.output_format);
  add("Created", generation?.created_at ?? data.created_at);
  return settings;
}

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
      prompt: getNodePromptMeta(d),
      settings: getNodePreviewSettings(d),
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
      return {
        type: "image",
        url: all[0],
        label: labelOf("element"),
        prompt: getNodePromptMeta(d),
        settings: getNodePreviewSettings(d),
      };
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

  // TextNode is an editor/control node, not a renderable output.
  // Double-clicking it should select/edit the node instead of opening
  // an empty text lightbox.
  if (node.type === "textNode") {
    return null;
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
    const prompt = getNodePromptMeta(d, g);
    const settings = getNodePreviewSettings(d, g);
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
        prompt,
        settings,
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
      prompt,
      settings,
    };
  }

  return null;
}
