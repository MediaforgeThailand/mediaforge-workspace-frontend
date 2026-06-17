// Renders a pillar's HyperFrames MP4 when it exists, with the animated SVG
// diagram as an always-present base (and graceful fallback if the video is
// missing or errors). Video plays only while in view and pauses under
// prefers-reduced-motion.
import { useEffect, useRef, useState } from "react";
import { pillarDiagram } from "../diagrams";

export default function PillarVideo({
  id,
  video,
  poster,
}: {
  id: string;
  video: string;
  poster: string;
}) {
  const Diagram = pillarDiagram[id];
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (reduced) return;
        if (entry.isIntersecting) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.2 },
    );
    io.observe(wrap);
    return () => io.disconnect();
  }, [hasVideo]);

  return (
    <div
      ref={wrapRef}
      className="relative aspect-video w-full overflow-hidden rounded-2xl bg-[#0d0f10] ring-1 ring-primary/15"
    >
      {/* Base: always-present animated diagram */}
      <div className="absolute inset-0 p-4">{Diagram ? <Diagram /> : null}</div>

      {/* Enhancement: HyperFrames video, fades in once it can play */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
        style={{ opacity: hasVideo ? 1 : 0 }}
        muted
        loop
        playsInline
        preload="metadata"
        poster={poster}
        onCanPlay={() => setHasVideo(true)}
        onError={() => setHasVideo(false)}
      >
        <source src={video} type="video/mp4" />
      </video>

      {/* corner HUD label */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-primary/80">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        {hasVideo ? "MOTION" : "LIVE"}
      </div>
    </div>
  );
}
