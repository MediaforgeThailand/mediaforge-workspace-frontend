import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ZoomIn,
  ZoomOut,
  Eye,
} from "lucide-react";
import type {
  Keyframe,
  EasingType,
  Transform,
  GraphicClip,
  TextAnimation,
  TextAnimationPreset,
} from "@/lib/openreel-core";
import { useProjectStore } from "../../stores/project-store";
import { useEngineStore } from "../../stores/engine-store";
import { toast } from "../../stores/notification-store";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/openreel-ui";

type MutableGraphicClip = {
  -readonly [K in keyof GraphicClip]: GraphicClip[K];
};

// V5 cleanup: trimmed to the basic NLE-standard set (None / Fade / Slide /
// Zoom). Deeper presets (blur, rotate, iris-*) were dropped along with the
// keyframes/motion-preset feature pack.
type TransitionPreset =
  | "none"
  | "fade"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "zoom-in"
  | "zoom-out";

interface TransitionConfig {
  preset: TransitionPreset;
  duration: number;
  easing: EasingType;
}

const PRESETS: {
  id: TransitionPreset;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "none", label: "None", icon: null },
  { id: "fade", label: "Fade", icon: <Eye size={12} /> },
  { id: "slide-left", label: "Slide Left", icon: <ArrowLeft size={12} /> },
  { id: "slide-right", label: "Slide Right", icon: <ArrowRight size={12} /> },
  { id: "slide-up", label: "Slide Up", icon: <ArrowUp size={12} /> },
  { id: "slide-down", label: "Slide Down", icon: <ArrowDown size={12} /> },
  { id: "zoom-in", label: "Zoom In", icon: <ZoomIn size={12} /> },
  { id: "zoom-out", label: "Zoom Out", icon: <ZoomOut size={12} /> },
];

const EASINGS: { id: EasingType; label: string }[] = [
  { id: "linear", label: "Linear" },
  { id: "ease-in", label: "Ease In" },
  { id: "ease-out", label: "Ease Out" },
  { id: "ease-in-out", label: "Ease In Out" },
];

function mapTextAnimationPreset(
  preset: TextAnimationPreset | undefined,
): TransitionPreset {
  switch (preset) {
    case "fade":
      return "fade";
    case "slide-left":
      return "slide-left";
    case "slide-right":
      return "slide-right";
    case "slide-up":
      return "slide-up";
    case "slide-down":
      return "slide-down";
    case "scale":
    case "pop":
      return "zoom-in";
    default:
      return "none";
  }
}

function getAnimationEasing(animation: TextAnimation): EasingType {
  return animation.params?.easing || "ease-out";
}

function toTransitionSignature(entry: TransitionConfig, exit: TransitionConfig) {
  return [
    entry.preset,
    entry.duration,
    entry.easing,
    exit.preset,
    exit.duration,
    exit.easing,
  ].join("|");
}

function clampTransitionDuration(
  duration: number | undefined,
  clipDuration: number,
) {
  const fallback = 0.5;
  const safeDuration =
    Number.isFinite(duration) && duration ? duration : fallback;
  const maxDuration = Math.max(0.1, clipDuration / 2);
  return Math.min(Math.max(0.1, safeDuration), maxDuration);
}

interface ClipTransitionSectionProps {
  clipId: string;
  compact?: boolean;
}

interface ClipLike {
  id: string;
  duration: number;
  transform: Transform;
  keyframes?: Keyframe[];
  animation?: TextAnimation;
}

type ClipType = "regular" | "text";

interface CanvasDimensions {
  width: number;
  height: number;
}

function calculateSlideOffsets(
  _baseTransform: Transform,
  canvas: CanvasDimensions,
): { left: number; right: number; up: number; down: number } {
  // Transform.position is in pixel-space offsets from canvas center, so a
  // slide-off-screen distance is just the half-canvas dimension plus a small
  // buffer to cover the clip's own width/height. The previous formula used
  // normalized 0..1 coords + posX which produced sub-pixel offsets — the
  // clip looked stationary because it moved by < 1px before the entry
  // window completed.
  const halfW = canvas.width / 2;
  const halfH = canvas.height / 2;
  const buffer = Math.max(halfW, halfH) * 0.1;
  return {
    left: halfW + buffer,
    right: halfW + buffer,
    up: halfH + buffer,
    down: halfH + buffer,
  };
}

