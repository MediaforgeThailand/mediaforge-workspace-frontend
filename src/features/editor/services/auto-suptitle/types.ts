import type {
  CaptionClipMeta,
  Clip,
  CloudflareWhisperResponse,
  CloudflareWhisperWord,
  MediaItem,
  TextClip,
  TextStyle,
  Transform,
  WhisperTranscriptionProgress,
} from "@/lib/openreel-core";
import type { CaptionStyleSettings } from "../caption-presets";

export const AUTO_SUPTITLE_TRACK_NAME = "Auto Suptitle";
export const AUTO_SUPTITLE_GROUP_PREFIX = "auto-suptitle";

export interface AutoSuptitleAlgorithmSettings {
  /** How subtitle cues are grouped before rendering. */
  segmentationMode: "sentence" | "words";
  /** Maximum visible words per rendered caption line. */
  wordsPerLine: number;
  /** Maximum rendered lines per generated text clip. */
  maxLinesPerCue: number;
  /** Maximum generated clip duration in seconds. */
  maxLineDuration: number;
  /** Soft maximum characters per generated text clip. */
  maxCharsPerLine: number;
  /** Minimum visible duration for very short utterances. */
  minLineDuration: number;
  /** Start a new cue after this much silence between words. */
  maxSilenceGap: number;
  /** Keep a cue visible until the next cue, capped after speech ends. */
  maxHoldAfterSpeech: number;
  /** Split early after sentence punctuation when the cue has enough words. */
  splitOnPunctuation: boolean;
}

export interface AutoSuptitleGenerateArgs {
  settings: CaptionStyleSettings;
  clip: Clip;
  mediaItem: MediaItem;
  language?: string;
  prompt?: string;
  algorithm?: Partial<AutoSuptitleAlgorithmSettings>;
  onProgress?: (progress: WhisperTranscriptionProgress) => void;
}

export interface AutoSuptitleCue {
  text: string;
  startTime: number;
  endTime: number;
  words: Array<{ text: string; start: number; end: number }>;
}

export interface AutoSuptitleResult {
  whisperResponse: CloudflareWhisperResponse;
  cues: AutoSuptitleCue[];
  meta: CaptionClipMeta;
  algorithm: AutoSuptitleAlgorithmSettings;
}

export interface AutoSuptitleMaterializeArgs {
  result: AutoSuptitleResult;
  settings: CaptionStyleSettings;
  trackName?: string;
  replaceExistingGroupId?: string;
}

export interface AutoSuptitleMaterializeResult {
  trackId: string;
  clips: TextClip[];
}

export interface AutoSuptitleStyle {
  style: Partial<TextStyle>;
  transform: Partial<Transform>;
}

export type AutoSuptitleWhisperWord = CloudflareWhisperWord;
export type AutoSuptitleWhisperSegment = NonNullable<CloudflareWhisperResponse["segments"]>[number];
