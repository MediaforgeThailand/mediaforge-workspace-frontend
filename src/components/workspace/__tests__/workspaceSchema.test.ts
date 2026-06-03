import { describe, it, expect } from "vitest";
import {
  portTypeFromHandleId,
  getWorkspaceSchema,
  getWsVisibleParams,
  getWsVisibleInputs,
  getWsRemovedHandleIds,
  getWsOverflowingHandles,
  cleanWsParamsOnModelChange,
  GPT_IMAGE_2_SIZE_MATRIX,
  GPT_IMAGE_2_ASPECT_RATIOS,
  gptImage2ResolutionsFor,
  splitGptImageSize,
  composeGptImageSize,
  isVideoFrameImageOutputHandle,
  textNodeImageOutputHandle,
  textNodeVideoOutputHandle,
} from "../workspaceSchema";
import { STANDALONE_TOOLS } from "../standaloneGenerationCatalog";

const DEPRECATED_SEEDANCE_1_MODELS = [
  "seedance-1-0-pro-250528",
  "seedance-1-0-pro-fast-251015",
];

describe("portTypeFromHandleId", () => {
  it("returns 'text' for text-family handles", () => {
    expect(portTypeFromHandleId("text")).toBe("text");
    expect(portTypeFromHandleId("context")).toBe("text");
    expect(portTypeFromHandleId("prompt")).toBe("text");
    expect(portTypeFromHandleId("output_text")).toBe("text");
  });

  it("returns 'video' for video handles", () => {
    expect(portTypeFromHandleId("video")).toBe("video");
    expect(portTypeFromHandleId("ref_video")).toBe("video");
    expect(portTypeFromHandleId("output_video")).toBe("video");
  });

  it("returns 'audio' for audio handles", () => {
    expect(portTypeFromHandleId("audio")).toBe("audio");
    expect(portTypeFromHandleId("output_audio")).toBe("audio");
  });

  it("returns 'element' for elements/element handles", () => {
    expect(portTypeFromHandleId("element")).toBe("element");
    expect(portTypeFromHandleId("elements")).toBe("element");
  });

  it("returns 'model3d' for 3D-model handles", () => {
    expect(portTypeFromHandleId("model3d")).toBe("model3d");
    expect(portTypeFromHandleId("output_model")).toBe("model3d");
  });

  it("returns 'image' for image-family handles", () => {
    expect(portTypeFromHandleId("image")).toBe("image");
    expect(portTypeFromHandleId("ref_image")).toBe("image");
    expect(portTypeFromHandleId("start_frame")).toBe("image");
    expect(portTypeFromHandleId("output_image")).toBe("image");
    expect(portTypeFromHandleId("output_start_frame")).toBe("image");
    expect(portTypeFromHandleId("output_end_frame")).toBe("image");
    expect(portTypeFromHandleId(textNodeImageOutputHandle("node-1"))).toBe("image");
    expect(portTypeFromHandleId(textNodeVideoOutputHandle("node-2"))).toBe("video");
  });

  it("identifies video asset frame outputs as image handles", () => {
    expect(isVideoFrameImageOutputHandle("output_start_frame")).toBe(true);
    expect(isVideoFrameImageOutputHandle("output_end_frame")).toBe(true);
    expect(isVideoFrameImageOutputHandle("output_video")).toBe(false);
  });

  it("falls back to 'image' for unknown ids (most workspace ports are images)", () => {
    expect(portTypeFromHandleId("totally_made_up_handle")).toBe("image");
  });
});

describe("getWorkspaceSchema", () => {
  it("returns a schema for known nodeTypes", () => {
    const schema = getWorkspaceSchema("klingVideoNode");
    expect(schema).toBeDefined();
    expect(schema?.params).toBeInstanceOf(Array);
  });

  it("returns undefined for unknown nodeTypes", () => {
    expect(getWorkspaceSchema("totallyFakeNode")).toBeUndefined();
  });
});

