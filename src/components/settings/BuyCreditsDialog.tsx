import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  QrCode,
  X,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Buy extra credits — custom-amount-only, PromptPay QR checkout.
 *
 * The previous version showed a stack of preset packs (12,250 / 6,250
 * / … "extra credits / pack"). That's replaced with a single THB
 * amount input. The user types how much they want to top up, sees a
 * live "you'll get X credits" preview, and pays via PromptPay QR.
 *
 *   1 THB = 25 credits  (matches the published rate)
 *   minimum: 500 THB    (lifted from 100 because the smaller packs
 *                        weren't worth the Stripe fee floor)
 *   maximum: 100,000 THB
 *
 * Flow:
 *   amount → POST `create-promptpay-intent` with `{ amountThb }`
 *          → render the returned QR (image_url_svg / image_url_png)
 *          → poll `payment_transactions` until `status = "completed"`
 *            (the stripe-webhook flips it on payment_intent.succeeded
 *            and grants credits via `grant_credits` RPC)
 *          → success state, refetch balances, close.
 */

const RATIO_THB_TO_CREDITS = 25;
const MIN_TOPUP_THB = 500;
const MAX_TOPUP_THB = 100_000;
const PROMPTPAY_TIMEOUT_SEC = 600; // Stripe expires the QR after ~10 min

interface BuyCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional callback fired right after a successful top-up — the
   *  parent (settings page) uses it to refresh the credit balance
   *  badge without a full route reload. */
  onSuccess?: () => void;
}

type Step = "form" | "qr" | "success" | "error";

interface PromptPayQr {
  paymentIntentId: string;
  clientSecret: string;
  qrCodeSvgUrl: string | null;
  qrCodePngUrl: string | null;
  expiresAt: number | null;
  amount: number;
  credits: number;
  packageName: string;
}

