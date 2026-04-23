import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface OptimizedVideoProps {
  /** Primary video source (mp4 or webm) */
  src: string;
  /** Alternative source for dual-format (e.g. mp4 fallback when src is webm) */
  fallbackSrc?: string;
  /** WebP/jpg poster image shown instantly while video buffers */
  poster?: string;
  className?: string;
  /** CSS aspect ratio e.g. "3/4", "16/9" */
  aspectRatio?: string;
  /** Play only on hover (default false = autoplay when visible) */
  hoverPlay?: boolean;
  /** Scale on hover */
  hoverScale?: number;
  /** Callback when video errors */
  onError?: () => void;
}

const OptimizedVideo = ({
  src,
  fallbackSrc,
  poster,
  className,
  aspectRatio,
  hoverPlay = false,
  hoverScale,
  onError,
}: OptimizedVideoProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // IntersectionObserver — load video only when near viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Pause/play based on visibility + hoverPlay mode
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (!isVisible) {
      vid.pause();
      return;
    }

    if (!hoverPlay) {
      vid.play().catch(() => {});
    }
  }, [isVisible, hoverPlay]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (hoverPlay && videoRef.current && isVisible) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [hoverPlay, isVisible]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    if (hoverPlay && videoRef.current) {
      videoRef.current.pause();
    }
  }, [hoverPlay]);

  const handleError = useCallback(() => {
    setHasError(true);
    onError?.();
  }, [onError]);

  // Determine source types
  const srcType = src.includes(".webm") ? "video/webm" : "video/mp4";
  const fallbackType = fallbackSrc
    ? fallbackSrc.includes(".webm")
      ? "video/webm"
      : "video/mp4"
    : undefined;

  const containerStyle = aspectRatio ? { aspectRatio } : undefined;
  const scaleStyle =
    hoverScale && isHovered
      ? { transform: `scale(${hoverScale})`, transition: "transform 0.4s ease-out" }
      : hoverScale
        ? { transform: "scale(1)", transition: "transform 0.4s ease-out" }
        : undefined;

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      style={containerStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {hasError ? (
        poster ? (
          <img
            src={poster}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/15 via-accent/5 to-muted/10" />
        )
      ) : (
        <video
          ref={videoRef}
          autoPlay={!hoverPlay}
          muted
          loop
          playsInline
          preload={isVisible ? "metadata" : "none"}
          disableRemotePlayback
          controls={false}
          poster={poster}
          className="w-full h-full object-cover"
          style={scaleStyle}
          onError={handleError}
          // @ts-ignore
          controlsList="nodownload"
        >
          {isVisible && (
            <>
              <source src={src} type={srcType} />
              {fallbackSrc && <source src={fallbackSrc} type={fallbackType} />}
            </>
          )}
        </video>
      )}
    </div>
  );
};

export default OptimizedVideo;
