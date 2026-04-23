import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useReferralStats } from "@/hooks/useReferralStats";
import ProgressBarCard from "@/components/referral/ProgressBarCard";
import ReferralLinkCard from "@/components/referral/ReferralLinkCard";
import CashWalletCard from "@/components/referral/CashWalletCard";
import PartnerCTACard from "@/components/referral/PartnerCTACard";
import RecentReferralsCard from "@/components/referral/RecentReferralsCard";
import PayoutHistoryCard from "@/components/referral/PayoutHistoryCard";
import { useAffiliateEarnings } from "@/hooks/useAffiliateEarnings";

const ReferEarn = () => {
  const { data, isLoading } = useReferralStats();
  const { data: earnings } = useAffiliateEarnings();

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em" }}>
          Refer & Earn
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Invite friends to MediaForge and earn up to 5,000 credits.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — main card spans 2 cols */}
        <div className="lg:col-span-2">
          <Card className="p-6 md:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold" style={{ letterSpacing: "-0.02em" }}>
                Refer Friends & Earn Credits
              </h2>
            </div>

            {isLoading || !data ? (
              <div className="space-y-6">
                <Skeleton className="h-32" />
                <Skeleton className="h-20" />
                <Skeleton className="h-24" />
              </div>
            ) : (
              <>
                <ProgressBarCard
                  earnedCredits={data.earnedCredits}
                  friendsJoined={data.friendsJoined}
                />
                <Separator />
                <ReferralLinkCard code={data.code} />
                <Separator />
                <CashWalletCard balance={data.balance} />
              </>
            )}
          </Card>
        </div>

        {/* RIGHT — partner CTA + recent + payouts */}
        <div className="space-y-6">
          {!data?.isPartner && <PartnerCTACard />}
          {isLoading || !data ? (
            <Card className="p-6">
              <Skeleton className="h-40" />
            </Card>
          ) : (
            <RecentReferralsCard referrals={data.recent} />
          )}
          {earnings?.isPartner && <PayoutHistoryCard />}
        </div>
      </div>
    </div>
  );
};

export default ReferEarn;
