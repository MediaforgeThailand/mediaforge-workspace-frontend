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
