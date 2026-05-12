/**
 * NODE_API_SCHEMA — Single source of truth for node parameters.
 * Each entry maps a node type to its supported models, API params, and validation rules.
 * Parameter keys MUST match the JSON keys expected by the Kling API / backend edge functions.
 */

/* ─── Shared Types ─── */

export type ParamType = "text" | "textarea" | "select" | "slider" | "json" | "dynamic";

export interface ParamDef {
  /** Must match the API payload key exactly */
  key: string;
  label: string;
  type: ParamType;
  options?: string[];
  /**
   * Human-readable labels for select options.
   * Maps option value → display label. If not set, the raw value is shown.
   */
  optionLabels?: Record<string, string>;
  /**
   * Per-model option overrides. If defined, when a model is selected,
   * the dropdown will show only the options listed for that model.
   * Models not listed fall back to `options`.
   */
  optionsPerModel?: Record<string, string[]>;
  default: string | number;
  min?: number;
  max?: number;
  step?: number;
  /** If set, this param is only shown when model_name matches one of these values */
  supportedModels?: string[];
  /** Placeholder text for text/textarea/json */
  placeholder?: string;
  /** Whether this param is required in the API payload */
  required?: boolean;
  /** Visual group label — params sharing the same group are rendered under a shared header */
  group?: string;
  /**
   * Dynamic type resolution — when type is "dynamic", this function returns
   * the actual UI type based on the currently selected model.
   */
  dynamicType?: (model: string) => { type: Exclude<ParamType, "dynamic">; options?: string[]; optionLabels?: Record<string, string>; min?: number; max?: number; step?: number; default?: string | number };
  /** Conditional visibility based on sibling param values */
  visibleWhen?: Record<string, string>;
}

export interface NodeIOHandle {
  id: string;
  label: string;
  /** Color token for the handle dot */
  color: string;
  required?: boolean;
  /** If set, this handle is only rendered when model_name matches one of these values */
  supportedModels?: string[];
  /** Max simultaneous incoming edges for this handle. Defaults to 1
   *  when unspecified. Used by the workspace canvas to gate
   *  connections per provider doc limits (Banana 14, gpt-image-2 16,
   *  Kling Omni elements 4, etc.). */
  maxConnections?: number;
}

export interface NodeApiDef {
  /** Display label shown in the node header */
  displayName: string;
  /** Category badge */
  category: "AI PROCESS";
  /** Accent color class token (tailwind) */
  accentColor: string;
  /** Supported model_name values for this node type */
  supportedModels: string[];
  /** Default model_name */
  defaultModel: string;
  /** Input handles */
  inputs: NodeIOHandle[];
  /** Output handles */
  outputs: NodeIOHandle[];
  /** Ordered parameter definitions — keys are API-exact */
  params: ParamDef[];
}

/* ─── Kling Model Definitions (Source of Truth) ─── */

export interface KlingModelDef {
  label: string;
  value: string;
  api_model: string;
  mode: string;
}

export const KLING_MODELS: KlingModelDef[] = [
  // V2.6 Series (Pro only)
  { label: "Kling 2.6 Pro", value: "kling-v2-6-pro", api_model: "kling-v2-6", mode: "pro" },
  { label: "Kling 2.6 Motion Pro", value: "kling-v2-6-motion-pro", api_model: "kling-v2-6-motion", mode: "pro" },
  // V3 Series (Pro only)
  { label: "Kling 3.0 Pro", value: "kling-v3-pro", api_model: "kling-v3", mode: "pro" },
  { label: "Kling 3.0 Motion Pro", value: "kling-v3-motion-pro", api_model: "kling-v3-motion", mode: "pro" },
  
  { label: "Kling 3.0 Omni", value: "kling-v3-omni", api_model: "kling-v3-omni", mode: "pro" },
];

/** Lookup map: value → { api_model, mode } for backend payload construction */
export const KLING_MODEL_LOOKUP: Record<string, { api_model: string; mode: string }> = Object.fromEntries(
  KLING_MODELS.map((m) => [m.value, { api_model: m.api_model, mode: m.mode }])
);

/** Labels map for select dropdown: value → human-readable label */
const KLING_OPTION_LABELS: Record<string, string> = Object.fromEntries(
  KLING_MODELS.map((m) => [m.value, m.label])
);

/* ─── Schema Registry ─── */

