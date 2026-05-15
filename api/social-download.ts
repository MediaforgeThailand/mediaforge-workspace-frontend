import { createReadStream, promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import youtubedl from "youtube-dl-exec";
import ffmpegPath from "ffmpeg-static";

type OutputFormat = "mp4" | "mp3" | "png";

interface DownloadRequest {
  source_url?: string;
  output_format?: string;
  file_name?: string;
  max_bytes?: number;
  upload?: {
    signed_url?: string;
    path?: string;
  };
}

const SOCIAL_HOST_PATTERNS = [
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)fb\.watch$/i,
];

const FORMAT_META: Record<OutputFormat, { extension: string; contentType: string; maxBytes: number }> = {
  mp4: { extension: "mp4", contentType: "video/mp4", maxBytes: 256 * 1024 * 1024 },
  mp3: { extension: "mp3", contentType: "audio/mpeg", maxBytes: 128 * 1024 * 1024 },
  png: { extension: "png", contentType: "image/png", maxBytes: 32 * 1024 * 1024 },
};

const execFileAsync = promisify(execFile);

function sendJson(res: any, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function parseBody(req: any): DownloadRequest {
  if (!req.body) return {};
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return req.body as DownloadRequest;
}

function parseFormat(raw: unknown): OutputFormat {
  const value = String(raw ?? "").toLowerCase();
  if (value.includes("mp4") || value.includes("video")) return "mp4";
  if (value.includes("mp3") || value.includes("audio")) return "mp3";
  return "png";
}

function normalizeSocialSource(raw: unknown): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  const facebookQuery = trimmed.replace(/^[?&]/, "");
  if (/^(?:fbid=|.*&fbid=)/i.test(facebookQuery)) {
    return `https://www.facebook.com/photo.php?${facebookQuery}`;
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
    // parseSupportedUrl returns the validation error below.
  }

  return trimmed;
}

function parseSupportedUrl(raw: unknown): URL {
  const value = normalizeSocialSource(raw);
  if (!value) throw new Error("Missing source URL.");
  const parsed = new URL(value);
  const isSupported = SOCIAL_HOST_PATTERNS.some((pattern) => pattern.test(parsed.hostname));
  if (!isSupported) throw new Error("Unsupported social URL host.");
  return parsed;
}

function safeBaseName(raw: unknown, fallback: string): string {
  const value = String(raw ?? "")
    .trim()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return value || fallback;
}

async function findOutputFile(dir: string, prefix: string, expectedExt: string): Promise<string> {
  const entries = await fs.readdir(dir);
  const candidates = entries
    .filter((name) => name.startsWith(prefix))
    .filter((name) => !name.endsWith(".part") && !name.endsWith(".ytdl"))
    .map((name) => path.join(dir, name));
  const preferred = candidates.find((file) => file.toLowerCase().endsWith(`.${expectedExt}`));
  if (preferred) return preferred;
  if (candidates.length > 0) return candidates[0];
  throw new Error("Downloader did not produce a media file.");
}

function ytdlpFlags(format: OutputFormat, outputTemplate: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    output: outputTemplate,
    noPlaylist: true,
    noWarnings: true,
    restrictFilenames: true,
    windowsFilenames: true,
    retries: 2,
    fragmentRetries: 2,
    socketTimeout: 20,
    ffmpegLocation: ffmpegPath || undefined,
  };

  if (format === "mp4") {
    return {
      ...base,
      format: "bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4]/best[height<=720]/best",
      mergeOutputFormat: "mp4",
    };
  }

  if (format === "mp3") {
    return {
      ...base,
      format: "bestaudio/best",
      extractAudio: true,
      audioFormat: "mp3",
      audioQuality: 0,
    };
  }

  return {
    ...base,
    skipDownload: true,
    writeThumbnail: true,
    convertThumbnails: "png",
  };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function htmlAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1] ? decodeHtml(match[1]) : null;
}

