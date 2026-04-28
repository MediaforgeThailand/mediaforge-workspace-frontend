/**
 * downloadAsset — small helper for "save this generation to disk" UX.
 *
 * Why not just use `<a href download>`?
 *   - Cross-origin assets (Supabase signed URLs from another bucket,
 *     Replicate / Kling / OpenAI CDN URLs) don't honour the `download`
 *     attribute when the response misses `Content-Disposition`. The
 *     browser opens them in a new tab instead of saving.
 *   - We don't always have a friendly filename — derive one from the
 *     URL or fall back to the node label.
 *
 * Strategy:
 *   1. Try fetch + Blob → object URL → anchor click. This bypasses
 *      Content-Disposition because we control the link's blob.
 *   2. On any fetch error (CORS, network, 404), fall back to a
 *      same-tab download via direct anchor — at least the user gets
 *      the file (or sees the URL).
 */

/** Pick a sane filename for a download given a URL + optional label.
 *  Strips query strings, decodes percent-escapes, and falls back to a
 *  generic name with the right extension. */
export function pickFilename(url: string, label?: string): string {
  try {
    const u = new URL(url, window.location.href);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    if (last && last.includes(".")) return sanitize(last);
  } catch {
    /* fall through to label-based naming */
  }
  // Derive an extension from the URL even if the path didn't have a
  // recognisable filename (e.g. signed URLs that hash the path).
  const m = url.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i);
  const ext = m ? m[1].toLowerCase() : "bin";
  const stem = sanitize(label ?? "asset");
  return `${stem}.${ext}`;
}

function sanitize(s: string): string {
  return s
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "asset";
}

/** Trigger a browser download for a remote URL.
 *  Resolves once the download has been initiated (not finished). */
export async function downloadFromUrl(
  url: string,
  filenameOrLabel?: string,
): Promise<void> {
  const filename = pickFilename(url, filenameOrLabel);

  // Fast path — fetch as blob, bypass any missing Content-Disposition.
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchor(objectUrl, filename);
    // Give the browser a tick to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return;
  } catch (err) {
    console.warn(
      "[downloadAsset] blob fetch failed, falling back to direct anchor:",
      err,
    );
  }

  // Fallback — same-tab anchor. CORS-blocked endpoints (rare) still
  // open in the same window; user can right-click + Save As if needed.
  triggerAnchor(url, filename);
}

function triggerAnchor(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  // Some browsers (Safari) need the anchor in the DOM before .click().
  document.body.appendChild(a);
  a.click();
  a.remove();
}
