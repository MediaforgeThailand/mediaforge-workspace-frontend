/**
 * Per-clip video frame-strip extractor.
 *
 * Uses a hidden HTML5 `<video>` element + canvas seek-and-draw to grab
 * thumbnails at evenly-spaced timestamps within a clip's visible range.
 * Falls back gracefully when the browser can't decode the source.
 *
 * Performance / reliability notes:
 *  - We wait for `loadeddata` after metadata so the first paint isn't black.
 *  - Each seek waits for `seeked` AND a microtask tick so the video element
 *    has finished blitting the new frame to its decoded buffer before we
 *    drawImage. Without this we occasionally drew the previous frame.
 *  - Sequential seeks (parallel seeks are unreliable across browsers).
 *  - Strict per-seek timeout. If a single seek fails we skip that slot
 *    rather than abandoning the whole extraction.
 *  - The HTML5 path handles codecs the user's browser can play directly
 *    (h.264/aac, vp8/vp9, av1 on recent Chrome). It's a fallback for files
 *    that mediabunny can't decode but the browser still can.
 */

const MAX_THUMBS = 60;
const METADATA_TIMEOUT_MS = 8000;
const SEEK_TIMEOUT_MS = 3000;

// Global pause flag. Toggled by the Preview when playback starts/stops.
// While paused, in-flight extractions still complete (they're already running)
// but new extraction requests throw a marker error so callers can retry later
// without caching an empty frame strip as completed work. Saves significant
// decoder contention when the user has 3+ tracks playing.
let extractionPaused = false;
const pausedResolvers: Array<() => void> = [];

export class ThumbnailExtractionPausedError extends Error {
  constructor() {
    super("Thumbnail extraction is paused while playback is active");
    this.name = "ThumbnailExtractionPausedError";
  }
}

export function isThumbnailExtractionPausedError(
  error: unknown,
): error is ThumbnailExtractionPausedError {
  return (
    error instanceof ThumbnailExtractionPausedError ||
    (error instanceof Error && error.name === "ThumbnailExtractionPausedError")
  );
}

/**
 * Pause new thumbnail extraction work — called by the Preview when playback
 * begins. New `extractFrameStrip` calls return immediately with `[]` until
 * resumed. In-flight extractions are not aborted; we let them finish so the
 * timeline doesn't end up with half-extracted strips after a quick play/pause.
 */
export function setThumbnailExtractionPaused(paused: boolean): void {
  if (extractionPaused === paused) return;
  extractionPaused = paused;
  if (!paused) {
    // Wake any callers that opted into the queued mode.
    while (pausedResolvers.length > 0) {
      const r = pausedResolvers.shift();
      r?.();
    }
  }
}

/** True if extraction is currently paused (mostly for tests / diagnostics). */
export function isThumbnailExtractionPaused(): boolean {
  return extractionPaused;
}

export interface FrameThumbnail {
  /** Timestamp in seconds within the source media. */
  timestamp: number;
  /** Object URL pointing to a JPEG/WebP blob. */
  url: string;
}

export interface ExtractOptions {
  /** Number of frames to extract — clamped to [1, MAX_THUMBS]. */
  count: number;
  /** Start time in seconds within the source media. */
  startTime: number;
  /** End time in seconds within the source media. */
  endTime: number;
  /** Thumbnail width in pixels — height derives from source aspect. */
  thumbnailWidth?: number;
  /** Output mime type, default image/jpeg. */
  mimeType?: string;
  /** JPEG quality 0..1 when mimeType is image/jpeg. */
  quality?: number;
  /** Optional abort signal — cancels in-flight extraction. */
  signal?: AbortSignal;
}

/**
 * Extract frame-strip thumbnails from a video source. Returns object URLs.
 *
 * Caller owns the returned URLs and should call URL.revokeObjectURL when
 * dropping them from cache.
 */
