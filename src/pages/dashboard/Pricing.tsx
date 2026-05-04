import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Check, X, Loader2, Sparkles, Minus, Plus, Users } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import EmbeddedCheckoutModal from "@/components/EmbeddedCheckoutModal";
import useDocumentTitle from "@/hooks/useDocumentTitle";
import { UserMenu } from "@/components/workspace/UserMenu";
import {
  detectWorkspaceCurrency,
  formatWorkspaceMoneyFromThb,
  type SupportedWorkspaceCurrency,
} from "@/lib/workspaceCurrency";
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
const TEAM_SEAT_PRICE_THB = 1600;
const TEAM_SEAT_PLATFORM_FEE_THB = 300;
const TEAM_BASE_CREDITS_PER_SEAT_MONTH = (TEAM_SEAT_PRICE_THB - TEAM_SEAT_PLATFORM_FEE_THB) * 50;
const TEAM_PROMO_CREDITS_PER_SEAT_MONTH = 25_000;
const TEAM_CREDITS_PER_SEAT_MONTH = TEAM_BASE_CREDITS_PER_SEAT_MONTH + TEAM_PROMO_CREDITS_PER_SEAT_MONTH;
const TEAM_MIN_SEATS = 2;
const TEAM_MAX_SEATS = 500;

const Pricing = () => {
  useDocumentTitle("Pricing — MediaForge");
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const { refetch } = useCredits();
  const { profile, refreshProfile, session, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [topupPackages, setTopupPackages] = useState<TopupPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<CycleTab>("monthly");
  const currency = useMemo<SupportedWorkspaceCurrency>(() => detectWorkspaceCurrency(), []);
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);
  const [, setOpeningPortal] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlan | null>(null);
  const [teamSeats, setTeamSeats] = useState(TEAM_MIN_SEATS);
  const [teamCheckoutOpen, setTeamCheckoutOpen] = useState(false);

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

  const handleSubscribe = (plan: SubscriptionPlan) => {
    if (authLoading) {
      toast({
        title: language === "th" ? "กำลังตรวจสอบบัญชี" : "Checking account",
        description: language === "th" ? "กรุณารอสักครู่แล้วลองอีกครั้ง" : "Please wait a moment and try again.",
      });
      return;
    }
    if (!session?.access_token) {
      navigate(`/auth?redirect=${encodeURIComponent("/app/pricing")}`);
      return;
    }

    if (plan.target === "team") {
      setSubmittingPlanId(plan.id);
      setTeamCheckoutOpen(true);
      return;
    }

    // Need a Stripe price for the chosen cycle.
    const priceId =
      cycle === "annual" ? plan.stripe_price_id_annual : plan.stripe_price_id_monthly;
    if (false && !priceId) {
      toast({
        title: language === "th" ? "ยังไม่พร้อม" : "Not available",
        description:
          language === "th"
            ? `ราคา ${cycle === "annual" ? "รายปี" : "รายเดือน"} ยังไม่ได้ตั้งค่าสำหรับแพ็กเกจนี้`
            : `${cycle === "annual" ? "Annual" : "Monthly"} price not configured for this plan yet.`,
      });
      return;
    }
    setSubmittingPlanId(plan.id);
    setCheckoutPlan(plan);
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
      return language === "th" ? "เริ่มทีม" : "Start team";
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
    return language === "th" ? "อัปเกรด" : "Upgrade";
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#151515] text-white">
      <div className="fixed right-[18px] top-[18px] z-30">
        <UserMenu compact />
      </div>

      {/* Hero */}
      <section className="relative w-full px-4 pb-[76px] pt-[86px] text-center">
        <button
          onClick={() => navigate("/app/workspace")}
          className="absolute left-5 top-5 flex h-[44px] w-[44px] items-center justify-center rounded-full bg-white/[0.055] text-zinc-300 transition-colors hover:bg-white/[0.09] hover:text-white md:left-8"
          aria-label="Back to workspace"
        >
          <ArrowLeft className="h-5 w-5 text-neutral-300" />
        </button>

        <h1 className="mx-auto max-w-[860px] text-[38px] font-black leading-[0.96] tracking-[-0.02em] text-white sm:text-[50px] md:text-[58px]">
          Let's become professionals together
        </h1>
      </section>

      {/* Pricing board */}
      <section className="rounded-t-[28px] bg-[#1b1b1b] px-4 pb-[48px] pt-[22px] shadow-[0_-18px_50px_rgba(0,0,0,0.18)] sm:px-6 md:rounded-t-[34px]">
        <div className="mx-auto max-w-[1360px]">
          <div className="flex justify-center">
            <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex h-[42px] rounded-full border border-white/10 bg-[#252525] p-[4px] shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
              <button
                type="button"
                onClick={() => setCycle("monthly")}
                className={cn(
                  "h-[34px] min-w-[128px] rounded-full px-[18px] text-[12.5px] font-semibold transition-colors",
                  cycle === "monthly"
                    ? "bg-white text-zinc-950"
                    : "text-zinc-300 hover:bg-white/[0.06] hover:text-white",
                )}
              >
                {language === "th" ? "รายเดือน" : "Monthly"}
              </button>
              <button
                type="button"
                onClick={() => setCycle("annual")}
                className={cn(
                  "flex h-[34px] min-w-[128px] items-center justify-center gap-[7px] rounded-full px-[18px] text-[12.5px] font-semibold transition-colors",
                  cycle === "annual"
                    ? "bg-white text-zinc-950"
                    : "text-zinc-300 hover:bg-white/[0.06] hover:text-white",
                )}
              >
                {language === "th" ? "รายปี" : "Annual"}
                <span className={cn(
                  "rounded-full px-[7px] py-[2px] text-[10px] font-black",
                  cycle === "annual" ? "bg-emerald-500/15 text-emerald-700" : "bg-emerald-500/15 text-emerald-300",
                )}>
                  -20%
                </span>
              </button>
            </div>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
          ) : orderedPlans.length === 0 ? (
            <p className="py-16 text-center text-neutral-500">
              {language === "th" ? "ไม่มีแพ็กเกจ" : "No plans available"}
            </p>
          ) : (
            <div className="grid grid-cols-1 items-start gap-[14px] pt-[26px] sm:grid-cols-2 lg:grid-cols-4">
              {orderedPlans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  cycle={cycle}
                  language={language}
                  ctaLabel={plan.target === "team" ? (language === "th" ? "เริ่มทีม" : "Start team") : ctaLabelFor(plan)}
                  isCurrent={currentPlan?.id === plan.id}
                  submitting={submittingPlanId === plan.id}
                  onSubscribe={() => handleSubscribe(plan)}
                  teamSeats={teamSeats}
                  onTeamSeatsChange={setTeamSeats}
                  currency={currency}
                />
              ))}
            </div>
          )}

          {/* Top-up section removed — workspace pricing doesn't sell
              standalone credit top-ups. The package list / handler
              stay populated upstream so other surfaces (admin, etc.)
              can still read them, they just don't render here. */}
        </div>
      </section>
      <EmbeddedCheckoutModal
        open={!!checkoutPlan}
        onOpenChange={(open) => {
          if (!open) {
            setCheckoutPlan(null);
            setSubmittingPlanId(null);
          }
        }}
        mode="subscription"
        packageId={checkoutPlan?.id ?? ""}
        billingInterval={cycle}
        currency={currency}
        uiLanguage={language === "th" ? "th" : "en"}
        onSuccess={() => {
          void refetch();
          void refreshProfile();
          setSubmittingPlanId(null);
        }}
      />
      <EmbeddedCheckoutModal
        open={teamCheckoutOpen}
        onOpenChange={(open) => {
          setTeamCheckoutOpen(open);
          if (!open) setSubmittingPlanId(null);
        }}
        mode="team_seats"
        billingInterval={cycle}
        teamSeats={teamSeats}
        currency={currency}
        uiLanguage={language === "th" ? "th" : "en"}
        onSuccess={() => {
          void refetch();
          void refreshProfile();
          setSubmittingPlanId(null);
        }}
      />
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
  teamSeats: number;
  onTeamSeatsChange: (seats: number) => void;
  currency: SupportedWorkspaceCurrency;
}

