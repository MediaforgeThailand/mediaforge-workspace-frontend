// Wrapper for the workspace `admin_workspace_pricing` edge function.
//
// The edge function uses a single POST endpoint with a `{ action, ... }`
// body shape (see mediaforge-workspace-backend/supabase/functions/
// admin_workspace_pricing/index.ts). Keeping the action names in one
// place here means the React Query hooks don't have to know the wire
// format — they just call `adminPricingApi.listPricing()` etc.
//
// The function is `verify_jwt: false` on the backend (admin auth lives
// in a different Supabase project), so we don't need to forward a
// session token. We still send the publishable key as `apikey` because
// Supabase's edge runtime expects it for routing.

import { supabase } from "@/integrations/supabase/client";

const FUNCTION_NAME = "admin_workspace_pricing";

// ─── Types ──────────────────────────────────────────────────────────────

export type PricingFeature =
  | "image"
  | "video"
  | "audio"
  | "text"
  | "model_3d"
  | "remove_background"
  | "merge_audio_video"
  | "generate_openai_image"
  | "generate_freepik_image"
  | "generate_freepik_video"
  | "text_to_speech"
  | "video_to_prompt";

export type PricingType = "fixed" | "per_second" | "per_operation" | "per_1k_chars";

export interface CreditCostRow {
  id: string;
  feature: string;
  model: string | null;
  label: string;
  cost: number;
  pricing_type: string | null;
  duration_seconds: number | null;
  has_audio: boolean | null;
  created_at: string;
  provider?: string | null;
  price_key?: string | null;
  resolution?: string | null;
  quality?: string | null;
  source?: string | null;
  source_url?: string | null;
  source_ratio?: number | null;
  provider_unit?: string | null;
  notes?: string | null;
  updated_at?: string | null;
}

export interface UpsertCreditCostInput {
  /** When set, the row with this id is updated; otherwise a new row is inserted. */
  id?: string | null;
  feature: string;
  model?: string | null;
  label: string;
  cost: number;
  pricing_type?: string | null;
  duration_seconds?: number | null;
  has_audio?: boolean;
  provider?: string | null;
  price_key?: string | null;
  resolution?: string | null;
  quality?: string | null;
  source?: string | null;
  source_url?: string | null;
  source_ratio?: number | null;
  provider_unit?: string | null;
  notes?: string | null;
}

export interface PricingCatalogResponse {
  ratios: {
    flow_credits_per_thb: number;
    workspace_credits_per_thb: number;
    flow_to_workspace_ratio: number;
  };
  rows: UpsertCreditCostInput[];
}

export interface BulkPricingResult {
  written?: number;
  imported?: number;
  ratio: number;
  rows: CreditCostRow[];
}

// ─── Internal call helper ───────────────────────────────────────────────

interface ActionEnvelope<T> {
  data?: T;
  error?: string;
}

async function invoke<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke<ActionEnvelope<T>>(FUNCTION_NAME, {
    body: { action, ...payload },
  });

  if (error) {
    // supabase-js wraps non-2xx responses; try to surface the backend message
    // when present.
    const fnErr = error as unknown as { message?: string; context?: { error?: string } };
    const msg =
      (data as ActionEnvelope<T> | null | undefined)?.error ??
      fnErr?.context?.error ??
      fnErr?.message ??
      "Pricing API call failed";
    throw new Error(msg);
  }
  if (!data) {
    throw new Error("Pricing API returned an empty response");
  }
  if (data.error) {
    throw new Error(data.error);
  }
  if (data.data === undefined) {
    throw new Error("Pricing API response missing `data` envelope");
  }
  return data.data;
}

// ─── Public API ─────────────────────────────────────────────────────────

export const adminPricingApi = {
  /** List every credit_cost row (sorted feature, model on the backend). */
  listPricing(): Promise<CreditCostRow[]> {
    return invoke<CreditCostRow[]>("list_credit_costs");
  },

  /** Insert a new pricing row. */
  createPrice(input: Omit<UpsertCreditCostInput, "id">): Promise<CreditCostRow> {
    return invoke<CreditCostRow>("upsert_credit_cost", { ...input, id: null });
  },

  /** Update an existing pricing row by id. */
  updatePrice(id: string, input: Omit<UpsertCreditCostInput, "id">): Promise<CreditCostRow> {
    return invoke<CreditCostRow>("upsert_credit_cost", { ...input, id });
  },

  /** Delete a pricing row by id. */
  deletePrice(id: string): Promise<{ id: string }> {
    return invoke<{ id: string }>("delete_credit_cost", { id });
  },

  getPricingCatalog(): Promise<PricingCatalogResponse> {
    return invoke<PricingCatalogResponse>("get_pricing_catalog");
  },

  seedWorkspaceCatalog(): Promise<BulkPricingResult> {
    return invoke<BulkPricingResult>("seed_workspace_pricing_catalog");
  },

  importFlowCreditCosts(): Promise<BulkPricingResult> {
    return invoke<BulkPricingResult>("import_flow_credit_costs");
  },
};

// ─── Constants exposed for the form UI ──────────────────────────────────

export const FEATURE_OPTIONS: ReadonlyArray<{ value: PricingFeature; label: string }> = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "text", label: "Text / Chat" },
  { value: "generate_openai_image", label: "OpenAI Image" },
  { value: "generate_freepik_image", label: "Image Provider" },
  { value: "generate_freepik_video", label: "Video Provider" },
  { value: "text_to_speech", label: "Text to Speech" },
  { value: "video_to_prompt", label: "Video to Prompt" },
  { value: "model_3d", label: "3D Model" },
  { value: "remove_background", label: "Remove Background" },
  { value: "merge_audio_video", label: "Merge Audio + Video" },
];

export const PRICING_TYPE_OPTIONS: ReadonlyArray<{ value: PricingType; label: string }> = [
  { value: "fixed", label: "Fixed (per generation)" },
  { value: "per_second", label: "Per second" },
  { value: "per_operation", label: "Per operation" },
  { value: "per_1k_chars", label: "Per 1K characters" },
];
