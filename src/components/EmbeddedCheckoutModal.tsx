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
import {
  formatWorkspaceMoneyFromMinor,
  normalizeWorkspaceCurrency,
  type SupportedWorkspaceCurrency,
} from "@/lib/workspaceCurrency";
import { useLanguage } from "@/contexts/LanguageContext";

interface EmbeddedCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  mode: "subscription" | "topup" | "team_seats";
  packageId?: string;
  billingInterval?: "monthly" | "annual";
  teamSeats?: number;
  currency?: SupportedWorkspaceCurrency;
  uiLanguage?: "en" | "th";
}

// Singleton — load once per app lifetime
let stripePromise: Promise<StripeJs | null> | null = null;
const getStripe = (publishableKey: string) => {
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
};

type CheckoutPaymentMethod = "promptpay" | "card";
type CheckoutLanguage = "en" | "th";

const CHECKOUT_COPY = {
  en: {
    title: "Payment",
    thaiDescription: "Choose PromptPay QR or credit/debit card. Complete payment in MediaForge.",
    cardDescription: "Card-first subscription. Local card wallets may appear when your bank and country support them.",
    promptPay: "PromptPay QR",
    card: "Card",
    loading: "Preparing payment...",
    openFailed: "Could not open payment",
    close: "Close",
    successTitle: "Payment successful!",
    successDescription: "Credits will be added to your account shortly.",
    done: "Done",
    scanPay: "Scan to pay",
    qrDescription: "After your bank confirms the payment, credits will be added automatically.",
    qrExpires: "QR expires",
    refreshCredits: "I paid, refresh credits",
    cardTitle: "Pay by credit/debit card",
    cardDescriptionBody: "We will open a secure checkout page, then return you to MediaForge after payment.",
    cardButton: "Open card checkout",
    processing: "Processing...",
    payPrefix: "Pay",
    secure: "Secure payment powered by Stripe",
    paymentFailed: "Payment failed. Please try again.",
    paymentIncomplete: "Payment did not complete. Please try again.",
    startFailed: "Could not start checkout",
    qrMissing: "PromptPay QR could not be created. Please try again.",
    authRequired: "Please sign in again before payment.",
    genericFailed: "Could not start checkout. Please try again.",
  },
  th: {
    title: "ชำระเงิน",
    thaiDescription: "เลือก PromptPay QR หรือบัตรเครดิต/เดบิต — ทำรายการในแอปได้ทันที",
    cardDescription: "ชำระผ่านบัตรเป็นหลัก ระบบจะแสดงวิธีจ่ายที่รองรับตามประเทศและธนาคารของคุณ",
    promptPay: "PromptPay QR",
    card: "บัตร",
    loading: "กำลังเตรียมหน้าชำระเงิน...",
    openFailed: "เปิดหน้าชำระเงินไม่สำเร็จ",
    close: "ปิด",
    successTitle: "ชำระเงินสำเร็จ!",
    successDescription: "เครดิตจะเข้าบัญชีภายในไม่กี่วินาที",
    done: "เสร็จสิ้น",
    scanPay: "สแกนจ่าย",
    qrDescription: "หลังธนาคารยืนยัน ระบบจะเติมเครดิตให้อัตโนมัติ",
    qrExpires: "QR หมดอายุ",
    refreshCredits: "ชำระแล้ว รีเฟรชเครดิต",
    cardTitle: "ชำระผ่านบัตรเครดิต/เดบิต",
    cardDescriptionBody: "ระบบจะเปิดหน้าชำระเงินที่ปลอดภัย แล้วกลับมาที่ MediaForge หลังชำระสำเร็จ",
    cardButton: "ไปหน้าชำระด้วยบัตร",
    processing: "กำลังประมวลผล...",
    payPrefix: "ชำระเงิน",
    secure: "ชำระเงินอย่างปลอดภัยผ่าน Stripe",
    paymentFailed: "ชำระเงินไม่สำเร็จ กรุณาลองอีกครั้ง",
    paymentIncomplete: "การชำระเงินยังไม่สมบูรณ์ กรุณาลองอีกครั้ง",
    startFailed: "เปิดหน้าชำระเงินไม่สำเร็จ",
    qrMissing: "สร้าง PromptPay QR ไม่สำเร็จ กรุณาลองอีกครั้ง",
    authRequired: "กรุณาเข้าสู่ระบบอีกครั้งก่อนชำระเงิน",
    genericFailed: "เปิดหน้าชำระเงินไม่สำเร็จ กรุณาลองอีกครั้ง",
  },
} as const;

type CheckoutCopy = (typeof CHECKOUT_COPY)[keyof typeof CHECKOUT_COPY];

const localizeCheckoutError = (message: string, copy: CheckoutCopy) => {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return copy.genericFailed;
  if (normalized.includes("user not authenticated") || normalized.includes("auth session missing")) {
    return copy.authRequired;
  }
  if (normalized.includes("promptpay qr could not be created")) return copy.qrMissing;
  if (
    normalized.includes("checkout failed") ||
    normalized.includes("could not start checkout") ||
    normalized.includes("edge function returned")
  ) {
    return copy.genericFailed;
  }
  return message;
};

const readPersistedCheckoutLanguage = (): CheckoutLanguage | null => {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("mf-lang");
    if (saved === "en" || saved === "th") return saved;
  }
  if (typeof document !== "undefined") {
    const htmlLang = document.documentElement.lang?.toLowerCase();
    if (htmlLang?.startsWith("en")) return "en";
    if (htmlLang?.startsWith("th")) return "th";
  }
  return null;
};

