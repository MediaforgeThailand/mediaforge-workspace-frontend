import type { TextStyle } from "@/lib/openreel-core";
import type { CaptionStyleSettings } from "../caption-presets";
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
