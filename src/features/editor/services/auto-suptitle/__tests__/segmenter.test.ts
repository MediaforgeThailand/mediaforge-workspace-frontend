import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTION_SETTINGS } from "../../caption-presets";
import {
  algorithmFromCaptionSettings,
  buildAutoSuptitleCues,
  DEFAULT_AUTO_SUPTITLE_ALGORITHM,
  formatAutoSuptitleCueText,
  normalizeAutoSuptitleCuesForDuration,
} from "../segmenter";
import { exportAutoSuptitleSRT } from "../subtitle-export";

describe("Auto Suptitle segmenter", () => {
  it("builds editable text-track cues with absolute timeline timing", () => {
    const cues = buildAutoSuptitleCues(
      [
        { word: "hello", start: 0, end: 0.3 },
        { word: "world", start: 0.32, end: 0.7 },
      ],
      10,
      DEFAULT_CAPTION_SETTINGS,
      { ...DEFAULT_AUTO_SUPTITLE_ALGORITHM, wordsPerLine: 3 },
    );

    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe("HELLO WORLD");
    expect(cues[0].startTime).toBeCloseTo(10);
    expect(cues[0].endTime).toBeCloseTo(12.2);
    expect(cues[0].words[1]).toEqual({ text: "world", start: 10.32, end: 10.7 });
  });

  it("splits cues on silence gaps and soft character limits", () => {
    const algorithm = algorithmFromCaptionSettings(DEFAULT_CAPTION_SETTINGS, {
      wordsPerLine: 10,
      maxCharsPerLine: 11,
      maxSilenceGap: 0.4,
      splitOnPunctuation: false,
    });

    const cues = buildAutoSuptitleCues(
      [
        { word: "short", start: 0, end: 0.2 },
        { word: "line", start: 0.22, end: 0.5 },
        { word: "after", start: 1.1, end: 1.3 },
        { word: "pause", start: 1.32, end: 1.6 },
      ],
      0,
      DEFAULT_CAPTION_SETTINGS,
      algorithm,
    );

    expect(cues.map((cue) => cue.text)).toEqual(["SHORT LINE", "AFTER PAUSE"]);
  });

  it("treats wordsPerLine as line wrapping, not a hard cue split", () => {
    const cues = buildAutoSuptitleCues(
      [
        { word: "one", start: 0, end: 0.1 },
        { word: "two", start: 0.12, end: 0.22 },
        { word: "three", start: 0.24, end: 0.34 },
        { word: "four", start: 0.36, end: 0.46 },
        { word: "five", start: 0.48, end: 0.58 },
        { word: "six", start: 0.6, end: 0.7 },
      ],
      0,
      DEFAULT_CAPTION_SETTINGS,
      { ...DEFAULT_AUTO_SUPTITLE_ALGORITHM, wordsPerLine: 3, maxLinesPerCue: 2 },
    );

    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe("ONE TWO THREE FOUR FIVE SIX");
    expect(formatAutoSuptitleCueText(cues[0].text, 3)).toBe("ONE TWO THREE\nFOUR FIVE SIX");
  });

  it("keeps a cue visible until the next cue or up to 1.5s after speech", () => {
    const cues = buildAutoSuptitleCues(
      [
        { word: "first", start: 0, end: 0.2 },
        { word: "second", start: 1.0, end: 1.2 },
        { word: "third", start: 3.0, end: 3.2 },
      ],
      0,
      DEFAULT_CAPTION_SETTINGS,
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        wordsPerLine: 1,
        maxLinesPerCue: 1,
        maxLineDuration: 10,
        maxCharsPerLine: 80,
        maxSilenceGap: 10,
        maxHoldAfterSpeech: 1.5,
        splitOnPunctuation: false,
      },
    );

    expect(cues).toHaveLength(3);
    expect(cues[0].endTime).toBeCloseTo(1.0);
    expect(cues[1].endTime).toBeCloseTo(2.7);
  });

  it("splits on sentence punctuation including full-width punctuation", () => {
    const algorithm = algorithmFromCaptionSettings(DEFAULT_CAPTION_SETTINGS, {
      wordsPerLine: 10,
      maxCharsPerLine: 80,
      splitOnPunctuation: true,
    });

    const cues = buildAutoSuptitleCues(
      [
        { word: "hello", start: 0, end: 0.2 },
        { word: "world!", start: 0.22, end: 0.5 },
        { word: "next", start: 0.55, end: 0.8 },
        { word: "line\u3002", start: 0.82, end: 1.1 },
      ],
      0,
      DEFAULT_CAPTION_SETTINGS,
      algorithm,
    );

    expect(cues.map((cue) => cue.text)).toEqual(["HELLO WORLD!", "NEXT LINE\u3002"]);
  });

  it("exports rounded SRT timestamps without invalid 1000ms fields", () => {
    const srt = exportAutoSuptitleSRT([
      {
        text: "Almost two seconds",
        startTime: 1.9996,
        endTime: 62.9996,
        words: [],
      },
    ]);

    expect(srt).toContain("00:00:02,000 --> 00:01:03,000");
  });

  it("normalizes millisecond cue timing and clips cues to the video duration", () => {
    const cues = normalizeAutoSuptitleCuesForDuration(
      [
        {
          text: "HELLO",
          startTime: 1500,
          endTime: 2500,
          words: [{ text: "HELLO", start: 1500, end: 2500 }],
        },
        {
          text: "OUTSIDE",
          startTime: 25000,
          endTime: 26000,
          words: [{ text: "OUTSIDE", start: 25000, end: 26000 }],
        },
      ],
      3,
    );

    expect(cues).toHaveLength(1);
    expect(cues[0].startTime).toBeCloseTo(1.5);
    expect(cues[0].endTime).toBeCloseTo(2.5);
    expect(cues[0].words[0]).toEqual({ text: "HELLO", start: 1.5, end: 2.5 });
  });

  it("does not treat short out-of-range second timestamps as milliseconds", () => {
    const cues = normalizeAutoSuptitleCuesForDuration(
      [
        {
          text: "OUTSIDE",
          startTime: 15,
          endTime: 16,
          words: [{ text: "OUTSIDE", start: 15, end: 16 }],
        },
      ],
      3,
    );

    expect(cues).toEqual([]);
  });
});
