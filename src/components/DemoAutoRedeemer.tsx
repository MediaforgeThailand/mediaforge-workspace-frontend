import { useEffect, useRef } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  beginDemoRedemption,
  clearStoredDemoRedemption,
  endDemoRedemption,
  getStoredDemoRedemption,
  redeemDemoCredits,
} from "@/lib/demoRedemption";

const DemoAutoRedeemer = () => {
  const { refetch: refetchCredits } = useCredits();
  const { t } = useLanguage();
  const { toast } = useToast();
  const redeemingRef = useRef(false);
  const processedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Only redeem after a confirmed sign-in with a valid session
        if (event !== "SIGNED_IN" || !session?.user) return;
        if (redeemingRef.current) return;

        const { token, credits } = getStoredDemoRedemption();
        if (!token || processedTokenRef.current === token || !beginDemoRedemption(token)) return;

        redeemingRef.current = true;
        processedTokenRef.current = token;

        const user = session.user;

        (async () => {
          try {
            const result = await redeemDemoCredits({
              token,
              creditsHint: credits,
              userId: user.id,
              userEmail: user.email,
            });

            clearStoredDemoRedemption();

            toast({
              title: result.alreadyRedeemed ? t("demoAlreadyRedeemed") : t("demoAutoSuccess"),
              description: result.repairedLink
                ? t("demoRepairedLink")
                : t("demoAutoSuccessDesc", { credits: result.credits.toLocaleString() }),
            });

            refetchCredits();

            setTimeout(() => {
              window.location.href = "/app/home";
            }, 2000);
          } catch (error) {
            processedTokenRef.current = null;
            toast({
              variant: "destructive",
              title: t("demoAutoFailed"),
              description: error instanceof Error ? error.message : t("demoAutoError"),
            });
          } finally {
            redeemingRef.current = false;
            endDemoRedemption(token);
          }
        })();
      }
    );

    // Also check on mount if already signed in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user || redeemingRef.current) return;

      const { token, credits } = getStoredDemoRedemption();
      if (!token || processedTokenRef.current === token || !beginDemoRedemption(token)) return;

      redeemingRef.current = true;
      processedTokenRef.current = token;

      const user = session.user;

      (async () => {
        try {
          const result = await redeemDemoCredits({
            token,
            creditsHint: credits,
            userId: user.id,
            userEmail: user.email,
          });

          clearStoredDemoRedemption();

          toast({
            title: result.alreadyRedeemed ? t("demoAlreadyRedeemed") : t("demoAutoSuccess"),
            description: result.repairedLink
              ? t("demoRepairedLink")
              : t("demoAutoSuccessDesc", { credits: result.credits.toLocaleString() }),
          });

          refetchCredits();

          setTimeout(() => {
            window.location.href = "/app/home";
          }, 2000);
        } catch (error) {
          processedTokenRef.current = null;
          toast({
            variant: "destructive",
            title: t("demoAutoFailed"),
            description: error instanceof Error ? error.message : t("demoAutoError"),
          });
        } finally {
          redeemingRef.current = false;
          endDemoRedemption(token);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, [refetchCredits, toast]);

  return null;
};

export default DemoAutoRedeemer;
