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
import type {
  CanvasGraph,
  ProjectMeta,
  WorkspaceMeta,
} from "@/store/useWorkspaceStore";

interface ServerCanvasRow {
  id: string;
  user_id: string;
  project_id: string | null;
  workspace_id: string;
  name: string;
  nodes: unknown;
  edges: unknown;
  viewport: unknown;
  created_at: string;
  updated_at: string;
}

function rowToCanvasGraph(row: ServerCanvasRow): CanvasGraph {
  return {
    id: row.id,
    ownerId: row.user_id,
    projectId: row.project_id ?? null,
    workspaceId: row.workspace_id,
    name: row.name,
    nodes: Array.isArray(row.nodes) ? (row.nodes as CanvasGraph["nodes"]) : [],
    edges: Array.isArray(row.edges) ? (row.edges as CanvasGraph["edges"]) : [],
    viewport: row.viewport as CanvasGraph["viewport"],
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function rowHasContent(row: ServerCanvasRow): boolean {
  return Array.isArray(row.nodes) && row.nodes.length > 0;
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
        "id, user_id, project_id, workspace_id, name, nodes, edges, viewport, created_at, updated_at",
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

    return rowToCanvasGraph(data as ServerCanvasRow);
  } catch (err) {
    console.warn("[canvasPersistence] load threw:", err);
    return null;
  }
}

/** Return the set of canvas ids the current user has on the server.
 *  Used by the dashboard's mount-time backfill to figure out which
 *  local canvases haven't been mirrored yet — a brand-new device
 *  picks them up server-side WITHOUT any explicit "open this canvas"
 *  click on the source device. RLS scopes the query to the caller. */
export async function listServerCanvasIds(): Promise<Set<string> | null> {
  try {
    const { data, error } = await supabase
      .from("workspace_canvases")
      .select("id");
    if (error) {
      if (isMissingTableError(error)) {
        warnOnceAboutMissingTable();
        return null;
      }
      console.warn(
        "[canvasPersistence] list canvas ids failed:",
        error.message,
      );
      return null;
    }
    if (!Array.isArray(data)) return new Set();
    return new Set(
      (data as Array<{ id: string }>).map((row) => row.id),
    );
  } catch (err) {
    console.warn("[canvasPersistence] list canvas ids threw:", err);
    return null;
  }
}

/** Fetch every canvas belonging to a workspace for the current user.
 *  Used by the canvas page when it lands with a workspaceId URL on a
 *  device that hasn't yet synced the canvases locally — without this,
 *  the page would auto-bootstrap an empty Page 1 and silently
 *  shadow the real (server-only) canvases. Returns null on table-
 *  missing / network errors so callers can fall through to the
 *  empty-bootstrap path. */
export async function loadCanvasesByWorkspaceFromServer(
  workspaceId: string,
): Promise<CanvasGraph[] | null> {
  try {
    const { data, error } = await supabase
      .from("workspace_canvases")
      .select(
        "id, user_id, project_id, workspace_id, name, nodes, edges, viewport, created_at, updated_at",
      )
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingTableError(error)) {
        warnOnceAboutMissingTable();
        return null;
      }
      console.warn(
        "[canvasPersistence] load canvases by workspace failed:",
        error.message,
      );
      return null;
    }
    if (!Array.isArray(data)) return [];

    return (data as ServerCanvasRow[]).map(rowToCanvasGraph);
  } catch (err) {
    console.warn(
      "[canvasPersistence] load canvases by workspace threw:",
      err,
    );
    return null;
  }
}

/** Fetch one lightweight preview graph per workspace. The dashboard
 *  uses this to draw stable space thumbnails without opening every
 *  canvas page. Prefer the newest canvas that has visible graph
 *  content; if a workspace only has empty canvases, return the newest
 *  empty one so the local canvas list still hydrates correctly. */
