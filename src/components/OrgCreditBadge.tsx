/**
 * OrgCreditBadge — small pill / card showing the user's credit balance
 * for their CURRENTLY ACTIVE class.
 *
 * Renders nothing for consumer users / guests / users without an active
 * class (e.g. teachers viewing their own panel).
 */
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCredits } from "@/hooks/useCredits";
import { useActiveClass } from "@/hooks/useIsOrgUser";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  variant?: "pill" | "card";
  className?: string;
  workspaceId?: string | null;
}

export default function OrgCreditBadge({ variant = "pill", className, workspaceId = null }: Props) {
  const { t: i18n } = useLanguage();
  const { credits } = useCredits(workspaceId);
  const active = useActiveClass();
  if (!active && credits?.credit_scope !== "education_space") return null;

  const label = i18n("common.credits2");
  const value = Number(credits?.credit_scope === "education_space" ? credits.balance : active?.credits_balance ?? 0).toLocaleString();
  const lifetimeUsed = Number(credits?.credit_scope === "education_space" ? credits.total_used : active?.credits_lifetime_used ?? 0);
  const lifetimeReceived = Number(credits?.credit_scope === "education_space" ? credits.total_purchased : active?.credits_lifetime_received ?? 0);
  const scopeName = credits?.credit_scope === "education_space" ? credits.team_name : active?.class_name;

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
        <div className="text-xs text-amber-200/60 mt-1 truncate" title={scopeName ?? ""}>
          {scopeName}
        </div>
        {lifetimeReceived > 0 && (
          <div className="text-xs text-amber-200/50 mt-1">
            {i18n("common.received")} {lifetimeReceived.toLocaleString()} · {i18n("common.usedLower")} {lifetimeUsed.toLocaleString()}
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
      title={`${scopeName ?? i18n("common.classSpace")} · ${i18n("common.received")} ${lifetimeReceived.toLocaleString()} · ${i18n("common.usedLower")} ${lifetimeUsed.toLocaleString()}`}
    >
      <Coins className="h-3 w-3 text-amber-300" />
      <span className="text-amber-200/80">{label}</span>
      <span className="font-mono font-semibold text-amber-100">{value}</span>
    </div>
  );
}
