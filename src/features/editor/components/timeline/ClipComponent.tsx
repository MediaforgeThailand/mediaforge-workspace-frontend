import React, { useRef, useState, useEffect } from "react";
import { Image } from "lucide-react";
import type { Clip, Track } from "@/lib/openreel-core";
import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import { useTimelineStore } from "../../stores/timeline-store";
import { calculateSnap, getClipStyle } from "./utils";
import { ClipContextMenu } from "./ClipContextMenu";
import { ContextMenu, ContextMenuTrigger } from "@/components/openreel-ui";
import { ClipMediaCanvas } from "./ClipMediaCanvas";

interface ClipComponentProps {
  clip: Clip;
  track: Track;
  allTracks: Track[];
  pixelsPerSecond: number;
  isSelected: boolean;
  trackHeights: Map<string, number>;
  timelineRef: React.RefObject<HTMLDivElement>;
  onSelect: (clipId: string, addToSelection: boolean) => void;
  onMoveClip: (
    clipId: string,
    newStartTime: number,
    targetTrackId?: string,
  ) => void;
  onSnapIndicator: (time: number | null) => void;
  onTrimClip?: (
    clipId: string,
    edge: "left" | "right",
    newTime: number,
  ) => void;
}

const AUTO_SCROLL_THRESHOLD = 80;
const AUTO_SCROLL_SPEED = 10;
const DRAG_THRESHOLD = 5;

