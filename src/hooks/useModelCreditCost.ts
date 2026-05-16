import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CreditCostEntry {
  feature: string;
  model: string | null;
  cost: number;
  pricing_type: string;
  duration_seconds: number | null;
  has_audio: boolean;
}

export function useModelCreditCost() {
  const [costs, setCosts] = useState<CreditCostEntry[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("credit_costs")
        .select("feature, model, cost, pricing_type, duration_seconds, has_audio");
      if (data) setCosts(data as CreditCostEntry[]);
    };
    fetch();
  }, []);

  /**
   * Get credit cost for a feature+model combo.
   * For per_second/per_minute pricing, pass durationSeconds to get total cost.
   * For fixed pricing, pass durationSeconds and hasAudio to find exact row.
   * For per_operation, just pass feature and model.
   */
  const getCost = (
    feature: string,
    model?: string,
    durationSeconds?: number,
    hasAudio?: boolean
  ): number | null => {
    if (!costs.length) return null;

    if (model) {
      // Check pricing type for this model
      const aliases =
        model === "gemini-3.1-flash-tts-preview" ||
        model === "gemini-3.1-preview-flash-tts" ||
        model === "gemini-3.1-flash-preview-tts"
          ? ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]
          : [model];
      const modelEntries = aliases
        .flatMap(alias => costs.filter(c => c.feature === feature && c.model === alias));
      if (!modelEntries.length) {
        // Fallback to default (no model)
        const def = costs.find(c => c.feature === feature && !c.model);
        return def?.cost ?? null;
      }

      const pricingType = modelEntries[0].pricing_type;

      if (pricingType === "per_second") {
        const entry = modelEntries[0];
        if (durationSeconds) return entry.cost * durationSeconds;
        return entry.cost; // return per-second cost if no duration specified
      }

      if (pricingType === "per_minute") {
        const entry = modelEntries[0];
        if (durationSeconds) return Math.ceil((entry.cost * durationSeconds) / 60);
        return entry.cost;
      }

      if (pricingType === "fixed") {
        // Find exact match for duration + audio
        const exact = modelEntries.find(
          c => c.duration_seconds === (durationSeconds ?? 5) && c.has_audio === (hasAudio ?? false)
        );
        if (exact) return exact.cost;
        // Fallback to first entry for this model
        return modelEntries[0].cost;
      }

      // per_operation
      return modelEntries[0].cost;
    }

    // No model specified - find default
    const def = costs.find(c => c.feature === feature && !c.model);
    return def?.cost ?? null;
  };

  /**
   * Get pricing type for a model: 'per_second', 'fixed', or 'per_operation'
   */
  const getPricingType = (feature: string, model: string): string | null => {
    const entry = costs.find(c => c.feature === feature && c.model === model);
    return entry?.pricing_type ?? null;
  };

  /**
   * Get available durations for a fixed-price model
   */
  const getAvailableDurations = (feature: string, model: string): number[] => {
    const entries = costs.filter(
      c => c.feature === feature && c.model === model && c.pricing_type === "fixed" && c.duration_seconds !== null
    );
    const durations = [...new Set(entries.map(c => c.duration_seconds!))];
    return durations.sort((a, b) => a - b);
  };

  /**
   * Check if a model supports audio pricing
   */
  const hasAudioPricing = (feature: string, model: string): boolean => {
    return costs.some(c => c.feature === feature && c.model === model && c.has_audio === true);
  };

  /**
   * Get min and max cost for a feature+model combo across all duration/audio variants.
   * Returns { min, max, pricingType } or null if not found.
   */
  const getCostRange = (
    feature: string,
    model: string
  ): { min: number; max: number; pricingType: string } | null => {
    if (!costs.length) return null;
    const entries = costs.filter(c => c.feature === feature && c.model === model);
    if (!entries.length) return null;
    const pricingType = entries[0].pricing_type;
    if (pricingType === "per_second" || pricingType === "per_minute") {
      // Unit-rate rows have a single base rate.
      const allCosts = entries.map(c => c.cost);
      return { min: Math.min(...allCosts), max: Math.max(...allCosts), pricingType };
    }
    // Fixed or per_operation — show range across all variants
    const allCosts = entries.map(c => c.cost);
    return { min: Math.min(...allCosts), max: Math.max(...allCosts), pricingType };
  };

  return { getCost, getCostRange, getPricingType, getAvailableDurations, hasAudioPricing };
}
