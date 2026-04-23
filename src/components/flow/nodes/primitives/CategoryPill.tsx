/**
 * CategoryPill — Small accent-tinted pill for the node category badge
 * (e.g. INPUT / OUTPUT / AI PROCESS / CREATOR).
 */
import { memo } from "react";
import { getTone } from "./accent";

interface CategoryPillProps {
  label: string;
  accent: string;
}

const CategoryPill = memo(({ label, accent }: CategoryPillProps) => {
  const tone = getTone(accent);
  return (
    <span
      className="text-[9.5px] font-mono font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full select-none"
      style={{
        background: tone.bg,
        border: `1px solid ${tone.bd}`,
        color: tone.c,
      }}
    >
      {label}
    </span>
  );
});

CategoryPill.displayName = "CategoryPill";
export default CategoryPill;
