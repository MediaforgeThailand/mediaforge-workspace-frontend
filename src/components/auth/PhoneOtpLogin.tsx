import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, ArrowLeft, CheckCircle2 } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface PhoneOtpLoginProps {
  onSuccess?: () => void;
  onBack?: () => void;
  compact?: boolean;
}

type Step = "phone" | "otp" | "success";

const PhoneOtpLogin = ({ onSuccess, onBack, compact = false }: PhoneOtpLoginProps) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (countdown > 0) {
      intervalRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(intervalRef.current);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      return () => clearInterval(intervalRef.current);
    }
  }, [countdown]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 9) {
      toast({ variant: "destructive", title: t("phoneOtp.invalidPhone") });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("phone-otp-send", {
        body: { phone },
      });

      if (error || data?.error) {
        toast({
          variant: "destructive",
          title: t("phoneOtp.sendFailed"),
          description: data?.error || error?.message,
        });
        setIsLoading(false);
        return;
      }

      setNormalizedPhone(data.phone);
      setStep("otp");
      setCountdown(60);
    } catch {
      toast({ variant: "destructive", title: t("phoneOtp.genericError") });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("phone-otp-verify", {
        body: { phone: normalizedPhone, code: otpCode },
      });

      if (error || data?.error) {
        toast({
          variant: "destructive",
          title: t("phoneOtp.verifyFailed"),
          description: data?.error || error?.message,
        });
        setIsLoading(false);
        return;
      }

      if (data?.success && data?.session?.verification_url) {
        // Extract token from the verification URL and verify OTP via Supabase
        const url = new URL(data.session.verification_url);
        const tokenHash = url.searchParams.get("token_hash") || data.session.token_hash;
        
        if (tokenHash) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "magiclink",
          });

          if (verifyError) {
            console.error("Session verify error:", verifyError);
            toast({
              variant: "destructive",
              title: t("phoneOtp.loginFailed"),
              description: verifyError.message,
            });
            setIsLoading(false);
            return;
          }
        }

        setStep("success");
        setTimeout(() => {
          onSuccess?.();
        }, 1500);
      }
    } catch {
      toast({ variant: "destructive", title: t("phoneOtp.genericError") });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setOtpCode("");
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("phone-otp-send", {
        body: { phone: normalizedPhone },
      });

      if (error || data?.error) {
        toast({
          variant: "destructive",
          title: t("phoneOtp.resendFailed"),
          description: data?.error || error?.message,
        });
      } else {
        setCountdown(60);
        toast({ title: t("phoneOtp.resent") });
      }
    } catch {
      toast({ variant: "destructive", title: t("phoneOtp.genericError") });
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (otpCode.length === 6 && step === "otp" && !isLoading) {
      handleVerifyOtp();
    }
  }, [otpCode]);

  if (step === "success") {
    return (
      <div className="flex flex-col items-center text-center space-y-4 py-4">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center animate-in zoom-in-50">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <p className="text-sm font-semibold text-foreground">
          {t("phoneOtp.success")}
        </p>
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">
            {t("phoneOtp.sentTo")}
          </p>
          <p className="text-sm font-semibold text-foreground">{normalizedPhone}</p>
        </div>

        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={otpCode}
            onChange={(value) => setOtpCode(value)}
            disabled={isLoading}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("phoneOtp.verifying")}
          </div>
        )}

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setOtpCode("");
            }}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            {t("phoneOtp.changeNumber")}
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={countdown > 0 || isLoading}
            className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          >
            {countdown > 0
              ? t("phoneOtp.resendIn", { seconds: countdown })
              : t("phoneOtp.resendCode")}
          </button>
        </div>
      </div>
    );
  }

  // Phone input step
  return (
    <form onSubmit={handleSendOtp} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="phone-input" className="text-xs">
          {t("phoneOtp.phoneNumber")}
        </Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="phone-input"
            type="tel"
            placeholder="08X-XXX-XXXX"
            className="bg-input border-border h-10 pl-10"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            autoComplete="tel"
            inputMode="tel"
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {t("phoneOtp.smsHelp")}
        </p>
      </div>

      <Button type="submit" variant="gradient" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Phone className="mr-2 h-4 w-4" />
        )}
        {isLoading
          ? t("phoneOtp.sending")
          : t("phoneOtp.sendCode")}
      </Button>

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="w-full text-xs text-muted-foreground hover:text-foreground text-center"
        >
          {t("phoneOtp.emailInstead")}
        </button>
      )}
    </form>
  );
};

export default PhoneOtpLogin;
