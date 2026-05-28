import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";
import { useMicrosoftSignIn } from "@/hooks/useMicrosoftSignIn";
import type { OrgLoginResolution } from "@/lib/orgLoginResolver";
import { buildAuthRedirectUrl } from "@/lib/authRedirect";

type OrgResolution = Extract<OrgLoginResolution, { is_org: true }>;

interface Props {
  email: string;
  resolution: OrgResolution;
  redirectPath?: string | null;
  onBack: () => void;
}

/**
 * Step 2 of the auth flow when the user's email belongs to an org.
 * Renders ONLY the SSO providers configured for that org — never password,
 * consumer Google, LINE, or phone OTP. Optional email-OTP fallback if the
 * org allows it.
 */
export default function OrgLoginPanel({ email, resolution, redirectPath, onBack }: Props) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { handleGoogleSignIn, isGoogleLoading } = useGoogleSignIn();
  const { handleMicrosoftSignIn, isMicrosoftLoading } = useMicrosoftSignIn();
  const [isOtpSending, setIsOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const { org, providers } = resolution;
  const googleProvider = providers.find((p) => p.provider === "google_workspace");
  const microsoftProvider = providers.find((p) => p.provider === "microsoft_entra");
  const otpProvider = providers.find((p) => p.provider === "email_otp");

  const onGoogle = () => {
    const hd = (googleProvider?.config?.hd_hint as string | undefined) ?? undefined;
    handleGoogleSignIn(redirectPath, hd);
  };

  const onMicrosoft = () => {
    const tenant = (microsoftProvider?.config?.tenant_id as string | undefined) ?? undefined;
    handleMicrosoftSignIn({ redirectPath, tenantId: tenant });
  };

  const onSendOtp = async () => {
    setIsOtpSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: buildAuthRedirectUrl(redirectPath),
      },
    });
    setIsOtpSending(false);
    if (error) {
      toast({
        variant: "destructive",
        title: t("authSendEmailFailed"),
        description: error.message,
      });
    } else {
      setOtpSent(true);
      toast({
        title: t("authEmailSentTitle"),
        description: t("authEmailSentDesc"),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Org branding */}
      <div className="flex flex-col items-center text-center space-y-3">
        {org.logo_url ? (
          <img
            src={org.logo_url}
            alt={org.name}
            className="h-14 w-auto rounded"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("orgLogin.signInTo")}
          </p>
          <h2 className="text-xl font-semibold text-foreground">{org.name}</h2>
          <p className="text-xs text-muted-foreground mt-1">{email}</p>
        </div>
      </div>

      {/* Per the infographic, OTP is the primary path students recognise.
          SSO buttons follow underneath, conditional on org config. */}
      <div className="space-y-2">
        {otpProvider && !otpSent && (
          <Button
            type="button"
            variant="default"
            className="w-full"
            onClick={onSendOtp}
            disabled={isOtpSending}
          >
            {isOtpSending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            {t("orgLogin.sendSignInLink", { email })}
          </Button>
        )}

        {otpSent && (
          <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-center text-sm text-green-300">
            {t("orgLogin.checkInboxPrefix")} <span className="font-medium">{email}</span> {t("orgLogin.checkInboxSuffix")}
          </div>
        )}

        {(googleProvider || microsoftProvider) && otpProvider && (
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/40" /></div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
              <span className="bg-background px-2 text-muted-foreground">{t("orgLogin.orUseSso")}</span>
            </div>
          </div>
        )}

        {googleProvider && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onGoogle}
            disabled={isGoogleLoading}
          >
            {isGoogleLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            {t("orgLogin.continueGoogleWorkspace")}
          </Button>
        )}

        {microsoftProvider && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onMicrosoft}
            disabled={isMicrosoftLoading}
          >
            {isMicrosoftLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <svg className="mr-2 h-4 w-4" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
                <rect x="1"  y="1"  width="10" height="10" fill="#F25022" />
                <rect x="12" y="1"  width="10" height="10" fill="#7FBA00" />
                <rect x="1"  y="12" width="10" height="10" fill="#00A4EF" />
                <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
              </svg>
            )}
            {t("orgLogin.continueMicrosoft")}
          </Button>
        )}
      </div>

      {/* Back to email entry */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={onBack}
      >
        <ArrowLeft className="mr-2 h-3 w-3" />
        {t("orgLogin.useDifferentEmail")}
      </Button>
    </div>
  );
}
