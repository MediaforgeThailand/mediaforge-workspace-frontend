/**
 * bundleNodes — multi-download as ZIP for the workspace canvas.
 *
 * Walks a list of selected React Flow nodes, harvests every asset URL
 * worth saving (asset previews, every entry in `generations[]`, 3D
 * model posters, …), fetches each one as a blob, names it with the
 * canonical `mediaforge_<sanitized-node-name>[-N].<ext>` convention
 * shared by the single-download buttons, and packs the lot into a
 * single ZIP downloaded as `mediaforge_bundle_<YYYYMMDD-HHmm>.zip`.
 *
 * Entry point is `bundleNodesAsZip(nodes)`. It returns a Promise that
 * resolves to a small report: how many files actually made it in, how
 * many failed (CORS / 404 / signed-URL expired), and the bundle name.
 *
 * Concurrency is capped at 6 in-flight fetches — enough to saturate
 * a typical broadband link without opening so many sockets that
 * Chrome starts queueing connections (which kills perceived progress
 * and can trigger `net::ERR_INSUFFICIENT_RESOURCES` on selections of
 * 50+ tiles). The cap is identical to the browser's default limit
 * per origin, so we never starve other foreground requests.
 *
 * Errors per-file are NEVER fatal — the bundle still completes with
 * the assets that did fetch, and the caller can show a partial-
 * success toast. Only an empty bundle (0 successes) is treated as a
 * hard failure so the user doesn't get a 22-byte "I bundled
 * nothing" zip.
 */

import JSZip from "jszip";
import type { Node } from "@xyflow/react";

import {
  buildBundleFilename,
  buildDownloadFilename,
  extFromGenType,
  extFromUrl,
  fetchAsBlob,
  triggerBlobDownload,
} from "./downloadAsset";

const CONCURRENCY = 6;

/** Per-asset descriptor produced by the harvest step. */
interface AssetRef {
  /** URL to fetch. */
  url: string;
  /** Final filename inside the ZIP, derived via buildDownloadFilename. */
  filename: string;
}

export interface BundleResult {
  /** Filename used for the downloaded ZIP. */
  bundleName: string;
  /** Count of assets we attempted to fetch. */
  attempted: number;
  /** Count of assets actually packed into the ZIP. */
  succeeded: number;
  /** Count of assets that failed (CORS / 404 / etc.). */
  failed: number;
  /** First underlying error message, if any (used in the failure toast). */
  firstError?: string;
}

/** Resolve the human-friendly display name for a node — matches the
 *  ordering used by the single-download / lightbox label resolution
 *  so a node's ZIP filename matches its title bar. */
function resolveNodeName(node: Node): string {
  const d = (node.data ?? {}) as Record<string, unknown>;
  const params = d.params as Record<string, unknown> | undefined;
  return (
    (params?.nodeName as string | undefined) ||
    (d.label as string | undefined) ||
    (d.name as string | undefined) ||
    node.id
  );
}

/** Pick the right extension for a generation object, preferring an
 *  extension actually present in the URL (so that a `.webp` from
 *  GPT-Image-2 keeps its original encoding) and falling back to the
 *  canonical mapping per `g.type`. */
function extForGeneration(g: Record<string, unknown>): string {
  const url =
    (g.model_url as string | undefined) ?? (g.url as string | undefined);
  if (url) {
    const fromUrl = extFromUrl(url);
    if (fromUrl !== "bin") return fromUrl;
  }
  return extFromGenType(g.type as string | undefined);
}

/**
 * Walk a single node and yield every downloadable asset.
 *
 *   - assetNode      → previewUrl (or storagePath fallback)
 *   - elementNode    → frontal / thumbnail / refs (best-effort)
 *   - tool nodes     → every entry in `generations[]` that has a URL
 *                     OR `model_url` (Tripo3D 3D output)
 *   - groupNode      → walked via its children separately by the
 *                     caller (the bundler iterates the FLAT selection,
 *                     so a selected group + its children both contribute
 *                     — duplicates are dedup'd by URL).
 *
 * Single-asset nodes get an unsuffixed filename. Multi-generation
 * nodes get `-1`, `-2`, … per the spec.
 */
