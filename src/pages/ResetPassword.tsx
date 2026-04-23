import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Loader2, CheckCircle, KeyRound } from "lucide-react";
import logo from "@/assets/logo-white.png";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    // Also check hash for type=recovery
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast({ variant: "destructive", title: t("resetPasswordTooShortTitle"), description: t("resetPasswordTooShortDesc") });
      return;
    }

    if (password !== confirmPassword) {
      toast({ variant: "destructive", title: t("resetPasswordMismatchTitle"), description: t("resetPasswordMismatchDesc") });
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast({ variant: "destructive", title: t("resetPasswordFailedTitle"), description: error.message });
      setIsLoading(false);
    } else {
      setSuccess(true);
      toast({ title: t("resetPasswordSuccessTitle"), description: t("resetPasswordSuccessDesc") });
      setTimeout(() => navigate("/auth"), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 relative overflow-hidden bg-background">
      <div className="absolute inset-0 bg-[length:400%_400%] opacity-30 animate-[gradient-move_8s_ease_infinite]" style={{
        backgroundImage: 'linear-gradient(135deg, hsl(257 61% 47%), hsl(283 47% 45%), hsl(257 61% 55%), hsl(240 50% 35%), hsl(283 47% 45%))'
      }} />

      <div className="relative z-10 w-full max-w-md space-y-8">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="MediaForge" className="max-w-[160px] h-auto mb-6" />
          <KeyRound className="w-10 h-10 text-primary mb-3" />
          <h1 className="text-2xl font-bold text-foreground">{t("resetPasswordTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("resetPasswordSubtitle")}</p>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle className="w-12 h-12 text-primary" />
            <p className="text-foreground font-medium">{t("resetPasswordSuccessInline")}</p>
            <p className="text-sm text-muted-foreground">{t("resetPasswordRedirecting")}</p>
          </div>
        ) : !isRecovery ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">{t("resetPasswordInvalidLink")}</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/auth")}>
              {t("resetPasswordBackToLogin")}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">{t("resetPasswordNewLabel")}</Label>
              <Input id="new-password" type="password" placeholder="••••••••" className="bg-input border-border" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("resetPasswordConfirmLabel")}</Label>
              <Input id="confirm-password" type="password" placeholder="••••••••" className="bg-input border-border" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" variant="gradient" size="xl" className="w-full" disabled={isLoading}>
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("resetPasswordSaving")}</> : t("resetPasswordSaveBtn")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
