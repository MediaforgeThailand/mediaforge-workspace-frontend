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
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

interface EmbeddedCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  mode: "subscription" | "topup";
  packageId: string;
  billingInterval?: "monthly" | "annual";
}

// Singleton — load once per app lifetime
let stripePromise: Promise<StripeJs | null> | null = null;
const getStripe = (publishableKey: string) => {
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
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
      const msg = error.message || "Payment failed. Please try again.";
      setLocalError(msg);
      onError(msg);
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      onSuccess();
    } else {
      setLocalError("Payment did not complete. Please try again.");
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
            กำลังประมวลผล…
          </>
        ) : (
          `ชำระเงิน ${amountLabel}`
        )}
      </Button>
      <p className="text-center text-[10px] text-muted-foreground">
        🔒 ปลอดภัยด้วย Stripe · รองรับ PromptPay QR และบัตรเครดิต/เดบิต
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
}: EmbeddedCheckoutModalProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [success, setSuccess] = useState(false);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
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
      return;
    }

    if (requestStartedRef.current || !packageId) return;
    requestStartedRef.current = true;

    const init = async () => {
      setLoading(true);
      setError("");

      try {
        // 1) Fetch publishable key
        const { data: keyData, error: keyErr } = await supabase.functions.invoke("get-stripe-key");
        if (keyErr || !keyData?.publishableKey) {
          throw new Error(keyErr?.message || "Stripe key unavailable");
        }
        setPublishableKey(keyData.publishableKey);

        // 2) Create PaymentIntent
        const fnName = mode === "topup" ? "create-topup" : "create-checkout";
        const body =
          mode === "topup"
            ? { packageId, intent: true }
            : { packageId, billingInterval, intent: true };

        const { data, error: invokeErr } = await supabase.functions.invoke(fnName, { body });
        if (invokeErr || !data?.clientSecret) {
          throw new Error(invokeErr?.message || data?.error || "Failed to start payment");
        }

        setClientSecret(data.clientSecret);
        setAmount(Number(data.amount ?? 0));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start checkout");
        requestStartedRef.current = false;
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [open, mode, packageId, billingInterval]);

  const stripeInstance = useMemo(
    () => (publishableKey ? getStripe(publishableKey) : null),
    [publishableKey]
  );

  const amountLabel = amount ? `฿${(amount / 100).toLocaleString()}` : "";

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
              ชำระเงิน{amountLabel ? ` · ${amountLabel}` : ""}
            </DialogTitle>
            <DialogDescription className="text-xs text-violet-200/80">
              เลือก PromptPay QR หรือบัตรเครดิต/เดบิต — ทำรายการในแอปได้ทันที
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="relative px-6 pb-6">
          {loading && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
              <p className="text-xs text-slate-400">กำลังเตรียมหน้าชำระเงิน…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-center">
              <AlertCircle className="h-7 w-7 text-destructive" />
              <p className="text-sm font-medium text-white">เปิดหน้าชำระเงินไม่สำเร็จ</p>
              <p className="text-xs text-slate-400">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => onOpenChange(false)}
              >
                ปิด
              </Button>
            </div>
          )}

          {success && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-white">ชำระเงินสำเร็จ!</p>
              <p className="text-xs text-slate-400">
                เครดิตจะเข้าบัญชีภายในไม่กี่วินาที
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
                เสร็จสิ้น
              </Button>
            </div>
          )}

          {!loading && !error && !success && clientSecret && stripeInstance && (
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
                    fontFamily: "system-ui, sans-serif",
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
