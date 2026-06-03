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
const VIDEO_RECORDER_MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

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

function waitForImageLoad(image: HTMLImageElement, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out loading mask image"));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timeout);
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not load mask image"));
    };
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
  });
}

function invertCanvasPixels(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 255 - pixels[i];
    pixels[i + 1] = 255 - pixels[i + 1];
    pixels[i + 2] = 255 - pixels[i + 2];
  }
  ctx.putImageData(imageData, 0, 0);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Could not encode canvas output"));
        },
        mimeType,
        quality,
      );
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function preferredVideoRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return VIDEO_RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function captureVideoFrameAtSecondsBlob(
  sourceUrl: string,
  targetSeconds: number,
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
  const targetTime = Math.min(
    duration > 0 ? duration : Number.POSITIVE_INFINITY,
    Math.max(0, targetSeconds),
  );

  await seekVideo(video, Number.isFinite(targetTime) ? targetTime : 0);

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

  return canvasToBlob(canvas, "image/jpeg", 0.88);
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

  return canvasToBlob(canvas, "image/jpeg", 0.88);
}

export async function invertMaskImageBlob(sourceUrl: string): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  const ready = waitForImageLoad(image);
  image.src = sourceUrl;
  await ready;

  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare mask image canvas");
  ctx.drawImage(image, 0, 0, width, height);
  invertCanvasPixels(ctx, width, height);
  return canvasToBlob(canvas, "image/png");
}

export async function invertMaskVideoBlob(
  sourceUrl: string,
  options: {
    fps?: number;
    frameLoadCap?: number;
    onProgress?: (progress: { frame: number; totalFrames: number }) => void;
  } = {},
): Promise<Blob> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser cannot encode an inverted mask video.");
  }

  const mimeType = preferredVideoRecorderMimeType();
  if (!mimeType) {
    throw new Error("This browser cannot encode MP4/WebM video for inverted masks.");
  }

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const metadataReady = waitForVideoEvent(video, "loadedmetadata");
  video.src = sourceUrl;
  video.load();
  await metadataReady;

  const width = video.videoWidth || 1;
  const height = video.videoHeight || 1;
  const duration = Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : 0;
  if (duration <= 0) {
    throw new Error("Mask video has no readable duration.");
  }

  const fps = Math.max(1, Math.min(60, Math.round(Number(options.fps ?? 24) || 24)));
  const requestedFrames = Math.max(1, Math.ceil(duration * fps));
  const frameCap = Number(options.frameLoadCap ?? 0);
  const totalFrames = frameCap > 0
    ? Math.min(requestedFrames, Math.floor(frameCap))
    : requestedFrames;
  const frameDelayMs = Math.max(1, 1000 / fps);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare mask video canvas");

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as (MediaStreamTrack & {
    requestFrame?: () => void;
  }) | undefined;
  if (!track) throw new Error("Could not capture inverted mask video frames.");

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, { mimeType });
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      reject(new Error("Could not encode inverted mask video."));
    };
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  recorder.start();
  try {
    for (let frame = 0; frame < totalFrames; frame += 1) {
      const targetTime = Math.min(Math.max(0, duration - 0.001), frame / fps);
      await seekVideo(video, targetTime);
      ctx.drawImage(video, 0, 0, width, height);
      invertCanvasPixels(ctx, width, height);
      track.requestFrame?.();
      options.onProgress?.({ frame: frame + 1, totalFrames });
      await sleep(frameDelayMs);
    }
  } finally {
    video.removeAttribute("src");
    video.load();
    if (recorder.state !== "inactive") recorder.stop();
  }

  try {
    return await stopped;
  } finally {
    stream.getTracks().forEach((streamTrack) => streamTrack.stop());
  }
}

function writeGreenScreenMaskPixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: {
    greenMin?: number;
    dominance?: number;
    spillTolerance?: number;
    invert?: boolean;
  } = {},
) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const greenMin = Math.max(0, Math.min(255, Number(options.greenMin ?? 72) || 72));
  const dominance = Math.max(1, Math.min(3, Number(options.dominance ?? 1.18) || 1.18));
  const spillTolerance = Math.max(0, Math.min(255, Number(options.spillTolerance ?? 18) || 18));
  const invert = options.invert === true;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const maxNonGreen = Math.max(r, b);
    const isGreenScreen =
      g >= greenMin &&
      g >= maxNonGreen * dominance &&
      g - maxNonGreen >= spillTolerance;
    const maskValue = (isGreenScreen ? 255 : 0) ^ (invert ? 255 : 0);
    pixels[i] = maskValue;
    pixels[i + 1] = maskValue;
    pixels[i + 2] = maskValue;
    pixels[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

export async function captureMaskFrameFromVideoBlob(
  sourceUrl: string,
  options: {
    seconds?: number;
    invert?: boolean;
  } = {},
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

  const width = video.videoWidth || 1;
  const height = video.videoHeight || 1;
  const duration = Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : 0;
  const safeTime = duration > 0
    ? Math.min(Math.max(0, duration - 0.001), Math.max(0, Number(options.seconds ?? 0) || 0))
    : 0;
  await seekVideo(video, safeTime);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare mask frame canvas");

  ctx.drawImage(video, 0, 0, width, height);
  if (options.invert === true) {
    invertCanvasPixels(ctx, width, height);
  }

  video.removeAttribute("src");
  video.load();

  return canvasToBlob(canvas, "image/png");
}

export async function createGreenScreenMaskImageBlob(
  sourceUrl: string,
  options: {
    seconds?: number;
    greenMin?: number;
    dominance?: number;
    spillTolerance?: number;
    invert?: boolean;
  } = {},
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

  const width = video.videoWidth || 1;
  const height = video.videoHeight || 1;
  const duration = Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : 0;
  const safeTime = duration > 0
    ? Math.min(Math.max(0, duration - 0.001), Math.max(0, Number(options.seconds ?? 0) || 0))
    : 0;
  await seekVideo(video, safeTime);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare green-screen mask image canvas");

  ctx.drawImage(video, 0, 0, width, height);
  writeGreenScreenMaskPixels(ctx, width, height, options);

  video.removeAttribute("src");
  video.load();

  return canvasToBlob(canvas, "image/png");
}

export async function createGreenScreenMaskVideoBlob(
  sourceUrl: string,
  options: {
    fps?: number;
    frameLoadCap?: number;
    greenMin?: number;
    dominance?: number;
    spillTolerance?: number;
    invert?: boolean;
    onProgress?: (progress: { frame: number; totalFrames: number }) => void;
  } = {},
): Promise<Blob> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser cannot encode a green-screen mask video.");
  }

  const mimeType = preferredVideoRecorderMimeType();
  if (!mimeType) {
    throw new Error("This browser cannot encode MP4/WebM video for green-screen masks.");
  }

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const metadataReady = waitForVideoEvent(video, "loadedmetadata");
  video.src = sourceUrl;
  video.load();
  await metadataReady;

  const width = video.videoWidth || 1;
  const height = video.videoHeight || 1;
  const duration = Number.isFinite(video.duration) && video.duration > 0
    ? video.duration
    : 0;
  if (duration <= 0) {
    throw new Error("Source video has no readable duration for green-screen masking.");
  }

  const fps = Math.max(1, Math.min(60, Math.round(Number(options.fps ?? 24) || 24)));
  const requestedFrames = Math.max(1, Math.ceil(duration * fps));
  const frameCap = Number(options.frameLoadCap ?? 0);
  const totalFrames = frameCap > 0
    ? Math.min(requestedFrames, Math.floor(frameCap))
    : requestedFrames;
  const frameDelayMs = Math.max(1, 1000 / fps);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare green-screen mask canvas");

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as (MediaStreamTrack & {
    requestFrame?: () => void;
  }) | undefined;
  if (!track) throw new Error("Could not capture green-screen mask video frames.");

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, { mimeType });
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      reject(new Error("Could not encode green-screen mask video."));
    };
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  recorder.start();
  try {
    for (let frame = 0; frame < totalFrames; frame += 1) {
      const targetTime = Math.min(Math.max(0, duration - 0.001), frame / fps);
      await seekVideo(video, targetTime);
      ctx.drawImage(video, 0, 0, width, height);
      writeGreenScreenMaskPixels(ctx, width, height, options);
      track.requestFrame?.();
      options.onProgress?.({ frame: frame + 1, totalFrames });
      await sleep(frameDelayMs);
    }
  } finally {
    video.removeAttribute("src");
    video.load();
    if (recorder.state !== "inactive") recorder.stop();
  }

  try {
    return await stopped;
  } finally {
    stream.getTracks().forEach((streamTrack) => streamTrack.stop());
  }
}

export async function uploadWorkspaceMediaBlob(
  blob: Blob,
  path: string,
  contentType = blob.type || "application/octet-stream",
): Promise<string> {
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, blob, {
      contentType,
      cacheControl: "31536000",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    throw error ?? new Error("Could not sign uploaded workspace media");
  }
  return data.signedUrl;
}

export async function uploadExtractedFrame(blob: Blob, path: string): Promise<string> {
  return uploadWorkspaceMediaBlob(blob, path, "image/jpeg");
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