export async function extractFrameStrip(
  source: Blob | string,
  options: ExtractOptions,
): Promise<FrameThumbnail[]> {
  const {
    count,
    startTime,
    endTime,
    thumbnailWidth = 160,
    mimeType = "image/jpeg",
    quality = 0.65,
    signal,
  } = options;

  const safeCount = Math.max(1, Math.min(MAX_THUMBS, Math.floor(count)));

  // If playback is active we skip the work entirely. The caller marked
  // their request in-flight in the cache, so we just resolve empty —
  // they'll retry on the next render after playback stops. This keeps
  // multi-track playback from competing with thumb seeks on the same
  // shared <video> elements.
  // Throwing here avoids caching an empty strip as a completed thumbnail set.
  if (extractionPaused) {
    throw new ThumbnailExtractionPausedError();
  }

  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  // Position offscreen so it never affects layout. Some browsers won't
  // produce decoded frames for elements with `display: none`, so we use
  // visibility/position instead.
  video.style.position = "fixed";
  video.style.left = "-10000px";
  video.style.top = "0";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  document.body.appendChild(video);

  let revokeUrl: string | null = null;
  if (source instanceof Blob) {
    revokeUrl = URL.createObjectURL(source);
    video.src = revokeUrl;
  } else {
    video.src = source;
  }

  const cleanup = () => {
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      /* ignore */
    }
    try {
      video.remove();
    } catch {
      /* ignore */
    }
    if (revokeUrl) {
      try {
        URL.revokeObjectURL(revokeUrl);
      } catch {
        /* ignore */
      }
    }
  };

  // Wire up abort to cleanup early.
  const abortHandler = () => cleanup();
  if (signal) {
    if (signal.aborted) {
      cleanup();
      return [];
    }
    signal.addEventListener("abort", abortHandler);
  }

  try {
    await waitForLoadedMetadata(video);
    // Wait for first frame data so seeks don't draw black frames.
    await waitForLoadedData(video).catch(() => undefined);

    if (signal?.aborted) {
      cleanup();
      return [];
    }

    // If metadata says the video is shorter than requested endTime, clamp.
    const sourceDuration = Number.isFinite(video.duration) ? video.duration : endTime;
    const clampedEnd = Math.min(endTime, sourceDuration || endTime);
    const clampedStart = Math.max(0, Math.min(startTime, clampedEnd - 0.05));
    const realDuration = Math.max(0.05, clampedEnd - clampedStart);

    // Compute target dims
    const aspect =
      video.videoWidth > 0 && video.videoHeight > 0
        ? video.videoHeight / video.videoWidth
        : 9 / 16;
    const thumbHeight = Math.max(1, Math.round(thumbnailWidth * aspect));

    const canvas = document.createElement("canvas");
    canvas.width = thumbnailWidth;
    canvas.height = thumbHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) {
      if (signal) signal.removeEventListener("abort", abortHandler);
      cleanup();
      return [];
    }

    const thumbs: FrameThumbnail[] = [];

    for (let i = 0; i < safeCount; i++) {
      if (signal?.aborted) break;
      // Sample at midpoint of each evenly-spaced segment so we don't double up
      // the first frame at startTime (which is often black/transitional).
      // Avoid the very first/last frames which are often black or transitional.
      const ratio = safeCount === 1 ? 0.5 : (i + 0.5) / safeCount;
      const t = clampedStart + ratio * realDuration;

      try {
        await seekTo(video, t);
        // Yield to the event loop so the decoder finishes writing the new
        // frame to the element's playback buffer before drawImage reads it.
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      } catch {
        // Skip this frame on timeout.
        continue;
      }

      try {
        ctx.drawImage(video, 0, 0, thumbnailWidth, thumbHeight);
      } catch {
        // Cross-origin canvas taint or decode failure.
        continue;
      }

      const blob = await canvasToBlob(canvas, mimeType, quality);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      thumbs.push({ timestamp: t, url });
    }

    if (signal) signal.removeEventListener("abort", abortHandler);
    cleanup();
    return thumbs;
  } catch (err) {
    if (signal) signal.removeEventListener("abort", abortHandler);
    cleanup();
    throw err;
  }
}

function waitForLoadedMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
      resolve();
      return;
    }
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Video metadata load failed"));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Video metadata load timed out"));
    }, METADATA_TIMEOUT_MS);
    function cleanup() {
      clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    }
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
  });
}

function waitForLoadedData(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2) {
      resolve();
      return;
    }
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Video data load failed"));
    };
    const timeout = setTimeout(() => {
      cleanup();
      // Don't reject — just resolve and let seek attempts handle it.
      resolve();
    }, METADATA_TIMEOUT_MS);
    function cleanup() {
      clearTimeout(timeout);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
    }
    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("error", onError);
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Seek failed"));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Seek timeout"));
    }, SEEK_TIMEOUT_MS);
    function cleanup() {
      clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    }
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    try {
      // Clamp to avoid seeking past end of media.
      const dur = Number.isFinite(video.duration) ? video.duration : time + 1;
      const clampedTime = Math.max(0, Math.min(dur - 0.01, time));
      video.currentTime = clampedTime;
    } catch {
      cleanup();
      reject(new Error("Cannot set currentTime"));
    }
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Build a frame-strip from an already-extracted set of MediaItem
 * filmstripThumbnails by interpolating into the requested slot count.
 *
 * Cheaper than re-extracting when the underlying media already has cached
 * thumbnails — we just pick the closest existing thumb for each slot.
 */
export function buildStripFromExistingThumbs(
  existing: { timestamp: number; url: string }[],
  startTime: number,
  endTime: number,
  count: number,
): { timestamp: number; url: string }[] {
  if (!existing || existing.length === 0 || count <= 0) return [];
  const safeCount = Math.max(1, Math.min(MAX_THUMBS, Math.floor(count)));
  const duration = Math.max(0.05, endTime - startTime);
  const out: { timestamp: number; url: string }[] = [];
  for (let i = 0; i < safeCount; i++) {
    const ratio = safeCount === 1 ? 0.5 : i / (safeCount - 1);
    const t = startTime + ratio * duration;
    // Pick nearest existing thumb timestamp
    let bestIdx = 0;
    let bestDelta = Infinity;
    for (let j = 0; j < existing.length; j++) {
      const d = Math.abs(existing[j].timestamp - t);
      if (d < bestDelta) {
        bestDelta = d;
        bestIdx = j;
      }
    }
    out.push({ timestamp: t, url: existing[bestIdx].url });
  }
  return out;
}
