import React, { useRef, useCallback, useEffect, useState, useMemo } from "react";
import type {
  Track,
  TextClip,
  ShapeClip,
  SVGClip,
  StickerClip,
} from "@/lib/openreel-core";
import { ClipComponent } from "./ClipComponent";
import { TextClipComponent } from "./TextClipComponent";
import { ShapeClipComponent } from "./ShapeClipComponent";
import { KeyframeTrack } from "./KeyframeTrack";
import { calculateSnap } from "./utils";
import { useTimelineStore } from "../../stores/timeline-store";
import { useUIStore } from "../../stores/ui-store";
import { useProjectStore } from "../../stores/project-store";
import { toast } from "../../stores/notification-store";
import { getTransitionBridge } from "../../bridges/transition-bridge";
import {
  canPlaceMediaTypeOnTrack,
  getMediaTypeFromDataTransferItem,
  getMediaTypeFromFile,
  getTrackTypeLabel,
  type TimelineMediaType,
} from "../../utils/media-track-compatibility";

type GraphicClipUnion = ShapeClip | SVGClip | StickerClip;

const coerceTimelineMediaType = (
  value: unknown,
): TimelineMediaType | null => {
  return value === "video" || value === "audio" || value === "image"
    ? value
    : null;
};

const getMediaTypeFromTransferData = (
  event: React.DragEvent,
): TimelineMediaType | null => {
  const rawData = event.dataTransfer.getData("application/json");
  if (!rawData) return null;

  try {
    const data = JSON.parse(rawData);
    return coerceTimelineMediaType(data?.mediaType);
  } catch {
    return null;
  }
};

interface TrackLaneProps {
  track: Track;
  allTracks: Track[];
  pixelsPerSecond: number;
  selectedClipIds: string[];
  textClips: TextClip[];
  shapeClips: GraphicClipUnion[];
  trackHeights: Map<string, number>;
  timelineRef: React.RefObject<HTMLDivElement>;
  onSelectClip: (clipId: string, addToSelection: boolean) => void;
  onDropMedia: (trackId: string, mediaId: string, startTime: number) => void;
  onMoveClip: (
    clipId: string,
    newStartTime: number,
    targetTrackId?: string,
  ) => void;
  onMoveTextClip: (clipId: string, newStartTime: number) => void;
  onSnapIndicator: (time: number | null) => void;
  onTrimClip?: (
    clipId: string,
    edge: "left" | "right",
    newTime: number,
  ) => void;
  onTrimTextClip: (
    clipId: string,
    edge: "left" | "right",
    newTime: number,
  ) => void;
  onTrimShapeClip: (
    clipId: string,
    edge: "left" | "right",
    newTime: number,
  ) => void;
  scrollX: number;
  trackHeight: number;
  onResizeTrack: (trackId: string, newHeight: number) => void;
  onKeyframeSelect?: (keyframeId: string, addToSelection: boolean) => void;
  onKeyframeMove?: (keyframeId: string, newTime: number) => void;
  onKeyframeDelete?: (keyframeId: string) => void;
  selectedKeyframeIds?: string[];
}

