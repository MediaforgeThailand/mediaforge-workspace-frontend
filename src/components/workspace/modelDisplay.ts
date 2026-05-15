import geminiLogoSrc from "@/assets/model-logo-gemini.png";
import klingLogoSrc from "@/assets/model-logo-kling.png";
import seedanceLogoSrc from "@/assets/model-logo-seedance.png";
import elevenLabsLogoSrc from "@/assets/model-logo-elevenlabs.png";
import openAiLogoSrc from "@/assets/model-logo-openai.png";
import tripoLogoSrc from "@/assets/model-logo-tripo3d.png";

const MODEL_RECOMMENDATION_GROUPS = [
  ["gpt-image-2", "nano-banana-pro", "nano-banana-2"],
  ["seedance-2-0-pro", "kling-v3-omni", "kling-v3-pro"],
  ["tripo3d-v3.1", "tripo3d-v3.0"],
  ["gemini-3.1-flash-tts-preview", "gemini-2.5-pro-preview-tts"],
] as const;

export function cleanModelDisplayName(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/g, "").replace(/\s{2,}/g, " ").trim();
}

export function cleanModelLabelMap(
  labels: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!labels) return undefined;
  const cleaned = Object.fromEntries(
    Object.entries(labels).map(([key, label]) => [key, cleanModelDisplayName(label)]),
  );
  const counts = new Map<string, number>();
  for (const label of Object.values(cleaned)) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Object.fromEntries(
    Object.entries(labels).map(([key, label]) => {
      const cleanLabel = cleaned[key];
      return [key, counts.get(cleanLabel) && counts.get(cleanLabel)! > 1 ? label.trim() : cleanLabel];
    }),
  );
}

export function recommendationRankForModel(id: string): number | null {
  for (const group of MODEL_RECOMMENDATION_GROUPS) {
    const index = (group as readonly string[]).indexOf(id);
    if (index >= 0) return index;
  }
  return null;
}

export function preferredModelIdsFor(ids: string[]): string[] {
  const idSet = new Set(ids);
  const bestGroup = MODEL_RECOMMENDATION_GROUPS.find((group) =>
    group.some((id) => idSet.has(id)),
  );
  if (!bestGroup) return [];
  return bestGroup.filter((id) => idSet.has(id));
}

export function orderModelsByRecommendation<T extends { id: string }>(models: T[]): T[] {
  const preferred = preferredModelIdsFor(models.map((model) => model.id));
  if (preferred.length === 0) return models;
  const preferredSet = new Set(preferred);
  const byId = new Map(models.map((model) => [model.id, model] as const));
  return [
    ...preferred.flatMap((id) => {
      const model = byId.get(id);
      return model ? [model] : [];
    }),
    ...models.filter((model) => !preferredSet.has(model.id)),
  ];
}

export interface ModelLogoInput {
  id?: string;
  label?: string;
  name?: string;
  provider?: string;
}

export interface ModelLogoMeta {
  imageSrc?: string;
  mark: string;
  label: string;
  background: string;
  color: string;
  borderColor: string;
  shadow: string;
}

export interface ModelPreviewMeta {
  imageSrc?: string;
  videoSrc?: string;
  title: string;
  subtitle?: string;
}

const MODEL_PREVIEW_META: Record<string, ModelPreviewMeta> = {
  "nano-banana-2": {
    imageSrc: "/model-previews/banana-2.webp",
    title: "Nano Banana 2",
    subtitle: "Reference-heavy Google image generation preview",
  },
  "nano-banana-pro": {
    imageSrc: "/model-previews/banana-pro.webp",
    title: "Nano Banana Pro",
    subtitle: "Premium Google image generation preview",
  },
  "gpt-image-2": {
    imageSrc: "/model-previews/gpt-2.webp",
    title: "GPT Image 2",
    subtitle: "OpenAI image generation preview",
  },
  "seedream-4-5": {
    imageSrc: "/model-previews/seedream-4-5.webp",
    title: "Seedream 4.5",
    subtitle: "ByteDance image generation preview",
  },
  "seedream-5-0-lite": {
    imageSrc: "/model-previews/seedream-5-0-lite.webp",
    title: "Seedream 5.0 Lite",
    subtitle: "Lightweight Seedream image generation preview",
  },
  "seedream-5-0": {
    imageSrc: "/model-previews/seedream-5-0.webp",
    title: "Seedream 5.0",
    subtitle: "Seedream image generation preview",
  },
  "kling-2-6": {
    videoSrc: "/model-previews/kling-2-6.webm",
    title: "Kling 2.6 Pro",
    subtitle: "Kling video generation preview",
  },
  "kling-2-6-motion": {
    videoSrc: "/model-previews/kling-2-6-motion.webm",
    title: "Kling 2.6 Motion Pro",
    subtitle: "Motion-controlled Kling preview",
  },
  "kling-3-0": {
    videoSrc: "/model-previews/kling-3-0.webm",
    title: "Kling 3.0 Pro",
    subtitle: "Kling 3 video generation preview",
  },
  "kling-3-0-motion-pro": {
    videoSrc: "/model-previews/kling-3-0-motion-pro.webm",
    title: "Kling 3.0 Motion Pro",
    subtitle: "Kling 3 motion-controlled preview",
  },
  "kling-3-0-omni": {
    videoSrc: "/model-previews/kling-3-0-omni.webm",
    title: "Kling 3.0 Omni",
    subtitle: "Kling Omni multi-input preview",
  },
  "seedance-2-0": {
    videoSrc: "/model-previews/seedance-2-0.webm",
    title: "Seedance 2.0",
    subtitle: "Premium BytePlus video generation preview",
  },
  "seedance-2-0-fast": {
    videoSrc: "/model-previews/seedance-2-0-fast.webm",
    title: "Seedance 2.0 Fast",
    subtitle: "Fast BytePlus video generation preview",
  },
  "veo-3-1": {
    videoSrc: "/model-previews/veo-3-1.webm",
    title: "Google Veo 3.1",
    subtitle: "Google video generation preview",
  },
  "gemini-3-1-tts": {
    imageSrc: "/model-previews/recommend-gemini-3-1.webp",
    title: "Gemini 3.1 Flash Preview TTS",
    subtitle: "Google expressive text-to-speech preview",
  },
  "tripo3d-v3-1": {
    imageSrc: "/model-previews/recommend-tripo3d-v3-1.webp",
    title: "Tripo3D v3.1",
    subtitle: "Detailed image-to-3D model preview",
  },
};

