import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AffiliateEarnings {
  isPartner: boolean;
  lifetime_thb: number;
  holding_thb: number;
  available_thb: number; // released, ready to be requested
  paid_thb: number;
  reversed_thb: number;
  pending_payout_thb: number; // locked into pending/approved payout
  available_to_withdraw_thb: number; // available - pending_payout
}

const empty: AffiliateEarnings = {
  isPartner: false,
  lifetime_thb: 0,
  holding_thb: 0,
  available_thb: 0,
  paid_thb: 0,
  reversed_thb: 0,
  pending_payout_thb: 0,
  available_to_withdraw_thb: 0,
};

export function useAffiliateEarnings() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery<AffiliateEarnings>({
    queryKey: ["affiliate-earnings", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return empty;

      const { data: partner } = await supabase
        .from("partners")
        .select("user_id, suspended_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (!partner || partner.suspended_at) return empty;

      const [{ data: events }, { data: pendingPayouts }] = await Promise.all([
        supabase
          .from("commission_events")
          .select("status, commission_amount_thb")
          .eq("partner_user_id", userId),
        supabase
          .from("payout_requests")
          .select("amount_thb")
          .eq("partner_user_id", userId)
          .in("status", ["pending", "approved", "processing"]),
      ]);

      const sums = (events ?? []).reduce<Record<string, number>>((acc, e: any) => {
        const amt = Number(e.commission_amount_thb) || 0;
        acc[e.status] = (acc[e.status] ?? 0) + amt;
        return acc;
      }, {});

      const holding = sums["holding"] ?? 0;
      const available = sums["available"] ?? 0;
      const paid = sums["paid"] ?? 0;
      const reversed = sums["reversed"] ?? 0;

      const pendingPayout = (pendingPayouts ?? []).reduce(
        (s, p: any) => s + (Number(p.amount_thb) || 0),
        0,
      );

      return {
        isPartner: true,
        lifetime_thb: holding + available + paid,
        holding_thb: holding,
        available_thb: available,
        paid_thb: paid,
        reversed_thb: reversed,
        pending_payout_thb: pendingPayout,
        available_to_withdraw_thb: Math.max(0, available - pendingPayout),
      };
    },
  });
}
