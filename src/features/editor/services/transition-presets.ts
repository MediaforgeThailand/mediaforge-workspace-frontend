import {
  TRANSITION_PRESETS,
  type TransitionParams,
  type TransitionPreset as CoreTransitionPreset,
  type TransitionType,
} from "@/lib/openreel-core";

export type TransitionPreviewKind =
  | "crossfade"
  | "dipBlack"
  | "dipWhite"
  | "wipe"
  | "slide"
  | "push"
  | "zoom";

export interface EditorTransitionPreset {
  id: string;
  name: string;
  category: CoreTransitionPreset["category"];
  type: TransitionType;
  duration: number;
  params: Record<string, unknown>;
  preview: TransitionPreviewKind;
  sourcePresetId: string;
}

export interface EditorTransitionPayload {
  presetId: string;
  name: string;
  type: TransitionType;
  duration: number;
  params: Record<string, unknown>;
}

function durationToSeconds(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0.6;
  return duration > 10 ? duration / 1000 : duration;
}

function normalizeDirection(
  direction: string | undefined,
): "left" | "right" | "up" | "down" {
  if (
    direction === "left" ||
    direction === "right" ||
    direction === "up" ||
    direction === "down"
  ) {
    return direction;
  }
  return "left";
}

function mapCorePreset(
  preset: CoreTransitionPreset,
): EditorTransitionPreset | null {
  const transition = preset.transition;
  const base = {
    id: preset.id,
    name: preset.name,
    category: preset.category,
    duration: durationToSeconds(transition.duration),
    sourcePresetId: preset.id,
  };

  switch (transition.type) {
    case "dissolve":
    case "crossfade":
      return {
        ...base,
        type: "crossfade",
        params: { curve: transition.easing === "linear" ? "linear" : "ease" },
        preview: "crossfade",
      };
    case "fade": {
      const isWhite = transition.fadeToColor?.toLowerCase() === "#ffffff";
      return {
        ...base,
        type: isWhite ? "dipToWhite" : "dipToBlack",
        params: { holdDuration: 0.08 },
        preview: isWhite ? "dipWhite" : "dipBlack",
      };
    }
    case "wipe":
      return {
        ...base,
        type: "wipe",
        params: {
          direction: normalizeDirection(transition.direction),
          softness: Math.max(0, Math.min(1, (transition.feather ?? 0) / 100)),
        },
        preview: "wipe",
      };
    case "slide":
      return {
        ...base,
        type: "slide",
        params: {
          direction: normalizeDirection(transition.direction),
          pushOut: false,
        },
        preview: "slide",
      };
    case "push":
      return {
        ...base,
        type: "push",
        params: { direction: normalizeDirection(transition.direction) },
        preview: "push",
      };
    case "zoom":
      return {
        ...base,
        type: "zoom",
        params: {
          scale: Math.max(1.1, transition.scale ?? 2),
          center: transition.origin ?? { x: 0.5, y: 0.5 },
        },
        preview: "zoom",
      };
    default:
      return null;
  }
}

export const EDITOR_TRANSITION_PRESETS: EditorTransitionPreset[] =
  TRANSITION_PRESETS.map(mapCorePreset).filter(
    (preset): preset is EditorTransitionPreset => Boolean(preset),
  );

export function toTransitionPayload(
  preset: EditorTransitionPreset,
): EditorTransitionPayload {
  return {
    presetId: preset.id,
    name: preset.name,
    type: preset.type,
    duration: preset.duration,
    params: preset.params,
  };
}

export function getTransitionParamsForType(
  payload: EditorTransitionPayload,
): Partial<TransitionParams[typeof payload.type]> {
  return payload.params as Partial<TransitionParams[typeof payload.type]>;
}
