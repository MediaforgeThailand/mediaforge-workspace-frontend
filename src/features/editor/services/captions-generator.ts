/**
 * Compatibility facade for the old AI Captions imports.
 *
 * New work should import from `services/auto-suptitle` directly. This file
 * keeps the existing CaptionsPanel and tests stable while the feature moves
 * to the standalone Auto Suptitle module.
 */
import type {
  CaptionClipMeta,
  Clip,
  CloudflareWhisperResponse,
  CloudflareWhisperWord,
  MediaItem,
  TextStyle,
  WhisperTranscriptionProgress,
} from "@/lib/openreel-core";
import type { CaptionStyleSettings } from "./caption-presets";
import {
  algorithmFromCaptionSettings,
  autoSuptitlePositionToTransform,
  autoSuptitleSettingsToTextStyle,
  buildAutoSuptitleCues,
  generateAutoSuptitle,
  type AutoSuptitleCue,
} from "./auto-suptitle";

export interface GenerateCaptionsArgs {
  settings: CaptionStyleSettings;
  clip: Clip;
  mediaItem: MediaItem;
  language?: string;
  prompt?: string;
  onProgress?: (progress: WhisperTranscriptionProgress) => void;
}

export interface CaptionGenerationResult {
  whisperResponse: CloudflareWhisperResponse;
  lines: CaptionLine[];
  meta: CaptionClipMeta;
}

export type CaptionLine = AutoSuptitleCue;

export function captionSettingsToTextStyle(
  settings: CaptionStyleSettings,
): Partial<TextStyle> {
  return autoSuptitleSettingsToTextStyle(settings);
}

export function captionPositionToTransform(
  settings: CaptionStyleSettings,
  refHeight = 1080,
  refWidth = 1920,
): { x: number; y: number } {
  return autoSuptitlePositionToTransform(settings, refHeight, refWidth);
}

export function groupWordsIntoLines(
  words: CloudflareWhisperWord[],
  clipStartTime: number,
  settings: CaptionStyleSettings,
): CaptionLine[] {
  return buildAutoSuptitleCues(
    words,
    clipStartTime,
    settings,
    algorithmFromCaptionSettings(settings),
  );
}

export async function generateCaptions(
  args: GenerateCaptionsArgs,
): Promise<CaptionGenerationResult> {
  const result = await generateAutoSuptitle(args);
  return {
    whisperResponse: result.whisperResponse,
    lines: result.cues,
    meta: result.meta,
  };
}
