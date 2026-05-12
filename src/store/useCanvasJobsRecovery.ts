/**
 * Canvas-level batched fetch of completed `workspace_generation_jobs`.
 *
 * Before this store, each WorkspaceToolNode fired its own
 * `select * from workspace_generation_jobs` on mount to recover any
 * orphaned completions. A canvas with N tool nodes = N round-trips
 * + N reads of the same RLS-checked table. On large canvases this
 * stalled paint and hammered PostgREST.
 *
 * Now: WorkspaceCanvas calls `loadForCanvas(canvasId, workspaceId)`
 * once per canvas open. The result is grouped client-side into the
 * newest 5 completed jobs per `node_id` (matching the per-node sweep's
 * old limit). Each WorkspaceToolNode reads its own slice from the
 * store via `useCanvasRecoveryJobsForNode(nodeId)`.
 *
 * Top-N-per-group on PostgREST: not natively supported. Instead we
 * cap the canvas-wide fetch at `CANVAS_FETCH_LIMIT` newest rows.
 * Trade-off vs the old per-node sweep: in a heavily-shared canvas
 * (e.g., a 30-student class running 20+ generations each), one busy
 * node could occupy the entire window and starve siblings of recovery
 * rows. Recovery is a backup path (realtime delivers the primary
 * stream of completions), so missed rows for a quiet sibling are
 * eventually-consistent rather than data-lost. If we ever see this
 * starvation in practice, switch to a Postgres RPC using
 * `DISTINCT ON (node_id) ORDER BY node_id, created_at DESC`.
 */

import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

const CANVAS_FETCH_LIMIT = 500;
const PER_NODE_LIMIT = 5;
const EMPTY_MAP: ReadonlyMap<string, ReadonlyArray<RecoveryJob>> = new Map();

export interface RecoveryJob {
  id: string;
  node_id: string;
  created_at: string;
  result: {
    type?: "image" | "video" | "text" | "audio";
    url?: string;
    text?: string;
    prompt_used?: string;
    prompt_source?: string;
    provider_meta?: { model_url?: string };
  } | null;
}

interface State {
  /** Newest-first list of recovery jobs per node_id, for the
   *  currently-loaded canvas only. Empty when no canvas is loaded. */
  byNodeId: ReadonlyMap<string, ReadonlyArray<RecoveryJob>>;
  loadedCanvasId: string | null;
  loadingFor: string | null;
  /** Load (or no-op if already loaded for this canvas). Safe to call
   *  from multiple effects — concurrent calls dedupe via `loadingFor`. */
  loadForCanvas: (canvasId: string, workspaceId: string) => Promise<void>;
  /** Drop cached results (used when a canvas is deleted or the user
   *  signs out). The next `loadForCanvas` re-fetches. */
  reset: () => void;
}

export const useCanvasJobsRecovery = create<State>((set, get) => ({
  byNodeId: new Map(),
  loadedCanvasId: null,
  loadingFor: null,

  loadForCanvas: async (canvasId, workspaceId) => {
    if (!canvasId || !workspaceId) return;
    const s = get();
    if (s.loadedCanvasId === canvasId) return;
    if (s.loadingFor === canvasId) return;

    // Clear stale data from the previous canvas so consumers on the
    // new canvas don't briefly see the OLD canvas's slices while
    // this fetch is in flight. Without this, useCanvasRecoveryJobsForNode
    // returns A's jobs to B's nodes during the switch window because
    // `loadedCanvasId` is still A.
    set({ byNodeId: EMPTY_MAP, loadedCanvasId: null, loadingFor: canvasId });
    const { data, error } = await supabase
      .from("workspace_generation_jobs")
      .select("id, node_id, created_at, result")
      .eq("canvas_id", canvasId)
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(CANVAS_FETCH_LIMIT);

    // Another loadForCanvas (different canvas) raced ahead — drop
    // our results so we don't clobber the newer canvas's data.
    if (get().loadingFor !== canvasId) return;

    if (error || !Array.isArray(data)) {
      // Don't set loadedCanvasId — let a later canvas switch retry.
      // Log so a silent failure doesn't make orphan recovery a
      // no-op without anyone noticing.
      if (error) console.warn("[useCanvasJobsRecovery] load failed:", error.message);
      set({ loadingFor: null });
      return;
    }

    const grouped = new Map<string, RecoveryJob[]>();
    for (const row of data as RecoveryJob[]) {
      const arr = grouped.get(row.node_id) ?? [];
      if (arr.length < PER_NODE_LIMIT) arr.push(row);
      grouped.set(row.node_id, arr);
    }
    set({ byNodeId: grouped, loadedCanvasId: canvasId, loadingFor: null });
  },

  reset: () => set({ byNodeId: new Map(), loadedCanvasId: null, loadingFor: null }),
}));

const EMPTY_JOBS: ReadonlyArray<RecoveryJob> = Object.freeze([]);

/** Hook: subscribe to recovery jobs for a single node. Returns
 *  `null` until the canvas's batch has loaded; the shared
 *  `EMPTY_JOBS` constant when the canvas is loaded but this node had
 *  no completed jobs. `null` lets the caller distinguish "haven't
 *  loaded yet" (do nothing) from "loaded, no orphans" (skip
 *  recovery). The returned array is reference-stable across renders,
 *  so callers can put it in a useEffect dep without spinning. */
export function useCanvasRecoveryJobsForNode(
  nodeId: string,
): ReadonlyArray<RecoveryJob> | null {
  return useCanvasJobsRecovery((s) =>
    s.loadedCanvasId === null ? null : (s.byNodeId.get(nodeId) ?? EMPTY_JOBS),
  );
}
