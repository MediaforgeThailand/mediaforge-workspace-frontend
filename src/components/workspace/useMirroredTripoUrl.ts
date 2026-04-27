/**
 * useMirroredTripoUrl — proxies Tripo3D CDN URLs through our backend
 * so model-viewer can actually fetch them.
 *
 * Why it exists: Tripo3D's CDN (`tripo-data.*.tripo3d.com`) does
 * NOT send the `Access-Control-Allow-Origin` header. `<model-viewer>`
 * loads GLB assets via `fetch`, which the browser blocks under the
 * same-origin policy. The result is a permanently empty 3D viewer
 * (poster image only — looks like a static thumbnail).
 *
 * The fix: hand the Tripo URL to a backend endpoint that re-hosts
 * the asset in our Supabase storage bucket and returns a signed URL.
 * Supabase URLs do send CORS, so model-viewer loads them fine.
 *
 * The hook caches the mapping in a module-level Map so a tile renders
 * with the cached URL after the first mirror call. Multiple components
 * mirroring the SAME source URL share one in-flight promise — no
 * duplicate uploads.
 *
 * Non-Tripo URLs (Supabase, blob:, data:, anything else) pass through
 * untouched and synchronously, so callers can swap this hook in
 * without breaking the existing happy path.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const TRIPO_HOST_RE = /(?:^|\.)tripo3d\.com$/i;

/** Resolved cache: source URL → mirrored Supabase URL. */
const RESOLVED = new Map<string, string>();
/** In-flight cache: source URL → promise of mirrored URL.
 *  Lets two simultaneous tile renders coalesce into one mirror call. */
const INFLIGHT = new Map<string, Promise<string | null>>();

function isTripoUrl(url: string): boolean {
  if (!url) return false;
  try {
    return TRIPO_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function mirrorOnce(srcUrl: string): Promise<string | null> {
  const cached = RESOLVED.get(srcUrl);
  if (cached) return cached;
  const inflight = INFLIGHT.get(srcUrl);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "workspace-run-node",
        { body: { action: "mirror_tripo_url", url: srcUrl } },
      );
      if (error) {
        console.warn("[mirror-tripo] invoke error:", error);
        return null;
      }
      const mirrored = (data as { url?: string } | null)?.url;
      if (typeof mirrored === "string" && mirrored.length > 0) {
        RESOLVED.set(srcUrl, mirrored);
        return mirrored;
      }
      console.warn("[mirror-tripo] no url in response:", data);
      return null;
    } catch (err) {
      console.warn("[mirror-tripo] threw:", err);
      return null;
    } finally {
      INFLIGHT.delete(srcUrl);
    }
  })();
  INFLIGHT.set(srcUrl, promise);
  return promise;
}

/**
 * Returns the mirrored Supabase URL for a Tripo3D URL, falling
 * back to the original input until the mirror resolves. Non-Tripo
 * URLs are returned unchanged.
 *
 * Until the mirror lands, callers can still render their poster /
 * fallback image with the input URL — the swap to the working URL
 * happens on the next render cycle.
 */
export function useMirroredTripoUrl(
  input: string | null | undefined,
): string | null {
  const initial = typeof input === "string" && input.length > 0 ? input : null;
  const [url, setUrl] = useState<string | null>(() => {
    if (!initial) return null;
    return RESOLVED.get(initial) ?? initial;
  });

  useEffect(() => {
    if (!initial) {
      setUrl(null);
      return;
    }
    // Non-Tripo URLs: leave the caller's URL as-is.
    if (!isTripoUrl(initial)) {
      setUrl(initial);
      return;
    }
    // Tripo URL: serve the cached mirror immediately, then refresh
    // in the background if we haven't resolved this URL yet.
    const cached = RESOLVED.get(initial);
    if (cached) {
      setUrl(cached);
      return;
    }
    setUrl(initial); // show poster / fallback while we mirror
    let cancelled = false;
    void mirrorOnce(initial).then((mirrored) => {
      if (cancelled) return;
      if (mirrored) setUrl(mirrored);
    });
    return () => {
      cancelled = true;
    };
  }, [initial]);

  return url;
}
