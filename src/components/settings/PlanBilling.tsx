import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sparkles,
  Plus,
  Loader2,
  CreditCard,
  Mail,
  AlertCircle,
  Building2,
  CheckCircle2,
  Trash2,
  Star,
  ShieldAlert,
  QrCode,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCredits } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import BuyCreditsDialog from "./BuyCreditsDialog";
import BillingHistoryDialog from "./BillingHistoryDialog";
import BillingInfoDialog from "./BillingInfoDialog";
import { AutoRefillSetupDialog } from "./AutoRefillSetupDialog";
import UpdatePaymentDialog from "./UpdatePaymentDialog";
import { cn } from "@/lib/utils";

/**
 * Plan & billing — the main page-level component for the new
 * Settings sub-rail item.
 *
 * Sections (top → bottom):
 *   1. Plan card        — current plan name, price, billing cycle,
 *                         next renewal date. CTAs for "Create your
 *                         team" (placeholder) and "Upgrade plan".
 *   2. Credits card     — total / spent / available with progress
 *                         bar, auto-refill toggle, "Buy extra
 *                         credits" CTA.
 *   3. Billing info     — name + email rendered from profile, with
 *                         "Change billing information" + "Billing
 *                         history" buttons.
 *   4. Payment details  — Stripe payment methods list with default
 *                         marker; "Update payment details" CTA.
 *   5. Danger zone      — collapsible cancel-subscription flow that
 *                         routes through customer-portal so Stripe
 *                         handles the at-period-end cancellation.
 *
 * Free users are first-class citizens — every section degrades
 * gracefully when there's no plan, no Stripe customer, and zero
 * credits. The page never breaks for them.
 */

interface PlanRow {
  id: string;
  name: string;
  price_thb: number | null;
  annual_price_thb: number | null;
  billing_cycle: string;
}

interface PaymentMethod {
  id: string;
  type: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  funding: string | null;
}

interface BillingAddress {
  name?: string;
  email?: string;
  line1?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  tax_id?: string;
}

interface PlanBillingProfile {
  subscription_plan_id?: string | null;
  current_plan_id?: string | null;
  subscription_billing_cycle?: string | null;
  billing_interval?: string | null;
  billing_address?: BillingAddress | null;
  current_period_end?: string | null;
}

const formatPaymentLabel = (pm: PaymentMethod | null | undefined) => {
  if (!pm) return null;
  if (pm.type === "card" && pm.last4) {
    const brand = pm.brand ? pm.brand[0].toUpperCase() + pm.brand.slice(1) : "Card";
    return `${brand} ************${pm.last4}`;
  }
  if (pm.type === "promptpay") return "PromptPay";
  return pm.type;
};

const formatLongDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

const denseButtonClass =
  "h-[32px] gap-[6px] rounded-lg px-[12px] text-[12.5px] leading-[16px] [&_svg]:size-[14px]";
const compactOutlineButtonClass = cn(
  denseButtonClass,
  "border-white/10 text-zinc-300 hover:bg-white/5",
);
const compactPrimaryButtonClass = cn(
  denseButtonClass,
  "bg-violet-600 text-white hover:bg-violet-500",
);

