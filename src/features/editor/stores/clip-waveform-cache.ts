import { create } from "zustand";

/**
 * Per-clip waveform peaks cache for the NLE timeline.
 *
 * Stores normalized [0..1] peak values, one bar per ~2px of rendered clip
 * width. Re-uses the underlying full-clip peaks from `MediaItem.waveformData`
 * but re-bins them per-clip so we can respect `inPoint`/`outPoint` trims and
 * the current zoom level.
 *
 * Keys: `${clipId}:${binCountBucket}` — binCount is bucketed to 64-step
 * increments so we don't re-derive for every pixel of zoom drift.
 */
export interface ClipWaveformEntry {
  /** Normalized peaks in 0..1 range, length === binCount. */
  peaks: Float32Array;
  /** Bin count requested for this entry. */
  binCount: number;
  /** Last accessed timestamp for LRU. */
  lastAccessed: number;
  /** True if still being computed asynchronously. */
  inFlight: boolean;
}

interface ClipWaveformCacheState {
  entries: Map<string, ClipWaveformEntry>;
  readonly maxEntries: number;
  get: (clipId: string, binBucket: number) => ClipWaveformEntry | undefined;
  markInFlight: (clipId: string, binBucket: number) => void;
  set: (clipId: string, binBucket: number, peaks: Float32Array) => void;
  /**
   * Reset the `inFlight` flag on an entry without committing peaks. Use this
   * when an in-progress decode was cancelled (e.g. the consuming effect's
   * deps changed) so a later attempt can re-kick the decode. Without this,
   * the `inFlight: true` state was sticky and "Decoding…" stayed forever
   * after the first cancellation.
   */
  clearInFlight: (clipId: string, binBucket: number) => void;
  clearClip: (clipId: string) => void;
  clearAll: () => void;
  /** Round bin count to a bucket so we don't re-bin for trivial zoom deltas. */
  binBucketFor: (binCount: number) => number;
}

const MAX_ENTRIES = 200;

function bucketize(binCount: number): number {
  // Round up to nearest 64
  return Math.max(64, Math.ceil(binCount / 64) * 64);
}

export const useClipWaveformCache = create<ClipWaveformCacheState>(
  (set, get) => ({
    entries: new Map(),
    maxEntries: MAX_ENTRIES,
    binBucketFor: bucketize,
    get: (clipId, binBucket) => {
      const key = `${clipId}:${binBucket}`;
      const entry = get().entries.get(key);
      if (entry) {
        entry.lastAccessed = Date.now();
      }
      return entry;
    },
    markInFlight: (clipId, binBucket) => {
      set((state) => {
        const key = `${clipId}:${binBucket}`;
        const existing = state.entries.get(key);
        if (existing?.inFlight) return state;
        const next = new Map(state.entries);
        next.set(key, {
          peaks: existing?.peaks ?? new Float32Array(0),
          binCount: binBucket,
          lastAccessed: Date.now(),
          inFlight: true,
        });
        return { entries: next };
      });
    },
    set: (clipId, binBucket, peaks) => {
      set((state) => {
        const key = `${clipId}:${binBucket}`;
        const next = new Map(state.entries);
        next.set(key, {
          peaks,
          binCount: binBucket,
          lastAccessed: Date.now(),
          inFlight: false,
        });
        if (next.size > state.maxEntries) {
          const sorted = Array.from(next.entries()).sort(
            (a, b) => a[1].lastAccessed - b[1].lastAccessed,
          );
          const overflow = next.size - state.maxEntries;
          for (let i = 0; i < overflow; i++) {
            next.delete(sorted[i][0]);
          }
        }
        return { entries: next };
      });
    },
    clearInFlight: (clipId, binBucket) => {
      set((state) => {
        const key = `${clipId}:${binBucket}`;
        const existing = state.entries.get(key);
        // Only touch entries we actually own. If peaks are already committed
        // (inFlight === false) leave them alone — those are the "settled"
        // results we want to keep around for LRU.
        if (!existing || !existing.inFlight) return state;
        const next = new Map(state.entries);
        next.set(key, { ...existing, inFlight: false });
        return { entries: next };
      });
    },
    clearClip: (clipId) => {
      set((state) => {
        const next = new Map(state.entries);
        for (const key of next.keys()) {
          if (key.startsWith(`${clipId}:`)) {
            next.delete(key);
          }
        }
        return { entries: next };
      });
    },
    clearAll: () => {
      set({ entries: new Map() });
    },
  }),
);
