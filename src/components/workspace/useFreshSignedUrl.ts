/**
 * useFreshSignedUrl — keeps an asset's preview URL alive across
 * sessions even when the original signed URL has expired.
 *
 * The workspace stores `previewUrl` (signed URL, TTL 1 year now)
 * directly on each AssetNode and inside every brand_elements row.
 * If a user opens a canvas they uploaded to BEFORE we bumped the
 * TTL, those URLs return 403 and the image breaks. This hook:
 *
 *   1. Parses the bucket + storage path out of any Supabase Storage
 *      URL (signed OR public) the caller hands in.
 *   2. Issues a fresh `createSignedUrl` for that path.
 *   3. Returns the freshest URL — initially the one passed in (so
 *      the UI doesn't flash blank), then swapped to the freshly
 *      signed one once the round-trip resolves.
 *
 * URLs that don't match the Supabase Storage shape (data: blobs,
 * external CDNs, the legacy localPreview blob URL) pass through
 * untouched. RLS still applies — you only get a fresh URL if the
 * user's JWT is allowed to read that path.
 *
 * Per-URL caching keeps tile re-renders cheap: once a URL is
 * resolved, repeated calls in the same session reuse the result
 * via a module-level Map.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const CACHE = new Map<string, { url: string; signedAt: number }>();
const REFRESH_AFTER_MS = 1000 * 60 * 60 * 12; // 12h — well inside any TTL

export interface FreshSignedUrlTransform {
  width?: number;
  height?: number;
  quality?: number;
  resize?: "cover" | "contain" | "fill";
}

interface ParsedPath {
  bucket: string;
  path: string;
}

/** Pulls bucket + path out of a Supabase Storage URL of either
 *  shape: `/storage/v1/object/sign/<bucket>/<path>?token=…` or
 *  `/storage/v1/object/public/<bucket>/<path>`. Returns null for
 *  external / data / blob URLs. */
function parseStorageUrl(url: string): ParsedPath | null {
  if (!url || typeof url !== "string") return null;
  // We only care about supabase.co storage URLs.
  const m = url.match(
    /\/storage\/v1\/object\/(?:sign|public)\/([^/?#]+)\/([^?#]+)/,
  );
  if (!m) return null;
  return {
    bucket: decodeURIComponent(m[1]),
    path: decodeURIComponent(m[2]),
  };
}

export function useFreshSignedUrl(
  input: string | null | undefined,
  transform?: FreshSignedUrlTransform,
): string | null {
  const initial = typeof input === "string" && input.length > 0 ? input : null;
  const transformKey = useMemo(
    () => (transform ? JSON.stringify(transform) : ""),
    [transform],
  );
  const normalizedTransform = useMemo(
    () =>
      transformKey
        ? (JSON.parse(transformKey) as FreshSignedUrlTransform)
        : undefined,
    [transformKey],
  );
  const [url, setUrl] = useState<string | null>(initial);

  useEffect(() => {
    setUrl(initial);
    if (!initial) return;

    const parsed = parseStorageUrl(initial);
    if (!parsed) return; // not a Supabase URL, leave the caller's URL alone

    // Cache hit (and still fresh) → use it without a round-trip.
    const cacheKey = `${parsed.bucket}:${parsed.path}:${transformKey}`;
    const cached = CACHE.get(cacheKey);
    if (cached && Date.now() - cached.signedAt < REFRESH_AFTER_MS) {
      setUrl(cached.url);
      return;
    }

    let cancelled = false;
    void supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(
        parsed.path,
        60 * 60 * 24 * 365,
        normalizedTransform ? { transform: normalizedTransform } : undefined,
      ) // 1 year
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          // Re-sign failed — leave the caller's URL in place. Worst
          // case the image still 403s (same as today), no regression.
          if (error) console.warn("[useFreshSignedUrl]", error);
          return;
        }
        CACHE.set(cacheKey, { url: data.signedUrl, signedAt: Date.now() });
        setUrl(data.signedUrl);
      });

    return () => {
      cancelled = true;
    };
  }, [initial, normalizedTransform, transformKey]);

  return url;
}

/** Sync variant for code that's already resolved a fresh URL via
 *  the hook OR for places that just need the parser. Returns the
 *  cached URL if present, falls back to the input. Won't trigger a
 *  network request. */
export function getCachedFreshUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const parsed = parseStorageUrl(input);
  if (!parsed) return input;
  const cached = CACHE.get(`${parsed.bucket}:${parsed.path}`);
  return cached?.url ?? input;
}
