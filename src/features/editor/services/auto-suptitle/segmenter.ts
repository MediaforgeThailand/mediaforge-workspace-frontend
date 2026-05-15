import { applyCaptionCase, type CaptionStyleSettings } from "../caption-presets";
import type {
  AutoSuptitleAlgorithmSettings,
  AutoSuptitleCue,
  AutoSuptitleWhisperSegment,
  AutoSuptitleWhisperWord,
} from "./types";

type AutoSuptitleWhisperResponseLike = {
  language?: string;
  words?: AutoSuptitleWhisperWord[];
  segments?: AutoSuptitleWhisperSegment[];
};

export const DEFAULT_AUTO_SUPTITLE_ALGORITHM: AutoSuptitleAlgorithmSettings = {
  wordsPerLine: 4,
  maxLinesPerCue: 2,
  maxLineDuration: 3,
  maxCharsPerLine: 42,
  minLineDuration: 0.45,
  maxSilenceGap: 0.75,
  maxHoldAfterSpeech: 1.5,
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

function normalizedLanguageKey(language?: string | null): string {
  return (language ?? "").trim().toLowerCase().replace(/_/g, "-");
}

function isSegmentTextPreferredLanguage(language?: string | null): boolean {
  const key = normalizedLanguageKey(language);
  if (!key || key === "auto") return false;
  return (
    key === "th" ||
    key === "tha" ||
    key === "thai" ||
    key.startsWith("th-") ||
    key.includes("ไทย") ||
    key === "ja" ||
    key === "japanese" ||
    key.startsWith("ja-") ||
    key === "zh" ||
    key === "chinese" ||
    key.startsWith("zh-") ||
    key === "ko" ||
    key === "korean" ||
    key.startsWith("ko-")
  );
}

function textLooksSegmentPreferred(text: string): boolean {
  return /[\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/.test(text);
}

type IntlSegmentPart = { segment: string; isWordLike?: boolean };
type IntlSegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity?: "word" | "grapheme" },
) => { segment(input: string): Iterable<IntlSegmentPart> };

function intlSegmenter(): IntlSegmenterCtor | undefined {
  return (Intl as unknown as { Segmenter?: IntlSegmenterCtor }).Segmenter;
}

function localeForCaptionText(language?: string | null): string {
  const key = normalizedLanguageKey(language);
  if (key === "thai" || key === "tha" || key.startsWith("th")) return "th";
  if (key === "japanese" || key.startsWith("ja")) return "ja";
  if (key === "chinese" || key.startsWith("zh")) return "zh";
  if (key === "korean" || key.startsWith("ko")) return "ko";
  return "th";
}

function captionUnitsFromText(text: string, language?: string | null): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const shouldSegment =
    isSegmentTextPreferredLanguage(language) || textLooksSegmentPreferred(normalized);
  const Segmenter = intlSegmenter();
  if (shouldSegment && Segmenter) {
    const segmenter = new Segmenter(localeForCaptionText(language), {
      granularity: "word",
    });
    const units: string[] = [];
    for (const part of segmenter.segment(normalized)) {
      const value = part.segment.replace(/\s+/g, " ").trim();
      if (!value) continue;
      if (part.isWordLike === false && units.length > 0) {
        units[units.length - 1] += value;
      } else {
        units.push(value);
      }
    }
    if (units.length > 0) return units;
  }

  const spaced = normalized.split(" ").filter(Boolean);
  if (spaced.length > 1 || !shouldSegment) return spaced;

  if (Segmenter) {
    return Array.from(
      new Segmenter(localeForCaptionText(language), { granularity: "grapheme" }).segment(
        normalized,
      ),
      (part) => part.segment,
    );
  }
  return Array.from(normalized);
}

