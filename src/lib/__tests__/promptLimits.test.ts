import { describe, it, expect } from "vitest";
import {
  getPromptCharLimit,
  countPromptChars,
  isPromptOverLimit,
  findOverLimitScenes,
  KLING_MULTISHOT_SCENE_LIMIT,
} from "../promptLimits";

describe("getPromptCharLimit", () => {
  it("returns 2500 for kling prompt + negative_prompt", () => {
    expect(getPromptCharLimit("klingVideoNode", "kling-v3-pro", "prompt")).toBe(2500);
    expect(getPromptCharLimit("klingVideoNode", "kling-v3-pro", "negative_prompt")).toBe(2500);
  });

  it("returns 2000 for banana prompt", () => {
    expect(getPromptCharLimit("bananaProNode", "nano-banana-pro", "prompt")).toBe(2000);
  });

  it("returns 8000 for chat system_prompt and 30000 for chat prompt", () => {
    expect(getPromptCharLimit("chatAiNode", "google/gemini-3-pro-preview", "system_prompt")).toBe(8000);
    expect(getPromptCharLimit("chatAiNode", "google/gemini-3-pro-preview", "prompt")).toBe(30000);
  });

  it("returns null for unknown nodeType / paramKey combos", () => {
    expect(getPromptCharLimit("klingVideoNode", "kling-v3-pro", "title")).toBeNull();
    expect(getPromptCharLimit("madeUpNode", "any", "prompt")).toBeNull();
  });
});

describe("countPromptChars", () => {
  it("returns 0 for null/undefined/empty", () => {
    expect(countPromptChars(null)).toBe(0);
    expect(countPromptChars(undefined)).toBe(0);
    expect(countPromptChars("")).toBe(0);
  });

  it("counts plain text length", () => {
    expect(countPromptChars("hello")).toBe(5);
  });

  it("strips @-mentions to their visible label only", () => {
    // raw is 33 chars; "Image 1" is 7 chars after replacement
    expect(countPromptChars("Use this @[Image 1](node-abc-123)")).toBe("Use this Image 1".length);
  });

  it("strips #-mentions the same way", () => {
    expect(countPromptChars("ref #[Clip](id-1)")).toBe("ref Clip".length);
  });

  it("counts unicode chars by JS string length (graphemes not collapsed)", () => {
    // "ก" is one BMP code unit; "ดีมาก" = 5 chars
    expect(countPromptChars("ดีมาก")).toBe(5);
  });
});

describe("isPromptOverLimit", () => {
  it("returns false when limit is null", () => {
    expect(isPromptOverLimit("anything", null)).toBe(false);
  });

  it("returns false at exactly the limit", () => {
    expect(isPromptOverLimit("aaaaa", 5)).toBe(false);
  });

  it("returns true when over the limit", () => {
    expect(isPromptOverLimit("aaaaaa", 5)).toBe(true);
  });
});

describe("findOverLimitScenes", () => {
  it("returns [] for non-array input", () => {
    expect(findOverLimitScenes(null)).toEqual([]);
    expect(findOverLimitScenes(undefined)).toEqual([]);
  });

  it("flags only scenes whose prompt exceeds the limit", () => {
    const overflow = "x".repeat(KLING_MULTISHOT_SCENE_LIMIT + 1);
    const ok = "x".repeat(KLING_MULTISHOT_SCENE_LIMIT);
    const scenes = [
      { prompt: ok, duration: 3 },
      { prompt: overflow, duration: 3 },
      { prompt: ok, duration: 3 },
      { prompt: overflow, duration: 3 },
    ] as Parameters<typeof findOverLimitScenes>[0];
    expect(findOverLimitScenes(scenes)).toEqual([1, 3]);
  });
});
