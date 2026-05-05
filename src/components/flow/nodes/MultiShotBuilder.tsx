/**
 * MultiShotBuilder — Director Mode storyboard for Kling Omni multi-shot videos.
 * Test2 redesign: violet header banner with Director badge + total duration pill,
 * timeline ruler bar, scene cards with thumbs and inline @mention prompts.
 */
import { memo, useCallback, useMemo } from "react";
import { Plus, Trash2, Film, GripVertical, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import PromptMentionTextarea from "./PromptMentionTextarea";
import { KLING_MULTISHOT_SCENE_LIMIT } from "@/lib/promptLimits";
import { useLanguage } from "@/contexts/LanguageContext";

export interface SceneBlock {
  prompt: string;
  duration: number;
}

interface MultiShotBuilderProps {
  scenes: SceneBlock[];
  onChange: (scenes: SceneBlock[]) => void;
  excludeNodeId?: string;
}

const MAX_SCENES = 6;
const MIN_DURATION = 1;

const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();

const SCENE_GRADIENTS = [
  "linear-gradient(135deg,#f59e0b,#ef4444)",
  "linear-gradient(135deg,#8b5cf6,#ec4899)",
  "linear-gradient(135deg,#0ea5e9,#6366f1)",
  "linear-gradient(135deg,#10b981,#0ea5e9)",
  "linear-gradient(135deg,#f97316,#be185d)",
  "linear-gradient(135deg,#6366f1,#0891b2)",
];

const TIMELINE_COLORS = ["#ec4899", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#6366f1"];

const SceneThumb = memo(({ index }: { index: number }) => (
  <div
    className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0"
    style={{
      background: SCENE_GRADIENTS[index % SCENE_GRADIENTS.length],
      border: "1px solid rgba(255,255,255,0.1)",
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
    }}
  >
    <div
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), transparent 60%)",
      }}
    />
    <div
      className="absolute left-1 bottom-0.5 font-mono text-[9px] font-semibold text-white"
      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.7)" }}
    >
      {String(index + 1).padStart(2, "0")}
    </div>
  </div>
));
SceneThumb.displayName = "SceneThumb";