const resolveCheckoutLanguage = (
  preferred: CheckoutLanguage | undefined,
  contextLanguage: CheckoutLanguage,
): CheckoutLanguage => preferred ?? readPersistedCheckoutLanguage() ?? contextLanguage;

const getFunctionErrorMessage = async (invokeErr: unknown, data?: unknown) => {
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
  return err?.message || "Could not start checkout";
};

const PaymentForm = ({
  onSuccess,
  onError,
  amountLabel,
  copy,
}: {
  onSuccess: () => void;
  onError: (msg: string) => void;
  amountLabel: string;
  copy: CheckoutCopy;
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
      const msg = error.message || copy.paymentFailed;
      setLocalError(msg);
      onError(msg);
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      onSuccess();
    } else {
      setLocalError(copy.paymentIncomplete);
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
            {copy.processing}
          </>
        ) : (
          `${copy.payPrefix} ${amountLabel}`
        )}
      </Button>
      <p className="text-center text-[10px] text-muted-foreground">
        🔒 {copy.secure}
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
  uiLanguage,
}: EmbeddedCheckoutModalProps) => {
  const { language: contextLanguage } = useLanguage();
  const checkoutLanguage = resolveCheckoutLanguage(uiLanguage, contextLanguage);
  const copy = checkoutLanguage === "th" ? CHECKOUT_COPY.th : CHECKOUT_COPY.en;
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
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (sessionError || !accessToken) throw new Error("User not authenticated");
        const authHeaders = { Authorization: `Bearer ${accessToken}` };

        let useHostedCardCheckout = !isThaiCheckout;
        if (paymentMethod === "card" && isThaiCheckout) {
          const { data: keyData, error: keyErr } = await supabase.functions.invoke("get-stripe-key", {
            headers: authHeaders,
          });
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

        const { data, error: invokeErr } = await supabase.functions.invoke(fnName, {
          body,
          headers: authHeaders,
        });
        if (useHostedCardCheckout) {
          if (invokeErr || !data?.url) throw new Error(await getFunctionErrorMessage(invokeErr, data));
          setCheckoutUrl(data.url);
          setAmount(Number(data.amount ?? 0));
          return;
        }

        if (invokeErr || !data?.clientSecret) {
          throw new Error(await getFunctionErrorMessage(invokeErr, data));
        }

        setClientSecret(data.clientSecret);
        setAmount(Number(data.amount ?? 0));
        if (paymentMethod === "promptpay") {
          const nextQr = data.qrCodeSvgUrl || data.qrCodePngUrl || null;
          if (!nextQr) throw new Error(copy.qrMissing);
          setQrCodeUrl(nextQr);
          setExpiresAt(typeof data.expiresAt === "number" ? data.expiresAt : null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : copy.startFailed;
        setError(localizeCheckoutError(message, copy));
        requestStartedRef.current = false;
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [open, mode, packageId, billingInterval, teamSeats, paymentMethod, normalizedCurrency, isThaiCheckout, copy]);

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
              {copy.title}{amountLabel ? ` · ${amountLabel}` : ""}
            </DialogTitle>
            <DialogDescription className="text-xs text-violet-200/80">
              {isThaiCheckout
                ? copy.thaiDescription
                : copy.cardDescription}
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
                    {method === "promptpay" ? copy.promptPay : copy.card}
                  </button>
                );
              })}
            </div>
          )}

          {loading && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
              <p className="text-xs text-slate-400">{copy.loading}</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-center">
              <AlertCircle className="h-7 w-7 text-destructive" />
              <p className="text-sm font-medium text-white">{copy.openFailed}</p>
              <p className="text-xs text-slate-400">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => onOpenChange(false)}
              >
                {copy.close}
              </Button>
            </div>
          )}

          {success && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-white">{copy.successTitle}</p>
              <p className="text-xs text-slate-400">
                {copy.successDescription}
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
                {copy.done}
              </Button>
            </div>
          )}

          {!loading && !error && !success && paymentMethod === "promptpay" && qrCodeUrl && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white p-4 shadow-xl">
                <img
                  src={qrCodeUrl}
                  alt="PromptPay QR"
                  className="mx-auto aspect-square w-full max-w-[280px] rounded-xl object-contain"
                />
              </div>
              <div className="rounded-xl bg-black/20 p-3 text-center">
                <p className="text-sm font-semibold text-white">
                  {copy.scanPay} {amountLabel || ""}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-violet-100/75">
                  {copy.qrDescription}
                </p>
                {expiresAt && (
                  <p className="mt-1 text-[10px] text-violet-200/60">
                    {copy.qrExpires} {new Date(expiresAt * 1000).toLocaleTimeString()}
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
                {copy.refreshCredits}
              </Button>
            </div>
          )}

          {!loading && !error && !success && paymentMethod === "card" && checkoutUrl && (
            <div className="space-y-4">
              <div className="rounded-xl bg-black/20 p-4 text-center">
                <CreditCard className="mx-auto h-8 w-8 text-violet-200" />
                <p className="mt-3 text-sm font-semibold text-white">{copy.cardTitle}</p>
                <p className="mt-1 text-[11px] leading-5 text-violet-100/75">
                  {copy.cardDescriptionBody}
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
                {copy.cardButton}
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
                copy={copy}
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
