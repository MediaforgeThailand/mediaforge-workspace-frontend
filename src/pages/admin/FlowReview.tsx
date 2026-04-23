import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import ScoringRubricForm, { type RubricScores } from "@/components/admin/ScoringRubricForm";
import ReviewDecisionActions from "@/components/admin/ReviewDecisionActions";
import FlowPricingCard from "@/components/FlowPricingCard";
import ReadOnlyFlowCanvas from "@/components/admin/ReadOnlyFlowCanvas";
import FlowStatusBadge from "@/components/flow/FlowStatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Award, Clock, Lock } from "lucide-react";
import type { FlowStatus, ReviewDecision, FlowReviewData } from "@/types/admin";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

const BADGES = ["official_flow", "top_performing", "enterprise_ready"] as const;

export default function FlowReview() {
  const { flowId } = useParams();
  const navigate = useNavigate();
  const { adminFetch } = useAdminAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [flow, setFlow] = useState<Record<string, unknown> | null>(null);
  const [nodes, setNodes] = useState<unknown[]>([]);
  const [reviews, setReviews] = useState<FlowReviewData[]>([]);
  const [badges, setBadges] = useState<{ badge: string }[]>([]);

  const [scores, setScores] = useState<RubricScores>({
    output_quality: 0, consistency: 0, commercial_usability: 0,
    originality: 0, efficiency: 0, workflow_clarity: 0, safety: 0,
  });
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  useEffect(() => {
    if (!flowId) return;
    adminFetch("get_flow_detail", { flow_id: flowId })
      .then((data: unknown) => {
        const d = data as { flow: Record<string, unknown>; nodes: unknown[]; reviews: FlowReviewData[]; badges: { badge: string }[] };
        setFlow(d.flow);
        setNodes(d.nodes);
        setReviews(d.reviews);
        setBadges(d.badges);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [flowId, adminFetch]);

  const handleDecision = async (decision: ReviewDecision) => {
    if (!flowId) return;
    setSubmitting(true);
    try {
      await adminFetch("submit_review", {
        flow_id: flowId, ...scores, decision,
        reviewer_notes: notes, internal_notes: internalNotes,
      });
      const decisionLabel =
        decision === "approved" ? t("adminApprove") :
        decision === "rejected" ? t("adminReject") :
        t("adminRequestChanges");
      toast({ title: t("adminReviewSubmitted"), description: decisionLabel });
      navigate("/admin/review-queue");
    } catch (err) {
      toast({ title: t("genericError"), description: err instanceof Error ? err.message : t("genericFailed"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublish = async () => {
    if (!flowId) return;
    try {
      await adminFetch("publish_flow", { flow_id: flowId });
      toast({ title: t("adminFlowPublished") });
      navigate("/admin/flow-active");
    } catch (err) {
      toast({ title: t("genericError"), description: err instanceof Error ? err.message : t("genericFailed"), variant: "destructive" });
    }
  };

  const handleUnpublish = async () => {
    if (!flowId) return;
    try {
      await adminFetch("unpublish_flow", { flow_id: flowId, reason: "Admin requested re-review" });
      toast({ title: t("adminFlowUnpublished"), description: t("adminSentBackToReview") });
      navigate("/admin/review-queue");
    } catch (err) {
      toast({ title: t("genericError"), description: err instanceof Error ? err.message : t("genericFailed"), variant: "destructive" });
    }
  };

  const toggleBadge = async (badge: string) => {
    if (!flowId) return;
    const has = badges.some((b) => b.badge === badge);
    await adminFetch("manage_badge", { flow_id: flowId, badge, remove: has });
    setBadges(has ? badges.filter((b) => b.badge !== badge) : [...badges, { badge }]);
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (!flow) return <div className="text-center py-20 text-muted-foreground">{t("adminFlowNotFound")}</div>;

  const flowStatus = (flow.status as string) || "draft";
  const canReview = ["submitted", "in_review"].includes(flowStatus);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin/review-queue")}>
        <ArrowLeft className="w-4 h-4 mr-1" /> {t("adminBackToQueue")}
      </Button>

      {/* Flow header card */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{flow.name as string}</h1>
            <p className="text-sm text-muted-foreground mt-1">{(flow.description as string) || t("adminNoDescription")}</p>
          </div>
          <FlowStatusBadge status={flowStatus as FlowStatus} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div><span className="text-muted-foreground">{t("adminFieldCategory")}</span> <span className="text-foreground ml-1">{flow.category as string}</span></div>
          <div><span className="text-muted-foreground">{t("adminFieldNodes")}</span> <span className="text-foreground ml-1">{nodes.length}</span></div>
          <div><span className="text-muted-foreground">{t("adminFieldBaseCost")}</span> <span className="text-foreground ml-1">{flow.base_cost as number} {t("creditsUnit")}</span></div>
          <div><span className="text-muted-foreground">{t("adminFieldCreated")}</span> <span className="text-foreground ml-1">{new Date(flow.created_at as string).toLocaleDateString()}</span></div>
        </div>

        {/* Pricing breakdown */}
        {(flow.api_cost as number) > 0 && (
          <FlowPricingCard
            apiCost={flow.api_cost as number}
            performanceBonusPercent={(flow.performance_bonus_percent as number) || 0}
            variant="admin"
            className="mt-4"
          />
        )}

        {/* Badges */}
        <div className="mt-4 flex items-center gap-2">
          <Award className="w-4 h-4 text-muted-foreground" />
          {BADGES.map((badge) => (
            <Badge
              key={badge}
              variant="outline"
              className={`cursor-pointer text-[10px] transition-colors ${
                badges.some((b) => b.badge === badge)
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => toggleBadge(badge)}
            >
              {badge.replace("_", " ")}
            </Badge>
          ))}
        </div>

        {flowStatus === "approved" && (
          <Button className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white" onClick={handlePublish}>
            {t("adminPublishFlow")}
          </Button>
        )}

        {flowStatus === "published" && (
          <div className="mt-4">
            <Button variant="destructive" size="sm" onClick={handleUnpublish}>
              {t("adminUnpublishReReview")}
            </Button>
          </div>
        )}
      </div>

      {/* Flow Studio canvas (read-only) */}
      <ReadOnlyFlowCanvas graph={(flow.settings as Record<string, unknown>)?.graph as any} />

      {/* Review form */}
      {canReview && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <ScoringRubricForm scores={scores} onChange={setScores} />
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">{t("adminDecisionHeader")}</h3>
            <ReviewDecisionActions
              notes={notes}
              onNotesChange={setNotes}
              internalNotes={internalNotes}
              onInternalNotesChange={setInternalNotes}
              onDecision={handleDecision}
              isSubmitting={submitting}
            />
          </div>
        </div>
      )}

      {/* Review timeline */}
      {reviews.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-5">{t("adminReviewTimeline")}</h3>
          <div className="relative">
            <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
            <div className="space-y-5">
              {reviews.map((r) => (
                <div key={r.id} className="relative pl-9">
                  <div className={`absolute left-1.5 top-1.5 w-3 h-3 rounded-full border-2 ${
                    r.decision === "approved" ? "bg-emerald-500 border-emerald-400" :
                    r.decision === "rejected" ? "bg-destructive border-destructive" :
                    r.decision === "changes_requested" ? "bg-amber-500 border-amber-400" :
                    "bg-muted-foreground border-muted"
                  }`} />
                  
                  <div className="p-3.5 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold capitalize ${
                        r.decision === "approved" ? "text-emerald-400" :
                        r.decision === "rejected" ? "text-destructive" :
                        "text-amber-400"
                      }`}>
                        {r.decision.replace("_", " ")}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                    </div>
                    
                    <div className="flex gap-3 text-xs text-muted-foreground mb-2">
                      <span>{t("scoreColon")} <span className="font-bold text-foreground">{r.total_score}/70</span></span>
                    </div>
                    
                    {r.reviewer_notes && (
                      <p className="text-xs text-foreground mt-2 leading-relaxed">{r.reviewer_notes}</p>
                    )}
                    
                    {(r as FlowReviewData & { internal_notes?: string }).internal_notes && (
                      <div className="mt-2 p-2 rounded bg-amber-500/5 border border-amber-500/10 flex items-start gap-1.5">
                        <Lock className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-amber-300/80">{(r as FlowReviewData & { internal_notes?: string }).internal_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
