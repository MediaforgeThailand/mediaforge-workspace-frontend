/**
 * Caption preset definitions + load/save helpers for user-defined presets.
 *
 * Built-in presets are hardcoded so they're always available. User presets
 * live in localStorage under `mediaforge:caption-presets`.
 */

export type CaptionAnimation =
  | "none"
  | "wordHighlight"
  | "typewriter"
  | "slideIn"
  | "fade";

export type CaptionCase = "normal" | "upper" | "lower" | "title";
export type CaptionPositionV = "top" | "middle" | "bottom";
export type CaptionPositionH = "left" | "center" | "right";

export interface CaptionStrokeStyle {
  enabled: boolean;
  color: string;
  width: number;
}

export interface CaptionShadowStyle {
  enabled: boolean;
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

export interface CaptionBackgroundStyle {
  enabled: boolean;
  color: string;
  padding: number;
  cornerRadius: number;
}

export interface CaptionStyleSettings {
  /** Font family name (must be a CSS-registered font). */
  font: string;
  /** Font weight 100-900 or "normal"/"bold". */
  weight: number;
  /** Italic toggle. */
  italic: boolean;
  /** Font size in px. */
  size: number;
  /** Text case transform. */
  case: CaptionCase;
  /** Fill color (hex / rgba). */
  fill: string;
  /** Stroke outline. */
  stroke: CaptionStrokeStyle;
  /** Drop shadow. */
  shadow: CaptionShadowStyle;
  /** Highlight rectangle behind text. */
  background: CaptionBackgroundStyle;
  /** Active-word highlight color (only used when animation = wordHighlight). */
  highlightColor: string;
  /** Animation style. */
  animation: CaptionAnimation;

