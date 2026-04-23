import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const statusMeta: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "รออนุมัติ", variant: "secondary" },
  approved: { label: "อนุมัติแล้ว", variant: "outline" },
  processing: { label: "กำลังโอน", variant: "outline" },
  paid: { label: "โอนแล้ว", variant: "default" },
  rejected: { label: "ปฏิเสธ", variant: "destructive" },
  cancelled: { label: "ยกเลิก", variant: "destructive" },
  failed: { label: "ล้มเหลว", variant: "destructive" },
};

const PayoutHistoryCard = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const { data: payouts, isLoading } = useQuery({
    queryKey: ["my-payouts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payout_requests")
        .select("id, amount_thb, status, requested_at, bank_reference, rejection_reason, processed_at")
        .eq("partner_user_id", userId!)
        .order("requested_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold" style={{ letterSpacing: "-0.01em" }}>
          ประวัติการถอนเงิน
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">รายการคำขอถอนเงินล่าสุด</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : !payouts || payouts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">ยังไม่มีคำขอถอนเงิน</p>
      ) : (
        <div className="divide-y divide-border">
          {payouts.map((p: any) => {
            const meta = statusMeta[p.status] ?? { label: p.status, variant: "outline" as const };
            return (
              <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold tabular-nums">
                    ฿ {Number(p.amount_thb).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {format(new Date(p.requested_at), "dd MMM yyyy, HH:mm")}
                  </p>
                  {p.bank_reference && (
                    <p className="text-[11px] text-muted-foreground">อ้างอิง: {p.bank_reference}</p>
                  )}
                  {p.rejection_reason && (
                    <p className="text-[11px] text-destructive">เหตุผล: {p.rejection_reason}</p>
                  )}
                </div>
                <Badge variant={meta.variant}>{meta.label}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default PayoutHistoryCard;
