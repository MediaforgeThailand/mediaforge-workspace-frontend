import { describe, it, expect } from "vitest";
import { calculateNodeCost } from "../nodeCostCalculator";
import type { CreditCostRow } from "@/hooks/useNodeCreditCosts";

const row = (over: Partial<CreditCostRow>): CreditCostRow => ({
  id: over.id ?? "x",
  feature: over.feature ?? "",
  model: over.model ?? null,
  label: over.label ?? "",
  cost: over.cost ?? 0,
  pricing_type: over.pricing_type ?? null,
  duration_seconds: over.duration_seconds ?? null,
  has_audio: over.has_audio ?? null,
  created_at: over.created_at ?? "2025-01-01T00:00:00Z",
});

describe("calculateNodeCost — guards", () => {
  it("returns null when creditCosts is empty", () => {
    expect(
      calculateNodeCost({ schemaKey: "bananaProNode", params: {}, creditCosts: [] }),
    ).toBeNull();
  });

  it("returns null for unknown schemaKey", () => {
    expect(
      calculateNodeCost({
        schemaKey: "totallyMadeUpNode",
        params: {},
        creditCosts: [row({ feature: "anything", cost: 99 })],
      }),
    ).toBeNull();
  });

  it("mp3InputNode is always free", () => {
    expect(
      calculateNodeCost({ schemaKey: "mp3InputNode", params: {}, creditCosts: [row({ cost: 999 })] }),
    ).toBe(0);
  });
});

describe("calculateNodeCost — bananaProNode (Freepik image)", () => {
  const costs = [
    row({ feature: "generate_freepik_image", model: "nano-banana-pro", cost: 4 }),
    row({ feature: "generate_freepik_image", model: "nano-banana-pro:square_1_1", cost: 6 }),
  ];

  it("matches generic model row by default", () => {
    expect(
      calculateNodeCost({ schemaKey: "bananaProNode", params: {}, creditCosts: costs }),
    ).toBe(4);
  });

  it("prefers size-specific row when image_size is supplied", () => {
    expect(
      calculateNodeCost({
        schemaKey: "bananaProNode",
        params: { image_size: "square_1_1" },
        creditCosts: costs,
      }),
    ).toBe(6);
  });

  it("falls back to generic row when image_size has no exact match", () => {
    expect(
      calculateNodeCost({
        schemaKey: "bananaProNode",
        params: { image_size: "ultrawide_42_9" },
        creditCosts: costs,
      }),
    ).toBe(4);
  });

  it("returns null when no matching feature row exists", () => {
    expect(
      calculateNodeCost({
        schemaKey: "bananaProNode",
        params: { model_name: "unknown-model" },
        creditCosts: costs,
      }),
    ).toBeNull();
  });
});

describe("calculateNodeCost — bananaProNode → seedream / openai branches", () => {
  it("routes seedream models to generate_seedream_image with size key", () => {
    const costs = [
      row({ feature: "generate_seedream_image", model: "seedream-4.0:2k", cost: 7 }),
      row({ feature: "generate_seedream_image", model: "seedream-4.0", cost: 5 }),
    ];
    expect(
      calculateNodeCost({
        schemaKey: "bananaProNode",
        params: { model_name: "seedream-4.0", size: "2k" },
        creditCosts: costs,
      }),
    ).toBe(7);
  });

  it("falls back to bare seedream model when size key misses", () => {
    const costs = [row({ feature: "generate_seedream_image", model: "seedream-4.0", cost: 5 })];
    expect(
      calculateNodeCost({
        schemaKey: "bananaProNode",
        params: { model_name: "seedream-4.0", size: "8k" },
        creditCosts: costs,
      }),
    ).toBe(5);
  });

  it("routes gpt-image-2 to openai pricing using size+quality key", () => {
    const costs = [
      row({ feature: "generate_openai_image", model: "gpt-image-2:1024x1024:medium", cost: 9 }),
    ];
    expect(
      calculateNodeCost({
        schemaKey: "bananaProNode",
        params: { model_name: "gpt-image-2", size: "1024x1024", quality: "medium" },
        creditCosts: costs,
      }),
    ).toBe(9);
  });
});

describe("calculateNodeCost — chatAiNode", () => {
  it("matches by model_name", () => {
    expect(
      calculateNodeCost({
        schemaKey: "chatAiNode",
        params: { model_name: "google/gemini-3-pro-preview" },
        creditCosts: [row({ feature: "chat_ai", model: "google/gemini-3-pro-preview", cost: 2 })],
      }),
    ).toBe(2);
  });

  it("uses default model when none provided", () => {
    expect(
      calculateNodeCost({
        schemaKey: "chatAiNode",
        params: {},
        creditCosts: [row({ feature: "chat_ai", model: "google/gemini-3-pro-preview", cost: 2 })],
      }),
    ).toBe(2);
  });
});