function normalizeEmbeddedHtmlUrls(html: string): string {
  return html
    .replace(/\\\//g, "/")
    .replace(/\\u0025/g, "%")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/g, "=")
    .replace(/&amp;/g, "&");
}

function extractSocialImageCandidates(html: string): string[] {
  const candidates = new Set<string>();
  const normalized = normalizeEmbeddedHtmlUrls(html);

  for (const match of normalized.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (htmlAttr(tag, "property") || htmlAttr(tag, "name") || "").toLowerCase();
    if (key === "og:image" || key === "og:image:url" || key === "twitter:image" || key === "twitter:image:src") {
      const content = htmlAttr(tag, "content");
      if (content) candidates.add(content);
    }
  }

  for (const match of normalized.matchAll(/https:\/\/[^"'<>\\\s]+/gi)) {
    const value = decodeHtml(match[0]);
    const lower = value.toLowerCase();
    const looksLikeImage =
      /\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(value) ||
      lower.includes("fbcdn.net") ||
      lower.includes("cdninstagram.com") ||
      lower.includes("scontent.");
    if (looksLikeImage) candidates.add(value);
  }

  return [...candidates].filter((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  });
}

function socialImageScore(url: string): number {
  const lower = url.toLowerCase();
  let score = 0;
  if (lower.includes("scontent.") || lower.includes("fbcdn.net") || lower.includes("cdninstagram.com")) score += 1000;
  if (lower.includes("/t39.30808-6/") || lower.includes("/t51.")) score += 5000;
  if (lower.includes("og:image")) score += 500;
  if (lower.includes("profile_picture") || lower.includes("/t1.30497-1/")) score -= 8000;

  const sizeMatch = lower.match(/[_-]s(\d{2,4})x(\d{2,4})/);
  if (sizeMatch) {
    score += (Number(sizeMatch[1]) * Number(sizeMatch[2])) / 1000;
  } else {
    score += 1500;
  }
  return score;
}

function extensionForImageContentType(contentType: string, imageUrl: URL): string {
  const clean = contentType.split(";")[0]?.trim().toLowerCase();
  if (clean === "image/png") return "png";
  if (clean === "image/webp") return "webp";
  if (clean === "image/gif") return "gif";
  if (clean === "image/jpeg" || clean === "image/jpg") return "jpg";
  const ext = path.extname(imageUrl.pathname).replace(".", "").toLowerCase();
  return ext && /^[a-z0-9]{2,5}$/.test(ext) ? ext : "img";
}

async function downloadImageCandidate(candidate: string, tempDir: string, prefix: string, maxBytes: number, referer?: string) {
  const imageUrl = new URL(candidate);
  const response = await fetch(imageUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      ...(referer ? { Referer: referer } : {}),
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    },
  });
  if (!response.ok) {
    throw new Error(`image returned HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!/^image\//i.test(contentType)) {
    throw new Error(`image candidate returned ${contentType || "unknown content-type"}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength <= 0) throw new Error("image candidate was empty");
  if (bytes.byteLength > maxBytes) {
    throw new Error(`PNG source image is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.`);
  }
  const inputPath = path.join(tempDir, `${prefix}_source.${extensionForImageContentType(contentType, imageUrl)}`);
  await fs.writeFile(inputPath, bytes);
  return { inputPath, sourceUrl: imageUrl.toString(), sourceContentType: contentType, bytes: bytes.byteLength };
}

function socialPageVariants(source: URL): URL[] {
  const variants = [source];
  const host = source.hostname.toLowerCase();
  if (/(^|\.)facebook\.com$/.test(host)) {
    const fbid = source.searchParams.get("fbid");
    if (fbid) {
      const query = source.searchParams.toString();
      for (const base of ["https://www.facebook.com/photo.php", "https://m.facebook.com/photo.php"]) {
        const candidate = new URL(base);
        candidate.search = query;
        if (!variants.some((item) => item.toString() === candidate.toString())) {
          variants.push(candidate);
        }
      }
    }
  }
  return variants;
}

async function fetchSocialPageHtml(source: URL): Promise<{ html: string; pageUrl: URL }> {
  const errors: string[] = [];
  for (const pageUrl of socialPageVariants(source)) {
    try {
      const response = await fetch(pageUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "Upgrade-Insecure-Requests": "1",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        },
      });
      if (!response.ok) {
        errors.push(`${pageUrl.hostname} HTTP ${response.status}`);
        continue;
      }
      return { html: await response.text(), pageUrl };
    } catch (error) {
      errors.push(`${pageUrl.hostname} ${errorPart((error as Error)?.message) || "fetch failed"}`);
    }
  }
  throw new Error(`Social page returned ${errors.join(", ") || "an empty response"}.`);
}

