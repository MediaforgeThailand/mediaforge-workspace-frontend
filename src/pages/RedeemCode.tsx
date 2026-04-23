import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Gift, Loader2, CheckCircle2, AlertCircle, ArrowRight, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
const REDEEM_CODE_PATTERN = /^MF-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const FORMATTED_REDEEM_CODE_LENGTH = 17;

interface RedeemResult {
  plan_name: string;
  billing_cycle: string;
  credits: number;
  plan_id: string;
  customer_email: string;
}

function normalizeRedeemCode(raw: string): string {
  return raw
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, "")
    .trim();
}

/** Format code with dashes while typing */
function formatCodeInput(raw: string): string {
  const normalized = normalizeRedeemCode(raw);

  if (normalized.startsWith("MF")) {
    const afterPrefix = normalized.replace(/^MF-?/, "").replace(/[^A-Z0-9]/g, "");
    const parts = afterPrefix.match(/.{1,4}/g) || [];
    return `MF-${parts.join("-").slice(0, 14)}`;
  }

  const clean = normalized.replace(/[^A-Z0-9]/g, "");
  const parts = clean.match(/.{1,4}/g) || [];
  return parts.join("-").slice(0, 14);
}

/** Friendly billing cycle display */
function formatBillingCycle(cycle: string, t: (key: any, params?: Record<string, string | number>) => string): string {
  if (cycle.includes("12") || cycle.includes("annual")) return t("redeemMonths", { n: 12 });
  if (cycle.includes("6")) return t("redeemMonths", { n: 6 });
  if (cycle.includes("3")) return t("redeemMonths", { n: 3 });
  return t("redeemMonths", { n: 1 });
}

export default function RedeemCode() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { toast } = useToast();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RedeemResult | null>(null);

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setCode(formatCodeInput(e.target.value));
  }, []);

  const handleRedeem = async () => {
    if (!user) return;

    const normalized = formatCodeInput(code);
    if (!REDEEM_CODE_PATTERN.test(normalized)) {
      setError(t("redeemInvalidFormat"));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call LOCAL edge function which bridges to ERP for validation
      // and grants credits on THIS database
      const { data: json, error: invokeError } = await supabase.functions.invoke("redeem-code", {
        body: {
          code: normalized,
          user_id: user.id,
          user_email: user.email,
        },
      });

      if (invokeError) {
        throw new Error(invokeError.message || t("redeemFailed"));
      }

      if (!json.success) {
        throw new Error(json.error || t("redeemFailed"));
      }

      const data = json.data as RedeemResult;
      setResult(data);

      toast({
        title: t("redeemSuccessToast"),
        description: t("redeemReceivedPkg", { plan: data.plan_name, credits: data.credits.toLocaleString() }),
      });

      // Hard reload after delay to ensure DB replica sync + global state refresh
      setTimeout(() => {
        window.location.href = "/app/home";
      }, 1500);
    } catch (err: any) {
      setError(err.message || t("redeemError"));
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <Card className="w-full max-w-md bg-card/60 backdrop-blur-xl border-border rounded-3xl shadow-2xl shadow-black/30">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground mb-1">{t("redeemSuccessTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("redeemSuccessDesc")}</p>
            </div>

            <div className="space-y-3 bg-muted/30 rounded-2xl p-5 text-left">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("redeemLabelPackage")}</span>
                <span className="text-sm font-semibold text-foreground flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  {result.plan_name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("redeemLabelDuration")}</span>
                <span className="text-sm font-semibold text-foreground">
                  {formatBillingCycle(result.billing_cycle, t)}
                </span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("redeemLabelCredits")}</span>
                <span className="text-lg font-bold text-[#d4ff00]">
                  +{result.credits.toLocaleString()}
                </span>
              </div>
            </div>

            <Button
              onClick={() => navigate("/app/home")}
              className="w-full rounded-xl h-11 font-semibold"
            >
              {t("redeemGoToDashboard")}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Card className="w-full max-w-md bg-card/60 backdrop-blur-xl border-border rounded-3xl shadow-2xl shadow-black/30">
        <CardContent className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-3">
              <Gift className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">{t("redeemTitle")}</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("redeemDesc")}
            </p>
          </div>

          <div className="space-y-2">
            <Input
              value={code}
              onChange={handleCodeChange}
              placeholder="MF-XXXX-XXXX-XXXX"
              className="text-center text-lg font-mono tracking-widest h-14 rounded-xl bg-muted/30 border-border focus:border-primary/50"
              maxLength={FORMATTED_REDEEM_CODE_LENGTH}
              disabled={loading}
              onKeyDown={(e) => e.key === "Enter" && handleRedeem()}
            />
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
          </div>

          <Button
            onClick={handleRedeem}
            disabled={loading || formatCodeInput(code).length < FORMATTED_REDEEM_CODE_LENGTH}
            className="w-full rounded-xl h-11 font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("redeemChecking")}
              </>
            ) : (
              t("redeemUseCode")
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            {t("redeemCodeExpiry")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
