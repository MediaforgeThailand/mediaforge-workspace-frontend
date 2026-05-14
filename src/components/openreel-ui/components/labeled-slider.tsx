import * as React from "react"
import { Slider } from "./slider"
import { cn } from "@/components/openreel-ui/lib/utils"

export interface LabeledSliderProps {
  label: string
  value: number
  /**
   * Called during drag (potentially every pointermove). Use this to update
   * preview state or render-only state. When `onCommit` is provided,
   * `onChange` is RAF-batched internally so React/Zustand setState calls
   * don't fire 60+ times/sec.
   */
  onChange: (value: number) => void
  /**
   * Optional commit callback fired once when the user releases the slider
   * (pointerup / keyboard release). This is the right place to write to a
   * Zustand store or the undo history — once per drag instead of per frame.
   */
  onCommit?: (value: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  className?: string
}

const LabeledSlider = React.forwardRef<HTMLDivElement, LabeledSliderProps>(
  ({ label, value, onChange, onCommit, min = 0, max = 100, step = 1, unit = "", className }, ref) => {
    // Local display state — updated synchronously so the label stays in
    // sync with the thumb position. `onChange` is always RAF-batched so
    // engine/state updates run at most once per frame instead of per
    // pointermove (matches the volume-rubberband pattern in Timeline).
    const [localValue, setLocalValue] = React.useState(value)
    React.useEffect(() => {
      setLocalValue(value)
    }, [value])

    const pendingRef = React.useRef<number>(value)
    const rafRef = React.useRef<number | null>(null)
    const onChangeRef = React.useRef(onChange)
    React.useEffect(() => {
      onChangeRef.current = onChange
    }, [onChange])

    const handleValueChange = React.useCallback((next: number) => {
      pendingRef.current = next
      setLocalValue(next)
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          onChangeRef.current(pendingRef.current)
        })
      }
    }, [])

    const handleValueCommit = React.useCallback(
      (next: number) => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        // Ensure the final value lands even if the RAF was cancelled.
        onChangeRef.current(next)
        if (onCommit) onCommit(next)
      },
      [onCommit],
    )

    React.useEffect(() => {
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      }
    }, [])

    const displayValue = step < 1 ? localValue.toFixed(1) : Math.round(localValue)

    return (
      <div ref={ref} className={cn("space-y-1", className)}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-secondary">{label}</span>
          <span className="text-[10px] font-mono text-text-primary bg-background-tertiary px-1.5 py-0.5 rounded border border-border">
            {displayValue}
            {unit}
          </span>
        </div>
        <Slider
          value={[localValue]}
          onValueChange={(values) => handleValueChange(values[0])}
          onValueCommit={(values) => handleValueCommit(values[0])}
          min={min}
          max={max}
          step={step}
          className="h-1.5"
          aria-label={label}
        />
      </div>
    )
  }
)
LabeledSlider.displayName = "LabeledSlider"

export interface InspectorSliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
}

const InspectorSlider = React.forwardRef<HTMLDivElement, InspectorSliderProps>(
  ({ value, onChange, min = 0, max = 100, step = 1, className }, ref) => {
    // Mirrors LabeledSlider — RAF-batched onChange to keep drags smooth
    // even when consumers write to Zustand on every change.
    const [localValue, setLocalValue] = React.useState(value)
    React.useEffect(() => {
      setLocalValue(value)
    }, [value])

    const pendingRef = React.useRef<number>(value)
    const rafRef = React.useRef<number | null>(null)
    const onChangeRef = React.useRef(onChange)
    React.useEffect(() => {
      onChangeRef.current = onChange
    }, [onChange])

    const handleValueChange = React.useCallback((next: number) => {
      pendingRef.current = next
      setLocalValue(next)
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          onChangeRef.current(pendingRef.current)
        })
      }
    }, [])

    const handleValueCommit = React.useCallback((next: number) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      onChangeRef.current(next)
    }, [])

    React.useEffect(() => {
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      }
    }, [])

    return (
      <div ref={ref} className={cn("flex items-center gap-3", className)}>
        <Slider
          value={[localValue]}
          onValueChange={(values) => handleValueChange(values[0])}
          onValueCommit={(values) => handleValueCommit(values[0])}
          min={min}
          max={max}
          step={step}
          className="flex-1 h-1.5"
        />
        <span className="text-[10px] font-mono text-text-primary w-8 text-right bg-background-tertiary px-1 py-0.5 rounded border border-border">
          {Math.round(localValue)}
        </span>
      </div>
    )
  }
)
InspectorSlider.displayName = "InspectorSlider"

export { LabeledSlider, InspectorSlider }
