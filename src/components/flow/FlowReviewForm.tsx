import { useState } from "react";
import { Star, Coins, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface FlowReviewFormProps {
  flowRunId: string;
  creditsUsed: number;
  cashbackPercent: number;
  onReviewed: () => void;
}

const FlowReviewForm = ({ flowRunId, creditsUsed, cashbackPercent, onReviewed }: FlowReviewFormProps) => {
  const { t } = useLanguage();
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const estimatedCashback = cashbackPercent > 0 ? Math.ceil(creditsUsed * cashbackPercent / 100) : 0;

  const handleSubmit = async () => {
    if (rating === 0) { toast.error(t("reviewSelectRating")); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-flow-review", {
        body: { flow_run_id: flowRunId, rating, comment: comment.trim() || undefined },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      const cb = data?.cashback_credits || 0;
      toast.success(cb > 0 ? t("reviewSubmittedCashback", { cb }) : t("reviewSubmittedThanks"));
      onReviewed();
    } catch (err: any) {
      if (err.message?.includes("Already reviewed")) {
        toast.info(t("reviewAlreadySubmitted"));
        onReviewed();
      } else {
        toast.error(err.message || t("reviewSubmitFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card/60 border-none backdrop-blur-xl rounded-2xl p-5 space-y-4 glass-border">
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-foreground">{t("reviewRateFlow")}</p>
        <p className="text-xs text-muted-foreground">{t("reviewFeedbackHelp")}</p>
      </div>

      {/* Stars */}
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            onMouseEnter={() => setHoveredStar(s)}
            onMouseLeave={() => setHoveredStar(0)}
            onClick={() => setRating(s)}
            className="p-1 transition-transform hover:scale-110"
          >
            <Star
              className={cn(
                "w-7 h-7 transition-colors",
                (hoveredStar || rating) >= s
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/30"
              )}
            />
          </button>
        ))}
      </div>

      {/* Comment */}
      <Textarea
        placeholder={t("reviewShareExp")}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        className="resize-none text-sm"
      />

      {/* Cashback badge */}
      {estimatedCashback > 0 && (
        <div className="flex items-center justify-center gap-2 text-xs text-primary font-medium bg-primary/10 rounded-lg py-2">
          <Coins className="w-3.5 h-3.5" />
          <span>{t("reviewCashbackEarn", { credits: estimatedCashback, percent: cashbackPercent })}</span>
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={rating === 0 || submitting}
        variant="gradient"
        className="w-full"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("reviewSubmit")}
      </Button>
    </div>
  );
};

export default FlowReviewForm;