export const TrackLane: React.FC<TrackLaneProps> = ({
  track,
  allTracks,
  pixelsPerSecond,
  selectedClipIds,
  textClips,
  shapeClips,
  trackHeights,
  timelineRef,
  onSelectClip,
  onDropMedia,
  onMoveClip,
  onMoveTextClip,
  onSnapIndicator,
  onTrimClip,
  onTrimTextClip,
  onTrimShapeClip,
  scrollX,
  trackHeight,
  onResizeTrack,
  onKeyframeSelect,
  onKeyframeMove,
  onKeyframeDelete,
  selectedKeyframeIds = [],
}) => {
  const { isTrackExpanded, playheadPosition } = useTimelineStore();
  const isExpanded = isTrackExpanded(track.id);
  const { snapSettings, dragType, dragData } = useUIStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isInvalidMediaDrop, setIsInvalidMediaDrop] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const laneRef = useRef<HTMLDivElement>(null);
  const resizeStartY = useRef<number>(0);
  const resizeStartHeight = useRef<number>(0);

  const clipsWithKeyframes = useMemo(() => {
    return track.clips.filter((clip) => clip.keyframes && clip.keyframes.length > 0);
  }, [track.clips]);

  const acceptsDraggedPayload = useCallback(
    (e: React.DragEvent): boolean => {
      const transferTypes = Array.from(e.dataTransfer.types ?? []);

      if (transferTypes.includes("application/x-openreel-transition")) {
        return track.type === "video" || track.type === "image";
      }

      if (transferTypes.includes("Files")) {
        const fileItems = Array.from(e.dataTransfer.items ?? []).filter(
          (item) => item.kind === "file",
        );
        const detectedTypes = fileItems
          .map(getMediaTypeFromDataTransferItem)
          .filter((type): type is TimelineMediaType => Boolean(type));

        if (fileItems.length > 0 && detectedTypes.length === fileItems.length) {
          return detectedTypes.every((mediaType) =>
            canPlaceMediaTypeOnTrack(mediaType, track.type),
          );
        }

        return (
          track.type === "video" ||
          track.type === "audio" ||
          track.type === "image"
        );
      }

      const mediaTypeFromTransfer = getMediaTypeFromTransferData(e);
      const mediaTypeFromStore =
        dragType === "media"
          ? coerceTimelineMediaType(dragData?.mediaType)
          : null;
      const mediaType = mediaTypeFromTransfer ?? mediaTypeFromStore;

      return mediaType
        ? canPlaceMediaTypeOnTrack(mediaType, track.type)
        : true;
    },
    [dragData?.mediaType, dragType, track.type],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const canDrop = acceptsDraggedPayload(e);
      e.dataTransfer.dropEffect = canDrop ? "copy" : "none";
      setIsDragOver(true);
      setIsInvalidMediaDrop(!canDrop);
    },
    [acceptsDraggedPayload],
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
    setIsInvalidMediaDrop(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      setIsInvalidMediaDrop(false);

      // External OS file drop (e.g. from Windows Explorer)
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        const invalidFile = files.find(
          (file) =>
            !canPlaceMediaTypeOnTrack(getMediaTypeFromFile(file), track.type),
        );
        if (invalidFile) {
          toast.warning(
            "Wrong track type",
            `${invalidFile.name} belongs on a ${getMediaTypeFromFile(invalidFile) ?? "matching"} track, not ${getTrackTypeLabel(track.type)}.`,
          );
          return;
        }

        const rect = laneRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left + scrollX;
        const rawTime = Math.max(0, x / pixelsPerSecond);
        const snapResult = calculateSnap(
          rawTime,
          "",
          allTracks,
          playheadPosition,
          snapSettings,
          pixelsPerSecond,
        );
        const { importMedia, addClip } = useProjectStore.getState();
        for (const file of files) {
          try {
            const beforeIds = new Set(
              useProjectStore.getState().project.mediaLibrary.items.map(i => i.id)
            );
            const result = await importMedia(file);
            if (result.success) {
              const newItem = useProjectStore
                .getState()
                .project.mediaLibrary.items.find(i => !beforeIds.has(i.id));
              if (newItem) {
                const addResult = await addClip(track.id, newItem.id, snapResult.time);
                if (addResult.success) {
                  toast.success(`Added to ${track.name}`, file.name);
                } else {
                  toast.warning(
                    "Wrong track type",
                    addResult.error?.message ?? "This file belongs on its own track type.",
                  );
                }
              }
            }
          } catch (err) {
            console.error("[TrackLane] External file drop failed:", err);
          }
        }
        return;
      }

      // Transition drag from assets panel — drop near a clip boundary
      const transitionRaw = e.dataTransfer.getData("application/x-openreel-transition");
      if (transitionRaw) {
        try {
          const tx = JSON.parse(transitionRaw);
          if (
            tx &&
            typeof tx === "object" &&
            typeof tx.type === "string" &&
            (track.type === "video" || track.type === "image")
          ) {
            const rect = laneRef.current?.getBoundingClientRect();
            if (rect) {
              const x = e.clientX - rect.left + scrollX;
              const dropTime = Math.max(0, x / pixelsPerSecond);
              // Find the clip-boundary (junction) closest to the drop point.
              // A junction = end of clip A == start of adjacent clip B on the
              // same track (CapCut / Premiere behaviour: transitions snap to
              // the cut between two consecutive clips, regardless of where the
              // user drops within ~clipDuration/2).
              const sorted = [...track.clips].sort(
                (a, b) => a.startTime - b.startTime,
              );
              let bestJunction: {
                clipA: typeof sorted[number];
                clipB: typeof sorted[number];
                junctionTime: number;
                dist: number;
              } | null = null;
              for (let i = 0; i < sorted.length - 1; i++) {
                const a = sorted[i];
                const b = sorted[i + 1];
                const aEnd = a.startTime + a.duration;
                // Allow a small gap (snap zone); if clips overlap, use the
                // midpoint of the overlap as the junction.
                const junctionTime = Math.min(aEnd, b.startTime);
                const dist = Math.abs(dropTime - junctionTime);
                if (!bestJunction || dist < bestJunction.dist) {
                  bestJunction = { clipA: a, clipB: b, junctionTime, dist };
                }
              }
              if (bestJunction) {
                const duration = typeof tx.duration === "number" && tx.duration > 0
                  ? tx.duration
                  : 1.0;
                const params =
                  tx.params && typeof tx.params === "object"
                    ? tx.params
                    : undefined;
                try {
                  const bridge = getTransitionBridge();
                  const result = bridge.createTransition(
                    bestJunction.clipA as never,
                    bestJunction.clipB as never,
                    tx.type as never,
                    duration,
                    params as never,
                  );
                  if (result.success) {
                    toast.success(
                      "Transition applied",
                      `${typeof tx.name === "string" ? tx.name : tx.type} (${duration.toFixed(2)}s)`,
                    );
                  } else {
                    toast.error("Failed to apply transition", result.error || "");
                  }
                } catch (err) {
                  console.error("[TrackLane] transition drop failed:", err);
                }
              } else {
                toast.warning("Need adjacent clips", "Place at least two clips next to each other on this track");
              }
            }
            return;
          }
        } catch {
          // Silently ignore parse errors
        }
      }

      // Internal drag from assets panel
      try {
        const rawData = e.dataTransfer.getData("application/json");
        if (!rawData) return;

        const data = JSON.parse(rawData);
        if (
          !data ||
          typeof data !== "object" ||
          typeof data.mediaId !== "string" ||
          !data.mediaId.trim()
        ) {
          return;
        }

        const mediaItem = useProjectStore
          .getState()
          .getMediaItem(data.mediaId);
        if (!canPlaceMediaTypeOnTrack(mediaItem?.type, track.type)) {
          toast.warning(
            "Wrong track type",
            mediaItem
              ? `${mediaItem.name} belongs on a ${mediaItem.type} track, not ${getTrackTypeLabel(track.type)}.`
              : "This file belongs on its own track type.",
          );
          return;
        }

        const rect = laneRef.current?.getBoundingClientRect();
        if (rect) {
          const x = e.clientX - rect.left + scrollX;
          const rawTime = Math.max(0, x / pixelsPerSecond);
          const snapResult = calculateSnap(
            rawTime,
            "",
            allTracks,
            playheadPosition,
            snapSettings,
            pixelsPerSecond,
          );
          onDropMedia(track.id, data.mediaId, snapResult.time);
        }
      } catch {
        // Silently ignore parse errors
      }
    },
    [
      allTracks,
      onDropMedia,
      pixelsPerSecond,
      playheadPosition,
      scrollX,
      snapSettings,
      track.id,
      track.clips,
      track.name,
      track.type,
    ],
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStartY.current = e.clientY;
      resizeStartHeight.current = trackHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [trackHeight],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizeStartY.current;
      const newHeight = resizeStartHeight.current + deltaY;
      onResizeTrack(track.id, newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, track.id, onResizeTrack]);

  return (
    <div className="relative">
      <div
        ref={laneRef}
        style={{ height: trackHeight }}
        className={`border-b border-border/50 relative transition-colors ${
          isDragOver
            ? isInvalidMediaDrop
              ? "bg-red-500/10 border-red-500/40"
              : "bg-primary/10 border-primary/30"
            : "bg-background-secondary/20"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {track.clips
          .filter((clip) => !textClips.some((tc) => tc.id === clip.id))
          .filter((clip) => !shapeClips.some((sc) => sc.id === clip.id))
          .map((clip) => (
            <ClipComponent
              key={clip.id}
              clip={clip}
              track={track}
              allTracks={allTracks}
              pixelsPerSecond={pixelsPerSecond}
              isSelected={selectedClipIds.includes(clip.id)}
              trackHeights={trackHeights}
              timelineRef={timelineRef}
              onSelect={onSelectClip}
              onMoveClip={onMoveClip}
              onSnapIndicator={onSnapIndicator}
              onTrimClip={onTrimClip}
            />
          ))}
        {textClips.map((textClip) => (
          <TextClipComponent
            key={textClip.id}
            textClip={textClip}
            pixelsPerSecond={pixelsPerSecond}
            isSelected={selectedClipIds.includes(textClip.id)}
            onSelect={onSelectClip}
            onTrim={onTrimTextClip}
            onMoveClip={onMoveTextClip}
          />
        ))}
        {shapeClips.map((shapeClip) => (
          <ShapeClipComponent
            key={shapeClip.id}
            shapeClip={shapeClip}
            pixelsPerSecond={pixelsPerSecond}
            isSelected={selectedClipIds.includes(shapeClip.id)}
            onSelect={onSelectClip}
            onTrim={onTrimShapeClip}
            onMoveClip={onMoveClip}
          />
        ))}
        {isDragOver && (
          <div
            className={`absolute inset-0 border-2 border-dashed rounded pointer-events-none flex items-center justify-center ${
              isInvalidMediaDrop
                ? "border-red-500/60"
                : "border-primary/50"
            }`}
          >
            <span
              className={`text-xs bg-background/80 px-2 py-1 rounded ${
                isInvalidMediaDrop ? "text-red-400" : "text-primary"
              }`}
            >
              {isInvalidMediaDrop
                ? `Use ${getTrackTypeLabel(track.type)} assets only`
                : "Drop to add clip"}
            </span>
          </div>
        )}
      </div>
      <div
        className={`absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-primary/50 transition-colors z-10 ${
          isResizing ? "bg-primary" : ""
        }`}
        onMouseDown={handleResizeStart}
      />
      {isExpanded && clipsWithKeyframes.length > 0 && (
        <div className="absolute left-0 right-0" style={{ top: trackHeight }}>
          {clipsWithKeyframes.map((clip) => (
            <div
              key={`keyframes-${clip.id}`}
              className="relative"
              style={{ left: clip.startTime * pixelsPerSecond }}
            >
              <KeyframeTrack
                clip={clip}
                pixelsPerSecond={pixelsPerSecond}
                onKeyframeSelect={onKeyframeSelect ?? (() => {})}
                onKeyframeMove={onKeyframeMove ?? (() => {})}
                onKeyframeDelete={onKeyframeDelete ?? (() => {})}
                selectedKeyframeIds={selectedKeyframeIds}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
