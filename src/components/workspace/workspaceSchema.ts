/**
 * Workspace-local schema overlay.
 *
 * Lives entirely inside `src/components/workspace/` so the shared flow
 * editor schema (`nodeApiSchema.ts`) stays byte-identical to main repo.
 * When the workspace track gets merged back, the main repo gets these
 * definitions as *new files* — no hunks in shared files.
 *
 * Design parallels legacy `NODE_API_SCHEMA`:
 *   - WORKSPACE_SCHEMA[key] → NodeApiDef (same shape)
 *   - Helpers with the same semantics (visible params/inputs, cleanup
 *     on model change) but operate on this overlay instead.
 *
 * WorkspaceToolNode prefers the workspace overlay, then falls back to
 * the legacy schema via `getWorkspaceSchema(key)` — so even standalone
 * legacy-style node types still render if the workspace canvas ever
 * references them.
 */

import {
  NODE_API_SCHEMA,
  KLING_MODELS,
  type NodeApiDef,
  type NodeIOHandle,
  type ParamDef,
} from "@/components/flow/nodes/nodeApiSchema";

/** Kling model value → display label. Rebuilt locally so we never need
 *  a new export from the shared schema file. */
const KLING_LABELS: Record<string, string> = Object.fromEntries(
  KLING_MODELS.map((m) => [m.value, m.label]),
);

const SEEDREAM_MODELS = [
  "seedream-5-0-260128",
  "seedream-5-0-lite-260128",
  "seedream-4-5-251128",
] as const;
const SEEDANCE_MODELS = [
  "seedance-1-0-pro-250528",
  "seedance-1-0-pro-fast-251015",
  "seedance-1-5-pro-251215",
] as const;
const BANANA_MODELS = ["nano-banana-2", "nano-banana-pro"] as const;
/** Backend dispatches anything starting with "gpt-image" to OpenAI's
 *  /v1/images/edits or /v1/images/generations endpoint. */
const OPENAI_IMAGE_MODELS = ["gpt-image-2"] as const;