export const NODE_API_SCHEMA: Record<string, NodeApiDef> = {
  /**
   * Banana Pro Node — Image generation via Banana API
   */
  /**
   * Remove Background Node - Strips background using Freepik/Magnific.
   * Returns transparent PNG.
   */
  removeBackgroundNode: {
    displayName: "Remove Background",
    category: "AI PROCESS",
    accentColor: "violet",
    supportedModels: ["freepik-remove-bg"],
    defaultModel: "freepik-remove-bg",
    inputs: [
      { id: "image", label: "image", color: "emerald", required: true },
    ],
    outputs: [
      { id: "image", label: "IMAGE (PNG)", color: "violet" },
    ],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: ["freepik-remove-bg"],
        optionLabels: {
          "freepik-remove-bg": "Freepik Remove Background",
        },
        default: "freepik-remove-bg",
        required: true,
      },
    ],
  },

  /**
   * MP3 Input Node — Creator-uploaded background audio track.
   * Source-only node (no input handle); outputs a signed audio URL.
   * Max file size enforced at upload (3MB).
   */
  mp3InputNode: {
    displayName: "MP3 Input",
    category: "AI PROCESS",
    accentColor: "amber",
    supportedModels: ["creator-upload"],
    defaultModel: "creator-upload",
    inputs: [],
    outputs: [
      { id: "audio", label: "AUDIO", color: "amber" },
    ],
    params: [
      {
        key: "model_name",
        label: "Source",
        type: "select",
        options: ["creator-upload"],
        optionLabels: { "creator-upload": "Creator Upload (MP3)" },
        default: "creator-upload",
        required: true,
      },
    ],
  },

  /**
   * Merge Audio Node — Combines a video stream with an audio track via Shotstack.
   * Inputs: video + audio. Output: muxed video URL.
   * Audio is trimmed/faded to match video duration (0.5s fade-out).
   */
  mergeAudioNode: {
    displayName: "Merge Audio + Video",
    category: "AI PROCESS",
    accentColor: "emerald",
    supportedModels: ["shotstack"],
    defaultModel: "shotstack",
    inputs: [
      { id: "video", label: "video", color: "violet", required: true },
      { id: "audio", label: "audio", color: "amber", required: true },
    ],
    outputs: [
      { id: "output_video", label: "VIDEO", color: "emerald" },
    ],
    params: [
      {
        key: "model_name",
        label: "Provider",
        type: "select",
        options: ["shotstack"],
        optionLabels: { "shotstack": "Shotstack (Cloud Render)" },
        default: "shotstack",
        required: true,
      },
      {
        key: "audio_mode",
        label: "Audio Mode",
        type: "select",
        options: ["replace", "mix"],
        optionLabels: {
          "replace": "Replace original audio",
          "mix": "Mix with original audio",
        },
        default: "replace",
        required: true,
      },
      {
        key: "audio_volume",
        label: "Audio Volume",
        type: "slider",
        default: 1,
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
  },

  bananaProNode: {
    displayName: "Banana Pro",
    category: "AI PROCESS",
    accentColor: "amber",
    supportedModels: ["nano-banana-2", "nano-banana-pro"],
    defaultModel: "nano-banana-2",
    inputs: [
      { id: "ref_image", label: "ref_image", color: "blue" },
    ],
    outputs: [
      { id: "image", label: "IMAGE", color: "emerald" },
    ],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: ["nano-banana-2", "nano-banana-pro"],
        optionLabels: {
          "nano-banana-2": "Nano Banana 2",
          "nano-banana-pro": "Nano Banana Pro",
        },
        default: "nano-banana-2",
        required: true,
      },
      {
        key: "prompt",
        label: "Prompt",
        type: "textarea",
        default: "",
        placeholder: "Describe the image you want to generate...",
        required: true,
      },
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: ["Auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
        default: "Auto",
      },
    ],
  },

  /**
   * Chat AI Node
   * Lovable AI Gateway endpoint: /v1/chat/completions
   * Supports Gemini and GPT models via unified gateway
   */
  chatAiNode: {
    displayName: "Chat AI",
    category: "AI PROCESS",
    accentColor: "sky",
    supportedModels: [
      "google/gemini-3.1-pro-preview",
      "google/gemini-3-flash-preview",
      "openai/gpt-5.4",
    ],
    defaultModel: "google/gemini-3.1-pro-preview",
    inputs: [
      { id: "context", label: "context", color: "sky", required: false },
    ],
    outputs: [
      { id: "text", label: "TEXT", color: "sky" },
    ],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: [
          "google/gemini-3.1-pro-preview",
          "google/gemini-3-flash-preview",
          "openai/gpt-5.4",
        ],
        default: "google/gemini-3.1-pro-preview",
        required: true,
      },
      {
        key: "system_prompt",
        label: "System Prompt",
        type: "textarea",
        default: "You are a helpful AI assistant.",
        placeholder: "Set the AI's role and behavior...",
      },
      {
        key: "prompt",
        label: "User Prompt",
        type: "textarea",
        default: "",
        placeholder: "What should the AI do?",
        required: true,
      },
      {
        key: "temperature",
        label: "Temperature",
        type: "slider",
        default: 0.7,
        min: 0,
        max: 2,
        step: 0.1,
      },
      {
        key: "max_tokens",
        label: "Max Tokens",
        type: "select",
        options: ["256", "512", "1024", "2048", "4096"],
        default: "1024",
      },
    ],
  },

  /**
   * Unified Image-to-Video Node
   * Consolidates: klingVideoNode, klingExtensionNode, motionControlNode
   * Kling API endpoints vary by model/feature — routed by backend dispatcher
   */
  klingVideoNode: {
    displayName: "Image to Video",
    category: "AI PROCESS",
    accentColor: "violet",
    supportedModels: KLING_MODELS.map((m) => m.value),
    defaultModel: "kling-v2-6-pro",
    inputs: [
      {
        id: "start_frame", label: "start_frame", color: "blue", required: true,
        supportedModels: [
          "kling-v2-6-pro", "kling-v3-pro", "kling-v3-omni",
        ],
      },
      {
        id: "end_frame", label: "end_frame", color: "white/30",
        supportedModels: [
          "kling-v2-6-pro",
          "kling-v3-pro", "kling-v3-omni",
        ],
      },
      {
        id: "ref_image", label: "ref_image", color: "cyan",
        supportedModels: [
          "kling-v2-6-motion-pro", "kling-v3-motion-pro",
          "kling-v3-omni",
        ],
      },
      {
        id: "ref_video", label: "ref_video", color: "rose",
        supportedModels: [
          "kling-v2-6-motion-pro", "kling-v3-motion-pro",
          "kling-v3-omni",
        ],
      },
    ],
    outputs: [
      { id: "output_video", label: "Video", color: "emerald" },
      { id: "output_start_frame", label: "Start Frame", color: "blue" },
      { id: "output_end_frame", label: "End Frame", color: "amber" },
    ],
    params: [
      {
        key: "model_name",
        label: "Model Version",
        type: "select",
        options: KLING_MODELS.map((m) => m.value),
        optionLabels: KLING_OPTION_LABELS,
        default: "kling-v2-6-pro",
        required: true,
      },
      {
        key: "prompt",
        label: "Prompt",
        type: "textarea",
        default: "",
        placeholder: "Describe the video content...",
      },
      {
        key: "negative_prompt",
        label: "Negative Prompt",
        type: "textarea",
        default: "",
        placeholder: "What to avoid...",
      },
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: ["Auto", "16:9", "9:16", "1:1"],
        default: "Auto",
        supportedModels: [
          "kling-v2-6-pro", "kling-v3-pro", "kling-v3-omni",
        ],
      },
      {
        key: "duration",
        label: "Duration (s)",
        type: "dynamic",
        dynamicType: (model: string) => {
          const isV3 = model === "kling-v3-omni" || model === "kling-v3-pro";
          if (isV3) return { type: "slider" as const, min: 3, max: 15, step: 1, default: 5 };
          return { type: "select" as const, options: ["5", "10"], default: "5" };
        },
        options: ["5", "10"],
        default: "5",
        supportedModels: [
          "kling-v2-6-pro", "kling-v3-pro", "kling-v3-omni",
        ],
      },
      {
        key: "has_audio",
        label: "Enable Audio",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "No Audio", "true": "With Audio" },
        default: "false",
        supportedModels: [
          "kling-v2-6-pro", "kling-v3-pro", "kling-v3-omni",
        ],
      },
      {
        key: "character_orientation",
        label: "Character Orientation",
        type: "select",
        options: ["image", "video"],
        optionLabels: { "image": "Follow Image", "video": "Follow Video" },
        default: "image",
        supportedModels: ["kling-v2-6-motion-pro", "kling-v3-motion-pro"],
      },
      {
        key: "keep_original_sound",
        label: "Keep Original Sound",
        type: "select",
        options: ["no", "yes"],
        optionLabels: { "no": "No", "yes": "Yes" },
        default: "no",
        supportedModels: [
          "kling-v2-6-motion-pro", "kling-v3-motion-pro",
          "kling-v3-omni", "kling-video-o1",
        ],
      },
      {
        key: "multi_shot",
        label: "Multi-Shot Mode",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "Off", "true": "Director Mode" },
        default: "false",
        supportedModels: ["kling-v3-omni", "kling-video-o1"],
      },
      {
        key: "multi_prompt",
        label: "Shot List (JSON)",
        type: "json",
        default: "",
        placeholder: '[{"prompt":"Scene 1...","duration":3},{"prompt":"Scene 2...","duration":2}]',
        supportedModels: ["kling-v3-omni", "kling-video-o1"],
        visibleWhen: { multi_shot: "true" },
      },
    ],
  },

  /**
   * SeedDance Video Node — Video generation via BytePlus ModelArk API
   * Supports text-to-video and image-to-video with optional audio generation
   */
  seedDanceNode: {
    displayName: "SeedDance Video",
    category: "AI PROCESS",
    accentColor: "teal",
    supportedModels: [
      "seedance-1-5-pro-251215",
    ],
    defaultModel: "seedance-1-5-pro-251215",
    inputs: [
      { id: "start_frame", label: "start_frame", color: "blue" },
      { id: "end_frame", label: "end_frame", color: "white/30" },
    ],
    outputs: [
      { id: "output_video", label: "Video", color: "emerald" },
      { id: "output_last_frame", label: "Last Frame", color: "amber" },
    ],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: [
          "seedance-1-5-pro-251215",
        ],
        optionLabels: {
          "seedance-1-5-pro-251215": "SeedDance 1.5 Pro",
        },
        default: "seedance-1-5-pro-251215",
        required: true,
      },
      {
        key: "prompt",
        label: "Prompt",
        type: "textarea",
        default: "",
        placeholder: "subject + movement + scene + camera, style...",
        required: true,
      },
      {
        key: "resolution",
        label: "Resolution",
        type: "select",
        options: ["480p", "720p", "1080p"],
        default: "720p",
      },
      {
        key: "ratio",
        label: "Aspect Ratio",
        type: "select",
        options: ["16:9", "9:16", "1:1", "4:3"],
        default: "16:9",
      },
      {
        key: "duration",
        label: "Duration (s)",
        type: "slider",
        default: 5,
        min: 2,
        max: 12,
        step: 1,
      },
      {
        key: "generate_audio",
        label: "Generate Audio",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "No Audio", "true": "With Audio" },
        default: "false",
      },
      {
        key: "return_last_frame",
        label: "Return Last Frame",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "No", "true": "Yes" },
        default: "false",
      },
    ],
  },

  /**
   * SeedDream Image Node — Image generation via BytePlus ModelArk API
   * Supports text-to-image and image-to-image
   */
  seedDreamNode: {
    displayName: "SeedDream Image",
    category: "AI PROCESS",
    accentColor: "cyan",
    supportedModels: [
      "seedream-5-0-260128",
      "seedream-5-0-lite-260128",
      "seedream-4-5-251128",
    ],
    defaultModel: "seedream-5-0-260128",
    inputs: [
      { id: "ref_image", label: "ref_image", color: "blue" },
    ],
    outputs: [
      { id: "image", label: "IMAGE", color: "emerald" },
    ],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: [
          "seedream-5-0-260128",
          "seedream-5-0-lite-260128",
          "seedream-4-5-251128",
        ],
        optionLabels: {
          "seedream-5-0-260128": "SeedDream 5.0",
          "seedream-5-0-lite-260128": "SeedDream 5.0 Lite",
          "seedream-4-5-251128": "SeedDream 4.5",
        },
        default: "seedream-5-0-260128",
        required: true,
      },
      {
        key: "prompt",
        label: "Prompt",
        type: "textarea",
        default: "",
        placeholder: "Describe the image you want to generate (max ~600 words)...",
        required: true,
      },
      {
        key: "size",
        label: "Resolution",
        type: "select",
        options: ["2K", "3K"],
        default: "2K",
      },
      {
        key: "sequential_image_generation",
        label: "Batch Generation",
        type: "select",
        options: ["disabled", "auto"],
        optionLabels: {
          disabled: "Single Image",
          auto: "Batch (auto)",
        },
        default: "disabled",
      },
      {
        key: "optimize_prompt",
        label: "Prompt Optimization",
        type: "select",
        options: ["off", "standard", "fast"],
        optionLabels: {
          off: "Off",
          standard: "Standard (higher quality)",
          fast: "Fast",
        },
        default: "off",
      },
      {
        key: "watermark",
        label: "Watermark",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "No", "true": "Yes" },
        default: "false",
      },
    ],
  },
};

