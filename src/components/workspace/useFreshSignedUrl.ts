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
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const CACHE = new Map<string, { url: string; signedAt: number }>();
const REFRESH_AFTER_MS = 1000 * 60 * 60 * 12; // 12h — well inside any TTL

// Negative cache: paths we already know are gone. Keyed by
// `${bucket}:${path}` (without transform) because deleted-ness is a
// property of the underlying object, not the rendition. Without this,
// every re-render of N broken assets re-fires createSignedUrl + the
// workspace-run-node fallback — a 403 storm that wedges the canvas.
// TTL is short on purpose: a 5-minute cool-down lets a re-upload or
// RLS fix recover automatically.
const NEGATIVE_CACHE = new Map<string, number>(); // value = expiresAt (ms epoch)
const NEGATIVE_TTL_MS = 1000 * 60 * 5;

function isObjectMissingError(err: { message?: string } | null | undefined): boolean {
  const msg = err?.message ?? "";
  return /object not found|not[_ ]?found|\b404\b/i.test(msg);
}

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

interface FreshSignedUrlContext {
  jobId?: string | null;
}

/** Pulls bucket + path out of a Supabase Storage URL of either
 *  shape: `/storage/v1/object/sign/<bucket>/<path>?token=…` or
 *  `/storage/v1/object/public/<bucket>/<path>`, including imgproxy
 *  `/storage/v1/render/image/...` variants. Returns null for
 *  external / data / blob URLs. */
function parseStorageUrl(url: string): ParsedPath | null {
  if (!url || typeof url !== "string") return null;
  // We only care about supabase.co storage URLs.
  const m = url.match(
    /\/storage\/v1\/(?:object|render\/image)\/(?:sign|public|authenticated)\/([^/?#]+)\/([^?#]+)/,
  );
  if (!m) return null;
  return {
    bucket: decodeURIComponent(m[1]),
    path: decodeURIComponent(m[2]),
  };
}

function isClientSignablePath(parsed: ParsedPath, userId: string): boolean {
  if (parsed.path.split("/").some((part) => part === "..")) return false;
  if (parsed.bucket === "user_assets") {
    return parsed.path.startsWith(`${userId}/`) || parsed.path.startsWith(`tts/${userId}/`);
  }
  if (parsed.bucket === "ai-media") {
    return parsed.path.startsWith(`${userId}/`) || parsed.path.startsWith(`tripo3d-mirror/${userId}/`);
  }
  return false;
}

function isLegacyWorkspacePipelinePath(parsed: ParsedPath): boolean {
  return (
    parsed.bucket === "ai-media" &&
    parsed.path.startsWith("pipeline/") &&
    parsed.path.split("/").every((part) => part.length > 0 && part !== "..")
  );
}

export function useFreshSignedUrl(
  input: string | null | undefined,
  transform?: FreshSignedUrlTransform,
  context?: FreshSignedUrlContext,
): string | null {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const jobId = typeof context?.jobId === "string" && context.jobId.length > 0
    ? context.jobId
    : null;
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
    if (!userId) return; // no JWT yet, so a private re-sign cannot succeed

    const canClientSign = isClientSignablePath(parsed, userId);
    const canUseEdgeRefresh = canClientSign || isLegacyWorkspacePipelinePath(parsed);
    if (!canUseEdgeRefresh) {
      return;
    }

    const cacheKey = `${parsed.bucket}:${parsed.path}:${transformKey}`;
    const negKey = `${parsed.bucket}:${parsed.path}`;

    // Check NEGATIVE_CACHE first. If the object was deleted but a
    // stale signed URL is still in CACHE from before deletion,
    // returning the stale URL would just trigger a 403 on render —
    // skipping outright is the correct UX.
    const negativeUntil = NEGATIVE_CACHE.get(negKey);
    if (negativeUntil !== undefined) {
      if (negativeUntil > Date.now()) return; // known-gone, don't re-fire
      NEGATIVE_CACHE.delete(negKey);
    }

    // Cache hit (and still fresh) → use it without a round-trip.
    const cached = CACHE.get(cacheKey);
    if (cached && Date.now() - cached.signedAt < REFRESH_AFTER_MS) {
      setUrl(cached.url);
      return;
    }

    let cancelled = false;
    const refreshViaEdge = () => {
      void supabase.functions
        .invoke("workspace-run-node", {
          body: {
            action: "refresh_storage_url",
            url: initial,
            ...(jobId ? { job_id: jobId } : {}),
          },
        })
        .then(({ data: refreshed, error: refreshError }) => {
          if (cancelled) return;
          const signedUrl =
            typeof refreshed?.signed_url === "string"
              ? refreshed.signed_url
              : typeof refreshed?.url === "string"
                ? refreshed.url
                : null;
          if (refreshError || !signedUrl) {
            if (refreshError) console.warn("[useFreshSignedUrl:fallback]", refreshError);
            NEGATIVE_CACHE.set(negKey, Date.now() + NEGATIVE_TTL_MS);
            return;
          }
          CACHE.set(cacheKey, { url: signedUrl, signedAt: Date.now() });
          setUrl(signedUrl);
        });
    };

    if (!canClientSign) {
      refreshViaEdge();
      return () => {
        cancelled = true;
      };
    }

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
          if (isObjectMissingError(error)) {
            // Object is gone — the edge-function fallback would hit
            // the same 404. Mark negative so subsequent renders skip
            // the round-trip entirely.
            NEGATIVE_CACHE.set(negKey, Date.now() + NEGATIVE_TTL_MS);
            return;
          }
          refreshViaEdge();
          return;
        }
        CACHE.set(cacheKey, { url: data.signedUrl, signedAt: Date.now() });
        setUrl(data.signedUrl);
      });

    return () => {
      cancelled = true;
    };
  }, [initial, jobId, normalizedTransform, transformKey, userId]);

  return url;
}

/** Sync variant for code that's already resolved a fresh URL via
 *  the hook OR for places that just need the parser. Returns the
 *  cached URL if present, falls back to the input. Won't trigger a
 *  network request. Returns `null` for paths we've negative-cached
 *  so callers can short-circuit broken-image fetches. */
export function getCachedFreshUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const parsed = parseStorageUrl(input);
  if (!parsed) return input;
  const negKey = `${parsed.bucket}:${parsed.path}`;
  const negativeUntil = NEGATIVE_CACHE.get(negKey);
  if (negativeUntil !== undefined && negativeUntil > Date.now()) return null;
  const cached = CACHE.get(`${negKey}:`);
  return cached?.url ?? input;
}