async function convertImageToPng(inputPath: string, outputPath: string): Promise<void> {
  if (!ffmpegPath) {
    throw new Error("Image converter is temporarily unavailable. Please try again later or upload the image directly.");
  }
  await execFileAsync(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", "-i", inputPath, outputPath], {
    timeout: 25_000,
    windowsHide: true,
  });
}

async function downloadSocialPageImageAsPng(args: {
  source: URL;
  tempDir: string;
  prefix: string;
  maxBytes: number;
}): Promise<{ filePath: string; sourceUrl: string; sourceContentType: string; bytes: number; extractor: string; cleanup: string[] }> {
  const { html, pageUrl } = await fetchSocialPageHtml(args.source);
  const candidates = extractSocialImageCandidates(html).sort((a, b) => socialImageScore(b) - socialImageScore(a));
  if (candidates.length === 0) {
    throw new Error("This social page did not expose a public image. Try another public link or upload the image directly.");
  }

  const errors: string[] = [];
  for (const candidate of candidates.slice(0, 8)) {
    const cleanupPaths: string[] = [];
    try {
      const downloaded = await downloadImageCandidate(candidate, args.tempDir, args.prefix, args.maxBytes, pageUrl.toString());
      cleanupPaths.push(downloaded.inputPath);
      const outputPath = path.join(args.tempDir, `${args.prefix}.png`);
      await convertImageToPng(downloaded.inputPath, outputPath);
      cleanupPaths.push(outputPath);
      const stat = await fs.stat(outputPath);
      if (stat.size <= 0) throw new Error("converted image was empty");
      if (stat.size > args.maxBytes) {
        throw new Error(`PNG file is larger than ${Math.round(args.maxBytes / (1024 * 1024))} MB.`);
      }
      return {
        filePath: outputPath,
        sourceUrl: downloaded.sourceUrl,
        sourceContentType: downloaded.sourceContentType,
        bytes: stat.size,
        extractor: "social-page-image",
        cleanup: cleanupPaths,
      };
    } catch (error) {
      errors.push(errorPart((error as Error)?.message) || "candidate failed");
      await cleanup(cleanupPaths);
    }
  }

  throw new Error(
    errors[0] || "This social image could not be downloaded from our server. Try another public link or upload the image directly.",
  );
}

async function uploadToSignedUrl(signedUrl: string, filePath: string, contentType: string): Promise<void> {
  const init: RequestInit & { duplex?: "half" } = {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "max-age=31536000",
      "x-upsert": "false",
    },
    body: createReadStream(filePath) as any,
    duplex: "half",
  };
  const upload = await fetch(signedUrl, init);

  if (!upload.ok) {
    const text = await upload.text().catch(() => "");
    throw new Error(`Storage upload failed (${upload.status}): ${text.slice(0, 300)}`);
  }
}

async function cleanup(paths: string[]) {
  await Promise.all(paths.map((file) => fs.unlink(file).catch(() => undefined)));
}

