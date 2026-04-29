import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { useCredits } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import BuyCreditsDialog from "./BuyCreditsDialog";
import BillingHistoryDialog from "./BillingHistoryDialog";
import BillingInfoDialog from "./BillingInfoDialog";
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

const PlanBilling = () => {
  const { user, profile, refreshProfile } = useAuth();
  const { credits } = useCredits();
  const navigate = useNavigate();
  const { toast } = useToast();

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
    const planId = (profile as any)?.subscription_plan_id || (profile as any)?.current_plan_id;
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
  }, [profile]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Derived ──────────────────────────────────────────────────
  const isFree = !plan;
  const billingCycle = (profile as any)?.subscription_billing_cycle ?? (profile as any)?.billing_interval ?? "monthly";
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

  const billingAddress = (profile as any)?.billing_address as
    | { name?: string; email?: string; line1?: string; city?: string; postal_code?: string; country?: string; tax_id?: string }
    | null;
  const billingName = billingAddress?.name ?? profile?.display_name ?? "—";
  const billingEmail = billingAddress?.email ?? user?.email ?? "—";

  // ── Handlers ─────────────────────────────────────────────────
  const handleAutoRefill = async (next: boolean) => {
    if (!user) return;
    setAutoRefill(next); // optimistic
    const { error } = await supabase
      .from("profiles")
      .update({ subscription_auto_refill: next as unknown as never })
      .eq("user_id", user.id);
    if (error) {
      setAutoRefill(!next);
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
    } else {
      await refreshProfile();
    }
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
      throw new Error("Customer portal did not return a URL");
    } catch (e) {
      toast({
        title: "Could not open billing portal",
        description: e instanceof Error ? e.message : "Try again in a moment.",
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
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-50">Plan & billing</h2>
        <p className="text-[12px] text-zinc-500 mt-0.5">
          Manage your subscription, credits, and payment methods.
        </p>
      </div>

      {/* ── 1. Plan section ─────────────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[15px] font-semibold text-zinc-50">
                {plan?.name ?? "Free plan"}
              </h3>
              {!isFree && (
                <span className="text-[13px] text-zinc-300">
                  {formatThb(planPrice)}
                  <span className="text-zinc-500">/{isAnnual ? "year" : "month"}</span>
                </span>
              )}
              {isFree && (
                <Badge variant="outline" className="text-[10px] border-white/15 text-zinc-400">
                  No active subscription
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
              {!isFree && <span>Billed {isAnnual ? "annually" : "monthly"}</span>}
              {!isFree && (profile as any)?.current_period_end && (
                <>
                  <span className="text-zinc-700">·</span>
                  <span>Next payment: {formatLongDate((profile as any).current_period_end)}</span>
                </>
              )}
              {isFree && <span>Upgrade to unlock more credits and pro features.</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowTeamPlaceholder(true)}
              className="border-white/10 text-zinc-300 hover:bg-white/5"
            >
              <Building2 className="w-3.5 h-3.5 mr-1.5" />
              Create your team
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/app/pricing")}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              {isFree ? "View plans" : "Upgrade plan"}
            </Button>
          </div>
        </div>
      </section>

      {/* ── 2. Credits section ──────────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-[14px] font-semibold text-zinc-50">Credits</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Credits reset every {isAnnual ? "year" : "month"} on renewal.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
            <span>Auto-refill</span>
            <Switch
              checked={autoRefill}
              onCheckedChange={handleAutoRefill}
              aria-label="Auto-refill subscription credits"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-zinc-50 tabular-nums">
              {formatCreditsBig(balance)}
            </span>
            <span className="text-[12px] text-zinc-500">total credits</span>
          </div>

          <Progress value={usagePct} className="h-1.5 bg-white/[0.05]" />

          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>
              Spent: <span className="text-zinc-200 tabular-nums">{used.toLocaleString()}</span>
            </span>
            <span>
              Available: <span className="text-zinc-200 tabular-nums">{balance.toLocaleString()}</span>
            </span>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            onClick={() => setShowBuyCredits(true)}
            className="bg-violet-600 hover:bg-violet-500 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Buy extra credits
          </Button>
        </div>
      </section>

      {/* ── 3. Billing information ───────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-zinc-50">Billing information</h3>
            <p className="text-[12px] text-zinc-300 mt-1">
              {billingName} <span className="text-zinc-600">·</span>{" "}
              <span className="text-zinc-400">{billingEmail}</span>
            </p>
            {billingAddress?.line1 && (
              <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                {[billingAddress.line1, billingAddress.city, billingAddress.postal_code, billingAddress.country]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBillingInfo(true)}
              className="border-white/10 text-zinc-300 hover:bg-white/5"
            >
              Change
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBillingHistory(true)}
              className="border-white/10 text-zinc-300 hover:bg-white/5"
            >
              History
            </Button>
          </div>
        </div>
      </section>

      {/* ── 4. Payment details ───────────────────────────────── */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="text-[14px] font-semibold text-zinc-50">Payment details</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Cards saved here are reused for renewals and auto-refills.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowUpdatePayment(true)}
            className="border-white/10 text-zinc-300 hover:bg-white/5"
          >
            Update
          </Button>
        </div>

        <div className="space-y-2">
          {loadingPMs && (
            <div className="flex items-center gap-2 py-2 text-xs text-zinc-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading payment methods…
            </div>
          )}
          {!loadingPMs && paymentMethods.length === 0 && (
            <p className="text-[11px] text-zinc-500 italic">
              No payment methods saved yet. Click "Update" to add a card.
            </p>
          )}
          {paymentMethods.map((pm) => {
            const isDefault = pm.id === defaultPmId;
            const isCard = pm.type === "card";
            return (
              <div
                key={pm.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                  isDefault
                    ? "border-violet-500/30 bg-violet-500/[0.05]"
                    : "border-white/10 bg-white/[0.02]",
                )}
              >
                <div className="w-8 h-8 rounded-md bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                  {isCard ? (
                    <CreditCard className="w-3.5 h-3.5 text-zinc-300" />
                  ) : (
                    <QrCode className="w-3.5 h-3.5 text-emerald-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-zinc-100">
                    {formatPaymentLabel(pm)}
                  </p>
                  {isCard && pm.exp_month && pm.exp_year && (
                    <p className="text-[10px] text-zinc-500">
                      Expires {String(pm.exp_month).padStart(2, "0")}/{String(pm.exp_year).slice(-2)}
                    </p>
                  )}
                </div>
                {isDefault && (
                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200 border border-violet-500/30">
                    <Star className="w-2.5 h-2.5 inline mr-0.5 -mt-0.5" />
                    Default
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
                        toast({ title: "Could not update", variant: "destructive" });
                      } else {
                        await refreshPaymentMethods();
                        toast({ title: "Default updated" });
                      }
                    }}
                    className="text-[10px] text-zinc-400 hover:text-zinc-100 transition-colors"
                  >
                    Make default
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
                        toast({ title: "Could not remove", variant: "destructive" });
                      } else {
                        await refreshPaymentMethods();
                      }
                    }}
                    className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                    aria-label="Remove payment method"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 5. Danger zone ──────────────────────────────────── */}
      <Accordion type="single" collapsible className="border border-red-500/15 bg-red-500/[0.02] rounded-xl">
        <AccordionItem value="danger" className="border-0 px-5">
          <AccordionTrigger className="text-[13px] font-medium text-red-300 hover:text-red-200 hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Danger zone — Cancel a subscription
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-3 text-[12px] text-zinc-400">
              <p>
                Cancelling closes auto-renewal but lets you keep access until the end of the current billing period.
                {(profile as any)?.current_period_end && (
                  <>
                    {" "}You'll keep access until{" "}
                    <span className="text-zinc-200 font-medium">
                      {formatLongDate((profile as any).current_period_end)}
                    </span>.
                  </>
                )}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={isFree}
                onClick={() => setConfirmCancel(true)}
                className="border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                {isFree ? "No active subscription" : "Cancel subscription"}
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

      {/* Team placeholder — keeps the CTA functional without shipping a real flow yet. */}
      <AlertDialog open={showTeamPlaceholder} onOpenChange={setShowTeamPlaceholder}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-violet-400" />
              Team feature ships in the next wave
            </AlertDialogTitle>
            <AlertDialogDescription>
              The self-serve team setup is part of the team / org rollout. For now, our onboarding flow is contact-sales — drop us a line and we'll set up a shared workspace, centralised billing, and SSO for your team.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Maybe later</AlertDialogCancel>
            <AlertDialogAction asChild>
              <a
                href="mailto:sales@mediaforge.co?subject=Team%20plan%20enquiry"
                className="inline-flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" />
                Email sales
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
              Cancel subscription
            </AlertDialogTitle>
            <AlertDialogDescription>
              We'll open the secure Stripe customer portal where you can confirm cancellation. Your subscription will remain active until the end of the current billing period.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep subscription</AlertDialogCancel>
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
                  Opening portal…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Continue to portal
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
