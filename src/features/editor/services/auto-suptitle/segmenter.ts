import { applyCaptionCase, type CaptionStyleSettings } from "../caption-presets";
import type {
  AutoSuptitleAlgorithmSettings,
  AutoSuptitleCue,
  AutoSuptitleWhisperSegment,
  AutoSuptitleWhisperWord,
} from "./types";

type AutoSuptitleWhisperResponseLike = {
  language?: string;
  duration?: number;
  text?: string;
  suggested_cues?: string[] | null;
  words?: AutoSuptitleWhisperWord[];
  segments?: AutoSuptitleWhisperSegment[];
};

export const DEFAULT_AUTO_SUPTITLE_ALGORITHM: AutoSuptitleAlgorithmSettings = {
  segmentationMode: "words",
  wordsPerLine: 4,
  maxLinesPerCue: 1,
  maxLineDuration: 3,
  maxCharsPerLine: 42,
  minLineDuration: 0.45,
  maxSilenceGap: 0.75,
  maxHoldAfterSpeech: 0.5,
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

function isSentenceSegmentationMode(algorithm: AutoSuptitleAlgorithmSettings): boolean {
  return algorithm.segmentationMode === "sentence";
}

function normalizeWord(word: AutoSuptitleWhisperWord): AutoSuptitleWhisperWord | null {
  const text = normalizeCaptionText(word.word ?? "");
  if (!text) return null;
  if (!Number.isFinite(word.start) || !Number.isFinite(word.end)) return null;
  if (word.end <= word.start) return null;
  return { word: text, start: Math.max(0, word.start), end: Math.max(0, word.end) };
}

function cueTextLength(words: AutoSuptitleWhisperWord[], next?: AutoSuptitleWhisperWord): number {
  const source = next ? [...words, next] : words;
  return joinCaptionUnits(source.map((w) => w.word)).length;
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

function containsSpacelessScript(text: string): boolean {
  return /[\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF]/.test(text);
}

function normalizeCaptionText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(
      /([\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF])\s+([\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF])/g,
      "$1$2",
    )
    .trim();
}

function shouldJoinWithoutSpace(previous: string, next: string): boolean {
  if (!previous || !next) return false;
  if (/^[,.;:!?…。、！？）」』】％%]+$/.test(next)) return true;
  if (/[（「『【]$/.test(previous)) return true;
  return containsSpacelessScript(previous) && containsSpacelessScript(next);
}

function joinCaptionUnits(units: readonly string[]): string {
  let output = "";
  for (const rawUnit of units) {
    const unit = normalizeCaptionText(rawUnit);
    if (!unit) continue;
    if (!output) {
      output = unit;
      continue;
    }
    output += shouldJoinWithoutSpace(output, unit) ? unit : ` ${unit}`;
  }
  return output.trim();
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
  const normalized = normalizeCaptionText(text);
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
    const text = normalizeCaptionText(segment.text ?? "");
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

function estimateWordsFromTranscriptText(
  text: string,
  timingWords: AutoSuptitleWhisperWord[],
  durationSec?: number | null,
  language?: string | null,
): AutoSuptitleWhisperWord[] {
  const units = captionUnitsFromText(text, language);
  if (units.length === 0) return [];

  const normalizedTimingWords = timingWords
    .map(normalizeWord)
    .filter(Boolean) as AutoSuptitleWhisperWord[];
  const start = normalizedTimingWords[0]?.start ?? 0;
  const responseDuration =
    typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > start
      ? durationSec
      : null;
  const end =
    normalizedTimingWords[normalizedTimingWords.length - 1]?.end ??
    responseDuration ??
    start + units.length * 0.35;
  const safeEnd = Math.max(start + 0.25, end);
  const totalDuration = safeEnd - start;
  const weights = units.map((unit) => Math.max(1, Array.from(unit).length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || units.length;

  let cursor = start;
  return units.map((word, index) => {
    const next =
      index === units.length - 1
        ? safeEnd
        : cursor + totalDuration * (weights[index] / totalWeight);
    const endTime = Math.max(cursor + 0.03, next);
    const estimated = { word, start: cursor, end: endTime };
    cursor = next;
    return estimated;
  });
}

function comparableCaptionText(text: string): string {
  return normalizeCaptionText(text)
    .toLocaleLowerCase()
    .replace(/[\s"'`.,;:!?…。，、！？()[\]{}<>|\/\\\-–—_*+=~@#$%^&]+/g, "");
}

function extractAsciiTerms(text: string): string[] {
  const terms = new Set<string>();
  const matches = text.match(/[A-Za-z][A-Za-z0-9+._-]*/g) ?? [];
  for (const match of matches) {
    const normalized = comparableCaptionText(match);
    if (normalized.length >= 2) terms.add(normalized);
  }
  return Array.from(terms);
}

function suggestedCuesPreserveTranscript(
  cueTexts: readonly string[],
  transcriptText?: string | null,
): boolean {
  const sourceComparable = comparableCaptionText(transcriptText ?? "");
  if (!sourceComparable) return true;

  const joinedComparable = comparableCaptionText(cueTexts.join(" "));
  if (!joinedComparable) return false;

  const sourceTerms = extractAsciiTerms(transcriptText ?? "");
  if (sourceTerms.some((term) => !joinedComparable.includes(term))) {
    return false;
  }

  if (sourceComparable.length >= 24 && joinedComparable.length < sourceComparable.length * 0.72) {
    return false;
  }

  return true;
}

function timingTextIndexFromWords(timingWords: AutoSuptitleWhisperWord[]) {
  const words = timingWords.map(normalizeWord).filter(Boolean) as AutoSuptitleWhisperWord[];
  let text = "";
  const charToWordIndex: number[] = [];

  words.forEach((word, wordIndex) => {
    const comparable = comparableCaptionText(word.word);
    if (!comparable) return;
    for (const _char of Array.from(comparable)) {
      charToWordIndex.push(wordIndex);
    }
    text += comparable;
  });

  return { text, charToWordIndex, words };
}

function alignSuggestedCueTextsToTimingWords(
  cueTexts: readonly string[],
  timingWords: AutoSuptitleWhisperWord[],
): Array<AutoSuptitleWhisperWord | null> {
  const timingIndex = timingTextIndexFromWords(timingWords);
  if (!timingIndex.text || timingIndex.words.length === 0) return [];

  const aligned: Array<AutoSuptitleWhisperWord | null> = [];
  let cursor = 0;
  let matchedCount = 0;

  for (const cueText of cueTexts) {
    const comparableCue = comparableCaptionText(cueText);
    if (!comparableCue) {
      aligned.push(null);
      continue;
    }

    let matchIndex = timingIndex.text.indexOf(comparableCue, cursor);
    let matchLength = comparableCue.length;

    if (matchIndex < 0 && comparableCue.length >= 8) {
      const prefix = comparableCue.slice(0, Math.min(12, comparableCue.length));
      matchIndex = timingIndex.text.indexOf(prefix, cursor);
      matchLength = prefix.length;
    }

    if (matchIndex < 0) {
      aligned.push(null);
      continue;
    }

    const startWordIndex = timingIndex.charToWordIndex[matchIndex];
    const endCharIndex = Math.min(
      timingIndex.charToWordIndex.length - 1,
      matchIndex + Math.max(1, matchLength) - 1,
    );
    const endWordIndex = timingIndex.charToWordIndex[endCharIndex] ?? startWordIndex;
    const startWord = timingIndex.words[startWordIndex];
    const endWord = timingIndex.words[endWordIndex] ?? startWord;

    aligned.push({
      word: cueText,
      start: startWord.start,
      end: Math.max(startWord.start + 0.05, endWord.end),
    });
    cursor = Math.max(cursor, matchIndex + Math.max(1, matchLength));
    matchedCount += 1;
  }

  return matchedCount > 0 ? aligned : [];
}

function estimateSuggestedCuesByDuration(
  cleaned: readonly string[],
  timingWords: AutoSuptitleWhisperWord[],
  durationSec?: number | null,
): AutoSuptitleWhisperWord[] {
  if (cleaned.length === 0) return [];

  const normalizedTimingWords = timingWords
    .map(normalizeWord)
    .filter(Boolean) as AutoSuptitleWhisperWord[];
  const start = normalizedTimingWords[0]?.start ?? 0;
  const responseDuration =
    typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > start
      ? durationSec
      : null;
  const end =
    normalizedTimingWords[normalizedTimingWords.length - 1]?.end ??
    responseDuration ??
    start + cleaned.length * 1.4;
  const safeEnd = Math.max(start + 0.25, end);
  const totalDuration = safeEnd - start;
  const weights = cleaned.map((cue) => Math.max(3, Array.from(cue).length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || cleaned.length;

  let cursor = start;
  return cleaned.map((word, index) => {
    const next =
      index === cleaned.length - 1
        ? safeEnd
        : cursor + totalDuration * (weights[index] / totalWeight);
    const endTime = Math.max(cursor + 0.35, next);
    const estimated = { word, start: cursor, end: endTime };
    cursor = next;
    return estimated;
  });
}

function makeSuggestedCueTimingMonotonic(
  cues: AutoSuptitleWhisperWord[],
): AutoSuptitleWhisperWord[] {
  let previousStart = Number.NEGATIVE_INFINITY;
  return cues.map((cue) => {
    const start = Math.max(cue.start, previousStart + 0.03);
    const end = Math.max(start + 0.05, cue.end);
    previousStart = start;
    return { ...cue, start, end };
  });
}

function estimateWordsFromSuggestedCues(
  cues: readonly string[],
  timingWords: AutoSuptitleWhisperWord[],
  durationSec?: number | null,
): AutoSuptitleWhisperWord[] {
  const cleaned = cues.map(normalizeCaptionText).filter(Boolean);
  if (cleaned.length === 0) return [];

  const fallback = estimateSuggestedCuesByDuration(cleaned, timingWords, durationSec);
  const aligned = alignSuggestedCueTextsToTimingWords(cleaned, timingWords);
  if (aligned.length === 0) return fallback;

  return makeSuggestedCueTimingMonotonic(
    cleaned.map((cueText, index) => aligned[index] ?? fallback[index] ?? {
      word: cueText,
      start: index * 0.8,
      end: index * 0.8 + 0.5,
    }),
  );
}

function splitCueTextByWordLimit(
  text: string,
  maxWords: number,
  language?: string | null,
): string[] {
  const normalized = normalizeCaptionText(text);
  if (!normalized) return [];
  const units = captionUnitsFromText(text, language);
  if (units.length === 0) return [];
  const limit = Math.max(1, Math.floor(maxWords));

  if (containsSpacelessScript(normalized)) {
    const spacedUnits = normalized.split(/\s+/).filter(Boolean);
    if (spacedUnits.length <= limit) return [normalized];
    const chunks: string[] = [];
    for (let index = 0; index < spacedUnits.length; index += limit) {
      chunks.push(joinCaptionUnits(spacedUnits.slice(index, index + limit)));
    }
    return chunks;
  }

  const chunks: string[] = [];
  for (let index = 0; index < units.length; index += limit) {
    chunks.push(joinCaptionUnits(units.slice(index, index + limit)));
  }
  return chunks;
}

function splitCueTextBySentenceLimits(
  text: string,
  algorithm: AutoSuptitleAlgorithmSettings,
  language?: string | null,
): string[] {
  const normalized = normalizeCaptionText(text);
  if (!normalized) return [];

  const units = captionUnitsFromText(normalized, language);
  if (units.length === 0) return [];

  const maxChars = Math.max(18, Math.floor(algorithm.maxCharsPerLine));
  const chunks: string[] = [];
  let bucket: string[] = [];

  const flush = () => {
    const chunk = joinCaptionUnits(bucket);
    if (chunk) chunks.push(chunk);
    bucket = [];
  };

  for (const unit of units) {
    const nextText = joinCaptionUnits([...bucket, unit]);
    if (bucket.length > 0 && Array.from(nextText).length > maxChars) {
      flush();
    }

    bucket.push(unit);

    const currentText = joinCaptionUnits(bucket);
    const endsClause = /[.!?;:…。！？]$/.test(unit);
    if (bucket.length >= 2 && endsClause && Array.from(currentText).length >= 10) {
      flush();
    }
  }

  flush();
  return chunks;
}

function buildCuesFromSuggestedCueTexts(
  cueTexts: readonly string[],
  transcriptText: string | undefined | null,
  timingWords: AutoSuptitleWhisperWord[],
  clipStartTime: number,
  settings: CaptionStyleSettings,
  algorithm: AutoSuptitleAlgorithmSettings,
  durationSec?: number | null,
  language?: string | null,
): AutoSuptitleCue[] {
  const maxWordsPerCue =
    Math.max(1, Math.floor(algorithm.wordsPerLine)) *
    Math.max(1, Math.floor(algorithm.maxLinesPerCue));
  const cleanedCueTexts = cueTexts.map(normalizeCaptionText).filter(Boolean);
  const safeCueTexts = suggestedCuesPreserveTranscript(cleanedCueTexts, transcriptText)
    ? cleanedCueTexts
    : [normalizeCaptionText(transcriptText ?? "")].filter(Boolean);
  const cueTextChunks = isSentenceSegmentationMode(algorithm)
    ? safeCueTexts.flatMap((cueText) =>
        splitCueTextBySentenceLimits(cueText, algorithm, language),
      )
    : safeCueTexts.flatMap((cueText) =>
        splitCueTextByWordLimit(cueText, maxWordsPerCue, language),
      );
  const estimated = estimateWordsFromSuggestedCues(cueTextChunks, timingWords, durationSec);
  if (estimated.length === 0) return [];

  const minDuration = Math.max(0.05, algorithm.minLineDuration);
  const cues = estimated.map((cueWord) => {
    const startTime = clipStartTime + cueWord.start;
    const rawEndTime = clipStartTime + cueWord.end;
    const endTime = Math.max(startTime + minDuration, rawEndTime);
    return {
      text: applyCaptionCase(cueWord.word, settings.case),
      startTime,
      endTime,
      words: [
        {
          text: cueWord.word,
          start: startTime,
          end: endTime,
        },
      ],
    };
  });
  return holdCuesUntilNextSpeech(cues, algorithm);
}

export function formatAutoSuptitleCueText(
  text: string,
  wordsPerLine: number,
  language?: string | null,
): string {
  void wordsPerLine;
  const words = captionUnitsFromText(text, language);
  if (words.length === 0) return "";
  return joinCaptionUnits(words);
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
  const sentenceMode = isSentenceSegmentationMode(algorithm);
  const maxDuration = Math.max(0.5, algorithm.maxLineDuration);
  const maxChars = Math.max(8, Math.floor(algorithm.maxCharsPerLine));
  const minDuration = Math.max(0.05, algorithm.minLineDuration);
  const maxSilenceGap = Math.max(0.05, algorithm.maxSilenceGap);

  let bucket: AutoSuptitleWhisperWord[] = [];

  const flush = () => {
    if (bucket.length === 0) return;
    const text = joinCaptionUnits(bucket.map((w) => w.word));
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
      const cueLineLimitReached = !sentenceMode && bucket.length >= maxWordsPerCue;
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
  const shouldUseSegmentText =
    isSegmentTextPreferredLanguage(language) ||
    textLooksSegmentPreferred(response.text ?? "") ||
    segments.some((segment) => textLooksSegmentPreferred(segment.text ?? ""));
  if (shouldUseSegmentText && response.suggested_cues?.length) {
    const cues = buildCuesFromSuggestedCueTexts(
      response.suggested_cues,
      response.text,
      response.words ?? [],
      clipStartTime,
      settings,
      algorithm,
      response.duration,
      language,
    );
    if (cues.length > 0) return cues;
  }

  if (segments.length > 0 && shouldUseSegmentText) {
    const segmentWords = wordsFromSegments(segments, language);
    const cues = buildAutoSuptitleCues(segmentWords, clipStartTime, settings, {
      ...algorithm,
      splitOnPunctuation: false,
    });
    if (cues.length > 0) return cues;
  }

  if (shouldUseSegmentText && response.text) {
    const transcriptWords = estimateWordsFromTranscriptText(
      response.text,
      response.words ?? [],
      response.duration,
      language,
    );
    const cues = buildAutoSuptitleCues(transcriptWords, clipStartTime, settings, {
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
