/**
 * Workspace mascot — small looping video pinned to the bottom-left
 * corner of the canvas page.
 *
 * Single clip now (the team replaced the alternating Magnific +
 * alpha-channel pair with one new export). Bg-removal still runs
 * through the canvas luminance-key pipeline because:
 *
 *   • If the webm carries a real alpha channel, drawImage preserves
 *     it and our key loop only touches pixels with luminance < 22 —
 *     which is never reached on already-transparent (rgba 0,0,0,0)
 *     samples that other code paths ignored, so it's a no-op there.
 *   • If the webm has a solid dark backdrop (Magnific exports
 *     default to this), the same key loop knocks the bg out cleanly
 *     while keeping any near-black-but-not-pure-black detail (e.g.
 *     a black hoodie at L≈30+).
 *
 * That dual-mode keeps us safe regardless of which export style the
 * design hand-off uses next time without re-encoding.
 *
 * Hide via the dev-only `?mascot=off` query param.
 */

import { useEffect, useMemo, useRef } from "react";

const SRC = "/videos/workspace-mascot-3.webm";

/* Display width in CSS px. Bumped DOWN from 180 → 130 — the team
 * felt the previous clip ate too much corner real-estate next to
 * the compact tool palette. The drawn canvas matches the source's
 * intrinsic aspect ratio so the mascot doesn't squish at the new
 * width. */
const WIDTH = 130;

/* Luminance-key cutoffs. Below KEY_OUT → alpha 0 (gone). Above
 * KEY_IN → alpha kept. Between → linear feather so the silhouette
 * keeps a soft edge instead of a hard pixel-step outline. Tuned by
 * eye against multiple Magnific export styles; bump KEY_OUT up if
 * a faint dark halo persists, push it down if deep shadows ghost. */
const KEY_OUT = 10;
const KEY_IN = 22;

const WorkspaceMascot = () => {
  const hidden = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("mascot") === "off";
  }, []);

  if (hidden) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-3 left-[60px] z-[40] select-none"
      // 60px clears the compact tool palette (52px) + a small gutter.
      // pointer-events-none so the mascot can't intercept canvas drags.
      aria-hidden="true"
    >
      <KeyedCanvasVideo src={SRC} />
    </div>
  );
};

export default WorkspaceMascot;

/* ────────────────────────────────────────────────────────────
 * Keyed canvas video — pulls frames from a hidden <video>, runs
 * a luminance threshold, paints to a visible <canvas>. Self-loops
 * via the `loop` attribute on the source <video> so the rAF draw
 * loop just keeps painting; no manual sequence handover needed.
 *
 * Why not a plain <video>: even when the source has an alpha
 * channel, the browser composites the video against PAGE BACKGROUND
 * before our React tree gets to apply blend modes — and blend
 * modes can't reliably distinguish "subject's black hoodie" from
 * "background black". Pulling pixels into a canvas first lets us
 * inspect each one before deciding whether to keep it.
 * ──────────────────────────────────────────────────────────── */
function KeyedCanvasVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let cancelled = false;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    /** Sized once per loaded clip — the keying pass needs a bitmap
     *  buffer that matches the source's intrinsic aspect ratio. */
    const onLoadedMetadata = () => {
      const aspect = video.videoWidth / Math.max(video.videoHeight, 1);
      canvas.width = WIDTH;
      canvas.height = Math.round(WIDTH / aspect) || WIDTH;
    };

    const drawFrame = () => {
      if (cancelled) return;
      if (video.readyState >= 2 && !video.paused && !video.ended) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = frame.data;
        // Luminance-key pass. Rec. 709 weights for perceived L.
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (lum <= KEY_OUT) {
            data[i + 3] = 0;
          } else if (lum < KEY_IN) {
            data[i + 3] = Math.round(((lum - KEY_OUT) / (KEY_IN - KEY_OUT)) * 255);
          }
          // else → leave the source alpha alone (preserves real
          // alpha channels when the export carries one).
        }
        ctx.putImageData(frame, 0, 0);
      }
      rafRef.current = requestAnimationFrame(drawFrame);
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    rafRef.current = requestAnimationFrame(drawFrame);

    // Some browsers still need a manual play() after autoPlay attr
    // when sources change rapidly — fire-and-forget; if play()
    // rejects (autoplay policy), the rAF loop just keeps idling.
    void video.play().catch(() => {});

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [src]);

  return (
    <>
      {/* Hidden source — decodes the webm, never visible. The `loop`
       *  attribute restarts on `ended` automatically so the rAF
       *  draw loop keeps painting without a manual handover. */}
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
