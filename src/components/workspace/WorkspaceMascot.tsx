/**
 * Workspace mascot — small looping video pinned to the bottom-left
 * corner of the canvas page.
 *
 * The current export carries a real VP9 alpha channel, so we render
 * it with a plain `<video>` element and let the browser composite
 * it directly — no canvas keying, no luminance threshold. The
 * earlier canvas-keyed pipeline was clipping the cat's BLACK EYES
 * (luminance under the threshold looked the same as a solid-black
 * backdrop to the keyer), and that's the kind of false-positive
 * pixel keying always loses on. With a real alpha channel in the
 * source the browser handles every transparent / semi-transparent
 * pixel correctly out of the box.
 *
 * Hide via the dev-only `?mascot=off` query param if it gets in
 * the way (`/app/workspace/<id>?mascot=off`).
 */

import { useMemo } from "react";

const SRC = "/videos/workspace-mascot-3.webm";

/* Display width in CSS px. Bumped DOWN from 180 → 130 — the team
 * felt the previous clip ate too much corner real-estate next to
 * the compact tool palette. */
const WIDTH = 130;

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
      <video
        src={SRC}
        autoPlay
        loop
        muted
        playsInline
        // Suppress Safari's AirPlay icon overlay on autoplay videos.
        disableRemotePlayback
        style={{
          width: WIDTH,
          height: "auto",
          filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.4))",
        }}
      />
    </div>
  );
};

export default WorkspaceMascot;
