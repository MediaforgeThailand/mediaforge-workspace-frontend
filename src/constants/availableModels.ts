/**
 * AVAILABLE_MODELS — Centralized registry of all model slugs per feature.
 * Derived from nodeApiSchema.ts definitions. This is the single source of truth
 * for the Pricing Manager UI and any validation that needs the full model list.
 *
 * When adding a new model to nodeApiSchema.ts, add it here too.
 */

import { NODE_API_SCHEMA, KLING_MODELS } from "@/components/flow/nodes/nodeApiSchema";

/* ─── Model entry with human label ─── */
export interface ModelEntry {
  slug: string;
  label: string;
}

/* ─── Feature → models mapping ─── */
export interface FeatureModels {
  feature: string;
  featureLabel: string;
  models: ModelEntry[];
}

/* ─── Build from schema ─── */

const chatModels: ModelEntry[] = (NODE_API_SCHEMA.chatAiNode?.supportedModels ?? []).map((slug) => ({
  slug,
  label: slug,
}));

const imageModels: ModelEntry[] = (NODE_API_SCHEMA.bananaProNode?.supportedModels ?? []).map((slug) => {
  const optionLabels = NODE_API_SCHEMA.bananaProNode?.params.find((p) => p.key === "model_name")?.optionLabels;
  return { slug, label: optionLabels?.[slug] ?? slug };
});

const removeBgModels: ModelEntry[] = (NODE_API_SCHEMA.removeBackgroundNode?.supportedModels ?? []).map((slug) => {
  const optionLabels = NODE_API_SCHEMA.removeBackgroundNode?.params.find((p) => p.key === "model_name")?.optionLabels;
  return { slug, label: optionLabels?.[slug] ?? slug };
});

const mergeAudioModels: ModelEntry[] = (NODE_API_SCHEMA.mergeAudioNode?.supportedModels ?? []).map((slug) => {
  const optionLabels = NODE_API_SCHEMA.mergeAudioNode?.params.find((p) => p.key === "model_name")?.optionLabels;
  return { slug, label: optionLabels?.[slug] ?? slug };
});

const videoModels: ModelEntry[] = KLING_MODELS.flatMap((m) => {
  const base: ModelEntry = { slug: m.value, label: m.label };
  // Omni/O1 models have a higher-priced video-ref tier
  const hasVideoRef = ["kling-v3-omni"].includes(m.value);
  if (hasVideoRef) {
    return [base, { slug: `${m.value}-video-ref`, label: `${m.label} + Video Ref` }];
  }
  return [base];
});

export const AVAILABLE_MODELS: FeatureModels[] = [
  { feature: "chat_ai", featureLabel: "Chat AI", models: chatModels },
  { feature: "generate_freepik_image", featureLabel: "Image Generation", models: imageModels },
  { feature: "generate_freepik_video", featureLabel: "Video Generation", models: videoModels },
  { feature: "remove_background", featureLabel: "Remove Background", models: removeBgModels },
  { feature: "merge_audio_video", featureLabel: "Merge Audio + Video", models: mergeAudioModels },
];

/** Quick lookup: feature → model slugs */
export const MODEL_SLUGS_BY_FEATURE: Record<string, ModelEntry[]> = {};
for (const f of AVAILABLE_MODELS) {
  if (!MODEL_SLUGS_BY_FEATURE[f.feature]) {
    MODEL_SLUGS_BY_FEATURE[f.feature] = [];
  }
  MODEL_SLUGS_BY_FEATURE[f.feature].push(...f.models);
}

/** Flat set of all known slugs across all features */
export const ALL_MODEL_SLUGS = new Set(
  AVAILABLE_MODELS.flatMap((f) => f.models.map((m) => m.slug)),
);
