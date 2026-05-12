/**
 * Browser-side helpers that pull the first and last visible frames out
 * of a `<video>` element and upload them to Supabase storage as JPEGs.
 *
 * Used by AssetNode (uploaded video files) AND by WorkspaceToolNode
 * (AI-generated video outputs) so that downstream image models receive
 * a real image URL instead of the raw video URL. Without this step
 * Gemini / Banana / OpenAI return 400 "Unable to process input image"
 * when an end-frame port is wired into their image_url slot.
 */

import { supabase } from "@/integrations/supabase/client";

const STORAGE_BUCKET = "ai-media";
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 365;

export function safeStorageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96) || "asset";
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "loadeddata" | "seeked",
  timeoutMs = 15_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for video ${eventName}`));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onReady);
      video.removeEventListener("error", onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not load video for frame extraction"));
    };
    video.addEventListener(eventName, onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  if (video.readyState < 2) {
    await waitForVideoEvent(video, "loadeddata");
  }
  if (Math.abs(video.currentTime - time) < 0.02) return;
  const seeked = waitForVideoEvent(video, "seeked");
  video.currentTime = time;
  await seeked;
}

export async function captureVideoFrameBlob(
  sourceUrl: string,
  position: "start" | "end",
): Promise<Blob> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const metadataReady = waitForVideoEvent(video, "loadedmetadata");
  video.src = sourceUrl;
  video.load();
  await metadataReady;

  const duration = Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : 0;
  const nudge = duration > 0 ? Math.min(0.12, Math.max(0.04, duration * 0.02)) : 0;
  const targetTime =
    position === "end"
      ? Math.max(0, duration - nudge)
      : Math.min(duration > 0 ? nudge : 0, 0.05);

  await seekVideo(video, targetTime);

  const width = video.videoWidth || 1;
  const height = video.videoHeight || 1;
  const scale = Math.min(1, 1920 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare video frame canvas");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  video.removeAttribute("src");
  video.load();

  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Could not capture video frame"));
        },
        "image/jpeg",
        0.88,
      );
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function uploadExtractedFrame(blob: Blob, path: string): Promise<string> {
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, blob, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    throw error ?? new Error("Could not sign extracted video frame");
  }
  return data.signedUrl;
}

/**
 * Capture both ends of a video and upload them under `basePath/start.jpg`
 * and `basePath/end.jpg`. Returns the signed URLs of both frames.
 */
export async function extractAndUploadVideoFrames(
  sourceUrl: string,
  basePath: string,
): Promise<{ startFrameUrl: string; endFrameUrl: string }> {
  const [startBlob, endBlob] = await Promise.all([
    captureVideoFrameBlob(sourceUrl, "start"),
    captureVideoFrameBlob(sourceUrl, "end"),
  ]);
  const [startFrameUrl, endFrameUrl] = await Promise.all([
    uploadExtractedFrame(startBlob, `${basePath}/start.jpg`),
    uploadExtractedFrame(endBlob, `${basePath}/end.jpg`),
  ]);
  return { startFrameUrl, endFrameUrl };
}
