import { applyCaptionCase, type CaptionStyleSettings } from "../caption-presets";
import type {
  AutoSuptitleAlgorithmSettings,
  AutoSuptitleCue,
  AutoSuptitleWhisperWord,
} from "./types";

export const DEFAULT_AUTO_SUPTITLE_ALGORITHM: AutoSuptitleAlgorithmSettings = {
  wordsPerLine: 4,
  maxLineDuration: 3,
  maxCharsPerLine: 42,
  minLineDuration: 0.45,
  maxSilenceGap: 0.75,
  splitOnPunctuation: true,
};

export function algorithmFromCaptionSettings(
  settings: CaptionStyleSettings,
  overrides: Partial<AutoSuptitleAlgorithmSettings> = {},
): AutoSuptitleAlgorithmSettings {
  return {
    ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
    wordsPerLine: Math.max(1, Math.floor(settings.wordsPerLine)),
    maxLineDuration: Math.max(0.5, settings.maxLineDuration),
    ...overrides,
  };
}

function normalizeWord(word: AutoSuptitleWhisperWord): AutoSuptitleWhisperWord | null {
  const text = (word.word ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (!Number.isFinite(word.start) || !Number.isFinite(word.end)) return null;
  if (word.end <= word.start) return null;
  return { word: text, start: Math.max(0, word.start), end: Math.max(0, word.end) };
}

function cueTextLength(words: AutoSuptitleWhisperWord[], next?: AutoSuptitleWhisperWord): number {
  const source = next ? [...words, next] : words;
  return source.map((w) => w.word).join(" ").replace(/\s+/g, " ").trim().length;
}

export function buildAutoSuptitleCues(
  words: AutoSuptitleWhisperWord[],
  clipStartTime: number,
  settings: CaptionStyleSettings,
  algorithm: AutoSuptitleAlgorithmSettings,
): AutoSuptitleCue[] {
  const normalized = words.map(normalizeWord).filter(Boolean) as AutoSuptitleWhisperWord[];
  if (normalized.length === 0) return [];

  const cues: AutoSuptitleCue[] = [];
  const maxWords = Math.max(1, Math.floor(algorithm.wordsPerLine));
  const maxDuration = Math.max(0.5, algorithm.maxLineDuration);
  const maxChars = Math.max(8, Math.floor(algorithm.maxCharsPerLine));
  const minDuration = Math.max(0.05, algorithm.minLineDuration);
  const maxSilenceGap = Math.max(0.05, algorithm.maxSilenceGap);

  let bucket: AutoSuptitleWhisperWord[] = [];

  const flush = () => {
    if (bucket.length === 0) return;
    const text = bucket.map((w) => w.word).join(" ").replace(/\s+/g, " ").trim();
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    const startTime = clipStartTime + first.start;
    const rawEndTime = clipStartTime + last.end;
    const endTime = Math.max(startTime + minDuration, rawEndTime);

    cues.push({
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

  for (const word of normalized) {
    const previous = bucket[bucket.length - 1];
    if (previous) {
      const gap = word.start - previous.end;
      const durationWithWord = word.end - bucket[0].start;
      const wordLimitReached = bucket.length >= maxWords;
      const durationLimitReached = durationWithWord > maxDuration;
      const charLimitReached = cueTextLength(bucket, word) > maxChars;
      const silenceLimitReached = gap > maxSilenceGap;

      if (
        wordLimitReached ||
        durationLimitReached ||
        charLimitReached ||
        silenceLimitReached
      ) {
        flush();
      }
    }

    bucket.push(word);

    if (
      algorithm.splitOnPunctuation &&
      bucket.length >= 2 &&
      /[.!?\u3002\uFF01\uFF1F]$/.test(word.word)
    ) {
      flush();
    }
  }

  flush();
  return cues;
}

export function normalizeAutoSuptitleCuesForDuration(
  cues: readonly AutoSuptitleCue[],
  durationSec?: number | null,
): AutoSuptitleCue[] {
  const finiteDuration =
    typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0
      ? durationSec
      : null;
  const finiteCues = cues.filter(
    (cue) => Number.isFinite(cue.startTime) && Number.isFinite(cue.endTime),
  );
  const scale = (() => {
    if (!finiteDuration) return 1;
    const secondsOverlap = finiteCues.filter(
      (cue) => cue.startTime < finiteDuration && cue.endTime > 0,
    ).length;
    const millisOverlap = finiteCues.filter(
      (cue) =>
        cue.endTime >= 100 &&
        cue.startTime / 1000 < finiteDuration &&
        cue.endTime / 1000 > 0,
    ).length;
    return millisOverlap > secondsOverlap ? 0.001 : 1;
  })();

  return cues.flatMap((cue) => {
    let startTime = cue.startTime * scale;
    let endTime = cue.endTime * scale;
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return [];
    if (endTime <= startTime) return [];

    startTime = Math.max(0, startTime);
    if (finiteDuration) {
      if (startTime >= finiteDuration) return [];
      endTime = Math.min(finiteDuration, endTime);
    }
    if (endTime - startTime < 0.05) {
      endTime = finiteDuration
        ? Math.min(finiteDuration, startTime + 0.05)
        : startTime + 0.05;
    }
    if (endTime <= startTime) return [];

    const words = cue.words
      .map((word) => {
        let start = word.start * scale;
        let end = word.end * scale;
        if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
        start = Math.max(startTime, start);
        end = finiteDuration
          ? Math.min(endTime, finiteDuration, end)
          : Math.min(endTime, end);
        if (end <= start) return null;
        return { text: word.text, start, end };
      })
      .filter(Boolean) as AutoSuptitleCue["words"];

    return [{ ...cue, startTime, endTime, words }];
  });
}
