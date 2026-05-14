import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
} from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Monitor,
  Maximize2,
  Minimize2,
  Loader2,
  ZoomIn,
  ChevronsLeft,
  ChevronsRight,
  Gauge,
  RectangleHorizontal,
} from "lucide-react";
import { IconButton } from "@/components/openreel-ui";
import { useProjectStore } from "../stores/project-store";
import { useTimelineStore } from "../stores/timeline-store";
import { useUIStore } from "../stores/ui-store";
import { useThemeStore } from "../stores/theme-store";
import { useSettingsStore } from "../stores/settings-store";
import { getRenderBridge } from "../bridges/render-bridge";
import {
  RendererFactory,
  type Renderer,
  type RendererAdapterInfo,
  isWebGPUSupported,
  getSpeedEngine,
  getMasterClock,
  getRealtimeAudioGraph,
  getParticleEngine,
  type Effect,
  type AudioClipSchedule,
  type TextClip,
  type ShapeClip,
  type SVGClip,
  type StickerClip,
  type Subtitle,
  type Track,
} from "@/lib/openreel-core";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/openreel-ui";
import { toast } from "../stores/notification-store";
import { useEngineStore } from "../stores/engine-store";
import {
  type HandlePosition,
  type InteractionMode,
  type ClipTransform,
  DEFAULT_TRANSFORM,
  formatTime,
  renderTextClipToCanvas,
  getActiveTextClips,
  getActiveShapeClips,
  renderShapeClipToCanvas,
  getActiveSubtitles,
  renderSubtitleToCanvas,
  drawFrameWithTransform,
  applyEffectsToFrame,
  getTransitionAtTime,
  setImageLoadCallback,
  renderTransitionFrame,
  getAnimatedTransform,
  applyEmphasisAnimation,
  CropModeView,
  MotionPathOverlay,
  ParticleRenderer,
} from "./preview/index";
import { ProcessingOverlay } from "./ProcessingOverlay";
import type { MotionPathConfig, GSAPMotionPathPoint } from "@/lib/openreel-core";
import {
  getSharedDecoderPool,
  resetDecodeCount,
} from "../services/shared-decoder-pool";
import { setThumbnailExtractionPaused } from "../services/thumbnail-extractor";

const getAdaptivePoolSize = (width: number, height: number): number => {
  const pixels = width * height;
  if (pixels >= 3840 * 2160) return 6;
  if (pixels >= 2560 * 1440) return 5;
  if (pixels >= 1920 * 1080) return 4;
  return 3;
};

interface GPULayer {
  bitmap: ImageBitmap;
  transform: ClipTransform;
  // Non-"normal" blend modes can't be expressed by the WebGPU renderer (its
  // RenderLayer interface has no blendMode field), so when any layer carries
  // one we fall back to CPU compositing in the caller. We still keep the
  // values on the layer so the fallback path can apply them per-layer via
  // globalCompositeOperation + globalAlpha.
  blendMode?: string;
  blendOpacity?: number;
}

const renderFrameWithGPU = async (
  renderer: Renderer,
  frame: ImageBitmap,
  transform: ClipTransform,
  _canvasWidth: number,
  _canvasHeight: number,
): Promise<ImageBitmap | null> => {
  try {
    const device = renderer.getDevice();
    if (!device) {
      return null;
    }

    renderer.beginFrame();

    const texture = renderer.createTextureFromImage(frame);

    const gpuTransform = {
      position: transform.position,
      scale: transform.scale,
      rotation: transform.rotation,
      anchor: transform.anchor,
      opacity: transform.opacity,
      borderRadius: transform.borderRadius,
    };

    renderer.renderLayer({
      texture,
      transform: gpuTransform,
      effects: [],
      opacity: transform.opacity,
      borderRadius: transform.borderRadius || 0,
    });

    const result = await renderer.endFrame();
    renderer.releaseTexture(texture);

    return result;
  } catch {
    return null;
  }
};

const renderAllLayersWithGPU = async (
  renderer: Renderer,
  layers: GPULayer[],
  _canvasWidth: number,
  _canvasHeight: number,
): Promise<ImageBitmap | null> => {
  try {
    const device = renderer.getDevice();

    if (!device || layers.length === 0) {
      return null;
    }

    renderer.beginFrame();

    const textures: ReturnType<typeof renderer.createTextureFromImage>[] = [];

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];

      const texture = renderer.createTextureFromImage(layer.bitmap);
      textures.push(texture);

      const gpuTransform = {
        position: layer.transform.position,
        scale: layer.transform.scale,
        rotation: layer.transform.rotation,
        anchor: layer.transform.anchor,
        opacity: layer.transform.opacity,
        borderRadius: layer.transform.borderRadius,
      };

      renderer.renderLayer({
        texture,
        transform: gpuTransform,
        effects: [],
        opacity: layer.transform.opacity,
        borderRadius: layer.transform.borderRadius || 0,
      });
    }

    const result = await renderer.endFrame();

    for (const texture of textures) {
      renderer.releaseTexture(texture);
    }

    return result;
  } catch (e) {
    console.error("[renderAllLayersWithGPU] Error:", e);
    return null;
  }
};

interface ClipWithPlaceholder {
  isPlaceholder?: boolean;
}

/**
 * MediaForge brand yellow, used for the text-overlay selection chrome
 * (border + handles). Kept as a constant so a future theme switch is a
 * one-line change.
 */
const TEXT_OVERLAY_COLOR = "#F4FF00";

/**
 * Small reusable handle components for the text-clip selection overlay.
 *
 * Each handle renders an 8 px visible circle/pill but accepts pointer events
 * inside a 16 px hit-area courtesy of negative inset. The two prior text-
 * overlay implementations used 16 px white squares with 2 px cyan borders,
 * which were too chunky on small text clips (handles would overlap each
 * other) and used a non-brand color. The corner / edge split below now
 * matches Figma's NLE-style transform pattern.
 */
const TextOverlayCornerHandle: React.FC<{
  position: "nw" | "ne" | "sw" | "se";
  cursor: string;
  onMouseDown: (e: React.MouseEvent) => void;
}> = ({ position, cursor, onMouseDown }) => {
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    width: 16,
    height: 16,
    cursor,
    pointerEvents: "auto",
  };
  if (position === "nw") { baseStyle.left = -8; baseStyle.top = -8; }
  else if (position === "ne") { baseStyle.right = -8; baseStyle.top = -8; }
  else if (position === "sw") { baseStyle.left = -8; baseStyle.bottom = -8; }
  else { baseStyle.right = -8; baseStyle.bottom = -8; }
  return (
    <div
      style={baseStyle}
      onMouseDown={onMouseDown}
      data-testid={`text-handle-${position}`}
    >
      <div
        style={{
          position: "absolute",
          left: 4,
          top: 4,
          width: 8,
          height: 8,
          borderRadius: 8,
          background: TEXT_OVERLAY_COLOR,
          border: "1.5px solid #fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
        }}
      />
    </div>
  );
};

const TextOverlayEdgeHandle: React.FC<{
  position: "n" | "s" | "e" | "w";
  cursor: string;
  onMouseDown: (e: React.MouseEvent) => void;
}> = ({ position, cursor, onMouseDown }) => {
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    cursor,
    pointerEvents: "auto",
  };
  const isHoriz = position === "n" || position === "s";
  if (isHoriz) {
    baseStyle.left = "50%";
    baseStyle.marginLeft = -8;
    baseStyle.width = 16;
    baseStyle.height = 16;
    if (position === "n") baseStyle.top = -8;
    else baseStyle.bottom = -8;
  } else {
    baseStyle.top = "50%";
    baseStyle.marginTop = -8;
    baseStyle.width = 16;
    baseStyle.height = 16;
    if (position === "w") baseStyle.left = -8;
    else baseStyle.right = -8;
  }
  return (
    <div
      style={baseStyle}
      onMouseDown={onMouseDown}
      data-testid={`text-handle-${position}`}
    >
      <div
        style={{
          position: "absolute",
          left: isHoriz ? 2 : 4,
          top: isHoriz ? 4 : 2,
          width: isHoriz ? 12 : 8,
          height: isHoriz ? 8 : 12,
          borderRadius: 6,
          background: TEXT_OVERLAY_COLOR,
          border: "1.5px solid #fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
        }}
      />
    </div>
  );
};

/**
 * Inline text editor overlay for selected text clips in the preview canvas.
 *
 * Implements the standard NLE pattern: double-click a selected text clip in
 * preview to enter inline edit mode (cursor inside the text, type to change).
 * Esc or blur commits the new value to the project store. The contenteditable
 * element is positioned at the text clip's bounds with styling that matches
 * the canvas-rendered glyphs as closely as the DOM allows.
 *
 * Note: Canvas-rendered text and DOM-rendered text never match pixel-perfect
 * (font metrics, kerning, sub-pixel rendering, letter-spacing rounding all
 * differ). This is a known limitation of any on-canvas inline editor — the
 * convention is "close enough" while editing, exact when committed.
 */
const InlineTextEditor = React.forwardRef<
  HTMLDivElement,
  {
    clip: TextClip;
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
      displayScale: number;
    };
    onCommit: (newText: string) => void;
    onCancel: () => void;
  }
>(({ clip, bounds, onCommit, onCancel: _onCancel }, ref) => {
  const localRef = useRef<HTMLDivElement | null>(null);
  // Merge forwarded + local ref so the parent can also access the editor.
  React.useImperativeHandle(ref, () => localRef.current as HTMLDivElement);

  const { style, transform } = clip;
  const scale = bounds.displayScale * transform.scale.x;
  const scaleY = bounds.displayScale * transform.scale.y;

  // Focus + select-all once on mount so users can immediately type to replace
  // the existing text, matching every text-editor in the world.
  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, []);

  const commit = useCallback(() => {
    const el = localRef.current;
    if (!el) return;
    onCommit(el.innerText);
  }, [onCommit]);

  return (
    <div
      ref={localRef}
      contentEditable
      suppressContentEditableWarning
      data-inline-text-editor="true"
      role="textbox"
      aria-label="Edit text inline"
      aria-multiline="true"
      className="absolute outline-2 outline-cyan-400 outline-dashed pointer-events-auto"
      style={{
        left: bounds.x,
        top: bounds.y,
        // Width/height are derived from canvas-space text size scaled to
        // viewport; we let the contenteditable grow naturally with the
        // user's typing within these bounds.
        minWidth: Math.max(bounds.width, 40),
        minHeight: Math.max(bounds.height, style.fontSize * scaleY * 0.8),
        fontFamily: style.fontFamily,
        fontSize: style.fontSize * scale,
        fontWeight: style.fontWeight as React.CSSProperties["fontWeight"],
        fontStyle: style.fontStyle,
        color: style.color,
        // Opaque backdrop while editing so the canvas-rendered glyphs
        // beneath don't bleed through and create a "double text" effect.
        // We restore the user's style.backgroundColor on commit.
        backgroundColor:
          style.backgroundColor && style.backgroundColor !== "transparent"
            ? style.backgroundColor
            : "rgba(0, 0, 0, 0.85)",
        textAlign: style.textAlign,
        lineHeight: style.lineHeight,
        letterSpacing: `${(style.letterSpacing || 0) * scale}px`,
        textDecoration: style.textDecoration || "none",
        WebkitTextStroke:
          style.strokeColor && style.strokeWidth
            ? `${style.strokeWidth * scale}px ${style.strokeColor}`
            : undefined,
        textShadow:
          style.shadowColor && style.shadowBlur
            ? `${(style.shadowOffsetX || 0) * scale}px ${(style.shadowOffsetY || 0) * scale}px ${style.shadowBlur * scale}px ${style.shadowColor}`
            : undefined,
        textTransform:
          (style.textTransform as React.CSSProperties["textTransform"]) ||
          "none",
        padding: "2px 4px",
        boxSizing: "content-box",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        cursor: "text",
        zIndex: 20,
      }}
      onKeyDown={(e) => {
        // Stop global shortcuts (B / A / Space etc.) while typing.
        e.stopPropagation();
        if (e.key === "Escape") {
          // Esc commits and exits. We pick "commit on Esc" rather than
          // "cancel on Esc" because losing typed work is a worse UX
          // surprise than the rare case where the user actually wanted
          // to revert (which is what Cmd+Z handles).
          e.preventDefault();
          commit();
        }
        // Ctrl/Cmd+Enter also commits and exits.
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          commit();
        }
      }}
      onBlur={commit}
      onMouseDown={(e) => {
        // Prevent the parent move-handler from claiming this click as a drag.
        e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        // Eat the dbl-click so it doesn't re-enter edit mode or bubble.
        e.stopPropagation();
      }}
    >
      {clip.text}
    </div>
  );
});

InlineTextEditor.displayName = "InlineTextEditor";

