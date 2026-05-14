/**
 * Editor's Supabase access layer — delegates to the workspace's shared
 * Supabase client (`@/integrations/supabase/client`) so that:
 *
 *   1. The user's existing workspace session is picked up automatically
 *      (no second auth flow).
 *   2. We don't double-initialize the SDK (would otherwise produce two
 *      auth state machines fighting over the same storage key).
 *   3. The editor inherits the workspace's auth refresh / persistence
 *      configuration unchanged.
 *
 * The original openreel-video service exposed `getSupabase()` plus a
 * manual-JWT escape hatch. We keep the same exported names so consumers
 * in `apps/web/src` work unchanged, but the implementation now wraps
 * the workspace client.
 */
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_REF = "fymncypboeubdikpbmqc";
export const USER_ASSETS_BUCKET = "user_assets";

export function getSupabase(): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}

// Manual-JWT escape hatch — kept as a no-op so dev paths that called
// setManualJwt() still type-check. The workspace's auth is the source
// of truth in production.
export function readManualJwt(): string | null {
  return null;
}

export function setManualJwt(_token: string | null) {
  // no-op
}

export interface MediaForgeAsset {
  /** Storage object path inside the bucket: "<user_id>/path/to/file.mp4" */
  path: string;
  name: string;
  size: number;
  /** mime if known */
  mime?: string;
  /** Time created (ISO) */
  createdAt?: string;
  /** Public-style URL for use in <video src> (signed for private buckets). */
  publicUrl: string;
}

/**
 * Returns true if a user is currently signed in (has a valid session).
 */
export async function isSignedIn(): Promise<boolean> {
  const { data } = await getSupabase().auth.getSession();
  return !!data.session?.user;
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

/**
 * List assets in the user's folder of `user_assets`.
 * Optionally filters by mime category.
 */
export async function listUserAssets(opts?: {
  category?: "video" | "audio" | "image";
  limit?: number;
  prefix?: string;
}): Promise<MediaForgeAsset[]> {
  const sb = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const folder = `${userId}/${opts?.prefix ?? ""}`.replace(/\/+$/, "");
  const { data, error } = await sb.storage
    .from(USER_ASSETS_BUCKET)
    .list(folder, {
      limit: opts?.limit ?? 200,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error) {
    console.warn("[Supabase] list error:", error.message);
    return [];
  }

  const results: MediaForgeAsset[] = [];
  for (const entry of data ?? []) {
    if (!entry.name) continue;
    if (entry.id === null) continue; // skip subfolders (id is null for them)
    const path = `${folder}/${entry.name}`;
    const lower = entry.name.toLowerCase();
    const isVideo = /\.(mp4|mov|webm|mkv|avi|m4v)$/.test(lower);
    const isAudio = /\.(mp3|wav|aac|m4a|ogg|flac)$/.test(lower);
    const isImage = /\.(jpe?g|png|gif|webp|bmp|tiff|svg)$/.test(lower);
    if (opts?.category === "video" && !isVideo) continue;
    if (opts?.category === "audio" && !isAudio) continue;
    if (opts?.category === "image" && !isImage) continue;
    const mime = isVideo
      ? "video/" + lower.split(".").pop()
      : isAudio
        ? "audio/" + lower.split(".").pop()
        : isImage
          ? "image/" + lower.split(".").pop()
          : (entry.metadata?.mimetype as string | undefined);

    // Sign a URL good for 1 hour for private bucket reads.
    const { data: signed } = await sb.storage
      .from(USER_ASSETS_BUCKET)
      .createSignedUrl(path, 3600);

    results.push({
      path,
      name: entry.name,
      size: (entry.metadata?.size as number) ?? 0,
      mime,
      createdAt: entry.created_at ?? undefined,
      publicUrl: signed?.signedUrl ?? "",
    });
  }
  return results;
}

/**
 * Upload an exported video to the user's MediaForge assets folder.
 *
 * Path: `<user_id>/openreel-video/<timestamp>-<name>.mp4`
 */
export async function uploadExportedVideo(
  blob: Blob,
  filename: string,
): Promise<{ path: string; signedUrl?: string } | null> {
  const sb = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stamp = Date.now();
  const path = `${userId}/openreel-video/${stamp}-${safeName}`;

  const { error } = await sb.storage
    .from(USER_ASSETS_BUCKET)
    .upload(path, blob, {
      cacheControl: "3600",
      upsert: false,
      contentType: blob.type || "video/mp4",
    });

  if (error) {
    console.warn("[Supabase] upload failed:", error.message);
    return null;
  }

  const { data: signed } = await sb.storage
    .from(USER_ASSETS_BUCKET)
    .createSignedUrl(path, 3600);

  return { path, signedUrl: signed?.signedUrl };
}

/**
 * Download an asset blob from a signed URL.
 */
export async function fetchAssetBlob(url: string): Promise<Blob | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.blob();
  } catch {
    return null;
  }
}
