/**
 * nodeCostCalculator — Client-side cost lookup for Flow Studio nodes.
 * Mirrors the strict matching rules from _shared/pricing.ts.
 *
 * Consolidated: all video nodes now use "klingVideoNode" with standardized
 * params (model_name, duration, has_audio).
 */

import type { CreditCostRow } from "@/hooks/useNodeCreditCosts";

interface NodeCostParams {
  /** Schema key: "bananaProNode" | "klingVideoNode" | "chatAiNode" */
  schemaKey: string;
  params: Record<string, unknown>;
  creditCosts: CreditCostRow[];
}

export interface NodeCostQuote {
  baseCost: number;
  discountPercent: number;
}

/** Omni model slugs that use the /omni-video endpoint */
const OMNI_MODELS = new Set(["kling-v3-omni"]);

function resolutionTier(size: unknown): "1k" | "2k" | "4k" | "auto" {
  const s = String(size ?? "1024x1024").toLowerCase();
  if (s === "auto") return "auto";
  const m = s.match(/^(\d+)x(\d+)$/);
  if (!m) return s.includes("4k") || s.includes("3k") ? "4k" : s.includes("2k") ? "2k" : "1k";
  const maxEdge = Math.max(Number(m[1]), Number(m[2]));
  if (maxEdge >= 3600) return "4k";
  if (maxEdge >= 2800) return "4k";
  if (maxEdge >= 1900) return "2k";
  return "1k";
}

function normaliseDiscountPercent(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(100, Math.max(0, parsed));
}

export function applyNodeCostDiscount(fullCost: number, discountPercent: number): number {
  const full = Math.max(0, Math.ceil(Number(fullCost) || 0));
  const pct = normaliseDiscountPercent(discountPercent);
  if (full <= 0 || pct <= 0) return full;
  return Math.max(1, Math.ceil(full * (1 - pct / 100)));
}

export function applyPackageCostDiscount(modelDiscountedCost: number, discountPercent: number): number {
  const amount = Math.max(0, Math.ceil(Number(modelDiscountedCost) || 0));
  const pct = normaliseDiscountPercent(discountPercent);
  if (amount <= 0 || pct <= 0) return amount;
  return Math.max(1, Math.floor(amount * (100 - pct) / 100));
}

export function effectiveNodeDiscountPercent(fullCost: number, finalCost: number): number {
  const full = Math.max(0, Math.ceil(Number(fullCost) || 0));
  const final = Math.max(0, Math.ceil(Number(finalCost) || 0));
  if (full <= 0 || final >= full) return 0;
  return Math.round((1 - final / full) * 100);
}

function maxDiscountForRows(rows: CreditCostRow[]): number {
  return Math.max(0, ...rows.map((row) => normaliseDiscountPercent(row.discount_percent)));
}

function rowsForFeatureModels(creditCosts: CreditCostRow[], feature: string, models: string[]): CreditCostRow[] {
  const keys = new Set(models.map((model) => String(model ?? "").trim()).filter(Boolean));
  if (keys.size === 0) return [];
  return creditCosts.filter((row) => row.feature === feature && row.model != null && keys.has(row.model));
}

function openAiImagePriceKeys(params: Record<string, unknown>) {
  const rawModel = String(params.model_name ?? params.model ?? "gpt-image-2").toLowerCase();
  const model = rawModel === "replicate-gpt-image-2" ? "gpt-image-2" : rawModel;
  const rawQuality = String(params.quality ?? "medium").toLowerCase();
  const quality = ["low", "medium", "high", "auto"].includes(rawQuality) ? rawQuality : "medium";
  const size = String(params.size ?? "1024x1024").toLowerCase();
  const normalizedSize = size === "auto" ? "1024x1024" : size;
  const tier = resolutionTier(normalizedSize);
  const exactGptImage2Sku = model.match(/^gpt-image-2:(1k|2k|4k):(low|medium|high|auto)$/);
  if (exactGptImage2Sku) return [model];
  return model === "gpt-image-2"
    ? [`${model}:${normalizedSize}:${quality}`, `${model}:${tier}:${quality}`]
    : [`${model}:${normalizedSize}:${quality}`, `${model}:${tier}:${quality}`, model];
}

