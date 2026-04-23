import { describe, it, expect } from "vitest";
import { classifyPollResult } from "../play-flow/utils";
import {
  formatTimer,
  normalizeExampleMedia,
  extractFields,
  findActionNode,
  findAllActionNodes,
  buildNodeParams,
  getParamRegistry,
} from "../play-flow/utils";

/* ─── formatTimer ─── */
describe("formatTimer", () => {
  it("formats 0 seconds", () => {
    expect(formatTimer(0)).toBe("00:00");
  });

  it("formats seconds under a minute", () => {
    expect(formatTimer(5)).toBe("00:05");
    expect(formatTimer(59)).toBe("00:59");
  });

  it("formats minutes and seconds", () => {
    expect(formatTimer(61)).toBe("01:01");
    expect(formatTimer(600)).toBe("10:00");
  });
});

/* ─── normalizeExampleMedia ─── */
describe("normalizeExampleMedia", () => {
  it("returns empty array for null flow", () => {
    expect(normalizeExampleMedia(null)).toEqual([]);
  });

  it("returns thumbnail as first item", () => {
    const result = normalizeExampleMedia({ thumbnail_url: "https://example.com/thumb.jpg" });
    expect(result).toEqual([{ url: "https://example.com/thumb.jpg", type: "image" }]);
  });

  it("detects video URLs by extension", () => {
    const result = normalizeExampleMedia({ thumbnail_url: "https://example.com/clip.mp4" });
    expect(result[0].type).toBe("video");
  });

  it("extracts from settings.example_outputs", () => {
    const result = normalizeExampleMedia({
      settings: { example_outputs: ["https://a.com/1.jpg", "https://a.com/2.mp4"] },
    });
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("image");
    expect(result[1].type).toBe("video");
  });

  it("deduplicates URLs", () => {
    const result = normalizeExampleMedia({
      thumbnail_url: "https://a.com/1.jpg",
      settings: { example_outputs: ["https://a.com/1.jpg", "https://a.com/2.jpg"] },
    });
    expect(result).toHaveLength(2);
  });

  it("limits to 6 items", () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://a.com/${i}.jpg`);
    const result = normalizeExampleMedia({ settings: { example_outputs: urls } });
    expect(result).toHaveLength(6);
  });

  it("handles object items with url/type fields", () => {
    const result = normalizeExampleMedia({
      settings: {
        example_outputs: [{ url: "https://a.com/vid.mp4", type: "video" }],
      },
    });
    expect(result).toEqual([{ url: "https://a.com/vid.mp4", type: "video" }]);
  });
});

/* ─── extractFields ─── */
describe("extractFields", () => {
  it("returns empty arrays for empty graph", () => {
    const result = extractFields({ nodes: [], edges: [] });
    expect(result).toEqual({ inputs: [], exposed: [] });
  });

  it("extracts input nodes (non-creator-asset)", () => {
    const graph = {
      nodes: [
        {
          id: "n1",
          type: "inputNode",
          position: { x: 0, y: 0 },
          data: { label: "My Image", fieldLabel: "Upload photo", fieldType: "image", required: true },
        },
      ],
      edges: [],
    };
    const result = extractFields(graph);
    expect(result.inputs).toHaveLength(1);
    expect(result.inputs[0].label).toBe("My Image");
    expect(result.inputs[0].fieldType).toBe("image");
  });

  it("skips creator asset input nodes", () => {
    const graph = {
      nodes: [
        {
          id: "n1",
          type: "inputNode",
          position: { x: 0, y: 0 },
          data: { creatorAsset: true, label: "Hidden" },
        },
      ],
      edges: [],
    };
    const result = extractFields(graph);
    expect(result.inputs).toHaveLength(0);
  });

  it("extracts exposed params from action nodes", () => {
    const graph = {
      nodes: [
        {
          id: "n2",
          type: "klingVideoNode",
          position: { x: 0, y: 0 },
          data: {
            label: "Kling",
            exposed: { mode: true, prompt: false },
            params: { mode: "pro" },
          },
        },
      ],
      edges: [],
    };
    const result = extractFields(graph);
    expect(result.exposed).toHaveLength(1);
    expect(result.exposed[0].paramKey).toBe("mode");
    expect(result.exposed[0].defaultValue).toBe("pro");
  });
});

