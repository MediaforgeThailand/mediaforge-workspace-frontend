/**
 * AutoRefillSetupDialog — bind a card for future off-session top-ups.
 *
 * Flow (matches the user's "ผูกบัตร + OTP + ตัดผ่านแล้ว" requirement):
 *
 *   Step 1: Configure (threshold + amount).
 *   Step 2: Stripe Elements card form. On submit, `confirmSetup`
 *           triggers Stripe SCA — which fires bank OTP for cards
 *           that require it. Success here proves the card is
 *           authentic + reachable.
 *   Step 3: Server-side `verify_and_enable` action retrieves the
 *           SetupIntent, then performs a ฿20 verification charge
 *           which is REFUNDED IMMEDIATELY. This is the explicit
 *           "ตัดผ่านแล้ว" check — proves the card actually
 *           settles a real charge before we trust it for cron-time
 *           auto-refills.
 *   Step 4: profile.subscription_auto_refill flips ON, with the
 *           threshold + amount + payment_method_id saved.
 *
 * Why this is safer than just trusting the SetupIntent: in Thailand
 * many cards pass SetupIntent (which doesn't actually charge, just
 * authenticates the card via 3DS) but then 4xx on the first real
 * off-session charge — bank policy, low limit, dynamic CVV expiry,
 * etc. A ฿20 charge + immediate refund catches all of those before
 * the user is on the hook for surprise low-balance failure.
 *
 * If the user only wants to disable auto-refill, they just toggle
 * off — no dialog needed. The disable path is in PlanBilling.tsx.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useStripe as useStripeJs,
  useElements,
} from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { Loader2, AlertCircle, CheckCircle2, CreditCard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getStripe } from "@/lib/stripe";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface AutoRefillSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnabled?: () => void;
}

interface CardFormProps {
  threshold: number;
  amountThb: number;
  setupIntentId: string;
  onSuccess: () => void;
}

const RATIO_THB_TO_CREDITS = 25;

const CardForm = ({ threshold, amountThb, setupIntentId, onSuccess }: CardFormProps) => {
  const stripe = useStripeJs();
  const elements = useElements();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    // Step 1: confirmSetup → fires 3DS / OTP via Stripe Elements.
    // Stripe handles the bank's challenge UI inline, no redirect.
    const { error: confirmErr, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/app/settings?autorefill=verifying`,
      },
      redirect: "if_required",
    });
    if (confirmErr) {
      setError(confirmErr.message ?? t("autoRefill.cardBindingFailed"));
      setSubmitting(false);
      return;
    }
    if (!setupIntent || setupIntent.status !== "succeeded") {
      setError(t("autoRefill.cardSetupDidNotSucceed"));
      setSubmitting(false);
      return;
    }

    // Step 2: server-side verify-and-enable. Does the ฿20 charge +
    // immediate refund + flips the auto_refill flag on.
    try {
      const { data, error: verifyErr } = await supabase.functions.invoke(
        "setup-autorefill",
        {
          body: {
            action: "verify_and_enable",
            setup_intent_id: setupIntent.id,
            threshold,
            amount_thb: amountThb,
          },
        },
      );
      if (verifyErr || (data as { error?: string })?.error) {
        const msg =
          (data as { error?: string; details?: string } | null)?.details ??
          (data as { error?: string } | null)?.error ??
          verifyErr?.message ??
          "verify_failed";
        // Translate the most common error code.
        if (typeof msg === "string" && /verify_charge_failed|card_decline/i.test(msg)) {
          setError(t("autoRefill.cardChargeFailed"));
        } else {
          setError(String(msg));
        }
        setSubmitting(false);
        return;
      }
      toast({
        title: t("autoRefill.enabledToastTitle"),
        description: t("autoRefill.enabledToastDescription", {
          threshold,
          amount: amountThb.toLocaleString(),
        }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  // Mark setupIntentId as referenced to keep ESLint happy — passed in
  // from the parent for traceability even though confirmSetup carries
  // its own client_secret via the Elements provider.
  void setupIntentId;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="ci-gloss-button inline-flex h-10 w-full items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("autoRefill.verifying")}
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("autoRefill.verifyCard")}
          </>
        )}
      </button>
      <p className="text-[10.5px] text-zinc-500 leading-relaxed">
        {t("autoRefill.verificationNotice")}
      </p>
    </form>
  );
};

export function AutoRefillSetupDialog({
  open,
  onOpenChange,
  onEnabled,
}: AutoRefillSetupDialogProps) {
  const { t } = useLanguage();
  const [step, setStep] = useState<"configure" | "card" | "done">("configure");
  const [threshold, setThreshold] = useState(100);
  const [amountThb, setAmountThb] = useState(500);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [setupIntentId, setSetupIntentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setStep("configure");
      setClientSecret(null);
      setSetupIntentId(null);
      setError(null);
    }
  }, [open]);

  const handleProceed = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        "setup-autorefill",
        { body: { action: "create_setup_intent" } },
      );
      if (invokeErr || (data as { error?: string })?.error) {
        const msg =
          (data as { error?: string } | null)?.error ??
          invokeErr?.message ??
          t("autoRefill.couldNotStartSetup");
        throw new Error(msg);
      }
      const cs = (data as { client_secret?: string }).client_secret;
      const sid = (data as { setup_intent_id?: string }).setup_intent_id;
      if (!cs || !sid) throw new Error(t("autoRefill.missingClientSecret"));
      setClientSecret(cs);
      setSetupIntentId(sid);
      setStep("card");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const elementsOptions: StripeElementsOptions | undefined = useMemo(() => {
    if (!clientSecret) return undefined;
    return {
      clientSecret,
      appearance: {
        theme: "night",
        variables: {
          colorPrimary: "#f4ff00",
          colorBackground: "#0c1020",
          colorText: "#e5e7eb",
          colorDanger: "#ef4444",
          fontFamily: "var(--font-sans)",
          borderRadius: "8px",
        },
      },
    };
  }, [clientSecret]);

  const previewCredits = amountThb * RATIO_THB_TO_CREDITS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#0c1020] text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-zinc-50">
            <CreditCard className="h-4 w-4" />
            {t("autoRefill.title")}
          </DialogTitle>
          <DialogDescription className="text-[12.5px] leading-relaxed text-zinc-400">
            {t("autoRefill.description")}
          </DialogDescription>
        </DialogHeader>

        {step === "configure" && (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-medium text-zinc-300">
                  {t("autoRefill.thresholdLabel")}
                </label>
                <input
                  type="number"
                  value={threshold}
                  min={50}
                  max={10000}
                  onChange={(e) =>
                    setThreshold(
                      Math.max(50, Math.min(10000, Number(e.target.value) || 100)),
                    )
                  }
                  className="mt-1 w-full rounded-md bg-black/40 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-yellow-500/40"
                />
                <p className="mt-1 text-[10.5px] text-zinc-500">
                  {t("autoRefill.thresholdHelp")}
                </p>
              </div>
              <div>
                <label className="text-[12px] font-medium text-zinc-300">
                  {t("autoRefill.amountLabel")}
                </label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-[13px] text-zinc-500">
                    ฿
                  </span>
                  <input
                    type="number"
                    value={amountThb}
                    min={100}
                    max={10000}
                    step={100}
                    onChange={(e) =>
                      setAmountThb(
                        Math.max(100, Math.min(10000, Number(e.target.value) || 500)),
                      )
                    }
                    className="w-full rounded-md bg-black/40 py-2 pl-7 pr-3 text-[13px] text-zinc-100 outline-none focus:border-yellow-500/40"
                  />
                </div>
                <p className="mt-1 text-[10.5px] text-zinc-500">
                  {t("autoRefill.previewCredits", {
                    credits: previewCredits.toLocaleString(),
                    ratio: RATIO_THB_TO_CREDITS,
                  })}
                </p>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleProceed}
              disabled={loading}
              className={cn(
                "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold transition-colors",
                loading
                  ? "cursor-not-allowed bg-yellow-500/40 text-black/60"
                  : "ci-gloss-button rounded-full",
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("autoRefill.preparing")}
                </>
              ) : (
                <>
                  <CreditCard className="h-3.5 w-3.5" />
                  {t("autoRefill.continueBindCard")}
                </>
              )}
            </button>
          </>
        )}

        {step === "card" && clientSecret && elementsOptions && setupIntentId && (
          <Elements stripe={getStripe()} options={elementsOptions}>
            <CardForm
              threshold={threshold}
              amountThb={amountThb}
              setupIntentId={setupIntentId}
              onSuccess={() => {
                setStep("done");
                onEnabled?.();
                // Auto-close shortly after success
                setTimeout(() => onOpenChange(false), 1800);
              }}
            />
          </Elements>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            <p className="text-sm font-semibold text-zinc-100">
              {t("autoRefill.doneTitle")}
            </p>
            <p className="text-[12px] text-zinc-400">
              {t("autoRefill.doneDescription", {
                amount: amountThb.toLocaleString(),
                threshold,
              })}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
