/**
 * canvasPersistence — server-side autosave for the workspace canvas.
 *
 * Replaces the previous "localStorage only" persist that occasionally
 * lost work when the browser quota was hit or when the tab was closed
 * mid-write. The new flow:
 *
 *   1. On canvas open → fetch `workspace_canvases` row by id (RLS
 *      scoped to auth.uid). If found, REPLACE the local cached graph.
 *   2. On every store change → debounced upsert back to Supabase.
 *   3. On `beforeunload` / page hide → fire a final fetch with the
 *      `keepalive` flag so the in-flight save survives the tab close.
 *
 * Local Zustand persist (workspaces[] meta + lightweight cache) stays
 * around as offline fallback — guests without an account get
 * localStorage-only behaviour.
 *
 * Migration note: requires the `workspace_canvases` table created by
 * supabase/migrations/20260428120000_workspace_canvases.sql. If the
 * table doesn't exist yet, the helpers below silently no-op (no
 * crash); apply the migration to flip on autosave.
 */

import { supabase } from "@/integrations/supabase/client";
import type { CanvasGraph } from "@/store/useWorkspaceStore";

interface ServerCanvasRow {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  nodes: unknown;
  edges: unknown;
  viewport: unknown;
  created_at: string;
  updated_at: string;
}

/** Fetch a canvas by id for the current user. Returns null if not
 *  found, the table doesn't exist yet, or the user isn't allowed
 *  by RLS — every "no data available" branch is the same to the
 *  caller (load nothing, fall back to local cache). */
export async function loadCanvasFromServer(
  canvasId: string,
): Promise<CanvasGraph | null> {
  try {
    const { data, error } = await supabase
      .from("workspace_canvases")
      .select(
        "id, user_id, workspace_id, name, nodes, edges, viewport, created_at, updated_at",
      )
      .eq("id", canvasId)
      .maybeSingle();

    if (error) {
      // Table missing — surface ONCE in the console so the dev knows
      // to apply the migration, but don't bubble up to the UI.
      if (isMissingTableError(error)) {
        warnOnceAboutMissingTable();
        return null;
      }
      console.warn("[canvasPersistence] load failed:", error.message);
      return null;
    }
    if (!data) return null;

    const row = data as ServerCanvasRow;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      nodes: Array.isArray(row.nodes) ? (row.nodes as CanvasGraph["nodes"]) : [],
      edges: Array.isArray(row.edges) ? (row.edges as CanvasGraph["edges"]) : [],
      viewport: row.viewport as CanvasGraph["viewport"],
      updatedAt: new Date(row.updated_at).getTime(),
    };
  } catch (err) {
    console.warn("[canvasPersistence] load threw:", err);
    return null;
  }
}

/** Upsert a canvas snapshot. The `userId` MUST be the signed-in
 *  user — RLS rejects writes with mismatched user_id. Throws on
 *  network/permission errors so the caller can surface a save
 *  state to the user; silently no-ops when the table is missing. */
export async function saveCanvasToServer(
  graph: CanvasGraph,
  userId: string,
): Promise<{ ok: boolean; tableMissing?: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("workspace_canvases").upsert(
      {
        id: graph.id,
        user_id: userId,
        workspace_id: graph.workspaceId,
        name: graph.name,
        nodes: graph.nodes,
        edges: graph.edges,
        viewport: graph.viewport ?? null,
      },
      { onConflict: "id" },
    );
    if (error) {
      if (isMissingTableError(error)) {
        warnOnceAboutMissingTable();
        return { ok: false, tableMissing: true };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Last-ditch save fired from `beforeunload` / `pagehide`. Uses
 *  the global `fetch` with `keepalive: true` so the request keeps
 *  going even after the tab closes — `supabase.functions.invoke`
 *  doesn't currently expose keepalive, so we hit the REST URL
 *  directly with the user's JWT.
 *
 *  Fire-and-forget: we can't await anything during unload. */
export function flushSaveOnUnload(graph: CanvasGraph, userId: string): void {
  try {
    const url = (import.meta.env.VITE_SUPABASE_URL ?? "") +
      "/rest/v1/workspace_canvases?on_conflict=id";
    const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
    // Pull the JWT from the supabase client's session if available.
    const session = supabase.auth.getSession;
    void session; // unused; we read via storage below since getSession is async
    const token =
      (() => {
        try {
          // The SDK keeps the latest session in localStorage under a
          // namespaced key like `sb-<project>-auth-token`.
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && /sb-.*-auth-token$/.test(k)) {
              const raw = localStorage.getItem(k);
              if (raw) {
                const parsed = JSON.parse(raw) as { access_token?: string };
                if (parsed?.access_token) return parsed.access_token;
              }
            }
          }
        } catch {
          /* ignore */
        }
        return "";
      })();
    if (!url || !apikey || !token) return;

    const body = JSON.stringify({
      id: graph.id,
      user_id: userId,
      workspace_id: graph.workspaceId,
      name: graph.name,
      nodes: graph.nodes,
      edges: graph.edges,
      viewport: graph.viewport ?? null,
    });
    void fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey,
        Authorization: `Bearer ${token}`,
        Prefer: "resolution=merge-duplicates",
      },
      body,
      keepalive: true,
    }).catch(() => {
      /* unload phase — nothing we can do */
    });
  } catch {
    /* swallow — best-effort path during tab close */
  }
}

/* ── Internal helpers ───────────────────────────────────────── */

function isMissingTableError(err: { code?: string; message?: string }): boolean {
  if (err?.code === "42P01") return true;
  return /relation .* does not exist|workspace_canvases/i.test(
    err?.message ?? "",
  );
}

let _warnedMissingTable = false;
function warnOnceAboutMissingTable(): void {
  if (_warnedMissingTable) return;
  _warnedMissingTable = true;
  console.warn(
    "[canvasPersistence] `workspace_canvases` table not found. " +
      "Apply migration `20260428120000_workspace_canvases.sql` " +
      "to enable cross-device autosave. Falling back to localStorage-only.",
  );
}
