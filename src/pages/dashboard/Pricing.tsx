import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Check, X, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
// TopupSection import removed — workspace doesn't sell standalone
// credit top-ups (the consumer product does, this surface doesn't).

// ─────────────────────────────────────────────────────────────────────────────
// Workspace pricing — 4 tiers (Starter / Creator / Pro / Team).
// Layout follows the Magnific reference screenshot:
//   - 4 self-contained cards, no comparison table below
//   - monthly/annual toggle drives all prices + which Stripe price_id is used
//   - Pro card: blue "BEST VALUE" ribbon + thicker blue border
//   - Team card: purple "EXPERT CHOICE" ribbon + thicker purple border
//   - Each card carries: NEW AVAILABLE pill, features list, GET UNLIMITED model
//     section, "250M+ Premium assets" line for higher tiers.
// Subscribe uses the redirect flow:
//   1. POST /functions/v1/create-checkout { packageId, billingInterval }
//   2. Backend returns { url } — we navigate to it.
//   3. Stripe success_url returns to /app/pricing?payment=success.
// Manage subscription uses /functions/v1/customer-portal.
// ─────────────────────────────────────────────────────────────────────────────

interface SubscriptionPlan {
  id: string;
  name: string;
  target: string;
  billing_cycle: string;
  price_thb: number;
  upfront_credits: number;
  flow_quota: number | null;
  sort_order: number;
  is_active: boolean;
  // New columns from phase 1 schema
  stripe_price_id: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_annual: string | null;
  annual_price_thb: number | null;
  annual_credits: number | null;
  credit_discount_percent: number | null;
  generator_quota: number | null;
  generator_quota_label: string | null;
  is_featured: boolean | null;
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

type CycleTab = "monthly" | "annual";

// Per-plan subtitle copy (Phase 6 promo).
const PLAN_SUBTITLE: Record<string, { en: string; th: string }> = {
  Starter: {
    en: "For hobbyists getting started with AI generation.",
    th: "สำหรับมือใหม่ที่กำลังเริ่มต้นสร้างงานด้วย AI",
  },
  Creator: {
    en: "For active creators shipping content weekly.",
    th: "สำหรับครีเอเตอร์ที่ผลิตคอนเทนต์ทุกสัปดาห์",
  },
  Pro: {
    en: "For professionals scaling their content production. 10% discount on credit usage.",
    th: "สำหรับมืออาชีพที่ผลิตคอนเทนต์จำนวนมาก ลดค่าเครดิต 10%",
  },
  Team: {
    en: "Built for design + content teams. Shared credit pool, centralised billing, SSO support. Best value for organisations.",
    th: "สำหรับทีมออกแบบและคอนเทนต์ พูลเครดิตร่วม ออกใบกำกับรวม รองรับ SSO คุ้มที่สุดสำหรับองค์กร",
  },
};

// Feature rows shown inside every card. Each entry maps a label to which plans include it.
// Order matches the screenshot top-to-bottom.
const FEATURE_ROWS: { en: string; th: string; plans: Record<string, boolean> }[] = [
  {
    en: "Access to all image, video & audio models",
    th: "เข้าถึงโมเดลภาพ วิดีโอ และเสียงทั้งหมด",
    plans: { Starter: true, Creator: true, Pro: true, Team: true },
  },
  {
    en: "Spaces: shared canvas built for workflows",
    th: "Spaces: แคนวาสร่วมสำหรับเวิร์กโฟลว์",
    plans: { Starter: true, Creator: true, Pro: true, Team: true },
  },
  {
    en: "Pro editing tools (image, video, design)",
    th: "เครื่องมือตัดต่อระดับโปร (ภาพ/วิดีโอ/ดีไซน์)",
    plans: { Starter: true, Creator: true, Pro: true, Team: true },
  },
  {
    en: "Music, voice & sound effects generation",
    th: "สร้างเสียงดนตรี เสียงพากย์ และซาวด์เอฟเฟกต์",
    plans: { Starter: true, Creator: true, Pro: true, Team: true },
  },
  {
    en: "Commercial AI license",
    th: "ลิขสิทธิ์ใช้งานเชิงพาณิชย์",
    plans: { Starter: true, Creator: true, Pro: true, Team: true },
  },
  {
    en: "Top up credits anytime",
    th: "เติมเครดิตเพิ่มได้ตลอดเวลา",
    plans: { Starter: true, Creator: true, Pro: true, Team: true },
  },
  {
    en: "Train AI styles, characters & products",
    th: "เทรน AI สำหรับสไตล์ ตัวละคร และผลิตภัณฑ์",
    plans: { Starter: false, Creator: true, Pro: true, Team: true },
  },
  {
    en: "Early access to new AI features",
    th: "ทดลองฟีเจอร์ AI ใหม่ก่อนใคร",
    plans: { Starter: false, Creator: false, Pro: true, Team: true },
  },
  {
    en: "File naming convention",
    th: "ระบบตั้งชื่อไฟล์",
    plans: { Starter: false, Creator: false, Pro: true, Team: true },
  },
  {
    en: "Multi-seat / shared team credit pool",
    th: "หลายที่นั่ง / พูลเครดิตของทีม",
    plans: { Starter: false, Creator: false, Pro: false, Team: true },
  },
  {
    en: "Centralised billing & SSO",
    th: "ออกใบกำกับรวม รองรับ SSO",
    plans: { Starter: false, Creator: false, Pro: false, Team: true },
  },
];

// MODEL_ROWS / GET UNLIMITED section removed — workspace pricing
// doesn't advertise per-model "unlimited free" entries because we
// don't actually offer free image generation. Plans bill credits;
// per-model availability lives in the runtime gate, not the card.

// Annual = 20% off.
const ANNUAL_DISCOUNT = 0.2;

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
  const [cycle, setCycle] = useState<CycleTab>("monthly");
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("topup_packages" as any).select("*").eq("is_active", true).order("sort_order"),
    ]).then(([planRes, topupRes]) => {
      if (planRes.data) setPlans(planRes.data as any);
      if (topupRes.data) setTopupPackages(topupRes.data as any);
      setLoading(false);
    });
  }, []);

  // Toast on Stripe success redirect.
  useEffect(() => {
    if (searchParams.get("payment") === "success" || searchParams.get("topup") === "success") {
      toast({ title: t("pricingPaymentSuccess"), description: t("pricingCreditsAdded") });
      refetch();
      refreshProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const currentPlanId =
    (profile as any)?.subscription_plan_id || (profile as any)?.current_plan_id || null;
  const currentPlan = plans.find((p) => p.id === currentPlanId) || null;

  // 4-card layout. Order: Starter, Creator, Pro, Team. Filter to active rows.
  const orderedPlans = useMemo(
    () => [...plans].sort((a, b) => a.sort_order - b.sort_order),
    [plans]
  );

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    // Team is contact-sales / metered.
    if (plan.target === "team") {
      window.location.href = "mailto:sales@mediaforge.co?subject=Team plan inquiry";
      return;
    }

    // Need a Stripe price for the chosen cycle.
    const priceId =
      cycle === "annual" ? plan.stripe_price_id_annual : plan.stripe_price_id_monthly;
    if (!priceId) {
      toast({
        title: language === "th" ? "ยังไม่พร้อม" : "Not available",
        description:
          language === "th"
            ? `ราคา ${cycle === "annual" ? "รายปี" : "รายเดือน"} ยังไม่ได้ตั้งค่าสำหรับแพ็กเกจนี้`
            : `${cycle === "annual" ? "Annual" : "Monthly"} price not configured for this plan yet.`,
      });
      return;
    }

    try {
      setSubmittingPlanId(plan.id);
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          packageId: plan.id,
          billingInterval: cycle,
          embedded: false,
        },
      });
      if (error) throw error;
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error("No checkout URL returned");
      window.location.href = url;
    } catch (e) {
      console.error("[Pricing] checkout error:", e);
      toast({
        title: language === "th" ? "เริ่มชำระเงินไม่ได้" : "Could not start checkout",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSubmittingPlanId(null);
    }
  };

  const handleManageSubscription = async () => {
    try {
      setOpeningPortal(true);
      const { data, error } = await supabase.functions.invoke("customer-portal", {
        body: {},
      });
      if (error) throw error;
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error("No portal URL returned");
      window.location.href = url;
    } catch (e) {
      console.error("[Pricing] portal error:", e);
      toast({
        title: language === "th" ? "เปิดพอร์ทัลไม่ได้" : "Could not open billing portal",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setOpeningPortal(false);
    }
  };

  const handleTopup = (_pkg: TopupPackage) => {
    // TopupSection still uses the embedded checkout; route handled there.
    // We keep the legacy handler for backwards compatibility.
  };

  // Decide CTA copy based on the user's current plan vs the card.
  const ctaLabelFor = (plan: SubscriptionPlan): string => {
    if (plan.target === "team") {
      return language === "th" ? "ติดต่อฝ่ายขาย" : "Contact sales";
    }
    if (currentPlan && currentPlan.id === plan.id) {
      return language === "th" ? "แพ็กเกจปัจจุบัน" : "Your current plan";
    }
    if (currentPlan && currentPlan.target === "user") {
      if (currentPlan.sort_order < plan.sort_order)
        return language === "th" ? "อัปเกรด" : "Upgrade";
      if (currentPlan.sort_order > plan.sort_order)
        return language === "th" ? "ดาวน์เกรด" : "Downgrade";
    }
    return language === "th" ? "สมัครสมาชิก" : "Subscribe";
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Hero */}
      <section className="w-full pt-12 md:pt-16 pb-6 text-center relative">
        <button
          onClick={() => navigate("/app/workspace")}
          className="absolute top-4 left-4 md:left-8 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          aria-label="Back to workspace"
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

        {/* Manage subscription button when user has a plan */}
        {currentPlan && currentPlan.target === "user" && (
          <div className="mt-4">
            <button
              onClick={handleManageSubscription}
              disabled={openingPortal}
              className="inline-flex items-center gap-2 text-sm text-neutral-300 hover:text-white border border-white/10 hover:border-white/20 rounded-full px-4 py-1.5 transition-colors disabled:opacity-60"
            >
              {openingPortal ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ExternalLink className="w-3.5 h-3.5" />
              )}
              {language === "th" ? "จัดการการสมัครสมาชิก" : "Manage subscription"}
            </button>
          </div>
        )}

        {/* Monthly / Annual toggle */}
        <div className="mt-8 flex justify-center px-4">
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
            <button
              onClick={() => setCycle("annual")}
              className={cn(
                "px-5 py-2 rounded-full text-sm font-medium transition-all inline-flex items-center gap-2",
                cycle === "annual"
                  ? "bg-white/15 text-white"
                  : "text-neutral-400 hover:text-neutral-200"
              )}
            >
              {language === "th" ? "รายปี" : "Annual"}
              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 rounded-full px-2 py-0.5">
                −20%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Cards */}
      <div className="max-w-[1400px] mx-auto px-4 pt-6 pb-16">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          </div>
        ) : orderedPlans.length === 0 ? (
          <p className="text-center text-neutral-500 py-12">
            {language === "th" ? "ไม่มีแพ็กเกจ" : "No plans available"}
          </p>
        ) : (
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 pt-6">
            {orderedPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                cycle={cycle}
                language={language}
                ctaLabel={ctaLabelFor(plan)}
                isCurrent={currentPlan?.id === plan.id}
                submitting={submittingPlanId === plan.id}
                onSubscribe={() => handleSubscribe(plan)}
              />
            ))}
          </div>
        )}

        {/* Top-up section removed — workspace pricing doesn't sell
            standalone credit top-ups. The package list / handler
            stay populated upstream so other surfaces (admin, etc.)
            can still read them, they just don't render here. */}
      </div>
    </div>
  );
};

