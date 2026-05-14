/**
 * Shared video frame decoder pool — keyed by mediaId.
 *
 * Solves the multi-track preview perf bug where dropping the same mp4 onto N
 * tracks produced N parallel `CanvasSink` instances each seeking + decoding the
 * same frame. With this pool, there is exactly one `CanvasSink` per unique
 * mediaId, regardless of how many clips reference it. All clips that share a
 * media file share the underlying decoder.
 *
 * In addition, the pool exposes a per-render frame cache. Inside a single
 * composite tick, multiple `getFrame(mediaId, time)` calls at the same
 * rounded timestamp resolve from cache instead of re-decoding. The cache is
 * cleared at the end of each composite tick by the caller.
 *
 * Standard browser APIs only (WebCodecs via MediaBunny + Canvas). No
 * competitor-specific compositor design.
 */
import type {
  InputVideoTrack,
  CanvasSink as CanvasSinkType,
} from "mediabunny";

type MediaBunnyInput = {
  getPrimaryVideoTrack(): Promise<InputVideoTrack | null>;
  [Symbol.dispose]?: () => void;
};

interface PooledDecoder {
  /** The MediaBunny Input. Disposed when the entry is evicted. */
  input: MediaBunnyInput;
  /** Lazily created `CanvasSink`; one per (mediaId, width, height). */
  sink: CanvasSinkType;
  width: number;
  height: number;
  /** How many active clips reference this mediaId — for refcounted eviction. */
  refCount: number;
  /** Last access timestamp (for LRU eviction if refCount drops to 0). */
  lastUsed: number;
  /**
   * The most recently decoded frame for this media. When the next
   * `getFrame(time)` lands inside the same frame bucket as this, we can
   * return the cached canvas without going through MediaBunny at all.
   * This is what gives multi-track same-media its 1 decode per composite
   * tick (the second and third clips' calls reuse this).
   */
  lastFrame: PooledFrame | null;
  /**
   * Timestamp of the last actual decode. We use this to suppress
   * re-decodes when consecutive composite ticks land in the same source
   * frame (e.g. 60Hz composite over a 30Hz video).
   */
  lastFrameSourceTime: number;
}

/**
 * The frame returned by the pool. Callers must NOT close `canvas` —
 * MediaBunny owns it via the sink's internal canvas pool.
 */
export interface PooledFrame {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** The presentation timestamp of the underlying frame, in seconds. */
  timestamp: number;
  width: number;
  height: number;
  mediaId: string;
}

/** Per-composite frame cache. Maps `${mediaId}:${roundedTime}` → frame. */
type PerTickCacheKey = string;

interface MediaBunnyModule {
  Input: new (opts: { source: unknown; formats: unknown }) => MediaBunnyInput;
  ALL_FORMATS: unknown;
  BlobSource: new (blob: Blob) => unknown;
  CanvasSink: new (
    track: InputVideoTrack,
    opts: { width: number; height: number; fit: string; poolSize?: number },
  ) => CanvasSinkType;
}

export class SharedDecoderPool {
  private pool: Map<string, PooledDecoder> = new Map();
  private frameCache: Map<PerTickCacheKey, PooledFrame> = new Map();
  /**
   * In-flight promises for `getFrame` calls. Multiple concurrent callers for
   * the same `(mediaId, bucket)` share one underlying decode rather than
   * each kicking off a separate `sink.getCanvas`. This is the inner loop of
   * the "3 tracks share 1 mp4" perf fix — without coalescing, the 2nd and
   * 3rd callers fire decodes before the 1st has populated the cache.
   */
  private inflight: Map<PerTickCacheKey, Promise<PooledFrame | null>> =
    new Map();
  // (Previously held a per-mediaId decode chain to serialize getCanvas
  // calls. Removed because empirically MediaBunny handles concurrent
  // getCanvas correctly and serialization was capping our FPS.)
  /** Frame quantization for the cache key. 30Hz buckets dedupe close lookups. */
  private cacheGranularityHz = 30;
  private mediabunny: MediaBunnyModule | null = null;

  private async ensureMediaBunny(): Promise<MediaBunnyModule> {
    if (!this.mediabunny) {
      const mod = (await import("mediabunny")) as unknown as MediaBunnyModule;
      this.mediabunny = mod;
    }
    return this.mediabunny;
  }

  /**
   * Configure the cache granularity for the per-tick frame cache. Defaults to
   * 30Hz — good for 30fps preview. For higher-fps preview you may want 60.
   */
  setCacheGranularity(hz: number): void {
    this.cacheGranularityHz = Math.max(1, Math.min(120, hz));
  }

