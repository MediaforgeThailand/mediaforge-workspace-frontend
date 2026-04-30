import {
  Box,
  Film,
  Image as ImageIcon,
  Mic2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  composeGptImageSize,
  GPT_IMAGE_2_ASPECT_RATIOS,
  gptImage2ResolutionsFor,
} from "./workspaceSchema";

export type StandaloneToolKey =
  | "image_gen"
  | "video_gen"
  | "voice_gen"
  | "image_to_3d";

export type GenerationOutputType = "image" | "video" | "audio" | "text" | "model_3d";

export interface StandaloneModelOption {
  id: string;
  label: string;
  provider: string;
  description: string;
  badge?: string;
}

export interface StandaloneStylePreset {
  id: string;
  label: string;
  description: string;
  promptPrefix: string;
  promptSuffix: string;
  preview: string;
  chip: string;
}

export interface StandaloneToolDefinition {
  key: StandaloneToolKey;
  title: string;
  subtitle: string;
  navLabel: string;
  nodeType: "imageGenNode" | "videoGenNode" | "audioGenNode" | "imageTo3dNode";
  icon: LucideIcon;
  outputType: GenerationOutputType;
  accent: string;
  models: StandaloneModelOption[];
  defaultModel: string;
}

export const IMAGE_STYLE_PRESETS: StandaloneStylePreset[] = [
  {
    id: "none",
    label: "No style",
    description: "Use my prompt as written",
    promptPrefix: "",
    promptSuffix: "",
    preview:
      "linear-gradient(135deg, hsl(220 9% 23%), hsl(220 9% 9%))",
    chip: "Base",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    description: "Film still, controlled light, depth",
    promptPrefix: "Cinematic film still, ",
    promptSuffix:
      ", dramatic lighting, natural depth of field, 35mm lens, high production value",
    preview:
      "linear-gradient(135deg, hsl(32 88% 51%), hsl(222 54% 19%) 48%, hsl(260 40% 9%))",
    chip: "Film",
  },
  {
    id: "product",
    label: "Product",
    description: "Clean commercial product shot",
    promptPrefix: "Premium commercial product photography of ",
    promptSuffix:
      ", clean studio background, crisp detail, softbox lighting, realistic shadows",
    preview:
      "linear-gradient(135deg, hsl(195 72% 50%), hsl(170 64% 29%) 48%, hsl(35 82% 53%))",
    chip: "Studio",
  },
  {
    id: "editorial",
    label: "Editorial",
    description: "Magazine-ready composition",
    promptPrefix: "Editorial magazine image, ",
    promptSuffix:
      ", confident composition, premium color grading, realistic texture, polished art direction",
    preview:
      "linear-gradient(135deg, hsl(345 79% 54%), hsl(264 68% 40%) 50%, hsl(220 64% 18%))",
    chip: "Mag",
  },
  {
    id: "anime",
    label: "Anime",
    description: "Stylized illustration look",
    promptPrefix: "Anime style illustration, ",
    promptSuffix:
      ", expressive line art, clean cel shading, vibrant color palette, detailed background",
    preview:
      "linear-gradient(135deg, hsl(318 84% 60%), hsl(47 95% 62%) 42%, hsl(201 86% 55%))",
    chip: "Art",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    description: "Soft handmade texture",
    promptPrefix: "Watercolor illustration of ",
    promptSuffix:
      ", soft paper texture, translucent pigments, gentle edges, hand-painted feeling",
    preview:
      "linear-gradient(135deg, hsl(190 77% 73%), hsl(280 56% 75%) 48%, hsl(37 92% 70%))",
    chip: "Paint",
  },
];

