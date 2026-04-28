/**
 * CompactParamWidgets — minimal pill / toggle / dropdown / slider
 * widgets used by the new compact tool-node layout (CompactToolNode).
 *
 * The shared NodeParamRenderer in `flow/nodes` is the verbose
 * vertical-stack renderer used by the legacy flow editor. The
 * workspace's compact toolbar wants something far smaller — single-
 * row pills with a value + label, just enough to identify what
 * each control is. These widgets are tuned for that toolbar:
 *
 *   • TogglePill   — binary (2-option) selects render as a pill
 *                    with a switch dot, e.g. `Sound·●`. Click to
 *                    flip between options[0] (off) and options[1]
 *                    (on). Convention: options[1] is the "on" state.
 *   • MiniSelect   — N-option select rendered as a compact pill
 *                    with a chevron and a popover-anchored list.
 *   • MiniSlider   — slider rendered as a pill that opens a
 *                    horizontal slider on click; idle state shows
 *                    the current value as text.
 *   • NumberStepper — small `−  N  +` cluster used for batch counts.
 *
 * Drag-stop:
 *   Every clickable element calls `e.stopPropagation()` on
 *   pointer/mouse events so React Flow's pan / drag / select
 *   handlers don't intercept the click.
 */

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Returns true when the given select param ought to render as a
 * toggle. A 2-option select is NOT enough on its own — `duration`
 * with `["5", "10"]` is two options but semantically a value pick,
 * not an on/off switch. We require the options to spell out a clear
 * binary state pair (false/true, yes/no, on/off, disabled/auto, …).
 *
 * Anything else with two options falls through to MiniSelect, which
 * still renders fine as a tiny dropdown.
 */
const ON_OFF_VALUES = new Set([
  "false",
  "true",
  "yes",
  "no",
  "on",
  "off",
  "disabled",
  "enabled",
  "auto",
]);
export function isBinarySelect(options: string[] | undefined): boolean {
  if (!Array.isArray(options) || options.length !== 2) return false;
  return options.every((o) => ON_OFF_VALUES.has(o.toLowerCase()));
}

/* ── TogglePill ──────────────────────────────────────────── */

interface TogglePillProps {
  label: string;
  value: string;
  /** [off, on] — `on` is options[1]. Convention picked to match
   *  the schema's universal pattern: ["false","true"], ["no","yes"],
   *  ["off","standard"], ["disabled","auto"], etc. */
  options: [string, string];
  optionLabels?: Record<string, string>;
  onChange: (value: string) => void;
}

export function TogglePill({
  label,
  value,
  options,
  optionLabels,
  onChange,
}: TogglePillProps) {
  const isOn = value === options[1];
  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      // Stop the click bubbling to React Flow so a tap on the toggle
      // doesn't also re-select the node. We avoid stopPropagation
      // on pointer/mousedown though — those events are how Radix
      // detects "click outside" to close other open poppers.
      e.stopPropagation();
      onChange(isOn ? options[0] : options[1]);
    },
    [isOn, options, onChange],
  );

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      onClick={handleToggle}
      className={cn("ws-toggle-pill nodrag", isOn && "is-on")}
      title={`${label}: ${optionLabels?.[value] ?? value}`}
    >
      <span className="ws-toggle-pill-track">
        <span className="ws-toggle-pill-knob" />
      </span>
      <span className="ws-toggle-pill-label">{label}</span>
    </button>
  );
}

/* ── MiniSelect ─────────────────────────────────────────── */

interface MiniSelectProps {
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  onChange: (v: string) => void;
  /** Optional truncation on the trigger label so longer model
   *  names don't blow out the toolbar. */
  truncateAt?: number;
  /** Optional preview prefix shown before the value (e.g. an icon
   *  glyph rendered as text). Use sparingly. */
  prefix?: string;
}

export function MiniSelect({
  value,
  options,
  optionLabels,
  onChange,
  truncateAt = 24,
  prefix,
}: MiniSelectProps) {
  const labelOf = (v: string) => optionLabels?.[v] ?? v;
  const display = labelOf(value);
  const truncated =
    display.length > truncateAt ? display.slice(0, truncateAt - 1) + "…" : display;

  // NOTE on event handling: we deliberately DO NOT stopPropagation
  // on the wrapper's pointer/mouse events. Doing so blocks Radix's
  // "outside click" detection — clicking another Select trigger
  // wouldn't bubble to the document-level dismiss handler, leaving
  // multiple poppers open at once. Instead we rely on the `nodrag`
  // class to keep React Flow from interpreting the press as a node
  // drag, while letting clicks propagate normally so the previous
  // popper can close itself.
  return (
    <div className="nodrag nopan nowheel">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="ws-mini-select-trigger nodrag">
          <SelectValue>
            {prefix ? `${prefix} ${truncated}` : truncated}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          className="bg-popover border-white/10 z-[9999] max-h-[260px]"
          position="popper"
          sideOffset={4}
        >
          {options.map((opt) => (
            <SelectItem
              key={opt}
              value={opt}
              className="text-[11px] text-popover-foreground focus:bg-accent focus:text-accent-foreground"
            >
              {labelOf(opt)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ── MiniSlider ─────────────────────────────────────────── */

interface MiniSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}

export function MiniSlider({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  onChange,
}: MiniSliderProps) {
  const [open, setOpen] = useState(false);
  const pct = useMemo(() => {
    if (max === min) return 0;
    return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  }, [value, min, max]);
  const formatted = step >= 1 ? String(Math.round(value)) : value.toFixed(2);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="ws-mini-pill nodrag"
          title={`${label}: ${formatted}${unit}`}
        >
          {formatted}
          {unit}
          <ChevronDown className="h-2.5 w-2.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[9999] w-[220px] border-white/10 bg-popover p-3"
        side="top"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="mb-2 flex items-center justify-between text-[10.5px] font-medium text-white/75">
          <span>{label}</span>
          <span className="font-mono tabular-nums text-white/90">
            {formatted}
            {unit}
          </span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onClick={(e) => e.stopPropagation()}
          className="fs-slider nodrag"
          style={{ ["--fs-slider-pct" as string]: `${pct}%` }}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ── NumberStepper ──────────────────────────────────────── */

interface NumberStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  /** Prefix glyph (e.g. "×" for a batch count). */
  prefix?: string;
}

export function NumberStepper({
  value,
  min = 1,
  max = 8,
  onChange,
  prefix = "×",
}: NumberStepperProps) {
  const dec = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(Math.max(min, value - 1));
    },
    [onChange, value, min],
  );
  const inc = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(Math.min(max, value + 1));
    },
    [onChange, value, max],
  );

  return (
    <div className="ws-stepper nodrag">
      <button
        type="button"
        onClick={dec}
        className="ws-stepper-btn"
        disabled={value <= min}
        aria-label="Decrease"
      >
        <Minus />
      </button>
      <span className="ws-stepper-value">
        {prefix}
        {value}
      </span>
      <button
        type="button"
        onClick={inc}
        className="ws-stepper-btn"
        disabled={value >= max}
        aria-label="Increase"
      >
        <Plus />
      </button>
    </div>
  );
}
