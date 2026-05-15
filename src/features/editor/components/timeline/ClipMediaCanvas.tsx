import React, { useEffect, useMemo, useRef, useState } from "react";
import { Film } from "lucide-react";
import type { Clip, MediaItem, Track } from "@/lib/openreel-core";
import { useClipThumbnailCache } from "../../stores/clip-thumbnail-cache";
import { useClipWaveformCache } from "../../stores/clip-waveform-cache";
import {
  buildStripFromExistingThumbs,
  extractFrameStrip,
} from "../../services/thumbnail-extractor";
import {
  decodeWaveformPeaks,
  drawWaveform,
  rebinPeaks,
} from "../../services/waveform-extractor";
import { useProjectStore } from "../../stores/project-store";
import { getAudioBridge } from "../../bridges/audio-bridge";

/**
 * Renders a video clip's frame-strip thumbnails and audio waveform inside the
 * timeline clip block, plus the vertical volume-drag interaction over the
 * waveform area.
 *
 * Layout:
 *  - Video clip with audio:    top ~60% = frame strip,  bottom ~40% = waveform
 *  - Video clip, audio muted:  full height = frame strip
 *  - Video clip, no audio:     full height = frame strip (silent source)
 *  - Audio-only clip:          full height = waveform (always — the clip
 *                              would not exist on an audio track without one)
 *  - Image clip:               handled by parent (this returns null)
 *
 * Detection: we treat the source as having audio when ANY of
 *   - `metadata.channels > 0`        (the common path)
 *   - `metadata.audioTrackCount > 0` (set by ffmpeg probe for multi-track)
 *   - `waveformData.length > 0`      (already extracted upstream)
 * is true. The WaveformBand additionally tries to decode the blob on demand
 * — if that fails, the band still renders but with no bars (matches CapCut).
 *
 * Hover the waveform area → horizontal volume line appears; drag up/down to
 * adjust volume. Pointer label shows the current dB.
 */
export interface ClipMediaCanvasProps {
  clip: Clip;
  track: Track;
  mediaItem: MediaItem | undefined;
  clipWidth: number;
  clipHeight: number;
  pixelsPerSecond: number;
  /** Disable mouse interactions while the clip is being dragged. */
  isInteractingExternal?: boolean;
}

/** Convert linear volume gain (0..4) → dB. */
function linearToDb(gain: number): number {
  if (gain <= 0) return -Infinity;
  return 20 * Math.log10(gain);
}

/** Convert dB → linear volume gain (0..4). */
function dbToLinear(db: number): number {
  if (!isFinite(db)) return 0;
  return Math.pow(10, db / 20);
}

/** Map dB → fraction down the waveform area (top = +6dB, bottom = -inf). */
function dbToFraction(db: number): number {
  if (db <= -60) return 1;
  const clampedDb = Math.max(-42, Math.min(6, db));
  const frac = (6 - clampedDb) / (6 - -42) * 0.95;
  return Math.max(0, Math.min(0.95, frac));
}