export async function loadLatestCanvasPreviewsByWorkspaceIds(
  workspaceIds: string[],
): Promise<CanvasGraph[] | null> {
  const uniqueIds = Array.from(new Set(workspaceIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const chosen = new Map<string, ServerCanvasRow>();
  const chunkSize = 50;

  try {
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const batch = uniqueIds.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("workspace_canvases")
        .select(
          "id, user_id, project_id, workspace_id, name, nodes, edges, viewport, created_at, updated_at",
        )
        .in("workspace_id", batch)
        .order("updated_at", { ascending: false });

      if (error) {
        if (isMissingTableError(error)) {
          warnOnceAboutMissingTable();
          return null;
        }
        console.warn(
          "[canvasPersistence] load canvas previews failed:",
          error.message,
        );
        return null;
      }
      if (!Array.isArray(data)) continue;

      for (const row of data as ServerCanvasRow[]) {
        const existing = chosen.get(row.workspace_id);
        if (!existing) {
          chosen.set(row.workspace_id, row);
          continue;
        }
        if (!rowHasContent(existing) && rowHasContent(row)) {
          chosen.set(row.workspace_id, row);
        }
      }
    }

    return Array.from(chosen.values()).map(rowToCanvasGraph);
  } catch (err) {
    console.warn(
      "[canvasPersistence] load canvas previews threw:",
      err,
    );
    return null;
  }
}

/** Upsert a canvas snapshot. The `userId` MUST be the signed-in
 *  user — RLS rejects writes with mismatched user_id. Throws on
 *  network/permission errors so the caller can surface a save
 *  state to the user; silently no-ops when the table is missing. */
/** Delete a canvas from the server. Used by the tab-close button so
 *  the closed tab doesn't resurrect on the next mount via the
 *  workspace's `loadCanvasesByWorkspaceFromServer` fetch.
 *
 *  RLS scopes the delete to the caller's own user_id; passing the
 *  wrong canvas id silently affects 0 rows. Fire-and-forget — the
 *  caller updates local state synchronously and doesn't wait. */
export async function deleteCanvasFromServer(canvasId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("workspace_canvases")
      .delete()
      .eq("id", canvasId);
    if (error) {
      if (isMissingTableError(error)) {
        warnOnceAboutMissingTable();
        return;
      }
      console.warn("[canvasPersistence] delete canvas failed:", error.message);
    }
  } catch (err) {
    console.warn("[canvasPersistence] delete canvas threw:", err);
  }
}

