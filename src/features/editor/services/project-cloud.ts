/**
 * Cloud project persistence for MediaForge Studio.
 *
 * Tables touched:
 *   - public.editor_projects (created by migration 20260515120000)
 *
 * Save flow:
 *   1. Editor's auto-save fires on every project change (debounced 2s)
 *   2. We serialize the project model + bridge state into JSON
 *   3. UPSERT into `editor_projects` keyed by `(id, user_id)`
 *
 * Load flow:
 *   1. EditorPage mounts → calls `loadMostRecentProject` (or
 *      `loadProjectById` if a URL param was provided)
 *   2. Hydrate project store via the returned Project blob
 *
 * RLS guarantees: every query is automatically filtered to the signed-in
 * user via the policy on `editor_projects`. We never have to add a
 * `where user_id = …` filter on the client.
 */
import type { Project } from "@/lib/openreel-core";
import { getSupabase, getCurrentUserId } from "./supabase-client";
import { getTransitionBridge } from "../bridges/transition-bridge";

export interface CloudProjectSummary {
  id: string;
  name: string;
  thumbnail: string | null;
  duration_sec: number | null;
  created_at: string;
  updated_at: string;
}

export interface CloudProjectRow extends CloudProjectSummary {
  data: Project;
}

/**
 * List the user's projects, newest first. Caller can render a project
 * picker UI from this.
 */
export async function listUserProjects(
  limit = 50,
): Promise<CloudProjectSummary[]> {
  const sb = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await sb
    .from("editor_projects" as never)
    .select("id, name, thumbnail, duration_sec, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[ProjectCloud] list failed:", error.message);
    return [];
  }
  return (data ?? []) as unknown as CloudProjectSummary[];
}

/**
 * Load the most recently updated project for the current user.
 * Returns null if the user has no projects yet (caller should fall back
 * to creating a fresh empty project).
 */
export async function loadMostRecentProject(): Promise<Project | null> {
  const sb = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await sb
    .from("editor_projects" as never)
    .select("data")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[ProjectCloud] load most recent failed:", error.message);
    return null;
  }
  if (!data) return null;
  return (data as { data: Project }).data as Project;
}

export async function loadProjectById(
  projectId: string,
): Promise<Project | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("editor_projects" as never)
    .select("data")
    .eq("id", projectId)
    .maybeSingle();
  if (error) {
    console.warn("[ProjectCloud] loadProjectById failed:", error.message);
    return null;
  }
  if (!data) return null;
  return (data as { data: Project }).data as Project;
}

function serializeForSave(project: Project): Project {
  try {
    return getTransitionBridge().serializeIntoProject(project);
  } catch {
    return project;
  }
}

function computeDurationSec(project: Project): number {
  try {
    const ms = project.timeline?.duration ?? 0;
    return Math.round(ms / 1000);
  } catch {
    return 0;
  }
}

/**
 * UPSERT the project to Supabase. We use the project's own id (a uuid the
 * editor generates) as the primary key so this is idempotent.
 */
export async function saveProject(project: Project): Promise<boolean> {
  const sb = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const enriched = serializeForSave(project);
  const row = {
    id: enriched.id,
    user_id: userId,
    name: enriched.name || "Untitled Project",
    data: enriched as unknown as Record<string, unknown>,
    duration_sec: computeDurationSec(enriched),
    // updated_at handled by trigger
  };

  const { error } = await sb
    .from("editor_projects" as never)
    .upsert(row, { onConflict: "id" });

  if (error) {
    console.warn("[ProjectCloud] save failed:", error.message);
    return false;
  }
  return true;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  const sb = getSupabase();
  const { error } = await sb
    .from("editor_projects" as never)
    .delete()
    .eq("id", projectId);
  if (error) {
    console.warn("[ProjectCloud] delete failed:", error.message);
    return false;
  }
  return true;
}

/**
 * Lightweight debounced background save. Reuses the same 2s debounce
 * window the local auto-save uses so the cloud copy lags the IndexedDB
 * copy by at most a couple seconds.
 *
 * The intent here is "best effort" — cloud save failures should never
 * block the user from editing locally. The local IndexedDB autosave
 * (services/auto-save.ts) remains the primary recovery path.
 */
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingProject: Project | null = null;
let cloudSaveEnabled = false;

export function setCloudSaveEnabled(enabled: boolean) {
  cloudSaveEnabled = enabled;
  if (!enabled && pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
    pendingProject = null;
  }
}

export function isCloudSaveEnabled(): boolean {
  return cloudSaveEnabled;
}

export function scheduleCloudSave(project: Project, delayMs = 2000) {
  if (!cloudSaveEnabled) return;
  pendingProject = project;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(async () => {
    pendingTimer = null;
    if (!pendingProject) return;
    const p = pendingProject;
    pendingProject = null;
    await saveProject(p);
  }, delayMs);
}

export async function flushCloudSave(): Promise<void> {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (pendingProject) {
    const p = pendingProject;
    pendingProject = null;
    await saveProject(p);
  }
}
