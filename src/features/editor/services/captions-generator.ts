/**
 * Caption generation orchestrator.
 *
 * Glues together:
 *   1. Audio extraction from a clip (via TranscriptionService)
 *   2. Upload to the captions-transcribe Supabase edge function (via captions-client)
 *   3. Word-grouping into caption-sized lines
 *   4. Creation of TextClips on a "Captions" track via the project store
 *
 * Exposes a single high-level entry point: `generateCaptions(...)`.
 */
import {
  TranscriptionService,
  type CloudflareWhisperResponse,
  type CloudflareWhisperWord,
  type WhisperTranscriptionProgress,
  type Clip,
  type MediaItem,
  type CaptionClipMeta,
  type TextStyle,
} from "@/lib/openreel-core";
import { transcribeAudio } from "./captions-client";
import type { CaptionStyleSettings } from "./caption-presets";
import { applyCaptionCase } from "./caption-presets";

export interface GenerateCaptionsArgs {
  /** Caption style settings — controls font, size, position, animation, etc. */
  settings: CaptionStyleSettings;
  /** The source clip to transcribe (must have audio). */
  clip: Clip;
  /** The MediaItem backing the source clip (provides the actual file). */
  mediaItem: MediaItem;
  /** Whisper language code, e.g. "en", "th", or "auto". */
  language?: string;
  /** Optional Whisper prompt for proper-noun / brand hints. */
  prompt?: string;
  /** Progress callback for UI. */
  onProgress?: (progress: WhisperTranscriptionProgress) => void;
}

export interface CaptionGenerationResult {
  /** Whisper response (raw). */
  whisperResponse: CloudflareWhisperResponse;
  /** Grouped caption lines (already case-transformed, ready to render). */
  lines: CaptionLine[];
  /** Generation metadata to attach to all created clips. */
  meta: CaptionClipMeta;
}

export interface CaptionLine {
  /** Display text (already case-transformed). */
  text: string;
  /** Absolute timeline start time (seconds). */
  startTime: number;
  /** Absolute timeline end time (seconds). */
  endTime: number;
  /** Word-level timing (absolute timeline seconds). */
  words: Array<{ text: string; start: number; end: number }>;
}

/**
 * Build a TextStyle from CaptionStyleSettings — the renderer reads these
 * fields directly.
 */
export function captionSettingsToTextStyle(
  settings: CaptionStyleSettings,
  bgEnabled = false,
): Partial<TextStyle> {
  return {
    fontFamily: settings.font,
    fontSize: settings.size,
    fontWeight: settings.weight as TextStyle["fontWeight"],
    fontStyle: settings.italic ? "italic" : "normal",
    color: settings.fill,
    backgroundColor: bgEnabled && settings.background.enabled ? settings.background.color : undefined,
    strokeColor: settings.stroke.enabled ? settings.stroke.color : undefined,
    strokeWidth: settings.stroke.enabled ? settings.stroke.width : undefined,
    shadowColor: settings.shadow.enabled ? settings.shadow.color : undefined,
    shadowBlur: settings.shadow.enabled ? settings.shadow.blur : undefined,
    shadowOffsetX: settings.shadow.enabled ? settings.shadow.offsetX : undefined,
    shadowOffsetY: settings.shadow.enabled ? settings.shadow.offsetY : undefined,
    textAlign: settings.positionH === "left" ? "left" : settings.positionH === "right" ? "right" : "center",
    verticalAlign: "middle",
    lineHeight: 1.2,
    letterSpacing: 0,
    effects: {
      background: settings.background.enabled
        ? {
            enabled: true,
            color: settings.background.color,
            cornerRadius: settings.background.cornerRadius,
          }
        : undefined,
    },
  };
}

/**
 * Compute the normalized (0-1) transform position from caption settings.
 * `margin` is interpreted relative to a 1080p reference height; the renderer
 * applies it against the actual canvas height.
 */
export function captionPositionToTransform(
  settings: CaptionStyleSettings,
  refHeight = 1080,
  refWidth = 1920,
): { x: number; y: number } {
  let x = 0.5;
  let y = 0.5;
  if (settings.positionH === "left") x = settings.margin / refWidth;
  else if (settings.positionH === "right") x = 1 - settings.margin / refWidth;
  if (settings.positionV === "top") y = settings.margin / refHeight;
  else if (settings.positionV === "bottom") y = 1 - settings.margin / refHeight;
  return { x, y };
}

/**
 * Group Whisper words into caption lines using settings.wordsPerLine and
 * settings.maxLineDuration. Times are shifted by clipStartTime so output
 * is in absolute timeline coordinates.
 */
