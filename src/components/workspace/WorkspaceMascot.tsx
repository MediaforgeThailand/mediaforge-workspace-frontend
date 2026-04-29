/**
 * Workspace mascot — small looping video pinned to the bottom-left
 * corner of the canvas page.
 *
 * Source is a plain MP4 (H.264) — no alpha channel. We render it
 * with a `<video>` element straight onto the page; the dark canvas
 * background absorbs the matching dark frame around the subject so
 * no keying / blend-mode workarounds are needed. (Previous attempts
 * at runtime bg-removal clipped intentionally-dark detail like the
 * subject's eyes / hoodie, so the team explicitly asked for the
 * "as-is" rendering.)
 *
 * Hide via the dev-only `?mascot=off` query param if it gets in
 * the way (`/app/workspace/<id>?mascot=off`).
 */

import { useMemo } from "react";

const SRC = "/videos/workspace-mascot-4.mp4";

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
