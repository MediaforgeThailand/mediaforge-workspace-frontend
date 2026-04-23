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
