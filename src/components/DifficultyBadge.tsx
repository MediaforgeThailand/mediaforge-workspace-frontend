import { cn } from "@/lib/utils";
import { Zap, SlidersHorizontal, Wrench } from "lucide-react";
import type { FlowGraph } from "@/pages/play-flow/types";
import { extractFields } from "@/pages/play-flow/utils";

export type DifficultyLevel = "easy" | "medium" | "pro";

export interface DifficultyConfig {
  level: DifficultyLevel;
  label: string;
  icon: typeof Zap;
  /** Tailwind gradient classes for the pill background */
  gradient: string;
}

const DIFFICULTY_MAP: Record<DifficultyLevel, DifficultyConfig> = {
  easy: {
    level: "easy",
    label: "ง่าย",
    icon: Zap,
    gradient: "bg-gradient-to-br from-emerald-400 via-green-500 to-teal-500",
  },
  medium: {
    level: "medium",
    label: "ปานกลาง",
    icon: SlidersHorizontal,
    gradient: "bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-500",
  },
  pro: {
    level: "pro",
    label: "มืออาชีพ",
    icon: Wrench,
    gradient: "bg-gradient-to-br from-fuchsia-500 via-purple-600 to-indigo-600",
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
        "inline-flex items-center gap-1 rounded-full font-semibold text-white",
        "shadow-lg shadow-black/40 ring-1 ring-white/20",
        cfg.gradient,
        size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[11px]",
        className,
      )}
    >
      <Icon className={cn(size === "sm" ? "w-2.5 h-2.5" : "w-3.5 h-3.5")} />
      <span className="tracking-wide">{cfg.label}</span>
    </div>
  );
}
