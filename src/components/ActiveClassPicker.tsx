/**
 * ActiveClassPicker — dropdown that lets a multi-class student switch
 * which class their workspace runs deduct credits from.
 *
 * Hidden when:
 *   - User is not an org_user
 *   - User has 0 or 1 active student memberships (nothing to switch between)
 */
import { useUserClassMemberships, useActiveClass, setActiveClassId } from "@/hooks/useIsOrgUser";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, BookOpen, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  className?: string;
  variant?: "compact" | "full";
}

export default function ActiveClassPicker({ className, variant = "full" }: Props) {
  const { t } = useLanguage();
  const { data: memberships } = useUserClassMemberships();
  const active = useActiveClass();

  // Student memberships in active classes
  const candidates = (memberships ?? []).filter(
    (m) => m.role === "member" && m.status === "active" && m.class_status === "active"
  );

  // Only render the picker if there's > 1 to pick from
  if (candidates.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={variant === "compact" ? "sm" : "default"}
          className={cn("justify-between gap-2", className)}
        >
          <span className="flex items-center gap-2 min-w-0">
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {active?.class_name ?? t("activeClassPicker.pickClass")}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("activeClassPicker.activeClassCreditsFrom")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {candidates.map((m) => (
          <DropdownMenuItem
            key={m.class_id}
            onClick={() => setActiveClassId(m.class_id)}
            className="flex items-center justify-between gap-2 cursor-pointer"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{m.class_name}</div>
              <div className="text-xs text-muted-foreground font-mono">
                {m.class_code} · {m.credits_balance.toLocaleString()} {t("activeClassPicker.credits")}
              </div>
            </div>
            {active?.class_id === m.class_id && (
              <Check className="h-4 w-4 text-primary shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