  /**
   * Get or create a decoder for the given mediaId at the requested resolution.
   * Increments the refcount — caller must call `release(mediaId)` when done.
   */
  async acquire(
    mediaId: string,
    blob: Blob,
    width: number,
    height: number,
  ): Promise<PooledDecoder | null> {
    let entry = this.pool.get(mediaId);

    if (entry) {
      // If the requested size changed we still reuse the input + track but
      // we need a new sink. In practice this only happens if the project
      // settings.width/height changed mid-playback.
      if (entry.width !== width || entry.height !== height) {
        try {
          const mb = await this.ensureMediaBunny();
          const track = await entry.input.getPrimaryVideoTrack();
          if (track) {
            entry.sink = new mb.CanvasSink(track, {
              width,
              height,
              fit: "contain",
              poolSize: 4,
            });
            entry.width = width;
            entry.height = height;
          }
        } catch (err) {
          console.warn(
            "[SharedDecoderPool] Failed to recreate sink at new size:",
            err,
          );
        }
      }
      entry.refCount += 1;
      entry.lastUsed = Date.now();
      return entry;
    }

    try {
      const mb = await this.ensureMediaBunny();
      const input = new mb.Input({
        source: new mb.BlobSource(blob),
        formats: mb.ALL_FORMATS,
      });

      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) {
        input[Symbol.dispose]?.();
        return null;
      }

      const canDecode = await (
        videoTrack as InputVideoTrack & { canDecode(): Promise<boolean> }
      ).canDecode();
      if (!canDecode) {
        input[Symbol.dispose]?.();
        return null;
      }

      const sink = new mb.CanvasSink(videoTrack, {
        width,
        height,
        fit: "contain",
        // Larger pool so the sink can decode a few frames ahead. The
        // ring buffer is per-mediaId (one decoder), so cost is constant
        // regardless of how many clips reference the media. Empirically
        // 4 gives 2-3x the FPS of poolSize=2 because the decoder isn't
        // stalled between getCanvas calls.
        poolSize: 4,
      });

      entry = {
        input,
        sink,
        width,
        height,
        refCount: 1,
        lastUsed: Date.now(),
        lastFrame: null,
        lastFrameSourceTime: -1,
      };
      this.pool.set(mediaId, entry);
      return entry;
    } catch (err) {
      console.error("[SharedDecoderPool] Failed to acquire decoder:", err);
      return null;
    }
  }

  /**
   * Decrement the refcount. When refcount hits zero the decoder is kept
   * alive for a brief LRU window — eviction happens via `evictUnused()`
   * after playback stops.
   */
  release(mediaId: string): void {
    const entry = this.pool.get(mediaId);
    if (!entry) return;
    entry.refCount = Math.max(0, entry.refCount - 1);
    entry.lastUsed = Date.now();
  }

  /**
   * Returns the decoded frame for `(mediaId, time)`. Uses the per-tick
   * cache so repeated calls within one composite tick for the same media at
   * the same time return without re-decoding.
   *
   * Concurrency strategy:
   *   1. If a frame for `(mediaId, bucket)` is already in cache → return it.
   *   2. If a decode for the same key is already in flight → await that.
   *   3. Otherwise, chain a new decode onto the per-mediaId decode chain
   *      (CanvasSink is not concurrency-safe).
   */
  getFrame(
    mediaId: string,
    time: number,
  ): Promise<PooledFrame | null> {
    const entry = this.pool.get(mediaId);
    if (!entry) return Promise.resolve(null);

    const bucket = Math.floor(time * this.cacheGranularityHz);
    const key = `${mediaId}:${bucket}`;

    // Fast path: per-decoder "last frame" cache. When consecutive ticks
    // land in the same source frame (common at 30fps source with 60Hz
    // composite RAF) we skip the whole bucket lookup. Also covers the
    // "3 clips same media at same time" case because all 3 ticks within
    // one composite step land in the same bucket as the prior tick.
    if (
      entry.lastFrame &&
      Math.abs(entry.lastFrameSourceTime - time) <
        1 / this.cacheGranularityHz / 2
    ) {
      recordHit();
      return Promise.resolve(entry.lastFrame);
    }

    const cached = this.frameCache.get(key);
    if (cached) {
      recordHit();
      // Promote to "last frame" so future lookups hit the fast path.
      entry.lastFrame = cached;
      entry.lastFrameSourceTime = time;
      return Promise.resolve(cached);
    }

    const existingInflight = this.inflight.get(key);
    if (existingInflight) {
      recordHit();
      return existingInflight;
    }

    // Kick off the decode. The in-flight map dedupes concurrent calls for
    // the same `(mediaId, bucket)` — that's the inner-loop optimization
    // for "3 clips at the same time" since all 3 await the same promise.
    //
    // We deliberately do NOT chain different timestamps onto a per-mediaId
    // queue. Empirically MediaBunny's CanvasSink handles concurrent
    // `getCanvas(t1)` and `getCanvas(t2)` correctly on the same sink, and
    // serializing was capping our throughput at one decode per RAF tick.
    const decodePromise = (async () => {
      try {
        const sink = entry.sink as CanvasSinkType & {
          getCanvas: (t: number) => Promise<{
            canvas: HTMLCanvasElement | OffscreenCanvas;
            timestamp: number;
            duration: number;
          } | null>;
        };
        recordDecode();
        const result = await sink.getCanvas(time);
        if (!result?.canvas) return null;

        const frame: PooledFrame = {
          canvas: result.canvas,
          timestamp: result.timestamp,
          width: entry.width,
          height: entry.height,
          mediaId,
        };
        this.frameCache.set(key, frame);
        entry.lastFrame = frame;
        entry.lastFrameSourceTime = time;
        return frame;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("disposed")) return null;
        console.warn(
          `[SharedDecoderPool] getFrame failed for ${mediaId} @${time}:`,
          err,
        );
        return null;
      }
    })().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, decodePromise);
    return decodePromise;
  }

  /**
   * Bounds for the LRU frame cache. Bigger than poolSize on the sink so we
   * keep room for both this tick's frames and one prefetched lookahead per
   * unique mediaId. With poolSize=4 on the sink and 3 mediaIds, an upper
   * bound of 16 entries covers the worst case (4 ahead + this tick).
   */
  private maxCacheEntries = 16;

  /**
   * Trim the per-tick frame cache. Called at the end of each composite tick.
   * We don't fully clear it any more — prefetched frames for the NEXT tick
   * must survive between ticks for the prefetch to be useful. Instead we
   * LRU-evict older entries above `maxCacheEntries`. The underlying canvas
   * pool on the sink is the real ring buffer that bounds VRAM.
   */
  endTick(): void {
    if (this.frameCache.size <= this.maxCacheEntries) return;
    // Map keeps insertion order — drop the oldest until we're under the cap.
    const toDrop = this.frameCache.size - this.maxCacheEntries;
    let i = 0;
    for (const key of this.frameCache.keys()) {
      if (i++ >= toDrop) break;
      this.frameCache.delete(key);
    }
  }


  /**
   * Drop decoders whose refcount is 0. Call after playback stops or when
   * the project changes.
   */
  evictUnused(): void {
    for (const [mediaId, entry] of this.pool) {
      if (entry.refCount === 0) {
        entry.input[Symbol.dispose]?.();
        this.pool.delete(mediaId);
      }
    }
  }

  /**
   * Hard reset — disposes every decoder regardless of refcount. Use only
   * when tearing down the editor / page unload.
   */
  disposeAll(): void {
    for (const [, entry] of this.pool) {
      entry.input[Symbol.dispose]?.();
    }
    this.pool.clear();
    this.frameCache.clear();
    this.inflight.clear();
  }

  /** Stats for diagnostics — read by the perf harness. */
  getStats(): {
    decoderCount: number;
    cachedFrames: number;
    refCounts: Array<{ mediaId: string; refCount: number }>;
  } {
    return {
      decoderCount: this.pool.size,
      cachedFrames: this.frameCache.size,
      refCounts: Array.from(this.pool.entries()).map(([mediaId, e]) => ({
        mediaId,
        refCount: e.refCount,
      })),
    };
  }
}