export const WORKSPACE_SCHEMA: Record<string, NodeApiDef> = {
  /**
   * Unified Image Generation — Banana (Gemini) + SeedDream (BytePlus).
   * Model dropdown picks the engine; params below show only fields
   * relevant to that model.
   */
  imageGenNode: {
    displayName: "Image Generation",
    category: "AI PROCESS",
    accentColor: "violet",
    supportedModels: [...BANANA_MODELS, ...SEEDREAM_MODELS, ...OPENAI_IMAGE_MODELS],
    defaultModel: "nano-banana-2",
    inputs: [
      { id: "text", label: "text (prompt)", color: "sky" },
      // ref_image is split per provider so the handle's maxConnections
      // matches each model's documented limit. supportedModels filters
      // ensure exactly one variant renders for the active model.
      {
        id: "ref_image",
        label: "ref_image",
        color: "blue",
        supportedModels: [...BANANA_MODELS],
        maxConnections: 14, // Gemini 3 image models — up to 14 refs
      },
      {
        id: "ref_image",
        label: "ref_image",
        color: "blue",
        supportedModels: [...OPENAI_IMAGE_MODELS],
        maxConnections: 16, // OpenAI gpt-image /edits — up to 16 refs
      },
      {
        id: "ref_image",
        label: "ref_image",
        color: "blue",
        supportedModels: [...SEEDREAM_MODELS],
        maxConnections: 4, // BytePlus SeedDream — accepts up to 4 ref images
      },
    ],
    outputs: [{ id: "image", label: "IMAGE", color: "emerald" }],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: [...BANANA_MODELS, ...SEEDREAM_MODELS, ...OPENAI_IMAGE_MODELS],
        optionLabels: {
          "nano-banana-2": "Nano Banana 2 (Standard)",
          "nano-banana-pro": "Nano Banana Pro (Flex)",
          "seedream-5-0-260128": "SeedDream 5.0",
          "seedream-5-0-lite-260128": "SeedDream 5.0 Lite",
          "seedream-4-5-251128": "SeedDream 4.5",
          "gpt-image-2": "GPT Image 2 (OpenAI)",
        },
        default: "nano-banana-2",
        required: true,
      },
      {
        key: "prompt",
        label: "Prompt",
        type: "textarea",
        default: "",
        placeholder: "Describe the image you want to generate…",
        required: true,
      },
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: ["Auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
        default: "Auto",
        supportedModels: [...BANANA_MODELS],
      },
      // Gemini's `imageConfig.imageSize` — controls output resolution.
      // Banana 2 (gemini-3.x flash image) supports 1K and 2K.
      {
        key: "image_size",
        label: "Resolution",
        type: "select",
        options: ["1K", "2K"],
        default: "1K",
        supportedModels: ["nano-banana-2"],
      },
      // Banana Pro (gemini-3-pro-image-preview) adds 4K on top.
      {
        key: "image_size",
        label: "Resolution",
        type: "select",
        options: ["1K", "2K", "4K"],
        default: "2K",
        supportedModels: ["nano-banana-pro"],
      },
      {
        key: "size",
        label: "Resolution",
        type: "select",
        options: ["2K", "3K"],
        default: "2K",
        supportedModels: [...SEEDREAM_MODELS],
      },
      {
        key: "size",
        label: "Image Size",
        type: "select",
        options: ["1024x1024", "1536x1024", "1024x1536", "auto"],
        default: "1024x1024",
        supportedModels: [...OPENAI_IMAGE_MODELS],
      },
      {
        key: "quality",
        label: "Quality",
        type: "select",
        options: ["low", "medium", "high", "auto"],
        default: "medium",
        supportedModels: [...OPENAI_IMAGE_MODELS],
      },
      {
        key: "output_format",
        label: "Output Format",
        type: "select",
        options: ["png", "jpeg", "webp"],
        default: "png",
        supportedModels: [...OPENAI_IMAGE_MODELS],
      },
      // Transparent backgrounds work only on png / webp output.
      {
        key: "background",
        label: "Background",
        type: "select",
        options: ["auto", "transparent", "opaque"],
        optionLabels: {
          auto: "Auto",
          transparent: "Transparent (PNG/WebP)",
          opaque: "Opaque",
        },
        default: "auto",
        supportedModels: [...OPENAI_IMAGE_MODELS],
      },
      {
        key: "moderation",
        label: "Moderation",
        type: "select",
        options: ["auto", "low"],
        optionLabels: {
          auto: "Auto (default)",
          low: "Low (less strict)",
        },
        default: "auto",
        supportedModels: [...OPENAI_IMAGE_MODELS],
      },
      {
        key: "sequential_image_generation",
        label: "Batch Generation",
        type: "select",
        options: ["disabled", "auto"],
        optionLabels: { disabled: "Single Image", auto: "Batch (auto)" },
        default: "disabled",
        supportedModels: [...SEEDREAM_MODELS],
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
        supportedModels: [...SEEDREAM_MODELS],
      },
      {
        key: "watermark",
        label: "Watermark",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "No", "true": "Yes" },
        default: "false",
        supportedModels: [...SEEDREAM_MODELS],
      },
    ],
  },

  /**
   * Unified Video Generation — Kling family + SeedDance family.
   * Kling-specific features (multi-shot, ref_image/ref_video) are
   * gated by `supportedModels`, so they naturally disable when a
   * SeedDance model is picked.
   */
  videoGenNode: {
    displayName: "Video Generation",
    category: "AI PROCESS",
    accentColor: "violet",
    supportedModels: [
      ...KLING_MODELS.map((m) => m.value),
      ...SEEDANCE_MODELS,
    ],
    defaultModel: "kling-v2-6-pro",
    inputs: [
      { id: "text", label: "text (prompt)", color: "sky" },
      {
        id: "start_frame",
        label: "start_frame",
        color: "blue",
        required: true,
        supportedModels: [
          "kling-v2-6-pro", "kling-v3-pro", "kling-v3-omni",
          ...SEEDANCE_MODELS,
        ],
      },
      {
        id: "end_frame",
        label: "end_frame",
        color: "white/30",
        supportedModels: [
          "kling-v2-6-pro", "kling-v3-pro", "kling-v3-omni",
          ...SEEDANCE_MODELS,
        ],
      },
      {
        id: "ref_image",
        label: "ref_image",
        color: "cyan",
        supportedModels: ["kling-v2-6-motion-pro", "kling-v3-motion-pro", "kling-v3-omni"],
      },
      {
        id: "ref_video",
        label: "ref_video",
        color: "rose",
        supportedModels: ["kling-v2-6-motion-pro", "kling-v3-motion-pro", "kling-v3-omni"],
      },
      {
        id: "elements",
        label: "elements",
        color: "rose",
        supportedModels: ["kling-v3-omni"],
        maxConnections: 4, // Kling Omni v3 supports up to 4 element refs
      },
    ],
    outputs: [
      { id: "output_video", label: "Video", color: "emerald" },
      {
        id: "output_start_frame",
        label: "Start Frame",
        color: "blue",
        supportedModels: [
          "kling-v2-6-pro", "kling-v2-6-motion-pro",
          "kling-v3-pro", "kling-v3-motion-pro", "kling-v3-omni",
        ],
      },
      {
        id: "output_end_frame",
        label: "End Frame",
        color: "amber",
        supportedModels: [
          "kling-v2-6-pro", "kling-v2-6-motion-pro",
          "kling-v3-pro", "kling-v3-motion-pro", "kling-v3-omni",
        ],
      },
      {
        id: "output_last_frame",
        label: "Last Frame",
        color: "amber",
        supportedModels: [...SEEDANCE_MODELS],
      },
    ],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: [
          ...KLING_MODELS.map((m) => m.value),
          ...SEEDANCE_MODELS,
        ],
        optionLabels: {
          ...KLING_LABELS,
          "seedance-1-0-pro-250528": "SeedDance 1.0 Pro",
          "seedance-1-0-pro-fast-251015": "SeedDance 1.0 Pro Fast (3x)",
          "seedance-1-5-pro-251215": "SeedDance 1.5 Pro (Latest)",
        },
        default: "kling-v2-6-pro",
        required: true,
      },
      {
        key: "prompt",
        label: "Prompt",
        type: "textarea",
        default: "",
        placeholder: "Describe the video content…",
      },
      {
        key: "negative_prompt",
        label: "Negative Prompt",
        type: "textarea",
        default: "",
        placeholder: "What to avoid…",
        supportedModels: [...KLING_MODELS.map((m) => m.value)],
      },
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: ["Auto", "16:9", "9:16", "1:1"],
        default: "Auto",
        supportedModels: ["kling-v2-6-pro", "kling-v3-pro", "kling-v3-omni"],
      },
      {
        key: "ratio",
        label: "Aspect Ratio",
        type: "select",
        options: ["16:9", "9:16", "1:1", "4:3"],
        default: "16:9",
        supportedModels: [...SEEDANCE_MODELS],
      },
      {
        key: "resolution",
        label: "Resolution",
        type: "select",
        options: ["480p", "720p", "1080p"],
        default: "720p",
        supportedModels: [...SEEDANCE_MODELS],
      },
      {
        key: "duration",
        label: "Duration (s)",
        type: "dynamic",
        dynamicType: (model: string) => {
          const isV3 = model === "kling-v3-omni" || model === "kling-v3-pro";
          if (isV3)
            return { type: "slider" as const, min: 3, max: 15, step: 1, default: 5 };
          if (model.startsWith("seedance-"))
            return { type: "slider" as const, min: 2, max: 12, step: 1, default: 5 };
          return { type: "select" as const, options: ["5", "10"], default: "5" };
        },
        options: ["5", "10"],
        default: "5",
        supportedModels: [
          "kling-v2-6-pro", "kling-v3-pro", "kling-v3-omni",
          ...SEEDANCE_MODELS,
        ],
      },
      {
        key: "has_audio",
        label: "Enable Audio",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "No Audio", "true": "With Audio" },
        default: "false",
        supportedModels: ["kling-v2-6-pro", "kling-v3-pro", "kling-v3-omni"],
      },
      {
        key: "generate_audio",
        label: "Generate Audio",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "No Audio", "true": "With Audio" },
        default: "false",
        supportedModels: [...SEEDANCE_MODELS],
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
        supportedModels: ["kling-v2-6-motion-pro", "kling-v3-motion-pro", "kling-v3-omni"],
      },
      {
        key: "multi_shot",
        label: "Multi-Shot Mode",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "Off", "true": "Director Mode" },
        default: "false",
        supportedModels: ["kling-v3-omni"],
      },
      {
        key: "multi_prompt",
        label: "Shot List (JSON)",
        type: "json",
        default: "",
        placeholder: '[{"prompt":"Scene 1…","duration":3}]',
        supportedModels: ["kling-v3-omni"],
        visibleWhen: { multi_shot: "true" },
      },
      {
        key: "return_last_frame",
        label: "Return Last Frame",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "No", "true": "Yes" },
        default: "false",
        supportedModels: [...SEEDANCE_MODELS],
      },
    ],
  },

  /**
   * Video → Prompt — Gemini 3.x video understanding.
   * Reads a video clip, breaks it into scenes, and writes back a
   * cinematography-aware text breakdown the user can re-use as a
   * prompt for image / video generators downstream.
   */
  videoToPromptNode: {
    displayName: "Video to Prompt",
    category: "AI PROCESS",
    accentColor: "sky",
    supportedModels: ["gemini-3.1-pro-preview", "gemini-3-flash-preview"],
    defaultModel: "gemini-3.1-pro-preview",
    inputs: [
      { id: "video", label: "video", color: "violet", required: true, maxConnections: 1 },
    ],
    outputs: [
      { id: "text", label: "PROMPT", color: "sky" },
    ],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: ["gemini-3.1-pro-preview", "gemini-3-flash-preview"],
        optionLabels: {
          "gemini-3.1-pro-preview": "Gemini 3.1 Pro (best, slower)",
          "gemini-3-flash-preview": "Gemini 3 Flash (fast)",
        },
        default: "gemini-3.1-pro-preview",
        required: true,
      },
      {
        key: "language",
        label: "Output Language",
        type: "select",
        options: ["th", "en"],
        optionLabels: { th: "ไทย", en: "English" },
        default: "th",
      },
      {
        key: "prompt",
        label: "Extra Instruction (optional)",
        type: "textarea",
        default: "",
        placeholder: "เช่น โฟกัสที่การเคลื่อนกล้อง / การจัดแสง เท่านั้น…",
      },
    ],
  },

  /**
   * Image to 3D Model — Tripo3D.
   * Submits a single reference image to Tripo3D's `image_to_model`
   * pipeline; backend polls until the GLB is ready, then returns
   * both the rendered preview thumbnail (so the workspace UI has
   * something to render in the result strip) and the GLB URL on a
   * separate `model3d` output handle for downstream consumers.
   */
  /**
   * Audio Generator (Gemini 2.5 TTS).
   *
   * Wraps Google's prebuilt voice catalogue (30 named voices —
   * Achernar, Aoede, Charon, … — see `geminiVoices.ts`). The user
   * picks a voice via the VoicePickerDialog (opened by clicking the
   * "Voice" param row in the node body) and writes a script. Output
   * is a single MP3 / WAV asset suitable for downstream Merge A/V
   * nodes or a direct download.
   *
   * Param notes:
   *   - `model_name` defaults to gemini-2.5-flash-preview-tts —
   *     cheaper and fast enough for short clips. The Pro variant is
   *     available for production-grade narration.
   *   - `voice` stores the Gemini voice id (e.g. "Charon"). A select
   *     widget is provided as a fallback, but the picker dialog is
   *     the intended UX. The default is "Charon" (Informative —
   *     reads as a neutral baseline for most copy).
   *   - `style_prompt` is an OPTIONAL per-clip directive that
   *     Gemini's TTS supports — it lets the user say things like
   *     "Read this with a calm, gentle tone" without needing to
   *     change the underlying voice.
   */
  audioGenNode: {
    displayName: "Audio Generation",
    category: "AI PROCESS",
    accentColor: "amber",
    supportedModels: [
      "gemini-2.5-flash-preview-tts",
      "gemini-2.5-pro-preview-tts",
    ],
    defaultModel: "gemini-2.5-flash-preview-tts",
    inputs: [
      { id: "text", label: "text (script)", color: "sky" },
    ],
    outputs: [{ id: "audio", label: "AUDIO", color: "amber" }],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: [
          "gemini-2.5-flash-preview-tts",
          "gemini-2.5-pro-preview-tts",
        ],
        optionLabels: {
          "gemini-2.5-flash-preview-tts": "Gemini 2.5 Flash TTS",
          "gemini-2.5-pro-preview-tts": "Gemini 2.5 Pro TTS",
        },
        default: "gemini-2.5-flash-preview-tts",
        required: true,
      },
      {
        key: "voice",
        label: "Voice",
        type: "select",
        // The full 30-voice catalogue; the in-canvas widget is a
        // dropdown, but the floating "Browse voices…" button on the
        // node opens the rich VoicePickerDialog (with use-case
        // cards, search, preview play, etc.).
        options: [
          "Achernar","Achird","Algenib","Algieba","Alnilam","Aoede",
          "Autonoe","Callirrhoe","Charon","Despina","Enceladus","Erinome",
          "Fenrir","Gacrux","Iapetus","Kore","Laomedeia","Leda","Orus",
          "Puck","Pulcherrima","Rasalgethi","Sadachbia","Sadaltager",
          "Schedar","Sulafat","Umbriel","Vindemiatrix","Zephyr","Zubenelgenubi",
        ],
        default: "Charon",
        required: true,
      },
      {
        key: "prompt",
        label: "Script",
        type: "textarea",
        default: "",
        placeholder: "Type the line you want spoken…",
        required: true,
      },
      {
        key: "style_prompt",
        label: "Style direction (optional)",
        type: "textarea",
        default: "",
        placeholder:
          "e.g. Read this in a calm, reassuring tone, slowing down on the technical terms.",
      },
    ],
  },

  imageTo3dNode: {
    displayName: "Image to 3D",
    category: "AI PROCESS",
    accentColor: "amber",
    supportedModels: [
      "tripo3d-p1",
      "tripo3d-v3.1",
      "tripo3d-v3.0",
      "tripo3d-turbo",
      "tripo3d-v2.5",
      "tripo3d-v2.0",
      "tripo3d-v1.4",
    ],
    defaultModel: "tripo3d-v3.1",
    inputs: [
      {
        id: "image",
        label: "image",
        color: "emerald",
        required: true,
        maxConnections: 1,
      },
    ],
    // No output ports — a generated 3D model isn't wireable into any
    // other node in the workspace (image / video tools can't consume
    // a GLB). The result lives in the node's preview + the user's
    // asset library; downstream needs would be served by a future
    // node type that takes 3d as input.
    outputs: [],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: [
          "tripo3d-p1",
          "tripo3d-v3.1",
          "tripo3d-v3.0",
          "tripo3d-turbo",
          "tripo3d-v2.5",
          "tripo3d-v2.0",
          "tripo3d-v1.4",
        ],
        optionLabels: {
          "tripo3d-p1":   "Tripo P1 (Newest, preview)",
          "tripo3d-v3.1": "Tripo v3.1 (Gold standard, Detailed)",
          "tripo3d-v3.0": "Tripo v3.0",
          "tripo3d-turbo":"Tripo Turbo v1.0 (Fast)",
          "tripo3d-v2.5": "Tripo v2.5",
          "tripo3d-v2.0": "Tripo v2.0",
          "tripo3d-v1.4": "Tripo v1.4 (Legacy)",
        },
        default: "tripo3d-v3.1",
        required: true,
      },
      {
        key: "texture",
        label: "Texture",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "Off", "true": "On" },
        default: "true",
      },
      {
        key: "pbr",
        label: "PBR Materials",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "Off", "true": "On" },
        default: "true",
      },
      {
        key: "auto_size",
        label: "Auto Size",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "Off", "true": "On" },
        default: "true",
      },
    ],
  },
};