function generateKeyframes(
  clip: ClipLike,
  entryConfig: TransitionConfig,
  exitConfig: TransitionConfig,
  _clipType: ClipType,
  canvas: CanvasDimensions,
): Keyframe[] {
  const keyframes: Keyframe[] = [];
  const baseTransform = clip.transform;
  const duration = clip.duration;

  const entryEnd = entryConfig.duration;
  const exitStart = duration - exitConfig.duration;

  const offsets = calculateSlideOffsets(baseTransform, canvas);

  if (entryConfig.preset !== "none") {
    switch (entryConfig.preset) {
      case "fade":
        keyframes.push(
          {
            id: `kf-entry-opacity-0`,
            time: 0,
            property: "opacity",
            value: 0,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-opacity-1`,
            time: entryEnd,
            property: "opacity",
            value: baseTransform.opacity,
            easing: entryConfig.easing,
          },
        );
        break;
      case "slide-left":
        keyframes.push(
          {
            id: `kf-entry-pos-0`,
            time: 0,
            property: "position.x",
            value: baseTransform.position.x - offsets.left,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-pos-1`,
            time: entryEnd,
            property: "position.x",
            value: baseTransform.position.x,
            easing: entryConfig.easing,
          },
        );
        break;
      case "slide-right":
        keyframes.push(
          {
            id: `kf-entry-pos-0`,
            time: 0,
            property: "position.x",
            value: baseTransform.position.x + offsets.right,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-pos-1`,
            time: entryEnd,
            property: "position.x",
            value: baseTransform.position.x,
            easing: entryConfig.easing,
          },
        );
        break;
      case "slide-up":
        keyframes.push(
          {
            id: `kf-entry-pos-0`,
            time: 0,
            property: "position.y",
            value: baseTransform.position.y - offsets.up,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-pos-1`,
            time: entryEnd,
            property: "position.y",
            value: baseTransform.position.y,
            easing: entryConfig.easing,
          },
        );
        break;
      case "slide-down":
        keyframes.push(
          {
            id: `kf-entry-pos-0`,
            time: 0,
            property: "position.y",
            value: baseTransform.position.y + offsets.down,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-pos-1`,
            time: entryEnd,
            property: "position.y",
            value: baseTransform.position.y,
            easing: entryConfig.easing,
          },
        );
        break;
      case "zoom-in":
        keyframes.push(
          {
            id: `kf-entry-scale-0`,
            time: 0,
            property: "scale.x",
            value: 0.3,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-scale-1`,
            time: 0,
            property: "scale.y",
            value: 0.3,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-scale-2`,
            time: entryEnd,
            property: "scale.x",
            value: baseTransform.scale.x,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-scale-3`,
            time: entryEnd,
            property: "scale.y",
            value: baseTransform.scale.y,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-opacity-0`,
            time: 0,
            property: "opacity",
            value: 0,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-opacity-1`,
            time: entryEnd,
            property: "opacity",
            value: baseTransform.opacity,
            easing: entryConfig.easing,
          },
        );
        break;
      case "zoom-out":
        keyframes.push(
          {
            id: `kf-entry-scale-0`,
            time: 0,
            property: "scale.x",
            value: 1.8,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-scale-1`,
            time: 0,
            property: "scale.y",
            value: 1.8,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-scale-2`,
            time: entryEnd,
            property: "scale.x",
            value: baseTransform.scale.x,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-scale-3`,
            time: entryEnd,
            property: "scale.y",
            value: baseTransform.scale.y,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-opacity-0`,
            time: 0,
            property: "opacity",
            value: 0,
            easing: entryConfig.easing,
          },
          {
            id: `kf-entry-opacity-1`,
            time: entryEnd,
            property: "opacity",
            value: baseTransform.opacity,
            easing: entryConfig.easing,
          },
        );
        break;
    }
  }

  if (exitConfig.preset !== "none") {
    switch (exitConfig.preset) {
      case "fade":
        keyframes.push(
          {
            id: `kf-exit-opacity-0`,
            time: exitStart,
            property: "opacity",
            value: baseTransform.opacity,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-opacity-1`,
            time: duration,
            property: "opacity",
            value: 0,
            easing: exitConfig.easing,
          },
        );
        break;
      case "slide-left":
        keyframes.push(
          {
            id: `kf-exit-pos-0`,
            time: exitStart,
            property: "position.x",
            value: baseTransform.position.x,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-pos-1`,
            time: duration,
            property: "position.x",
            value: baseTransform.position.x - offsets.left,
            easing: exitConfig.easing,
          },
        );
        break;
      case "slide-right":
        keyframes.push(
          {
            id: `kf-exit-pos-0`,
            time: exitStart,
            property: "position.x",
            value: baseTransform.position.x,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-pos-1`,
            time: duration,
            property: "position.x",
            value: baseTransform.position.x + offsets.right,
            easing: exitConfig.easing,
          },
        );
        break;
      case "slide-up":
        keyframes.push(
          {
            id: `kf-exit-pos-0`,
            time: exitStart,
            property: "position.y",
            value: baseTransform.position.y,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-pos-1`,
            time: duration,
            property: "position.y",
            value: baseTransform.position.y - offsets.up,
            easing: exitConfig.easing,
          },
        );
        break;
      case "slide-down":
        keyframes.push(
          {
            id: `kf-exit-pos-0`,
            time: exitStart,
            property: "position.y",
            value: baseTransform.position.y,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-pos-1`,
            time: duration,
            property: "position.y",
            value: baseTransform.position.y + offsets.down,
            easing: exitConfig.easing,
          },
        );
        break;
      case "zoom-in":
        keyframes.push(
          {
            id: `kf-exit-scale-0`,
            time: exitStart,
            property: "scale.x",
            value: baseTransform.scale.x,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-scale-1`,
            time: exitStart,
            property: "scale.y",
            value: baseTransform.scale.y,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-scale-2`,
            time: duration,
            property: "scale.x",
            value: 1.8,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-scale-3`,
            time: duration,
            property: "scale.y",
            value: 1.8,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-opacity-0`,
            time: exitStart,
            property: "opacity",
            value: baseTransform.opacity,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-opacity-1`,
            time: duration,
            property: "opacity",
            value: 0,
            easing: exitConfig.easing,
          },
        );
        break;
      case "zoom-out":
        keyframes.push(
          {
            id: `kf-exit-scale-0`,
            time: exitStart,
            property: "scale.x",
            value: baseTransform.scale.x,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-scale-1`,
            time: exitStart,
            property: "scale.y",
            value: baseTransform.scale.y,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-scale-2`,
            time: duration,
            property: "scale.x",
            value: 0.3,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-scale-3`,
            time: duration,
            property: "scale.y",
            value: 0.3,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-opacity-0`,
            time: exitStart,
            property: "opacity",
            value: baseTransform.opacity,
            easing: exitConfig.easing,
          },
          {
            id: `kf-exit-opacity-1`,
            time: duration,
            property: "opacity",
            value: 0,
            easing: exitConfig.easing,
          },
        );
        break;
    }
  }

  return keyframes;
}

