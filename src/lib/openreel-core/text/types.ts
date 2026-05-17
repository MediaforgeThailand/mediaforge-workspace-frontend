import type { Transform, Keyframe, EasingType } from "../types/timeline";
import type { EmphasisAnimation } from "../graphics/types";

export interface TextClip {
  readonly id: string;
  readonly trackId: string;
  readonly startTime: number;
  readonly duration: number;
  readonly text: string;
  readonly style: TextStyle;
  readonly transform: Transform;
  readonly animation?: TextAnimation;
  readonly keyframes: Keyframe[];
  readonly blendMode?: import("../video/types").BlendMode;
  readonly blendOpacity?: number;
  readonly emphasisAnimation?: EmphasisAnimation;
  /**
   * Word-level timing for caption-style text. Older projects may use these
   * with legacy word-highlight metadata.
   * Times are in absolute timeline seconds (NOT clip-relative).
   */
  readonly words?: ReadonlyArray<{
    readonly text: string;
    readonly start: number;
    readonly end: number;
  }>;
  /**
   * Metadata identifying this clip as part of an AI-generated caption group.
   * Group control (delete-all / re-style-all / shift-Y) keys off `groupId`.
   */
  readonly captionMeta?: CaptionClipMeta;
}

export interface CaptionClipMeta {
  /** Shared by all clips in a single generation pass. */
  readonly groupId: string;
  /** Generation timestamp (epoch ms). */
  readonly generatedAt: number;
  /** Whisper-detected or user-selected language. */
  readonly language: string;
  /** Source media clip ID that was transcribed. */
  readonly sourceClipId: string;
  /** Caption animation style. */
  readonly animation:
    | "none"
    | "wordHighlight"
    | "typewriter"
    | "slideIn"
    | "fade"
    | "slideUp"
    | "slideDown"
    | "scale"
    | "pop";
  /** Accent/effect color for glow or emphasis animations. */
  readonly accentColor?: string;
  /** Legacy word-highlight color field kept for older saved projects. */
  readonly highlightColor: string;
}

export interface TextStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: FontWeight;
  readonly fontStyle: "normal" | "italic";
  readonly color: string;
  readonly backgroundColor?: string;
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly shadowColor?: string;
  readonly shadowBlur?: number;
  readonly shadowOffsetX?: number;
  readonly shadowOffsetY?: number;
  readonly textAlign: TextAlign;
  readonly verticalAlign: VerticalAlign;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly textDecoration?: TextDecoration;
  /** Optional CSS-style transform applied at render time. */
  readonly textTransform?: TextTransform;
  /** Optional speech-bubble background style (rendered as SVG path behind text). */
  readonly bubbleStyle?: BubbleStyle;
  /** Optional text effects (glow / outline / background — shadow already
   * exists above). Each entry's `enabled` flag controls whether the renderer
   * applies it. */
  readonly effects?: TextEffects;
}

export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize";

export type BubbleStyle =
  | "none"
  | "rounded-rect"
  | "speech"
  | "thought"
  | "cloud"
  | "star";

export interface TextEffects {
  readonly shadow?: {
    readonly enabled: boolean;
    readonly color: string;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly blur: number;
  };
  readonly glow?: {
    readonly enabled: boolean;
    readonly color: string;
    readonly intensity: number;
  };
  readonly outline?: {
    readonly enabled: boolean;
    readonly color: string;
    readonly width: number;
  };
  readonly background?: {
    readonly enabled: boolean;
    readonly color: string;
    readonly cornerRadius: number;
  };
}

export type FontWeight =
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900
  | "normal"
  | "bold";

export type TextAlign = "left" | "center" | "right" | "justify";

export type VerticalAlign = "top" | "middle" | "bottom";

export type TextDecoration = "none" | "underline" | "line-through" | "overline";

export interface TextAnimation {
  /**
   * Default preset, used for the In phase (and the Out phase when
   * `outPreset` is undefined — backwards-compat).
   */
  readonly preset: TextAnimationPreset;
  /**
   * Optional override for the Out phase. When set, the text clip animates
   * IN with `preset` (during [0, inDuration]) and OUT with `outPreset`
   * (during [duration-outDuration, duration]). When unset, the same
   * preset drives both phases — matching pre-V6.5 behavior.
   */
  readonly outPreset?: TextAnimationPreset;
  readonly params: TextAnimationParams;
  readonly inDuration: number;
  readonly outDuration: number;
  readonly stagger?: number; // Delay between characters/words
  readonly unit?: "character" | "word" | "line";
}

export type TextAnimationPreset =
  | "none"
  | "typewriter"
  | "fade"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "scale"
  | "blur"
  | "bounce"
  | "rotate"
  | "wave"
  | "shake"
  | "pop"
  | "glitch"
  | "split"
  | "flip"
  | "word-by-word"
  | "rainbow";

export interface TextAnimationParams {
  // Fade parameters
  readonly fadeOpacity?: { start: number; end: number };

  // Slide parameters
  readonly slideDistance?: number;

  // Scale parameters
  readonly scaleFrom?: number;
  readonly scaleTo?: number;

  // Blur parameters
  readonly blurAmount?: number;

  // Bounce parameters
  readonly bounceHeight?: number;
  readonly bounceCount?: number;

  // Rotate parameters
  readonly rotateAngle?: number;

  // Wave parameters
  readonly waveAmplitude?: number;
  readonly waveFrequency?: number;

  // Shake parameters
  readonly shakeIntensity?: number;
  readonly shakeSpeed?: number;

  // Pop parameters
  readonly popOvershoot?: number;

  // Glitch parameters
  readonly glitchIntensity?: number;
  readonly glitchSpeed?: number;
  readonly splitDirection?: "horizontal" | "vertical";

  // Flip parameters
  readonly flipAxis?: "x" | "y";

  // Rainbow parameters
  readonly rainbowSpeed?: number;

  // Word-by-word parameters
  readonly wordDelay?: number;

  // Easing
  readonly easing?: EasingType;
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: "Inter",
  fontSize: 48,
  fontWeight: "bold",
  fontStyle: "normal",
  color: "#ffffff",
  textAlign: "center",
  verticalAlign: "middle",
  lineHeight: 1.2,
  letterSpacing: 0,
};

export const DEFAULT_TEXT_TRANSFORM: Transform = {
  position: { x: 0.5, y: 0.5 }, // Normalized 0-1
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 },
  opacity: 1,
};

export interface TextRenderResult {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly width: number;
  readonly height: number;
  readonly textMetrics: TextMetrics;
}

export interface TextMetrics {
  readonly width: number;
  readonly height: number;
  readonly lines: TextLineMetrics[];
}

export interface TextLineMetrics {
  readonly text: string;
  readonly width: number;
  readonly height: number;
  readonly baseline: number;
}
