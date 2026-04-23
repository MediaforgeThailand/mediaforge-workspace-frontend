import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { FileStack, Plus, Loader2, ExternalLink } from "lucide-react";

const MotionLink = motion.create(Link);

interface PublishedFlow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  category: string;
  updated_at: string;
}

const PublishedFlows = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [flows, setFlows] = useState<PublishedFlow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("flows")
      .select("id, name, description, status, category, updated_at")
      .eq("user_id", user.id)
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        setFlows(data || []);
        setLoading(false);
      });
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{t("publishedFlowsTitle")}</h1>
          <p className="text-sm text-slate-400 mt-1">{t("publishedFlowsSubtitle")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-white/10 text-slate-200"
          onClick={() => navigate("/creator/studio")}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          {t("publishedFlowsNewFlow")}
        </Button>
      </div>

      {flows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] py-16 text-center">
          <FileStack className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">{t("publishedFlowsEmpty")}</p>
          <p className="text-xs text-slate-500 mt-1">{t("publishedFlowsEmptyDesc")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flows.map((flow, i) => (
            <MotionLink
              key={flow.id}
              to={`/app/flow-studio/${flow.id}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-5 flex items-center justify-between hover:border-primary/20 transition-all cursor-pointer group"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-slate-100 truncate">{flow.name}</h3>
                  <Badge variant="secondary" className="text-[9px] bg-primary/10 border-0 text-primary">{flow.category}</Badge>
                </div>
                {flow.description && (
                  <p className="text-xs text-slate-400 truncate">{flow.description}</p>
                )}
              </div>
              <ExternalLink className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors shrink-0 ml-4" />
            </MotionLink>
          ))}
        </div>
      )}
    </div>
  );
};

export default PublishedFlows;
