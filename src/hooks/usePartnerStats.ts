import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CommissionEvent {
  id: string;
  partner_user_id: string;
  referred_user_id: string;
  referral_id: string;
  commission_amount_thb: number;
  net_amount_thb: number;
  gross_amount_thb: number;
  status: "holding" | "available" | "paid" | "clawback" | "void";
  hold_until: string;
  available_at: string | null;
  paid_at: string | null;
  created_at: string;
  commission_rate: number;
  billing_cycle: string | null;
  cycle_index: number | null;
}

export interface PartnerRow {
  user_id: string;
  commission_rate: number;
  tier: string;
  approved_at: string;
  lifetime_commission_thb: number;
  lifetime_paid_thb: number;
}

export interface ReferralCodeRow {
  id: string;
  code: string;
  code_type: "user_referral" | "partner_affiliate";
  campaign_label: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PayoutRequestRow {
  id: string;
  amount_thb: number;
  status: "pending" | "processing" | "paid" | "failed" | "cancelled";
  requested_at: string;
  processed_at: string | null;
  failure_reason: string | null;
  proof_url: string | null;
  commission_ids: string[];
  bank_snapshot: Record<string, unknown>;
}

export const usePartner = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["partner", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<PartnerRow | null> => {
      const { data } = await supabase
        .from("partners")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data as PartnerRow) ?? null;
    },
  });
};

export const useCommissions = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["commissions", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<CommissionEvent[]> => {
      const { data } = await supabase
        .from("commission_events")
        .select("*")
        .eq("partner_user_id", user!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as CommissionEvent[];
    },
  });
};

export const usePartnerCodes = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["partner-codes", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ReferralCodeRow[]> => {
      const { data } = await supabase
        .from("referral_codes")
        .select("*")
        .eq("user_id", user!.id)
        .eq("code_type", "partner_affiliate")
        .order("created_at", { ascending: false });
      return (data ?? []) as ReferralCodeRow[];
    },
  });
};

export const useFunnelStats = (rangeDays: 7 | 30 | 90 = 30) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["partner-funnel", user?.id, rangeDays],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();

      const { data: codes } = await supabase
        .from("referral_codes")
        .select("id")
        .eq("user_id", user!.id);
      const codeIds = (codes ?? []).map((c) => c.id);

      let clicks = 0;
      if (codeIds.length > 0) {
        // NOTE: referral_clicks uses `clicked_at` column (not `created_at`)
        const { count } = await supabase
          .from("referral_clicks")
          .select("*", { count: "exact", head: true })
          .in("code_id", codeIds)
          .gte("clicked_at", since);
        clicks = count ?? 0;
      }

      const { count: signupsCount } = await supabase
        .from("referrals")
        .select("*", { count: "exact", head: true })
        .eq("referrer_user_id", user!.id)
        .gte("created_at", since);

      const { count: paidCount } = await supabase
        .from("commission_events")
        .select("referred_user_id", { count: "exact", head: true })
        .eq("partner_user_id", user!.id)
        .gte("created_at", since);

      return {
        clicks,
        signups: signupsCount ?? 0,
        paid: paidCount ?? 0,
      };
    },
  });
};

/** Referral list with attribution + commission sum (for Referral List Card) */
export interface ReferralWithCommission {
  id: string;
  referred_user_id: string;
  code_id: string;
  code: string | null;
  campaign_label: string | null;
  attribution_status: "pending" | "confirmed" | "rejected" | "fraud";
  risk_score: number;
  created_at: string;
  confirmed_at: string | null;
  commission_sum_thb: number;
  commission_count: number;
}

export const useReferralList = (limit = 50) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["partner-referrals", user?.id, limit],
    enabled: !!user,
    queryFn: async (): Promise<ReferralWithCommission[]> => {
      const { data: refs } = await supabase
        .from("referrals")
        .select("id, referred_user_id, code_id, attribution_status, risk_score, confirmed_at, created_at")
        .eq("referrer_user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      const referrals = (refs ?? []) as Array<{
        id: string;
        referred_user_id: string;
        code_id: string;
        attribution_status: ReferralWithCommission["attribution_status"];
        risk_score: number;
        confirmed_at: string | null;
        created_at: string;
      }>;

      if (referrals.length === 0) return [];

      // Enrich with code labels
      const codeIds = Array.from(new Set(referrals.map((r) => r.code_id)));
      const { data: codes } = await supabase
        .from("referral_codes")
        .select("id, code, campaign_label")
        .in("id", codeIds);
      const codeMap = new Map<string, { code: string; campaign_label: string | null }>();
      (codes ?? []).forEach((c: { id: string; code: string; campaign_label: string | null }) => {
        codeMap.set(c.id, { code: c.code, campaign_label: c.campaign_label });
      });

      // Enrich with commission aggregates
      const refIds = referrals.map((r) => r.id);
      const { data: comms } = await supabase
        .from("commission_events")
        .select("referral_id, commission_amount_thb, status")
        .eq("partner_user_id", user!.id)
        .in("referral_id", refIds)
        .neq("status", "void");
      const commMap = new Map<string, { sum: number; count: number }>();
      (comms ?? []).forEach((c: { referral_id: string; commission_amount_thb: number }) => {
        const cur = commMap.get(c.referral_id) ?? { sum: 0, count: 0 };
        cur.sum += Number(c.commission_amount_thb);
        cur.count += 1;
        commMap.set(c.referral_id, cur);
      });

      return referrals.map((r) => {
        const codeInfo = codeMap.get(r.code_id);
        const comm = commMap.get(r.id) ?? { sum: 0, count: 0 };
        return {
          id: r.id,
          referred_user_id: r.referred_user_id,
          code_id: r.code_id,
          code: codeInfo?.code ?? null,
          campaign_label: codeInfo?.campaign_label ?? null,
          attribution_status: r.attribution_status,
          risk_score: r.risk_score,
          created_at: r.created_at,
          confirmed_at: r.confirmed_at,
          commission_sum_thb: comm.sum,
          commission_count: comm.count,
        };
      });
    },
  });
};