/* ── Port-type inference ───────────────────────────────────────
 *
 * Used by every node component to tag each rendered Handle with
 * `data-port-type`. The CSS visibility-while-connecting layer reads
 * that attribute and shows only handles whose type matches the
 * dragged source's data type (so dragging an image output reveals
 * only image-typed inputs across the canvas, not every handle).
 *
 * Centralising the inference avoids drift between IMAGE_TARGETS in
 * WorkspaceCanvas (used by isValidConnection) and per-node CSS
 * tagging — both must stay in sync or visual feedback diverges
 * from the actual connect rules.
 */
export type WirePortType = "text" | "image" | "video" | "audio" | "element" | "model3d";

const TEXT_HANDLE_IDS = new Set([
  "text",
  "context",
  "context_text",
  "prompt",
  "output_text",
]);
const IMAGE_HANDLE_IDS = new Set([
  "image",
  "ref_image",
  "image_input",
  "start_frame",
  "end_frame",
  "frontal",
  "mask",
  "img_1",
  "img_2",
  "img_3",
  "ref_1",
  "ref_2",
  "ref_3",
  "ref_4",
  "output_image",
  "output_start_frame",
  "output_end_frame",
  "output_last_frame",
  "preview_image",
]);
const VIDEO_HANDLE_IDS = new Set([
  "video",
  "ref_video",
  "output_video",
]);
const AUDIO_HANDLE_IDS = new Set([
  "audio",
  "ref_audio",
  "output_audio",
]);
const ELEMENT_HANDLE_IDS = new Set(["elements", "element"]);
const MODEL3D_HANDLE_IDS = new Set([
  "model3d",
  "model_3d",
  "output_model",
  "ref_model",
]);

