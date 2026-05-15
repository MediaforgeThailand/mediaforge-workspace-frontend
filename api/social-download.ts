import { createReadStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

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
    const outputTemplate = path.join(tempDir, `${prefix}.%(ext)s`);
    await youtubedl.exec(source.toString(), ytdlpFlags(format, outputTemplate), {
      timeout: 55_000,
      killSignal: "SIGKILL",
    });

    const outputFile = await findOutputFile(tempDir, prefix, meta.extension);
    createdFiles.push(outputFile);
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
      source_url: source.toString(),
      extractor: "yt-dlp",
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
