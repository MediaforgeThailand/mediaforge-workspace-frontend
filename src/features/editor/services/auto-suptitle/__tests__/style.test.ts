import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_TEXT_TRANSFORM,
  type TextAnimation,
  type TextClip,
} from "@/lib/openreel-core/text/types";
import { textAnimationEngine } from "@/lib/openreel-core/text/text-animation";
import { DEFAULT_CAPTION_SETTINGS } from "../../caption-presets";
import { autoSuptitleSettingsToTextAnimation } from "../style";

function makeTextClip(animation: TextAnimation): TextClip {
  return {
    id: "text-1",
    trackId: "track-1",
    startTime: 0,
    duration: 1,
    text: "Sample subtitle",
    style: DEFAULT_TEXT_STYLE,
    transform: DEFAULT_TEXT_TRANSFORM,
    animation,
    keyframes: [],
  };
}

describe("auto-suptitle transition style", () => {
  it("maps caption slide-up to the editor text preset that rises from below", () => {
    const animation = autoSuptitleSettingsToTextAnimation({
      ...DEFAULT_CAPTION_SETTINGS,
      animation: "slideUp",
    });

    expect(animation?.preset).toBe("slide-down");
    expect(animation?.outPreset).toBe("slide-down");
    expect(animation?.inDuration).toBeGreaterThan(0);
    expect(animation?.outDuration).toBeGreaterThan(0);
  });

  it("keeps explicit no-transition settings as a text animation reset", () => {
    const animation = autoSuptitleSettingsToTextAnimation({
      ...DEFAULT_CAPTION_SETTINGS,
      animation: "none",
    });

    expect(animation?.preset).toBe("none");
    expect(animation?.outPreset).toBe("none");
    expect(animation?.inDuration).toBe(0);
    expect(animation?.outDuration).toBe(0);
  });

  it("plays an exit transition even when the entry preset is none", () => {
    const clip = makeTextClip({
      preset: "none",
      outPreset: "fade",
      inDuration: 0,
      outDuration: 0.25,
      params: {
        fadeOpacity: { start: 0, end: 1 },
        easing: "linear",
      },
    });

    expect(textAnimationEngine.getAnimatedState(clip, 0.6).opacity).toBe(1);
    expect(textAnimationEngine.getAnimatedState(clip, 0.9).opacity).toBeLessThan(1);
  });
});
