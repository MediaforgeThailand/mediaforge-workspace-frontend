/**
 * Frontend display utilities for credits and pricing.
 *
 * IMPORTANT: These are for DISPLAY ONLY (admin/creator dashboards).
 * Actual pricing for execution is centralized in the backend via /quote-flow.
 *
 * The multiplier and revshare must be passed in from `usePlatformMultipliers`
 * to stay in sync with `subscription_settings`. Defaults are provided as a
 * last-resort fallback only.
 */

const DEFAULT_MULTIPLIER = 4.0;
const DEFAULT_REVSHARE = 0.20;

export interface FlowPricingResult {
  apiCost: number;
  multiplier: number;
  sellingPrice: number;
  contributionMargin: number;
  revsharePercent: number;
  creatorPayout: number;
  performanceBonusPercent: number;
  effectiveRevsharePercent: number;
}

export interface FlowPricingOptions {
  /** Markup multiplier (e.g. 4.0). Defaults to 4.0 if not provided. */
  multiplier?: number;
  /** Revshare as decimal (e.g. 0.2 for 20%). Defaults to 0.2. */
  revshare?: number;
}

/**
 * Display-only pricing preview for admin/creator dashboards.
 * Does NOT include subscription discounts — those are backend-only.
 */
export function calculateFlowPricing(
  apiCost: number,
  performanceBonusPercent = 0,
  options: FlowPricingOptions = {},
): FlowPricingResult {
  const multiplier = options.multiplier ?? DEFAULT_MULTIPLIER;
  const revshare = options.revshare ?? DEFAULT_REVSHARE;

  const sellingPrice = Math.ceil(apiCost * multiplier);
  const contributionMargin = sellingPrice - apiCost;
  const effectiveRevshare = Math.min(revshare + performanceBonusPercent / 100, 0.5);
  const creatorPayout = Math.ceil(contributionMargin * effectiveRevshare);

  return {
    apiCost,
    multiplier,
    sellingPrice,
    contributionMargin,
    revsharePercent: revshare * 100,
    creatorPayout,
    performanceBonusPercent,
    effectiveRevsharePercent: effectiveRevshare * 100,
  };
}

/** Format credit amount for display */
export function formatCredits(amount: number): string {
  return amount.toLocaleString();
}