export const ClipMediaCanvas: React.FC<ClipMediaCanvasProps> = ({
  clip,
  track,
  mediaItem,
  clipWidth,
  clipHeight,
  pixelsPerSecond,
  isInteractingExternal = false,
}) => {
  const isAudio = track.type === "audio";
  const isVideo = track.type === "video";

  // Has audio: rely on multiple positive signals — `channels > 0`, the
  // (optional) `audioTrackCount`, or an already-extracted `waveformData`
  // payload. mediabunny populates `channels` for most files, but a handful of
  // codecs / transmuxed inputs leave it at 0 even though the audio track is
  // present and decodable. The cache will independently confirm by trying to
  // decode the blob — if that fails, the waveform area is rendered with the
  // dark teal background but no bars (the fallback below for audio tracks).
  // For audio tracks we always show the waveform area since the clip exists
  // on an audio track by definition.
  const meta = mediaItem?.metadata as
    | { channels?: number; audioTrackCount?: number }
    | undefined;
  const channels = meta?.channels ?? 0;
  const audioTrackCount = meta?.audioTrackCount ?? 0;
  const hasWaveformPayload =
    !!mediaItem?.waveformData && mediaItem.waveformData.length > 0;
  const sourceHasAudio =
    channels > 0 || audioTrackCount > 0 || hasWaveformPayload;

  const isMuted = (clip.volume ?? 1) <= 0;
  // For audio tracks always show the waveform area (the clip would not exist
  // on an audio track otherwise). For video tracks we require some audio
  // signal so we don't draw an empty teal strip below silent video.
  const showWaveform =
    !isMuted && (isAudio || (isVideo && sourceHasAudio));
  const showThumbs = isVideo && !!mediaItem;

  // Vertical layout: when both thumbs and waveform present, split 60/40.
  const layout = useMemo(() => {
    if (showThumbs && showWaveform) {
      const thumbsH = Math.max(16, Math.floor(clipHeight * 0.6));
      return {
        thumbsHeight: thumbsH,
        waveformHeight: Math.max(0, clipHeight - thumbsH),
      };
    }
    if (showThumbs) {
      return { thumbsHeight: clipHeight, waveformHeight: 0 };
    }
    if (showWaveform) {
      return { thumbsHeight: 0, waveformHeight: clipHeight };
    }
    return { thumbsHeight: 0, waveformHeight: 0 };
  }, [showThumbs, showWaveform, clipHeight]);

  return (
    <>
      {showThumbs && (
        <FrameStrip
          clip={clip}
          mediaItem={mediaItem!}
          clipWidth={clipWidth}
          height={layout.thumbsHeight}
          pixelsPerSecond={pixelsPerSecond}
        />
      )}
      {showWaveform && (
        <WaveformBand
          clip={clip}
          mediaItem={mediaItem!}
          width={clipWidth}
          height={layout.waveformHeight}
          top={layout.thumbsHeight}
          isAudioTrack={isAudio}
          isInteractingExternal={isInteractingExternal}
        />
      )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Frame strip                                                         */
/* ------------------------------------------------------------------ */

interface FrameStripProps {
  clip: Clip;
  mediaItem: MediaItem;
  clipWidth: number;
  height: number;
  pixelsPerSecond: number;
}

const FrameStrip: React.FC<FrameStripProps> = ({
  clip,
  mediaItem,
  clipWidth,
  height,
  pixelsPerSecond,
}) => {
  const cache = useClipThumbnailCache();
  // Target frame width ~= height * (16/9) so frames look ~square-ish on a
  // typical 60px-tall clip. Cap at 60 thumbs total — beyond that the user
  // can't visually distinguish individual frames anyway and we'd be paying
  // for extraction work that produces no clarity benefit.
  const thumbsCount = Math.max(
    1,
    Math.min(
      60,
      Math.floor((clipWidth / Math.max(20, height * (16 / 9))) * (16 / 9)),
    ),
  );
  // Lower bound: at least one thumb per ~80 timeline pixels.
  const fallbackCount = Math.max(1, Math.min(60, Math.floor(clipWidth / 80)));
  const targetCount = Math.max(thumbsCount, fallbackCount);
  const zoomBucket = cache.zoomBucketFor(pixelsPerSecond);

  const entry = cache.get(clip.id, zoomBucket);
  const [tick, setTick] = useState(0); // force re-render when extraction finishes
  // Track whether this component instance has scheduled an extraction for the
  // current (clipId, zoomBucket). We use a ref so re-renders triggered by the
  // cache's `markInFlight` don't cancel the in-flight Promise we just kicked
  // off. Without this, the cancel-on-rerun pattern would race itself: effect
  // schedules → cache changes → effect cleanup sets cancelled=true → new effect
  // returns early because entry.inFlight=true → no thumbs ever land.
  const scheduledRef = useRef<{ clipId: string; zoomBucket: number } | null>(null);

  useEffect(() => {
    if (height <= 0) return;
    // If we have enough thumbs already, nothing to do.
    if (entry?.urls.length && entry.urls.length >= Math.min(targetCount, 12)) {
      return;
    }

    // Synchronous: prefer cheap re-bin from MediaItem's filmstripThumbnails
    // (already extracted at import time).
    if (
      !entry?.urls.length &&
      mediaItem.filmstripThumbnails &&
      mediaItem.filmstripThumbnails.length
    ) {
      const strip = buildStripFromExistingThumbs(
        mediaItem.filmstripThumbnails as { timestamp: number; url: string }[],
        clip.inPoint,
        clip.outPoint,
        targetCount,
      );
      cache.set(clip.id, zoomBucket, {
        urls: strip.map((s) => s.url),
        count: targetCount,
        pixelsPerSecond,
      });
      setTick((n) => n + 1);
      return;
    }

    // Don't start a new extraction if one is already in flight from this OR
    // another component (e.g. multiple clips sharing the same media). Cache
    // takes care of de-dupe.
    if (entry?.inFlight) return;

    if (!mediaItem.blob) return;

    // Mark scheduling BEFORE markInFlight to claim ownership.
    const scheduledKey = { clipId: clip.id, zoomBucket };
    scheduledRef.current = scheduledKey;

    cache.markInFlight(clip.id, zoomBucket, targetCount, pixelsPerSecond);
    const t0 = performance.now();
    extractFrameStrip(mediaItem.blob, {
      count: targetCount,
      startTime: clip.inPoint,
      endTime: clip.outPoint,
      thumbnailWidth: Math.max(60, Math.floor(height * (16 / 9))),
    })
      .then((thumbs) => {
        // If this component is no longer mounted OR the (clipId, zoomBucket)
        // doesn't match what we scheduled, the result is stale — drop it.
        const owned =
          scheduledRef.current?.clipId === scheduledKey.clipId &&
          scheduledRef.current?.zoomBucket === scheduledKey.zoomBucket;
        if (!owned) {
          for (const t of thumbs) URL.revokeObjectURL(t.url);
          return;
        }
        const dt = performance.now() - t0;
        if (typeof window !== "undefined") {
          (window as unknown as { __or_lastThumbExtractMs?: number }).__or_lastThumbExtractMs = dt;
        }
        cache.set(clip.id, zoomBucket, {
          urls: thumbs.map((t) => t.url),
          count: targetCount,
          pixelsPerSecond,
        });
        scheduledRef.current = null;
        setTick((n) => n + 1);
      })
      .catch((err) => {
        const owned =
          scheduledRef.current?.clipId === scheduledKey.clipId &&
          scheduledRef.current?.zoomBucket === scheduledKey.zoomBucket;
        if (!owned) return;
        // Log so failures surface during development.
        if (typeof console !== "undefined") {
          console.warn("[FrameStrip] extraction failed:", err);
        }
        // Mark in-flight done with empty (will fall back to gradient).
        cache.set(clip.id, zoomBucket, {
          urls: [],
          count: 0,
          pixelsPerSecond,
        });
        scheduledRef.current = null;
        setTick((n) => n + 1);
      });
  }, [
    clip.id,
    clip.inPoint,
    clip.outPoint,
    mediaItem,
    targetCount,
    zoomBucket,
    height,
    pixelsPerSecond,
    // Note: entry?.inFlight and entry?.urls.length intentionally NOT in deps.
    // Including them would re-run this effect when our own markInFlight
    // updates the cache, which races with the in-flight Promise. We rely on
    // scheduledRef + cache de-dupe inside markInFlight to prevent
    // double-scheduling.
    cache,
  ]);

  // Reset scheduled flag when the strip unmounts.
  useEffect(() => {
    return () => {
      scheduledRef.current = null;
    };
  }, []);

  // Acknowledge tick so React links the dependency to the latest entry.
  void tick;

  // Compose visible strip from whatever's available.
  const visibleUrls: string[] = useMemo(() => {
    if (entry?.urls.length) return entry.urls;
    if (mediaItem.filmstripThumbnails && mediaItem.filmstripThumbnails.length) {
      return buildStripFromExistingThumbs(
        mediaItem.filmstripThumbnails as { timestamp: number; url: string }[],
        clip.inPoint,
        clip.outPoint,
        targetCount,
      ).map((s) => s.url);
    }
    if (mediaItem.thumbnailUrl) {
      return new Array(targetCount).fill(mediaItem.thumbnailUrl);
    }
    return [];
  }, [
    entry?.urls,
    mediaItem.filmstripThumbnails,
    mediaItem.thumbnailUrl,
    clip.inPoint,
    clip.outPoint,
    targetCount,
  ]);

  if (height <= 0) return null;

  // True when we are actively extracting OR haven't fired the effect yet but
  // have a blob/filmstrip to work from. We use this to differentiate a real
  // "loading" state (yellow-tinted pulse with film icon) from a "no decode
  // possible" state (still show the film icon, but static).
  const hasUrls = visibleUrls.length > 0;
  const isLoading = !hasUrls && (entry?.inFlight ||
    !!(mediaItem.blob && !entry) ||
    !!(mediaItem.filmstripThumbnails?.length));

  return (
    <div
      className="absolute left-0 right-0 flex overflow-hidden pointer-events-none"
      style={{ top: 0, height: `${height}px` }}
      data-testid="clip-frame-strip"
    >
      {hasUrls ? (
        visibleUrls.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="flex-1 h-full bg-cover bg-center"
            style={{
              backgroundImage: `url(${url})`,
              borderRight:
                i < visibleUrls.length - 1
                  ? "1px solid rgba(0,0,0,0.18)"
                  : "none",
            }}
          />
        ))
      ) : (
        // Visible loading / no-thumbnails state — a teal-tinted backdrop with
        // a centered Film icon so the clip never looks like a plain purple
        // rectangle while thumb extraction is in flight or has failed.
        <div
          className={`w-full h-full flex items-center justify-center ${
            isLoading
              ? "bg-gradient-to-r from-[#0e3d3d]/70 via-[#0e3d3d]/40 to-[#0e3d3d]/70 animate-pulse"
              : "bg-[#0e3d3d]/55"
          }`}
          data-testid="clip-frame-strip-fallback"
        >
          <Film
            size={Math.max(12, Math.min(20, Math.floor(height * 0.4)))}
            className="text-[#F4FF00]/70"
          />
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Waveform band with vertical volume drag                             */
/* ------------------------------------------------------------------ */

interface WaveformBandProps {
  clip: Clip;
  mediaItem: MediaItem;
  width: number;
  height: number;
  top: number;
  isAudioTrack: boolean;
  isInteractingExternal?: boolean;
}

const WaveformBand: React.FC<WaveformBandProps> = ({
  clip,
  mediaItem,
  width,
  height,
  top,
  isAudioTrack,
  isInteractingExternal,
}) => {
  const cache = useClipWaveformCache();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const updateClipVolume = useProjectStore((s) => s.updateClipVolume);
  // Tracks ownership of the most recent decode so only the latest commits
  // results to the cache. Prevents the "Decoding…" indicator from getting
  // stuck when a deps-change race orphans an in-flight decode promise —
  // mirrors the same fix that's already in the FrameStrip thumbnail path.
  const waveformOwnershipRef = useRef<{ cacheId: string; binBucket: number } | null>(null);

  const binCount = Math.max(16, Math.floor(width / 3));
  const binBucket = cache.binBucketFor(binCount);
  const waveformCacheId = useMemo(
    () => `${clip.id}:${clip.inPoint.toFixed(3)}:${clip.outPoint.toFixed(3)}`,
    [clip.id, clip.inPoint, clip.outPoint],
  );
  const entry = cache.get(waveformCacheId, binBucket);
  const [, forceRender] = useState(0);

  const sourceDuration = mediaItem.metadata?.duration ?? 0;

  // Hover/drag state for volume line.
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pointerLabel, setPointerLabel] = useState<{
    x: number;
    y: number;
    db: number;
  } | null>(null);
  // Live drag volume — used to render the line at 60fps without writing to
  // the Zustand store on every pointermove (see drag handler below).
  const [localVolume, setLocalVolume] = useState<number | null>(null);

  // Generate / re-bin peaks when needed.
  //
  // Race-condition guard: we DO NOT include `entry?.inFlight` or
  // `entry?.peaks.length` in the dep list. Both can change as a side effect
  // of THIS effect (markInFlight + cache.set), which would otherwise
  // re-fire the effect mid-decode, see `inFlight: true` and bail — leaving
  // the "Decoding…" indicator stuck on screen forever once the original
  // decode promise was discarded by the previous cleanup.
  //
  // Instead we use `scheduledRef` to track ownership of the current decode
  // (mirroring the thumbnail-strip fix in this same file) and a cache
  // `clearInFlight` call from the cleanup so a later remount can re-kick.
  useEffect(() => {
    if (height <= 0) return;
    // Fresh-read the entry so we don't reason from a stale closure copy.
    const current = cache.get(waveformCacheId, binBucket);
    // Already settled at the right resolution → nothing to do.
    if (current && current.peaks.length === binBucket && !current.inFlight) return;
    // Someone else (the previous mount of THIS clip at THIS bucket) is
    // already mid-decode. Skip; the in-flight promise will commit results.
    if (current?.inFlight) return;

    if (mediaItem.waveformData && mediaItem.waveformData.length > 0) {
      // Synchronous re-bin from cached full-clip peaks.
      const peaks = rebinPeaks(
        mediaItem.waveformData,
        sourceDuration,
        clip.inPoint,
        clip.outPoint,
        binBucket,
      );
      cache.set(waveformCacheId, binBucket, peaks);
      forceRender((n) => n + 1);
      return;
    }

    if (!mediaItem.blob) return;

    // Ownership token — only the most recent call commits its result back
    // into the cache. Older promises that resolve after a deps-change race
    // are dropped silently.
    const ownership = { cacheId: waveformCacheId, binBucket };
    waveformOwnershipRef.current = ownership;
    cache.markInFlight(waveformCacheId, binBucket);

    // Safety timeout — if the decode pipeline hangs (rare codec, oversize
    // buffer, browser tab background-throttled mid-decode), release the
    // in-flight flag so the user doesn't see "Decoding…" forever. 15s is
    // generous for ~30s clips on slow hardware; faster mobile decodes
    // finish in <1s.
    const timeoutMs = 15000;
    const timeoutHandle = window.setTimeout(() => {
      if (waveformOwnershipRef.current !== ownership) return;
      cache.clearInFlight(waveformCacheId, binBucket);
      forceRender((n) => n + 1);
    }, timeoutMs);

    const t0 = performance.now();
    decodeWaveformPeaks(mediaItem.blob, binBucket)
      .then((peaks) => {
        if (waveformOwnershipRef.current !== ownership) return;
        window.clearTimeout(timeoutHandle);
        const dt = performance.now() - t0;
        if (typeof window !== "undefined") {
          (window as unknown as { __or_lastWaveformDecodeMs?: number }).__or_lastWaveformDecodeMs = dt;
        }
        cache.set(waveformCacheId, binBucket, peaks);
        forceRender((n) => n + 1);
      })
      .catch(() => {
        if (waveformOwnershipRef.current !== ownership) return;
        window.clearTimeout(timeoutHandle);
        // Failed → commit empty peaks so we don't infinitely retry, but
        // still drop the inFlight flag.
        cache.set(waveformCacheId, binBucket, new Float32Array(binBucket));
        forceRender((n) => n + 1);
      });

    return () => {
      // Effect is being torn down before our decode finished. Drop
      // ownership AND release the inFlight flag in the cache so the next
      // mount (or zoom-bucket change) can start fresh.
      if (waveformOwnershipRef.current === ownership) {
        waveformOwnershipRef.current = null;
      }
      window.clearTimeout(timeoutHandle);
      cache.clearInFlight(waveformCacheId, binBucket);
    };
  }, [
    clip.id,
    clip.inPoint,
    clip.outPoint,
    waveformCacheId,
    mediaItem,
    binBucket,
    sourceDuration,
    height,
    cache,
  ]);

  // Render to canvas whenever peaks or sizes change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || height <= 0 || width <= 0) return;
    // Match physical pixels for crispness on HiDPI displays.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const peaks = entry?.peaks ?? new Float32Array(0);
    // Re-create a logical canvas surface to feed into drawWaveform.
    const logical = document.createElement("canvas");
    logical.width = width;
    logical.height = height;
    const audioTrackTopPadding = isAudioTrack
      ? Math.min(15, Math.max(8, Math.floor(height * 0.28)))
      : 0;
    drawWaveform(logical, peaks, {
      fillStyle: isAudioTrack ? "#17BDF2" : "#20D6FF",
      bgStyle: isAudioTrack ? "rgba(8, 54, 94, 0.86)" : "rgba(5, 68, 96, 0.76)",
      barGap: 1,
      minVisiblePeak: isAudioTrack ? 0.06 : 0.08,
      amplitudeCurve: isAudioTrack ? 0.46 : 0.56,
      mode: isAudioTrack ? "positive" : "center",
      topPadding: audioTrackTopPadding,
      bottomPadding: isAudioTrack ? 3 : 1,
    });
    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(logical, 0, 0, width, height);
    }
  }, [entry?.peaks, width, height, isAudioTrack]);

  if (height <= 0) return null;

  // Current volume → fraction down the waveform area. Falls back to local
  // drag value while a drag is in flight so the line tracks the pointer
  // without going through the Zustand store every frame.
  const effectiveVolume = localVolume ?? clip.volume ?? 1;
  const volumeDb = linearToDb(effectiveVolume);
  const volumeLineFrac = dbToFraction(volumeDb);
  const volumeLineY = volumeLineFrac * height;

  // Volume-line hit target: only ~6px tall, centered on the current volume
  // position. Mousedown anywhere ELSE in the waveform area bubbles up to the
  // parent ClipComponent → drags the clip horizontally (standard NLE
  // convention). This matches CapCut / Premiere / Final Cut.
  //
  // Performance note (Bug 1 fix):
  // Previously this called `updateClipVolume(clip.id, nextLinear)` on every
  // pointermove. That writes a new project root to Zustand → the playback
  // bridge's project subscription fires → playbackController.setProject runs
  // → clearAudioBuffer/stopAudioPlayback → React re-renders the whole editor
  // tree. At 60+ moves/s the preview FPS tanked into the low-20s.
  //
  // Now the drag handler:
  //   1. Captures the new volume in a ref + RAF-batches re-renders for the
  //      visual line and dB label (max one re-render per animation frame).
  //   2. Pushes the new volume directly to the realtime audio graph via
  //      AudioBridge.setClipVolumeRealtime, bypassing the store. The audio
  //      graph's setTargetAtTime ramp makes this safe at any cadence.
  //   3. Only writes to the store ONCE, on pointerup — that single update
  //      goes through the normal subscription path and the AudioBridge sees
  //      its `lastSyncedVolumes` cache already matches → no-op.
  const onVolumeLineMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (isInteractingExternal) return;
    // Stop propagation so the clip's drag handler doesn't also engage.
    e.stopPropagation();
    e.preventDefault();
    setDragging(true);
    document.body.style.cursor = "ns-resize";

    const startY = e.clientY;
    const startVolume = clip.volume ?? 1;
    const startDb = linearToDb(startVolume);
    const audioBridge = getAudioBridge();

    // Stash latest move state and let RAF read it. Avoids ~60 state updates/s
    // and decouples the drag from React's render cycle. `latestLinearRef`
    // mirrors the most recent value applied to the audio graph so onUp can
    // commit even after RAF flushed `pendingRef.value` to null.
    const pendingRef: { value: { db: number; linear: number; cx: number; cy: number } | null } = { value: null };
    const latestLinearRef: { value: number } = { value: startVolume };
    let rafId: number | null = null;
    const flush = () => {
      rafId = null;
      const p = pendingRef.value;
      if (!p) return;
      pendingRef.value = null;
      setLocalVolume(p.linear);
      const rect = containerRef.current?.getBoundingClientRect();
      setPointerLabel({
        x: p.cx - (rect?.left ?? 0),
        y: p.cy - (rect?.top ?? 0),
        db: p.db,
      });
    };

    const onMove = (ev: MouseEvent) => {
      // Convert vertical pixel delta to dB delta. Full height ≈ 48dB range.
      const dyPx = ev.clientY - startY;
      const dbPerPx = 48 / height;
      const nextDb = Math.max(-60, Math.min(6, startDb - dyPx * dbPerPx));
      const nextLinear = nextDb <= -60 ? 0 : dbToLinear(nextDb);

      // Real-time audio: push directly to graph every move (audio rendering
      // runs off the main thread anyway; setTargetAtTime smooths it).
      audioBridge.setClipVolumeRealtime(clip.id, nextLinear);
      latestLinearRef.value = nextLinear;

      // React UI: RAF-batch to ≤ 1 update per frame.
      pendingRef.value = { db: nextDb, linear: nextLinear, cx: ev.clientX, cy: ev.clientY };
      if (rafId == null) rafId = requestAnimationFrame(flush);
    };

    const onUp = () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      // Commit the final volume to the Zustand store exactly once. The ref
      // is updated on every pointermove BEFORE the RAF flush, so even if
      // the flush happened and cleared `pendingRef.value`, we still have the
      // last drag value here.
      const finalLinear = latestLinearRef.value;
      pendingRef.value = null;
      updateClipVolume(clip.id, finalLinear);
      // Use a microtask so React picks up the store update first, then drop
      // the local override so subsequent renders read from the store again.
      Promise.resolve().then(() => setLocalVolume(null));
      setDragging(false);
      setPointerLabel(null);
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Hit target height — 8px is a comfortable target without being so big that
  // it eats into the rest of the waveform area.
  const hitHeight = 8;
  // Center the hit target on the volume line, clamping to the waveform bounds.
  const hitTop = Math.max(0, Math.min(height - hitHeight, volumeLineY - hitHeight / 2));
  const showLine = hovered || dragging;
  const lineDb = pointerLabel?.db ?? volumeDb;

  return (
    <div
      ref={containerRef}
      className="absolute left-0 right-0 overflow-hidden"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        // No cursor override — the outer band is NOT interactive. Cursor is
        // inherited from the parent clip (grab/grabbing). The volume hit
        // strip below has its own ns-resize cursor.
      }}
      data-testid="clip-waveform-band"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        if (!dragging) setPointerLabel(null);
      }}
      // NOTE: no onMouseDown here — events bubble up to the parent clip so
      // the clip drag handler engages anywhere except the thin volume line.
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ width: `${width}px`, height: `${height}px` }}
      />
      {/* "Decoding…" hint while peaks are being extracted. Without this the
          band shows up as a flat teal block during decode, which on slower
          machines reads as "broken waveform". Hidden once peaks land. */}
      {(entry?.inFlight || (!entry && !!mediaItem.blob)) && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          data-testid="clip-waveform-loading"
        >
          <div className="text-[9px] font-medium text-[#20D6FF]/85 px-1.5 py-0.5 rounded bg-black/40 backdrop-blur-sm">
            Decoding…
          </div>
        </div>
      )}
      {/* Volume line visual (shown on hover or drag) — purely decorative.
          Pointer events disabled so it doesn't block the hit strip below. */}
      {showLine && (
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: `${volumeLineY}px`,
            height: "1px",
            background: dragging
              ? "#20D6FF"
              : "rgba(32, 214, 255, 0.85)",
            boxShadow: dragging
              ? "0 0 6px rgba(32, 214, 255, 0.9), 0 0 2px rgba(0,0,0,0.6)"
              : "0 0 3px rgba(0,0,0,0.6)",
          }}
          data-testid="clip-volume-line"
        />
      )}
      {/* Volume line hit strip — thin draggable area that catches mousedown
          for volume adjustment. Wider than the visible line (8px) for easier
          grabbing. Cursor changes to ns-resize on hover. */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: `${hitTop}px`,
          height: `${hitHeight}px`,
          cursor: "ns-resize",
          // Stay above the canvas but below the label.
          zIndex: 1,
        }}
        data-testid="clip-volume-line-hit"
        onMouseDown={onVolumeLineMouseDown}
      />
      {/* Handle indicator at midpoint — visible during hover/drag. */}
      {showLine && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: `${volumeLineY - 4}px`,
            left: "50%",
            width: "10px",
            height: "10px",
            marginLeft: "-5px",
            borderRadius: "50%",
            background: "#20D6FF",
            border: "1px solid rgba(0,0,0,0.5)",
            boxShadow: dragging
              ? "0 0 6px rgba(32, 214, 255, 0.9), 0 1px 3px rgba(0,0,0,0.4)"
              : "0 1px 3px rgba(0,0,0,0.4)",
            opacity: dragging ? 1 : 0.9,
          }}
        />
      )}
      {/* dB label — shown on hover (with current vol) and while dragging
          (follows the cursor). */}
      {showLine && (
        <div
          className="absolute pointer-events-none px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
          style={{
            left:
              dragging && pointerLabel
                ? `${Math.max(4, Math.min(width - 60, pointerLabel.x + 8))}px`
                : `${Math.max(4, Math.min(width - 60, width / 2 + 8))}px`,
            top:
              dragging && pointerLabel
                ? `${Math.max(2, Math.min(height - 18, pointerLabel.y - 16))}px`
                : `${Math.max(2, Math.min(height - 18, volumeLineY - 16))}px`,
            background: "#0e3d3d",
            color: "#20D6FF",
            border: "1px solid #20D6FF",
            whiteSpace: "nowrap",
            zIndex: 2,
          }}
          data-testid="clip-volume-label"
        >
          {lineDb <= -60 ? "Mute" : `${lineDb.toFixed(1)} dB`}
        </div>
      )}
    </div>
  );
};

export default ClipMediaCanvas;
