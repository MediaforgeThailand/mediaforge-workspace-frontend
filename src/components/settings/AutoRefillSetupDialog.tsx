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
import { getLocalizedText, useLanguage } from "@/contexts/LanguageContext";
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
  const { language } = useLanguage();
  const { toast } = useToast();
  const txt = (values: Parameters<typeof getLocalizedText>[1]) =>
    getLocalizedText(language, values);
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
      setError(confirmErr.message ?? "Card binding failed");
      setSubmitting(false);
      return;
    }
    if (!setupIntent || setupIntent.status !== "succeeded") {
      setError(
        txt({
          en: "Card setup didn't succeed — try again",
          th: "การยืนยันบัตรไม่สำเร็จ — ลองอีกครั้ง",
          es: "La configuración de la tarjeta no se realizó correctamente. Inténtalo de nuevo.",
          ja: "カード設定が完了しませんでした。もう一度お試しください。",
        }),
      );
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
          setError(
            txt({
              en: "Card couldn't be charged — try another card or contact your bank",
              th: "บัตรไม่สามารถตัดเงินได้ — ลองบัตรอื่นหรือติดต่อธนาคาร",
              es: "No se pudo realizar el cargo en la tarjeta; prueba con otra tarjeta o comunícate con tu banco",
              ja: "カードに請求できませんでした。別のカードを試すか、銀行にお問い合わせください。",
            }),
          );
        } else {
          setError(String(msg));
        }
        setSubmitting(false);
        return;
      }
      toast({
        title: txt({
          en: "Auto-refill enabled",
          th: "เปิดเติมเครดิตอัตโนมัติแล้ว",
          es: "Recarga automática habilitada",
          ja: "自動チャージを有効にしました",
        }),
        description: txt({
          en: `Card bound — when balance drops below ${threshold} credits, ฿${amountThb.toLocaleString()} will be charged automatically.`,
          th: `บัตรผูกแล้ว — เมื่อเครดิตต่ำกว่า ${threshold} ระบบจะเติม ฿${amountThb.toLocaleString()} อัตโนมัติ`,
          es: `Tarjeta vinculada: cuando el saldo baje de ${threshold} créditos, se cobrará automáticamente ฿${amountThb.toLocaleString()}.`,
          ja: `カードを登録しました。残高が ${threshold} クレジットを下回ると、฿${amountThb.toLocaleString()} が自動で請求されます。`,
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
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {txt({ en: "Verifying…", th: "กำลังยืนยัน…", es: "Verificando…", ja: "確認中…" })}
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {txt({
              en: "Verify card (charges ฿20 + immediate refund)",
              th: "ยืนยันบัตร (ทดสอบหัก ฿20 และคืนทันที)",
              es: "Verificar tarjeta (cargo de ฿20 + reembolso inmediato)",
              ja: "カードを確認（฿20 を請求後すぐ返金）",
            })}
          </>
        )}
      </button>
      <p className="text-[10.5px] text-zinc-500 leading-relaxed">
        {txt({
          en: "To prove your card can actually charge, we'll temporarily debit ฿20 and refund it instantly (5-10 business days back to your card per bank policy) before enabling auto-refill.",
          th: "เพื่อยืนยันว่าบัตรของคุณตัดเงินได้จริง ระบบจะหัก ฿20 และคืนเงินทันที (ภายใน 5-10 วันทำการตามนโยบายธนาคาร) ก่อนเปิดใช้การเติมเครดิตอัตโนมัติ",
          es: "Para demostrar que su tarjeta realmente puede realizar cargos, debitaremos temporalmente ฿20 y los reembolsaremos instantáneamente (de 5 a 10 días hábiles a su tarjeta según la política bancaria) antes de habilitar la recarga automática.",
          ja: "カードで実際に決済できることを確認するため、自動チャージを有効にする前に ฿20 を一時的に請求し、すぐに返金します（銀行ポリシーにより着金まで 5〜10 営業日）。",
        })}
      </p>
    </form>
  );
};

