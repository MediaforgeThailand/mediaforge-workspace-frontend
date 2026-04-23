/**
 * GroupHeader — Accent ribbon style label (non-collapsible variant).
 * Used when a group should always stay visible.
 */
import { memo } from "react";
import { getTone } from "./accent";

interface GroupHeaderProps {
  label: string;
  accent?: string;
}

const GroupHeader = memo(({ label, accent = "violet" }: GroupHeaderProps) => {
  const tone = getTone(accent);
  return (
    <div className="flex items-center gap-1.5 py-1" style={{ color: tone.c }}>
      <span
        className="w-[3px] h-3 rounded-full"
        style={{ background: tone.c, boxShadow: `0 0 6px ${tone.glow}` }}
      />
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] font-medium">
        {label}
      </span>
      <span className="flex-1 h-px bg-white/[0.06]" />
    </div>
  );
});

GroupHeader.displayName = "GroupHeader";
export default GroupHeader;