function wordsFromSegments(
  segments: AutoSuptitleWhisperSegment[],
  language?: string | null,
): AutoSuptitleWhisperWord[] {
  return segments.flatMap((segment) => {
    const text = (segment.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) return [];
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end)) return [];
    if (segment.end <= segment.start) return [];

    const units = captionUnitsFromText(text, language);
    if (units.length === 0) return [];
    const duration = segment.end - segment.start;
    const step = duration / units.length;
    return units.map((word, index) => {
      const start = segment.start + step * index;
      const end = index === units.length - 1 ? segment.end : segment.start + step * (index + 1);
      return { word, start, end };
    });
  });
}

export function formatAutoSuptitleCueText(
  text: string,
  wordsPerLine: number,
  language?: string | null,
): string {
  const words = captionUnitsFromText(text, language);
  if (words.length === 0) return "";
  const maxWords = Math.max(1, Math.floor(wordsPerLine));
  const lines: string[] = [];
  for (let index = 0; index < words.length; index += maxWords) {
    lines.push(words.slice(index, index + maxWords).join(" "));
  }
  return lines.join("\n");
}

function holdCuesUntilNextSpeech(
  cues: AutoSuptitleCue[],
  algorithm: AutoSuptitleAlgorithmSettings,
): AutoSuptitleCue[] {
  const minDuration = Math.max(0.05, algorithm.minLineDuration);
  const maxHoldAfterSpeech = Math.max(0, algorithm.maxHoldAfterSpeech);

  return cues.map((cue, index) => {
    const lastWordEnd = cue.words.reduce(
      (max, word) => Math.max(max, word.end),
      Number.NEGATIVE_INFINITY,
    );
    const speechEnd = Number.isFinite(lastWordEnd) ? lastWordEnd : cue.endTime;
    const holdLimit = speechEnd + maxHoldAfterSpeech;
    const nextStart = cues[index + 1]?.startTime;
    const endTime =
      typeof nextStart === "number" &&
      Number.isFinite(nextStart) &&
      nextStart > cue.startTime
        ? Math.min(holdLimit, nextStart)
        : holdLimit;

    return {
      ...cue,
      endTime: Math.max(cue.startTime + minDuration, endTime),
    };
  });
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
  const maxWordsPerLine = Math.max(1, Math.floor(algorithm.wordsPerLine));
  const maxLinesPerCue = Math.max(1, Math.floor(algorithm.maxLinesPerCue));
  const maxWordsPerCue = maxWordsPerLine * maxLinesPerCue;
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
      const cueLineLimitReached = bucket.length >= maxWordsPerCue;
      const durationLimitReached = durationWithWord > maxDuration;
      const charLimitReached = cueTextLength(bucket, word) > maxChars;
      const silenceLimitReached = gap > maxSilenceGap;

      if (
        cueLineLimitReached ||
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
  return holdCuesUntilNextSpeech(cues, algorithm);
}

export function buildAutoSuptitleCuesFromResponse(
  response: AutoSuptitleWhisperResponseLike,
  clipStartTime: number,
  settings: CaptionStyleSettings,
  algorithm: AutoSuptitleAlgorithmSettings,
  requestedLanguage?: string | null,
): AutoSuptitleCue[] {
  const language = response.language ?? requestedLanguage;
  const segments = response.segments ?? [];
  if (segments.length > 0 && isSegmentTextPreferredLanguage(language)) {
    const segmentWords = wordsFromSegments(segments, language);
    const cues = buildAutoSuptitleCues(segmentWords, clipStartTime, settings, {
      ...algorithm,
      splitOnPunctuation: false,
    });
    if (cues.length > 0) return cues;
  }

  const wordCues = buildAutoSuptitleCues(
    response.words ?? [],
    clipStartTime,
    settings,
    algorithm,
  );
  if (wordCues.length > 0) return wordCues;

  if (segments.length > 0) {
    return buildAutoSuptitleCues(
      wordsFromSegments(segments, language),
      clipStartTime,
      settings,
      algorithm,
    );
  }

  return [];
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
