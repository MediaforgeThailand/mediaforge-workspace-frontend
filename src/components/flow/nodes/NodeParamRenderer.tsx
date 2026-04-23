/**
 * Shared parameter renderer for flow nodes.
 * Test2 redesign: row uses `.fs-param-row` (left amber bar when exposed),
 * right-aligned `EyeBtn`, native fields restyled with `.fs-field` + `.fs-slider`.
 */
import { memo, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { type ParamDef, getParamOptions } from "./nodeApiSchema";
import { getPromptCharLimit } from "@/lib/promptLimits";
import PromptMentionTextarea from "./PromptMentionTextarea";
import { PromptHint, EyeBtn } from "./primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NodeParamRendererProps {
  param: ParamDef;
  value: unknown;
  isExposed: boolean;
  accentColor: string;
  selectedModel: string;
  onUpdateParam: (key: string, value: unknown) => void;
  onToggleExpose: (key: string) => void;
  nodeId?: string;
  /** Schema key (e.g. "klingVideoNode") — used to resolve per-model prompt char limits. */
  nodeType?: string;
}

const stopDrag = (e: React.SyntheticEvent) => e.stopPropagation();

const NodeParamRenderer = memo(({
  param,
  value,
  isExposed,
  accentColor: _accentColor,
  selectedModel,
  onUpdateParam,
  onToggleExpose,
  nodeId,
  nodeType,
}: NodeParamRendererProps) => {
  // Resolve dynamic params based on selected model
  const resolved = param.type === "dynamic" && param.dynamicType
    ? param.dynamicType(selectedModel)
    : null;
  const effectiveType = resolved?.type ?? param.type;
  const effectiveMin = resolved?.min ?? param.min;
  const effectiveMax = resolved?.max ?? param.max;
  const effectiveStep = resolved?.step ?? param.step;
  const effectiveDefault = resolved?.default ?? param.default;
  const effectiveOptionLabels = resolved?.optionLabels ?? param.optionLabels;

  const displayValue = value ?? effectiveDefault;
  const resolvedParam = resolved
    ? { ...param, type: resolved.type as ParamDef["type"], options: resolved.options ?? param.options, optionLabels: effectiveOptionLabels }
    : param;
  const effectiveOptions = effectiveType === "select" ? getParamOptions(resolvedParam, selectedModel) : [];

  // Slider track fill % for the CSS variable
  const sliderPct = useMemo(() => {
    if (effectiveType !== "slider") return 0;
    const min = Number(effectiveMin ?? 0);
    const max = Number(effectiveMax ?? 1);
    const v = Number(displayValue);
    if (max === min) return 0;
    return Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  }, [effectiveType, effectiveMin, effectiveMax, displayValue]);

  const handleToggleExpose = useCallback(() => onToggleExpose(param.key), [onToggleExpose, param.key]);

  return (
    <div className={cn("fs-param-row group", isExposed && "exposed")}>
      {/* Label row */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="flex items-center gap-1 text-[10.5px] font-medium text-white/75">
          {param.label}
          {param.required && <span className="text-red-400">*</span>}
        </span>
        <EyeBtn on={isExposed} onClick={handleToggleExpose} />
      </div>

      {/* Value editor */}
      {param.type === "textarea" ? (
        <>
          <PromptMentionTextarea
            value={String(displayValue)}
            onChange={(val) => onUpdateParam(param.key, val)}
            placeholder={param.placeholder ?? `Enter ${param.label.toLowerCase()}...`}
            excludeNodeId={nodeId}
            maxLength={nodeType ? getPromptCharLimit(nodeType, selectedModel, param.key) : null}
          />
          <PromptHint />
        </>
      ) : effectiveType === "select" && effectiveOptions.length > 0 ? (
        <div className="nodrag nopan nowheel" onMouseDown={stopDrag} onPointerDown={stopDrag}>
          <Select
            value={String(displayValue)}
            onValueChange={(val) => onUpdateParam(param.key, val)}
            disabled={effectiveOptions.length <= 1}
          >
            <SelectTrigger
              onPointerDown={stopDrag}
              className={cn(
                "fs-field h-auto px-2.5 py-1.5 focus:ring-0 focus:ring-offset-0",
                effectiveOptions.length <= 1 && "opacity-50 cursor-not-allowed",
              )}
            >
              <SelectValue>
                {effectiveOptionLabels?.[String(displayValue)] ?? String(displayValue)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              className="bg-popover border-white/10 max-h-[240px] z-[9999]"
              position="popper"
              sideOffset={4}
              onPointerDown={stopDrag}
            >
              {effectiveOptions.map((opt) => (
                <SelectItem
                  key={opt}
                  value={opt}
                  className="text-[11px] text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                >
                  {effectiveOptionLabels?.[opt] ?? opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : effectiveType === "slider" ? (
        <div className="flex items-center gap-2.5 nodrag" onMouseDown={stopDrag}>
          <input
            type="range"
            min={effectiveMin ?? 0}
            max={effectiveMax ?? 1}
            step={effectiveStep ?? 0.05}
            value={Number(displayValue)}
            onChange={(e) => onUpdateParam(param.key, parseFloat(e.target.value))}
            onClick={stopDrag}
            onMouseDown={stopDrag}
            className="fs-slider"
            style={{ ["--fs-slider-pct" as string]: `${sliderPct}%` }}
          />
          <span
            className="font-mono text-[10.5px] text-white/75 tabular-nums min-w-[42px] text-right px-1.5 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06]"
          >
            {(effectiveStep ?? 0.05) >= 1 ? String(Math.round(Number(displayValue))) : Number(displayValue).toFixed(2)}
          </span>
        </div>
      ) : effectiveType === "json" ? (
        <textarea
          value={typeof displayValue === "string" ? displayValue : JSON.stringify(displayValue, null, 2)}
          onChange={(e) => {
            try {
              onUpdateParam(param.key, JSON.parse(e.target.value));
            } catch {
              onUpdateParam(param.key, e.target.value);
            }
          }}
          onClick={stopDrag}
          onMouseDown={stopDrag}
          className="fs-field fs-field-textarea min-h-[50px] resize-none nodrag nopan"
          placeholder={param.placeholder ?? "{}"}
        />
      ) : (
        <input
          type="text"
          value={String(displayValue)}
          onChange={(e) => onUpdateParam(param.key, e.target.value)}
          onClick={stopDrag}
          onMouseDown={stopDrag}
          className="fs-field nodrag"
          placeholder={param.placeholder}
        />
      )}
    </div>
  );
});

NodeParamRenderer.displayName = "NodeParamRenderer";
export default NodeParamRenderer;
