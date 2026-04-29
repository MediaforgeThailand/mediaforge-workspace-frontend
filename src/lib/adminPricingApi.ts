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
  | "merge_audio_video";

export type PricingType = "fixed" | "per_second" | "per_operation";

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
};

// ─── Constants exposed for the form UI ──────────────────────────────────

export const FEATURE_OPTIONS: ReadonlyArray<{ value: PricingFeature; label: string }> = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "text", label: "Text / Chat" },
  { value: "model_3d", label: "3D Model" },
  { value: "remove_background", label: "Remove Background" },
  { value: "merge_audio_video", label: "Merge Audio + Video" },
];

export const PRICING_TYPE_OPTIONS: ReadonlyArray<{ value: PricingType; label: string }> = [
  { value: "fixed", label: "Fixed (per generation)" },
  { value: "per_second", label: "Per second" },
  { value: "per_operation", label: "Per operation" },
];