/** Map a Handle's id → its data type. Falls back to "image" for
 *  unknown ids since most workspace ports are image-shaped; the
 *  isValidConnection layer is the real safety net. */
export function portTypeFromHandleId(id: string): WirePortType {
  if (TEXT_HANDLE_IDS.has(id)) return "text";
  if (VIDEO_HANDLE_IDS.has(id)) return "video";
  if (AUDIO_HANDLE_IDS.has(id)) return "audio";
  if (ELEMENT_HANDLE_IDS.has(id)) return "element";
  if (MODEL3D_HANDLE_IDS.has(id)) return "model3d";
  if (IMAGE_HANDLE_IDS.has(id)) return "image";
  return "image";
}

/* ── Schema lookup ─────────────────────────────────────────── */

/**
 * Workspace-first schema lookup. If `key` is a workspace-only type
 * return our overlay; otherwise fall back to the shared legacy schema
 * so plain tool nodes (removeBackgroundNode, mergeAudioNode, …) still
 * work when rendered by WorkspaceToolNode.
 */
export function getWorkspaceSchema(key: string): NodeApiDef | undefined {
  return WORKSPACE_SCHEMA[key] ?? NODE_API_SCHEMA[key];
}

/* ── Helpers (mirror the legacy API) ───────────────────────── */