function detectCurrentTransitions(clip: ClipLike): {
  entry: TransitionConfig;
  exit: TransitionConfig;
} {
  const entry: TransitionConfig = {
    preset: "none",
    duration: 0.5,
    easing: "ease-out",
  };
  const exit: TransitionConfig = {
    preset: "none",
    duration: 0.5,
    easing: "ease-in",
  };

  const keyframes = clip.keyframes || [];
  const entryKfs = keyframes.filter((kf) => kf.id.startsWith("kf-entry-"));
  const exitKfs = keyframes.filter((kf) => kf.id.startsWith("kf-exit-"));

  if (entryKfs.length > 0) {
    const opacityKf = entryKfs.find((kf) => kf.property === "opacity");
    const posXKf = entryKfs.find((kf) => kf.property === "position.x");
    const posYKf = entryKfs.find((kf) => kf.property === "position.y");
    const scaleKf = entryKfs.find((kf) => kf.property === "scale.x");

    if (scaleKf && Number(scaleKf.value) < 1) entry.preset = "zoom-in";
    else if (scaleKf && Number(scaleKf.value) > 1) entry.preset = "zoom-out";
    else if (posXKf && Number(posXKf.value) < clip.transform.position.x)
      entry.preset = "slide-left";
    else if (posXKf && Number(posXKf.value) > clip.transform.position.x)
      entry.preset = "slide-right";
    else if (posYKf && Number(posYKf.value) < clip.transform.position.y)
      entry.preset = "slide-up";
    else if (posYKf && Number(posYKf.value) > clip.transform.position.y)
      entry.preset = "slide-down";
    else if (opacityKf) entry.preset = "fade";

    const maxTime = Math.max(...entryKfs.map((kf) => kf.time));
    if (maxTime > 0) entry.duration = maxTime;
    const firstKf = entryKfs[0];
    if (firstKf) entry.easing = firstKf.easing;
  }

  if (exitKfs.length > 0) {
    const opacityKf = exitKfs.find(
      (kf) => kf.property === "opacity" && kf.time === clip.duration,
    );
    const posXKf = exitKfs.find(
      (kf) => kf.property === "position.x" && kf.time === clip.duration,
    );
    const posYKf = exitKfs.find(
      (kf) => kf.property === "position.y" && kf.time === clip.duration,
    );
    const scaleKf = exitKfs.find(
      (kf) => kf.property === "scale.x" && kf.time === clip.duration,
    );

    if (scaleKf && Number(scaleKf.value) > 1) exit.preset = "zoom-in";
    else if (scaleKf && Number(scaleKf.value) < 1) exit.preset = "zoom-out";
    else if (posXKf && Number(posXKf.value) < clip.transform.position.x)
      exit.preset = "slide-left";
    else if (posXKf && Number(posXKf.value) > clip.transform.position.x)
      exit.preset = "slide-right";
    else if (posYKf && Number(posYKf.value) < clip.transform.position.y)
      exit.preset = "slide-up";
    else if (posYKf && Number(posYKf.value) > clip.transform.position.y)
      exit.preset = "slide-down";
    else if (opacityKf) exit.preset = "fade";

    const minTime = Math.min(
      ...exitKfs.filter((kf) => kf.id.includes("-0")).map((kf) => kf.time),
    );
    if (minTime < clip.duration) exit.duration = clip.duration - minTime;
    const firstKf = exitKfs[0];
    if (firstKf) exit.easing = firstKf.easing;
  }

  if (clip.animation) {
    const animationEasing = getAnimationEasing(clip.animation);

    if (entryKfs.length === 0) {
      entry.preset = mapTextAnimationPreset(clip.animation.preset);
      entry.duration = clampTransitionDuration(
        clip.animation.inDuration,
        clip.duration,
      );
      entry.easing = animationEasing;
    }

    if (exitKfs.length === 0) {
      exit.preset = mapTextAnimationPreset(
        clip.animation.outPreset ?? clip.animation.preset,
      );
      exit.duration = clampTransitionDuration(
        clip.animation.outDuration,
        clip.duration,
      );
      exit.easing = animationEasing === "ease-out" ? "ease-in" : animationEasing;
    }
  }

  return { entry, exit };
}

