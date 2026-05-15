import { Film, Volume2, Image, Type, Shapes, Layers } from "lucide-react";
import type { Track } from "@/lib/openreel-core";
import type {
  SnapPoint,
  SnapResult,
  SnapSettings,
  ClipStyle,
  TrackInfo,
} from "./types";

export const calculateSnap = (
  rawTime: number,
  clipId: string,
  tracks: Track[],
  playheadPosition: number,
  snapSettings: SnapSettings,
  pixelsPerSecond: number,
  clipDuration?: number,
): SnapResult => {
  if (!snapSettings.enabled) {
    return { time: rawTime, snapped: false };
  }

  const thresholdSeconds = snapSettings.snapThreshold / pixelsPerSecond;
  const snapPoints: SnapPoint[] = [];

  if (snapSettings.snapToClips) {
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.id === clipId) continue;
        snapPoints.push({ time: clip.startTime, type: "clip-start" });
        snapPoints.push({
          time: clip.startTime + clip.duration,
          type: "clip-end",
        });
      }
    }
  }

  if (snapSettings.snapToPlayhead) {
    snapPoints.push({ time: playheadPosition, type: "playhead" });
  }

  if (snapSettings.snapToGrid) {
    const nearestGrid =
      Math.round(rawTime / snapSettings.gridSize) * snapSettings.gridSize;
    snapPoints.push({ time: nearestGrid, type: "grid" });
    if (clipDuration) {
      const endTime = rawTime + clipDuration;
      const nearestEndGrid =
        Math.round(endTime / snapSettings.gridSize) * snapSettings.gridSize;
      snapPoints.push({ time: nearestEndGrid, type: "grid" });
    }
  }

  const priorityOrder: Record<string, number> = {
    "clip-start": 0,
    "clip-end": 0,
    "playhead": 1,
    "grid": 2,
  };

  let closestPoint: SnapPoint | undefined;
  let closestDistance = Infinity;
  let closestPriority = Infinity;
  let snapFromEnd = false;

  for (const point of snapPoints) {
    const pointPriority = priorityOrder[point.type] ?? 2;

    const startDistance = Math.abs(point.time - rawTime);
    if (startDistance < thresholdSeconds) {
      const isBetter =
        pointPriority < closestPriority ||
        (pointPriority === closestPriority && startDistance < closestDistance);
      if (isBetter) {
        closestDistance = startDistance;
        closestPriority = pointPriority;
        closestPoint = point;
        snapFromEnd = false;
      }
    }

    if (clipDuration) {
      const clipEndTime = rawTime + clipDuration;
      const endDistance = Math.abs(point.time - clipEndTime);
      if (endDistance < thresholdSeconds) {
        const isBetter =
          pointPriority < closestPriority ||
          (pointPriority === closestPriority && endDistance < closestDistance);
        if (isBetter) {
          closestDistance = endDistance;
          closestPriority = pointPriority;
          closestPoint = point;
          snapFromEnd = true;
        }
      }
    }
  }

  if (closestPoint) {
    const snappedTime = snapFromEnd
      ? closestPoint.time - (clipDuration ?? 0)
      : closestPoint.time;
    return {
      time: Math.max(0, snappedTime),
      snapped: true,
      snapPoint: { ...closestPoint, time: closestPoint.time },
    };
  }

  return { time: rawTime, snapped: false };
};

export const generateWaveformPath = (
  waveformData: Float32Array | number[],
  width: number,
): string => {
  if (!waveformData || waveformData.length === 0) {
    return "M0,20 L100,20";
  }

  const samples = Array.from(waveformData);
  const step = Math.max(1, Math.floor(samples.length / width));
  const points: string[] = [];

  for (let i = 0; i < width; i++) {
    const sampleIndex = Math.min(i * step, samples.length - 1);
    const value = Math.abs(samples[sampleIndex] || 0);
    const y = 20 - value * 18;
    points.push(`${i === 0 ? "M" : "L"}${i},${y}`);
  }

  return points.join(" ");
};

export const formatTimecode = (
  timeInSeconds: number,
  frameRate: number = 30,
): string => {
  if (!isFinite(timeInSeconds) || isNaN(timeInSeconds) || timeInSeconds < 0) {
    return "00:00:00:00";
  }
  const hours = Math.floor(timeInSeconds / 3600);
  const minutes = Math.floor((timeInSeconds % 3600) / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  const frames = Math.floor((timeInSeconds % 1) * frameRate);
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}:${frames
    .toString()
    .padStart(2, "0")}`;
};

export const getTrackInfo = (track: Track, index: number): TrackInfo => {
  // CapCut palette: video=purple-blue, audio=blue, image=blue, text=orange, graphics=magenta
  switch (track.type) {
    case "video":
      return {
        label: `V${index + 1}`,
        icon: Film,
        color: "bg-indigo-500",
        textColor: "text-indigo-300",
        bgLight: "bg-indigo-500/20",
      };
    case "audio":
      return {
        label: `A${index + 1}`,
        icon: Volume2,
        color: "bg-sky-500",
        textColor: "text-sky-300",
        bgLight: "bg-sky-500/20",
      };
    case "image":
      return {
        label: `I${index + 1}`,
        icon: Image,
        color: "bg-sky-500",
        textColor: "text-sky-300",
        bgLight: "bg-sky-500/20",
      };
    case "text":
      return {
        label: `T${index + 1}`,
        icon: Type,
        color: "bg-orange-500",
        textColor: "text-orange-300",
        bgLight: "bg-orange-500/20",
      };
    case "graphics":
      return {
        label: `G${index + 1}`,
        icon: Shapes,
        color: "bg-fuchsia-500",
        textColor: "text-fuchsia-300",
        bgLight: "bg-fuchsia-500/20",
      };
    default:
      return {
        label: `?${index + 1}`,
        icon: Layers,
        color: "bg-gray-500",
        textColor: "text-gray-400",
        bgLight: "bg-gray-500/20",
      };
  }
};

export const getClipStyle = (trackType: string): ClipStyle => {
  // CapCut clip block colors
  switch (trackType) {
    case "video":
      return {
        bg: "bg-indigo-500/30",
        border: "border-indigo-400/60",
        text: "text-white/90",
        selectedText: "text-white",
      };
    case "audio":
      return {
        bg: "bg-sky-500/25",
        border: "border-sky-400/60",
        text: "text-sky-50",
        selectedText: "text-sky-100",
      };
    case "image":
      return {
        bg: "bg-sky-500/30",
        border: "border-sky-400/60",
        text: "text-sky-50",
        selectedText: "text-sky-200",
      };
    case "text":
      return {
        bg: "bg-orange-500/30",
        border: "border-orange-400/60",
        text: "text-orange-50",
        selectedText: "text-orange-200",
      };
    case "graphics":
      return {
        bg: "bg-fuchsia-500/30",
        border: "border-fuchsia-400/60",
        text: "text-fuchsia-50",
        selectedText: "text-fuchsia-200",
      };
    default:
      return {
        bg: "bg-gray-500/20",
        border: "border-gray-500/40",
        text: "text-text-secondary",
        selectedText: "text-text-primary",
      };
  }
};