function matchesModel(
  entry: { supportedModels?: string[] },
  selectedModel: string,
): boolean {
  return !entry.supportedModels || entry.supportedModels.includes(selectedModel);
}

/** Resolve a possibly-dynamic param to its concrete display type. */
function resolveParam(p: ParamDef, model: string): ParamDef {
  if (p.type !== "dynamic" || !p.dynamicType) return p;
  const dyn = p.dynamicType(model);
  return { ...p, ...dyn, type: dyn.type };
}

export function getWsVisibleParams(nodeType: string, selectedModel: string): ParamDef[] {
  const schema = getWorkspaceSchema(nodeType);
  if (!schema) return [];
  return schema.params.filter((p) => matchesModel(p, selectedModel));
}

export function getWsVisibleInputs(nodeType: string, selectedModel: string): NodeIOHandle[] {
  const schema = getWorkspaceSchema(nodeType);
  if (!schema) return [];
  return schema.inputs.filter((i) => matchesModel(i, selectedModel));
}

/** Input handle ids that should be *removed* when switching to a model
 *  that doesn't support them — used to snip dangling edges.
 *
 *  Group by handle id first: a handle id is "removed" only when NO
 *  variant supports the new model. With multi-provider handles (e.g.
 *  three `ref_image` entries gated by `supportedModels`), a switch
 *  within the same family must NOT drop the existing edge — a
 *  Banana→OpenAI swap keeps both sides' `ref_image` available. */
