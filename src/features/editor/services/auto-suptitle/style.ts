import type {
  TextAnimation,
  TextAnimationPreset,
  TextStyle,
} from "@/lib/openreel-core";
import type { CaptionAnimation, CaptionStyleSettings } from "../caption-presets";
import type { AutoSuptitleStyle } from "./types";

export function autoSuptitleSettingsToTextStyle(
  settings: CaptionStyleSettings,
): Partial<TextStyle> {
  return {
    fontFamily: settings.font,
    fontSize: settings.size,
    fontWeight: settings.weight as TextStyle["fontWeight"],
    fontStyle: settings.italic ? "italic" : "normal",
    color: settings.fill,
    backgroundColor: settings.background.enabled ? settings.background.color : undefined,
    strokeColor: settings.stroke.enabled ? settings.stroke.color : undefined,
    strokeWidth: settings.stroke.enabled ? settings.stroke.width : undefined,
    shadowColor: settings.shadow.enabled ? settings.shadow.color : undefined,
    shadowBlur: settings.shadow.enabled ? settings.shadow.blur : undefined,
    shadowOffsetX: settings.shadow.enabled ? settings.shadow.offsetX : undefined,
    shadowOffsetY: settings.shadow.enabled ? settings.shadow.offsetY : undefined,
    textAlign:
      settings.positionH === "left"
        ? "left"
        : settings.positionH === "right"
          ? "right"
          : "center",
    verticalAlign: "middle",
    lineHeight: 1.2,
    letterSpacing: 0,
    effects: {
      background: settings.background.enabled
        ? {
            enabled: true,
            color: settings.background.color,
            cornerRadius: settings.background.cornerRadius,
          }
        : undefined,
    },
  };
}

export function autoSuptitlePositionToTransform(
  settings: CaptionStyleSettings,
  refHeight = 1080,
  refWidth = 1920,
): { x: number; y: number } {
  let x = 0.5;
  let y = 0.5;
  if (settings.positionH === "left") x = settings.margin / refWidth;
  else if (settings.positionH === "right") x = 1 - settings.margin / refWidth;
  if (settings.positionV === "top") y = settings.margin / refHeight;
  else if (settings.positionV === "bottom") y = 1 - settings.margin / refHeight;
  return { x, y };
}

const AUTO_SUPTITLE_TRANSITION_SECONDS = 0.22;
const AUTO_SUPTITLE_TRANSITION_OUT_SECONDS = 0.16;

function captionAnimationToTextPreset(
  animation: CaptionAnimation,
): TextAnimationPreset {
  switch (animation) {
    case "fade":
      return "fade";
    case "slideIn":
    case "slideUp":
      return "slide-down";
    case "slideDown":
      return "slide-up";
    case "scale":
      return "scale";
    case "pop":
      return "pop";
    case "typewriter":
      return "typewriter";
    case "none":
    case "wordHighlight":
    default:
      return "none";
  }
}

export function autoSuptitleSettingsToTextAnimation(
  settings: CaptionStyleSettings,
): TextAnimation | undefined {
  const preset = captionAnimationToTextPreset(settings.animation);
  if (preset === "none") {
    return {
      preset: "none",
      outPreset: "none",
      inDuration: 0,
      outDuration: 0,
      params: { easing: "linear" },
    };
  }

  return {
    preset,
    outPreset: preset === "typewriter" ? "fade" : preset,
    inDuration: AUTO_SUPTITLE_TRANSITION_SECONDS,
    outDuration: AUTO_SUPTITLE_TRANSITION_OUT_SECONDS,
    params: {
      fadeOpacity: { start: 0, end: 1 },
      slideDistance: 0.035,
      scaleFrom: preset === "pop" ? 0.82 : 0.92,
      scaleTo: 1,
      popOvershoot: 1.08,
      easing: preset === "pop" ? "easeOutBack" : "ease-out",
    },
  };
}

export function buildAutoSuptitleStyle(
  settings: CaptionStyleSettings,
  refHeight = 1080,
  refWidth = 1920,
): AutoSuptitleStyle {
  return {
    style: autoSuptitleSettingsToTextStyle(settings),
    transform: {
      position: autoSuptitlePositionToTransform(settings, refHeight, refWidth),
    },
  };
}