const MultiShotBuilder = memo(({ scenes, onChange, excludeNodeId }: MultiShotBuilderProps) => {
  const { t } = useLanguage();
  const effectiveScenes = scenes.length > 0 ? scenes : [{ prompt: "", duration: 3 }];

  const updateScene = useCallback(
    (idx: number, field: keyof SceneBlock, value: string | number) => {
      const next = effectiveScenes.map((s, i) =>
        i === idx ? { ...s, [field]: value } : s,
      );
      onChange(next);
    },
    [effectiveScenes, onChange],
  );

  const addScene = useCallback(() => {
    if (effectiveScenes.length >= MAX_SCENES) return;
    onChange([...effectiveScenes, { prompt: "", duration: 2 }]);
  }, [effectiveScenes, onChange]);

  const removeScene = useCallback(
    (idx: number) => {
      if (effectiveScenes.length <= 1) return;
      onChange(effectiveScenes.filter((_, i) => i !== idx));
    },
    [effectiveScenes, onChange],
  );

  const totalDuration = useMemo(
    () => effectiveScenes.reduce((s, sc) => s + Number(sc.duration || 0), 0),
    [effectiveScenes],
  );

  return (
    <div className="space-y-2.5">
      {/* Director Mode banner */}
      <div
        className="flex items-center justify-between px-2.5 py-2 rounded-[10px] border border-violet-400/20"
        style={{
          background:
            "linear-gradient(90deg, rgba(167,139,250,0.08), rgba(167,139,250,0.02))",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-violet-300"
            style={{
              background: "rgba(167,139,250,0.15)",
              border: "1px solid rgba(167,139,250,0.3)",
            }}
          >
            <Film className="w-2.5 h-2.5" />
          </div>
          <div className="leading-tight">
            <div className="text-[11px] font-semibold text-white">{t("multiShot.directorMode")}</div>
            <div className="text-[9.5px] font-mono text-white/45">
              {t("multiShot.storyboardScenes", { count: effectiveScenes.length, max: MAX_SCENES })}
            </div>
          </div>
        </div>
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-400/15 text-violet-200 font-mono font-semibold text-[10.5px] tracking-[0.04em]">
          <Clock className="w-2.5 h-2.5" />
          {t("multiShot.totalDuration", { seconds: totalDuration })}
        </div>
      </div>

      {/* Timeline ruler */}
      <div className="px-0.5">
        <div className="flex gap-0.5 h-[5px]">
          {effectiveScenes.map((s, i) => (
            <div
              key={i}
              className="rounded-[2px] opacity-85"
              style={{
                flex: Math.max(s.duration, 0.5),
                background: `linear-gradient(90deg, #a78bfa, ${TIMELINE_COLORS[i % TIMELINE_COLORS.length]})`,
              }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1 font-mono text-[9px] text-white/30">
          <span>{t("multiShot.zeroSeconds")}</span>
          <span>{totalDuration}{t("multiShot.secondsSuffix")}</span>
        </div>
      </div>

      {/* Scene cards */}
      <div className="space-y-2">
        {effectiveScenes.map((scene, idx) => (
          <div key={idx} className="fs-scene-card relative px-2.5 py-2 pl-3">
            {/* left accent bar */}
            <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-violet-400/60 rounded-l" />
            <div className="flex items-start gap-2.5">
              <SceneThumb index={idx} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <GripVertical className="w-2.5 h-2.5 text-white/30" />
                    <span className="font-mono text-[10px] font-semibold text-violet-300 tracking-[0.08em]">
                      {t("multiShot.sceneNumber", { number: String(idx + 1).padStart(2, "0") })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] font-mono text-[10px] text-white/85 tabular-nums">
                      <input
                        type="number"
                        min={MIN_DURATION}
                        max={15}
                        step={1}
                        value={scene.duration}
                        onChange={(e) =>
                          updateScene(idx, "duration", Math.max(MIN_DURATION, parseInt(e.target.value) || MIN_DURATION))
                        }
                        onClick={stop}
                        onMouseDown={stop}
                        onPointerDown={stop}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" || e.key === "Delete") e.stopPropagation();
                        }}
                        className="w-5 bg-transparent border-0 text-right font-mono text-[10px] text-white/85 outline-none nodrag nopan nowheel"
                      />
                      <span className="text-white/45">{t("multiShot.secondsSuffix")}</span>
                    </div>
                    {effectiveScenes.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeScene(idx); }}
                        onMouseDown={stop}
                        onPointerDown={stop}
                        className="w-5 h-5 rounded-md flex items-center justify-center text-white/30 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                        title={t("multiShot.removeScene")}
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                </div>
                <PromptMentionTextarea
                  value={scene.prompt}
                  onChange={(val) => updateScene(idx, "prompt", val)}
                  placeholder={t("multiShot.scenePromptPlaceholder", { scene: idx + 1 })}
                  excludeNodeId={excludeNodeId}
                  allowedNodeTypes={["inputNode", "bananaProNode", "klingVideoNode", "chatAiNode"]}
                  allowedTextVarTypes={["textInputNode"]}
                  className="min-h-[40px] max-h-[140px] text-[11px] font-mono"
                  maxLength={KLING_MULTISHOT_SCENE_LIMIT}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add scene */}
      {effectiveScenes.length < MAX_SCENES && (
        <button
          onClick={(e) => { e.stopPropagation(); addScene(); }}
          onMouseDown={stop}
          onPointerDown={stop}
          className={cn(
            "w-full flex items-center justify-center gap-1.5 py-2 rounded-[10px] border border-dashed transition-colors text-[11px] font-medium text-violet-300 nodrag",
            "border-violet-400/30 bg-violet-500/[0.03] hover:bg-violet-500/[0.08] hover:border-violet-400/50",
          )}
        >
          <Plus className="w-3 h-3" />
          {t("multiShot.addScene", { count: effectiveScenes.length, max: MAX_SCENES })}
        </button>
      )}
    </div>
  );
});

MultiShotBuilder.displayName = "MultiShotBuilder";
export default MultiShotBuilder;
