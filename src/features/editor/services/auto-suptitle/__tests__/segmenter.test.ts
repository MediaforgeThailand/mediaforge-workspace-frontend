import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTION_SETTINGS } from "../../caption-presets";
import {
  algorithmFromCaptionSettings,
  buildAutoSuptitleCues,
  buildAutoSuptitleCuesFromResponse,
  DEFAULT_AUTO_SUPTITLE_ALGORITHM,
  formatAutoSuptitleCueText,
  normalizeAutoSuptitleCuesForDuration,
} from "../segmenter";
import { exportAutoSuptitleSRT } from "../subtitle-export";

function visualTextLength(text: string): number {
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
    expect(cues[0].endTime).toBeCloseTo(11.2);
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

  it("uses wordsPerLine as one-line cue length, not visual line wrapping", () => {
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
      { ...DEFAULT_AUTO_SUPTITLE_ALGORITHM, wordsPerLine: 3, maxLinesPerCue: 1 },
    );

    expect(cues).toHaveLength(2);
    expect(cues.map((cue) => cue.text)).toEqual(["ONE TWO THREE", "FOUR FIVE SIX"]);
    expect(formatAutoSuptitleCueText("ONE TWO THREE FOUR FIVE SIX", 3)).toBe(
      "ONE TWO THREE FOUR FIVE SIX",
    );
  });

  it("sentence segmentation follows speech pauses instead of fixed word counts", () => {
    const cues = buildAutoSuptitleCues(
      [
        { word: "hello", start: 0, end: 0.16 },
        { word: "world", start: 0.18, end: 0.34 },
        { word: "this", start: 0.36, end: 0.52 },
        { word: "works", start: 0.54, end: 0.72 },
        { word: "next", start: 1.7, end: 1.92 },
        { word: "sentence", start: 1.94, end: 2.28 },
      ],
      0,
      DEFAULT_CAPTION_SETTINGS,
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        segmentationMode: "sentence",
        wordsPerLine: 2,
        maxLineDuration: 4.5,
        maxCharsPerLine: 72,
        maxSilenceGap: 0.75,
        splitOnPunctuation: false,
      },
    );

    expect(cues.map((cue) => cue.text)).toEqual([
      "HELLO WORLD THIS WORKS",
      "NEXT SENTENCE",
    ]);
  });

  it("sentence mode re-splits long GPT cue text into readable phrase cues", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 6,
        text: "Motion Control ช่วยสร้างวิดีโออ้างอิงจาก AI ของ MediaPod ให้ใช้งานง่ายขึ้น",
        suggested_cues: [
          "Motion Control ช่วยสร้างวิดีโออ้างอิงจาก AI ของ MediaPod ให้ใช้งานง่ายขึ้น",
        ],
        words: [
          { word: "Motion", start: 0, end: 0.32 },
          { word: "Control", start: 0.32, end: 0.72 },
          { word: "ช่วย", start: 0.72, end: 1.1 },
          { word: "สร้าง", start: 1.1, end: 1.45 },
          { word: "วิดีโอ", start: 1.45, end: 1.95 },
          { word: "อ้างอิง", start: 1.95, end: 2.5 },
          { word: "จาก", start: 2.5, end: 2.75 },
          { word: "AI", start: 2.75, end: 3.05 },
          { word: "ของ", start: 3.05, end: 3.28 },
          { word: "MediaPod", start: 3.28, end: 3.9 },
          { word: "ให้", start: 3.9, end: 4.15 },
          { word: "ใช้งาน", start: 4.15, end: 4.75 },
          { word: "ง่ายขึ้น", start: 4.75, end: 5.5 },
        ],
      },
      0,
      DEFAULT_CAPTION_SETTINGS,
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        segmentationMode: "sentence",
        maxCharsPerLine: 28,
        maxLineDuration: 2.4,
        maxSilenceGap: 0.45,
      },
      "th",
    );

    const joined = cues.map((cue) => cue.text).join(" ");
    expect(cues.length).toBeGreaterThan(1);
    expect(joined).toContain("MOTION");
    expect(joined).toContain("CONTROL");
    expect(joined).toContain("AI");
    expect(joined).toContain("MEDIAPOD");
    expect(Math.max(...cues.map((cue) => visualTextLength(cue.text)))).toBeLessThanOrEqual(34);
  });

  it("carries the previous Thai phrase unit when a long cue overflows", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 3,
        text: "วันนี้เป็นวันที่อากาศดีมากเลยครับ",
        suggested_cues: ["วันนี้เป็นวันที่อากาศดีมากเลยครับ"],
        words: [
          { word: "วัน", start: 0, end: 0.18 },
          { word: "นี้", start: 0.18, end: 0.32 },
          { word: "เป็น", start: 0.32, end: 0.55 },
          { word: "วัน", start: 0.55, end: 0.72 },
          { word: "ที่", start: 0.72, end: 0.86 },
          { word: "อากาศ", start: 0.86, end: 1.25 },
          { word: "ดี", start: 1.25, end: 1.48 },
          { word: "มาก", start: 1.48, end: 1.8 },
          { word: "เลย", start: 1.8, end: 2.05 },
          { word: "ครับ", start: 2.05, end: 2.3 },
        ],
      },
      0,
      { ...DEFAULT_CAPTION_SETTINGS, case: "normal" },
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        segmentationMode: "sentence",
        maxCharsPerLine: 18,
        maxLineDuration: 3,
        maxSilenceGap: 0.75,
      },
      "th",
    );

    expect(cues.map((cue) => cue.text)).toEqual([
      "วันนี้เป็นวันที่",
      "อากาศดีมากเลยครับ",
    ]);
  });

  it("keeps a leading Motion Control domain cue separate in sentence mode", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 5,
        text: "Motion Control ช่วยเปลี่ยนภาพนิ่งให้เป็นวิดีโอขยับได้",
        suggested_cues: ["Motion Control ช่วยเปลี่ยนภาพนิ่งให้เป็นวิดีโอขยับได้"],
        words: [
          { word: "Motion", start: 0, end: 0.32 },
          { word: "Control", start: 0.32, end: 0.7 },
          { word: "ช่วย", start: 0.7, end: 1.0 },
          { word: "เปลี่ยน", start: 1.0, end: 1.36 },
          { word: "ภาพ", start: 1.36, end: 1.65 },
          { word: "นิ่ง", start: 1.65, end: 1.95 },
          { word: "ให้", start: 1.95, end: 2.15 },
          { word: "เป็น", start: 2.15, end: 2.4 },
          { word: "วิดีโอ", start: 2.4, end: 2.9 },
          { word: "ขยับ", start: 2.9, end: 3.28 },
          { word: "ได้", start: 3.28, end: 3.6 },
        ],
      },
      0,
      DEFAULT_CAPTION_SETTINGS,
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        segmentationMode: "sentence",
        maxCharsPerLine: 32,
        maxLineDuration: 2.4,
        maxSilenceGap: 0.45,
      },
      "th",
    );

    expect(cues[0].text).toBe("MOTION CONTROL");
    expect(cues[1].text.replace(/\s+/g, "")).toContain("ช่วยเปลี่ยนภาพนิ่ง");
    expect(cues.map((cue) => cue.text)).not.toContain("MOTION CONTROL ช่วยเปลี่ยนภาพ");
    expect(cues.some((cue) => cue.text.startsWith("นิ่ง"))).toBe(false);
  });

  it("repairs protected Thai compounds when GPT cue boundaries split them", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 5,
        text: "Motion Control ช่วยเปลี่ยนภาพนิ่งให้เป็นวิดีโอขยับได้",
        suggested_cues: [
          "Motion Control ช่วยเปลี่ยนภาพ",
          "นิ่งให้เป็นวิดีโอขยับได้",
        ],
        words: [
          { word: "Motion", start: 0, end: 0.32 },
          { word: "Control", start: 0.32, end: 0.7 },
          { word: "ช่วย", start: 0.7, end: 1.0 },
          { word: "เปลี่ยน", start: 1.0, end: 1.36 },
          { word: "ภาพ", start: 1.36, end: 1.65 },
          { word: "นิ่ง", start: 1.65, end: 1.95 },
          { word: "ให้", start: 1.95, end: 2.15 },
          { word: "เป็น", start: 2.15, end: 2.4 },
          { word: "วิดีโอ", start: 2.4, end: 2.9 },
          { word: "ขยับ", start: 2.9, end: 3.28 },
          { word: "ได้", start: 3.28, end: 3.6 },
        ],
      },
      0,
      DEFAULT_CAPTION_SETTINGS,
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        segmentationMode: "sentence",
        maxCharsPerLine: 32,
        maxLineDuration: 2.4,
        maxSilenceGap: 0.45,
      },
      "th",
    );

    const compactCues = cues.map((cue) => cue.text.replace(/\s+/g, ""));
    expect(cues[0].text).toBe("MOTION CONTROL");
    expect(compactCues.some((text) => text.includes("ช่วยเปลี่ยนภาพนิ่ง"))).toBe(true);
    expect(compactCues.some((text) => text.startsWith("นิ่ง"))).toBe(false);
  });

  it("keeps Thai loanword compounds with the surrounding phrase on overflow", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 6,
        text: "AI ก็จะถ่ายทอดท่าทาง จังหวะ และแอ็กชั่น ออกมาเป็นวิดีโอ",
        suggested_cues: [
          "AI ก็จะถ่ายทอดท่าทาง จังหวะ และแอ็กชั่น ออกมาเป็นวิดีโอ",
        ],
        words: [
          { word: "AI", start: 0, end: 0.24 },
          { word: "ก็", start: 0.24, end: 0.38 },
          { word: "จะ", start: 0.38, end: 0.52 },
          { word: "ถ่ายทอด", start: 0.52, end: 1.0 },
          { word: "ท่าทาง", start: 1.0, end: 1.42 },
          { word: "จังหวะ", start: 1.42, end: 1.82 },
          { word: "และ", start: 1.82, end: 2.0 },
          { word: "แอ็", start: 2.0, end: 2.12 },
          { word: "กชั่น", start: 2.12, end: 2.48 },
          { word: "ออกมา", start: 2.48, end: 2.92 },
          { word: "เป็น", start: 2.92, end: 3.12 },
          { word: "วิดีโอ", start: 3.12, end: 3.6 },
        ],
      },
      0,
      { ...DEFAULT_CAPTION_SETTINGS, case: "normal" },
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        segmentationMode: "sentence",
        maxCharsPerLine: 30,
        maxLineDuration: 2.4,
        maxSilenceGap: 0.45,
      },
      "th",
    );

    const compactCues = cues.map((cue) => cue.text.replace(/\s+/g, ""));
    expect(compactCues.some((text) => text.includes("จังหวะและแอ็กชั่น"))).toBe(true);
    expect(cues.some((cue) => cue.text.endsWith("แอ็"))).toBe(false);
    expect(cues.some((cue) => cue.text.startsWith("กชั่น"))).toBe(false);
  });

  it("does not leave Thai connectors or protected compound heads dangling at cue ends", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 8,
        text: "เพียงใส่ภาพคาแรกเตอร์และวิดีโออ้างอิงการเคลื่อนไหว แอ็กชั่นออกมาเป็นวิดีโอ",
        suggested_cues: [
          "เพียงใส่ภาพคาแรกเตอร์และวิดีโออ้างอิงการเคลื่อนไหว",
          "แอ็กชั่นออกมาเป็นวิดีโอ",
        ],
        words: [
          { word: "เพียง", start: 0, end: 0.28 },
          { word: "ใส่", start: 0.28, end: 0.56 },
          { word: "ภาพ", start: 0.56, end: 0.82 },
          { word: "คา", start: 0.82, end: 1.0 },
          { word: "แรก", start: 1.0, end: 1.22 },
          { word: "เตอร์", start: 1.22, end: 1.52 },
          { word: "และ", start: 1.52, end: 1.72 },
          { word: "วิดีโอ", start: 1.72, end: 2.18 },
          { word: "อ้างอิง", start: 2.18, end: 2.72 },
          { word: "การ", start: 2.72, end: 2.94 },
          { word: "เคลื่อนไหว", start: 2.94, end: 3.6 },
          { word: "แอ็", start: 4.0, end: 4.14 },
          { word: "กชั่น", start: 4.14, end: 4.5 },
          { word: "ออก", start: 4.5, end: 4.78 },
          { word: "มา", start: 4.78, end: 5.0 },
          { word: "เป็น", start: 5.0, end: 5.22 },
          { word: "วิดีโอ", start: 5.22, end: 5.7 },
        ],
      },
      0,
      { ...DEFAULT_CAPTION_SETTINGS, case: "normal" },
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        segmentationMode: "sentence",
        maxCharsPerLine: 30,
        maxLineDuration: 2.4,
        maxSilenceGap: 0.45,
      },
      "th",
    );

    expect(cues.some((cue) => cue.text.endsWith("และ"))).toBe(false);
    expect(cues.some((cue) => cue.text.endsWith("ออก"))).toBe(false);
    expect(cues.some((cue) => cue.text.startsWith("มา"))).toBe(false);
    expect(cues.map((cue) => cue.text).join(" ")).toContain("ออกมา");
  });

  it("carries the previous Thai phrase unit when word split overflows", () => {
    const cues = buildAutoSuptitleCues(
      [
        { word: "วัน", start: 0, end: 0.18 },
        { word: "นี้", start: 0.18, end: 0.32 },
        { word: "เป็น", start: 0.32, end: 0.55 },
        { word: "วัน", start: 0.55, end: 0.72 },
        { word: "ที่", start: 0.72, end: 0.86 },
        { word: "อากาศ", start: 0.86, end: 1.25 },
        { word: "ดี", start: 1.25, end: 1.48 },
        { word: "มาก", start: 1.48, end: 1.8 },
      ],
      0,
      { ...DEFAULT_CAPTION_SETTINGS, case: "normal" },
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        wordsPerLine: 6,
        maxLinesPerCue: 1,
        maxCharsPerLine: 100,
        maxLineDuration: 3,
        splitOnPunctuation: false,
      },
    );

    expect(cues.map((cue) => cue.text)).toEqual(["วันนี้เป็นวันที่", "อากาศดีมาก"]);
  });

  it("falls back to transcript text when GPT cue chunks omit English loanwords", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 4,
        text: "ใช้ AI Motion Control ใน MediaPod ได้เลย",
        suggested_cues: ["ใช้ระบบควบคุมการเคลื่อนไหวได้เลย"],
        words: [
          { word: "ใช้", start: 0, end: 0.24 },
          { word: "AI", start: 0.24, end: 0.48 },
          { word: "Motion", start: 0.48, end: 0.86 },
          { word: "Control", start: 0.86, end: 1.24 },
          { word: "ใน", start: 1.24, end: 1.44 },
          { word: "MediaPod", start: 1.44, end: 2.0 },
          { word: "ได้", start: 2.0, end: 2.3 },
          { word: "เลย", start: 2.3, end: 2.75 },
        ],
      },
      0,
      DEFAULT_CAPTION_SETTINGS,
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        segmentationMode: "sentence",
        maxCharsPerLine: 28,
        maxLineDuration: 2.4,
        maxSilenceGap: 0.45,
      },
      "th",
    );

    const joined = cues.map((cue) => cue.text).join(" ");
    expect(joined).toContain("AI");
    expect(joined).toContain("MOTION");
    expect(joined).toContain("CONTROL");
    expect(joined).toContain("MEDIAPOD");
    expect(joined).not.toContain("ระบบควบคุม");
  });

  it("merges a short English lead token into the next Thai phrase in sentence mode", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 4,
        text: "AI ก็จะถ่ายทอดท่าทาง จังหวะ และแอ็กชั่น",
        suggested_cues: ["AI", "ก็จะถ่ายทอด", "ท่าทาง จังหวะ และแอ็กชั่น"],
        words: [
          { word: "AI", start: 0, end: 0.25 },
          { word: "ก็", start: 0.25, end: 0.35 },
          { word: "จะ", start: 0.35, end: 0.5 },
          { word: "ถ่ายทอด", start: 0.5, end: 0.95 },
          { word: "ท่าทาง", start: 0.95, end: 1.35 },
          { word: "จังหวะ", start: 1.35, end: 1.75 },
          { word: "และ", start: 1.75, end: 1.95 },
          { word: "แอ็กชั่น", start: 1.95, end: 2.45 },
        ],
      },
      0,
      DEFAULT_CAPTION_SETTINGS,
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        segmentationMode: "sentence",
        maxCharsPerLine: 34,
        maxLineDuration: 2.4,
        maxSilenceGap: 0.45,
      },
      "th",
    );

    expect(cues[0].text).toBe("AI ก็จะถ่ายทอด");
    expect(cues[1].text.replace(/\s+/g, "")).toBe("ท่าทางจังหวะและแอ็กชั่น");
    for (let index = 0; index < cues.length - 1; index += 1) {
      expect(cues[index].endTime).toBeLessThanOrEqual(cues[index + 1].startTime);
    }
  });

  it("never extends a subtitle cue over the next generated cue", () => {
    const cues = buildAutoSuptitleCues(
      [
        { word: "AI", start: 0, end: 0.08 },
        { word: "continues", start: 0.12, end: 0.45 },
      ],
      0,
      DEFAULT_CAPTION_SETTINGS,
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        wordsPerLine: 1,
        maxLinesPerCue: 1,
        minLineDuration: 0.45,
        maxHoldAfterSpeech: 0.5,
      },
    );

    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe("AI");
    expect(cues[0].endTime).toBeLessThanOrEqual(cues[1].startTime);
  });

  it("uses Thai segment text instead of broken word-level tokens", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        words: [
          { word: "แว้ค", start: 0, end: 0.2 },
          { word: "ดูบู", start: 0.2, end: 0.4 },
        ],
        segments: [
          {
            start: 0,
            end: 1.6,
            text: "สวัสดีครับทุกคนกำลังทดสอบระบบ",
          },
        ],
      },
      0,
      DEFAULT_CAPTION_SETTINGS,
      { ...DEFAULT_AUTO_SUPTITLE_ALGORITHM, wordsPerLine: 4 },
      "th",
    );

    const text = cues.map((cue) => cue.text).join(" ");
    expect(text.replace(/\s+/g, "")).toContain("สวัสดีครับทุกคนกำลังทดสอบระบบ");
    expect(text).not.toContain("แว้ค");
    for (const cue of cues) {
      expect(formatAutoSuptitleCueText(cue.text, 4, "th")).not.toContain("\n");
    }
  });

  it("uses full Thai transcript text when Whisper word timestamps are grapheme fragments", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 4,
        text: "Motion Control ช่วยเปลี่ยนภาพนิ่งให้เคลื่อนไหวตามคลิปต้นฉบับได้",
        segments: [],
        words: [
          { word: "M", start: 0, end: 0.18 },
          { word: "otion", start: 0.18, end: 0.42 },
          { word: "Control", start: 0.42, end: 0.82 },
          { word: "ช", start: 0.82, end: 1.0 },
          { word: "่", start: 1.0, end: 1.01 },
          { word: "วย", start: 1.01, end: 1.2 },
          { word: "เป", start: 1.2, end: 1.4 },
          { word: "ล", start: 1.4, end: 1.41 },
          { word: "ี่", start: 1.41, end: 1.42 },
          { word: "ย", start: 1.42, end: 1.43 },
          { word: "น", start: 1.43, end: 1.62 },
          { word: "ได้", start: 3.6, end: 4.0 },
        ],
      },
      0,
      DEFAULT_CAPTION_SETTINGS,
      { ...DEFAULT_AUTO_SUPTITLE_ALGORITHM, wordsPerLine: 4 },
      "th",
    );

    const text = cues.map((cue) => cue.text).join(" ");
    expect(text.replace(/\s+/g, "")).toContain(
      "MOTIONCONTROLช่วยเปลี่ยนภาพนิ่งให้เคลื่อนไหวตามคลิปต้นฉบับได้",
    );
    expect(text).not.toContain("ช ่");
    expect(text).not.toContain("เป ล");
    for (const cue of cues) {
      expect(formatAutoSuptitleCueText(cue.text, 4, "th")).not.toContain("\n");
    }
  });

  it("prefers GPT-planned Thai cue chunks over local word segmentation", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 6,
        text: "Motion Control ช่วยเปลี่ยนภาพนิ่งให้เคลื่อนไหวตามคลิปต้นฉบับได้ แค่ใส่ภาพคาแรกเตอร์",
        suggested_cues: [
          "Motion Control ช่วยเปลี่ยน",
          "ภาพนิ่งให้เคลื่อนไหว",
          "ตามคลิปต้นฉบับได้",
          "แค่ใส่ภาพคาแรกเตอร์",
        ],
        segments: [],
        words: [
          { word: "M", start: 0, end: 0.18 },
          { word: "otion", start: 0.18, end: 0.42 },
          { word: "Control", start: 0.42, end: 0.82 },
          { word: "ช", start: 0.82, end: 1.0 },
          { word: "่", start: 1.0, end: 1.01 },
          { word: "วย", start: 1.01, end: 1.2 },
          { word: "ได้", start: 5.5, end: 6.0 },
        ],
      },
      0,
      DEFAULT_CAPTION_SETTINGS,
      { ...DEFAULT_AUTO_SUPTITLE_ALGORITHM, wordsPerLine: 4 },
      "th",
    );

    expect(cues.map((cue) => cue.text)).toEqual([
      "MOTION CONTROL ช่วยเปลี่ยน",
      "ภาพนิ่งให้เคลื่อนไหว",
      "ตามคลิปต้นฉบับได้",
      "แค่ใส่ภาพคาแรกเตอร์",
    ]);
    for (const cue of cues) {
      expect(formatAutoSuptitleCueText(cue.text, 4, "th")).not.toContain("\n");
    }
  });

  it("anchors GPT-planned Thai cue starts to the spoken token timestamps", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 3,
        text: "สวัสดีครับ ผมชื่อบอส",
        suggested_cues: ["สวัสดีครับ", "ผมชื่อบอส"],
        words: [
          { word: "ส", start: 0.0, end: 0.08 },
          { word: "วั", start: 0.08, end: 0.18 },
          { word: "ส", start: 0.18, end: 0.28 },
          { word: "ดี", start: 0.28, end: 0.48 },
          { word: "ครับ", start: 0.48, end: 0.88 },
          { word: "ผม", start: 1.35, end: 1.62 },
          { word: "ชื่อ", start: 1.62, end: 1.92 },
          { word: "บอส", start: 1.92, end: 2.35 },
        ],
      },
      0,
      DEFAULT_CAPTION_SETTINGS,
      { ...DEFAULT_AUTO_SUPTITLE_ALGORITHM, wordsPerLine: 4 },
      "th",
    );

    expect(cues.map((cue) => cue.text)).toEqual(["สวัสดีครับ", "ผมชื่อบอส"]);
    expect(cues[0].startTime).toBeCloseTo(0);
    expect(cues[1].startTime).toBeCloseTo(1.35);
    expect(cues[0].endTime).toBeCloseTo(1.35);
  });

  it("uses zero-duration Thai fragments for text matching without using them as cue timing", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 4,
        text: "Motion Control ช่วยเปลี่ยนภาพนิ่ง",
        suggested_cues: ["Motion Control", "ช่วยเปลี่ยนภาพนิ่ง"],
        words: [
          { word: "M", start: 0, end: 0.14 },
          { word: "otion", start: 0.14, end: 0.44 },
          { word: "Control", start: 0.44, end: 1.0 },
          { word: "ช", start: 1.26, end: 1.32 },
          { word: "่", start: 1.32, end: 1.32 },
          { word: "วย", start: 1.32, end: 1.38 },
          { word: "เป", start: 1.38, end: 1.56 },
          { word: "ล", start: 1.56, end: 1.56 },
          { word: "ี่", start: 1.56, end: 1.56 },
          { word: "ย", start: 1.56, end: 1.56 },
          { word: "น", start: 1.56, end: 1.74 },
          { word: "ภ", start: 1.74, end: 1.82 },
          { word: "า", start: 1.82, end: 1.9 },
          { word: "พ", start: 1.9, end: 1.9 },
          { word: "น", start: 1.9, end: 2.1 },
          { word: "ิ", start: 2.1, end: 2.1 },
          { word: "่", start: 2.1, end: 2.1 },
          { word: "ง", start: 2.1, end: 2.18 },
        ],
      },
      0,
      { ...DEFAULT_CAPTION_SETTINGS, case: "normal" },
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        segmentationMode: "sentence",
        maxCharsPerLine: 40,
        maxLineDuration: 3,
        maxSilenceGap: 0.45,
        maxHoldAfterSpeech: 0.5,
      },
      "th",
    );

    expect(cues.map((cue) => cue.text)).toEqual(["Motion Control", "ช่วยเปลี่ยนภาพนิ่ง"]);
    expect(cues[0].startTime).toBeCloseTo(0);
    expect(cues[0].words[0].end).toBeCloseTo(1.0);
    expect(cues[0].endTime).toBeCloseTo(1.26);
    expect(cues[1].startTime).toBeCloseTo(1.26);
    expect(cues[1].words[0].end).toBeCloseTo(2.18);
  });

  it("caps GPT-planned cue chunks to the selected single-line word split", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 3,
        text: "hello world from media forge studio",
        suggested_cues: ["hello world from media forge studio"],
        words: [
          { word: "hello", start: 0, end: 0.2 },
          { word: "world", start: 0.2, end: 0.4 },
          { word: "from", start: 0.4, end: 0.6 },
          { word: "media", start: 0.9, end: 1.1 },
          { word: "forge", start: 1.1, end: 1.3 },
          { word: "studio", start: 1.3, end: 1.5 },
        ],
      },
      0,
      DEFAULT_CAPTION_SETTINGS,
      { ...DEFAULT_AUTO_SUPTITLE_ALGORITHM, wordsPerLine: 3 },
      "th",
    );

    expect(cues.map((cue) => cue.text)).toEqual([
      "HELLO WORLD FROM",
      "MEDIA FORGE STUDIO",
    ]);
    for (const cue of cues) {
      expect(formatAutoSuptitleCueText(cue.text, 3, "th")).not.toContain("\n");
    }
  });

  it("preserves GPT-planned Thai phrase spacing and mixed English terms in sentence mode", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 8,
        text: "AI ก็จะถ่ายทอดท่าทาง จังหวะ และแอ็กชั่น ผ่าน MediaPods Workspace ครับ",
        suggested_cues: [
          "AI ก็จะถ่ายทอดท่าทาง จังหวะ และแอ็กชั่น",
          "ผ่าน MediaPods Workspace ครับ",
        ],
        words: [
          { word: "A", start: 0, end: 0.1 },
          { word: "I", start: 0.1, end: 0.2 },
          { word: "ก็", start: 0.2, end: 0.5 },
          { word: "แอ็กชั่น", start: 3.1, end: 3.7 },
          { word: "MediaPods", start: 5.4, end: 6.2 },
          { word: "Workspace", start: 6.2, end: 7 },
          { word: "ครับ", start: 7, end: 7.6 },
        ],
      },
      0,
      DEFAULT_CAPTION_SETTINGS,
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        segmentationMode: "sentence",
        wordsPerLine: 6,
        maxCharsPerLine: 80,
      },
      "th",
    );

    expect(cues.map((cue) => cue.text)).toEqual([
      "AI ก็จะถ่ายทอดท่าทาง จังหวะ และแอ็กชั่น",
      "ผ่าน MEDIAPODS WORKSPACE ครับ",
    ]);
    expect(formatAutoSuptitleCueText("ผ่าน MediaPods Workspace ครับ", 6, "th")).toBe(
      "ผ่าน MediaPods Workspace ครับ",
    );
    expect(
      formatAutoSuptitleCueText("AI ก็จะถ่ายทอดท่าทาง จังหวะ และแอ็กชั่น", 6, "th"),
    ).toBe("AI ก็จะถ่ายทอดท่าทาง จังหวะ และแอ็กชั่น");
    expect(cues[0].endTime).toBeCloseTo(cues[1].startTime);
  });

  it("fills spoken timing words that GPT-planned sentence cues skipped", () => {
    const timingWords = [
      { word: "Motion", start: 0, end: 0.28 },
      { word: "Control", start: 0.28, end: 0.62 },
      { word: "ช่วย", start: 0.72, end: 0.95 },
      { word: "เปลี่ยน", start: 0.95, end: 1.18 },
      { word: "ภาพ", start: 1.18, end: 1.38 },
      { word: "นิ่ง", start: 1.38, end: 1.62 },
      { word: "ให้", start: 1.62, end: 1.84 },
      { word: "เป็น", start: 1.84, end: 2.05 },
      { word: "วิดีโอ", start: 2.05, end: 2.46 },
      { word: "แล้ว", start: 2.7, end: 2.92 },
      { word: "ก็", start: 2.92, end: 3.08 },
      { word: "ถ่ายทอด", start: 3.08, end: 3.48 },
      { word: "ท่าทาง", start: 3.48, end: 3.86 },
    ];
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 4,
        text: "Motion Control ช่วยเปลี่ยนภาพนิ่งให้เป็นวิดีโอแล้วก็ถ่ายทอดท่าทาง",
        suggested_cues: [
          "Motion Control",
          "ช่วยเปลี่ยนภาพนิ่ง",
          "แล้วก็ถ่ายทอดท่าทาง",
        ],
        words: timingWords,
      },
      0,
      { ...DEFAULT_CAPTION_SETTINGS, case: "normal" },
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        segmentationMode: "sentence",
        maxCharsPerLine: 36,
        maxLineDuration: 2.6,
        maxSilenceGap: 0.45,
        maxHoldAfterSpeech: 0.5,
      },
      "th",
    );

    const joined = cues.map((cue) => cue.text).join(" ").replace(/\s+/g, "");
    expect(joined).toContain("ให้เป็นวิดีโอ");
    for (let index = 0; index < cues.length - 1; index += 1) {
      const current = cues[index];
      const next = cues[index + 1];
      const spokenWordsInGap = timingWords.filter((word) => {
        const midpoint = (word.start + word.end) / 2;
        return midpoint > current.endTime + 0.01 && midpoint < next.startTime - 0.01;
      });
      expect(spokenWordsInGap).toHaveLength(0);
    }
  });

  it("does not create Thai sentence cues from unmatched Whisper timing noise", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 4,
        text: "ถูกต้องแล้วไปต่อ",
        suggested_cues: ["ถูกต้อง", "แล้วไปต่อ"],
        words: [
          { word: "ถูก", start: 0, end: 0.22 },
          { word: "ววดคปคุมชุบับได้", start: 0.72, end: 1.2 },
          { word: "ต่อ", start: 1.5, end: 1.78 },
        ],
      },
      0,
      { ...DEFAULT_CAPTION_SETTINGS, case: "normal" },
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        segmentationMode: "sentence",
        maxCharsPerLine: 40,
        maxLineDuration: 3,
        maxHoldAfterSpeech: 0.5,
      },
      "th",
    );

    const joined = cues.map((cue) => cue.text).join(" ");
    expect(joined).toContain("ถูกต้อง");
    expect(joined).toContain("แล้วไปต่อ");
    expect(joined).not.toContain("ววดคปคุม");
  });

  it("anchors mismatched GPT-planned sentence cues to real timing words", () => {
    const cues = buildAutoSuptitleCuesFromResponse(
      {
        language: "thai",
        duration: 15,
        text: "new video immediately pass Mediafrost Workspace ok",
        suggested_cues: [
          "new video immediately",
          "pass Mediafrost Workspace ok",
        ],
        words: [
          { word: "new", start: 11.1, end: 11.5 },
          { word: "video", start: 11.5, end: 11.9 },
          { word: "immediately", start: 11.9, end: 12.35 },
          { word: "pass", start: 12.94, end: 13.26 },
          { word: "Media", start: 13.26, end: 13.58 },
          { word: "Pods", start: 13.58, end: 14.04 },
          { word: "Work", start: 14.04, end: 14.2 },
          { word: "space", start: 14.2, end: 14.46 },
          { word: "ok", start: 14.8, end: 14.9 },
        ],
      },
      0,
      { ...DEFAULT_CAPTION_SETTINGS, case: "normal" },
      {
        ...DEFAULT_AUTO_SUPTITLE_ALGORITHM,
        segmentationMode: "sentence",
        maxCharsPerLine: 80,
        maxLineDuration: 3,
        maxHoldAfterSpeech: 0.5,
      },
      "th",
    );

    const passCue = cues.find((cue) => cue.text.includes("pass Mediafrost"));
    expect(passCue?.startTime).toBeCloseTo(12.94);
    expect(passCue?.endTime).toBeGreaterThan(14.4);
  });

  it("does not force subtitle cues to bridge short dead air", () => {
    const cues = buildAutoSuptitleCues(
      [
        { word: "first", start: 0, end: 0.2 },
        { word: "second", start: 1.0, end: 1.2 },
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
        maxHoldAfterSpeech: 0.5,
        splitOnPunctuation: false,
      },
    );

    expect(cues).toHaveLength(2);
    expect(cues[0].endTime).toBeCloseTo(0.7);
    expect(cues[1].startTime).toBeCloseTo(1.0);
    expect(cues[1].endTime).toBeCloseTo(1.7);
  });

  it("hides a cue after 0.5s when the next cue is a real long pause", () => {
    const cues = buildAutoSuptitleCues(
      [
        { word: "first", start: 0, end: 0.2 },
        { word: "second", start: 2.2, end: 2.4 },
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
        maxHoldAfterSpeech: 0.5,
        splitOnPunctuation: false,
      },
    );

    expect(cues).toHaveLength(2);
    expect(cues[0].endTime).toBeCloseTo(0.7);
    expect(cues[1].endTime).toBeCloseTo(2.9);
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