export const ClipComponent: React.FC<ClipComponentProps> = ({
  clip,
  track,
  allTracks,
  pixelsPerSecond,
  isSelected,
  trackHeights,
  timelineRef,
  onSelect,
  onMoveClip,
  onSnapIndicator,
  onTrimClip,
}) => {
  const { getMediaItem, splitClip } = useProjectStore();
  const { snapSettings } = useUIStore();
  const { playheadPosition, toolMode } = useTimelineStore();
  const mediaItem = getMediaItem(clip.mediaId);
  const [isDragging, setIsDragging] = useState(false);
  const [isPendingDrag, setIsPendingDrag] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragYOffset, setDragYOffset] = useState(0);
  const [isInvalidDrop, setIsInvalidDrop] = useState(false);
  const [isTrimming, setIsTrimming] = useState(false);
  const [trimEdge, setTrimEdge] = useState<"left" | "right" | null>(null);
  const trimStartRef = useRef<{
    mouseX: number;
    startTime: number;
    duration: number;
  }>({
    mouseX: 0,
    startTime: clip.startTime,
    duration: clip.duration,
  });
  const dragStartRef = useRef<{ mouseY: number; clipY: number; scrollTop: number }>({
    mouseY: 0,
    clipY: 0,
    scrollTop: 0,
  });
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pendingDropRef = useRef<{ time: number; targetTrackId?: string }>({ time: 0 });
  const dragPendingRef = useRef<{ active: boolean; startX: number; startY: number }>({
    active: false,
    startX: 0,
    startY: 0,
  });
  const clipRef = useRef<HTMLDivElement>(null);

  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;

  const isVideo = track.type === "video";
  const isAudio = track.type === "audio";
  const isImage = track.type === "image";
  const clipStyle = getClipStyle(track.type);

  const handleClick = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (isDragging || isPendingDrag) return;
    e.stopPropagation();
    // Split tool: clicking a clip splits it at the click's x position
    // (CapCut-style B-tool behavior). Falls through to selection if the
    // click is outside the clip's actual time range (snapped to playhead
    // edge cases).
    if (toolMode === "split") {
      const clipRect = clipRef.current?.getBoundingClientRect();
      if (clipRect) {
        const localX = e.clientX - clipRect.left;
        const splitTime = clip.startTime + localX / pixelsPerSecond;
        if (
          splitTime > clip.startTime + 0.05 &&
          splitTime < clip.startTime + clip.duration - 0.05
        ) {
          splitClip(clip.id, splitTime);
          return;
        }
      }
    }
    onSelect(clip.id, e.shiftKey || e.metaKey);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (track.locked || isTrimming) return;
    // In split-tool mode the clip click is consumed by handleClick to perform
    // the cut — skip the drag setup so the user doesn't accidentally drag
    // the clip while trying to slice it.
    if (toolMode === "split") {
      e.stopPropagation();
      return;
    }
    e.stopPropagation();

    const rect = clipRef.current?.parentElement?.getBoundingClientRect();
    const clipRect = clipRef.current?.getBoundingClientRect();
    if (!rect || !clipRect) return;

    const clickX = e.clientX - rect.left;
    const clipStartX = clip.startTime * pixelsPerSecond;
    setDragOffset(clickX - clipStartX);

    dragStartRef.current = {
      mouseY: e.clientY,
      clipY: clipRect.top - rect.top,
      scrollTop: timelineRef.current?.scrollTop || 0,
    };
    mousePositionRef.current = { x: e.clientX, y: e.clientY };
    dragPendingRef.current = { active: true, startX: e.clientX, startY: e.clientY };
    setDragYOffset(0);
    setIsInvalidDrop(false);
    setIsPendingDrag(true);
  };

  const handleTrimMouseDown =
    (edge: "left" | "right") => (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (track.locked || !onTrimClip) return;
      e.stopPropagation();
      setIsTrimming(true);
      setTrimEdge(edge);
      trimStartRef.current = {
        mouseX: e.clientX,
        startTime: clip.startTime,
        duration: clip.duration,
      };
      document.body.style.cursor = "ew-resize";
    };

  useEffect(() => {
    if (!isPendingDrag) return;

    const handlePendingMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragPendingRef.current.startX;
      const dy = e.clientY - dragPendingRef.current.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= DRAG_THRESHOLD) {
        dragPendingRef.current.active = false;
        setIsPendingDrag(false);
        setIsDragging(true);
      }
    };

    const handlePendingMouseUp = (e: MouseEvent) => {
      dragPendingRef.current.active = false;
      setIsPendingDrag(false);
      onSelect(clip.id, e.shiftKey || e.metaKey);
    };

    window.addEventListener("mousemove", handlePendingMouseMove);
    window.addEventListener("mouseup", handlePendingMouseUp);

    return () => {
      window.removeEventListener("mousemove", handlePendingMouseMove);
      window.removeEventListener("mouseup", handlePendingMouseUp);
    };
  }, [isPendingDrag, clip.id, onSelect]);

  useEffect(() => {
    if (!isDragging) return;

    let animationFrameId: number | null = null;

    const scrollLoop = () => {
      if (!timelineRef.current) {
        animationFrameId = requestAnimationFrame(scrollLoop);
        return;
      }

      const timeline = timelineRef.current;
      const timelineRect = timeline.getBoundingClientRect();
      const mouseY = mousePositionRef.current.y;
      const timelineTop = timelineRect.top;
      const timelineBottom = timelineRect.bottom;
      const canScrollUp = timeline.scrollTop > 0;
      const canScrollDown = timeline.scrollTop < timeline.scrollHeight - timeline.clientHeight;

      const distanceFromTop = mouseY - timelineTop;
      const distanceFromBottom = timelineBottom - mouseY;

      if (distanceFromTop < AUTO_SCROLL_THRESHOLD && canScrollUp) {
        timeline.scrollTop -= AUTO_SCROLL_SPEED;
      } else if (distanceFromBottom < AUTO_SCROLL_THRESHOLD && canScrollDown) {
        timeline.scrollTop += AUTO_SCROLL_SPEED;
      }

      animationFrameId = requestAnimationFrame(scrollLoop);
    };

    animationFrameId = requestAnimationFrame(scrollLoop);

    const handleMouseMove = (e: MouseEvent) => {
      mousePositionRef.current.x = e.clientX;
      mousePositionRef.current.y = e.clientY;

      const rect = clipRef.current?.parentElement?.getBoundingClientRect();
      const timelineRect = timelineRef.current?.getBoundingClientRect();
      if (!rect || !timelineRect) return;

      const x = e.clientX - rect.left - dragOffset;
      const rawTime = Math.max(0, x / pixelsPerSecond);

      const dragSnapSettings = { ...snapSettings, snapToPlayhead: false };
      const snapResult = calculateSnap(
        rawTime,
        clip.id,
        allTracks,
        playheadPosition,
        dragSnapSettings,
        pixelsPerSecond,
        clip.duration,
      );
      const currentScrollTop = timelineRef.current?.scrollTop || 0;
      const scrollDelta = currentScrollTop - dragStartRef.current.scrollTop;
      const yDelta = (e.clientY - dragStartRef.current.mouseY) + scrollDelta;
      setDragYOffset(yDelta);

      const scrollTop = timelineRef.current?.scrollTop || 0;
      const mouseY = e.clientY - timelineRect.top + scrollTop;
      let targetTrackId: string | undefined;
      let hoveredTrackType: string | undefined;
      let cumulativeY = 0;

      for (const t of allTracks) {
        const height = trackHeights.get(t.id) || 60;
        if (mouseY >= cumulativeY && mouseY < cumulativeY + height) {
          hoveredTrackType = t.type;
          if (t.type === track.type && t.id !== track.id) {
            targetTrackId = t.id;
          }
          break;
        }
        cumulativeY += height;
      }

      const isOverDifferentTrackType = hoveredTrackType !== undefined && hoveredTrackType !== track.type;
      setIsInvalidDrop(isOverDifferentTrackType);

      pendingDropRef.current = { time: snapResult.time, targetTrackId };
      onMoveClip(clip.id, snapResult.time, undefined);
      onSnapIndicator(snapResult.snapped && snapResult.snapPoint ? snapResult.snapPoint.time : null);
    };

    const handleMouseUp = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      const { time, targetTrackId } = pendingDropRef.current;
      if (targetTrackId) {
        onMoveClip(clip.id, time, targetTrackId);
      }

      setIsDragging(false);
      setDragYOffset(0);
      setIsInvalidDrop(false);
      onSnapIndicator(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isDragging,
    dragOffset,
    pixelsPerSecond,
    clip.id,
    track.id,
    track.type,
    allTracks,
    trackHeights,
    timelineRef,
    playheadPosition,
    snapSettings,
    onMoveClip,
    onSnapIndicator,
  ]);

  useEffect(() => {
    if (!isTrimming || !trimEdge || !onTrimClip) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - trimStartRef.current.mouseX;
      const deltaTime = deltaX / pixelsPerSecond;

      if (trimEdge === "left") {
        const newStartTime = Math.max(
          0,
          trimStartRef.current.startTime + deltaTime,
        );
        const maxStartTime =
          trimStartRef.current.startTime + trimStartRef.current.duration - 0.1;
        const clampedStartTime = Math.min(newStartTime, maxStartTime);
        onTrimClip(clip.id, "left", clampedStartTime);
      } else {
        const newEndTime =
          trimStartRef.current.startTime +
          trimStartRef.current.duration +
          deltaTime;
        const minEndTime = trimStartRef.current.startTime + 0.1;
        const clampedEndTime = Math.max(newEndTime, minEndTime);
        onTrimClip(clip.id, "right", clampedEndTime);
      }
    };

    const handleMouseUp = () => {
      setIsTrimming(false);
      setTrimEdge(null);
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isTrimming, trimEdge, clip.id, pixelsPerSecond, onTrimClip]);

  const clipName = mediaItem?.name || clip.mediaId.slice(0, 8);

  const isInteracting = isDragging || isTrimming;

  // Measure current clip block height so the canvas children can split the
  // band between thumbnails and waveform.
  const [measuredHeight, setMeasuredHeight] = useState(0);
  useEffect(() => {
    const el = clipRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setMeasuredHeight(el.clientHeight);
    });
    ro.observe(el);
    setMeasuredHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={clipRef}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          data-clip-id={clip.id}
          data-clip-type="media"
          className={`group absolute top-1 bottom-1 rounded-lg overflow-hidden shadow-sm ${
            isDragging
              ? `cursor-grabbing z-50 ${isInvalidDrop ? "opacity-50 ring-2 ring-red-500 border-red-500" : "opacity-90 shadow-xl"}`
              : toolMode === "split"
                ? "cursor-col-resize"
                : "cursor-grab"
          } ${
            isSelected && !isDragging
              ? "ring-2 ring-primary border-primary z-10"
              : !isDragging ? "border-opacity-30 hover:border-opacity-60 hover:brightness-110" : ""
          } ${clipStyle.bg} border ${clipStyle.border} ${
            track.locked ? "cursor-not-allowed opacity-60" : ""
          }`}
          style={{
            transform: isDragging
              ? `translate(${left}px, ${dragYOffset}px)`
              : `translateX(${left}px)`,
            width: `${width}px`,
            willChange: isInteracting ? 'transform, width' : 'auto',
            transition: isInteracting ? 'none' : 'opacity 150ms, box-shadow 150ms',
            pointerEvents: isDragging ? 'none' : 'auto',
          }}
        >
      {(isVideo || isAudio) && mediaItem && measuredHeight > 0 && (
        <ClipMediaCanvas
          clip={clip}
          track={track}
          mediaItem={mediaItem}
          clipWidth={width}
          clipHeight={measuredHeight}
          pixelsPerSecond={pixelsPerSecond}
          isInteractingExternal={isInteracting}
        />
      )}

      {isVideo && !mediaItem && (
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 pointer-events-none" />
      )}

      {isImage && (
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-purple-500/10 flex items-center justify-center pointer-events-none">
          {mediaItem?.thumbnailUrl ? (
            <img
              src={mediaItem.thumbnailUrl}
              alt={clipName}
              className="h-full object-cover opacity-60"
            />
          ) : (
            <Image size={24} className="text-purple-400/50" />
          )}
        </div>
      )}

      <div
        className={`w-full h-full flex flex-col px-2 relative z-10 pointer-events-none ${
          isAudio ? "justify-start pt-1 pb-0" : "justify-end pb-1"
        }`}
      >
        <span
          className={`text-[10px] font-medium truncate drop-shadow-md ${
            isSelected ? clipStyle.selectedText : clipStyle.text
          }`}
        >
          {clipName}
        </span>
      </div>

      {clip.keyframes && clip.keyframes.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-3 flex items-center pointer-events-none">
          {clip.keyframes.map((kf) => {
            const relativeTime = kf.time - clip.startTime;
            if (relativeTime < 0 || relativeTime > clip.duration) return null;
            const posPercent = (relativeTime / clip.duration) * 100;
            return (
              <div
                key={kf.id}
                className="absolute w-2 h-2 bg-yellow-400 rotate-45 border border-yellow-600"
                style={{ left: `${posPercent}%`, marginLeft: "-4px" }}
                title={`${kf.property} @ ${kf.time.toFixed(2)}s`}
              />
            );
          })}
        </div>
      )}

      {isSelected && (
        <div className="absolute inset-0 border-2 border-primary rounded-lg pointer-events-none shadow-[inset_0_0_10px_rgba(255,181,51,0.25)]" />
      )}

      {(isVideo || isImage || isAudio) && onTrimClip && (
        <>
          <div
            onMouseDown={handleTrimMouseDown("left")}
            className={`absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity ${
              isAudio ? "hover:bg-blue-400/50" : isVideo ? "hover:bg-green-400/50" : "hover:bg-purple-400/50"
            }`}
            onClick={(e) => e.stopPropagation()}
            title="Drag to adjust start"
          />
          <div
            onMouseDown={handleTrimMouseDown("right")}
            className={`absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity ${
              isAudio ? "hover:bg-blue-400/50" : isVideo ? "hover:bg-green-400/50" : "hover:bg-purple-400/50"
            }`}
            onClick={(e) => e.stopPropagation()}
            title="Drag to adjust end"
          />
        </>
      )}

        </div>
      </ContextMenuTrigger>
      <ClipContextMenu clip={clip} track={track} />
    </ContextMenu>
  );
};
