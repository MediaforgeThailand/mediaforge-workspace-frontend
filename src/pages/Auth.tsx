import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MailCheck, ArrowLeft, Phone } from "lucide-react";
import logo from "@/assets/logo-white.png";
import { supabase } from "@/integrations/supabase/client";
import { useOrgBranding } from "@/hooks/useOrgBranding";
import { useIsMobile } from "@/hooks/use-mobile";
import PhoneOtpLogin from "@/components/auth/PhoneOtpLogin";
import OrgLoginPanel from "@/components/auth/OrgLoginPanel";
import { resolveOrgLogin, type OrgLoginResolution } from "@/lib/orgLoginResolver";
import { useSearchParams } from "react-router-dom";

const PSC_DEMO_EMAIL = "dmd@psc.com";
const PSC_DEMO_PASSWORD = "123456";
const PSC_DEMO_SESSION_KEY = "mf_psc_demo_session";
const DEFAULT_POST_AUTH_PATH = "/app/workspace";

const normalizePostAuthPath = (path: string) => {
  // /app/university is a demo surface that should only be entered by
  // pressing the PSC sidebar button after login. Never make it the
  // automatic post-auth landing page.
  if (path === "/app/university" || path.startsWith("/app/university?")) {
    return DEFAULT_POST_AUTH_PATH;
  }
  return path;
};

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  // Tenant subdomain branding (e.g. dmd.mediaforge.co). When the user
  // lands on a claimed host we swap the MediaForge logo for the tenant
  // logo so they see "their" brand on sign-in. Falls back to MediaForge
  // when the host doesn't match any tenant.
  const branding = useOrgBranding();
  const {
    signIn,
    signUp,
    user
  } = useAuth();
  const {
    toast
  } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const [showPhoneLogin, setShowPhoneLogin] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  // Form states
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Org SSO detection — when an email's domain is registered to an org,
  // we replace the consumer login form with OrgLoginPanel (SSO only).
  const [orgEmail, setOrgEmail] = useState<string>("");
  const [orgResolution, setOrgResolution] = useState<OrgLoginResolution | null>(null);
  const [isResolvingOrg, setIsResolvingOrg] = useState(false);

  const checkOrgEmail = async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@") || !trimmed.includes(".")) return;
    if (orgEmail === trimmed && orgResolution) return; // already resolved
    setIsResolvingOrg(true);
    try {
      const result = await resolveOrgLogin(trimmed);
      setOrgEmail(trimmed);
      setOrgResolution(result);
    } finally {
      setIsResolvingOrg(false);
    }
  };

  const exitOrgPanel = () => {
    setOrgEmail("");
    setOrgResolution(null);
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    const redirectParam = searchParams.get("redirect");
    const callbackUrl = redirectParam
      ? `${window.location.origin}/auth?redirect=${encodeURIComponent(redirectParam)}`
      : `${window.location.origin}/auth`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
    if (error) {
      toast({
        variant: "destructive",
        title: "Google Sign In Failed",
        description: error.message,
      });
      setIsGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!loginEmail) {
      toast({ variant: "destructive", title: t("authEnterEmailTitle"), description: t("authEnterEmailDesc") });
      return;
    }
    setIsForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsForgotLoading(false);
    if (error) {
      toast({ variant: "destructive", title: t("authSendEmailFailed"), description: error.message });
    } else {
      toast({ title: t("authEmailSentTitle"), description: t("authEmailSentDesc") });
    }
  };

  /**
   * After successful sign-in we land on the workspace dashboard.
   * Two ways the caller can override that default:
   *   • `?redirect=/some/path` query param (legacy contract, used by
   *     direct deep-links into auth)
   *   • `location.state.from` set by `ProtectedRoute` when an
   *     unauthenticated user was bounced here from a protected page
   *     (the workspace canvas, account pages, etc.)
   *
   * The state-from path takes precedence — it's the direct
   * "remember where I was going" signal — and we fall back to the
   * query param then to the default. Same-origin path safety check
   * stops `redirect=//evil.com` style open-redirects.
   *
   * Wave 1 cleanup removed the consumer demo-redemption flow that
   * used to hijack this hook with token-handoff logic; the workspace
   * product doesn't grant credits via shareable links.
   */
  const resolveRedirect = () => {
    const fromState = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
    if (fromState?.pathname && fromState.pathname.startsWith("/") && !fromState.pathname.startsWith("//")) {
      return normalizePostAuthPath(`${fromState.pathname}${fromState.search ?? ""}`);
    }
    const r = searchParams.get("redirect");
    if (r && r.startsWith("/") && !r.startsWith("//")) return normalizePostAuthPath(r);
    return DEFAULT_POST_AUTH_PATH;
  };

  const handlePostAuthSuccess = () => {
    navigate(resolveRedirect(), { replace: true });
  };

  useEffect(() => {
    if (!user) return;
    navigate(resolveRedirect(), { replace: true });
    // resolveRedirect is stable for our purposes — only depends on
    // searchParams which the URL controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, user]);

  if (user) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginEmail.trim().toLowerCase() === PSC_DEMO_EMAIL && loginPassword === PSC_DEMO_PASSWORD) {
      try {
        localStorage.setItem(PSC_DEMO_SESSION_KEY, "1");
      } catch {
        // Ignore storage failures; this is only a local demo shortcut.
      }
      window.location.href = DEFAULT_POST_AUTH_PATH;
      return;
    }

    setIsLoading(true);
    const {
      error
    } = await signIn(loginEmail, loginPassword);
    if (error) {
      toast({
        variant: "destructive",
        title: t("authLoginFailed"),
        description: error.message
      });
    } else {
      toast({
        title: t("authWelcomeBack"),
        description: t("authWelcomeBackDesc")
      });
    }
    setIsLoading(false);
  };
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const {
      error
    } = await signUp(signupEmail, signupPassword, signupName);
    if (error) {
      toast({
        variant: "destructive",
        title: t("authSignupFailed"),
        description: error.message
      });
      setIsLoading(false);
    } else {
      setSentEmail(signupEmail);
      setEmailSent(true);
      setIsLoading(false);
    }
  };
  return <div className="min-h-screen flex">
      {/* Left Side - Logo with Animated Gradient */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-[length:400%_400%] animate-[gradient-move_8s_ease_infinite]" style={{
        backgroundImage: 'linear-gradient(135deg, hsl(257 61% 47%), hsl(283 47% 45%), hsl(257 61% 55%), hsl(240 50% 35%), hsl(283 47% 45%))'
      }} />
        {/* Floating orbs */}
        <div className="absolute w-72 h-72 rounded-full bg-white/10 blur-3xl animate-[float1_6s_ease-in-out_infinite] top-[10%] left-[10%]" />
        <div className="absolute w-56 h-56 rounded-full bg-fuchsia-400/15 blur-3xl animate-[float2_8s_ease-in-out_infinite] bottom-[15%] right-[10%]" />
        <div className="absolute w-40 h-40 rounded-full bg-violet-300/10 blur-2xl animate-[float3_7s_ease-in-out_infinite] top-[50%] left-[50%]" />
        {/* Logo — swaps to tenant brand on claimed subdomains. */}
        {branding?.logoUrl ? (
          <div className="relative z-10 flex flex-col items-center gap-4">
            <img
              src={branding.logoUrl}
              alt={branding.displayName}
              className="max-w-[45%] h-auto drop-shadow-2xl object-contain"
            />
            <div className="text-white/90 text-2xl font-semibold tracking-tight">
              {branding.shortName}
            </div>
          </div>
        ) : (
          <img src={logo} alt="MediaForge" className="relative z-10 max-w-[45%] h-auto drop-shadow-2xl" />
        )}
      </div>

      {/* Right Side - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative overflow-hidden bg-background">
        {/* Mobile/Tablet gradient background */}
        <div className="lg:hidden absolute inset-0 bg-[length:400%_400%] opacity-40 animate-[gradient-move_8s_ease_infinite]" style={{
          backgroundImage: 'linear-gradient(135deg, hsl(257 61% 47%), hsl(283 47% 45%), hsl(257 61% 55%), hsl(240 50% 35%), hsl(283 47% 45%))'
        }} />
        <div className="lg:hidden absolute w-72 h-72 rounded-full bg-white/10 blur-3xl animate-[float1_6s_ease-in-out_infinite] top-[10%] left-[10%]" />
        <div className="lg:hidden absolute w-56 h-56 rounded-full bg-fuchsia-400/15 blur-3xl animate-[float2_8s_ease-in-out_infinite] bottom-[15%] right-[10%]" />
        <div className="relative z-10 w-full max-w-md space-y-8">
          {/* Mobile Logo — same tenant override as the desktop hero. */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            {branding?.logoUrl ? (
              <>
                <img
                  src={branding.logoUrl}
                  alt={branding.displayName}
                  className="max-w-[120px] h-auto mb-2 object-contain"
                />
                <div className="text-foreground text-lg font-semibold tracking-tight">
                  {branding.shortName}
                </div>
              </>
            ) : (
              <img src={logo} alt="MediaForge" className="max-w-[160px] h-auto mb-4" />
            )}
          </div>

          {/* Email Verification Screen */}
          {emailSent ? (
            <div className="flex flex-col items-center text-center space-y-6 py-8">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <MailCheck className="w-10 h-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">{t("authCheckYourEmail")}</h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {t("authVerificationLinkSent")}
                </p>
                <p className="text-sm font-semibold text-foreground">{sentEmail}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-muted/30 p-4 max-w-xs space-y-2">
                <p className="text-xs text-muted-foreground">
                  {t("authClickLinkInstruction")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("authNotSeeingEmail")}
                </p>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setEmailSent(false);
                  setActiveTab("login");
                }}
              >
                <ArrowLeft className="w-4 h-4" />
                {t("authBackToLogin")}
              </Button>
            </div>
          ) : (
          <>
          <div className="text-center lg:text-left">
          </div>

           {orgResolution && orgResolution.is_org ? (
             <OrgLoginPanel
               email={orgEmail}
               resolution={orgResolution}
               redirectPath={searchParams.get("redirect")}
               onBack={exitOrgPanel}
             />
           ) : (
           <>
           {isResolvingOrg && (
             <div className="text-center text-xs text-muted-foreground">
               <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
               Checking organisation…
             </div>
           )}
           <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-muted">
              <TabsTrigger value="login">{t("authLoginTab")}</TabsTrigger>
              <TabsTrigger value="signup">{t("authSignupTab")}</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-6 mt-6">
              {showPhoneLogin ? (
                <PhoneOtpLogin
                  onSuccess={handlePostAuthSuccess}
                  onBack={() => setShowPhoneLogin(false)}
                />
              ) : (
                <>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email-login">{t("authEmailLabel")}</Label>
                      <Input id="email-login" type="email" placeholder="you@example.com" className="bg-input border-border" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password-login">{t("authPasswordLabel")}</Label>
                      <Input id="password-login" type="password" placeholder="••••••••" className="bg-input border-border" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
                      <button type="button" onClick={handleForgotPassword} disabled={isForgotLoading} className="text-xs text-primary hover:underline mt-1 disabled:opacity-50">
                        {isForgotLoading ? t("authForgotSending") : t("authForgotPasswordLink")}
                      </button>
                    </div>
                    <Button type="submit" variant="gradient" size="xl" className="w-full" disabled={isLoading}>
                      {isLoading ? <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("authSigningIn")}
                      </> : t("authSignInButton")}
                    </Button>
                  </form>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        {t("authOrContinueWith")}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isGoogleLoading}>
                      {isGoogleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>}
                      {t("authContinueWithGoogle")}
                    </Button>
                    <Button type="button" variant="outline" className="w-full" onClick={() => setShowPhoneLogin(true)}>
                      <Phone className="mr-2 h-4 w-4" />
                      {t("authContinueWithPhone")}
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="signup" className="space-y-6 mt-6">
              {showPhoneLogin ? (
                <PhoneOtpLogin
                  onSuccess={handlePostAuthSuccess}
                  onBack={() => setShowPhoneLogin(false)}
                />
              ) : (
                <>
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name-signup">{t("authFullNameLabel")}</Label>
                      <Input id="name-signup" type="text" placeholder={t("authFullNamePlaceholder")} className="bg-input border-border" value={signupName} onChange={e => setSignupName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email-signup">{t("authEmailLabel")}</Label>
                      <Input id="email-signup" type="email" placeholder="you@example.com" className="bg-input border-border" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password-signup">{t("authPasswordLabel")}</Label>
                      <Input id="password-signup" type="password" placeholder="••••••••" className="bg-input border-border" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} required minLength={6} />
                    </div>
                    <Button type="submit" variant="gradient" size="xl" className="w-full" disabled={isLoading}>
                      {isLoading ? <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("authCreatingAccount")}
                      </> : t("authCreateAccountButton")}
                    </Button>
                  </form>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        {t("authOrContinueWith")}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isGoogleLoading}>
                      {isGoogleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>}
                      {t("authContinueWithGoogle")}
                    </Button>
                    <Button type="button" variant="outline" className="w-full" onClick={() => setShowPhoneLogin(true)}>
                      <Phone className="mr-2 h-4 w-4" />
                      {t("authContinueWithPhone")}
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
          </>
           )}

          <p className="text-center text-sm text-muted-foreground">
            {t("authTermsText")}{" "}
            <a href="#" className="text-primary hover:underline">
              {t("authTermsOfService")}
            </a>{" "}
            {t("authAnd")}{" "}
            <a href="#" className="text-primary hover:underline">
              {t("authPrivacyPolicy")}
            </a>
          </p>
          </>
          )}
        </div>
      </div>
    </div>;
};
export default Auth;
