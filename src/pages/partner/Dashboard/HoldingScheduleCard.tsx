import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock } from "lucide-react";
import type { CommissionEvent } from "@/hooks/usePartnerStats";

interface Props {
  commissions: CommissionEvent[] | undefined;
  loading: boolean;
}

const fmt = (v: number) =>
  `฿${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Bucket {
  label: string;
  count: number;
  total: number;
  withinDays: number;
}

const HoldingScheduleCard = ({ commissions, loading }: Props) => {
  const buckets = useMemo<Bucket[]>(() => {
    const holding = (commissions ?? []).filter((c) => c.status === "holding");
    const now = Date.now();
    const MS = 24 * 60 * 60 * 1000;

    const ranges: { label: string; days: number }[] = [
      { label: "ภายใน 7 วัน", days: 7 },
      { label: "8 – 14 วัน", days: 14 },
      { label: "15 – 30 วัน", days: 30 },
      { label: "> 30 วัน", days: 999 },
    ];

    const byRange = ranges.map((r) => ({
      label: r.label,
      count: 0,
      total: 0,
      withinDays: r.days,
    }));

    holding.forEach((c) => {
      const until = new Date(c.hold_until).getTime();
      const diffDays = Math.max(0, (until - now) / MS);
      const idx =
        diffDays <= 7
          ? 0
          : diffDays <= 14
          ? 1
          : diffDays <= 30
          ? 2
          : 3;
      byRange[idx].count += 1;
      byRange[idx].total += Number(c.commission_amount_thb);
    });

    return byRange;
  }, [commissions]);

  const hasAnyHolding = buckets.some((b) => b.count > 0);

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
          <Clock className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2
            className="text-base font-semibold"
            style={{ letterSpacing: "-0.02em" }}
          >
            Upcoming unlocks
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Commission ที่จะปลดล็อก (จาก holding → available) ในช่วงข้างหน้า
          </p>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : !hasAnyHolding ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          ยังไม่มี commission ที่อยู่ในสถานะ holding
        </p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {buckets.map((b) => {
            const isEmpty = b.count === 0;
            return (
              <div
                key={b.label}
                className={`rounded-lg border p-3 ${
                  isEmpty ? "bg-muted/20" : "bg-primary/5 border-primary/20"
                }`}
              >
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">
                  {b.label}
                </p>
                <p
                  className={`text-xl font-bold tabular-nums mt-1 ${
                    isEmpty ? "text-muted-foreground" : ""
                  }`}
                  style={{ letterSpacing: "-0.02em" }}
                >
                  {fmt(b.total)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {b.count} event{b.count !== 1 ? "s" : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground italic">
        * Holding period คือ 30 วัน เพื่อรองรับ refund / clawback
      </p>
    </Card>
  );
};

export default HoldingScheduleCard;
