import { cn } from "@/lib/utils";
import { Zap, SlidersHorizontal, Wrench } from "lucide-react";
import type { FlowGraph } from "@/pages/play-flow/types";
import { extractFields } from "@/pages/play-flow/utils";

export type DifficultyLevel = "easy" | "medium" | "pro";

export interface DifficultyConfig {
  level: DifficultyLevel;
  label: string;
  icon: typeof Zap;
  color: string;
  bg: string;
  border: string;
}

const DIFFICULTY_MAP: Record<DifficultyLevel, DifficultyConfig> = {
  easy: {
    level: "easy",
    label: "ง่าย",
    icon: Zap,
    color: "text-emerald-300",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
  },
  medium: {
    level: "medium",
    label: "ปานกลาง",
    icon: SlidersHorizontal,
    color: "text-amber-300",
    bg: "bg-amber-500/15",
    border: "border-amber-500/30",
  },
  pro: {
    level: "pro",
    label: "มืออาชีพ",
    icon: Wrench,
    color: "text-rose-300",
    bg: "bg-rose-500/15",
    border: "border-rose-500/30",
  },
};

/** Calculate difficulty from total user-facing input count */
export function getDifficultyLevel(inputCount: number): DifficultyLevel {
  if (inputCount < 5) return "easy";
  if (inputCount <= 9) return "medium";
  return "pro";
}

/** Calculate difficulty from a flow graph (text inputs + exposed params only, excludes image/video) */
export function getDifficultyFromGraph(graph: FlowGraph | null): DifficultyLevel {
  if (!graph) return "easy";
  const { exposed, textInputs } = extractFields(graph);
  return getDifficultyLevel(textInputs.length + exposed.length);
}

export function getDifficultyConfig(level: DifficultyLevel): DifficultyConfig {
  return DIFFICULTY_MAP[level];
}

/** Compact badge for thumbnails / cards */
export function DifficultyBadge({
  level,
  size = "sm",
  className,
}: {
  level: DifficultyLevel;
  size?: "sm" | "md";
  className?: string;
}) {
  const cfg = DIFFICULTY_MAP[level];
  const Icon = cfg.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border backdrop-blur-sm",
        cfg.bg,
        cfg.border,
        size === "sm" ? "px-1.5 py-0.5" : "px-2.5 py-1",
        className,
      )}
    >
      <Icon className={cn(cfg.color, size === "sm" ? "w-2.5 h-2.5" : "w-3.5 h-3.5")} />
      <span
        className={cn(
          "font-semibold tracking-wide",
          cfg.color,
          size === "sm" ? "text-[8px]" : "text-[11px]",
        )}
      >
        {cfg.label}
      </span>
    </div>
  );
}