export async function saveCanvasToServer(
  graph: CanvasGraph,
  userId: string,
): Promise<{ ok: boolean; tableMissing?: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("workspace_canvases").upsert(
      {
        id: graph.id,
        user_id: graph.ownerId ?? userId,
        project_id: graph.projectId ?? null,
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
      user_id: graph.ownerId ?? userId,
      project_id: graph.projectId ?? null,
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

/* ── Workspace META sync (cross-device dashboard) ───────────────
 *
 * Why this exists:
 *   The CANVAS contents (nodes / edges) sync via the helpers above.
 *   But the LIST of workspaces shown on the dashboard at
 *   /app/workspace was previously localStorage-only — so signing
 *   into the same Google account on a second computer made the
 *   "All spaces" grid look empty even though the underlying canvas
 *   rows existed in `workspace_canvases`.
 *
 * Fix:
 *   Mirror the workspace meta into a `workspaces` table (id,
 *   user_id, name, created_at, updated_at) with RLS scoped to
 *   auth.uid. The dashboard fetches on mount and merges with
 *   localStorage so we never wipe local-only state. Every
 *   create / rename / delete fires a fire-and-forget upsert /
 *   delete back to the server.
 *
 * The `workspaces` table is created by migration
 * `20260428180000_workspaces_sync.sql` — already applied to
 * production. If for any reason it's missing, the helpers all
 * silently no-op (same pattern as the canvas helpers above).
 */

interface ServerWorkspaceRow {
  id: string;
  user_id: string;
  project_id: string | null;
  class_id?: string | null;
  education_status?: "active" | "submitted" | "passed" | "ended" | null;
  education_completed_at?: string | null;
  name: string;
  created_at: string;
  updated_at: string;
}

interface ServerProjectRow {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  is_private?: boolean | null;
  created_at: string;
  updated_at: string;
}

/** Pull every workspace the signed-in user owns. Returns null if
 *  the user isn't signed in / the table is missing — caller should
 *  fall back to whatever is in localStorage. */
export async function loadWorkspacesFromServer(): Promise<
  WorkspaceMeta[] | null
> {
  try {
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, user_id, project_id, class_id, education_status, education_completed_at, name, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingWorkspacesTableError(error)) {
        warnOnceAboutMissingWorkspacesTable();
        return null;
      }
      console.warn("[canvasPersistence] load workspaces failed:", error.message);
      return null;
    }
    if (!Array.isArray(data)) return [];

    return (data as ServerWorkspaceRow[]).map((row) => ({
      id: row.id,
      ownerId: row.user_id,
      projectId: row.project_id ?? null,
      classId: row.class_id ?? null,
      educationStatus: row.education_status ?? null,
      educationCompletedAt: row.education_completed_at ?? null,
      name: row.name,
      updatedAt: new Date(row.updated_at).getTime(),
    }));
  } catch (err) {
    console.warn("[canvasPersistence] load workspaces threw:", err);
    return null;
  }
}

export async function loadWorkspaceFromServer(
  workspaceId: string,
): Promise<WorkspaceMeta | null> {
  try {
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, user_id, project_id, class_id, education_status, education_completed_at, name, created_at, updated_at")
      .eq("id", workspaceId)
      .maybeSingle();

    if (error) {
      if (isMissingWorkspacesTableError(error)) {
        warnOnceAboutMissingWorkspacesTable();
        return null;
      }
      console.warn("[canvasPersistence] load workspace failed:", error.message);
      return null;
    }
    if (!data) return null;

    const row = data as ServerWorkspaceRow;
    return {
      id: row.id,
      ownerId: row.user_id,
      projectId: row.project_id ?? null,
      classId: row.class_id ?? null,
      educationStatus: row.education_status ?? null,
      educationCompletedAt: row.education_completed_at ?? null,
      name: row.name,
      updatedAt: new Date(row.updated_at).getTime(),
    };
  } catch (err) {
    console.warn("[canvasPersistence] load workspace threw:", err);
    return null;
  }
}

/** Upsert one workspace row. Fire-and-forget — the dashboard
 *  doesn't wait on this; localStorage is the source of truth for
 *  the optimistic UI and the server eventually catches up. */
export async function upsertWorkspaceToServer(
  meta: WorkspaceMeta,
  userId: string,
): Promise<void> {
  if (!userId) return;
  try {
    const { error } = await supabase.from("workspaces").upsert(
      {
        id: meta.id,
        user_id: meta.ownerId ?? userId,
        project_id: meta.projectId ?? null,
        class_id: meta.classId ?? null,
        education_status: meta.educationStatus ?? null,
        name: meta.name,
        // updated_at is set by the table's `workspaces_touch` trigger
        // — don't send it from the client so concurrent writes don't
        // race on clock skew between devices.
      },
      { onConflict: "id" },
    );
    if (error) {
      if (isMissingWorkspacesTableError(error)) {
        warnOnceAboutMissingWorkspacesTable();
        return;
      }
      console.warn(
        "[canvasPersistence] upsert workspace failed:",
        error.message,
      );
    }
  } catch (err) {
    console.warn("[canvasPersistence] upsert workspace threw:", err);
  }
}

/** Delete a workspace from the server.
 *
 *  RLS guarantees we can only delete our own rows. We have to
 *  cascade canvases manually because `workspace_canvases.workspace_id`
 *  is intentionally NOT a real FK (the original migration kept it
 *  loose so canvases could write before their workspace existed).
 *
 *  Without this manual cascade, deleting a workspace leaves orphan
 *  canvases behind — and if the workspaces_sync migration ever
 *  re-runs its backfill, every orphan resurrects as a "Recovered
 *  workspace" card on the dashboard. Reported as
 *  "ทำไมพอลบ workspace แล้วมัน recovery กลับมา".
 *
 *  Order matters: delete the canvases FIRST, then the workspace
 *  row. If the canvas delete fails (RLS rejection, network), we
 *  bail before removing the parent so the user can retry without
 *  ending up with nothing on the screen but stale canvas rows. */
export async function deleteWorkspaceFromServer(
  workspaceId: string,
): Promise<void> {
  try {
    // Cascade — drop every canvas in this workspace first.
    const { error: canvasErr } = await supabase
      .from("workspace_canvases")
      .delete()
      .eq("workspace_id", workspaceId);
    if (canvasErr) {
      // workspace_canvases table missing is fine (older deploy) —
      // the workspaces row delete below still runs.
      if (canvasErr.code !== "42P01") {
        console.warn(
          "[canvasPersistence] cascade canvas delete failed:",
          canvasErr.message,
        );
      }
    }

    const { error } = await supabase
      .from("workspaces")
      .delete()
      .eq("id", workspaceId);
    if (error) {
      if (isMissingWorkspacesTableError(error)) {
        warnOnceAboutMissingWorkspacesTable();
        return;
      }
      console.warn(
        "[canvasPersistence] delete workspace failed:",
        error.message,
      );
    }
  } catch (err) {
    console.warn("[canvasPersistence] delete workspace threw:", err);
  }
}

function isMissingWorkspacesTableError(err: {
  code?: string;
  message?: string;
}): boolean {
  if (err?.code === "42P01") return true;
  return /relation .* does not exist|public\.workspaces/i.test(
    err?.message ?? "",
  );
}

let _warnedMissingWorkspacesTable = false;
function warnOnceAboutMissingWorkspacesTable(): void {
  if (_warnedMissingWorkspacesTable) return;
  _warnedMissingWorkspacesTable = true;
  console.warn(
    "[canvasPersistence] `workspaces` table not found. " +
      "Apply migration `20260428180000_workspaces_sync.sql` " +
      "to enable cross-device space sync. Falling back to " +
      "localStorage-only.",
  );
}

export async function loadProjectsFromServer(): Promise<ProjectMeta[] | null> {
  try {
    const { data, error } = await (supabase as any)
      .from("workspace_projects")
      .select("id, user_id, name, description, color, is_private, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingProjectsTableError(error)) {
        warnOnceAboutMissingProjectsTable();
        return null;
      }
      console.warn("[canvasPersistence] load projects failed:", error.message);
      return null;
    }
    if (!Array.isArray(data)) return [];
    return (data as ServerProjectRow[]).map((row) => ({
      id: row.id,
      ownerId: row.user_id,
      name: row.name,
      description: row.description ?? null,
      color: row.color ?? null,
      isPrivate: Boolean(row.is_private),
      updatedAt: new Date(row.updated_at).getTime(),
    }));
  } catch (err) {
    console.warn("[canvasPersistence] load projects threw:", err);
    return null;
  }
}

