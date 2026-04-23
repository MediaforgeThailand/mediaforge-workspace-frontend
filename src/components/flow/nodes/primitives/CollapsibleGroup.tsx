/**
 * CollapsibleGroup — Expandable parameter group with accent header.
 * Mirrors Test2 mockup spec (chevron + uppercase label + horizontal divider).
 */
import { memo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTone } from "./accent";

interface CollapsibleGroupProps {
  label: string;
  accent?: string;
  defaultOpen?: boolean;
  count?: number;
  children: ReactNode;
}

const CollapsibleGroup = memo(({
  label,
  accent = "violet",
  defaultOpen = true,
  count,
  children,
}: CollapsibleGroupProps) => {
  const [open, setOpen] = useState(defaultOpen);
  const tone = getTone(accent);

  return (
    <div className="mt-2.5 first:mt-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full flex items-center gap-1.5 py-1 nodrag"
        style={{ color: tone.c }}
      >
        <ChevronDown
          className={cn(
            "w-2.5 h-2.5 text-white/40 transition-transform duration-150 shrink-0",
            !open && "-rotate-90"
          )}
        />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] font-medium">
          {label}
        </span>
        {count != null && (
          <span className="text-white/35 font-mono text-[9.5px] font-normal">· {count}</span>
        )}
        <span className="flex-1 h-px bg-white/[0.06] ml-1.5" />
      </button>
      {open && <div className="mt-0.5 space-y-2">{children}</div>}
    </div>
  );
});

CollapsibleGroup.displayName = "CollapsibleGroup";
export default CollapsibleGroup;
