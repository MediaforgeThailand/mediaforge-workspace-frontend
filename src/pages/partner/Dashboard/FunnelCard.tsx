import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Range = 7 | 30 | 90;

interface Props {
  data: { clicks: number; signups: number; paid: number } | undefined;
  loading: boolean;
  range: Range;
  onRangeChange: (r: Range) => void;
}

const Step = ({
  label,
  count,
  rate,
  width,
}: {
  label: string;
  count: number;
  rate?: string;
  width: number;
}) => (
  <div className="space-y-1.5">
    <div className="flex items-baseline justify-between">
      <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
        {label}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {count.toLocaleString()}
        {rate && <span className="ml-2 text-foreground/70">{rate}</span>}
      </span>
    </div>
    <div className="h-3 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full bg-primary transition-all rounded-full"
        style={{ width: `${Math.max(width, 2)}%` }}
      />
    </div>
  </div>
);

const FunnelCard = ({ data, loading, range, onRangeChange }: Props) => {
  const ranges: Range[] = [7, 30, 90];

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base font-semibold" style={{ letterSpacing: "-0.02em" }}>
          Conversion funnel — last {range} days
        </h2>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "outline"}
              className="h-7 px-3 text-xs"
              onClick={() => onRangeChange(r)}
            >
              {r}D
            </Button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        (() => {
          const { clicks, signups, paid } = data;
          const max = Math.max(clicks, 1);
          const signupRate = clicks > 0 ? `${((signups / clicks) * 100).toFixed(1)}%` : "—";
          const paidRate = signups > 0 ? `${((paid / signups) * 100).toFixed(1)}%` : "—";
          return (
            <div className="space-y-4">
              <Step label="Clicks" count={clicks} width={100} />
              <Step label="Signups" count={signups} rate={signupRate} width={(signups / max) * 100} />
              <Step label="Paid" count={paid} rate={paidRate} width={(paid / max) * 100} />
            </div>
          );
        })()
      )}
    </Card>
  );
};

export default FunnelCard;