export const ClipTransitionSection: React.FC<ClipTransitionSectionProps> = ({
  clipId,
  compact = false,
}) => {
  const {
    project,
    updateClipKeyframes,
    updateTextClipKeyframes,
    getTextClip,
    getShapeClip,
    getSVGClip,
    getStickerClip,
  } = useProjectStore();
  const getTitleEngine = useEngineStore((state) => state.getTitleEngine);
  const getGraphicsEngine = useEngineStore((state) => state.getGraphicsEngine);
  const { settings } = project;

  const clip = useMemo(() => {
    const regularClip = project.timeline.tracks
      .flatMap((t) => t.clips)
      .find((c) => c.id === clipId);
    if (regularClip)
      return { type: "regular" as const, data: regularClip as ClipLike };

    const textClip = getTextClip(clipId);
    if (textClip) return { type: "text" as const, data: textClip as ClipLike };

    const shapeClip = getShapeClip(clipId);
    if (shapeClip)
      return { type: "shape" as const, data: shapeClip as ClipLike };

    const svgClip = getSVGClip(clipId);
    if (svgClip) return { type: "svg" as const, data: svgClip as ClipLike };

    const stickerClip = getStickerClip(clipId);
    if (stickerClip)
      return { type: "sticker" as const, data: stickerClip as ClipLike };

    return null;
  }, [
    project.timeline.tracks,
    clipId,
    getTextClip,
    getShapeClip,
    getSVGClip,
    getStickerClip,
    getTitleEngine,
    project.modifiedAt,
  ]);

  const detected = clip
    ? detectCurrentTransitions(clip.data)
    : {
        entry: {
          preset: "none" as TransitionPreset,
          duration: 0.5,
          easing: "ease-out" as EasingType,
        },
        exit: {
          preset: "none" as TransitionPreset,
          duration: 0.5,
          easing: "ease-in" as EasingType,
        },
      };

  const [entryPreset, setEntryPreset] = useState<TransitionPreset>(
    detected.entry.preset,
  );
  const [entryDuration, setEntryDuration] = useState(detected.entry.duration);
  const [entryEasing, setEntryEasing] = useState<EasingType>(
    detected.entry.easing,
  );

  const [exitPreset, setExitPreset] = useState<TransitionPreset>(
    detected.exit.preset,
  );
  const [exitDuration, setExitDuration] = useState(detected.exit.duration);
  const [exitEasing, setExitEasing] = useState<EasingType>(
    detected.exit.easing,
  );

  const detectedSignature = toTransitionSignature(detected.entry, detected.exit);
  const stateSignature = useMemo(
    () =>
      toTransitionSignature(
        {
          preset: entryPreset,
          duration: entryDuration,
          easing: entryEasing,
        },
        { preset: exitPreset, duration: exitDuration, easing: exitEasing },
      ),
    [
      entryPreset,
      entryDuration,
      entryEasing,
      exitPreset,
      exitDuration,
      exitEasing,
    ],
  );
  const isSyncingDetectedRef = useRef(false);

  useEffect(() => {
    isSyncingDetectedRef.current = true;
    setEntryPreset(detected.entry.preset);
    setEntryDuration(detected.entry.duration);
    setEntryEasing(detected.entry.easing);
    setExitPreset(detected.exit.preset);
    setExitDuration(detected.exit.duration);
    setExitEasing(detected.exit.easing);
  }, [
    clipId,
    detectedSignature,
    detected.entry.preset,
    detected.entry.duration,
    detected.entry.easing,
    detected.exit.preset,
    detected.exit.duration,
    detected.exit.easing,
  ]);

  /**
   * Persist the current entry/exit picks onto the clip's keyframes.
   * `silent` skips the toast — used by the live-apply effect so the user
   * doesn't see a barrage of "Animation Applied" toasts while tweaking.
   */
  const applyTransitions = useCallback(
    (silent = false) => {
      if (!clip) {
        return;
      }

      const existingKeyframes = (clip.data.keyframes || []).filter(
        (kf) => !kf.id.startsWith("kf-entry-") && !kf.id.startsWith("kf-exit-"),
      );

      const canvas = { width: settings.width, height: settings.height };
      const clipTypeForKeyframes: ClipType =
        clip.type === "regular" || clip.type === "text" ? clip.type : "regular";
      const newKeyframes = generateKeyframes(
        clip.data,
        { preset: entryPreset, duration: entryDuration, easing: entryEasing },
        { preset: exitPreset, duration: exitDuration, easing: exitEasing },
        clipTypeForKeyframes,
        canvas,
      );

      const allKeyframes = [...existingKeyframes, ...newKeyframes];

      if (clip.type === "text") {
        updateTextClipKeyframes(clipId, allKeyframes);
      } else if (
        clip.type === "shape" ||
        clip.type === "svg" ||
        clip.type === "sticker"
      ) {
        const graphicsEngine = getGraphicsEngine();
        if (graphicsEngine) {
          const graphicsClip =
            clip.type === "shape"
              ? graphicsEngine.getShapeClip(clipId)
              : clip.type === "svg"
                ? graphicsEngine.getSVGClip(clipId)
                : graphicsEngine.getStickerClip(clipId);

          if (graphicsClip) {
            (graphicsClip as MutableGraphicClip).keyframes = allKeyframes;
            useProjectStore.setState((state) => ({
              project: { ...state.project, modifiedAt: Date.now() },
            }));
          }
        }
      } else {
        updateClipKeyframes(clipId, allKeyframes);
      }

      if (silent) return;
      const parts: string[] = [];
      if (entryPreset !== "none") {
        parts.push(`Entry: ${entryPreset}`);
      }
      if (exitPreset !== "none") {
        parts.push(`Exit: ${exitPreset}`);
      }
      if (parts.length > 0) {
        toast.success("Clip Animation Applied", parts.join(", "));
      } else {
        toast.info("Animations Cleared");
      }
    },
    [
      clip,
      clipId,
      entryPreset,
      entryDuration,
      entryEasing,
      exitPreset,
      exitDuration,
      exitEasing,
      updateClipKeyframes,
      updateTextClipKeyframes,
      getGraphicsEngine,
      settings,
    ],
  );

  // Live-apply: whenever the user changes a preset / duration / easing,
  // write the keyframes back immediately so the preview reflects the
  // selection without requiring a click on "Apply Transitions". We use a
  // mount-skip ref so the initial render (which seeds state from existing
  // clip keyframes) doesn't overwrite anything.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      isSyncingDetectedRef.current = false;
      return;
    }
    if (isSyncingDetectedRef.current) {
      isSyncingDetectedRef.current = false;
      return;
    }
    if (stateSignature === detectedSignature) {
      return;
    }
    applyTransitions(true);
  }, [stateSignature, detectedSignature, applyTransitions]);

  if (!clip) return null;

  const presetGridClass = compact
    ? "grid grid-cols-4 gap-1"
    : "grid grid-cols-3 gap-1";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {/* Entry Transition */}
      <div className="space-y-2">
        <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wider">
          Entry Animation
        </span>
        <div className={presetGridClass}>
          {PRESETS.map((preset) => (
            <button
              key={`entry-${preset.id}`}
              onClick={() => setEntryPreset(preset.id)}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded text-[9px] transition-all ${
                entryPreset === preset.id
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-background-tertiary border border-border text-text-secondary hover:text-text-primary hover:border-text-muted"
              }`}
            >
              {preset.icon}
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
        {entryPreset !== "none" && (
          <div className="flex gap-2 mt-2">
            <div className="flex-1">
              <label className="text-[9px] text-text-muted">Duration</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max={clip.data.duration / 2}
                value={entryDuration}
                onChange={(e) =>
                  setEntryDuration(parseFloat(e.target.value) || 0.5)
                }
                className="w-full px-2 py-1 text-[10px] bg-background-tertiary border border-border rounded"
              />
            </div>
            <div className="flex-1">
              <label className="text-[9px] text-text-muted">Easing</label>
              <Select value={entryEasing} onValueChange={(v) => setEntryEasing(v as EasingType)}>
                <SelectTrigger className="w-full bg-background-tertiary border-border text-text-primary text-[10px] h-7">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background-secondary border-border">
                  {EASINGS.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Exit Transition */}
      <div className="space-y-2">
        <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wider">
          Exit Animation
        </span>
        <div className={presetGridClass}>
          {PRESETS.map((preset) => (
            <button
              key={`exit-${preset.id}`}
              onClick={() => setExitPreset(preset.id)}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded text-[9px] transition-all ${
                exitPreset === preset.id
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-background-tertiary border border-border text-text-secondary hover:text-text-primary hover:border-text-muted"
              }`}
            >
              {preset.icon}
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
        {exitPreset !== "none" && (
          <div className="flex gap-2 mt-2">
            <div className="flex-1">
              <label className="text-[9px] text-text-muted">Duration</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max={clip.data.duration / 2}
                value={exitDuration}
                onChange={(e) =>
                  setExitDuration(parseFloat(e.target.value) || 0.5)
                }
                className="w-full px-2 py-1 text-[10px] bg-background-tertiary border border-border rounded"
              />
            </div>
            <div className="flex-1">
              <label className="text-[9px] text-text-muted">Easing</label>
              <Select value={exitEasing} onValueChange={(v) => setExitEasing(v as EasingType)}>
                <SelectTrigger className="w-full bg-background-tertiary border-border text-text-primary text-[10px] h-7">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background-secondary border-border">
                  {EASINGS.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Apply confirms via toast — transitions are otherwise written
          continuously by the live-apply effect above. Keeping the button
          as an explicit confirmation hook (and to give the user a
          "re-snapshot from current selection" affordance when canvas size
          changes etc). */}
      <button
        onClick={() => applyTransitions(false)}
        className="w-full py-2 bg-primary hover:bg-primary-hover text-primary-foreground font-medium rounded-lg text-[11px] transition-all"
      >
        Apply Transitions
      </button>
    </div>
  );
};

export default ClipTransitionSection;
