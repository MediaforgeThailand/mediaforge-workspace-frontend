import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Check, X, Loader2, Sparkles, Zap, Crown, Users } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import EmbeddedCheckoutModal from "@/components/EmbeddedCheckoutModal";
import TopupSection from "@/components/pricing/TopupSection";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─────────────────────────────────────────────────────────────────────────────
// Workspace pricing — 4 fresh tiers (Starter / Creator / Pro / Team).
// The DB rows (target='user' for first three, target='team' for the 4th) drive
// the cards. Annual toggle is rendered but disabled — Stripe annual SKUs are
// not wired on the workspace project yet.
// ─────────────────────────────────────────────────────────────────────────────

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
  stripe_price_id: string | null;
}

interface TopupPackage {
  id: string;
  name: string;
  credits: number;
  price_thb: number;
  stripe_price_id: string | null;
  is_active: boolean;
  sort_order: number;
  is_promo?: boolean;
  bonus_percent?: number | null;
  original_credits?: number | null;
  one_time_per_user?: boolean;
  badge_label?: string | null;
}

type AudienceTab = "individual" | "teams";
type CycleTab = "monthly" | "annual";

const PLAN_ICON: Record<string, React.ElementType> = {
  Starter: Sparkles,
  Creator: Zap,
  Pro: Crown,
  Team: Users,
};

const PLAN_TITLE_COLOR: Record<string, string> = {
  Starter: "#FAFAFA",
  Creator: "#A78BFA",
  Pro: "#FACC15",
  Team: "#34D399",
};

const PLAN_BLURB: Record<string, string> = {
  Starter: "For hobbyists exploring AI generation.",
  Creator: "For creators who ship work weekly.",
  Pro: "For power users and freelancers.",
  Team: "For teams with shared credit pools.",
};

// Feature comparison — order matches the brief, mapped per plan name.
const FEATURE_ROWS: { label: string; plans: Record<string, boolean> }[] = [
  { label: "Access to all image, video & audio models", plans: { Starter: true,  Creator: true,  Pro: true,  Team: true  } },
  { label: "Spaces: shared canvas, built for workflows", plans: { Starter: true,  Creator: true,  Pro: true,  Team: true  } },
  { label: "Pro editing tools: image, video & design",   plans: { Starter: true,  Creator: true,  Pro: true,  Team: true  } },
  { label: "Music, voice & sound effects generation",    plans: { Starter: true,  Creator: true,  Pro: true,  Team: true  } },
  { label: "Commercial AI license",                      plans: { Starter: true,  Creator: true,  Pro: true,  Team: true  } },
  { label: "Top up credits anytime",                     plans: { Starter: true,  Creator: true,  Pro: true,  Team: true  } },
  { label: "Train AI styles, characters & products",     plans: { Starter: false, Creator: true,  Pro: true,  Team: true  } },
  { label: "Stock library access (250M+ assets)",        plans: { Starter: false, Creator: true,  Pro: true,  Team: true  } },
  { label: "Early access to AI features",                plans: { Starter: false, Creator: false, Pro: true,  Team: true  } },
  { label: "File naming convention",                     plans: { Starter: false, Creator: false, Pro: true,  Team: true  } },
  { label: "Lowest cost per credit",                     plans: { Starter: false, Creator: false, Pro: false, Team: true  } },
  { label: "Multi-seat / shared team credit pool",       plans: { Starter: false, Creator: false, Pro: false, Team: true  } },
  { label: "Centralised billing",                        plans: { Starter: false, Creator: false, Pro: false, Team: true  } },
  { label: "SSO (university / enterprise)",              plans: { Starter: false, Creator: false, Pro: false, Team: true  } },
];

const ANNUAL_DISCOUNT = 0.24; // 24% off — visual only for now

