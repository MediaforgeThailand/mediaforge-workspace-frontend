import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { CommissionEvent, PartnerRow } from "@/hooks/usePartnerStats";

interface Props {
  partner: PartnerRow | null | undefined;
  commissions: CommissionEvent[] | undefined;
  loading: boolean;
}

const fmt = (v: number) =>
  `฿ ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const StatCard = ({
  label,
  value,
  caption,
  loading,
  accent,
}: {
  label: string;
  value: string;
  caption: string;
  loading: boolean;
  accent?: React.ReactNode;
}) => (
  <Card className="p-5">
    <div className="flex items-start justify-between gap-2">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
        {label}
      </p>
      {accent}
    </div>
    {loading ? (
      <Skeleton className="h-8 w-32 mt-2" />
    ) : (
      <p
        className="text-3xl font-bold mt-2 tabular-nums"
        style={{ letterSpacing: "-0.02em" }}
      >
        {value}
      </p>
    )}
    <p className="text-xs text-muted-foreground mt-1">{caption}</p>
  </Card>
);

const TIER_TONE: Record<string, string> = {
  standard: "bg-muted text-foreground border-border",
  silver: "bg-slate-100 text-slate-900 border-slate-300",
  gold: "bg-amber-100 text-amber-900 border-amber-300",
  platinum: "bg-indigo-100 text-indigo-900 border-indigo-300",
};

const OverviewCards = ({ partner, commissions, loading }: Props) => {
  const available = (commissions ?? [])
    .filter((c) => c.status === "available")
    .reduce((s, c) => s + Number(c.commission_amount_thb), 0);
  const holding = (commissions ?? [])
    .filter((c) => c.status === "holding")
    .reduce((s, c) => s + Number(c.commission_amount_thb), 0);

  const rate = partner ? (Number(partner.commission_rate) * 100).toFixed(0) : "—";
  const tier = partner?.tier ?? "standard";
  const tierTone = TIER_TONE[tier] ?? TIER_TONE.standard;

  return (
    <>
      {/* Tier + rate header strip */}
      {partner && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={tierTone} variant="outline">
              Tier: {tier}
            </Badge>
            <Badge
              variant="outline"
              className="bg-primary/10 text-primary border-primary/30"
            >
              Commission rate: {rate}%
            </Badge>
            <span className="text-xs text-muted-foreground">
              เข้าร่วมเมื่อ{" "}
              {new Date(partner.approved_at).toLocaleDateString("th-TH")}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Earnings"
          value={fmt(Number(partner?.lifetime_commission_thb ?? 0))}
          caption="lifetime"
          loading={loading}
        />
        <StatCard
          label="Available"
          value={fmt(available)}
          caption="ready to withdraw"
          loading={loading}
        />
        <StatCard
          label="Holding"
          value={fmt(holding)}
          caption="releases within 30 days"
          loading={loading}
        />
        <StatCard
          label="Paid Out"
          value={fmt(Number(partner?.lifetime_paid_thb ?? 0))}
          caption="lifetime"
          loading={loading}
        />
      </div>
    </>
  );
};

export default OverviewCards;
