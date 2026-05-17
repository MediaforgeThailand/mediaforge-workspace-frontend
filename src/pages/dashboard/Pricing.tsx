import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Check, X, Loader2, Sparkles, Minus, Plus, Users } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { friendlyError } from "@/lib/friendlyError";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import EmbeddedCheckoutModal from "@/components/EmbeddedCheckoutModal";
import useDocumentTitle from "@/hooks/useDocumentTitle";
import { UserMenu } from "@/components/workspace/UserMenu";
import {
  // `WORKSPACE_CURRENCIES` previously fed the now-removed
  // currency-picker dropdown. Auto-detection happens via
  // `detectWorkspaceCurrency()` below — no user-visible choice.
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
//   - Team card: CI-yellow "EXPERT CHOICE" ribbon + thicker highlighted border
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
type ProfilePlanFields = {
  subscription_plan_id?: string | null;
  current_plan_id?: string | null;
};

// Per-plan subtitle copy (Phase 6 promo).
const PLAN_SUBTITLE_KEYS = {
  Free: "pricing.plan.free.subtitle",
  Starter: "pricing.plan.starter.subtitle",
  Creator: "pricing.plan.creator.subtitle",
  Pro: "pricing.plan.pro.subtitle",
  Team: "pricing.plan.team.subtitle",
} as const;
type PlanName = keyof typeof PLAN_SUBTITLE_KEYS;

// Feature rows shown inside every card. Each entry maps a label to which plans include it.
// Order matches the screenshot top-to-bottom.
const FEATURE_ROWS = [
  {
    key: "pricing.feature.allModels",
    plans: { Free: false, Starter: true, Creator: true, Pro: true, Team: true },
  },
  {
    key: "pricing.feature.spacesCanvas",
    plans: { Free: true, Starter: true, Creator: true, Pro: true, Team: true },
  },
  {
    key: "pricing.feature.proEditing",
    plans: { Free: true, Starter: true, Creator: true, Pro: true, Team: true },
  },
  {
    key: "pricing.feature.audioGeneration",
    plans: { Free: true, Starter: true, Creator: true, Pro: true, Team: true },
  },
  {
    key: "pricing.feature.commercialLicense",
    plans: { Free: false, Starter: true, Creator: true, Pro: true, Team: true },
  },
  {
    key: "pricing.feature.topUpAnytime",
    plans: { Free: true, Starter: true, Creator: true, Pro: true, Team: true },
  },
  {
    key: "pricing.feature.trainStyles",
    plans: { Free: false, Starter: false, Creator: true, Pro: true, Team: true },
  },
  {
    key: "pricing.feature.earlyAccess",
    plans: { Free: false, Starter: false, Creator: false, Pro: true, Team: true },
  },
  {
    key: "pricing.feature.fileNaming",
    plans: { Free: false, Starter: false, Creator: false, Pro: true, Team: true },
  },
  {
    key: "pricing.feature.teamCreditPool",
    plans: { Free: false, Starter: false, Creator: false, Pro: false, Team: true },
  },
  {
    key: "pricing.feature.centralBillingSso",
    plans: { Free: false, Starter: false, Creator: false, Pro: false, Team: true },
  },
] as const;

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
const FREE_PLAN_CREDITS = 500;
const FREE_PLAN: SubscriptionPlan = {
  id: "free-plan",
  name: "Free",
  target: "user",
  billing_cycle: "monthly",
  price_thb: 0,
  upfront_credits: FREE_PLAN_CREDITS,
  flow_quota: null,
  sort_order: 0,
  is_active: true,
  stripe_price_id: null,
  stripe_price_id_monthly: null,
  stripe_price_id_annual: null,
  annual_price_thb: 0,
  annual_credits: FREE_PLAN_CREDITS * 12,
  credit_discount_percent: 0,
  generator_quota: 1,
  generator_quota_label: "1 generator engine",
  is_featured: false,
};

const Pricing = () => {
  const { t: i18n, language } = useLanguage();
  useDocumentTitle(i18n("pricing.pricingMediaforge"));
  const navigate = useNavigate();
  const { refetch } = useCredits();
  const { profile, refreshProfile, session, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [topupPackages, setTopupPackages] = useState<TopupPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<CycleTab>("monthly");
  /* Currency is auto-detected from the visitor's country and never
   *  changes during the session — the user explicitly asked for the
   *  picker dropdown to be removed (visitors in TH always see THB,
   *  everyone else gets USD). Using `useMemo` instead of `useState`
   *  drops the unused `setCurrency` setter and the ESLint
   *  unused-binding warning that came with it. */
  const currency = useMemo<SupportedWorkspaceCurrency>(
    () => detectWorkspaceCurrency(),
    [],
  );
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
      supabase.from("topup_packages").select("*").eq("is_active", true).order("sort_order"),
    ]).then(([planRes, topupRes]) => {
      if (planRes.data) setPlans(planRes.data as SubscriptionPlan[]);
      if (topupRes.data) setTopupPackages(topupRes.data as TopupPackage[]);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("workspace_currency", currency);
    } catch {
      // Ignore private browsing / disabled storage.
    }
  }, [currency]);

  // Toast on Stripe success redirect.
  useEffect(() => {
    if (searchParams.get("payment") === "success" || searchParams.get("topup") === "success") {
      toast({ title: i18n("pricingPaymentSuccess"), description: i18n("pricingCreditsAdded") });
      refetch();
      refreshProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const profilePlan = profile as unknown as ProfilePlanFields | null;
  const currentPlanId = profilePlan?.subscription_plan_id || profilePlan?.current_plan_id || null;
  const currentPlan =
    plans.find((p) => p.id === currentPlanId) ||
    ((profile as { subscription_status?: string | null; plan_name?: string | null } | null)?.subscription_status === "free" ||
    (profile as { plan_name?: string | null } | null)?.plan_name === "Free"
      ? FREE_PLAN
      : null);

  // Pricing layout. Inject Free locally as a safety net until every remote DB has
  // the seed migration applied.
  const orderedPlans = useMemo(() => {
    const rows = plans.some((plan) => plan.name === "Free" && plan.target === "user")
      ? plans
      : [FREE_PLAN, ...plans];
    return [...rows].sort((a, b) => a.sort_order - b.sort_order);
  }, [plans]);

  const handleSubscribe = (plan: SubscriptionPlan) => {
    if (authLoading) {
      toast({
        title: i18n("pricing.checkout.checkingAccount"),
        description: i18n("pricing.checkout.pleaseWaitTryAgain"),
      });
      return;
    }

    if (!session?.access_token) {
      navigate(`/auth?redirect=${encodeURIComponent("/app/pricing")}`);
      return;
    }

    if (plan.name === "Free") {
      toast({
        title: "Free plan",
        description: "Free is included automatically. Upgrade when you need image, video, or upscale.",
      });
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
    if (!priceId) {
      toast({
        title: i18n("pricing.checkout.notAvailable"),
        description: i18n("pricing.checkout.priceNotConfigured", {
          cycle: i18n(cycle === "annual" ? "pricing.cycle.annual" : "pricing.cycle.monthly"),
        }),
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
        title: i18n("common.couldNotOpenBillingPortal"),
        description: friendlyError(e, language === "th" ? "th" : "en"),
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
    if (plan.name === "Free") {
      return currentPlan?.name === "Free"
        ? i18n("pricing.cta.currentPlan")
        : "Included";
    }
    if (plan.target === "team") {
      return i18n("pricing.cta.startTeam");
    }
    if (currentPlan && currentPlan.id === plan.id) {
      return i18n("pricing.cta.currentPlan");
    }
    if (currentPlan && currentPlan.target === "user") {
      if (currentPlan.sort_order < plan.sort_order)
        return i18n("pricing.cta.upgrade");
      if (currentPlan.sort_order > plan.sort_order)
        return i18n("pricing.cta.downgrade");
    }
    return i18n("pricing.cta.upgrade");
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
          aria-label={i18n("common.backToWorkspace2")}
        >
          <ArrowLeft className="h-5 w-5 text-neutral-300" />
        </button>

        <h1 className="mx-auto max-w-[860px] text-[38px] font-black leading-[0.96] tracking-[-0.02em] text-white sm:text-[50px] md:text-[58px]">
          {i18n("pricing.letSBecomeProfessionalsTogether")}
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
                {i18n("pricing.cycle.monthly")}
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
                {i18n("pricing.cycle.annual")}
                <span className={cn(
                  "rounded-full px-[7px] py-[2px] text-[10px] font-black",
                  cycle === "annual" ? "bg-emerald-500/15 text-emerald-700" : "bg-emerald-500/15 text-emerald-300",
                )}>
                  -20%
                </span>
              </button>
            </div>
              {/* Currency selector intentionally removed — user
               *  asked for the currency to be auto-detected from
               *  the visitor's country (see `detectWorkspaceCurrency`
               *  in the `useState` initializer above) with no
               *  user-visible choice. Keeping the state + setter
               *  unwired below so any non-UI caller (e.g. the
               *  invoice preview) still gets a value, but no
               *  picker renders. To re-enable the picker, restore
               *  the `<select id="workspace-currency">` block from
               *  git history. */}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-yellow-400" />
            </div>
          ) : orderedPlans.length === 0 ? (
            <p className="py-16 text-center text-neutral-500">
              {i18n("pricing.emptyPlans")}
            </p>
          ) : (
            <div className="grid grid-cols-1 items-start gap-[14px] pt-[26px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {orderedPlans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  cycle={cycle}
                  ctaLabel={ctaLabelFor(plan)}
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
  ctaLabel: string;
  isCurrent: boolean;
  submitting: boolean;
  onSubscribe: () => void;
  teamSeats: number;
  onTeamSeatsChange: (seats: number) => void;
  currency: SupportedWorkspaceCurrency;
}

const PlanCard = ({ plan, cycle, ctaLabel, isCurrent, submitting, onSubscribe, teamSeats, onTeamSeatsChange, currency }: PlanCardProps) => {
  const { t: i18n } = useLanguage();
  const isTeam = plan.target === "team";
  const isFree = plan.name === "Free";
  const isPro = plan.is_featured === true; // Phase 1 seeded Pro as is_featured.
  const displayPlanName = plan.name === "Team" ? i18n("pricing.plan.team.name") : plan.name;
  const subtitleKey = PLAN_SUBTITLE_KEYS[plan.name as PlanName];
  const subtitle = isFree
    ? "500 starter credits/month. All workspace generators are available."
    : subtitleKey ? i18n(subtitleKey) : "";

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
      ? "border-yellow-400/85 shadow-[0_0_22px_rgba(238,255,0,0.22)]"
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
          {i18n("pricing.badge.recommended")}
        </div>
      ) : isTeam ? (
        <div className="absolute left-0 right-0 top-0 flex h-[24px] items-center justify-center bg-[#7b49d8] text-[10px] font-black uppercase tracking-[0.02em] text-white">
          {i18n("pricing.badge.expertChoice")}
        </div>
      ) : null}

      {/* Plan name */}
      <h3 className="text-[23px] font-semibold leading-[24px] tracking-[-0.01em] text-white">
        {displayPlanName}
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
                  / {i18n("pricing.seat")} / {i18n("pricing.period.month")}
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-[6px] gap-y-1">
                <span className="text-[31px] font-semibold leading-none text-white">
                  {displayTeamSeatPrice}
                </span>
                <span className="text-[12px] font-medium text-zinc-300">
                  / {i18n("pricing.seat")} / {i18n("pricing.period.month")}
                </span>
              </div>
            )}
            <p className="mt-[7px] text-[11px] font-medium leading-[15px] text-zinc-400">
              {showAnnual
                ? i18n("pricing.team.billedAnnuallyUsageCredits")
                : i18n("pricing.team.usageCredits")}
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
                /{i18n("pricing.period.month")}
              </span>
            </div>
            <p className="mt-[7px] text-[11px] font-medium leading-[15px] text-zinc-400">
              {i18n("pricing.billing.annually")}
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-[6px] gap-y-1">
              <span className="text-[31px] font-semibold leading-none text-white">
                {displayMonthlyPrice}
              </span>
              <span className="text-[13px] font-medium text-zinc-300">
                /{i18n("pricing.period.month")}
              </span>
            </div>
            <p className="mt-[7px] text-[11px] font-medium leading-[15px] text-zinc-400">
              {i18n("pricing.billing.monthly")}
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
            {i18n("pricing.cta.opening")}
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
              accent === "blue" ? "text-[#4f6cff]" : accent === "purple" ? "text-[#F4FF00]" : "text-white"
            )}
          >
            {credits.toLocaleString()}{" "}
            <span className="font-medium text-zinc-300">
              {cycle === "annual"
                ? i18n("pricing.creditsPerYear")
                : i18n("pricing.creditsPerMonth")}
            </span>
          </span>
        </div>
      )}

      {isTeam && (
        <div className="mt-[3px] grid gap-[5px] px-[2px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div className="flex items-center gap-[6px] text-[12px] font-semibold leading-[13px] text-zinc-100">
              <Users className="h-[13px] w-[13px] text-yellow-300" />
              {i18n("pricing.seats")}
            </div>
            <div className="flex h-[28px] items-center overflow-hidden rounded-full bg-white/[0.07]">
              <button
                type="button"
                onClick={decrementSeats}
                disabled={teamSeats <= TEAM_MIN_SEATS}
                className="grid h-[28px] w-[28px] place-items-center text-zinc-300 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={i18n("pricing.decreaseSeats")}
              >
                <Minus className="h-[12px] w-[12px]" />
              </button>
              <span className="min-w-[32px] text-center text-[12.5px] font-semibold text-white">{teamSeats}</span>
              <button
                type="button"
                onClick={incrementSeats}
                className="grid h-[28px] w-[28px] place-items-center text-zinc-300 transition-colors hover:bg-white/[0.08]"
                aria-label={i18n("pricing.increaseSeats")}
              >
                <Plus className="h-[12px] w-[12px]" />
              </button>
            </div>
          </div>
          <div className="grid gap-[2px] text-[11.5px] font-medium leading-[13px] text-zinc-400">
            <div className="flex justify-between gap-2">
              <span>{i18n("pricing.baseCredits")}</span>
              <span>{TEAM_BASE_CREDITS_PER_SEAT_MONTH.toLocaleString()} / {i18n("pricing.seat")}</span>
            </div>
            <div className="flex justify-between gap-2 text-emerald-300">
              <span>{i18n("pricing.promotion")}</span>
              <span>+{TEAM_PROMO_CREDITS_PER_SEAT_MONTH.toLocaleString()} / {i18n("pricing.seat")}</span>
            </div>
            <div className="flex justify-between gap-2 pt-[1px] text-[12px] font-semibold leading-[13px] text-white">
              <span>{i18n("pricing.seatsTotal", { count: teamSeats })}</span>
              <span>{teamCreditsForSelectedSeats.toLocaleString()} {i18n("common.credits")}</span>
            </div>
          </div>
        </div>
      )}

      {isFree ? (
        <div className="mt-[2px] rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[11.5px] font-semibold leading-[15px] text-amber-100">
          All workspace generators are available. Credits apply per run.
        </div>
      ) : (
        <div className="mt-[2px] flex flex-col gap-[2px]">
          <ModelAvailabilityRow label="Seedance 2.0" accent={accent} />
          <ModelAvailabilityRow label="GPT Image 2" accent={accent} />
        </div>
      )}

      {/* Pro discount line / Team discount line */}
      {isPro && (
        <div className="flex min-h-[16px] items-center gap-[6px] text-[12px] font-medium leading-[16px] text-emerald-300">
          <span className="flex h-[16px] w-[13px] shrink-0 items-center justify-center">
            <Check className="h-[11px] w-[11px]" />
          </span>
          <span>{i18n("pricing.discount.proCredit")}</span>
        </div>
      )}
      {isTeam && (
        <div className="flex min-h-[16px] items-center gap-[6px] text-[12px] font-medium leading-[16px] text-emerald-300">
          <span className="flex h-[16px] w-[13px] shrink-0 items-center justify-center">
            <Check className="h-[11px] w-[11px]" />
          </span>
          <span>{i18n("pricing.discount.teamCredit")}</span>
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
          const has = row.plans[plan.name as PlanName] ?? false;
          return (
            <li
              key={row.key}
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
              <span>{i18n(row.key)}</span>
            </li>
          );
        })}
      </ul>

      {/* GET UNLIMITED model checklist removed — see MODEL_ROWS note
          at the top of the file for the rationale. */}

      {/* 250M+ Premium assets — only Creator/Pro/Team (Starter excluded) */}
      {plan.name !== "Starter" && !isFree && (
        <div className="mt-auto pt-[4px]">
          <div className="flex min-h-[16px] items-center gap-[6px] text-[12px] font-semibold leading-[16px] text-zinc-100">
            <span className="flex h-[16px] w-[13px] shrink-0 items-center justify-center">
              <Check className="h-[11px] w-[11px] text-[#4f6cff]" />
            </span>
            <span>
              {i18n("pricing.feature.premiumAssets")}
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
}: {
  label: string;
  accent: "blue" | "purple" | "neutral";
}) => {
  const { t: i18n } = useLanguage();

  return (
    <div className="flex min-h-[18px] items-center justify-between gap-2 text-[12px] font-semibold leading-[18px] text-zinc-100">
      <span className="inline-flex items-center gap-[6px]">
        <Sparkles
          className={cn(
            "h-[11px] w-[11px]",
            accent === "purple" ? "text-[#F4FF00]" : "text-[#4f6cff]",
          )}
        />
        {label}
      </span>
      <span
        className={cn(
          "text-[9px] font-black uppercase leading-none",
          accent === "purple" ? "text-[#F4FF00]" : "text-[#4f6cff]",
        )}
      >
        {i18n("pricing.badge.nowAvailable")}
      </span>
    </div>
  );
};

export default Pricing;