type ModelPreviewKey = keyof typeof MODEL_PREVIEW_META;

const MODEL_RECOMMENDED_PREVIEW_META: Partial<Record<ModelPreviewKey, ModelPreviewMeta>> = {
  "gpt-image-2": {
    videoSrc: "/model-previews/recommend-gpt-image-2.webm",
    title: "GPT Image 2",
    subtitle: "OpenAI image generation preview",
  },
  "nano-banana-2": {
    videoSrc: "/model-previews/recommend-nano-banana-2.webm",
    title: "Nano Banana 2",
    subtitle: "Reference-heavy Google image generation preview",
  },
  "kling-3-0": {
    videoSrc: "/model-previews/recommend-kling-3-0.webm",
    title: "Kling 3.0 Pro",
    subtitle: "Kling 3 video generation preview",
  },
  "kling-3-0-omni": {
    videoSrc: "/model-previews/recommend-kling-3-0-omni.webm",
    title: "Kling 3.0 Omni",
    subtitle: "Kling Omni multi-input preview",
  },
  "seedance-2-0": {
    videoSrc: "/model-previews/recommend-seedance-2-0.webm",
    title: "Seedance 2.0",
    subtitle: "Premium BytePlus video generation preview",
  },
  "seedance-2-0-fast": {
    videoSrc: "/model-previews/recommend-seedance-2-0.webm",
    title: "Seedance 2.0 Fast",
    subtitle: "Fast BytePlus video generation preview",
  },
};

function modelPreviewKeyFor(model: ModelLogoInput | string): ModelPreviewKey | undefined {
  const input = typeof model === "string" ? { id: model } : model;
  const haystack = `${input.id ?? ""} ${input.label ?? ""} ${input.name ?? ""} ${input.provider ?? ""}`.toLowerCase();
  const normalized = haystack.replace(/[^a-z0-9]+/g, "-");
  const normalizedNoVersionPrefix = normalized.replace(/-v(?=\d)/g, "-");
  const compact = haystack.replace(/[^a-z0-9]+/g, "");
  const has = (value: string) => (
    normalized.includes(value) ||
    normalizedNoVersionPrefix.includes(value) ||
    compact.includes(value.replace(/-/g, ""))
  );

  if (
    has("seedream-5-0-lite") ||
    (normalized.includes("seedream") && normalized.includes("5") && normalized.includes("lite"))
  ) {
    return "seedream-5-0-lite";
  }
  if (has("seedream-5-0") || (normalized.includes("seedream") && normalized.includes("5"))) {
    return "seedream-5-0";
  }
  if (has("seedream-4-5") || (normalized.includes("seedream") && normalized.includes("4-5"))) {
    return "seedream-4-5";
  }
  if (has("nano-banana-pro") || has("banana-pro")) {
    return "nano-banana-pro";
  }
  if (has("nano-banana-2") || has("banana-2")) {
    return "nano-banana-2";
  }
  if (has("gpt-image-2") || has("gpt-2")) {
    return "gpt-image-2";
  }
  if (has("seedance-2-0-lite") || (has("seedance-2-0") && normalized.includes("fast"))) {
    return "seedance-2-0-fast";
  }
  if (has("seedance-2-0-pro") || has("seedance-2-0")) {
    return "seedance-2-0";
  }
  if (has("veo-3-1")) {
    return "veo-3-1";
  }
  if (has("kling-3-0-omni") || has("kling-3-omni")) {
    return "kling-3-0-omni";
  }
  if (has("kling-3-0-motion-pro") || has("kling-3-motion-pro") || has("kling-3-motion")) {
    return "kling-3-0-motion-pro";
  }
  if (has("kling-3-0-pro") || has("kling-3-0") || has("kling-3-pro")) {
    return "kling-3-0";
  }
  if (has("kling-2-6-motion-pro") || has("kling-2-6-motion")) {
    return "kling-2-6-motion";
  }
  if (has("kling-2-6-pro") || has("kling-2-6")) {
    return "kling-2-6";
  }
  if (has("tripo3d-v3-1") || has("tripo3d-3-1") || has("tripo-v3-1") || has("tripo-3-1")) {
    return "tripo3d-v3-1";
  }
  if (
    has("gemini-3-1") ||
    (normalized.includes("gemini") && (normalized.includes("tts") || normalized.includes("voice") || normalized.includes("audio")))
  ) {
    return "gemini-3-1-tts";
  }

  return undefined;
}

