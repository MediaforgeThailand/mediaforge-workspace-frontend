import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Group as PanelGroup,
  Panel,
  useDefaultLayout,
  type PanelImperativeHandle,
} from "react-resizable-panels";

import { Toolbar } from "./Toolbar";
import { AssetsPanel } from "./AssetsPanel";
import { Preview } from "./Preview";
import { InspectorPanel } from "./InspectorPanel";
import { Timeline } from "./Timeline";
import { KeyframeEditorPanel } from "./KeyframeEditorPanel";
import { ResizeHandle } from "./ResizeHandle";
import { AudioMixer } from "./audio-mixer";
import { KeyboardShortcutsOverlay } from "./KeyboardShortcutsOverlay";
import { PanelErrorBoundary } from "./ErrorBoundary";
import { SpotlightTour, MoGraphTour } from "./tour";
import { useProjectStore } from "../stores/project-store";
import { useUIStore } from "../stores/ui-store";
import { useEngineStore } from "../stores/engine-store";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useClipboardPaste } from "../hooks/useClipboardPaste";
import { useI18n } from "../services/i18n";
import {
  initializePlaybackBridge,
  disposePlaybackBridge,
} from "../bridges/playback-bridge";
import {
  initializeMediaBridge,
  disposeMediaBridge,
} from "../bridges/media-bridge";
import {
  initializeRenderBridge,
  disposeRenderBridge,
} from "../bridges/render-bridge";
import {
  initializeEffectsBridge,
  disposeEffectsBridge,
} from "../bridges/effects-bridge";
import {
  initializeTransitionBridge,
  disposeTransitionBridge,
} from "../bridges/transition-bridge";
import {
  initializeAudioBridge,
  disposeAudioBridge,
} from "../bridges/audio-bridge";
import { autoSaveManager } from "../services/auto-save";
import {
  flushCloudSave,
  hasPendingCloudSave,
} from "../services/project-cloud";
import { useSettingsStore } from "../stores/settings-store";

/**
 * Auto-save initialization hook
 */
const useAutoSave = () => {
  const initializeAutoSave = useProjectStore((state) => state.initializeAutoSave);
  const shutdownAutoSave = useProjectStore((state) => state.shutdownAutoSave);
  const autoSave = useSettingsStore((state) => state.autoSave);
  const autoSaveInterval = useSettingsStore((state) => state.autoSaveInterval);
  const lifecycleIdRef = useRef(0);

  useEffect(() => {
    const lifecycleId = ++lifecycleIdRef.current;
    autoSaveManager.updateConfig({
      enabled: autoSave,
      interval: Math.max(1, autoSaveInterval) * 60_000,
    });

    if (!autoSave) {
      void autoSaveManager.flush().finally(() => {
        if (lifecycleIdRef.current === lifecycleId) {
          shutdownAutoSave();
        }
      });
      return;
    }

    initializeAutoSave().catch(console.error);
    return () => {
      void autoSaveManager
        .flush()
        .catch((error) => {
          console.warn("[EditorInterface] Auto-save cleanup flush failed:", error);
        })
        .finally(() => {
          if (lifecycleIdRef.current === lifecycleId) {
            shutdownAutoSave();
          }
        });
    };
  }, [autoSave, autoSaveInterval, initializeAutoSave, shutdownAutoSave]);
};

const useEditorLifecycleSaveGuard = () => {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const flushAll = async () => {
      await autoSaveManager.flush();
      await flushCloudSave();
    };

    const flushBestEffort = () => {
      void flushAll().catch((error) => {
        console.warn("[EditorInterface] Final save flush failed:", error);
      });
    };

    const hasPendingSave = () =>
      autoSaveManager.hasUnsavedChanges() || hasPendingCloudSave();

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushBestEffort();
      }
    };

    const onPageHide = () => {
      flushBestEffort();
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingSave()) {
        return;
      }

      flushBestEffort();
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      flushBestEffort();
    };
  }, []);
};

/**
 * Engine and bridge initialization hook
 * Ensures all engines and bridges are fully initialized before rendering editor
 */
