import { useEffect, useCallback, useState } from "react";
import {
  keyboardShortcuts,
  type ShortcutHandler,
} from "../services/keyboard-shortcuts";
import { useProjectStore } from "../stores/project-store";
import { useUIStore } from "../stores/ui-store";
import { useTimelineStore } from "../stores/timeline-store";
import { useEngineStore } from "../stores/engine-store";
import { getPlaybackBridge } from "../bridges/playback-bridge";
import { toast } from "../stores/notification-store";

const clipsOverlap = (
  a: { startTime: number; duration: number },
  b: { startTime: number; duration: number },
): boolean => {
  const aStart = a.startTime;
  const aEnd = a.startTime + a.duration;
  const bStart = b.startTime;
  const bEnd = b.startTime + b.duration;
  return aStart < bEnd && bStart < aEnd;
};

export function useKeyboardShortcuts() {
  const [showShortcutsOverlay, setShowShortcutsOverlay] = useState(false);

  const {
    undo,
    redo,
    splitClip,
    removeClip,
    rippleDeleteClip,
    copyClips,
    pasteClips,
    duplicateClip,
    getClip,
    project,
    addMarker,
    addTrack,
    createTextClip,
  } = useProjectStore();

  const { getSelectedClipIds, clearSelection, toggleSnap, select } =
    useUIStore();
  const {
    togglePlayback,
    seekRelative,
    seekTo,
    playheadPosition,
    zoomIn,
    zoomOut,
    zoomToFit,
    setPlaybackRate,
    play,
    pause,
    playbackState,
    playbackRate,
    toggleMagnet,
    toggleLinkage,
    togglePreviewAxis,
    setToolMode,
  } = useTimelineStore();

  const handlePlayPause = useCallback(() => {
    togglePlayback();
  }, [togglePlayback]);

  // CapCut J/K/L shuttle: J = reverse step (1x→2x→4x), K = stop, L = forward step (1x→2x→4x).
  // We approximate "reverse" via negative playbackRate when playing, and progressive speed-up on repeated taps.
  // Route through the playback bridge so the underlying PlaybackController actually applies the rate change to video/audio.
  const handleShuttleReverse = useCallback(() => {
    const cur = playbackRate;
    let next = -1;
    if (cur < 0) {
      next = cur === -1 ? -2 : cur === -2 ? -4 : -4;
    }
    const bridge = getPlaybackBridge();
    if (bridge.isReady()) {
      bridge.setPlaybackRate(next);
    } else {
      setPlaybackRate(next);
    }
    if (playbackState !== "playing") play();
  }, [playbackRate, playbackState, setPlaybackRate, play]);

  const handleShuttleStop = useCallback(() => {
    const bridge = getPlaybackBridge();
    if (bridge.isReady()) {
      bridge.setPlaybackRate(1);
    } else {
      setPlaybackRate(1);
    }
    pause();
  }, [pause, setPlaybackRate]);

  const handleShuttleForward = useCallback(() => {
    const cur = playbackRate;
    let next = 1;
    if (cur > 0) {
      next = cur === 1 ? 2 : cur === 2 ? 4 : 4;
    }
    const bridge = getPlaybackBridge();
    if (bridge.isReady()) {
      bridge.setPlaybackRate(next);
    } else {
      setPlaybackRate(next);
    }
    if (playbackState !== "playing") play();
  }, [playbackRate, playbackState, setPlaybackRate, play]);

  const handleFrameBack = useCallback(() => {
    seekRelative(-1 / 30);
  }, [seekRelative]);

  const handleFrameForward = useCallback(() => {
    seekRelative(1 / 30);
  }, [seekRelative]);

  const handleSecondBack = useCallback(() => {
    seekRelative(-1);
  }, [seekRelative]);

  const handleSecondForward = useCallback(() => {
    seekRelative(1);
  }, [seekRelative]);

  const handleJump5Back = useCallback(() => {
    seekRelative(-5);
  }, [seekRelative]);

  const handleJump5Forward = useCallback(() => {
    seekRelative(5);
  }, [seekRelative]);

  const handleGoToStart = useCallback(() => {
    seekTo(0);
  }, [seekTo]);

  const handleGoToEnd = useCallback(() => {
    let maxEnd = 0;
    for (const track of project.timeline.tracks) {
      for (const clip of track.clips) {
        const end = clip.startTime + clip.duration;
        if (end > maxEnd) maxEnd = end;
      }
    }
    seekTo(maxEnd);
  }, [seekTo, project.timeline.tracks]);

  const handlePrevClip = useCallback(() => {
    const currentTime = playheadPosition;
    let prevEdge = 0;

    for (const track of project.timeline.tracks) {
      for (const clip of track.clips) {
        const endTime = clip.startTime + clip.duration;
        if (clip.startTime < currentTime - 0.001 && clip.startTime > prevEdge) {
          prevEdge = clip.startTime;
        }
        if (endTime < currentTime - 0.001 && endTime > prevEdge) {
          prevEdge = endTime;
        }
      }
    }

    seekTo(prevEdge);
  }, [seekTo, project.timeline.tracks, playheadPosition]);

  const handleNextClip = useCallback(() => {
    const currentTime = playheadPosition;
    let nextEdge = Infinity;

    for (const track of project.timeline.tracks) {
      for (const clip of track.clips) {
        const endTime = clip.startTime + clip.duration;
        if (clip.startTime > currentTime + 0.001 && clip.startTime < nextEdge) {
          nextEdge = clip.startTime;
        }
        if (endTime > currentTime + 0.001 && endTime < nextEdge) {
          nextEdge = endTime;
        }
      }
    }

    if (nextEdge !== Infinity) {
      seekTo(nextEdge);
    }
  }, [seekTo, project.timeline.tracks, playheadPosition]);

  const handleUndo = useCallback(() => {
    undo();
  }, [undo]);

  const handleRedo = useCallback(() => {
    redo();
  }, [redo]);

  const handleCopy = useCallback(() => {
    const selectedIds = getSelectedClipIds();
    if (selectedIds.length > 0) {
      copyClips(selectedIds);
      // V4: surface a brief toast so the user knows the silent Cmd+C did
      // something. Industry NLE convention.
      toast.success(
        selectedIds.length === 1 ? "Clip copied" : `${selectedIds.length} clips copied`,
      );
    }
  }, [getSelectedClipIds, copyClips]);

  const handleCut = useCallback(() => {
    const selectedIds = getSelectedClipIds();
    if (selectedIds.length > 0) {
      copyClips(selectedIds);
      selectedIds.forEach((id) => removeClip(id));
      toast.success(
        selectedIds.length === 1 ? "Clip cut" : `${selectedIds.length} clips cut`,
      );
    }
  }, [getSelectedClipIds, copyClips, removeClip]);

  const handlePaste = useCallback(() => {
    const currentTime = playheadPosition;
    const firstTrack = project.timeline.tracks[0];
    if (firstTrack) {
      pasteClips(firstTrack.id, currentTime);
    }
  }, [pasteClips, playheadPosition, project.timeline.tracks]);

  const handleDuplicate = useCallback(() => {
    const selectedIds = getSelectedClipIds();
    if (selectedIds.length === 1) {
      duplicateClip(selectedIds[0]);
    }
  }, [getSelectedClipIds, duplicateClip]);

  const handleDelete = useCallback(() => {
    const selectedIds = getSelectedClipIds();
    // CapCut linkage: when ON, deleting a clip also deletes linked sibling
    // clips from other tracks that overlap in time (e.g. video + extracted
    // audio). Split pieces on the same track share mediaId but are separate
    // edit decisions, so they must not be swept up together.
    //
    // Note: only MEDIA clips have a `mediaId` (and only media clips are
    // linkable). Text/shape clips don't participate in linkage — they get
    // deleted alone via the polymorphic dispatch below.
    const linkageOn = useTimelineStore.getState().linkage;
    const toDelete = new Set<string>(selectedIds);
    if (linkageOn) {
      const state = useProjectStore.getState();
      for (const id of selectedIds) {
        const clip = state.getClip(id);
        if (!clip) continue;
        for (const track of state.project.timeline.tracks) {
          for (const sibling of track.clips) {
            if (sibling.id === id) continue;
            if (sibling.trackId === clip.trackId) continue;
            if (
              sibling.mediaId === clip.mediaId &&
              clipsOverlap(sibling, clip)
            ) {
              toDelete.add(sibling.id);
            }
          }
        }
      }
    }
    // Polymorphic delete: a clip id can resolve to a media clip (lives on a
    // track), a text clip (project.textClips, deleted via titleEngine), or a
    // shape/sticker/graphics clip (project.shapeClips, graphicsEngine). The
    // earlier implementation only called `removeClip` which targets the
    // media-clip store, so pressing Delete on a selected text or shape clip
    // was a silent no-op. Now we try each store in turn.
    const state = useProjectStore.getState();
    toDelete.forEach((id) => {
      // 1) Media clip on a track
      if (state.getClip(id)) {
        void removeClip(id);
        return;
      }
      // 2) Text clip (caption / title / subtitle / inline text)
      if (state.getTextClip(id)) {
        state.deleteTextClip(id);
        return;
      }
      // 3) Shape / sticker / SVG / graphics clip
      if (state.getShapeClip(id)) {
        state.deleteShapeClip(id);
        return;
      }
      // Fallback — try removeClip anyway in case the store has another path.
      // No-ops cleanly if the id isn't found.
      void removeClip(id);
    });
    clearSelection();
  }, [getSelectedClipIds, removeClip, clearSelection]);

  const handleRippleDelete = useCallback(() => {
    const selectedIds = getSelectedClipIds();
    selectedIds.forEach((id) => rippleDeleteClip(id));
    clearSelection();
  }, [getSelectedClipIds, rippleDeleteClip, clearSelection]);

  const handleSplit = useCallback(() => {
    const selectedIds = getSelectedClipIds();
    if (selectedIds.length !== 1) return;
    const currentTime = playheadPosition;
    const clipId = selectedIds[0];

    // Media clip split (existing path).
    const clip = getClip(clipId);
    if (clip) {
      if (
        currentTime > clip.startTime &&
        currentTime < clip.startTime + clip.duration
      ) {
        splitClip(clipId, currentTime);
      }
      return;
    }

    // Text/shape clip split: shrink the original to the playhead time, then
    // clone the remainder as a new clip starting at the playhead. Done via
    // the underlying engines because the project store doesn't expose
    // duration/start mutators for text/shape clips.
    try {
      const engineState = useEngineStore.getState();
      const titleEngine = engineState.titleEngine;
      const graphicsEngine = engineState.graphicsEngine;
      const state = useProjectStore.getState();

      const textClip = state.getTextClip(clipId);
      if (textClip && titleEngine) {
        const offset = currentTime - textClip.startTime;
        if (offset > 0.05 && offset < textClip.duration - 0.05) {
          titleEngine.updateTextClip(clipId, { duration: offset });
          const trackId = (textClip as { trackId?: string }).trackId;
          if (trackId) {
            state.createTextClip(
              trackId,
              currentTime,
              textClip.text,
              textClip.duration - offset,
              textClip.style,
            );
          }
        }
        return;
      }
      const shapeClip = state.getShapeClip(clipId);
      if (shapeClip && graphicsEngine) {
        const offset = currentTime - shapeClip.startTime;
        if (offset > 0.05 && offset < shapeClip.duration - 0.05) {
          graphicsEngine.updateShapeClip(clipId, { duration: offset });
          // Note: full clone would require a createShapeClip variant on the
          // store. Best-effort split: shrink only. CapCut also doesn't allow
          // splitting some sticker types; this matches that behaviour.
        }
      }
    } catch {
      // ignore — engine not ready
    }
  }, [getSelectedClipIds, playheadPosition, getClip, splitClip]);

  const handleTrimStart = useCallback(() => {
    const selectedIds = getSelectedClipIds();
    if (selectedIds.length === 1) {
      const currentTime = playheadPosition;
      useProjectStore
        .getState()
        .trimToPlayhead(selectedIds[0], currentTime, true);
    }
  }, [getSelectedClipIds, playheadPosition]);

  const handleTrimEnd = useCallback(() => {
    const selectedIds = getSelectedClipIds();
    if (selectedIds.length === 1) {
      const currentTime = playheadPosition;
      useProjectStore
        .getState()
        .trimToPlayhead(selectedIds[0], currentTime, false);
    }
  }, [getSelectedClipIds, playheadPosition]);

  const handleSelectAll = useCallback(() => {
    for (const track of project.timeline.tracks) {
      for (const clip of track.clips) {
        select({ id: clip.id, type: "clip" });
      }
    }
  }, [select, project.timeline.tracks]);

  const handleDeselect = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleToggleSnap = useCallback(() => {
    toggleSnap();
  }, [toggleSnap]);

  const handleZoomIn = useCallback(() => {
    zoomIn();
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut();
  }, [zoomOut]);

  const handleFitTimeline = useCallback(() => {
    let maxEnd = 0;
    for (const track of project.timeline.tracks) {
      for (const clip of track.clips) {
        const end = clip.startTime + clip.duration;
        if (end > maxEnd) maxEnd = end;
      }
    }
    zoomToFit(maxEnd || 60);
  }, [zoomToFit, project.timeline.tracks]);

  const handleShowShortcuts = useCallback(() => {
    setShowShortcutsOverlay(true);
  }, []);

  // Cmd/Ctrl+K opens the search / command-palette modal. We dispatch a
  // window event so the Toolbar's openModal("search") can react regardless
  // of where the hook is mounted. Matches the industry standard for "find".
  const handleOpenSearch = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent("openreel:open-search"));
    } catch {
      // ignore
    }
  }, []);

  // Cmd/Ctrl+, opens the Settings dialog (macOS-standard preferences key).
  const handleOpenSettings = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent("openreel:open-settings"));
    } catch {
      // ignore
    }
  }, []);

  // Save and export are owned by the toolbar (local state). Dispatch a window
  // event so the Toolbar can react. Toolbar listens for "openreel:save" and
  // "openreel:export" on mount.
  const handleSave = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent("openreel:save"));
    } catch {
      // ignore
    }
  }, []);

  const handleExport = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent("openreel:export"));
    } catch {
      // ignore
    }
  }, []);

  // CapCut: T key adds a text clip immediately. Find an existing text track
  // (or create one), then create a 5-second text clip at the current playhead.
  const handleAddText = useCallback(() => {
    const tracks = project.timeline.tracks;
    const textTrack = tracks.find((t) => t.type === "text");
    const startTime = playheadPosition;
    const text = "New Title";
    if (textTrack) {
      createTextClip(textTrack.id, startTime, text);
      return;
    }
    // No text track exists — create one then add the clip.
    void (async () => {
      const before = useProjectStore.getState().project.timeline.tracks;
      await addTrack("text", 0);
      const after = useProjectStore.getState().project.timeline.tracks;
      const newTrack = after.find(
        (t) => t.type === "text" && !before.some((bt) => bt.id === t.id),
      );
      if (newTrack) {
        createTextClip(newTrack.id, startTime, text);
      }
    })();
  }, [project.timeline.tracks, playheadPosition, createTextClip, addTrack]);

  const handleAddMarker = useCallback(() => {
    const currentTime = playheadPosition;
    const markerCount = project.timeline.markers.length;
    addMarker(currentTime, `Marker ${markerCount + 1}`, "#3b82f6");
  }, [playheadPosition, project.timeline.markers.length, addMarker]);

  // CapCut "A" — select tool: clears the current selection and reverts to
  // the default arrow cursor. Future-proofed via the toolMode state so we
  // can layer split / trim tools on top later.
  const handleSelectTool = useCallback(() => {
    setToolMode("select");
    clearSelection();
  }, [setToolMode, clearSelection]);

  // CapCut "B" — split/razor tool: clicks on clips slice them at the cursor.
  // We don't clear selection so the user can still see what they had picked.
  const handleSplitTool = useCallback(() => {
    setToolMode("split");
  }, [setToolMode]);

  // CapCut "P" — toggle main-track magnet (gap-snap when dragging into gaps).
  const handleToggleMagnet = useCallback(() => {
    toggleMagnet();
  }, [toggleMagnet]);

  // CapCut "Shift+L" — toggle clip linkage (move linked audio with video).
  const handleToggleLinkage = useCallback(() => {
    toggleLinkage();
  }, [toggleLinkage]);

  // CapCut "Alt+P" — toggle preview-axis hover guide on the timeline.
  const handleTogglePreviewAxis = useCallback(() => {
    togglePreviewAxis();
  }, [togglePreviewAxis]);

  useEffect(() => {
    const handlers: Array<[string, ShortcutHandler]> = [
      ["playback.playPause", handlePlayPause],
      ["playback.shuttleReverse", handleShuttleReverse],
      ["playback.shuttleStop", handleShuttleStop],
      ["playback.shuttleForward", handleShuttleForward],
      ["playback.frameBack", handleFrameBack],
      ["playback.frameForward", handleFrameForward],
      ["playback.secondBack", handleSecondBack],
      ["playback.secondForward", handleSecondForward],
      ["playback.jump5Back", handleJump5Back],
      ["playback.jump5Forward", handleJump5Forward],
      ["playback.goToStart", handleGoToStart],
      ["playback.goToEnd", handleGoToEnd],
      ["playback.prevClip", handlePrevClip],
      ["playback.nextClip", handleNextClip],
      ["editing.undo", handleUndo],
      ["editing.redo", handleRedo],
      ["editing.cut", handleCut],
      ["editing.copy", handleCopy],
      ["editing.paste", handlePaste],
      ["editing.duplicate", handleDuplicate],
      ["editing.delete", handleDelete],
      ["editing.rippleDelete", handleRippleDelete],
      ["editing.split", handleSplit],
      ["editing.trimStart", handleTrimStart],
      ["editing.trimEnd", handleTrimEnd],
      ["selection.selectAll", handleSelectAll],
      ["selection.deselect", handleDeselect],
      ["timeline.toggleSnap", handleToggleSnap],
      ["timeline.zoomIn", handleZoomIn],
      ["timeline.zoomOut", handleZoomOut],
      ["timeline.fitTimeline", handleFitTimeline],
      ["view.showShortcuts", handleShowShortcuts],
      ["view.search", handleOpenSearch],
      ["view.settings", handleOpenSettings],
      ["file.save", handleSave],
      ["file.export", handleExport],
      ["tools.addText", handleAddText],
      ["tools.addMarker", handleAddMarker],
      ["tools.select", handleSelectTool],
      ["tools.split", handleSplitTool],
      ["timeline.toggleMagnet", handleToggleMagnet],
      ["timeline.toggleLinkage", handleToggleLinkage],
      ["timeline.togglePreviewAxis", handleTogglePreviewAxis],
    ];

    const unsubscribes = handlers.map(([action, handler]) =>
      keyboardShortcuts.registerHandler(action, handler),
    );

    keyboardShortcuts.startListening();

    return () => {
      unsubscribes.forEach((unsub) => unsub());
      keyboardShortcuts.stopListening();
    };
  }, [
    handlePlayPause,
    handleShuttleReverse,
    handleShuttleStop,
    handleShuttleForward,
    handleFrameBack,
    handleFrameForward,
    handleSecondBack,
    handleSecondForward,
    handleJump5Back,
    handleJump5Forward,
    handleGoToStart,
    handleGoToEnd,
    handlePrevClip,
    handleNextClip,
    handleUndo,
    handleRedo,
    handleCut,
    handleCopy,
    handlePaste,
    handleDuplicate,
    handleDelete,
    handleRippleDelete,
    handleSplit,
    handleTrimStart,
    handleTrimEnd,
    handleSelectAll,
    handleDeselect,
    handleToggleSnap,
    handleZoomIn,
    handleZoomOut,
    handleFitTimeline,
    handleShowShortcuts,
    handleOpenSearch,
    handleOpenSettings,
    handleSave,
    handleExport,
    handleAddText,
    handleAddMarker,
    handleSelectTool,
    handleToggleMagnet,
    handleToggleLinkage,
    handleTogglePreviewAxis,
  ]);

  return {
    showShortcutsOverlay,
    setShowShortcutsOverlay,
  };
}
