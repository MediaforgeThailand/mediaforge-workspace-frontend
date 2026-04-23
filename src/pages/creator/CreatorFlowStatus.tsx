import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import FlowStatusBadge from "@/components/flow/FlowStatusBadge";
import FlowPricingCard from "@/components/FlowPricingCard";
import { Loader2, Send, Edit, MessageSquare, ChevronDown, ChevronUp, Clock, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { FlowStatus } from "@/types/flow";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface CreatorFlow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  category: string;
  base_cost: number;
  api_cost: number;
  selling_price: number;
  contribution_margin: number;
  creator_payout: number;
  performance_bonus_percent: number;
  updated_at: string;
}

export default function CreatorFlowStatus() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [flows, setFlows] = useState<CreatorFlow[]>([]);
  const [reviews, setReviews] = useState<Record<string, { reviewer_notes: string | null; decision: string; created_at: string; total_score: number | null }[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [timelineId, setTimelineId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase
        .from("flows")
        .select("id, name, description, status, category, base_cost, api_cost, selling_price, contribution_margin, creator_payout, performance_bonus_percent, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("flow_reviews")
        .select("flow_id, reviewer_notes, decision, created_at, total_score")
        .order("created_at", { ascending: false }),
    ]).then(([flowsRes, reviewsRes]) => {
      setFlows((flowsRes.data as CreatorFlow[]) || []);
      const grouped: Record<string, { reviewer_notes: string | null; decision: string; created_at: string; total_score: number | null }[]> = {};
      (reviewsRes.data || []).forEach((r: any) => {
        if (!grouped[r.flow_id]) grouped[r.flow_id] = [];
        grouped[r.flow_id].push(r);
      });
      setReviews(grouped);
      setLoading(false);
    });
  }, [user]);

  const handleRequestEdit = async (flowId: string) => {
    setSubmitting(flowId);
    try {
      const { error } = await supabase.from("flows").update({ status: "draft" }).eq("id", flowId).eq("user_id", user!.id);
      if (error) throw new Error(error.message);
      setFlows(flows.map((f) => (f.id === flowId ? { ...f, status: "draft" } : f)));
      toast({ title: t("flowSetToDraft"), description: t("flowSetToDraftDesc") });
      navigate(`/app/flow-studio/${flowId}`);
    } catch (err) {
      toast({ title: t("genericError"), description: err instanceof Error ? err.message : t("genericFailed"), variant: "destructive" });
    } finally {
      setSubmitting(null);
    }
  };

  const handleSubmit = async (flowId: string) => {
    setSubmitting(flowId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-flow-for-review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ flow_id: flowId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFlows(flows.map((f) => (f.id === flowId ? { ...f, status: "submitted" } : f)));
      toast({ title: t("flowSubmittedReview") });
    } catch (err) {
      toast({ title: t("genericError"), description: err instanceof Error ? err.message : t("genericFailed"), variant: "destructive" });
    } finally {
      setSubmitting(null);
    }
  };

  const totalEstimatedPayout = flows
    .filter((f) => ["approved", "published"].includes(f.status))
    .reduce((sum, f) => sum + f.creator_payout, 0);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t("myFlowsTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("myFlowsSubtitle")}</p>
        </div>
        {totalEstimatedPayout > 0 && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("estPayoutPerRun")}</p>
            <p className="text-xl font-bold text-emerald-400">{totalEstimatedPayout.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{t("creditsUnit")}</span></p>
          </div>
        )}
      </div>

      {flows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 py-16 text-center">
          <p className="text-sm text-muted-foreground">{t("noFlowsYet")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flows.map((flow, i) => {
            const canSubmit = ["draft", "changes_requested", "rejected"].includes(flow.status);
            const flowReviews = reviews[flow.id] || [];
            const latestReview = flowReviews[0];
            const isExpanded = expandedId === flow.id;
            const hasPricing = flow.api_cost > 0;

            return (
              <motion.div
                key={flow.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-2xl border border-border bg-card overflow-hidden"
              >
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-foreground truncate">{flow.name}</h3>
                        <FlowStatusBadge status={flow.status as FlowStatus} />
                      </div>
                      {flow.description && <p className="text-xs text-muted-foreground truncate">{flow.description}</p>}
                    </div>

                    <div className="flex gap-2 shrink-0 ml-4">
                      {flowReviews.length > 0 && (
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setTimelineId(timelineId === flow.id ? null : flow.id)}>
                          <History className="w-3 h-3" />
                          {flowReviews.length} {flowReviews.length !== 1 ? t("reviewsCount") : t("reviewSingular")}
                        </Button>
                      )}
                      {hasPricing && (
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setExpandedId(isExpanded ? null : flow.id)}>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {t("earningsLabel")}
                        </Button>
                      )}
                      {canSubmit && (
                        <Button variant="gradient" size="sm" onClick={() => handleSubmit(flow.id)} disabled={submitting === flow.id}>
                          {submitting === flow.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          {t("submitAction")}
                        </Button>
                      )}
                      {flow.status === "published" && (
                        <Button variant="outline" size="sm" onClick={() => handleRequestEdit(flow.id)} disabled={submitting === flow.id}>
                          <Edit className="w-3 h-3" /> {t("editReReview")}
                        </Button>
                      )}
                      {["draft", "changes_requested"].includes(flow.status) && (
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/app/flow-studio/${flow.id}`}>
                            <Edit className="w-3 h-3" /> {t("editAction")}
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>

                  {hasPricing && !isExpanded && (
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{t("priceColon")} <span className="text-foreground font-medium">{flow.selling_price}</span></span>
                      <span>•</span>
                      <span>{t("yourPayoutColon")} <span className="text-emerald-400 font-bold">{flow.creator_payout}</span> {t("creditsPerRun")}</span>
                    </div>
                  )}

                  {timelineId !== flow.id && latestReview?.reviewer_notes && (
                    <div className="flex gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10 text-xs">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-amber-400 font-medium capitalize">{latestReview.decision.replace("_", " ")}:</span>
                        <span className="text-muted-foreground ml-1">{latestReview.reviewer_notes}</span>
                      </div>
                    </div>
                  )}
                </div>

                {timelineId === flow.id && flowReviews.length > 0 && (
                  <div className="border-t border-border px-5 py-4">
                    <h4 className="text-xs font-semibold text-foreground mb-4 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-muted-foreground" />
                      {t("reviewHistoryTitle")}
                    </h4>
                    <div className="relative">
                      <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
                      <div className="space-y-4">
                        {flowReviews.map((r, ri) => {
                          const decisionColor =
                            r.decision === "approved" ? "bg-emerald-500 border-emerald-400" :
                            r.decision === "rejected" ? "bg-destructive border-destructive" :
                            r.decision === "changes_requested" ? "bg-amber-500 border-amber-400" :
                            "bg-muted-foreground border-muted";
                          const textColor =
                            r.decision === "approved" ? "text-emerald-400" :
                            r.decision === "rejected" ? "text-destructive" :
                            "text-amber-400";

                          return (
                            <div key={ri} className="relative pl-9">
                              <div className={`absolute left-1.5 top-1.5 w-3 h-3 rounded-full border-2 ${decisionColor}`} />
                              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs font-semibold capitalize ${textColor}`}>
                                      {r.decision.replace(/_/g, " ")}
                                    </span>
                                    {r.total_score != null && (
                                      <span className="text-[10px] text-muted-foreground">
                                        {t("scoreColon")} <span className="font-bold text-foreground">{r.total_score}/35</span>
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Clock className="w-3 h-3" />
                                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                                  </div>
                                </div>
                                {r.reviewer_notes && (
                                  <p className="text-xs text-foreground/80 leading-relaxed mt-1">{r.reviewer_notes}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {isExpanded && hasPricing && (
                  <div className="border-t border-border">
                    <FlowPricingCard
                      apiCost={flow.api_cost}
                      performanceBonusPercent={flow.performance_bonus_percent}
                      variant="creator"
                      className="border-0 rounded-none"
                    />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
