import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const SIGNED_URL_EXPIRY = 3600; // 1 hour
const cache = new Map<string, { url: string; expires: number }>();

/** Supported private buckets */
const PRIVATE_BUCKETS = ["user_assets", "ai-media"] as const;
type PrivateBucket = typeof PRIVATE_BUCKETS[number];

interface StorageRef {
  bucket: PrivateBucket;
  path: string;
}

/**
 * Extract bucket + path from a storage URL.
 * Handles both full public URLs and raw storage paths.
 */
export function extractStorageRef(fileUrl: string): StorageRef | null {
  if (!fileUrl) return null;
  for (const bucket of PRIVATE_BUCKETS) {
    const regex = new RegExp(`/${bucket}/(.+?)(?:\\?|$)`);
    const match = fileUrl.match(regex);
    if (match) return { bucket, path: decodeURIComponent(match[1]) };
  }
  // If it doesn't look like a URL, treat it as a raw user_assets path
  if (!fileUrl.startsWith("http")) return { bucket: "user_assets", path: fileUrl };
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
  const cacheKey = `${ref.bucket}:${ref.path}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, SIGNED_URL_EXPIRY);

  if (error || !data?.signedUrl) {
    console.warn("Failed to create signed URL:", error?.message);
    return fileUrl; // Fallback to original
  }

  cache.set(cacheKey, { url: data.signedUrl, expires: Date.now() + (SIGNED_URL_EXPIRY - 60) * 1000 });
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
    const cacheKey = `${ref.bucket}:${ref.path}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      result.set(url, cached.url);
    } else {
      const group = byBucket.get(ref.bucket) || [];
      group.push({ original: url, path: ref.path });
      byBucket.set(ref.bucket, group);
    }
  }

  for (const [bucket, toResolve] of byBucket) {
    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrls(
        toResolve.map((r) => r.path),
        SIGNED_URL_EXPIRY
      );

    if (data) {
      data.forEach((item, i) => {
        const entry = toResolve[i];
        const cacheKey = `${bucket}:${entry.path}`;
        if (item.signedUrl) {
          cache.set(cacheKey, { url: item.signedUrl, expires: Date.now() + (SIGNED_URL_EXPIRY - 60) * 1000 });
          result.set(entry.original, item.signedUrl);
        } else {
          result.set(entry.original, entry.original);
        }
      });
    } else {
      toResolve.forEach((r) => result.set(r.original, r.original));
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
