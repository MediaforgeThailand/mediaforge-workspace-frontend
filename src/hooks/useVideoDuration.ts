import { useState, useEffect, useRef } from "react";

/**
 * useVideoDuration — Extracts duration from a video URL using an invisible
 * HTML5 <video> element with `preload="metadata"`.
 *
 * Returns `null` while loading or if no URL is provided.
 * Returns `Math.ceil(duration)` once metadata loads.
 * Returns `null` on error (CORS, invalid URL, etc.).
 */
export function useVideoDuration(videoUrl: string | null | undefined): number | null {
  const [duration, setDuration] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setDuration(null);

    if (!videoUrl || typeof videoUrl !== "string" || videoUrl.trim() === "") {
      return;
    }

    // Skip non-URL values (e.g. placeholder text)
    if (!/^(https?:\/\/|blob:|data:)/.test(videoUrl)) {
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.style.display = "none";
    videoRef.current = video;

    const handleLoaded = () => {
      if (video.duration && isFinite(video.duration)) {
        setDuration(Math.ceil(video.duration));
      }
    };

    const handleError = () => {
      console.warn("[useVideoDuration] Failed to load metadata for:", videoUrl);
      setDuration(null);
    };

    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("error", handleError);
    video.src = videoUrl;

    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("error", handleError);
      video.pause();
      video.removeAttribute("src");
      video.load();
      videoRef.current = null;
    };
  }, [videoUrl]);

  return duration;
}

/**
 * Imperative version — returns a Promise<number> for one-off extraction.
 * Useful in edge functions or non-React contexts.
 */
export function extractVideoDuration(videoUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.style.display = "none";

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoad);
      video.removeEventListener("error", onError);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    const onLoad = () => {
      if (video.duration && isFinite(video.duration)) {
        const dur = Math.ceil(video.duration);
        cleanup();
        resolve(dur);
      } else {
        cleanup();
        reject(new Error("Could not determine video duration"));
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error(`Failed to load video metadata: ${videoUrl}`));
    };

    video.addEventListener("loadedmetadata", onLoad);
    video.addEventListener("error", onError);
    video.src = videoUrl;
  });
}