function modelDiscountPercent({ schemaKey, params, creditCosts }: NodeCostParams): number {
  const modelName = params.model_name as string | undefined;
  if (schemaKey === "bananaProNode" || schemaKey === "imageGenNode") {
    const apiModel = modelName || "nano-banana-pro";
    if (apiModel.startsWith("gpt-image") || apiModel.startsWith("replicate-gpt-image") || apiModel.startsWith("dall-e")) {
      return maxDiscountForRows(rowsForFeatureModels(creditCosts, "generate_openai_image", openAiImagePriceKeys({ ...params, model_name: apiModel })));
    }
    if (apiModel.startsWith("seedream")) {
      const size = String(params.size ?? params.resolution ?? "").toLowerCase();
      const keys = size ? [`${apiModel}:${size}`, apiModel] : [apiModel];
      return maxDiscountForRows(rowsForFeatureModels(creditCosts, "generate_seedream_image", keys));
    }
    const imageSize = String(params.image_size ?? "").toLowerCase();
    const keys = imageSize ? [`${apiModel}:${imageSize}`, apiModel] : [apiModel];
    return maxDiscountForRows(rowsForFeatureModels(creditCosts, "generate_freepik_image", keys));
  }
  if (schemaKey === "removeBackgroundNode") {
    return maxDiscountForRows(rowsForFeatureModels(creditCosts, "remove_background", [modelName || "replicate-birefnet"]));
  }
  if (schemaKey === "mergeAudioNode") {
    return maxDiscountForRows(rowsForFeatureModels(creditCosts, "merge_audio_video", [modelName || "shotstack"]));
  }
  if (schemaKey === "chatAiNode") {
    return maxDiscountForRows(rowsForFeatureModels(creditCosts, "chat_ai", [modelName || "google/gemini-3-pro-preview"]));
  }
  if (schemaKey === "audioGenNode") {
    const apiModel = modelName || "gemini-3.1-flash-tts-preview";
    const aliases =
      apiModel === "gemini-3.1-flash-tts-preview" ||
      apiModel === "gemini-3.1-preview-flash-tts" ||
      apiModel === "gemini-3.1-flash-preview-tts"
        ? ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]
        : [apiModel];
    return maxDiscountForRows(rowsForFeatureModels(creditCosts, "text_to_speech", aliases));
  }
  if (schemaKey === "videoToPromptNode") {
    return maxDiscountForRows(rowsForFeatureModels(creditCosts, "video_to_prompt", [modelName || "gemini-video-understanding"]));
  }
  if (schemaKey === "imageTo3dNode") {
    return maxDiscountForRows(rowsForFeatureModels(creditCosts, "model_3d", [modelName || "tripo3d-v3.1"]));
  }
  if (schemaKey === "klingVideoNode" || schemaKey === "videoGenNode") {
    const model = modelName || "kling-v2-6-pro";
    const hasRefVideoInput =
      params._has_ref_video === true ||
      params._has_ref_video === "true" ||
      (Array.isArray(params.reference_video_urls) && params.reference_video_urls.length > 0) ||
      Boolean(params.reference_video_url || params.video_url || params.ref_video);
    const replicatePricingModel =
      (model.startsWith("seedance-2-0") ||
        model.startsWith("dreamina-seedance-2-0") ||
        model.startsWith("replicate-seedance-2-0")) &&
      hasRefVideoInput
        ? "replicate-seedance-2-0-video-ref"
        : model;
    const modelAliases =
      model === "veo-3.1-generate-001"
        ? [model, "veo-3.1-generate-preview"]
        : replicatePricingModel !== model
          ? [replicatePricingModel, model]
          : [model];
    const resolution = String(params.resolution ?? "").trim().toLowerCase();
    const omniPricingModel = model === "kling-v3-omni" && hasRefVideoInput ? `${model}-video-ref` : model;
    const keys = [
      omniPricingModel,
      ...modelAliases,
      ...(resolution ? modelAliases.map((alias) => `${alias}:${resolution}`) : []),
    ];
    return maxDiscountForRows(rowsForFeatureModels(creditCosts, "generate_freepik_video", keys));
  }
  return 0;
}

export function calculateNodeCostQuote(args: NodeCostParams): NodeCostQuote | null {
  const baseCost = calculateNodeCost(args);
  if (baseCost == null) return null;
  return {
    baseCost,
    discountPercent: modelDiscountPercent(args),
  };
}

function findOpenAiImageCost(params: Record<string, unknown>, creditCosts: CreditCostRow[]) {
  const keys = openAiImagePriceKeys(params);
  for (const key of keys) {
    const row = creditCosts.find((r) => r.feature === "generate_openai_image" && r.model === key);
    if (row) return row.cost;
  }
  return null;
}

