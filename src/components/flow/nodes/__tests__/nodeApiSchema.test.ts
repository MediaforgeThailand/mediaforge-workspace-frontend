import { describe, it, expect } from "vitest";
import {
  sanitizeNodePayload,
  getVisibleParams,
  getParamOptions,
  cleanParamsOnModelChange,
  sanitizeNodeData,
  sanitizeGraphNodes,
  NODE_API_SCHEMA,
  KLING_MODELS,
  KLING_MODEL_LOOKUP,
} from "../nodeApiSchema";

describe("KLING_MODELS constant", () => {
  it("contains only pro mode models", () => {
    expect(KLING_MODELS.length).toBeGreaterThan(0);
    expect(KLING_MODELS.every((m) => m.mode === "pro")).toBe(true);
  });

  it("includes the V2.6, V3 & Omni series", () => {
    const values = KLING_MODELS.map((m) => m.value);
    expect(values).toEqual([
      "kling-v2-6-pro", "kling-v2-6-motion-pro",
      "kling-v3-pro", "kling-v3-motion-pro",
      "kling-v3-omni",
    ]);
  });

  it("has human-readable labels", () => {
    expect(KLING_MODELS[0].label).toBe("Kling 2.6 Pro");
    expect(KLING_MODELS[2].label).toBe("Kling 3.0 Pro");
    expect(KLING_MODELS[KLING_MODELS.length - 1].label).toBe("Kling 3.0 Omni");
  });

  it("KLING_MODEL_LOOKUP maps values to api_model + mode", () => {
    expect(KLING_MODEL_LOOKUP["kling-v2-6-pro"]).toEqual({ api_model: "kling-v2-6", mode: "pro" });
    expect(KLING_MODEL_LOOKUP["kling-v3-pro"]).toEqual({ api_model: "kling-v3", mode: "pro" });
    expect(KLING_MODEL_LOOKUP["kling-v3-omni"]).toEqual({ api_model: "kling-v3-omni", mode: "pro" });
  });
});

describe("NODE_API_SCHEMA.klingVideoNode", () => {
  const schema = NODE_API_SCHEMA.klingVideoNode;

  it("has default model kling-v2-6-pro", () => {
    expect(schema.defaultModel).toBe("kling-v2-6-pro");
  });

  it("model_name param has optionLabels for every Kling model", () => {
    const modelParam = schema.params.find((p) => p.key === "model_name")!;
    expect(modelParam.optionLabels).toBeDefined();
    expect(modelParam.optionLabels!["kling-v2-6-pro"]).toBe("Kling 2.6 Pro");
    expect(modelParam.optionLabels!["kling-v3-omni"]).toBe("Kling 3.0 Omni");
  });

  it("model options match the KLING_MODELS list", () => {
    const modelParam = schema.params.find((p) => p.key === "model_name")!;
    expect(modelParam.options).toHaveLength(KLING_MODELS.length);
    expect(modelParam.options).toEqual(KLING_MODELS.map((m) => m.value));
  });

  it("exposes ref_image and ref_video handles for Omni models", () => {
    const refImage = schema.inputs.find((h) => h.id === "ref_image");
    const refVideo = schema.inputs.find((h) => h.id === "ref_video");
    expect(refImage).toBeDefined();
    expect(refImage!.supportedModels).toContain("kling-v3-omni");
    expect(refVideo).toBeDefined();
    expect(refVideo!.supportedModels).toContain("kling-v3-omni");
  });

  it("duration is dynamic: slider for Omni, select for standard", () => {
    const durationParam = schema.params.find((p) => p.key === "duration")!;
    expect(durationParam.type).toBe("dynamic");
    expect(durationParam.dynamicType).toBeDefined();

    const omniResolved = durationParam.dynamicType!("kling-v3-omni");
    expect(omniResolved.type).toBe("slider");
    expect(omniResolved.min).toBe(3);
    expect(omniResolved.max).toBe(15);

    const stdResolved = durationParam.dynamicType!("kling-v2-6-pro");
    expect(stdResolved.type).toBe("select");
    expect(stdResolved.options).toEqual(["5", "10"]);
  });

  it("has multi_shot and multi_prompt params for Omni models", () => {
    const multiShot = schema.params.find((p) => p.key === "multi_shot");
    const multiPrompt = schema.params.find((p) => p.key === "multi_prompt");
    expect(multiShot).toBeDefined();
    expect(multiShot!.supportedModels).toContain("kling-v3-omni");
    expect(multiPrompt).toBeDefined();
    expect(multiPrompt!.type).toBe("json");
  });
});

describe("sanitizeNodePayload", () => {
  it("returns copy of params for unknown nodeType", () => {
    const params = { foo: "bar", baz: 42 };
    const result = sanitizeNodePayload("unknownNode", params);
    expect(result).toEqual(params);
    expect(result).not.toBe(params);
  });

  it("strips empty/null non-required params", () => {
    const result = sanitizeNodePayload("klingVideoNode", {
      model_name: "kling-v2-6-pro",
      prompt: "",
      negative_prompt: "",
    });
    expect(result.model_name).toBe("kling-v2-6-pro");
    expect(result).not.toHaveProperty("prompt");
    expect(result).not.toHaveProperty("negative_prompt");
  });

  it("uses default value when required param is undefined", () => {
    const result = sanitizeNodePayload("klingVideoNode", {});
    expect(result.model_name).toBe("kling-v2-6-pro");
  });

  it("skips ghost params not in schema", () => {
    const result = sanitizeNodePayload("klingVideoNode", {
      model_name: "kling-v3-pro",
      cfg_scale: 0.5,
      mode: "pro",
      camera_zoom: 5,
      ghost_param: "bad",
    });
    expect(result).not.toHaveProperty("cfg_scale");
    expect(result).not.toHaveProperty("mode");
    expect(result).not.toHaveProperty("camera_zoom");
    expect(result).not.toHaveProperty("ghost_param");
  });
});

