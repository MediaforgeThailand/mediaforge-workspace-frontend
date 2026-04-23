import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Loader2, Gift, AlertCircle, CheckCircle2 } from "lucide-react";
import logo from "@/assets/logo-white.png";
import {
  beginDemoRedemption,
  clearStoredDemoRedemption,
  endDemoRedemption,
  redeemDemoCredits,
} from "@/lib/demoRedemption";

type Status = "idle" | "loading" | "success" | "error";

const DemoLanding = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const token = searchParams.get("token");
  const credits = searchParams.get("credits");

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [grantedCredits, setGrantedCredits] = useState<number>(0);

  useEffect(() => {
    if (authLoading || !token || !user) return;

    if (!beginDemoRedemption(token)) {
      setStatus("loading");
      return;
    }

    const redeem = async () => {
      setStatus("loading");
      try {
        const result = await redeemDemoCredits({
          token,
          userId: user.id,
          userEmail: user.email,
          creditsHint: credits,
        });

        setGrantedCredits(result.credits);
        setStatus("success");
        clearStoredDemoRedemption();

        setTimeout(() => {
          window.location.href = "/app/home";
        }, 2000);
      } catch (error) {
        setStatus("error");
        setErrorMsg(error instanceof Error ? error.message : t("demoServerError"));
      } finally {
        endDemoRedemption(token);
      }
    };

    redeem();
  }, [authLoading, credits, token, user]);

  if (!token) {
    return (
      <CenterLayout>
        <AlertCircle className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">{t("demoInvalidLink")}</h1>
        <p className="text-muted-foreground mb-6">{t("demoCheckLink")}</p>
        <Button variant="outline" onClick={() => navigate("/")}>{t("demoBackHome")}</Button>
      </CenterLayout>
    );
  }

  if (authLoading) {
    return (
      <CenterLayout>
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </CenterLayout>
    );
  }

  if (!user) {
    const handleSignup = () => {
      localStorage.setItem("demo_token", token);
      if (credits) localStorage.setItem("demo_credits", credits);
      navigate("/auth");
    };

    return (
      <CenterLayout>
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <Gift className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-3">
          {t("demoWelcome")}
        </h1>
        <p className="text-lg text-muted-foreground mb-2">
          {t("demoTrialAccess")}
        </p>
        {credits && (
          <div className="text-4xl font-bold text-primary mb-6">
            {t("demoCredits", { credits: Number(credits).toLocaleString() })}
          </div>
        )}
        <p className="text-sm text-muted-foreground mb-8 max-w-sm text-center">
          {t("demoSignupPrompt")}
        </p>
        <Button variant="gradient" size="xl" onClick={handleSignup} className="min-w-[280px]">
          {t("demoSignupBtn")}
        </Button>
        <Button variant="ghost" className="mt-3" onClick={handleSignup}>
          {t("demoLoginLink")}
        </Button>
      </CenterLayout>
    );
  }

  if (status === "loading") {
    return (
      <CenterLayout>
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-lg text-muted-foreground">{t("demoGranting")}</p>
      </CenterLayout>
    );
  }

  if (status === "success") {
    return (
      <CenterLayout>
        <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-3">{t("demoSuccess")}</h1>
        <p className="text-lg text-muted-foreground mb-2">
          {t("demoReceived", { credits: grantedCredits.toLocaleString() })}
        </p>
        <p className="text-sm text-muted-foreground">{t("demoRedirecting")}</p>
      </CenterLayout>
    );
  }

  if (status === "error") {
    return (
      <CenterLayout>
        <AlertCircle className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">{t("demoGrantFailed")}</h1>
        <p className="text-muted-foreground mb-6">{errorMsg}</p>
        <Button variant="outline" onClick={() => navigate("/app/home")}>{t("demoGoHome")}</Button>
      </CenterLayout>
    );
  }

  return null;
};

const CenterLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden px-4">
    <div className="absolute inset-0 bg-[length:400%_400%] opacity-20 animate-[gradient-move_8s_ease_infinite]" style={{
      backgroundImage: 'linear-gradient(135deg, hsl(257 61% 47%), hsl(283 47% 45%), hsl(257 61% 55%), hsl(240 50% 35%))'
    }} />
    <div className="absolute w-72 h-72 rounded-full bg-primary/10 blur-3xl top-[10%] left-[20%]" />
    <div className="absolute w-56 h-56 rounded-full bg-fuchsia-400/10 blur-3xl bottom-[15%] right-[15%]" />
    <div className="relative z-10 flex flex-col items-center text-center">
      <img src={logo} alt="MediaForge" className="w-36 mb-8 drop-shadow-lg" />
      {children}
    </div>
  </div>
);

export default DemoLanding;
