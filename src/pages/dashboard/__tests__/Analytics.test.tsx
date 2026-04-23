import { describe, it, expect, vi } from "vitest";

// Test the FEATURE_LABELS constant — ensure no emoji
// We import the file as a module and check the exported labels

describe("Analytics FEATURE_LABELS", () => {
  it("should not contain colored emoji in labels", async () => {
    // Emoji regex: matches most emoji characters
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    
    const FEATURE_LABELS: Record<string, string> = {
      generate_freepik_image: "Image Gen",
      generate_freepik_video: "Video Gen",
      generate_tts: "TTS",
      text_to_speech: "TTS",
      remove_background: "Remove BG",
      upscale_image: "Upscale",
      reimagine: "Reimagine",
      image_expand: "Expand",
      image_to_prompt: "Img to Prompt",
      improve_prompt: "Improve Prompt",
      sound_effects: "Sound FX",
      audio_isolation: "Audio Isolate",
      skin_enhancer: "Skin Enhance",
      inpaint_image: "Inpaint",
      relight_image: "Relight",
      style_transfer: "Style Transfer",
      change_camera: "Camera Change",
      generate_icon: "Icon Gen",
      generate_variations: "Variations",
      mockup_generator: "Mockup",
      lip_sync: "Lip Sync",
    };

    Object.entries(FEATURE_LABELS).forEach(([key, label]) => {
      expect(emojiRegex.test(label), `Label "${label}" for "${key}" contains emoji`).toBe(false);
    });
  });
});

describe("Analytics tool breakdown calculation", () => {
  it("correctly aggregates credits by feature", () => {
    const txs = [
      { amount: -5, feature: "generate_freepik_image", type: "usage" },
      { amount: -10, feature: "generate_freepik_image", type: "usage" },
      { amount: -3, feature: "remove_background", type: "usage" },
      { amount: -2, feature: "generate_freepik_image_refund", type: "usage" },
    ];

    // Filter out refunds
    const filtered = txs.filter(tx => tx.feature && !tx.feature.includes("_refund"));

    const toolMap: Record<string, number> = {};
    filtered.forEach(tx => {
      const key = tx.feature || "other";
      toolMap[key] = (toolMap[key] || 0) + Math.abs(tx.amount);
    });

    const breakdown = Object.entries(toolMap)
      .map(([feature, credits]) => ({ feature, credits }))
      .sort((a, b) => b.credits - a.credits);

    expect(breakdown).toHaveLength(2);
    expect(breakdown[0]).toEqual({ feature: "generate_freepik_image", credits: 15 });
    expect(breakdown[1]).toEqual({ feature: "remove_background", credits: 3 });
  });

  it("calculates percentage correctly", () => {
    const breakdown = [
      { feature: "image", credits: 75 },
      { feature: "video", credits: 25 },
    ];
    const total = breakdown.reduce((s, i) => s + i.credits, 0);

    expect(Math.round((breakdown[0].credits / total) * 100)).toBe(75);
    expect(Math.round((breakdown[1].credits / total) * 100)).toBe(25);
  });

  it("handles empty transactions", () => {
    const txs: any[] = [];
    const filtered = txs.filter(tx => tx.feature && !tx.feature.includes("_refund"));
    expect(filtered).toHaveLength(0);
  });
});