describe("getWsVisibleParams", () => {
  it("returns [] for unknown nodeType", () => {
    expect(getWsVisibleParams("fakeNode", "any-model")).toEqual([]);
  });

  it("filters out params whose supportedModels exclude the selected model", () => {
    const all = getWorkspaceSchema("klingVideoNode")?.params ?? [];
    const visible = getWsVisibleParams("klingVideoNode", "kling-v2-6-pro");
    // The unfiltered list always has at least as many entries as the filtered one
    expect(visible.length).toBeLessThanOrEqual(all.length);
    // model_name is universal — always present
    expect(visible.find((p) => p.key === "model_name")).toBeDefined();
  });

  it("includes params with no supportedModels gate (universal params)", () => {
    const visible = getWsVisibleParams("klingVideoNode", "kling-v3-omni");
    expect(visible.some((p) => !p.supportedModels)).toBe(true);
  });

  it("keeps video audio-generation controls silent by default", () => {
    const seedanceAudio = getWsVisibleParams("videoGenNode", "seedance-1-5-pro-251215")
      .find((p) => p.key === "generate_audio");
    const klingAudio = getWsVisibleParams("videoGenNode", "kling-v3-pro")
      .find((p) => p.key === "has_audio");
    const allAudioParams = (getWorkspaceSchema("videoGenNode")?.params ?? [])
      .filter((p) => p.key === "generate_audio" || p.key === "has_audio");

    expect(seedanceAudio?.default).toBe("false");
    expect(klingAudio?.default).toBe("false");
    expect(allAudioParams.length).toBeGreaterThan(0);
    for (const param of allAudioParams) {
      expect(param.default).toBe("false");
    }
  });

  it("does not expose deprecated SeedDance 1.0 models in selectors", () => {
    const videoSchema = getWorkspaceSchema("videoGenNode");
    const workspaceModelParam = videoSchema?.params.find((p) => p.key === "model_name");
    const standaloneVideoModels = STANDALONE_TOOLS.video_gen.models.map((model) => model.id);

    expect(videoSchema?.supportedModels ?? []).not.toEqual(
      expect.arrayContaining(DEPRECATED_SEEDANCE_1_MODELS),
    );
    expect(workspaceModelParam?.options ?? []).not.toEqual(
      expect.arrayContaining(DEPRECATED_SEEDANCE_1_MODELS),
    );
    expect(standaloneVideoModels).not.toEqual(
      expect.arrayContaining(DEPRECATED_SEEDANCE_1_MODELS),
    );
  });

  it("keeps the VFX mask-to-Wan contract video-first", () => {
    const maskSchema = getWorkspaceSchema("vfxMaskNode");
    const qwenSchema = getWorkspaceSchema("vfxQwenImageNode");
    const wanSchema = getWorkspaceSchema("vfxWanVaceNode");

    expect(maskSchema?.outputs.map((output) => output.id).slice(0, 2)).toEqual([
      "mask_video",
      "mask_image",
    ]);
    expect(qwenSchema?.inputs.map((input) => input.id)).toEqual(
      expect.arrayContaining(["ref_image", "mask_image"]),
    );
    expect(wanSchema?.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "input_video", required: true }),
        expect.objectContaining({ id: "mask_video", required: true }),
        expect.objectContaining({ id: "ref_image", required: true }),
      ]),
    );
    expect(wanSchema?.outputs).toEqual([
      expect.objectContaining({ id: "video" }),
    ]);
  });
});

describe("getWsVisibleInputs", () => {
  it("returns [] for unknown nodeType", () => {
    expect(getWsVisibleInputs("fakeNode", "any-model")).toEqual([]);
  });

  it("filters input handles by supportedModels", () => {
    const inputs = getWsVisibleInputs("klingVideoNode", "kling-v2-6-pro");
    // Every visible input either has no model gate, or its gate includes the model
    for (const i of inputs) {
      if (i.supportedModels) {
        expect(i.supportedModels).toContain("kling-v2-6-pro");
      }
    }
  });
});

describe("getWsRemovedHandleIds", () => {
  it("returns [] for unknown nodeType", () => {
    expect(getWsRemovedHandleIds("fakeNode", "any-model")).toEqual([]);
  });

  it("never reports a handle id as removed if any variant supports the model", () => {
    // All variants of every input id either support the model or don't —
    // groupBy ensures multi-variant handles aren't dropped on first miss.
    const removed = getWsRemovedHandleIds("klingVideoNode", "kling-v2-6-pro");
    const inputs = getWorkspaceSchema("klingVideoNode")?.inputs ?? [];
    for (const id of removed) {
      const variants = inputs.filter((i) => i.id === id);
      const anySupports = variants.some(
        (v) => !v.supportedModels || v.supportedModels.includes("kling-v2-6-pro"),
      );
      expect(anySupports).toBe(false);
    }
  });
});

describe("getWsOverflowingHandles", () => {
  it("returns [] for unknown nodeType", () => {
    expect(
      getWsOverflowingHandles("fakeNode", "any-model", new Map()),
    ).toEqual([]);
  });

  it("flags a handle when current edge count exceeds maxConnections", () => {
    const schema = getWorkspaceSchema("klingVideoNode");
    if (!schema) return;
    const handle = schema.inputs.find(
      (h) => !h.supportedModels || h.supportedModels.includes("kling-v2-6-pro"),
    );
    if (!handle) return;
    const max = handle.maxConnections ?? 1;
    const counts = new Map<string, number>([[handle.id, max + 1]]);

    const overflow = getWsOverflowingHandles(
      "klingVideoNode",
      "kling-v2-6-pro",
      counts,
    );
    const found = overflow.find((o) => o.handleId === handle.id);
    expect(found?.count).toBe(max + 1);
    expect(found?.max).toBe(max);
  });

  it("does NOT flag a handle when count is within maxConnections", () => {
    const schema = getWorkspaceSchema("klingVideoNode");
    if (!schema) return;
    const handle = schema.inputs.find(
      (h) => !h.supportedModels || h.supportedModels.includes("kling-v2-6-pro"),
    );
    if (!handle) return;
    const max = handle.maxConnections ?? 1;
    const counts = new Map<string, number>([[handle.id, max]]);
    const overflow = getWsOverflowingHandles(
      "klingVideoNode",
      "kling-v2-6-pro",
      counts,
    );
    expect(overflow.find((o) => o.handleId === handle.id)).toBeUndefined();
  });
});

