import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";
import EmbeddedCheckoutModal from "@/components/EmbeddedCheckoutModal";
import PricingHero, { BillingCycleView } from "@/components/pricing/PricingHero";
import PricingCard from "@/components/pricing/PricingCard";
import PricingCompare from "@/components/pricing/PricingCompare";
import PricingFAQ from "@/components/pricing/PricingFAQ";
import TopupSection from "@/components/pricing/TopupSection";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface SubscriptionPlan {
  id: string;
  name: string;
  target: string;
  billing_cycle: string;
  price_thb: number;
  upfront_credits: number;
  flow_quota: number | null;
  discount_official: number;
  discount_community: number;
  sort_order: number;
}

interface TopupPackage {
  id: string;
  name: string;
  credits: number;
  price_thb: number;
  stripe_price_id: string | null;
  is_active: boolean;
  sort_order: number;
}

const BUSINESS_FEATURES: Record<string, string[]> = {
  Starter: [
    "Access to all Flows (Official + Community)",
    "Unlimited Flow Executions",
    "Standard Support",
  ],
  Growth: [
    "Access to all Flows (Official + Community)",
    "Unlimited Flow Executions",
    "Priority Support",
    "5% off Official Flows",
    "Flow Request",
  ],
  Professional: [
    "Access to all Flows (Official + Community)",
    "Unlimited Flow Executions",
    "Priority Support",
    "10% off Official Flows",
    "Flow Request",
    "Early Access to New Flows",
    "Dedicated Onboarding",
  ],
  Enterprise: [
    "Access to all Flows (Official + Community)",
    "Unlimited Flow Executions",
    "Priority Support",
    "20% off Official Flows",
    "Flow Request",
    "Early Access to New Flows",
    "Dedicated Onboarding",
    "Custom Flow Development",
    "Team Collaboration (Coming Soon)",
  ],
};

const Pricing = () => {
  const { t, language } = useLanguage();
  const { credits, refetch } = useCredits();
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [topupPackages, setTopupPackages] = useState<TopupPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const audience = "user";

  // Billing cycle pill (4 segments)
  const [view, setView] = useState<BillingCycleView>("monthly");
  // Secondary tab for ancillary sections
  const [secondaryTab, setSecondaryTab] = useState<"plans" | "topup">("plans");

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<"subscription" | "topup">("subscription");
  const [checkoutPkgId, setCheckoutPkgId] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("subscription_plans").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("topup_packages" as any).select("*").eq("is_active", true).order("sort_order"),
    ]).then(([planRes, topupRes]) => {
      if (planRes.data) setPlans(planRes.data as any);
      if (topupRes.data) setTopupPackages(topupRes.data as any);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (searchParams.get("payment") === "success" || searchParams.get("topup") === "success") {
      toast({ title: t("pricingPaymentSuccess"), description: t("pricingCreditsAdded") });
      refetch();
      refreshProfile();
    }
  }, [searchParams]);

  const filteredPlans = plans.filter(p => p.target === audience && p.billing_cycle === view);
  const monthlyPlans = plans.filter(p => p.target === audience && p.billing_cycle === "monthly");
  const currentPlanId = (profile as any)?.subscription_plan_id || (profile as any)?.current_plan_id;

  // /app/pricing lives behind ProtectedRoute so user is guaranteed
  // signed-in. The legacy `requireLogin()` gate (which popped a sign-
  // in dialog when called pre-auth) is gone in Wave 3 cleanup.
  const handleSubscribe = (plan: SubscriptionPlan) => {
    setCheckoutPkgId(plan.id);
    setCheckoutMode("subscription");
    setCheckoutOpen(true);
  };

  const handleTopup = (pkg: TopupPackage) => {
    setCheckoutPkgId(pkg.id);
    setCheckoutMode("topup");
    setCheckoutOpen(true);
  };

  const handleCheckoutClose = (open: boolean) => {
    setCheckoutOpen(open);
  };

  const handleCheckoutSuccess = () => {
    toast({ title: t("pricingPaymentSuccess"), description: t("pricingCreditsAdded") });
    setTimeout(() => { refetch(); refreshProfile(); }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <PricingHero
        language={language}
        view={view}
        onViewChange={setView}
      />

      {/* Secondary navigation: Plans / Top-up / Compare */}
      <div className="max-w-[1400px] mx-auto px-4">
        <Tabs value={secondaryTab} onValueChange={(v) => setSecondaryTab(v as any)} className="w-full">
          <TabsList className="mx-auto flex w-fit bg-white/5 border border-white/10">
            <TabsTrigger value="plans">{language === "th" ? "แพ็กเกจ" : "Plans"}</TabsTrigger>
            <TabsTrigger value="topup">{language === "th" ? "เติมเครดิต" : "Top-up"}</TabsTrigger>
          </TabsList>

          <TabsContent value="plans" className="mt-6">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              </div>
            ) : (
              <div className="overflow-x-auto xl:overflow-visible pb-4">
                <div className="flex gap-4 justify-start xl:justify-center max-w-[1400px] mx-auto snap-x snap-mandatory">
                  {filteredPlans.map((plan) => {
                    const monthlyEquiv = monthlyPlans.find(m => m.name === plan.name);
                    const features = BUSINESS_FEATURES[plan.name] || [];
                    const isPopular = plan.name === "Growth";
                    const isCurrent = plan.id === currentPlanId;

                    return (
                      <PricingCard
                        key={plan.id}
                        plan={plan}
                        features={features}
                        isPopular={isPopular}
                        isCurrent={isCurrent}
                        billingCycle={view}
                        monthlyPrice={monthlyEquiv?.price_thb || 0}
                        language={language}
                        onSubscribe={() => handleSubscribe(plan)}
                      />
                    );
                  })}
                </div>
                {filteredPlans.length === 0 && (
                  <p className="text-center text-neutral-500 py-12">
                    {language === "th"
                      ? "ไม่มีแพ็กเกจสำหรับรอบบิลนี้"
                      : "No plans available for this billing cycle"}
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="topup" className="mt-6">
            {!loading && topupPackages.length > 0 && (
              <TopupSection
                topupPackages={topupPackages}
                language={language}
                onTopup={handleTopup}
                currentBalance={credits?.balance ?? 0}
              />
            )}
          </TabsContent>

        </Tabs>

        {/* Comparison table — always visible below the package boxes */}
        <div className="mt-12">
          <PricingCompare language={language} />
        </div>
      </div>

      {secondaryTab !== "topup" && <PricingFAQ language={language} />}

      <EmbeddedCheckoutModal
        open={checkoutOpen}
        onOpenChange={handleCheckoutClose}
        onSuccess={handleCheckoutSuccess}
        mode={checkoutMode}
        packageId={checkoutPkgId}
        billingInterval={view === "annual" ? "annual" : "monthly"}
      />

    </div>
  );
};

export default Pricing;