/* ─── findActionNode ─── */
describe("findActionNode", () => {
  it("returns null for no action nodes", () => {
    const graph = {
      nodes: [{ id: "n1", type: "inputNode", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    };
    expect(findActionNode(graph)).toBeNull();
  });

  it("finds klingVideoNode", () => {
    const graph = {
      nodes: [
        { id: "n1", type: "inputNode", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "klingVideoNode", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    };
    const result = findActionNode(graph);
    expect(result).not.toBeNull();
    expect(result!.node.id).toBe("n2");
    expect(result!.providerInfo.provider).toBe("kling");
    expect(result!.providerInfo.is_async).toBe(true);
  });

  it("finds chatAiNode", () => {
    const graph = {
      nodes: [{ id: "c1", type: "chatAiNode", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    };
    const result = findActionNode(graph);
    expect(result!.providerInfo.provider).toBe("chat_ai");
    expect(result!.providerInfo.output_type).toBe("text");
  });
});

/* ─── buildNodeParams ─── */
describe("buildNodeParams", () => {
  it("returns node params when no overrides", () => {
    const node = { id: "n1", type: "klingVideoNode", position: { x: 0, y: 0 }, data: { params: { mode: "pro", duration: "5" } } };
    expect(buildNodeParams(node, {})).toEqual({ mode: "pro", duration: "5" });
  });

  it("merges overrides on top of defaults", () => {
    const node = { id: "n1", type: "klingVideoNode", position: { x: 0, y: 0 }, data: { params: { mode: "pro", duration: "5" } } };
    const overrides = { n1: { mode: "std" } };
    expect(buildNodeParams(node, overrides)).toEqual({ mode: "std", duration: "5" });
  });

  it("handles missing params in data", () => {
    const node = { id: "n1", type: "klingVideoNode", position: { x: 0, y: 0 }, data: {} };
    const overrides = { n1: { prompt: "test" } };
    expect(buildNodeParams(node, overrides)).toEqual({ prompt: "test" });
  });
});

/* ─── getParamRegistry ─── */
describe("getParamRegistry", () => {
  it("returns params for klingVideoNode", () => {
    const params = getParamRegistry("klingVideoNode");
    expect(params.length).toBeGreaterThan(0);
    expect(params.find((p) => p.key === "mode")).toBeTruthy();
  });

  it("returns params for chatAiNode", () => {
    const params = getParamRegistry("chatAiNode");
    expect(params.length).toBeGreaterThan(0);
    expect(params.find((p) => p.key === "prompt")).toBeTruthy();
  });

  it("returns empty array for unknown node type", () => {
    expect(getParamRegistry("unknownNode")).toEqual([]);
  });
});

/* ─── findAllActionNodes ─── */
describe("findAllActionNodes", () => {
  it("returns empty array when no action nodes exist", () => {
    const graph = {
      nodes: [{ id: "n1", type: "inputNode", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    };
    expect(findAllActionNodes(graph)).toEqual([]);
  });

  it("finds multiple action nodes in correct order", () => {
    const graph = {
      nodes: [
        { id: "n1", type: "inputNode", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "bananaProNode", position: { x: 0, y: 0 }, data: {} },
        { id: "n3", type: "klingVideoNode", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    };
    const result = findAllActionNodes(graph);
    expect(result).toHaveLength(2);
    expect(result[0].node.id).toBe("n2");
    expect(result[0].providerInfo.provider).toBe("banana");
    expect(result[1].node.id).toBe("n3");
    expect(result[1].providerInfo.provider).toBe("kling");
  });

  it("includes chatAiNode as action node", () => {
    const graph = {
      nodes: [
        { id: "c1", type: "chatAiNode", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "klingVideoNode", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    };
    const result = findAllActionNodes(graph);
    expect(result).toHaveLength(2);
    expect(result[0].providerInfo.output_type).toBe("text");
    expect(result[1].providerInfo.output_type).toBe("video_url");
  });
});

/* ─── classifyPollResult ─── */
describe("classifyPollResult", () => {
  it("classifies succeed status with video output", () => {
    const result = classifyPollResult(
      { status: "succeed", result_url: "https://cdn.example.com/video.mp4" },
      "video_url"
    );
    expect(result).toEqual({
      outcome: "succeed",
      resultUrl: "https://cdn.example.com/video.mp4",
      resultType: "video",
    });
  });

  it("classifies succeed status with image output", () => {
    const result = classifyPollResult(
      { status: "succeed", result_url: "https://cdn.example.com/img.png" },
      "image_url"
    );
    expect(result.outcome).toBe("succeed");
    if (result.outcome === "succeed") {
      expect(result.resultType).toBe("image");
    }
  });

  it("falls back to video_url field when result_url is missing", () => {
    const result = classifyPollResult(
      { status: "succeed", video_url: "https://cdn.example.com/v.mp4" },
      "video_url"
    );
    if (result.outcome === "succeed") {
      expect(result.resultUrl).toBe("https://cdn.example.com/v.mp4");
    }
  });

  it("classifies failed status", () => {
    const result = classifyPollResult(
      { status: "failed", error: "Model timeout" },
      "video_url"
    );
    expect(result).toEqual({
      outcome: "failed",
      wasRefunded: false,
      error: "Model timeout",
    });
  });

  it("classifies failed_refunded status", () => {
    const result = classifyPollResult(
      { status: "failed_refunded", error: "API error" },
      "video_url"
    );
    expect(result).toEqual({
      outcome: "failed",
      wasRefunded: true,
      error: "API error",
    });
  });

  it("sets wasRefunded true when refunded flag is present on failed", () => {
    const result = classifyPollResult(
      { status: "failed", refunded: true },
      "video_url",
      "Default error"
    );
    if (result.outcome === "failed") {
      expect(result.wasRefunded).toBe(true);
      expect(result.error).toBe("Default error");
    }
  });

  it("uses fallback error when no error in result", () => {
    const result = classifyPollResult(
      { status: "failed" },
      "video_url",
      "Something went wrong"
    );
    if (result.outcome === "failed") {
      expect(result.error).toBe("Something went wrong");
    }
  });

  it("classifies processing/pending status", () => {
    expect(classifyPollResult({ status: "processing" }, "video_url")).toEqual({ outcome: "pending" });
    expect(classifyPollResult({ status: "queued" }, "video_url")).toEqual({ outcome: "pending" });
  });
});
