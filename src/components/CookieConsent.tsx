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
    try { posthog.capture("cookie_consent_declined"); } catch {}
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
          className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-lg rounded-2xl border border-border/50 bg-card/95 p-5 shadow-2xl backdrop-blur-xl sm:left-6 sm:right-auto"
        >
          <button onClick={decline} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3">
            <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">{t("cookieTitle" as any)}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("cookieDesc" as any)}{" "}
                <Link to="/privacy" className="underline hover:text-foreground">
                  {t("landingFooterPrivacy")}
                </Link>
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="gradient" size="sm" onClick={accept}>
                  {t("cookieAccept" as any)}
                </Button>
                <Button variant="ghost" size="sm" onClick={decline}>
                  {t("cookieDecline" as any)}
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
