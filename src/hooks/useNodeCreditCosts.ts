/**
 * useNodeCreditCosts — fetches the per-node-type credit cost table.
 *
 * Renamed from `useCreatorCreditCosts` in the workspace cleanup.
 * The hook reads `public.credit_costs` (one row per provider × model
 * tier) so any node on the canvas can compute its run cost without
 * hard-coding numbers. RLS lets any authenticated user SELECT.
 *
 * Realtime channel keeps the cached cost table fresh — when
 * pricing.ts on the backend updates a row, every open canvas pulls
 * the new number on the next render with no manual refetch.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
}

const QUERY_KEY = ["node-credit-costs"] as const;

export function useNodeCreditCosts() {
  const queryClient = useQueryClient();

  const queryResult = useQuery<CreditCostRow[], Error>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_costs")
        .select("*")
        .order("feature")
        .order("cost", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as CreditCostRow[];
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    const topic = "node-credit-costs-rt";
    const alreadyOwned = supabase
      .getChannels()
      .some((c) => c.topic === `realtime:${topic}`);
    if (alreadyOwned) return;

    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_costs" },
        () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return queryResult;
}

/**
 * Backwards-compat alias. The hook was renamed `useCreatorCreditCosts
 * → useNodeCreditCosts` to reflect that it powers BOTH the legacy
 * flow nodes AND the workspace tool nodes (the "creator" branding
 * is gone in Wave 1+). Keeping a thin re-export prevents a flag-day
 * migration of every node file in one go — new code uses the new
 * name, old code keeps working until each node is touched for an
 * unrelated reason and switched over.
 *
 * Safe to delete once `grep -r useCreatorCreditCosts src/` returns
 * zero hits.
 */
export const useCreatorCreditCosts = useNodeCreditCosts;