export function harvestAssetsFromNode(node: Node): AssetRef[] {
  const out: AssetRef[] = [];
  const d = (node.data ?? {}) as Record<string, unknown>;
  const name = resolveNodeName(node);

  // ── AssetNode — direct upload ──
  if (node.type === "assetNode") {
    const url =
      (d.previewUrl as string | undefined) ??
      (d.storagePath as string | undefined);
    if (url) {
      out.push({
        url,
        filename: buildDownloadFilename(name, extFromUrl(url) || "bin"),
      });
    }
    return out;
  }

  // ── ElementNode — refs / frontal / thumbnail ──
  if (node.type === "elementNode") {
    const candidates: Array<string | undefined> = [
      d.frontal_image_url as string | undefined,
      d.thumbnail_url as string | undefined,
      ...((Array.isArray(d.reference_images)
        ? (d.reference_images as unknown[]).filter(
            (u): u is string => typeof u === "string" && !!u,
          )
        : []) as string[]),
    ];
    const urls = candidates.filter(
      (u): u is string => typeof u === "string" && !!u,
    );
    if (urls.length === 1) {
      out.push({
        url: urls[0],
        filename: buildDownloadFilename(name, extFromUrl(urls[0])),
      });
    } else {
      urls.forEach((url, i) => {
        out.push({
          url,
          filename: buildDownloadFilename(name, extFromUrl(url), i),
        });
      });
    }
    return out;
  }

  // ── Tool node — every entry in generations[] ──
  const gens = Array.isArray(d.generations)
    ? (d.generations as Array<Record<string, unknown>>)
    : [];
  if (gens.length === 0) return out;

  const usable = gens.filter((g) => {
    const u =
      (g.model_url as string | undefined) ?? (g.url as string | undefined);
    return typeof u === "string" && !!u;
  });
  if (usable.length === 0) return out;

  // Single generation → no suffix; multi → suffix per spec.
  const useIndex = usable.length > 1;
  usable.forEach((g, i) => {
    const url =
      (g.model_url as string | undefined) ?? (g.url as string | undefined);
    if (!url) return;
    const ext = extForGeneration(g);
    out.push({
      url,
      filename: buildDownloadFilename(name, ext, useIndex ? i : undefined),
    });
  });
  // For 3D nodes Tripo also emits a poster (rendered_image) on
  // generation `url` while the model lives at `model_url`. The
  // harvester above prefers `model_url` for the GLB; we don't also
  // pack the poster here — it's a screenshot the user can re-render
  // by opening the lightbox, and packing both would double the file
  // count for every 3D selection.
  return out;
}

/** Run a list of async tasks with a concurrency cap. Order of
 *  completion is unimportant — JSZip writes by name, not order. */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: Error }>> {
  const results: Array<
    { ok: true; value: R } | { ok: false; error: Error }
  > = new Array(items.length);
  let cursor = 0;
  async function pump() {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = { ok: true, value: await worker(items[idx]) };
      } catch (err) {
        results[idx] = {
          ok: false,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => pump(),
  );
  await Promise.all(workers);
  return results;
}

/** Harvest every asset across a flat node list, deduplicate by URL,
 *  disambiguate filename collisions (two nodes named "Asset" → keep
 *  both with `-1`, `-2` suffix appended at the bundler level). */
function collectAndDedupe(nodes: Node[]): AssetRef[] {
  const seenUrls = new Set<string>();
  const collected: AssetRef[] = [];
  for (const n of nodes) {
    for (const ref of harvestAssetsFromNode(n)) {
      if (seenUrls.has(ref.url)) continue;
      seenUrls.add(ref.url);
      collected.push(ref);
    }
  }

  // Filename-collision pass — if two nodes share a sanitized name AND
  // a single output (no per-gen suffix), the ZIP would otherwise
  // overwrite one. Append a unique numeric suffix.
  const filenameCount = new Map<string, number>();
  return collected.map((ref) => {
    const seen = filenameCount.get(ref.filename) ?? 0;
    filenameCount.set(ref.filename, seen + 1);
    if (seen === 0) return ref;
    // Re-build the filename with an N suffix.
    const dot = ref.filename.lastIndexOf(".");
    const stem =
      dot >= 0 ? ref.filename.slice(0, dot) : ref.filename;
    const ext = dot >= 0 ? ref.filename.slice(dot + 1) : "bin";
    return { url: ref.url, filename: `${stem}-${seen + 1}.${ext}` };
  });
}

/**
 * Public entry — bundle every downloadable asset across `nodes` into
 * a single ZIP, then trigger the browser download. Returns a small
 * report so the caller can render an accurate "Downloaded N items"
 * toast (vs. "Downloaded N of M, K failed" when partial).
 */
export async function bundleNodesAsZip(
  nodes: Node[],
): Promise<BundleResult> {
  const refs = collectAndDedupe(nodes);
  const bundleName = buildBundleFilename();

  if (refs.length === 0) {
    return {
      bundleName,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      firstError: "No downloadable assets in selection",
    };
  }

  const zip = new JSZip();
  const fetched = await runWithConcurrency(refs, CONCURRENCY, async (ref) => {
    const blob = await fetchAsBlob(ref.url);
    return { ref, blob };
  });

  let succeeded = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (const r of fetched) {
    if (r.ok) {
      // `binary: true` opt-out — JSZip auto-detects from Blob, but
      // explicit binary mode skips a needless utf8 sniff for media.
      zip.file(r.value.ref.filename, r.value.blob, { binary: true });
      succeeded++;
    } else {
      failed++;
      if (!firstError) firstError = r.error.message;
    }
  }

  if (succeeded === 0) {
    return {
      bundleName,
      attempted: refs.length,
      succeeded,
      failed,
      firstError: firstError ?? "All asset fetches failed",
    };
  }

  const blob = await zip.generateAsync({
    type: "blob",
    // Media files are already compressed (jpg / mp4 / mp3 / glb);
    // STORE skips the deflate pass that would chew CPU for ~0%
    // savings. Keeps the bundle generation snappy on 50-tile
    // selections.
    compression: "STORE",
  });
  triggerBlobDownload(blob, bundleName);

  return {
    bundleName,
    attempted: refs.length,
    succeeded,
    failed,
    firstError,
  };
}
