/**
 * ModelSelectButton — Two-line model picker (label + sublabel).
 * Wraps shadcn Select but renders a richer trigger.
 */
import { memo, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { getTone } from "./accent";

interface ModelSelectButtonProps {
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  onChange: (v: string) => void;
  accent?: string;
  disabled?: boolean;
  sublabelFn?: (value: string) => string | undefined;
}

const ModelSelectButton = memo(({
  value,
  options,
  optionLabels,
  onChange,
  accent = "violet",
  disabled,
  sublabelFn,
}: ModelSelectButtonProps) => {
  const tone = getTone(accent);
  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);
  const currentLabel = optionLabels?.[value] ?? value;
  const currentSub = sublabelFn?.(value);

  return (
    <div className="nodrag nopan nowheel" onMouseDown={stop} onPointerDown={stop}>
      <Select value={value} onValueChange={onChange} disabled={disabled || options.length <= 1}>
        <SelectTrigger
          onPointerDown={stop}
          className={cn(
            "w-full h-auto bg-white/[0.03] border-white/[0.08] rounded-lg px-2.5 py-1.5",
            "hover:bg-white/[0.05] hover:border-white/15 focus:ring-0 focus:ring-offset-0",
            "[&>svg]:hidden transition-colors",
            (disabled || options.length <= 1) && "opacity-60 cursor-not-allowed"
          )}
        >
          <div className="flex items-center justify-between w-full gap-2">
            <div className="flex flex-col items-start min-w-0 text-left">
              <span className="text-[11.5px] font-medium text-white/85 truncate w-full" style={{ color: tone.c }}>
                {currentLabel}
              </span>
              {currentSub && (
                <span className="text-[9.5px] font-mono text-white/40 truncate w-full mt-0.5">
                  {currentSub}
                </span>
              )}
            </div>
            <ChevronDown className="w-3 h-3 text-white/40 shrink-0" />
          </div>
        </SelectTrigger>
        <SelectContent
          className="bg-popover border-white/10 max-h-[260px] z-[9999]"
          position="popper"
          sideOffset={4}
          onPointerDown={stop}
        >
          {options.map((opt) => {
            const sub = sublabelFn?.(opt);
            return (
              <SelectItem
                key={opt}
                value={opt}
                className="text-[11px] text-popover-foreground focus:bg-accent focus:text-accent-foreground py-1.5"
              >
                <div className="flex flex-col">
                  <span>{optionLabels?.[opt] ?? opt}</span>
                  {sub && <span className="text-[9.5px] text-muted-foreground font-mono">{sub}</span>}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
});

ModelSelectButton.displayName = "ModelSelectButton";
export default ModelSelectButton;
