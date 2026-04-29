import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

export const useGoogleSignIn = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleSignIn = async (
    redirectPath?: string | null,
    /** Optional Google Workspace `hd` (hosted domain) hint. When set,
     *  Google restricts the consent screen to accounts in that domain —
     *  used by org login to lock the SSO to e.g. `silpakorn.ac.th`. */
    hdHint?: string | null,
  ) => {
    setIsGoogleLoading(true);
    const callbackUrl =
      redirectPath && redirectPath.startsWith("/") && redirectPath !== "/auth"
        ? `${window.location.origin}/auth?redirect=${encodeURIComponent(redirectPath)}`
        : `${window.location.origin}/auth`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
        queryParams: hdHint ? { hd: hdHint } : undefined,
      },
    });
    if (error) {
      toast({
        variant: "destructive",
        title: t("authGoogleFailed"),
        description: error.message,
      });
      setIsGoogleLoading(false);
    }
  };

  return { handleGoogleSignIn, isGoogleLoading };
};