describe("calculateNodeCost — klingVideoNode standard models (fixed pricing)", () => {
  const costs = [
    row({
      feature: "generate_freepik_video",
      model: "kling-v2-6-pro",
      cost: 5,
      pricing_type: "fixed",
      duration_seconds: 5,
      has_audio: false,
    }),
    row({
      feature: "generate_freepik_video",
      model: "kling-v2-6-pro",
      cost: 8,
      pricing_type: "fixed",
      duration_seconds: 10,
      has_audio: false,
    }),
    row({
      feature: "generate_freepik_video",
      model: "kling-v2-6-pro",
      cost: 12,
      pricing_type: "fixed",
      duration_seconds: 5,
      has_audio: true,
    }),
  ];

  it("picks 5s no-audio fixed price as default", () => {
    expect(
      calculateNodeCost({
        schemaKey: "klingVideoNode",
        params: { model_name: "kling-v2-6-pro" },
        creditCosts: costs,
      }),
    ).toBe(5);
  });

  it("picks 10s fixed price when duration=10", () => {
    expect(
      calculateNodeCost({
        schemaKey: "klingVideoNode",
        params: { model_name: "kling-v2-6-pro", duration: "10" },
        creditCosts: costs,
      }),
    ).toBe(8);
  });

  it("includes audio surcharge when has_audio=true", () => {
    expect(
      calculateNodeCost({
        schemaKey: "klingVideoNode",
        params: { model_name: "kling-v2-6-pro", duration: "5", has_audio: true },
        creditCosts: costs,
      }),
    ).toBe(12);
  });

  it("falls back to duration match (ignoring audio) when audio combo missing", () => {
    expect(
      calculateNodeCost({
        schemaKey: "klingVideoNode",
        params: { model_name: "kling-v2-6-pro", duration: "10", has_audio: true },
        creditCosts: costs,
      }),
    ).toBe(8);
  });
});

describe("calculateNodeCost — klingVideoNode Omni (per_second + audio multiplier)", () => {
  const omniBase = [
    row({
      feature: "generate_freepik_video",
      model: "kling-v3-omni",
      cost: 3,
      pricing_type: "per_second",
      has_audio: false,
    }),
  ];

  it("multiplies per_second cost by parsed duration", () => {
    expect(
      calculateNodeCost({
        schemaKey: "klingVideoNode",
        params: { model_name: "kling-v3-omni", duration: "8" },
        creditCosts: omniBase,
      }),
    ).toBe(24);
  });

  it("doubles per-second cost when audio is on but no audio row exists", () => {
    expect(
      calculateNodeCost({
        schemaKey: "klingVideoNode",
        params: { model_name: "kling-v3-omni", duration: "5", has_audio: true },
        creditCosts: omniBase,
      }),
    ).toBe(30);
  });

  it("prefers exact fixed (model+duration+audio) over per_second", () => {
    const costs = [
      ...omniBase,
      row({
        feature: "generate_freepik_video",
        model: "kling-v3-omni",
        cost: 100,
        pricing_type: "fixed",
        duration_seconds: 5,
        has_audio: false,
      }),
    ];
    expect(
      calculateNodeCost({
        schemaKey: "klingVideoNode",
        params: { model_name: "kling-v3-omni", duration: "5" },
        creditCosts: costs,
      }),
    ).toBe(100);
  });
});

describe("calculateNodeCost — klingVideoNode motion (per_second × ref_video duration)", () => {
  const motionCosts = [
    row({
      feature: "generate_freepik_video",
      model: "kling-v2-6-motion-pro",
      cost: 4,
      pricing_type: "per_second",
    }),
  ];

  it("returns null when ref_video duration is missing (cannot price motion without source clip)", () => {
    expect(
      calculateNodeCost({
        schemaKey: "klingVideoNode",
        params: { model_name: "kling-v2-6-motion-pro" },
        creditCosts: motionCosts,
      }),
    ).toBeNull();
  });

  it("multiplies per_second × ref_video duration (rounded up)", () => {
    expect(
      calculateNodeCost({
        schemaKey: "klingVideoNode",
        params: { model_name: "kling-v2-6-motion-pro", _ref_video_duration: 6 },
        creditCosts: motionCosts,
      }),
    ).toBe(24);
  });

  it("rounds fractional totals up", () => {
    const costs = [
      row({
        feature: "generate_freepik_video",
        model: "kling-v2-6-motion-pro",
        cost: 3.5,
        pricing_type: "per_second",
      }),
    ];
    expect(
      calculateNodeCost({
        schemaKey: "klingVideoNode",
        params: { model_name: "kling-v2-6-motion-pro", _ref_video_duration: 3 },
        creditCosts: costs,
      }),
    ).toBe(11);
  });
});

describe("calculateNodeCost — removeBackgroundNode", () => {
  it("matches generic remove_background row", () => {
    expect(
      calculateNodeCost({
        schemaKey: "removeBackgroundNode",
        params: {},
        creditCosts: [row({ feature: "remove_background", model: "replicate-birefnet", cost: 1 })],
      }),
    ).toBe(1);
  });
});

describe("calculateNodeCost — mergeAudioNode fallback chain", () => {
  it("uses exact model match first", () => {
    expect(
      calculateNodeCost({
        schemaKey: "mergeAudioNode",
        params: {},
        creditCosts: [
          row({ feature: "merge_audio_video", model: "shotstack", cost: 2 }),
          row({ feature: "merge_audio_video", model: null, cost: 99 }),
        ],
      }),
    ).toBe(2);
  });

  it("falls back to feature row with null model when exact missing", () => {
    expect(
      calculateNodeCost({
        schemaKey: "mergeAudioNode",
        params: { model_name: "shotstack" },
        creditCosts: [row({ feature: "merge_audio_video", model: null, cost: 5 })],
      }),
    ).toBe(5);
  });
});

describe("calculateNodeCost - upscaleImageNode", () => {
  it("maps legacy upscale models to the MediaForge OpenAI enhance SKU", () => {
    expect(
      calculateNodeCost({
        schemaKey: "upscaleImageNode",
        params: {
          model_name: "magnific-upscale-precision-v2",
          size: "1024x1024",
          quality: "medium",
        },
        creditCosts: [
          row({ feature: "upscale_image", model: "gpt-image-2-enhance:1k:medium", cost: 93 }),
        ],
      }),
    ).toBe(93);
  });
});