export function modelPreviewFor(model: ModelLogoInput | string): ModelPreviewMeta | undefined {
  const key = modelPreviewKeyFor(model);
  return key ? MODEL_PREVIEW_META[key] : undefined;
}

export function recommendedModelPreviewFor(model: ModelLogoInput | string): ModelPreviewMeta | undefined {
  const key = modelPreviewKeyFor(model);
  if (!key) return undefined;
  return MODEL_RECOMMENDED_PREVIEW_META[key] ?? MODEL_PREVIEW_META[key];
}

export function modelLogoFor(model: ModelLogoInput): ModelLogoMeta {
  const haystack = `${model.id ?? ""} ${model.label ?? ""} ${model.name ?? ""} ${model.provider ?? ""}`.toLowerCase();

  if (haystack.includes("kling")) {
    return modelLogoImage(klingLogoSrc, "Kling");
  }
  if (haystack.includes("veo") || haystack.includes("gemini") || haystack.includes("nano") || haystack.includes("banana")) {
    return modelLogoImage(geminiLogoSrc, haystack.includes("veo") ? "Google Veo" : "Google Gemini");
  }
  if (haystack.includes("seedance") || haystack.includes("seedream")) {
    return modelLogoImage(seedanceLogoSrc, haystack.includes("seedream") ? "SeedDream" : "SeedDance");
  }
  if (haystack.includes("gpt-image-2-enhance") || haystack.includes("upscale mediaforge")) {
    return modelLogoMeta("MF", "Upscale Mediaforge", "#f4ff00", "#151700", "rgba(244,255,0,.4)");
  }
  if (haystack.includes("gpt") || haystack.includes("openai")) {
    return modelLogoImage(openAiLogoSrc, "OpenAI");
  }
  if (haystack.includes("tripo")) {
    return modelLogoImage(tripoLogoSrc, "Tripo3D");
  }
  if (haystack.includes("hyper3d")) {
    return modelLogoImage(seedanceLogoSrc, "Hyper3D");
  }
  if (haystack.includes("elevenlabs") || haystack.includes("eleven")) {
    return modelLogoImage(elevenLabsLogoSrc, "ElevenLabs");
  }
  if (haystack.includes("google cloud")) {
    return modelLogoImage(geminiLogoSrc, "Google Cloud");
  }
  if (haystack.includes("google")) {
    return modelLogoImage(geminiLogoSrc, "Google");
  }
  if (haystack.includes("byteplus") || haystack.includes("bytedance")) {
    return modelLogoImage(seedanceLogoSrc, "BytePlus");
  }
  if (haystack.includes("flux")) {
    return modelLogoMeta("Flux", "Flux", "#dcfce7", "#052e16", "rgba(134,239,172,.34)");
  }
  if (haystack.includes("recraft")) {
    return modelLogoMeta("Recraft", "Recraft", "#ffe4e6", "#4c0519", "rgba(251,113,133,.34)");
  }

  return modelLogoMeta("MF", "MediaForge", "#f4ff00", "#151700", "rgba(244,255,0,.4)");
}

function modelLogoImage(imageSrc: string, label: string): ModelLogoMeta {
  return {
    imageSrc,
    mark: label,
    label,
    background: "rgba(255,255,255,.05)",
    color: "#fff",
    borderColor: "rgba(255,255,255,.1)",
    shadow: "inset 0 1px 0 rgba(255,255,255,.08)",
  };
}

function modelLogoMeta(
  mark: string,
  label: string,
  colorStop: string,
  color: string,
  glow: string,
): ModelLogoMeta {
  return {
    mark,
    label,
    background: `radial-gradient(circle at 30% 20%, rgba(255,255,255,.85), transparent 30%), linear-gradient(135deg, ${colorStop}, rgba(255,255,255,.12) 58%, rgba(0,0,0,.72))`,
    color,
    borderColor: "rgba(255,255,255,.16)",
    shadow: `inset 0 1px 0 rgba(255,255,255,.3), 0 8px 24px -14px ${glow}`,
  };
}