export function getWsRemovedHandleIds(nodeType: string, newModel: string): string[] {
  const schema = getWorkspaceSchema(nodeType);
  if (!schema) return [];
  const byId = new Map<string, NodeIOHandle[]>();
  for (const i of schema.inputs) {
    const arr = byId.get(i.id) ?? [];
    arr.push(i);
    byId.set(i.id, arr);
  }
  const removed: string[] = [];
  for (const [id, variants] of byId) {
    const anySupports = variants.some(
      (v) => !v.supportedModels || v.supportedModels.includes(newModel),
    );
    if (!anySupports) removed.push(id);
  }
  return removed;
}

/**
 * After a model switch, find handles whose existing edge count exceeds
 * the new model's `maxConnections`. The caller (WorkspaceToolNode)
 * uses this to surface a toast — we don't auto-trim, the user decides
 * which connections to drop.
 *
 * Returns one entry per overrunning handle.
 */
export function getWsOverflowingHandles(
  nodeType: string,
  newModel: string,
  edgeCountByHandle: Map<string, number>,
): Array<{ handleId: string; label: string; count: number; max: number }> {
  const schema = getWorkspaceSchema(nodeType);
  if (!schema) return [];
  const out: Array<{ handleId: string; label: string; count: number; max: number }> = [];
  // Pick the visible variant per handle id for the new model, then
  // compare its maxConnections cap against current edge count.
  const seen = new Set<string>();
  for (const h of schema.inputs) {
    if (seen.has(h.id)) continue;
    if (h.supportedModels && !h.supportedModels.includes(newModel)) continue;
    seen.add(h.id);
    const max = h.maxConnections ?? 1;
    const count = edgeCountByHandle.get(h.id) ?? 0;
    if (count > max) {
      out.push({ handleId: h.id, label: h.label, count, max });
    }
  }
  return out;
}

