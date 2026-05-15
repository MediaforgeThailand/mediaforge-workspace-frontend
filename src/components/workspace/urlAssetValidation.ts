const PAGE_URL_HOST_PATTERNS = [
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)fb\.watch$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)vimeo\.com$/i,
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
  return `URL to Asset currently imports direct ${format} file URLs only. Paste a URL that points to the actual file, not a YouTube, Instagram, or social page link.`;
}

export function validateUrlAssetSource(rawUrl: string, model: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "Enter a direct MP4, MP3, or PNG URL before running URL to Asset.";

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "URL to Asset accepts only valid http or https direct file URLs.";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "URL to Asset accepts only http or https direct file URLs.";
  }

  const hostname = parsed.hostname.toLowerCase();
  if (PAGE_URL_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return urlAssetDirectFileMessage(model);
  }

  const format = urlAssetFormatFromModel(model);
  const path = decodeURIComponent(parsed.pathname).toLowerCase();
  const knownMediaExtensions = Object.values(FORMAT_EXTENSIONS).flat();
  const hasKnownMediaExtension = knownMediaExtensions.some((ext) => path.endsWith(ext));
  const hasExpectedExtension = FORMAT_EXTENSIONS[format].some((ext) => path.endsWith(ext));
  if (hasKnownMediaExtension && !hasExpectedExtension) {
    return `Selected model expects a direct ${format.toUpperCase()} URL. Change the model or paste a matching file URL.`;
  }

  return null;
}
