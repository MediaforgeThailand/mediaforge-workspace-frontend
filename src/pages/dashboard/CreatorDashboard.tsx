import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Rocket,
  ArrowUpRight,
  Loader2,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";

interface CreatorStats {
  total_flows: number;
  total_uses: number;
  total_credits_earned: number;
  avg_rating: number;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

const CreatorDashboard = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [publishedFlowCount, setPublishedFlowCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const [statsRes, flowCountRes] = await Promise.all([
        supabase.rpc("get_my_creator_stats").maybeSingle(),
        supabase.from("flows").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "published"),
      ]);

      if (statsRes.data) setStats(statsRes.data as any);
      else setStats({ total_flows: 0, total_uses: 0, total_credits_earned: 0, avg_rating: 0 });

      setPublishedFlowCount(flowCountRes.count || 0);
      setLoading(false);
    };

    fetchData();
  }, [user, profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-5xl mx-auto pb-12"
    >
      {/* ═══ Header ═══ */}
      <motion.div variants={item}>
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-primary via-accent to-pink-500 bg-clip-text text-transparent">
            {t("creatorDashboardTitle")}
          </span>
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("creatorDashboardSubtitle")}
        </p>
      </motion.div>

      {/* ═══ Creator Status ═══ */}
      <motion.div
        variants={item}
        className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-2xl p-6"
      >
        {/* Ambient glow */}
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-primary/8 blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {t("creatorOverview")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("creatorStatusQuota")}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
              {t("creatorActive")}
            </Badge>
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: t("creatorTotalFlows"), value: stats?.total_flows ?? 0, icon: Sparkles },
              { label: t("creatorPublished"), value: publishedFlowCount, icon: Sparkles },
              { label: t("creatorTotalUses"), value: stats?.total_uses ?? 0, icon: Users },
              { label: t("creatorCreditsEarned"), value: stats?.total_credits_earned ?? 0, icon: Zap },
            ].map((s) => (
              <div key={s.label} className="text-center rounded-xl bg-white/[0.03] border border-white/[0.06] py-3 px-2">
                <s.icon className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-bold tabular-nums text-foreground">{s.value.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="flex gap-3 mt-5">
            <Button
              size="sm"
              className="bg-gradient-to-r from-primary to-accent text-white border-0 shadow-lg shadow-primary/25"
              onClick={() => navigate("/creator/studio")}
            >
              <ArrowUpRight className="w-4 h-4 mr-1.5" />
              {t("creatorOpenStudio")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 text-foreground"
              onClick={() => navigate("/creator/flows")}
            >
              {t("creatorViewFlows")}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default CreatorDashboard;
