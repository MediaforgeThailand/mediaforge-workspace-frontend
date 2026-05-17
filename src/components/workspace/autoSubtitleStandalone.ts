import type {
  CaptionAnimation,
  CaptionTextAnimation,
  CaptionStyleSettings,
} from "@/features/editor/services/caption-presets";
import {
  formatAutoSuptitleCueText,
  normalizeAutoSuptitleCuesForDuration,
} from "@/features/editor/services/auto-suptitle";
import type {
  AutoSuptitleCue,
  AutoSuptitleResult,
} from "@/features/editor/services/auto-suptitle";

export const AUTO_SUBTITLE_HANDOFF_PREFIX = "mediaforge:auto-subtitle-handoff:";

export interface AutoSubtitleEditorHandoff {
  version: 1;
  feature: "auto-suptitle";
  source: {
    url: string;
    fileName: string;
    mime: string;
    duration?: number;
  };
  track: {
    name: string;
    cues: AutoSuptitleCue[];
    meta: AutoSuptitleResult["meta"];
  };
  style: CaptionStyleSettings;
  transcriptText: string;
  createdAt: number;
}

export function saveAutoSubtitleHandoff(payload: AutoSubtitleEditorHandoff): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(`${AUTO_SUBTITLE_HANDOFF_PREFIX}${id}`, JSON.stringify(payload));
  return id;
}