export function AutoRefillSetupDialog({
  open,
  onOpenChange,
  onEnabled,
}: AutoRefillSetupDialogProps) {
  const { language } = useLanguage();
  const txt = (values: Parameters<typeof getLocalizedText>[1]) =>
    getLocalizedText(language, values);
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
          "Could not start card setup";
        throw new Error(msg);
      }
      const cs = (data as { client_secret?: string }).client_secret;
      const sid = (data as { setup_intent_id?: string }).setup_intent_id;
      if (!cs || !sid) throw new Error("Stripe didn't return a client secret");
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
          colorPrimary: "#a78bfa",
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
            {txt({ en: "Set up auto-refill", th: "ตั้งค่าเติมเครดิตอัตโนมัติ", es: "Configurar la recarga automática", ja: "自動チャージを設定" })}
          </DialogTitle>
          <DialogDescription className="text-[12.5px] leading-relaxed text-zinc-400">
            {txt({
              en: "When your credits drop below the threshold, your saved card is charged automatically. This complements PromptPay top-ups for high-traffic moments.",
              th: "เมื่อเครดิตของคุณต่ำกว่าค่าที่ตั้งไว้ ระบบจะหักบัตรอัตโนมัติเพื่อเติมเครดิตให้ ผูกบัตรเสริมจาก PromptPay ที่ใช้อยู่ได้ — ใช้ตอนเร่งด่วน ตอนใช้งานเยอะ",
              es: "Cuando sus créditos caen por debajo del umbral, su tarjeta guardada se carga automáticamente. Esto complementa las recargas PromptPay para momentos de mucho tráfico.",
              ja: "クレジットがしきい値を下回ると、保存済みカードに自動で請求してチャージします。PromptPay チャージを補完し、利用が多いタイミングでも残高切れを防ぎます。",
            })}
          </DialogDescription>
        </DialogHeader>

        {step === "configure" && (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-medium text-zinc-300">
                  {txt({ en: "Refill when balance drops below", th: "เติมเมื่อเครดิตต่ำกว่า", es: "Recarga cuando el saldo caiga por debajo", ja: "残高が以下になったらチャージ" })}
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
                  className="mt-1 w-full rounded-md bg-black/40 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-violet-500/40"
                />
                <p className="mt-1 text-[10.5px] text-zinc-500">
                  {txt({ en: "Min 50 / max 10,000 credits", th: "ขั้นต่ำ 50 / สูงสุด 10,000 เครดิต", es: "Mínimo 50 / máximo 10.000 créditos", ja: "最小 50 / 最大 10,000 クレジット" })}
                </p>
              </div>
              <div>
                <label className="text-[12px] font-medium text-zinc-300">
                  {txt({ en: "Refill amount per cycle", th: "จำนวนที่เติมต่อครั้ง", es: "Cantidad de recarga por ciclo", ja: "1 回あたりのチャージ金額" })}
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
                    className="w-full rounded-md bg-black/40 py-2 pl-7 pr-3 text-[13px] text-zinc-100 outline-none focus:border-violet-500/40"
                  />
                </div>
                <p className="mt-1 text-[10.5px] text-zinc-500">
                  {txt({
                    en: `≈ ${previewCredits.toLocaleString()} credits per refill (1 THB = ${RATIO_THB_TO_CREDITS} credits)`,
                    th: `จะได้ ${previewCredits.toLocaleString()} เครดิต ต่อครั้ง (1 บาท = ${RATIO_THB_TO_CREDITS} เครดิต)`,
                    es: `≈ ${previewCredits.toLocaleString()} créditos por recarga (1 THB = ${RATIO_THB_TO_CREDITS} créditos)`,
                    ja: `1 回あたり約 ${previewCredits.toLocaleString()} クレジット（1 THB = ${RATIO_THB_TO_CREDITS} クレジット）`,
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
                  ? "cursor-not-allowed bg-violet-500/40 text-white/60"
                  : "bg-violet-600 text-white hover:bg-violet-500",
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {txt({ en: "Preparing…", th: "กำลังเตรียม…", es: "Preparando…", ja: "準備中…" })}
                </>
              ) : (
                <>
                  <CreditCard className="h-3.5 w-3.5" />
                  {txt({ en: "Continue — bind card", th: "ดำเนินการ — ผูกบัตรเครดิต", es: "Continuar — enlazar tarjeta", ja: "続行 — カードを登録" })}
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
              {txt({ en: "Auto-refill enabled", th: "เปิดใช้งานแล้ว", es: "Recarga automática habilitada", ja: "自動チャージが有効です" })}
            </p>
            <p className="text-[12px] text-zinc-400">
              {txt({
                en: `฿${amountThb.toLocaleString()} will be charged when balance drops below ${threshold} credits.`,
                th: `ระบบจะเติม ฿${amountThb.toLocaleString()} อัตโนมัติเมื่อเครดิตต่ำกว่า ${threshold}`,
                es: `Se cobrará ฿${amountThb.toLocaleString()} cuando el saldo baje de ${threshold} créditos.`,
                ja: `残高が ${threshold} クレジットを下回ると ฿${amountThb.toLocaleString()} が請求されます。`,
              })}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
