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
// Voice catalog imports were removed when the hardcoded "preset"
// voice lists were deleted. Audio gen now relies on backend defaults
// for the voice id; the current UI only exposes script and style
// instructions.

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
  "seedance-1-5-pro-251215",
  "seedance-2-0-lite",
  "seedance-2-0-pro",
] as const;
const SEEDANCE_VIDEO_REF_MODELS = [
  "seedance-2-0-lite",
  "seedance-2-0-pro",
] as const;
const SEEDANCE_AUDIO_MODELS = [
  "seedance-1-5-pro-251215",
  ...SEEDANCE_VIDEO_REF_MODELS,
] as const;
const SEEDANCE_1080P_MODELS = [
  "seedance-1-5-pro-251215",
  "seedance-2-0-pro",
] as const;
const SEEDANCE_720P_MAX_MODELS = ["seedance-2-0-lite"] as const;
const REPLICATE_SEEDANCE_MODELS = [] as const;
const REPLICATE_SEEDANCE_REF_MODELS = [...REPLICATE_SEEDANCE_MODELS] as const;
const KLING_V3_DIRECT_RESOLUTION_MODELS = ["kling-v3-pro", "kling-v3-omni"] as const;
const KLING_V3_DIRECT_MOTION_RESOLUTION_MODELS = ["kling-v3-motion-pro"] as const;
const REPLICATE_KLING_FRAME_MODELS = [] as const;
const REPLICATE_KLING_MOTION_MODELS = [] as const;
const REPLICATE_KLING_MODELS = [
  ...REPLICATE_KLING_FRAME_MODELS,
  ...REPLICATE_KLING_MOTION_MODELS,
] as const;
/** Google Veo (Standard tier only). Backend dispatches anything
 *  starting with "veo-" to the Gemini API `predictLongRunning`
 *  endpoint. Real spec verified against
 *  https://ai.google.dev/gemini-api/docs/video — see backend
 *  `_shared/veo.ts` for the param contract. */
const VEO_MODELS = ["veo-3.1-generate-001"] as const;
const REPLICATE_VEO_MODELS = [] as const;
const BANANA_MODELS = ["nano-banana-2", "nano-banana-pro"] as const;
const REPLICATE_BANANA_MODELS = [] as const;
/** Backend dispatches anything starting with "gpt-image" to OpenAI's
 *  /v1/images/edits or /v1/images/generations endpoint. */
const OPENAI_IMAGE_MODELS = ["gpt-image-2"] as const;
const REPLICATE_OPENAI_IMAGE_MODELS = [] as const;
const ELEVENLABS_TTS_MODELS = ["elevenlabs-multilingual-v2", "elevenlabs-turbo-v2-5"] as const;
const ELEVENLABS_DUBBING_MODEL = "elevenlabs-dubbing-voice-clone" as const;
const ELEVENLABS_DUBBING_LANGUAGES = [
  "English",
  "Hindi",
  "Portuguese",
  "Chinese",
  "Spanish",
  "French",
  "German",
  "Japanese",
  "Arabic",
  "Russian",
  "Korean",
  "Indonesian",
  "Italian",
  "Dutch",
  "Turkish",
  "Polish",
  "Swedish",
  "Filipino",
  "Malay",
  "Romanian",
  "Ukrainian",
  "Greek",
  "Czech",
  "Danish",
  "Finnish",
  "Bulgarian",
  "Croatian",
  "Slovak",
  "Tamil",
] as const;
const ELEVENLABS_DUBBING_SOURCE_LANGUAGES = ["Auto", ...ELEVENLABS_DUBBING_LANGUAGES] as const;
const GEMINI_TTS_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-pro-preview-tts"] as const;
/** All 30 official preset speakers shipped with Gemini 3.1 Flash TTS
 *  Preview (verified against
 *  https://ai.google.dev/gemini-api/docs/speech-generation, May 2026).
 *  Backend `executeGeminiTts` validates against the same set; if Google
 *  publishes new presets, update both `GEMINI_TTS_VOICES` here and the
 *  Set in `workspace-run-node/index.ts` together. Order is alphabetical
 *  so the dropdown shows them in a predictable column. */
