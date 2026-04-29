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

export type GenerationOutputType = "image" | "video" | "audio" | "text";

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
    models: [
      {
        id: "nano-banana-2",
        label: "Google Nano Banana 2",
        provider: "Google",
        badge: "Fast",
        description: "Fast general image generation with references.",
      },
      {
        id: "gpt-image-2",
        label: "GPT Image 2",
        provider: "OpenAI",
        badge: "4K",
        description: "Best for precise style and quality control.",
      },
      {
        id: "nano-banana-pro",
        label: "Google Nano Banana Pro",
        provider: "Google",
        badge: "Flex",
        description: "Higher quality image generation with 4K support.",
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
    defaultModel: "seedance-1-5-pro-251215",
    models: [
      {
        id: "seedance-1-5-pro-251215",
        label: "Seedance 1.5 Pro",
        provider: "BytePlus",
        badge: "I2V",
        description: "Reliable text or start-frame video generation.",
      },
      {
        id: "seedance-1-0-pro-fast-251015",
        label: "Seedance 1.0 Pro Fast",
        provider: "BytePlus",
        badge: "Fast",
        description: "Faster video jobs for drafts and social clips.",
      },
      {
        id: "kling-v2-6-pro",
        label: "Kling 2.6 Pro",
        provider: "Kling",
        badge: "Pro",
        description: "Classic text/image to video workflow.",
      },
      {
        id: "kling-v3-pro",
        label: "Kling 3 Pro",
        provider: "Kling",
        badge: "V3",
        description: "Newer Kling model with longer duration control.",
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
    defaultModel: "google-tts-studio",
    models: [
      {
        id: "google-tts-studio",
        label: "Google TTS Studio",
        provider: "Google Cloud",
        badge: "Premium",
        description: "Best voice quality using Google Studio voices.",
      },
      {
        id: "google-tts-neural2",
        label: "Google TTS Neural2",
        provider: "Google Cloud",
        badge: "Value",
        description: "Production-ready voice generation at lower cost.",
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
    outputType: "image",
    accent: "hsl(48 87% 50%)",
    defaultModel: "tripo3d-v3.1",
    models: [
      {
        id: "tripo3d-v3.1",
        label: "Tripo v3.1",
        provider: "Tripo3D",
        badge: "GLB",
        description: "Detailed image-to-3D model output.",
      },
      {
        id: "tripo3d-turbo",
        label: "Tripo Turbo",
        provider: "Tripo3D",
        badge: "Fast",
        description: "Faster drafts for 3D concept checks.",
      },
      {
        id: "tripo3d-p1",
        label: "Tripo P1",
        provider: "Tripo3D",
        badge: "New",
        description: "Newest preview model for high detail.",
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
}): Record<string, unknown> {
  if (args.model.startsWith("seedance")) {
    return {
      model_name: args.model,
      prompt: args.prompt.trim(),
      ratio: args.ratio,
      resolution: args.resolution,
      duration: args.duration,
      generate_audio: String(args.withAudio),
      return_last_frame: "true",
    };
  }
  return {
    model_name: args.model,
    prompt: args.prompt.trim(),
    aspect_ratio: args.ratio === "Auto" ? "16:9" : args.ratio,
    duration: String(args.duration <= 5 ? 5 : 10),
    has_audio: String(args.withAudio),
  };
}

export function buildAudioParams(args: {
  model: string;
  script: string;
  voice: string;
  stylePrompt: string;
}): Record<string, unknown> {
  return {
    model_name: args.model,
    prompt: args.script.trim(),
    voice: args.voice,
    style_prompt: args.stylePrompt.trim(),
  };
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