const PlanCard = ({ plan, cycle, language, ctaLabel, isCurrent, submitting, onSubscribe, teamSeats, onTeamSeatsChange, currency }: PlanCardProps) => {
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
  const showAnnual = cycle === "annual";
  const displayMonthlyPrice = formatWorkspaceMoneyFromThb(monthlyPrice, currency);
  const displayAnnualPerMonth = formatWorkspaceMoneyFromThb(annualPerMonth, currency);
  const displayTeamSeatPrice = formatWorkspaceMoneyFromThb(TEAM_SEAT_PRICE_THB, currency);
  const displayTeamAnnualSeatPrice = formatWorkspaceMoneyFromThb(Math.round(TEAM_SEAT_PRICE_THB * (1 - ANNUAL_DISCOUNT)), currency);
  const teamCycleMonths = cycle === "annual" ? 12 : 1;
  const teamCreditsForSelectedSeats = teamSeats * TEAM_CREDITS_PER_SEAT_MONTH * teamCycleMonths;
  const incrementSeats = () => onTeamSeatsChange(Math.min(TEAM_MAX_SEATS, teamSeats + 1));
  const decrementSeats = () => onTeamSeatsChange(Math.max(TEAM_MIN_SEATS, teamSeats - 1));

  const credits =
    cycle === "annual" && plan.annual_credits
      ? plan.annual_credits
      : plan.upfront_credits;

  const accent = isTeam ? "purple" : isPro ? "blue" : "neutral";
  const borderClass = isPro
    ? "border-blue-400/85 shadow-[0_0_22px_rgba(59,130,246,0.22)]"
    : isTeam
      ? "border-purple-400/85 shadow-[0_0_22px_rgba(168,85,247,0.22)]"
      : isCurrent
        ? "border-white/18"
        : "border-white/[0.055]";

  // CTA visual style
  const ctaClass = isCurrent && !isTeam
    ? "bg-white text-zinc-950 cursor-default opacity-80"
    : isPro
      ? "bg-[#4f6cff] text-white hover:bg-[#6680ff]"
      : isTeam
        ? "bg-[#7b49d8] text-white hover:bg-[#8f5def]"
        : "bg-white text-zinc-950 hover:bg-zinc-200";

  return (
    <div
      className={cn(
        "relative flex flex-col gap-[6px] overflow-hidden rounded-[20px] border bg-[#202020] px-[14px] pb-[14px] pt-[40px] transition-all",
        borderClass
      )}
    >
      {/* Ribbon */}
      {isPro ? (
        <div className="absolute left-0 right-0 top-0 flex h-[24px] items-center justify-center bg-[#4f6cff] text-[10px] font-black uppercase tracking-[0.02em] text-white">
          {language === "th" ? "คุ้มที่สุด" : "BEST VALUE"}
        </div>
      ) : isTeam ? (
        <div className="absolute left-0 right-0 top-0 flex h-[24px] items-center justify-center bg-[#7b49d8] text-[10px] font-black uppercase tracking-[0.02em] text-white">
          {language === "th" ? "ตัวเลือกผู้เชี่ยวชาญ" : "EXPERT CHOICE"}
        </div>
      ) : null}

      {/* Plan name */}
      <h3 className="text-[23px] font-semibold leading-[24px] tracking-[-0.01em] text-white">
        {plan.name}
      </h3>

      {/* Subtitle */}
      <p className="h-[48px] overflow-hidden text-[12px] font-medium leading-[15px] text-zinc-300/80">
        {subtitle}
      </p>

      {/* Price block */}
      <div className="flex h-[64px] flex-col gap-0">
        {isTeam ? (
          <>
            {showAnnual ? (
              <div className="flex flex-wrap items-baseline gap-x-[6px] gap-y-1">
                <span className="text-[22px] font-medium text-zinc-500 line-through">
                  {displayTeamSeatPrice}
                </span>
                <span className="text-[27px] font-semibold leading-none text-white">
                  {displayTeamAnnualSeatPrice}
                </span>
                <span className="text-[12px] font-medium text-zinc-300">
                  / seat / {language === "th" ? "เดือน" : "month"}
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-[6px] gap-y-1">
                <span className="text-[31px] font-semibold leading-none text-white">
                  {displayTeamSeatPrice}
                </span>
                <span className="text-[12px] font-medium text-zinc-300">
                  / seat / {language === "th" ? "เดือน" : "month"}
                </span>
              </div>
            )}
            <p className="mt-[7px] text-[11px] font-medium leading-[15px] text-zinc-400">
              {showAnnual
                ? language === "th"
                  ? "ชำระรายปี เครดิตเติมเพิ่มตามการใช้งาน"
                  : "Billed annually. Credits are topped up by usage."
                : language === "th"
                  ? "เครดิตเติมเพิ่มตามการใช้งาน"
                  : "Credits are topped up by usage."}
            </p>
          </>
        ) : showAnnual ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-[6px] gap-y-1">
              <span className="text-[22px] font-medium text-zinc-500 line-through">
                {displayMonthlyPrice}
              </span>
              <span className="text-[27px] font-semibold leading-none text-white">
                {displayAnnualPerMonth}
              </span>
              <span className="text-[13px] font-medium text-zinc-300">
                /{language === "th" ? "เดือน" : "month"}
              </span>
            </div>
            <p className="mt-[7px] text-[11px] font-medium leading-[15px] text-zinc-400">
              {language === "th" ? "ชำระรายปี" : "Billed annually"}
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-[6px] gap-y-1">
              <span className="text-[31px] font-semibold leading-none text-white">
                {displayMonthlyPrice}
              </span>
              <span className="text-[13px] font-medium text-zinc-300">
                /{language === "th" ? "เดือน" : "month"}
              </span>
            </div>
            <p className="mt-[7px] text-[11px] font-medium leading-[15px] text-zinc-400">
              {language === "th" ? "ชำระรายเดือน" : "Billed monthly"}
            </p>
          </>
        )}
      </div>

      {/* CTA */}
      <button
        onClick={onSubscribe}
        disabled={(!isTeam && isCurrent) || submitting}
        className={cn(
          "mt-[8px] inline-flex h-[36px] w-full items-center justify-center gap-2 rounded-full text-[13px] font-semibold transition-colors",
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
        <div className="mt-[3px] px-[2px] text-[12.5px] font-semibold leading-[13px]">
          <span
            className={cn(
              "font-semibold",
              accent === "blue" ? "text-[#4f6cff]" : accent === "purple" ? "text-[#a855f7]" : "text-white"
            )}
          >
            {credits.toLocaleString()}{" "}
            <span className="font-medium text-zinc-300">
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

      {isTeam && (
        <div className="mt-[3px] grid gap-[5px] px-[2px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div className="flex items-center gap-[6px] text-[12px] font-semibold leading-[13px] text-zinc-100">
              <Users className="h-[13px] w-[13px] text-purple-300" />
              Seats
            </div>
            <div className="flex h-[28px] items-center overflow-hidden rounded-full bg-white/[0.07]">
              <button
                type="button"
                onClick={decrementSeats}
                disabled={teamSeats <= TEAM_MIN_SEATS}
                className="grid h-[28px] w-[28px] place-items-center text-zinc-300 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Decrease seats"
              >
                <Minus className="h-[12px] w-[12px]" />
              </button>
              <span className="min-w-[32px] text-center text-[12.5px] font-semibold text-white">{teamSeats}</span>
              <button
                type="button"
                onClick={incrementSeats}
                className="grid h-[28px] w-[28px] place-items-center text-zinc-300 transition-colors hover:bg-white/[0.08]"
                aria-label="Increase seats"
              >
                <Plus className="h-[12px] w-[12px]" />
              </button>
            </div>
          </div>
          <div className="grid gap-[2px] text-[11.5px] font-medium leading-[13px] text-zinc-400">
            <div className="flex justify-between gap-2">
              <span>Base credits</span>
              <span>{TEAM_BASE_CREDITS_PER_SEAT_MONTH.toLocaleString()} / seat</span>
            </div>
            <div className="flex justify-between gap-2 text-emerald-300">
              <span>Promotion</span>
              <span>+{TEAM_PROMO_CREDITS_PER_SEAT_MONTH.toLocaleString()} / seat</span>
            </div>
            <div className="flex justify-between gap-2 pt-[1px] text-[12px] font-semibold leading-[13px] text-white">
              <span>{teamSeats} seats total</span>
              <span>{teamCreditsForSelectedSeats.toLocaleString()} credits</span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-[2px] flex flex-col gap-[2px]">
        <ModelAvailabilityRow label="Seedance 2.0" accent={accent} language={language} />
        <ModelAvailabilityRow label="GPT Image 2" accent={accent} language={language} />
      </div>

      {/* Pro discount line / Team discount line */}
      {isPro && (
        <div className="flex min-h-[16px] items-center gap-[6px] text-[12px] font-medium leading-[16px] text-emerald-300">
          <span className="flex h-[16px] w-[13px] shrink-0 items-center justify-center">
            <Check className="h-[11px] w-[11px]" />
          </span>
          <span>{language === "th" ? "ลดค่าเครดิต 10%" : "10% discount on credit usage"}</span>
        </div>
      )}
      {isTeam && (
        <div className="flex min-h-[16px] items-center gap-[6px] text-[12px] font-medium leading-[16px] text-emerald-300">
          <span className="flex h-[16px] w-[13px] shrink-0 items-center justify-center">
            <Check className="h-[11px] w-[11px]" />
          </span>
          <span>{language === "th" ? "ค่าเครดิตถูกกว่า 20%" : "20% cheaper cost per credit"}</span>
        </div>
      )}

      {/* Generator quota line */}
      {plan.generator_quota_label && (
        <div className="flex min-h-[16px] items-center gap-[6px] text-[12px] font-medium leading-[16px] text-zinc-300">
          <span className="flex h-[16px] w-[13px] shrink-0 items-center justify-center">
            <Check className="h-[11px] w-[11px] text-emerald-400" />
          </span>
          <span>{plan.generator_quota_label}</span>
        </div>
      )}

      {/* Feature list */}
      <ul className="mt-[1px] flex flex-col gap-[1px]">
        {FEATURE_ROWS.map((row) => {
          const has = row.plans[plan.name] ?? false;
          return (
            <li
              key={row.en}
              className={cn(
                "min-h-[16px] items-center gap-[6px] py-0 text-[12px] font-medium leading-[16px]",
                has ? "flex text-zinc-100" : "hidden text-zinc-600 sm:flex"
              )}
            >
              {has ? (
                <span className="flex h-[16px] w-[13px] shrink-0 items-center justify-center">
                  <Check className="h-[11px] w-[11px] text-[#4f6cff]" />
                </span>
              ) : (
                <span className="flex h-[16px] w-[13px] shrink-0 items-center justify-center">
                  <X className="h-[11px] w-[11px] text-zinc-600" />
                </span>
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
        <div className="mt-auto pt-[4px]">
          <div className="flex min-h-[16px] items-center gap-[6px] text-[12px] font-semibold leading-[16px] text-zinc-100">
            <span className="flex h-[16px] w-[13px] shrink-0 items-center justify-center">
              <Check className="h-[11px] w-[11px] text-[#4f6cff]" />
            </span>
            <span>
              {language === "th" ? "สต็อก 250M+ ภาพและวิดีโอ" : "250M+ Premium assets"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

const ModelAvailabilityRow = ({
  label,
  accent,
  language,
}: {
  label: string;
  accent: "blue" | "purple" | "neutral";
  language: string;
}) => (
  <div className="flex min-h-[18px] items-center justify-between gap-2 text-[12px] font-semibold leading-[18px] text-zinc-100">
    <span className="inline-flex items-center gap-[6px]">
      <Sparkles
        className={cn(
          "h-[11px] w-[11px]",
          accent === "purple" ? "text-[#a855f7]" : "text-[#4f6cff]",
        )}
      />
      {label}
    </span>
    <span
      className={cn(
        "text-[9px] font-black uppercase leading-none",
        accent === "purple" ? "text-[#a855f7]" : "text-[#4f6cff]",
      )}
    >
      {language === "th" ? "พร้อมใช้" : "NOW AVAILABLE"}
    </span>
  </div>
);

export default Pricing;