describe("cleanWsParamsOnModelChange", () => {
  it("returns prev with model_name updated when schema is unknown", () => {
    const result = cleanWsParamsOnModelChange("fakeNode", "new-model", {
      foo: 1,
      model_name: "old",
    });
    expect(result).toMatchObject({ foo: 1, model_name: "new-model" });
  });

  it("preserves underscore-prefixed metadata keys (e.g. _has_ref_video)", () => {
    const result = cleanWsParamsOnModelChange(
      "klingVideoNode",
      "kling-v2-6-pro",
      { _has_ref_video: true, _ref_video_duration: 6 },
    );
    expect(result._has_ref_video).toBe(true);
    expect(result._ref_video_duration).toBe(6);
  });

  it("preserves the special 'nodeName' key", () => {
    const result = cleanWsParamsOnModelChange(
      "klingVideoNode",
      "kling-v2-6-pro",
      { nodeName: "My label" },
    );
    expect(result.nodeName).toBe("My label");
  });

  it("always sets model_name to the new model", () => {
    const result = cleanWsParamsOnModelChange(
      "klingVideoNode",
      "kling-v3-pro",
      { model_name: "kling-v2-6-pro" },
    );
    expect(result.model_name).toBe("kling-v3-pro");
  });
});

describe("GPT_IMAGE_2 — aspect ratio + resolution split", () => {
  it("matrix has at least 14 entries (13 sizes + Auto)", () => {
    expect(GPT_IMAGE_2_SIZE_MATRIX.length).toBeGreaterThanOrEqual(14);
  });

  it("includes the special 'auto' size as ('Auto', 'Auto')", () => {
    const auto = GPT_IMAGE_2_SIZE_MATRIX.find((e) => e.size === "auto");
    expect(auto).toEqual({ size: "auto", aspectRatio: "Auto", resolution: "Auto" });
  });

  it("GPT_IMAGE_2_ASPECT_RATIOS lists each AR exactly once, in matrix order", () => {
    expect(GPT_IMAGE_2_ASPECT_RATIOS.length).toBeGreaterThan(1);
    expect(new Set(GPT_IMAGE_2_ASPECT_RATIOS).size).toBe(
      GPT_IMAGE_2_ASPECT_RATIOS.length,
    );
    expect(GPT_IMAGE_2_ASPECT_RATIOS[0]).toBe("1:1"); // first entry in matrix is 1:1
  });

  it("gptImage2ResolutionsFor returns the legal tiers for that AR", () => {
    expect(gptImage2ResolutionsFor("1:1")).toEqual(["1K", "2K"]);
    expect(gptImage2ResolutionsFor("16:9")).toEqual(["1K", "2K", "4K"]);
    expect(gptImage2ResolutionsFor("9:16")).toEqual(["1K", "2K", "4K"]);
    expect(gptImage2ResolutionsFor("Auto")).toEqual(["Auto"]);
  });

  it("gptImage2ResolutionsFor returns [] for unknown AR", () => {
    expect(gptImage2ResolutionsFor("99:1")).toEqual([]);
  });

  it("splitGptImageSize round-trips through composeGptImageSize", () => {
    for (const entry of GPT_IMAGE_2_SIZE_MATRIX) {
      const split = splitGptImageSize(entry.size);
      const composed = composeGptImageSize(split.aspectRatio, split.resolution);
      expect(composed).toBe(entry.size);
    }
  });

  it("splitGptImageSize falls back to (1:1, 1K) for unknown sizes", () => {
    expect(splitGptImageSize("totally-fake-size")).toEqual({
      aspectRatio: "1:1",
      resolution: "1K",
    });
  });

  it("splitGptImageSize handles legacy alias sizes (2880x2880, 2816x1584, 1584x2816)", () => {
    expect(splitGptImageSize("2880x2880")).toEqual({ aspectRatio: "1:1", resolution: "2K" });
    expect(splitGptImageSize("2816x1584")).toEqual({ aspectRatio: "16:9", resolution: "4K" });
    expect(splitGptImageSize("1584x2816")).toEqual({ aspectRatio: "9:16", resolution: "4K" });
  });

  it("composeGptImageSize falls back to first available tier when combo is illegal", () => {
    // 5:4 only has a 1K entry — asking for 4K should pick the first 5:4 tier
    expect(composeGptImageSize("5:4", "4K")).toBe("1280x1024");
  });

  it("composeGptImageSize last-resort returns 1024x1024 for unknown AR", () => {
    expect(composeGptImageSize("99:1", "1K")).toBe("1024x1024");
  });
});