const Pricing = () => {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const { credits, refetch } = useCredits();
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [topupPackages, setTopupPackages] = useState<TopupPackage[]>([]);
  const [loading, setLoading] = useState(true);

  const [audience, setAudience] = useState<AudienceTab>("individual");
  const [cycle, setCycle] = useState<CycleTab>("monthly");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Profile may store either field name depending on how the row was last touched.
  const currentPlanId =
    (profile as any)?.subscription_plan_id || (profile as any)?.current_plan_id || null;
  const currentPlan = plans.find((p) => p.id === currentPlanId) || null;

  const individualPlans = useMemo(
    () => plans.filter((p) => p.target === "user").sort((a, b) => a.sort_order - b.sort_order),
    [plans]
  );
  const teamPlans = useMemo(
    () => plans.filter((p) => p.target === "team").sort((a, b) => a.sort_order - b.sort_order),
    [plans]
  );

  const visiblePlans = audience === "individual" ? individualPlans : teamPlans;

  const handleSubscribe = (plan: SubscriptionPlan) => {
    if (plan.target === "team") {
      window.location.href = "mailto:sales@mediaforge.co?subject=Team plan inquiry";
      return;
    }
    if (!plan.stripe_price_id) {
      toast({
        title: language === "th" ? "เร็ว ๆ นี้" : "Launching soon",
        description:
          language === "th"
            ? "ระบบสมัครสมาชิกบน Workspace กำลังเปิดตัว — ใช้ mediaforge.co สำหรับแพ็กเกจ Flow ที่มีอยู่ก่อน"
            : "Subscriptions on the workspace product are launching soon — switch to the consumer site (mediaforge.co) for the existing flow plans.",
      });
      return;
    }
    setCheckoutPkgId(plan.id);
    setCheckoutMode("subscription");
    setCheckoutOpen(true);
  };

  const handleTopup = (pkg: TopupPackage) => {
    setCheckoutPkgId(pkg.id);
    setCheckoutMode("topup");
    setCheckoutOpen(true);
  };

  const handleCheckoutClose = (open: boolean) => setCheckoutOpen(open);

  const handleCheckoutSuccess = () => {
    toast({ title: t("pricingPaymentSuccess"), description: t("pricingCreditsAdded") });
    setTimeout(() => {
      refetch();
      refreshProfile();
    }, 2000);
  };

  // Decide CTA copy based on profile's current plan vs the card.
  const ctaLabelFor = (plan: SubscriptionPlan): string => {
    if (plan.target === "team") return language === "th" ? "ติดต่อฝ่ายขาย" : "Get Started";
    if (currentPlan && currentPlan.id === plan.id) return t("pricingCurrentPlan");
    if (currentPlan && currentPlan.target === "user") {
      if (currentPlan.sort_order < plan.sort_order)
        return language === "th" ? "อัปเกรด" : "Upgrade";
      if (currentPlan.sort_order > plan.sort_order)
        return language === "th" ? "ดาวน์เกรด" : "Downgrade";
    }
    return t("pricingSubscribe");
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen bg-[#0a0a0a]">
        {/* Hero */}
        <section className="w-full py-12 md:py-16 text-center relative">
          <button
            onClick={() => navigate(-1)}
            className="absolute top-4 left-4 md:left-8 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </button>

          <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-white">
            {language === "th" ? "ปลดล็อกพลังของ MEDIAFORGE" : "Unlock the power of MediaForge"}
          </h1>
          <p className="text-neutral-400 mt-4 text-base md:text-lg max-w-2xl mx-auto px-4">
            {language === "th"
              ? "เลือกแพ็กเกจที่เหมาะกับคุณ คิดราคาตามจำนวนเครดิตที่ใช้จริง"
              : "Pick the plan that matches your output. Pricing is strictly credit-based."}
          </p>

          {/* Credit balance widget */}
          {credits && (
            <div className="mt-6 inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-neutral-300">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>
                {credits.balance.toLocaleString()}{" "}
                {language === "th" ? "เครดิตคงเหลือ" : "credits remaining"}
              </span>
            </div>
          )}

          {/* Toggles */}
          <div className="mt-8 flex flex-col items-center gap-4 px-4">
            {/* Audience segmented toggle */}
            <div className="inline-flex bg-white/10 rounded-full p-1">
              {(["individual", "teams"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setAudience(key)}
                  className={cn(
                    "px-5 py-2 rounded-full text-sm font-medium transition-all",
                    audience === key
                      ? "bg-white/15 text-white"
                      : "text-neutral-400 hover:text-neutral-200"
                  )}
                >
                  {key === "individual"
                    ? language === "th"
                      ? "ส่วนตัว"
                      : "Individual"
                    : language === "th"
                      ? "ทีม"
                      : "Teams"}
                </button>
              ))}
            </div>

            {/* Monthly / Annual toggle (annual disabled with tooltip for now) */}
            <div className="inline-flex bg-white/10 rounded-full p-1">
              <button
                onClick={() => setCycle("monthly")}
                className={cn(
                  "px-5 py-2 rounded-full text-sm font-medium transition-all",
                  cycle === "monthly"
                    ? "bg-white/15 text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                {language === "th" ? "รายเดือน" : "Monthly"}
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-disabled
                    onClick={(e) => e.preventDefault()}
                    className="px-5 py-2 rounded-full text-sm font-medium text-neutral-500 cursor-not-allowed opacity-60 inline-flex items-center gap-2"
                  >
                    {language === "th" ? "รายปี" : "Annual"}
                    <span className="text-[10px] font-bold text-violet-300/70 bg-violet-500/10 border border-violet-400/30 rounded-full px-2 py-0.5">
                      −24%
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {language === "th" ? "รายปีกำลังจะเปิดให้บริการ" : "Annual coming soon"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </section>

        {/* Plan cards + comparison grid */}
        <div className="max-w-[1400px] mx-auto px-4 pb-16">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            </div>
          ) : visiblePlans.length === 0 ? (
            <p className="text-center text-neutral-500 py-12">
              {language === "th" ? "ไม่มีแพ็กเกจ" : "No plans available"}
            </p>
          ) : (
            <>
              {/* Card row */}
              <div
                className={cn(
                  "grid gap-4",
                  audience === "individual"
                    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                    : "grid-cols-1 max-w-md mx-auto"
                )}
              >
                {/* Individual mode shows the 3 user plans + the team card */}
                {audience === "individual"
                  ? [...individualPlans, ...teamPlans].map((plan) => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        cycle={cycle}
                        language={language}
                        ctaLabel={ctaLabelFor(plan)}
                        isCurrent={currentPlan?.id === plan.id}
                        onSubscribe={() => handleSubscribe(plan)}
                      />
                    ))
                  : visiblePlans.map((plan) => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        cycle={cycle}
                        language={language}
                        ctaLabel={ctaLabelFor(plan)}
                        isCurrent={currentPlan?.id === plan.id}
                        onSubscribe={() => handleSubscribe(plan)}
                      />
                    ))}
              </div>

              {/* Feature comparison table — only on Individual tab where all 4 columns make sense */}
              {audience === "individual" && (
                <div className="mt-12 overflow-x-auto">
                  <h2 className="text-xl font-bold text-white mb-4 text-center">
                    {language === "th" ? "เปรียบเทียบแพ็กเกจ" : "Compare plans"}
                  </h2>
                  <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr>
                        <th className="text-left text-neutral-400 font-medium py-3 px-3 w-[40%]">
                          {language === "th" ? "ฟีเจอร์" : "Feature"}
                        </th>
                        {[...individualPlans, ...teamPlans].map((p) => (
                          <th
                            key={p.id}
                            className="text-center text-neutral-200 font-semibold py-3 px-3"
                          >
                            {p.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {FEATURE_ROWS.map((row, idx) => (
                        <tr key={row.label} className={idx % 2 === 0 ? "bg-white/[0.02]" : ""}>
                          <td className="text-neutral-300 py-3 px-3 align-middle">{row.label}</td>
                          {[...individualPlans, ...teamPlans].map((p) => {
                            const has = row.plans[p.name] ?? false;
                            return (
                              <td key={p.id} className="text-center py-3 px-3 align-middle">
                                {has ? (
                                  <Check className="w-4 h-4 text-emerald-400 inline" />
                                ) : (
                                  <X className="w-4 h-4 text-neutral-600 inline" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Top-up section */}
          {!loading && topupPackages.length > 0 && (
            <div className="mt-16">
              <TopupSection
                topupPackages={topupPackages}
                language={language}
                onTopup={handleTopup}
                currentBalance={credits?.balance ?? 0}
              />
            </div>
          )}
        </div>

        <EmbeddedCheckoutModal
          open={checkoutOpen}
          onOpenChange={handleCheckoutClose}
          onSuccess={handleCheckoutSuccess}
          mode={checkoutMode}
          packageId={checkoutPkgId}
          billingInterval={cycle === "annual" ? "annual" : "monthly"}
        />
      </div>
    </TooltipProvider>
  );
};

// ─── Inline plan card (replaces the subscription PricingCard for this surface)
interface PlanCardProps {
  plan: SubscriptionPlan;
  cycle: CycleTab;
  language: string;
  ctaLabel: string;
  isCurrent: boolean;
  onSubscribe: () => void;
}

const PlanCard = ({ plan, cycle, language, ctaLabel, isCurrent, onSubscribe }: PlanCardProps) => {
  const Icon = PLAN_ICON[plan.name] || Sparkles;
  const titleColor = PLAN_TITLE_COLOR[plan.name] || "#FAFAFA";
  const blurb = PLAN_BLURB[plan.name] || "";
  const isTeam = plan.target === "team";
  const isPopular = plan.name === "Creator";

  // Annual price preview — visual only since toggle is disabled.
  const annualMonthly =
    cycle === "annual" && !isTeam
      ? Math.round((plan.price_thb * 12 * (1 - ANNUAL_DISCOUNT)) / 12)
      : null;

  return (
    <div
      className={cn(
        "relative bg-[#171717] rounded-3xl px-5 pt-6 pb-5 flex flex-col gap-5 transition-all",
        isPopular
          ? "ring-2 ring-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.3)]"
          : isCurrent
            ? "ring-2 ring-purple-400/60"
            : "ring-1 ring-white/10"
      )}
    >
      {isCurrent ? (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-medium px-4 py-1 rounded-full whitespace-nowrap z-10">
          {language === "th" ? "แพ็กเกจปัจจุบัน" : "Current plan"}
        </div>
      ) : isPopular ? (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-medium px-4 py-1 rounded-full whitespace-nowrap z-10">
          {language === "th" ? "ยอดนิยม" : "Most popular"}
        </div>
      ) : null}

      {/* Title row */}
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5" style={{ color: titleColor }} />
        <h3 className="text-2xl font-black uppercase" style={{ color: titleColor }}>
          {plan.name}
        </h3>
      </div>
      <p className="text-neutral-400 text-sm -mt-3 min-h-[40px]">{blurb}</p>

      {/* Price */}
      <div className="flex flex-col gap-1">
        {isTeam ? (
          <>
            <span className="text-white text-3xl font-semibold">
              {language === "th" ? "ตามการใช้งาน" : "Pay as you go"}
            </span>
            <p className="text-neutral-500 text-xs">
              {language === "th" ? "เรียกเก็บตามการใช้งานจริง" : "Billed per use"}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-white text-4xl font-semibold">
                ฿{plan.price_thb.toLocaleString()}
              </span>
              <span className="text-neutral-400 text-sm">
                /{language === "th" ? "เดือน" : "mo"}
              </span>
            </div>
            {annualMonthly !== null && (
              <p className="text-violet-300 text-xs">
                {language === "th"
                  ? `≈ ฿${annualMonthly.toLocaleString()}/เดือน เมื่อชำระรายปี`
                  : `≈ ฿${annualMonthly.toLocaleString()}/mo billed annually`}
              </p>
            )}
          </>
        )}
      </div>

      {/* Credits / metered pill */}
      <div
        className={cn(
          "rounded-xl py-3 px-4 text-center",
          isTeam
            ? "bg-emerald-500/10 border border-emerald-400/30"
            : isPopular
              ? "bg-purple-500/10 border border-purple-400/30"
              : "bg-neutral-800/80"
        )}
      >
        {isTeam ? (
          <div className="text-emerald-200 font-semibold text-sm">
            {language === "th" ? "เรียกเก็บตามการใช้งานจริง" : "Billed per use"}
          </div>
        ) : (
          <>
            <div
              className={cn(
                "font-bold text-lg",
                isPopular ? "text-purple-200" : "text-white"
              )}
            >
              {plan.upfront_credits.toLocaleString()}
            </div>
            <div
              className={cn(
                "text-xs",
                isPopular ? "text-purple-300/80" : "text-neutral-500"
              )}
            >
              {language === "th" ? "เครดิต/เดือน" : "credits/month"}
            </div>
          </>
        )}
      </div>

      {/* CTA */}
      <button
        className={cn(
          "w-full py-3 rounded-xl font-medium text-white transition-colors mt-auto",
          isCurrent
            ? "bg-neutral-700 cursor-default opacity-60"
            : isTeam
              ? "bg-emerald-600 hover:bg-emerald-500"
              : isPopular
                ? "bg-purple-600 hover:bg-purple-700"
                : "bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
        )}
        disabled={isCurrent}
        onClick={onSubscribe}
      >
        {ctaLabel}
      </button>
    </div>
  );
};

export default Pricing;
