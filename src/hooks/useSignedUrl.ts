import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const SIGNED_URL_EXPIRY = 3600; // 1 hour
const cache = new Map<string, { url: string; expires: number }>();
const missingCache = new Map<string, number>();
const MISSING_CACHE_TTL_MS = 30 * 60 * 1000;

/** Supported private buckets */
const PRIVATE_BUCKETS = ["user_assets", "ai-media"] as const;
type PrivateBucket = typeof PRIVATE_BUCKETS[number];

interface StorageRef {
  bucket: PrivateBucket;
  path: string;
}

function cacheKey(ref: StorageRef) {
  return `${ref.bucket}:${ref.path}`;
}

export function isStorageObjectMissingError(error: unknown): boolean {
  const record = error && typeof error === "object"
    ? (error as { message?: unknown; name?: unknown; statusCode?: unknown; status?: unknown; code?: unknown })
    : null;
  const text = [
    record?.message,
    record?.name,
    record?.statusCode,
    record?.status,
    record?.code,
    typeof error === "string" ? error : "",
  ]
    .filter(Boolean)
    .join(" ");
  return /object not found|nosuchkey|not[_ ]?found|\b404\b/i.test(text);
}

function markMissing(ref: StorageRef) {
  missingCache.set(cacheKey(ref), Date.now() + MISSING_CACHE_TTL_MS);
}

function isKnownMissing(ref: StorageRef): boolean {
  const key = cacheKey(ref);
  const expires = missingCache.get(key);
  if (!expires) return false;
  if (expires > Date.now()) return true;
  missingCache.delete(key);
  return false;
}

/**
 * Extract bucket + path from a storage URL.
 * Handles both full public URLs and raw storage paths.
 */
export function extractStorageRef(fileUrl: string): StorageRef | null {
  if (!fileUrl) return null;
  const normalized = fileUrl.trim();
  if (!normalized) return null;

  const storageUrlMatch = normalized.match(
    /\/storage\/v1\/(?:object|render\/image)\/(?:sign|public|authenticated)\/(user_assets|ai-media)\/([^?#]+)/i,
  );
  if (storageUrlMatch) {
    return {
      bucket: storageUrlMatch[1].toLowerCase() as PrivateBucket,
      path: decodeURIComponent(storageUrlMatch[2]),
    };
  }

  const rawBucketPath = normalized.replace(/^\/+/, "").match(/^(user_assets|ai-media)\/(.+)$/i);
  if (rawBucketPath) {
    return {
      bucket: rawBucketPath[1].toLowerCase() as PrivateBucket,
      path: decodeURIComponent(rawBucketPath[2].split(/[?#]/)[0]),
    };
  }

  for (const bucket of PRIVATE_BUCKETS) {
    const regex = new RegExp(`/${bucket}/(.+?)(?:\\?|$)`);
    const match = normalized.match(regex);
    if (match) return { bucket, path: decodeURIComponent(match[1]) };
  }
  // If it doesn't look like a URL, treat it as a raw user_assets path
  if (!normalized.startsWith("http")) return { bucket: "user_assets", path: normalized };
  return null;
}

/** @deprecated Use extractStorageRef instead */
export function extractStoragePath(fileUrl: string): string | null {
  const ref = extractStorageRef(fileUrl);
  return ref?.path ?? null;
}

/**
 * Generate a signed URL for a file in the user_assets bucket.
 */
export async function getSignedUrl(fileUrl: string): Promise<string> {
  const ref = extractStorageRef(fileUrl);
  if (!ref) return fileUrl; // Not a private bucket URL, return as-is

  // Check cache
  const key = cacheKey(ref);
  if (isKnownMissing(ref)) return fileUrl;

  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, SIGNED_URL_EXPIRY);

  if (error || !data?.signedUrl) {
    // "Object not found" is expected for deleted assets — don't spam console
    if (isStorageObjectMissingError(error)) {
      markMissing(ref);
      console.debug("Signed URL: object not found, using original URL");
    } else {
      console.warn("Failed to create signed URL:", error?.message);
    }
    return fileUrl; // Fallback to original
  }

  cache.set(key, { url: data.signedUrl, expires: Date.now() + (SIGNED_URL_EXPIRY - 60) * 1000 });
  return data.signedUrl;
}

/**
 * Batch-resolve signed URLs for multiple file URLs.
 */
export async function getSignedUrls(fileUrls: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  // Group by bucket
  const byBucket = new Map<PrivateBucket, { original: string; path: string }[]>();

  for (const url of fileUrls) {
    const ref = extractStorageRef(url);
    if (!ref) {
      result.set(url, url);
      continue;
    }
    const key = cacheKey(ref);
    if (isKnownMissing(ref)) {
      result.set(url, url);
      continue;
    }

    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
      result.set(url, cached.url);
    } else {
      const group = byBucket.get(ref.bucket) || [];
      group.push({ original: url, path: ref.path });
      byBucket.set(ref.bucket, group);
    }
  }

  for (const [bucket, toResolve] of byBucket) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(
        toResolve.map((r) => r.path),
        SIGNED_URL_EXPIRY
      );

    if (data) {
      data.forEach((item, i) => {
        const entry = toResolve[i];
        const ref = { bucket, path: entry.path };
        const key = cacheKey(ref);
        if (item.signedUrl) {
          cache.set(key, { url: item.signedUrl, expires: Date.now() + (SIGNED_URL_EXPIRY - 60) * 1000 });
          result.set(entry.original, item.signedUrl);
        } else {
          if (isStorageObjectMissingError(item.error)) markMissing(ref);
          result.set(entry.original, entry.original);
        }
      });
    } else {
      toResolve.forEach((r) => {
        if (isStorageObjectMissingError(error)) markMissing({ bucket, path: r.path });
        result.set(r.original, r.original);
      });
    }
  }

  return result;
}

/**
 * React hook that resolves a single file URL to a signed URL.
 */
export function useSignedUrl(fileUrl: string | null | undefined): string | null {
  const [signedUrl, setSignedUrl] = useState<string | null>(fileUrl || null);

  useEffect(() => {
    if (!fileUrl) { setSignedUrl(null); return; }
    let cancelled = false;
    getSignedUrl(fileUrl).then((url) => { if (!cancelled) setSignedUrl(url); });
    return () => { cancelled = true; };
  }, [fileUrl]);

  return signedUrl;
}
