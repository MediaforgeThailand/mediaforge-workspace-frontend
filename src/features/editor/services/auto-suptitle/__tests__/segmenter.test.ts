import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTION_SETTINGS } from "../../caption-presets";
import {
  algorithmFromCaptionSettings,
  buildAutoSuptitleCues,
  DEFAULT_AUTO_SUPTITLE_ALGORITHM,
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
    expect(cues[0].endTime).toBeCloseTo(10.7);
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
});
