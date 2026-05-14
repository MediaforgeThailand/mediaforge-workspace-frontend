import React, { useState } from "react";
import {
  RotateCw,
  Link2,
  Unlink,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
} from "lucide-react";
import type { Clip, Transform } from "@/lib/openreel-core";
import { useProjectStore } from "../../stores/project-store";

/**
 * Video → Basic settings tab (CapCut-parity).
 *
 * Reference layout (from CapCut screenshot the user supplied):
 *   - "Basic / Remove BG / Mask / Retouch" sub-tabs (handled by parent).
 *   - "Transform" section header with reset + keyframe affordances.
 *   - Scale slider + uniform-scale toggle.
 *   - Position X / Y inputs.
 *   - Rotation input + circular dial.
 *   - 3x3 alignment grid.
 *
 * Writes directly to project-store via updateClipTransform so changes flow
 * through the action executor + render pipeline.
 */

const NumberSpinner: React.FC<{
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
}> = ({ value, onChange, min, max, step = 1, suffix, className }) => {
  return (
    <div
      className={`flex items-center bg-background-tertiary rounded border border-border h-7 ${className ?? ""}`}
    >
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const next = parseFloat(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className="flex-1 min-w-0 bg-transparent px-2 py-1 text-[11px] font-mono text-text-primary text-right outline-none tabular-nums"
      />
      {suffix && (
        <span className="px-1.5 text-[10px] text-text-muted select-none">
          {suffix}
        </span>
      )}
    </div>
  );
};

const AlignmentGrid: React.FC<{ onAlign: (col: 0 | 1 | 2, row: 0 | 1 | 2) => void }> = ({
  onAlign,
}) => {
  const cells: Array<{
    col: 0 | 1 | 2;
    row: 0 | 1 | 2;
    Icon: typeof AlignStartHorizontal;
    label: string;
  }> = [
    { col: 0, row: 0, Icon: AlignStartHorizontal, label: "Top-left" },
    { col: 1, row: 0, Icon: AlignCenterHorizontal, label: "Top" },
    { col: 2, row: 0, Icon: AlignEndHorizontal, label: "Top-right" },
    { col: 0, row: 1, Icon: AlignStartVertical, label: "Left" },
    { col: 1, row: 1, Icon: AlignCenterVertical, label: "Center" },
    { col: 2, row: 1, Icon: AlignEndVertical, label: "Right" },
    { col: 0, row: 2, Icon: AlignStartHorizontal, label: "Bottom-left" },
    { col: 1, row: 2, Icon: AlignCenterHorizontal, label: "Bottom" },
    { col: 2, row: 2, Icon: AlignEndHorizontal, label: "Bottom-right" },
  ];
  return (
    <div
      data-testid="alignment-grid"
      className="grid grid-cols-3 gap-1 w-fit p-1 bg-background-tertiary rounded-md border border-border"
    >
      {cells.map(({ col, row, Icon, label }) => (
        <button
          key={`${col}-${row}`}
          title={label}
          onClick={() => onAlign(col, row)}
          className="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-background-elevated transition-colors"
        >
          <Icon size={12} />
        </button>
      ))}
    </div>
  );
};

interface VideoBasicTabProps {
  clip: Clip;
  canvasWidth: number;
  canvasHeight: number;
}

export const VideoBasicTab: React.FC<VideoBasicTabProps> = ({
  clip,
  canvasWidth,
  canvasHeight,
}) => {
  const { updateClipTransform } = useProjectStore();
  const [uniformScale, setUniformScale] = useState(true);

  const transform = clip.transform;
  const scale = transform.scale.x; // assumes uniform unless user opts out

  const setTransform = (changes: Partial<Transform>) => {
    updateClipTransform(clip.id, changes);
  };

  const setScale = (next: number) => {
    if (uniformScale) {
      setTransform({ scale: { x: next, y: next } });
    } else {
      setTransform({ scale: { ...transform.scale, x: next } });
    }
  };

  const setRotation = (next: number) => {
    // Wrap into [-180, 180] for a CapCut-like dial.
    let r = next;
    while (r > 180) r -= 360;
    while (r < -180) r += 360;
    setTransform({ rotation: r });
  };

  const resetTransform = () => {
    setTransform({
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    });
  };

  const align = (col: 0 | 1 | 2, row: 0 | 1 | 2) => {
    // Anchor offsets in clip-space — assumes the clip is centered at (0,0).
    // CapCut behaviour: snap clip to one of the 9 canvas anchor points.
    const halfW = canvasWidth / 2;
    const halfH = canvasHeight / 2;
    const xMap = [-halfW + halfW * scale, 0, halfW - halfW * scale];
    const yMap = [-halfH + halfH * scale, 0, halfH - halfH * scale];
    setTransform({
      position: { x: xMap[col], y: yMap[row] },
    });
  };

  // Build a circular rotation dial — a 28px circle with a tick rotated by
  // current angle. Click+drag rotates; click anywhere snaps to that angle.
  const dialRef = React.useRef<HTMLDivElement>(null);
  const handleDialPointer = (e: React.PointerEvent) => {
    const el = dialRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const update = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      // Convert atan2 (radians from positive X axis) to degrees with 0 at top
      // so the dial behaves like a clock — CapCut shows 0 pointing up.
      const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      setRotation(deg);
    };
    update(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => update(ev.clientX, ev.clientY);
    const onUp = (ev: PointerEvent) => {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  return (
    <div className="space-y-4">
      {/* Transform section header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-text-primary">
          Transform
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={resetTransform}
            title="Reset transform"
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-background-elevated transition-colors"
          >
            <RotateCw size={12} />
          </button>
          {/* V6 polish: removed decorative "add keyframe" diamond — the
              KeyframesSection it gestured at was deleted, leaving the icon
              non-functional. Reintroduce with real wiring when keyframes
              return. */}
        </div>
      </div>

      {/* Scale + uniform toggle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-secondary">Scale</span>
          <button
            onClick={() => setUniformScale((v) => !v)}
            title={uniformScale ? "Unlink X/Y scale" : "Link X/Y scale"}
            className={`p-1 rounded transition-colors ${
              uniformScale
                ? "text-primary hover:bg-primary/10"
                : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
            }`}
          >
            {uniformScale ? <Link2 size={11} /> : <Unlink size={11} />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={500}
            step={1}
            value={Math.round(scale * 100)}
            onChange={(e) => setScale(parseInt(e.target.value, 10) / 100)}
            onKeyDown={(e) => e.stopPropagation()}
            className="flex-1 accent-primary"
          />
          <NumberSpinner
            value={Math.round(scale * 100)}
            onChange={(v) => setScale(v / 100)}
            min={0}
            max={500}
            suffix="%"
            className="w-20"
          />
        </div>
      </div>

      {/* Position X/Y */}
      <div className="space-y-2">
        <span className="text-[10px] text-text-secondary">Position</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-text-muted w-3">X</span>
            <NumberSpinner
              value={Math.round(transform.position.x)}
              onChange={(x) =>
                setTransform({ position: { ...transform.position, x } })
              }
              suffix="px"
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-text-muted w-3">Y</span>
            <NumberSpinner
              value={Math.round(transform.position.y)}
              onChange={(y) =>
                setTransform({ position: { ...transform.position, y } })
              }
              suffix="px"
              className="flex-1"
            />
          </div>
        </div>
      </div>

      {/* Rotation */}
      <div className="space-y-2">
        <span className="text-[10px] text-text-secondary">Rotate</span>
        <div className="flex items-center gap-2">
          <NumberSpinner
            value={Math.round(transform.rotation)}
            onChange={setRotation}
            min={-180}
            max={180}
            suffix="°"
            className="flex-1"
          />
          <div
            data-testid="rotation-dial"
            ref={dialRef}
            onPointerDown={handleDialPointer}
            className="relative w-7 h-7 rounded-full border border-border bg-background-tertiary cursor-grab active:cursor-grabbing shrink-0"
          >
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 origin-bottom h-3 w-0.5 bg-primary rounded"
              style={{
                transform: `translateX(-50%) rotate(${transform.rotation}deg)`,
                transformOrigin: "50% 100%",
                top: "2px",
              }}
            />
          </div>
        </div>
      </div>

      {/* Alignment grid */}
      <div className="space-y-2">
        <span className="text-[10px] text-text-secondary">Alignment</span>
        <AlignmentGrid onAlign={align} />
      </div>
    </div>
  );
};

export default VideoBasicTab;
