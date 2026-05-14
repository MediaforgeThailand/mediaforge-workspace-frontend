import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Save,
  X,
} from "lucide-react";
import { useProjectStore } from "../../stores/project-store";
import type {
  TextStyle,
  TextTransform,
  BubbleStyle,
  TextEffects,
  TextAnimationPreset,
} from "@/lib/openreel-core";

/**
 * Text-clip Inspector
 * --------------------
 * Replaces the default Video/Audio/Speed inspector when the selected clip is
 * a textClip. Shows two top tabs (Text | Animation), each with sub-tabs:
 *   - Text → Basic (fully wired) / Bubble (MVP) / Effects (MVP)
 *   - Animation → In / Out (uses existing applyTextAnimationPreset)
 *
 * All Basic-tab controls write to project-store via updateTextStyle so the
 * canvas-renderer picks them up live.
 */

type TopTab = "text" | "animation";
type TextSubTab = "basic" | "bubble" | "effects";
type AnimSubTab = "in" | "out";

const PRESET_STORAGE_KEY = "mediaforge:text-presets";

interface SavedPreset {
  id: string;
  name: string;
  style: Partial<TextStyle>;
  createdAt: number;
}

const FONT_OPTIONS = [
  "System",
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Courier New",
  "Georgia",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Impact",
  "Comic Sans MS",
  "Inter",
  "Poppins",
  "Montserrat",
  "Roboto",
  "Open Sans",
];

const BUBBLE_OPTIONS: { id: BubbleStyle; label: string }[] = [
  { id: "none", label: "None" },
  { id: "rounded-rect", label: "Rounded" },
  { id: "speech", label: "Speech" },
  { id: "thought", label: "Thought" },
  { id: "cloud", label: "Cloud" },
  { id: "star", label: "Star" },
];

const IN_ANIMATION_OPTIONS: { id: TextAnimationPreset; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slide-left", label: "Slide L" },
  { id: "slide-right", label: "Slide R" },
  { id: "scale", label: "Zoom In" },
  { id: "typewriter", label: "Typewriter" },
  { id: "bounce", label: "Bounce" },
];

// We re-use the same preset set for "out" — the existing engine doesn't
// distinguish entry vs exit animations, so we apply whichever preset the user
// picks. This is documented as a partial limitation.
const OUT_ANIMATION_OPTIONS: { id: TextAnimationPreset; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade Out" },
  { id: "slide-left", label: "Slide L" },
  { id: "slide-right", label: "Slide R" },
  { id: "scale", label: "Zoom Out" },
];

const TopTabs: React.FC<{
  active: TopTab;
  onChange: (t: TopTab) => void;
}> = ({ active, onChange }) => (
  <div
    data-testid="text-inspector-top-tabs"
    className="flex border-b border-border mb-3"
  >
    {(["text", "animation"] as TopTab[]).map((id) => (
      <button
        key={id}
        data-testid={`text-inspector-tab-${id}`}
        onClick={() => onChange(id)}
        className={`relative flex-1 px-3 py-2 text-[11px] font-medium capitalize transition-colors ${
          active === id
            ? "text-text-primary"
            : "text-text-secondary hover:text-text-primary"
        }`}
      >
        {id}
        {active === id && (
          <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-t-full" />
        )}
      </button>
    ))}
  </div>
);

const SubTabs: React.FC<{
  ids: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}> = ({ ids, active, onChange }) => (
  <div className="flex gap-1 mb-3">
    {ids.map((sub) => {
      const isActive = active === sub.id;
      return (
        <button
          key={sub.id}
          data-testid={`text-inspector-subtab-${sub.id}`}
          onClick={() => onChange(sub.id)}
          className={`px-2.5 py-1 rounded-md text-[10px] transition-colors ${
            isActive
              ? "bg-primary/20 text-primary"
              : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
          }`}
        >
          {sub.label}
        </button>
      );
    })}
  </div>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex items-center justify-between gap-3 mb-3">
    <span className="text-[11px] text-text-secondary w-16 shrink-0">{label}</span>
    <div className="flex-1 min-w-0 flex items-center gap-2 justify-end">
      {children}
    </div>
  </div>
);

