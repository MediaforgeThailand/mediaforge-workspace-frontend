import { TranscriptionService } from "@/lib/openreel-core";
import type { CloudflareWhisperResponse } from "@/lib/openreel-core";
import { getFFmpegFallback } from "@/lib/openreel-core/media/ffmpeg-fallback";
import { transcribeAudio } from "../captions-client";
import {
  algorithmFromCaptionSettings,
  buildAutoSuptitleCuesFromResponse,
} from "./segmenter";
import {
  AUTO_SUPTITLE_GROUP_PREFIX,
  type AutoSuptitleGenerateArgs,
  type AutoSuptitleResult,
} from "./types";

const WHISPER_MAX_BYTES = 24 * 1024 * 1024;

export async function generateAutoSuptitle(
  args: AutoSuptitleGenerateArgs,
): Promise<AutoSuptitleResult> {
  const { clip, mediaItem, settings, language, prompt, algorithm: overrides, onProgress } = args;
  const algorithm = algorithmFromCaptionSettings(settings, overrides);

  const mockTranscribe =
    typeof window !== "undefined"
      ? (window as unknown as {
          __or_captionsMock?: (
            audio: Blob,
            opts: { language?: string; prompt?: string },
          ) => Promise<CloudflareWhisperResponse>;
        }).__or_captionsMock
      : undefined;

  const svc = new TranscriptionService({
    uploader:
      typeof mockTranscribe === "function"
        ? mockTranscribe
        : async (audio, opts) => transcribeAudio(audio, opts),
    language,
    prompt,
    maxSegmentDuration: algorithm.maxLineDuration,
    maxWordsPerSegment: algorithm.wordsPerLine * algorithm.maxLinesPerCue,
  });

  try {
    onProgress?.({
      phase: "extracting",
      progress: 5,
      message: "Extracting audio from source...",
    });

    const wavAudio = await svc.extractAudioFromClip(clip, mediaItem);

    onProgress?.({
      phase: "compressing",
      progress: 12,
      message: "Compressing audio...",
    });

    const ffmpeg = getFFmpegFallback();
    const audio = await ffmpeg.convertAudio(wavAudio, "mp3", {
      bitrate: "128k",
      channels: 1,
    });

    if (audio.size > WHISPER_MAX_BYTES) {
      const mb = (audio.size / (1024 * 1024)).toFixed(1);
      throw new Error(
        `Compressed audio is too large (${mb} MB). Trim the clip or split it into shorter sections before generating.`,
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
      message: "Building Auto Suptitle text track...",
    });

    const cues = buildAutoSuptitleCuesFromResponse(
      whisperResponse,
      clip.startTime,
      settings,
      algorithm,
      language,
    );

    const meta = {
      groupId: `${AUTO_SUPTITLE_GROUP_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      generatedAt: Date.now(),
      language: whisperResponse.language ?? language ?? "auto",
      sourceClipId: clip.id,
      animation: settings.animation,
      highlightColor: settings.fill,
    } as const;

    onProgress?.({
      phase: "complete",
      progress: 100,
      message: `Created ${cues.length} Auto Suptitle lines`,
    });

    return { whisperResponse, cues, meta, algorithm };
  } catch (err) {
    onProgress?.({
      phase: "error",
      progress: 0,
      message: err instanceof Error ? err.message : "Auto Suptitle generation failed",
    });
    throw err;
  } finally {
    svc.dispose();
  }
}