let instance: SharedDecoderPool | null = null;

/** Process-wide singleton. */
export function getSharedDecoderPool(): SharedDecoderPool {
  if (!instance) {
    instance = new SharedDecoderPool();
  }
  return instance;
}

/**
 * Per-frame decode counter for the perf harness. Bumped on every actual
 * `sink.getCanvas` call (i.e. cache miss). The harness divides by frames
 * elapsed to assert that 3-track same-media playback hits the decoder
 * roughly once per frame, not 3 times.
 */
let decodeCounter = 0;
let hitCounter = 0;

export function recordDecode(): void {
  decodeCounter += 1;
}

export function recordHit(): void {
  hitCounter += 1;
}

export function getDecodeCount(): number {
  return decodeCounter;
}

export function getHitCount(): number {
  return hitCounter;
}

export function resetDecodeCount(): void {
  decodeCounter = 0;
  hitCounter = 0;
}

// Expose stats to window for the Playwright perf harness. In production
// this still costs nothing — no MCP / network surface.
if (typeof window !== "undefined") {
  (window as unknown as {
    __or_perf?: {
      getDecodeCount: () => number;
      getHitCount: () => number;
      resetDecodeCount: () => void;
      getPoolStats: () => ReturnType<SharedDecoderPool["getStats"]>;
    };
  }).__or_perf = {
    getDecodeCount,
    getHitCount,
    resetDecodeCount,
    getPoolStats: () => getSharedDecoderPool().getStats(),
  };
}
