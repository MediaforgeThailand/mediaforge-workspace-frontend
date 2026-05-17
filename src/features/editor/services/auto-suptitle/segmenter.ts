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

function normalizeTimingIndexWord(
  word: AutoSuptitleWhisperWord,
): AutoSuptitleWhisperWord | null {
  const text = normalizeCaptionText(word.word ?? "");
  if (!text) return null;
  if (!Number.isFinite(word.start) || !Number.isFinite(word.end)) return null;
  const start = Math.max(0, word.start);
  const end = Math.max(start, word.end);
  return { word: text, start, end };
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

function normalizeCaptionSpacing(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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

function captionTextLength(text: string): number {
  const normalized = text.normalize("NFC");
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locales?: string | string[],
        options?: { granularity?: "grapheme" },
      ) => { segment(input: string): Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (Segmenter) {
    return Array.from(
      new Segmenter(undefined, { granularity: "grapheme" }).segment(normalized),
    ).length;
  }
  return Array.from(normalized.replace(/\p{Mark}/gu, "")).length;
}

function unitLooksThai(unit: string): boolean {
  return /[\u0E00-\u0E7F]/.test(unit);
}

function shouldPreserveCaptionSpacing(text: string): boolean {
  const normalized = normalizeCaptionSpacing(text);
  if (!/\s/.test(normalized)) return false;
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length <= 1) return false;

  const hasAsciiTerm = /[A-Za-z][A-Za-z0-9+._-]*/.test(normalized);
  const hasMeaningfulThaiTerm = parts.some(
    (part) => unitLooksThai(part) && captionTextLength(part) >= 3,
  );
  const looksLikeThaiFragments = parts.every((part) => {
    const length = captionTextLength(part);
    return unitLooksThai(part) && length <= 2 && !/[A-Za-z0-9]/.test(part);
  });

  return (hasAsciiTerm || hasMeaningfulThaiTerm) && !looksLikeThaiFragments;
}

const THAI_CONTEXT_JOINERS = new Set([
  "และ",
  "กับ",
  "หรือ",
  "แต่",
  "ที่",
  "ให้",
  "ของ",
  "ใน",
  "จาก",
  "โดย",
  "เพื่อ",
]);

const THAI_DANGLING_JOINERS = new Set(["และ", "กับ", "หรือ", "แต่", "ให้", "เพื่อ"]);

const AUTO_SUPTITLE_LOCAL_RAG = {
  standaloneCuePrefixes: ["Motion Control"],
  protectedThaiCompounds: [
    { text: "ภาพนิ่ง", parts: ["ภาพ", "นิ่ง"] },
    { text: "แอ็กชั่น", parts: ["แอ็", "กชั่น"] },
    { text: "แอคชั่น", parts: ["แอค", "ชั่น"] },
    { text: "คาแรกเตอร์", parts: ["คา", "แรก", "เตอร์"] },
    { text: "อากาศดีมาก", parts: ["อากาศ", "ดี", "มาก"] },
    { text: "ออกมา", parts: ["ออก", "มา"] },
  ],
};

function normalizeComparableAscii(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isStandaloneDomainCue(text: string): boolean {
  const normalized = normalizeComparableAscii(text);
  return AUTO_SUPTITLE_LOCAL_RAG.standaloneCuePrefixes.some(
    (term) => normalized === normalizeComparableAscii(term),
  );
}

function splitDomainCueBoundary(text: string, language?: string | null): string[] {
  const normalized = normalizeCaptionSpacing(text);
  if (!normalized) return [];
  const shouldApplyThaiRules =
    textLooksSegmentPreferred(normalized) || isSegmentTextPreferredLanguage(language);
  if (!shouldApplyThaiRules) return [normalized];

  for (const term of AUTO_SUPTITLE_LOCAL_RAG.standaloneCuePrefixes) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const match = normalized.match(new RegExp(`^(${escaped})\\s+(.+)$`, "i"));
    if (!match) continue;
    const rest = normalizeCaptionSpacing(match[2] ?? "");
    if (!rest || !textLooksSegmentPreferred(rest)) continue;
    return [normalizeCaptionSpacing(match[1] ?? term), rest];
  }

  return [normalized];
}

function protectedThaiTailCarryCount(
  units: readonly string[],
  canCarry: (count: number) => boolean,
): number {
  for (const compound of AUTO_SUPTITLE_LOCAL_RAG.protectedThaiCompounds) {
    const count = compound.parts.length;
    if (count <= 1 || units.length < count) continue;
    const tail = units.slice(units.length - count).join("");
    if (tail === compound.text && canCarry(count)) return count;
  }
  return 0;
}

function protectedThaiIncomingCarryCount(
  units: readonly string[],
  incomingUnit: string,
  canCarry: (count: number) => boolean,
): number {
  for (const compound of AUTO_SUPTITLE_LOCAL_RAG.protectedThaiCompounds) {
    const countBeforeIncoming = compound.parts.length - 1;
    if (countBeforeIncoming <= 0 || units.length < countBeforeIncoming) continue;
    if (incomingUnit !== compound.parts[compound.parts.length - 1]) continue;

    const tailBeforeIncoming = units.slice(units.length - countBeforeIncoming).join("");
    const expectedBeforeIncoming = compound.parts.slice(0, -1).join("");
    if (tailBeforeIncoming !== expectedBeforeIncoming) continue;

    const joinerIndex = units.length - countBeforeIncoming - 1;
    const previousIndex = joinerIndex - 1;
    if (
      previousIndex >= 0 &&
      THAI_CONTEXT_JOINERS.has(units[joinerIndex] ?? "") &&
      canCarry(countBeforeIncoming + 2)
    ) {
      return countBeforeIncoming + 2;
    }
    if (
      joinerIndex >= 0 &&
      THAI_CONTEXT_JOINERS.has(units[joinerIndex] ?? "") &&
      canCarry(countBeforeIncoming + 1)
    ) {
      return countBeforeIncoming + 1;
    }
    if (canCarry(countBeforeIncoming)) return countBeforeIncoming;
  }
  return 0;
}

function thaiOverflowCarryCount(
  units: readonly string[],
  incomingUnit: string,
  maxChars: number,
): number {
  if (units.length < 2) return 0;
  if (!unitLooksThai(incomingUnit) && !units.some(unitLooksThai)) return 0;

  const minCommittedChars = Math.min(9, Math.max(6, Math.floor(maxChars * 0.4)));
  const maxNextChars = Math.max(maxChars, Math.ceil(maxChars * 1.15));

  const canCarry = (count: number) => {
    const committed = units.slice(0, units.length - count);
    const carried = units.slice(units.length - count);
    if (committed.length === 0 || carried.length === 0) return false;
    const committedText = joinCaptionUnits(committed);
    const nextText = joinCaptionUnits([...carried, incomingUnit]);
    return (
      captionTextLength(committedText) >= minCommittedChars &&
      captionTextLength(nextText) <= maxNextChars
    );
  };

  const incomingProtectedCarryCount = protectedThaiIncomingCarryCount(
    units,
    incomingUnit,
    canCarry,
  );
  if (incomingProtectedCarryCount > 0) return incomingProtectedCarryCount;

  const protectedCarryCount = protectedThaiTailCarryCount(units, canCarry);
  if (protectedCarryCount > 0) return protectedCarryCount;

  const tail = units[units.length - 1] ?? "";
  if (THAI_CONTEXT_JOINERS.has(tail) && units.length >= 3 && canCarry(2)) {
    return 2;
  }

  return canCarry(1) ? 1 : 0;
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

type CaptionTextUnit = { text: string; spaceBefore: boolean };

function sentenceCaptionUnitsFromText(
  text: string,
  language?: string | null,
): CaptionTextUnit[] {
  const normalized = normalizeCaptionSpacing(text);
  if (!normalized) return [];

  const parts = normalized.split(" ").filter(Boolean);
  const units: CaptionTextUnit[] = [];

  for (const part of parts) {
    const subUnits = captionUnitsFromText(part, language);
    const effectiveUnits = subUnits.length > 0 ? subUnits : [part];
    effectiveUnits.forEach((unit, index) => {
      const cleanUnit = normalizeCaptionText(unit);
      if (!cleanUnit) return;
      units.push({
        text: cleanUnit,
        spaceBefore: units.length > 0 && index === 0,
      });
    });
  }

  return units;
}

function joinSentenceCaptionUnits(units: readonly CaptionTextUnit[]): string {
  let output = "";
  for (const unit of units) {
    const text = normalizeCaptionText(unit.text);
    if (!text) continue;
    if (!output) {
      output = text;
      continue;
    }
    output += unit.spaceBefore || !shouldJoinWithoutSpace(output, text) ? ` ${text}` : text;
  }
  return output.trim();
}

function joinSentenceChunks(chunks: readonly string[]): string {
  let output = "";
  for (const chunk of chunks) {
    const clean = normalizeCaptionSpacing(chunk);
    if (!clean) continue;
    if (!output) {
      output = clean;
      continue;
    }
    output += shouldJoinWithoutSpace(output, clean) ? clean : ` ${clean}`;
  }
  return output.trim();
}

function sentenceOverflowCarryCount(
  units: readonly CaptionTextUnit[],
  incomingUnit: CaptionTextUnit,
  maxChars: number,
): number {
  if (units.length < 2) return 0;
  if (!unitLooksThai(incomingUnit.text) && !units.some((unit) => unitLooksThai(unit.text))) {
    return 0;
  }

  const minCommittedChars = Math.min(9, Math.max(6, Math.floor(maxChars * 0.4)));
  const maxNextChars = Math.max(maxChars, Math.ceil(maxChars * 1.15));

  const canCarry = (count: number) => {
    const committed = units.slice(0, units.length - count);
    const carried = units.slice(units.length - count);
    if (committed.length === 0 || carried.length === 0) return false;
    const committedText = joinSentenceCaptionUnits(committed);
    const nextText = joinSentenceCaptionUnits([...carried, incomingUnit]);
    return (
      captionTextLength(committedText) >= minCommittedChars &&
      captionTextLength(nextText) <= maxNextChars
    );
  };

  const incomingProtectedCarryCount = protectedThaiIncomingCarryCount(
    units.map((unit) => unit.text),
    incomingUnit.text,
    canCarry,
  );
  if (incomingProtectedCarryCount > 0) return incomingProtectedCarryCount;

  const protectedCarryCount = protectedThaiTailCarryCount(
    units.map((unit) => unit.text),
    canCarry,
  );
  if (protectedCarryCount > 0) return protectedCarryCount;

  const tail = units[units.length - 1]?.text ?? "";
  if (THAI_CONTEXT_JOINERS.has(tail) && units.length >= 3 && canCarry(2)) {
    return 2;
  }
  if (THAI_CONTEXT_JOINERS.has(tail)) return 0;

  return canCarry(1) ? 1 : 0;
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
    .replace(/[\s"'`.,;:!?…。，、！？()[\]{}<>|/\\\-–—_*+=~@#$%^&]+/g, "");
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

  if (textLooksSegmentPreferred(transcriptText ?? "") && sourceComparable.length >= 16) {
    const sourceCoverage = orderedCharacterCoverageRatio(sourceComparable, joinedComparable);
    if (sourceCoverage < 0.88) return false;
  }

  if (sourceComparable.length >= 24 && joinedComparable.length < sourceComparable.length * 0.72) {
    return false;
  }

  return true;
}

function orderedCharacterCoverageRatio(source: string, candidate: string): number {
  if (!source) return 1;
  if (!candidate) return 0;

  let matched = 0;
  let cursor = 0;
  for (const char of source) {
    const index = candidate.indexOf(char, cursor);
    if (index < 0) continue;
    matched += 1;
    cursor = index + char.length;
  }
  return matched / Array.from(source).length;
}

function timingTextIndexFromWords(timingWords: AutoSuptitleWhisperWord[]) {
  const words = timingWords
    .map(normalizeTimingIndexWord)
    .filter(Boolean) as AutoSuptitleWhisperWord[];
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

function hasTimingDuration(word: AutoSuptitleWhisperWord | undefined): boolean {
  return Boolean(word && word.end > word.start);
}

function nearestCueStartWord(
  words: readonly AutoSuptitleWhisperWord[],
  index: number,
): AutoSuptitleWhisperWord {
  for (let cursor = index; cursor < words.length; cursor += 1) {
    if (hasTimingDuration(words[cursor])) return words[cursor];
  }
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    if (hasTimingDuration(words[cursor])) return words[cursor];
  }
  return words[index];
}

function nearestCueEndWord(
  words: readonly AutoSuptitleWhisperWord[],
  index: number,
): AutoSuptitleWhisperWord {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    if (hasTimingDuration(words[cursor])) return words[cursor];
  }
  for (let cursor = index; cursor < words.length; cursor += 1) {
    if (hasTimingDuration(words[cursor])) return words[cursor];
  }
  return words[index];
}

type SuggestedCueTimingMatch = AutoSuptitleWhisperWord & {
  matchKind: "exact" | "partial";
};

function cueAnchorMinLength(text: string): number {
  return Math.min(text.length, 4);
}

function findCueEdgeMatch(
  comparableCue: string,
  timingText: string,
  cursor: number,
  edge: "prefix" | "suffix",
): { index: number; length: number } | null {
  const maxLength = Math.min(24, comparableCue.length);
  const minLength = cueAnchorMinLength(comparableCue);

  for (let length = maxLength; length >= minLength; length -= 1) {
    const fragment =
      edge === "prefix"
        ? comparableCue.slice(0, length)
        : comparableCue.slice(comparableCue.length - length);
    if (!fragment) continue;

    const index = timingText.indexOf(fragment, cursor);
    if (index >= 0) return { index, length };
  }

  return null;
}

function alignSuggestedCueTextsToTimingWords(
  cueTexts: readonly string[],
  timingWords: AutoSuptitleWhisperWord[],
): Array<SuggestedCueTimingMatch | null> {
  const timingIndex = timingTextIndexFromWords(timingWords);
  if (!timingIndex.text || timingIndex.words.length === 0) return [];

  const aligned: Array<SuggestedCueTimingMatch | null> = [];
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
    let endCharIndex = matchIndex + Math.max(1, matchLength) - 1;
    let matchKind: SuggestedCueTimingMatch["matchKind"] = "exact";

    if (matchIndex < 0 && comparableCue.length >= 8) {
      const prefix = comparableCue.slice(0, Math.min(12, comparableCue.length));
      matchIndex = timingIndex.text.indexOf(prefix, cursor);
      matchLength = prefix.length;
      endCharIndex = matchIndex + Math.max(1, matchLength) - 1;
      matchKind = "partial";
    }

    if (matchIndex < 0) {
      const prefixMatch = findCueEdgeMatch(comparableCue, timingIndex.text, cursor, "prefix");
      if (prefixMatch) {
        matchIndex = prefixMatch.index;
        matchLength = prefixMatch.length;
        endCharIndex = matchIndex + Math.max(1, matchLength) - 1;
        matchKind = "partial";

        const suffixMatch = findCueEdgeMatch(
          comparableCue,
          timingIndex.text,
          matchIndex + matchLength,
          "suffix",
        );
        if (suffixMatch) {
          endCharIndex = suffixMatch.index + Math.max(1, suffixMatch.length) - 1;
        }
      }
    }

    if (matchIndex < 0) {
      aligned.push(null);
      continue;
    }

    const startWordIndex = timingIndex.charToWordIndex[matchIndex];
    const safeEndCharIndex = Math.min(
      timingIndex.charToWordIndex.length - 1,
      endCharIndex,
    );
    const endWordIndex = timingIndex.charToWordIndex[safeEndCharIndex] ?? startWordIndex;
    const startWord = nearestCueStartWord(timingIndex.words, startWordIndex);
    const endWord = nearestCueEndWord(timingIndex.words, endWordIndex) ?? startWord;

    aligned.push({
      word: cueText,
      start: startWord.start,
      end: Math.max(startWord.start + 0.05, endWord.end),
      matchKind,
    });
    cursor = Math.max(cursor, safeEndCharIndex + 1);
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
  const cleaned = cues.map(normalizeCaptionSpacing).filter(Boolean);
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

function absoluteNormalizedTimingWords(
  timingWords: AutoSuptitleWhisperWord[],
  clipStartTime: number,
): AutoSuptitleWhisperWord[] {
  return timingWords
    .map(normalizeWord)
    .filter(Boolean)
    .map((word) => word as AutoSuptitleWhisperWord)
    .map((word) => ({
      word: word.word,
      start: clipStartTime + word.start,
      end: clipStartTime + word.end,
    }));
}

function timingWordsInCueGap(
  timingWords: readonly AutoSuptitleWhisperWord[],
  gapStart: number,
  gapEnd: number,
): AutoSuptitleWhisperWord[] {
  const edgePad = 0.01;
  return timingWords.filter((word) => {
    const midpoint = (word.start + word.end) / 2;
    return midpoint > gapStart + edgePad && midpoint < gapEnd - edgePad;
  });
}

function extendCueEndFromGapWords(
  cue: AutoSuptitleCue,
  gapWords: readonly AutoSuptitleWhisperWord[],
  nextStart: number,
  algorithm: AutoSuptitleAlgorithmSettings,
): AutoSuptitleCue {
  const lastGapWord = gapWords[gapWords.length - 1];
  if (!lastGapWord) return cue;

  const heldEnd = lastGapWord.end + Math.max(0, algorithm.maxHoldAfterSpeech);
  const endTime = Math.min(nextStart, Math.max(cue.endTime, heldEnd));
  const words = cue.words.map((word, index) =>
    index === cue.words.length - 1
      ? { ...word, end: Math.max(word.end, lastGapWord.end) }
      : word,
  );
  return { ...cue, endTime, words };
}

function shiftCueStartFromGapWords(
  cue: AutoSuptitleCue,
  gapWords: readonly AutoSuptitleWhisperWord[],
): AutoSuptitleCue {
  const firstGapWord = gapWords[0];
  if (!firstGapWord) return cue;

  const startTime = Math.min(cue.startTime, firstGapWord.start);
  const words = cue.words.map((word, index) =>
    index === 0 ? { ...word, start: Math.min(word.start, startTime) } : word,
  );
  return { ...cue, startTime, words };
}

function buildGapCueFromTimingWords(
  gapWords: readonly AutoSuptitleWhisperWord[],
  nextStart: number,
  settings: CaptionStyleSettings,
  algorithm: AutoSuptitleAlgorithmSettings,
): AutoSuptitleCue | null {
  const firstGapWord = gapWords[0];
  const lastGapWord = gapWords[gapWords.length - 1];
  if (!firstGapWord || !lastGapWord) return null;

  const text = normalizeCaptionSpacing(joinCaptionUnits(gapWords.map((word) => word.word)));
  if (!text) return null;

  const minDuration = Math.max(0.05, algorithm.minLineDuration);
  const startTime = firstGapWord.start;
  const speechEnd = Math.max(startTime + 0.05, lastGapWord.end);
  const endTime = Math.min(
    nextStart,
    Math.max(startTime + minDuration, speechEnd + Math.max(0, algorithm.maxHoldAfterSpeech)),
  );
  if (endTime <= startTime + 0.01) return null;

  return {
    text: applyCaptionCase(text, settings.case),
    startTime,
    endTime,
    words: [
      {
        text,
        start: startTime,
        end: speechEnd,
      },
    ],
  };
}

function fillSpokenGapsBetweenSuggestedCues(
  cues: AutoSuptitleCue[],
  timingWords: AutoSuptitleWhisperWord[],
  clipStartTime: number,
  settings: CaptionStyleSettings,
  algorithm: AutoSuptitleAlgorithmSettings,
  options: { allowUnmatchedGapCueInsertion?: boolean } = {},
): AutoSuptitleCue[] {
  if (cues.length < 2 || timingWords.length === 0) return cues;

  const absoluteWords = absoluteNormalizedTimingWords(timingWords, clipStartTime);
  if (absoluteWords.length === 0) return cues;

  const filled: AutoSuptitleCue[] = [];
  const working = cues.map((cue) => ({
    ...cue,
    words: cue.words.map((word) => ({ ...word })),
  }));

  for (let index = 0; index < working.length; index += 1) {
    const cue = working[index];
    const nextCue = working[index + 1];
    filled.push(cue);
    if (!nextCue) continue;

    const cueSpeechEnd = cue.words.reduce(
      (max, word) => Math.max(max, word.end),
      Number.NEGATIVE_INFINITY,
    );
    const gapStart = Number.isFinite(cueSpeechEnd) ? cueSpeechEnd : cue.endTime;
    const gapEnd = nextCue.startTime;
    if (gapEnd - gapStart <= 0.06) continue;

    const gapWords = timingWordsInCueGap(absoluteWords, gapStart, gapEnd);
    if (gapWords.length === 0) continue;

    const gapText = normalizeCaptionSpacing(joinCaptionUnits(gapWords.map((word) => word.word)));
    const comparableGapText = comparableCaptionText(gapText);
    if (!comparableGapText) continue;

    const comparableCurrent = comparableCaptionText(cue.text);
    const comparableNext = comparableCaptionText(nextCue.text);

    if (comparableCurrent.includes(comparableGapText)) {
      const extendedCue = extendCueEndFromGapWords(cue, gapWords, nextCue.startTime, algorithm);
      filled[filled.length - 1] = extendedCue;
      working[index] = extendedCue;
      continue;
    }

    if (comparableNext.startsWith(comparableGapText)) {
      const shiftedNextCue = shiftCueStartFromGapWords(nextCue, gapWords);
      working[index + 1] = shiftedNextCue;
      continue;
    }

    if (options.allowUnmatchedGapCueInsertion === false) continue;

    const gapCue = buildGapCueFromTimingWords(gapWords, nextCue.startTime, settings, algorithm);
    if (gapCue) filled.push(gapCue);
  }

  return filled;
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
  const normalized = normalizeCaptionSpacing(text);
  if (!normalized) return [];

  const units = sentenceCaptionUnitsFromText(normalized, language);
  if (units.length === 0) return [];

  const maxChars = Math.max(18, Math.floor(algorithm.maxCharsPerLine));
  const chunks: string[] = [];
  let bucket: CaptionTextUnit[] = [];

  const flush = () => {
    const chunk = joinSentenceCaptionUnits(bucket);
    if (chunk) chunks.push(chunk);
    bucket = [];
  };

  for (const unit of units) {
    const nextText = joinSentenceCaptionUnits([...bucket, unit]);
    if (bucket.length > 0 && captionTextLength(nextText) > maxChars) {
      const carryCount = sentenceOverflowCarryCount(bucket, unit, maxChars);
      if (carryCount > 0) {
        const carried = bucket.slice(bucket.length - carryCount);
        bucket = bucket.slice(0, bucket.length - carryCount);
        flush();
        bucket = carried;
      } else {
        flush();
      }
    }

    bucket.push(unit);

    const currentText = joinSentenceCaptionUnits(bucket);
    const endsClause = /[.!?;:…。！？]$/.test(unit.text);
    if (bucket.length >= 2 && endsClause && captionTextLength(currentText) >= 10) {
      flush();
    }
  }

  flush();
  return chunks;
}

function repairProtectedThaiCompoundBoundaries(
  chunks: readonly string[],
  algorithm: AutoSuptitleAlgorithmSettings,
): string[] {
  const repaired: string[] = [];
  const maxChars = Math.max(18, Math.floor(algorithm.maxCharsPerLine));

  for (const chunk of chunks) {
    let current = normalizeCaptionSpacing(chunk);
    if (!current) continue;

    for (const compound of AUTO_SUPTITLE_LOCAL_RAG.protectedThaiCompounds) {
      if (compound.parts.length !== 2) continue;
      const [head, tail] = compound.parts;
      const previous = repaired[repaired.length - 1] ?? "";
      if (!previous.endsWith(head) || !current.startsWith(tail)) continue;

      const previousWithTail = `${previous}${tail}`;
      if (captionTextLength(previousWithTail) <= maxChars) {
        repaired[repaired.length - 1] = previousWithTail;
        current = normalizeCaptionSpacing(current.slice(tail.length));
      } else {
        const previousWithoutHead = normalizeCaptionSpacing(previous.slice(0, -head.length));
        if (previousWithoutHead) {
          repaired[repaired.length - 1] = previousWithoutHead;
        } else {
          repaired.pop();
        }
        current = `${head}${current}`;
      }
      break;
    }

    if (current) repaired.push(current);
  }

  return repaired;
}

function repairDanglingThaiJoinerBoundaries(chunks: readonly string[]): string[] {
  const repaired: string[] = [];

  for (const chunk of chunks) {
    let current = normalizeCaptionSpacing(chunk);
    if (!current) continue;

    const previous = repaired[repaired.length - 1] ?? "";
    const danglingJoiner = Array.from(THAI_DANGLING_JOINERS).find(
      (joiner) => previous.endsWith(joiner) && previous.length > joiner.length,
    );

    if (danglingJoiner) {
      const previousWithoutJoiner = normalizeCaptionSpacing(
        previous.slice(0, -danglingJoiner.length),
      );
      if (previousWithoutJoiner) {
        repaired[repaired.length - 1] = previousWithoutJoiner;
        current = `${danglingJoiner}${current}`;
      }
    }

    repaired.push(current);
  }

  return repaired;
}

function shouldMergeShortSentenceChunk(
  current: string,
  next: string | undefined,
  algorithm: AutoSuptitleAlgorithmSettings,
  language?: string | null,
): boolean {
  if (!next) return false;
  if (/[.!?;:…。！？]$/.test(current)) return false;
  if (isStandaloneDomainCue(current)) return false;

  const currentUnits = sentenceCaptionUnitsFromText(current, language);
  const currentLength = captionTextLength(current);
  const mergedLength = captionTextLength(joinSentenceChunks([current, next]));
  const maxChars = Math.max(18, Math.floor(algorithm.maxCharsPerLine));
  const hasAscii = /[A-Za-z]/.test(current);

  return (
    mergedLength <= maxChars &&
    ((hasAscii && currentUnits.length <= 2 && currentLength <= 20) ||
      (currentUnits.length <= 1 && currentLength <= 8))
  );
}

function mergeOrphanSentenceChunks(
  chunks: readonly string[],
  algorithm: AutoSuptitleAlgorithmSettings,
  language?: string | null,
): string[] {
  const merged: string[] = [];
  const maxChars = Math.max(18, Math.floor(algorithm.maxCharsPerLine));

  for (let index = 0; index < chunks.length; index += 1) {
    const current = chunks[index];
    const next = chunks[index + 1];
    if (shouldMergeShortSentenceChunk(current, next, algorithm, language)) {
      merged.push(joinSentenceChunks([current, next ?? ""]));
      index += 1;
      continue;
    }

    const previous = merged[merged.length - 1];
    const currentUnits = sentenceCaptionUnitsFromText(current, language);
    const currentLength = captionTextLength(current);
    const canMergeBack =
      previous &&
      !/[.!?;:…。！？]$/.test(previous) &&
      currentUnits.length <= 1 &&
      currentLength <= 8 &&
      captionTextLength(joinSentenceChunks([previous, current])) <= maxChars;

    if (canMergeBack) {
      merged[merged.length - 1] = joinSentenceChunks([previous, current]);
    } else {
      merged.push(current);
    }
  }

  return merged;
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
  const cleanCueText = isSentenceSegmentationMode(algorithm)
    ? normalizeCaptionSpacing
    : normalizeCaptionText;
  const cleanedCueTexts = cueTexts.map(cleanCueText).filter(Boolean);
  const safeCueTexts = suggestedCuesPreserveTranscript(cleanedCueTexts, transcriptText)
    ? cleanedCueTexts
    : [cleanCueText(transcriptText ?? "")].filter(Boolean);
  const domainAwareCueTexts = isSentenceSegmentationMode(algorithm)
    ? safeCueTexts.flatMap((cueText) => splitDomainCueBoundary(cueText, language))
    : safeCueTexts;
  const rawCueTextChunks = isSentenceSegmentationMode(algorithm)
    ? domainAwareCueTexts.flatMap((cueText) =>
        splitCueTextBySentenceLimits(cueText, algorithm, language),
      )
    : domainAwareCueTexts.flatMap((cueText) =>
        splitCueTextByWordLimit(cueText, maxWordsPerCue, language),
      );
  const repairedCueTextChunks = isSentenceSegmentationMode(algorithm)
    ? repairProtectedThaiCompoundBoundaries(rawCueTextChunks, algorithm)
    : rawCueTextChunks;
  const phraseSafeCueTextChunks = isSentenceSegmentationMode(algorithm)
    ? repairDanglingThaiJoinerBoundaries(repairedCueTextChunks)
    : repairedCueTextChunks;
  const cueTextChunks = isSentenceSegmentationMode(algorithm)
    ? mergeOrphanSentenceChunks(phraseSafeCueTextChunks, algorithm, language)
    : phraseSafeCueTextChunks;
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
  const heldCues = holdCuesUntilNextSpeech(cues, algorithm);
  const allowUnmatchedGapCueInsertion =
    !isSentenceSegmentationMode(algorithm) &&
    !isSegmentTextPreferredLanguage(language) &&
    !cueTextChunks.some((cueText) => textLooksSegmentPreferred(cueText));
  const gapFilledCues = fillSpokenGapsBetweenSuggestedCues(
    heldCues,
    timingWords,
    clipStartTime,
    settings,
    algorithm,
    { allowUnmatchedGapCueInsertion },
  );
  return finalizeAutoSuptitleCues(gapFilledCues);
}

export function formatAutoSuptitleCueText(
  text: string,
  wordsPerLine: number,
  language?: string | null,
): string {
  void wordsPerLine;
  const normalized = normalizeCaptionSpacing(text);
  if (shouldPreserveCaptionSpacing(normalized)) return normalized;
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
  const bridgeTinyGap = 0.2;

  return cues.map((cue, index) => {
    const lastWordEnd = cue.words.reduce(
      (max, word) => Math.max(max, word.end),
      Number.NEGATIVE_INFINITY,
    );
    const speechEnd = Number.isFinite(lastWordEnd) ? lastWordEnd : cue.endTime;
    const holdLimit = speechEnd + maxHoldAfterSpeech;
    const nextStart = cues[index + 1]?.startTime;
    const hasNextCue =
      typeof nextStart === "number" &&
      Number.isFinite(nextStart) &&
      nextStart > cue.startTime;
    const desiredEndTime = hasNextCue
      ? Math.min(holdLimit, nextStart)
      : holdLimit;
    const bridgedEndTime =
      hasNextCue && nextStart - desiredEndTime <= bridgeTinyGap
        ? nextStart
        : desiredEndTime;
    const minEndTime = hasNextCue
      ? Math.min(cue.startTime + minDuration, nextStart)
      : cue.startTime + minDuration;
    const endTime = Math.max(minEndTime, bridgedEndTime);

    return {
      ...cue,
      endTime,
    };
  });
}

function removeCueOverlaps(cues: readonly AutoSuptitleCue[]): AutoSuptitleCue[] {
  return cues.flatMap((cue, index) => {
    const nextStart = cues[index + 1]?.startTime;
    const endTime =
      typeof nextStart === "number" &&
      Number.isFinite(nextStart) &&
      nextStart > cue.startTime
        ? Math.min(cue.endTime, nextStart)
        : cue.endTime;

    if (endTime <= cue.startTime + 0.01) return [];

    const words = cue.words
      .map((word) => {
        const start = Math.max(cue.startTime, word.start);
        const end = Math.min(endTime, word.end);
        if (end <= start) return null;
        return { ...word, start, end };
      })
      .filter(Boolean) as AutoSuptitleCue["words"];

    return [{ ...cue, endTime, words }];
  });
}

function finalizeAutoSuptitleCues(cues: AutoSuptitleCue[]): AutoSuptitleCue[] {
  return removeCueOverlaps(cues);
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
        if ((charLimitReached || cueLineLimitReached) && !silenceLimitReached) {
          const carryCount = thaiOverflowCarryCount(
            bucket.map((item) => item.word),
            word.word,
            maxChars,
          );
          if (carryCount > 0) {
            const carried = bucket.slice(bucket.length - carryCount);
            bucket = bucket.slice(0, bucket.length - carryCount);
            flush();
            bucket = carried;
          } else {
            flush();
          }
        } else {
          flush();
        }
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
  return finalizeAutoSuptitleCues(holdCuesUntilNextSpeech(cues, algorithm));
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

  const normalizedCues = cues.flatMap((cue) => {
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

  return removeCueOverlaps(normalizedCues);
}
