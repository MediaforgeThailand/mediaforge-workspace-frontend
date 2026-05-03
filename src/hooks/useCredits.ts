import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface CreditBalance {
  /** Current available credits (source of truth from user_credits table) */
  balance: number;
  /** Lifetime total credits ever received */
  total_purchased: number;
  /** Lifetime total credits ever used */
  total_used: number;
  /** True when this user is billed through a domain-level shared pool. */
  is_shared_pool?: boolean;
  pool_domain?: string | null;
  pool_user_id?: string | null;
  organization_id?: string | null;
  organization_name?: string | null;
  organization_type?: string | null;
  credit_scope?: "user" | "organization" | "team" | "education_space";
  team_id?: string | null;
  team_name?: string | null;
  personal_balance?: number;
  personal_total_purchased?: number;
  personal_total_used?: number;
  shared_balance?: number | null;
  shared_total?: number | null;
  shared_used?: number | null;
}

function unwrapCreditBalance(payload: unknown): CreditBalance | null {
  const row = ((payload as { data?: unknown } | null)?.data ?? payload) as CreditBalance | null;
  if (!row) return null;
  return {
    balance: Number(row.balance ?? 0),
    total_purchased: Number(row.total_purchased ?? 0),
    total_used: Number(row.total_used ?? 0),
    is_shared_pool: Boolean(row.is_shared_pool),
    pool_domain: row.pool_domain ?? null,
    pool_user_id: row.pool_user_id ?? null,
    organization_id: row.organization_id ?? null,
    organization_name: row.organization_name ?? null,
    organization_type: row.organization_type ?? null,
    credit_scope: row.credit_scope ?? (row.is_shared_pool ? "organization" : "user"),
    team_id: row.team_id ?? null,
    team_name: row.team_name ?? null,
    personal_balance: Number(row.personal_balance ?? row.balance ?? 0),
    personal_total_purchased: Number(row.personal_total_purchased ?? row.total_purchased ?? 0),
    personal_total_used: Number(row.personal_total_used ?? row.total_used ?? 0),
    shared_balance: row.shared_balance == null ? null : Number(row.shared_balance),
    shared_total: row.shared_total == null ? null : Number(row.shared_total),
    shared_used: row.shared_used == null ? null : Number(row.shared_used),
  };
}

/**
 * Shared, cached credit balance hook.
 *
 * Uses React Query so all 10+ consumers share a single cache entry.
 * This eliminates the "0 → real value" flicker that happened when each
 * component had its own local state and re-fetched from scratch on mount.
 *
 * Realtime: subscribes to `user_credits` row updates and invalidates the
 * query so the balance stays in sync after a run / top-up.
 */
export const useCredits = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["user-credits", user?.id] as const;

  const { data: credits, isLoading: loading, refetch } = useQuery<CreditBalance | null>({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data: functionData, error: functionError } = await supabase.functions.invoke(
        "admin_workspace_pricing",
        { body: { action: "get_workspace_credit_balance" } },
      );
      if (!functionError) {
        return unwrapCreditBalance(functionData);
      }

      const { data } = await supabase
        .from("user_credits")
        .select("balance, total_purchased, total_used")
        .eq("user_id", user.id)
        .maybeSingle();
      return (data as CreditBalance | null) ?? null;
    },
    // Keep previous data visible while refetching → prevents flicker to 0
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => query.state.data?.is_shared_pool ? 15_000 : false,
    placeholderData: (prev) => prev,
  });

  // Realtime subscription — invalidate when balance changes server-side.
  // Multiple consumers call this hook (sidebar, bottom nav, topbar, etc.) and
  // Supabase's `channel(topic)` returns the existing channel if one with the
  // same topic is already registered. Calling `.on("postgres_changes", …)` on
  // an already-subscribed channel throws, so the first mount owns the channel
  // and subsequent mounts no-op — React Query's shared cache means one callback
  // invalidates for all consumers.
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    const topic = `user-credits-${userId}`;
    const alreadyOwned = supabase
      .getChannels()
      .some((c) => c.topic === `realtime:${topic}`);
    if (alreadyOwned) return;

    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_credits", filter: `user_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: ["user-credits", userId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  return {
    credits: credits ?? null,
    loading,
    refetch: async () => { await refetch(); },
  };
};
