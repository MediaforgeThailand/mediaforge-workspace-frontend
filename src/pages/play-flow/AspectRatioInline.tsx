import React, { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * AspectRatioInline — Inline chip grid for selecting aspect ratio.
 * Used on mobile/tablet where popover-based pickers are unreliable on touch.
 */

interface Preset {
  label: string;  // e.g. "1:1"
  w: number;
  h: number;
}

function parseRatioString(s: string): { w: number; h: number } | null {
  if (!s || s === "Auto") return null;
  const m = s.match(/^(\d+):(\d+)$/);
  if (!m) return null;
  return { w: parseInt(m[1]), h: parseInt(m[2]) };
}

function buildPresets(options: string[]): Preset[] {
  const out: Preset[] = [];
  const seen = new Set<string>();
  for (const opt of options) {
    if (opt === "Auto") continue;
    const p = parseRatioString(opt);
    if (!p) continue;
    const key = `${p.w}:${p.h}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: key, w: p.w, h: p.h });
  }
  return out;
}

interface AspectRatioInlineProps {
  label?: string;
  value: string;
  options: string[];
  onChange: (ratioString: string) => void;
}

export default function AspectRatioInline({ label, value, options, onChange }: AspectRatioInlineProps) {
  const { t } = useLanguage();
  const presets = useMemo(() => buildPresets(options), [options]);
  const hasAuto = options.includes("Auto");
  const isAuto = !value || value === "Auto";

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-[11.5px] font-semibold text-white/70">
          {label ?? "Aspect Ratio"}
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {hasAuto && (
          <ChipBtn
            active={isAuto}
            onClick={() => onChange("Auto")}
            ratioBox={
              <div className="w-6 h-6 rounded-[4px] border border-dashed border-current opacity-70 flex items-center justify-center text-[8px] font-bold">
                A
              </div>
            }
            label={t("pfAutoAspect") ?? "Auto"}
          />
        )}

        {presets.map((p) => {
          const active = !isAuto && value === p.label;
          // Visual scale — keep within ~26px box
          const max = 26;
          const ratio = p.w / p.h;
          const boxW = ratio >= 1 ? max : Math.round(max * ratio);
          const boxH = ratio >= 1 ? Math.round(max / ratio) : max;
          return (
            <ChipBtn
              key={p.label}
              active={active}
              onClick={() => onChange(p.label)}
              ratioBox={
                <div
                  className="rounded-[3px] border-[1.5px] border-current"
                  style={{ width: boxW, height: boxH }}
                />
              }
              label={p.label}
            />
          );
        })}
      </div>
    </div>
  );
}

function ChipBtn({
  active,
  onClick,
  ratioBox,
  label,
}: {
  active: boolean;
  onClick: () => void;
  ratioBox: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-[68px] rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all duration-150",
        active
          ? "bg-[hsl(var(--brand)/0.18)] border-[hsl(var(--brand)/0.55)] text-foreground shadow-[0_0_0_1px_hsl(var(--brand)/0.35),0_0_16px_hsl(var(--brand)/0.25)]"
          : "bg-white/[0.04] border-white/[0.08] text-white/55 hover:text-white/80 hover:bg-white/[0.06]",
      ].join(" ")}
    >
      <div className="h-7 flex items-center justify-center">{ratioBox}</div>
      <span className="text-[10.5px] font-semibold tracking-wide">{label}</span>
    </button>
  );
}