/* ─── Camera Slider Compilation ─── */

const CAMERA_SLIDER_KEYS = ["camera_zoom", "camera_pan", "camera_tilt", "camera_roll"] as const;

/**
 * Compiles individual camera_* slider values into the `camera_control` JSON
 * expected by the Kling API, then strips the slider keys from the payload.
 */
function compileCameraControl(clean: Record<string, unknown>): void {
  const zoom = Number(clean.camera_zoom ?? 0);
  const pan = Number(clean.camera_pan ?? 0);
  const tilt = Number(clean.camera_tilt ?? 0);
  const roll = Number(clean.camera_roll ?? 0);

  const hasAny = zoom !== 0 || pan !== 0 || tilt !== 0 || roll !== 0;

  // Remove individual slider keys — they must never appear in API payload
  for (const k of CAMERA_SLIDER_KEYS) {
    delete clean[k];
  }

  if (hasAny) {
    clean.camera_control = {
      type: "simple",
      config: {
        horizontal: pan,
        vertical: tilt,
        zoom,
        roll,
        pan,
        tilt,
      },
    };
  }
}

/* ─── Payload Sanitization ─── */

/**
 * Builds a clean API payload from node params, stripping:
 * - null / undefined / empty string values (unless required)
 * - params not supported by the currently selected model
 * - camera_* sliders compiled into camera_control JSON
 */