export function groupWordsIntoLines(
  words: CloudflareWhisperWord[],
  clipStartTime: number,
  settings: CaptionStyleSettings,
): CaptionLine[] {
  if (!words || words.length === 0) return [];
  const lines: CaptionLine[] = [];
  const maxWords = Math.max(1, Math.floor(settings.wordsPerLine));
  const maxDuration = Math.max(0.5, settings.maxLineDuration);

  let bucket: CloudflareWhisperWord[] = [];
  let bucketStart = 0;
  const flush = () => {
    if (bucket.length === 0) return;
    const text = bucket.map((w) => w.word).join(" ").replace(/\s+/g, " ").trim();
    const startTime = clipStartTime + bucket[0].start;
    const endTime = clipStartTime + bucket[bucket.length - 1].end;
    lines.push({
      text: applyCaptionCase(text, settings.case),
      startTime,
      endTime,
      words: bucket.map((w) => ({
        text: w.word,
        start: clipStartTime + w.start,
        end: clipStartTime + w.end,
      })),
    });
    bucket = [];
  };

  for (const word of words) {
    if (bucket.length === 0) bucketStart = word.start;
    const wordsFull = bucket.length >= maxWords;
    const durationFull = word.end - bucketStart > maxDuration;
    if (wordsFull || durationFull) {
      flush();
      bucketStart = word.start;
    }
    bucket.push(word);
    // Sentence-ending punctuation closes a line if we already have a few words.
    if (/[.!?]$/.test(word.word) && bucket.length >= 2) {
      flush();
    }
  }
  flush();
  return lines;
}

/**
 * Extract audio from the clip and transcribe via the Supabase function.
 * Returns the raw Whisper response plus the pre-computed caption lines and
 * metadata. Caller is responsible for creating the actual TextClips
 * (which requires access to the project store).
 */
export async function generateCaptions(
  args: GenerateCaptionsArgs,
): Promise<CaptionGenerationResult> {
  const { clip, mediaItem, settings, language, prompt, onProgress } = args;

  // Bootstrap a TranscriptionService instance just for the extractAudioFromClip helper.
  // For e2e/headless tests, allow injecting a mock transcribe function via
  // `window.__or_captionsMock` so we can exercise the full caption-clip-creation
  // flow without an OpenAI API key.
  const mockTranscribe =
    typeof window !== "undefined"
      ? (window as unknown as { __or_captionsMock?: (audio: Blob, opts: { language?: string; prompt?: string }) => Promise<CloudflareWhisperResponse> }).__or_captionsMock
      : undefined;

  const svc = new TranscriptionService({
    uploader: mockTranscribe ?? (async (audio, opts) => transcribeAudio(audio, opts)),
    language,
    prompt,
    maxSegmentDuration: settings.maxLineDuration,
    maxWordsPerSegment: settings.wordsPerLine,
  });

  try {
    onProgress?.({
      phase: "extracting",
      progress: 5,
      message: "Extracting audio from clip...",
    });

    const audio = await svc.extractAudioFromClip(clip, mediaItem);

    // OpenAI's Whisper /v1/audio/transcriptions endpoint rejects payloads
    // > 25MB with a generic "Request Entity Too Large" error. Catch this
    // up-front with a friendly message so the user knows to trim the clip
    // before retrying. 24MB threshold gives us multipart-encoding headroom.
    const WHISPER_MAX_BYTES = 24 * 1024 * 1024;
    if (audio.size > WHISPER_MAX_BYTES) {
      const mb = (audio.size / (1024 * 1024)).toFixed(1);
      throw new Error(
        `Audio is too long for transcription (${mb} MB). OpenAI Whisper accepts up to 25 MB — please trim the clip or split it into shorter sections.`,
      );
    }

    onProgress?.({
      phase: "uploading",
      progress: 20,
      message: "Uploading audio for transcription...",
    });

    const whisperResponse = await svc.transcribeBlob(audio, onProgress);

    onProgress?.({
      phase: "processing",
      progress: 92,
      message: "Building caption lines...",
    });

    const lines = groupWordsIntoLines(
      whisperResponse.words ?? [],
      clip.startTime,
      settings,
    );

    const meta: CaptionClipMeta = {
      groupId: `cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      generatedAt: Date.now(),
      language: whisperResponse.language ?? language ?? "auto",
      sourceClipId: clip.id,
      animation: settings.animation,
      highlightColor: settings.highlightColor,
    };

    onProgress?.({
      phase: "complete",
      progress: 100,
      message: `Generated ${lines.length} caption lines`,
    });

    return { whisperResponse, lines, meta };
  } catch (err) {
    onProgress?.({
      phase: "error",
      progress: 0,
      message: err instanceof Error ? err.message : "Caption generation failed",
    });
    throw err;
  } finally {
    svc.dispose();
  }
}
