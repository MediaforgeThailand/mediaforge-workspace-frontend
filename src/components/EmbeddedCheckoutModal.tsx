import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, AlertCircle, CreditCard, QrCode, RefreshCw, ExternalLink } from "lucide-react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  formatWorkspaceMoneyFromMinor,
  normalizeWorkspaceCurrency,
  type SupportedWorkspaceCurrency,
} from "@/lib/workspaceCurrency";

interface EmbeddedCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  mode: "subscription" | "topup" | "team_seats";
  packageId?: string;
  billingInterval?: "monthly" | "annual";
  teamSeats?: number;
  currency?: SupportedWorkspaceCurrency;
}

// Singleton — load once per app lifetime
let stripePromise: Promise<StripeJs | null> | null = null;
const getStripe = (publishableKey: string) => {
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
};

type CheckoutPaymentMethod = "promptpay" | "card";

const getFunctionErrorMessage = async (invokeErr: unknown, data: unknown, fallback: string) => {
  const payload = data as { message?: unknown; error?: unknown } | null | undefined;
  if (payload?.message || payload?.error) return String(payload.message || payload.error);
  const err = invokeErr as { message?: string; context?: Response };
  const response = err?.context;
  if (response && typeof response.clone === "function") {
    try {
      const payload = await response.clone().json();
      if (payload?.message || payload?.error) return String(payload.message || payload.error);
    } catch {
      try {
        const text = await response.clone().text();
        if (text) return text;
      } catch {
        // Fall through to the Supabase error message.
      }
    }
  }
  return err?.message || fallback;
};

const PaymentForm = ({
  onSuccess,
  onError,
  amountLabel,
}: {
  onSuccess: () => void;
  onError: (msg: string) => void;
  amountLabel: string;
}) => {
  const { t } = useLanguage();
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setLocalError("");

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      // For PromptPay, Stripe shows the QR in a hosted view; user comes back via this URL.
      confirmParams: {
        return_url: `${window.location.origin}/app/pricing?payment=success`,
      },
      redirect: "if_required",
    });

    if (error) {
      const msg = error.message || t("checkout.embedded.paymentFailed");
      setLocalError(msg);
      onError(msg);
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      onSuccess();
    } else {
      setLocalError(t("checkout.embedded.paymentIncomplete"));
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: "tabs",
          paymentMethodOrder: ["promptpay", "card"],
        }}
      />
      {localError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{localError}</span>
        </div>
      )}
      <Button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full bg-gradient-to-r from-violet-600 to-purple-500 text-white font-bold hover:scale-[1.01] transition-transform"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("checkout.embedded.processing")}
          </>
        ) : (
          amountLabel
            ? t("checkout.embedded.payAmount", { amount: amountLabel })
            : t("checkout.embedded.pay")
        )}
      </Button>
      <p className="text-center text-[10px] text-muted-foreground">
        {t("checkout.embedded.secureStripeNote")}
      </p>
    </form>
  );
};

