import type {
  ActionResult,
  MediaItem,
  Track,
} from "@/lib/openreel-core";

export type TimelineMediaType = MediaItem["type"];

const FILE_EXTENSION_MEDIA_TYPES: Record<string, TimelineMediaType> = {
  mp4: "video",
  mov: "video",
  m4v: "video",
  webm: "video",
  mkv: "video",
  avi: "video",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  aac: "audio",
  ogg: "audio",
  flac: "audio",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  avif: "image",
};

export function getMediaTypeFromFile(file: File): TimelineMediaType | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";

  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension ? FILE_EXTENSION_MEDIA_TYPES[extension] ?? null : null;
}

export function getMediaTypeFromDataTransferItem(
  item: DataTransferItem,
): TimelineMediaType | null {
  if (item.kind !== "file") return null;
  if (item.type.startsWith("video/")) return "video";
  if (item.type.startsWith("audio/")) return "audio";
  if (item.type.startsWith("image/")) return "image";
  return null;
}

export function canPlaceMediaTypeOnTrack(
  mediaType: TimelineMediaType | null | undefined,
  trackType: Track["type"],
): boolean {
  return mediaType === trackType;
}

export function canPlaceMediaItemOnTrack(
  mediaItem: MediaItem | undefined,
  track: Track | undefined,
): boolean {
  return Boolean(mediaItem && track && mediaItem.type === track.type);
}

export function getTrackTypeLabel(trackType: Track["type"]): string {
  switch (trackType) {
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "image":
      return "image";
    case "text":
      return "text";
    case "graphics":
      return "graphics";
    default:
      return "timeline";
  }
}

export function incompatibleMediaTrackResult(
  mediaItem: MediaItem,
  track: Track,
): ActionResult {
  return {
    success: false,
    error: {
      code: "INCOMPATIBLE_TYPE",
      message: `${mediaItem.type} files can only be placed on ${mediaItem.type} tracks, not ${track.type} tracks.`,
      details: {
        mediaId: mediaItem.id,
        mediaType: mediaItem.type,
        trackId: track.id,
        trackType: track.type,
        expectedTrackType: mediaItem.type,
      },
      suggestion: `Drop this file on a ${mediaItem.type} track or empty timeline space to create a matching track.`,
    },
  };
}
