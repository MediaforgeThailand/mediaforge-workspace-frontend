/**
 * Workspace mascot — small looping video pinned to the bottom-left
 * corner of the canvas page.
 *
 * The mascot ALTERNATES between two clips on a 2-1 cadence:
 *   • clip B (Magnific export)   → 2 plays
 *   • clip A (original mascot)   → 1 play
 *   • repeat indefinitely
 *
 * ── Background removal ────────────────────────────────────────
 * The Magnific export ships with a SOLID-BLACK background and no
 * alpha channel. The earlier `mix-blend-mode: screen` workaround
 * also knocked out the cat's BLACK HOODIE because screen-blend
 * treats any dark pixel as "transparent" against a dark canvas.
 *
 * Better path that doesn't need ffmpeg + an alpha re-encode: render
 * each frame to a `<canvas>` and apply a tight luminance threshold
 * — pixels brighter than the bg but darker than the hoodie's
 * darkest fabric pixel keep their alpha, anything below the cut
 * goes to alpha=0. The cut sits at L<10 (out of 255), well below
 * fabric-texture noise (~30–60), so the bg dies cleanly while the
 * hoodie stays solid. A small linear ramp 10–22 feathers the
 * transition so the cat doesn't get a hard pixelated outline.
 *
 * The original alpha-channel clip needs none of this — it renders
 * as a plain `<video>` element.
 *
 * Source files:
 *   public/videos/workspace-mascot.webm   (clip A — alpha)
 *   public/videos/workspace-mascot-2.webm (clip B — Magnific)
 *
 * Hide via the dev-only `?mascot=off` query param if it gets in the
 * way (`/app/workspace/<id>?mascot=off`).
 */

import { useEffect, useMemo, useRef, useState } from "react";

interface ClipConfig {
  src: string;
  /** How many full plays of this clip before advancing to the next. */
  plays: number;
  /** Whether the source already carries an alpha channel. The
   *  Magnific export doesn't — we knock its dark backdrop out
   *  via canvas-based luminance keying at render time. */
  hasAlpha: boolean;
}

const SEQUENCE: ClipConfig[] = [
  { src: "/videos/workspace-mascot-2.webm", plays: 2, hasAlpha: false },
  { src: "/videos/workspace-mascot.webm", plays: 1, hasAlpha: true },
];

/* Luminance-key cutoffs for the Magnific clip's black bg. Below
 * `KEY_OUT` → alpha=0 (gone). Above `KEY_IN` → alpha=255 (keep).
 * Between → linear feather so the cat keeps a soft edge. Tuned by
 * eye against the actual webm; bump KEY_OUT up if a faint dark
 * halo persists, push it down if the cat's deepest shadows start
 * to ghost. */
const KEY_OUT = 10;
const KEY_IN = 22;

const WIDTH = 180;

const WorkspaceMascot = () => {
  const hidden = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("mascot") === "off";
  }, []);

  const [step, setStep] = useState(0);
  const playsDoneRef = useRef(0);

  // Reset play counter on clip change so a fast successive `ended`
  // can't cause the sequence to skip a clip.
  useEffect(() => {
    playsDoneRef.current = 0;
  }, [step]);

  if (hidden) return null;

  const clip = SEQUENCE[step % SEQUENCE.length];

  const onClipEnded = () => {
    playsDoneRef.current += 1;
    if (playsDoneRef.current >= clip.plays) {
      setStep((s) => s + 1);
    }
  };

  return (
    <div
      className="pointer-events-none fixed bottom-3 left-[64px] z-[40] select-none"
      // 64px clears the compact tool palette (52px) + a small gutter.
      // pointer-events-none so the mascot can't intercept canvas drags.
      aria-hidden="true"
    >
      {clip.hasAlpha ? (
        <PlainVideo
          // `key` forces a fresh mount per clip — toggling the `src`
          // attribute on a single <video> doesn't restart playback
          // reliably across browsers.
          key={clip.src}
          src={clip.src}
          onEnded={onClipEnded}
          replay={() => undefined /* loop handled by re-mount */}
        />
      ) : (
        <KeyedCanvasVideo
          key={clip.src}
          src={clip.src}
          plays={clip.plays}
          onSequenceEnd={() => setStep((s) => s + 1)}
        />
      )}
    </div>
  );
};

export default WorkspaceMascot;

/* ────────────────────────────────────────────────────────────
 * Plain video — alpha clips render straight, no canvas needed.
 * ──────────────────────────────────────────────────────────── */
function PlainVideo({
  src,
  onEnded,
}: {
  src: string;
  onEnded: () => void;
  /** Unused — kept so the call-site signature mirrors the canvas
   *  variant. The plain `<video>` self-replays on re-mount. */
  replay: () => void;
}) {
  return (
    <video
      src={src}
      autoPlay
      muted
      playsInline
      onEnded={onEnded}
      disableRemotePlayback
      className="h-auto w-[180px] drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
    />
  );
}

/* ────────────────────────────────────────────────────────────
 * Keyed canvas video — pulls frames from a hidden <video>, runs
 * a luminance threshold, paints to a visible <canvas>. The
 * <video> handles decode + audio-less playback; we just sample.
 *
 * Why this beats `mix-blend-mode: screen`: blend modes operate on
 * COMPOSITED output, so "black bg on dark canvas" and "black
 * hoodie on dark canvas" are indistinguishable to screen-blend —
 * both look dark, both get treated as transparent. By contrast,
 * a per-pixel luminance check on the SOURCE distinguishes pure-
 * black bg pixels (L≈0) from hoodie texture (L≈30+) before any
 * compositing. The hoodie survives.
 * ──────────────────────────────────────────────────────────── */
function KeyedCanvasVideo({
  src,
  plays,
  onSequenceEnd,
}: {
  src: string;
  plays: number;
  onSequenceEnd: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playsDoneRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let cancelled = false;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    /** Sized once per loaded clip — the keying pass needs a bitmap
     *  buffer that matches the source video's intrinsic size. */
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
            // Linear feather between the two cuts.
            data[i + 3] = Math.round(((lum - KEY_OUT) / (KEY_IN - KEY_OUT)) * 255);
          }
          // else lum >= KEY_IN → leave alpha at 255 (default).
        }
        ctx.putImageData(frame, 0, 0);
      }
      rafRef.current = requestAnimationFrame(drawFrame);
    };

    const handleEnded = () => {
      playsDoneRef.current += 1;
      if (playsDoneRef.current < plays) {
        // Replay this same clip — keep painting.
        video.currentTime = 0;
        void video.play();
      } else {
        // Sequence handover.
        onSequenceEnd();
      }
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("ended", handleEnded);
    rafRef.current = requestAnimationFrame(drawFrame);

    // Some browsers still need a manual play() after autoPlay attr
    // when sources change rapidly — fire-and-forget; if play()
    // rejects (autoplay policy), we'll catch it via the silent error.
    void video.play().catch(() => {});

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("ended", handleEnded);
    };
  }, [src, plays, onSequenceEnd]);

  return (
    <>
      {/* Hidden source — decodes the webm, never visible. The
       *  `playsInline` + `muted` combo lets autoplay through every
       *  modern browser's policy. `crossOrigin` left default since
       *  the video is same-origin (served from /public). */}
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        autoPlay
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
          filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.45))",
        }}
      />
    </>
  );
}
