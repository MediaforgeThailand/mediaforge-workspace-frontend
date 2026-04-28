/**
 * Workspace mascot — small looping video pinned to the bottom-left
 * corner of the canvas page.
 *
 * The mascot now ALTERNATES between two clips on a 2-1-2-1 cadence:
 *   • clip B (Magnific export, bottom-left teaser) → 2 plays
 *   • clip A (original mascot, alpha-channel webm)  → 1 play
 *   • repeat indefinitely
 *
 * Why two clips: the team wanted more visual variety than a single
 * looped 2-second clip but didn't want them stacked side-by-side
 * (would crowd the corner). Sequencing them through the same
 * 180-px slot trades simultaneity for pacing — the user notices a
 * "scene change" every few seconds without the mascot taking up
 * more screen real estate.
 *
 * The Magnific clip has a SOLID DARK background (no alpha channel).
 * We knock it out at render time with `mix-blend-mode: screen`,
 * which makes pure black render as transparent against the canvas's
 * dark backdrop (hsl(0 0% 5%)) — close enough to bg-removal that
 * the team's eye can't tell the difference and we sidestep an
 * ffmpeg pre-process. The original alpha-channel clip renders
 * normally; the blend mode is a no-op on already-transparent pixels.
 *
 * Source files:
 *   public/videos/workspace-mascot.webm   (clip A — alpha)
 *   public/videos/workspace-mascot-2.webm (clip B — Magnific export)
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
   *  Magnific export doesn't — we'll knock its dark backdrop out
   *  with mix-blend-mode at render time. */
  hasAlpha: boolean;
}

const SEQUENCE: ClipConfig[] = [
  { src: "/videos/workspace-mascot-2.webm", plays: 2, hasAlpha: false },
  { src: "/videos/workspace-mascot.webm", plays: 1, hasAlpha: true },
];

const WorkspaceMascot = () => {
  const hidden = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("mascot") === "off";
  }, []);

  /* Sequence cursor — index into SEQUENCE plus how many times the
   * current clip has already played. When `playsDone === clip.plays`
   * we advance to the next clip and reset the counter. */
  const [step, setStep] = useState(0);
  const playsDoneRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Reset the play counter whenever we move to a new clip — without
  // this, a fast successive `ended` could skip a clip entirely.
  useEffect(() => {
    playsDoneRef.current = 0;
  }, [step]);

  if (hidden) return null;

  const clip = SEQUENCE[step % SEQUENCE.length];

  const handleEnded = () => {
    playsDoneRef.current += 1;
    const v = videoRef.current;
    if (!v) return;
    if (playsDoneRef.current < clip.plays) {
      // Still within this clip's required play count — replay it.
      v.currentTime = 0;
      void v.play();
    } else {
      // Move to the next clip in the sequence.
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
      <video
        // `key` forces a fresh <video> mount per clip — React's
        // diff-of-the-`src`-attribute on a single element does NOT
        // restart playback reliably on Chromium / Safari, and we end
        // up with a frozen first frame between clips. A new mount is
        // cheap (180-px webm) and bulletproof.
        key={clip.src}
        ref={videoRef}
        src={clip.src}
        autoPlay
        muted
        playsInline
        onEnded={handleEnded}
        // Suppress Safari's AirPlay icon overlay on autoplay videos.
        disableRemotePlayback
        className="h-auto w-[180px] drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        style={
          clip.hasAlpha
            ? undefined
            : {
                // `screen` blend treats black as transparent against
                // the dark canvas — works because the workspace
                // background is hsl(0 0% 5%) and the Magnific export
                // is solid black. If we ever switch to a light theme
                // canvas we'll need a real alpha-channel re-encode.
                mixBlendMode: "screen",
              }
        }
      />
    </div>
  );
};

export default WorkspaceMascot;