const EmbeddedCheckoutModal = ({
  open,
  onOpenChange,
  onSuccess,
  mode,
  packageId,
  billingInterval = "monthly",
  teamSeats,
  currency = "thb",
}: EmbeddedCheckoutModalProps) => {
  const { t } = useLanguage();
  const normalizedCurrency = normalizeWorkspaceCurrency(currency);
  const isThaiCheckout = normalizedCurrency === "thb";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [success, setSuccess] = useState(false);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>(isThaiCheckout ? "promptpay" : "card");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const requestStartedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      // Reset on close
      requestStartedRef.current = false;
      setLoading(false);
      setError("");
      setClientSecret(null);
      setAmount(0);
      setSuccess(false);
      setPaymentMethod(isThaiCheckout ? "promptpay" : "card");
      setQrCodeUrl(null);
      setExpiresAt(null);
      setCheckoutUrl(null);
      return;
    }

    if (requestStartedRef.current || (mode !== "team_seats" && !packageId)) return;
    requestStartedRef.current = true;

    const init = async () => {
      setLoading(true);
      setError("");
      setClientSecret(null);
      setQrCodeUrl(null);
      setExpiresAt(null);
      setCheckoutUrl(null);

      try {
        let useHostedCardCheckout = !isThaiCheckout;
        if (paymentMethod === "card" && isThaiCheckout) {
          const { data: keyData, error: keyErr } = await supabase.functions.invoke("get-stripe-key");
          if (!keyErr && keyData?.publishableKey) {
            setPublishableKey(keyData.publishableKey);
          } else {
            setPublishableKey(null);
            useHostedCardCheckout = true;
          }
        } else {
          setPublishableKey(null);
        }

        const fnName = mode === "topup" ? "create-topup" : "create-checkout";
        const usePaymentIntent = isThaiCheckout && (paymentMethod === "promptpay" || !useHostedCardCheckout);
        const body =
          mode === "topup"
            ? { packageId, intent: usePaymentIntent, paymentMethod, currency: normalizedCurrency }
            : mode === "team_seats"
              ? { checkoutType: "team_seats", teamSeats, billingInterval, intent: usePaymentIntent, paymentMethod, currency: normalizedCurrency }
              : { packageId, billingInterval, intent: usePaymentIntent, paymentMethod, currency: normalizedCurrency };

        const { data, error: invokeErr } = await supabase.functions.invoke(fnName, { body });
        if (useHostedCardCheckout) {
          if (invokeErr || !data?.url) {
            throw new Error(await getFunctionErrorMessage(invokeErr, data, t("checkout.embedded.startFailed")));
          }
          setCheckoutUrl(data.url);
          setAmount(Number(data.amount ?? 0));
          return;
        }

        if (invokeErr || !data?.clientSecret) {
          throw new Error(await getFunctionErrorMessage(invokeErr, data, t("checkout.embedded.startFailed")));
        }

        setClientSecret(data.clientSecret);
        setAmount(Number(data.amount ?? 0));
        if (paymentMethod === "promptpay") {
          const nextQr = data.qrCodeSvgUrl || data.qrCodePngUrl || null;
          if (!nextQr) throw new Error(t("checkout.embedded.promptPayQrCreateFailed"));
          setQrCodeUrl(nextQr);
          setExpiresAt(typeof data.expiresAt === "number" ? data.expiresAt : null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("checkout.embedded.startFailed"));
        requestStartedRef.current = false;
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [open, mode, packageId, billingInterval, teamSeats, paymentMethod, normalizedCurrency, isThaiCheckout, t]);

  const stripeInstance = useMemo(
    () => (publishableKey ? getStripe(publishableKey) : null),
    [publishableKey]
  );

  const amountLabel = amount ? formatWorkspaceMoneyFromMinor(amount, normalizedCurrency) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[460px] p-0 overflow-hidden border-violet-400/25 rounded-2xl backdrop-blur-2xl shadow-[0_20px_60px_-15px_rgba(139,92,246,0.45)]"
        style={{
          background:
            "linear-gradient(145deg, rgba(45,20,90,0.78) 0%, rgba(20,14,38,0.72) 50%, rgba(76,29,149,0.55) 100%)",
        }}
      >
        {/* Decorative violet glow */}
        <div className="pointer-events-none absolute -top-24 -right-20 h-64 w-64 rounded-full bg-violet-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />

        <div className="relative px-6 pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-white">
              {t("checkout.embedded.title", { amount: amountLabel ? ` · ${amountLabel}` : "" })}
            </DialogTitle>
            <DialogDescription className="text-xs text-violet-200/80">
              {t(isThaiCheckout ? "checkout.embedded.description" : "checkout.embedded.descriptionInternational")}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="relative px-6 pb-6">
          {!success && isThaiCheckout && (
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-black/20 p-1">
              {(["promptpay", "card"] as const).map((method) => {
                const selected = paymentMethod === method;
                const Icon = method === "promptpay" ? QrCode : CreditCard;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => {
                      if (paymentMethod === method) return;
                      requestStartedRef.current = false;
                      setPaymentMethod(method);
                    }}
                    className={[
                      "inline-flex h-9 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition",
                      selected
                        ? "bg-white text-zinc-950 shadow"
                        : "text-violet-100/75 hover:bg-white/10 hover:text-white",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                    {method === "promptpay" ? t("checkout.embedded.promptpayQr") : t("checkout.embedded.card")}
                  </button>
                );
              })}
            </div>
          )}

          {loading && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
              <p className="text-xs text-slate-400">{t("checkout.embedded.loading")}</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-center">
              <AlertCircle className="h-7 w-7 text-destructive" />
              <p className="text-sm font-medium text-white">{t("checkout.embedded.errorTitle")}</p>
              <p className="text-xs text-slate-400">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => onOpenChange(false)}
              >
                {t("common.close")}
              </Button>
            </div>
          )}

          {success && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-white">{t("checkout.embedded.successTitle")}</p>
              <p className="text-xs text-slate-400">
                {t("checkout.embedded.successDescription")}
              </p>
              <Button
                size="sm"
                className="mt-3"
                onClick={() => {
                  onOpenChange(false);
                  // Refresh so credit balance updates
                  setTimeout(() => window.location.reload(), 300);
                }}
              >
                {t("checkout.embedded.done")}
              </Button>
            </div>
          )}

          {!loading && !error && !success && paymentMethod === "promptpay" && qrCodeUrl && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white p-4 shadow-xl">
                <img
                  src={qrCodeUrl}
                  alt={t("checkout.embedded.promptpayQr")}
                  className="mx-auto aspect-square w-full max-w-[280px] rounded-xl object-contain"
                />
              </div>
              <div className="rounded-xl bg-black/20 p-3 text-center">
                <p className="text-sm font-semibold text-white">
                  {t("checkout.embedded.scanToPay", { amount: amountLabel || "" })}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-violet-100/75">
                  {t("checkout.embedded.promptPayWebhookNote")}
                </p>
                {expiresAt && (
                  <p className="mt-1 text-[10px] text-violet-200/60">
                    {t("checkout.embedded.qrExpires", { time: new Date(expiresAt * 1000).toLocaleTimeString() })}
                  </p>
                )}
              </div>
              <Button
                type="button"
                className="w-full bg-gradient-to-r from-violet-600 to-purple-500 text-white font-bold"
                onClick={() => {
                  onSuccess?.();
                  onOpenChange(false);
                  setTimeout(() => window.location.reload(), 300);
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("checkout.embedded.paidRefreshCredits")}
              </Button>
            </div>
          )}

          {!loading && !error && !success && paymentMethod === "card" && checkoutUrl && (
            <div className="space-y-4">
              <div className="rounded-xl bg-black/20 p-4 text-center">
                <CreditCard className="mx-auto h-8 w-8 text-violet-200" />
                <p className="mt-3 text-sm font-semibold text-white">{t("checkout.embedded.cardTitle")}</p>
                <p className="mt-1 text-[11px] leading-5 text-violet-100/75">
                  {t("checkout.embedded.cardDescription")}
                </p>
              </div>
              <Button
                type="button"
                className="w-full bg-white text-zinc-950 font-bold hover:bg-violet-50"
                onClick={() => {
                  window.location.assign(checkoutUrl);
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("checkout.embedded.openCardCheckout")}
              </Button>
            </div>
          )}

          {!loading && !error && !success && paymentMethod === "card" && clientSecret && stripeInstance && (
            <Elements
              stripe={stripeInstance}
              options={{
                clientSecret,
                appearance: {
                  theme: "night",
                  variables: {
                    colorPrimary: "#a78bfa",
                    colorBackground: "transparent",
                    colorText: "#ffffff",
                    colorTextSecondary: "#ddd6fe",
                    colorDanger: "#ef4444",
                    fontFamily: "var(--font-sans)",
                    borderRadius: "12px",
                    accessibleColorOnColorPrimary: "#ffffff",
                  },
                  rules: {
                    ".Tab": {
                      backgroundColor: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(167,139,250,0.18)",
                    },
                    ".Tab--selected": {
                      backgroundColor: "rgba(139,92,246,0.18)",
                      borderColor: "#a78bfa",
                      boxShadow: "0 0 0 1px #a78bfa",
                    },
                    ".Input": {
                      backgroundColor: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(167,139,250,0.18)",
                    },
                    ".Input:focus": {
                      borderColor: "#a78bfa",
                      boxShadow: "0 0 0 1px #a78bfa",
                    },
                    ".Label": {
                      color: "#ddd6fe",
                    },
                  },
                },
              }}
            >
              <PaymentForm
                amountLabel={amountLabel}
                onSuccess={() => {
                  setSuccess(true);
                  onSuccess?.();
                }}
                onError={(msg) => setError(msg)}
              />
            </Elements>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EmbeddedCheckoutModal;
