#!/usr/bin/env node
import "dotenv/config";
import { createServer } from "node:http";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const PORT = Number(process.env.SMART_FRAMES_WORKER_PORT || 8787);
const HOST = process.env.SMART_FRAMES_WORKER_HOST || "127.0.0.1";
const ROOT = resolve(process.cwd(), "tmp", "smart-frames-worker");
const OUTPUT_ROOT = join(ROOT, "outputs");
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
const MAX_RENDER_DURATION_SECONDS = Number(process.env.SMART_FRAMES_MAX_DURATION_SECONDS || 600);
const MAX_CONCURRENT_RENDERS = Math.max(1, Number(process.env.SMART_FRAMES_MAX_CONCURRENT_RENDERS || 1));
const HYPERFRAMES_VERSION = process.env.HYPERFRAMES_VERSION || "0.6.21";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.SMART_FRAMES_OPENAI_MODEL || "gpt-5.5";
const OPENAI_PLANNER_TIMEOUT_MS = Number(process.env.SMART_FRAMES_OPENAI_TIMEOUT_MS || 45_000);
const SILENCE_NOISE_DB = Number(process.env.SMART_FRAMES_SILENCE_NOISE_DB || -35);
const MIN_DEAD_AIR_SECONDS = Number(process.env.SMART_FRAMES_MIN_DEAD_AIR_SECONDS || 0.5);
const SPEECH_HANDLE_SECONDS = Number(process.env.SMART_FRAMES_SPEECH_HANDLE_SECONDS || 0.1);
const BASE_URL = `http://${HOST}:${PORT}`;
let activeRenderCount = 0;

const json = (res, status, payload) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,range",
    "access-control-expose-headers": "content-length,content-range,accept-ranges",
  });
  res.end(JSON.stringify(payload));
};

async function readExistingWorkerHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900);
  try {
    const response = await fetch(`${BASE_URL}/health`, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const safeName = (value, fallback = "video") =>
  String(value || fallback)
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || fallback;

const run = (command, args, options = {}) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      shell: process.platform === "win32",
      windowsHide: true,
      env: { ...process.env, ...(options.env || {}) },
    });
    let stdout = "";
    let stderr = "";
    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error(`${command} timed out after ${options.timeoutMs}ms`));
        }, options.timeoutMs)
      : null;

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      if (options.onOutput) options.onOutput(chunk.toString(), "stdout");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (options.onOutput) options.onOutput(chunk.toString(), "stderr");
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) {
        resolveRun({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with ${code}\n${stderr || stdout}`));
      }
    });
  });

async function ffprobe(inputPath) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    inputPath,
  ]);
  const data = JSON.parse(stdout);
  const video = data.streams?.find((stream) => stream.codec_type === "video") || {};
  const audio = data.streams?.find((stream) => stream.codec_type === "audio") || null;
  const duration = Number(data.format?.duration || video.duration || 0);
  return {
    width: Number(video.width || 1080),
    height: Number(video.height || 1920),
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    hasAudio: Boolean(audio),
  };
}

async function detectSilences(inputPath, duration, hasAudio) {
  if (!hasAudio || duration <= 0) return [];
  try {
    const { stderr } = await run("ffmpeg", [
      "-hide_banner",
      "-i",
      inputPath,
      "-af",
      `silencedetect=noise=${SILENCE_NOISE_DB}dB:d=${MIN_DEAD_AIR_SECONDS}`,
      "-f",
      "null",
      "-",
    ]);
    const starts = [];
    const ranges = [];
    for (const line of stderr.split(/\r?\n/)) {
      const start = line.match(/silence_start:\s*([0-9.]+)/);
      if (start) starts.push(Number(start[1]));
      const end = line.match(/silence_end:\s*([0-9.]+)/);
      if (end) {
        const silenceEnd = Number(end[1]);
        const silenceStart = starts.pop();
        if (Number.isFinite(silenceStart) && Number.isFinite(silenceEnd)) {
          ranges.push({
            start: Math.max(0, silenceStart),
            end: Math.min(duration, silenceEnd),
          });
        }
      }
    }
    return ranges.filter((range) => range.end - range.start >= 0.55);
  } catch {
    return [];
  }
}

function buildKeepSegments(duration, silences) {
  if (!duration || duration <= 0) return [{ start: 0, end: 12 }];
  const merged = [...silences]
    .sort((a, b) => a.start - b.start)
    .reduce((acc, range) => {
      const last = acc[acc.length - 1];
      if (last && range.start <= last.end + 0.08) {
        last.end = Math.max(last.end, range.end);
      } else {
        acc.push({ ...range });
      }
      return acc;
    }, []);
  const keep = [];
  let cursor = 0;
  const pad = Math.max(0, SPEECH_HANDLE_SECONDS);
  for (const silence of merged) {
    const cutStart = Math.max(0, silence.start + pad);
    const cutEnd = Math.min(duration, silence.end - pad);
    if (cutEnd - cutStart < 0.45) continue;
    if (cutStart - cursor >= 0.35) keep.push({ start: cursor, end: cutStart });
    cursor = Math.max(cursor, cutEnd);
  }
  if (duration - cursor >= 0.35) keep.push({ start: cursor, end: duration });
  return keep.length ? keep : [{ start: 0, end: duration }];
}

async function cutVideo(inputPath, outputPath, segments, info) {
  const removed = info.duration - segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
  if (segments.length <= 1 || removed < 0.35) {
    await copyFile(inputPath, outputPath);
    return false;
  }

  if (!info.hasAudio) {
    const filters = segments
      .map((segment, index) => `[0:v]trim=start=${segment.start.toFixed(3)}:end=${segment.end.toFixed(3)},setpts=PTS-STARTPTS[v${index}]`)
      .join(";");
    const concatInputs = segments.map((_, index) => `[v${index}]`).join("");
    await run("ffmpeg", [
      "-y",
      "-hide_banner",
      "-i",
      inputPath,
      "-filter_complex",
      `${filters};${concatInputs}concat=n=${segments.length}:v=1:a=0[outv]`,
      "-map",
      "[outv]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    return true;
  }

  const filters = segments
    .map(
      (segment, index) =>
        `[0:v]trim=start=${segment.start.toFixed(3)}:end=${segment.end.toFixed(3)},setpts=PTS-STARTPTS[v${index}];` +
        `[0:a]atrim=start=${segment.start.toFixed(3)}:end=${segment.end.toFixed(3)},asetpts=PTS-STARTPTS[a${index}]`,
    )
    .join(";");
  const concatInputs = segments.map((_, index) => `[v${index}][a${index}]`).join("");
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    "-filter_complex",
    `${filters};${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`,
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
  return true;
}

const trimLine = (line) =>
  line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

function planLines(plan, presetLabel) {
  const lines = String(plan || "")
    .split(/\r?\n/)
    .map(trimLine)
    .filter((line) => line.length >= 8 && !/^concept:?$/i.test(line))
    .slice(0, 5);
  if (lines.length) return lines;
  return [presetLabel || "Smart edit", "Clean timing", "Caption-ready result"];
}

function makeCues(plan, presetLabel, duration) {
  const lines = planLines(plan, presetLabel);
  const safeDuration = Math.max(1, duration || 12);
  const cueDuration = safeDuration / lines.length;
  return lines.map((line, index) => {
    const start = index * cueDuration;
    const end = index === lines.length - 1 ? safeDuration : Math.min(safeDuration, (index + 1) * cueDuration);
    return {
      startTime: Number(start.toFixed(3)),
      duration: Number(Math.max(0.08, end - start).toFixed(3)),
      text: line.length > 78 ? `${line.slice(0, 75).replace(/\s+\S*$/, "")}...` : line,
    };
  });
}

function roundSeconds(value) {
  return Number(Math.max(0, value).toFixed(3));
}

function publicSegments(segments) {
  return segments.map((segment) => ({
    start: roundSeconds(segment.start),
    end: roundSeconds(segment.end),
    duration: roundSeconds(segment.end - segment.start),
  }));
}

function publicRanges(ranges) {
  return ranges.map((range) => ({
    start: roundSeconds(range.start),
    end: roundSeconds(range.end),
    duration: roundSeconds(range.end - range.start),
  }));
}

function normalizePlannerSegments(rawSegments, duration, fallbackSegments) {
  const source = Array.isArray(rawSegments) ? rawSegments : [];
  const cleaned = source
    .map((segment) => {
      const start = Number(segment.start ?? segment.sourceStart ?? segment.in ?? segment.from);
      const end = Number(segment.end ?? segment.sourceEnd ?? segment.out ?? segment.to);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      return {
        start: Math.max(0, Math.min(duration, start)),
        end: Math.max(0, Math.min(duration, end)),
      };
    })
    .filter(Boolean)
    .filter((segment) => segment.end - segment.start >= 0.2)
    .sort((a, b) => a.start - b.start)
    .reduce((acc, segment) => {
      const last = acc[acc.length - 1];
      if (last && segment.start <= last.end + 0.05) {
        last.end = Math.max(last.end, segment.end);
      } else if (!last || segment.start >= last.end) {
        acc.push({ ...segment });
      }
      return acc;
    }, []);
  return cleaned.length ? cleaned : fallbackSegments;
}

function buildFallbackEditPlan({
  prompt,
  presetId,
  presetLabel,
  inputInfo,
  suggestedSegments,
  silences,
}) {
  const originalDuration = inputInfo.duration || 0;
  const keptDuration = suggestedSegments.reduce(
    (sum, segment) => sum + Math.max(0, segment.end - segment.start),
    0,
  );
  const removedDuration = Math.max(0, originalDuration - keptDuration);
  return {
    version: 1,
    planner: "deterministic-analysis",
    presetId,
    presetLabel,
    objective: prompt || "Remove dead air while preserving natural speech rhythm.",
    strategy:
      silences.length > 0
        ? "Remove detected dead-air regions and keep short handles around speech."
        : "No confident dead-air region detected; keep the full source timeline.",
    source: {
      duration: roundSeconds(originalDuration),
      width: inputInfo.width,
      height: inputInfo.height,
      hasAudio: inputInfo.hasAudio,
    },
    timeline: {
      segments: publicSegments(suggestedSegments),
      silences: publicRanges(silences),
      removedDuration: roundSeconds(removedDuration),
    },
    captions: [],
    render: {
      engine: "hyperframes",
      overlays: false,
      preserveAudio: true,
    },
  };
}

function extractOpenAIResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data?.output || []) {
    if (item?.type !== "message") continue;
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("");
}

function parsePlannerJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() || raw;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

async function callOpenAIEditPlanner({ prompt, presetId, presetLabel, inputInfo, suggestedSegments, silences }) {
  const fallbackPlan = buildFallbackEditPlan({
    prompt,
    presetId,
    presetLabel,
    inputInfo,
    suggestedSegments,
    silences,
  });
  if (!OPENAI_API_KEY) {
    return {
      plan: fallbackPlan,
      plannerUsed: "deterministic-fallback",
      plannerWarning: "OPENAI_API_KEY is not configured; used deterministic audio analysis.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_PLANNER_TIMEOUT_MS);
  const analysis = {
    presetId,
    presetLabel,
    objective: prompt,
    video: {
      duration: roundSeconds(inputInfo.duration),
      width: inputInfo.width,
      height: inputInfo.height,
      hasAudio: inputInfo.hasAudio,
    },
    detectedSilences: publicRanges(silences),
    suggestedKeepSegments: publicSegments(suggestedSegments),
    rules: [
      "Return only JSON.",
      "For Clean Cut, only remove dead air from detected silence ranges.",
      "Do not invent trims outside the suggested keep segments unless the suggestion is unsafe.",
      "If no confident dead air exists, return one full-length keep segment.",
      "Every segment must be sorted, non-overlapping, and within the source duration.",
      "Do not add visual overlays for Clean Cut.",
    ],
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions:
          "You are MediaForge Smart Frames edit planner. Return a compact JSON edit plan for a HyperFrame renderer. Keep the plan conservative and production-safe.",
        input: [
          {
            role: "user",
            content:
              "Create an edit plan using this analyzed video metadata and silence map.\n\n" +
              JSON.stringify(analysis, null, 2),
          },
        ],
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
        store: false,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`OpenAI planner returned HTTP ${response.status}: ${errorText.slice(0, 220)}`);
    }
    const data = await response.json();
    const parsed = parsePlannerJson(extractOpenAIResponseText(data));
    if (!parsed || typeof parsed !== "object") {
      throw new Error("OpenAI planner did not return a JSON object.");
    }
    const normalizedSegments = normalizePlannerSegments(
      parsed?.timeline?.segments ?? parsed?.segments,
      inputInfo.duration,
      suggestedSegments,
    );
    return {
      plan: {
        ...fallbackPlan,
        ...parsed,
        version: 1,
        planner: `openai:${OPENAI_MODEL}`,
        presetId,
        presetLabel,
        source: fallbackPlan.source,
        timeline: {
          ...fallbackPlan.timeline,
          ...(typeof parsed.timeline === "object" && parsed.timeline ? parsed.timeline : {}),
          segments: publicSegments(normalizedSegments),
          silences: publicRanges(silences),
        },
        render: {
          ...fallbackPlan.render,
          ...(typeof parsed.render === "object" && parsed.render ? parsed.render : {}),
          engine: "hyperframes",
          overlays: Boolean(parsed?.render?.overlays && presetId !== "cleancut"),
          preserveAudio: true,
        },
      },
      plannerUsed: `openai:${OPENAI_MODEL}`,
      plannerWarning: null,
    };
  } catch (error) {
    return {
      plan: fallbackPlan,
      plannerUsed: "deterministic-fallback",
      plannerWarning:
        error instanceof Error
          ? `OpenAI planner failed; used deterministic audio analysis. ${error.message}`
          : "OpenAI planner failed; used deterministic audio analysis.",
    };
  } finally {
    clearTimeout(timer);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function writeComposition({ jobDir, videoPath, cues, info, presetLabel, showOverlays }) {
  const width = info.width || 1080;
  const height = info.height || 1920;
  const duration = Math.max(1, info.duration || 12);
  const videoName = basename(videoPath);
  const safeCues = showOverlays ? cues : [];
  const cueHtml = safeCues
    .map(
      (cue, index) => `
        <div
          id="caption-${index}"
          class="caption"
          data-start="${cue.startTime}"
          data-duration="${cue.duration}"
          data-track-index="2"
        >${escapeHtml(cue.text)}</div>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background: #000;
        font-family: Inter, Arial, sans-serif;
      }
      #root {
        position: relative;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background: #000;
      }
      video.base {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: #000;
      }
      .grade {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 50% 78%, rgba(234,255,0,.14), transparent 28%),
          linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.38));
        pointer-events: none;
      }
      .badge {
        position: absolute;
        left: 5%;
        top: 6%;
        padding: 10px 16px;
        border: 1px solid rgba(234,255,0,.35);
        border-radius: 999px;
        background: rgba(0,0,0,.5);
        color: #eaff00;
        font-size: ${Math.max(20, Math.round(height * 0.018))}px;
        font-weight: 800;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .caption {
        position: absolute;
        left: 7%;
        right: 7%;
        bottom: 9%;
        text-align: center;
        color: #fff;
        font-size: ${Math.max(34, Math.round(height * 0.045))}px;
        font-weight: 900;
        line-height: 1.08;
        text-wrap: balance;
        text-shadow:
          0 4px 0 #000,
          0 0 26px rgba(0,0,0,.9),
          0 0 18px rgba(234,255,0,.28);
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${duration}"
      data-width="${width}"
      data-height="${height}"
    >
      <video
        class="base"
        src="./${escapeHtml(videoName)}"
        muted
        playsinline
        preload="auto"
        data-start="0"
        data-duration="${duration}"
        data-track-index="0"
      ></video>
      ${
        showOverlays
          ? `<div class="grade" data-start="0" data-duration="${duration}" data-track-index="1"></div>
      <div class="badge" data-start="0" data-duration="${Math.min(2.4, duration)}" data-track-index="2">${escapeHtml(presetLabel)}</div>`
          : ""
      }
      ${cueHtml}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${safeCues
        .map(
          (_, index) =>
            `tl.fromTo("#caption-${index}", { opacity: 0, y: 24, scale: .98 }, { opacity: 1, y: 0, scale: 1, duration: .22 }, ${safeCues[index].startTime});`,
        )
        .join("\n      ")}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>`;
  const compositionPath = join(jobDir, "index.html");
  await writeFile(compositionPath, html, "utf8");
  return compositionPath;
}

async function muxAudio(renderedVideoPath, audioSourcePath, outputPath, hasAudio) {
  if (!hasAudio) {
    await copyFile(renderedVideoPath, outputPath);
    return;
  }
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-i",
    renderedVideoPath,
    "-i",
    audioSourcePath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0?",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

async function renderJob({ file, plan, presetLabel, presetId }) {
  const jobId = randomUUID();
  const jobDir = join(OUTPUT_ROOT, jobId);
  await mkdir(jobDir, { recursive: true });
  const inputName = `source${extname(file.name || "") || ".mp4"}`;
  const inputPath = join(jobDir, inputName);
  if (typeof file.size === "number" && file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Video is larger than the 1 GB local render limit.");
  }
  if (typeof file.stream === "function") {
    await pipeline(Readable.fromWeb(file.stream()), createWriteStream(inputPath));
  } else {
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
  }
  const inputStat = await stat(inputPath);
  if (inputStat.size > MAX_UPLOAD_BYTES) {
    throw new Error("Video is larger than the 1 GB local render limit.");
  }

  const inputInfo = await ffprobe(inputPath);
  if (inputInfo.duration > MAX_RENDER_DURATION_SECONDS) {
    throw new Error(
      `Video is ${Math.round(inputInfo.duration)}s, but this local worker is limited to ${MAX_RENDER_DURATION_SECONDS}s.`,
    );
  }
  const silences = await detectSilences(inputPath, inputInfo.duration, inputInfo.hasAudio);
  const suggestedSegments = buildKeepSegments(inputInfo.duration, silences);
  const plannerResult = await callOpenAIEditPlanner({
    prompt: plan,
    presetId,
    presetLabel,
    inputInfo,
    suggestedSegments,
    silences,
  });
  const keepSegments = normalizePlannerSegments(
    plannerResult.plan?.timeline?.segments,
    inputInfo.duration,
    suggestedSegments,
  );
  const cutPath = join(jobDir, "smart-cut.mp4");
  const changedByCut = await cutVideo(inputPath, cutPath, keepSegments, inputInfo);
  const cutInfo = await ffprobe(cutPath);
  const removedDuration = Math.max(0, inputInfo.duration - cutInfo.duration);
  const isCleanCut = presetId === "cleancut";
  const outputName = `${safeName(file.name?.replace(/\.[^.]+$/, "") || "smart-frames")}-${isCleanCut ? "cleancut-hyperframes" : "hyperframes"}.mp4`;
  const outputPath = join(jobDir, outputName);

  const plannerCaptions = Array.isArray(plannerResult.plan?.captions)
    ? plannerResult.plan.captions
        .map((caption) => ({
          startTime: Number(caption.startTime ?? caption.start ?? 0),
          duration: Number(caption.duration ?? Math.max(0, Number(caption.end ?? 0) - Number(caption.start ?? 0))),
          text: String(caption.text ?? "").trim(),
        }))
        .filter((caption) => caption.text && caption.duration > 0)
    : [];
  const showOverlays = Boolean(plannerResult.plan?.render?.overlays && !isCleanCut);
  const cues = showOverlays
    ? plannerCaptions.length
      ? plannerCaptions
      : makeCues(JSON.stringify(plannerResult.plan, null, 2), presetLabel, cutInfo.duration)
    : [];
  const compositionPath = await writeComposition({
    jobDir,
    videoPath: cutPath,
    cues,
    info: cutInfo,
    presetLabel,
    showOverlays,
  });
  const renderOnlyPath = join(jobDir, "hyperframes-video.mp4");
  let renderedBy = "hyperframes";
  let renderWarning = plannerResult.plannerWarning;

  try {
    await run(
      "npx",
      [
        "--yes",
        `hyperframes@${HYPERFRAMES_VERSION}`,
        "render",
        jobDir,
        "--output",
        renderOnlyPath,
      ],
      {
        cwd: jobDir,
        timeoutMs: Math.min(
          45 * 60 * 1000,
          Math.max(10 * 60 * 1000, Math.ceil((cutInfo.duration || 1) * 3000)),
        ),
      },
    );
    await muxAudio(renderOnlyPath, cutPath, outputPath, cutInfo.hasAudio);
  } catch (error) {
    renderedBy = "ffmpeg-fallback";
    const hyperFrameError =
      error instanceof Error
        ? error.message.split(/\r?\n/).slice(0, 3).join("\n")
        : "HyperFrames render failed.";
    renderWarning = renderWarning ? `${renderWarning}\n${hyperFrameError}` : hyperFrameError;
    await copyFile(cutPath, outputPath);
  }

  const publicBase = `http://${HOST}:${PORT}/outputs/${jobId}`;
  return {
    jobId,
    renderedBy,
    renderWarning,
    plannerUsed: plannerResult.plannerUsed,
    editPlan: plannerResult.plan,
    plan: JSON.stringify(plannerResult.plan, null, 2),
    changedByCut,
    outputFileName: outputName,
    outputUrl: `${publicBase}/${encodeURIComponent(outputName)}`,
    cutFileName: "smart-cut.mp4",
    cutUrl: `${publicBase}/smart-cut.mp4`,
    duration: cutInfo.duration,
    originalDuration: inputInfo.duration,
    removedDuration,
    width: cutInfo.width,
    height: cutInfo.height,
    segments: publicSegments(keepSegments),
    silences: publicRanges(silences),
    cues,
  };
}

async function handleRender(req, res) {
  if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
    json(res, 429, {
      ok: false,
      error: "Smart Frames worker is busy. Wait for the current render to finish, then try again.",
    });
    return;
  }
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > MAX_UPLOAD_BYTES + 1024 * 1024) {
    json(res, 413, { ok: false, error: "Video is larger than the 1 GB local render limit." });
    return;
  }
  activeRenderCount += 1;
  try {
    const request = new Request(`http://${HOST}:${PORT}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: Readable.toWeb(req),
      duplex: "half",
    });
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      json(res, 400, { ok: false, error: "Missing video file." });
      return;
    }
    const plan = String(form.get("plan") || "");
    const presetId = String(form.get("presetId") || "");
    const presetLabel = String(form.get("presetLabel") || "Smart Frames");
    const result = await renderJob({ file, plan, presetLabel, presetId });
    json(res, 200, { ok: true, ...result });
  } finally {
    activeRenderCount = Math.max(0, activeRenderCount - 1);
  }
}

async function handleOutput(req, res) {
  const url = new URL(req.url, BASE_URL);
  const [, , jobId, ...fileParts] = url.pathname.split("/");
  const fileName = decodeURIComponent(fileParts.join("/"));
  if (!jobId || !fileName) {
    json(res, 404, { ok: false, error: "File not found." });
    return;
  }
  const outputRoot = resolve(OUTPUT_ROOT);
  const filePath = resolve(OUTPUT_ROOT, jobId || "", fileName || "");
  if (
    !(filePath === outputRoot || filePath.startsWith(`${outputRoot}${sep}`)) ||
    !existsSync(filePath)
  ) {
    json(res, 404, { ok: false, error: "File not found." });
    return;
  }
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat) {
    json(res, 404, { ok: false, error: "File not found." });
    return;
  }
  if (!fileStat.isFile()) {
    json(res, 404, { ok: false, error: "File not found." });
    return;
  }
  const type = extname(filePath).toLowerCase() === ".mp4" ? "video/mp4" : "application/octet-stream";
  const baseHeaders = {
    "content-type": type,
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "content-length,content-range,accept-ranges",
    "accept-ranges": "bytes",
    "cache-control": "no-store",
  };
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.writeHead(416, { ...baseHeaders, "content-range": `bytes */${fileStat.size}` });
      res.end();
      return;
    }
    const isSuffixRange = !match[1] && Boolean(match[2]);
    const suffixLength = isSuffixRange ? Number(match[2]) : 0;
    const requestedStart = isSuffixRange
      ? Math.max(0, fileStat.size - suffixLength)
      : match[1]
        ? Number(match[1])
        : 0;
    const requestedEnd = isSuffixRange || !match[2] ? fileStat.size - 1 : Number(match[2]);
    const start = Math.max(0, requestedStart);
    const end = Math.min(fileStat.size - 1, requestedEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= fileStat.size) {
      res.writeHead(416, { ...baseHeaders, "content-range": `bytes */${fileStat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      ...baseHeaders,
      "content-range": `bytes ${start}-${end}/${fileStat.size}`,
      "content-length": end - start + 1,
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(filePath, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    ...baseHeaders,
    "content-length": fileStat.size,
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

await mkdir(OUTPUT_ROOT, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,HEAD,POST,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type,range",
        "access-control-expose-headers": "content-length,content-range,accept-ranges",
      });
      res.end();
      return;
    }
    if (req.method === "GET" && req.url === "/health") {
      json(res, 200, {
        ok: true,
        worker: "smart-frames",
        hyperframes: HYPERFRAMES_VERSION,
        activeRenderCount,
        maxConcurrentRenders: MAX_CONCURRENT_RENDERS,
        maxUploadBytes: MAX_UPLOAD_BYTES,
        maxRenderDurationSeconds: MAX_RENDER_DURATION_SECONDS,
        openAIPlannerConfigured: Boolean(OPENAI_API_KEY),
        openAIPlannerModel: OPENAI_MODEL,
        silenceNoiseDb: SILENCE_NOISE_DB,
        minDeadAirSeconds: MIN_DEAD_AIR_SECONDS,
        speechHandleSeconds: SPEECH_HANDLE_SECONDS,
      });
      return;
    }
    if (req.method === "POST" && req.url === "/render") {
      await handleRender(req, res);
      return;
    }
    if ((req.method === "GET" || req.method === "HEAD") && req.url.startsWith("/outputs/")) {
      await handleOutput(req, res);
      return;
    }
    if (req.method === "DELETE" && req.url === "/outputs") {
      await rm(OUTPUT_ROOT, { recursive: true, force: true });
      await mkdir(OUTPUT_ROOT, { recursive: true });
      json(res, 200, { ok: true });
      return;
    }
    json(res, 404, { ok: false, error: "Unknown route." });
  } catch (error) {
    json(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Smart Frames worker failed.",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Smart Frames worker listening on ${BASE_URL}`);
  console.log("Keep this terminal open while using Smart Frames. Press Ctrl+C to stop.");
});

server.on("error", async (error) => {
  if (error?.code === "EADDRINUSE") {
    const health = await readExistingWorkerHealth();
    if (health?.ok && health?.worker === "smart-frames") {
      console.log(`Smart Frames worker is already running on ${BASE_URL}.`);
      console.log("You can keep using the existing worker. Press Ctrl+C in its terminal to stop it.");
      process.exit(0);
    }
    console.error(`Port ${PORT} is already in use by another process.`);
    console.error(`Set SMART_FRAMES_WORKER_PORT to another port, then set VITE_SMART_FRAMES_WORKER_URL=${BASE_URL.replace(String(PORT), "<new-port>")}.`);
    process.exit(1);
  }
  throw error;
});
