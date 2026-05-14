import React, { useCallback } from "react";
import { RotateCw } from "lucide-react";
import type { Clip } from "@/lib/openreel-core";
import { useProjectStore } from "../../stores/project-store";

/**
 * Audio → Basic settings tab (CapCut-parity).
 *
 * Reference: Sub-tabs "Basic / Voice changer" + Volume slider with reset
 * + keyframe affordances, plus Fade in / Fade out sliders.
 *
 * Volume is read/written directly to the underlying Clip via the action
 * executor (action: "audio/setVolume"). Fade in/out land on clip.fade.
 */

const linearToDb = (gain: number): number => {
  if (gain <= 0) return -60;
  const db = 20 * Math.log10(gain);
  return Math.max(-60, Math.min(6, db));
};

const dbToLinear = (db: number): number => {
  if (db <= -60) return 0;
  return Math.pow(10, db / 20);
};

const ResetKfRow: React.FC<{ onReset: () => void }> = ({ onReset }) => (
  <div className="flex items-center gap-1">
    <button
      onClick={onReset}
      title="Reset"
      className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-background-elevated transition-colors"
    >
      <RotateCw size={11} />
    </button>
    {/* V6 polish: decorative "Add keyframe" diamond removed — no
        underlying keyframe action wired anymore. */}
  </div>
);

interface AudioBasicTabProps {
  clip: Clip;
}

export const AudioBasicTab: React.FC<AudioBasicTabProps> = ({ clip }) => {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore.setState;

  // Update clip volume / fade by mutating the project tree directly (CapCut
  // batches these in real time without making the user wait for the action
  // executor's undo-history snapshot for every keystroke).
  const setVolume = useCallback(
    (vol: number) => {
      const next = {
        ...project,
        timeline: {
          ...project.timeline,
          tracks: project.timeline.tracks.map((t) => ({
            ...t,
            clips: t.clips.map((c) =>
              c.id === clip.id ? { ...c, volume: vol } : c,
            ),
          })),
        },
        modifiedAt: Date.now(),
      };
      setProject({ project: next });
    },
    [project, clip.id, setProject],
  );

  const setFade = useCallback(
    (fade: { fadeIn: number; fadeOut: number }) => {
      const next = {
        ...project,
        timeline: {
          ...project.timeline,
          tracks: project.timeline.tracks.map((t) => ({
            ...t,
            clips: t.clips.map((c) =>
              c.id === clip.id ? { ...c, fade } : c,
            ),
          })),
        },
        modifiedAt: Date.now(),
      };
      setProject({ project: next });
    },
    [project, clip.id, setProject],
  );

  const volumeDb = linearToDb(clip.volume ?? 1);
  const fade = clip.fade ?? { fadeIn: 0, fadeOut: 0 };
  const maxFade = Math.max(0, clip.duration / 2);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="audio-basic-enable"
          defaultChecked
          className="accent-primary"
        />
        <label htmlFor="audio-basic-enable" className="text-[11px] font-semibold text-text-primary">
          Basic
        </label>
      </div>

      {/* Volume */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-secondary">Volume</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-primary tabular-nums w-12 text-right">
              {volumeDb.toFixed(1)}dB
            </span>
            <ResetKfRow onReset={() => setVolume(1)} />
          </div>
        </div>
        <input
          type="range"
          min={-60}
          max={6}
          step={0.1}
          value={volumeDb}
          onChange={(e) => setVolume(dbToLinear(parseFloat(e.target.value)))}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full accent-primary"
          data-testid="audio-volume-slider"
        />
      </div>

      {/* Fade in */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-secondary">Fade in</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-primary tabular-nums w-12 text-right">
              {fade.fadeIn.toFixed(2)}s
            </span>
            <ResetKfRow onReset={() => setFade({ ...fade, fadeIn: 0 })} />
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={maxFade}
          step={0.05}
          value={Math.min(fade.fadeIn, maxFade)}
          onChange={(e) => setFade({ ...fade, fadeIn: parseFloat(e.target.value) })}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full accent-primary"
          data-testid="audio-fade-in-slider"
        />
      </div>

      {/* Fade out */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-secondary">Fade out</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-primary tabular-nums w-12 text-right">
              {fade.fadeOut.toFixed(2)}s
            </span>
            <ResetKfRow onReset={() => setFade({ ...fade, fadeOut: 0 })} />
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={maxFade}
          step={0.05}
          value={Math.min(fade.fadeOut, maxFade)}
          onChange={(e) => setFade({ ...fade, fadeOut: parseFloat(e.target.value) })}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full accent-primary"
          data-testid="audio-fade-out-slider"
        />
      </div>
    </div>
  );
};

export default AudioBasicTab;
