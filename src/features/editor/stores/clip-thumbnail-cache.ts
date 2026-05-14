import { create } from "zustand";

/**
 * Per-clip frame-strip thumbnail cache for the NLE timeline.
 *
 * Keys: `${clipId}:${zoomBucket}` where zoomBucket is a coarse pixels-per-second
 * grouping so we don't re-extract for tiny zoom deltas. We do re-extract when
 * zoom changes by ~2x (different bucket).
 *
 * Values: array of image URLs (object URLs or data URLs) — one per frame
 * position along the clip's visible duration.
 *
 * Generation is initiated by the timeline ClipComponent (lazy / on-demand)
 * and writes the result back here when complete.
 */
export interface ClipThumbnailEntry {
  /** Image URLs (object URL preferred for memory). */
  urls: string[];
  /** Number of thumbs requested when this entry was generated. */
  count: number;
  /** Pixels-per-second the entry was generated at (for diagnostics). */
  pixelsPerSecond: number;
  /** Timestamp of last access — drives LRU. */
  lastAccessed: number;
  /** True while async extraction is still running. */
  inFlight: boolean;
}

interface ClipThumbnailCacheState {
  /** Entries keyed by `${clipId}:${zoomBucket}`. */
  entries: Map<string, ClipThumbnailEntry>;
  /** Hard cap on cached entries — drops least-recently-used over the limit. */
  readonly maxEntries: number;
  /** Look up cached thumbs for `(clipId, zoomBucket)`. Touches LRU. */
  get: (clipId: string, zoomBucket: number) => ClipThumbnailEntry | undefined;
  /** Mark an entry as currently being generated. */
  markInFlight: (
    clipId: string,
    zoomBucket: number,
    count: number,
    pixelsPerSecond: number,
  ) => void;
  /** Store completed thumbnails. */
  set: (
    clipId: string,
    zoomBucket: number,
    entry: Omit<ClipThumbnailEntry, "lastAccessed" | "inFlight">,
  ) => void;
  /** Drop every entry for a given clip (all zoom buckets). */
  clearClip: (clipId: string) => void;
  /** Wipe the entire cache. */
  clearAll: () => void;
  /** Compute the zoom bucket for a `pixelsPerSecond` value. */
  zoomBucketFor: (pixelsPerSecond: number) => number;
}

const MAX_ENTRIES = 80;

/**
 * Bucket zoom levels so we don't re-extract for every tiny zoom delta.
 * Buckets: <30px/s, 30-60, 60-120, 120-240, 240-500, >500.
 * If user zooms across a bucket boundary we re-extract with more frames.
 */
function bucketize(pixelsPerSecond: number): number {
  if (pixelsPerSecond < 30) return 0;
  if (pixelsPerSecond < 60) return 1;
  if (pixelsPerSecond < 120) return 2;
  if (pixelsPerSecond < 240) return 3;
  if (pixelsPerSecond < 500) return 4;
  return 5;
}

export const useClipThumbnailCache = create<ClipThumbnailCacheState>(
  (set, get) => ({
    entries: new Map(),
    maxEntries: MAX_ENTRIES,
    zoomBucketFor: bucketize,
    get: (clipId, zoomBucket) => {
      const key = `${clipId}:${zoomBucket}`;
      const entry = get().entries.get(key);
      if (entry) {
        entry.lastAccessed = Date.now();
      }
      return entry;
    },
    markInFlight: (clipId, zoomBucket, count, pixelsPerSecond) => {
      set((state) => {
        const key = `${clipId}:${zoomBucket}`;
        const existing = state.entries.get(key);
        if (existing?.inFlight) return state;
        const next = new Map(state.entries);
        next.set(key, {
          urls: existing?.urls ?? [],
          count,
          pixelsPerSecond,
          lastAccessed: Date.now(),
          inFlight: true,
        });
        return { entries: next };
      });
    },
    set: (clipId, zoomBucket, entry) => {
      set((state) => {
        const key = `${clipId}:${zoomBucket}`;
        const next = new Map(state.entries);
        next.set(key, {
          ...entry,
          lastAccessed: Date.now(),
          inFlight: false,
        });
        // LRU eviction
        if (next.size > state.maxEntries) {
          const sorted = Array.from(next.entries()).sort(
            (a, b) => a[1].lastAccessed - b[1].lastAccessed,
          );
          const overflow = next.size - state.maxEntries;
          for (let i = 0; i < overflow; i++) {
            const [oldKey, oldEntry] = sorted[i];
            // Revoke object URLs to free memory.
            for (const url of oldEntry.urls) {
              if (url.startsWith("blob:")) {
                try {
                  URL.revokeObjectURL(url);
                } catch {
                  /* ignore */
                }
              }
            }
            next.delete(oldKey);
          }
        }
        return { entries: next };
      });
    },
    clearClip: (clipId) => {
      set((state) => {
        const next = new Map(state.entries);
        for (const [key, entry] of next.entries()) {
          if (key.startsWith(`${clipId}:`)) {
            for (const url of entry.urls) {
              if (url.startsWith("blob:")) {
                try {
                  URL.revokeObjectURL(url);
                } catch {
                  /* ignore */
                }
              }
            }
            next.delete(key);
          }
        }
        return { entries: next };
      });
    },
    clearAll: () => {
      set((state) => {
        for (const entry of state.entries.values()) {
          for (const url of entry.urls) {
            if (url.startsWith("blob:")) {
              try {
                URL.revokeObjectURL(url);
              } catch {
                /* ignore */
              }
            }
          }
        }
        return { entries: new Map() };
      });
    },
  }),
);
