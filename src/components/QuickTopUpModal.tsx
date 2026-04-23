import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  Loader2,
  CheckCircle2,
  Clock,
  QrCode,
  XCircle,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useCredits } from "@/hooks/useCredits";

interface TopupPackage {
  id: string;
  name: string;
  credits: number;
  price_thb: number;
}

interface QuickTopUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packages: TopupPackage[];
  currentBalance?: number;
}

type ModalStep = "select" | "qr" | "success" | "error";

interface QrData {
  paymentIntentId: string;
  qrCodeSvgUrl: string | null;
  qrCodePngUrl: string | null;
  expiresAt: number | null;
  amount: number;
  credits: number;
  packageName: string;
}

const QuickTopUpModal = ({
  open,
  onOpenChange,
  packages,
  currentBalance = 0,
}: QuickTopUpModalProps) => {
  const { language } = useLanguage();
  const { refetch } = useCredits();

  const [step, setStep] = useState<ModalStep>("select");
  const [loading, setLoading] = useState<string | null>(null);
  const [qrData, setQrData] = useState<QrData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    pollingRef.current = null;
    timerRef.current = null;
  }, []);

  // Reset on close
  useEffect(() => {
    if (!open) {
      cleanup();
      setTimeout(() => {
        setStep("select");
        setQrData(null);
        setLoading(null);
        setErrorMsg("");
      }, 300);
    }
  }, [open, cleanup]);

  // Countdown timer
  useEffect(() => {
    if (step !== "qr" || !qrData?.expiresAt) return;
    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.floor(qrData.expiresAt! - Date.now() / 1000)
      );
      setTimeLeft(remaining);
      if (remaining <= 0) {
        cleanup();
        setStep("error");
        setErrorMsg(
          language === "th" ? "QR Code หมดอายุ" : "QR Code expired"
        );
      }
    };
    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step, qrData, language, cleanup]);

  const handleSelectPackage = async (pkg: TopupPackage) => {
    setLoading(pkg.id);
    setErrorMsg("");

    try {
      const { data, error } = await supabase.functions.invoke(
        "create-promptpay-intent",
        { body: { packageId: pkg.id } }
      );

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Failed");
      }

      setQrData(data as QrData);
      setStep("qr");

      // Start polling for payment status
      pollingRef.current = setInterval(async () => {
        try {
          const { data: statusData } = await supabase.functions.invoke(
            "create-promptpay-intent",
            {
              body: {
                packageId: pkg.id,
                checkStatus: true,
                paymentIntentId: data.paymentIntentId,
              },
            }
          );
          // We'll check via a separate lightweight call — or use the webhook approach
          // For now, poll the payment_transactions table
        } catch {
          // Ignore polling errors
        }
      }, 5000);

      // Also poll payment_transactions for completion (webhook-driven)
      const pollTx = setInterval(async () => {
        const { data: txData } = await supabase
          .from("payment_transactions")
          .select("id, status")
          .eq("stripe_payment_intent_id", data.paymentIntentId)
          .eq("status", "completed")
          .maybeSingle();

        if (txData) {
          clearInterval(pollTx);
          cleanup();
          setStep("success");
          refetch();
        }
      }, 3000);

      // Store for cleanup
      const origCleanup = pollingRef.current;
      pollingRef.current = pollTx;
      if (origCleanup) clearInterval(origCleanup);
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong");
      setStep("error");
    } finally {
      setLoading(null);
    }
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] p-0 overflow-hidden bg-[#0c1020] border-white/[0.08] rounded-2xl gap-0">
        {/* ── Package Selection ── */}
        {step === "select" && (
          <>
            <div className="px-5 pt-5 pb-3">
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  {language === "th"
                    ? "เติมเครดิตด่วน — PromptPay"
                    : "Quick Top-Up — PromptPay"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {language === "th"
                    ? `ยอดคงเหลือ: ${currentBalance.toLocaleString()} credits · สแกน QR จ่ายทันที`
                    : `Balance: ${currentBalance.toLocaleString()} credits · Scan QR to pay instantly`}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="px-4 pb-5 space-y-2">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => handleSelectPackage(pkg)}
                  disabled={!!loading}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-emerald-500/30 transition-all group"
                >
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {pkg.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {pkg.credits.toLocaleString()} credits
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                      ฿{Number(pkg.price_thb).toLocaleString()}
                    </span>
                    {loading === pkg.id && (
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── QR Code Display ── */}
        {step === "qr" && qrData && (
          <div className="px-5 py-6 flex flex-col items-center text-center space-y-4">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base font-semibold text-foreground">
                {language === "th"
                  ? "สแกน QR Code เพื่อชำระเงิน"
                  : "Scan QR Code to Pay"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {qrData.packageName} · {qrData.credits.toLocaleString()}{" "}
                credits · ฿{qrData.amount.toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            {/* QR Code Image from Stripe */}
            <div className="bg-white rounded-2xl p-4 shadow-lg">
              {qrData.qrCodeSvgUrl ? (
                <img
                  src={qrData.qrCodeSvgUrl}
                  alt="PromptPay QR Code"
                  className="w-56 h-56"
                />
              ) : qrData.qrCodePngUrl ? (
                <img
                  src={qrData.qrCodePngUrl}
                  alt="PromptPay QR Code"
                  className="w-56 h-56"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              )}
            </div>

            {/* Timer */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {language === "th" ? "หมดอายุใน" : "Expires in"}{" "}
                {formatTime(timeLeft)}
              </span>
            </div>

            {/* Waiting indicator */}
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>
                {language === "th"
                  ? "รอการชำระเงิน..."
                  : "Waiting for payment..."}
              </span>
            </div>

            <Badge
              variant="outline"
              className="text-[10px] border-border text-muted-foreground"
            >
              PromptPay · Thai QR Payment
            </Badge>
          </div>
        )}

        {/* ── Success ── */}
        {step === "success" && qrData && (
          <div className="px-5 py-10 flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">
                {language === "th" ? "ชำระเงินสำเร็จ!" : "Payment Successful!"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                +{qrData.credits.toLocaleString()} credits{" "}
                {language === "th" ? "ถูกเพิ่มแล้ว" : "added to your account"}
              </p>
            </div>
            <Button
              onClick={() => onOpenChange(false)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {language === "th" ? "เสร็จสิ้น" : "Done"}
            </Button>
          </div>
        )}

        {/* ── Error ── */}
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
            <Button
              variant="outline"
              onClick={() => {
                setStep("select");
                setErrorMsg("");
              }}
            >
              {language === "th" ? "ลองอีกครั้ง" : "Try Again"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QuickTopUpModal;
