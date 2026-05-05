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
        label: "Nano Banana 2",
        provider: "Google",
        badge: "Fast",
        description: "Fast general image generation with up to 14 reference images.",
      },
      {
        id: "nano-banana-pro",
        label: "Nano Banana Pro",
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
        label: "GPT Image 2",
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
    defaultModel: "seedance-2-0-pro",
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
        label: "Kling 3.0 Omni",
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
        label: "SeedDance 1.0 Pro Fast",
        provider: "BytePlus",
        badge: "Fast",
        description: "Faster Seedance 1.0 for drafts and social clips.",
      },
      {
        id: "seedance-1-5-pro-251215",
        label: "SeedDance 1.5 Pro",
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
        label: "SeedDance 2.0",
        provider: "BytePlus",
        badge: "v2 Pro",
        description: "Latest Seedance 2.0 — premium quality.",
      },
      // ── Google Veo family (Standard tier only) ─────────────
      {
        id: "veo-3.1-generate-001",
        label: "Google Veo 3.1",
        provider: "Google",
        badge: "Standard",
        description: "Google Veo 3.1 with native audio — 4/6/8s, 720p/1080p, 16:9 or 9:16.",
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
        label: "Gemini 2.5 ProTTS",
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
        label: "Tripo P1",
        provider: "Tripo3D",
        badge: "Preview",
        description: "Newest preview model for high detail.",
      },
      {
        id: "tripo3d-v3.1",
        label: "Tripo v3.1",
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
        label: "Tripo Turbo v1.0",
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
        label: "Tripo v1.4",
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
  "video_gen",
  "image_gen",
  "image_to_3d",
  "voice_gen",
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

export function isSeedance20VideoModel(model: string): boolean {
  return (
    model === "seedance-2-0-lite" ||
    model === "seedance-2-0-pro" ||
    model === "dreamina-seedance-2-0-fast-260128" ||
    model === "dreamina-seedance-2-0-260128"
  );
}

export function seedanceVideoSupportsAudio(model: string): boolean {
  return (
    model.startsWith("seedance-1-5") ||
    model.startsWith("seedance-2-0") ||
    model.startsWith("dreamina-seedance-2-0")
  );
}

export function seedanceResolutionOptionsForModel(model: string): string[] {
  if (isSeedance20VideoModel(model)) return ["480p", "720p"];
  if (isSeedanceVideoModel(model)) return ["480p", "720p", "1080p"];
  return [];
}

export function isKlingMotionVideoModel(model: string): boolean {
  return model === "kling-v2-6-motion-pro" || model === "kling-v3-motion-pro";
}

export function isVeoVideoModel(model: string): boolean {
  return model.startsWith("veo-");
}

export function videoSupportsStartEndFrames(model: string): boolean {
  return (
    model === "kling-v2-6-pro" ||
    model === "kling-v3-pro" ||
    model === "kling-v3-omni" ||
    isSeedanceVideoModel(model) ||
    isVeoVideoModel(model)
  );
}

export function videoSupportsEndFrame(model: string): boolean {
  return videoSupportsStartEndFrames(model);
}

export function videoSupportsReferenceImage(model: string): boolean {
  return (
    isKlingMotionVideoModel(model) ||
    model === "kling-v3-omni" ||
    model === "seedance-2-0-lite" ||
    model === "seedance-2-0-pro"
  );
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
  if (isVeoVideoModel(model)) {
    // Veo 3.1 only accepts these three discrete values per Google's
    // generateVideos spec. 1080p forces 8s server-side.
    return [4, 6, 8];
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

/**
 * Per-provider character / identity cue.
 *
 * None of our image providers expose a dedicated identity-preservation
 * field — they all read references through the same `image_urls`/
 * `mention_image_urls` channel. To make the "Character" button do
 * something other than "yet another reference", we steer the model
 * through the prompt itself.
 *
 * The cue text is tailored per provider because each one interprets
 * multimodal context differently:
 *
 *   • Banana (Gemini Image) — treats earlier images in the parts
 *     array as primary subjects when the prompt explicitly names
 *     them. Phrasing "the person in Image 1" lands cleanly.
 *   • GPT Image 2 — when refs are present, we hit
 *     /v1/images/edits which already biases toward subject
 *     preservation; the cue reinforces "same person".
 *   • SeedDream — image-to-image; phrasing "from the reference photo"
 *     matches BytePlus docs' suggested prompt grammar.
 *
 * The cue is prepended to the base prompt; style prefix/suffix still
 * wrap around the result so users can stack Style + Character.
 */
function characterCueForModel(model: string): string {
  if (model === "gpt-image-2") {
    return "Keep the same person from the reference photo — preserve their face, hair, build, and identity exactly. Show that person in the following scene: ";
  }
  if (model.startsWith("seedream-")) {
    return "Using the person from the reference photo, generate them in this scene with their face and identity preserved: ";
  }
  // Banana / Gemini Image (default)
  return "Use the person in Image 1 as the main subject of the scene below. Preserve their face, hair, body, and identity. Scene: ";
}

export function composeStandaloneImagePrompt(
  prompt: string,
  styleId: string,
  opts?: { hasCharacterRef?: boolean; model?: string },
): string {
  const base = prompt.trim();
  const style =
    IMAGE_STYLE_PRESETS.find((preset) => preset.id === styleId) ??
    IMAGE_STYLE_PRESETS[0];
  if (!base) return base;

  /* Order: [character cue] + [style prefix] + [base] + [style suffix].
   *  Character cue goes first so the model anchors identity before
   *  applying stylistic direction, matching how diffusion / multi-
   *  modal LLMs read prompts top-to-bottom. */
  const characterCue = opts?.hasCharacterRef
    ? characterCueForModel(opts.model ?? "")
    : "";

  if (style.id === "none") {
    return `${characterCue}${base}`.trim();
  }
  return `${characterCue}${style.promptPrefix}${base}${style.promptSuffix}`.trim();
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
  hasCharacterRef?: boolean;
}): Record<string, unknown> {
  const styledPrompt = composeStandaloneImagePrompt(args.prompt, args.styleId, {
    hasCharacterRef: args.hasCharacterRef,
    model: args.model,
  });
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
  negativePrompt?: string;
  personGeneration?: string;
  returnLastFrame?: boolean;
  multiShot?: boolean;
  multiPrompt?: string;
}): Record<string, unknown> {
  const hasReferenceVideo = !!args.hasReferenceVideo;
  if (isVeoVideoModel(args.model)) {
    // Veo 3.1 only accepts "16:9" or "9:16" for aspectRatio. Coerce
    // anything else (e.g. the dashboard's "Auto" default) to 16:9.
    const aspect = args.ratio === "9:16" ? "9:16" : "16:9";
    // Resolution: Veo accepts "720p" or "1080p"; default 720p.
    const res = args.resolution === "1080p" ? "1080p" : "720p";
    // Duration: snap to the nearest valid value (4 / 6 / 8).
    const dur = args.duration <= 4 ? 4 : args.duration <= 6 ? 6 : 8;
    return {
      model_name: args.model,
      prompt: args.prompt.trim(),
      aspect_ratio: aspect,
      resolution: res,
      duration: String(dur),
      // Audio is always-on for Veo (no toggle); withAudio arg ignored.
      person_generation:
        args.personGeneration === "allow_all" ? "allow_all" : "allow_adult",
    };
  }
  if (isSeedanceVideoModel(args.model)) {
    const seedanceResOptions = seedanceResolutionOptionsForModel(args.model);
    const resolution = seedanceResOptions.includes(args.resolution)
      ? args.resolution
      : (seedanceResOptions[seedanceResOptions.length - 1] ?? "720p");
    return {
      model_name: args.model,
      prompt: args.prompt.trim(),
      ratio: args.ratio === "Auto" ? "16:9" : args.ratio,
      resolution,
      duration: args.duration,
      generate_audio: seedanceVideoSupportsAudio(args.model) ? String(args.withAudio) : "false",
      return_last_frame: String(!!args.returnLastFrame),
      _has_ref_video: hasReferenceVideo,
    };
  }
  if (isKlingMotionVideoModel(args.model)) {
    const motionParams: Record<string, unknown> = {
      model_name: args.model,
      prompt: args.prompt.trim(),
      character_orientation: args.characterOrientation ?? "image",
      keep_original_sound: args.keepOriginalSound ? "yes" : "no",
      _has_ref_video: hasReferenceVideo,
    };
    if (args.negativePrompt?.trim()) {
      motionParams.negative_prompt = args.negativePrompt.trim();
    }
    return motionParams;
  }
  const klingParams: Record<string, unknown> = {
    model_name: args.model,
    prompt: args.prompt.trim(),
    aspect_ratio: args.ratio || "Auto",
    duration: String(args.duration),
    has_audio: String(args.withAudio),
    _has_ref_video: hasReferenceVideo,
  };
  if (args.negativePrompt?.trim()) {
    klingParams.negative_prompt = args.negativePrompt.trim();
  }
  if (args.model === "kling-v3-omni") {
    klingParams.keep_original_sound = args.keepOriginalSound ? "yes" : "no";
    klingParams.multi_shot = args.multiShot ? "true" : "false";
    if (args.multiShot && args.multiPrompt?.trim()) {
      klingParams.multi_prompt = args.multiPrompt.trim();
    }
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
