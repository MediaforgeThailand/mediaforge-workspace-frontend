import type {
  EmphasisAnimation,
  TextAnimation,
  TextAnimationPreset,
  TextStyle,
} from "@/lib/openreel-core";
import type {
  CaptionAnimation,
  CaptionStyleSettings,
  CaptionTextAnimation,
} from "../caption-presets";
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
  let x = typeof settings.positionX === "number" ? settings.positionX : 0.5;
  let y = typeof settings.positionY === "number" ? settings.positionY : 0.5;
  if (typeof settings.positionX !== "number") {
    if (settings.positionH === "left") x = settings.margin / refWidth;
    else if (settings.positionH === "right") x = 1 - settings.margin / refWidth;
  }
  if (typeof settings.positionY !== "number") {
    if (settings.positionV === "top") y = settings.margin / refHeight;
    else if (settings.positionV === "bottom") y = 1 - settings.margin / refHeight;
  }
  x = Math.max(0.02, Math.min(0.98, x));
  y = Math.max(0.02, Math.min(0.98, y));
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

function captionTextAnimationToEmphasisType(
  animation: CaptionTextAnimation | undefined,
): EmphasisAnimation["type"] {
  switch (animation) {
    case "loud-emphasis":
    case "big-echoes":
      return "pulse";
    case "bounce-left":
    case "leap-in":
      return "bounce";
    case "bubble-sprite":
    case "ode-to-joy":
      return "float";
    case "spatter-stroke":
      return "shake";
    case "wavy-roll":
      return "wave";
    case "in-scanner":
    case "hope-horizon":
      return "glow";
    case "text-sprout":
    case "sequence-reveal":
      return "zoom-pulse";
    case "typing-cursor":
      return "flash";
    case "rebound-in":
    case "tension-release":
      return "rubber-band";
    case "pop-snow":
      return "tada";
    case "blaze-shot":
      return "tilt";
    case "love-emphasis":
      return "heartbeat";
    case "quirky-spelling":
      return "wobble";
    case "none":
    default:
      return "none";
  }
}

function isEntryLikeTextAnimation(
  animation: CaptionTextAnimation | undefined,
): boolean {
  return (
    animation === "typing-cursor" ||
    animation === "bounce-left" ||
    animation === "in-scanner" ||
    animation === "text-sprout" ||
    animation === "leap-in" ||
    animation === "rebound-in" ||
    animation === "hope-horizon" ||
    animation === "sequence-reveal" ||
    animation === "wavy-roll" ||
    animation === "quirky-spelling"
  );
}

export function autoSuptitleSettingsToTextAnimation(
  settings: CaptionStyleSettings,
): TextAnimation | undefined {
  const preset = captionAnimationToTextPreset(settings.animation);
  const outPreset = captionAnimationToTextPreset(
    settings.outAnimation ?? settings.animation,
  );
  if (preset === "none" && outPreset === "none") {
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
    outPreset: outPreset === "typewriter" ? "fade" : outPreset,
    inDuration: preset === "none" ? 0 : AUTO_SUPTITLE_TRANSITION_SECONDS,
    outDuration:
      outPreset === "none" ? 0 : AUTO_SUPTITLE_TRANSITION_OUT_SECONDS,
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

export function autoSuptitleSettingsToTextEmphasisAnimation(
  settings: CaptionStyleSettings,
): EmphasisAnimation {
  const type = captionTextAnimationToEmphasisType(settings.textAnimation);
  if (type === "none") {
    return {
      type: "none",
      speed: 1,
      intensity: 1,
      loop: true,
    };
  }

  return {
    type,
    speed:
      type === "shake" || type === "flash" || type === "tada"
        ? 1.35
        : isEntryLikeTextAnimation(settings.textAnimation)
          ? 1.65
          : 0.9,
    intensity:
      type === "glow"
        ? 0.7
        : type === "shake"
          ? 0.35
          : type === "rubber-band" || type === "wobble"
            ? 0.55
            : 0.45,
    loop: !isEntryLikeTextAnimation(settings.textAnimation),
    animationDuration: isEntryLikeTextAnimation(settings.textAnimation)
      ? 0.72
      : undefined,
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
