/**
 * ToggleRow — Pill-style on/off switch for boolean params.
 */
import { memo } from "react";
import { cn } from "@/lib/utils";
import { getTone } from "./accent";

interface ToggleRowProps {
  value: boolean;
  onChange: (v: boolean) => void;
  accent?: string;
  labelOn?: string;
  labelOff?: string;
}

const ToggleRow = memo(({
  value,
  onChange,
  accent = "violet",
  labelOn = "On",
  labelOff = "Off",
}: ToggleRowProps) => {
  const tone = getTone(accent);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange(!value);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className={cn(
        "relative inline-flex items-center h-6 px-2.5 rounded-full font-mono text-[10px] uppercase tracking-[0.1em] font-medium transition-colors nodrag",
        value
          ? "text-white"
          : "bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white/70"
      )}
      style={
        value
          ? { background: tone.bg, border: `1px solid ${tone.bd}`, color: tone.c, boxShadow: `0 0 8px ${tone.glow}` }
          : undefined
      }
    >
      <span
        className={cn(
          "inline-block w-1.5 h-1.5 rounded-full mr-1.5",
          value ? "" : "bg-white/30"
        )}
        style={value ? { background: tone.c, boxShadow: `0 0 4px ${tone.glow}` } : undefined}
      />
      {value ? labelOn : labelOff}
    </button>
  );
});

ToggleRow.displayName = "ToggleRow";
export default ToggleRow;
