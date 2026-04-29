// React Query hooks for the workspace pricing admin page.
//
// Pattern matches `useUserClassMemberships` etc. — useQuery for reads,
// useMutation for writes, with optimistic cache updates so the table
// doesn't visibly flicker after an edit/delete.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminPricingApi,
  type CreditCostRow,
  type UpsertCreditCostInput,
} from "@/lib/adminPricingApi";

export const PRICING_QUERY_KEY = ["admin", "credit_costs"] as const;

/** List all pricing rows (cached for 30s, manually invalidated on writes). */
export function usePricingList() {
  return useQuery<CreditCostRow[]>({
    queryKey: PRICING_QUERY_KEY,
    queryFn: () => adminPricingApi.listPricing(),
    staleTime: 30_000,
  });
}

/**
 * Create a new credit_cost row.
 *
 * Optimistic update: prepend a placeholder row so the table reflects the
 * change immediately. On settle we invalidate to refetch the canonical
 * order from the backend.
 */
export function useCreatePrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<UpsertCreditCostInput, "id">) =>
      adminPricingApi.createPrice(input),

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: PRICING_QUERY_KEY });
      const previous = qc.getQueryData<CreditCostRow[]>(PRICING_QUERY_KEY);
      const optimistic: CreditCostRow = {
        id: `optimistic-${Date.now()}`,
        feature: input.feature,
        model: input.model ?? null,
        label: input.label,
        cost: input.cost,
        pricing_type: input.pricing_type ?? null,
        duration_seconds: input.duration_seconds ?? null,
        has_audio: input.has_audio ?? false,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<CreditCostRow[]>(PRICING_QUERY_KEY, (old) =>
        old ? [optimistic, ...old] : [optimistic],
      );
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(PRICING_QUERY_KEY, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: PRICING_QUERY_KEY });
    },
  });
}

/**
 * Update an existing credit_cost row.
 *
 * Optimistic update: replace the row in the cache with the merged values.
 * Rolled back on error.
 */
export function useUpdatePrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Omit<UpsertCreditCostInput, "id"> }) =>
      adminPricingApi.updatePrice(id, input),

    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: PRICING_QUERY_KEY });
      const previous = qc.getQueryData<CreditCostRow[]>(PRICING_QUERY_KEY);
      qc.setQueryData<CreditCostRow[]>(PRICING_QUERY_KEY, (old) =>
        old?.map((row) =>
          row.id === id
            ? {
                ...row,
                feature: input.feature,
                model: input.model ?? null,
                label: input.label,
                cost: input.cost,
                pricing_type: input.pricing_type ?? null,
                duration_seconds: input.duration_seconds ?? null,
                has_audio: input.has_audio ?? false,
              }
            : row,
        ) ?? [],
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(PRICING_QUERY_KEY, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: PRICING_QUERY_KEY });
    },
  });
}

/**
 * Delete a credit_cost row.
 *
 * Optimistic update: remove from cache immediately. Rolled back on error.
 */
export function useDeletePrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminPricingApi.deletePrice(id),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: PRICING_QUERY_KEY });
      const previous = qc.getQueryData<CreditCostRow[]>(PRICING_QUERY_KEY);
      qc.setQueryData<CreditCostRow[]>(PRICING_QUERY_KEY, (old) =>
        old?.filter((row) => row.id !== id) ?? [],
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(PRICING_QUERY_KEY, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: PRICING_QUERY_KEY });
    },
  });
}