export function sanitizeNodePayload(
  nodeType: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const schema = NODE_API_SCHEMA[nodeType];
  if (!schema) return { ...params };

  const selectedModel = (params.model_name as string) ?? schema.defaultModel;
  const clean: Record<string, unknown> = {};

  for (const paramDef of schema.params) {
    // Skip params not supported by the selected model
    if (
      paramDef.supportedModels &&
      !paramDef.supportedModels.includes(selectedModel)
    ) {
      continue;
    }

    const value = params[paramDef.key];

    // Skip empty/null/undefined non-required params
    if (!paramDef.required) {
      if (value === null || value === undefined) continue;
      if (typeof value === "string" && value.trim() === "") continue;
    }

    clean[paramDef.key] = value ?? paramDef.default;
  }

  // Compile camera sliders into camera_control JSON if any camera_* keys present
  const hasCameraSliders = CAMERA_SLIDER_KEYS.some((k) => k in clean);
  if (hasCameraSliders) {
    compileCameraControl(clean);
  }

  // Remap model_name → model for banana provider (backend expects "model")
  if (nodeType === "bananaProNode" && "model_name" in clean) {
    clean.model = clean.model_name;
    delete clean.model_name;
  }

  return clean;
}

/**
 * Returns only the params visible for a given model selection.
 */