export const GEMINI_TTS_VOICES = [
  "Achernar", "Achird", "Algenib", "Algieba", "Alnilam",
  "Aoede", "Autonoe", "Callirrhoe", "Charon", "Despina",
  "Enceladus", "Erinome", "Fenrir", "Gacrux", "Iapetus",
  "Kore", "Laomedeia", "Leda", "Orus", "Puck",
  "Pulcherrima", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar",
  "Sulafat", "Umbriel", "Vindemiatrix", "Zephyr", "Zubenelgenubi",
] as const;
export const DEFAULT_GEMINI_TTS_VOICE = "Kore";
// Backend still supports Google Cloud TTS, but the workspace project does not
// currently have GOOGLE_TTS_API_KEY configured, so keep it hidden in the UI.
const GOOGLE_TTS_MODELS = [] as const;
const TRIPO_MULTIVIEW_3D_MODELS = [
  "tripo3d-v3.1",
  "tripo3d-v3.0",
  "tripo3d-v2.5",
] as const;
const SINGLE_IMAGE_3D_MODELS = [
  "tripo3d-p1",
  "hyper3d-gen2-260112",
] as const;
const OPENAI_UPSCALE_MODELS = ["gpt-image-2-enhance"] as const;
const UPSCALE_MODELS = [...OPENAI_UPSCALE_MODELS] as const;
const URL_ASSET_MODELS = ["url-to-png", "url-to-mp3", "url-to-mp4"] as const;

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
    supportedModels: [
      ...BANANA_MODELS,
      ...REPLICATE_BANANA_MODELS,
      ...SEEDREAM_MODELS,
      ...OPENAI_IMAGE_MODELS,
      ...REPLICATE_OPENAI_IMAGE_MODELS,
    ],
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
        supportedModels: [...BANANA_MODELS, ...REPLICATE_BANANA_MODELS],
        maxConnections: 14, // Gemini 3 image models — up to 14 refs
      },
      {
        id: "ref_image",
        label: "ref_image",
        color: "blue",
        supportedModels: [...OPENAI_IMAGE_MODELS, ...REPLICATE_OPENAI_IMAGE_MODELS],
        maxConnections: 16, // OpenAI gpt-image /edits — up to 16 refs
      },
      {
        id: "ref_image",
        label: "ref_image",
        color: "blue",
        supportedModels: [...SEEDREAM_MODELS],
        // BytePlus ModelArk SeedDream 4.5 + 5.0 accept up to 14
        // reference images via the `image_urls` array (per BytePlus
        // doc 1824121, verified 2026-04). The executor passes them
        // through in canvas wire order so the prompt's "Image 1",
        // "Image 2" indexing stays predictable.
        maxConnections: 14,
      },
    ],
    outputs: [{ id: "image", label: "IMAGE", color: "emerald" }],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: [
          ...BANANA_MODELS,
          ...REPLICATE_BANANA_MODELS,
          ...SEEDREAM_MODELS,
          ...OPENAI_IMAGE_MODELS,
          ...REPLICATE_OPENAI_IMAGE_MODELS,
        ],
        optionLabels: {
          "nano-banana-2": "Nano Banana 2",
          "nano-banana-pro": "Nano Banana Pro",
          "seedream-5-0-260128": "SeedDream 5.0",
          "seedream-5-0-lite-260128": "SeedDream 5.0 Lite",
          "seedream-4-5-251128": "SeedDream 4.5",
          "gpt-image-2": "GPT Image 2",
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
        supportedModels: [...BANANA_MODELS, ...REPLICATE_BANANA_MODELS],
      },
      // Gemini's `imageConfig.imageSize` — controls output resolution.
      // Nano Banana 2 direct Google API accepts 1K, 2K, and 4K.
      {
        key: "image_size",
        label: "Resolution",
        type: "select",
        options: ["1K", "2K", "4K"],
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
      // BytePlus ModelArk Seedream `size` accepts named aspect-ratio
      // strings in addition to "WIDTHxHEIGHT". The executor combines
      // the chosen ratio with the Resolution tier above into BytePlus-
      // compatible pixel dimensions — 1:1 stays at the doc-verified
      // baselines (2048×2048 / 3072×3072); other ratios scale to keep
      // total pixels within the 3.7-10.4 MP API range.
      // Source: https://docs.byteplus.com/en/docs/ModelArk/1824121
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21"],
        default: "1:1",
        supportedModels: [...SEEDREAM_MODELS],
      },
      // GPT Image 2 — expanded size catalog covering the popular
      // social / video aspect ratios users actually shoot for:
      //   1:1 (feed), 4:5 (IG portrait), 3:4 (feed alt),
      //   2:3 / 3:2 (DSLR), 5:4 / 4:5 (print), 16:9 / 9:16 (video).
      //
      // Picking the actual pixel sizes is constrained by gpt-image-2:
      //   - Max edge ≤ 3840px
      //   - Both edges multiples of 16
      //   - Total pixels 655,360 ≤ N ≤ 8,294,400
      //   - Long:short edge ratio ≤ 3:1
      // Source: https://developers.openai.com/api/docs/models/gpt-image-2
      //
      // The "Popular sizes" list in the docs (1024², 1536×1024,
      // 1024×1536, 2048², 2048×1152, 3840×2160, 2160×3840) is a
      // subset of what the API accepts — we add the missing
      // ratios the user explicitly requested (4:5, 9:16 2K, 3:4)
      // because creators shoot for IG / TikTok / Reels constantly.
      //
      // Labels include the ratio so users picking by ratio (which
      // is how marketing briefs are written) don't have to do
      // mental math from the pixel dimensions.
      {
        key: "size",
        label: "Image Size",
        type: "select",
        options: [
          // Square
          "1024x1024",
          "2048x2048",
          // Landscape
          "1536x1024",
          "1280x1024",
          "1280x720",
          "2048x1152",
          "3840x2160",
          // Portrait / vertical
          "1024x1536",
          "1024x1280",
          "1152x1536",
          "720x1280",
          "1152x2048",
          "2160x3840",
          "auto",
        ],
        optionLabels: {
          "1024x1024": "1024×1024 · 1:1 Square",
          "2048x2048": "2048×2048 · 1:1 · 2K Square",
          "1536x1024": "1536×1024 · 3:2 Landscape",
          "1280x1024": "1280×1024 · 5:4 Landscape",
          "1280x720": "1280×720 · 16:9 · 1K",
          "2048x1152": "2048×1152 · 16:9 · 2K",
          "3840x2160": "3840×2160 · 16:9 · 4K",
          "1024x1536": "1024×1536 · 2:3 Portrait",
          "1024x1280": "1024×1280 · 4:5 Portrait (IG)",
          "1152x1536": "1152×1536 · 3:4 Portrait",
          "720x1280": "720×1280 · 9:16 · 1K Vertical",
          "1152x2048": "1152×2048 · 9:16 · 2K Vertical",
          "2160x3840": "2160×3840 · 9:16 · 4K Vertical",
          auto: "Auto Size",
        },
        default: "1024x1024",
        supportedModels: [...OPENAI_IMAGE_MODELS],
      },
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: ["1:1", "3:2", "2:3"],
        default: "1:1",
        supportedModels: [...REPLICATE_OPENAI_IMAGE_MODELS],
      },
      {
        key: "quality",
        label: "Quality",
        type: "select",
        options: ["low", "medium", "high"],
        optionLabels: {
          low: "Low",
          medium: "Medium",
          high: "High",
        },
        default: "medium",
        supportedModels: [...OPENAI_IMAGE_MODELS, ...REPLICATE_OPENAI_IMAGE_MODELS],
      },
      {
        key: "output_format",
        label: "Output Format",
        type: "select",
        options: ["png", "jpeg", "webp"],
        optionLabels: {
          png: "PNG",
          jpeg: "JPEG",
          webp: "WebP",
        },
        default: "png",
        supportedModels: [...OPENAI_IMAGE_MODELS, ...REPLICATE_OPENAI_IMAGE_MODELS],
      },
      // OpenAI's `output_compression` — % quality for jpeg / webp
      // outputs. Ignored for png. Defaults to 100 (lossless / max).
      // Surfacing it as a coarse low/med/high select keeps the
      // toolbar short; users that need a precise number can edit
      // their prompt instead of fiddling with a slider.
      {
        key: "output_compression",
        label: "Compression",
        type: "select",
        options: ["100", "85", "70"],
        optionLabels: {
          "100": "Compression: Max (100)",
          "85": "Compression: Med (85)",
          "70": "Compression: Low (70)",
        },
        default: "100",
        supportedModels: [...OPENAI_IMAGE_MODELS, ...REPLICATE_OPENAI_IMAGE_MODELS],
        // Hide for PNG (lossless — no compression knob).
        visibleWhen: { output_format: "jpeg" },
      },
      // Transparent backgrounds work only on png / webp output.
      {
        key: "background",
        label: "Background",
        type: "select",
        options: ["auto", "transparent", "opaque"],
        optionLabels: {
          auto: "Auto BG",
          transparent: "Transparent BG",
          opaque: "Opaque BG",
        },
        default: "auto",
        supportedModels: [...OPENAI_IMAGE_MODELS, ...REPLICATE_OPENAI_IMAGE_MODELS],
      },
      {
        key: "moderation",
        label: "Moderation",
        type: "select",
        options: ["auto", "low"],
        optionLabels: {
          auto: "Moderation: Auto",
          low: "Moderation: Low (less strict)",
        },
        default: "auto",
        supportedModels: [...OPENAI_IMAGE_MODELS, ...REPLICATE_OPENAI_IMAGE_MODELS],
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
    ],
  },

  chatAiNode: {
    displayName: "Chat AI",
    category: "AI PROCESS",
    accentColor: "sky",
    supportedModels: ["google/gemini-3-pro-preview", "google/gemini-3-flash-preview"],
    defaultModel: "google/gemini-3-pro-preview",
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
        options: ["google/gemini-3-pro-preview", "google/gemini-3-flash-preview"],
        optionLabels: {
          "google/gemini-3-pro-preview": "Gemini 3 Pro Preview",
          "google/gemini-3-flash-preview": "Gemini 3 Flash Preview",
        },
        default: "google/gemini-3-pro-preview",
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
   * Unified Video Generation — Kling family + SeedDance family +
   * Google Veo 3.1. Provider-specific features (multi-shot,
   * ref_image/ref_video, personGeneration) are gated by
   * `supportedModels`, so they naturally disable when an unrelated
   * model is picked.
   */
  videoGenNode: {
    displayName: "Video Generation",
    category: "AI PROCESS",
    accentColor: "violet",
    supportedModels: [
      ...KLING_MODELS.map((m) => m.value),
      ...SEEDANCE_MODELS,
      ...REPLICATE_SEEDANCE_MODELS,
      ...VEO_MODELS,
      ...REPLICATE_VEO_MODELS,
      ...REPLICATE_KLING_MODELS,
    ],
    defaultModel: "kling-v2-6-pro",
    inputs: [
      { id: "text", label: "text (prompt)", color: "sky" },
      {
        id: "start_frame",
        label: "start_frame",
        color: "blue",
        // Required for Kling/Seedance image-to-video; OPTIONAL for Veo
        // (Veo also supports text-to-video). The required flag is
        // honoured per-model by the canvas validator.
        required: true,
        supportedModels: [
          "kling-v2-6-pro", "kling-v2-6-motion-pro",
          "kling-v3-pro", "kling-v3-motion-pro", "kling-v3-omni",
          ...SEEDANCE_MODELS,
          ...REPLICATE_KLING_FRAME_MODELS,
        ],
      },
      {
        id: "start_frame",
        label: "start_frame",
        color: "blue",
        supportedModels: [...VEO_MODELS, ...REPLICATE_VEO_MODELS, ...REPLICATE_SEEDANCE_MODELS],
      },
      {
        id: "end_frame",
        label: "end_frame",
        color: "white/30",
        supportedModels: [
          "kling-v2-6-pro", "kling-v3-pro", "kling-v3-omni",
          ...SEEDANCE_MODELS,
          ...REPLICATE_SEEDANCE_MODELS,
          ...VEO_MODELS,
          ...REPLICATE_VEO_MODELS,
          ...REPLICATE_KLING_FRAME_MODELS,
        ],
      },
      {
        id: "ref_image",
        label: "ref_image",
        color: "cyan",
        supportedModels: ["kling-v3-omni"],
        maxConnections: 7,
      },
      {
        id: "reference_image",
        label: "reference_image",
        color: "cyan",
        supportedModels: [...SEEDANCE_VIDEO_REF_MODELS, ...REPLICATE_SEEDANCE_REF_MODELS],
        // Seedance 2.0 reference-image mode accepts 1-9 refs.
        maxConnections: 9,
      },
      {
        id: "ref_video",
        label: "ref_video",
        color: "rose",
        supportedModels: [
          "kling-v2-6-motion-pro",
          "kling-v3-motion-pro",
          ...REPLICATE_KLING_MOTION_MODELS,
          "kling-v3-omni",
        ],
      },
      {
        id: "ref_video",
        label: "ref_video",
        color: "rose",
        supportedModels: [...SEEDANCE_VIDEO_REF_MODELS, ...REPLICATE_SEEDANCE_REF_MODELS],
        maxConnections: 3,
      },
      {
        id: "ref_audio",
        label: "ref_audio",
        color: "amber",
        supportedModels: [...SEEDANCE_VIDEO_REF_MODELS, ...REPLICATE_SEEDANCE_REF_MODELS],
        maxConnections: 3,
      },
      {
        id: "elements",
        label: "elements",
        color: "rose",
        supportedModels: ["kling-v3-pro", "kling-v3-omni", ...REPLICATE_KLING_FRAME_MODELS],
        maxConnections: 4, // Kling VIDEO 3.0 / Omni support element refs
      },
      {
        id: "elements",
        label: "elements",
        color: "rose",
        supportedModels: ["kling-v3-motion-pro", ...REPLICATE_KLING_MOTION_MODELS],
        maxConnections: 1,
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
          ...VEO_MODELS,
          ...REPLICATE_VEO_MODELS,
          ...REPLICATE_KLING_MODELS,
        ],
      },
      {
        id: "output_end_frame",
        label: "End Frame",
        color: "amber",
        supportedModels: [
          "kling-v2-6-pro", "kling-v2-6-motion-pro",
          "kling-v3-pro", "kling-v3-motion-pro", "kling-v3-omni",
          ...REPLICATE_VEO_MODELS,
          ...REPLICATE_KLING_FRAME_MODELS,
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
          ...REPLICATE_SEEDANCE_MODELS,
          ...VEO_MODELS,
          ...REPLICATE_KLING_MODELS,
        ],
        optionLabels: {
          ...KLING_LABELS,
          "seedance-1-5-pro-251215": "SeedDance 1.5 Pro",
          "seedance-2-0-lite": "SeedDance 2.0 Fast",
          "seedance-2-0-pro": "SeedDance 2.0",
          "veo-3.1-generate-001": "Google Veo 3.1",
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
        supportedModels: [...KLING_MODELS.map((m) => m.value), ...REPLICATE_KLING_MODELS],
      },
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: ["Auto", "16:9", "9:16", "1:1"],
        default: "Auto",
        supportedModels: [
          "kling-v2-6-pro",
          "kling-v3-pro",
          "kling-v3-omni",
          ...REPLICATE_KLING_FRAME_MODELS,
        ],
      },
      {
        key: "ratio",
        label: "Aspect Ratio",
        type: "select",
        options: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"],
        default: "16:9",
        supportedModels: [...SEEDANCE_MODELS],
      },
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "9:21", "adaptive"],
        default: "16:9",
        supportedModels: [...REPLICATE_SEEDANCE_MODELS],
      },
      {
        // Veo 3.1 only accepts "16:9" or "9:16" — see real spec.
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: ["16:9", "9:16"],
        default: "16:9",
        supportedModels: [...VEO_MODELS, ...REPLICATE_VEO_MODELS],
      },
      {
        key: "resolution",
        label: "Resolution",
        type: "select",
        options: ["480p", "720p", "1080p"],
        default: "720p",
        supportedModels: [...SEEDANCE_1080P_MODELS],
      },
      {
        key: "resolution",
        label: "Resolution",
        type: "select",
        options: ["480p", "720p"],
        default: "720p",
        supportedModels: [...SEEDANCE_720P_MAX_MODELS],
      },
      {
        key: "resolution",
        label: "Resolution",
        type: "select",
        options: ["480p", "720p", "1080p"],
        default: "720p",
        supportedModels: [...REPLICATE_SEEDANCE_MODELS],
      },
      {
        key: "resolution",
        label: "Resolution",
        type: "select",
        options: ["720p", "1080p"],
        default: "1080p",
        supportedModels: [
          ...KLING_V3_DIRECT_RESOLUTION_MODELS,
          ...KLING_V3_DIRECT_MOTION_RESOLUTION_MODELS,
          ...REPLICATE_KLING_MOTION_MODELS,
        ],
      },
      {
        key: "resolution",
        label: "Resolution",
        type: "select",
        options: ["720p", "1080p", "4K"],
        default: "1080p",
        supportedModels: [...REPLICATE_KLING_FRAME_MODELS],
      },
      {
        // Veo 3.1 supports 720p / 1080p (4k is gated). Picking 1080p
        // forces durationSeconds=8 server-side per Google's docs.
        key: "resolution",
        label: "Resolution",
        type: "select",
        options: ["720p", "1080p"],
        default: "720p",
        supportedModels: [...VEO_MODELS, ...REPLICATE_VEO_MODELS],
      },
      {
        key: "duration",
        label: "Duration (s)",
        type: "dynamic",
        // Per-model valid duration ranges. BytePlus / Kling / Veo
        // reject anything outside these and the user's only feedback
        // is a 400 InvalidParameter mid-gen — so the UI has to gate
        // the values, not just hint them.
        //
        //   Seedance 1.5 Pro            → discrete [4..12]
        //   Seedance 2.0 (Lite / Pro)   → 4-15s slider
        //   Kling v3 Omni / v3 Pro      → 3-15s slider
        //   Veo 3.1                     → discrete [4, 6, 8]
        //                                 (1080p forces 8 server-side)
        //   everything else (legacy)    → discrete [5, 10]
        //
        // Order matters: more specific prefixes (`seedance-1-5-`,
        // `seedance-2-0-`) must be tested before the generic
        // `seedance-` fallback or 1.5 Pro would get the wrong range.
        dynamicType: (model: string) => {
          const isV3 =
            model === "kling-v3-omni" ||
            model === "kling-v3-pro" ||
            model === "replicate-kling-v3-omni" ||
            model === "replicate-kling-v3-pro";
          if (isV3)
            return { type: "slider" as const, min: 3, max: 15, step: 1, default: 5 };

          if (model.startsWith("replicate-seedance"))
            return {
              type: "select" as const,
              options: ["-1", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
              optionLabels: { "-1": "Auto" },
              default: "5",
            };

          // Veo 3.1 — only 4, 6, or 8 seconds are valid per Google's
          // generateVideos spec.
          if (model.startsWith("veo-") || model.startsWith("replicate-veo"))
            return {
              type: "select" as const,
              options: ["4", "6", "8"],
              default: "8",
            };

          // Seedance 2.0 — Lite + Pro share the same window. Direct
          // BytePlus IDs (`dreamina-seedance-*`) get the same treatment
          // for the canvas-driven custom-endpoint path.
          if (
            model.startsWith("seedance-2-0") ||
            model.startsWith("dreamina-seedance")
          )
            return { type: "slider" as const, min: 4, max: 15, step: 1, default: 5 };

          // Seedance 1.5 Pro — discrete list, not a continuous range.
          if (model.startsWith("seedance-1-5"))
            return {
              type: "select" as const,
              options: ["4", "5", "6", "7", "8", "9", "10", "11", "12"],
              default: "5",
            };

          // Generic fallback (legacy Kling, unknown providers).
          return { type: "select" as const, options: ["5", "10"], default: "5" };
        },
        options: ["5", "10"],
        default: "5",
        supportedModels: [
          "kling-v2-6-pro", "kling-v3-pro", "kling-v3-omni",
          ...SEEDANCE_MODELS,
          ...REPLICATE_SEEDANCE_MODELS,
          ...VEO_MODELS,
          ...REPLICATE_VEO_MODELS,
          ...REPLICATE_KLING_FRAME_MODELS,
        ],
      },
      {
        // Veo 3.1 — controls whether people may appear in the output.
        // "allow_adult" is the safer default; "allow_all" permits
        // children's faces (subject to Google's content policy).
        key: "person_generation",
        label: "People in output",
        type: "select",
        options: ["allow_adult", "allow_all"],
        optionLabels: {
          allow_adult: "Adults only",
          allow_all: "Allow children too",
        },
        default: "allow_adult",
        supportedModels: [...VEO_MODELS, ...REPLICATE_VEO_MODELS],
      },
      {
        key: "has_audio",
        label: "Enable Audio",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "No Audio", "true": "With Audio" },
        default: "false",
        supportedModels: [
          "kling-v2-6-pro",
          "kling-v3-pro",
          "kling-v3-omni",
          ...REPLICATE_KLING_FRAME_MODELS,
        ],
      },
      {
        key: "generate_audio",
        label: "Generate Audio",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "No Audio", "true": "With Audio" },
        default: "false",
        supportedModels: [...SEEDANCE_AUDIO_MODELS],
      },
      {
        key: "generate_audio",
        label: "Generate Audio",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "No Audio", "true": "With Audio" },
        default: "false",
        supportedModels: [...REPLICATE_SEEDANCE_MODELS, ...REPLICATE_VEO_MODELS, ...REPLICATE_KLING_FRAME_MODELS],
      },
      {
        key: "seed",
        label: "Seed",
        type: "text",
        default: "",
        placeholder: "Optional integer seed",
        supportedModels: [...REPLICATE_SEEDANCE_MODELS],
      },
      {
        key: "character_orientation",
        label: "Character Orientation",
        type: "select",
        options: ["image", "video"],
        optionLabels: { "image": "Follow Image", "video": "Follow Video" },
        default: "video",
        supportedModels: ["kling-v2-6-motion-pro", "kling-v3-motion-pro", ...REPLICATE_KLING_MOTION_MODELS],
      },
      {
        key: "keep_original_sound",
        label: "Keep Original Sound",
        type: "select",
        options: ["no", "yes"],
        optionLabels: { "no": "No", "yes": "Yes" },
        default: "no",
        supportedModels: [
          "kling-v2-6-motion-pro",
          "kling-v3-motion-pro",
          "kling-v3-omni",
          ...REPLICATE_KLING_MOTION_MODELS,
        ],
      },
      {
        key: "multi_shot",
        label: "Multi-Shot Mode",
        type: "select",
        options: ["false", "true"],
        optionLabels: { "false": "Off", "true": "Director Mode" },
        default: "false",
        supportedModels: ["kling-v3-pro", "kling-v3-omni", ...REPLICATE_KLING_FRAME_MODELS],
      },
      {
        key: "multi_prompt",
        label: "Shot List (JSON)",
        type: "json",
        default: "",
        placeholder: '[{"prompt":"Scene 1…","duration":3}]',
        supportedModels: ["kling-v3-pro", "kling-v3-omni", ...REPLICATE_KLING_FRAME_MODELS],
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
    supportedModels: ["gemini-3-pro-preview", "gemini-3-flash-preview"],
    defaultModel: "gemini-3-pro-preview",
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
        options: ["gemini-3-pro-preview", "gemini-3-flash-preview"],
        optionLabels: {
          "gemini-3-pro-preview": "Gemini 3 Pro",
          "gemini-3-flash-preview": "Gemini 3 Flash",
        },
        default: "gemini-3-pro-preview",
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
   * Audio Generator (Gemini TTS).
   *
   * Wraps the production TTS providers and writes a script. Voice ids
   * are intentionally not exposed in the current UI; the backend uses
   * the provider default voice for each model. Output is a single MP3 /
   * WAV asset suitable for downstream Merge A/V nodes or a direct download.
   *
   * Param notes:
   *   - `model_name` defaults to gemini-2.5-flash-preview-tts.
   *     Gemini 2.5 Pro remains available for higher quality.
   *   - `style_prompt` is an OPTIONAL per-clip directive that
   *     Gemini's TTS supports — it lets the user say things like
   *     "Read this with a calm, gentle tone" without needing to
   *     change the underlying voice.
   */
  audioGenNode: {
    displayName: "Audio Generation",
    category: "AI PROCESS",
    accentColor: "amber",
    // Three providers behind one node, all top-tier only. The
    // dispatcher in workspace-run-node routes:
    //   model_name = elevenlabs-*    → executeElevenLabsTts
    //   model_name = gemini-2.5-pro-* → executeGeminiTts
    //   model_name = google-tts-studio → executeGoogleTts
    //
    // Model audit (2026-04):
    //   • Dropped ElevenLabs Flash v2.5 — Turbo v2.5 covers the same
    //     fast-tier use case at higher quality.
    //   • Dropped Gemini 2.5 Flash TTS — Pro TTS supersedes it for
    //     production-grade output; Flash was preview-tier scratch.
    //   • Dropped Google Standard / WaveNet for English — Studio +
    //     Neural2 are the only voices worth shipping. Thai is the
    //     exception (Google hasn't released Studio Thai yet) so the
    //     Thai catalog still includes Standard / WaveNet voices for
    //     coverage.
    supportedModels: [
      ...ELEVENLABS_TTS_MODELS,
      ...GEMINI_TTS_MODELS,
      ...GOOGLE_TTS_MODELS,
    ],
    defaultModel: "gemini-3.1-flash-tts-preview",
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
          ...ELEVENLABS_TTS_MODELS,
          ...GEMINI_TTS_MODELS,
          ...GOOGLE_TTS_MODELS,
        ],
        optionLabels: {
          "elevenlabs-multilingual-v2": "ElevenLabs v2 — Multilingual",
          "elevenlabs-turbo-v2-5":      "ElevenLabs Turbo v2.5",
          "gemini-3.1-flash-tts-preview": "Gemini 3.1 Flash Preview TTS",
          "gemini-2.5-pro-preview-tts": "Gemini 2.5 ProTTS",
          "google-tts-studio":          "Google Cloud TTS — Studio",
        },
        default: "gemini-3.1-flash-tts-preview",
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
      {
        key: "voice_style",
        label: "Style",
        type: "select",
        options: ["expressive", "neutral", "consistent"],
        optionLabels: {
          expressive: "Expressive",
          neutral: "Neutral",
          consistent: "Consistent",
        },
        default: "neutral",
        supportedModels: [...ELEVENLABS_TTS_MODELS],
      },
      {
        // Gemini 3.1 Flash TTS / 2.5 Pro TTS share the same 30 preset
        // speaker catalogue. Picking one sends `prebuiltVoiceConfig`
        // with that voiceName in the speechConfig — see backend
        // `executeGeminiTts`. Default `Kore` matches the backend
        // fallback when the param is empty.
        key: "voice",
        label: "Voice",
        type: "select",
        options: [...GEMINI_TTS_VOICES],
        default: DEFAULT_GEMINI_TTS_VOICE,
        supportedModels: [...GEMINI_TTS_MODELS],
      },
      {
        key: "speed",
        label: "Speed",
        type: "slider",
        min: 0.7,
        max: 1.2,
        step: 0.05,
        default: 1,
        supportedModels: [...ELEVENLABS_TTS_MODELS],
      },
      {
        key: "stability",
        label: "Stability",
        type: "slider",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.55,
        supportedModels: [...ELEVENLABS_TTS_MODELS],
      },
      {
        key: "similarity_boost",
        label: "Similarity",
        type: "slider",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.75,
        supportedModels: [...ELEVENLABS_TTS_MODELS],
      },
      {
        key: "style",
        label: "Style amount",
        type: "slider",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.3,
        supportedModels: [...ELEVENLABS_TTS_MODELS],
      },
      {
        key: "use_speaker_boost",
        label: "Boost",
        type: "select",
        options: ["false", "true"],
        optionLabels: { false: "Off", true: "On" },
        default: "true",
        supportedModels: [...ELEVENLABS_TTS_MODELS],
      },
      {
        key: "speaking_rate",
        label: "Rate",
        type: "slider",
        min: 0.25,
        max: 2,
        step: 0.05,
        default: 1,
        supportedModels: [...GOOGLE_TTS_MODELS],
      },
      {
        key: "pitch",
        label: "Pitch",
        type: "slider",
        min: -20,
        max: 20,
        step: 1,
        default: 0,
        supportedModels: [...GOOGLE_TTS_MODELS],
      },
      {
        key: "volume_gain_db",
        label: "Volume",
        type: "slider",
        min: -96,
        max: 16,
        step: 1,
        default: 0,
        supportedModels: [...GOOGLE_TTS_MODELS],
      },
    ],
  },

  voiceTranslateNode: {
    displayName: "Dubbing",
    category: "AI PROCESS",
    accentColor: "sky",
    supportedModels: [ELEVENLABS_DUBBING_MODEL],
    defaultModel: ELEVENLABS_DUBBING_MODEL,
    inputs: [
      {
        id: "media",
        label: "MP3 / MP4",
        color: "amber",
        required: true,
        maxConnections: 1,
      },
    ],
    outputs: [{ id: "output_media", label: "MEDIA", color: "amber" }],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: [ELEVENLABS_DUBBING_MODEL],
        optionLabels: {
          [ELEVENLABS_DUBBING_MODEL]: "ElevenLabs Dubbing",
        },
        default: ELEVENLABS_DUBBING_MODEL,
        required: true,
      },
      {
        key: "source_language",
        label: "Source",
        type: "select",
        options: [...ELEVENLABS_DUBBING_SOURCE_LANGUAGES],
        optionLabels: {
          Auto: "Auto detect",
        },
        default: "Auto",
      },
      {
        key: "output_language",
        label: "Target",
        type: "select",
        options: [...ELEVENLABS_DUBBING_LANGUAGES],
        default: "English",
        required: true,
      },
      {
        key: "speaker_num",
        label: "Speakers",
        type: "select",
        options: ["1", "2", "3"],
        default: "1",
      },
      {
        key: "consent",
        label: "Permission",
        type: "select",
        options: ["false", "true"],
        optionLabels: {
          false: "Permission needed",
          true: "Permission confirmed",
        },
        default: "false",
        required: true,
      },
    ],
  },

  urlAssetNode: {
    displayName: "URL to Asset",
    category: "AI PROCESS",
    accentColor: "zinc",
    supportedModels: [...URL_ASSET_MODELS],
    defaultModel: "url-to-mp4",
    inputs: [],
    outputs: [
      { id: "image", label: "PNG", color: "emerald", supportedModels: ["url-to-png"] },
      { id: "audio", label: "MP3", color: "amber", supportedModels: ["url-to-mp3"] },
      { id: "output_video", label: "MP4", color: "violet", supportedModels: ["url-to-mp4"] },
    ],
    params: [
      {
        key: "model_name",
        label: "Output",
        type: "select",
        options: [...URL_ASSET_MODELS],
        optionLabels: {
          "url-to-png": "PNG",
          "url-to-mp3": "MP3",
          "url-to-mp4": "MP4",
        },
        default: "url-to-mp4",
        required: true,
      },
      {
        key: "source_url",
        label: "Source URL",
        type: "text",
        default: "",
        placeholder: "Direct media URL or YouTube / Instagram / Facebook link",
        required: false,
      },
      {
        key: "file_name",
        label: "File name",
        type: "text",
        default: "",
        placeholder: "Optional asset name",
      },
    ],
  },

  upscaleImageNode: {
    displayName: "Upscale Mediaforge",
    category: "AI PROCESS",
    accentColor: "cyan",
    supportedModels: [...UPSCALE_MODELS],
    defaultModel: "gpt-image-2-enhance",
    inputs: [
      {
        id: "image",
        label: "image",
        color: "emerald",
        required: false,
        maxConnections: 1,
        supportedModels: [...UPSCALE_MODELS],
      },
    ],
    outputs: [
      { id: "image", label: "IMAGE", color: "emerald" },
    ],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: [...UPSCALE_MODELS],
        optionLabels: {
          "gpt-image-2-enhance": "Upscale Mediaforge",
        },
        default: "gpt-image-2-enhance",
        required: true,
      },
      {
        key: "size",
        label: "Resolution",
        type: "select",
        options: ["1024x1024", "2048x2048", "3840x2160"],
        optionLabels: {
          "1024x1024": "1K",
          "2048x2048": "2K",
          "3840x2160": "4K",
        },
        default: "1024x1024",
        supportedModels: [...OPENAI_UPSCALE_MODELS],
      },
      {
        key: "quality",
        label: "Quality",
        type: "select",
        options: ["low", "medium", "high"],
        optionLabels: {
          low: "Low",
          medium: "Medium",
          high: "High",
        },
        default: "medium",
        supportedModels: [...OPENAI_UPSCALE_MODELS],
      },
    ],
  },

  imageTo3dNode: {
    displayName: "Image to 3D",
    category: "AI PROCESS",
    accentColor: "amber",
    // Tripo + Hyper3D share the same 3D-from-image surface. The
    // backend dispatcher (`getProviderForNodeType` in
    // workspace-run-node) routes by model prefix:
    //   tripo3d-* → executeTripo3D
    //   hyper3d-* → executeHyper3D
    supportedModels: [
      "tripo3d-p1",
      "tripo3d-v3.1",
      "tripo3d-v3.0",
      "tripo3d-v2.5",
      "hyper3d-gen2-260112",
    ],
    defaultModel: "tripo3d-v3.1",
    inputs: [
      {
        id: "image",
        label: "image",
        color: "emerald",
        required: true,
        maxConnections: 4,
        supportedModels: [...TRIPO_MULTIVIEW_3D_MODELS],
      },
      {
        id: "image",
        label: "image",
        color: "emerald",
        required: true,
        maxConnections: 1,
        supportedModels: [...SINGLE_IMAGE_3D_MODELS],
      },
    ],
    // 3D results can feed Tripo rig / animate / export nodes.
    outputs: [{ id: "model3d", label: "3D", color: "amber" }],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: [
          "tripo3d-p1",
          "tripo3d-v3.1",
          "tripo3d-v3.0",
          "tripo3d-v2.5",
          "hyper3d-gen2-260112",
        ],
        optionLabels: {
          "tripo3d-p1":          "Tripo P1",
          "tripo3d-v3.1":        "Tripo v3.1",
          "tripo3d-v3.0":        "Tripo v3.0",
          "tripo3d-v2.5":        "Tripo v2.5",
          "hyper3d-gen2-260112": "Hyper3D Gen 2",
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

  tripoPreRigCheckNode: {
    displayName: "Tripo Rig Check",
    category: "AI PROCESS",
    accentColor: "amber",
    supportedModels: ["tripo3d-prerigcheck"],
    defaultModel: "tripo3d-prerigcheck",
    inputs: [
      { id: "model3d", label: "3D", color: "amber", required: true },
    ],
    outputs: [{ id: "model3d", label: "ready 3D", color: "amber" }],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: ["tripo3d-prerigcheck"],
        optionLabels: { "tripo3d-prerigcheck": "Tripo Pre-Rig Check" },
        default: "tripo3d-prerigcheck",
        required: true,
      },
    ],
  },

  tripoImportModelNode: {
    displayName: "Tripo Import Model",
    category: "AI PROCESS",
    accentColor: "amber",
    supportedModels: ["tripo3d-import"],
    defaultModel: "tripo3d-import",
    inputs: [
      { id: "model3d", label: "3D", color: "amber", required: true },
    ],
    outputs: [{ id: "model3d", label: "Tripo 3D", color: "amber" }],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: ["tripo3d-import"],
        optionLabels: { "tripo3d-import": "Tripo Import Model" },
        default: "tripo3d-import",
        required: true,
      },
    ],
  },

  tripoRigNode: {
    displayName: "Tripo Auto Rig",
    category: "AI PROCESS",
    accentColor: "amber",
    supportedModels: ["tripo3d-rig"],
    defaultModel: "tripo3d-rig",
    inputs: [
      { id: "model3d", label: "3D", color: "amber", required: true },
    ],
    outputs: [{ id: "model3d", label: "rigged 3D", color: "amber" }],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: ["tripo3d-rig"],
        optionLabels: { "tripo3d-rig": "Tripo Auto Rig" },
        default: "tripo3d-rig",
        required: true,
      },
      {
        key: "rig_type",
        label: "Rig Type",
        type: "select",
        options: ["biped", "quadruped", "hexapod", "octopod", "avian", "serpentine", "aquatic"],
        optionLabels: {
          biped: "Biped",
          quadruped: "Quadruped",
          hexapod: "Hexapod",
          octopod: "Octopod",
          avian: "Avian",
          serpentine: "Serpentine",
          aquatic: "Aquatic",
        },
        default: "biped",
      },
      {
        key: "out_format",
        label: "Output",
        type: "select",
        options: ["glb", "fbx"],
        optionLabels: { glb: "GLB", fbx: "FBX" },
        default: "glb",
      },
    ],
  },

  tripoAnimateNode: {
    displayName: "Tripo Animate",
    category: "AI PROCESS",
    accentColor: "amber",
    supportedModels: ["tripo3d-retarget"],
    defaultModel: "tripo3d-retarget",
    inputs: [
      { id: "model3d", label: "rigged 3D", color: "amber", required: true },
    ],
    outputs: [{ id: "model3d", label: "animated 3D", color: "amber" }],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: ["tripo3d-retarget"],
        optionLabels: { "tripo3d-retarget": "Tripo Animate" },
        default: "tripo3d-retarget",
        required: true,
      },
      {
        key: "animation",
        label: "Animation",
        type: "select",
        options: [
          "preset:idle",
          "preset:walk",
          "preset:run",
          "preset:jump",
          "preset:quadruped:walk",
        ],
        optionLabels: {
          "preset:idle": "Idle",
          "preset:walk": "Walk",
          "preset:run": "Run",
          "preset:jump": "Jump",
          "preset:quadruped:walk": "Quadruped Walk",
        },
        default: "preset:walk",
      },
      {
        key: "out_format",
        label: "Output",
        type: "select",
        options: ["glb", "fbx"],
        optionLabels: { glb: "GLB", fbx: "FBX" },
        default: "glb",
      },
    ],
  },

  tripoExportNode: {
    displayName: "Tripo Export",
    category: "AI PROCESS",
    accentColor: "amber",
    supportedModels: ["tripo3d-conversion"],
    defaultModel: "tripo3d-conversion",
    inputs: [
      { id: "model3d", label: "3D", color: "amber", required: true },
    ],
    outputs: [{ id: "model3d", label: "export", color: "amber" }],
    params: [
      {
        key: "model_name",
        label: "Model",
        type: "select",
        options: ["tripo3d-conversion"],
        optionLabels: { "tripo3d-conversion": "Tripo Export" },
        default: "tripo3d-conversion",
        required: true,
      },
      {
        key: "format",
        label: "Format",
        type: "select",
        options: ["glb", "fbx", "obj", "stl", "usdz"],
        optionLabels: { glb: "GLB", fbx: "FBX", obj: "OBJ", stl: "STL", usdz: "USDZ" },
        default: "glb",
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
export type WirePortType = "text" | "image" | "video" | "audio" | "media" | "element" | "model3d";

export const TEXT_NODE_IMAGE_OUTPUT_HANDLE_PREFIX = "image_ref:";
export const TEXT_NODE_VIDEO_OUTPUT_HANDLE_PREFIX = "video_ref:";

export function isTextNodeImageOutputHandle(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(TEXT_NODE_IMAGE_OUTPUT_HANDLE_PREFIX);
}

export function isTextNodeVideoOutputHandle(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(TEXT_NODE_VIDEO_OUTPUT_HANDLE_PREFIX);
}

export function textNodeImageOutputHandle(nodeId: string): string {
  return `${TEXT_NODE_IMAGE_OUTPUT_HANDLE_PREFIX}${nodeId}`;
}

export function textNodeVideoOutputHandle(nodeId: string): string {
  return `${TEXT_NODE_VIDEO_OUTPUT_HANDLE_PREFIX}${nodeId}`;
}

export function textNodeImageOutputNodeId(id: string | null | undefined): string | null {
  if (!isTextNodeImageOutputHandle(id)) return null;
  return String(id).slice(TEXT_NODE_IMAGE_OUTPUT_HANDLE_PREFIX.length) || null;
}

export function textNodeVideoOutputNodeId(id: string | null | undefined): string | null {
  if (!isTextNodeVideoOutputHandle(id)) return null;
  return String(id).slice(TEXT_NODE_VIDEO_OUTPUT_HANDLE_PREFIX.length) || null;
}

export type VideoFrameImageOutputHandle =
  | "output_start_frame"
  | "output_end_frame"
  | "output_last_frame";

export const VIDEO_FRAME_IMAGE_OUTPUT_HANDLES = new Set<VideoFrameImageOutputHandle>([
  "output_start_frame",
  "output_end_frame",
  "output_last_frame",
]);

export function isVideoFrameImageOutputHandle(
  id: string | null | undefined,
): id is VideoFrameImageOutputHandle {
  return typeof id === "string" && VIDEO_FRAME_IMAGE_OUTPUT_HANDLES.has(id as VideoFrameImageOutputHandle);
}

/**
 * Does any node on the canvas reference `nodeId` via an
 * `@[Label](nodeId)` mention chip in its prompt or text content?
 *
 * Used by video-source nodes (uploaded AssetNode, AI-gen Video Gen
 * node) to decide whether to eagerly capture start/end frames — a
 * mention in a downstream image-gen prompt needs the JPG even when
 * there is no direct wire from a frame port.
 */
export function isNodeMentionedAnywhere(
  nodeId: string,
  nodes: ReadonlyArray<{ data?: unknown }>,
): boolean {
  if (!nodeId) return false;
  const escaped = nodeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`@\\[[^\\]]+\\]\\(${escaped}\\)`);
  for (const n of nodes) {
    const d = (n.data ?? {}) as {
      content?: unknown;
      inputContent?: unknown;
      params?: { prompt?: unknown };
    };
    // Text node stores the "Result prompt" tab in `content` and the
    // "Prompt" tab raw input in `inputContent`. A mention chip in
    // either tab should be enough to trigger frame extraction — same
    // fallback as the wire path uses in resolveInputs.
    if (typeof d.content === "string" && re.test(d.content)) return true;
    if (typeof d.inputContent === "string" && re.test(d.inputContent)) return true;
    const prompt = d.params && typeof d.params.prompt === "string" ? d.params.prompt : "";
    if (prompt && re.test(prompt)) return true;
  }
  return false;
}

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
  "reference_image",
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
const MEDIA_HANDLE_IDS = new Set([
  "media",
  "output_media",
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
  if (isTextNodeImageOutputHandle(id)) return "image";
  if (isTextNodeVideoOutputHandle(id)) return "video";
  if (TEXT_HANDLE_IDS.has(id)) return "text";
  if (MEDIA_HANDLE_IDS.has(id)) return "media";
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
    const concrete = resolveParam(p, newModel);
    if (prev[p.key] === undefined) {
      if (concrete.default !== undefined) valid[p.key] = concrete.default;
      continue;
    }
    const carried = prev[p.key];
    // For finite-option params, drop the carried value if it isn't a
    // legal option under the new param def (cross-provider collision).
    if (
      concrete.type === "select" &&
      Array.isArray(concrete.options) &&
      !concrete.options.includes(String(carried))
    ) {
      valid[p.key] = concrete.default;
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

/* ── GPT Image 2 — Aspect Ratio + Resolution split (UI-only) ──
 *
 * OpenAI's gpt-image API takes a single `size` field (e.g. "1024x1024",
 * "1536x1024", "auto"). Cramming all 11 valid sizes into one selector is
 * confusing — Freepik's UI for the same model splits the choice into
 * two pills (Aspect Ratio + Resolution). We mirror that UX here:
 * the schema keeps a single backing `size` field, but the toolbar
 * renderer for gpt-image-2 shows TWO MiniSelects that compose into
 * the canonical `size` value before it ever leaves the client.
 *
 * Old nodes saved with a combined `size` like "1024x1280" still load:
 * `splitGptImageSize` parses any known value back into its (AR, res)
 * pair. Unknown values gracefully fall back to ("1:1", "1K") so the
 * pills always render something sane.
 */

/** All gpt-image-2 sizes the schema offers, decomposed into the two
 *  knobs that creators actually pick by (aspect ratio + resolution
 *  tier). Keep this in sync with the `size` param's `options` list
 *  in `imageGenNode`. */
export const GPT_IMAGE_2_SIZE_MATRIX: Array<{
  size: string;
  aspectRatio: string;
  resolution: string;
}> = [
  // Square
  { size: "1024x1024", aspectRatio: "1:1", resolution: "1K" },
  { size: "2048x2048", aspectRatio: "1:1", resolution: "2K" },
  // Landscape
  { size: "1536x1024", aspectRatio: "3:2", resolution: "1K" },
  { size: "1280x1024", aspectRatio: "5:4", resolution: "1K" },
  { size: "1280x720", aspectRatio: "16:9", resolution: "1K" },
  { size: "2048x1152", aspectRatio: "16:9", resolution: "2K" },
  { size: "3840x2160", aspectRatio: "16:9", resolution: "4K" },
  // Portrait / vertical
  { size: "1024x1536", aspectRatio: "2:3", resolution: "1K" },
  { size: "1024x1280", aspectRatio: "4:5", resolution: "1K" },
  { size: "1152x1536", aspectRatio: "3:4", resolution: "1K" },
  { size: "720x1280", aspectRatio: "9:16", resolution: "1K" },
  { size: "1152x2048", aspectRatio: "9:16", resolution: "2K" },
  { size: "2160x3840", aspectRatio: "9:16", resolution: "4K" },
  // Auto — represented as a single "Auto" pair.
  { size: "auto", aspectRatio: "Auto", resolution: "Auto" },
];

/** All distinct aspect ratios in the matrix, in display order. */
export const GPT_IMAGE_2_ASPECT_RATIOS: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of GPT_IMAGE_2_SIZE_MATRIX) {
    if (!seen.has(e.aspectRatio)) {
      seen.add(e.aspectRatio);
      out.push(e.aspectRatio);
    }
  }
  return out;
})();

/** Resolutions available for a given aspect ratio (a few ARs only have
 *  one tier). When the user switches AR, the resolution pill auto-
 *  filters to the legal options for the new AR. */
export function gptImage2ResolutionsFor(aspectRatio: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of GPT_IMAGE_2_SIZE_MATRIX) {
    if (e.aspectRatio !== aspectRatio) continue;
    if (!seen.has(e.resolution)) {
      seen.add(e.resolution);
      out.push(e.resolution);
    }
  }
  return out;
}

/** Parse a stored `size` (combined "WIDTHxHEIGHT" or "auto") back into
 *  the (aspect ratio, resolution) pair the UI uses. Unknown values
 *  gracefully fall back to ("1:1", "1K") — that's the schema's default
 *  pair, so a node that was somehow saved with a junk size won't break
 *  the renderer. */
export function splitGptImageSize(size: string): {
  aspectRatio: string;
  resolution: string;
} {
  const found = GPT_IMAGE_2_SIZE_MATRIX.find((e) => e.size === size);
  if (found) return { aspectRatio: found.aspectRatio, resolution: found.resolution };
  if (size === "2880x2880") return { aspectRatio: "1:1", resolution: "2K" };
  if (size === "2816x1584") return { aspectRatio: "16:9", resolution: "4K" };
  if (size === "1584x2816") return { aspectRatio: "9:16", resolution: "4K" };
  return { aspectRatio: "1:1", resolution: "1K" };
}

/** Compose an (aspect ratio, resolution) pair back into the canonical
 *  `size` string that gets sent to OpenAI. If the requested combo
 *  doesn't exist (e.g. user switches AR to "5:4" and the previously-
 *  selected tier "4K" isn't available for that AR), pick the first
 *  available resolution for that AR. */
export function composeGptImageSize(aspectRatio: string, resolution: string): string {
  const exact = GPT_IMAGE_2_SIZE_MATRIX.find(
    (e) => e.aspectRatio === aspectRatio && e.resolution === resolution,
  );
  if (exact) return exact.size;
  // Resolution wasn't legal for this AR — pick the first tier we have.
  const fallback = GPT_IMAGE_2_SIZE_MATRIX.find((e) => e.aspectRatio === aspectRatio);
  return fallback?.size ?? "1024x1024";
}