describe("getVisibleParams", () => {
  it("returns empty array for unknown nodeType", () => {
    expect(getVisibleParams("unknownNode", "any-model")).toEqual([]);
  });

  it("returns simplified Kling params", () => {
    const params = getVisibleParams("klingVideoNode", "kling-v2-6-pro");
    const keys = params.map((p) => p.key);
    expect(keys).toContain("model_name");
    expect(keys).toContain("prompt");
    expect(keys).toContain("negative_prompt");
    expect(keys).toContain("aspect_ratio");
    expect(keys).toContain("duration");
    expect(keys).not.toContain("camera_zoom");
    expect(keys).not.toContain("cfg_scale");
    expect(keys).not.toContain("mode");
  });

  it("shows multi_shot for Omni models only", () => {
    const omniParams = getVisibleParams("klingVideoNode", "kling-v3-omni");
    const stdParams = getVisibleParams("klingVideoNode", "kling-v2-6-pro");
    expect(omniParams.map((p) => p.key)).toContain("multi_shot");
    expect(stdParams.map((p) => p.key)).not.toContain("multi_shot");
  });
});

describe("getParamOptions", () => {
  it("returns the current KLING_MODELS as options", () => {
    const modelParam = NODE_API_SCHEMA.klingVideoNode.params.find((p) => p.key === "model_name")!;
    expect(modelParam.options).toHaveLength(KLING_MODELS.length);
    expect(modelParam.options).toContain("kling-v3-pro");
    expect(modelParam.options).toContain("kling-v3-omni");
    expect(modelParam.options).not.toContain("kling-v1-pro");
  });

  it("returns Auto as default aspect_ratio", () => {
    const param = NODE_API_SCHEMA.klingVideoNode.params.find((p) => p.key === "aspect_ratio")!;
    expect(param.default).toBe("Auto");
    expect(getParamOptions(param, "kling-v2-6-pro")).toEqual(["Auto", "16:9", "9:16", "1:1"]);
  });
});

describe("cleanParamsOnModelChange", () => {
  it("resets model_name to new model", () => {
    const result = cleanParamsOnModelChange("klingVideoNode", "kling-v3-pro", {
      model_name: "kling-v2-6-pro",
    });
    expect(result.model_name).toBe("kling-v3-pro");
  });

  it("keeps valid select values", () => {
    // Switching to v3-pro turns duration into a slider, so "10" gets coerced to numeric 10
    const result = cleanParamsOnModelChange("klingVideoNode", "kling-v3-pro", {
      model_name: "kling-v2-6-pro",
      duration: "10",
      aspect_ratio: "9:16",
    });
    expect(result.duration).toBe(10);
    expect(result.aspect_ratio).toBe("9:16");
  });

  it("resets invalid select values to default", () => {
    const result = cleanParamsOnModelChange("klingVideoNode", "kling-v3-pro", {
      model_name: "kling-v2-6-pro",
      aspect_ratio: "invalid_ratio",
    });
    expect(result.aspect_ratio).toBe("Auto");
  });

  it("strips params not in schema", () => {
    const result = cleanParamsOnModelChange("klingVideoNode", "kling-v3-pro", {
      model_name: "kling-v2-6-pro",
      camera_zoom: 5,
      cfg_scale: 0.8,
    });
    expect(result).not.toHaveProperty("camera_zoom");
    expect(result).not.toHaveProperty("cfg_scale");
  });

  it("switches duration to slider default when changing to Omni", () => {
    const result = cleanParamsOnModelChange("klingVideoNode", "kling-v3-omni", {
      model_name: "kling-v2-6-pro",
      duration: "10",
    });
    // "10" is within 3-15 range so should be kept
    expect(result.duration).toBe(10);
  });
});

describe("sanitizeNodeData / sanitizeGraphNodes", () => {
  it("strips unsupported params", () => {
    const node = {
      type: "klingVideoNode",
      data: {
        label: "Kling",
        params: {
          model_name: "kling-v2-6-pro",
          prompt: "test",
          camera_zoom: 5,
          mode: "pro",
          cfg_scale: 0.5,
        },
      },
    };
    const result = sanitizeNodeData(node);
    expect(result.data.params).toHaveProperty("model_name", "kling-v2-6-pro");
    expect(result.data.params).toHaveProperty("prompt", "test");
    expect(result.data.params).not.toHaveProperty("camera_zoom");
    expect(result.data.params).not.toHaveProperty("mode");
    expect(result.data.params).not.toHaveProperty("cfg_scale");
    // original node untouched
    expect(node.data.params).toHaveProperty("camera_zoom");
  });

  it("passes through non-action nodes unchanged", () => {
    const node = { type: "inputNode", data: { label: "Upload", fieldType: "image" } };
    const result = sanitizeNodeData(node);
    expect(result.data).toEqual(node.data);
  });

  it("sanitizeGraphNodes processes all nodes", () => {
    const nodes = [
      { type: "inputNode", data: { label: "Upload" } },
      { type: "klingVideoNode", data: { params: { model_name: "kling-v3-pro", ghost_param: "bad" } } },
    ];
    const result = sanitizeGraphNodes(nodes);
    expect(result).toHaveLength(2);
    expect(result[1].data.params).not.toHaveProperty("ghost_param");
    expect(result[1].data.params).toHaveProperty("model_name", "kling-v3-pro");
  });
});
