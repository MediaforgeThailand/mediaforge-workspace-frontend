/**
 * useCreatorCreditCosts — Fetches credit_costs for authenticated (non-admin) users.
 * Uses direct Supabase client (RLS allows SELECT when auth.uid() IS NOT NULL).
 * Includes Realtime subscription for instant cache invalidation.
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
}

const QUERY_KEY = ["creator-credit-costs"] as const;

export function useCreatorCreditCosts() {
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
    const topic = "creator-credit-costs-rt";
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

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return queryResult;
}
