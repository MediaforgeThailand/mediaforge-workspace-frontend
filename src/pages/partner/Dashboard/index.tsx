import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  usePartner,
  useCommissions,
  useFunnelStats,
  usePartnerCodes,
  usePayoutRequests,
  useCommissionRealtime,
} from "@/hooks/usePartnerStats";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import OverviewCards from "./OverviewCards";
import FunnelCard from "./FunnelCard";
import CommissionChart from "./CommissionChart";
import LinksManager from "./LinksManager";
import PayoutPanel from "./PayoutPanel";
import ReferralListCard from "./ReferralListCard";
import CommissionDetailTable from "./CommissionDetailTable";
import HoldingScheduleCard from "./HoldingScheduleCard";
import HowItWorksCard from "./HowItWorksCard";

type FunnelRange = 7 | 30 | 90;

const PartnerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [funnelRange, setFunnelRange] = useState<FunnelRange>(30);
  const partnerQ = usePartner();
  const commissionsQ = useCommissions();
  const funnelQ = useFunnelStats(funnelRange);
  const codesQ = usePartnerCodes();
  const payoutsQ = usePayoutRequests();
  useCommissionRealtime();

  const [baseCode, setBaseCode] = useState<string | undefined>(undefined);

  // Gate: redirect non-partners
  useEffect(() => {
    if (!user) return;
    if (partnerQ.isLoading) return;
    if (!partnerQ.data) {
      navigate("/app/partner/apply", { replace: true });
    }
  }, [user, partnerQ.isLoading, partnerQ.data, navigate]);

  // Look up the user's base referral code (MF-XXXXXX) for naming new campaign codes
  useEffect(() => {
    if (!user) return;
    supabase
      .from("referral_codes")
      .select("code")
      .eq("user_id", user.id)
      .eq("code_type", "user_referral")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.code) setBaseCode(data.code);
      });
  }, [user]);

  if (partnerQ.isLoading || !partnerQ.data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em" }}>
          Partner dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track your commissions, conversions and payouts
        </p>
      </div>

      <OverviewCards
        partner={partnerQ.data}
        commissions={commissionsQ.data}
        loading={commissionsQ.isLoading}
      />

      <HoldingScheduleCard
        commissions={commissionsQ.data}
        loading={commissionsQ.isLoading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FunnelCard
          data={funnelQ.data}
          loading={funnelQ.isLoading}
          range={funnelRange}
          onRangeChange={setFunnelRange}
        />
        <CommissionChart commissions={commissionsQ.data} loading={commissionsQ.isLoading} />
      </div>

      <LinksManager codes={codesQ.data} loading={codesQ.isLoading} partnerCode={baseCode} />

      <ReferralListCard />

      <CommissionDetailTable
        commissions={commissionsQ.data}
        loading={commissionsQ.isLoading}
      />

      <PayoutPanel
        commissions={commissionsQ.data}
        payouts={payoutsQ.data}
        loading={commissionsQ.isLoading || payoutsQ.isLoading}
      />

      <HowItWorksCard
        commissionRate={Number(partnerQ.data.commission_rate)}
        tier={partnerQ.data.tier}
      />
    </div>
  );
};

export default PartnerDashboard;
