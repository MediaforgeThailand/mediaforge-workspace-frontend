/**
 * Workspace mascot — small looping video pinned to the bottom-left
 * corner of the canvas page.
 *
 * ── Background removal (flood-fill, not luminance keying) ──────
 * The Magnific MP4 export has a solid coloured backdrop and no
 * alpha channel. The earlier luminance-key approach was wrong for
 * this content: a hard threshold on brightness can't tell apart
 * "subject's black eye" from "subject's black hoodie" from
 * "rectangular black bg" — they all sit at the same L-value, so
 * pixel keying clipped the eyes / hoodie alongside the backdrop.
 *
 * Flood fill solves it geometrically instead of by colour alone.
 * We sample the bg colour from the four CORNERS (median-per-channel
 * tolerates one corner accidentally being on the subject), then
 * walk outward from every edge pixel, removing connected pixels
 * within tolerance of that seed colour. The cat's eyes / hoodie
 * are surrounded by light fur, so the flood walks INTO the fur,
 * sees a colour mismatch, and stops there — the eyes / hoodie
 * never get visited and keep their alpha intact.
 *
 * Result: the rectangular bg is gone cleanly while every dark
 * detail enclosed by the subject silhouette is preserved.
 *
 * Hide via the dev-only `?mascot=off` query param.
 */

import { useEffect, useMemo, useRef } from "react";

const SRC = "/videos/workspace-mascot-4.mp4";

/* Display width in CSS px. The drawing canvas matches the source's
 * intrinsic aspect ratio so the mascot doesn't squish at this width. */
const WIDTH = 92;

/* RGB Euclidean-distance² threshold. A pixel within this distance
 * of the sampled bg colour is considered bg. Squared so the inner
 * loop avoids a sqrt — same shape, same threshold-tuning intuition.
 * 38 ≈ "noticeably similar" for 8-bit colour; bump up for noisy
 * compression-artefact backgrounds, down for tight-clean keys. */
const KEY_TOLERANCE = 38;
const KEY_TOLERANCE_SQ = KEY_TOLERANCE * KEY_TOLERANCE;

const WorkspaceMascot = () => {
  const hidden = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("mascot") === "off";
  }, []);

  if (hidden) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-2 left-2 z-[40] select-none"
      // Keep the mascot tucked into the canvas corner. The compact
      // tool palette is vertically centred, so the bottom-left corner
      // can stay visually quiet without reserving a wide gutter.
      // pointer-events-none so the mascot can't intercept canvas drags.
      aria-hidden="true"
    >
      <FloodFillVideo src={SRC} />
    </div>
  );
};

export default WorkspaceMascot;

/* ────────────────────────────────────────────────────────────
 * Flood-fill canvas video.
 *
 * On every animation frame:
 *   1. drawImage(video) onto a hidden canvas
 *   2. getImageData → raw bytes
 *   3. Sample bg colour from the 4 corners (median-per-channel)
 *   4. BFS-style flood fill seeded from every edge pixel, marking
 *      anything within tolerance of the sample as alpha=0
 *   5. putImageData back, render the canvas
 *
 * Why BFS specifically (not the entire frame): geometric
 * connectivity is what makes this approach safe for dark subject
 * details. We only "remove" pixels reachable from the outside
 * without crossing a colour mismatch — pixels inside the cat
 * silhouette are unreachable and survive untouched.
 * ──────────────────────────────────────────────────────────── */
function FloodFillVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  /** Reused per-frame so we don't reallocate a Uint8Array on every
   *  draw — reset to zero with `.fill(0)` instead. */
  const visitedRef = useRef<Uint8Array | null>(null);
  /** Reused too — flood fill stack of pixel-indices. */
  const stackRef = useRef<Int32Array | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let cancelled = false;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const onLoadedMetadata = () => {
      const aspect = video.videoWidth / Math.max(video.videoHeight, 1);
      canvas.width = WIDTH;
      canvas.height = Math.round(WIDTH / aspect) || WIDTH;
      const total = canvas.width * canvas.height;
      visitedRef.current = new Uint8Array(total);
      // Stack capacity = total pixels (worst case = whole frame is bg).
      stackRef.current = new Int32Array(total);
    };

    const drawFrame = () => {
      if (cancelled) return;
      if (
        video.readyState >= 2 &&
        !video.paused &&
        !video.ended &&
        canvas.width > 0
      ) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        floodFillBg(frame.data, canvas.width, canvas.height, visitedRef.current!, stackRef.current!);
        ctx.putImageData(frame, 0, 0);
      }
      rafRef.current = requestAnimationFrame(drawFrame);
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    rafRef.current = requestAnimationFrame(drawFrame);

    void video.play().catch(() => {});

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [src]);

  return (
    <>
      {/* Hidden source — decodes the mp4, never visible. */}
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        autoPlay
        loop
        disableRemotePlayback
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          width: WIDTH,
          height: "auto",
          filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.4))",
        }}
      />
    </>
  );
}

/**
 * In-place BFS flood fill that walks from every edge pixel inward,
 * marking each pixel within `KEY_TOLERANCE` of the median-corner
 * colour as fully transparent.
 *
 * Same buffer reused across frames so we don't churn the GC; the
 * caller passes pre-allocated `visited` (Uint8Array, one byte per
 * pixel) and `stack` (Int32Array sized to the total pixel count).
 */
function floodFillBg(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  visited: Uint8Array,
  stack: Int32Array,
) {
  visited.fill(0);

  // Sample bg colour: median-per-channel of the 4 corners. Median
  // tolerates ONE corner accidentally being on the subject (e.g.
  // tail extending to the bottom-right) — the other three vote it
  // down. If MORE than one corner is on the subject we'd want a
  // smarter sampler, but for centred-cat exports the 3-of-4 case
  // is the realistic worst.
  const tl = 0;
  const tr = (width - 1) * 4;
  const bl = (height - 1) * width * 4;
  const br = (height * width - 1) * 4;
  const r0 = median4(data[tl], data[tr], data[bl], data[br]);
  const g0 = median4(data[tl + 1], data[tr + 1], data[bl + 1], data[br + 1]);
  const b0 = median4(data[tl + 2], data[tr + 2], data[bl + 2], data[br + 2]);

  // Stack pointer (so we don't pay the cost of an Array's length
  // resizing — Int32Array is fixed length, we just track top).
  let sp = 0;

  // Seed: every pixel along the four edges. Seeding the full
  // border (rather than just the corners) means the flood doesn't
  // need to walk along the edge first; concave bg shapes get
  // reached even if a corner is occluded by the subject.
  for (let x = 0; x < width; x++) {
    stack[sp++] = x;                       // top edge
    stack[sp++] = (height - 1) * width + x; // bottom edge
  }
  for (let y = 0; y < height; y++) {
    stack[sp++] = y * width;                // left edge
    stack[sp++] = y * width + width - 1;    // right edge
  }

  while (sp > 0) {
    const idx = stack[--sp];
    if (visited[idx]) continue;

    const i = idx * 4;
    const dr = data[i] - r0;
    const dg = data[i + 1] - g0;
    const db = data[i + 2] - b0;
    if (dr * dr + dg * dg + db * db > KEY_TOLERANCE_SQ) continue;

    visited[idx] = 1;
    data[i + 3] = 0; // alpha → 0

    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0 && !visited[idx - 1]) stack[sp++] = idx - 1;
    if (x < width - 1 && !visited[idx + 1]) stack[sp++] = idx + 1;
    if (y > 0 && !visited[idx - width]) stack[sp++] = idx - width;
    if (y < height - 1 && !visited[idx + width]) stack[sp++] = idx + width;
  }
}

function median4(a: number, b: number, c: number, d: number): number {
  // Sort 4 numbers ascending, return mean of the middle two. Cheap
  // 4-element sort via swaps (avoids creating a temporary array
  // and the GC churn that comes with it on a per-frame hot path).
  if (a > b) [a, b] = [b, a];
  if (c > d) [c, d] = [d, c];
  if (a > c) [a, c] = [c, a];
  if (b > d) [b, d] = [d, b];
  // After the above, b and c are the two middle values.
  return (b + c) >> 1;
}
