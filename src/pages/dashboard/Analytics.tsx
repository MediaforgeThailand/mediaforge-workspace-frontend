import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Coins, TrendingUp, Video, Zap, Loader2, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { useLanguage } from "@/contexts/LanguageContext";

const FEATURE_KEYS: Record<string, string> = {
  generate_image: "featureImageGen",
  generate_video: "featureVideoGen",
  generate_tts: "featureTTS",
  text_to_speech: "featureTTS",
  remove_background: "featureRemoveBg",
  upscale_image: "featureUpscale",
  reimagine: "featureReimagine",
  image_expand: "featureExpand",
  image_to_prompt: "featureImgToPrompt",
  improve_prompt: "featureImprovePrompt",
  sound_effects: "featureSoundFx",
  audio_isolation: "featureAudioIsolate",
  skin_enhancer: "featureSkinEnhance",
  inpaint_image: "featureInpaint",
  relight_image: "featureRelight",
  style_transfer: "featureStyleTransfer",
  change_camera: "featureCameraChange",
  generate_icon: "featureIconGen",
  generate_variations: "featureVariations",
  mockup_generator: "featureMockup",
  lip_sync: "featureLipSync",
};

interface RawTx {
  amount: number;
  feature: string | null;
  created_at: string;
  type: string;
}

const Analytics = () => {
  const { user } = useAuth();
  const { credits } = useCredits();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [totalFlowRuns, setTotalFlowRuns] = useState(0);
  const [totalVideos, setTotalVideos] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [usageTxs, setUsageTxs] = useState<RawTx[]>([]);

  useEffect(() => { if (user) fetchAll(); }, [user]);

  const fetchAll = async () => {
    setLoading(true);
    const [flowRunsRes, txRes, payRes] = await Promise.all([
      supabase.from("flow_runs").select("id", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("credit_transactions").select("amount, created_at, feature, type").eq("type", "usage").order("created_at"),
      supabase.from("payment_transactions").select("amount_thb").eq("status", "completed"),
    ]);
    setTotalFlowRuns(flowRunsRes.count ?? 0);
    setTotalVideos(txRes.data?.filter(tx => tx.feature?.includes("video")).length ?? 0);
    setTotalSpent(payRes.data?.reduce((s, p) => s + Number(p.amount_thb), 0) ?? 0);
    setUsageTxs((txRes.data || []) as RawTx[]);
    setLoading(false);
  };

  const toolBreakdown = useMemo(() => {
    const txs = usageTxs.filter(tx => tx.feature && !tx.feature.includes("_refund"));
    const toolMap: Record<string, number> = {};
    txs.forEach(tx => {
      const key = tx.feature || "other";
      toolMap[key] = (toolMap[key] || 0) + Math.abs(tx.amount);
    });
    return Object.entries(toolMap)
      .map(([feature, credits]) => {
        const key = FEATURE_KEYS[feature];
        return {
          feature,
          label: key ? t(key as Parameters<typeof t>[0]) : feature,
          credits,
        };
      })
      .sort((a, b) => b.credits - a.credits);
  }, [usageTxs, t]);

  const totalCreditsUsed = useMemo(() =>
    toolBreakdown.reduce((sum, item) => sum + item.credits, 0)
  , [toolBreakdown]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const statCards = [
    { label: t("creditBalance"), value: credits?.balance ?? 0, icon: Coins, color: "text-foreground" },
    { label: t("totalSpent"), value: `฿${totalSpent.toLocaleString()}`, icon: TrendingUp, color: "text-foreground" },
    { label: t("analyticsFlowRuns"), value: totalFlowRuns, icon: Zap, color: "text-foreground" },
    { label: t("videosGenerated"), value: totalVideos, icon: Video, color: "text-foreground" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold gradient-text">{t("analytics")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("analyticsDesc")}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="bg-card/60 backdrop-blur-xl border-border rounded-2xl shadow-xl shadow-black/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{typeof s.value === "number" ? s.value.toLocaleString() : s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Usage by Tool — simple list */}
      <Card className="bg-card/60 backdrop-blur-xl border-border rounded-2xl shadow-xl shadow-black/20">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            {t("analyticsUsageByTool")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {toolBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("analyticsNoUsageData")}</p>
          ) : (
            <div className="space-y-3">
              {toolBreakdown.map((item) => {
                const pct = totalCreditsUsed > 0 ? Math.round((item.credits / totalCreditsUsed) * 100) : 0;
                return (
                  <div key={item.feature} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/50">
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                      <span className="text-sm font-bold text-foreground tabular-nums w-20 text-right">{item.credits.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-sm font-semibold text-foreground">{t("analyticsTotal")}</span>
                <span className="text-sm font-bold text-primary tabular-nums">{totalCreditsUsed.toLocaleString()} {t("creditsUnit")}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Summary */}
      <Card className="bg-card/60 backdrop-blur-xl border-border rounded-2xl shadow-xl shadow-black/20">
        <CardHeader><CardTitle className="text-lg">{t("activitySummary")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/30 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-foreground">{totalFlowRuns}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("analyticsFlowRuns")}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-primary">{credits?.total_used ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("creditsUsed")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Analytics;
