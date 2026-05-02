import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Cookie, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";
import { upgradePostHogConsent, posthog } from "@/lib/posthog";

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const consent = localStorage.getItem("mf-cookie-consent");
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    localStorage.setItem("mf-cookie-consent", "accepted");
    upgradePostHogConsent();
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem("mf-cookie-consent", "declined");
    // One-shot capture before declining (PostHog may not be initialized yet, this is best-effort)
    try {
      posthog.capture("cookie_consent_declined");
    } catch (error) {
      if (import.meta.env.DEV) console.debug("[cookie-consent] decline capture failed", error);
    }
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-3 left-3 right-3 z-[100] mx-auto max-w-sm rounded-xl border border-border/50 bg-card/95 p-[14px] shadow-2xl backdrop-blur-xl sm:left-5 sm:right-auto"
        >
          <button onClick={decline} className="absolute right-[10px] top-[10px] text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-[10px] pr-[18px]">
            <Cookie className="mt-[2px] h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-[13px] font-semibold leading-[18px] text-foreground">{t("cookieTitle")}</p>
              <p className="mt-[4px] text-[11.5px] leading-[17px] text-muted-foreground">
                {t("cookieDesc")}{" "}
                <Link to="/privacy" className="underline hover:text-foreground">
                  {t("landingFooterPrivacy")}
                </Link>
                {" · "}
                <Link to="/cookies" className="underline hover:text-foreground">
                  {t("cookieManageLink")}
                </Link>
              </p>
              <div className="mt-[10px] flex gap-[8px]">
                <Button variant="gradient" size="sm" onClick={accept} className="h-[30px] px-[12px] text-[12px] leading-[16px]">
                  {t("cookieAccept")}
                </Button>
                <Button variant="ghost" size="sm" onClick={decline} className="h-[30px] px-[12px] text-[12px] leading-[16px]">
                  {t("cookieDecline")}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CookieConsent;
