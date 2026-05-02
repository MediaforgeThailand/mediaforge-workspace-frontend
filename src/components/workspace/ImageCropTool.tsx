/**
 * ImageCropTool — drag-to-crop overlay used inside NodePreviewLightbox.
 *
 * UX:
 *   1. Loads the source image into a hidden <img>; once decoded we
 *      know the natural dimensions and can map screen-space drag
 *      gestures back to source-image pixels.
 *   2. Renders the image inside a fixed-size canvas-frame, with a
 *      draggable crop rectangle overlaid. Outside of the rectangle
 *      gets a black/60 dimming mask so the eye anchors on the crop
 *      area; inside has 8 resize handles + a "drag the body to move"
 *      pointer.
 *   3. On confirm, draws the cropped region into an off-screen <canvas>
 *      at SOURCE resolution, calls toBlob() to get a JPEG/PNG blob, and
 *      hands the blob back to the parent via `onCropConfirmed(blob)`.
 *      Parent uploads + spawns a new AssetNode (or whatever it does
 *      with the cropped result).
 *
 * Why custom (no react-image-crop / react-easy-crop):
 *   - The lightbox is already wrapped in its own portal + backdrop;
 *     a third-party crop component would re-add its own gesture/CSS
 *     scaffolding that fights ours.
 *   - The bundle stays small (~5 KB vs ~40-60 KB for the popular
 *     libs) and the gesture model is exactly what we need: 8 handles
 *     + drag-the-body. No need for rotation, free-form polygons, or
 *     locked aspect ratios beyond a simple toggle.
 *
 * Performance notes:
 *   - Drag updates the crop rect via React state (not direct DOM
 *     mutation) because the crop preview re-renders the masked
 *     dimming layer. ~60fps is fine for a single rect with 4
 *     numbers.
 *   - The toBlob() encode happens in a background-thread browser
 *     primitive, so even 4096x4096 crops don't jank the UI.
 *
 * Source / handling of CORS:
 *   - Signed URLs from Supabase ai-media bucket are CORS-allowed for
 *     the workspace origin. <img>.crossOrigin = "anonymous" is set
 *     so the canvas isn't tainted, otherwise toBlob() throws
 *     SecurityError ("tainted canvas").
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, X as XIcon, Crop as CropIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface ImageCropToolProps {
  /** Source image URL — must be CORS-fetchable (signed URL or
   *  same-origin). Tainted images throw on toBlob. */
  src: string;
  /** Suggested filename for the output blob. The parent uses this
   *  to name the uploaded asset. */
  suggestedFilename?: string;
  /** Output mime; defaults to image/png to preserve transparency.
   *  Use image/jpeg if the user wants smaller files. */
  outputMime?: "image/png" | "image/jpeg" | "image/webp";
  /** Called with the cropped blob when the user confirms.
   *  Caller is responsible for uploading + spawning a new node. */
  onCropConfirmed: (blob: Blob, suggestedName: string) => Promise<void> | void;
  /** Called when the user cancels. Caller closes the tool. */
  onCancel: () => void;
}