export const STANDALONE_TOOLS: Record<StandaloneToolKey, StandaloneToolDefinition> = {
  image_gen: {
    key: "image_gen",
    title: "Image Generator",
    subtitle: "Create or edit images without opening a Space",
    navLabel: "Image",
    nodeType: "imageGenNode",
    icon: ImageIcon,
    outputType: "image",
    accent: "hsl(258 86% 64%)",
    defaultModel: "nano-banana-2",
    // Keep this list in sync with `imageGenNode.supportedModels` in
    // workspaceSchema.ts. The canvas image-gen node accepts the union
    // of BANANA + SEEDREAM + OPENAI image models; the standalone tool
    // surface previously exposed only 3 of them which made users
    // think the new SeedDream / GPT Image SKUs were missing.
    models: [
      {
        id: "nano-banana-2",
        label: "Nano Banana 2 (Standard)",
        provider: "Google",
        badge: "Fast",
        description: "Fast general image generation with up to 14 reference images.",
      },
      {
        id: "nano-banana-pro",
        label: "Nano Banana Pro (Flex)",
        provider: "Google",
        badge: "Flex",
        description: "Higher quality Banana with 4K support and Flex tier control.",
      },
      {
        id: "seedream-5-0-260128",
        label: "SeedDream 5.0",
        provider: "BytePlus",
        badge: "Latest",
        description: "BytePlus's latest image model, great for stylised renders.",
      },
      {
        id: "seedream-5-0-lite-260128",
        label: "SeedDream 5.0 Lite",
        provider: "BytePlus",
        badge: "Lite",
        description: "Lighter SeedDream 5.0 — faster and cheaper.",
      },
      {
        id: "seedream-4-5-251128",
        label: "SeedDream 4.5",
        provider: "BytePlus",
        badge: "v4.5",
        description: "Previous-generation SeedDream — broad style coverage.",
      },
      {
        id: "gpt-image-2",
        label: "GPT Image 2 (OpenAI)",
        provider: "OpenAI",
        badge: "4K",
        description: "Best for precise style and quality control.",
      },
    ],
  },
  video_gen: {
    key: "video_gen",
    title: "Video Generator",
    subtitle: "Text or image guided video generation",
    navLabel: "Video",
    nodeType: "videoGenNode",
    icon: Film,
    outputType: "video",
    accent: "hsl(156 72% 42%)",
    defaultModel: "kling-v2-6-pro",
    // Keep in sync with KLING_MODELS + SEEDANCE_MODELS in
    // nodeApiSchema.ts / workspaceSchema.ts. The canvas video node
    // accepts all 5 Kling SKUs + all 5 Seedance SKUs — the standalone
    // surface previously surfaced only 4 which is why the
    // user-reported list was "incomplete".
    models: [
      // ── Kling family ───────────────────────────────────────
      {
        id: "kling-v2-6-pro",
        label: "Kling 2.6 Pro",
        provider: "Kling",
        badge: "Pro",
        description: "Classic text/image-to-video workflow.",
      },
      {
        id: "kling-v2-6-motion-pro",
        label: "Kling 2.6 Motion Pro",
        provider: "Kling",
        badge: "Motion",
        description: "Motion-controlled video — drives subject from a reference clip.",
      },
      {
        id: "kling-v3-pro",
        label: "Kling 3.0 Pro",
        provider: "Kling",
        badge: "V3",
        description: "Newer Kling model with longer duration control.",
      },
      {
        id: "kling-v3-motion-pro",
        label: "Kling 3.0 Motion Pro",
        provider: "Kling",
        badge: "V3 Motion",
        description: "V3 motion-controlled variant.",
      },
      {
        id: "kling-v3-omni",
        label: "Kling 3.0 Omni Pro",
        provider: "Kling",
        badge: "Omni",
        description: "Multi-input Kling 3 with audio and video reference.",
      },
      // ── Seedance family ────────────────────────────────────
      {
        id: "seedance-1-0-pro-250528",
        label: "SeedDance 1.0 Pro",
        provider: "BytePlus",
        badge: "Pro",
        description: "Original Seedance Pro pipeline.",
      },
      {
        id: "seedance-1-0-pro-fast-251015",
        label: "SeedDance 1.0 Pro Fast (3x)",
        provider: "BytePlus",
        badge: "Fast",
        description: "Faster Seedance 1.0 for drafts and social clips.",
      },
      {
        id: "seedance-1-5-pro-251215",
        label: "SeedDance 1.5 Pro (Latest)",
        provider: "BytePlus",
        badge: "I2V",
        description: "Reliable text or start-frame video generation.",
      },
      {
        id: "seedance-2-0-lite",
        label: "SeedDance 2.0 Fast",
        provider: "BytePlus",
        badge: "v2 Fast",
        description: "Latest Seedance 2.0 — fast tier with broad input support.",
      },
      {
        id: "seedance-2-0-pro",
        label: "SeedDance 2.0 Pro",
        provider: "BytePlus",
        badge: "v2 Pro",
        description: "Latest Seedance 2.0 — premium quality.",
      },
    ],
  },
  voice_gen: {
    key: "voice_gen",
    title: "Voice Generator",
    subtitle: "Turn scripts into speech with style instructions",
    navLabel: "Audio",
    nodeType: "audioGenNode",
    icon: Mic2,
    outputType: "audio",
    accent: "hsl(38 92% 56%)",
    defaultModel: "gemini-2.5-pro-preview-tts",
    // Synced with the audioGenNode supportedModels in workspaceSchema.
    // Production-quality models only — see schema audit comments for
    // which lower-tier ones we dropped.
    models: [
      {
        id: "elevenlabs-multilingual-v2",
        label: "ElevenLabs v2 — Multilingual",
        provider: "ElevenLabs",
        badge: "Best",
        description: "Best-quality TTS — 32 languages, expressive prosody.",
      },
      {
        id: "elevenlabs-turbo-v2-5",
        label: "ElevenLabs Turbo v2.5",
        provider: "ElevenLabs",
        badge: "Fast",
        description: "Half the latency of v2 with similar quality.",
      },
      {
        id: "gemini-2.5-pro-preview-tts",
        label: "Gemini 2.5 Pro TTS",
        provider: "Google Gemini",
        badge: "Pro",
        description: "Gemini Pro voices — 30 official preset speakers.",
      },
      {
        id: "google-tts-studio",
        label: "Google Cloud TTS — Studio",
        provider: "Google Cloud",
        badge: "Studio",
        description: "Premium Studio + Neural2 voices for English & Thai.",
      },
    ],
  },
  image_to_3d: {
    key: "image_to_3d",
    title: "3D Generator",
    subtitle: "Convert a reference image into a 3D model",
    navLabel: "3D",
    nodeType: "imageTo3dNode",
    icon: Box,
    outputType: "model_3d",
    accent: "hsl(48 87% 50%)",
    defaultModel: "tripo3d-v3.1",
    // Sync with `imageTo3dNode.supportedModels` in workspaceSchema.ts.
    // Backend dispatch (workspace-run-node `getProviderForNodeType`)
    // routes tripo3d-* to executeTripo3D and hyper3d-* to
    // executeHyper3D, so both vendors share this single tool surface.
    models: [
      // ── Tripo3D family ────────────────────────────────────
      {
        id: "tripo3d-p1",
        label: "Tripo P1 (Newest, preview)",
        provider: "Tripo3D",
        badge: "Preview",
        description: "Newest preview model for high detail.",
      },
      {
        id: "tripo3d-v3.1",
        label: "Tripo v3.1 (Gold standard)",
        provider: "Tripo3D",
        badge: "GLB",
        description: "Detailed image-to-3D model output — the default.",
      },
      {
        id: "tripo3d-v3.0",
        label: "Tripo v3.0",
        provider: "Tripo3D",
        badge: "v3",
        description: "Previous-gen Tripo v3 — solid baseline.",
      },
      {
        id: "tripo3d-turbo",
        label: "Tripo Turbo v1.0 (Fast)",
        provider: "Tripo3D",
        badge: "Fast",
        description: "Faster drafts for 3D concept checks.",
      },
      {
        id: "tripo3d-v2.5",
        label: "Tripo v2.5",
        provider: "Tripo3D",
        badge: "v2.5",
        description: "Tripo v2.5 — legacy model.",
      },
      {
        id: "tripo3d-v2.0",
        label: "Tripo v2.0",
        provider: "Tripo3D",
        badge: "v2",
        description: "Tripo v2.0 — legacy model.",
      },
      {
        id: "tripo3d-v1.4",
        label: "Tripo v1.4 (Legacy)",
        provider: "Tripo3D",
        badge: "v1",
        description: "Oldest Tripo model kept for compatibility.",
      },
      // ── Hyper3D family ────────────────────────────────────
      {
        id: "hyper3d-gen2-260112",
        label: "Hyper3D Gen 2",
        provider: "BytePlus",
        badge: "Gen 2",
        description: "BytePlus image-to-3D — alternative engine to Tripo.",
      },
    ],
  },
};