  // Layout
  /** Maximum words per caption line. */
  wordsPerLine: number;
  /** Max duration per caption line, in seconds. */
  maxLineDuration: number;
  /** Vertical placement (relative to canvas). */
  positionV: CaptionPositionV;
  /** Horizontal placement. */
  positionH: CaptionPositionH;
  /** Margin from the chosen edge, in px. */
  margin: number;
}

export interface CaptionPreset {
  id: string;
  name: string;
  /** Optional preview thumbnail data URL (user-saved presets only). */
  thumbnail?: string;
  /** Whether the preset is editable / deletable. */
  builtin?: boolean;
  /** The style payload itself. */
  settings: CaptionStyleSettings;
}

/** Default settings — used when the panel first opens and no preset is selected. */
export const DEFAULT_CAPTION_SETTINGS: CaptionStyleSettings = {
  font: "Inter",
  weight: 800,
  italic: false,
  size: 56,
  case: "upper",
  fill: "#ffffff",
  stroke: { enabled: true, color: "#000000", width: 6 },
  shadow: { enabled: false, offsetX: 2, offsetY: 2, blur: 4, color: "rgba(0,0,0,0.5)" },
  background: { enabled: false, color: "rgba(0,0,0,0.6)", padding: 12, cornerRadius: 8 },
  highlightColor: "#F4FF00",
  animation: "wordHighlight",
  wordsPerLine: 3,
  maxLineDuration: 2.5,
  positionV: "middle",
  positionH: "center",
  margin: 100,
};

export const BUILTIN_CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: "tiktok-yellow",
    name: "TikTok Yellow",
    builtin: true,
    settings: {
      ...DEFAULT_CAPTION_SETTINGS,
      font: "Inter",
      weight: 800,
      size: 56,
      fill: "#ffffff",
      stroke: { enabled: true, color: "#000000", width: 6 },
      shadow: { enabled: false, offsetX: 2, offsetY: 2, blur: 4, color: "rgba(0,0,0,0.5)" },
      background: { enabled: false, color: "rgba(0,0,0,0.6)", padding: 12, cornerRadius: 8 },
      highlightColor: "#F4FF00",
      animation: "wordHighlight",
      case: "upper",
      positionV: "middle",
      positionH: "center",
      margin: 100,
      wordsPerLine: 3,
      maxLineDuration: 2.5,
    },
  },
  {
    id: "youtube-subtitle",
    name: "YouTube Subtitle",
    builtin: true,
    settings: {
      ...DEFAULT_CAPTION_SETTINGS,
      font: "Inter",
      weight: 600,
      size: 40,
      fill: "#ffffff",
      stroke: { enabled: true, color: "#000000", width: 3 },
      shadow: { enabled: false, offsetX: 0, offsetY: 0, blur: 0, color: "rgba(0,0,0,0.5)" },
      background: { enabled: true, color: "rgba(0,0,0,0.6)", padding: 8, cornerRadius: 4 },
      highlightColor: "#F4FF00",
      animation: "none",
      case: "normal",
      positionV: "bottom",
      positionH: "center",
      margin: 60,
      wordsPerLine: 7,
      maxLineDuration: 4,
    },
  },
  {
    id: "cinema-clean",
    name: "Cinema Clean",
    builtin: true,
    settings: {
      ...DEFAULT_CAPTION_SETTINGS,
      font: "Inter",
      weight: 400,
      size: 44,
      fill: "#ffffff",
      stroke: { enabled: false, color: "#000000", width: 0 },
      shadow: { enabled: true, offsetX: 0, offsetY: 1, blur: 4, color: "rgba(0,0,0,0.55)" },
      background: { enabled: false, color: "rgba(0,0,0,0)", padding: 0, cornerRadius: 0 },
      highlightColor: "#F4FF00",
      animation: "fade",
      case: "normal",
      positionV: "bottom",
      positionH: "center",
      margin: 80,
      wordsPerLine: 8,
      maxLineDuration: 4,
    },
  },
  {
    id: "reels-pop",
    name: "Reels Pop",
    builtin: true,
    settings: {
      ...DEFAULT_CAPTION_SETTINGS,
      font: "Inter",
      weight: 900,
      size: 60,
      fill: "#ffffff",
      stroke: { enabled: true, color: "#000000", width: 8 },
      shadow: { enabled: false, offsetX: 2, offsetY: 2, blur: 4, color: "rgba(0,0,0,0.5)" },
      background: { enabled: false, color: "rgba(0,0,0,0.6)", padding: 12, cornerRadius: 8 },
      highlightColor: "#ff4d6d",
      animation: "wordHighlight",
      case: "upper",
      positionV: "middle",
      positionH: "center",
      margin: 100,
      wordsPerLine: 2,
      maxLineDuration: 2,
    },
  },
];

const STORAGE_KEY = "mediaforge:caption-presets";

interface PersistedPresetFile {
  version: 1;
  presets: CaptionPreset[];
}

export function loadUserPresets(): CaptionPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedPresetFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.presets)) return [];
    return parsed.presets.map((p) => ({ ...p, builtin: false }));
  } catch {
    return [];
  }
}

export function saveUserPreset(preset: CaptionPreset): void {
  const existing = loadUserPresets();
  // Replace any existing preset with the same id, otherwise append.
  const next = existing.some((p) => p.id === preset.id)
    ? existing.map((p) => (p.id === preset.id ? preset : p))
    : [...existing, preset];
  const file: PersistedPresetFile = { version: 1, presets: next };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(file)); } catch { /* ignore quota */ }
}

export function deleteUserPreset(id: string): void {
  const existing = loadUserPresets();
  const next = existing.filter((p) => p.id !== id);
  const file: PersistedPresetFile = { version: 1, presets: next };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(file)); } catch { /* ignore */ }
}

/** Combined list of built-in + user presets. */
export function listAllPresets(): CaptionPreset[] {
  return [...BUILTIN_CAPTION_PRESETS, ...loadUserPresets()];
}

/**
 * Apply the case transform to a string. Mirrored from the renderer so
 * the preview can show what the live render will look like.
 */
export function applyCaptionCase(text: string, c: CaptionCase): string {
  switch (c) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "title":
      return text.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
    case "normal":
    default:
      return text;
  }
}
