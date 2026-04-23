import { describe, it, expect } from "vitest";

// Test the getCost logic in isolation (pure function extraction)
interface CreditCostEntry {
  feature: string;
  model: string | null;
  cost: number;
  pricing_type: string;
  duration_seconds: number | null;
  has_audio: boolean;
}

// Extracted pure logic from useModelCreditCost for testability
function getCost(
  costs: CreditCostEntry[],
  feature: string,
  model?: string,
  durationSeconds?: number,
  hasAudio?: boolean
): number | null {
  if (!costs.length) return null;

  if (model) {
    const modelEntries = costs.filter(c => c.feature === feature && c.model === model);
    if (!modelEntries.length) {
      const def = costs.find(c => c.feature === feature && !c.model);
      return def?.cost ?? null;
    }

    const pricingType = modelEntries[0].pricing_type;

    if (pricingType === "per_second") {
      const entry = modelEntries[0];
      if (durationSeconds) return entry.cost * durationSeconds;
      return entry.cost;
    }

    if (pricingType === "fixed") {
      const exact = modelEntries.find(
        c => c.duration_seconds === (durationSeconds ?? 5) && c.has_audio === (hasAudio ?? false)
      );
      if (exact) return exact.cost;
      return modelEntries[0].cost;
    }

    return modelEntries[0].cost;
  }

  const def = costs.find(c => c.feature === feature && !c.model);
  return def?.cost ?? null;
}

const MOCK_COSTS: CreditCostEntry[] = [
  { feature: "generate_freepik_video", model: "kling-2-1-std", cost: 2, pricing_type: "per_second", duration_seconds: null, has_audio: false },
  { feature: "generate_freepik_video", model: "kling-2-5-pro", cost: 5, pricing_type: "fixed", duration_seconds: 5, has_audio: false },
  { feature: "generate_freepik_video", model: "kling-2-5-pro", cost: 8, pricing_type: "fixed", duration_seconds: 10, has_audio: false },
  { feature: "generate_freepik_video", model: "kling-2-5-pro", cost: 10, pricing_type: "fixed", duration_seconds: 5, has_audio: true },
  { feature: "generate_freepik_image", model: null, cost: 3, pricing_type: "per_operation", duration_seconds: null, has_audio: false },
  { feature: "remove_background", model: null, cost: 1, pricing_type: "per_operation", duration_seconds: null, has_audio: false },
];

describe("getCost (credit cost calculation)", () => {
  it("returns null for empty costs array", () => {
    expect(getCost([], "generate_freepik_image")).toBeNull();
  });

  it("returns default cost when no model specified", () => {
    expect(getCost(MOCK_COSTS, "generate_freepik_image")).toBe(3);
  });

  it("returns null for unknown feature", () => {
    expect(getCost(MOCK_COSTS, "nonexistent_feature")).toBeNull();
  });

  it("calculates per_second pricing with duration", () => {
    expect(getCost(MOCK_COSTS, "generate_freepik_video", "kling-2-1-std", 10)).toBe(20);
  });

  it("returns per-second unit cost without duration", () => {
    expect(getCost(MOCK_COSTS, "generate_freepik_video", "kling-2-1-std")).toBe(2);
  });

  it("returns fixed pricing for exact duration match", () => {
    expect(getCost(MOCK_COSTS, "generate_freepik_video", "kling-2-5-pro", 10)).toBe(8);
  });

  it("returns fixed pricing with audio flag", () => {
    expect(getCost(MOCK_COSTS, "generate_freepik_video", "kling-2-5-pro", 5, true)).toBe(10);
  });

  it("defaults to 5s no-audio when no duration specified for fixed", () => {
    expect(getCost(MOCK_COSTS, "generate_freepik_video", "kling-2-5-pro")).toBe(5);
  });

  it("falls back to default cost for unknown model", () => {
    expect(getCost(MOCK_COSTS, "generate_freepik_image", "unknown-model")).toBe(3);
  });

  it("returns null when unknown model and no default exists", () => {
    expect(getCost(MOCK_COSTS, "generate_freepik_video", "unknown-model")).toBeNull();
  });

  it("returns per_operation cost correctly", () => {
    expect(getCost(MOCK_COSTS, "remove_background")).toBe(1);
  });
});