const PlanBilling = () => {
  const { t: i18n } = useLanguage();
  const { user, profile, refreshProfile } = useAuth();
  const { credits } = useCredits();
  const navigate = useNavigate();
  const { toast } = useToast();
  const billingProfile = profile as (typeof profile & PlanBillingProfile) | null;
  const planId = billingProfile?.subscription_plan_id || billingProfile?.current_plan_id;
  const currentPeriodEnd = billingProfile?.current_period_end;

  // ── State ────────────────────────────────────────────────────
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [defaultPmId, setDefaultPmId] = useState<string | null>(null);
  const [autoRefill, setAutoRefill] = useState<boolean>(true);
  const [loadingPMs, setLoadingPMs] = useState(false);

  // Dialogs
  const [showBuyCredits, setShowBuyCredits] = useState(false);
  const [showBillingHistory, setShowBillingHistory] = useState(false);
  const [showBillingInfo, setShowBillingInfo] = useState(false);
  const [showUpdatePayment, setShowUpdatePayment] = useState(false);
  const [showTeamPlaceholder, setShowTeamPlaceholder] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // ── Initial loads ────────────────────────────────────────────
  // Plan row (joined from subscription_plans). We only fetch when
  // profile exposes a subscription_plan_id, otherwise we render the
  // "Free" fallback.
  useEffect(() => {
    if (!planId) {
      setPlan(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("id, name, price_thb, annual_price_thb, billing_cycle")
        .eq("id", planId)
        .maybeSingle();
      if (cancelled) return;
      setPlan(data as unknown as PlanRow | null);
    })();
    return () => { cancelled = true; };
  }, [planId]);

  // Read auto_refill from profile (column added in
  // 20260429190000_profiles_billing_settings_columns).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("subscription_auto_refill")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const next = (data as { subscription_auto_refill?: boolean } | null)?.subscription_auto_refill;
      if (typeof next === "boolean") setAutoRefill(next);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Payment methods — pulled from Stripe via the new edge function.
  // We refetch when the Update dialog closes to show the new card.
  const refreshPaymentMethods = async () => {
    setLoadingPMs(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-payment-methods", {
        body: { op: "list" },
      });
      if (error || data?.error) {
        // Free user with no Stripe customer is fine; only log other errors.
        console.warn("[plan-billing] payment_methods list failed:", error?.message || data?.error);
        return;
      }
      setPaymentMethods((data?.payment_methods ?? []) as PaymentMethod[]);
      setDefaultPmId(data?.default_payment_method_id ?? null);
    } finally {
      setLoadingPMs(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void refreshPaymentMethods();
  }, [user]);

  // ── Derived ──────────────────────────────────────────────────
  const isFree = !plan;
  const billingCycle = billingProfile?.subscription_billing_cycle ?? billingProfile?.billing_interval ?? "monthly";
  const isAnnual = billingCycle === "annual";

  const planPrice = useMemo(() => {
    if (!plan) return 0;
    return isAnnual && plan.annual_price_thb != null ? Number(plan.annual_price_thb) : Number(plan.price_thb ?? 0);
  }, [plan, isAnnual]);

  const totalPurchased = credits?.total_purchased ?? 0;
  const used = credits?.total_used ?? 0;
  const balance = credits?.balance ?? 0;
  const usagePct = totalPurchased > 0 ? Math.min((used / totalPurchased) * 100, 100) : 0;

  const defaultPm = paymentMethods.find((pm) => pm.id === defaultPmId) ?? null;
  const defaultPaymentLabel = formatPaymentLabel(defaultPm);

  const billingAddress = billingProfile?.billing_address ?? null;
  const billingName = billingAddress?.name ?? profile?.display_name ?? "—";
  const billingEmail = billingAddress?.email ?? user?.email ?? "—";

  // ── Handlers ─────────────────────────────────────────────────
  /* Auto-refill toggle.
   *
   * ON: open the AutoRefillSetupDialog → user binds a card via
   *     Stripe Elements (3DS / OTP fires per bank policy) →
   *     server does a ฿20 verify charge + immediate refund to
   *     prove the card actually charges → only then is the toggle
   *     persisted as `true` and `auto_refill_payment_method_id`
   *     saved.
   *
   * OFF: clear the saved card + flip the boolean. No dialog needed —
   *     turning off shouldn't gate anything.
   *
   * Pre-fix: the toggle just wrote a boolean to profiles with no
   * downstream effect. Audit caught this as a phantom feature. */
  const [autoRefillSetupOpen, setAutoRefillSetupOpen] = useState(false);
  const handleAutoRefill = async (next: boolean) => {
    if (!user) return;
    if (next) {
      // Don't optimistically flip — wait until the dialog finishes
      // and `onEnabled` fires. Until then the toggle stays off.
      setAutoRefillSetupOpen(true);
      return;
    }
    // Disable path: call the edge function to wipe the saved PM
    // server-side, then refresh the local toggle state.
    setAutoRefill(false);
    try {
      const { error } = await supabase.functions.invoke("setup-autorefill", {
        body: { action: "disable" },
      });
      if (error) throw error;
      await refreshProfile();
      toast({
        title: i18n("settings.planBilling.autoRefillDisabled"),
        description: i18n("settings.planBilling.savedCardDetached"),
      });
    } catch (err) {
      // Best effort: server fail keeps the local toggle off; the
      // next refresh will sync.
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: i18n("settings.planBilling.couldNotSave"), description: msg, variant: "destructive" });
    }
  };

  // Called by the dialog after verify_and_enable succeeds.
  const handleAutoRefillEnabled = async () => {
    setAutoRefill(true);
    await refreshProfile();
  };

  const handleCancelSubscription = async () => {
    setCancelling(true);
    try {
      // Delegate to Q's customer-portal — Stripe-hosted page handles
      // cancel-at-period-end UX safely. We keep our own cancel
      // confirmation for the warning copy, but the actual
      // mutation happens in Stripe's UI to avoid edge-case bugs.
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error || data?.error) throw new Error(error?.message || data?.error);
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error(i18n("settings.planBilling.customerPortalDidNotReturnUrl"));
    } catch (e) {
      toast({
        title: i18n("common.couldNotOpenBillingPortal"),
        description: e instanceof Error ? e.message : i18n("settings.planBilling.tryAgainInMoment"),
        variant: "destructive",
      });
      setCancelling(false);
    }
  };

  const formatThb = (n: number) => `THB ${n.toLocaleString()}`;
  const formatCreditsBig = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
    return n.toLocaleString();
  };

  return (
    <div className="max-w-3xl space-y-[14px]">
      <div>
        <h2 className="text-[21px] font-semibold leading-[27px] text-zinc-50">{i18n("settings.planBilling.planBilling")}</h2>
        <p className="mt-[2px] text-[13px] leading-[18px] text-zinc-500">
          {i18n("settings.planBilling.subtitle")}
        </p>
      </div>

      {/* ── 1. Plan section ─────────────────────────────────── */}
      <section className="rounded-lg bg-white/[0.04] p-[14px]">
        <div className="flex items-center justify-between gap-[14px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-[8px]">
              <h3 className="text-[14px] font-semibold leading-[18px] text-zinc-50">
                {plan?.name ?? i18n("settings.planBilling.freePlan")}
              </h3>
              {!isFree && (
                <span className="text-[13px] leading-[18px] text-zinc-300">
                  {formatThb(planPrice)}
                  <span className="text-zinc-500">/{isAnnual ? i18n("settings.planBilling.year") : i18n("settings.planBilling.month")}</span>
                </span>
              )}
              {isFree && (
                <Badge variant="outline" className="border-white/15 px-[7px] py-[1px] text-[10.5px] leading-[14px] text-zinc-400">
                  {i18n("settings.planBilling.noActiveSubscription")}
                </Badge>
              )}
            </div>
            <div className="mt-[6px] flex items-center gap-[8px] text-[12px] leading-[16px] text-zinc-500">
              {!isFree && <span>{i18n("settings.planBilling.billed", { cycle: isAnnual ? i18n("settings.planBilling.annually") : i18n("settings.planBilling.monthly") })}</span>}
              {!isFree && currentPeriodEnd && (
                <>
                  <span className="text-zinc-700">·</span>
                  <span>{i18n("settings.planBilling.nextPayment", { date: formatLongDate(currentPeriodEnd) ?? "" })}</span>
                </>
              )}
              {isFree && <span>{i18n("settings.planBilling.upgradeToUnlockMoreCreditsAndPro")}</span>}
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-[8px]">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowTeamPlaceholder(true)}
              className={compactOutlineButtonClass}
            >
              <Building2 />
              {i18n("common.createYourTeam")}
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/app/pricing")}
              className={compactPrimaryButtonClass}
            >
              <Sparkles />
              {isFree ? i18n("settings.planBilling.viewPlans") : i18n("settings.planBilling.upgradePlan")}
            </Button>
          </div>
        </div>
      </section>

      {/* ── 2. Credits section ──────────────────────────────── */}
      <section className="rounded-lg bg-white/[0.04] p-[14px]">
        <div className="mb-[10px] flex flex-wrap items-start justify-between gap-[10px]">
          <div>
            <h3 className="text-[14px] font-semibold leading-[18px] text-zinc-50">{i18n("common.credits2")}</h3>
            <p className="mt-[2px] text-[12px] leading-[16px] text-zinc-500">
              {i18n("settings.planBilling.creditsResetEveryOnRenewal", { cycle: isAnnual ? i18n("settings.planBilling.year") : i18n("settings.planBilling.month") })}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-[8px]">
            <button
              type="button"
              role="switch"
              aria-checked={autoRefill}
              aria-label={i18n("settings.planBilling.autoRefillCredits")}
              onClick={() => void handleAutoRefill(!autoRefill)}
              title={i18n("settings.planBilling.autoRefillDescription")}
              className={cn(
                "flex h-[34px] items-center gap-[8px] rounded-full border px-[10px] text-[12px] font-semibold leading-[16px] transition-colors",
                autoRefill
                  ? "border-emerald-400/35 bg-emerald-500/12 text-emerald-100 hover:bg-emerald-500/18"
                  : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/15 hover:bg-white/[0.07] hover:text-white",
              )}
            >
              <span>{autoRefill ? i18n("settings.planBilling.autoRefillOn") : i18n("settings.planBilling.autoRefillOff")}</span>
              <span
                className={cn(
                  "relative h-[18px] w-[32px] rounded-full border transition-colors",
                  autoRefill ? "border-emerald-300/25 bg-emerald-400" : "border-white/10 bg-zinc-900",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[2px] h-[12px] w-[12px] rounded-full shadow-sm transition-transform",
                    autoRefill ? "translate-x-[15px] bg-zinc-950" : "translate-x-[3px] bg-zinc-500",
                  )}
                />
              </span>
            </button>
            <Button
              size="sm"
              onClick={() => setShowBuyCredits(true)}
              className={compactPrimaryButtonClass}
            >
              <Plus />
              {i18n("settings.planBilling.buyExtraCredits")}
            </Button>
          </div>
        </div>

        <div className="space-y-[8px]">
          <div className="flex items-baseline gap-[6px]">
            <span className="text-[28px] font-bold leading-[34px] tabular-nums text-zinc-50">
              {formatCreditsBig(balance)}
            </span>
            <span className="text-[12px] leading-[16px] text-zinc-500">{i18n("settings.planBilling.totalCredits")}</span>
          </div>

          <Progress value={usagePct} className="h-[5px] bg-white/[0.05]" />

          <div className="flex items-center justify-between text-[12px] leading-[16px] text-zinc-400">
            <span>
              {i18n("settings.planBilling.spent")} <span className="text-zinc-200 tabular-nums">{used.toLocaleString()}</span>
            </span>
            <span>
              {i18n("settings.planBilling.available")} <span className="text-zinc-200 tabular-nums">{balance.toLocaleString()}</span>
            </span>
          </div>
        </div>

      </section>

      {/* ── 3. Billing information ───────────────────────────── */}
      <section className="rounded-lg bg-white/[0.04] p-[14px]">
        <div className="flex items-center justify-between gap-[14px]">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold leading-[18px] text-zinc-50">{i18n("settings.planBilling.billingInformation")}</h3>
            <p className="mt-[6px] text-[12px] leading-[16px] text-zinc-300">
              {billingName} <span className="text-zinc-600">·</span>{" "}
              <span className="text-zinc-400">{billingEmail}</span>
            </p>
            {billingAddress?.line1 && (
              <p className="mt-[2px] truncate text-[11px] leading-[15px] text-zinc-500">
                {[billingAddress.line1, billingAddress.city, billingAddress.postal_code, billingAddress.country]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-[8px]">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBillingInfo(true)}
              className={compactOutlineButtonClass}
            >
              {i18n("settings.planBilling.change")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBillingHistory(true)}
              className={compactOutlineButtonClass}
            >
              {i18n("common.history")}
            </Button>
          </div>
        </div>
      </section>

      {/* ── 4. Payment details ───────────────────────────────── */}
      <section className="rounded-lg bg-white/[0.04] p-[14px]">
        <div className="mb-[10px] flex items-start justify-between gap-[14px]">
          <div>
            <h3 className="text-[14px] font-semibold leading-[18px] text-zinc-50">{i18n("settings.planBilling.paymentDetails")}</h3>
            <p className="mt-[2px] text-[12px] leading-[16px] text-zinc-500">
              {i18n("settings.planBilling.cardsSavedHereAreReusedForRenewals")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowUpdatePayment(true)}
            className={compactOutlineButtonClass}
          >
            {i18n("settings.planBilling.update")}
          </Button>
        </div>

        <div className="space-y-[8px]">
          {loadingPMs && (
            <div className="flex items-center gap-[8px] py-[8px] text-[12px] leading-[16px] text-zinc-500">
              <Loader2 className="h-[14px] w-[14px] animate-spin" />
              {i18n("settings.planBilling.loadingPaymentMethods")}
            </div>
          )}
          {!loadingPMs && paymentMethods.length === 0 && (
            <p className="text-[12px] leading-[16px] text-zinc-500 italic">
              {i18n("settings.planBilling.emptyPaymentMethodsDescription")}
            </p>
          )}
          {paymentMethods.map((pm) => {
            const isDefault = pm.id === defaultPmId;
            const isCard = pm.type === "card";
            return (
              <div
                key={pm.id}
                className={cn(
                  "flex items-center gap-[10px] rounded-lg border px-[12px] py-[9px]",
                  isDefault
                    ? "border-violet-500/30 bg-violet-500/[0.05]"
                    : "border-white/10 bg-white/[0.02]",
                )}
              >
                <div className="flex h-[32px] w-[32px] flex-shrink-0 items-center justify-center rounded-md bg-white/[0.05]">
                  {isCard ? (
                    <CreditCard className="h-[14px] w-[14px] text-zinc-300" />
                  ) : (
                    <QrCode className="h-[14px] w-[14px] text-emerald-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium leading-[16px] text-zinc-100">
                    {formatPaymentLabel(pm)}
                  </p>
                  {isCard && pm.exp_month && pm.exp_year && (
                    <p className="text-[11px] leading-[15px] text-zinc-500">
                      {i18n("settings.planBilling.expires", { date: `${String(pm.exp_month).padStart(2, "0")}/${String(pm.exp_year).slice(-2)}` })}
                    </p>
                  )}
                </div>
                {isDefault && (
                  <span className="rounded border border-violet-500/30 bg-violet-500/15 px-[6px] py-[2px] text-[10px] font-bold uppercase leading-[13px] text-violet-200">
                    <Star className="-mt-[2px] mr-[2px] inline h-[10px] w-[10px]" />
                    {i18n("settings.planBilling.default")}
                  </span>
                )}
                {!isDefault && isCard && (
                  <button
                    type="button"
                    onClick={async () => {
                      const { error } = await supabase.functions.invoke("stripe-payment-methods", {
                        body: { op: "set_default", payment_method_id: pm.id },
                      });
                      if (error) {
                        toast({ title: i18n("settings.planBilling.couldNotUpdate"), variant: "destructive" });
                      } else {
                        await refreshPaymentMethods();
                        toast({ title: i18n("settings.planBilling.defaultUpdated") });
                      }
                    }}
                    className="text-[11px] leading-[15px] text-zinc-400 transition-colors hover:text-zinc-100"
                  >
                    {i18n("settings.planBilling.makeDefault")}
                  </button>
                )}
                {!isDefault && (
                  <button
                    type="button"
                    onClick={async () => {
                      const { error } = await supabase.functions.invoke("stripe-payment-methods", {
                        body: { op: "detach", payment_method_id: pm.id },
                      });
                      if (error) {
                        toast({ title: i18n("settings.planBilling.couldNotRemove"), variant: "destructive" });
                      } else {
                        await refreshPaymentMethods();
                      }
                    }}
                    className="p-[4px] text-zinc-500 transition-colors hover:text-red-400"
                    aria-label={i18n("settings.planBilling.removePaymentMethod")}
                  >
                    <Trash2 className="h-[14px] w-[14px]" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 5. Danger zone ──────────────────────────────────── */}
      <Accordion type="single" collapsible className="rounded-lg border border-red-500/15 bg-red-500/[0.02]">
        <AccordionItem value="danger" className="border-0 px-[16px]">
          <AccordionTrigger className="py-[12px] text-[13px] font-medium leading-[18px] text-red-300 hover:text-red-200 hover:no-underline">
            <div className="flex items-center gap-[8px]">
              <ShieldAlert className="h-[16px] w-[16px]" />
              {i18n("settings.planBilling.dangerZoneCancelSubscription")}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-[14px]">
            <div className="space-y-[12px] text-[12px] leading-[18px] text-zinc-400">
              <p>
                {i18n("settings.planBilling.cancelHelpText")}
                {currentPeriodEnd && (
                  <>
                    {" "}{i18n("settings.planBilling.youLlKeepAccessUntil")}{" "}
                    <span className="text-zinc-200 font-medium">
                      {formatLongDate(currentPeriodEnd)}
                    </span>.
                  </>
                )}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={isFree}
                onClick={() => setConfirmCancel(true)}
                className={cn(denseButtonClass, "border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-50")}
              >
                {isFree ? i18n("settings.planBilling.noActiveSubscription") : i18n("settings.planBilling.cancelSubscription")}
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* ── Dialogs ─────────────────────────────────────────── */}
      <BuyCreditsDialog
        open={showBuyCredits}
        onOpenChange={setShowBuyCredits}
        defaultPaymentLabel={defaultPaymentLabel}
      />
      <BillingHistoryDialog open={showBillingHistory} onOpenChange={setShowBillingHistory} />
      <BillingInfoDialog
        open={showBillingInfo}
        onOpenChange={setShowBillingInfo}
        initial={billingAddress}
        defaultName={profile?.display_name}
        defaultEmail={user?.email}
      />
      <UpdatePaymentDialog
        open={showUpdatePayment}
        onOpenChange={setShowUpdatePayment}
        onSaved={() => { void refreshPaymentMethods(); }}
      />
      <AutoRefillSetupDialog
        open={autoRefillSetupOpen}
        onOpenChange={setAutoRefillSetupOpen}
        onEnabled={handleAutoRefillEnabled}
      />

      {/* Team placeholder — keeps the CTA functional without shipping a real flow yet. */}
      <AlertDialog open={showTeamPlaceholder} onOpenChange={setShowTeamPlaceholder}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-violet-400" />
              {i18n("settings.planBilling.teamFeatureShipsInNextWave")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {i18n("settings.planBilling.theSelfServeTeamSetupIsPart")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{i18n("settings.planBilling.maybeLater")}</AlertDialogCancel>
            <AlertDialogAction asChild>
              <a
                href="mailto:sales@mediaforge.co?subject=Team%20plan%20enquiry"
                className="inline-flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" />
                {i18n("settings.planBilling.emailSales")}
              </a>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel-subscription confirmation. The actual mutation happens
          inside Stripe's hosted customer portal so the at-period-end
          UX is identical to other Stripe-billed products the user
          might already know. */}
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-300">
              <AlertCircle className="w-5 h-5" />
              {i18n("settings.planBilling.cancelSubscription")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {i18n("settings.planBilling.weLlOpenSecureStripeCustomer")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>{i18n("settings.planBilling.keepSubscription")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleCancelSubscription();
              }}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {cancelling ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  {i18n("settings.planBilling.openingPortal")}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  {i18n("settings.planBilling.continueToPortal")}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PlanBilling;
