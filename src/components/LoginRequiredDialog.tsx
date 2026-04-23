import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, MailCheck, ArrowLeft, Lock, Phone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import PhoneOtpLogin from "@/components/auth/PhoneOtpLogin";

interface LoginRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LoginRequiredDialog = ({ open, onOpenChange }: LoginRequiredDialogProps) => {
  const { signIn, signUp } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("login");
  const [showPhoneLogin, setShowPhoneLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    if (error) {
      toast({ variant: "destructive", title: t("authLoginFailed"), description: error.message });
      setIsLoading(false);
    } else {
      toast({ title: t("authWelcomeBack") });
      onOpenChange(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupName);
    if (error) {
      toast({ variant: "destructive", title: t("authSignupFailed"), description: error.message });
      setIsLoading(false);
    } else {
      setSentEmail(signupEmail);
      setEmailSent(true);
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    // Preserve current path so OAuth callback returns to where the user was
    const currentPath = window.location.pathname + window.location.search;
    const callbackUrl = currentPath && currentPath !== "/auth"
      ? `${window.location.origin}/auth?redirect=${encodeURIComponent(currentPath)}`
      : `${window.location.origin}/auth`;
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: callbackUrl,
    });
    if (error) {
      toast({ variant: "destructive", title: "Google Sign In Failed", description: error.message });
      setIsGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!loginEmail) {
      toast({ variant: "destructive", title: t("authEnterEmailTitle"), description: t("authEnterEmailDesc") });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ variant: "destructive", title: t("genericError"), description: error.message });
    } else {
      toast({ title: t("authEmailSentTitle"), description: t("authCheckEmailSimple") });
    }
  };

  const GoogleButton = () => (
    <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isGoogleLoading}>
      {isGoogleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (
        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
      )}
      Google
    </Button>
  );

  const PhoneButton = () => (
    <Button type="button" variant="outline" className="w-full" onClick={() => setShowPhoneLogin(true)}>
      <Phone className="mr-2 h-4 w-4" />
      Phone
    </Button>
  );

  const Divider = () => (
    <div className="relative">
      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
      <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">{t("authOr")}</span></div>
    </div>
  );

  const SocialButtons = () => (
    <div className="space-y-2">
      <GoogleButton />
      <PhoneButton />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md p-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl gradient-primary flex items-center justify-center">
            <Lock className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {t("authSignInToContinue")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("authFeatureRequiresAccount")}
            </p>
          </div>
        </div>

        <div className="px-6 pb-6">
          {emailSent ? (
            <div className="flex flex-col items-center text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <MailCheck className="w-8 h-8 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">{t("authCheckYourEmail")}</h3>
                <p className="text-xs text-muted-foreground">{sentEmail}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setEmailSent(false); setActiveTab("login"); }}>
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                {t("authBackToLogin")}
              </Button>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setShowPhoneLogin(false); }}>
              <TabsList className="grid w-full grid-cols-2 bg-muted">
                <TabsTrigger value="login">{t("authLoginTab")}</TabsTrigger>
                <TabsTrigger value="signup">{t("authSignupTab")}</TabsTrigger>
              </TabsList>

              {/* Email Login Tab */}
              <TabsContent value="login" className="space-y-4 mt-4">
                {showPhoneLogin ? (
                  <PhoneOtpLogin
                    onSuccess={() => onOpenChange(false)}
                    onBack={() => setShowPhoneLogin(false)}
                    compact
                  />
                ) : (
                  <>
                    <form onSubmit={handleLogin} className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="modal-email-login" className="text-xs">{t("authEmailLabel")}</Label>
                        <Input id="modal-email-login" type="email" placeholder="you@example.com" className="bg-input border-border h-9" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="modal-password-login" className="text-xs">{t("authPasswordLabel")}</Label>
                        <Input id="modal-password-login" type="password" placeholder="••••••••" className="bg-input border-border h-9" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
                        <button type="button" onClick={handleForgotPassword} className="text-xs text-primary hover:underline">
                          {t("authForgotPasswordLink")}
                        </button>
                      </div>
                      <Button type="submit" variant="gradient" className="w-full" disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {isLoading ? t("authSigningIn") : t("authSignInButton")}
                      </Button>
                    </form>
                    <Divider />
                    <SocialButtons />
                  </>
                )}
              </TabsContent>

              {/* Signup Tab */}
              <TabsContent value="signup" className="space-y-4 mt-4">
                {showPhoneLogin ? (
                  <PhoneOtpLogin
                    onSuccess={() => onOpenChange(false)}
                    onBack={() => setShowPhoneLogin(false)}
                    compact
                  />
                ) : (
                  <>
                    <form onSubmit={handleSignup} className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="modal-name-signup" className="text-xs">{t("authFullNameLabel")}</Label>
                        <Input id="modal-name-signup" type="text" placeholder={t("authFullNamePlaceholder")} className="bg-input border-border h-9" value={signupName} onChange={(e) => setSignupName(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="modal-email-signup" className="text-xs">{t("authEmailLabel")}</Label>
                        <Input id="modal-email-signup" type="email" placeholder="you@example.com" className="bg-input border-border h-9" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="modal-password-signup" className="text-xs">{t("authPasswordLabel")}</Label>
                        <Input id="modal-password-signup" type="password" placeholder="••••••••" className="bg-input border-border h-9" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required minLength={6} />
                      </div>
                      <Button type="submit" variant="gradient" className="w-full" disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {isLoading ? t("authCreatingAccount") : t("authCreateAccountButton")}
                      </Button>
                    </form>
                    <Divider />
                    <SocialButtons />
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoginRequiredDialog;
