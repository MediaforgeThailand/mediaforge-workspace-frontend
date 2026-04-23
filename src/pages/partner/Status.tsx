import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Loader2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type AppStatus = "draft" | "submitted" | "in_review" | "needs_info" | "approved" | "rejected";

interface AppRow {
  status: AppStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  needs_info_message: string | null;
  rejection_reason: string | null;
}

const TimelineStep = ({
  label,
  state,
}: {
  label: string;
  state: "done" | "active" | "pending";
}) => (
  <div className="flex flex-col items-center gap-2 flex-1">
    <div
      className={cn(
        "w-3 h-3 rounded-full border-2",
        state === "done" && "bg-primary border-primary",
        state === "active" && "bg-primary/30 border-primary animate-pulse",
        state === "pending" && "bg-transparent border-muted-foreground/40",
      )}
    />
    <span
      className={cn(
        "text-[11px] uppercase tracking-[0.12em] font-semibold",
        state === "pending" ? "text-muted-foreground/60" : "text-foreground",
      )}
    >
      {label}
    </span>
  </div>
);

const Timeline = ({ status }: { status: AppStatus }) => {
  const steps: { key: string; label: string }[] = [
    { key: "submitted", label: "Submitted" },
    { key: "reviewing", label: "Reviewing" },
    { key: "approved", label: "Approved" },
  ];

  const currentIdx =
    status === "approved" ? 2 : status === "in_review" || status === "needs_info" ? 1 : 0;

  return (
    <div className="relative flex items-start justify-between gap-2 pt-2">
      <div className="absolute top-3 left-[8%] right-[8%] h-[2px] bg-border" aria-hidden />
      <div
        className="absolute top-3 left-[8%] h-[2px] bg-primary transition-all"
        style={{ width: `${(currentIdx / (steps.length - 1)) * 84}%` }}
        aria-hidden
      />
      {steps.map((s, i) => (
        <TimelineStep
          key={s.key}
          label={s.label}
          state={i < currentIdx ? "done" : i === currentIdx ? "active" : "pending"}
        />
      ))}
    </div>
  );
};

const PartnerStatus = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<AppRow | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // If already a partner, route to dashboard
      const { data: partner } = await supabase
        .from("partners")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (partner) {
        navigate("/app/partner/dashboard", { replace: true });
        return;
      }

      const { data } = await supabase
        .from("partner_applications")
        .select("status, submitted_at, reviewed_at, needs_info_message, rejection_reason")
        .eq("user_id", user.id)
        .maybeSingle();
      setRow(data as AppRow | null);
      setLoading(false);
    })();
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="container max-w-2xl mx-auto py-10 px-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="container max-w-2xl mx-auto py-10 px-4">
        <Card className="p-8 text-center space-y-4">
          <h1 className="text-2xl font-bold" style={{ letterSpacing: "-0.02em" }}>
            ยังไม่มีคำขอ Partner
          </h1>
          <p className="text-sm text-muted-foreground">
            สมัครเข้าโปรแกรม Partner เพื่อเริ่มรับค่าคอมมิชชัน
          </p>
          <Button onClick={() => navigate("/app/partner/apply")}>Apply now</Button>
        </Card>
      </div>
    );
  }

  // Approved → handled above (redirects), but defensive guard:
  if (row.status === "approved") {
    return null;
  }

  const isReviewing = row.status === "submitted" || row.status === "in_review";

  // Rejected — compute eligibility for reapply (30 days from reviewed_at)
  let canReapply = false;
  let reapplyDate: Date | null = null;
  if (row.status === "rejected" && row.reviewed_at) {
    reapplyDate = new Date(new Date(row.reviewed_at).getTime() + 30 * 24 * 60 * 60 * 1000);
    canReapply = Date.now() >= reapplyDate.getTime();
  }

  return (
    <div className="container max-w-2xl mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em" }}>
          Partner Application
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          ส่งเมื่อ{" "}
          {row.submitted_at
            ? new Date(row.submitted_at).toLocaleString("th-TH")
            : "ยังไม่ได้ส่ง"}
        </p>
      </div>

      {/* Reviewing */}
      {isReviewing && (
        <Card className="p-6 space-y-6">
          <div className="flex items-start gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold" style={{ letterSpacing: "-0.02em" }}>
                Application under review
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                ทีมของเรากำลังตรวจสอบเอกสาร ปกติใช้เวลาไม่เกิน 2 วันทำการ
              </p>
            </div>
          </div>
          <Timeline status={row.status} />
        </Card>
      )}

      {/* Needs info */}
      {row.status === "needs_info" && (
        <Card className="p-6 space-y-4 border-destructive/40">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold" style={{ letterSpacing: "-0.02em" }}>
                Additional information required
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                ทีมงานต้องการข้อมูลเพิ่มเติมเพื่อพิจารณาคำขอของคุณ
              </p>
            </div>
          </div>
          {row.needs_info_message && (
            <div className="text-sm border-l-2 border-destructive pl-3 py-2 bg-destructive/5 rounded-r">
              <p className="text-foreground">{row.needs_info_message}</p>
            </div>
          )}
          <Button onClick={() => navigate("/app/partner/apply")} className="w-full">
            Edit application
          </Button>
        </Card>
      )}

      {/* Rejected */}
      {row.status === "rejected" && (
        <Card className="p-6 space-y-4 border-destructive/40">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold" style={{ letterSpacing: "-0.02em" }}>
                Application not approved
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                คำขอของคุณยังไม่ผ่านการพิจารณาในรอบนี้
              </p>
            </div>
          </div>
          {row.rejection_reason && (
            <div className="text-sm border-l-2 border-destructive pl-3 py-2 bg-destructive/5 rounded-r">
              <p className="font-semibold text-destructive">เหตุผล:</p>
              <p className="text-muted-foreground mt-1">{row.rejection_reason}</p>
            </div>
          )}
          <div className="space-y-2">
            <Button
              onClick={() => navigate("/app/partner/apply")}
              disabled={!canReapply}
              className="w-full"
            >
              {canReapply
                ? "Apply again"
                : `Apply again on ${reapplyDate?.toLocaleDateString("th-TH") ?? "30 days"}`}
            </Button>
            {!canReapply && (
              <p className="text-xs text-muted-foreground text-center">
                สามารถสมัครใหม่ได้หลังจาก 30 วันนับจากวันที่ถูกปฏิเสธ
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

export default PartnerStatus;
