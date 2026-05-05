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
  const { t: i18n } = useLanguage();
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
        setErrorMsg(i18n("quickTopup.qrExpired"));
      }
    };
    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step, qrData, i18n, cleanup]);

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
                  {i18n("quickTopup.title")}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {i18n("quickTopup.balancePrompt", {
                    balance: currentBalance.toLocaleString(),
                  })}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="px-4 pb-5 space-y-2">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => handleSelectPackage(pkg)}
                  disabled={!!loading}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors group"
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
                        {pkg.credits.toLocaleString()} {i18n("common.credits")}
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
                {i18n("quickTopup.scanQrToPay")}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {qrData.packageName} · {qrData.credits.toLocaleString()}{" "}
                {i18n("common.credits")} · ฿{qrData.amount.toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            {/* QR Code Image from Stripe */}
            <div className="bg-white rounded-2xl p-4 shadow-lg">
              {qrData.qrCodeSvgUrl ? (
                <img
                  src={qrData.qrCodeSvgUrl}
                  alt={i18n("checkout.quickTopUp.promptpayQrCode")}
                  className="w-56 h-56"
                />
              ) : qrData.qrCodePngUrl ? (
                <img
                  src={qrData.qrCodePngUrl}
                  alt={i18n("checkout.quickTopUp.promptpayQrCode")}
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
                {i18n("quickTopup.expiresIn")}{" "}
                {formatTime(timeLeft)}
              </span>
            </div>

            {/* Waiting indicator */}
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>
                {i18n("quickTopup.waitingForPayment")}
              </span>
            </div>

            <Badge
              variant="outline"
              className="text-[10px] border-border text-muted-foreground"
            >
              {i18n("quickTopup.promptpayThaiQr")}
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
                {i18n("quickTopup.paymentSuccessful")}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {i18n("quickTopup.creditsAdded", {
                  credits: qrData.credits.toLocaleString(),
                })}
              </p>
            </div>
            <Button
              onClick={() => onOpenChange(false)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {i18n("quickTopup.done")}
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
                {i18n("quickTopup.errorTitle")}
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
              {i18n("quickTopup.tryAgain")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QuickTopUpModal;
