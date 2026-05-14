import React, { useRef, useState, useEffect } from "react";
import { Type } from "lucide-react";
import type { TextClip } from "@/lib/openreel-core";
import { ContextMenu, ContextMenuTrigger } from "@/components/openreel-ui";
import { GraphicsClipContextMenu } from "./GraphicsClipContextMenu";
import { calculateSnap } from "./utils";
import { useProjectStore } from "../../stores/project-store";
import { useTimelineStore } from "../../stores/timeline-store";
import { useUIStore } from "../../stores/ui-store";

interface TextClipComponentProps {
  textClip: TextClip;
  pixelsPerSecond: number;
  isSelected: boolean;
  onSelect: (clipId: string, addToSelection: boolean) => void;
  onTrim: (clipId: string, edge: "left" | "right", newTime: number) => void;
  onMoveClip?: (clipId: string, newStartTime: number) => void;
}

export const TextClipComponent: React.FC<TextClipComponentProps> = ({
  textClip,
  pixelsPerSecond,
  isSelected,
  onSelect,
  onTrim,
  onMoveClip,
}) => {
  const clipRef = useRef<HTMLDivElement>(null);
  const [isTrimming, setIsTrimming] = useState<"left" | "right" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const { snapSettings } = useUIStore();
  const { playheadPosition } = useTimelineStore();
  const trimStartRef = useRef<{
    mouseX: number;
    startTime: number;
    duration: number;
  }>({
    mouseX: 0,
    startTime: textClip.startTime,
    duration: textClip.duration,
  });

  const left = textClip.startTime * pixelsPerSecond;
  const width = textClip.duration * pixelsPerSecond;

  const handleClick = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (isTrimming || isDragging) return;
    e.stopPropagation();
    onSelect(textClip.id, e.shiftKey || e.metaKey);
  };

  // Double-click jumps focus into the inspector's text-content textarea so the
  // user can immediately start typing — CapCut-style inline edit affordance.
  // We can't truly edit the canvas-rendered glyphs in-place, but selecting +
  // auto-focusing the inspector text area gets us 90% of the way there.
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(textClip.id, false);
    // Defer so InspectorPanel renders the TextSection first.
    requestAnimationFrame(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        '[data-text-content-editor="true"]',
      );
      if (ta) {
        ta.focus();
        ta.select();
      }
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (isTrimming) return;
    e.stopPropagation();

    const rect = clipRef.current?.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const clickX = e.clientX - rect.left;
    const clipStartX = textClip.startTime * pixelsPerSecond;
    setDragOffset(clickX - clipStartX);
    setIsDragging(true);

    onSelect(textClip.id, e.shiftKey || e.metaKey);
  };

  useEffect(() => {
    if (!isDragging || !onMoveClip) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = clipRef.current?.parentElement?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left - dragOffset;
      const rawTime = Math.max(0, x / pixelsPerSecond);
      const allTracks = useProjectStore.getState().project.timeline.tracks;
      const dragSnapSettings = { ...snapSettings, snapToPlayhead: false };
      const snapResult = calculateSnap(
        rawTime,
        textClip.id,
        allTracks,
        playheadPosition,
        dragSnapSettings,
        pixelsPerSecond,
        textClip.duration,
      );
      onMoveClip(textClip.id, snapResult.time);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, textClip.id, textClip.duration, pixelsPerSecond, dragOffset, onMoveClip, snapSettings, playheadPosition]);

  const handleTrimStart = (e: React.MouseEvent, edge: "left" | "right") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setIsTrimming(edge);
    trimStartRef.current = {
      mouseX: e.clientX,
      startTime: textClip.startTime,
      duration: textClip.duration,
    };
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    if (!isTrimming) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - trimStartRef.current.mouseX;
      const deltaTime = deltaX / pixelsPerSecond;

      if (isTrimming === "left") {
        const newStartTime = Math.max(
          0,
          trimStartRef.current.startTime + deltaTime,
        );
        const maxStartTime =
          trimStartRef.current.startTime + trimStartRef.current.duration - 0.1;
        const clampedStartTime = Math.min(newStartTime, maxStartTime);
        onTrim(textClip.id, "left", clampedStartTime);
      } else {
        const newEndTime =
          trimStartRef.current.startTime +
          trimStartRef.current.duration +
          deltaTime;
        const minEndTime = trimStartRef.current.startTime + 0.1;
        const clampedEndTime = Math.max(newEndTime, minEndTime);
        onTrim(textClip.id, "right", clampedEndTime);
      }
    };

    const handleMouseUp = () => {
      setIsTrimming(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isTrimming, textClip.id, pixelsPerSecond, onTrim]);

  const isInteracting = isDragging || isTrimming;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={clipRef}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onMouseDown={handleMouseDown}
          data-clip-id={textClip.id}
          data-clip-type="text"
          className={`absolute top-1 bottom-1 rounded-lg overflow-hidden cursor-grab group ${
            isDragging ? "cursor-grabbing opacity-75" : ""
          } ${
            isSelected
              ? "ring-2 ring-purple-400 border-purple-400 z-10"
              : "border-purple-500/30 hover:border-purple-500/60 hover:brightness-110"
          } bg-purple-500/20 border`}
          style={{
            transform: `translateX(${left}px)`,
            width: `${Math.max(width, 40)}px`,
            willChange: isInteracting ? 'transform, width' : 'auto',
            transition: isInteracting ? 'none' : 'opacity 150ms, box-shadow 150ms',
          }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-purple-400/50 z-20 opacity-0 group-hover:opacity-100 transition-opacity"
            onMouseDown={(e) => handleTrimStart(e, "left")}
            title="Drag to trim start"
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-purple-400/50 z-20 opacity-0 group-hover:opacity-100 transition-opacity"
            onMouseDown={(e) => handleTrimStart(e, "right")}
            title="Drag to trim end"
          />
          <div className="w-full h-full flex items-center gap-1 px-3">
            <Type size={12} className="text-purple-400 flex-shrink-0" />
            <span className="text-[10px] font-medium text-purple-200 truncate">
              {textClip.text || "Text"}
            </span>
          </div>
          {isSelected && (
            <>
              <div className="absolute inset-0 border-2 border-purple-400 rounded-lg pointer-events-none" />
              <div
                className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-purple-400 rounded-r cursor-ew-resize"
                onMouseDown={(e) => handleTrimStart(e, "left")}
              />
              <div
                className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-purple-400 rounded-l cursor-ew-resize"
                onMouseDown={(e) => handleTrimStart(e, "right")}
              />
            </>
          )}
        </div>
      </ContextMenuTrigger>
      <GraphicsClipContextMenu clip={textClip} clipType="text" />
    </ContextMenu>
  );
};
