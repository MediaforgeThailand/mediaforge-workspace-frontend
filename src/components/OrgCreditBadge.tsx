/**
 * OrgCreditBadge — small pill / card showing the user's credit balance
 * for their CURRENTLY ACTIVE class.
 *
 * Renders nothing for consumer users / guests / users without an active
 * class (e.g. teachers viewing their own panel).
 */
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveClass } from "@/hooks/useIsOrgUser";

interface Props {
  variant?: "pill" | "card";
  className?: string;
}

export default function OrgCreditBadge({ variant = "pill", className }: Props) {
  const active = useActiveClass();
  if (!active) return null;

  const label = "Credits";
  const value = active.credits_balance.toLocaleString();
  const lifetimeUsed = active.credits_lifetime_used;
  const lifetimeReceived = active.credits_lifetime_received;

  if (variant === "card") {
    return (
      <div
        className={cn(
          "rounded-lg border border-amber-500/20 bg-amber-500/5 p-3",
          className,
        )}
      >
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-amber-200/80">
          <Coins className="h-3 w-3" /> {label}
        </div>
        <div className="text-2xl font-bold mt-1 text-amber-100 font-mono">
          {value}
        </div>
        <div className="text-xs text-amber-200/60 mt-1 truncate" title={active.class_name}>
          {active.class_name}
        </div>
        {lifetimeReceived > 0 && (
          <div className="text-xs text-amber-200/50 mt-1">
            received {lifetimeReceived.toLocaleString()} · used {lifetimeUsed.toLocaleString()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs",
        className,
      )}
      title={`${active.class_name} · received ${lifetimeReceived.toLocaleString()} · used ${lifetimeUsed.toLocaleString()}`}
    >
      <Coins className="h-3 w-3 text-amber-300" />
      <span className="text-amber-200/80">{label}</span>
      <span className="font-mono font-semibold text-amber-100">{value}</span>
    </div>
  );
}
