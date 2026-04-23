/**
 * CreditPill — Amber credit-cost pill used in the node header.
 * Three states: loading (spinner) / null (N/A in rose) / number (amber + Coins).
 */
import { memo } from "react";
import { Coins, AlertTriangle, Loader2 } from "lucide-react";

interface CreditPillProps {
  value: number | null | undefined;
  loading?: boolean;
  suffix?: string;
}

const CreditPill = memo(({ value, loading, suffix }: CreditPillProps) => {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[9.5px] font-mono text-white/55 select-none">
        <Loader2 className="w-2.5 h-2.5 animate-spin" />…
      </span>
    );
  }
  if (value == null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-[9.5px] font-mono font-semibold text-rose-300 select-none">
        <AlertTriangle className="w-2.5 h-2.5" />N/A
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-[9.5px] font-mono font-semibold text-amber-300 tabular-nums select-none">
      <Coins className="w-2.5 h-2.5" />
      {value}
      {suffix}
    </span>
  );
});

CreditPill.displayName = "CreditPill";
export default CreditPill;