export function getVisibleParams(nodeType: string, selectedModel: string): ParamDef[] {
  const schema = NODE_API_SCHEMA[nodeType];
  if (!schema) return [];

  return schema.params.filter((p) => {
    if (!p.supportedModels) return true;
    return p.supportedModels.includes(selectedModel);
  });
}

/**
 * Returns the effective options for a select param given the current model.
 */
export function getParamOptions(param: ParamDef, selectedModel: string): string[] {
  if (param.optionsPerModel && param.optionsPerModel[selectedModel]) {
    return param.optionsPerModel[selectedModel];
  }
  return param.options ?? [];
}

/**
 * When model_name changes, strips orphaned param values that are no longer
 * visible for the new model, and resets select values whose current option
 * is no longer valid under the new model's option set.
 */
export function cleanParamsOnModelChange(
  nodeType: string,
  newModel: string,
  currentParams: Record<string, unknown>,
): Record<string, unknown> {
  const visible = getVisibleParams(nodeType, newModel);
  const visibleKeys = new Set(visible.map((p) => p.key));

  const cleaned: Record<string, unknown> = { model_name: newModel };

  for (const p of visible) {
    if (p.key === "model_name") continue;
    const currentVal = currentParams[p.key];

    // Resolve dynamic type for the new model
    const resolved = p.type === "dynamic" && p.dynamicType ? p.dynamicType(newModel) : null;
    const effectiveType = resolved?.type ?? p.type;
    const effectiveDefault = resolved?.default ?? p.default;

    if (effectiveType === "select") {
      const resolvedParam = resolved ? { ...p, type: resolved.type as ParamDef["type"], options: resolved.options ?? p.options } : p;
      const validOpts = getParamOptions(resolvedParam, newModel);
      if (currentVal != null && validOpts.includes(String(currentVal))) {
        cleaned[p.key] = currentVal;
      } else {
        cleaned[p.key] = effectiveDefault;
      }
    } else if (effectiveType === "slider") {
      // For slider (e.g. motion duration), clamp current value to new range
      const min = resolved?.min ?? p.min ?? 0;
      const max = resolved?.max ?? p.max ?? 100;
      const num = Number(currentVal);
      if (!isNaN(num) && num >= min && num <= max) {
        cleaned[p.key] = num;
      } else {
        cleaned[p.key] = effectiveDefault;
      }
    } else {
      cleaned[p.key] = currentVal ?? effectiveDefault;
    }
  }

  return cleaned;
}