// ─── Inline plan card ────────────────────────────────────────────────────────
interface PlanCardProps {
  plan: SubscriptionPlan;
  cycle: CycleTab;
  language: string;
  ctaLabel: string;
  isCurrent: boolean;
  submitting: boolean;
  onSubscribe: () => void;
}

const PlanCard = ({ plan, cycle, language, ctaLabel, isCurrent, submitting, onSubscribe }: PlanCardProps) => {
  const isTeam = plan.target === "team";
  const isPro = plan.is_featured === true; // Phase 1 seeded Pro as is_featured.
  const subtitle =
    PLAN_SUBTITLE[plan.name]?.[language === "th" ? "th" : "en"] ?? "";

  // Price calculation:
  //   monthly: price_thb
  //   annual:  annual_price_thb / 12 (per-month equivalent), striked-through: price_thb
  const monthlyPrice = plan.price_thb;
  const annualPerMonth =
    plan.annual_price_thb != null
      ? Math.round(plan.annual_price_thb / 12)
      : Math.round(monthlyPrice * (1 - ANNUAL_DISCOUNT));
  const showAnnual = cycle === "annual" && !isTeam;

  const credits =
    cycle === "annual" && plan.annual_credits
      ? plan.annual_credits
      : plan.upfront_credits;

  // Border + ribbon styling per tier
  const borderClass = isPro
    ? "ring-2 ring-blue-400 shadow-[0_0_24px_rgba(59,130,246,0.35)]"
    : isTeam
      ? "ring-2 ring-purple-400 shadow-[0_0_24px_rgba(168,85,247,0.3)]"
      : isCurrent
        ? "ring-2 ring-white/30"
        : "ring-1 ring-white/10";

  // CTA visual style
  const ctaClass = isCurrent
    ? "bg-neutral-700 cursor-default opacity-70"
    : isPro
      ? "bg-blue-600 hover:bg-blue-500"
      : isTeam
        ? "bg-purple-600 hover:bg-purple-500"
        : "bg-neutral-800 hover:bg-neutral-700 border border-neutral-700";

  return (
    <div
      className={cn(
        "relative bg-[#171717] rounded-3xl px-5 pt-7 pb-5 flex flex-col gap-4 transition-all",
        borderClass
      )}
    >
      {/* Ribbon */}
      {isPro ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full whitespace-nowrap z-10">
          {language === "th" ? "คุ้มที่สุด" : "BEST VALUE"}
        </div>
      ) : isTeam ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full whitespace-nowrap z-10">
          {language === "th" ? "ตัวเลือกผู้เชี่ยวชาญ" : "EXPERT CHOICE"}
        </div>
      ) : null}

      {/* Plan name */}
      <h3 className="text-3xl font-black text-white">{plan.name}</h3>

      {/* Subtitle */}
      <p className="text-neutral-400 text-sm leading-snug min-h-[44px]">{subtitle}</p>

      {/* Price block */}
      <div className="flex flex-col gap-0.5">
        {isTeam ? (
          <>
            <span className="text-white text-3xl font-semibold">
              {language === "th" ? "ตามการใช้งาน" : "Pay as you go"}
            </span>
            <p className="text-neutral-500 text-xs">
              {language === "th"
                ? "ติดต่อทีมขายเพื่อดูราคาตามการใช้งาน"
                : "Contact sales for usage-based pricing"}
            </p>
          </>
        ) : showAnnual ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-neutral-500 text-base line-through">
                ฿{monthlyPrice.toLocaleString()}
              </span>
              <span className="text-white text-4xl font-bold">
                ฿{annualPerMonth.toLocaleString()}
              </span>
              <span className="text-neutral-400 text-sm">
                /{language === "th" ? "เดือน" : "month"}
              </span>
            </div>
            <p className="text-neutral-500 text-xs">
              {language === "th" ? "ชำระรายปี" : "Billed annually"}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-white text-4xl font-bold">
                ฿{monthlyPrice.toLocaleString()}
              </span>
              <span className="text-neutral-400 text-sm">
                /{language === "th" ? "เดือน" : "month"}
              </span>
            </div>
            <p className="text-neutral-500 text-xs">
              {language === "th" ? "ชำระรายเดือน" : "Billed monthly"}
            </p>
          </>
        )}
      </div>

      {/* CTA */}
      <button
        onClick={onSubscribe}
        disabled={isCurrent || submitting}
        className={cn(
          "w-full py-3 rounded-xl font-medium text-white transition-colors inline-flex items-center justify-center gap-2",
          ctaClass
        )}
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {language === "th" ? "กำลังเปิด..." : "Opening..."}
          </>
        ) : (
          ctaLabel
        )}
      </button>

      {/* Credits pill */}
      {!isTeam && (
        <div className="rounded-xl py-2.5 px-3 text-center bg-neutral-800/80 border border-neutral-700/60">
          <span className="font-semibold text-white text-sm">
            {credits.toLocaleString()}{" "}
            <span className="text-neutral-400 font-normal">
              {cycle === "annual"
                ? language === "th"
                  ? "เครดิต/ปี"
                  : "credits/year"
                : language === "th"
                  ? "เครดิต/เดือน"
                  : "credits/month"}
            </span>
          </span>
        </div>
      )}

      {/* NEW AVAILABLE highlight */}
      <div className="rounded-lg bg-blue-500/10 border border-blue-400/30 px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-blue-200 text-xs font-medium">Seedance 2.0</span>
        <span className="text-[10px] font-bold tracking-wider uppercase text-blue-300 bg-blue-500/20 rounded px-2 py-0.5">
          {language === "th" ? "พร้อมใช้แล้ว" : "NOW AVAILABLE"}
        </span>
      </div>

      {/* Pro discount line / Team discount line */}
      {isPro && (
        <div className="flex items-center gap-2 text-emerald-300 text-xs">
          <Check className="w-3.5 h-3.5" />
          <span>{language === "th" ? "ลดค่าเครดิต 10%" : "10% discount on credit usage"}</span>
        </div>
      )}
      {isTeam && (
        <div className="flex items-center gap-2 text-emerald-300 text-xs">
          <Check className="w-3.5 h-3.5" />
          <span>{language === "th" ? "ค่าเครดิตถูกกว่า 20%" : "20% cheaper cost per credit"}</span>
        </div>
      )}

      {/* Generator quota line */}
      {plan.generator_quota_label && (
        <div className="flex items-center gap-2 text-neutral-300 text-xs">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{plan.generator_quota_label}</span>
        </div>
      )}

      {/* Feature list */}
      <ul className="flex flex-col gap-2 mt-1">
        {FEATURE_ROWS.map((row) => {
          const has = row.plans[plan.name] ?? false;
          return (
            <li
              key={row.en}
              className={cn(
                "flex items-start gap-2 text-xs",
                has ? "text-neutral-200" : "text-neutral-600"
              )}
            >
              {has ? (
                <Check className="w-3.5 h-3.5 mt-0.5 text-emerald-400 flex-shrink-0" />
              ) : (
                <X className="w-3.5 h-3.5 mt-0.5 text-neutral-700 flex-shrink-0" />
              )}
              <span>{language === "th" ? row.th : row.en}</span>
            </li>
          );
        })}
      </ul>

      {/* GET UNLIMITED model checklist removed — see MODEL_ROWS note
          at the top of the file for the rationale. */}

      {/* 250M+ Premium assets — only Creator/Pro/Team (Starter excluded) */}
      {plan.name !== "Starter" && (
        <div className="mt-2 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2 text-neutral-200 text-xs">
            <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="font-medium">
              {language === "th" ? "สต็อก 250M+ ภาพและวิดีโอ" : "250M+ Premium assets"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pricing;