interface CropRect {
  /** All values in NATURAL image-source pixels (not screen). */
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragMode =
  | { kind: "none" }
  | { kind: "move"; startMouseX: number; startMouseY: number; startRect: CropRect }
  | {
      kind: "resize";
      handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
      startMouseX: number;
      startMouseY: number;
      startRect: CropRect;
    };

const MIN_CROP_PX = 32;

export function ImageCropTool({
  src,
  suggestedFilename = "cropped.png",
  outputMime = "image/png",
  onCropConfirmed,
  onCancel,
}: ImageCropToolProps) {
  const { t } = useLanguage();
  // The natural (source) image dimensions — known after the <img>
  // loads. We need these to convert screen-pixel drag deltas into
  // source-pixel crop coords.
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  // Screen-space size of the rendered image (object-contain inside a
  // fixed frame). We re-measure on resize so the screen→source
  // mapping stays correct if the user resizes their window mid-crop.
  const [screenSize, setScreenSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>({ kind: "none" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Once the source image decodes, derive natural size + place a
  // sensible default crop rect (centered 80% box).
  const handleImageLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNaturalSize({ w, h });
    setCrop({
      x: Math.round(w * 0.1),
      y: Math.round(h * 0.1),
      width: Math.round(w * 0.8),
      height: Math.round(h * 0.8),
    });
  };

  // Re-measure the rendered image on every resize so screen→source
  // math stays accurate. Object-contain means the image rectangle
  // shrinks/grows independently of the wrapper.
  useEffect(() => {
    const measure = () => {
      const img = imgRef.current;
      if (!img) return;
      const rect = img.getBoundingClientRect();
      setScreenSize({ w: rect.width, h: rect.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (imgRef.current) ro.observe(imgRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [naturalSize]);

  // Convert screen-pixel delta to source-pixel delta. Returns 0,0
  // until we've measured both natural + screen size, which means
  // pre-load drag attempts (impossible since the rect renders only
  // after load) just no-op.
  const screenToSource = (dx: number, dy: number) => {
    if (!naturalSize || !screenSize.w || !screenSize.h) return { dx: 0, dy: 0 };
    return {
      dx: (dx * naturalSize.w) / screenSize.w,
      dy: (dy * naturalSize.h) / screenSize.h,
    };
  };

  /* ── Pointer handlers ──────────────────────────────────────── */

  const onMovePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!crop) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragMode({
      kind: "move",
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startRect: crop,
    });
  };

  const onResizePointerDown =
    (handle: Exclude<DragMode, { kind: "move" } | { kind: "none" }>["handle"]) =>
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!crop) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDragMode({
        kind: "resize",
        handle,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startRect: crop,
      });
    };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragMode.kind === "none" || !naturalSize || !crop) return;
    const dxScreen = e.clientX - (dragMode as { startMouseX: number }).startMouseX;
    const dyScreen = e.clientY - (dragMode as { startMouseY: number }).startMouseY;
    const { dx, dy } = screenToSource(dxScreen, dyScreen);
    const start = (dragMode as { startRect: CropRect }).startRect;

    if (dragMode.kind === "move") {
      const nx = Math.max(0, Math.min(naturalSize.w - start.width, start.x + dx));
      const ny = Math.max(0, Math.min(naturalSize.h - start.height, start.y + dy));
      setCrop({ x: nx, y: ny, width: start.width, height: start.height });
      return;
    }

    if (dragMode.kind === "resize") {
      let { x, y, width, height } = start;
      const right = start.x + start.width;
      const bottom = start.y + start.height;
      const handle = dragMode.handle;

      if (handle.includes("w")) {
        const newX = Math.max(0, Math.min(right - MIN_CROP_PX, start.x + dx));
        width = right - newX;
        x = newX;
      }
      if (handle.includes("e")) {
        const newRight = Math.max(start.x + MIN_CROP_PX, Math.min(naturalSize.w, right + dx));
        width = newRight - start.x;
      }
      if (handle.includes("n")) {
        const newY = Math.max(0, Math.min(bottom - MIN_CROP_PX, start.y + dy));
        height = bottom - newY;
        y = newY;
      }
      if (handle.includes("s")) {
        const newBottom = Math.max(start.y + MIN_CROP_PX, Math.min(naturalSize.h, bottom + dy));
        height = newBottom - start.y;
      }
      setCrop({ x, y, width, height });
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setDragMode({ kind: "none" });
  };

  /* ── Confirm / cancel ──────────────────────────────────────── */

  const handleConfirm = async () => {
    if (!crop || !naturalSize || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const img = imgRef.current;
      if (!img) throw new Error("image not loaded");
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(crop.width));
      canvas.height = Math.max(1, Math.round(crop.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 2d context unavailable");
      ctx.drawImage(
        img,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const blob: Blob | null = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), outputMime, 0.95);
      });
      if (!blob) throw new Error(t("workspace.crop.encode_failed"));

      // Compose the suggested filename — append "-cropped" before the
      // extension so the asset library doesn't collide with the
      // original.
      const ext = outputMime === "image/jpeg" ? "jpg" : outputMime === "image/webp" ? "webp" : "png";
      const baseName = suggestedFilename.replace(/\.[^.]+$/, "");
      const finalName = `${baseName}-cropped.${ext}`;

      await onCropConfirmed(blob, finalName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  /* ── Render ────────────────────────────────────────────────── */

  // Compute screen-pixel rect for the overlay layer. `crop` is in
  // source pixels, so multiply by the screen/natural ratio.
  const overlayRect = (() => {
    if (!crop || !naturalSize || !screenSize.w || !screenSize.h) return null;
    return {
      left: (crop.x / naturalSize.w) * screenSize.w,
      top: (crop.y / naturalSize.h) * screenSize.h,
      width: (crop.width / naturalSize.w) * screenSize.w,
      height: (crop.height / naturalSize.h) * screenSize.h,
    };
  })();

  const handleStyle = "absolute h-3 w-3 rounded-sm border-2 border-white bg-zinc-900/90 shadow-lg";

  return (
    <div
      className="fixed inset-0 z-[2100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* Top toolbar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-zinc-950/90 px-4 py-2.5 text-sm text-zinc-100">
        <div className="flex items-center gap-2 font-medium">
          <CropIcon className="h-4 w-4" />
          {t("workspace.crop.heading")}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white/[0.06] px-3 text-[12px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.10] disabled:opacity-50"
          >
            <XIcon className="h-3.5 w-3.5" />
            {t("workspace.crop.cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!crop || submitting}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors",
              !crop || submitting
                ? "cursor-not-allowed bg-emerald-500/30 text-emerald-200/60"
                : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400",
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("workspace.crop.saving")}
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                {t("workspace.crop.save")}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main canvas frame */}
      <div
        ref={wrapperRef}
        className="relative flex items-center justify-center"
        style={{ width: "min(90vw, 1200px)", height: "min(82vh, 800px)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={t("workspace.crop.source_alt")}
          crossOrigin="anonymous"
          onLoad={handleImageLoad}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain shadow-2xl"
        />

        {/* Overlay layer — only renders once we know both natural +
         *  screen sizes. Positioned absolutely INSIDE the wrapper
         *  with the same bounding box as the image element. */}
        {overlayRect && imgRef.current && (
          <div
            className="pointer-events-none absolute"
            style={{
              left: imgRef.current.offsetLeft,
              top: imgRef.current.offsetTop,
              width: screenSize.w,
              height: screenSize.h,
            }}
          >
            {/* Dim mask — full layer with a "punched-out" hole at the
             *  crop rect so the inside reads at full brightness while
             *  outside is heavily dimmed. Implemented via 4
             *  positioned divs (top/left/right/bottom of the crop)
             *  rather than a clip-path so older browsers behave. */}
            <div
              className="absolute bg-black/60"
              style={{
                left: 0,
                top: 0,
                width: "100%",
                height: overlayRect.top,
              }}
            />
            <div
              className="absolute bg-black/60"
              style={{
                left: 0,
                top: overlayRect.top + overlayRect.height,
                width: "100%",
                height: `calc(100% - ${overlayRect.top + overlayRect.height}px)`,
              }}
            />
            <div
              className="absolute bg-black/60"
              style={{
                left: 0,
                top: overlayRect.top,
                width: overlayRect.left,
                height: overlayRect.height,
              }}
            />
            <div
              className="absolute bg-black/60"
              style={{
                left: overlayRect.left + overlayRect.width,
                top: overlayRect.top,
                width: `calc(100% - ${overlayRect.left + overlayRect.width}px)`,
                height: overlayRect.height,
              }}
            />

            {/* Crop rect outline + handles — pointer-events-auto so
             *  drag works inside this region only. */}
            <div
              className="pointer-events-auto absolute border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
              style={{
                left: overlayRect.left,
                top: overlayRect.top,
                width: overlayRect.width,
                height: overlayRect.height,
                cursor: dragMode.kind === "move" ? "grabbing" : "grab",
                touchAction: "none",
              }}
              onPointerDown={onMovePointerDown}
            >
              {/* Rule-of-thirds guide lines for composition */}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/30" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/30" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/30" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/30" />
              </div>

              {/* 8 resize handles — corners + edge midpoints */}
              <div
                className={cn(handleStyle, "-left-1.5 -top-1.5 cursor-nw-resize")}
                style={{ touchAction: "none" }}
                onPointerDown={onResizePointerDown("nw")}
              />
              <div
                className={cn(handleStyle, "left-1/2 -top-1.5 -translate-x-1/2 cursor-n-resize")}
                style={{ touchAction: "none" }}
                onPointerDown={onResizePointerDown("n")}
              />
              <div
                className={cn(handleStyle, "-right-1.5 -top-1.5 cursor-ne-resize")}
                style={{ touchAction: "none" }}
                onPointerDown={onResizePointerDown("ne")}
              />
              <div
                className={cn(handleStyle, "-right-1.5 top-1/2 -translate-y-1/2 cursor-e-resize")}
                style={{ touchAction: "none" }}
                onPointerDown={onResizePointerDown("e")}
              />
              <div
                className={cn(handleStyle, "-right-1.5 -bottom-1.5 cursor-se-resize")}
                style={{ touchAction: "none" }}
                onPointerDown={onResizePointerDown("se")}
              />
              <div
                className={cn(handleStyle, "left-1/2 -bottom-1.5 -translate-x-1/2 cursor-s-resize")}
                style={{ touchAction: "none" }}
                onPointerDown={onResizePointerDown("s")}
              />
              <div
                className={cn(handleStyle, "-left-1.5 -bottom-1.5 cursor-sw-resize")}
                style={{ touchAction: "none" }}
                onPointerDown={onResizePointerDown("sw")}
              />
              <div
                className={cn(handleStyle, "-left-1.5 top-1/2 -translate-y-1/2 cursor-w-resize")}
                style={{ touchAction: "none" }}
                onPointerDown={onResizePointerDown("w")}
              />
            </div>
          </div>
        )}
      </div>

      {/* Info / error footer */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-zinc-950/90 px-4 py-2 text-[11px] text-zinc-400">
        {error ? (
          <span className="text-red-300">{error}</span>
        ) : crop && naturalSize ? (
          <>
            <span>
              {Math.round(crop.width)} × {Math.round(crop.height)} px
            </span>
            <span className="text-zinc-600">·</span>
            <span>{t("workspace.crop.hint")}</span>
          </>
        ) : (
          <span>{t("workspace.crop.loading")}</span>
        )}
      </div>
    </div>
  );
}
