import { Coins, TrendingUp, Percent, Zap } from "lucide-react";
import { calculateFlowPricing, formatCredits } from "@/lib/flowPricing";
import { usePlatformMultipliers } from "@/hooks/usePlatformMultipliers";

interface Props {
  apiCost: number;
  performanceBonusPercent?: number;
  /** Which feature multiplier to use. Defaults to "default" (avg). */
  feature?: "image" | "video" | "chat" | "default";
  /** Show full breakdown (admin) or simplified (creator) */
  variant?: "admin" | "creator";
  className?: string;
}

export default function FlowPricingCard({
  apiCost, performanceBonusPercent = 0, feature = "default", variant = "creator", className = "",
}: Props) {
  const { data: multipliers } = usePlatformMultipliers();
  const pricing = calculateFlowPricing(apiCost, performanceBonusPercent, {
    multiplier: multipliers?.[feature],
    revshare: multipliers?.revshare,
  });

  if (apiCost <= 0) return null;

  return (
    <div className={`rounded-xl border border-border bg-card overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-foreground" />
          <span className="text-xs font-semibold text-foreground">
            {variant === "admin" ? "Pricing Breakdown" : "Your Earnings"}
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          {variant === "admin" && (
            <PricingItem
              icon={<Zap className="w-3.5 h-3.5 text-muted-foreground" />}
              label="API Cost"
              value={formatCredits(pricing.apiCost)}
              suffix="credits"
            />
          )}
          <PricingItem
            icon={<Coins className="w-3.5 h-3.5 text-foreground" />}
            label="Selling Price"
            value={formatCredits(pricing.sellingPrice)}
            suffix={`${pricing.multiplier}× markup`}
            highlight
          />
          {variant === "admin" && (
            <PricingItem
              icon={<TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />}
              label="Contribution Margin"
              value={formatCredits(pricing.contributionMargin)}
              suffix="credits"
            />
          )}
          <PricingItem
            icon={<Percent className="w-3.5 h-3.5 text-muted-foreground" />}
            label="Revshare"
            value={`${pricing.effectiveRevsharePercent}%`}
            suffix={pricing.performanceBonusPercent > 0 ? `(+${pricing.performanceBonusPercent}% bonus)` : "of margin"}
          />
        </div>

        {/* Creator payout highlight */}
        <div className="mt-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/15 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">
            {variant === "admin" ? "Creator Payout" : "Your Estimated Payout"}
          </span>
          <span className="text-base font-bold text-emerald-400">
            {formatCredits(pricing.creatorPayout)} <span className="text-xs font-normal text-muted-foreground">credits/run</span>
          </span>
        </div>

        {/* Per-run economics for admin */}
        {variant === "admin" && (
          <div className="mt-2 text-[10px] text-muted-foreground text-right">
            Platform retains {formatCredits(pricing.contributionMargin - pricing.creatorPayout)} credits/run
          </div>
        )}
      </div>
    </div>
  );
}

function PricingItem({ icon, label, value, suffix, highlight }: {
  icon: React.ReactNode; label: string; value: string; suffix?: string; highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/20">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-[10px] text-muted-foreground leading-none mb-1">{label}</p>
        <p className={`text-sm font-bold leading-none ${highlight ? "text-foreground" : "text-foreground"}`}>{value}</p>
        {suffix && <p className="text-[9px] text-muted-foreground mt-0.5">{suffix}</p>}
      </div>
    </div>
  );
}
