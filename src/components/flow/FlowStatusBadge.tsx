import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import type { FlowStatus } from "@/types/flow";

const statusStyles: Record<FlowStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  submitted: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  in_review: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  changes_requested: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  published: "bg-primary/10 text-primary border-primary/20",
  archived: "bg-muted text-muted-foreground border-border",
};

const statusLabelKeys: Record<FlowStatus, string> = {
  draft: "stuStatusDraft",
  submitted: "stuStatusSubmitted",
  in_review: "stuStatusInReview",
  approved: "stuStatusApproved",
  changes_requested: "stuStatusChangesReq",
  rejected: "stuStatusRejected",
  published: "stuStatusPublished",
  archived: "stuStatusArchived",
};

export default function FlowStatusBadge({ status }: { status: FlowStatus }) {
  const { t } = useLanguage();
  return (
    <Badge variant="outline" className={`text-[10px] ${statusStyles[status] || statusStyles.draft}`}>
      {t(statusLabelKeys[status] as any) || status}
    </Badge>
  );
}