export function loadAutoSubtitleHandoff(id: string): AutoSubtitleEditorHandoff | null {
  try {
    const raw = localStorage.getItem(`${AUTO_SUBTITLE_HANDOFF_PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AutoSubtitleEditorHandoff;
    if (parsed?.version !== 1 || parsed?.feature !== "auto-suptitle") return null;
    if (!parsed.source?.url || !Array.isArray(parsed.track?.cues)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAutoSubtitleHandoff(id: string): void {
  try {
    localStorage.removeItem(`${AUTO_SUBTITLE_HANDOFF_PREFIX}${id}`);
  } catch {
    // Storage is best-effort only.
  }
}

async function readSourceVideoMetadata(sourceUrl: string): Promise<{
  width: number;
  height: number;
  duration: number;
}> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "metadata";
  video.src = sourceUrl;
  await waitForVideoMetadata(video);
  const width = video.videoWidth || 1920;
  const height = video.videoHeight || 1080;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  video.removeAttribute("src");
  video.load();
  return { width, height, duration };
}

async function sourceFileFromHandoff(handoff: AutoSubtitleEditorHandoff): Promise<File> {
  const response = await fetch(handoff.source.url);
  if (!response.ok) {
    throw new Error("Could not load the source video for the editor project.");
  }
  const blob = await response.blob();
  return new File([blob], handoff.source.fileName || "auto-subtitle-source.mp4", {
    type: handoff.source.mime || blob.type || "video/mp4",
  });
}

function projectNameFromSource(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim() || "Video";
  return `Auto Subtitle - ${base}`.slice(0, 96);
}

export async function createAutoSubtitleEditorProject(
  handoff: AutoSubtitleEditorHandoff,
): Promise<string> {
  const [
    { useProjectStore },
    { saveProject },
    { algorithmFromCaptionSettings, materializeAutoSuptitleTrack },
  ] = await Promise.all([
    import("@/features/editor/stores/project-store"),
    import("@/features/editor/services/project-cloud"),
    import("@/features/editor/services/auto-suptitle"),
  ]);
  const metadata = await readSourceVideoMetadata(handoff.source.url).catch(() => ({
    width: 1920,
    height: 1080,
    duration: handoff.source.duration ?? 0,
  }));
  const store = useProjectStore.getState();
  store.createNewProject(projectNameFromSource(handoff.source.fileName), {
    width: metadata.width,
    height: metadata.height,
    frameRate: 30,
  });

  const sourceFile = await sourceFileFromHandoff(handoff);
  const importResult = await useProjectStore.getState().importMedia(sourceFile);
  if (!importResult.success || !importResult.actionId) {
    throw new Error(importResult.error?.message || "Could not import source video into the editor.");
  }

  useProjectStore.setState((state) => ({
    project: {
      ...state.project,
      mediaLibrary: {
        ...state.project.mediaLibrary,
        items: state.project.mediaLibrary.items.map((item) =>
          item.id === importResult.actionId
            ? { ...item, originalUrl: handoff.source.url }
            : item,
        ),
      },
    },
  }));

  const clipResult = await useProjectStore.getState().addClipToNewTrack(importResult.actionId, 0);
  if (!clipResult.success) {
    throw new Error(clipResult.error?.message || "Could not add the source video to the editor timeline.");
  }

  const result: AutoSuptitleResult = {
    whisperResponse: {
      text: handoff.transcriptText,
      language: handoff.track.meta.language,
      segments: [],
      words: handoff.track.cues.flatMap((cue) =>
        cue.words.map((word) => ({
          word: word.text,
          start: word.start,
          end: word.end,
        })),
      ),
    } as AutoSuptitleResult["whisperResponse"],
    cues: handoff.track.cues,
    meta: handoff.track.meta,
    algorithm: algorithmFromCaptionSettings(handoff.style),
  };

  const materialized = await materializeAutoSuptitleTrack({
    result,
    settings: handoff.style,
    trackName: handoff.track.name,
  });
  if (!materialized) {
    throw new Error("Could not create the editable subtitle track.");
  }

  const project = useProjectStore.getState().getFullProject();
  const saved = await saveProject(project);
  if (!saved) {
    throw new Error("Could not save the editor project.");
  }
  return project.id;
}

export interface RenderAutoSubtitleVideoResult {
  blob: Blob;
  mime: string;
  extension: "mp4" | "webm";
  duration: number;
  width: number;
  height: number;
}

interface RenderAutoSubtitleVideoOptions {
  sourceUrl: string;
  cues: AutoSuptitleCue[];
  settings: CaptionStyleSettings;
  onProgress?: (progress: number, message: string) => void;
}

const VIDEO_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function supportedRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return VIDEO_MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? "";
}

function autoSubtitleRenderBitrate(durationSec: number): number {
  if (durationSec >= 8 * 60) return 2_500_000;
  if (durationSec >= 5 * 60) return 3_000_000;
  return 6_000_000;
}

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
    };
    video.onloadedmetadata = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Could not load the source video for subtitle rendering."));
    };
  });
}

function waitForSeek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.01 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", done);
      resolve();
    };
    const timeout = window.setTimeout(done, 1500);
    video.addEventListener("seeked", done, { once: true });
    video.currentTime = time;
  });
}

async function startVideoPlayback(video: HTMLVideoElement): Promise<void> {
  try {
    await video.play();
  } catch (err) {
    // Rendering can start after a long transcription step, so browser user-gesture
    // autoplay permission may be gone. Muted playback keeps subtitle rendering usable.
    video.muted = true;
    await video.play().catch(() => {
      throw err;
    });
  }
}

function wrapCaptionText(
  text: string,
): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function captionCanvasFont(
  settings: CaptionStyleSettings,
  fontSize: number,
  weight: number,
  family: string,
): string {
  return `${settings.italic ? "italic " : ""}${weight} ${fontSize}px ${family}, Inter, Arial, sans-serif`;
}

function fitCaptionFontSize(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  settings: CaptionStyleSettings,
  baseFontSize: number,
  weight: number,
  family: string,
  maxWidth: number,
): number {
  const minFontSize = Math.max(16, Math.floor(baseFontSize * 0.56));
  let nextFontSize = baseFontSize;

  while (nextFontSize > minFontSize) {
    ctx.font = captionCanvasFont(settings, nextFontSize, weight, family);
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width), 0);
    if (widest <= maxWidth) break;
    nextFontSize -= 1;
  }

  ctx.font = captionCanvasFont(settings, nextFontSize, weight, family);
  return nextFontSize;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

interface CueTransitionFrame {
  opacity: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value: number): number {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(value: number): number {
  const t = clamp01(value);
  return t * t * t;
}

function easeOutBack(value: number): number {
  const t = clamp01(value) - 1;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * t * t * t + c1 * t * t;
}

function cueTransitionFrame(
  cue: AutoSuptitleCue,
  animation: CaptionAnimation,
  currentTime: number,
  pixelScale: number,
): CueTransitionFrame {
  const duration = Math.max(0.01, cue.endTime - cue.startTime);
  const inDuration = Math.min(0.22, duration * 0.34);
  const outDuration = Math.min(0.16, duration * 0.28);
  const inProgress = inDuration > 0 ? easeOutCubic((currentTime - cue.startTime) / inDuration) : 1;
  const outProgress = outDuration > 0 ? easeInCubic((cue.endTime - currentTime) / outDuration) : 1;
  const outAmount = 1 - outProgress;
  const distance = 18 * pixelScale;

  switch (animation) {
    case "fade":
      return {
        opacity: inProgress * outProgress,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      };
    case "slideIn":
    case "slideUp":
      return {
        opacity: inProgress * outProgress,
        scale: 1,
        offsetX: 0,
        offsetY: (1 - inProgress) * distance - outAmount * distance * 0.7,
      };
    case "slideDown":
      return {
        opacity: inProgress * outProgress,
        scale: 1,
        offsetX: 0,
        offsetY: -(1 - inProgress) * distance + outAmount * distance * 0.7,
      };
    case "scale":
      return {
        opacity: inProgress * outProgress,
        scale: (0.92 + inProgress * 0.08) * (1 - outAmount * 0.05),
        offsetX: 0,
        offsetY: 0,
      };
    case "pop": {
      const overshoot = inProgress < 0.72
        ? 0.82 + inProgress * 0.3
        : 1 + (1 - inProgress) * 0.08;
      return {
        opacity: Math.min(1, inProgress * 1.4) * outProgress,
        scale: Math.max(0.72, overshoot * (1 - outAmount * 0.1)),
        offsetX: 0,
        offsetY: 0,
      };
    }
    case "typewriter":
    case "wordHighlight":
    case "none":
    default:
      return {
        opacity: 1,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      };
  }
}

function cueTextAnimationFrame(
  cue: AutoSuptitleCue,
  animation: CaptionTextAnimation | undefined,
  currentTime: number,
  pixelScale: number,
): CueTransitionFrame {
  const duration = Math.max(0.01, cue.endTime - cue.startTime);
  const elapsed = Math.max(0, currentTime - cue.startTime);
  const progress = clamp01((currentTime - cue.startTime) / duration);
  const entryDuration = Math.min(0.72, Math.max(0.28, duration * 0.42));
  const entry = clamp01(elapsed / entryDuration);
  const easedEntry = easeOutCubic(entry);
  const backEntry = easeOutBack(entry);
  const wave = Math.sin(progress * Math.PI * 2);
  const fastWave = Math.sin(progress * Math.PI * 8);
  const distance = 14 * pixelScale;

  switch (animation) {
    case "typing-cursor":
      return {
        opacity: entry < 0.18 ? 0.35 : 1,
        scale: 1,
        offsetX: (1 - easedEntry) * -distance * 0.5,
        offsetY: 0,
      };
    case "bounce-left":
      return {
        opacity: Math.min(1, entry * 1.4),
        scale: Math.max(0.82, backEntry),
        offsetX: (1 - easedEntry) * -distance * 1.4,
        offsetY: Math.sin(entry * Math.PI) * -distance * 0.18,
      };
    case "in-scanner":
      return {
        opacity: Math.min(1, entry * 1.6),
        scale: 1,
        offsetX: (1 - easedEntry) * distance * 0.35,
        offsetY: 0,
      };
    case "text-sprout":
      return {
        opacity: Math.min(1, entry * 1.5),
        scale: Math.max(0.45, backEntry),
        offsetX: 0,
        offsetY: (1 - easedEntry) * distance,
      };
    case "leap-in":
      return {
        opacity: Math.min(1, entry * 1.5),
        scale: Math.max(0.78, backEntry),
        offsetX: 0,
        offsetY: (1 - easedEntry) * distance * 1.25,
      };
    case "rebound-in":
    case "tension-release":
      return {
        opacity: Math.min(1, entry * 1.35),
        scale: Math.max(0.75, backEntry),
        offsetX: 0,
        offsetY: 0,
      };
    case "loud-emphasis":
    case "big-echoes":
      return {
        opacity: 1,
        scale: 1 + Math.max(0, wave) * 0.065,
        offsetX: 0,
        offsetY: 0,
      };
    case "spatter-stroke":
    case "quirky-spelling":
      return {
        opacity: 1,
        scale: 1,
        offsetX: fastWave * distance * 0.28,
        offsetY: Math.cos(progress * Math.PI * 8) * distance * 0.12,
      };
    case "ode-to-joy":
    case "bubble-sprite":
      return {
        opacity: 1,
        scale: 1,
        offsetX: 0,
        offsetY: wave * distance * 0.45,
      };
    case "pop-snow":
    case "love-emphasis":
      return {
        opacity: 1,
        scale: 1 + Math.max(0, wave) * 0.045,
        offsetX: 0,
        offsetY: 0,
      };
    case "hope-horizon":
    case "sequence-reveal":
      return {
        opacity: Math.min(1, entry * 1.5),
        scale: 1,
        offsetX: (1 - easedEntry) * -distance * 0.45,
        offsetY: 0,
      };
    case "wavy-roll":
      return {
        opacity: Math.min(1, entry * 1.4),
        scale: 1,
        offsetX: 0,
        offsetY: wave * distance * 0.35,
      };
    case "blaze-shot":
      return {
        opacity: Math.min(1, entry * 1.5),
        scale: 1,
        offsetX: (1 - easedEntry) * -distance,
        offsetY: 0,
      };
    case "none":
    default:
      return {
        opacity: 1,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      };
  }
}

function drawCue(
  ctx: CanvasRenderingContext2D,
  cue: AutoSuptitleCue | undefined,
  settings: CaptionStyleSettings,
  width: number,
  height: number,
  currentTime: number,
) {
  if (!cue) return;
  const scale = Math.max(0.5, Math.min(2.5, height / 1080));
  const baseFontSize = Math.max(18, Math.round(settings.size * scale));
  const weight = settings.weight || 800;
  const family = settings.font || "Inter";
  const margin = Math.max(24, settings.margin * scale);

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = settings.positionH === "left" ? "left" : settings.positionH === "right" ? "right" : "center";

  const formattedText = formatAutoSuptitleCueText(cue.text, settings.wordsPerLine);
  const lines = wrapCaptionText(formattedText);
  if (lines.length === 0) {
    ctx.restore();
    return;
  }

  const maxTextWidth = Math.max(48, width - margin * 2);
  const fontSize = fitCaptionFontSize(
    ctx,
    lines,
    settings,
    baseFontSize,
    weight,
    family,
    maxTextWidth,
  );
  const lineHeight = fontSize * 1.18;
  const blockHeight = lines.length * lineHeight;
  const x =
    settings.positionH === "left"
      ? margin
      : settings.positionH === "right"
        ? width - margin
        : width / 2;
  const centerY =
    settings.positionV === "top"
      ? margin + blockHeight / 2
      : settings.positionV === "bottom"
        ? height - margin - blockHeight / 2
        : height / 2;
  const firstY = centerY - blockHeight / 2 + lineHeight / 2;
  const transition = cueTransitionFrame(cue, settings.animation, currentTime, scale);
  const textMotion = cueTextAnimationFrame(
    cue,
    settings.textAnimation,
    currentTime,
    scale,
  );
  if (transition.opacity <= 0.01 || transition.scale <= 0.01) {
    ctx.restore();
    return;
  }

  ctx.globalAlpha *= transition.opacity * textMotion.opacity;
  ctx.translate(
    transition.offsetX + textMotion.offsetX,
    transition.offsetY + textMotion.offsetY,
  );
  ctx.translate(x, centerY);
  ctx.scale(
    transition.scale * textMotion.scale,
    transition.scale * textMotion.scale,
  );
  ctx.translate(-x, -centerY);

  if (settings.background.enabled) {
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const padX = Math.max(10, settings.background.padding * scale);
    const padY = Math.max(6, settings.background.padding * 0.7 * scale);
    const rectWidth = Math.min(width - margin * 0.8, widest + padX * 2);
    const rectX =
      settings.positionH === "left"
        ? x - padX
        : settings.positionH === "right"
          ? x - rectWidth + padX
          : x - rectWidth / 2;
    const rectY = centerY - blockHeight / 2 - padY;
    ctx.fillStyle = settings.background.color;
    drawRoundedRect(
      ctx,
      rectX,
      rectY,
      rectWidth,
      blockHeight + padY * 2,
      settings.background.cornerRadius * scale,
    );
    ctx.fill();
  }

  const textGlowEnabled =
    settings.textAnimation === "hope-horizon" ||
    settings.textAnimation === "love-emphasis" ||
    settings.textAnimation === "big-echoes";
  if (settings.shadow.enabled || textGlowEnabled) {
    ctx.shadowColor =
      textGlowEnabled
        ? settings.highlightColor || settings.fill
        : settings.shadow.color;
    ctx.shadowBlur =
      textGlowEnabled
        ? Math.max(10, settings.shadow.blur * scale)
        : settings.shadow.blur * scale;
    ctx.shadowOffsetX = settings.shadow.enabled ? settings.shadow.offsetX * scale : 0;
    ctx.shadowOffsetY = settings.shadow.enabled ? settings.shadow.offsetY * scale : 0;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const y = firstY + index * lineHeight;
    if (settings.stroke.enabled && settings.stroke.width > 0) {
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.lineWidth = Math.max(1, settings.stroke.width * scale);
      ctx.strokeStyle = settings.stroke.color;
      ctx.strokeText(lines[index], x, y, maxTextWidth);
    }
    ctx.fillStyle = settings.fill;
    ctx.fillText(lines[index], x, y, maxTextWidth);
  }

  ctx.restore();
}

export async function renderAutoSubtitleVideo(
  options: RenderAutoSubtitleVideoOptions,
): Promise<RenderAutoSubtitleVideoResult> {
  const mime = supportedRecorderMime();
  if (!mime) {
    throw new Error("This browser cannot render a subtitled video preview.");
  }

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.preload = "auto";
  video.muted = false;
  video.src = options.sourceUrl;

  await waitForVideoMetadata(video);
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  if (!duration || duration <= 0) {
    throw new Error("Could not read the source video duration.");
  }
  const cues = normalizeAutoSuptitleCuesForDuration(options.cues, duration);

  await waitForSeek(video, 0);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the subtitle renderer.");

  const stream = canvas.captureStream(30);
  const videoCapture = (video as HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  }).captureStream?.() ?? (video as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream?.();
  videoCapture?.getAudioTracks().forEach((track) => stream.addTrack(track));

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: autoSubtitleRenderBitrate(duration),
  });

  let animationFrame = 0;
  try {
    const recordingDone = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error("Subtitle video recording failed."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(video, 0, 0, width, height);
      const activeCue = cues.find(
        (cue) => video.currentTime >= cue.startTime && video.currentTime < cue.endTime,
      );
      drawCue(ctx, activeCue, options.settings, width, height, video.currentTime);
      options.onProgress?.(
        Math.min(96, 45 + Math.round((video.currentTime / duration) * 50)),
        "Rendering subtitle preview...",
      );
      if (!video.ended && !video.paused) {
        animationFrame = requestAnimationFrame(draw);
      }
    };

    recorder.start(750);
    options.onProgress?.(45, "Rendering subtitle preview...");
    const ended = new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });
    await startVideoPlayback(video);
    draw();
    await ended;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (recorder.state !== "inactive") recorder.stop();
    const blob = await recordingDone;

    return {
      blob,
      mime,
      extension: mime.includes("mp4") ? "mp4" : "webm",
      duration,
      width,
      height,
    };
  } finally {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}
