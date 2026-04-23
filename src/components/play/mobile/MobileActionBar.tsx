/**
 * MobileActionBar — Mobile bottom bar (72px fixed)
 * Per handoff v2 mobile spec.
 * LOCKED PROPS: onConfigureClick, onGenerate, isRunning, disabled
 */

import { Sliders, Sparkles } from "lucide-react";

export interface MobileActionBarProps {
  onConfigureClick: () => void;
  onGenerate: () => void;
  isRunning: boolean;
  disabled: boolean;
  /** Number of unfilled required fields → small badge on Configure */
  requiredBadgeCount?: number;
  /** Total required fields count for "x/y" pill */
  requiredTotal?: number;
  /** Price label rendered next to Generate (e.g., "2,885") */
  priceLabel?: string;
  generateLabel?: string;
}

export function MobileActionBar({
  onConfigureClick,
  onGenerate,
  isRunning,
  disabled,
  requiredBadgeCount,
  requiredTotal,
  priceLabel,
  generateLabel = "Generate",
}: MobileActionBarProps) {
  const showBadge = (requiredTotal ?? 0) > 0;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 px-3 bg-[hsl(var(--background))]/80 backdrop-blur-xl border-t border-white/[0.06]">
      <div className="flex gap-2 max-w-[440px] mx-auto">
        <button
          onClick={onConfigureClick}
          className="relative h-12 px-4 rounded-[14px] flex items-center gap-2 text-[13px] font-bold text-[hsl(var(--text-2))] bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] transition-colors"
        >
          <Sliders size={14} />
          Configure
          {showBadge && (
            <span
              className={`ml-1 inline-flex items-center justify-center min-w-[22px] h-[18px] px-1.5 rounded-full text-[10px] font-bold ${
                (requiredBadgeCount ?? 0) > 0
                  ? "bg-[hsl(var(--brand)/0.18)] text-[hsl(var(--brand))] border border-[hsl(var(--brand)/0.35)]"
                  : "bg-white/[0.08] text-white/55 border border-white/[0.10]"
              }`}
            >
              {(requiredTotal ?? 0) - (requiredBadgeCount ?? 0)}/{requiredTotal}
            </span>
          )}
        </button>
        <button
          disabled={disabled || isRunning}
          onClick={onGenerate}
          className="btn-primary-violet flex-1 h-12 rounded-[14px] flex items-center justify-center gap-2 text-[13.5px] font-bold disabled:opacity-50 disabled:!bg-white/[0.06] disabled:!shadow-none disabled:text-white/40"
        >
          {isRunning ? (
            <>
              <div className="w-3.5 h-3.5 rounded-full border-2 border-white/25 border-t-white animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles size={14} />
              {generateLabel}
              {priceLabel && (
                <span className="ml-1 text-[11.5px] font-mono opacity-90">✦ {priceLabel}</span>
              )}
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