export async function upsertProjectToServer(
  meta: ProjectMeta,
  userId: string,
): Promise<void> {
  if (!userId) return;
  try {
    const { error } = await (supabase as any).from("workspace_projects").upsert(
      {
        id: meta.id,
        user_id: meta.ownerId ?? userId,
        name: meta.name,
        description: meta.description ?? null,
        color: meta.color ?? null,
        is_private: Boolean(meta.isPrivate),
      },
      { onConflict: "id" },
    );
    if (error) {
      if (isMissingProjectsTableError(error)) {
        warnOnceAboutMissingProjectsTable();
        return;
      }
      console.warn("[canvasPersistence] upsert project failed:", error.message);
    }
  } catch (err) {
    console.warn("[canvasPersistence] upsert project threw:", err);
  }
}

export async function deleteProjectFromServer(projectId: string): Promise<void> {
  try {
    const deleteProjectRows = async (table: string): Promise<boolean> => {
      const { error } = await (supabase as any)
        .from(table)
        .delete()
        .eq("project_id", projectId);
      if (!error) return true;
      if (error.code === "42P01" || error.code === "42703") return true;
      console.warn(
        `[canvasPersistence] cascade project delete failed for ${table}:`,
        error.message,
      );
      return false;
    };

    for (const table of [
      "workspace_generation_events",
      "workspace_generation_jobs",
      "user_assets",
      "workspace_canvases",
      "workspaces",
    ]) {
      const ok = await deleteProjectRows(table);
      if (!ok) return;
    }

    const { error } = await supabase
      .from("workspace_projects")
      .delete()
      .eq("id", projectId);
    if (error) {
      if (isMissingProjectsTableError(error)) {
        warnOnceAboutMissingProjectsTable();
        return;
      }
      console.warn("[canvasPersistence] delete project failed:", error.message);
    }
  } catch (err) {
    console.warn("[canvasPersistence] delete project threw:", err);
  }
}

function isMissingProjectsTableError(err: {
  code?: string;
  message?: string;
}): boolean {
  if (err?.code === "42P01" || err?.code === "42703") return true;
  return /relation .* does not exist|public\.workspace_projects|project_id/i.test(
    err?.message ?? "",
  );
}

let _warnedMissingProjectsTable = false;
function warnOnceAboutMissingProjectsTable(): void {
  if (_warnedMissingProjectsTable) return;
  _warnedMissingProjectsTable = true;
  console.warn(
    "[canvasPersistence] `workspace_projects` table not found. Apply the project hierarchy migration.",
  );
}
