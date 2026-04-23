import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Clock,
  Gift,
  Loader2,
  QrCode,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useCredits } from "@/hooks/useCredits";

interface PromoPackage {
  id: string;
  name: string;
  credits: number;
  price_thb: number;
  bonus_percent: number | null;
  original_credits: number | null;
  badge_label: string | null;
}

interface QrData {
  paymentIntentId: string;
  qrCodeSvgUrl: string | null;
  qrCodePngUrl: string | null;
  expiresAt: number | null;
  amount: number;
  credits: number;
  packageName: string;
}

interface PromptPayPromoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Credits required to run the flow — shown in the header. */
  requiredCredits?: number;
  currentBalance?: number;
}

type Step = "loading" | "qr" | "success" | "error";

/**
 * Single-card PromptPay top-up modal. Auto-fetches the active promo
 * package (e.g. Welcome Promo 49฿) and immediately requests the QR
 * code, then polls payment_transactions until the webhook completes.
 *
 * Intended for the "Generate clicked but no credits" flow on /play.
 */
const PromptPayPromoModal = ({
  open,
  onOpenChange,
  requiredCredits,
  currentBalance = 0,
}: PromptPayPromoModalProps) => {
  const { language } = useLanguage();
  const { refetch } = useCredits();

  const [pkg, setPkg] = useState<PromoPackage | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [qrData, setQrData] = useState<QrData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);

  const pollTxRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pollTxRef.current) clearInterval(pollTxRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    pollTxRef.current = null;
    timerRef.current = null;
  }, []);

  // Reset on close
  useEffect(() => {
    if (!open) {
      cleanup();
      startedRef.current = false;
      const t = setTimeout(() => {
        setStep("loading");
        setQrData(null);
        setErrorMsg("");
        setPkg(null);
      }, 250);
      return () => clearTimeout(t);
    }
  }, [open, cleanup]);

  // Countdown timer
  useEffect(() => {
    if (step !== "qr" || !qrData?.expiresAt) return;
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor(qrData.expiresAt! - Date.now() / 1000),
      );
      setTimeLeft(remaining);
      if (remaining <= 0) {
        cleanup();
        setStep("error");
        setErrorMsg(language === "th" ? "QR Code หมดอายุ" : "QR Code expired");
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step, qrData, language, cleanup]);

  // Boot: load promo package + request QR
  useEffect(() => {
    if (!open || startedRef.current) return;
    startedRef.current = true;
    setStep("loading");
    setErrorMsg("");

    (async () => {
      try {
        // Find the first active promo package (sorted by sort_order).
        const { data: promoRows, error: pkgErr } = await supabase
          .from("topup_packages" as any)
          .select(
            "id, name, credits, price_thb, bonus_percent, original_credits, badge_label, is_promo, is_active, sort_order",
          )
          .eq("is_active", true)
          .eq("is_promo", true)
          .order("sort_order", { ascending: true })
          .limit(1);
        if (pkgErr) throw pkgErr;
        const promo = (promoRows as any[])?.[0];
        if (!promo) throw new Error("No promo package available");

        const promoPkg: PromoPackage = {
          id: promo.id,
          name: promo.name,
          credits: promo.credits,
          price_thb: promo.price_thb,
          bonus_percent: promo.bonus_percent ?? null,
          original_credits: promo.original_credits ?? null,
          badge_label: promo.badge_label ?? null,
        };
        setPkg(promoPkg);

        const { data, error } = await supabase.functions.invoke(
          "create-promptpay-intent",
          { body: { packageId: promoPkg.id } },
        );
        if (error || (data as any)?.error) {
          throw new Error(
            (data as any)?.error || error?.message || "Failed to create intent",
          );
        }

        const qd = data as QrData;
        setQrData(qd);
        setStep("qr");

        // Poll the payment_transactions table until the webhook marks it complete.
        pollTxRef.current = setInterval(async () => {
          const { data: txData } = await supabase
            .from("payment_transactions")
            .select("id, status")
            .eq("stripe_payment_intent_id", qd.paymentIntentId)
            .eq("status", "completed")
            .maybeSingle();
          if (txData) {
            cleanup();
            setStep("success");
            refetch();
          }
        }, 3000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setErrorMsg(msg);
        setStep("error");
      }
    })();
  }, [open, cleanup, refetch]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const handleRetry = () => {
    startedRef.current = false;
    setStep("loading");
    setErrorMsg("");
    setQrData(null);
    // The boot effect re-runs because startedRef is reset and `open` is still true.
    // Force re-run by toggling startedRef on next tick:
    setTimeout(() => {
      startedRef.current = false;
      // Trigger by setting a dummy state; the effect re-evaluates on render.
      setPkg(null);
    }, 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] p-0 overflow-hidden bg-[#0c1020] border-white/[0.08] rounded-2xl gap-0">
        {/* ─── Loading ─── */}
        {step === "loading" && (
          <div className="px-5 py-12 flex flex-col items-center text-center space-y-3">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-sm text-muted-foreground">
              {language === "th" ? "กำลังสร้าง QR…" : "Creating QR code…"}
            </p>
          </div>
        )}

        {/* ─── QR ─── */}
        {step === "qr" && qrData && pkg && (
          <>
            {/* Promo header card */}
            <div className="px-5 pt-5 pb-3">
              <DialogHeader className="space-y-2">
                <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  {language === "th"
                    ? "เติมเครดิตเพื่อสร้างผลงาน"
                    : "Top up to generate"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {requiredCredits
                    ? language === "th"
                      ? `ต้องใช้ ${requiredCredits.toLocaleString()} credits · ยอดคงเหลือ ${currentBalance.toLocaleString()}`
                      : `Need ${requiredCredits.toLocaleString()} credits · balance ${currentBalance.toLocaleString()}`
                    : language === "th"
                      ? `ยอดคงเหลือ: ${currentBalance.toLocaleString()} credits`
                      : `Balance: ${currentBalance.toLocaleString()} credits`}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="mx-4 mb-3 rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/[0.08] to-pink-500/[0.06] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                      {pkg.badge_label ||
                        (language === "th" ? "ข้อเสนอพิเศษ" : "Special Offer")}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-foreground leading-tight">
                    {pkg.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {pkg.credits.toLocaleString()} credits
                    {pkg.bonus_percent && pkg.bonus_percent > 0 ? (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-emerald-400 font-semibold">
                          +{pkg.bonus_percent}%{" "}
                          {language === "th" ? "โบนัส" : "bonus"}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-extrabold text-foreground leading-none">
                    ฿{Number(pkg.price_thb).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {language === "th" ? "ครั้งเดียว" : "one-time"}
                  </div>
                </div>
              </div>
            </div>

            {/* QR */}
            <div className="px-5 pb-5 flex flex-col items-center text-center space-y-3">
              <div className="bg-white rounded-2xl p-3 shadow-lg">
                {qrData.qrCodeSvgUrl ? (
                  <img
                    src={qrData.qrCodeSvgUrl}
                    alt="PromptPay QR"
                    className="w-52 h-52"
                  />
                ) : qrData.qrCodePngUrl ? (
                  <img
                    src={qrData.qrCodePngUrl}
                    alt="PromptPay QR"
                    className="w-52 h-52"
                  />
                ) : (
                  <div className="w-52 h-52 flex items-center justify-center text-muted-foreground">
                    <Loader2 className="w-7 h-7 animate-spin" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {language === "th" ? "หมดอายุใน" : "Expires in"}{" "}
                  {formatTime(timeLeft)}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>
                  {language === "th"
                    ? "รอการชำระเงิน… เครดิตจะเข้าอัตโนมัติ"
                    : "Waiting for payment… credits added automatically"}
                </span>
              </div>

              <Badge
                variant="outline"
                className="text-[10px] border-border text-muted-foreground"
              >
                PromptPay · Thai QR Payment
              </Badge>
            </div>
          </>
        )}

        {/* ─── Success ─── */}
        {step === "success" && qrData && (
          <div className="px-5 py-10 flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">
                {language === "th" ? "ชำระเงินสำเร็จ!" : "Payment Successful!"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-emerald-400" />+
                {qrData.credits.toLocaleString()} credits{" "}
                {language === "th" ? "ถูกเพิ่มแล้ว" : "added to your account"}
              </p>
            </div>
            <Button
              onClick={() => onOpenChange(false)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {language === "th" ? "เริ่มสร้างผลงาน" : "Start generating"}
            </Button>
          </div>
        )}

        {/* ─── Error ─── */}
        {step === "error" && (
          <div className="px-5 py-10 flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">
                {language === "th" ? "เกิดข้อผิดพลาด" : "Something went wrong"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
            </div>
            <Button variant="outline" onClick={handleRetry}>
              {language === "th" ? "ลองอีกครั้ง" : "Try Again"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PromptPayPromoModal;
