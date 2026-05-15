const PAGE_URL_HOST_PATTERNS = [
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)fb\.watch$/i,
];

const FORMAT_EXTENSIONS: Record<string, string[]> = {
  mp4: [".mp4", ".m4v"],
  mp3: [".mp3"],
  png: [".png"],
};

export function urlAssetFormatFromModel(model: string): "mp4" | "mp3" | "png" {
  const normalised = String(model || "").toLowerCase();
  if (normalised.includes("mp4") || normalised.includes("video")) return "mp4";
  if (normalised.includes("mp3") || normalised.includes("audio")) return "mp3";
  return "png";
}

export function urlAssetDirectFileMessage(model: string): string {
  const format = urlAssetFormatFromModel(model).toUpperCase();
  return `Paste a direct ${format} file URL or a supported YouTube, Instagram, or Facebook link.`;
}

export function normalizeUrlAssetSource(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  const facebookQuery = trimmed.replace(/^[?&]/, "");
  if (/^(?:fbid=|.*&fbid=)/i.test(facebookQuery)) {
    return `https://www.facebook.com/photo/?${facebookQuery}`;
  }

  const youtubeQuery = trimmed.replace(/^[?&]/, "");
  if (/^(?:v=|.*&v=)/i.test(youtubeQuery)) {
    const params = new URLSearchParams(youtubeQuery);
    const videoId = params.get("v")?.trim();
    if (videoId) return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }

  if (/^(?:www\.|m\.)?(?:youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch)(?:\/|$)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (/youtube\.com$/i.test(parsed.hostname) && parsed.pathname === "/watch") {
      const videoId = parsed.searchParams.get("v")?.trim();
      if (videoId) return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    }
  } catch {
    // Let validation below return the user-facing error.
  }

  return trimmed;
}

export function validateUrlAssetSource(rawUrl: string, model: string): string | null {
  const trimmed = normalizeUrlAssetSource(rawUrl);
  if (!trimmed) return "Enter a direct MP4, MP3, or PNG URL before running URL to Asset.";

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "URL to Asset accepts a valid http/https media URL, YouTube link, Instagram link, Facebook link, or YouTube v= video ID.";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "URL to Asset accepts only http or https direct file URLs.";
  }

  const hostname = parsed.hostname.toLowerCase();
  const isSupportedSocialUrl = PAGE_URL_HOST_PATTERNS.some((pattern) => pattern.test(hostname));

  const format = urlAssetFormatFromModel(model);
  const path = decodeURIComponent(parsed.pathname).toLowerCase();
  const knownMediaExtensions = Object.values(FORMAT_EXTENSIONS).flat();
  const hasKnownMediaExtension = knownMediaExtensions.some((ext) => path.endsWith(ext));
  const hasExpectedExtension = FORMAT_EXTENSIONS[format].some((ext) => path.endsWith(ext));
  if (!isSupportedSocialUrl && hasKnownMediaExtension && !hasExpectedExtension) {
    return `Selected model expects a direct ${format.toUpperCase()} URL. Change the model or paste a matching file URL.`;
  }

  return null;
}