export const Preview: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const renderBridgeInitialized = useRef<boolean>(false);
  const lastGoodFrameRef = useRef<ImageBitmap | null>(null);
  // Timestamp of the last `createImageBitmap` snapshot of the composite frame.
  // We throttle snapshotting to ~4Hz because the allocation costs 5-8ms each
  // and was a measurable per-frame cost during multi-track playback.
  const lastGoodSnapshotAtRef = useRef<number>(0);
  const offscreenCanvasRef = useRef<OffscreenCanvas | null>(null);
  const offscreenCtxRef = useRef<OffscreenCanvasRenderingContext2D | null>(
    null,
  );

  // Native video element for hardware-accelerated playback (much faster for 4K)
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  const currentVideoMediaIdRef = useRef<string | null>(null);
  const nativePlaybackActiveRef = useRef<boolean>(false);

  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioGraphRef = useRef<ReturnType<typeof getRealtimeAudioGraph> | null>(
    null,
  );
  const audioBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());

  /** Returns the cache key for an audio buffer, accounting for multi-track audio files. */
  const getAudioBufferCacheKey = (mediaId: string, audioTrackIndex?: number): string =>
    audioTrackIndex !== undefined && audioTrackIndex > 0
      ? `${mediaId}:${audioTrackIndex}`
      : mediaId;

  /**
   * Loads an AudioBuffer for the given media item and audio track index.
   * Uses mediabunny for non-primary tracks; falls back to decodeAudioData for the primary track.
   */
  const loadAudioBuffer = async (
    audioContext: AudioContext | BaseAudioContext,
    blob: Blob,
    audioTrackIndex: number = 0,
  ): Promise<AudioBuffer | null> => {
    if (audioTrackIndex === 0) {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        return await audioContext.decodeAudioData(arrayBuffer);
      } catch {
        // Fall through to mediabunny extraction
      }
    }
    // Use mediabunny to extract the specific audio track
    try {
      const { Input, ALL_FORMATS, BlobSource, AudioBufferSink } =
        await import("mediabunny");
      const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const audioTracks = await (input as any).getAudioTracks();
      const track =
        audioTracks[audioTrackIndex] ??
        (await (input as any).getPrimaryAudioTrack()) ??
        audioTracks[0] ??
        null;
      if (!track) {
        (input as any)[Symbol.dispose]?.();
        return null;
      }
      const canDecode = await track.canDecode();
      if (!canDecode) {
        (input as any)[Symbol.dispose]?.();
        return null;
      }
      const sink = new AudioBufferSink(track);
      const duration = await track.computeDuration();
      if (!duration || duration <= 0) {
        (input as any)[Symbol.dispose]?.();
        return null;
      }
      // Collect all audio buffers from the sink
      const chunks: { buffer: AudioBuffer; timestamp: number }[] = [];
      for await (const wrapped of sink.buffers(0, duration)) {
        chunks.push({ buffer: wrapped.buffer, timestamp: wrapped.timestamp });
      }
      (input as any)[Symbol.dispose]?.();
      if (chunks.length === 0) return null;
      // Concatenate all chunks into a single AudioBuffer
      const sampleRate = chunks[0].buffer.sampleRate;
      const numChannels = chunks[0].buffer.numberOfChannels;
      const totalFrames = Math.ceil(duration * sampleRate);
      const combined = audioContext.createBuffer(numChannels, totalFrames, sampleRate);
      for (const chunk of chunks) {
        const offsetFrames = Math.round(chunk.timestamp * sampleRate);
        for (let ch = 0; ch < numChannels; ch++) {
          const dest = combined.getChannelData(ch);
          const src = chunk.buffer.getChannelData(ch);
          dest.set(src, offsetFrames);
        }
      }
      return combined;
    } catch {
      return null;
    }
  };

  const rendererRef = useRef<Renderer | null>(null);
  const rendererInitializedRef = useRef<boolean>(false);

  const [isMuted, setIsMuted] = useState(false);
  const [isRenderBridgeReady, setIsRenderBridgeReady] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [rendererType, setRendererType] = useState<string>("none");
  // Adapter info pulled from the active renderer. We display this in the
  // "LOCAL" badge tooltip and in the rendering panel of SettingsDialog so
  // users can verify the work is happening on their own device.
  const [adapterInfo, setAdapterInfo] = useState<RendererAdapterInfo | null>(
    null,
  );
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showZoomMenu, setShowZoomMenu] = useState(false);

  const ZOOM_OPTIONS = [
    { label: "100%", value: 1 },
    { label: "125%", value: 1.25 },
    { label: "150%", value: 1.5 },
    { label: "200%", value: 2 },
  ];

  const isDark = useThemeStore((state) => state.isDark);

  // Preview FPS — drives the throttle on the render loop. We keep a ref in
  // sync so the rAF callback always reads the current value without
  // re-creating the entire playback effect when the user changes it.
  const previewFps = useSettingsStore((state) => state.previewFps);
  const setPreviewFps = useSettingsStore((state) => state.setPreviewFps);
  const previewFpsRef = useRef<number>(previewFps);
  useEffect(() => {
    previewFpsRef.current = previewFps;
  }, [previewFps]);

  // Preview renderer mode — "auto" | "webgpu" | "canvas2d". When the user
  // changes this, the init effect below re-creates the renderer so the
  // change applies without a page reload.
  const rendererMode = useSettingsStore((state) => state.rendererMode);
  const [showFpsMenu, setShowFpsMenu] = useState(false);
  // Aspect-ratio dropdown — lives next to the Zoom/FPS/Fullscreen cluster
  // beneath the preview canvas. Each preset is a (label, width, height) tuple;
  // selecting a preset writes via `updateSettings({width, height})` and the
  // canvas auto-rescales. Height is normalised at 1080 lines so frame rate /
  // pixel-density math stays consistent across presets.
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const FPS_OPTIONS = [15, 24, 30, 45, 60];

  // Close any open footer popover (zoom / fps / aspect) on Escape. Without
  // this, the `fixed inset-0 z-40` click-catcher each popover renders behind
  // itself blocks pointer events on the rest of the page until the user
  // clicks somewhere — including the next click on a footer button or the
  // canvas. (V6 audit: pickers stuck open under playwright-driven flows.)
  useEffect(() => {
    if (!showZoomMenu && !showFpsMenu && !showAspectMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showZoomMenu) setShowZoomMenu(false);
      if (showFpsMenu) setShowFpsMenu(false);
      if (showAspectMenu) setShowAspectMenu(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showZoomMenu, showFpsMenu, showAspectMenu]);

  // Canvas interaction state for resize/move
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("none");
  const [activeHandle, setActiveHandle] = useState<HandlePosition | null>(null);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);

  /**
   * Inline text editing — when the user double-clicks a selected text clip in
   * preview, we enter "inline edit mode": a contenteditable overlay is rendered
   * at the clip bounds, the canvas glyph is hidden, and typing updates the
   * underlying TextClip.text. Pressing Esc or blurring commits the change.
   *
   * Industry-standard NLE pattern (Premiere, FCP, Resolve, CapCut all use
   * dbl-click → inline cursor).
   */
  const [inlineEditingTextClipId, setInlineEditingTextClipId] = useState<
    string | null
  >(null);
  const inlineEditRef = useRef<HTMLDivElement | null>(null);
  // Ref to the text-clip selection overlay so the drag handler can apply
  // direct DOM transforms during a move/resize without waiting for React.
  const textOverlayRef = useRef<HTMLDivElement | null>(null);
  const interactionStartRef = useRef<{
    x: number;
    y: number;
    transform: {
      x: number;
      y: number;
      scaleX: number;
      scaleY: number;
      rotation: number;
    };
  } | null>(null);
  const pendingTransformRef = useRef<{
    clipId: string;
    transform: {
      position?: { x: number; y: number };
      scale?: { x: number; y: number };
      rotation?: number;
    };
  } | null>(null);
  // Mirrors `pendingTransformRef` but for text-clip interactions specifically,
  // so handleMouseUp can flush the final pointer position to the store even
  // if the throttle window swallowed the last in-flight RAF commit.
  const pendingTextTransformRef = useRef<{
    clipId: string;
    transform: {
      position?: { x: number; y: number };
      scale?: { x: number; y: number };
      rotation?: number;
    };
  } | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Track if we're currently interacting to prevent re-renders during resize/move
  const isInteractingRef = useRef<boolean>(false);
  // Throttle store updates during interaction (update at most every 32ms ~30fps)
  const lastStoreUpdateRef = useRef<number>(0);
  const STORE_UPDATE_THROTTLE_MS = 32;
  // Throttle playhead updates during playback to reduce React re-renders
  const lastPlayheadUpdateRef = useRef<number>(0);
  const PLAYHEAD_UPDATE_THROTTLE_MS = 16;
  // Live transform state for immediate visual feedback during interaction
  const [liveTransform, setLiveTransform] = useState<{
    position: { x: number; y: number };
    scale: { x: number; y: number };
  } | null>(null);

  // Track interaction target type (video clip or text clip)
  const [interactionTargetType, setInteractionTargetType] = useState<
    "clip" | "text-clip" | "shape-clip" | null
  >(null);
  const interactionTargetIdRef = useRef<string | null>(null);

  // Video element cache for native hardware-accelerated frame decoding (thumbnails/scrubbing)
  // Much more reliable than MediaBunny's CanvasSink for random-access seeking
  const videoElementCacheRef = useRef<
    Map<string, { video: HTMLVideoElement; url: string; lastUsed: number }>
  >(new Map());

  // Persistent decoder cache for efficient playback (legacy - kept for fallback)
  const decoderCacheRef = useRef<
    Map<
      string,
      {
        input: { [Symbol.dispose]?: () => void };
        sink: unknown;
        mediaId: string;
        lastUsed: number;
      }
    >
  >(new Map());

  // Track canvas size changes for resize handles positioning
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width, height });
        if (width > 0 && height > 0) {
          offscreenCanvasRef.current = new OffscreenCanvas(width, height);
          offscreenCtxRef.current = offscreenCanvasRef.current.getContext("2d");
        }
      }
    });

    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, []);

  // Project store - subscribe to the entire project to ensure re-renders
  // when any part of the project changes (including clips)
  const project = useProjectStore((state) => state.project);
  const getMediaItem = useProjectStore((state) => state.getMediaItem);

  // Get text clips from TitleEngine
  const getTitleEngine = useEngineStore((state) => state.getTitleEngine);
  const allTextClips = useMemo(() => {
    const titleEngine = getTitleEngine();
    return titleEngine?.getAllTextClips() || [];
  }, [getTitleEngine, project.modifiedAt]);

  const getGraphicsEngine = useEngineStore((state) => state.getGraphicsEngine);
  const allShapeClips = useMemo(() => {
    const graphicsEngine = getGraphicsEngine();
    const shapes = graphicsEngine?.getAllShapeClips() || [];
    const svgs = graphicsEngine?.getAllSVGClips() || [];
    const stickers = graphicsEngine?.getAllStickerClips() || [];
    return [...shapes, ...svgs, ...stickers];
  }, [getGraphicsEngine, project.modifiedAt]);

  // Get subtitles from project timeline
  const allSubtitles = useMemo(() => {
    return project.timeline.subtitles || [];
  }, [project.timeline.subtitles]);

  // Aspect-ratio picker writes through this. The store action persists
  // width/height in `project.settings` and re-renders any consumers that
  // read frame dimensions (including the preview canvas, which uses the
  // values to compute its `letterbox` scale).
  const updateSettings = useProjectStore((state) => state.updateSettings);
  const updateClipTransform = useProjectStore(
    (state) => state.updateClipTransform,
  );
  const updateTextTransform = useProjectStore(
    (state) => state.updateTextTransform,
  );
  const updateShapeTransform = useProjectStore(
    (state) => state.updateShapeTransform,
  );
  const updateTextContent = useProjectStore(
    (state) => state.updateTextContent,
  );
  const timelineTracks = project.timeline.tracks;
  const settings = project.settings;

  // Keep a ref to timelineTracks for use in playback effect without causing re-runs
  const timelineTracksRef = useRef(timelineTracks);
  useEffect(() => {
    timelineTracksRef.current = timelineTracks;
  }, [timelineTracks]);

  // Keep a ref to allTextClips for use in playback effect
  const allTextClipsRef = useRef(allTextClips);
  useEffect(() => {
    allTextClipsRef.current = allTextClips;
  }, [allTextClips]);

  const allShapeClipsRef = useRef(allShapeClips);
  useEffect(() => {
    allShapeClipsRef.current = allShapeClips;
  }, [allShapeClips]);

  // Keep a ref to allSubtitles for use in playback effect
  const allSubtitlesRef = useRef(allSubtitles);
  useEffect(() => {
    allSubtitlesRef.current = allSubtitles;
  }, [allSubtitles]);

  // Keep a ref to isScrubbing for use in playback loop
  const isScrubbingRef = useRef(false);

  const selectedItems = useUIStore((state) => state.selectedItems);
  const cropMode = useUIStore((state) => state.cropMode);
  const cropClipId = useUIStore((state) => state.cropClipId);
  const setCropMode = useUIStore((state) => state.setCropMode);
  const exportState = useUIStore((state) => state.exportState);
  const motionPathMode = useUIStore((state) => state.motionPathMode);
  const motionPathClipId = useUIStore((state) => state.motionPathClipId);
  const select = useUIStore((state) => state.select);

  const {
    playheadPosition,
    playbackState,
    playbackRate,
    isScrubbing,
    pause,
    togglePlayback,
    seekTo,
    seekRelative,
    setPlayheadPosition,
  } = useTimelineStore();

  useEffect(() => {
    isScrubbingRef.current = isScrubbing;
  }, [isScrubbing]);

  const isPlaying = playbackState === "playing";

  const motionPathClip = React.useMemo(() => {
    if (!motionPathMode || !motionPathClipId) return null;
    for (const track of project.timeline.tracks) {
      const clip = track.clips.find((c) => c.id === motionPathClipId);
      if (clip) return clip;
    }
    return null;
  }, [motionPathMode, motionPathClipId, project.timeline.tracks]);

  const [motionPathConfig, setMotionPathConfig] = React.useState<MotionPathConfig | null>(null);

  React.useEffect(() => {
    if (motionPathClip) {
      setMotionPathConfig({
        clipId: motionPathClip.id,
        enabled: true,
        pathType: "bezier",
        points: [],
        showPath: true,
        autoOrient: false,
        alignOrigin: [0.5, 0.5],
      });
    } else {
      setMotionPathConfig(null);
    }
  }, [motionPathClip]);

  const handleMotionPathPointMove = React.useCallback(
    (index: number, x: number, y: number) => {
      setMotionPathConfig((prev) => {
        if (!prev) return prev;
        const newPoints = [...prev.points];
        newPoints[index] = { ...newPoints[index], x, y };
        return { ...prev, points: newPoints };
      });
    },
    []
  );

  const handleMotionPathPointAdd = React.useCallback(
    (point: GSAPMotionPathPoint) => {
      setMotionPathConfig((prev) => {
        if (!prev) return prev;
        const newPoints = [...prev.points, point].sort((a, b) => a.time - b.time);
        return { ...prev, points: newPoints };
      });
    },
    []
  );

  const handleMotionPathPointRemove = React.useCallback((index: number) => {
    setMotionPathConfig((prev) => {
      if (!prev) return prev;
      const newPoints = prev.points.filter((_, i) => i !== index);
      return { ...prev, points: newPoints };
    });
  }, []);

  const handleMotionPathControlPointMove = React.useCallback(
    (pointIndex: number, handleType: "cp1" | "cp2", x: number, y: number) => {
      setMotionPathConfig((prev) => {
        if (!prev) return prev;
        const newPoints = [...prev.points];
        const point = newPoints[pointIndex];
        if (!point.controlPoints) {
          point.controlPoints = { cp1: { x: 0, y: 0 }, cp2: { x: 0, y: 0 } };
        }
        point.controlPoints[handleType] = { x, y };
        return { ...prev, points: newPoints };
      });
    },
    []
  );

  const particleEngine = React.useMemo(() => getParticleEngine(), []);
  const [particleUpdateTrigger, setParticleUpdateTrigger] = React.useState(
    () => particleEngine.getChangeVersion()
  );

  React.useEffect(() => {
    const unsubscribe = particleEngine.onEffectsChange(() => {
      setParticleUpdateTrigger(particleEngine.getChangeVersion());
    });
    return unsubscribe;
  }, [particleEngine]);

  const particleEffects = React.useMemo(() => {
    return particleEngine.getAllEffects();
  }, [particleEngine, particleUpdateTrigger]);

  // Calculate the actual end time for playback (where clips actually end)
  // This needs to recalculate whenever the timeline changes
  // Includes video/audio/image clips, text clips, and shape clips
  const actualEndTime = React.useMemo(() => {
    const tracks = project.timeline.tracks;
    let maxEnd = 0;

    for (const track of tracks) {
      for (const clip of track.clips) {
        const end = clip.startTime + clip.duration;
        if (end > maxEnd) maxEnd = end;
      }
    }

    for (const textClip of allTextClips) {
      const end = textClip.startTime + textClip.duration;
      if (end > maxEnd) maxEnd = end;
    }

    for (const shapeClip of allShapeClips) {
      const end = shapeClip.startTime + shapeClip.duration;
      if (end > maxEnd) maxEnd = end;
    }

    return maxEnd;
  }, [project.timeline.tracks, allTextClips, allShapeClips]);

  // RenderBridge is guaranteed to be initialized before Preview renders (see EditorInterface)
  useEffect(() => {
    if (renderBridgeInitialized.current) return;

    const bridge = getRenderBridge();
    if (canvasRef.current) {
      bridge.setCanvas(canvasRef.current);
    }
    renderBridgeInitialized.current = true;
    setIsRenderBridgeReady(true);
  }, []);

  useEffect(() => {
    return () => {
      for (const entry of decoderCacheRef.current.values()) {
        entry.input[Symbol.dispose]?.();
      }
      decoderCacheRef.current.clear();

      for (const entry of videoElementCacheRef.current.values()) {
        entry.video.src = "";
        URL.revokeObjectURL(entry.url);
      }
      videoElementCacheRef.current.clear();

      if (videoElementRef.current) {
        videoElementRef.current.pause();
        videoElementRef.current.src = "";
        videoElementRef.current = null;
      }
      if (videoUrlRef.current) {
        URL.revokeObjectURL(videoUrlRef.current);
        videoUrlRef.current = null;
      }
      currentVideoMediaIdRef.current = null;
    };
  }, []);

  // Set canvas internal resolution ONLY when project settings change
  // This follows the WebGPU best practice of keeping internal resolution fixed
  // and using CSS/transforms for display scaling (prevents flickering during resize)
  // Using useLayoutEffect to ensure canvas size is set before first paint
  React.useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Always ensure canvas has correct size
    if (canvas.width !== settings.width || canvas.height !== settings.height) {
      canvas.width = settings.width;
      canvas.height = settings.height;
    }
  }, [settings.width, settings.height]);

  useEffect(() => {
    if (isRenderBridgeReady && canvasRef.current) {
      const bridge = getRenderBridge();
      bridge.setCanvas(canvasRef.current);
    }
  }, [isRenderBridgeReady]);

  /**
   * Initialize the preview renderer.
   *
   * Re-runs whenever the user changes `rendererMode` so the choice is
   * applied immediately without a page reload. The cleanup tears down
   * the current renderer first, then the effect body builds a new one
   * with the right `preferredRenderer` flag.
   *
   * - "auto"     → WebGPU when supported, else Canvas2D (no toast either way)
   * - "webgpu"   → fail loudly (toast) if no GPU adapter, then fall back
   * - "canvas2d" → skip WebGPU probe entirely (factory respects this)
   */
  useEffect(() => {
    if (!canvasRef.current) return;

    let cancelled = false;

    const initializeRenderer = async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Map UI setting to factory arg. "auto" leaves the choice to the
        // factory (which still prefers WebGPU); "webgpu" is also "prefer
        // WebGPU" but we also surface an error toast when it falls back.
        const preferred =
          rendererMode === "canvas2d"
            ? "canvas2d"
            : isWebGPUSupported()
              ? "webgpu"
              : "canvas2d";

        // If the user explicitly asked for WebGPU but the browser
        // doesn't expose it, show a clear, actionable toast instead of
        // silently dropping to Canvas2D.
        if (rendererMode === "webgpu" && !isWebGPUSupported()) {
          toast.error(
            "WebGPU not available on this device",
            "Your browser or GPU doesn't support WebGPU. Falling back to Canvas2D.",
          );
        }

        const factory = RendererFactory.getInstance();
        const renderer = await factory.createRenderer({
          canvas,
          width: settings.width,
          height: settings.height,
          preferredRenderer: preferred,
        });

        if (cancelled) {
          renderer.destroy();
          return;
        }

        rendererRef.current = renderer;
        rendererInitializedRef.current = true;
        setRendererType(renderer.type);
        setAdapterInfo(renderer.getAdapterInfo());

        // Surface an additional warning if forced-WebGPU didn't actually
        // give us a WebGPU renderer (adapter request failed after init).
        if (rendererMode === "webgpu" && renderer.type !== "webgpu") {
          toast.error(
            "WebGPU init failed",
            "No usable GPU adapter — using Canvas2D instead.",
          );
        }

        renderer.onDeviceLost(() => {
          console.warn("[Preview] GPU device lost, attempting recovery...");
          renderer
            .recreateDevice()
            .then((success) => {
              if (!success) {
                console.error("[Preview] Failed to recover GPU device");
                setRendererType("canvas2d");
                setAdapterInfo(renderer.getAdapterInfo());
              }
            })
            .catch((err) => {
              console.error("[Preview] GPU recovery threw:", err);
              setRendererType("canvas2d");
            });
        });
      } catch (error) {
        console.warn("[Preview] Failed to initialize GPU renderer:", error);
        setRendererType("canvas2d");
      }
    };

    initializeRenderer();

    return () => {
      cancelled = true;
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
        rendererInitializedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendererMode]);

  /**
   * Handle canvas resize events
   *
   * Update preview at 60fps when dragging to resize
   */
  useEffect(() => {
    if (rendererRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      if (
        canvas.width !== settings.width ||
        canvas.height !== settings.height
      ) {
        rendererRef.current.resize(settings.width, settings.height);
      }
    }
  }, [settings.width, settings.height]);

  const rateRef = useRef(playbackRate);
  const startPositionRef = useRef(playheadPosition);

  // MediaBunny playback resources - map of clipId to resources for multi-track playback.
  //
  // Resources are NO LONGER per-clip decoders. Each entry now references a
  // mediaId that has been `acquire`d on the shared decoder pool. Multiple
  // clips sharing the same mediaId share one underlying decoder. This is the
  // fix for the "3 tracks same mp4 = 1fps" performance bug.
  const playbackResourcesRef = useRef<
    Map<
      string,
      {
        mediaId: string;
        clipId: string;
        trackIndex: number;
      }
    >
  >(new Map());

  const imageBitmapCacheRef = useRef<Map<string, ImageBitmap>>(new Map());

  useEffect(() => {
    rateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    if (!isPlaying) {
      startPositionRef.current = playheadPosition;
    }
  }, [isPlaying, playheadPosition]);

  // Pause timeline thumbnail extraction while playing. Thumbnail seeks compete
  // with playback for video decoder time and were a measured contributor to
  // the 3-track perf bug. Reset the shared decoder pool's counters on each
  // play start so the perf harness can read fresh decode counts.
  useEffect(() => {
    setThumbnailExtractionPaused(isPlaying);
    if (isPlaying) {
      resetDecodeCount();
    }
  }, [isPlaying]);

  const cleanupPlaybackResources = useCallback(() => {
    const resources = playbackResourcesRef.current;
    const pool = getSharedDecoderPool();
    for (const [, resource] of resources) {
      pool.release(resource.mediaId);
    }
    pool.evictUnused();
    playbackResourcesRef.current = new Map();

    for (const [, bitmap] of imageBitmapCacheRef.current) {
      bitmap.close();
    }
    imageBitmapCacheRef.current = new Map();
  }, []);

  const cleanupAudioResources = useCallback(() => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch {
        // Ignore errors if already stopped
      }
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    if (audioGraphRef.current) {
      audioGraphRef.current.stopScheduler();
      audioGraphRef.current.stopAllClips();
    }
  }, []);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : 1;
    }
    if (audioGraphRef.current) {
      audioGraphRef.current.setPreviewMuted(isMuted);
    }
  }, [isMuted]);

  /**
   * Render overlay clips (text and shapes) respecting proper z-ordering with video/image tracks.
   * Track order determines layering: lower track index = rendered on top.
   *
   * @param mode - "below-video" renders only overlays that should appear below video tracks
   * "above-video" renders only overlays that should appear above video tracks
   * "all" renders all overlays (legacy behavior for when no video is present)
   */
  const renderOverlayClipsInTrackOrder = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      tracks: Track[],
      shapeClips: (ShapeClip | SVGClip | StickerClip)[],
      textClips: TextClip[],
      time: number,
      canvasWidth: number,
      canvasHeight: number,
      mode: "below-video" | "above-video" | "all" = "all",
    ) => {
      const videoImageTrackIndices = tracks
        .map((t, idx) => ({ track: t, originalIndex: idx }))
        .filter(
          ({ track }) =>
            (track.type === "video" || track.type === "image") && !track.hidden,
        )
        .map(({ originalIndex }) => originalIndex);

      const lowestVideoIndex =
        videoImageTrackIndices.length > 0
          ? Math.min(...videoImageTrackIndices)
          : Infinity;
      const highestVideoIndex =
        videoImageTrackIndices.length > 0
          ? Math.max(...videoImageTrackIndices)
          : -1;

      const overlayTracksWithIndex = tracks
        .map((t, idx) => ({ track: t, originalIndex: idx }))
        .filter(
          ({ track }) =>
            (track.type === "text" || track.type === "graphics") &&
            !track.hidden,
        );

      const tracksToRender = overlayTracksWithIndex.filter(
        ({ originalIndex }) => {
          if (mode === "below-video") {
            return originalIndex > highestVideoIndex;
          } else if (mode === "above-video") {
            return originalIndex < lowestVideoIndex;
          }
          return true;
        },
      );

      tracksToRender.sort((a, b) => b.originalIndex - a.originalIndex);

      for (const { track } of tracksToRender) {
        if (track.type === "graphics") {
          const trackShapeClips = shapeClips.filter(
            (sc) => sc.trackId === track.id,
          );
          for (const shapeClip of trackShapeClips) {
            renderShapeClipToCanvas(
              ctx,
              shapeClip,
              canvasWidth,
              canvasHeight,
              time,
            );
          }
        } else if (track.type === "text") {
          const trackTextClips = textClips.filter(
            (tc) => tc.trackId === track.id,
          );
          for (const textClip of trackTextClips) {
            renderTextClipToCanvas(
              ctx,
              textClip,
              canvasWidth,
              canvasHeight,
              time,
            );
          }
        }
      }
    },
    [],
  );

  /**
   * Set up audio playback from the AUDIO TRACK at a given timeline position
   * Uses RealtimeAudioGraph for real-time audio effects (reverb, delay, EQ, compressor)
   *
   * Audio effects can be on either:
   * 1. The audio clip on the audio track (preferred)
   * 2. A linked video clip on the video track (same mediaId, same startTime)
   *
   * @param timelinePosition - The current position in the timeline
   */
  const setupAudioFromAudioTrack = useCallback(
    async (timelinePosition: number): Promise<void> => {
      const tracks = timelineTracksRef.current;
      const audioTracks = tracks.filter((t) => t.type === "audio" && !t.hidden);
      const videoTracks = tracks.filter(
        (t) => (t.type === "video" || t.type === "image") && !t.hidden,
      );

      if (!audioGraphRef.current) {
        audioGraphRef.current = getRealtimeAudioGraph();
      }
      const audioGraph = audioGraphRef.current;
      audioGraph.setPreviewMuted(isMuted);

      const projectStore = useProjectStore.getState();
      const speedEngine = getSpeedEngine();
      const scheduledClips: AudioClipSchedule[] = [];

      for (const audioTrack of audioTracks) {
        audioGraph.createTrack({
          trackId: audioTrack.id,
          volume: 1,
          pan: 0,
          muted: audioTrack.muted || false,
          solo: audioTrack.solo || false,
          effects: [],
        });

        if (audioTrack.muted) {
          continue;
        }

        for (const audioClip of audioTrack.clips) {
          const clipEnd = audioClip.startTime + audioClip.duration;

          if (
            timelinePosition >= audioClip.startTime &&
            timelinePosition < clipEnd
          ) {
            const mediaItem = getMediaItem(audioClip.mediaId);
            if (!mediaItem?.blob) {
              continue;
            }

            let audioBuffer = audioBufferCacheRef.current.get(
              getAudioBufferCacheKey(audioClip.mediaId, audioClip.audioTrackIndex),
            );
            if (!audioBuffer) {
              try {
                const audioContext = audioGraph.getAudioContext();
                const loaded = await loadAudioBuffer(
                  audioContext,
                  mediaItem.blob,
                  audioClip.audioTrackIndex ?? 0,
                );
                if (!loaded) {
                  continue;
                }
                audioBuffer = loaded;
                audioBufferCacheRef.current.set(
                  getAudioBufferCacheKey(audioClip.mediaId, audioClip.audioTrackIndex),
                  audioBuffer,
                );
              } catch (error) {
                console.warn(
                  `[Preview] Failed to decode audio for clip ${audioClip.id}:`,
                  error,
                );
                continue;
              }
            }

            const audioClipData = projectStore.getClip(audioClip.id);
            let audioEffects = audioClipData?.audioEffects || [];

            if (audioEffects.length === 0) {
              for (const videoTrack of videoTracks) {
                for (const videoClip of videoTrack.clips) {
                  if (
                    videoClip.mediaId === audioClip.mediaId &&
                    Math.abs(videoClip.startTime - audioClip.startTime) < 0.01
                  ) {
                    const videoClipData = projectStore.getClip(videoClip.id);
                    const linkedEffects = videoClipData?.audioEffects || [];
                    if (linkedEffects.length > 0) {
                      audioEffects = linkedEffects;
                      break;
                    }
                  }
                }
                if (audioEffects.length > 0) break;
              }
            }

            const enabledEffects = audioEffects.filter(
              (e: Effect) => e.enabled,
            );

            audioGraph.updateTrackEffects(audioTrack.id, enabledEffects);

            const clipLocalTime = timelinePosition - audioClip.startTime;
            const isReverse = speedEngine.isReverse(audioClip.id);

            let mediaOffset = (audioClip.inPoint || 0) + clipLocalTime;
            if (isReverse) {
              mediaOffset = audioBuffer.duration - mediaOffset;
              mediaOffset = Math.max(0, mediaOffset);
            }

            scheduledClips.push({
              clipId: audioClip.id,
              trackId: audioTrack.id,
              audioBuffer,
              startTime: audioClip.startTime,
              endTime: clipEnd,
              mediaOffset,
              volume: audioClip.volume ?? 1,
              pan: 0,
              effects: enabledEffects,
              speed: audioClip.speed ?? 1,
            });
          }
        }
      }

      if (scheduledClips.length > 0) {
        await audioGraph.resume();
        audioGraph.scheduleClips(scheduledClips);
      }
    },
    [getMediaItem, isMuted],
  );

  const preDecodeAllAudioBuffers = useCallback(async (): Promise<void> => {
    const tracks = timelineTracksRef.current;
    const audioTracks = tracks.filter((t) => t.type === "audio" && !t.hidden);
    const videoTracks = tracks.filter(
      (t) => (t.type === "video" || t.type === "image") && !t.hidden,
    );

    if (!audioGraphRef.current) {
      audioGraphRef.current = getRealtimeAudioGraph();
    }
    const audioGraph = audioGraphRef.current;
    const audioContext = audioGraph.getAudioContext();

    const allTracks = [...audioTracks, ...videoTracks];

    for (const track of allTracks) {
      for (const clip of track.clips) {
        const cacheKey = getAudioBufferCacheKey(clip.mediaId, clip.audioTrackIndex);
        if (audioBufferCacheRef.current.has(cacheKey)) {
          continue;
        }

        const mediaItem = getMediaItem(clip.mediaId);
        if (!mediaItem?.blob) {
          continue;
        }

        try {
          const audioBuffer = await loadAudioBuffer(
            audioContext,
            mediaItem.blob,
            clip.audioTrackIndex ?? 0,
          );
          if (audioBuffer) {
            audioBufferCacheRef.current.set(cacheKey, audioBuffer);
          }
        } catch {
          // Audio decode failure for this clip — leave cache empty so the
          // playback graph treats the clip as silent. Logging here would
          // spam the console for legitimately-missing audio tracks.
        }
      }
    }
  }, [getMediaItem]);

  const getAudioClipsForScheduler = useCallback(
    (time: number): AudioClipSchedule[] => {
      const tracks = timelineTracksRef.current;
      const tracksWithAudio = tracks.filter(
        (t) => (t.type === "audio" || t.type === "video") && !t.hidden && !t.muted,
      );
      const schedules: AudioClipSchedule[] = [];
      const projectStore = useProjectStore.getState();

      for (const track of tracksWithAudio) {
        for (const clip of track.clips) {
          const clipEnd = clip.startTime + clip.duration;
          if (clipEnd <= time || clip.startTime > time + 1) {
            continue;
          }

          const audioBuffer = audioBufferCacheRef.current.get(
            getAudioBufferCacheKey(clip.mediaId, clip.audioTrackIndex),
          );
          if (!audioBuffer) {
            continue;
          }

          const clipData = projectStore.getClip(clip.id);
          const audioEffects = (clipData?.audioEffects || []).filter(
            (e: Effect) => e.enabled,
          );

          schedules.push({
            clipId: clip.id,
            trackId: track.id,
            audioBuffer,
            startTime: clip.startTime,
            endTime: clipEnd,
            mediaOffset: clip.inPoint || 0,
            volume: clip.volume ?? 1,
            pan: 0,
            effects: audioEffects,
            speed: clip.speed ?? 1,
          });
        }
      }

      return schedules;
    },
    [],
  );

  /**
   * Decode a single frame from a clip at a specific time using native video element
   * Native video elements provide reliable hardware-accelerated random-access seeking
   */
  const decodeClipFrame = useCallback(
    async (
      clip: {
        id: string;
        mediaId: string;
        startTime: number;
        inPoint?: number;
      },
      time: number,
      canvasWidth: number,
      canvasHeight: number,
    ): Promise<ImageBitmap | null> => {
      const mediaItem = getMediaItem(clip.mediaId);
      if (!mediaItem?.blob) return null;

      if (mediaItem.type === "image") {
        try {
          return await createImageBitmap(mediaItem.blob);
        } catch {
          return null;
        }
      }

      try {
        const clipLocalTime = time - clip.startTime;
        const speedEngine = getSpeedEngine();
        const adjustedLocalTime = speedEngine.getSourceTimeAtPlaybackTime(
          clip.id,
          clipLocalTime,
        );
        const mediaTime = (clip.inPoint || 0) + adjustedLocalTime;

        const cacheKey = clip.mediaId;
        let cached = videoElementCacheRef.current.get(cacheKey);

        if (!cached) {
          const url = URL.createObjectURL(mediaItem.blob);
          const video = document.createElement("video");
          video.src = url;
          video.muted = true;
          video.playsInline = true;
          video.preload = "auto";
          video.crossOrigin = "anonymous";

          await new Promise<void>((resolve, reject) => {
            const timeoutId = setTimeout(
              () => reject(new Error("Video load timeout")),
              10000,
            );
            video.onloadedmetadata = () => {
              clearTimeout(timeoutId);
              resolve();
            };
            video.onerror = () => {
              clearTimeout(timeoutId);
              reject(new Error("Video load failed"));
            };
          });

          cached = { video, url, lastUsed: Date.now() };
          videoElementCacheRef.current.set(cacheKey, cached);

          if (videoElementCacheRef.current.size > 8) {
            let oldestKey = "";
            let oldestTime = Infinity;
            for (const [key, entry] of videoElementCacheRef.current.entries()) {
              if (entry.lastUsed < oldestTime) {
                oldestTime = entry.lastUsed;
                oldestKey = key;
              }
            }
            if (oldestKey) {
              const oldEntry = videoElementCacheRef.current.get(oldestKey);
              if (oldEntry) {
                oldEntry.video.src = "";
                URL.revokeObjectURL(oldEntry.url);
                videoElementCacheRef.current.delete(oldestKey);
              }
            }
          }
        }

        cached.lastUsed = Date.now();
        const { video } = cached;

        const clampedTime = Math.max(
          0,
          Math.min(mediaTime, video.duration - 0.001),
        );
        if (Math.abs(video.currentTime - clampedTime) > 0.01) {
          video.currentTime = clampedTime;
          await new Promise<void>((resolve) => {
            const onSeeked = () => {
              video.removeEventListener("seeked", onSeeked);
              resolve();
            };
            video.addEventListener("seeked", onSeeked);
            setTimeout(resolve, 500);
          });
        }

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvasWidth;
        tempCanvas.height = canvasHeight;
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return null;

        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = canvasWidth / canvasHeight;
        let drawWidth = canvasWidth;
        let drawHeight = canvasHeight;
        let offsetX = 0;
        let offsetY = 0;

        if (videoAspect > canvasAspect) {
          drawHeight = canvasWidth / videoAspect;
          offsetY = (canvasHeight - drawHeight) / 2;
        } else {
          drawWidth = canvasHeight * videoAspect;
          offsetX = (canvasWidth - drawWidth) / 2;
        }

        tempCtx.fillStyle = "#000000";
        tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);
        tempCtx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

        return await createImageBitmap(tempCanvas);
      } catch {
        const cached = videoElementCacheRef.current.get(clip.mediaId);
        if (cached) {
          cached.video.src = "";
          URL.revokeObjectURL(cached.url);
          videoElementCacheRef.current.delete(clip.mediaId);
        }
        return null;
      }
    },
    [getMediaItem],
  );

  // Render a single frame using MediaBunny (for scrubbing/seeking)
  const renderFrameDirectly = useCallback(
    async (time: number): Promise<boolean> => {
      const canvas = canvasRef.current;
      if (!canvas) return false;

      if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = settings.width;
        canvas.height = settings.height;
      }

      const mainCtx = canvas.getContext("2d");
      if (!mainCtx) return false;

      if (
        !offscreenCanvasRef.current ||
        offscreenCanvasRef.current.width !== canvas.width ||
        offscreenCanvasRef.current.height !== canvas.height
      ) {
        offscreenCanvasRef.current = new OffscreenCanvas(
          canvas.width,
          canvas.height,
        );
        offscreenCtxRef.current = offscreenCanvasRef.current.getContext(
          "2d",
        ) as OffscreenCanvasRenderingContext2D;
      }

      const ctx =
        offscreenCtxRef.current as unknown as CanvasRenderingContext2D;
      if (!ctx) return false;

      const videoTracks = timelineTracks.filter(
        (t) => (t.type === "video" || t.type === "image") && !t.hidden,
      );

      let hasRenderedFrame = false;
      let shouldClearCanvas = true;

      const activeShapeClips = getActiveShapeClips(allShapeClips, time);
      const activeTextClips = getActiveTextClips(allTextClips, time);

      const transitionInfo = getTransitionAtTime(time, timelineTracks);

      if (transitionInfo) {
        try {
          const outgoingFrame = await decodeClipFrame(
            transitionInfo.clipA,
            time,
            canvas.width,
            canvas.height,
          );
          const incomingFrame = await decodeClipFrame(
            transitionInfo.clipB,
            time,
            canvas.width,
            canvas.height,
          );

          if (outgoingFrame && incomingFrame) {
            const processedOutgoing = await applyEffectsToFrame(
              transitionInfo.clipA.id,
              outgoingFrame,
            );
            const processedIncoming = await applyEffectsToFrame(
              transitionInfo.clipB.id,
              incomingFrame,
            );

            const validOutgoing =
              processedOutgoing.width > 0 && processedOutgoing.height > 0
                ? processedOutgoing
                : outgoingFrame;
            const validIncoming =
              processedIncoming.width > 0 && processedIncoming.height > 0
                ? processedIncoming
                : incomingFrame;

            const blendedFrame = await renderTransitionFrame(
              transitionInfo,
              validOutgoing,
              validIncoming,
            );

            if (
              blendedFrame &&
              blendedFrame.width > 0 &&
              blendedFrame.height > 0
            ) {
              if (shouldClearCanvas) {
                ctx.fillStyle = "#000000";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                shouldClearCanvas = false;
              }
              renderOverlayClipsInTrackOrder(
                ctx,
                timelineTracks,
                activeShapeClips,
                activeTextClips,
                time,
                canvas.width,
                canvas.height,
                "below-video",
              );
              ctx.drawImage(blendedFrame, 0, 0);
              renderOverlayClipsInTrackOrder(
                ctx,
                timelineTracks,
                activeShapeClips,
                activeTextClips,
                time,
                canvas.width,
                canvas.height,
                "above-video",
              );
              hasRenderedFrame = true;
            }
          } else if (outgoingFrame) {
            const processed = await applyEffectsToFrame(
              transitionInfo.clipA.id,
              outgoingFrame,
            );
            const validFrame =
              processed.width > 0 && processed.height > 0
                ? processed
                : outgoingFrame;
            if (shouldClearCanvas) {
              ctx.fillStyle = "#000000";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              shouldClearCanvas = false;
            }
            renderOverlayClipsInTrackOrder(
              ctx,
              timelineTracks,
              activeShapeClips,
              activeTextClips,
              time,
              canvas.width,
              canvas.height,
              "below-video",
            );
            ctx.drawImage(validFrame, 0, 0);
            renderOverlayClipsInTrackOrder(
              ctx,
              timelineTracks,
              activeShapeClips,
              activeTextClips,
              time,
              canvas.width,
              canvas.height,
              "above-video",
            );
            hasRenderedFrame = true;
          } else if (incomingFrame) {
            const processed = await applyEffectsToFrame(
              transitionInfo.clipB.id,
              incomingFrame,
            );
            const validFrame =
              processed.width > 0 && processed.height > 0
                ? processed
                : incomingFrame;
            if (shouldClearCanvas) {
              ctx.fillStyle = "#000000";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              shouldClearCanvas = false;
            }
            renderOverlayClipsInTrackOrder(
              ctx,
              timelineTracks,
              activeShapeClips,
              activeTextClips,
              time,
              canvas.width,
              canvas.height,
              "below-video",
            );
            ctx.drawImage(validFrame, 0, 0);
            renderOverlayClipsInTrackOrder(
              ctx,
              timelineTracks,
              activeShapeClips,
              activeTextClips,
              time,
              canvas.width,
              canvas.height,
              "above-video",
            );
            hasRenderedFrame = true;
          }
        } catch (error) {
          console.warn("[Preview] Transition render failed:", error);
        }
      }

      if (!hasRenderedFrame) {
        const hasVideoContent = videoTracks.some((track) =>
          track.clips.some(
            (clip) =>
              time >= clip.startTime && time < clip.startTime + clip.duration,
          ),
        );

        if (
          shouldClearCanvas &&
          (hasVideoContent ||
            activeShapeClips.length > 0 ||
            activeTextClips.length > 0)
        ) {
          ctx.fillStyle = hasVideoContent
            ? "#000000"
            : isDark
              ? "#0f0f11"
              : "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          shouldClearCanvas = false;
        }

        // Render ALL tracks in layer order using painter's algorithm
        // Higher index = rendered first (appears behind), Lower index = rendered last (appears on top)
        const allRenderableTracks = timelineTracks
          .map((track, idx) => ({ track, originalIndex: idx }))
          .filter(
            ({ track }) =>
              (track.type === "video" ||
                track.type === "image" ||
                track.type === "text" ||
                track.type === "graphics") &&
              !track.hidden,
          )
          .sort((a, b) => b.originalIndex - a.originalIndex);

        for (const { track } of allRenderableTracks) {
          if (track.type === "video" || track.type === "image") {
            for (const clip of track.clips) {
              const clipStart = clip.startTime;
              const clipEnd = clip.startTime + clip.duration;

              if (time >= clipStart && time < clipEnd) {
                const frame = await decodeClipFrame(
                  clip,
                  time,
                  canvas.width,
                  canvas.height,
                );

                if (frame) {
                  const clipLocalTime = time - clip.startTime;
                  let animatedTransform = getAnimatedTransform(
                    clip.transform as ClipTransform,
                    clip.keyframes,
                    clipLocalTime,
                  );

                  if (
                    clip.emphasisAnimation &&
                    clip.emphasisAnimation.type !== "none"
                  ) {
                    const emphasisState = applyEmphasisAnimation(
                      clip.emphasisAnimation,
                      clipLocalTime,
                    );
                    animatedTransform = {
                      ...animatedTransform,
                      opacity:
                        animatedTransform.opacity * emphasisState.opacity,
                      scale: {
                        x:
                          animatedTransform.scale.x *
                          emphasisState.scale *
                          emphasisState.scaleX,
                        y:
                          animatedTransform.scale.y *
                          emphasisState.scale *
                          emphasisState.scaleY,
                      },
                      position: {
                        x:
                          animatedTransform.position.x +
                          emphasisState.offsetX * canvas.width,
                        y:
                          animatedTransform.position.y +
                          emphasisState.offsetY * canvas.height,
                      },
                      rotation:
                        animatedTransform.rotation + emphasisState.rotation,
                    };
                  }

                  // Forward blend mode + per-clip blend opacity so the frame
                  // composites against everything below using the user's
                  // chosen mode (multiply / screen / overlay / etc).
                  const blendOpts = clip.blendMode && clip.blendMode !== "normal"
                    ? { blendMode: clip.blendMode, blendOpacity: clip.blendOpacity ?? 100 }
                    : undefined;
                  try {
                    const processedFrame = await applyEffectsToFrame(
                      clip.id,
                      frame,
                    );
                    if (processedFrame.width > 0 && processedFrame.height > 0) {
                      drawFrameWithTransform(
                        ctx,
                        processedFrame,
                        animatedTransform,
                        canvas.width,
                        canvas.height,
                        blendOpts,
                      );
                      hasRenderedFrame = true;
                    } else {
                      drawFrameWithTransform(
                        ctx,
                        frame,
                        animatedTransform,
                        canvas.width,
                        canvas.height,
                        blendOpts,
                      );
                      hasRenderedFrame = true;
                    }
                  } catch {
                    drawFrameWithTransform(
                      ctx,
                      frame,
                      animatedTransform,
                      canvas.width,
                      canvas.height,
                      blendOpts,
                    );
                    hasRenderedFrame = true;
                  }
                }
              }
            }
          } else if (track.type === "graphics") {
            const trackShapeClips = activeShapeClips.filter(
              (sc) => sc.trackId === track.id,
            );
            for (const shapeClip of trackShapeClips) {
              renderShapeClipToCanvas(
                ctx,
                shapeClip,
                canvas.width,
                canvas.height,
                time,
              );
              hasRenderedFrame = true;
            }
          } else if (track.type === "text") {
            const trackTextClips = activeTextClips.filter(
              (tc) => tc.trackId === track.id,
            );
            for (const textClip of trackTextClips) {
              renderTextClipToCanvas(
                ctx,
                textClip,
                canvas.width,
                canvas.height,
                time,
              );
              hasRenderedFrame = true;
            }
          }
        }
      }

      const activeSubtitles = getActiveSubtitles(allSubtitles, time);
      if (activeSubtitles.length > 0 && ctx) {
        for (const subtitle of activeSubtitles) {
          renderSubtitleToCanvas(
            ctx,
            subtitle,
            canvas.width,
            canvas.height,
            time,
          );
        }
      }

      if (hasRenderedFrame && offscreenCanvasRef.current) {
        mainCtx.clearRect(0, 0, canvas.width, canvas.height);
        mainCtx.drawImage(offscreenCanvasRef.current, 0, 0);
      }

      return hasRenderedFrame;
    },
    [
      timelineTracks,
      getMediaItem,
      decodeClipFrame,
      settings.width,
      settings.height,
      allTextClips,
      allShapeClips,
      allSubtitles,
      renderOverlayClipsInTrackOrder,
      isDark,
    ],
  );

  const renderFrameDirectlyRef = useRef(renderFrameDirectly);
  useEffect(() => {
    renderFrameDirectlyRef.current = renderFrameDirectly;
  }, [renderFrameDirectly]);

  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const playheadPositionRef = useRef(playheadPosition);
  useEffect(() => {
    playheadPositionRef.current = playheadPosition;
  }, [playheadPosition]);

  useEffect(() => {
    setImageLoadCallback(() => {
      if (!isPlayingRef.current) {
        renderFrameDirectlyRef.current(playheadPositionRef.current);
      }
    });
    return () => setImageLoadCallback(null);
  }, []);

  const renderFallbackFrame = useCallback(
    (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = settings.width;
        canvas.height = settings.height;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const emptyBg = isDark ? "#0f0f11" : "#ffffff";
      const emptyText = isDark ? "#52525b" : "#a1a1aa";
      const textPrimary = isDark ? "#ffffff" : "#18181b";
      const textSecondary = isDark ? "#a1a1aa" : "#71717a";

      const activeShapeClips = getActiveShapeClips(allShapeClips, time);
      const activeTextClips = getActiveTextClips(allTextClips, time);

      const videoTracks = timelineTracks.filter(
        (t) => (t.type === "video" || t.type === "image") && !t.hidden,
      );

      const hasVideoContent = videoTracks.some((track) =>
        track.clips.some(
          (clip) =>
            time >= clip.startTime && time < clip.startTime + clip.duration,
        ),
      );

      ctx.fillStyle = hasVideoContent
        ? isDark
          ? "#18181b"
          : "#f4f4f5"
        : emptyBg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let hasRenderedContent = false;

      const allRenderableTracks = timelineTracks
        .map((track, idx) => ({ track, originalIndex: idx }))
        .filter(
          ({ track }) =>
            (track.type === "video" ||
              track.type === "image" ||
              track.type === "text" ||
              track.type === "graphics") &&
            !track.hidden,
        )
        .sort((a, b) => b.originalIndex - a.originalIndex);

      for (const { track } of allRenderableTracks) {
        if (track.type === "video" || track.type === "image") {
          for (const clip of track.clips) {
            const clipStart = clip.startTime;
            const clipEnd = clip.startTime + clip.duration;

            if (time >= clipStart && time < clipEnd) {
              const mediaItem = getMediaItem(clip.mediaId);
              if (mediaItem) {
                hasRenderedContent = true;
                ctx.fillStyle = textPrimary;
                ctx.font = "bold 24px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(
                  mediaItem.name,
                  canvas.width / 2,
                  canvas.height / 2,
                );
                ctx.font = "16px Inter, sans-serif";
                ctx.fillStyle = textSecondary;
                ctx.fillText(
                  `${formatTime(time)} / ${formatTime(clip.duration)}`,
                  canvas.width / 2,
                  canvas.height / 2 + 30,
                );
              } else if ((clip as ClipWithPlaceholder).isPlaceholder) {
                hasRenderedContent = true;
                ctx.fillStyle = textSecondary;
                ctx.font = "bold 20px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(
                  "Drop media here",
                  canvas.width / 2,
                  canvas.height / 2,
                );
                ctx.font = "14px Inter, sans-serif";
                ctx.fillStyle = emptyText;
                ctx.fillText(
                  "Replace this placeholder with your content",
                  canvas.width / 2,
                  canvas.height / 2 + 28,
                );
              }
            }
          }
        } else if (track.type === "graphics") {
          const trackShapeClips = activeShapeClips.filter(
            (sc) => sc.trackId === track.id,
          );
          for (const shapeClip of trackShapeClips) {
            renderShapeClipToCanvas(
              ctx,
              shapeClip,
              canvas.width,
              canvas.height,
              time,
            );
            hasRenderedContent = true;
          }
        } else if (track.type === "text") {
          const trackTextClips = activeTextClips.filter(
            (tc) => tc.trackId === track.id,
          );
          for (const textClip of trackTextClips) {
            renderTextClipToCanvas(
              ctx,
              textClip,
              canvas.width,
              canvas.height,
              time,
            );
            hasRenderedContent = true;
          }
        }
      }

      const activeSubtitles = getActiveSubtitles(allSubtitles, time);
      for (const subtitle of activeSubtitles) {
        renderSubtitleToCanvas(
          ctx,
          subtitle,
          canvas.width,
          canvas.height,
          time,
        );
      }

      const audioTracks = timelineTracks.filter(
        (t) => t.type === "audio" && !t.hidden,
      );
      const hasActiveAudioClip = audioTracks.some((track) =>
        track.clips.some(
          (clip) =>
            time >= clip.startTime && time < clip.startTime + clip.duration,
        ),
      );

      if (
        !hasRenderedContent &&
        activeTextClips.length === 0 &&
        activeShapeClips.length === 0 &&
        !hasActiveAudioClip
      ) {
        ctx.fillStyle = emptyText;
        ctx.font = "24px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          "Import media to get started",
          canvas.width / 2,
          canvas.height / 2,
        );
      }
    },
    [
      timelineTracks,
      getMediaItem,
      settings.width,
      settings.height,
      allTextClips,
      allShapeClips,
      allSubtitles,
      isDark,
    ],
  );

  // Check if we can use native video element playback (much faster, hardware-accelerated)
  const canUseNativeVideoPlayback = useCallback(
    (
      startPosition: number,
    ): {
      canUse: boolean;
      clips: Array<{
        clip: (typeof timelineTracks)[0]["clips"][0];
        mediaItem: NonNullable<ReturnType<typeof getMediaItem>>;
      }>;
      imageClips?: Array<{
        clip: (typeof timelineTracks)[0]["clips"][0];
        trackIndex: number;
      }>;
    } => {
      const tracks = timelineTracks;
      const videoTracks = tracks.filter((t) => t.type === "video" && !t.hidden);

      const allVideoClips: Array<{
        clip: (typeof tracks)[0]["clips"][0];
        mediaItem: NonNullable<ReturnType<typeof getMediaItem>>;
      }> = [];
      const speedEngine = getSpeedEngine();

      for (const track of videoTracks) {
        for (const clip of track.clips) {
          if (clip.startTime + clip.duration > startPosition) {
            const mediaItem = getMediaItem(clip.mediaId);
            if (mediaItem?.blob && mediaItem.type === "video") {
              const clipSpeed = speedEngine.getClipSpeed(clip.id);
              const isReverse = speedEngine.isReverse(clip.id);
              if (clipSpeed !== 1 || isReverse) {
                return { canUse: false, clips: [] };
              }
              allVideoClips.push({ clip, mediaItem });
            }
          }
        }
      }

      if (allVideoClips.length === 0) return { canUse: false, clips: [] };

      allVideoClips.sort((a, b) => a.clip.startTime - b.clip.startTime);

      // Check for overlapping clips (multi-layer) - can't use native playback for compositing
      for (let i = 0; i < allVideoClips.length - 1; i++) {
        const current = allVideoClips[i];
        const next = allVideoClips[i + 1];
        const currentEnd = current.clip.startTime + current.clip.duration;
        if (next.clip.startTime < currentEnd) {
          return { canUse: false, clips: [] };
        }
      }

      // Note: Text/graphics overlays are now supported in native video playback
      // They are rendered using CPU canvas2D after the video frame

      // Collect image clips for background compositing (don't disable native playback)
      const imageTracks = tracks.filter((t) => t.type === "image" && !t.hidden);
      const imageClips: Array<{
        clip: (typeof tracks)[0]["clips"][0];
        trackIndex: number;
      }> = [];
      imageTracks.forEach((track) => {
        const trackIndex = tracks.indexOf(track);
        for (const clip of track.clips) {
          imageClips.push({ clip, trackIndex });
        }
      });

      return { canUse: true, clips: allVideoClips, imageClips };
    },
    [timelineTracks, getMediaItem, allTextClips, allShapeClips],
  );

  // Start native video playback using hardware-accelerated video elements (handles multiple clips)
  const startNativeVideoPlayback = useCallback(
    async (
      clips: Array<{
        clip: (typeof timelineTracks)[0]["clips"][0];
        mediaItem: NonNullable<ReturnType<typeof getMediaItem>>;
      }>,
      imageClips: Array<{
        clip: (typeof timelineTracks)[0]["clips"][0];
        trackIndex: number;
      }>,
      startPosition: number,
      onEnd: () => void,
    ): Promise<() => void> => {
      const canvas = canvasRef.current;
      if (!canvas || clips.length === 0) {
        onEnd();
        return () => {};
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        onEnd();
        return () => {};
      }

      nativePlaybackActiveRef.current = true;

      const imageBitmapCache = new Map<string, ImageBitmap>();
      for (const { clip } of imageClips) {
        const mediaItem = getMediaItem(clip.mediaId);
        if (mediaItem?.type === "image" && mediaItem.blob) {
          try {
            const bitmap = await createImageBitmap(mediaItem.blob);
            imageBitmapCache.set(clip.id, bitmap);
          } catch (error) {
            console.warn(`Failed to cache image bitmap for ${clip.id}:`, error);
          }
        }
      }

      await preDecodeAllAudioBuffers();

      const videoCache = new Map<
        string,
        { video: HTMLVideoElement; url: string }
      >();
      const loadPromises: Promise<void>[] = [];

      for (const { clip, mediaItem } of clips) {
        if (!videoCache.has(clip.mediaId) && mediaItem.blob) {
          const url = URL.createObjectURL(mediaItem.blob);
          const video = document.createElement("video");
          video.src = url;
          video.muted = true;
          video.playsInline = true;
          video.preload = "auto";

          videoCache.set(clip.mediaId, { video, url });

          loadPromises.push(
            new Promise<void>((resolve, reject) => {
              video.onloadedmetadata = () => resolve();
              video.onerror = () =>
                reject(new Error(`Video load failed for ${clip.mediaId}`));
              setTimeout(() => resolve(), 5000); // Don't fail on timeout, just continue
            }),
          );
        }
      }

      await Promise.all(loadPromises);

      const masterClock = getMasterClock();
      masterClock.setDuration(actualEndTime);
      masterClock.seek(startPosition);

      if (!audioGraphRef.current) {
        audioGraphRef.current = getRealtimeAudioGraph();
      }
      const audioGraph = audioGraphRef.current;
      audioGraph.setPreviewMuted(isMuted);

      const tracksWithAudio = timelineTracks.filter(
        (t) => (t.type === "audio" || t.type === "video") && !t.hidden,
      );
      for (const audioTrack of tracksWithAudio) {
        audioGraph.createTrack({
          trackId: audioTrack.id,
          volume: 1,
          pan: 0,
          muted: audioTrack.muted || false,
          solo: audioTrack.solo || false,
          effects: [],
        });
      }

      await audioGraph.resume();
      audioGraph.seekTo(startPosition);
      await masterClock.play();
      audioGraph.startScheduler(() => {
        const tracksWithAudio = timelineTracks.filter(
          (t) => (t.type === "audio" || t.type === "video") && !t.hidden,
        );
        const schedules: AudioClipSchedule[] = [];
        for (const track of tracksWithAudio) {
          for (const audioClip of track.clips) {
            const mediaItem = getMediaItem(audioClip.mediaId);
            const hasAudio =
              mediaItem?.type === "audio" ||
              (mediaItem?.type === "video" &&
                mediaItem?.metadata?.channels &&
                mediaItem.metadata.channels > 0);
            if (!hasAudio) continue;

            const audioBuffer = audioBufferCacheRef.current.get(
              getAudioBufferCacheKey(audioClip.mediaId, audioClip.audioTrackIndex),
            );
            if (audioBuffer) {
              schedules.push({
                clipId: audioClip.id,
                trackId: track.id,
                audioBuffer,
                startTime: audioClip.startTime,
                endTime: audioClip.startTime + audioClip.duration,
                mediaOffset: audioClip.inPoint || 0,
                volume: 1,
                pan: 0,
                effects: [],
                speed: audioClip.speed ?? 1,
              });
            }
          }
        }
        return schedules;
      });

      let isActive = true;
      let rafId: number | null = null;
      let currentClipId: string | null = null;
      // FPS throttle for the native-video render loop. rAF fires at the
      // display refresh rate (typically 60Hz); we skip frames so the canvas
      // composite only runs at the user-chosen FPS. Read previewFpsRef inside
      // the loop so changing the setting takes effect instantly without
      // restarting playback.
      let lastDrawTime = 0;

      const findClipAtTime = (time: number) => {
        for (const { clip, mediaItem } of clips) {
          if (time >= clip.startTime && time < clip.startTime + clip.duration) {
            return { clip, mediaItem };
          }
        }
        return null;
      };

      const drawFrame = async () => {
        if (!isActive || !nativePlaybackActiveRef.current) return;

        // FPS throttle — if not enough time has elapsed since the last
        // composite, schedule another rAF and skip the heavy draw work.
        const nowTs = performance.now();
        const minFrameInterval = 1000 / Math.max(15, Math.min(60, previewFpsRef.current));
        if (nowTs - lastDrawTime < minFrameInterval - 0.5) {
          rafId = requestAnimationFrame(() => { drawFrame(); });
          return;
        }
        lastDrawTime = nowTs;

        const currentPlayhead = masterClock.currentTime;

        if (currentPlayhead >= actualEndTime) {
          cleanup();
          setPlayheadPosition(0);
          startPositionRef.current = 0;
          onEnd();
          return;
        }

        if (!masterClock.isPlaying) {
          cleanup();
          if (!isScrubbingRef.current) {
            onEnd();
          }
          return;
        }

        const activeClip = findClipAtTime(currentPlayhead);

        if (!activeClip) {
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          const sortedImageClipsNoVideo = [...imageClips].sort(
            (a, b) => b.trackIndex - a.trackIndex,
          );
          for (const { clip: imgClip } of sortedImageClipsNoVideo) {
            if (
              currentPlayhead >= imgClip.startTime &&
              currentPlayhead < imgClip.startTime + imgClip.duration
            ) {
              const bitmap = imageBitmapCache.get(imgClip.id);
              if (bitmap) {
                const latestImgClip = (() => {
                  for (const track of timelineTracksRef.current) {
                    const found = track.clips.find((c) => c.id === imgClip.id);
                    if (found) return found;
                  }
                  return imgClip;
                })();
                const imgClipLocalTime = currentPlayhead - imgClip.startTime;
                const imgTransform = getAnimatedTransform(
                  (latestImgClip.transform as ClipTransform) || DEFAULT_TRANSFORM,
                  latestImgClip.keyframes,
                  imgClipLocalTime,
                );
                const imgBlendOpts =
                  latestImgClip.blendMode &&
                  latestImgClip.blendMode !== "normal"
                    ? {
                        blendMode: latestImgClip.blendMode,
                        blendOpacity: latestImgClip.blendOpacity ?? 100,
                      }
                    : undefined;
                drawFrameWithTransform(
                  ctx,
                  bitmap,
                  imgTransform,
                  canvas.width,
                  canvas.height,
                  imgBlendOpts,
                );
              }
            }
          }

          const activeShapeClipsNoVideo = getActiveShapeClips(
            allShapeClipsRef.current,
            currentPlayhead,
          );
          const activeTextClipsNoVideo = getActiveTextClips(
            allTextClipsRef.current,
            currentPlayhead,
          );

          if (activeShapeClipsNoVideo.length > 0 || activeTextClipsNoVideo.length > 0) {
            renderOverlayClipsInTrackOrder(
              ctx,
              timelineTracksRef.current,
              activeShapeClipsNoVideo,
              activeTextClipsNoVideo,
              currentPlayhead,
              canvas.width,
              canvas.height,
              "all",
            );
          }

          const activeSubtitlesNoVideo = getActiveSubtitles(
            allSubtitles,
            currentPlayhead,
          );
          for (const subtitle of activeSubtitlesNoVideo) {
            renderSubtitleToCanvas(
              ctx,
              subtitle,
              canvas.width,
              canvas.height,
              currentPlayhead,
            );
          }

          const nowNoClip = performance.now();
          if (nowNoClip - lastPlayheadUpdateRef.current >= PLAYHEAD_UPDATE_THROTTLE_MS) {
            lastPlayheadUpdateRef.current = nowNoClip;
            setPlayheadPosition(currentPlayhead);
          }
          rafId = requestAnimationFrame(() => { drawFrame(); });
          return;
        }

        const { clip } = activeClip;
        const cached = videoCache.get(clip.mediaId);

        if (!cached) {
          const nowNoCached = performance.now();
          if (nowNoCached - lastPlayheadUpdateRef.current >= PLAYHEAD_UPDATE_THROTTLE_MS) {
            lastPlayheadUpdateRef.current = nowNoCached;
            setPlayheadPosition(currentPlayhead);
          }
          rafId = requestAnimationFrame(() => { drawFrame(); });
          return;
        }

        const { video } = cached;

        if (currentClipId !== clip.id) {
          currentClipId = clip.id;
          if (video.paused) {
            video.play().catch(() => {});
          }
        }

        const clipLocalTime = currentPlayhead - clip.startTime;
        const targetMediaTime = (clip.inPoint || 0) + clipLocalTime;
        const drift = Math.abs(video.currentTime - targetMediaTime);
        if (drift > 0.1) {
          video.currentTime = targetMediaTime;
        }

        const latestClip = (() => {
          for (const track of timelineTracksRef.current) {
            const found = track.clips.find((c) => c.id === clip.id);
            if (found) return found;
          }
          return clip;
        })();

        let transform = getAnimatedTransform(
          (latestClip.transform as ClipTransform) || DEFAULT_TRANSFORM,
          latestClip.keyframes,
          clipLocalTime,
        );

        if (latestClip.emphasisAnimation && latestClip.emphasisAnimation.type !== "none") {
          const emphasisState = applyEmphasisAnimation(
            latestClip.emphasisAnimation,
            clipLocalTime,
          );
          transform = {
            ...transform,
            opacity: transform.opacity * emphasisState.opacity,
            scale: {
              x: transform.scale.x * emphasisState.scale * emphasisState.scaleX,
              y: transform.scale.y * emphasisState.scale * emphasisState.scaleY,
            },
            position: {
              x: transform.position.x + emphasisState.offsetX * canvas.width,
              y: transform.position.y + emphasisState.offsetY * canvas.height,
            },
            rotation: transform.rotation + emphasisState.rotation,
          };
        }

        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Find the track index of the active video clip so we can split image
        // tracks into ones that should render BELOW the video (higher index =
        // further down the timeline = background) and ones ABOVE it (lower
        // index = above the timeline track = foreground). Convention: track[0]
        // is the topmost layer in the preview, matching the timeline UI order.
        const videoTrackIndex = (() => {
          for (let i = 0; i < timelineTracksRef.current.length; i++) {
            const t = timelineTracksRef.current[i];
            if (t.clips.some((c) => c.id === clip.id)) return i;
          }
          return Infinity;
        })();

        const drawActiveImage = (
          imgClip: (typeof imageClips)[0]["clip"],
        ) => {
          if (
            currentPlayhead < imgClip.startTime ||
            currentPlayhead >= imgClip.startTime + imgClip.duration
          ) {
            return;
          }
          const bitmap = imageBitmapCache.get(imgClip.id);
          if (!bitmap) return;
          const latestImgClip = (() => {
            for (const track of timelineTracksRef.current) {
              const found = track.clips.find((c) => c.id === imgClip.id);
              if (found) return found;
            }
            return imgClip;
          })();
          const imgClipLocalTime = currentPlayhead - imgClip.startTime;
          const imgTransform = getAnimatedTransform(
            (latestImgClip.transform as ClipTransform) || DEFAULT_TRANSFORM,
            latestImgClip.keyframes,
            imgClipLocalTime,
          );
          const imgBlendOpts =
            latestImgClip.blendMode && latestImgClip.blendMode !== "normal"
              ? {
                  blendMode: latestImgClip.blendMode,
                  blendOpacity: latestImgClip.blendOpacity ?? 100,
                }
              : undefined;
          drawFrameWithTransform(
            ctx,
            bitmap,
            imgTransform,
            canvas.width,
            canvas.height,
            imgBlendOpts,
          );
        };

        // Images BELOW the video track (higher trackIndex), drawn first,
        // sorted descending so the deepest layer is painted first.
        const imagesBelowVideo = imageClips
          .filter((ic) => ic.trackIndex > videoTrackIndex)
          .sort((a, b) => b.trackIndex - a.trackIndex);
        for (const { clip: imgClip } of imagesBelowVideo) {
          drawActiveImage(imgClip);
        }

        const allShapeClipsData = allShapeClipsRef.current;
        const activeShapeClips = getActiveShapeClips(
          allShapeClipsData,
          currentPlayhead,
        );
        const activeTextClips = getActiveTextClips(
          allTextClipsRef.current,
          currentPlayhead,
        );

        // Forward blendMode + per-clip blendOpacity so the user's Blending
        // section choice composites against the background on the single
        // active-clip path. Without this the inspector reads/writes the
        // blend mode but the canvas would ignore it.
        const singleClipBlendOpts =
          latestClip.blendMode && latestClip.blendMode !== "normal"
            ? {
                blendMode: latestClip.blendMode,
                blendOpacity: latestClip.blendOpacity ?? 100,
              }
            : undefined;
        drawFrameWithTransform(
          ctx,
          video,
          transform,
          canvas.width,
          canvas.height,
          singleClipBlendOpts,
        );

        // Images ABOVE the video track (lower trackIndex), drawn AFTER the
        // video so they appear on top. Sorted descending so the lowest index
        // (topmost in the timeline UI) is painted last — i.e. fully on top.
        const imagesAboveVideo = imageClips
          .filter((ic) => ic.trackIndex < videoTrackIndex)
          .sort((a, b) => b.trackIndex - a.trackIndex);
        for (const { clip: imgClip } of imagesAboveVideo) {
          drawActiveImage(imgClip);
        }

        // Use CPU canvas2D for all overlays - more reliable than GPU compositing
        // Render all text/graphics overlays (they're above the video since backgrounds are separate)
        if (activeShapeClips.length > 0 || activeTextClips.length > 0) {
          renderOverlayClipsInTrackOrder(
            ctx,
            timelineTracksRef.current,
            activeShapeClips,
            activeTextClips,
            currentPlayhead,
            canvas.width,
            canvas.height,
            "all",
          );
        }

        const activeSubtitles = getActiveSubtitles(
          allSubtitles,
          currentPlayhead,
        );
        for (const subtitle of activeSubtitles) {
          renderSubtitleToCanvas(
            ctx,
            subtitle,
            canvas.width,
            canvas.height,
            currentPlayhead,
          );
        }

        const nowPlayhead = performance.now();
        if (nowPlayhead - lastPlayheadUpdateRef.current >= PLAYHEAD_UPDATE_THROTTLE_MS) {
          lastPlayheadUpdateRef.current = nowPlayhead;
          setPlayheadPosition(currentPlayhead);
        }

        rafId = requestAnimationFrame(() => {
          drawFrame();
        });
      };

      const cleanup = () => {
        isActive = false;
        nativePlaybackActiveRef.current = false;
        if (rafId) cancelAnimationFrame(rafId);

        for (const [, { video, url }] of videoCache) {
          video.pause();
          video.src = "";
          URL.revokeObjectURL(url);
        }
        videoCache.clear();

        for (const [, bitmap] of imageBitmapCache) {
          bitmap.close();
        }
        imageBitmapCache.clear();

        videoElementRef.current = null;
        currentVideoMediaIdRef.current = null;
        masterClock.stop();
        audioGraph.stopScheduler();
      };

      rafId = requestAnimationFrame(() => { drawFrame(); });

      return cleanup;
    },
    [
      actualEndTime,
      allSubtitles,
      getMediaItem,
      isMuted,
      preDecodeAllAudioBuffers,
      setPlayheadPosition,
      timelineTracks,
    ],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    if (canvas.width === 0 || canvas.height === 0) {
      canvas.width = settings.width;
      canvas.height = settings.height;
    }

    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      cleanupPlaybackResources();
      cleanupAudioResources();
      return;
    }

    if (actualEndTime <= 0) {
      pause();
      return;
    }

    let isActive = true;
    let nativeCleanup: (() => void) | null = null;
    const playbackStartPosition = startPositionRef.current;

    // While the Preview owns rendering (either native or multi-track loop),
    // tell the controller to skip its per-tick video render. Without this,
    // PlaybackController.renderFrameAtTime() runs in parallel with our own
    // loop, both calling MediaBunny on every clock tick, and the slower
    // controller path starves our fast path of decoder time. This is a
    // major contributor to the multi-track perf bug.
    try {
      const engineState = useEngineStore.getState();
      engineState.playbackController?.setExternalRendererActive(true);
    } catch (e) {
      console.warn("[Preview] Failed to set external renderer flag:", e);
    }

    const findAllClipsAtTime = (time: number) => {
      const tracks = timelineTracksRef.current;
      const results: Array<{
        clip: (typeof tracks)[0]["clips"][0];
        track: (typeof tracks)[0];
        trackIndex: number;
      }> = [];

      tracks.forEach((track, originalIndex) => {
        if (
          (track.type === "video" || track.type === "image") &&
          !track.hidden
        ) {
          for (const clip of track.clips) {
            if (
              time >= clip.startTime &&
              time < clip.startTime + clip.duration
            ) {
              results.push({ clip, track, trackIndex: originalIndex });
            }
          }
        }
      });

      return results.sort((a, b) => a.trackIndex - b.trackIndex);
    };

    const findClipAtTime = (time: number) => {
      const results = findAllClipsAtTime(time);
      return results.length > 0 ? results[0] : null;
    };

    const startPlaybackForClip = async (
      clip: (typeof timelineTracksRef.current)[0]["clips"][0],
      _track: (typeof timelineTracksRef.current)[0],
      timelinePosition: number,
    ) => {
      try {
        const mediaItem = getMediaItem(clip.mediaId);
        if (!mediaItem?.blob) {
          const clipEndTime = clip.startTime + clip.duration;
          const nextResult = findClipAtTime(clipEndTime);
          if (nextResult && clipEndTime < actualEndTime && isActive) {
            startPlaybackForClip(
              nextResult.clip,
              nextResult.track,
              clipEndTime,
            );
          } else {
            pause();
          }
          return;
        }

        try {
          const mediabunny = await import("mediabunny");
          const { Input, ALL_FORMATS, BlobSource, CanvasSink } = mediabunny;

          const input = new Input({
            source: new BlobSource(mediaItem.blob),
            formats: ALL_FORMATS,
          });

          const videoTrack = await input.getPrimaryVideoTrack();
          if (!videoTrack || !isActive) {
            input[Symbol.dispose]?.();
            return;
          }

          const canDecode = await videoTrack.canDecode();
          if (!canDecode || !isActive) {
            input[Symbol.dispose]?.();
            return;
          }

          // Ensure canvas has valid dimensions BEFORE creating CanvasSink
          if (canvas.width === 0 || canvas.height === 0) {
            console.warn(
              "[Preview] Canvas has zero dimensions, setting from project settings",
            );
            canvas.width = settings.width;
            canvas.height = settings.height;
          }

          // Validate final canvas dimensions
          const sinkWidth = canvas.width || settings.width;
          const sinkHeight = canvas.height || settings.height;

          if (sinkWidth === 0 || sinkHeight === 0) {
            console.error(
              "[Preview] Cannot create CanvasSink with zero dimensions",
            );
            input[Symbol.dispose]?.();
            pause();
            return;
          }

          const sink = new CanvasSink(videoTrack, {
            width: sinkWidth,
            height: sinkHeight,
            fit: "contain",
            poolSize: getAdaptivePoolSize(sinkWidth, sinkHeight),
          });

          const speedEngine = getSpeedEngine();
          const clipLocalTime = Math.max(0, timelinePosition - clip.startTime);

          let currentSpeed = speedEngine.getClipSpeed(clip.id);
          let isReverse = speedEngine.isReverse(clip.id);
          let speedSourceClip = clip.id;

          // If video clip has default speed, check for linked audio clip's speed
          if (currentSpeed === 1 && !isReverse) {
            const tracks = timelineTracksRef.current;
            const audioTracks = tracks.filter((t) => t.type === "audio");

            for (const audioTrack of audioTracks) {
              for (const audioClip of audioTrack.clips) {
                if (
                  audioClip.mediaId === clip.mediaId &&
                  Math.abs(audioClip.startTime - clip.startTime) < 0.01
                ) {
                  const linkedSpeed = speedEngine.getClipSpeed(audioClip.id);
                  const linkedReverse = speedEngine.isReverse(audioClip.id);

                  if (linkedSpeed !== 1 || linkedReverse) {
                    currentSpeed = linkedSpeed;
                    isReverse = linkedReverse;
                    speedSourceClip = audioClip.id;
                    break;
                  }
                }
              }
              if (currentSpeed !== 1 || isReverse) break;
            }
          }

          const adjustedLocalTime = speedEngine.getSourceTimeAtPlaybackTime(
            speedSourceClip,
            clipLocalTime,
          );
          const mediaStartTime = (clip.inPoint || 0) + adjustedLocalTime;

          const mediaEndTime = Math.min(
            clip.outPoint || (clip.inPoint || 0) + clip.duration,
            (await videoTrack.computeDuration()) || Infinity,
          );

          await setupAudioFromAudioTrack(timelinePosition);

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            console.error("[Preview] Failed to get 2D context from canvas");
            input[Symbol.dispose]?.();
            return;
          }

          const frameDuration = 1000 / 30;

          let currentMediaTime = mediaStartTime;
          let currentPlayheadTime = timelinePosition;
          let lastFrameTimestamp = performance.now();

          const processNextFrame = async () => {
            if (!isActive) {
              input[Symbol.dispose]?.();
              return;
            }

            try {
              if (currentMediaTime >= mediaEndTime) {
                input[Symbol.dispose]?.();
                cleanupAudioResources();

                const clipEndTime = clip.startTime + clip.duration;
                const nextResult = findClipAtTime(clipEndTime);

                if (nextResult && clipEndTime < actualEndTime && isActive) {
                  setPlayheadPosition(clipEndTime);
                  startPlaybackForClip(
                    nextResult.clip,
                    nextResult.track,
                    clipEndTime,
                  );
                } else if (!isScrubbingRef.current) {
                  setPlayheadPosition(0);
                  startPositionRef.current = 0;
                  pause();
                }
                return;
              }

              const frameResult = await (
                sink as {
                  getCanvas: (time: number) => Promise<{
                    canvas: HTMLCanvasElement | OffscreenCanvas;
                    timestamp: number;
                    duration: number;
                  } | null>;
                }
              ).getCanvas(currentMediaTime);

              if (!frameResult || !frameResult.canvas) {
                console.warn("[Preview] No frame at time", currentMediaTime);
                const skipTime = frameDuration / 1000;
                currentPlayheadTime += skipTime;
                currentMediaTime += skipTime * currentSpeed;
                if (isActive) {
                  animationRef.current =
                    requestAnimationFrame(processNextFrame);
                }
                return;
              }

              const { canvas: frameCanvas, duration } = frameResult;

              const frameWidth = "width" in frameCanvas ? frameCanvas.width : 0;
              const frameHeight =
                "height" in frameCanvas ? frameCanvas.height : 0;
              if (frameWidth === 0 || frameHeight === 0) {
                console.warn("[Preview] Frame has zero dimensions, skipping");
                const skipTime = frameDuration / 1000;
                currentPlayheadTime += skipTime;
                currentMediaTime += skipTime * currentSpeed;
                if (isActive) {
                  animationRef.current =
                    requestAnimationFrame(processNextFrame);
                }
                return;
              }

              const currentPlayhead = currentPlayheadTime;

              if (currentPlayhead >= actualEndTime) {
                if (!isScrubbingRef.current) {
                  setPlayheadPosition(0);
                  startPositionRef.current = 0;
                  pause();
                }
                input[Symbol.dispose]?.();
                return;
              }

              const clipLocalTime = currentPlayhead - clip.startTime;
              let transform = getAnimatedTransform(
                (clip.transform as ClipTransform) || DEFAULT_TRANSFORM,
                clip.keyframes,
                clipLocalTime,
              );

              if (
                clip.emphasisAnimation &&
                clip.emphasisAnimation.type !== "none"
              ) {
                const emphasisState = applyEmphasisAnimation(
                  clip.emphasisAnimation,
                  clipLocalTime,
                );
                transform = {
                  ...transform,
                  opacity: transform.opacity * emphasisState.opacity,
                  scale: {
                    x:
                      transform.scale.x *
                      emphasisState.scale *
                      emphasisState.scaleX,
                    y:
                      transform.scale.y *
                      emphasisState.scale *
                      emphasisState.scaleY,
                  },
                  position: {
                    x:
                      transform.position.x +
                      emphasisState.offsetX * canvas.width,
                    y:
                      transform.position.y +
                      emphasisState.offsetY * canvas.height,
                  },
                  rotation: transform.rotation + emphasisState.rotation,
                };
              }

              let processedFrame:
                | ImageBitmap
                | HTMLCanvasElement
                | OffscreenCanvas = frameCanvas;
              try {
                const frameBitmap = await createImageBitmap(frameCanvas);
                processedFrame = await applyEffectsToFrame(
                  clip.id,
                  frameBitmap,
                );
              } catch {}

              const singleFrameBlend =
                clip.blendMode && clip.blendMode !== "normal"
                  ? {
                      blendMode: clip.blendMode,
                      blendOpacity: clip.blendOpacity ?? 100,
                    }
                  : undefined;

              // WebGPU's renderLayer doesn't honor blendMode, so when the
              // user picked a non-normal mode we composite on CPU even on
              // GPU-capable renderers. Single-clip path so the cost is
              // negligible.
              const useGPU =
                rendererRef.current &&
                rendererRef.current.type === "webgpu" &&
                !singleFrameBlend;

              if (useGPU && processedFrame instanceof ImageBitmap) {
                const gpuResult = await renderFrameWithGPU(
                  rendererRef.current!,
                  processedFrame,
                  transform,
                  canvas.width,
                  canvas.height,
                );
                if (gpuResult) {
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(gpuResult, 0, 0);
                  gpuResult.close();
                } else {
                  ctx.fillStyle = "#000000";
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  drawFrameWithTransform(
                    ctx,
                    processedFrame,
                    transform,
                    canvas.width,
                    canvas.height,
                    singleFrameBlend,
                  );
                }
              } else {
                ctx.fillStyle = "#000000";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                drawFrameWithTransform(
                  ctx,
                  processedFrame,
                  transform,
                  canvas.width,
                  canvas.height,
                  singleFrameBlend,
                );
              }

              const nowPh = performance.now();
              if (nowPh - lastPlayheadUpdateRef.current >= PLAYHEAD_UPDATE_THROTTLE_MS) {
                lastPlayheadUpdateRef.current = nowPh;
                setPlayheadPosition(currentPlayhead);
              }

              const now = performance.now();
              const elapsed = now - lastFrameTimestamp;
              const actualFrameDuration =
                duration > 0 ? duration * 1000 : frameDuration;
              const targetTime = actualFrameDuration / rateRef.current;

              const normalTimeAdvance = actualFrameDuration / 1000;
              const mediaTimeAdvance = normalTimeAdvance * currentSpeed;
              currentPlayheadTime += normalTimeAdvance;
              currentMediaTime += mediaTimeAdvance;

              const delay = Math.max(0, targetTime - elapsed);
              lastFrameTimestamp = now;

              if (isActive) {
                if (delay > 0) {
                  setTimeout(() => {
                    if (isActive) {
                      animationRef.current =
                        requestAnimationFrame(processNextFrame);
                    }
                  }, delay);
                } else {
                  animationRef.current =
                    requestAnimationFrame(processNextFrame);
                }
              }
            } catch (error) {
              console.error("[Preview] Frame error:", error);
              input[Symbol.dispose]?.();
              pause();
            }
          };

          animationRef.current = requestAnimationFrame(processNextFrame);
        } catch (error) {
          console.error("[Preview] MediaBunny setup error:", error);
          pause();
        }
      } catch (outerError) {
        console.error(
          "[Preview] startPlaybackForClip outer error:",
          outerError,
        );
        pause();
      }
    };

    const initClipResources = async (
      clip: (typeof timelineTracksRef.current)[0]["clips"][0],
      trackIndex: number,
    ) => {
      const mediaItem = getMediaItem(clip.mediaId);
      if (!mediaItem?.blob) {
        return null;
      }

      // Images don't need MediaBunny resources - they're rendered directly via createImageBitmap
      if (mediaItem.type === "image") {
        return null;
      }

      // Use the shared decoder pool. If another clip on a different track
      // already acquired this mediaId, we share the same decoder. This is
      // the core fix: 3 video tracks sharing one mp4 hit ONE decoder
      // instead of three independent ones.
      try {
        const pool = getSharedDecoderPool();
        const sinkWidth = settings.width || 1920;
        const sinkHeight = settings.height || 1080;
        const acquired = await pool.acquire(
          clip.mediaId,
          mediaItem.blob,
          sinkWidth,
          sinkHeight,
        );
        if (!acquired) {
          return null;
        }

        return {
          mediaId: clip.mediaId,
          clipId: clip.id,
          trackIndex,
        };
      } catch (error) {
        console.error(
          `[Preview] Failed to init resources for clip ${clip.id}:`,
          error,
        );
        return null;
      }
    };

    const preCacheAllImageBitmaps = async () => {
      const tracks = timelineTracksRef.current;
      const imageTracks = tracks.filter(
        (t) => t.type === "image" && !t.hidden,
      );

      for (const track of imageTracks) {
        for (const clip of track.clips) {
          if (imageBitmapCacheRef.current.has(clip.id)) continue;

          const mediaItem = getMediaItem(clip.mediaId);
          if (mediaItem?.type === "image" && mediaItem.blob) {
            try {
              const bitmap = await createImageBitmap(mediaItem.blob);
              imageBitmapCacheRef.current.set(clip.id, bitmap);
            } catch (error) {
              console.warn(
                `[Preview] Failed to pre-cache image clip ${clip.id}:`,
                error,
              );
            }
          }
        }
      }
    };

    const startMultiTrackPlayback = async () => {
      const initialClips = findAllClipsAtTime(playbackStartPosition);
      const activeTextClips = getActiveTextClips(
        allTextClipsRef.current,
        playbackStartPosition,
      );
      const activeShapeClips = getActiveShapeClips(
        allShapeClipsRef.current,
        playbackStartPosition,
      );

      const audioTracks = timelineTracksRef.current.filter(
        (t) => t.type === "audio" && !t.hidden,
      );
      const hasActiveAudioClip = audioTracks.some((track) =>
        track.clips.some(
          (clip) =>
            playbackStartPosition >= clip.startTime &&
            playbackStartPosition < clip.startTime + clip.duration,
        ),
      );

      const hasAnyVisualContent =
        initialClips.length > 0 ||
        activeTextClips.length > 0 ||
        activeShapeClips.length > 0;
      const hasAnyContent = hasAnyVisualContent || hasActiveAudioClip;

      if (!hasAnyContent && actualEndTime <= 0) {
        pause();
        return;
      }

      await preCacheAllImageBitmaps();

      for (const { clip, trackIndex } of initialClips) {
        if (!playbackResourcesRef.current.has(clip.id)) {
          const resources = await initClipResources(clip, trackIndex);
          if (resources) {
            playbackResourcesRef.current.set(clip.id, resources);
          }
        }
      }

      const hasTextOrShapeContent =
        activeTextClips.length > 0 || activeShapeClips.length > 0;
      if (
        playbackResourcesRef.current.size === 0 &&
        !hasTextOrShapeContent &&
        !hasActiveAudioClip &&
        actualEndTime <= 0
      ) {
        pause();
        return;
      }

      await preDecodeAllAudioBuffers();

      if (!audioGraphRef.current) {
        audioGraphRef.current = getRealtimeAudioGraph();
      }
      const audioGraph = audioGraphRef.current;
      audioGraph.setPreviewMuted(isMuted);

      const tracksWithAudio = timelineTracksRef.current.filter(
        (t) => (t.type === "audio" || t.type === "video") && !t.hidden,
      );
      for (const track of tracksWithAudio) {
        audioGraph.createTrack({
          trackId: track.id,
          volume: 1,
          pan: 0,
          muted: track.muted || false,
          solo: track.solo || false,
          effects: [],
        });
      }

      await audioGraph.resume();

      const mainCtx = canvas.getContext("2d");
      if (!mainCtx) {
        console.error("[Preview] Failed to get 2D context");
        pause();
        return;
      }

      if (
        !offscreenCanvasRef.current ||
        offscreenCanvasRef.current.width !== canvas.width ||
        offscreenCanvasRef.current.height !== canvas.height
      ) {
        offscreenCanvasRef.current = new OffscreenCanvas(
          canvas.width,
          canvas.height,
        );
        offscreenCtxRef.current = offscreenCanvasRef.current.getContext(
          "2d",
        ) as OffscreenCanvasRenderingContext2D;
      }

      const ctx = offscreenCtxRef.current as unknown as CanvasRenderingContext2D;
      if (!ctx) {
        console.error("[Preview] Failed to get offscreen 2D context");
        pause();
        return;
      }

      const masterClock = getMasterClock();
      masterClock.setDuration(actualEndTime);
      masterClock.seek(playbackStartPosition);

      audioGraph.seekTo(playbackStartPosition);
      await masterClock.play();
      audioGraph.startScheduler(getAudioClipsForScheduler);

      // Multi-track render loop self-paces via `liveFrameDuration` computed on
      // every tick from previewFpsRef so the user can change FPS live without
      // restarting playback. See the inline comment near the targetTime calc.
      let lastFrameTimestamp = performance.now();
      let isProcessingFrame = false;

      const processMultiTrackFrame = async () => {
        if (!isActive) {
          cleanupPlaybackResources();
          masterClock.pause();
          return;
        }

        if (isProcessingFrame) {
          return;
        }
        isProcessingFrame = true;

        const currentPlayhead = masterClock.currentTime;

        try {
          if (currentPlayhead >= actualEndTime) {
            isProcessingFrame = false;
            cleanupPlaybackResources();
            cleanupAudioResources();
            masterClock.stop();
            setPlayheadPosition(0);
            startPositionRef.current = 0;
            pause();
            return;
          }

          if (!masterClock.isPlaying) {
            isProcessingFrame = false;
            cleanupPlaybackResources();
            cleanupAudioResources();
            if (!isScrubbingRef.current) {
              pause();
            }
            return;
          }

          const activeClips = findAllClipsAtTime(currentPlayhead);
          const currentTextClips = getActiveTextClips(
            allTextClipsRef.current,
            currentPlayhead,
          );
          const currentShapeClips = getActiveShapeClips(
            allShapeClipsRef.current,
            currentPlayhead,
          );

          const audioTracksForFrame = timelineTracksRef.current.filter(
            (t) => t.type === "audio" && !t.hidden,
          );
          const hasCurrentAudioClip = audioTracksForFrame.some((track) =>
            track.clips.some(
              (clip) =>
                currentPlayhead >= clip.startTime &&
                currentPlayhead < clip.startTime + clip.duration,
            ),
          );

          const hasVisualContent =
            activeClips.length > 0 ||
            currentTextClips.length > 0 ||
            currentShapeClips.length > 0;
          const hasAnyContentAtPlayhead =
            hasVisualContent || hasCurrentAudioClip;

          if (!hasAnyContentAtPlayhead) {
            const nextClipTime = findNextClipStartTime(currentPlayhead);
            const nextTextTime = findNextTextClipStartTime(currentPlayhead);
            const nextShapeTime = findNextShapeClipStartTime(currentPlayhead);
            const nextAudioTime = findNextAudioClipStartTime(currentPlayhead);

            const nextTimes = [
              nextClipTime,
              nextTextTime,
              nextShapeTime,
              nextAudioTime,
            ].filter((t): t is number => t !== null && t < actualEndTime);
            const nextTime =
              nextTimes.length > 0 ? Math.min(...nextTimes) : null;

            if (nextTime !== null) {
              masterClock.seek(nextTime);
              audioGraph.seekTo(nextTime);
              isProcessingFrame = false;
              animationRef.current = requestAnimationFrame(
                processMultiTrackFrame,
              );
              return;
            } else {
              isProcessingFrame = false;
              cleanupPlaybackResources();
              cleanupAudioResources();
              if (!isScrubbingRef.current) {
                masterClock.stop();
                setPlayheadPosition(0);
                startPositionRef.current = 0;
                pause();
              }
              return;
            }
          }

          for (const { clip, trackIndex } of activeClips) {
            if (!playbackResourcesRef.current.has(clip.id)) {
              const resources = await initClipResources(clip, trackIndex);
              if (resources) {
                playbackResourcesRef.current.set(clip.id, resources);
              }
            }
          }

          const activeClipIds = new Set(activeClips.map((c) => c.clip.id));
          {
            const sharedPool = getSharedDecoderPool();
            for (const [clipId, resources] of playbackResourcesRef.current) {
              if (!activeClipIds.has(clipId)) {
                sharedPool.release(resources.mediaId);
                playbackResourcesRef.current.delete(clipId);
              }
            }
          }

          const sortedClips = [...activeClips].sort(
            (a, b) => b.trackIndex - a.trackIndex,
          );

          const imageClipFrames: Array<{
            clip: (typeof sortedClips)[0]["clip"];
            transform: ClipTransform;
            frame: ImageBitmap;
          }> = [];

          const videoClipPromises: Array<
            Promise<{
              clip: (typeof sortedClips)[0]["clip"];
              transform: ClipTransform;
              frame: ImageBitmap | HTMLCanvasElement | OffscreenCanvas;
            } | null>
          > = [];

          for (const { clip, track } of sortedClips) {
            if (!isActive) continue;

            const clipLocalTime = currentPlayhead - clip.startTime;

            let transform = getAnimatedTransform(
              (clip.transform as ClipTransform) || DEFAULT_TRANSFORM,
              clip.keyframes,
              clipLocalTime,
            );

            if (
              clip.emphasisAnimation &&
              clip.emphasisAnimation.type !== "none"
            ) {
              const emphasisState = applyEmphasisAnimation(
                clip.emphasisAnimation,
                clipLocalTime,
              );
              transform = {
                ...transform,
                opacity: transform.opacity * emphasisState.opacity,
                scale: {
                  x:
                    transform.scale.x *
                    emphasisState.scale *
                    emphasisState.scaleX,
                  y:
                    transform.scale.y *
                    emphasisState.scale *
                    emphasisState.scaleY,
                },
                position: {
                  x:
                    transform.position.x + emphasisState.offsetX * canvas.width,
                  y:
                    transform.position.y +
                    emphasisState.offsetY * canvas.height,
                },
                rotation: transform.rotation + emphasisState.rotation,
              };
            }

            if (track.type === "image") {
              const cachedBitmap = imageBitmapCacheRef.current.get(clip.id);
              if (cachedBitmap) {
                imageClipFrames.push({ clip, transform, frame: cachedBitmap });
              }
              continue;
            }

            videoClipPromises.push(
              (async () => {
                const resources = playbackResourcesRef.current.get(clip.id);
                if (!resources) return null;

                const speedEngine = getSpeedEngine();
                const adjustedLocalTime =
                  speedEngine.getSourceTimeAtPlaybackTime(
                    clip.id,
                    clipLocalTime,
                  );
                const mediaTime = (clip.inPoint || 0) + adjustedLocalTime;

                try {
                  // Use the shared pool: multiple clips at the same media
                  // time hit the per-tick cache after the first decode.
                  const frameResult = await getSharedDecoderPool().getFrame(
                    resources.mediaId,
                    mediaTime,
                  );

                  if (!isActive) return null;

                  if (frameResult?.canvas) {
                    let processedFrame:
                      | ImageBitmap
                      | HTMLCanvasElement
                      | OffscreenCanvas = frameResult.canvas;

                    // Effects need an ImageBitmap. We also need an
                    // ImageBitmap when the renderer is WebGPU because the
                    // GPU layer push uses `copyExternalImageToTexture` via
                    // an ImageBitmap-typed param.
                    //
                    // For Canvas2D with no effects we skip the bitmap alloc
                    // — that was the multi-track perf win. With WebGPU,
                    // skipping it caused the GPU branch to drop the frame
                    // (silently filtered by `instanceof ImageBitmap`) and
                    // composite an all-black offscreen → user-visible
                    // BLACK SCREEN regression. So: allocate when WebGPU is
                    // active or when effects are present.
                    const hasEffects =
                      Array.isArray(
                        (clip as { effects?: unknown[] }).effects,
                      ) &&
                      ((clip as { effects?: unknown[] }).effects as unknown[])
                        .length > 0;
                    const useGPUForFrame =
                      rendererRef.current &&
                      rendererRef.current.type === "webgpu";
                    if (hasEffects) {
                      try {
                        const frameBitmap = await createImageBitmap(
                          frameResult.canvas,
                        );
                        processedFrame = await applyEffectsToFrame(
                          clip.id,
                          frameBitmap,
                        );
                      } catch {}
                    } else if (useGPUForFrame) {
                      try {
                        processedFrame = await createImageBitmap(
                          frameResult.canvas,
                        );
                      } catch {
                        // If bitmap allocation fails, fall back to the raw
                        // canvas. The GPU push has a fallback path that
                        // CPU-draws non-ImageBitmap frames.
                      }
                    }

                    return { clip, transform, frame: processedFrame };
                  }
                } catch (error) {
                  const errorMessage =
                    error instanceof Error ? error.message : String(error);
                  if (errorMessage.includes("disposed") || !isActive) {
                    return null;
                  }
                  console.warn(
                    `[Preview] Failed to get frame for clip ${clip.id}:`,
                    error,
                  );
                }
                return null;
              })(),
            );
          }

          const videoFrameResults = await Promise.all(videoClipPromises);
          const validVideoFrames = videoFrameResults.filter(
            (f): f is NonNullable<typeof f> => f !== null,
          );

          const validFrames = [...imageClipFrames, ...validVideoFrames];

          if (
            validFrames.length > 0 ||
            currentTextClips.length > 0 ||
            currentShapeClips.length > 0
          ) {
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const activeShapeClips = getActiveShapeClips(
              allShapeClipsRef.current,
              currentPlayhead,
            );
            const activeTextClips = getActiveTextClips(
              allTextClipsRef.current,
              currentPlayhead,
            );
            const tracks = timelineTracksRef.current;

            const clipToTrackIndex = new Map<string, number>();
            tracks.forEach((track, idx) => {
              if (
                (track.type === "video" || track.type === "image") &&
                !track.hidden
              ) {
                for (const clip of track.clips) {
                  clipToTrackIndex.set(clip.id, idx);
                }
              }
            });

            const allRenderableTracks = tracks
              .map((track, idx) => ({ track, originalIndex: idx }))
              .filter(
                ({ track }) =>
                  (track.type === "video" ||
                    track.type === "image" ||
                    track.type === "text" ||
                    track.type === "graphics") &&
                  !track.hidden,
              )
              .sort((a, b) => b.originalIndex - a.originalIndex);

            // If any active clip uses a non-"normal" blend mode we have to
            // composite on CPU because the WebGPU renderer's RenderLayer
            // interface has no blendMode field. The GPU shader ignores it.
            // Detect once and force the CPU branch below — keeps blending
            // correctness without paying the cost of wiring blend modes
            // through the GPU shader pipeline.
            const anyClipNeedsBlend = validFrames.some(
              (f) =>
                f.clip.blendMode &&
                f.clip.blendMode !== "normal",
            );

            const useGPU =
              rendererRef.current &&
              rendererRef.current.type === "webgpu" &&
              !anyClipNeedsBlend;

            if (useGPU) {
              const gpuLayers: GPULayer[] = [];
              const tempBitmaps: ImageBitmap[] = [];

              for (const { track, originalIndex } of allRenderableTracks) {
                if (track.type === "video") {
                  const trackFrames = validFrames.filter(
                    (f) => clipToTrackIndex.get(f.clip.id) === originalIndex,
                  );
                  for (const { transform, frame, clip } of trackFrames) {
                    const layerBlend =
                      clip.blendMode && clip.blendMode !== "normal"
                        ? {
                            blendMode: clip.blendMode,
                            blendOpacity: clip.blendOpacity ?? 100,
                          }
                        : {};
                    if (frame instanceof ImageBitmap) {
                      gpuLayers.push({
                        bitmap: frame,
                        transform,
                        ...layerBlend,
                      });
                    } else {
                      // Defense in depth: if the video clip's frame is a
                      // raw canvas (e.g. the no-effects perf path) the GPU
                      // texture upload needs an ImageBitmap. Convert here
                      // so the frame isn't silently dropped. This is the
                      // fallback for the BLACK SCREEN regression — the
                      // primary fix allocates the bitmap earlier when
                      // WebGPU is active, but this guards us against any
                      // future path that forgets.
                      try {
                        const bitmap = await createImageBitmap(frame);
                        tempBitmaps.push(bitmap);
                        gpuLayers.push({
                          bitmap,
                          transform,
                          ...layerBlend,
                        });
                      } catch {
                        // Last-resort CPU draw so the user sees frames
                        // rather than a black screen.
                        drawFrameWithTransform(
                          ctx,
                          frame,
                          transform,
                          canvas.width,
                          canvas.height,
                          layerBlend.blendMode ? layerBlend : undefined,
                        );
                      }
                    }
                  }
                } else if (track.type === "image") {
                  const trackFrames = validFrames.filter(
                    (f) => clipToTrackIndex.get(f.clip.id) === originalIndex,
                  );
                  for (const { transform, frame, clip } of trackFrames) {
                    const imgBlend =
                      clip.blendMode && clip.blendMode !== "normal"
                        ? {
                            blendMode: clip.blendMode,
                            blendOpacity: clip.blendOpacity ?? 100,
                          }
                        : undefined;
                    drawFrameWithTransform(
                      ctx,
                      frame,
                      transform,
                      canvas.width,
                      canvas.height,
                      imgBlend,
                    );
                  }
                } else if (track.type === "graphics") {
                  const trackShapeClips = activeShapeClips.filter(
                    (sc) => sc.trackId === track.id,
                  );
                  for (const shapeClip of trackShapeClips) {
                    const offscreen = new OffscreenCanvas(
                      canvas.width,
                      canvas.height,
                    );
                    const offCtx = offscreen.getContext("2d");
                    if (offCtx) {
                      renderShapeClipToCanvas(
                        offCtx as unknown as CanvasRenderingContext2D,
                        shapeClip,
                        canvas.width,
                        canvas.height,
                        currentPlayhead,
                      );
                      const bitmap = await createImageBitmap(offscreen);
                      tempBitmaps.push(bitmap);
                      gpuLayers.push({
                        bitmap,
                        transform: {
                          ...DEFAULT_TRANSFORM,
                          opacity: 1,
                          scale: { x: 1, y: 1 },
                          position: { x: 0, y: 0 },
                          anchor: { x: 0, y: 0 },
                        },
                      });
                    }
                  }
                } else if (track.type === "text") {
                  const trackTextClips = activeTextClips.filter(
                    (tc) => tc.trackId === track.id,
                  );
                  for (const textClip of trackTextClips) {
                    const offscreen = new OffscreenCanvas(
                      canvas.width,
                      canvas.height,
                    );
                    const offCtx = offscreen.getContext("2d");
                    if (offCtx) {
                      renderTextClipToCanvas(
                        offCtx as unknown as CanvasRenderingContext2D,
                        textClip,
                        canvas.width,
                        canvas.height,
                        currentPlayhead,
                      );
                      const bitmap = await createImageBitmap(offscreen);
                      tempBitmaps.push(bitmap);
                      gpuLayers.push({
                        bitmap,
                        transform: {
                          ...DEFAULT_TRANSFORM,
                          opacity: 1,
                          scale: { x: 1, y: 1 },
                          position: { x: 0, y: 0 },
                          anchor: { x: 0, y: 0 },
                        },
                      });
                    }
                  }
                }
              }

              if (gpuLayers.length > 0) {
                const gpuResult = await renderAllLayersWithGPU(
                  rendererRef.current!,
                  gpuLayers,
                  canvas.width,
                  canvas.height,
                );
                if (gpuResult) {
                  ctx.drawImage(gpuResult, 0, 0);
                  gpuResult.close();
                } else {
                  for (const layer of gpuLayers) {
                    const layerBlendOpts = layer.blendMode
                      ? {
                          blendMode: layer.blendMode,
                          blendOpacity: layer.blendOpacity ?? 100,
                        }
                      : undefined;
                    drawFrameWithTransform(
                      ctx,
                      layer.bitmap,
                      layer.transform,
                      canvas.width,
                      canvas.height,
                      layerBlendOpts,
                    );
                  }
                }
              }

              for (const bitmap of tempBitmaps) {
                bitmap.close();
              }
            } else {
              for (const { track, originalIndex } of allRenderableTracks) {
                if (track.type === "video" || track.type === "image") {
                  const trackFrames = validFrames.filter(
                    (f) => clipToTrackIndex.get(f.clip.id) === originalIndex,
                  );
                  for (const { transform, frame, clip } of trackFrames) {
                    const blendOpts =
                      clip.blendMode && clip.blendMode !== "normal"
                        ? {
                            blendMode: clip.blendMode,
                            blendOpacity: clip.blendOpacity ?? 100,
                          }
                        : undefined;
                    drawFrameWithTransform(
                      ctx,
                      frame,
                      transform,
                      canvas.width,
                      canvas.height,
                      blendOpts,
                    );
                  }
                } else if (track.type === "graphics") {
                  const trackShapeClips = activeShapeClips.filter(
                    (sc) => sc.trackId === track.id,
                  );
                  for (const shapeClip of trackShapeClips) {
                    renderShapeClipToCanvas(
                      ctx,
                      shapeClip,
                      canvas.width,
                      canvas.height,
                      currentPlayhead,
                    );
                  }
                } else if (track.type === "text") {
                  const trackTextClips = activeTextClips.filter(
                    (tc) => tc.trackId === track.id,
                  );
                  for (const textClip of trackTextClips) {
                    renderTextClipToCanvas(
                      ctx,
                      textClip,
                      canvas.width,
                      canvas.height,
                      currentPlayhead,
                    );
                  }
                }
              }
            }

            const activeSubtitles = getActiveSubtitles(
              allSubtitlesRef.current,
              currentPlayhead,
            );
            for (const subtitle of activeSubtitles) {
              renderSubtitleToCanvas(
                ctx,
                subtitle,
                canvas.width,
                canvas.height,
                currentPlayhead,
              );
            }

            mainCtx.drawImage(offscreenCanvasRef.current!, 0, 0);
            // Perf-harness probe: count composite commits to the user-visible
            // canvas. This is the multi-track loop's hot spot.
            if (typeof window !== "undefined") {
              const w = window as unknown as { __or_multiTrackFrames?: number };
              w.__or_multiTrackFrames = (w.__or_multiTrackFrames ?? 0) + 1;
            }

            // Snapshot "last good frame" at most once every 250ms — used as a
            // fallback when a future tick has no clips at the playhead. Doing
            // it every frame was a 5-8ms per-frame allocation that dropped
            // multi-track FPS significantly.
            const nowSnap = performance.now();
            if (nowSnap - lastGoodSnapshotAtRef.current > 250) {
              lastGoodSnapshotAtRef.current = nowSnap;
              try {
                lastGoodFrameRef.current?.close();
                lastGoodFrameRef.current = await createImageBitmap(
                  offscreenCanvasRef.current!,
                );
              } catch {}
            }
          } else if (lastGoodFrameRef.current) {
            ctx.drawImage(
              lastGoodFrameRef.current,
              0,
              0,
              canvas.width,
              canvas.height,
            );

            const activeSubtitles = getActiveSubtitles(
              allSubtitlesRef.current,
              currentPlayhead,
            );
            for (const subtitle of activeSubtitles) {
              renderSubtitleToCanvas(
                ctx,
                subtitle,
                canvas.width,
                canvas.height,
                currentPlayhead,
              );
            }

            mainCtx.drawImage(offscreenCanvasRef.current!, 0, 0);
          }

          // End the per-tick frame cache so the next composite step
          // starts with a clean slate. The LRU bound keeps a few prior
          // frames around for fast scrub-back; the in-flight map ensures
          // concurrent same-bucket lookups dedupe even after the tick
          // finishes.
          getSharedDecoderPool().endTick();

          masterClock.reportVideoTime(currentPlayhead);
          const nowMulti = performance.now();
          if (nowMulti - lastPlayheadUpdateRef.current >= PLAYHEAD_UPDATE_THROTTLE_MS) {
            lastPlayheadUpdateRef.current = nowMulti;
            setPlayheadPosition(currentPlayhead);
          }

          const now = performance.now();
          const elapsed = now - lastFrameTimestamp;
          // Re-read FPS each tick so the user can change it live without
          // restarting playback. previewFpsRef is updated by a useEffect that
          // mirrors the persisted settings store value.
          const liveFrameDuration =
            1000 / Math.max(15, Math.min(60, previewFpsRef.current));
          const targetTime = liveFrameDuration / rateRef.current;

          const delay = Math.max(0, targetTime - elapsed);
          lastFrameTimestamp = now;

          isProcessingFrame = false;

          if (isActive) {
            if (delay > 0) {
              setTimeout(() => {
                if (isActive) {
                  animationRef.current = requestAnimationFrame(
                    processMultiTrackFrame,
                  );
                }
              }, delay);
            } else {
              animationRef.current = requestAnimationFrame(
                processMultiTrackFrame,
              );
            }
          }
        } catch (error) {
          isProcessingFrame = false;
          console.error("[Preview] Multi-track frame error:", error);
          cleanupPlaybackResources();
          pause();
        }
      };

      animationRef.current = requestAnimationFrame(processMultiTrackFrame);
    };

    const findNextClipStartTime = (afterTime: number): number | null => {
      const tracks = timelineTracksRef.current;
      const videoTracks = tracks.filter(
        (t) => (t.type === "video" || t.type === "image") && !t.hidden,
      );
      let nextStart: number | null = null;

      for (const track of videoTracks) {
        for (const clip of track.clips) {
          if (clip.startTime > afterTime) {
            if (nextStart === null || clip.startTime < nextStart) {
              nextStart = clip.startTime;
            }
          }
        }
      }

      return nextStart;
    };

    const findNextTextClipStartTime = (afterTime: number): number | null => {
      const textClips = allTextClipsRef.current;
      let nextStart: number | null = null;

      for (const clip of textClips) {
        if (clip.startTime > afterTime) {
          if (nextStart === null || clip.startTime < nextStart) {
            nextStart = clip.startTime;
          }
        }
      }

      return nextStart;
    };

    const findNextShapeClipStartTime = (afterTime: number): number | null => {
      const shapeClips = allShapeClipsRef.current;
      let nextStart: number | null = null;

      for (const clip of shapeClips) {
        if (clip.startTime > afterTime) {
          if (nextStart === null || clip.startTime < nextStart) {
            nextStart = clip.startTime;
          }
        }
      }

      return nextStart;
    };

    const findNextAudioClipStartTime = (afterTime: number): number | null => {
      const tracks = timelineTracksRef.current;
      const audioTracks = tracks.filter((t) => t.type === "audio" && !t.hidden);
      let nextStart: number | null = null;

      for (const track of audioTracks) {
        for (const clip of track.clips) {
          if (clip.startTime > afterTime) {
            if (nextStart === null || clip.startTime < nextStart) {
              nextStart = clip.startTime;
            }
          }
        }
      }

      return nextStart;
    };

    const startPlayback = async () => {
      const nativeCheck = canUseNativeVideoPlayback(playbackStartPosition);

      if (nativeCheck.canUse && nativeCheck.clips.length > 0) {
        try {
          nativeCleanup = await startNativeVideoPlayback(
            nativeCheck.clips,
            nativeCheck.imageClips || [],
            playbackStartPosition,
            () => pause(),
          );
          return nativeCleanup;
        } catch (error) {
          console.warn(
            "[Preview] Native video playback failed, falling back to MediaBunny:",
            error,
          );
        }
      }
      await startMultiTrackPlayback();
    };

    startPlayback().catch((error) => {
      console.error("[Preview] startPlayback error:", error);
    });

    return () => {
      isActive = false;
      nativePlaybackActiveRef.current = false;
      // Restore the controller's own per-tick rendering for the post-play
      // (paused / scrubbing) state. Scrub still wants to call renderFrame.
      try {
        const engineState = useEngineStore.getState();
        engineState.playbackController?.setExternalRendererActive(false);
      } catch {
        // Ignore — controller may be torn down already.
      }
      const masterClock = getMasterClock();
      if (masterClock.isPlaying || masterClock.isPaused) {
        startPositionRef.current = masterClock.currentTime;
      }
      if (nativeCleanup) {
        nativeCleanup();
        nativeCleanup = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (videoElementRef.current) {
        videoElementRef.current.pause();
        videoElementRef.current.src = "";
        videoElementRef.current = null;
      }
      if (videoUrlRef.current) {
        URL.revokeObjectURL(videoUrlRef.current);
        videoUrlRef.current = null;
      }
      masterClock.pause();
      cleanupAudioResources();
    };
  }, [
    isPlaying,
    canUseNativeVideoPlayback,
    startNativeVideoPlayback,
    actualEndTime,
    setPlayheadPosition,
    pause,
    getMediaItem,
    cleanupPlaybackResources,
    cleanupAudioResources,
    setupAudioFromAudioTrack,
    preDecodeAllAudioBuffers,
    getAudioClipsForScheduler,
    isMuted,
    settings.width,
    settings.height,
  ]);

  const lastModifiedAtRef = useRef<number>(project.modifiedAt);

  useEffect(() => {
    if (isPlaying) return;

    // COMPLETELY skip rendering during resize/move interactions
    // The last rendered frame stays visible, preventing black flashing
    if (isInteractingRef.current) {
      lastModifiedAtRef.current = project.modifiedAt;
      return;
    }
    lastModifiedAtRef.current = project.modifiedAt;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderFrame = async () => {
      const rendered = await renderFrameDirectly(playheadPosition);
      if (!rendered) {
        renderFallbackFrame(playheadPosition);
      }
    };

    renderFrame();
  }, [
    playheadPosition,
    isPlaying,
    renderFrameDirectly,
    renderFallbackFrame,
    project.modifiedAt,
    isDark,
  ]);

  const selectedClipId = useMemo(() => {
    const clipSelection = selectedItems.find((item) => item.type === "clip");
    return clipSelection?.id || null;
  }, [selectedItems]);

  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of timelineTracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) return clip;
    }
    return null;
  }, [selectedClipId, timelineTracks]);

  const clipAtPlayhead = useMemo(() => {
    const videoTracks = timelineTracks.filter(
      (t) => (t.type === "video" || t.type === "image") && !t.hidden,
    );
    for (const track of videoTracks) {
      for (const clip of track.clips) {
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;
        if (playheadPosition >= clipStart && playheadPosition < clipEnd) {
          return clip;
        }
      }
    }
    return null;
  }, [timelineTracks, playheadPosition]);

  const selectedTextClipId = useMemo(() => {
    const textClipSelection = selectedItems.find(
      (item) => item.type === "text-clip",
    );
    return textClipSelection?.id || null;
  }, [selectedItems]);

  const selectedTextClip = useMemo<TextClip | null>(() => {
    if (!selectedTextClipId) return null;
    return allTextClips.find((clip) => clip.id === selectedTextClipId) || null;
  }, [selectedTextClipId, allTextClips]);

  const activeTextClip = selectedTextClip;

  const clipBounds = useMemo(() => {
    const clip = selectedClip || clipAtPlayhead;
    if (!clip || !canvasRef.current || !overlayRef.current) return null;

    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const overlayRect = overlay.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const clipTransform = clip.transform || {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      opacity: 1,
      anchor: { x: 0.5, y: 0.5 },
    };

    const transform = liveTransform
      ? {
          ...clipTransform,
          position: liveTransform.position,
          scale: liveTransform.scale,
        }
      : clipTransform;

    const canvasWidth = settings.width;
    const canvasHeight = settings.height;

    const canvasAspect = canvasWidth / canvasHeight;
    const elementAspect = canvasRect.width / canvasRect.height;

    let actualWidth: number;
    let actualHeight: number;
    let letterboxOffsetX = 0;
    let letterboxOffsetY = 0;

    if (elementAspect > canvasAspect) {
      actualHeight = canvasRect.height;
      actualWidth = actualHeight * canvasAspect;
      letterboxOffsetX = (canvasRect.width - actualWidth) / 2;
    } else {
      actualWidth = canvasRect.width;
      actualHeight = actualWidth / canvasAspect;
      letterboxOffsetY = (canvasRect.height - actualHeight) / 2;
    }

    const displayScale = actualWidth / canvasWidth;

    const clipWidth = canvasWidth * transform.scale.x * displayScale;
    const clipHeight = canvasHeight * transform.scale.y * displayScale;

    const offsetX = transform.position.x * displayScale;
    const offsetY = transform.position.y * displayScale;

    const canvasOffsetX = canvasRect.left - overlayRect.left + letterboxOffsetX;
    const canvasOffsetY = canvasRect.top - overlayRect.top + letterboxOffsetY;

    const centerX = canvasOffsetX + actualWidth / 2 + offsetX;
    const centerY = canvasOffsetY + actualHeight / 2 + offsetY;

    return {
      x: centerX - clipWidth / 2,
      y: centerY - clipHeight / 2,
      width: clipWidth,
      height: clipHeight,
      centerX,
      centerY,
      displayScale,
    };
  }, [
    selectedClip,
    clipAtPlayhead,
    settings.width,
    settings.height,
    canvasSize,
    liveTransform,
  ]);

  const textClipBounds = useMemo(() => {
    if (!selectedTextClip || !canvasRef.current || !overlayRef.current)
      return null;

    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const overlayRect = overlay.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const { transform, style, text } = selectedTextClip;

    const canvasWidth = settings.width;
    const canvasHeight = settings.height;

    const canvasAspect = canvasWidth / canvasHeight;
    const elementAspect = canvasRect.width / canvasRect.height;

    let actualWidth: number;
    let actualHeight: number;
    let letterboxOffsetX = 0;
    let letterboxOffsetY = 0;

    if (elementAspect > canvasAspect) {
      actualHeight = canvasRect.height;
      actualWidth = actualHeight * canvasAspect;
      letterboxOffsetX = (canvasRect.width - actualWidth) / 2;
    } else {
      actualWidth = canvasRect.width;
      actualHeight = actualWidth / canvasAspect;
      letterboxOffsetY = (canvasRect.height - actualHeight) / 2;
    }

    const displayScale = actualWidth / canvasWidth;

    const lines = text.split("\n");
    const lineHeight = style.fontSize * style.lineHeight;
    const estimatedHeight = lines.length * lineHeight;
    const estimatedWidth =
      style.fontSize * Math.max(...lines.map((l) => l.length)) * 0.6;

    const textWidth = estimatedWidth * transform.scale.x * displayScale;
    const textHeight = estimatedHeight * transform.scale.y * displayScale;

    const posX = transform.position.x * canvasWidth * displayScale;
    const posY = transform.position.y * canvasHeight * displayScale;

    const canvasOffsetX = canvasRect.left - overlayRect.left + letterboxOffsetX;
    const canvasOffsetY = canvasRect.top - overlayRect.top + letterboxOffsetY;

    const centerX = canvasOffsetX + posX;
    const centerY = canvasOffsetY + posY;

    return {
      x: centerX - textWidth / 2,
      y: centerY - textHeight / 2,
      width: textWidth,
      height: textHeight,
      centerX,
      centerY,
      displayScale,
      isTextClip: true,
    };
  }, [selectedTextClip, settings.width, settings.height, canvasSize]);

  const selectedShapeClipId = useMemo(() => {
    const shapeClipSelection = selectedItems.find(
      (item) => item.type === "shape-clip",
    );
    return shapeClipSelection?.id || null;
  }, [selectedItems]);

  const selectedShapeClip = useMemo<
    ShapeClip | SVGClip | StickerClip | null
  >(() => {
    if (!selectedShapeClipId) return null;
    return (
      allShapeClips.find((clip) => clip.id === selectedShapeClipId) || null
    );
  }, [selectedShapeClipId, allShapeClips]);

  const activeShapeClip = selectedShapeClip;

  const [hoveredGraphicClipId, setHoveredGraphicClipId] = useState<string | null>(null);

  const activeGraphicClips = useMemo(() => {
    // getActiveShapeClips returns all graphic clip types (shapes, SVGs, and stickers)
    return getActiveShapeClips(allShapeClips, playheadPosition);
  }, [allShapeClips, playheadPosition]);

  const shapeClipBounds = useMemo(() => {
    if (!selectedShapeClip || !canvasRef.current || !overlayRef.current)
      return null;

    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const overlayRect = overlay.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const { transform } = selectedShapeClip;
    const shapeSize = 200;

    const canvasWidth = settings.width;
    const canvasHeight = settings.height;

    const canvasAspect = canvasWidth / canvasHeight;
    const elementAspect = canvasRect.width / canvasRect.height;

    let actualWidth: number;
    let actualHeight: number;
    let letterboxOffsetX = 0;
    let letterboxOffsetY = 0;

    if (elementAspect > canvasAspect) {
      actualHeight = canvasRect.height;
      actualWidth = actualHeight * canvasAspect;
      letterboxOffsetX = (canvasRect.width - actualWidth) / 2;
    } else {
      actualWidth = canvasRect.width;
      actualHeight = actualWidth / canvasAspect;
      letterboxOffsetY = (canvasRect.height - actualHeight) / 2;
    }

    const displayScale = actualWidth / canvasWidth;

    const shapeWidth = shapeSize * transform.scale.x * displayScale;
    const shapeHeight = shapeSize * transform.scale.y * displayScale;

    const posX = transform.position.x * canvasWidth * displayScale;
    const posY = transform.position.y * canvasHeight * displayScale;

    const canvasOffsetX = canvasRect.left - overlayRect.left + letterboxOffsetX;
    const canvasOffsetY = canvasRect.top - overlayRect.top + letterboxOffsetY;

    const centerX = canvasOffsetX + posX;
    const centerY = canvasOffsetY + posY;

    return {
      x: centerX - shapeWidth / 2,
      y: centerY - shapeHeight / 2,
      width: shapeWidth,
      height: shapeHeight,
      centerX,
      centerY,
      displayScale,
      isShapeClip: true,
    };
  }, [selectedShapeClip, settings.width, settings.height, canvasSize]);

  const getGraphicClipDisplayBounds = useCallback(
    (clip: ShapeClip | SVGClip | StickerClip) => {
      if (!canvasRef.current || !overlayRef.current) return null;

      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      const overlayRect = overlay.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();

      const { transform } = clip;
      // Approximation of the displayed clip size in canvas-coordinate units,
      // consistent with the value used in shapeClipBounds for the resize overlay.
      const shapeSize = 200;

      const canvasWidth = settings.width;
      const canvasHeight = settings.height;

      const canvasAspect = canvasWidth / canvasHeight;
      const elementAspect = canvasRect.width / canvasRect.height;

      let actualWidth: number;
      let actualHeight: number;
      let letterboxOffsetX = 0;
      let letterboxOffsetY = 0;

      if (elementAspect > canvasAspect) {
        actualHeight = canvasRect.height;
        actualWidth = actualHeight * canvasAspect;
        letterboxOffsetX = (canvasRect.width - actualWidth) / 2;
      } else {
        actualWidth = canvasRect.width;
        actualHeight = actualWidth / canvasAspect;
        letterboxOffsetY = (canvasRect.height - actualHeight) / 2;
      }

      const displayScale = actualWidth / canvasWidth;

      const shapeWidth = shapeSize * transform.scale.x * displayScale;
      const shapeHeight = shapeSize * transform.scale.y * displayScale;

      const posX = transform.position.x * canvasWidth * displayScale;
      const posY = transform.position.y * canvasHeight * displayScale;

      const canvasOffsetX = canvasRect.left - overlayRect.left + letterboxOffsetX;
      const canvasOffsetY = canvasRect.top - overlayRect.top + letterboxOffsetY;

      const centerX = canvasOffsetX + posX;
      const centerY = canvasOffsetY + posY;

      return {
        x: centerX - shapeWidth / 2,
        y: centerY - shapeHeight / 2,
        width: shapeWidth,
        height: shapeHeight,
        centerX,
        centerY,
      };
    },
    [settings.width, settings.height],
  );

  const findGraphicClipAtPoint = useCallback(
    (clientX: number, clientY: number): ShapeClip | SVGClip | StickerClip | null => {
      if (!overlayRef.current) return null;
      const overlayRect = overlayRef.current.getBoundingClientRect();
      const pointX = clientX - overlayRect.left;
      const pointY = clientY - overlayRect.top;

      for (let i = activeGraphicClips.length - 1; i >= 0; i--) {
        const clip = activeGraphicClips[i];
        const bounds = getGraphicClipDisplayBounds(clip);
        if (!bounds) continue;

        if (
          pointX >= bounds.x &&
          pointX <= bounds.x + bounds.width &&
          pointY >= bounds.y &&
          pointY <= bounds.y + bounds.height
        ) {
          return clip;
        }
      }
      return null;
    },
    [activeGraphicClips, getGraphicClipDisplayBounds],
  );

  const selectedSubtitleId = useMemo(() => {
    const subtitleSelection = selectedItems.find(
      (item) => item.type === "subtitle",
    );
    return subtitleSelection?.id || null;
  }, [selectedItems]);

  const selectedSubtitleObj = useMemo<Subtitle | null>(() => {
    if (!selectedSubtitleId) return null;
    return allSubtitles.find((sub) => sub.id === selectedSubtitleId) || null;
  }, [selectedSubtitleId, allSubtitles]);

  const subtitleBounds = useMemo(() => {
    if (!selectedSubtitleObj || !canvasRef.current || !overlayRef.current)
      return null;
    if (
      playheadPosition < selectedSubtitleObj.startTime ||
      playheadPosition >= selectedSubtitleObj.endTime
    )
      return null;

    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const overlayRect = overlay.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const fontSize = selectedSubtitleObj.style?.fontSize || 24;
    const position = selectedSubtitleObj.style?.position || "bottom";
    const lines = selectedSubtitleObj.text.split("\n");
    const lineHeight = fontSize * 1.3;
    const totalHeight = lines.length * lineHeight;

    const canvasWidth = settings.width;
    const canvasHeight = settings.height;

    const canvasAspect = canvasWidth / canvasHeight;
    const elementAspect = canvasRect.width / canvasRect.height;

    let actualWidth: number;
    let actualHeight: number;
    let letterboxOffsetX = 0;
    let letterboxOffsetY = 0;

    if (elementAspect > canvasAspect) {
      actualHeight = canvasRect.height;
      actualWidth = actualHeight * canvasAspect;
      letterboxOffsetX = (canvasRect.width - actualWidth) / 2;
    } else {
      actualWidth = canvasRect.width;
      actualHeight = actualWidth / canvasAspect;
      letterboxOffsetY = (canvasRect.height - actualHeight) / 2;
    }

    const displayScale = actualWidth / canvasWidth;

    let baseY: number;
    if (position === "top") {
      baseY = fontSize * 2;
    } else if (position === "center") {
      baseY = canvasHeight / 2 - totalHeight / 2;
    } else {
      baseY = canvasHeight - fontSize * 2 - totalHeight;
    }

    const subtitleWidth = canvasWidth * 0.8 * displayScale;
    const subtitleHeight = totalHeight * displayScale;

    const canvasOffsetX = canvasRect.left - overlayRect.left + letterboxOffsetX;
    const canvasOffsetY = canvasRect.top - overlayRect.top + letterboxOffsetY;

    const centerX = canvasOffsetX + actualWidth / 2;
    const topY = canvasOffsetY + baseY * displayScale;

    return {
      x: centerX - subtitleWidth / 2,
      y: topY,
      width: subtitleWidth,
      height: subtitleHeight,
      centerX,
      centerY: topY + subtitleHeight / 2,
      displayScale,
    };
  }, [
    selectedSubtitleObj,
    settings.width,
    settings.height,
    canvasSize,
    playheadPosition,
  ]);

  const handleHandleMouseDown = useCallback(
    (e: React.MouseEvent, handle: HandlePosition) => {
      e.stopPropagation();
      e.preventDefault();

      const clip = selectedClip || clipAtPlayhead;
      if (!clip) return;

      const transform = clip.transform || {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        opacity: 1,
        anchor: { x: 0.5, y: 0.5 },
      };

      isInteractingRef.current = true;
      setInteractionMode("resize");
      setActiveHandle(handle);
      interactionStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        transform: {
          x: transform.position.x,
          y: transform.position.y,
          scaleX: transform.scale.x,
          scaleY: transform.scale.y,
          rotation: transform.rotation || 0,
        },
      };
    },
    [selectedClip, clipAtPlayhead],
  );

  const handleClipMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const clip = selectedClip || clipAtPlayhead;
      if (!clip) return;

      const transform = clip.transform || {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        opacity: 1,
        anchor: { x: 0.5, y: 0.5 },
      };

      isInteractingRef.current = true;
      setInteractionMode("move");
      interactionStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        transform: {
          x: transform.position.x,
          y: transform.position.y,
          scaleX: transform.scale.x,
          scaleY: transform.scale.y,
          rotation: transform.rotation || 0,
        },
      };
    },
    [selectedClip, clipAtPlayhead],
  );

  const handleTextClipMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (!activeTextClip) return;

      const { transform } = activeTextClip;

      isInteractingRef.current = true;
      setInteractionMode("move");
      setInteractionTargetType("text-clip");
      interactionTargetIdRef.current = activeTextClip.id;
      interactionStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        transform: {
          x: transform.position.x,
          y: transform.position.y,
          scaleX: transform.scale.x,
          scaleY: transform.scale.y,
          rotation: transform.rotation || 0,
        },
      };
    },
    [activeTextClip],
  );

  const handleTextHandleMouseDown = useCallback(
    (e: React.MouseEvent, handle: HandlePosition) => {
      e.stopPropagation();
      e.preventDefault();

      if (!activeTextClip) return;

      const { transform } = activeTextClip;

      isInteractingRef.current = true;
      setInteractionMode("resize");
      setActiveHandle(handle);
      setInteractionTargetType("text-clip");
      interactionTargetIdRef.current = activeTextClip.id;
      interactionStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        transform: {
          x: transform.position.x,
          y: transform.position.y,
          scaleX: transform.scale.x,
          scaleY: transform.scale.y,
          rotation: transform.rotation || 0,
        },
      };
    },
    [activeTextClip],
  );

  // Rotation handle — text clips spin around their bounding-box center.
  // Captures the pointer angle at mousedown relative to the box center, then
  // every move delta in angle is added to the start rotation. RAF-batched
  // through the existing pendingTransformRef path so we don't write to
  // Zustand 60+ times per second.
  const handleTextRotateMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!activeTextClip || !textClipBounds) return;

      const { transform } = activeTextClip;
      const cx = textClipBounds.x + textClipBounds.width / 2;
      const cy = textClipBounds.y + textClipBounds.height / 2;
      const startAngle =
        (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
      const startRotation = transform.rotation || 0;

      isInteractingRef.current = true;
      setInteractionMode("rotate");
      setInteractionTargetType("text-clip");
      interactionTargetIdRef.current = activeTextClip.id;
      interactionStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        transform: {
          x: transform.position.x,
          y: transform.position.y,
          scaleX: transform.scale.x,
          scaleY: transform.scale.y,
          rotation: startRotation - startAngle, // stash startAngle into rotation
        },
      };
    },
    [activeTextClip, textClipBounds],
  );

  const handleShapeClipMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (!activeShapeClip) return;

      const { transform } = activeShapeClip;

      isInteractingRef.current = true;
      setInteractionMode("move");
      setInteractionTargetType("shape-clip");
      interactionTargetIdRef.current = activeShapeClip.id;
      interactionStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        transform: {
          x: transform.position.x,
          y: transform.position.y,
          scaleX: transform.scale.x,
          scaleY: transform.scale.y,
          rotation: transform.rotation || 0,
        },
      };
    },
    [activeShapeClip],
  );

  const handleShapeHandleMouseDown = useCallback(
    (e: React.MouseEvent, handle: HandlePosition) => {
      e.stopPropagation();
      e.preventDefault();

      if (!activeShapeClip) return;

      const { transform } = activeShapeClip;

      isInteractingRef.current = true;
      setInteractionMode("resize");
      setActiveHandle(handle);
      setInteractionTargetType("shape-clip");
      interactionTargetIdRef.current = activeShapeClip.id;
      interactionStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        transform: {
          x: transform.position.x,
          y: transform.position.y,
          scaleX: transform.scale.x,
          scaleY: transform.scale.y,
          rotation: transform.rotation || 0,
        },
      };
    },
    [activeShapeClip],
  );

  const handleGraphicsMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (interactionMode !== "none") {
        setHoveredGraphicClipId(null);
        return;
      }

      const clip = findGraphicClipAtPoint(e.clientX, e.clientY);
      setHoveredGraphicClipId(clip ? clip.id : null);
    },
    [interactionMode, findGraphicClipAtPoint],
  );

  const handleGraphicsClick = useCallback(
    (e: React.MouseEvent) => {
      if (interactionMode !== "none") return;

      // 1) Graphic clip (shape / SVG / sticker) hit-test — uses each clip's
      // own display bounds. Wins over media because graphics are always on
      // top in the composite.
      const graphicClip = findGraphicClipAtPoint(e.clientX, e.clientY);
      if (graphicClip) {
        select({ type: "shape-clip", id: graphicClip.id });
        e.stopPropagation();
        return;
      }

      // 2) Text-clip hit-test — for each active text clip at the current
      // time, compute an approximate bbox from `transform.position` +
      // estimated width (fontSize × content length × 0.6). Iterate top-
      // to-bottom in titleEngine order; newest text clips (typically the
      // ones the user just added) tend to be later so they win ties.
      // This is an approximation — we don't have real glyph metrics for
      // multi-line / wrapped text — but it's much better than treating
      // text overlays as unclickable.
      if (canvasRef.current && overlayRef.current) {
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        const overlayRect = overlay.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const pointX = e.clientX - overlayRect.left;
        const pointY = e.clientY - overlayRect.top;

        const canvasWidth = settings.width;
        const canvasHeight = settings.height;
        const canvasAspect = canvasWidth / canvasHeight;
        const elementAspect = canvasRect.width / canvasRect.height;

        let actualWidth: number;
        let actualHeight: number;
        let letterboxOffsetX = 0;
        let letterboxOffsetY = 0;
        if (elementAspect > canvasAspect) {
          actualHeight = canvasRect.height;
          actualWidth = actualHeight * canvasAspect;
          letterboxOffsetX = (canvasRect.width - actualWidth) / 2;
        } else {
          actualWidth = canvasRect.width;
          actualHeight = actualWidth / canvasAspect;
          letterboxOffsetY = (canvasRect.height - actualHeight) / 2;
        }
        const dispScale = actualWidth / canvasWidth;
        const canvasOffsetX = canvasRect.left - overlayRect.left + letterboxOffsetX;
        const canvasOffsetY = canvasRect.top - overlayRect.top + letterboxOffsetY;

        const time = playheadPosition;
        // Iterate in reverse so the most-recently-added text clip wins
        // when stacked.
        for (let i = allTextClips.length - 1; i >= 0; i--) {
          const tc = allTextClips[i];
          if (time < tc.startTime || time >= tc.startTime + tc.duration)
            continue;
          const { transform, style, text } = tc;
          const lines = text.split("\n");
          const lineHeight = style.fontSize * style.lineHeight;
          const estH = lines.length * lineHeight;
          const longestLine = Math.max(...lines.map((l) => l.length));
          const estW = style.fontSize * longestLine * 0.6;

          const textW = estW * transform.scale.x * dispScale;
          const textH = estH * transform.scale.y * dispScale;
          const posX = transform.position.x * canvasWidth * dispScale;
          const posY = transform.position.y * canvasHeight * dispScale;
          const centerX = canvasOffsetX + posX;
          const centerY = canvasOffsetY + posY;
          // Use a generous bbox — text rendering centers vertically on
          // baseline so add a small vertical pad so users hitting near
          // the descender row still register a click.
          const padY = Math.max(8, style.fontSize * 0.15 * dispScale);
          const minX = centerX - textW / 2;
          const maxX = centerX + textW / 2;
          const minY = centerY - textH / 2 - padY;
          const maxY = centerY + textH / 2 + padY;
          if (pointX >= minX && pointX <= maxX && pointY >= minY && pointY <= maxY) {
            select({ type: "text-clip", id: tc.id });
            e.stopPropagation();
            return;
          }
        }
      }

      // 3) Media-clip fallback — pick the top-most visible video / image
      // clip at the current playhead time. Most users see a full-canvas
      // video and expect "click anywhere in the preview to select that
      // clip." Track order is z-order: tracks[0] is on top in the preview
      // composite (per the layer-order fix), so we walk forward.
      //
      // We now respect each clip's transform (scale / position) for a
      // tighter bbox so clicks outside the visible region of a transformed
      // clip don't select it.
      const time = playheadPosition;
      const tracks = project.timeline.tracks;
      let bboxOverlayRect: DOMRect | null = null;
      let bboxCanvasRect: DOMRect | null = null;
      let bboxDispScale = 1;
      let bboxCanvasOffsetX = 0;
      let bboxCanvasOffsetY = 0;
      if (canvasRef.current && overlayRef.current) {
        bboxOverlayRect = overlayRef.current.getBoundingClientRect();
        bboxCanvasRect = canvasRef.current.getBoundingClientRect();
        const canvasWidth = settings.width;
        const canvasHeight = settings.height;
        const canvasAspect = canvasWidth / canvasHeight;
        const elementAspect = bboxCanvasRect.width / bboxCanvasRect.height;
        let actualWidth: number;
        let letterboxOffsetX = 0;
        let letterboxOffsetY = 0;
        if (elementAspect > canvasAspect) {
          const actualHeight = bboxCanvasRect.height;
          actualWidth = actualHeight * canvasAspect;
          letterboxOffsetX = (bboxCanvasRect.width - actualWidth) / 2;
        } else {
          actualWidth = bboxCanvasRect.width;
          const actualHeight = actualWidth / canvasAspect;
          letterboxOffsetY = (bboxCanvasRect.height - actualHeight) / 2;
        }
        bboxDispScale = actualWidth / canvasWidth;
        bboxCanvasOffsetX =
          bboxCanvasRect.left - bboxOverlayRect.left + letterboxOffsetX;
        bboxCanvasOffsetY =
          bboxCanvasRect.top - bboxOverlayRect.top + letterboxOffsetY;
      }
      const pointX = bboxOverlayRect
        ? e.clientX - bboxOverlayRect.left
        : null;
      const pointY = bboxOverlayRect
        ? e.clientY - bboxOverlayRect.top
        : null;
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        const visible = track.clips.find(
          (c) => time >= c.startTime && time < c.startTime + c.duration,
        );
        if (!visible) continue;
        // Skip audio-only clips (nothing to click on visually).
        const mediaItem = getMediaItem(visible.mediaId);
        if (mediaItem?.type === "audio") continue;

        // Tighter bbox: respect transform. Default scale=1, position=(0,0)
        // means full canvas; transformed clips shrink/move and we honor
        // that here so off-clip clicks don't select.
        if (
          pointX !== null &&
          pointY !== null &&
          bboxCanvasRect &&
          mediaItem
        ) {
          const t = visible.transform;
          const canvasW = settings.width;
          const canvasH = settings.height;
          const scaleX = t.scale?.x ?? 1;
          const scaleY = t.scale?.y ?? 1;
          // Crop region — applied after scale. Default is full clip.
          const crop = t.crop ?? { x: 0, y: 0, width: 1, height: 1 };
          // Clip width/height in canvas pixels (post-scale, post-crop).
          const clipW = canvasW * scaleX * crop.width;
          const clipH = canvasH * scaleY * crop.height;
          const posX = (t.position?.x ?? 0) * bboxDispScale;
          const posY = (t.position?.y ?? 0) * bboxDispScale;
          const centerX = bboxCanvasOffsetX + canvasW * 0.5 * bboxDispScale + posX;
          const centerY = bboxCanvasOffsetY + canvasH * 0.5 * bboxDispScale + posY;
          const halfW = (clipW * bboxDispScale) / 2;
          const halfH = (clipH * bboxDispScale) / 2;
          if (
            pointX < centerX - halfW ||
            pointX > centerX + halfW ||
            pointY < centerY - halfH ||
            pointY > centerY + halfH
          ) {
            continue;
          }
        }

        select({ type: "clip", id: visible.id });
        e.stopPropagation();
        return;
      }
    },
    [
      interactionMode,
      findGraphicClipAtPoint,
      select,
      playheadPosition,
      project.timeline.tracks,
      getMediaItem,
      allTextClips,
      settings.width,
      settings.height,
    ],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (interactionMode === "none" || !interactionStartRef.current) return;

      if (
        interactionTargetType === "text-clip" &&
        textClipBounds &&
        activeTextClip
      ) {
        const deltaX = e.clientX - interactionStartRef.current.x;
        const deltaY = e.clientY - interactionStartRef.current.y;
        const { displayScale } = textClipBounds;

        let newTransform: {
          position?: { x: number; y: number };
          scale?: { x: number; y: number };
          rotation?: number;
        } = {};

        if (interactionMode === "move") {
          const newX =
            interactionStartRef.current.transform.x +
            deltaX / displayScale / settings.width;
          const newY =
            interactionStartRef.current.transform.y +
            deltaY / displayScale / settings.height;
          newTransform = { position: { x: newX, y: newY } };
        } else if (interactionMode === "resize" && activeHandle) {
          const startTransform = interactionStartRef.current.transform;
          let newScaleX = startTransform.scaleX;
          let newScaleY = startTransform.scaleY;

          const scaleDeltaX = deltaX / displayScale / 100;
          const scaleDeltaY = deltaY / displayScale / 100;

          switch (activeHandle) {
            case "e":
            case "se":
            case "ne":
              newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
              if (lockAspectRatio) newScaleY = newScaleX;
              break;
            case "w":
            case "sw":
            case "nw":
              newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
              if (lockAspectRatio) newScaleY = newScaleX;
              break;
            case "s":
              newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
              if (lockAspectRatio) newScaleX = newScaleY;
              break;
            case "n":
              newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
              if (lockAspectRatio) newScaleX = newScaleY;
              break;
          }

          newTransform = {
            position: { x: startTransform.x, y: startTransform.y },
            scale: { x: newScaleX, y: newScaleY },
          };
        } else if (interactionMode === "rotate") {
          // startTransform.rotation has been encoded as `startRotation - startAngle`
          // (see handleTextRotateMouseDown). Current pointer angle relative to
          // box center → final rotation = stash + currentAngle.
          const cx = textClipBounds.x + textClipBounds.width / 2;
          const cy = textClipBounds.y + textClipBounds.height / 2;
          const currentAngle =
            (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
          // Hold Shift to snap to 15° increments — matches Figma / Photoshop.
          let nextRotation =
            interactionStartRef.current.transform.rotation + currentAngle;
          if (e.shiftKey) {
            nextRotation = Math.round(nextRotation / 15) * 15;
          }
          // Normalize to (-180, 180]
          nextRotation = ((nextRotation + 180) % 360 + 360) % 360 - 180;
          newTransform = { rotation: nextRotation };
        }

        // Real-time visual feedback: stash the most recent transform in a
        // ref so handleMouseUp can flush it on release. RAF-batch the store
        // update at one-per-frame so the overlay border & canvas glyph stay
        // pinned to the pointer with no perceptible lag (vs the prior 32 ms
        // throttle which queued ~half a frame of stale renders).
        pendingTextTransformRef.current = {
          clipId: interactionTargetIdRef.current!,
          transform: newTransform,
        };
        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(() => {
            const pending = pendingTextTransformRef.current;
            if (pending && pending.clipId) {
              updateTextTransform(pending.clipId, pending.transform);
            }
            rafIdRef.current = null;
          });
        }
        return;
      }

      if (
        interactionTargetType === "shape-clip" &&
        shapeClipBounds &&
        activeShapeClip
      ) {
        const deltaX = e.clientX - interactionStartRef.current.x;
        const deltaY = e.clientY - interactionStartRef.current.y;
        const { displayScale } = shapeClipBounds;

        let newTransform: {
          position?: { x: number; y: number };
          scale?: { x: number; y: number };
        } = {};

        if (interactionMode === "move") {
          const newX =
            interactionStartRef.current.transform.x +
            deltaX / displayScale / settings.width;
          const newY =
            interactionStartRef.current.transform.y +
            deltaY / displayScale / settings.height;
          newTransform = { position: { x: newX, y: newY } };
        } else if (interactionMode === "resize" && activeHandle) {
          const startTransform = interactionStartRef.current.transform;
          let newScaleX = startTransform.scaleX;
          let newScaleY = startTransform.scaleY;

          const scaleDeltaX = deltaX / displayScale / 100;
          const scaleDeltaY = deltaY / displayScale / 100;

          switch (activeHandle) {
            case "e":
            case "se":
            case "ne":
              newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
              if (lockAspectRatio) newScaleY = newScaleX;
              break;
            case "w":
            case "sw":
            case "nw":
              newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
              if (lockAspectRatio) newScaleY = newScaleX;
              break;
            case "s":
              newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
              if (lockAspectRatio) newScaleX = newScaleY;
              break;
            case "n":
              newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
              if (lockAspectRatio) newScaleX = newScaleY;
              break;
          }

          newTransform = {
            position: { x: startTransform.x, y: startTransform.y },
            scale: { x: newScaleX, y: newScaleY },
          };
        }

        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(() => {
            const now = performance.now();
            if (
              now - lastStoreUpdateRef.current >= STORE_UPDATE_THROTTLE_MS &&
              interactionTargetIdRef.current
            ) {
              lastStoreUpdateRef.current = now;
              updateShapeTransform(
                interactionTargetIdRef.current,
                newTransform,
              );
            }
            rafIdRef.current = null;
          });
        }
        return;
      }

      if (!clipBounds) return;
      const clip = selectedClip || clipAtPlayhead;
      if (!clip) return;

      const deltaX = e.clientX - interactionStartRef.current.x;
      const deltaY = e.clientY - interactionStartRef.current.y;
      const { displayScale } = clipBounds;

      let newTransform: {
        position?: { x: number; y: number };
        scale?: { x: number; y: number };
      } = {};

      if (interactionMode === "move") {
        const newX =
          interactionStartRef.current.transform.x + deltaX / displayScale;
        const newY =
          interactionStartRef.current.transform.y + deltaY / displayScale;

        newTransform = { position: { x: newX, y: newY } };
      } else if (interactionMode === "resize" && activeHandle) {
        const startTransform = interactionStartRef.current.transform;
        let newScaleX = startTransform.scaleX;
        let newScaleY = startTransform.scaleY;
        let newX = startTransform.x;
        let newY = startTransform.y;

        const scaleDeltaX = deltaX / displayScale / (settings.width / 2);
        const scaleDeltaY = deltaY / displayScale / (settings.height / 2);

        switch (activeHandle) {
          case "e":
            newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
            if (lockAspectRatio) newScaleY = newScaleX;
            break;
          case "w":
            newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
            if (lockAspectRatio) newScaleY = newScaleX;
            newX = startTransform.x + deltaX / displayScale / 2;
            break;
          case "s":
            newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
            if (lockAspectRatio) newScaleX = newScaleY;
            break;
          case "n":
            newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
            if (lockAspectRatio) newScaleX = newScaleY;
            newY = startTransform.y + deltaY / displayScale / 2;
            break;
          case "se":
            if (lockAspectRatio) {
              const avgDelta = (scaleDeltaX + scaleDeltaY) / 2;
              newScaleX = Math.max(0.1, startTransform.scaleX + avgDelta);
              newScaleY = newScaleX;
            } else {
              newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
              newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
            }
            break;
          case "sw":
            if (lockAspectRatio) {
              const avgDelta = (-scaleDeltaX + scaleDeltaY) / 2;
              newScaleX = Math.max(0.1, startTransform.scaleX + avgDelta);
              newScaleY = newScaleX;
            } else {
              newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
              newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
            }
            newX = startTransform.x + deltaX / displayScale / 2;
            break;
          case "ne":
            if (lockAspectRatio) {
              const avgDelta = (scaleDeltaX - scaleDeltaY) / 2;
              newScaleX = Math.max(0.1, startTransform.scaleX + avgDelta);
              newScaleY = newScaleX;
            } else {
              newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
              newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
            }
            newY = startTransform.y + deltaY / displayScale / 2;
            break;
          case "nw":
            if (lockAspectRatio) {
              const avgDelta = (-scaleDeltaX - scaleDeltaY) / 2;
              newScaleX = Math.max(0.1, startTransform.scaleX + avgDelta);
              newScaleY = newScaleX;
            } else {
              newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
              newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
            }
            newX = startTransform.x + deltaX / displayScale / 2;
            newY = startTransform.y + deltaY / displayScale / 2;
            break;
        }

        newTransform = {
          position: { x: newX, y: newY },
          scale: { x: newScaleX, y: newScaleY },
        };
      }

      pendingTransformRef.current = {
        clipId: clip.id,
        transform: newTransform,
      };

      const currentTransform = clip.transform || {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
      };
      setLiveTransform({
        position: newTransform.position || currentTransform.position,
        scale: newTransform.scale || currentTransform.scale,
      });

      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          const now = performance.now();
          if (
            pendingTransformRef.current &&
            now - lastStoreUpdateRef.current >= STORE_UPDATE_THROTTLE_MS
          ) {
            lastStoreUpdateRef.current = now;
            updateClipTransform(
              pendingTransformRef.current.clipId,
              pendingTransformRef.current.transform,
            );
          }
          rafIdRef.current = null;
        });
      }
    },
    [
      interactionMode,
      activeHandle,
      clipBounds,
      selectedClip,
      clipAtPlayhead,
      updateClipTransform,
      settings.width,
      settings.height,
      lockAspectRatio,
      interactionTargetType,
      textClipBounds,
      activeTextClip,
      updateTextTransform,
    ],
  );

  const handleMouseUp = useCallback(() => {
    if (pendingTransformRef.current) {
      updateClipTransform(
        pendingTransformRef.current.clipId,
        pendingTransformRef.current.transform,
      );
      pendingTransformRef.current = null;
    }
    // Flush any pending text-clip transform so the final pointer position is
    // committed even when the RAF throttle dropped the last in-flight commit.
    if (pendingTextTransformRef.current) {
      updateTextTransform(
        pendingTextTransformRef.current.clipId,
        pendingTextTransformRef.current.transform,
      );
      pendingTextTransformRef.current = null;
    }
    setInteractionTargetType(null);
    interactionTargetIdRef.current = null;
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const wasInteracting = isInteractingRef.current;
    isInteractingRef.current = false;
    setInteractionMode("none");
    setActiveHandle(null);
    interactionStartRef.current = null;
    setLiveTransform(null);

    if (wasInteracting) {
      renderFrameDirectly(playheadPosition);
    }
  }, [updateClipTransform, updateTextTransform, renderFrameDirectly, playheadPosition]);

  const handleCropChange = useCallback(
    (crop: { x: number; y: number; width: number; height: number }) => {
      if (cropClipId) {
        updateClipTransform(cropClipId, { crop });
      }
    },
    [cropClipId, updateClipTransform],
  );

  const handleCropComplete = useCallback(() => {
    setCropMode(false);
  }, [setCropMode]);

  const handleCropCancel = useCallback(() => {
    setCropMode(false);
  }, [setCropMode]);

  useEffect(() => {
    if (interactionMode !== "none") {
      const handleGlobalMouseUp = () => {
        if (pendingTransformRef.current) {
          updateClipTransform(
            pendingTransformRef.current.clipId,
            pendingTransformRef.current.transform,
          );
          pendingTransformRef.current = null;
        }
        if (pendingTextTransformRef.current) {
          updateTextTransform(
            pendingTextTransformRef.current.clipId,
            pendingTextTransformRef.current.transform,
          );
          pendingTextTransformRef.current = null;
        }
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        const wasInteracting = isInteractingRef.current;
        isInteractingRef.current = false;
        setInteractionMode("none");
        setActiveHandle(null);
        interactionStartRef.current = null;
        setLiveTransform(null);

        if (wasInteracting) {
          renderFrameDirectly(playheadPosition);
        }
      };

      window.addEventListener("mouseup", handleGlobalMouseUp);
      return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
    }
  }, [
    interactionMode,
    renderFrameDirectly,
    playheadPosition,
    updateClipTransform,
  ]);

  const handleScrubClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      const newTime = percentage * (actualEndTime || 10);
      seekTo(newTime);
    },
    [actualEndTime, seekTo],
  );

  const handleSkipBack = useCallback(() => {
    seekRelative(-5);
  }, [seekRelative]);

  const handleSkipForward = useCallback(() => {
    seekRelative(5);
  }, [seekRelative]);

  const handleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      setZoomLevel(1);
      container
        .requestFullscreen()
        .then(() => {
          setIsFullscreen(true);
        })
        .catch((err) => {
          console.error("Error entering fullscreen:", err);
        });
    } else {
      document
        .exitFullscreen()
        .then(() => {
          setIsFullscreen(false);
        })
        .catch((err) => {
          console.error("Error exiting fullscreen:", err);
        });
    }
  }, []);

  const handleMaximize = useCallback(() => {
    setZoomLevel(1);
    setIsMaximized((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const progressPercentage =
    actualEndTime > 0 ? (playheadPosition / actualEndTime) * 100 : 0;

  const showResizeHandles = !isPlaying && selectedClip && clipBounds;

  const showTextClipHandles = !isPlaying && selectedTextClip && textClipBounds;

  const showShapeClipHandles =
    !isPlaying && selectedShapeClip && shapeClipBounds;

  const showSubtitleOverlay =
    !isPlaying && selectedSubtitleObj && subtitleBounds;

  const cropClip = useMemo(() => {
    if (!cropMode || !cropClipId) return null;

    for (const track of timelineTracks) {
      const clip = track.clips.find((c) => c.id === cropClipId);
      if (clip) return clip;
    }
    return null;
  }, [cropMode, cropClipId, timelineTracks]);

  const cropMediaData = useMemo(() => {
    if (!cropMode || !cropClipId || !cropClip) return null;

    const mediaItem = getMediaItem(cropClip.mediaId);
    if (!mediaItem) return null;

    let src: string | null = null;
    if (mediaItem.blob) {
      src = URL.createObjectURL(mediaItem.blob);
    } else if (mediaItem.originalUrl) {
      src = mediaItem.originalUrl;
    }

    if (!src) return null;

    return {
      src,
      type: mediaItem.type as "video" | "image",
    };
  }, [cropMode, cropClipId, cropClip, getMediaItem]);

  const cropVideoSrc = cropMediaData?.src ?? null;
  const cropMediaType = cropMediaData?.type ?? "video";

  const shouldShowCropMode = cropMode && cropClipId && cropClip && cropVideoSrc;

  return (
    <div
      ref={containerRef}
      data-tour="preview"
      className="w-full h-full min-w-0 bg-background flex flex-col relative group overflow-hidden"
    >
      {/* Crop Mode View - Full Screen Overlay */}
      {shouldShowCropMode && (
        <CropModeView
          clip={cropClip!}
          videoSrc={cropVideoSrc}
          mediaType={cropMediaType}
          currentTime={playheadPosition}
          canvasWidth={canvasSize.width}
          canvasHeight={canvasSize.height}
          onCropChange={handleCropChange}
          onComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}

      {/* Video Area */}
      <div
        className={`flex-1 relative flex items-center justify-center bg-background-secondary/30 transition-all duration-300 ${
          isMaximized || isFullscreen ? "p-0" : "p-4"
        } ${zoomLevel > 1 ? "overflow-auto" : ""}`}
        onMouseMove={interactionMode !== "none" ? handleMouseMove : undefined}
        onMouseUp={handleMouseUp}
      >
        <div
          ref={overlayRef}
          className={`relative bg-black overflow-hidden transition-all duration-300 ${
            isMaximized || isFullscreen
              ? "rounded-none ring-0 shadow-none"
              : "shadow-2xl rounded-xl ring-1 ring-border shadow-[0_0_50px_rgba(0,0,0,0.5)]"
          }`}
          style={
            isMaximized || isFullscreen
              ? {
                  width: "100%",
                  height: "100%",
                  maxWidth: "none",
                }
              : {
                  height: `${450 * zoomLevel}px`,
                  width: `calc(${450 * zoomLevel}px * ${settings.width} / ${settings.height})`,
                  maxWidth: `${800 * zoomLevel}px`,
                }
          }
          onMouseMove={!isPlaying ? handleGraphicsMouseMove : undefined}
          onClick={!isPlaying ? handleGraphicsClick : undefined}
          onMouseLeave={() => setHoveredGraphicClipId(null)}
        >
          <canvas
            ref={canvasRef}
            width={settings.width}
            height={settings.height}
            className="w-full h-full object-contain bg-black"
            style={{
              cursor: hoveredGraphicClipId && !isPlaying ? "pointer" : "default",
            }}
          />

          {/* Processing Overlay */}
          <ProcessingOverlay />

          {/* Motion Path Overlay */}
          {motionPathMode && motionPathConfig && motionPathClip && (
            <div className="absolute inset-0 pointer-events-auto z-30">
              <MotionPathOverlay
                config={motionPathConfig}
                canvasWidth={settings.width}
                canvasHeight={settings.height}
                currentTime={playheadPosition - motionPathClip.startTime}
                clipDuration={motionPathClip.duration}
                onPointMove={handleMotionPathPointMove}
                onPointAdd={handleMotionPathPointAdd}
                onPointRemove={handleMotionPathPointRemove}
                onControlPointMove={handleMotionPathControlPointMove}
                disabled={isPlaying}
              />
            </div>
          )}

          {/* Particle Effects Renderer */}
          {particleEffects.length > 0 && (
            <div className="absolute inset-0 pointer-events-none z-20">
              <ParticleRenderer
                effects={particleEffects}
                width={settings.width}
                height={settings.height}
                currentTime={playheadPosition}
                isPlaying={isPlaying}
              />
            </div>
          )}

          {/* Export Overlay */}
          {exportState.isExporting && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-background-secondary/95 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-border">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Loader2 size={20} className="text-primary animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">
                      Exporting Video
                    </h3>
                    <p className="text-xs text-text-muted">
                      {exportState.phase || "Preparing..."}
                    </p>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-text-secondary">
                      Export Progress
                    </span>
                    <span className="text-[10px] text-text-muted font-mono">
                      {Math.round(exportState.progress)}%
                    </span>
                  </div>
                  <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-primary-hover transition-all duration-300"
                      style={{ width: `${exportState.progress}%` }}
                    />
                  </div>
                </div>

                <p className="text-[10px] text-text-muted text-center">
                  Please wait while your video is being exported...
                </p>
              </div>
            </div>
          )}

          {/* Resize/Transform Overlay */}
          {!cropMode && showResizeHandles && clipBounds && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: clipBounds.x,
                top: clipBounds.y,
                width: clipBounds.width,
                height: clipBounds.height,
              }}
            >
              {/* Selection border */}
              <div className="absolute inset-0 border-2 border-primary pointer-events-none" />

              {/* Drag-anywhere region: covers the whole clip so users can grab
                  it from any point — industry standard NLE behavior. The
                  resize handles below sit on top with higher z-index. */}
              <div
                className="absolute inset-0 pointer-events-auto cursor-move"
                onMouseDown={handleClipMouseDown}
                title="Drag to move"
                aria-label="Move clip"
                role="button"
                tabIndex={-1}
              />

              {/* Aspect ratio lock toggle */}
              <button
                className={`absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] rounded pointer-events-auto transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary z-10 ${
                  lockAspectRatio
                    ? "bg-primary text-primary-foreground"
                    : "bg-background-tertiary text-text-secondary border border-border hover:bg-background-elevated"
                }`}
                onClick={() => setLockAspectRatio(!lockAspectRatio)}
                title={
                  lockAspectRatio ? "Unlock aspect ratio" : "Lock aspect ratio"
                }
                aria-pressed={lockAspectRatio}
                aria-label={lockAspectRatio ? "Aspect ratio locked" : "Aspect ratio free"}
              >
                {lockAspectRatio ? "🔒 Locked" : "🔓 Free"}
              </button>

              {/* Corner resize handles */}
              <div
                className="absolute -left-2 -top-2 w-4 h-4 bg-white border-2 border-primary rounded-sm cursor-nw-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onMouseDown={(e) => handleHandleMouseDown(e, "nw")}
              />
              <div
                className="absolute -right-2 -top-2 w-4 h-4 bg-white border-2 border-primary rounded-sm cursor-ne-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onMouseDown={(e) => handleHandleMouseDown(e, "ne")}
              />
              <div
                className="absolute -left-2 -bottom-2 w-4 h-4 bg-white border-2 border-primary rounded-sm cursor-sw-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onMouseDown={(e) => handleHandleMouseDown(e, "sw")}
              />
              <div
                className="absolute -right-2 -bottom-2 w-4 h-4 bg-white border-2 border-primary rounded-sm cursor-se-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onMouseDown={(e) => handleHandleMouseDown(e, "se")}
              />

              {/* Edge resize handles */}
              <div
                className="absolute left-1/2 -translate-x-1/2 -top-2 w-6 h-4 bg-white border-2 border-primary rounded-sm cursor-n-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onMouseDown={(e) => handleHandleMouseDown(e, "n")}
              />
              <div
                className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-6 h-4 bg-white border-2 border-primary rounded-sm cursor-s-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onMouseDown={(e) => handleHandleMouseDown(e, "s")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-6 bg-white border-2 border-primary rounded-sm cursor-w-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onMouseDown={(e) => handleHandleMouseDown(e, "w")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -right-2 w-4 h-6 bg-white border-2 border-primary rounded-sm cursor-e-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onMouseDown={(e) => handleHandleMouseDown(e, "e")}
              />
            </div>
          )}

          {/* Text Clip Resize/Transform Overlay — rebuilt in the mega-fix
              pass. Old design: cyan border, large 16×16 corner handles, a
              "🔒 Locked" badge floating above the selection, no rotation.
              New design (matches Figma/CapCut conventions):
                * 1.5 px solid MediaForge yellow border (#F4FF00)
                * 8×8 circle handles with invisible 16×16 hit area
                * Dedicated rotation handle 24 px below bottom-center
                * Lock state shown only via track-header lock icon (the
                  in-canvas badge was noisy and duplicative)
              The drag handler bypasses the prior 32 ms store throttle in
              favour of a single RAF-per-frame commit so the overlay border
              stays glued to the pointer. */}
          {showTextClipHandles && textClipBounds && (
            <div
              ref={textOverlayRef}
              className="absolute pointer-events-none"
              style={{
                left: textClipBounds.x,
                top: textClipBounds.y,
                width: textClipBounds.width,
                height: textClipBounds.height,
              }}
              data-testid="text-overlay"
            >
              {/* Selection border — clean yellow rectangle (1.5 px). The
                  prior dashed/cyan look read as "connection guides" rather
                  than a selection box. */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  border: `1.5px solid ${TEXT_OVERLAY_COLOR}`,
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
                }}
              />

              {/* Drag-anywhere region + double-click to enter inline edit. */}
              <div
                className="absolute inset-0 pointer-events-auto cursor-move"
                onMouseDown={handleTextClipMouseDown}
                onDoubleClick={(e) => {
                  if (!selectedTextClip) return;
                  e.stopPropagation();
                  e.preventDefault();
                  setInlineEditingTextClipId(selectedTextClip.id);
                }}
                title="Drag to move — double-click to edit text — Shift+drag handle to lock ratio"
                aria-label="Move text clip — double-click to edit"
                role="button"
                tabIndex={-1}
              />

              {/* Corner handles — 8 px visible circle, 16×16 invisible hit
                  target courtesy of a wrapping div with negative padding.
                  Cursor encodes the resize direction so the user sees the
                  axis before they press. */}
              <TextOverlayCornerHandle
                position="nw"
                cursor="nwse-resize"
                onMouseDown={(e) => handleTextHandleMouseDown(e, "nw")}
              />
              <TextOverlayCornerHandle
                position="ne"
                cursor="nesw-resize"
                onMouseDown={(e) => handleTextHandleMouseDown(e, "ne")}
              />
              <TextOverlayCornerHandle
                position="sw"
                cursor="nesw-resize"
                onMouseDown={(e) => handleTextHandleMouseDown(e, "sw")}
              />
              <TextOverlayCornerHandle
                position="se"
                cursor="nwse-resize"
                onMouseDown={(e) => handleTextHandleMouseDown(e, "se")}
              />

              {/* Edge handles — same 8 px visible / 16 px hit-target idea
                  but rendered as thin pills along each edge midpoint. */}
              <TextOverlayEdgeHandle
                position="n"
                cursor="ns-resize"
                onMouseDown={(e) => handleTextHandleMouseDown(e, "n")}
              />
              <TextOverlayEdgeHandle
                position="s"
                cursor="ns-resize"
                onMouseDown={(e) => handleTextHandleMouseDown(e, "s")}
              />
              <TextOverlayEdgeHandle
                position="w"
                cursor="ew-resize"
                onMouseDown={(e) => handleTextHandleMouseDown(e, "w")}
              />
              <TextOverlayEdgeHandle
                position="e"
                cursor="ew-resize"
                onMouseDown={(e) => handleTextHandleMouseDown(e, "e")}
              />

              {/* Rotation handle — 14 px circle, 24 px below bottom-center,
                  RefreshCw icon inside. Hold Shift while dragging to snap to
                  15° increments. */}
              <div
                className="absolute pointer-events-auto group/rot"
                style={{
                  left: "50%",
                  bottom: -38,
                  marginLeft: -7,
                  width: 14,
                  height: 14,
                  borderRadius: 14,
                  background: TEXT_OVERLAY_COLOR,
                  border: "1.5px solid #fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                  cursor: "grab",
                }}
                onMouseDown={handleTextRotateMouseDown}
                title="Drag to rotate — hold Shift to snap to 15°"
                aria-label="Rotate text clip"
                data-testid="text-rotate-handle"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="8"
                  height="8"
                  style={{ position: "absolute", left: 2, top: 2, color: "#000" }}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                {/* Connector line from handle to bounding-box bottom edge. */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: "50%",
                    marginLeft: -0.75,
                    bottom: 14,
                    width: 1.5,
                    height: 24,
                    background: TEXT_OVERLAY_COLOR,
                    opacity: 0.7,
                  }}
                />
              </div>
            </div>
          )}

          {/* Inline text editor — rendered when user double-clicks a selected
              text clip. We position a contenteditable div at the text bounds
              with styling that matches the canvas-rendered glyphs as closely
              as possible. On blur or Esc, commit & exit edit mode. */}
          {inlineEditingTextClipId &&
            selectedTextClip &&
            selectedTextClip.id === inlineEditingTextClipId &&
            textClipBounds && (
              <InlineTextEditor
                ref={inlineEditRef}
                key={selectedTextClip.id}
                clip={selectedTextClip}
                bounds={textClipBounds}
                onCommit={(newText) => {
                  if (newText !== selectedTextClip.text) {
                    updateTextContent(selectedTextClip.id, newText);
                  }
                  setInlineEditingTextClipId(null);
                }}
                onCancel={() => setInlineEditingTextClipId(null)}
              />
            )}

          {/* Shape Clip Resize/Transform Overlay */}
          {showShapeClipHandles && shapeClipBounds && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: shapeClipBounds.x,
                top: shapeClipBounds.y,
                width: shapeClipBounds.width,
                height: shapeClipBounds.height,
              }}
            >
              {/* Selection border - green for shape clips */}
              <div className="absolute inset-0 border-2 border-green-500 pointer-events-none" />

              {/* Drag-anywhere region — industry-standard NLE behavior. */}
              <div
                className="absolute inset-0 pointer-events-auto cursor-move"
                onMouseDown={handleShapeClipMouseDown}
                title="Drag to move shape"
                aria-label="Move shape clip"
                role="button"
                tabIndex={-1}
              />

              {/* Aspect ratio lock toggle */}
              <button
                className={`absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] rounded pointer-events-auto transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500 z-10 ${
                  lockAspectRatio
                    ? "bg-green-500 text-white"
                    : "bg-background-tertiary text-text-secondary border border-border hover:bg-background-elevated"
                }`}
                onClick={() => setLockAspectRatio(!lockAspectRatio)}
                title={
                  lockAspectRatio ? "Unlock aspect ratio" : "Lock aspect ratio"
                }
                aria-pressed={lockAspectRatio}
              >
                {lockAspectRatio ? "🔒 Locked" : "🔓 Free"}
              </button>

              {/* Corner resize handles */}
              <div
                className="absolute -left-2 -top-2 w-4 h-4 bg-white border-2 border-green-500 rounded-sm cursor-nw-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onMouseDown={(e) => handleShapeHandleMouseDown(e, "nw")}
              />
              <div
                className="absolute -right-2 -top-2 w-4 h-4 bg-white border-2 border-green-500 rounded-sm cursor-ne-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onMouseDown={(e) => handleShapeHandleMouseDown(e, "ne")}
              />
              <div
                className="absolute -left-2 -bottom-2 w-4 h-4 bg-white border-2 border-green-500 rounded-sm cursor-sw-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onMouseDown={(e) => handleShapeHandleMouseDown(e, "sw")}
              />
              <div
                className="absolute -right-2 -bottom-2 w-4 h-4 bg-white border-2 border-green-500 rounded-sm cursor-se-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onMouseDown={(e) => handleShapeHandleMouseDown(e, "se")}
              />

              {/* Edge resize handles */}
              <div
                className="absolute left-1/2 -translate-x-1/2 -top-2 w-6 h-4 bg-white border-2 border-green-500 rounded-sm cursor-n-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onMouseDown={(e) => handleShapeHandleMouseDown(e, "n")}
              />
              <div
                className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-6 h-4 bg-white border-2 border-green-500 rounded-sm cursor-s-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onMouseDown={(e) => handleShapeHandleMouseDown(e, "s")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-6 bg-white border-2 border-green-500 rounded-sm cursor-w-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onMouseDown={(e) => handleShapeHandleMouseDown(e, "w")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -right-2 w-4 h-6 bg-white border-2 border-green-500 rounded-sm cursor-e-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onMouseDown={(e) => handleShapeHandleMouseDown(e, "e")}
              />
            </div>
          )}

          {/* Subtitle Selection Overlay */}
          {showSubtitleOverlay && subtitleBounds && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: subtitleBounds.x,
                top: subtitleBounds.y,
                width: subtitleBounds.width,
                height: subtitleBounds.height,
              }}
            >
              {/* Selection border - yellow/orange for subtitles */}
              <div className="absolute inset-0 border-2 border-yellow-500 rounded-lg pointer-events-none animate-pulse" />
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-yellow-500 rounded text-[10px] font-medium text-black whitespace-nowrap">
                Subtitle Selected - Edit in Inspector
              </div>
            </div>
          )}

          {/* Graphic Clip Hover Indicators */}
          {!cropMode && !isPlaying &&
            activeGraphicClips.map((clip) => {
              if (clip.id === selectedShapeClipId) return null;
              if (clip.id !== hoveredGraphicClipId) return null;
              const bounds = getGraphicClipDisplayBounds(clip);
              if (!bounds) return null;
              return (
                <div
                  key={clip.id}
                  className="absolute pointer-events-none z-10"
                  style={{
                    left: bounds.x,
                    top: bounds.y,
                    width: bounds.width,
                    height: bounds.height,
                  }}
                >
                  <div className="absolute inset-0 border-2 border-dashed border-white/80 rounded-sm" />
                  <div
                    aria-hidden="true"
                    className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/70 rounded text-[10px] text-white whitespace-nowrap"
                  >
                    Click to select
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Player Controls with integrated Scrub Bar */}
      <div
        className={`border-t border-border transition-all duration-300 ${
          isMaximized || isFullscreen
            ? "absolute bottom-0 left-0 right-0 z-50 bg-background-secondary backdrop-blur-sm"
            : "z-20 bg-background-secondary"
        }`}
      >
        {/* Scrub Bar - integrated at top of controls */}
        <div
          className="h-1.5 bg-background-tertiary cursor-pointer group hover:h-2.5 transition-all relative"
          onClick={handleScrubClick}
        >
          <div
            className="h-full bg-primary relative pointer-events-none shadow-[0_0_10px_rgba(255,181,51,0.5)]"
            style={{ width: `${progressPercentage}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity transform scale-0 group-hover:scale-100 duration-100 border border-black/20" />
          </div>
        </div>

        {/* Controls row — CapCut-style minimal: timecode left, transport center, icons right */}
        <div className="h-10 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Current time / Total time — CapCut format "00:00:00:00 / 00:00:15:24" */}
          <div
            className="font-mono text-text-primary tabular-nums text-[12px] tracking-wider"
            data-testid="preview-timecode"
          >
            <span>{formatTime(playheadPosition)}</span>
            <span className="text-text-muted mx-1">/</span>
            <span className="text-text-secondary">
              {formatTime(
                project.timeline.tracks.reduce((maxEnd, track) => {
                  for (const clip of track.clips) {
                    const end = clip.startTime + clip.duration;
                    if (end > maxEnd) maxEnd = end;
                  }
                  return maxEnd;
                }, 0),
              )}
            </span>
          </div>

          {/* Renderer badge: "LOCAL · WebGPU" / "LOCAL · Canvas2D".
              The "LOCAL" prefix makes it clear that nothing renders on a
              remote server — every frame is composited on the user's
              device. Hover for full adapter + privacy info. */}
          {rendererType !== "none" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  data-testid="renderer-badge"
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium cursor-help select-none ${
                    rendererType === "webgpu"
                      ? "bg-green-500/20 text-green-400"
                      : "bg-gray-500/20 text-gray-300"
                  }`}
                >
                  {`LOCAL · ${rendererType === "webgpu" ? "WebGPU" : "Canvas2D"}`}
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="start"
                data-testid="renderer-badge-tooltip"
                className="max-w-xs"
              >
                <div className="text-xs space-y-1.5">
                  <div className="font-semibold text-primary">
                    Local rendering on your device
                  </div>
                  <div className="font-mono space-y-0.5">
                    <div>
                      <span className="text-text-muted">Active renderer: </span>
                      <span>
                        {rendererType === "webgpu" ? "WebGPU" : "Canvas2D"}
                      </span>
                    </div>
                    {rendererType === "webgpu" && adapterInfo?.adapterInfoAvailable ? (
                      <>
                        {adapterInfo.vendor && (
                          <div>
                            <span className="text-text-muted">GPU adapter:    </span>
                            <span>
                              {adapterInfo.vendor}
                              {adapterInfo.architecture
                                ? ` / ${adapterInfo.architecture}`
                                : ""}
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-text-muted">Backend:         </span>
                          <span>GPU-accelerated (hardware)</span>
                        </div>
                      </>
                    ) : rendererType === "webgpu" ? (
                      <>
                        <div>
                          <span className="text-text-muted">GPU adapter:    </span>
                          <span>info hidden by browser</span>
                        </div>
                        <div>
                          <span className="text-text-muted">Backend:         </span>
                          <span>GPU-accelerated (hardware)</span>
                        </div>
                      </>
                    ) : (
                      <div>
                        <span className="text-text-muted">Backend:         </span>
                        <span>CPU-only (no GPU detected)</span>
                      </div>
                    )}
                    <div>
                      <span className="text-text-muted">Privacy:         </span>
                      <span>Files never leave your browser</span>
                    </div>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-2">
          <IconButton
            icon={ChevronsLeft}
            onClick={() => {
              useTimelineStore.getState().seekTo(0);
            }}
            title="Go to start (Home)"
          />
          <IconButton
            icon={SkipBack}
            onClick={handleSkipBack}
            title="Skip back 5s"
          />
          <button
            onClick={() => {
              togglePlayback();
            }}
            className="w-8 h-8 rounded-full bg-primary hover:brightness-110 active:brightness-95 flex items-center justify-center text-black transition-all"
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? (
              <Pause size={14} fill="currentColor" />
            ) : (
              <Play size={14} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          <IconButton
            icon={SkipForward}
            onClick={handleSkipForward}
            title="Skip forward 5s"
          />
          <IconButton
            icon={ChevronsRight}
            onClick={() => {
              const tracks = useProjectStore.getState().project.timeline.tracks;
              let maxEnd = 0;
              for (const track of tracks) {
                for (const clip of track.clips) {
                  const end = clip.startTime + clip.duration;
                  if (end > maxEnd) maxEnd = end;
                }
              }
              useTimelineStore.getState().seekTo(maxEnd);
            }}
            title="Go to end (End)"
          />
        </div>

        <div className="flex gap-1 items-center">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`p-1.5 rounded-md hover:bg-background-elevated transition-colors ${
              isMuted
                ? "text-red-500"
                : "text-text-secondary hover:text-text-primary"
            }`}
            aria-label={isMuted ? "Unmute preview" : "Mute preview"}
            aria-pressed={isMuted}
            title={isMuted ? "Unmute preview" : "Mute preview"}
          >
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>

          {/* Zoom Control */}
          <div className="relative">
            <button
              onClick={() => setShowZoomMenu(!showZoomMenu)}
              className="px-1.5 py-1 rounded-md text-[11px] font-mono text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors"
              title="Preview Zoom"
              aria-haspopup="menu"
              aria-expanded={showZoomMenu}
              aria-label={`Preview zoom: ${Math.round(zoomLevel * 100)}%`}
            >
              <div className="flex items-center gap-1">
                <ZoomIn size={12} />
                <span>{Math.round(zoomLevel * 100)}%</span>
              </div>
            </button>
            {showZoomMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowZoomMenu(false)}
                />
                <div
                  className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-background-elevated border border-border rounded-lg shadow-xl py-1 z-50 min-w-[80px]"
                  role="menu"
                  aria-label="Preview zoom options"
                >
                  {ZOOM_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      role="menuitem"
                      onClick={() => {
                        setZoomLevel(opt.value);
                        setShowZoomMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-xs font-mono text-left hover:bg-background-secondary transition-colors ${
                        zoomLevel === opt.value
                          ? "text-primary"
                          : "text-text-secondary"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Preview FPS selector — caps the render loop to the user's chosen
              frame rate. Live, no playback restart needed. */}
          <div className="relative" data-testid="preview-fps-control">
            <button
              data-testid="preview-fps-trigger"
              onClick={() => setShowFpsMenu(!showFpsMenu)}
              className="px-1.5 py-1 rounded-md text-[11px] font-mono text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors"
              title={`Preview FPS: ${previewFps} (max ${Math.round(1000 / previewFps)}ms per frame)`}
              aria-haspopup="menu"
              aria-expanded={showFpsMenu}
              aria-label={`Preview frame rate: ${previewFps} fps`}
            >
              <div className="flex items-center gap-1">
                <Gauge size={12} />
                <span>{previewFps} fps</span>
              </div>
            </button>
            {showFpsMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowFpsMenu(false)}
                />
                <div
                  data-testid="preview-fps-menu"
                  className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-background-elevated border border-border rounded-lg shadow-xl py-1 z-50 min-w-[90px]"
                  role="menu"
                  aria-label="Preview frame rate options"
                >
                  {FPS_OPTIONS.map((fps) => (
                    <button
                      key={fps}
                      role="menuitem"
                      data-testid={`preview-fps-option-${fps}`}
                      onClick={() => {
                        setPreviewFps(fps);
                        setShowFpsMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-xs font-mono text-left hover:bg-background-secondary transition-colors ${
                        previewFps === fps
                          ? "text-primary"
                          : "text-text-secondary"
                      }`}
                    >
                      {fps} fps
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="w-px h-4 bg-border mx-1.5" />
          {/* Aspect ratio picker — sets project.settings.width/height to one
              of the common video aspect-ratio presets. Height is locked at
              1080 lines for landscape ratios and 1920 for portrait, matching
              industry conventions. The trigger shows the current ratio
              (e.g. "16:9") so users can see at a glance what the timeline is
              rendering. */}
          <div className="relative" data-testid="preview-aspect-control">
            <button
              data-testid="preview-aspect-trigger"
              onClick={() => setShowAspectMenu(!showAspectMenu)}
              className="px-1.5 py-1 rounded-md text-[11px] font-mono text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors"
              aria-haspopup="menu"
              aria-expanded={showAspectMenu}
              title={`Aspect ratio: ${(() => {
                const w = project.settings.width;
                const h = project.settings.height;
                const r = w / h;
                if (Math.abs(r - 16 / 9) < 0.01) return "16:9";
                if (Math.abs(r - 4 / 3) < 0.01) return "4:3";
                if (Math.abs(r - 2.35) < 0.02) return "2.35:1";
                if (Math.abs(r - 2) < 0.01) return "2:1";
                if (Math.abs(r - 1.85) < 0.01) return "1.85:1";
                if (Math.abs(r - 9 / 16) < 0.01) return "9:16";
                if (Math.abs(r - 3 / 4) < 0.01) return "3:4";
                if (Math.abs(r - 1) < 0.01) return "1:1";
                return `${w}×${h}`;
              })()}`}
            >
              <div className="flex items-center gap-1">
                <RectangleHorizontal size={12} />
                <span>
                  {(() => {
                    const w = project.settings.width;
                    const h = project.settings.height;
                    const r = w / h;
                    if (Math.abs(r - 16 / 9) < 0.01) return "16:9";
                    if (Math.abs(r - 4 / 3) < 0.01) return "4:3";
                    if (Math.abs(r - 2.35) < 0.02) return "2.35:1";
                    if (Math.abs(r - 2) < 0.01) return "2:1";
                    if (Math.abs(r - 1.85) < 0.01) return "1.85:1";
                    if (Math.abs(r - 9 / 16) < 0.01) return "9:16";
                    if (Math.abs(r - 3 / 4) < 0.01) return "3:4";
                    if (Math.abs(r - 1) < 0.01) return "1:1";
                    return `${w}×${h}`;
                  })()}
                </span>
              </div>
            </button>
            {showAspectMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowAspectMenu(false)}
                />
                <div
                  data-testid="preview-aspect-menu"
                  className="absolute bottom-full mb-1 right-0 bg-background-elevated border border-border rounded-lg shadow-xl py-1 z-50 min-w-[140px]"
                  role="menu"
                  aria-label="Aspect ratio options"
                >
                  {[
                    { label: "16:9", w: 1920, h: 1080 },
                    { label: "4:3", w: 1440, h: 1080 },
                    { label: "2.35:1", w: 2540, h: 1080 },
                    { label: "2:1", w: 2160, h: 1080 },
                    { label: "1.85:1", w: 2000, h: 1080 },
                    { label: "9:16", w: 1080, h: 1920 },
                    { label: "3:4", w: 810, h: 1080 },
                    { label: "1:1", w: 1080, h: 1080 },
                  ].map((opt) => {
                    const isActive =
                      project.settings.width === opt.w &&
                      project.settings.height === opt.h;
                    return (
                      <button
                        key={opt.label}
                        role="menuitem"
                        data-testid={`preview-aspect-option-${opt.label}`}
                        onClick={() => {
                          void updateSettings({ width: opt.w, height: opt.h });
                          setShowAspectMenu(false);
                        }}
                        className={`w-full px-3 py-1.5 text-xs text-left hover:bg-background-secondary transition-colors flex items-center justify-between ${
                          isActive ? "text-primary" : "text-text-secondary"
                        }`}
                      >
                        <span className="font-mono">{opt.label}</span>
                        <span className="text-[10px] text-text-secondary">
                          {opt.w}×{opt.h}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <button
            onClick={handleFullscreen}
            title={isFullscreen ? "Exit Full Screen" : "Full Screen"}
            aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
            aria-pressed={isFullscreen}
            className={`p-1.5 rounded-md transition-colors ${
              isFullscreen
                ? "text-primary bg-primary/20"
                : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
            }`}
          >
            <Monitor size={14} />
          </button>
          <button
            onClick={handleMaximize}
            title={isMaximized ? "Restore Size" : "Maximize Preview"}
            aria-label={isMaximized ? "Restore preview size" : "Maximize preview"}
            aria-pressed={isMaximized}
            className={`p-1.5 rounded-md transition-colors ${
              isMaximized
                ? "text-primary bg-primary/20"
                : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
            }`}
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
};

export default Preview;