/** Drop param values that aren't valid for the new model; keep the
 *  rest. Non-schema keys (underscore-prefixed + nodeName) are
 *  preserved so per-node state like `_has_ref_video` survives.
 *
 *  Also handles the cross-provider key-collision case: when the same
 *  param key (e.g. `size`) is declared by multiple model families
 *  with different option sets, the carried-over value is checked
 *  against the new param's options[] and reset to its default if it
 *  isn't valid (so e.g. switching SeedDream→OpenAI doesn't leave
 *  `size: "2K"` lying around for the OpenAI dispatcher to choke on).
 */
export function cleanWsParamsOnModelChange(
  nodeType: string,
  newModel: string,
  prev: Record<string, unknown>,
): Record<string, unknown> {
  const schema = getWorkspaceSchema(nodeType);
  if (!schema) return { ...prev, model_name: newModel };
  const valid: Record<string, unknown> = { model_name: newModel };
  for (const p of schema.params) {
    if (p.key === "model_name") continue;
    if (!matchesModel(p, newModel)) continue;
    if (prev[p.key] === undefined) continue;
    const carried = prev[p.key];
    // For finite-option params, drop the carried value if it isn't a
    // legal option under the new param def (cross-provider collision).
    if (p.type === "select" && Array.isArray(p.options) && !p.options.includes(String(carried))) {
      valid[p.key] = p.default;
    } else {
      valid[p.key] = carried;
    }
  }
  // Preserve metadata-ish keys the renderer uses outside the schema.
  for (const k of Object.keys(prev)) {
    if (k.startsWith("_") || k === "nodeName") valid[k] = prev[k];
  }
  return valid;
}

/** Re-export the resolver in case a consumer needs the raw concrete
 *  type for a dynamic param (used by the renderer). */
export { resolveParam as resolveWsParam };
