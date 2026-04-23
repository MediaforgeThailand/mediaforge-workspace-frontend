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
  const { language } = useLanguage();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const txt = (th: string, en: string) => (language === "th" ? th : en);

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
      toast({ variant: "destructive", title: txt("กรุณากรอกเบอร์โทรที่ถูกต้อง", "Enter a valid phone number") });
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
          title: txt("ส่ง OTP ไม่สำเร็จ", "Failed to send OTP"),
          description: data?.error || error?.message,
        });
        setIsLoading(false);
        return;
      }

      setNormalizedPhone(data.phone);
      setStep("otp");
      setCountdown(60);
    } catch {
      toast({ variant: "destructive", title: txt("เกิดข้อผิดพลาด", "Error") });
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
          title: txt("ยืนยัน OTP ไม่สำเร็จ", "OTP verification failed"),
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
              title: txt("เข้าสู่ระบบไม่สำเร็จ", "Login failed"),
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
      toast({ variant: "destructive", title: txt("เกิดข้อผิดพลาด", "Error") });
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
          title: txt("ส่ง OTP ไม่สำเร็จ", "Failed to resend OTP"),
          description: data?.error || error?.message,
        });
      } else {
        setCountdown(60);
        toast({ title: txt("ส่ง OTP ใหม่แล้ว", "OTP resent") });
      }
    } catch {
      toast({ variant: "destructive", title: txt("เกิดข้อผิดพลาด", "Error") });
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
          {txt("เข้าสู่ระบบสำเร็จ!", "Login successful!")}
        </p>
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">
            {txt("ส่งรหัส OTP ไปที่", "OTP sent to")}
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
            {txt("กำลังตรวจสอบ...", "Verifying...")}
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
            {txt("เปลี่ยนเบอร์", "Change number")}
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={countdown > 0 || isLoading}
            className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          >
            {countdown > 0
              ? txt(`ส่งใหม่ใน ${countdown}s`, `Resend in ${countdown}s`)
              : txt("ส่งรหัสใหม่", "Resend code")}
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
          {txt("เบอร์โทรศัพท์", "Phone Number")}
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
          {txt("ระบบจะส่ง SMS พร้อมรหัส OTP 6 หลัก", "We'll send a 6-digit OTP via SMS")}
        </p>
      </div>

      <Button type="submit" variant="gradient" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Phone className="mr-2 h-4 w-4" />
        )}
        {isLoading
          ? txt("กำลังส่ง OTP...", "Sending OTP...")
          : txt("ส่งรหัส OTP", "Send OTP")}
      </Button>

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="w-full text-xs text-muted-foreground hover:text-foreground text-center"
        >
          {txt("เข้าสู่ระบบด้วย Email แทน", "Sign in with Email instead")}
        </button>
      )}
    </form>
  );
};

export default PhoneOtpLogin;