/**
 * Returns only the input handles visible for a given model selection.
 */
export function getVisibleInputs(nodeType: string, selectedModel: string): NodeIOHandle[] {
  const schema = NODE_API_SCHEMA[nodeType];
  if (!schema) return [];
  return schema.inputs.filter((h) => {
    if (!h.supportedModels) return true;
    return h.supportedModels.includes(selectedModel);
  });
}

/**
 * Returns handle IDs that are NOT visible for the given model.
 * Used to clean up dangling edges when the model changes.
 */
export function getRemovedHandleIds(nodeType: string, newModel: string): string[] {
  const schema = NODE_API_SCHEMA[nodeType];
  if (!schema) return [];
  return schema.inputs
    .filter((h) => h.supportedModels && !h.supportedModels.includes(newModel))
    .map((h) => h.id);
}

/**
 * Sanitize a single node's data by stripping params and handles
 * unsupported by its currently selected model.
 * Returns a deep-cloned node so the original state is untouched.
 */
export function sanitizeNodeData<T extends { type?: string; data: Record<string, unknown> }>(node: T): T {
  const nodeType = node.type ?? (node.data?.nodeType as string);
  const schema = NODE_API_SCHEMA[nodeType ?? ""];
  if (!schema) return node; // Not an action node — pass through as-is

  const params = (node.data.params as Record<string, unknown>) ?? {};
  const modelName = (params.model_name as string) ?? schema.defaultModel;

  // 1. Keep only params visible for this model
  const visibleParams = getVisibleParams(nodeType!, modelName);
  const allowedKeys = new Set(visibleParams.map((p) => p.key));
  allowedKeys.add("model_name"); // always keep

  const cleanedParams: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in params) cleanedParams[key] = params[key];
  }

  // 2. Strip handle-specific data keys for removed handles
  const removedHandles = new Set(getRemovedHandleIds(nodeType!, modelName));
  const cleanedData = { ...node.data, params: cleanedParams };
  for (const hid of removedHandles) {
    delete (cleanedData as Record<string, unknown>)[hid];
  }

  return { ...node, data: cleanedData };
}

/**
 * Sanitize an entire graph_nodes array before sending to the backend.
 * Strips ghost params/handles that don't match each node's selected model.
 */
export function sanitizeGraphNodes<T extends { type?: string; data: Record<string, unknown> }>(nodes: T[]): T[] {
  return nodes.map(sanitizeNodeData);
}

/**
 * Groups visible params into ordered buckets keyed by `param.group`.
 * Params without an explicit group fall back to a sensible default
 * derived from their key (model_name → "Model", everything else → "Parameters").
 * Order of group appearance follows the first occurrence in the schema.
 */
export interface ParamGroup {
  label: string;
  params: ParamDef[];
}

export function groupVisibleParams(nodeType: string, selectedModel: string): ParamGroup[] {
  const visible = getVisibleParams(nodeType, selectedModel);
  const order: string[] = [];
  const buckets = new Map<string, ParamDef[]>();

  for (const p of visible) {
    const groupLabel =
      p.group?.trim() ||
      (p.key === "model_name" ? "Model" : "Parameters");
    if (!buckets.has(groupLabel)) {
      buckets.set(groupLabel, []);
      order.push(groupLabel);
    }
    buckets.get(groupLabel)!.push(p);
  }

  return order.map((label) => ({ label, params: buckets.get(label)! }));
}
