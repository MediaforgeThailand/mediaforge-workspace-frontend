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

function findOpenAiImageCost(params: Record<string, unknown>, creditCosts: CreditCostRow[]) {
  const model = String(params.model_name ?? params.model ?? "gpt-image-2").toLowerCase();
  const rawQuality = String(params.quality ?? "medium").toLowerCase();
  const quality = ["low", "medium", "high"].includes(rawQuality) ? rawQuality : "medium";
  const size = String(params.size ?? "1024x1024").toLowerCase();
  const tier = resolutionTier(size === "auto" ? "1024x1024" : size);
  const keys = [
    `${model}:${size === "auto" ? "1024x1024" : size}:${quality}`,
    `${model}:${tier}:${quality}`,
    `${model}-${quality}`,
    model,
  ];
  for (const key of keys) {
    const row = creditCosts.find((r) => r.feature === "generate_openai_image" && r.model === key);
    if (row) return row.cost;
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
    if (apiModel.startsWith("gpt-image") || apiModel.startsWith("dall-e")) {
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
    const apiModel = modelName || "gemini-2.5-flash-preview-tts";
    const match = creditCosts.find(
      (r) => r.feature === "text_to_speech" && r.model === apiModel,
    );
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
      const perSecondMatch = creditCosts.find(
        (r) =>
          r.feature === "generate_freepik_video" &&
          r.model === model &&
          r.pricing_type === "per_second",
      );
      if (perSecondMatch) {
        const refDuration = params._ref_video_duration as number | undefined;
        if (!refDuration || refDuration <= 0) return null; // ⚠️ N/A
        return Math.ceil(perSecondMatch.cost * refDuration);
      }
    }

    // ── Standard models: fixed pricing (duration + audio match) preferred ──
    const rawDuration = params.duration ?? params.extend_duration ?? "5";
    const duration = parseInt(String(rawDuration), 10) || 5;
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
          r.model === `${model}:${resolution}` &&
          r.pricing_type === "per_second" &&
          (r.has_audio ?? false) === hasAudio,
      );
      if (resolutionExact) return Math.ceil(resolutionExact.cost * duration);

      if (hasAudio) {
        const noAudioResolution = creditCosts.find(
          (r) =>
            r.feature === "generate_freepik_video" &&
            r.model === `${model}:${resolution}` &&
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
        r.model === model &&
        r.pricing_type === "fixed" &&
        r.duration_seconds === duration &&
        (r.has_audio ?? false) === hasAudio,
    );
    if (exactMatch) return exactMatch.cost;

    // 2. Duration-only fixed match (ignore audio)
    const durationMatch = creditCosts.find(
      (r) =>
        r.feature === "generate_freepik_video" &&
        r.model === model &&
        r.pricing_type === "fixed" &&
        r.duration_seconds === duration,
    );
    if (durationMatch) return durationMatch.cost;

    // 3. per_second — strict match including audio with smart fallback
    let stdPerSecondMatch = creditCosts.find(
      (r) =>
        r.feature === "generate_freepik_video" &&
        r.model === model &&
        r.pricing_type === "per_second" &&
        (r.has_audio ?? false) === hasAudio,
    );
    let stdFinalPerSecCost = stdPerSecondMatch?.cost;
    if (!stdPerSecondMatch && hasAudio) {
      const basePerSec = creditCosts.find(
        (r) =>
          r.feature === "generate_freepik_video" &&
          r.model === model &&
          r.pricing_type === "per_second" &&
          (r.has_audio ?? false) === false,
      );
      if (basePerSec) stdFinalPerSecCost = basePerSec.cost * 2;
    }
    if (stdFinalPerSecCost) return Math.ceil(stdFinalPerSecCost * duration);

    // 4. Any match for this model
    const anyMatch = creditCosts.find(
      (r) => r.feature === "generate_freepik_video" && r.model === model,
    );
    return anyMatch?.cost ?? null;
  }

  return null;
}