/** Per-code stats (clicks + signups + earnings) for LinksManager */
export interface PerCodeStats {
  clicks: number;
  signups: number;
  earnings_thb: number;
}

export const usePerCodeStats = (codes: ReferralCodeRow[] | undefined, rangeDays: 7 | 30 | 90 = 30) => {
  const { user } = useAuth();
  const codeIds = (codes ?? []).map((c) => c.id).sort().join(",");
  return useQuery({
    queryKey: ["per-code-stats", user?.id, codeIds, rangeDays],
    enabled: !!user && !!codes && codes.length > 0,
    queryFn: async (): Promise<Map<string, PerCodeStats>> => {
      const ids = (codes ?? []).map((c) => c.id);
      const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();
      const result = new Map<string, PerCodeStats>();
      ids.forEach((id) => result.set(id, { clicks: 0, signups: 0, earnings_thb: 0 }));

      if (ids.length === 0) return result;

      // Clicks per code (referral_clicks.code_id)
      const { data: clicksRows } = await supabase
        .from("referral_clicks")
        .select("code_id")
        .in("code_id", ids)
        .gte("clicked_at", since);
      (clicksRows ?? []).forEach((r: { code_id: string | null }) => {
        if (!r.code_id) return;
        const slot = result.get(r.code_id);
        if (slot) slot.clicks += 1;
      });

      // Signups per code (referrals.code_id)
      const { data: refRows } = await supabase
        .from("referrals")
        .select("id, code_id")
        .in("code_id", ids)
        .gte("created_at", since);
      const referralIdToCodeId = new Map<string, string>();
      (refRows ?? []).forEach((r: { id: string; code_id: string }) => {
        const slot = result.get(r.code_id);
        if (slot) slot.signups += 1;
        referralIdToCodeId.set(r.id, r.code_id);
      });

      // Earnings per code (commission_events.referral_id → code_id)
      const referralIds = Array.from(referralIdToCodeId.keys());
      if (referralIds.length > 0) {
        const { data: commRows } = await supabase
          .from("commission_events")
          .select("referral_id, commission_amount_thb, status")
          .eq("partner_user_id", user!.id)
          .in("referral_id", referralIds)
          .neq("status", "void");
        (commRows ?? []).forEach((c: { referral_id: string; commission_amount_thb: number; status: string }) => {
          const codeId = referralIdToCodeId.get(c.referral_id);
          if (!codeId) return;
          const slot = result.get(codeId);
          if (slot) slot.earnings_thb += Number(c.commission_amount_thb);
        });
      }

      return result;
    },
  });
};

export const usePayoutRequests = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["payout-requests", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<PayoutRequestRow[]> => {
      const { data } = await supabase
        .from("payout_requests")
        .select("*")
        .eq("partner_user_id", user!.id)
        .order("requested_at", { ascending: false })
        .limit(20);
      return (data ?? []) as PayoutRequestRow[];
    },
  });
};

/** Realtime: toast on new commission_event for this partner */
export const useCommissionRealtime = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    const topic = `commissions-${userId}`;
    const alreadyOwned = supabase
      .getChannels()
      .some((c) => c.topic === `realtime:${topic}`);
    if (alreadyOwned) return;

    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "commission_events",
          filter: `partner_user_id=eq.${userId}`,
        },
        (payload) => {
          const evt = payload.new as CommissionEvent;
          toast.success(`New commission earned: ฿${Number(evt.commission_amount_thb).toFixed(2)}`);
          qc.invalidateQueries({ queryKey: ["commissions"] });
          qc.invalidateQueries({ queryKey: ["partner"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);
};
