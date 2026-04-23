import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { CommissionEvent } from "@/hooks/usePartnerStats";

interface Props {
  commissions: CommissionEvent[] | undefined;
  loading: boolean;
}

type Range = 7 | 30 | 90;

const CommissionChart = ({ commissions, loading }: Props) => {
  const [range, setRange] = useState<Range>(90);

  const data = useMemo(() => {
    const days: { date: string; holding: number; available: number; paid: number }[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, holding: 0, available: 0, paid: 0 });
    }
    const map = new Map(days.map((d) => [d.date, d]));
    (commissions ?? []).forEach((c) => {
      const k = c.created_at.slice(0, 10);
      const slot = map.get(k);
      if (!slot) return;
      const amt = Number(c.commission_amount_thb);
      if (c.status === "holding") slot.holding += amt;
      else if (c.status === "available") slot.available += amt;
      else if (c.status === "paid") slot.paid += amt;
    });
    return days;
  }, [commissions, range]);

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base font-semibold" style={{ letterSpacing: "-0.02em" }}>
          Commission over time
        </h2>
        <div className="flex gap-1">
          {([7, 30, 90] as Range[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "outline"}
              className="h-7 px-3 text-xs"
              onClick={() => setRange(r)}
            >
              {r}D
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="g-holding" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g-available" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g-paid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(d) => d.slice(5)}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={50} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => `฿${v.toFixed(2)}`}
              />
              <Area
                type="monotone"
                dataKey="holding"
                stackId="1"
                stroke="hsl(var(--primary))"
                strokeOpacity={0.4}
                fill="url(#g-holding)"
              />
              <Area
                type="monotone"
                dataKey="available"
                stackId="1"
                stroke="hsl(var(--primary))"
                strokeOpacity={0.7}
                fill="url(#g-available)"
              />
              <Area
                type="monotone"
                dataKey="paid"
                stackId="1"
                stroke="hsl(var(--primary))"
                fill="url(#g-paid)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary/40" /> Holding
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary/70" /> Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary" /> Paid
        </span>
      </div>
    </Card>
  );
};

export default CommissionChart;