function errorPart(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function humanizeDownloaderError(error: unknown): string {
  const err = error as Partial<Error> & {
    stderr?: string;
    stdout?: string;
    shortMessage?: string;
    exitCode?: number;
    code?: number;
  };
  const raw = [errorPart(err.stderr), errorPart(err.stdout), errorPart(err.message), errorPart(err.shortMessage)]
    .filter(Boolean)
    .join("\n");
  const lower = raw.toLowerCase();

  if (Number(err.exitCode ?? err.code) === 127 || lower.includes("python3: no such file")) {
    return "Social downloader is temporarily unavailable. Please try again later or upload the file directly.";
  }

  if (
    lower.includes("unsupported url") ||
    lower.includes("no video formats") ||
    lower.includes("private") ||
    lower.includes("login") ||
    lower.includes("sign in") ||
    lower.includes("not available") ||
    lower.includes("restricted") ||
    lower.includes("copyright") ||
    lower.includes("blocked")
  ) {
    return "This social link is private, restricted, or not downloadable from our server. Try another public link or upload the file directly.";
  }

  if (raw.includes("The command spawned as")) {
    return "This social link could not be downloaded from our server. Try another public link or upload the file directly.";
  }

  return raw || "This social link could not be downloaded. Try again or upload the file directly.";
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const expectedSecret = process.env.SOCIAL_DOWNLOADER_SECRET || "";
  const auth = String(req.headers.authorization || "");
  if (expectedSecret) {
    if (auth !== `Bearer ${expectedSecret}`) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }
  } else if (process.env.VERCEL_ENV === "production") {
    sendJson(res, 503, { error: "Social downloader is not configured." });
    return;
  }

  let request: DownloadRequest;
  try {
    request = parseBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body." });
    return;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mf-social-"));
  const createdFiles: string[] = [];

  try {
    const source = parseSupportedUrl(request.source_url);
    const format = parseFormat(request.output_format);
    const meta = FORMAT_META[format];
    const maxBytes = Math.min(Number(request.max_bytes) || meta.maxBytes, meta.maxBytes);
    const uploadUrl = String(request.upload?.signed_url || "");
    const uploadPath = String(request.upload?.path || "");
    if (!uploadUrl || !uploadPath) throw new Error("Missing signed upload target.");

    const prefix = `mediaforge_${Date.now()}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    let outputFile: string;
    let extractor = "yt-dlp";
    let sourceContentType = meta.contentType;
    let sourceUrl = source.toString();

    if (format === "png") {
      const pageImage = await downloadSocialPageImageAsPng({ source, tempDir, prefix, maxBytes });
      outputFile = pageImage.filePath;
      extractor = pageImage.extractor;
      sourceContentType = pageImage.sourceContentType;
      sourceUrl = pageImage.sourceUrl;
      createdFiles.push(...pageImage.cleanup);
    } else {
      const outputTemplate = path.join(tempDir, `${prefix}.%(ext)s`);
      await youtubedl.exec(source.toString(), ytdlpFlags(format, outputTemplate), {
        timeout: 55_000,
        killSignal: "SIGKILL",
      });
      outputFile = await findOutputFile(tempDir, prefix, meta.extension);
      createdFiles.push(outputFile);
    }

    const stat = await fs.stat(outputFile);
    if (stat.size <= 0) throw new Error("Downloaded media is empty.");
    if (stat.size > maxBytes) {
      throw new Error(`${format.toUpperCase()} file is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.`);
    }

    await uploadToSignedUrl(uploadUrl, outputFile, meta.contentType);

    sendJson(res, 200, {
      ok: true,
      storage_path: uploadPath,
      content_type: meta.contentType,
      bytes: stat.size,
      file_name: `${safeBaseName(request.file_name, "social import")}.${meta.extension}`,
      source_url: sourceUrl,
      source_content_type: sourceContentType,
      extractor,
    });
  } catch (error) {
    console.error("[social-download] failed", {
      message: errorPart((error as Error)?.message),
      stderr: errorPart((error as { stderr?: string })?.stderr).slice(0, 800),
      stdout: errorPart((error as { stdout?: string })?.stdout).slice(0, 800),
      exitCode: (error as { exitCode?: number })?.exitCode,
      shortMessage: errorPart((error as { shortMessage?: string })?.shortMessage),
    });
    sendJson(res, 400, { error: humanizeDownloaderError(error) });
  } finally {
    await cleanup(createdFiles);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
