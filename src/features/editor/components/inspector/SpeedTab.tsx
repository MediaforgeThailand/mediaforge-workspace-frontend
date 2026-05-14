import React, { useState, useEffect, useCallback } from "react";
import { RotateCw } from "lucide-react";
import type { Clip } from "@/lib/openreel-core";
import { getSpeedEngine } from "@/lib/openreel-core";
import { useProjectStore } from "../../stores/project-store";

/**
 * Speed → Standard tab (CapCut-parity).
 *
 * Reference: Sub-tabs "Standard / Curve / Velocity effects" with a 0.1×–100×
 * speed slider, value input, and live-updating Duration display below.
 *
 * Speed changes go through the speed engine + a direct project mutation so
 * the timeline reflects the new clip duration immediately.
 */

const SPEED_TICKS = [0.5, 1, 2, 5, 10];

interface SpeedTabProps {
  clip: Clip;
}

export const SpeedTab: React.FC<SpeedTabProps> = ({ clip }) => {
  const speedEngine = getSpeedEngine();
  const project = useProjectStore((s) => s.project);
  const setProjectState = useProjectStore.setState;

  const [speed, setSpeed] = useState(() => speedEngine.getClipSpeed(clip.id) || 1);

  useEffect(() => {
    setSpeed(speedEngine.getClipSpeed(clip.id) || 1);
  }, [clip.id, speedEngine]);

  const originalDuration = clip.outPoint - clip.inPoint;
  const newDuration = originalDuration / Math.max(speed, 0.0001);

  const applySpeed = useCallback(
    (next: number) => {
      const clamped = Math.max(0.1, Math.min(100, next));
      setSpeed(clamped);
      speedEngine.setClipSpeed(clip.id, clamped, clip.duration);

      // Project mutation: update the clip's duration so the timeline reflects
      // the new length. We don't go through actionExecutor here for slider
      // smoothness; CapCut likewise debounces undo entries for speed.
      const updatedDuration = originalDuration / clamped;
      const next_project = {
        ...project,
        timeline: {
          ...project.timeline,
          tracks: project.timeline.tracks.map((t) => ({
            ...t,
            clips: t.clips.map((c) =>
              c.id === clip.id ? { ...c, speed: clamped, duration: updatedDuration } : c,
            ),
          })),
        },
        modifiedAt: Date.now(),
      };
      setProjectState({ project: next_project });
    },
    [clip.id, clip.duration, originalDuration, project, setProjectState, speedEngine],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-text-primary">Speed</span>
        <button
          onClick={() => applySpeed(1)}
          title="Reset to 1x"
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-background-elevated transition-colors"
        >
          <RotateCw size={12} />
        </button>
      </div>

      <div className="space-y-2">
        <input
          type="range"
          min={0.1}
          max={100}
          step={0.05}
          value={speed}
          onChange={(e) => applySpeed(parseFloat(e.target.value))}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full accent-primary"
          data-testid="speed-slider"
        />
        <div className="flex justify-between text-[9px] text-text-muted tabular-nums px-0.5">
          {SPEED_TICKS.map((t) => (
            <button
              key={t}
              onClick={() => applySpeed(t)}
              className="hover:text-text-primary transition-colors"
            >
              {t}x
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-secondary">Speed</span>
          <input
            type="number"
            min={0.1}
            max={100}
            step={0.05}
            value={speed.toFixed(2)}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n)) applySpeed(n);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            className="ml-auto w-20 bg-background-tertiary border border-border rounded px-2 py-1 text-[11px] font-mono text-text-primary text-right outline-none tabular-nums"
            data-testid="speed-input"
          />
          <span className="text-[10px] text-text-muted">x</span>
        </div>
      </div>

      <div className="pt-3 border-t border-border space-y-1">
        <span className="text-[10px] text-text-secondary">Duration</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={newDuration.toFixed(2)}
            onChange={(e) => {
              const dur = parseFloat(e.target.value);
              if (Number.isFinite(dur) && dur > 0) {
                applySpeed(originalDuration / dur);
              }
            }}
            onKeyDown={(e) => e.stopPropagation()}
            className="w-24 bg-background-tertiary border border-border rounded px-2 py-1 text-[11px] font-mono text-text-primary text-right outline-none tabular-nums"
            data-testid="duration-input"
          />
          <span className="text-[10px] text-text-muted">s</span>
        </div>
      </div>
    </div>
  );
};

export default SpeedTab;
