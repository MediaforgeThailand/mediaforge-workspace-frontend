import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export interface RecentReferral {
  id: string;
  email: string | null;
  created_at: string;
  attribution_status: string;
}

export interface ReferralStats {
  code: string | null;
  balance: number;
  earnedCredits: number;
  friendsJoined: number;
  recent: RecentReferral[];
  isPartner: boolean;
}

export const REFERRAL_CAP = 5000;
export const PER_FRIEND_REWARD = 1000;
export const MAX_FRIENDS = 5;

export function useReferralStats() {
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery<ReferralStats>({
    queryKey: ["referralStats", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) throw new Error("No user");

      const [codeRes, walletRes, confirmedRes, grantsRes, recentRes, partnerRes] = await Promise.all([
        supabase
          .from("referral_codes")
          .select("code")
          .eq("user_id", userId)
          .in("code_type", ["user_referral", "partner_affiliate"])
          .order("code_type", { ascending: true }) // partner_affiliate (p) < user_referral (u) — partner มาก่อน
          .limit(1)
          .maybeSingle(),
        supabase
          .from("cash_wallets")
          .select("balance_thb")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("referrals")
          .select("id", { count: "exact", head: true })
          .eq("referrer_user_id", userId)
          .eq("attribution_status", "confirmed"),
        supabase
          .from("referral_credit_grants")
          .select("credits_amount")
          .eq("user_id", userId)
          .eq("status", "granted"),
        supabase
          .from("referrals")
          .select("id, created_at, attribution_status, referred_user_id")
          .eq("referrer_user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("partners")
          .select("user_id, suspended_at")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      const isPartner = !!partnerRes.data && !partnerRes.data.suspended_at;

      const earnedCredits = (grantsRes.data ?? []).reduce(
        (sum, g: any) => sum + (g.credits_amount || 0),
        0
      );

      // Fetch emails for recent referrals via profiles
      const referredIds = (recentRes.data ?? [])
        .map((r: any) => r.referred_user_id)
        .filter(Boolean);

      let emailMap: Record<string, string | null> = {};
      if (referredIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", referredIds);
        for (const p of profiles ?? []) {
          emailMap[(p as any).user_id] = (p as any).display_name ?? null;
        }
      }

      const recent: RecentReferral[] = (recentRes.data ?? []).map((r: any) => ({
        id: r.id,
        created_at: r.created_at,
        attribution_status: r.attribution_status,
        email: emailMap[r.referred_user_id] ?? null,
      }));

      return {
        code: codeRes.data?.code ?? null,
        balance: Number(walletRes.data?.balance_thb ?? 0),
        earnedCredits,
        friendsJoined: confirmedRes.count ?? 0,
        recent,
        isPartner,
      };
    },
  });

  // Realtime: cash_wallets updates → refetch
  useEffect(() => {
    if (!userId) return;
    const topic = `cash_wallets:${userId}`;
    const alreadyOwned = supabase
      .getChannels()
      .some((c) => c.topic === `realtime:${topic}`);
    if (alreadyOwned) return;

    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_wallets", filter: `user_id=eq.${userId}` },
        () => query.refetch()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return query;
}