export const STANDALONE_TOOL_ORDER: StandaloneToolKey[] = [
  "image_gen",
  "video_gen",
  "voice_gen",
  "image_to_3d",
];

export const GPT_IMAGE_ASPECT_RATIOS = GPT_IMAGE_2_ASPECT_RATIOS;

export function gptImageResolutionsFor(aspectRatio: string): string[] {
  return gptImage2ResolutionsFor(aspectRatio);
}

export function isSeedreamImageModel(model: string): boolean {
  return model.startsWith("seedream");
}

export function isSeedanceVideoModel(model: string): boolean {
  return model.startsWith("seedance") || model.startsWith("dreamina-seedance");
}

export function isKlingMotionVideoModel(model: string): boolean {
  return model === "kling-v2-6-motion-pro" || model === "kling-v3-motion-pro";
}

export function videoSupportsStartEndFrames(model: string): boolean {
  return (
    model === "kling-v2-6-pro" ||
    model === "kling-v3-pro" ||
    model === "kling-v3-omni" ||
    isSeedanceVideoModel(model)
  );
}

export function videoSupportsReferenceImage(model: string): boolean {
  return isKlingMotionVideoModel(model) || model === "kling-v3-omni";
}

export function videoSupportsReferenceVideo(model: string): boolean {
  return (
    isKlingMotionVideoModel(model) ||
    model === "kling-v3-omni" ||
    model === "seedance-2-0-lite" ||
    model === "seedance-2-0-pro"
  );
}