const BasicTab: React.FC<{
  clipId: string;
}> = ({ clipId }) => {
  const {
    getTextClip,
    updateTextContent,
    updateTextStyle,
    project,
  } = useProjectStore();
  const textClip = useMemo(
    () => getTextClip(clipId),
    [clipId, getTextClip, project.modifiedAt],
  );

  const style = textClip?.style;
  const text = textClip?.text ?? "";

  const update = useCallback(
    (patch: Partial<TextStyle>) => {
      updateTextStyle(clipId, patch);
    },
    [clipId, updateTextStyle],
  );

  const [presets, setPresets] = useState<SavedPreset[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESET_STORAGE_KEY);
      if (raw) setPresets(JSON.parse(raw));
    } catch {
      // ignore corrupted store
    }
  }, []);

  const savePreset = useCallback(() => {
    if (!style) return;
    const newPreset: SavedPreset = {
      id: `preset-${Date.now()}`,
      name: `Preset ${presets.length + 1}`,
      style: {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        textDecoration: style.textDecoration,
        textTransform: style.textTransform,
        color: style.color,
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight,
        textAlign: style.textAlign,
        verticalAlign: style.verticalAlign,
      },
      createdAt: Date.now(),
    };
    const next = [...presets, newPreset];
    setPresets(next);
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage may be unavailable in some sandboxes
    }
  }, [style, presets]);

  const applyPreset = useCallback(
    (p: SavedPreset) => {
      update(p.style);
    },
    [update],
  );

  const removePreset = useCallback(
    (id: string) => {
      const next = presets.filter((p) => p.id !== id);
      setPresets(next);
      try {
        localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [presets],
  );

  if (!textClip || !style) {
    return (
      <div className="p-4 text-center" data-testid="text-inspector-empty">
        <Type size={24} className="mx-auto mb-2 text-text-muted" />
        <p className="text-[10px] text-text-muted">No text clip selected</p>
      </div>
    );
  }

  const isBold =
    style.fontWeight === "bold" ||
    (typeof style.fontWeight === "number" && style.fontWeight >= 600);
  const isItalic = style.fontStyle === "italic";
  const isUnderline = style.textDecoration === "underline";

  return (
    <div className="space-y-3" data-testid="text-inspector-basic">
      {/* Text content textarea */}
      <div>
        <label className="text-[11px] text-text-secondary block mb-1.5">
          Text content
        </label>
        <textarea
          data-testid="text-inspector-content"
          data-text-content-editor="true"
          value={text}
          onChange={(e) => updateTextContent(clipId, e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          rows={5}
          placeholder="Type your text here..."
          className="w-full min-h-[6rem] px-3 py-2 text-sm text-text-primary bg-background-tertiary border border-border rounded-md resize-y outline-none focus:border-primary"
          style={{ fontFamily: style.fontFamily }}
        />
      </div>

      {/* Font dropdown */}
      <Row label="Font">
        <select
          data-testid="text-inspector-font"
          value={style.fontFamily}
          onChange={(e) => update({ fontFamily: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
          className="flex-1 px-2 py-1.5 text-[11px] bg-background-tertiary border border-border rounded text-text-primary outline-none focus:border-primary"
          style={{ fontFamily: style.fontFamily }}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
      </Row>

      {/* Font size slider + number */}
      <Row label="Font size">
        <input
          data-testid="text-inspector-fontsize-slider"
          type="range"
          min={8}
          max={120}
          value={Math.min(120, Math.max(8, style.fontSize || 15))}
          onChange={(e) => update({ fontSize: parseInt(e.target.value, 10) })}
          className="flex-1 accent-primary"
        />
        <input
          data-testid="text-inspector-fontsize-input"
          type="number"
          min={4}
          max={300}
          value={style.fontSize}
          onChange={(e) =>
            update({ fontSize: parseInt(e.target.value, 10) || 15 })
          }
          onKeyDown={(e) => e.stopPropagation()}
          className="w-16 px-2 py-1 text-[11px] bg-background-tertiary border border-border rounded text-text-primary text-right outline-none focus:border-primary"
        />
      </Row>

      {/* Pattern: B / U / I */}
      <Row label="Pattern">
        <div className="flex gap-1">
          <button
            data-testid="text-inspector-bold"
            onClick={() =>
              update({ fontWeight: isBold ? "normal" : "bold" })
            }
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
              isBold
                ? "bg-primary/20 text-primary"
                : "bg-background-tertiary border border-border text-text-secondary hover:text-text-primary"
            }`}
            title="Bold"
          >
            <Bold size={14} />
          </button>
          <button
            data-testid="text-inspector-underline"
            onClick={() =>
              update({ textDecoration: isUnderline ? "none" : "underline" })
            }
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
              isUnderline
                ? "bg-primary/20 text-primary"
                : "bg-background-tertiary border border-border text-text-secondary hover:text-text-primary"
            }`}
            title="Underline"
          >
            <Underline size={14} />
          </button>
          <button
            data-testid="text-inspector-italic"
            onClick={() =>
              update({ fontStyle: isItalic ? "normal" : "italic" })
            }
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
              isItalic
                ? "bg-primary/20 text-primary"
                : "bg-background-tertiary border border-border text-text-secondary hover:text-text-primary"
            }`}
            title="Italic"
          >
            <Italic size={14} />
          </button>
        </div>
      </Row>

      {/* Case: TT / tt / Tt */}
      <Row label="Case">
        <div className="flex gap-1">
          {([
            { id: "uppercase", label: "TT" },
            { id: "lowercase", label: "tt" },
            { id: "capitalize", label: "Tt" },
          ] as { id: TextTransform; label: string }[]).map((opt) => {
            const isActive = style.textTransform === opt.id;
            return (
              <button
                key={opt.id}
                data-testid={`text-inspector-case-${opt.id}`}
                onClick={() =>
                  update({ textTransform: isActive ? "none" : opt.id })
                }
                className={`w-8 h-8 flex items-center justify-center rounded text-[11px] font-medium transition-colors ${
                  isActive
                    ? "bg-primary/20 text-primary"
                    : "bg-background-tertiary border border-border text-text-secondary hover:text-text-primary"
                }`}
                title={opt.id}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </Row>

      {/* Color picker */}
      <Row label="Color">
        <div className="flex items-center gap-2">
          <input
            data-testid="text-inspector-color"
            type="color"
            value={style.color || "#ffffff"}
            onChange={(e) => update({ color: e.target.value })}
            className="w-7 h-7 rounded border border-border cursor-pointer"
          />
          <span className="text-[10px] font-mono text-text-muted uppercase">
            {style.color}
          </span>
          {/* V6 polish: removed decorative keyframe diamond — the
              KeyframesSection it gestured at was deleted, and there's no
              "Add color keyframe at playhead" action wired. */}
        </div>
      </Row>

      {/* Character spacing (letterSpacing) */}
      <Row label="Character">
        <input
          data-testid="text-inspector-letter-spacing"
          type="number"
          min={-10}
          max={50}
          step={1}
          value={style.letterSpacing ?? 0}
          onChange={(e) =>
            update({ letterSpacing: parseFloat(e.target.value) || 0 })
          }
          onKeyDown={(e) => e.stopPropagation()}
          className="w-20 px-2 py-1 text-[11px] bg-background-tertiary border border-border rounded text-text-primary text-right outline-none focus:border-primary"
        />
        <span className="text-[10px] text-text-muted">px</span>
      </Row>

      {/* Line height */}
      <Row label="Line">
        <input
          data-testid="text-inspector-line-height"
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={style.lineHeight ?? 1.2}
          onChange={(e) =>
            update({ lineHeight: parseFloat(e.target.value) || 1.2 })
          }
          onKeyDown={(e) => e.stopPropagation()}
          className="w-20 px-2 py-1 text-[11px] bg-background-tertiary border border-border rounded text-text-primary text-right outline-none focus:border-primary"
        />
      </Row>

      {/* Alignment row: 3 horizontal + 2 vertical */}
      <Row label="Align">
        <div className="flex gap-1">
          {([
            { id: "left", Icon: AlignLeft, type: "h" as const },
            { id: "center", Icon: AlignCenter, type: "h" as const },
            { id: "right", Icon: AlignRight, type: "h" as const },
          ]).map(({ id, Icon }) => {
            const isActive = style.textAlign === id;
            return (
              <button
                key={id}
                data-testid={`text-inspector-align-${id}`}
                onClick={() =>
                  update({ textAlign: id as TextStyle["textAlign"] })
                }
                className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                  isActive
                    ? "bg-primary/20 text-primary"
                    : "bg-background-tertiary border border-border text-text-secondary hover:text-text-primary"
                }`}
                title={`Align ${id}`}
              >
                <Icon size={12} />
              </button>
            );
          })}
          <div className="w-px bg-border mx-1" />
          {([
            { id: "top" as const, label: "T" },
            { id: "bottom" as const, label: "B" },
          ]).map(({ id, label }) => {
            const isActive = style.verticalAlign === id;
            return (
              <button
                key={id}
                data-testid={`text-inspector-valign-${id}`}
                onClick={() => update({ verticalAlign: id })}
                className={`w-7 h-7 flex items-center justify-center rounded text-[10px] font-medium transition-colors ${
                  isActive
                    ? "bg-primary/20 text-primary"
                    : "bg-background-tertiary border border-border text-text-secondary hover:text-text-primary"
                }`}
                title={`Vertical ${id}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Row>

      {/* Preset chips + Save button */}
      <div className="pt-3 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-text-secondary">
            Preset style
          </span>
          <button
            data-testid="text-inspector-save-preset"
            onClick={savePreset}
            className="flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded text-[10px] font-medium hover:bg-primary/90 transition-colors"
          >
            <Save size={10} />
            Save as preset
          </button>
        </div>
        {presets.length > 0 && (
          <div
            data-testid="text-inspector-preset-chips"
            className="flex flex-wrap gap-1.5"
          >
            {presets.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-1 px-2 py-1 bg-background-tertiary border border-border rounded-full text-[10px]"
              >
                <button
                  onClick={() => applyPreset(p)}
                  className="text-text-primary hover:text-primary transition-colors"
                  title="Apply preset"
                >
                  {p.name}
                </button>
                <button
                  onClick={() => removePreset(p.id)}
                  className="text-text-muted hover:text-red-400 transition-colors"
                  title="Remove preset"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        {presets.length === 0 && (
          <p className="text-[10px] text-text-muted">
            No saved presets yet. Save the current basic-tab settings.
          </p>
        )}
      </div>
    </div>
  );
};

const BubbleSubTab: React.FC<{ clipId: string }> = ({ clipId }) => {
  const { getTextClip, updateTextStyle, project } = useProjectStore();
  const textClip = useMemo(
    () => getTextClip(clipId),
    [clipId, getTextClip, project.modifiedAt],
  );
  const active = textClip?.style.bubbleStyle ?? "none";

  if (!textClip) return null;

  return (
    <div className="space-y-3" data-testid="text-inspector-bubble">
      <p className="text-[10px] text-text-muted">
        Pick a bubble shape. Renders behind the text in the preview. The "none"
        option turns the bubble off.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {BUBBLE_OPTIONS.map((b) => {
          const isActive = active === b.id;
          return (
            <button
              key={b.id}
              data-testid={`text-inspector-bubble-${b.id}`}
              onClick={() => updateTextStyle(clipId, { bubbleStyle: b.id })}
              className={`flex flex-col items-center justify-center h-16 rounded-md border transition-colors ${
                isActive
                  ? "bg-primary/15 border-primary text-primary"
                  : "bg-background-tertiary border-border text-text-secondary hover:text-text-primary"
              }`}
            >
              <div
                className="w-8 h-5 rounded mb-1"
                style={{
                  background:
                    isActive
                      ? "currentColor"
                      : "rgba(255,255,255,0.18)",
                  borderRadius:
                    b.id === "rounded-rect" || b.id === "speech" ? 6 : "50%",
                }}
              />
              <span className="text-[10px]">{b.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const EffectsSubTab: React.FC<{ clipId: string }> = ({ clipId }) => {
  const { getTextClip, updateTextStyle, project } = useProjectStore();
  const textClip = useMemo(
    () => getTextClip(clipId),
    [clipId, getTextClip, project.modifiedAt],
  );

  if (!textClip) return null;

  const effects: TextEffects = textClip.style.effects || {};

  const patchEffect = <K extends keyof TextEffects>(
    key: K,
    patch: Partial<NonNullable<TextEffects[K]>>,
  ) => {
    const current = (effects[key] || {}) as NonNullable<TextEffects[K]>;
    const next: TextEffects = {
      ...effects,
      [key]: { ...current, ...patch },
    };
    updateTextStyle(clipId, { effects: next });
  };

  const Toggle: React.FC<{
    label: string;
    enabled: boolean;
    onToggle: () => void;
  }> = ({ label, enabled, onToggle }) => (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-text-secondary font-medium">
        {label}
      </span>
      <button
        onClick={onToggle}
        className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
          enabled ? "bg-primary" : "bg-background-tertiary border border-border"
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-4" : ""
          }`}
        />
      </button>
    </div>
  );

  return (
    <div className="space-y-5" data-testid="text-inspector-effects">
      {/* Shadow */}
      <div className="space-y-2 p-3 bg-background-tertiary rounded-md">
        <Toggle
          label="Shadow"
          enabled={!!effects.shadow?.enabled}
          onToggle={() =>
            patchEffect("shadow", {
              enabled: !effects.shadow?.enabled,
              color: effects.shadow?.color ?? "#000000",
              offsetX: effects.shadow?.offsetX ?? 2,
              offsetY: effects.shadow?.offsetY ?? 2,
              blur: effects.shadow?.blur ?? 4,
            })
          }
        />
        {effects.shadow?.enabled && (
          <>
            <Row label="X">
              <input
                type="number"
                value={effects.shadow.offsetX}
                onChange={(e) =>
                  patchEffect("shadow", {
                    offsetX: parseFloat(e.target.value) || 0,
                  })
                }
                onKeyDown={(e) => e.stopPropagation()}
                className="w-20 px-2 py-1 text-[10px] bg-background-secondary border border-border rounded text-right text-text-primary outline-none"
              />
            </Row>
            <Row label="Y">
              <input
                type="number"
                value={effects.shadow.offsetY}
                onChange={(e) =>
                  patchEffect("shadow", {
                    offsetY: parseFloat(e.target.value) || 0,
                  })
                }
                onKeyDown={(e) => e.stopPropagation()}
                className="w-20 px-2 py-1 text-[10px] bg-background-secondary border border-border rounded text-right text-text-primary outline-none"
              />
            </Row>
            <Row label="Blur">
              <input
                type="number"
                value={effects.shadow.blur}
                onChange={(e) =>
                  patchEffect("shadow", {
                    blur: parseFloat(e.target.value) || 0,
                  })
                }
                onKeyDown={(e) => e.stopPropagation()}
                className="w-20 px-2 py-1 text-[10px] bg-background-secondary border border-border rounded text-right text-text-primary outline-none"
              />
            </Row>
            <Row label="Color">
              <input
                type="color"
                value={effects.shadow.color}
                onChange={(e) => patchEffect("shadow", { color: e.target.value })}
                className="w-7 h-7 rounded border border-border cursor-pointer"
              />
            </Row>
          </>
        )}
      </div>

      {/* Glow */}
      <div className="space-y-2 p-3 bg-background-tertiary rounded-md">
        <Toggle
          label="Glow"
          enabled={!!effects.glow?.enabled}
          onToggle={() =>
            patchEffect("glow", {
              enabled: !effects.glow?.enabled,
              color: effects.glow?.color ?? "#ffff66",
              intensity: effects.glow?.intensity ?? 0.5,
            })
          }
        />
        {effects.glow?.enabled && (
          <>
            <Row label="Intensity">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={effects.glow.intensity}
                onChange={(e) =>
                  patchEffect("glow", { intensity: parseFloat(e.target.value) })
                }
                className="flex-1 accent-primary"
              />
              <span className="text-[10px] text-text-muted w-8 text-right">
                {effects.glow.intensity.toFixed(2)}
              </span>
            </Row>
            <Row label="Color">
              <input
                type="color"
                value={effects.glow.color}
                onChange={(e) => patchEffect("glow", { color: e.target.value })}
                className="w-7 h-7 rounded border border-border cursor-pointer"
              />
            </Row>
          </>
        )}
      </div>

      {/* Outline */}
      <div className="space-y-2 p-3 bg-background-tertiary rounded-md">
        <Toggle
          label="Outline"
          enabled={!!effects.outline?.enabled}
          onToggle={() =>
            patchEffect("outline", {
              enabled: !effects.outline?.enabled,
              color: effects.outline?.color ?? "#000000",
              width: effects.outline?.width ?? 2,
            })
          }
        />
        {effects.outline?.enabled && (
          <>
            <Row label="Width">
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={effects.outline.width}
                onChange={(e) =>
                  patchEffect("outline", {
                    width: parseFloat(e.target.value) || 0,
                  })
                }
                onKeyDown={(e) => e.stopPropagation()}
                className="w-20 px-2 py-1 text-[10px] bg-background-secondary border border-border rounded text-right text-text-primary outline-none"
              />
            </Row>
            <Row label="Color">
              <input
                type="color"
                value={effects.outline.color}
                onChange={(e) =>
                  patchEffect("outline", { color: e.target.value })
                }
                className="w-7 h-7 rounded border border-border cursor-pointer"
              />
            </Row>
          </>
        )}
      </div>

      {/* Background */}
      <div className="space-y-2 p-3 bg-background-tertiary rounded-md">
        <Toggle
          label="Background"
          enabled={!!effects.background?.enabled}
          onToggle={() =>
            patchEffect("background", {
              enabled: !effects.background?.enabled,
              color: effects.background?.color ?? "rgba(0,0,0,0.6)",
              cornerRadius: effects.background?.cornerRadius ?? 8,
            })
          }
        />
        {effects.background?.enabled && (
          <>
            <Row label="Color">
              <input
                type="color"
                value={
                  effects.background.color.startsWith("rgba")
                    ? "#000000"
                    : effects.background.color
                }
                onChange={(e) =>
                  patchEffect("background", { color: e.target.value })
                }
                className="w-7 h-7 rounded border border-border cursor-pointer"
              />
            </Row>
            <Row label="Radius">
              <input
                type="number"
                min={0}
                max={40}
                step={1}
                value={effects.background.cornerRadius}
                onChange={(e) =>
                  patchEffect("background", {
                    cornerRadius: parseFloat(e.target.value) || 0,
                  })
                }
                onKeyDown={(e) => e.stopPropagation()}
                className="w-20 px-2 py-1 text-[10px] bg-background-secondary border border-border rounded text-right text-text-primary outline-none"
              />
            </Row>
          </>
        )}
      </div>
    </div>
  );
};

const AnimationSubTab: React.FC<{
  clipId: string;
  direction: AnimSubTab;
}> = ({ clipId, direction }) => {
  const { getTextClip, applyTextAnimationPreset, project } = useProjectStore();
  const textClip = useMemo(
    () => getTextClip(clipId),
    [clipId, getTextClip, project.modifiedAt],
  );

  if (!textClip) return null;

  const options =
    direction === "in" ? IN_ANIMATION_OPTIONS : OUT_ANIMATION_OPTIONS;
  const inPresetActive = textClip.animation?.preset ?? "none";
  // V6.5: `outPreset` may differ from `preset`. Fall back to `preset` for
  // backwards-compat with projects saved before the split.
  const outPresetActive =
    textClip.animation?.outPreset ?? textClip.animation?.preset ?? "none";
  const active = direction === "in" ? inPresetActive : outPresetActive;
  const inDur = textClip.animation?.inDuration ?? 0.5;
  const outDur = textClip.animation?.outDuration ?? 0.5;

  // When the user picks a preset on the "In" tab, set the In preset; on
  // the "Out" tab, set just the outPreset (preserving the existing In
  // preset).
  const apply = (next: TextAnimationPreset) => {
    if (direction === "in") {
      applyTextAnimationPreset(
        clipId,
        next,
        inDur,
        outDur,
        undefined,
        outPresetActive,
      );
    } else {
      applyTextAnimationPreset(
        clipId,
        inPresetActive,
        inDur,
        outDur,
        undefined,
        next,
      );
    }
  };

  return (
    <div className="space-y-3" data-testid={`text-inspector-animation-${direction}`}>
      <p className="text-[10px] text-text-muted">
        {direction === "in"
          ? "Plays when the text appears."
          : "Plays when the text disappears. Pick a different exit animation from the entrance — V6.5 supports independent in/out presets."}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((a) => {
          const isActive = active === a.id;
          return (
            <button
              key={a.id}
              data-testid={`text-inspector-anim-${direction}-${a.id}`}
              onClick={() => apply(a.id)}
              className={`flex flex-col items-center justify-center h-16 w-20 rounded-md border transition-colors ${
                isActive
                  ? "bg-primary/15 border-primary text-primary"
                  : "bg-background-tertiary border-border text-text-secondary hover:text-text-primary"
              }`}
            >
              <div
                className={`w-8 h-1 rounded mb-1 ${
                  isActive ? "bg-primary" : "bg-text-muted"
                }`}
              />
              <span className="text-[10px]">{a.label}</span>
            </button>
          );
        })}
      </div>

      <div className="pt-2 border-t border-border space-y-2">
        <Row label="In dur">
          <input
            type="range"
            min={0}
            max={3}
            step={0.1}
            value={inDur}
            onChange={(e) =>
              applyTextAnimationPreset(
                clipId,
                inPresetActive,
                parseFloat(e.target.value),
                outDur,
                undefined,
                outPresetActive,
              )
            }
            className="flex-1 accent-primary"
          />
          <span className="text-[10px] text-text-muted w-10 text-right">
            {inDur.toFixed(1)}s
          </span>
        </Row>
        <Row label="Out dur">
          <input
            type="range"
            min={0}
            max={3}
            step={0.1}
            value={outDur}
            onChange={(e) =>
              applyTextAnimationPreset(
                clipId,
                inPresetActive,
                inDur,
                parseFloat(e.target.value),
                undefined,
                outPresetActive,
              )
            }
            className="flex-1 accent-primary"
          />
          <span className="text-[10px] text-text-muted w-10 text-right">
            {outDur.toFixed(1)}s
          </span>
        </Row>
      </div>
    </div>
  );
};

export const TextClipInspector: React.FC<{ clipId: string }> = ({ clipId }) => {
  const [topTab, setTopTab] = useState<TopTab>("text");
  const [textSubTab, setTextSubTab] = useState<TextSubTab>("basic");
  const [animSubTab, setAnimSubTab] = useState<AnimSubTab>("in");

  return (
    <div data-testid="text-clip-inspector">
      <TopTabs active={topTab} onChange={setTopTab} />

      {topTab === "text" && (
        <>
          <SubTabs
            ids={[
              { id: "basic", label: "Basic" },
              { id: "bubble", label: "Bubble" },
              { id: "effects", label: "Effects" },
            ]}
            active={textSubTab}
            onChange={(id) => setTextSubTab(id as TextSubTab)}
          />
          {textSubTab === "basic" && <BasicTab clipId={clipId} />}
          {textSubTab === "bubble" && <BubbleSubTab clipId={clipId} />}
          {textSubTab === "effects" && <EffectsSubTab clipId={clipId} />}
        </>
      )}

      {topTab === "animation" && (
        <>
          <SubTabs
            ids={[
              { id: "in", label: "In" },
              { id: "out", label: "Out" },
            ]}
            active={animSubTab}
            onChange={(id) => setAnimSubTab(id as AnimSubTab)}
          />
          <AnimationSubTab clipId={clipId} direction={animSubTab} />
        </>
      )}
    </div>
  );
};

export default TextClipInspector;