const useEngineInitialization = () => {
  const { initialize, initialized, initializing, initError } = useEngineStore();
  const [bridgesReady, setBridgesReady] = useState(false);
  const [initStatus, setInitStatus] = useState("Starting...");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initAll = async () => {
      try {
        const currentState = useEngineStore.getState();
        if (!currentState.initialized && !currentState.initializing) {
          setInitStatus("Initializing video engine...");
          await initialize();
        } else if (currentState.initializing) {
          await new Promise<void>((resolve) => {
            const unsubscribe = useEngineStore.subscribe((state) => {
              if (state.initialized || state.initError) {
                unsubscribe();
                resolve();
              }
            });
          });
        }

        if (!isMounted) return;

        const engineState = useEngineStore.getState();
        if (!engineState.initialized) {
          throw new Error(
            engineState.initError || "Engine initialization failed",
          );
        }

        setInitStatus("Initializing media bridge...");
        await initializeMediaBridge();
        if (!isMounted) return;

        setInitStatus("Initializing playback bridge...");
        await initializePlaybackBridge();
        if (!isMounted) return;

        // AudioBridge subscribes to clip-volume changes and forwards them to
        // the realtime audio graph in real time. Must come *after* the
        // playback bridge so the controller (and its audio graph) exist.
        setInitStatus("Initializing audio bridge...");
        await initializeAudioBridge();
        if (!isMounted) return;

        setInitStatus("Initializing render bridge...");
        await initializeRenderBridge();
        if (!isMounted) return;

        setInitStatus("Initializing effects bridge...");
        const projectState = useProjectStore.getState();
        const { width, height } = projectState.project.settings;
        try {
          await initializeEffectsBridge(width, height);
        } catch (effectsError) {
          console.error(
            "[EditorInterface] EffectsBridge initialization failed:",
            effectsError,
          );
        }
        if (!isMounted) return;

        setInitStatus("Initializing transition bridge...");
        try {
          initializeTransitionBridge(width, height);
        } catch (transitionError) {
          console.error(
            "[EditorInterface] TransitionBridge initialization failed:",
            transitionError,
          );
        }
        if (!isMounted) return;

        setBridgesReady(true);
      } catch (error) {
        console.error("Failed to initialize engines/bridges:", error);
        if (isMounted) {
          setLocalError(
            error instanceof Error ? error.message : "Unknown error",
          );
          setInitStatus(
            `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }
    };

    initAll();

    return () => {
      isMounted = false;
      disposeAudioBridge();
      disposePlaybackBridge();
      disposeMediaBridge();
      disposeRenderBridge();
      disposeEffectsBridge();
      disposeTransitionBridge();
    };
  }, [initialize, initialized, initializing]);

  return {
    initialized: initialized && bridgesReady,
    initializing: initializing || (!bridgesReady && initialized),
    initError: initError || localError,
    initStatus,
  };
};

/**
 * 3-column editor panel sizing.
 *
 * react-resizable-panels v4 accepts size constraints in multiple units. From
 * the lib docs: numeric values are PIXELS; strings without a unit are
 * PERCENTAGES; strings with units use that unit ("300px", "18%", "5rem").
 *
 * We use pixel-string mins/maxes so the limits stay constant regardless of
 * viewport width, and percentage defaults so the layout adapts to wider/
 * narrower viewports while still hitting the spec's pixel targets at the
 * reference 1680px width.
 *
 * Pixel targets (reference 1680px viewport):
 *   Library:   300px default, 240px..480px
 *   Inspector: 320px default, 280px..500px
 *   Preview:   ~1040px default (remainder), min 480px
 *
 * Persistence: layouts are saved to localStorage via the `useDefaultLayout`
 * hook below under the key `react-resizable-panels:mediaforge-editor-3col`.
 */
const PANEL_SIZES = {
  library: { default: "18%", min: "240px", max: "480px" },
  preview: { default: "63%", min: "480px" },
  inspector: { default: "19%", min: "280px", max: "500px" },
} as const;

const LAYOUT_STORAGE_ID = "mediaforge-editor-3col";

/**
 * Main Editor Interface Component
 */
export const EditorInterface: React.FC = () => {
  const { initialized, initializing, initError, initStatus } =
    useEngineInitialization();

  const { showShortcutsOverlay, setShowShortcutsOverlay } =
    useKeyboardShortcuts();
  // OS-clipboard → timeline bridge. Adds image/video clips when an image is
  // pasted from outside the app and creates text clips for plain-text paste.
  // The in-app Ctrl+V clip duplicate is still handled by `useKeyboardShortcuts`.
  useClipboardPaste();
  useAutoSave();
  useEditorLifecycleSaveGuard();
  const t = useI18n();

  const {
    keyframeEditorOpen,
    setKeyframeEditorOpen,
    getSelectedClipIds,
    panels,
    setPanelVisible,
  } = useUIStore();
  const { project, updateClipKeyframes } = useProjectStore();
  const tracks = project.timeline.tracks;

  const [selectedKeyframeIds, setSelectedKeyframeIds] = React.useState<string[]>([]);
  const [copiedKeyframes, setCopiedKeyframes] = React.useState<import("@/lib/openreel-core").Keyframe[]>([]);

  const selectedClip = React.useMemo(() => {
    const selectedIds = getSelectedClipIds();
    if (selectedIds.length === 0) return null;
    const clipId = selectedIds[0];
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return clip;
    }
    return null;
  }, [getSelectedClipIds, tracks]);

  const handleUpdateKeyframe = React.useCallback(
    (keyframeId: string, updates: Partial<import("@/lib/openreel-core").Keyframe>) => {
      if (!selectedClip?.keyframes) return;
      const keyframes = selectedClip.keyframes.map((kf) =>
        kf.id === keyframeId ? { ...kf, ...updates } : kf
      );
      updateClipKeyframes(selectedClip.id, keyframes);
    },
    [selectedClip, updateClipKeyframes]
  );

  const handleDeleteKeyframe = React.useCallback(
    (keyframeId: string) => {
      if (!selectedClip?.keyframes) return;
      const keyframes = selectedClip.keyframes.filter((kf) => kf.id !== keyframeId);
      updateClipKeyframes(selectedClip.id, keyframes);
      setSelectedKeyframeIds((prev) => prev.filter((id) => id !== keyframeId));
    },
    [selectedClip, updateClipKeyframes]
  );

  const handleCopyKeyframes = React.useCallback(
    (keyframeIds: string[]) => {
      if (!selectedClip?.keyframes) return;
      const toCopy = selectedClip.keyframes.filter((kf) => keyframeIds.includes(kf.id));
      setCopiedKeyframes(toCopy);
    },
    [selectedClip]
  );

  const handlePasteKeyframes = React.useCallback(
    (clipId: string, time: number) => {
      const targetClip = tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
      if (!targetClip) return;
      const newKeyframes = copiedKeyframes.map((kf) => ({
        ...kf,
        id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        time: kf.time + time,
      }));
      updateClipKeyframes(clipId, [...(targetClip.keyframes || []), ...newKeyframes]);
    },
    [copiedKeyframes, tracks, updateClipKeyframes]
  );

  const handleSelectKeyframe = React.useCallback(
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

  const [timelineHeight, setTimelineHeight] = useState(320);
  const isDraggingRef = useRef(false);

  // Imperative handles on each Panel — `useDefaultLayout` will pull persisted
  // sizes from localStorage on mount. Separator double-click natively resets
  // the adjacent Panel to its `defaultSize`, so no manual handler is needed.
  const libraryPanelRef = useRef<PanelImperativeHandle | null>(null);
  const previewPanelRef = useRef<PanelImperativeHandle | null>(null);
  const inspectorPanelRef = useRef<PanelImperativeHandle | null>(null);

  // useDefaultLayout wires localStorage persistence — the hook returns a
  // `defaultLayout` to seed the Group and an `onLayoutChanged` callback to
  // save after each drag completes. Storage key:
  //   react-resizable-panels:mediaforge-editor-3col
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: LAYOUT_STORAGE_ID,
    panelIds: ["library", "preview", "inspector"],
  });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const newHeight = window.innerHeight - e.clientY;
      const maxHeight = window.innerHeight * 0.6;
      setTimelineHeight(Math.max(200, Math.min(newHeight, maxHeight)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  if (initializing || !initialized) {
    return (
      <div className="w-full h-full bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-secondary text-sm">Initializing editor...</p>
          <p className="text-text-muted text-xs mt-2">{initStatus}</p>
          {initError && (
            <p className="text-red-500 text-xs mt-2">{initError}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-background flex flex-col overflow-hidden font-sans select-none relative z-20 text-xs text-text-secondary">
      {/* Main App Toolbar */}
      <Toolbar />

      {/* Workspace Area — 3-column horizontal Group with draggable Separators.
          The `useDefaultLayout` hook above persists sizes to localStorage.
          Separators support keyboard a11y and double-click reset natively.
          The optional KeyframeEditor renders as a flex sibling so its width
          is independent of the panel group. */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <PanelGroup
          id={LAYOUT_STORAGE_ID}
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className="flex-1 min-w-0"
        >
          <Panel
            panelRef={libraryPanelRef}
            id="library"
            defaultSize={PANEL_SIZES.library.default}
            minSize={PANEL_SIZES.library.min}
            maxSize={PANEL_SIZES.library.max}
            className="flex"
          >
            <PanelErrorBoundary name="Assets Panel">
              <AssetsPanel />
            </PanelErrorBoundary>
          </Panel>

          <ResizeHandle
            id="library-preview-divider"
            ariaLabel={t("resize_library_panel")}
          />

          <Panel
            panelRef={previewPanelRef}
            id="preview"
            defaultSize={PANEL_SIZES.preview.default}
            minSize={PANEL_SIZES.preview.min}
            className="flex"
          >
            <PanelErrorBoundary name="Preview">
              <Preview />
            </PanelErrorBoundary>
          </Panel>

          <ResizeHandle
            id="preview-inspector-divider"
            ariaLabel={t("resize_inspector_panel")}
          />

          <Panel
            panelRef={inspectorPanelRef}
            id="inspector"
            defaultSize={PANEL_SIZES.inspector.default}
            minSize={PANEL_SIZES.inspector.min}
            maxSize={PANEL_SIZES.inspector.max}
            className="flex"
          >
            <PanelErrorBoundary name="Inspector">
              <InspectorPanel />
            </PanelErrorBoundary>
          </Panel>
        </PanelGroup>

        {keyframeEditorOpen && (
          <PanelErrorBoundary name="Keyframe Editor">
            <KeyframeEditorPanel
              clip={selectedClip}
              onClose={() => setKeyframeEditorOpen(false)}
              onUpdateKeyframe={handleUpdateKeyframe}
              onDeleteKeyframe={handleDeleteKeyframe}
              onCopyKeyframes={handleCopyKeyframes}
              onPasteKeyframes={handlePasteKeyframes}
              selectedKeyframeIds={selectedKeyframeIds}
              onSelectKeyframe={handleSelectKeyframe}
              copiedKeyframes={copiedKeyframes}
            />
          </PanelErrorBoundary>
        )}
      </div>

      {/* Resizable Handle */}
      <div
        className="h-1 bg-border hover:bg-primary/50 cursor-row-resize transition-colors z-10 relative group"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-x-0 -top-1 -bottom-1 bg-transparent" />
      </div>

      {/* Audio Mixer (when open) */}
      {panels.audioMixer?.visible && (
        <PanelErrorBoundary name="Audio Mixer">
          <AudioMixer
            visible
            onClose={() => setPanelVisible("audioMixer", false)}
          />
        </PanelErrorBoundary>
      )}

      {/* BOTTOM PANEL: Timeline */}
      <div
        style={{ height: timelineHeight }}
        className="shrink-0 flex flex-col"
      >
        <PanelErrorBoundary name="Timeline">
          <Timeline />
        </PanelErrorBoundary>
      </div>

      <KeyboardShortcutsOverlay
        isOpen={showShortcutsOverlay}
        onClose={() => setShowShortcutsOverlay(false)}
      />

      <SpotlightTour />
      <MoGraphTour />
    </div>
  );
};

export default EditorInterface;
