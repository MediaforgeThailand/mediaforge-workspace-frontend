import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, MessageSquare, Loader2, Lock, Eye } from "lucide-react";
import type { ReviewDecision } from "@/types/admin";

interface Props {
  notes: string;
  onNotesChange: (notes: string) => void;
  internalNotes: string;
  onInternalNotesChange: (notes: string) => void;
  onDecision: (decision: ReviewDecision) => void;
  isSubmitting: boolean;
}

export default function ReviewDecisionActions({
  notes, onNotesChange, internalNotes, onInternalNotesChange, onDecision, isSubmitting,
}: Props) {
  return (
    <div className="space-y-5">
      {/* Creator-facing notes */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Eye className="w-3 h-3 text-muted-foreground" />
          <label className="text-xs font-medium text-foreground">Creator Feedback</label>
          <span className="text-[10px] text-muted-foreground ml-1">(visible to creator)</span>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Feedback the creator will see..."
          className="min-h-[72px] text-sm"
        />
      </div>

      {/* Internal admin notes */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Lock className="w-3 h-3 text-amber-400" />
          <label className="text-xs font-medium text-foreground">Internal Notes</label>
          <span className="text-[10px] text-amber-400/70 ml-1">(admin only)</span>
        </div>
        <Textarea
          value={internalNotes}
          onChange={(e) => onInternalNotesChange(e.target.value)}
          placeholder="Private notes for the team..."
          className="min-h-[60px] text-sm border-amber-500/20 focus-visible:ring-amber-500/30"
        />
      </div>

      {/* Decision buttons */}
      <div className="flex gap-2 pt-2">
        <Button
          variant="default"
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => onDecision("approved")}
          disabled={isSubmitting}
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Approve
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => onDecision("changes_requested")}
          disabled={isSubmitting}
        >
          <MessageSquare className="w-4 h-4" />
          Request Changes
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={() => onDecision("rejected")}
          disabled={isSubmitting}
        >
          <XCircle className="w-4 h-4" />
          Reject
        </Button>
      </div>
    </div>
  );
}