export function videoDurationsForModel(model: string): number[] {
  if (model === "kling-v3-omni" || model === "kling-v3-pro") {
    return [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  }
  if (
    model.startsWith("seedance-2-0") ||
    model.startsWith("dreamina-seedance")
  ) {
    return [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  }
  if (model.startsWith("seedance-1-5")) {
    return [4, 5, 6, 7, 8, 9, 10, 11, 12];
  }
  if (model.startsWith("seedance-1-0-lite")) {
    return [5, 10];
  }
  if (
    model.startsWith("seedance-1-0-pro") ||
    model.startsWith("seedance-1-0-fast") ||
    isSeedanceVideoModel(model)
  ) {
    return [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }
  return [5, 10];
}

export function composeStandaloneImagePrompt(
  prompt: string,
  styleId: string,
): string {
  const base = prompt.trim();
  const style =
    IMAGE_STYLE_PRESETS.find((preset) => preset.id === styleId) ??
    IMAGE_STYLE_PRESETS[0];
  if (!base || style.id === "none") return base;
  return `${style.promptPrefix}${base}${style.promptSuffix}`.trim();
}

export function buildImageParams(args: {
  model: string;
  prompt: string;
  styleId: string;
  aspectRatio: string;
  resolution: string;
  quality: string;
  outputFormat: string;
  background: string;
}): Record<string, unknown> {
  const styledPrompt = composeStandaloneImagePrompt(args.prompt, args.styleId);
  if (args.model === "gpt-image-2") {
    return {
      model_name: args.model,
      prompt: styledPrompt,
      size: composeGptImageSize(args.aspectRatio, args.resolution),
      quality: args.quality,
      output_format: args.outputFormat,
      background: args.outputFormat === "jpeg" ? "auto" : args.background,
      moderation: "auto",
    };
  }
  if (isSeedreamImageModel(args.model)) {
    return {
      model_name: args.model,
      prompt: styledPrompt,
      size: args.resolution === "3K" ? "3K" : "2K",
      sequential_image_generation: "disabled",
      optimize_prompt: "off",
      watermark: "false",
    };
  }
  const bananaSize =
    args.model === "nano-banana-pro"
      ? args.resolution === "4K"
        ? "4K"
        : args.resolution === "2K"
          ? "2K"
          : "1K"
      : args.resolution === "2K"
        ? "2K"
        : "1K";
  return {
    model_name: args.model,
    prompt: styledPrompt,
    aspect_ratio: args.aspectRatio === "Auto" ? "Auto" : args.aspectRatio,
    image_size: bananaSize,
  };
}

export function buildVideoParams(args: {
  model: string;
  prompt: string;
  ratio: string;
  resolution: string;
  duration: number;
  withAudio: boolean;
  characterOrientation?: string;
  keepOriginalSound?: boolean;
  hasReferenceVideo?: boolean;
}): Record<string, unknown> {
  const hasReferenceVideo = !!args.hasReferenceVideo;
  if (isSeedanceVideoModel(args.model)) {
    return {
      model_name: args.model,
      prompt: args.prompt.trim(),
      ratio: args.ratio === "Auto" ? "16:9" : args.ratio,
      resolution: args.resolution,
      duration: args.duration,
      generate_audio: String(args.withAudio),
      return_last_frame: "true",
      _has_ref_video: hasReferenceVideo,
    };
  }
  if (isKlingMotionVideoModel(args.model)) {
    return {
      model_name: args.model,
      prompt: args.prompt.trim(),
      character_orientation: args.characterOrientation ?? "image",
      keep_original_sound: args.keepOriginalSound ? "yes" : "no",
      _has_ref_video: hasReferenceVideo,
    };
  }
  const klingParams: Record<string, unknown> = {
    model_name: args.model,
    prompt: args.prompt.trim(),
    aspect_ratio: args.ratio || "Auto",
    duration: String(args.duration),
    has_audio: String(args.withAudio),
    _has_ref_video: hasReferenceVideo,
  };
  if (args.model === "kling-v3-omni") {
    klingParams.keep_original_sound = args.keepOriginalSound ? "yes" : "no";
  }
  return klingParams;
}

export function buildAudioParams(args: {
  model: string;
  script: string;
  voice: string;
  stylePrompt: string;
  /** ElevenLabs / Gemini Voice Style preset — Expressive / Neutral /
   *  Consistent. Backend maps this onto numeric voice_settings if no
   *  explicit `stability` / `style` knobs are provided. */
  voiceStylePreset?: "expressive" | "neutral" | "consistent";
  /** ElevenLabs only — speech speed (0.7–1.2). */
  voiceSpeed?: number;
  /** ElevenLabs only — voice_settings.stability (0–1). */
  voiceStability?: number;
  /** ElevenLabs only — voice_settings.similarity_boost (0–1). */
  voiceSimilarity?: number;
  /** ElevenLabs only — voice_settings.style (0–1). */
  voiceStyleAmount?: number;
}): Record<string, unknown> {
  const isElevenLabs =
    args.model.startsWith("elevenlabs-") || args.model.startsWith("eleven_");
  const out: Record<string, unknown> = {
    model_name: args.model,
    prompt: args.script.trim(),
    voice: args.voice,
    style_prompt: args.stylePrompt?.trim() ?? "",
  };
  if (isElevenLabs) {
    if (args.voiceStylePreset) out.voice_style = args.voiceStylePreset;
    if (typeof args.voiceSpeed === "number") out.speed = args.voiceSpeed;
    if (typeof args.voiceStability === "number") out.stability = args.voiceStability;
    if (typeof args.voiceSimilarity === "number") {
      out.similarity_boost = args.voiceSimilarity;
    }
    if (typeof args.voiceStyleAmount === "number") out.style = args.voiceStyleAmount;
  }
  return out;
}

export function build3dParams(args: {
  model: string;
  texture: boolean;
  pbr: boolean;
}): Record<string, unknown> {
  return {
    model_name: args.model,
    texture: String(args.texture),
    pbr: String(args.pbr),
    auto_size: "true",
  };
}

export function toolForSection(section: string): StandaloneToolDefinition | null {
  return STANDALONE_TOOLS[section as StandaloneToolKey] ?? null;
}

export const STANDALONE_EMPTY_ICON = Sparkles;
