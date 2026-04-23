/**
 * promptLimits — Centralized character limits for prompt-like fields per model.
 * Sources:
 *   - Kling AI docs: prompt & negative_prompt = 2500 chars; multi-shot per scene = 512 chars (max 6).
 *   - Google Gemini Image (Nano Banana / Banana Pro): ~480 chars effective prompt limit.
 *   - Chat AI (Gemini / GPT text): generous UI cap of 30000 chars; system prompt 8000.
 */

import type { SceneBlock } from "@/components/flow/nodes/MultiShotBuilder";

/** Returns the character limit for a given (nodeType, model, paramKey). null = no limit. */
export function getPromptCharLimit(
  nodeType: string,
  model: string,
  paramKey: string,
): number | null {
  // ── Kling video ──
  if (nodeType === "klingVideoNode") {
    if (paramKey === "prompt") return 2500;
    if (paramKey === "negative_prompt") return 2500;
  }

  // ── Banana Pro / Nano Banana (Google Gemini image) ──
  if (nodeType === "bananaProNode") {
    if (paramKey === "prompt") return 2000;
  }

  // ── Chat AI ──
  if (nodeType === "chatAiNode") {
    if (paramKey === "system_prompt") return 8000;
    if (paramKey === "prompt") return 30000;
  }

  return null;
}

/** Per-scene prompt limit for Kling multi-shot Director Mode. */
export const KLING_MULTISHOT_SCENE_LIMIT = 512;

/**
 * Strip @[Label](nodeId) and #[Label](nodeId) tokens before counting.
 * The token expands at runtime, so the visible prompt count should reflect
 * the literal characters the user typed, not the marker syntax.
 */
export function countPromptChars(raw: string | null | undefined): number {
  if (!raw) return 0;
  return raw
    .replace(/@\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/#\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .length;
}

/** True when the value's char count exceeds the given limit. */
export function isPromptOverLimit(raw: string | null | undefined, limit: number | null): boolean {
  if (!limit) return false;
  return countPromptChars(raw) > limit;
}

/** Validate every multi-shot scene against the per-scene limit. */
export function findOverLimitScenes(scenes: SceneBlock[] | null | undefined): number[] {
  if (!Array.isArray(scenes)) return [];
  const out: number[] = [];
  scenes.forEach((s, i) => {
    if (countPromptChars(s?.prompt) > KLING_MULTISHOT_SCENE_LIMIT) out.push(i);
  });
  return out;
}
