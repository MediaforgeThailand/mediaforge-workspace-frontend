import React, { useState, useMemo, useCallback, useEffect } from "react";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useLanguage } from "@/contexts/LanguageContext";

/* ─── Preset definitions ─── */
interface Preset {
  label: string;
  w: number;
  h: number;
}

const SOCIAL_PRESETS: Preset[] = [
  { label: "Twitter / X", w: 4, h: 3 },
  { label: "Instagram", w: 4, h: 5 },
  { label: "TikTok", w: 9, h: 16 },
  { label: "Facebook", w: 16, h: 9 },
  { label: "YouTube", w: 16, h: 9 },
  { label: "Pinterest", w: 2, h: 3 },
];

/** Parse "16:9" → {w:16, h:9} */
function parseRatioString(s: string): { w: number; h: number } | null {
  if (!s || s === "Auto") return null;
  const m = s.match(/^(\d+):(\d+)$/);
  if (!m) return null;
  return { w: parseInt(m[1]), h: parseInt(m[2]) };
}
function ratioToString(w: number, h: number): string {
  return `${w}:${h}`;
}

/** Build preset list from node options, merging social labels where applicable */
function buildPresetsFromOptions(options: string[]): Preset[] {
  const presets: Preset[] = [];
  const seen = new Set<string>();

  for (const opt of options) {
    if (opt === "Auto") continue;
    const parsed = parseRatioString(opt);
    if (!parsed) continue;
    const key = `${parsed.w}:${parsed.h}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Try to find a social label
    const social = SOCIAL_PRESETS.find(s => s.w === parsed.w && s.h === parsed.h);
    presets.push({
      label: social ? social.label : key,
      w: parsed.w,
      h: parsed.h,
    });
  }

  return presets;
}

/* ─── Component ─── */
interface AspectRatioPanelProps {
  anchorRef?: React.RefObject<HTMLElement>;
  value: string;
  options: string[];
  onChange: (ratioString: string) => void;
}

export default function AspectRatioPanel({ value, options, onChange }: AspectRatioPanelProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  const parsed = useMemo(() => parseRatioString(value), [value]);
  const currentW = parsed?.w ?? 1;
  const currentH = parsed?.h ?? 1;

  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Build presets from actual node options
  const presets = useMemo(() => buildPresetsFromOptions(options), [options]);
  const hasAutoOption = options.includes("Auto");

  useEffect(() => {
    const match = presets.find(p => p.w === currentW && p.h === currentH);
    setSelectedPreset(match ? match.label : null);
  }, [currentW, currentH, presets]);

  const handlePresetClick = useCallback((p: Preset) => {
    setSelectedPreset(p.label);
    onChange(ratioToString(p.w, p.h));
  }, [onChange]);

  const handleAutoClick = useCallback(() => {
    setSelectedPreset(null);
    onChange("Auto");
  }, [onChange]);

  const displayRatio = value || "Auto";

  const previewAspect = useMemo(() => currentW / currentH, [currentW, currentH]);

  const presetBtnClass = (active: boolean) =>
    `h-[30px] px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-[120ms] text-left truncate ${
      active
        ? "bg-primary/15 border border-primary text-popover-foreground"
        : "bg-muted/50 border border-transparent text-muted-foreground hover:bg-muted"
    }`;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-foreground">Aspect Ratio</label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full h-12 bg-white/10 hover:bg-white/[0.15] rounded-lg pl-4 pr-10 text-sm text-foreground text-left transition-colors duration-[120ms] relative glass-border"
          >
            {displayRatio}
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </PopoverTrigger>

        <PopoverContent
          side="right"
          align="start"
          sideOffset={16}
          className="w-[320px] rounded-2xl bg-popover border-border shadow-lg p-0 pb-5"
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="text-sm font-medium text-popover-foreground flex-1">Image Dimensions</span>
            <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0 cursor-help" />
          </div>

          {/* Content */}
          <div className="flex flex-col gap-6 px-4">
            {/* Preview */}
            {parsed && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs font-semibold text-popover-foreground">Aspect Ratio</span>
                <div className="h-24 flex items-center justify-center">
                  <div
                    className="border border-dashed border-muted-foreground rounded-sm flex items-center justify-center transition-all duration-200"
                    style={{
                      aspectRatio: previewAspect,
                      height: previewAspect >= 1 ? "100%" : undefined,
                      width: previewAspect < 1 ? `${previewAspect * 96}px` : undefined,
                      maxHeight: "96px",
                      maxWidth: "100%",
                      minWidth: "40px",
                      minHeight: "40px",
                    }}
                  >
                    <span className="text-xs text-muted-foreground select-none">{displayRatio}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Auto option */}
            {hasAutoOption && (
              <button
                type="button"
                onClick={handleAutoClick}
                className={presetBtnClass(value === "Auto")}
              >
                {t("pfAutoAspect")}
              </button>
            )}

            {/* Ratio grid */}
            {presets.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">Ratios</span>
                <div className="grid grid-cols-2 gap-2">
                  {presets.map((p) => {
                    const isActive = selectedPreset === p.label && value !== "Auto";
                    const ratioStr = `${p.w}:${p.h}`;
                    const showLabel = p.label !== ratioStr;
                    return (
                      <button
                        key={ratioStr}
                        type="button"
                        onClick={() => handlePresetClick(p)}
                        className={presetBtnClass(isActive)}
                      >
                        {showLabel ? `${p.label} (${ratioStr})` : ratioStr}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
