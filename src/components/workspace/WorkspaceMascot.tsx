/**
 * Workspace mascot — small looping video pinned to the bottom-left
 * corner of the canvas page. Plays muted + looped, alpha channel
 * preserved (transparent background) on browsers that decode VP9
 * with alpha (Chrome / Edge / Firefox; Safari falls back to opaque).
 *
 * The source video lives at `public/videos/workspace-mascot.webm`,
 * generated from the original QuickTime RLE master via:
 *   ffmpeg -i workspace-mascot.mov \
 *          -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 1200k -an \
 *          workspace-mascot.webm
 * (yuva420p is the alpha-channel pixel format VP9 needs).
 *
 * Hide via the dev-only `?mascot=off` query param if it gets in the
 * way (`/app/workspace/<id>?mascot=off`).
 */

import { useMemo } from "react";

const WEBM_SRC = "/videos/workspace-mascot.webm";

const WorkspaceMascot = () => {
  const hidden = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("mascot") === "off";
  }, []);

  if (hidden) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-3 left-[64px] z-[40] select-none"
      // 64px clears the compact tool palette (52px) + a small gutter.
      // pointer-events-none so the mascot can't intercept canvas drags.
      aria-hidden="true"
    >
      <video
        src={WEBM_SRC}
        autoPlay
        loop
        muted
        playsInline
        // Suppress Safari's AirPlay icon overlay on autoplay videos.
        disableRemotePlayback
        className="h-auto w-[180px] drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      />
    </div>
  );
};

export default WorkspaceMascot;
