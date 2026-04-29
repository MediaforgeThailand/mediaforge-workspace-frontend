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
 *
 *  This now ALWAYS routes the user-facing name through the canonical
 *  `mediaforge_<sanitized-node-name>.<ext>` convention via
 *  `buildDownloadFilename`. The previous behaviour (use the URL's
 *  trailing path segment when it had a `.`) was readable for direct
 *  URLs (`my-photo.png`) but ugly for signed URLs that hash the path
 *  (`object/sign/ai-media/d4a1b8c2-9f3e.png?token=…`) and inconsistent
 *  with the new ZIP bundling — every download (single or inside ZIP)
 *  should land with the same recognisable prefix so users can grep
 *  their Downloads folder for `mediaforge_*` and find every workspace
 *  output. */
export function pickFilename(url: string, label?: string): string {
  if (label && /^mediaforge_.+\.[a-z0-9]{2,5}$/i.test(label.trim())) {
    return label.trim();
  }
  return buildDownloadFilename(label ?? "asset", extFromUrl(url));
}

/** Derive an extension from the URL. Falls back to `bin` when the
 *  path is opaque (signed URLs without a path-suffixed extension). */
export function extFromUrl(url: string): string {
  const m = url.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i);
  return m ? m[1].toLowerCase() : "bin";
}

/** Map a generation `type` (image / video / audio / model / text) to
 *  a canonical extension. Used by the ZIP bundler when the URL itself
 *  doesn't carry one (Replicate / Tripo signed URLs). */
export function extFromGenType(t: string | undefined): string {
  switch (t) {
    case "image":
      return "png";
    case "video":
      return "mp4";
    case "audio":
      return "mp3";
    case "model":
    case "model3d":
      return "glb";
    default:
      return "bin";
  }
}

/**
 * Canonical filename builder for ANY download — single asset, single
 * generation, or a file inside the multi-download ZIP.
 *
 * Output: `mediaforge_<sanitized>[-N+1].<ext>`
 *
 *   buildDownloadFilename("My Cool Image!", "png")        // mediaforge_My-Cool-Image.png
 *   buildDownloadFilename("Hero Shot", "mp4", 0)          // mediaforge_Hero-Shot-1.mp4
 *   buildDownloadFilename("Hero Shot", "mp4", 2)          // mediaforge_Hero-Shot-3.mp4
 *
 * Sanitisation rules:
 *   - NFKC normalise so composed Unicode stays stable across OSes.
 *   - Replace anything not Unicode letter / number / _ / - with `-`.
 *   - Collapse runs of `-` and trim trailing `-`.
 *   - Cap at 60 chars so even Windows path limits aren't an issue
 *     once you add the `mediaforge_` prefix and the extension.
 *   - Empty / all-stripped → fall back to `asset`.
 *
 * Index argument is 0-based (matches `generations[]` indices) but
 * displayed 1-based to match human counting in the UI ("Generation
 * 2 / 3" etc.).
 */
export function buildDownloadFilename(
  rawName: string,
  ext: string,
  index?: number,
): string {
  const safe =
    rawName
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "asset";
  const idx = typeof index === "number" ? `-${index + 1}` : "";
  return `mediaforge_${safe}${idx}.${ext}`;
}

/** Build the timestamped filename for the multi-download ZIP bundle.
 *  e.g. `mediaforge_bundle_20260429-1614.zip` — sorts naturally on
 *  disk and embeds the local-time stamp the user expects. */
export function buildBundleFilename(now: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const ts =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `mediaforge_bundle_${ts}.zip`;
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
    const blob = await fetchAsBlob(url);
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

/** Fetch a remote URL as a Blob — same CORS-aware path used by the
 *  single-asset download. Throws on HTTP errors so the caller (e.g.
 *  the ZIP bundler) can surface a meaningful toast.
 *
 *  Exposed publicly so the multi-download ZIP path can reuse the
 *  exact same fetch behaviour (mode: "cors", credentials: "omit")
 *  that's been battle-tested with Supabase signed URLs + Replicate /
 *  Tripo / Kling CDNs. */
export async function fetchAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.blob();
}

/** Trigger a browser download from an already-resolved Blob. Used by
 *  the ZIP bundler to save the generated zip without re-downloading
 *  it from a server. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  triggerAnchor(objectUrl, filename);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
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
