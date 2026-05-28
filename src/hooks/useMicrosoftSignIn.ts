import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { buildAuthRedirectUrl } from "@/lib/authRedirect";

interface MicrosoftSignInOptions {
  redirectPath?: string | null;
  /** Azure tenant id, or 'common' for multi-tenant. Optional — Supabase
   *  Auth Azure provider config in the dashboard already has a default. */
  tenantId?: string;
}

export const useMicrosoftSignIn = () => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);

  const handleMicrosoftSignIn = async (opts: MicrosoftSignInOptions = {}) => {
    setIsMicrosoftLoading(true);
    const { redirectPath, tenantId } = opts;

    const callbackUrl = buildAuthRedirectUrl(redirectPath);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: callbackUrl,
        scopes: "email openid profile",
        // tenantId is passed to Azure via queryParams as `tenant`. If not
        // provided, Supabase uses the configured default in the dashboard.
        queryParams: tenantId ? { tenant: tenantId } : undefined,
      },
    });

    if (error) {
      toast({
        variant: "destructive",
        // Reuse the existing Google fail key — same UX, just for MS.
        title: t("authGoogleFailed"),
        description: error.message,
      });
      setIsMicrosoftLoading(false);
    }
  };

  return { handleMicrosoftSignIn, isMicrosoftLoading };
};