function replicateVideoPricingVariant(model: string, params: Record<string, unknown>): string | null {
  if (model === "replicate-veo-3-1") return null;
  if (model === "replicate-kling-v3-motion-pro") {
    const raw = String(params.mode ?? params.quality_mode ?? params.resolution ?? "pro").toLowerCase();
    return raw === "std" || raw === "standard" || raw === "720p" ? "std" : "pro";
  }
  if (model.startsWith("replicate-kling-v3")) {
    const raw = String(params.mode ?? params.quality_mode ?? params.resolution ?? "pro").toLowerCase();
    if (raw === "4k" || raw === "2160p") return "4k";
    if (raw === "standard" || raw === "std" || raw === "720p") return "standard";
    return "pro";
  }
  return null;
}

/**
 * Returns the base credit cost for a node, or null if pricing is missing.
 */
export function calculateNodeCost({ schemaKey, params, creditCosts }: NodeCostParams): number | null {
  if (!creditCosts || creditCosts.length === 0) return null;

  const modelName = params.model_name as string | undefined;

  // ── Image generation (Banana) ──
  if (schemaKey === "bananaProNode" || schemaKey === "imageGenNode") {
    const apiModel = modelName || "nano-banana-pro";
    if (apiModel.startsWith("gpt-image") || apiModel.startsWith("replicate-gpt-image") || apiModel.startsWith("dall-e")) {
      return findOpenAiImageCost({ ...params, model_name: apiModel }, creditCosts);
    }
    if (apiModel.startsWith("seedream")) {
      const size = String(params.size ?? params.resolution ?? "").toLowerCase();
      const keys = size ? [`${apiModel}:${size}`, apiModel] : [apiModel];
      for (const key of keys) {
        const row = creditCosts.find((r) => r.feature === "generate_seedream_image" && r.model === key);
        if (row) return row.cost;
      }
      return null;
    }
    const imageSize = String(params.image_size ?? "").toLowerCase();
    if (imageSize) {
      const sized = creditCosts.find(
        (r) => r.feature === "generate_freepik_image" && r.model === `${apiModel}:${imageSize}`,
      );
      if (sized) return sized.cost;
    }
    const match = creditCosts.find(
      (r) => r.feature === "generate_freepik_image" && r.model === apiModel,
    );
    return match?.cost ?? null;
  }

  // ── Background Removal (Replicate) ──
  if (schemaKey === "removeBackgroundNode") {
    const apiModel = modelName || "replicate-birefnet";
    const match = creditCosts.find(
      (r) => r.feature === "remove_background" && r.model === apiModel,
    );
    return match?.cost ?? null;
  }

  // ── Merge Audio + Video (Shotstack) ──
  if (schemaKey === "mergeAudioNode") {
    const apiModel = modelName || "shotstack";

    const exactMatch = creditCosts.find(
      (r) => r.feature === "merge_audio_video" && r.model === apiModel,
    );
    if (exactMatch) return exactMatch.cost;

    const featureFallback = creditCosts.find(
      (r) => r.feature === "merge_audio_video" && (r.model == null || r.model === ""),
    );
    if (featureFallback) return featureFallback.cost;

    const looseFallback = creditCosts.find(
      (r) =>
        (r.feature === "merge_audio_video" || /merge audio/i.test(r.label)) &&
        (r.model === apiModel || r.model == null || r.model === ""),
    );
    return looseFallback?.cost ?? null;
  }

  // ── MP3 Input (no cost — pure source) ──
  if (schemaKey === "mp3InputNode") {
    return 0;
  }

  // ── Chat AI ──
  if (schemaKey === "chatAiNode") {
    const apiSlug = modelName || "google/gemini-3-pro-preview";
    const match = creditCosts.find(
      (r) => r.feature === "chat_ai" && r.model === apiSlug,
    );
    return match?.cost ?? null;
  }

  // ── Unified Video (Kling I2V / Extension / Motion / Omni) ──
  if (schemaKey === "audioGenNode") {
    const apiModel = modelName || "gemini-3.1-flash-tts-preview";
    const aliases =
      apiModel === "gemini-3.1-flash-tts-preview" ||
      apiModel === "gemini-3.1-preview-flash-tts" ||
      apiModel === "gemini-3.1-flash-preview-tts"
        ? ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]
        : [apiModel];
    const match = aliases
      .map((model) => creditCosts.find((r) => r.feature === "text_to_speech" && r.model === model))
      .find(Boolean);
    if (!match) return null;
    if (match.pricing_type === "per_1k_chars") {
      const text = String(params.prompt ?? params.text ?? "");
      return Math.max(1, Math.ceil(match.cost * Math.max(text.length, 1) / 1000));
    }
    return match.cost;
  }

  if (schemaKey === "videoToPromptNode") {
    const apiModel = modelName || "gemini-3-pro-preview";
    const match = creditCosts.find(
      (r) => r.feature === "video_to_prompt" && r.model === apiModel,
    );
    return match?.cost ?? null;
  }

  if (schemaKey === "imageTo3dNode") {
    const apiModel = modelName || "tripo3d-v3.1";
    const match = creditCosts.find(
      (r) => r.feature === "model_3d" && r.model === apiModel,
    );
    return match?.cost ?? null;
  }

  if (schemaKey === "klingVideoNode" || schemaKey === "videoGenNode") {
    const model = modelName || "kling-v2-6-pro";
    const hasRefVideoInput =
      params._has_ref_video === true ||
      params._has_ref_video === "true" ||
      (Array.isArray(params.reference_video_urls) && params.reference_video_urls.length > 0) ||
      Boolean(params.reference_video_url || params.video_url || params.ref_video);
    const replicatePricingModel =
      (model.startsWith("seedance-2-0") ||
        model.startsWith("dreamina-seedance-2-0") ||
        model.startsWith("replicate-seedance-2-0")) &&
      hasRefVideoInput
        ? "replicate-seedance-2-0-video-ref"
        : model;
    const replicateVariant = replicateVideoPricingVariant(model, params);
    const modelAliases =
      model === "veo-3.1-generate-001"
        ? [model, "veo-3.1-generate-preview"]
        : replicateVariant
          ? [`${model}:${replicateVariant}`, model]
          : replicatePricingModel !== model
            ? [replicatePricingModel, model]
            : [model];
    const isMotion = model.includes("motion");
    const isOmni = OMNI_MODELS.has(model);

    // ── Omni models: fixed (duration+audio) preferred, then per_second ──
    if (isOmni) {
      const hasRefVideo = params._has_ref_video === true || params._has_ref_video === "true";
      const pricingModel = hasRefVideo ? `${model}-video-ref` : model;
      const duration = parseInt(String(params.duration ?? "5"), 10) || 5;
      const hasAudio = params.has_audio === true || params.has_audio === "true";

      // 1. Exact fixed match (model + duration + audio)
      const exactFixed = creditCosts.find(
        (r) =>
          r.feature === "generate_freepik_video" &&
          r.model === pricingModel &&
          r.pricing_type === "fixed" &&
          r.duration_seconds === duration &&
          (r.has_audio ?? false) === hasAudio,
      );
      if (exactFixed) return exactFixed.cost;

      // 2. per_second — strict match including audio
      let perSecondMatch = creditCosts.find(
        (r) =>
          r.feature === "generate_freepik_video" &&
          r.model === pricingModel &&
          r.pricing_type === "per_second" &&
          (r.has_audio ?? false) === hasAudio,
      );
      let finalPerSecondCost = perSecondMatch?.cost;

      // SMART FALLBACK: If user wants audio but no specific 'true' row exists,
      // find the base (false) row and multiply cost by 2 (based on fixed pricing ratio).
      if (!perSecondMatch && hasAudio) {
        const baseMatch = creditCosts.find(
          (r) =>
            r.feature === "generate_freepik_video" &&
            r.model === pricingModel &&
            r.pricing_type === "per_second" &&
            (r.has_audio ?? false) === false,
        );
        if (baseMatch) {
          finalPerSecondCost = baseMatch.cost * 2;
        }
      }

      if (finalPerSecondCost) return Math.ceil(finalPerSecondCost * duration);

      // 3. Fallback: try standard model slug if video-ref row not found
      if (hasRefVideo) {
        const stdExact = creditCosts.find(
          (r) =>
            r.feature === "generate_freepik_video" &&
            r.model === model &&
            r.pricing_type === "fixed" &&
            r.duration_seconds === duration &&
            (r.has_audio ?? false) === hasAudio,
        );
        if (stdExact) return stdExact.cost;

        let stdPerSec = creditCosts.find(
          (r) =>
            r.feature === "generate_freepik_video" &&
            r.model === model &&
            r.pricing_type === "per_second" &&
            (r.has_audio ?? false) === hasAudio,
        );
        let stdPerSecCost = stdPerSec?.cost;
        if (!stdPerSec && hasAudio) {
          const baseStd = creditCosts.find(
            (r) =>
              r.feature === "generate_freepik_video" &&
              r.model === model &&
              r.pricing_type === "per_second" &&
              (r.has_audio ?? false) === false,
          );
          if (baseStd) stdPerSecCost = baseStd.cost * 2;
        }
        if (stdPerSecCost) return Math.ceil(stdPerSecCost * duration);
      }

      // 4. Any match for this model
      const anyMatch = creditCosts.find(
        (r) => r.feature === "generate_freepik_video" && r.model === model,
      );
      return anyMatch?.cost ?? null;
    }

    // ── Motion models: per_second with ref_video duration ──
    if (isMotion) {
      const motionDuration =
        parseInt(String(params._ref_video_duration ?? params.ref_video_duration ?? params.duration ?? "5"), 10) || 5;
      const motionResolution = String(params.resolution ?? "").trim().toLowerCase();
      if (motionResolution) {
        const resolutionMatch = creditCosts.find(
          (r) =>
            r.feature === "generate_freepik_video" &&
            modelAliases.some((alias) => r.model === `${alias}:${motionResolution}`) &&
            r.pricing_type === "per_second",
        );
        if (resolutionMatch) return Math.ceil(resolutionMatch.cost * motionDuration);
      }

      const perSecondMatch = creditCosts.find(
        (r) =>
          r.feature === "generate_freepik_video" &&
          modelAliases.includes(r.model) &&
          r.pricing_type === "per_second",
      );
      if (perSecondMatch) {
        return Math.ceil(perSecondMatch.cost * motionDuration);
      }
    }

    // ── Standard models: fixed pricing (duration + audio match) preferred ──
    const rawDuration = params.duration ?? params.extend_duration ?? "5";
    const parsedDuration = parseInt(String(rawDuration), 10) || 5;
    const duration = model.startsWith("replicate-seedance") && parsedDuration <= 0 ? 5 : parsedDuration;
    const hasAudio =
      params.has_audio === true ||
      params.has_audio === "true" ||
      params.generate_audio === true ||
      params.generate_audio === "true";
    const resolution = String(params.resolution ?? "").trim().toLowerCase();

    if (resolution) {
      const resolutionExact = creditCosts.find(
        (r) =>
          r.feature === "generate_freepik_video" &&
          modelAliases.some((alias) => r.model === `${alias}:${resolution}`) &&
          r.pricing_type === "per_second" &&
          (r.has_audio ?? false) === hasAudio,
      );
      if (resolutionExact) return Math.ceil(resolutionExact.cost * duration);

      if (hasAudio) {
        const noAudioResolution = creditCosts.find(
          (r) =>
            r.feature === "generate_freepik_video" &&
            modelAliases.some((alias) => r.model === `${alias}:${resolution}`) &&
            r.pricing_type === "per_second" &&
            (r.has_audio ?? false) === false,
        );
        if (noAudioResolution) return Math.ceil(noAudioResolution.cost * duration);
      }
    }

    // 1. Exact match: model + duration + audio (highest priority)
    const exactMatch = creditCosts.find(
      (r) =>
        r.feature === "generate_freepik_video" &&
        modelAliases.includes(r.model) &&
        r.pricing_type === "fixed" &&
        r.duration_seconds === duration &&
        (r.has_audio ?? false) === hasAudio,
    );
    if (exactMatch) return exactMatch.cost;

    // 2. Duration-only fixed match (ignore audio)
    const durationMatch = creditCosts.find(
      (r) =>
        r.feature === "generate_freepik_video" &&
        modelAliases.includes(r.model) &&
        r.pricing_type === "fixed" &&
        r.duration_seconds === duration,
    );
    if (durationMatch) return durationMatch.cost;

    // 3. per_second — strict match including audio with smart fallback
    let stdPerSecondMatch = creditCosts.find(
      (r) =>
        r.feature === "generate_freepik_video" &&
        modelAliases.includes(r.model) &&
        r.pricing_type === "per_second" &&
        (r.has_audio ?? false) === hasAudio,
    );
    let stdFinalPerSecCost = stdPerSecondMatch?.cost;
    if (!stdPerSecondMatch && hasAudio) {
      const basePerSec = creditCosts.find(
        (r) =>
          r.feature === "generate_freepik_video" &&
          modelAliases.includes(r.model) &&
          r.pricing_type === "per_second" &&
          (r.has_audio ?? false) === false,
      );
      if (basePerSec) stdFinalPerSecCost = basePerSec.cost * 2;
    }
    if (stdFinalPerSecCost) return Math.ceil(stdFinalPerSecCost * duration);

    // 4. Any match for this model
    const anyMatch = creditCosts.find(
      (r) => r.feature === "generate_freepik_video" && modelAliases.includes(r.model),
    );
    return anyMatch?.cost ?? null;
  }

  return null;
}
