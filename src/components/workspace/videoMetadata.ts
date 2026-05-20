export type VideoMetadata = {
  durationSec: number | null;
  width: number | null;
  height: number | null;
};

export const SEEDANCE_REF_VIDEO_MIN_SEC = 2;
export const SEEDANCE_REF_VIDEO_MAX_SEC = 15;
export const SEEDANCE_REF_VIDEO_MAX_PIXELS = 2_086_876;

export function isSeedanceReferenceVideoDurationValid(
  durationSec: number | null | undefined,
): durationSec is number {
  return (
    typeof durationSec === "number" &&
    Number.isFinite(durationSec) &&
    durationSec >= SEEDANCE_REF_VIDEO_MIN_SEC &&
    durationSec <= SEEDANCE_REF_VIDEO_MAX_SEC
  );
}

export function isSeedanceReferenceVideoPixelCountValid(
  metadata: Pick<VideoMetadata, "width" | "height">,
): boolean {
  const { width, height } = metadata;
  if (!width || !height) return false;
  return width * height <= SEEDANCE_REF_VIDEO_MAX_PIXELS;
}

export function seedanceReferenceVideoPixelMessage(
  metadata?: Pick<VideoMetadata, "width" | "height"> | null,
): string {
  const suffix =
    metadata?.width && metadata?.height
      ? ` (${metadata.width}x${metadata.height} = ${(metadata.width * metadata.height).toLocaleString()} px)`
      : "";
  return `Seedance 2.0 reference video is too large${suffix}. Use a ref video at 1080p or smaller (max ${SEEDANCE_REF_VIDEO_MAX_PIXELS.toLocaleString()} pixels per frame).`;
}

export function readVideoMetadataFromSource(
  src: string,
  revoke?: () => void,
  timeoutMs = 5000,
): Promise<VideoMetadata | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = (value: VideoMetadata | null) => {
      if (settled) return;
      settled = true;
      video.removeAttribute("src");
      video.load();
      revoke?.();
      resolve(value);
    };
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () =>
      finish({
        durationSec: Number.isFinite(video.duration) ? video.duration : null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      });
    video.onerror = () => finish(null);
    window.setTimeout(() => finish(null), timeoutMs);
    video.src = src;
  });
}

export function readVideoFileMetadata(file: File): Promise<VideoMetadata | null> {
  const objectUrl = URL.createObjectURL(file);
  return readVideoMetadataFromSource(objectUrl, () => URL.revokeObjectURL(objectUrl));
}

export function readVideoUrlMetadata(url: string): Promise<VideoMetadata | null> {
  return readVideoMetadataFromSource(url);
}