const BuyCreditsDialog = ({ open, onOpenChange, onSuccess }: BuyCreditsDialogProps) => {
  const { t: i18n } = useLanguage();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("form");
  const [amountInput, setAmountInput] = useState<string>(String(MIN_TOPUP_THB));
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [qrData, setQrData] = useState<PromptPayQr | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(PROMPTPAY_TIMEOUT_SEC);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Reset on close ─────────────────────────────────────────
  useEffect(() => {
    if (open) return;
    // Defer reset so the close animation isn't visibly disrupted.
    const t = setTimeout(() => {
      setStep("form");
      setAmountInput(String(MIN_TOPUP_THB));
      setSubmitting(false);
      setErrorMsg(null);
      setQrData(null);
      setSecondsLeft(PROMPTPAY_TIMEOUT_SEC);
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      pollRef.current = null;
      timerRef.current = null;
    }, 250);
    return () => clearTimeout(t);
  }, [open]);

  // ── Cleanup pollers on unmount ─────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── Derived values ─────────────────────────────────────────
  const amountThb = useMemo(() => {
    const n = Math.floor(Number(amountInput));
    if (!Number.isFinite(n)) return 0;
    return n;
  }, [amountInput]);

  const validatedAmount = useMemo(() => {
    return Math.max(MIN_TOPUP_THB, Math.min(MAX_TOPUP_THB, amountThb || 0));
  }, [amountThb]);

  const previewCredits = useMemo(
    () => validatedAmount * RATIO_THB_TO_CREDITS,
    [validatedAmount],
  );

  const isAmountValid =
    amountThb >= MIN_TOPUP_THB && amountThb <= MAX_TOPUP_THB;

  // ── Submit ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!isAmountValid) {
      setErrorMsg(i18n("settings.buyCredits.enterAtLeastThb", { amount: MIN_TOPUP_THB.toLocaleString() }));
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-promptpay-intent",
        { body: { amountThb } },
      );
      if (error || data?.error || !data?.paymentIntentId) {
        throw new Error(
          data?.error ||
            (error as { message?: string } | null)?.message ||
            i18n("settings.buyCredits.couldNotCreatePaymentRequest"),
        );
      }
      const qr = data as PromptPayQr;
      setQrData(qr);
      setStep("qr");

      // Poll for payment completion via the webhook-driven row in
      // payment_transactions. Stripe emits payment_intent.succeeded
      // ~seconds after the user pays the QR; the webhook flips the
      // row to "completed" and grants credits.
      pollRef.current = setInterval(async () => {
        const { data: tx } = await supabase
          .from("payment_transactions")
          .select("id, status")
          .eq("stripe_payment_intent_id", qr.paymentIntentId)
          .eq("status", "completed")
          .maybeSingle();
        if (tx) {
          if (pollRef.current) clearInterval(pollRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
          pollRef.current = null;
          timerRef.current = null;
          setStep("success");
          onSuccess?.();
        }
      }, 3000);

      // Countdown — when this hits 0 the QR is dead and we kick the
      // user back to the form so they can request a fresh one.
      const expiresAtMs = qr.expiresAt
        ? qr.expiresAt * 1000
        : Date.now() + PROMPTPAY_TIMEOUT_SEC * 1000;
      const tick = () => {
        const remaining = Math.max(
          0,
          Math.floor((expiresAtMs - Date.now()) / 1000),
        );
        setSecondsLeft(remaining);
        if (remaining <= 0 && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setErrorMsg(i18n("settings.buyCredits.qrExpiredPleaseCreateNewPayment"));
          setStep("error");
        }
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : i18n("settings.buyCredits.somethingWentWrong");
      setErrorMsg(msg);
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const fmtThb = (n: number) => `฿${n.toLocaleString()}`;
  const fmtCredits = (n: number) => n.toLocaleString();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] gap-0 overflow-hidden rounded-2xl border-white/[0.08] bg-[#0c1020] p-0">
        {/* ── Header ───────────────────────────────────────── */}
        <div className="relative px-6 pt-6 pb-3">
          <DialogHeader className="space-y-1.5 pr-8">
            <DialogTitle className="text-base font-semibold text-zinc-50">
              {i18n("settings.buyCredits.topUpCredits")}
            </DialogTitle>
            <DialogDescription className="text-[11.5px] leading-relaxed text-zinc-400">
              {i18n("settings.buyCredits.payWith")}{" "}
              <span className="font-medium text-zinc-200">PromptPay QR</span>{" "}
              · {i18n("settings.buyCredits.exchangeRateNote", { credits: RATIO_THB_TO_CREDITS })}
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 text-zinc-500 transition-colors hover:text-zinc-200"
            aria-label={i18n("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Step: form (amount input) ────────────────────── */}
        {step === "form" && (
          <div className="space-y-4 px-6 pb-6 pt-2">
            <div>
              <Label
                htmlFor="topup-amount"
                className="text-[12px] font-medium text-zinc-300"
              >
                {i18n("settings.buyCredits.topUpAmountThb")}
              </Label>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[18px] font-medium text-zinc-500">฿</span>
                <Input
                  id="topup-amount"
                  type="number"
                  inputMode="numeric"
                  min={MIN_TOPUP_THB}
                  max={MAX_TOPUP_THB}
                  step={50}
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="h-11 bg-[#16192c] text-[16px] font-semibold text-zinc-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  placeholder={String(MIN_TOPUP_THB)}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[10.5px] text-zinc-500">
                <span>
                  {i18n("settings.buyCredits.minimum")} ฿{MIN_TOPUP_THB.toLocaleString()} · {i18n("settings.buyCredits.maximum")} ฿{MAX_TOPUP_THB.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Quick-select chips */}
            <div className="flex flex-wrap gap-1.5">
              {[500, 1000, 2000, 5000, 10000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmountInput(String(v))}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] transition-colors ring-1 ring-inset",
                    amountThb === v
                      ? "bg-yellow-500/20 text-yellow-100 ring-yellow-400/30"
                      : "bg-white/[0.04] text-zinc-300 ring-white/[0.08] hover:bg-white/[0.08]",
                  )}
                >
                  ฿{v.toLocaleString()}
                </button>
              ))}
            </div>

            {/* Live preview */}
            <div className="rounded-xl bg-white/[0.04] px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] text-zinc-400">
                  {i18n("settings.buyCredits.creditsYouWillReceive")}
                </span>
                <span className="text-[20px] font-semibold text-emerald-300">
                  +{fmtCredits(previewCredits)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10.5px] text-zinc-500">
                <span>{i18n("settings.buyCredits.at1ThbCredits", { credits: RATIO_THB_TO_CREDITS })}</span>
                <span>{i18n("settings.buyCredits.pay", { amount: fmtThb(validatedAmount) })}</span>
              </div>
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2 rounded-md border border-red-400/20 bg-red-500/[0.06] px-3 py-2 text-[11.5px] text-red-300">
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <Button
              onClick={handleSubmit}
              disabled={submitting || !isAmountValid}
              className="ci-gloss-button h-11 w-full rounded-full text-[13.5px] font-semibold"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {i18n("settings.buyCredits.creatingQr")}
                </>
              ) : (
                <>
                  <QrCode className="mr-2 h-4 w-4" />
                  {i18n("settings.buyCredits.createPaymentQr")}
                </>
              )}
            </Button>
          </div>
        )}

        {/* ── Step: qr ────────────────────────────────────── */}
        {step === "qr" && qrData && (
          <div className="space-y-4 px-6 pb-6 pt-2">
            <div className="rounded-xl bg-white/[0.04] p-4">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">{i18n("settings.buyCredits.paymentAmount")}</span>
                <span className="font-semibold text-zinc-100">
                  {fmtThb(qrData.amount)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">{i18n("settings.buyCredits.creditsYouWillReceive")}</span>
                <span className="font-semibold text-emerald-300">
                  +{fmtCredits(qrData.credits)}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 rounded-xl bg-white/[0.04] p-5">
              {qrData.qrCodeSvgUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={qrData.qrCodeSvgUrl}
                  alt={i18n("settings.common.promptpayQr")}
                  className="h-56 w-56 rounded-lg bg-white p-3"
                />
              ) : qrData.qrCodePngUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={qrData.qrCodePngUrl}
                  alt={i18n("settings.common.promptpayQr")}
                  className="h-56 w-56 rounded-lg bg-white p-3"
                />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-lg bg-white/10 text-zinc-500">
                  {i18n("settings.buyCredits.qrNotFound")}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                <Clock className="h-3 w-3" />
                <span>{i18n("settings.buyCredits.expiresIn", { time: formatTime(secondsLeft) })}</span>
              </div>
              <div className="text-center text-[10.5px] text-zinc-500">
                {i18n("settings.buyCredits.scanQrInYourBankingApp")}
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-400" />
              {i18n("settings.buyCredits.waitingForPayment")}
            </div>
          </div>
        )}

        {/* ── Step: success ───────────────────────────────── */}
        {step === "success" && qrData && (
          <div className="space-y-4 px-6 pb-6 pt-2">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] px-5 py-7">
              <CheckCircle2 className="h-12 w-12 text-emerald-300" />
              <div className="text-center">
                <div className="text-[15px] font-semibold text-zinc-50">
                  {i18n("settings.buyCredits.paymentSuccessful")}
                </div>
                <div className="mt-1 text-[12px] text-emerald-200">
                  {i18n("settings.buyCredits.creditsAdded", { credits: fmtCredits(qrData.credits) })}
                </div>
                <div className="mt-1 text-[10.5px] text-zinc-400">
                  {i18n("settings.buyCredits.paymentAmount2", { amount: fmtThb(qrData.amount) })}
                </div>
              </div>
            </div>
            <Button
              onClick={() => {
                onOpenChange(false);
                toast({
                  title: i18n("settings.buyCredits.creditsToppedUp"),
                  description: i18n("settings.buyCredits.creditsInYourAccount", { credits: fmtCredits(qrData.credits) }),
                });
              }}
              className="h-11 w-full bg-zinc-100 text-[13.5px] font-semibold text-zinc-900 hover:bg-zinc-200"
            >
              {i18n("settings.buyCredits.done")}
            </Button>
          </div>
        )}

        {/* ── Step: error ─────────────────────────────────── */}
        {step === "error" && (
          <div className="space-y-4 px-6 pb-6 pt-2">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-red-400/20 bg-red-500/[0.06] px-5 py-7">
              <AlertCircle className="h-12 w-12 text-red-300" />
              <div className="text-center">
                <div className="text-[15px] font-semibold text-zinc-50">
                  {i18n("settings.buyCredits.paymentFailed")}
                </div>
                <div className="mt-1 max-w-[300px] text-[11.5px] text-red-200">
                  {errorMsg ?? i18n("settings.buyCredits.somethingWentWrongPleaseTryAgain")}
                </div>
              </div>
            </div>
            <Button
              onClick={() => {
                setStep("form");
                setErrorMsg(null);
              }}
              className="ci-gloss-button h-11 w-full rounded-full text-[13.5px] font-semibold"
            >
              {i18n("settings.buyCredits.tryAgain")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BuyCreditsDialog;
