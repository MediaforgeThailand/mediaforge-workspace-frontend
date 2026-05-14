import React, {
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Undo2,
  Redo2,
  Layers,
  Maximize2,
  Film,
  Music,
  Image,
  Type,
  Shapes,
  Scissors,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  ChevronDown as ChevronDownIcon,
  Magnet,
  Rows3,
  Rows2,
  Crosshair,
  Link2,
  AlignVerticalSpaceAround,
  MousePointer2,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useProjectStore } from "../stores/project-store";
import { useTimelineStore } from "../stores/timeline-store";
import { useUIStore } from "../stores/ui-store";
import { toast } from "../stores/notification-store";
import { useEngineStore } from "../stores/engine-store";
import { getPlaybackBridge } from "../bridges/playback-bridge";
import {
  IconButton,
  Popover,
  PopoverTrigger,
  PopoverContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/openreel-ui";
import {
  Playhead,
  TimeRuler,
  TrackHeader,
  TrackLane,
  BeatMarkerOverlay,
  MarkerIndicator,
  formatTimecode,
  getTrackInfo,
} from "./timeline/index";

export const Timeline: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);

  const {
    project,
    undo,
    redo,
    canUndo,
    canRedo,
    splitClip,
    removeClip,
    addTrack,
    reorderTrack,
    deleteShapeClip,
    deleteSVGClip,
    deleteTextClip,
    removeMarker,
    updateMarker,
    updateClipKeyframes,
  } = useProjectStore();
  const tracks = project.timeline.tracks;

  const [draggedTrackId, setDraggedTrackId] = React.useState<string | null>(
    null,
  );

  const {
    playheadPosition,
    playbackState,
    pixelsPerSecond,
    scrollX,
    scrollY,
    viewportWidth,
    setScrollX,
    setScrollY,
    setViewportDimensions,
    zoomIn,
    zoomOut,
    trackHeight,
    setTrackHeight,
    setTrackHeightById,
    getTrackHeight,
    magnet,
    linkage,
    previewAxis,
    previewAxisTime,
    toggleMagnet,
    toggleLinkage,
    togglePreviewAxis,
    setPreviewAxisTime,
    toolMode,
    setToolMode,
  } = useTimelineStore();

  // Hover handler for the timeline track area — when the preview-axis toggle
  // is on, track the cursor's time-position so we can draw a vertical guide.
  const handleTracksMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!previewAxis) {
        if (previewAxisTime !== null) setPreviewAxisTime(null);
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left + (e.currentTarget.scrollLeft || 0);
      const time = Math.max(0, x / pixelsPerSecond);
      setPreviewAxisTime(time);
    },
    [previewAxis, previewAxisTime, pixelsPerSecond, setPreviewAxisTime],
  );

  const handleTracksMouseLeave = useCallback(() => {
    if (previewAxisTime !== null) setPreviewAxisTime(null);
  }, [previewAxisTime, setPreviewAxisTime]);

  const [showLayersPanel, setShowLayersPanel] = useState(false);

  const { select, selectMultiple, clearSelection, getSelectedClipIds, snapSettings, toggleSnap } =
    useUIStore();
  const selectedClipIds = getSelectedClipIds();

  const { getTitleEngine, getGraphicsEngine } = useEngineStore();
  const titleEngine = getTitleEngine();
  const allTextClips = useMemo(() => {
    return titleEngine?.getAllTextClips() ?? [];
  }, [titleEngine, project.modifiedAt]);

  const getTextClipsForTrack = useCallback(
    (trackId: string) => {
      return allTextClips.filter((tc) => tc.trackId === trackId);
    },
    [allTextClips],
  );

  const graphicsEngine = getGraphicsEngine();
  const allShapeClips = useMemo(() => {
    const shapes = graphicsEngine?.getAllShapeClips() ?? [];
    const svgs = graphicsEngine?.getAllSVGClips() ?? [];
    const stickers = graphicsEngine?.getAllStickerClips() ?? [];
    return [...shapes, ...svgs, ...stickers];
  }, [graphicsEngine, project.modifiedAt]);

  const getShapeClipsForTrack = useCallback(
    (trackId: string) => {
      return allShapeClips.filter((sc) => sc.trackId === trackId);
    },
    [allShapeClips],
  );
  const [isBoxSelecting, setIsBoxSelecting] = React.useState(false);
  const [selectionBox, setSelectionBox] = React.useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  // V4: parallel ref so the move handler can check "are we marquee-dragging?"
  // without waiting for React to flush state updates. Without this, the first
  // few mousemove events after a fresh mousedown see the stale `false` value
  // and the marquee silently fails to follow the cursor.
  const isBoxSelectingRef = useRef(false);
  const selectionBoxRef = useRef<typeof selectionBox>(null);

  // Click-to-seek / scrub state. When the user mousedowns on the empty
  // track area we are in one of four states:
  //   - "pending": waiting to see if this becomes a click, scrub, or marquee
  //   - "scrubbing": user is dragging the playhead continuously
  //   - "marquee": user is sweeping a selection box (V4 behavior)
  //   - "idle": no pending interaction
  // Using a ref so the global mousemove/up listeners always see the latest
  // value without waiting for React to flush. The 5px / 150ms thresholds are
  // industry-standard (Premiere/Resolve) for distinguishing click vs drag.
  const SEEK_DRAG_THRESHOLD_PX = 5;
  const SCRUB_HOLD_MS = 150;
  const seekInteractionRef = useRef<{
    mode: "idle" | "pending" | "scrubbing" | "marquee";
    startX: number;
    startY: number;
    startTime: number;
    holdTimer: number | null;
  }>({
    mode: "idle",
    startX: 0,
    startY: 0,
    startTime: 0,
    holdTimer: null,
  });
  const [isScrubbingEmpty, setIsScrubbingEmpty] = useState(false);
  // Tracks "is there any pending seek-interaction" so the effect that
  // attaches global mousemove/up listeners re-runs when a fresh mousedown
  // arms a new interaction. We can't rely on the ref alone because changing
  // ref state doesn't trigger React effects.
  const [hasPendingInteraction, setHasPendingInteraction] = useState(false);

  const timelineDuration = useMemo(() => {
    let maxEnd = 0;
    for (const track of tracks) {
      for (const clip of track.clips) {
        const end = clip.startTime + clip.duration;
        if (end > maxEnd) maxEnd = end;
      }
    }
    return Math.max(maxEnd, 60); // Minimum 60 seconds
  }, [tracks]);

  const totalTracksHeight = useMemo(() => {
    let height = 0;
    for (const track of tracks) {
      height += getTrackHeight(track.id);
    }
    return height;
  }, [tracks, getTrackHeight]);

  const trackHeightsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const track of tracks) {
      map.set(track.id, getTrackHeight(track.id));
    }
    return map;
  }, [tracks, getTrackHeight]);

  const handleTrackDragStart = useCallback(
    (e: React.DragEvent, trackId: string) => {
      e.dataTransfer.setData("trackId", trackId);
      e.dataTransfer.effectAllowed = "move";
      setDraggedTrackId(trackId);
    },
    [],
  );

  const handleTrackDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleTrackDrop = useCallback(
    async (e: React.DragEvent, targetTrackId: string) => {
      e.preventDefault();
      const sourceTrackId = e.dataTransfer.getData("trackId");
      setDraggedTrackId(null);

      if (sourceTrackId && sourceTrackId !== targetTrackId) {
        const targetIndex = tracks.findIndex((t) => t.id === targetTrackId);
        if (targetIndex !== -1) {
          await reorderTrack(sourceTrackId, targetIndex);
        }
      }
    },
    [tracks, reorderTrack],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportDimensions(
          entry.contentRect.width,
          entry.contentRect.height,
        );
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [setViewportDimensions]);

  useEffect(() => {
    if (playbackState !== "playing") return;

    const playheadPixels = playheadPosition * pixelsPerSecond;
    const visibleEnd = scrollX + viewportWidth - 150;

    if (playheadPixels > visibleEnd && tracksRef.current) {
      const newScrollX = playheadPixels - viewportWidth + 200;
      tracksRef.current.scrollLeft = Math.max(0, newScrollX);
    }
  }, [playheadPosition, playbackState, pixelsPerSecond, scrollX, viewportWidth]);

  const handleSelectClip = useCallback(
    (clipId: string, addToSelection: boolean) => {
      const isTextClip = allTextClips.some((tc) => tc.id === clipId);
      if (isTextClip) {
        const textClip = allTextClips.find((tc) => tc.id === clipId);
        select(
          { type: "text-clip", id: clipId, trackId: textClip?.trackId },
          addToSelection,
        );
        return;
      }
      const isShapeClip = allShapeClips.some((sc) => sc.id === clipId);
      if (isShapeClip) {
        const shapeClip = allShapeClips.find((sc) => sc.id === clipId);
        select(
          { type: "shape-clip", id: clipId, trackId: shapeClip?.trackId },
          addToSelection,
        );
        return;
      }

      let trackId: string | undefined;
      for (const track of tracks) {
        if (track.clips.some((c) => c.id === clipId)) {
          trackId = track.id;
          break;
        }
      }
      select({ type: "clip", id: clipId, trackId }, addToSelection);
    },
    [tracks, select, allTextClips, allShapeClips],
  );

  const [selectedKeyframeIds, setSelectedKeyframeIds] = useState<string[]>([]);

  const handleKeyframeSelect = useCallback(
    (keyframeId: string, addToSelection: boolean) => {
      if (addToSelection) {
        setSelectedKeyframeIds((prev) =>
          prev.includes(keyframeId)
            ? prev.filter((id) => id !== keyframeId)
            : [...prev, keyframeId]
        );
      } else {
        setSelectedKeyframeIds([keyframeId]);
      }
    },
    []
  );

  const handleKeyframeMove = useCallback(
    (keyframeId: string, newTime: number) => {
      for (const track of tracks) {
        for (const clip of track.clips) {
          const keyframe = clip.keyframes?.find((kf) => kf.id === keyframeId);
          if (keyframe) {
            const updatedKeyframes = clip.keyframes?.map((kf) =>
              kf.id === keyframeId ? { ...kf, time: Math.max(0, newTime) } : kf
            );
            if (updatedKeyframes) {
              updateClipKeyframes(clip.id, updatedKeyframes);
            }
            return;
          }
        }
      }
    },
    [tracks, updateClipKeyframes]
  );

  const handleKeyframeDelete = useCallback(
    (keyframeId: string) => {
      for (const track of tracks) {
        for (const clip of track.clips) {
          const keyframe = clip.keyframes?.find((kf) => kf.id === keyframeId);
          if (keyframe) {
            const updatedKeyframes = clip.keyframes?.filter(
              (kf) => kf.id !== keyframeId
            );
            if (updatedKeyframes) {
              updateClipKeyframes(clip.id, updatedKeyframes);
            }
            setSelectedKeyframeIds((prev) =>
              prev.filter((id) => id !== keyframeId)
            );
            return;
          }
        }
      }
    },
    [tracks, updateClipKeyframes]
  );

  const handleSplit = useCallback(async () => {
    if (selectedClipIds.length === 1) {
      await splitClip(selectedClipIds[0], playheadPosition);
    }
  }, [selectedClipIds, playheadPosition, splitClip]);

  const handleDelete = useCallback(async () => {
    if (selectedClipIds.length === 0) return;

    for (const id of selectedClipIds) {
      const textClip = allTextClips.find((tc) => tc.id === id);
      if (textClip) {
        deleteTextClip(id);
        continue;
      }

      const graphicClip = allShapeClips.find((gc) => gc.id === id);
      if (graphicClip) {
        if (graphicClip.type === "svg") {
          deleteSVGClip(id);
        } else {
          deleteShapeClip(id);
        }
        continue;
      }

      removeClip(id);
    }
    clearSelection();
  }, [
    selectedClipIds,
    removeClip,
    clearSelection,
    allTextClips,
    allShapeClips,
    deleteTextClip,
    deleteShapeClip,
    deleteSVGClip,
  ]);

  // V4: don't clear selection if a marquee drag just completed. The marquee
  // sets selection on mouseup, which then bubbles to the containerRef as a
  // click — without this guard the marquee selection vanishes immediately.
  const justFinishedMarqueeRef = useRef(false);
  const handleBackgroundClick = useCallback(() => {
    if (justFinishedMarqueeRef.current) {
      justFinishedMarqueeRef.current = false;
      return;
    }
    clearSelection();
  }, [clearSelection]);

  // Jump-to-prev/next clip boundary across all tracks. Used by the
  // CapCut-parity prev/next icons in the timeline toolbar.
  const handleJumpToPrev = useCallback(() => {
    const allBoundaries = new Set<number>();
    allBoundaries.add(0);
    for (const track of tracks) {
      for (const clip of track.clips) {
        allBoundaries.add(clip.startTime);
        allBoundaries.add(clip.startTime + clip.duration);
      }
    }
    const sorted = [...allBoundaries].sort((a, b) => a - b);
    // Find the largest boundary strictly less than current playhead position
    let target = 0;
    for (const t of sorted) {
      if (t < playheadPosition - 0.001) target = t;
      else break;
    }
    const bridge = getPlaybackBridge();
    bridge.scrubTo(target);
  }, [tracks, playheadPosition]);

  const handleJumpToNext = useCallback(() => {
    const allBoundaries = new Set<number>();
    for (const track of tracks) {
      for (const clip of track.clips) {
        allBoundaries.add(clip.startTime);
        allBoundaries.add(clip.startTime + clip.duration);
      }
    }
    const sorted = [...allBoundaries].sort((a, b) => a - b);
    const target = sorted.find((t) => t > playheadPosition + 0.001);
    if (target !== undefined) {
      const bridge = getPlaybackBridge();
      bridge.scrubTo(target);
    }
  }, [tracks, playheadPosition]);

  const handleBoxSelectionStart = useCallback(
    (e: React.MouseEvent) => {
      // Only respond to left-click. Right-click (context menu) and middle-click
      // are explicitly ignored so the existing right-click context menu and
      // any future middle-click handlers continue to work.
      if (e.button !== 0) return;
      // Ignore drags that start on a clip — those should move/select that
      // single clip, not start a marquee. Previously this checked the
      // legacy `.clip-component` className but no element actually had it,
      // making the guard a no-op. (V4 fix)
      const target = e.target as HTMLElement;
      if (target.closest("[data-clip-id]")) return;
      if (target.closest("[data-clip-type]")) return;
      // Don't start marquee on the playhead, ruler, track header, or other
      // interactive overlays — the guard above only catches the clips.
      if (target.closest("[data-testid='time-ruler']")) return;
      if (target.closest("[class*='playhead']")) return;

      const rect = tracksRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Convert viewport coordinates to timeline (content) coordinates by
      // accounting for the scroll position.
      const x = e.clientX - rect.left + scrollX;
      const y = e.clientY - rect.top + scrollY;
      const timelineX = e.clientX - rect.left + (tracksRef.current?.scrollLeft || 0);
      const clickedTime = Math.max(0, timelineX / pixelsPerSecond);

      // Enter "pending" mode — we don't know yet whether this becomes a
      // click-seek, a scrub, or a marquee. The decision is made by the
      // global mousemove/up listeners based on movement + time thresholds.
      // This is the same UX shipped by Premiere / FCP / Resolve.
      if (seekInteractionRef.current.holdTimer !== null) {
        window.clearTimeout(seekInteractionRef.current.holdTimer);
      }
      seekInteractionRef.current = {
        mode: "pending",
        startX: x,
        startY: y,
        startTime: clickedTime,
        holdTimer: window.setTimeout(() => {
          // User has held the mouse down without significant movement.
          // Promote to "scrubbing" mode — subsequent moves continuously seek.
          if (seekInteractionRef.current.mode === "pending") {
            seekInteractionRef.current.mode = "scrubbing";
            setIsScrubbingEmpty(true);
            // Pause playback before we start scrubbing (industry standard —
            // matches Premiere). Also commits an initial seek at the
            // mousedown position so the playhead snaps there immediately.
            const bridge = getPlaybackBridge();
            if (useTimelineStore.getState().playbackState === "playing") {
              bridge.pause();
            }
            bridge.startScrubbing();
            bridge.scrubTo(
              Math.min(
                Math.max(0, seekInteractionRef.current.startTime),
                timelineDuration,
              ),
            );
          }
        }, SCRUB_HOLD_MS),
      };

      // Pre-arm the marquee state (but DON'T set isBoxSelecting=true yet —
      // that only happens once we cross the drag threshold). The selectionBox
      // origin is captured here so promotion to marquee is seamless.
      selectionBoxRef.current = { startX: x, startY: y, currentX: x, currentY: y };

      // Trigger the global-listener effect to (re-)attach listeners. The
      // listener-effect's `isBoxSelecting` dep is still false at this point,
      // so we need an explicit signal that an interaction has been armed.
      setHasPendingInteraction(true);
    },
    [scrollX, scrollY, pixelsPerSecond, timelineDuration],
  );

  const handleBoxSelectionMove = useCallback(
    (e: React.MouseEvent) => {
      // Use the ref so we don't miss the early move events after mousedown.
      if (!isBoxSelectingRef.current || !selectionBoxRef.current) return;

      const rect = tracksRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left + scrollX;
      const y = e.clientY - rect.top + scrollY;

      const updated = {
        ...selectionBoxRef.current,
        currentX: x,
        currentY: y,
      };
      selectionBoxRef.current = updated;
      setSelectionBox(updated);
    },
    [scrollX, scrollY],
  );

  const handleBoxSelectionEnd = useCallback(() => {
    // Use refs (current values) — fall back to React state for the boundary
    // case where the refs were already cleared by a prior end call.
    const wasSelecting = isBoxSelectingRef.current || isBoxSelecting;
    const sBox = selectionBoxRef.current || selectionBox;
    if (!wasSelecting || !sBox) {
      isBoxSelectingRef.current = false;
      selectionBoxRef.current = null;
      setIsBoxSelecting(false);
      setSelectionBox(null);
      return;
    }

    // Convert pixel coordinates to timeline time using current zoom level
    const minX = Math.min(sBox.startX, sBox.currentX);
    const maxX = Math.max(sBox.startX, sBox.currentX);
    const minTime = minX / pixelsPerSecond;
    const maxTime = maxX / pixelsPerSecond;

    let currentY = 0;
    const selectedItems: {
      type: "clip" | "text-clip" | "shape-clip";
      id: string;
      trackId: string;
    }[] = [];

    // Iterate through tracks to find which are overlapped by selection box.
    // V4: also include text and shape clips inside the marquee — without this,
    // dragging across a title or graphic clip silently misses it.
    for (const track of tracks) {
      const trackH = getTrackHeight(track.id);
      const trackMinY = currentY;
      const trackMaxY = currentY + trackH;

      const minY = Math.min(sBox.startY, sBox.currentY);
      const maxY = Math.max(sBox.startY, sBox.currentY);

      const trackOverlaps = minY < trackMaxY && maxY > trackMinY;

      if (trackOverlaps) {
        for (const clip of track.clips) {
          const clipStart = clip.startTime;
          const clipEnd = clip.startTime + clip.duration;
          const clipOverlaps = minTime < clipEnd && maxTime > clipStart;
          if (clipOverlaps) {
            selectedItems.push({
              type: "clip",
              id: clip.id,
              trackId: track.id,
            });
          }
        }

        // Text clips on this track
        for (const tc of allTextClips) {
          if (tc.trackId !== track.id) continue;
          const tcEnd = tc.startTime + tc.duration;
          if (minTime < tcEnd && maxTime > tc.startTime) {
            selectedItems.push({
              type: "text-clip",
              id: tc.id,
              trackId: track.id,
            });
          }
        }

        // Shape/sticker/SVG clips on this track
        for (const sc of allShapeClips) {
          if (sc.trackId !== track.id) continue;
          const scEnd = sc.startTime + sc.duration;
          if (minTime < scEnd && maxTime > sc.startTime) {
            selectedItems.push({
              type: "shape-clip",
              id: sc.id,
              trackId: track.id,
            });
          }
        }
      }

      currentY += trackH;
    }

    if (selectedItems.length > 0) {
      selectMultiple(selectedItems);
      // V4: prevent the trailing background-click handler from immediately
      // clearing this fresh marquee selection.
      justFinishedMarqueeRef.current = true;
    }

    isBoxSelectingRef.current = false;
    selectionBoxRef.current = null;
    setIsBoxSelecting(false);
    setSelectionBox(null);
  }, [
    isBoxSelecting,
    selectionBox,
    pixelsPerSecond,
    tracks,
    allTextClips,
    allShapeClips,
    getTrackHeight,
    selectMultiple,
  ]);

  useEffect(() => {
    // Drive both the marquee box (existing V4 behavior) and the new
    // click-to-seek / scrub state machine. We attach global listeners
    // whenever EITHER a marquee is active OR a seek-interaction is pending,
    // since the same mousedown can promote into either path.
    //
    // V4: also listen for mousemove on the document so the marquee box keeps
    // following the cursor when the user drags outside the tracksRef element
    // (e.g. sweeping all the way to the left across the track-header column
    // or past the right edge of the timeline). React's onMouseMove only
    // fires while the cursor is over its DOM subtree, so a global listener
    // is required for the standard NLE marquee behavior.
    if (
      !isBoxSelecting &&
      !isScrubbingEmpty &&
      !hasPendingInteraction &&
      seekInteractionRef.current.mode === "idle"
    ) {
      return;
    }

    const handleMouseMoveGlobal = (e: MouseEvent) => {
      const seek = seekInteractionRef.current;
      const rect = tracksRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left + scrollX;
      const y = e.clientY - rect.top + scrollY;
      const timelineX = e.clientX - rect.left + (tracksRef.current?.scrollLeft || 0);
      const rawTime = timelineX / pixelsPerSecond;
      // Clamp to [0, timelineDuration] — clicking past the end snaps to end,
      // clicking before 0 (due to scroll) snaps to 0.
      const clampedTime = Math.min(Math.max(0, rawTime), timelineDuration);

      if (seek.mode === "pending") {
        // Did we exceed the 5px drag threshold? Promote to marquee.
        const dx = Math.abs(x - seek.startX);
        const dy = Math.abs(y - seek.startY);
        if (dx > SEEK_DRAG_THRESHOLD_PX || dy > SEEK_DRAG_THRESHOLD_PX) {
          // Cancel the scrub-hold timer and enter marquee mode.
          if (seek.holdTimer !== null) {
            window.clearTimeout(seek.holdTimer);
            seek.holdTimer = null;
          }
          seek.mode = "marquee";
          isBoxSelectingRef.current = true;
          setIsBoxSelecting(true);
          const box = {
            startX: seek.startX,
            startY: seek.startY,
            currentX: x,
            currentY: y,
          };
          selectionBoxRef.current = box;
          setSelectionBox(box);
          return;
        }
        // Still within threshold — wait for either threshold or hold timer.
        return;
      }

      if (seek.mode === "scrubbing") {
        // Continuous scrub: playhead follows the cursor. Already paused +
        // startScrubbing'd in the hold-timer callback.
        getPlaybackBridge().scrubTo(clampedTime);
        return;
      }

      if (seek.mode === "marquee") {
        if (!selectionBoxRef.current) return;
        const updated = {
          ...selectionBoxRef.current,
          currentX: x,
          currentY: y,
        };
        selectionBoxRef.current = updated;
        setSelectionBox(updated);
        return;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const seek = seekInteractionRef.current;

      if (seek.holdTimer !== null) {
        window.clearTimeout(seek.holdTimer);
        seek.holdTimer = null;
      }

      if (seek.mode === "pending") {
        // Mouse came back up without crossing the drag threshold AND before
        // the hold-timer promoted us to scrub mode. This is a CLICK — seek
        // the playhead to the click position. Industry-standard NLE behavior.
        const rect = tracksRef.current?.getBoundingClientRect();
        if (rect) {
          const timelineX =
            e.clientX - rect.left + (tracksRef.current?.scrollLeft || 0);
          const rawTime = timelineX / pixelsPerSecond;
          const clampedTime = Math.min(
            Math.max(0, rawTime),
            timelineDuration,
          );
          // Pause if currently playing (Premiere behavior — predictable).
          const bridge = getPlaybackBridge();
          if (useTimelineStore.getState().playbackState === "playing") {
            bridge.pause();
          }
          // Use seek() for a one-shot commit. scrubTo() is a no-op outside of
          // an active scrubbing session (it only fires when isScrubbing=true
          // in the timeline store).
          bridge.seek(clampedTime);
          // Clear any multi-selection — clicking empty area is also a
          // deselect (Premiere behavior). `handleBackgroundClick` will fire
          // on the trailing click event and clear it; that already works,
          // but explicitly do it here for the case where the parent
          // click handler doesn't fire (e.g. drag was attempted then
          // cancelled within threshold).
          clearSelection();
        }
        seek.mode = "idle";
        // Reset marquee state in case it was pre-armed.
        selectionBoxRef.current = null;
        setHasPendingInteraction(false);
        return;
      }

      if (seek.mode === "scrubbing") {
        // Finish scrubbing — commit final position.
        getPlaybackBridge().endScrubbing();
        setIsScrubbingEmpty(false);
        seek.mode = "idle";
        selectionBoxRef.current = null;
        setHasPendingInteraction(false);
        return;
      }

      if (seek.mode === "marquee") {
        // Hand off to the existing marquee-end path.
        seek.mode = "idle";
        setHasPendingInteraction(false);
        handleBoxSelectionEnd();
        return;
      }

      // Defensive: if we get here, the interaction was already idle (e.g.
      // some external cancellation). Just clear the pending flag.
      setHasPendingInteraction(false);
    };

    // ESC during scrub or marquee cancels the interaction (industry standard).
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const seek = seekInteractionRef.current;
      if (seek.mode === "idle") return;
      if (seek.holdTimer !== null) {
        window.clearTimeout(seek.holdTimer);
        seek.holdTimer = null;
      }
      if (seek.mode === "scrubbing") {
        getPlaybackBridge().endScrubbing();
        setIsScrubbingEmpty(false);
      }
      if (seek.mode === "marquee") {
        isBoxSelectingRef.current = false;
        selectionBoxRef.current = null;
        setIsBoxSelecting(false);
        setSelectionBox(null);
      }
      seek.mode = "idle";
      setHasPendingInteraction(false);
    };

    document.addEventListener("mousemove", handleMouseMoveGlobal);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousemove", handleMouseMoveGlobal);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isBoxSelecting,
    isScrubbingEmpty,
    hasPendingInteraction,
    handleBoxSelectionEnd,
    scrollX,
    scrollY,
    pixelsPerSecond,
    timelineDuration,
    clearSelection,
  ]);

  const handleDropMedia = useCallback(
    async (trackId: string, mediaId: string, startTime: number) => {
      const { addClip, addClipToNewTrack } = useProjectStore.getState();
      if (trackId) {
        await addClip(trackId, mediaId, startTime);
      } else {
        await addClipToNewTrack(mediaId, startTime);
      }
    },
    [],
  );

  const { moveClip } = useProjectStore();
  const handleMoveClip = useCallback(
    async (clipId: string, newStartTime: number, targetTrackId?: string) => {
      const graphicClip = allShapeClips.find((sc) => sc.id === clipId);
      if (graphicClip && graphicsEngine) {
        if (graphicClip.type === "sticker" || graphicClip.type === "emoji") {
          graphicsEngine.updateStickerClip(clipId, { startTime: newStartTime });
        } else if (graphicClip.type === "svg") {
          graphicsEngine.updateSVGClip(clipId, { startTime: newStartTime });
        } else {
          graphicsEngine.updateShapeClip(clipId, { startTime: newStartTime });
        }
        useProjectStore.setState((state) => ({
          project: { ...state.project, modifiedAt: Date.now() },
        }));
      } else {
        await moveClip(clipId, newStartTime, targetTrackId);
      }
    },
    [moveClip, allShapeClips, graphicsEngine],
  );

  const [snapIndicatorTime, setSnapIndicatorTime] = React.useState<
    number | null
  >(null);

  const handleSnapIndicator = useCallback((time: number | null) => {
    setSnapIndicatorTime(time);
  }, []);

  // V4: OS file drop indicator. When the user drags a file from the OS
  // (Finder / Windows Explorer) over the timeline, we render a translucent
  // dashed border + "Drop to add" overlay so the action is discoverable.
  const [isOSFileDragging, setIsOSFileDragging] = useState(false);
  // We need a counter because dragenter/dragleave fire on every child element
  // — a simple boolean would flicker as the cursor moves between children.
  const osDragCounterRef = useRef(0);

  const handleTrimTextClip = useCallback(
    (clipId: string, edge: "left" | "right", newTime: number) => {
      if (!titleEngine) return;

      const textClip = allTextClips.find((tc) => tc.id === clipId);
      if (!textClip) return;

      const oldDuration = textClip.duration;
      const newDuration =
        edge === "left"
          ? Math.max(0.1, textClip.startTime + textClip.duration - newTime)
          : Math.max(0.1, newTime - textClip.startTime);

      const adjustedKeyframes = textClip.keyframes.map((kf) => {
        if (kf.id.startsWith("kf-exit-")) {
          const relativeTime = kf.time - oldDuration;
          return { ...kf, time: newDuration + relativeTime };
        }
        return kf;
      });

      if (edge === "left") {
        titleEngine.updateTextClip(clipId, {
          startTime: newTime,
          duration: newDuration,
        });
      } else {
        titleEngine.updateTextClip(clipId, {
          duration: newDuration,
        });
      }

      useProjectStore
        .getState()
        .updateTextClipKeyframes(clipId, adjustedKeyframes);

      useProjectStore.setState((state) => ({
        project: { ...state.project, modifiedAt: Date.now() },
      }));
    },
    [titleEngine, allTextClips],
  );

  const handleMoveTextClip = useCallback(
    (clipId: string, newStartTime: number) => {
      if (!titleEngine) return;

      const textClip = allTextClips.find((tc) => tc.id === clipId);
      if (!textClip) return;

      titleEngine.updateTextClip(clipId, {
        startTime: Math.max(0, newStartTime),
      });

      useProjectStore.setState((state) => ({
        project: { ...state.project, modifiedAt: Date.now() },
      }));
    },
    [titleEngine, allTextClips],
  );

  const handleTrimShapeClip = useCallback(
    (clipId: string, edge: "left" | "right", newTime: number) => {
      if (!graphicsEngine) return;

      const graphicClip = allShapeClips.find((sc) => sc.id === clipId);
      if (!graphicClip) return;

      const oldDuration = graphicClip.duration;
      const newDuration =
        edge === "left"
          ? Math.max(
              0.1,
              graphicClip.startTime + graphicClip.duration - newTime,
            )
          : Math.max(0.1, newTime - graphicClip.startTime);

      const updates =
        edge === "left"
          ? {
              startTime: newTime,
              duration: newDuration,
            }
          : {
              duration: newDuration,
            };

      const adjustedKeyframes = graphicClip.keyframes.map((kf) => {
        if (kf.id.startsWith("kf-exit-")) {
          const relativeTime = kf.time - oldDuration;
          return { ...kf, time: newDuration + relativeTime };
        }
        return kf;
      });

      if (graphicClip.type === "sticker" || graphicClip.type === "emoji") {
        graphicsEngine.updateStickerClip(clipId, updates);
      } else if (graphicClip.type === "svg") {
        graphicsEngine.updateSVGClip(clipId, updates);
      } else {
        graphicsEngine.updateShapeClip(clipId, updates);
      }

      useProjectStore.getState().updateClipKeyframes(clipId, adjustedKeyframes);

      useProjectStore.setState((state) => ({
        project: { ...state.project, modifiedAt: Date.now() },
      }));
    },
    [graphicsEngine, allShapeClips],
  );

  const handleTrimClip = useCallback(
    (clipId: string, edge: "left" | "right", newTime: number) => {
      const clip = tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
      if (!clip) return;

      const oldDuration = clip.duration;
      const newDuration =
        edge === "left"
          ? Math.max(0.1, clip.startTime + clip.duration - newTime)
          : Math.max(0.1, newTime - clip.startTime);

      const updates =
        edge === "left"
          ? {
              startTime: newTime,
              duration: newDuration,
            }
          : {
              duration: newDuration,
            };

      const adjustedKeyframes = clip.keyframes.map((kf) => {
        if (kf.id.startsWith("kf-exit-")) {
          const relativeTime = kf.time - oldDuration;
          return { ...kf, time: newDuration + relativeTime };
        }
        return kf;
      });

      useProjectStore.setState((state) => ({
        project: {
          ...state.project,
          timeline: {
            ...state.project.timeline,
            tracks: state.project.timeline.tracks.map((track) => ({
              ...track,
              clips: track.clips.map((c) =>
                c.id === clipId
                  ? { ...c, ...updates, keyframes: adjustedKeyframes }
                  : c,
              ),
            })),
          },
          modifiedAt: Date.now(),
        },
      }));
    },
    [tracks],
  );

  const visualOrderTracks = useMemo(() => tracks, [tracks]);

  return (
    <div
      data-tour="timeline"
      className="h-full bg-background border-t border-border flex flex-col"
    >
      {/* CapCut-parity timeline toolbar: compact 28px icons, left-aligned tools,
          centered timecode, right-side modifier toggles and zoom. */}
      <div className="h-10 border-b border-border flex items-center justify-between px-3 bg-background-secondary relative z-[100]">
        <div className="flex items-center gap-1">
          {/* Add Track dropdown — leftmost "+" icon */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors"
                title="Add new track"
                data-testid="timeline-add-track"
              >
                <Plus size={15} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-48">
              <DropdownMenuItem onClick={() => addTrack("video")}>
                <Film size={16} className="text-green-400" />
                <span>Video Track</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addTrack("audio")}>
                <Music size={16} className="text-blue-400" />
                <span>Audio Track</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => addTrack("image")}>
                <Image size={16} className="text-purple-400" />
                <span>Image Track</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addTrack("text")}>
                <Type size={16} className="text-yellow-400" />
                <span>Text Track</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addTrack("graphics")}>
                <Shapes size={16} className="text-pink-400" />
                <span>Graphics Track</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Tool dropdown — compact icon + chevron */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-testid="timeline-tool-trigger"
                title={`Tool: ${toolMode === "split" ? "Split (B)" : "Select (A)"}`}
                className={`flex items-center gap-0.5 px-1.5 py-1 rounded-md transition-colors ${
                  toolMode === "split"
                    ? "bg-orange-500/20 text-orange-400"
                    : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
                }`}
              >
                {toolMode === "split" ? (
                  <Scissors size={15} />
                ) : (
                  <MousePointer2 size={15} />
                )}
                <ChevronDownIcon size={11} className="opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="bottom"
              align="start"
              sideOffset={6}
              className="w-44"
            >
              <DropdownMenuItem
                data-testid="timeline-tool-select"
                onClick={() => setToolMode("select")}
              >
                <MousePointer2 size={14} className={toolMode === "select" ? "text-primary" : ""} />
                <span className="flex-1">Select</span>
                <span className="text-[10px] font-mono text-text-secondary bg-background-tertiary px-1.5 py-0.5 rounded border border-border">
                  A
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="timeline-tool-split"
                onClick={() => setToolMode("split")}
              >
                <Scissors size={14} className={toolMode === "split" ? "text-primary" : ""} />
                <span className="flex-1">Split</span>
                <span className="text-[10px] font-mono text-text-secondary bg-background-tertiary px-1.5 py-0.5 rounded border border-border">
                  B
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Jump to prev / next clip boundary */}
          <button
            data-testid="timeline-jump-prev"
            onClick={handleJumpToPrev}
            title="Jump to previous clip"
            className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors"
          >
            <SkipBack size={14} />
          </button>
          <button
            data-testid="timeline-jump-next"
            onClick={handleJumpToNext}
            title="Jump to next clip"
            className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors"
          >
            <SkipForward size={14} />
          </button>

          <div className="w-px h-5 bg-border mx-0.5" />

          <IconButton
            icon={Undo2}
            onClick={undo}
            disabled={!canUndo()}
            title="Undo (Cmd+Z)"
          />
          <IconButton
            icon={Redo2}
            onClick={redo}
            disabled={!canRedo()}
            title="Redo (Cmd+Shift+Z)"
          />

          <div className="w-px h-5 bg-border mx-0.5" />

          <button
            data-testid="timeline-split-at-playhead"
            onClick={handleSplit}
            disabled={selectedClipIds.length !== 1}
            title="Split selected clip at playhead (B with selection)"
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
              selectedClipIds.length === 1
                ? "text-orange-400 hover:bg-orange-500/20"
                : "text-text-muted opacity-50 cursor-not-allowed"
            }`}
          >
            <Scissors size={14} />
          </button>
          <IconButton
            icon={Trash2}
            onClick={handleDelete}
            disabled={selectedClipIds.length === 0}
            title="Delete clip (Del)"
            className="hover:text-red-500"
          />

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Layers — kept but compact (icon only, no "LAYERS" label) */}
          <Popover open={showLayersPanel} onOpenChange={setShowLayersPanel}>
            <PopoverTrigger asChild>
              <button
                className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
                  showLayersPanel
                    ? "bg-primary/20 text-primary"
                    : "hover:bg-background-elevated text-text-secondary hover:text-text-primary"
                }`}
                title="Manage track layers"
              >
                <Layers size={14} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-64 p-0 bg-background-secondary border-border"
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-background-tertiary">
                <span className="text-xs font-semibold text-text-primary">
                  Track Layers
                </span>
              </div>
              <div className="p-2 max-h-60 overflow-y-auto">
                {tracks.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-6">
                    No tracks yet
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {tracks.map((track, index) => {
                      const info = getTrackInfo(track, index);
                      return (
                        <div
                          key={track.id}
                          className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-background-tertiary group transition-colors cursor-default"
                        >
                          <div
                            className={`w-7 h-7 rounded-md flex items-center justify-center ${info.bgLight}`}
                          >
                            <info.icon size={14} className={info.textColor} />
                          </div>
                          <span className="text-[11px] font-medium text-text-primary flex-1 truncate">
                            {track.name || info.label}
                          </span>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() =>
                                index > 0 && reorderTrack(track.id, index - 1)
                              }
                              disabled={index === 0}
                              className="p-1.5 rounded-md hover:bg-background-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              title="Move up"
                            >
                              <ChevronUp size={12} />
                            </button>
                            <button
                              onClick={() =>
                                index < tracks.length - 1 &&
                                reorderTrack(track.id, index + 1)
                              }
                              disabled={index === tracks.length - 1}
                              className="p-1.5 rounded-md hover:bg-background-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              title="Move down"
                            >
                              <ChevronDown size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

        </div>

        {/* Centered timecode pill — CapCut-parity (subtle, not glowing) */}
        <div
          className="font-mono text-text-primary text-[12px] font-medium tracking-wider tabular-nums bg-background-tertiary px-3 py-1 rounded border border-border absolute left-1/2 -translate-x-1/2"
          data-testid="timeline-timecode"
        >
          {formatTimecode(playheadPosition)}
        </div>

        <div className="flex items-center gap-2">
          {/* CapCut-parity timeline toggle row: Magnet (P) / Snapping (N) / Linkage (Shift+L) / Preview Axis (Alt+P) */}
          <div
            data-testid="timeline-toggle-row"
            className="flex items-center bg-background-tertiary rounded-lg border border-border overflow-hidden"
          >
            <button
              data-testid="toggle-magnet"
              onClick={toggleMagnet}
              title={`Main track magnet (P) — ${magnet ? "on" : "off"}`}
              className={`w-7 h-7 flex items-center justify-center transition-colors border-r border-border ${
                magnet
                  ? "bg-primary/20 text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
              }`}
            >
              <Magnet size={14} />
            </button>
            <button
              data-testid="toggle-snapping"
              onClick={toggleSnap}
              title={`Snapping (N) — ${snapSettings.enabled ? "on" : "off"}`}
              className={`w-7 h-7 flex items-center justify-center transition-colors border-r border-border ${
                snapSettings.enabled
                  ? "bg-primary/20 text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
              }`}
            >
              <Crosshair size={14} />
            </button>
            <button
              data-testid="toggle-linkage"
              onClick={toggleLinkage}
              title={`Linkage (Shift+L) — ${linkage ? "on" : "off"}`}
              className={`w-7 h-7 flex items-center justify-center transition-colors border-r border-border ${
                linkage
                  ? "bg-primary/20 text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
              }`}
            >
              <Link2 size={14} />
            </button>
            <button
              data-testid="toggle-preview-axis"
              onClick={togglePreviewAxis}
              title={`Preview axis (Alt+P) — ${previewAxis ? "on" : "off"}`}
              className={`w-7 h-7 flex items-center justify-center transition-colors ${
                previewAxis
                  ? "bg-primary/20 text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
              }`}
            >
              <AlignVerticalSpaceAround size={14} />
            </button>
          </div>

          <div className="flex items-center bg-background-tertiary rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => { setTrackHeight(80); useTimelineStore.setState({ trackHeights: {} }); }}
              className={`w-7 h-7 flex items-center justify-center transition-colors border-r border-border ${
                trackHeight >= 60
                  ? "text-primary bg-primary/10"
                  : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
              }`}
              title="Large tracks"
            >
              <Rows3 size={14} />
            </button>
            <button
              onClick={() => { setTrackHeight(50); useTimelineStore.setState({ trackHeights: {} }); }}
              className={`w-7 h-7 flex items-center justify-center transition-colors ${
                trackHeight < 60
                  ? "text-primary bg-primary/10"
                  : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
              }`}
              title="Small tracks"
            >
              <Rows2 size={14} />
            </button>
          </div>
          <div className="flex items-center bg-background-tertiary rounded-lg border border-border overflow-hidden">
            <button
              onClick={zoomOut}
              className="w-7 h-7 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors border-r border-border"
              title="Zoom out"
            >
              <span className="text-base font-medium">−</span>
            </button>
            <span className="text-[11px] w-14 text-center font-mono text-text-secondary tabular-nums">
              {Math.round(pixelsPerSecond)}px/s
            </span>
            <button
              onClick={zoomIn}
              className="w-7 h-7 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors border-l border-border"
              title="Zoom in"
            >
              <span className="text-base font-medium">+</span>
            </button>
          </div>
          <IconButton icon={Maximize2} title="Maximize timeline" />
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 flex flex-col overflow-hidden relative"
        onClick={handleBackgroundClick}
      >
        <div className="flex shrink-0">
          <div className="w-32 h-8 bg-background-tertiary border-b border-r border-border shrink-0" />
          <div className="flex-1 overflow-hidden relative">
            <div
              style={{
                width: `${timelineDuration * pixelsPerSecond}px`,
                transform: `translateX(-${scrollX}px)`,
              }}
            >
              <TimeRuler
                duration={timelineDuration}
                pixelsPerSecond={pixelsPerSecond}
                scrollX={scrollX}
                viewportWidth={viewportWidth}
                onSeek={(time) => {
                  const bridge = getPlaybackBridge();
                  bridge.scrubTo(time);
                }}
                onScrubStart={() => {
                  const bridge = getPlaybackBridge();
                  bridge.startScrubbing();
                }}
                onScrubEnd={() => {
                  const bridge = getPlaybackBridge();
                  bridge.endScrubbing();
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-32 bg-background-secondary border-r border-border shrink-0 z-20 shadow-lg overflow-hidden">
            <div
              className="flex flex-col"
              style={{ transform: `translateY(-${scrollY}px)` }}
            >
              {visualOrderTracks.map((track, i) => {
                const keyframeCount = track.clips.reduce(
                  (sum, clip) => sum + (clip.keyframes?.length || 0),
                  0
                );
                return (
                  <div
                    key={track.id}
                    className={draggedTrackId === track.id ? "opacity-50" : ""}
                  >
                    <TrackHeader
                      track={track}
                      index={i}
                      onDragStart={handleTrackDragStart}
                      onDragOver={handleTrackDragOver}
                      onDrop={handleTrackDrop}
                      keyframeCount={keyframeCount}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div
            ref={tracksRef}
            data-testid="timeline-tracks-scroller"
            className={`flex-1 bg-background relative overflow-auto custom-scrollbar ${
              isScrubbingEmpty
                ? "cursor-ew-resize"
                : "cursor-crosshair"
            }`}
            onScroll={(e) => {
              setScrollX(e.currentTarget.scrollLeft);
              setScrollY(e.currentTarget.scrollTop);
            }}
            onMouseDown={handleBoxSelectionStart}
            onMouseMove={(e) => {
              handleBoxSelectionMove(e);
              handleTracksMouseMove(e);
            }}
            onMouseLeave={handleTracksMouseLeave}
            onDragEnter={(e) => {
              // Only count drags that include OS files (`Files` is in
              // dataTransfer.types when dragging from outside the browser).
              if (e.dataTransfer.types?.includes("Files")) {
                osDragCounterRef.current += 1;
                if (osDragCounterRef.current === 1) setIsOSFileDragging(true);
              }
            }}
            onDragLeave={(e) => {
              if (e.dataTransfer.types?.includes("Files")) {
                osDragCounterRef.current = Math.max(0, osDragCounterRef.current - 1);
                if (osDragCounterRef.current === 0) setIsOSFileDragging(false);
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={async (e) => {
              e.preventDefault();
              osDragCounterRef.current = 0;
              setIsOSFileDragging(false);

              const rect = tracksRef.current?.getBoundingClientRect();
              if (!rect) return;
              const x = e.clientX - rect.left + (tracksRef.current?.scrollLeft ?? 0);
              const rawTime = Math.max(0, x / pixelsPerSecond);

              const allClips = project.timeline.tracks.flatMap(t => t.clips);
              let snappedTime = rawTime;
              if (snapSettings.enabled) {
                const threshold = snapSettings.snapThreshold / pixelsPerSecond;
                let bestDist = Infinity;
                for (const clip of allClips) {
                  const clipEnd = clip.startTime + clip.duration;
                  const distToEnd = Math.abs(rawTime - clipEnd);
                  const distToStart = Math.abs(rawTime - clip.startTime);
                  if (distToEnd < threshold && distToEnd < bestDist) {
                    bestDist = distToEnd;
                    snappedTime = clipEnd;
                  }
                  if (distToStart < threshold && distToStart < bestDist) {
                    bestDist = distToStart;
                    snappedTime = clip.startTime;
                  }
                }
                if (snapSettings.snapToPlayhead) {
                  const distToPlayhead = Math.abs(rawTime - playheadPosition);
                  if (distToPlayhead < threshold && distToPlayhead < bestDist) {
                    snappedTime = playheadPosition;
                  }
                }
              }

              // External OS file drop (e.g. from Windows Explorer)
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const { importMedia, addClipToNewTrack } = useProjectStore.getState();
                for (const file of Array.from(e.dataTransfer.files)) {
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
                        await addClipToNewTrack(newItem.id, snappedTime);
                        const track = useProjectStore
                          .getState()
                          .project.timeline.tracks.find(t =>
                            t.clips.some(c => c.mediaId === newItem.id)
                          );
                        if (track) {
                          toast.success(`Added to ${track.name}`, file.name);
                        }
                      }
                    }
                  } catch (err) {
                    console.error("[Timeline] External file drop failed:", err);
                  }
                }
                return;
              }

              // Internal drag from assets panel
              try {
                const rawData = e.dataTransfer.getData("application/json");
                if (!rawData) return;
                const data = JSON.parse(rawData);
                if (!data?.mediaId) return;
                handleDropMedia("", data.mediaId, snappedTime);
              } catch {
                // ignore
              }
            }}
          >
            <div
              style={{ width: `${timelineDuration * pixelsPerSecond}px` }}
              className="min-w-full"
            >
              {visualOrderTracks.map((track) => (
                <TrackLane
                  key={track.id}
                  track={track}
                  allTracks={visualOrderTracks}
                  pixelsPerSecond={pixelsPerSecond}
                  selectedClipIds={selectedClipIds}
                  textClips={getTextClipsForTrack(track.id)}
                  shapeClips={getShapeClipsForTrack(track.id)}
                  trackHeights={trackHeightsMap}
                  timelineRef={tracksRef}
                  onSelectClip={handleSelectClip}
                  onDropMedia={handleDropMedia}
                  onMoveClip={handleMoveClip}
                  onSnapIndicator={handleSnapIndicator}
                  onTrimClip={
                    track.type === "video" ||
                    track.type === "image" ||
                    track.type === "audio"
                      ? handleTrimClip
                      : undefined
                  }
                  onTrimTextClip={handleTrimTextClip}
                  onMoveTextClip={handleMoveTextClip}
                  onTrimShapeClip={handleTrimShapeClip}
                  scrollX={scrollX}
                  trackHeight={getTrackHeight(track.id)}
                  onResizeTrack={setTrackHeightById}
                  onKeyframeSelect={handleKeyframeSelect}
                  onKeyframeMove={handleKeyframeMove}
                  onKeyframeDelete={handleKeyframeDelete}
                  selectedKeyframeIds={selectedKeyframeIds}
                />
              ))}

              <BeatMarkerOverlay
                pixelsPerSecond={pixelsPerSecond}
                scrollX={scrollX}
                viewportWidth={viewportWidth}
                totalHeight={totalTracksHeight}
              />

              {project.timeline.markers.map((marker) => (
                <MarkerIndicator
                  key={marker.id}
                  marker={marker}
                  pixelsPerSecond={pixelsPerSecond}
                  scrollX={scrollX}
                  onSeek={(time) => {
                    const bridge = getPlaybackBridge();
                    bridge.scrubTo(time);
                  }}
                  onRemove={removeMarker}
                  onUpdate={updateMarker}
                />
              ))}

              {snapIndicatorTime !== null && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-yellow-400 z-30 pointer-events-none"
                  style={{ left: `${snapIndicatorTime * pixelsPerSecond}px` }}
                >
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-yellow-400 rounded-full" />
                </div>
              )}

              {/* CapCut preview axis — vertical hover guide for previewing a frame */}
              {previewAxis && previewAxisTime !== null && (
                <div
                  data-testid="preview-axis-guide"
                  className="absolute top-0 bottom-0 w-px bg-primary/40 z-20 pointer-events-none"
                  style={{ left: `${previewAxisTime * pixelsPerSecond}px` }}
                >
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[9px] text-primary font-mono tabular-nums whitespace-nowrap bg-background-tertiary px-1 rounded">
                    {previewAxisTime.toFixed(2)}s
                  </div>
                </div>
              )}

              {isBoxSelecting && selectionBox && (
                <div
                  data-testid="marquee-selection-box"
                  className="absolute border-2 border-primary bg-primary/10 pointer-events-none z-40"
                  style={{
                    // selectionBox coords are in CONTENT space (already include
                    // scrollX/scrollY added in handleBoxSelectionStart). The
                    // rendering parent is also CONTENT-space (the inner div
                    // with width = timelineDuration * pixelsPerSecond), so we
                    // must NOT subtract scroll here — that would put the box
                    // outside the scrollable area as the user scrolls during
                    // selection. (V4 fix)
                    left: Math.min(selectionBox.startX, selectionBox.currentX),
                    top: Math.min(selectionBox.startY, selectionBox.currentY),
                    width: Math.abs(
                      selectionBox.currentX - selectionBox.startX,
                    ),
                    height: Math.abs(
                      selectionBox.currentY - selectionBox.startY,
                    ),
                  }}
                />
              )}
            </div>
            {/* V4: OS file drop indicator. Shown when a drag of OS files
                enters the timeline area. Industry-standard "drop zone" cue. */}
            {isOSFileDragging && (
              <div
                data-testid="os-file-drop-overlay"
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary/60"
              >
                <div className="text-center px-6 py-4 rounded-lg bg-background-secondary/95 border border-primary/40 shadow-lg">
                  <div className="text-primary font-medium text-sm">
                    Drop to add to timeline
                  </div>
                  <div className="text-text-secondary text-xs mt-1">
                    Files will be imported and placed at the cursor
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <Playhead
          position={playheadPosition}
          pixelsPerSecond={pixelsPerSecond}
          scrollX={scrollX}
          headerOffset={128}
        />
      </div>
    </div>
  );
};

export default Timeline;
