import React, { useMemo, useState } from "react";
import { ChevronDown, Captions } from "lucide-react";
import { useProjectStore } from "../stores/project-store";
import { useUIStore } from "../stores/ui-store";
import { useEngineStore } from "../stores/engine-store";
import { useSettingsStore } from "../stores/settings-store";
import { useI18n } from "../services/i18n";
import type { Clip, Project } from "@/lib/openreel-core";
import {
  type CaptionAnimationStyle,
  CAPTION_ANIMATION_STYLES,
  getAnimationStyleDisplayName,
} from "@/lib/openreel-core";
// Inspector sections — V6 trim. After the V5 audit removed deep/niche surfaces
// (Color Grading, Audio Effects, 3D, Keyframes editor, Motion Presets,
// Particles, Emphasis, Auto-Reframe, Silence-cut, Beat-Sync), V6 further
// narrows the video-clip inspector to three working sections: Crop, Blending,
// and Entry/Exit Transitions. The previously-rendered Background Removal,
// Transform, Alignment, Video Effects and Quick Actions panels were dropped
// because they either duplicated controls in the Video tab or didn't drive a
// real engine end-to-end. Shape / SVG / text-specific surfaces remain on
// their dedicated clip-type branches.
import {
  ShapeSection,
  SVGSection,
  BlendingSection,
  ClipTransitionSection,
  CropSection,
  SpeedSection,
  ClipTabs,
  VideoBasicTab,
  AudioBasicTab,
  SpeedTab,
  TextClipInspector,
  type MainTabId,
  type MainTab,
} from "./inspector";
import {
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@/components/openreel-ui";

// Inspector top-tab groups. Each accordion section belongs to exactly one
// of these — the InspectorPanel renders sections whose tabGroup matches the
// currently selected top tab. Keeps the inspector readable: clicking
// "Audio" hides Transform/Color sliders that don't apply.
type TabGroup = "video" | "audio" | "speed";

const Section: React.FC<{
  title: string;
  defaultOpen?: boolean;
  sectionId?: string;
  children: React.ReactNode;
  // Which top tab this section belongs to. When the inspector parent filters
  // by activeMainTab, only matching sections render.
  tabGroup?: TabGroup;
  activeTab?: TabGroup;
}> = ({ title, defaultOpen = false, sectionId, children, tabGroup, activeTab }) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  // If tabGroup is set, only render when the active tab matches. This keeps
  // the section completely out of the DOM (not just hidden) so layout doesn't
  // shift around when sections collapse.
  if (tabGroup && activeTab && tabGroup !== activeTab) {
    return null;
  }

  return (
    <div className="mb-6 transition-all" data-section-id={sectionId} data-tab-group={tabGroup}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-3 w-full group"
      >
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${
            isOpen ? "" : "-rotate-90"
          } text-text-muted group-hover:text-text-primary`}
        />
        <span className="text-xs font-medium">{title}</span>
      </button>
      {isOpen && (
        <div className="animate-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * Project metadata table — CapCut-style "Details" empty state.
 * Shown when no clip is selected. Two-column layout: muted label / white value.
 * Values are read from the project + previewFps stores so they stay live.
 */
const ProjectMetadataTable: React.FC<{
  project: Project;
  previewFps: number;
}> = ({ project, previewFps }) => {
  const { width, height, frameRate } = project.settings;
  const aspect = width / height;
  const aspectLabel =
    Math.abs(aspect - 16 / 9) < 0.05
      ? "16:9"
      : Math.abs(aspect - 9 / 16) < 0.05
        ? "9:16"
        : Math.abs(aspect - 1) < 0.05
          ? "1:1"
          : Math.abs(aspect - 4 / 3) < 0.05
            ? "4:3"
            : `${width}:${height}`;
  const importedCount = project.mediaLibrary.items.length;

  const rows: Array<{ label: string; value: string }> = [
    { label: "Name", value: project.name || "Untitled" },
    { label: "Path", value: "Local browser storage" },
    { label: "Color space", value: "Rec. 709 SDR" },
    {
      label: "Imported media",
      value:
        importedCount > 0
          ? `${importedCount} item${importedCount === 1 ? "" : "s"}`
          : "Stay in original location",
    },
    { label: "Arrange layers", value: "Turned on" },
    { label: "Proxy", value: "Turned off" },
  ];

  const timelineRows: Array<{ label: string; value: string }> = [
    { label: "Timeline name", value: "Timeline 01" },
    { label: "Aspect ratio", value: aspectLabel },
    { label: "Resolution", value: `${width}×${height}` },
    {
      label: "Frame rate",
      value: `${(previewFps || frameRate || 30).toFixed(2)} fps`,
    },
  ];

  const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex items-center justify-between h-7">
      <span className="text-[12px] text-text-muted">{label}</span>
      <span
        className="text-[12px] text-text-primary text-right truncate ml-3 max-w-[60%]"
        title={value}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div
      data-testid="inspector-empty-state"
      data-testid-detail="inspector-project-metadata"
      className="flex-1 flex flex-col px-1 py-1"
    >
      <div className="space-y-0">
        {rows.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
      <div className="h-px bg-white/[0.06] my-3" />
      <div className="space-y-0">
        {timelineRows.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
    </div>
  );
};

export const InspectorPanel: React.FC = () => {
  const t = useI18n();
  // Stores
  const { getClip, updateSubtitle, getSubtitle } = useProjectStore();
  const project = useProjectStore((state) => state.project);
  const previewFps = useSettingsStore((state) => state.previewFps);
  const { getSelectedClipIds } = useUIStore();
  const selectedItems = useUIStore((state) => state.selectedItems);
  const selectedClipIds = getSelectedClipIds();
  const getTitleEngine = useEngineStore((state) => state.getTitleEngine);
  const getGraphicsEngine = useEngineStore((state) => state.getGraphicsEngine);

  // Caption-specific UI state. The AI Auto-Captions section was moved to a
  // dedicated left-panel tab (CaptionsPanel) in V6 — but the per-subtitle
  // animation-style dropdown remains here for legacy subtitle clips that
  // aren't part of an AI-generated caption group.

  // Inspector top tabs — only Video / Audio / Speed are kept; the previous
  // Animation / Tracking / Adjustment tabs and their Remove-BG/Mask/Retouch/
  // Voice-changer/Curve/Velocity sub-tabs were visual stubs that didn't drive
  // any real engine, so they were removed for honesty (CapCut-parity UX
  // without the matching motion engine is a lie). See the audit at
  // apps/web/e2e/AUDIT_REPORT.md for the original list of removed surfaces.
  const [activeMainTab, setActiveMainTab] = useState<MainTabId>("video");

  // Check if a subtitle is selected
  const selectedSubtitleId = useMemo(() => {
    const subtitleSelection = selectedItems.find(
      (item) => item.type === "subtitle",
    );
    return subtitleSelection?.id || null;
  }, [selectedItems]);

  const selectedSubtitle = useMemo(() => {
    if (!selectedSubtitleId) return null;
    return getSubtitle(selectedSubtitleId) || null;
  }, [selectedSubtitleId, getSubtitle, project.timeline.subtitles]);

  // Get selected clip (check regular clips, text clips, and shape clips)
  const selectedClip = useMemo(() => {
    if (selectedClipIds.length !== 1) return null;
    const clipId = selectedClipIds[0];
    const regularClip = getClip(clipId);
    if (regularClip) return regularClip;
    const titleEngine = getTitleEngine();
    const textClip = titleEngine?.getTextClip(clipId);
    if (textClip) {
      return {
        id: textClip.id,
        mediaId: `text-${textClip.id}`,
        startTime: textClip.startTime,
        duration: textClip.duration,
        inPoint: 0,
        outPoint: textClip.duration,
        transform: textClip.transform || {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        effects: [],
        text: textClip.text,
        trackId: textClip.trackId,
      };
    }
    const graphicsEngine = getGraphicsEngine();
    const shapeClip = graphicsEngine?.getShapeClip(clipId);
    if (shapeClip) {
      return {
        id: shapeClip.id,
        mediaId: `shape-${shapeClip.id}`,
        startTime: shapeClip.startTime,
        duration: shapeClip.duration,
        inPoint: 0,
        outPoint: shapeClip.duration,
        transform: shapeClip.transform || {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        effects: [],
        shapeType: shapeClip.shapeType,
        trackId: shapeClip.trackId,
      };
    }
    const svgClip = graphicsEngine?.getSVGClip(clipId);
    if (svgClip) {
      return {
        id: svgClip.id,
        mediaId: `svg-${svgClip.id}`,
        startTime: svgClip.startTime,
        duration: svgClip.duration,
        inPoint: 0,
        outPoint: svgClip.duration,
        transform: svgClip.transform || {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        effects: [],
        svgContent: svgClip.svgContent,
        trackId: svgClip.trackId,
      };
    }
    const stickerClip = graphicsEngine?.getStickerClip(clipId);
    if (stickerClip) {
      return {
        id: stickerClip.id,
        mediaId: `sticker-${stickerClip.id}`,
        startTime: stickerClip.startTime,
        duration: stickerClip.duration,
        inPoint: 0,
        outPoint: stickerClip.duration,
        transform: stickerClip.transform || {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        effects: [],
        imageUrl: stickerClip.imageUrl,
        trackId: stickerClip.trackId,
      };
    }
    return null;
  }, [
    selectedClipIds,
    getClip,
    getTitleEngine,
    getGraphicsEngine,
    project.modifiedAt,
  ]);

  // Get current clip ID for child sections that look up state by clipId.
  const clipId = selectedClip?.id || "";

  // Transform / video-effect / quick-action handlers used to live here. They
  // were removed in V6 along with the Inspector sections that consumed them:
  // Transform controls now live in the Video tab (VideoBasicTab), Background
  // Removal / Auto-Color were dropped because they duplicated either the
  // VideoBasicTab adjustments or the (now-gone) Video Effects bridge.
  // Auto-captions UX moved to the Captions left-panel tab (V6) — see
  // apps/web/src/components/editor/captions/CaptionsPanel.tsx.

  /**
   * Detect clip type based on track type and clip properties
   */
  const clipType = useMemo(() => {
    if (!selectedClip) return null;

    // Check mediaId prefix first for text, shape, and SVG clips (they may not be in timeline tracks)
    if (selectedClip.mediaId.startsWith("text-")) {
      return "text";
    }

    if (selectedClip.mediaId.startsWith("shape-")) {
      return "shape";
    }

    if (selectedClip.mediaId.startsWith("svg-")) {
      return "svg";
    }

    if (
      selectedClip.mediaId.startsWith("sticker-") ||
      selectedClip.mediaId.startsWith("emoji-")
    ) {
      return "sticker";
    }

    // Find the track this clip belongs to
    const track = project.timeline.tracks.find((t) =>
      t.clips.some((c) => c.id === selectedClip.id),
    );

    if (!track) return "video";

    // Check for clip types based on track type and media
    const mediaItem = project.mediaLibrary.items.find(
      (item) => item.id === selectedClip.mediaId,
    );

    if (track.type === "audio") {
      return "audio";
    }

    if (track.type === "image" || mediaItem?.type === "image") {
      return "image";
    }

    // Default to video for video tracks
    return "video";
  }, [selectedClip, project.timeline.tracks, project.mediaLibrary.items]);

  /**
   * Determine which sections to show based on clip type. After V6 trim only
   * Crop, Blending and Entry/Exit Transitions remain for video/image clips —
   * shape/svg keep their dedicated property editors.
   */
  const showShapeSection = clipType === "shape";
  const showSVGSection = clipType === "svg";
  const showVideoControls = clipType === "video" || clipType === "image";

  // Top inspector tabs. Only the three with real backing engines remain:
  //   - Video: writes to clip transform via project-store
  //   - Audio: writes volume/fade to clip via project-store
  //   - Speed: writes via getSpeedEngine() + project-store
  const mainTabs: MainTab[] = useMemo(() => {
    const isAudio = clipType === "audio";
    const isVisual =
      clipType === "video" ||
      clipType === "image" ||
      clipType === "text" ||
      clipType === "shape" ||
      clipType === "svg" ||
      clipType === "sticker";
    return [
      { id: "video", label: isAudio ? "Visual" : "Video", enabled: isVisual },
      { id: "audio", label: "Audio", enabled: isAudio || clipType === "video" },
      { id: "speed", label: "Speed", enabled: !!selectedClip },
    ];
  }, [clipType, selectedClip]);

  // Auto-switch when the current tab becomes disabled for the new selection.
  React.useEffect(() => {
    const target = mainTabs.find((t) => t.id === activeMainTab);
    if (!target || !target.enabled) {
      const firstEnabled = mainTabs.find((t) => t.enabled);
      if (firstEnabled) setActiveMainTab(firstEnabled.id);
    }
  }, [mainTabs, activeMainTab]);

  return (
    <div
      data-tour="inspector"
      className="w-full h-full min-w-0 bg-background-secondary border-l border-border flex flex-col overflow-y-auto custom-scrollbar"
    >
      <div className="p-5">
        <h2 className="text-sm font-bold text-text-primary mb-5 tracking-tight">
          {selectedClip ? t("inspector") : "Details"}
        </h2>

        {selectedClip ? (
          <>
            {clipType === "text" ? (
              // Text-clip-dedicated inspector: Text | Animation top tabs with
              // their own Basic / Bubble / Effects and In / Out sub-tabs. The
              // legacy Video / Audio / Speed tabs don't apply to text clips —
              // there's no source media, no audio track, and no speed retime
              // semantics, so we replace them entirely.
              <div className="mb-4">
                <TextClipInspector clipId={clipId} />
              </div>
            ) : (
              <>
                {/* Top-level tabs (Video / Audio / Speed) — only those wired
                    to a real engine. Sub-tabs are intentionally not shown
                    because the previous Basic-only entries had no other
                    working sibling. */}
                <ClipTabs
                  mainTabs={mainTabs}
                  activeMainTab={activeMainTab}
                  onMainTabChange={setActiveMainTab}
                />

                {/* Active-tab content */}
                <div className="mb-4">
                  {activeMainTab === "video" && (
                    <VideoBasicTab
                      clip={selectedClip as Clip}
                      canvasWidth={project.settings.width}
                      canvasHeight={project.settings.height}
                    />
                  )}
                  {activeMainTab === "audio" && (
                    <AudioBasicTab clip={selectedClip as Clip} />
                  )}
                  {activeMainTab === "speed" && (
                    <SpeedTab clip={selectedClip as Clip} />
                  )}
                </div>
              </>
            )}

            {/* Clip Info */}
            <div className="mb-4 p-3 bg-background-tertiary rounded-lg border border-border">
              <p className="text-xs text-text-primary font-medium truncate">
                {selectedClip.id.substring(0, 20)}...
              </p>
              <p className="text-[10px] text-text-muted">
                Duration: {selectedClip.duration.toFixed(2)}s
              </p>
            </div>

            {/* AI Auto-Captions used to live here. It's been promoted to a
                dedicated left-panel tab (CaptionsPanel) so the user can
                customize font / size / position / color / stroke / animation
                BEFORE generating, plus run group-level actions on the
                resulting clips. */}

            {/* Crop */}
            {showVideoControls &&
              selectedClip &&
              !selectedClip.mediaId.startsWith("text-") &&
              !selectedClip.mediaId.startsWith("shape-") &&
              !selectedClip.mediaId.startsWith("svg-") &&
              !selectedClip.mediaId.startsWith("sticker-") && (
                <Section title="Crop" sectionId="crop" defaultOpen={false} tabGroup="video" activeTab={activeMainTab}>
                  <CropSection clip={selectedClip as Clip} />
                </Section>
              )}

            {/* Speed & Direction */}
            {showVideoControls &&
              selectedClip &&
              !selectedClip.mediaId.startsWith("text-") &&
              !selectedClip.mediaId.startsWith("shape-") &&
              !selectedClip.mediaId.startsWith("svg-") &&
              !selectedClip.mediaId.startsWith("sticker-") && (
                <Section
                  title="Speed & Direction"
                  sectionId="speed"
                  defaultOpen={true}
                  tabGroup="speed"
                  activeTab={activeMainTab}
                >
                  <SpeedSection clip={selectedClip as Clip} />
                </Section>
              )}

            {/* Blending - Layer compositing blend modes */}
            {(clipType === "video" ||
              clipType === "image" ||
              clipType === "text" ||
              clipType === "shape" ||
              clipType === "svg" ||
              clipType === "sticker") && (
              <Section
                title="Blending"
                sectionId="blending"
                defaultOpen={false}
                tabGroup="video"
                activeTab={activeMainTab}
              >
                <BlendingSection clipId={clipId} />
              </Section>
            )}

            {/* Entry/Exit Transitions - For all visual clips. Trimmed to a
                basic set (None / Fade / Slide L/R/Up/Down / Zoom in/out) — the
                deeper presets (blur, iris-*, rotate) live in the V5-removed
                feature pack. */}
            {(clipType === "video" ||
              clipType === "image" ||
              clipType === "text" ||
              clipType === "shape" ||
              clipType === "svg" ||
              clipType === "sticker") && (
              <Section
                title="Entry/Exit Transitions"
                sectionId="transitions"
                defaultOpen={false}
                tabGroup="video"
                activeTab={activeMainTab}
              >
                <ClipTransitionSection clipId={clipId} />
              </Section>
            )}

            {showShapeSection && (
              <Section title="Shape Properties" sectionId="shape-properties" tabGroup="video" activeTab={activeMainTab}>
                <ShapeSection clipId={clipId} />
              </Section>
            )}

            {/* SVG Section */}
            {showSVGSection && (
              <Section title="SVG Properties" tabGroup="video" activeTab={activeMainTab}>
                <SVGSection clipId={clipId} />
              </Section>
            )}

          </>
        ) : selectedSubtitle ? (
          <>
            {/* Subtitle Info */}
            <div className="mb-4 p-3 bg-primary/10 rounded-lg border border-primary/30">
              <div className="flex items-center gap-2 mb-1">
                <Captions size={14} className="text-primary" />
                <span className="text-xs font-bold text-primary">Subtitle</span>
              </div>
              <p className="text-[10px] text-text-muted">
                {selectedSubtitle.startTime.toFixed(2)}s -{" "}
                {selectedSubtitle.endTime.toFixed(2)}s
              </p>
            </div>

            {/* Subtitle Text Editor */}
            <Section title="Text Content">
              <div className="space-y-3">
                <textarea
                  value={selectedSubtitle.text}
                  onChange={(e) =>
                    updateSubtitle(selectedSubtitle.id, {
                      text: e.target.value,
                    })
                  }
                  className="w-full h-24 px-3 py-2 bg-background-tertiary border border-border rounded-lg text-xs text-text-primary resize-none focus:outline-none focus:border-primary"
                  placeholder="Enter subtitle text..."
                />
              </div>
            </Section>

            {/* Subtitle Timing */}
            <Section title="Timing">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">
                    Start Time
                  </span>
                  <Input
                    type="number"
                    step="0.1"
                    value={selectedSubtitle.startTime.toFixed(2)}
                    onChange={(e) =>
                      updateSubtitle(selectedSubtitle.id, {
                        startTime: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-20 h-7 text-[10px] bg-background-tertiary border-border text-text-primary text-right"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">
                    End Time
                  </span>
                  <Input
                    type="number"
                    step="0.1"
                    value={selectedSubtitle.endTime.toFixed(2)}
                    onChange={(e) =>
                      updateSubtitle(selectedSubtitle.id, {
                        endTime: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-20 h-7 text-[10px] bg-background-tertiary border-border text-text-primary text-right"
                  />
                </div>
              </div>
            </Section>

            {/* Subtitle Position */}
            <Section title="Position">
              <div className="grid grid-cols-3 gap-2">
                {(["top", "center", "bottom"] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() =>
                      updateSubtitle(selectedSubtitle.id, {
                        style: {
                          ...(selectedSubtitle.style || {}),
                          position: pos,
                        } as typeof selectedSubtitle.style,
                      })
                    }
                    className={`py-1.5 rounded text-[10px] capitalize transition-colors ${
                      (selectedSubtitle.style?.position || "bottom") === pos
                        ? "bg-primary text-primary-foreground"
                        : "bg-background-tertiary border border-border text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </Section>

            {/* Subtitle Animation Style */}
            <Section title="Animation">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">Style</span>
                  <Select
                    value={
                      selectedSubtitle.animationStyle === "karaoke" ||
                      selectedSubtitle.animationStyle === "word-highlight"
                        ? "none"
                        : selectedSubtitle.animationStyle || "none"
                    }
                    onValueChange={(v) =>
                      updateSubtitle(selectedSubtitle.id, {
                        animationStyle: v as CaptionAnimationStyle,
                      })
                    }
                  >
                    <SelectTrigger className="w-auto min-w-[100px] bg-background-tertiary border-border text-text-primary text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background-secondary border-border">
                      {CAPTION_ANIMATION_STYLES.map((style) => (
                        <SelectItem key={style} value={style}>
                          {getAnimationStyleDisplayName(style)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[9px] text-text-muted">
                  {selectedSubtitle.animationStyle === "word-by-word" &&
                    "Shows one word at a time"}
                  {selectedSubtitle.animationStyle === "bounce" &&
                    "Words bounce in as they appear"}
                  {selectedSubtitle.animationStyle === "typewriter" &&
                    "Words appear progressively like typing"}
                  {(!selectedSubtitle.animationStyle ||
                    selectedSubtitle.animationStyle === "none" ||
                    selectedSubtitle.animationStyle === "karaoke" ||
                    selectedSubtitle.animationStyle === "word-highlight") &&
                    "Static text, no animation"}
                </p>
                {selectedSubtitle.animationStyle &&
                  selectedSubtitle.animationStyle !== "none" &&
                  selectedSubtitle.animationStyle !== "karaoke" &&
                  selectedSubtitle.animationStyle !== "word-highlight" &&
                  !selectedSubtitle.words?.length && (
                    <p className="text-[9px] text-amber-400 bg-amber-400/10 p-2 rounded">
                      ⚠️ No word-level timing data. Re-generate captions to
                      enable animation.
                    </p>
                  )}
              </div>
            </Section>

            {/* Subtitle Font Settings */}
            <Section title="Font">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">
                    Font Family
                  </span>
                  <Select
                    value={selectedSubtitle.style?.fontFamily || "Inter"}
                    onValueChange={(v) =>
                      updateSubtitle(selectedSubtitle.id, {
                        style: {
                          ...(selectedSubtitle.style || {}),
                          fontFamily: v,
                        } as typeof selectedSubtitle.style,
                      })
                    }
                  >
                    <SelectTrigger className="max-w-[120px] bg-background-tertiary border-border text-text-primary text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background-secondary border-border max-h-60">
                      <SelectGroup>
                        <SelectLabel className="text-text-muted text-[10px] font-medium">Popular</SelectLabel>
                        {["Inter", "Poppins", "Montserrat", "Roboto", "Open Sans", "Lato", "DM Sans"].map((font) => (
                          <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                            {font}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel className="text-text-muted text-[10px] font-medium">Display</SelectLabel>
                        {["Bebas Neue", "Anton", "Oswald", "Teko", "Staatliches", "Alfa Slab One"].map((font) => (
                          <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                            {font}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel className="text-text-muted text-[10px] font-medium">Elegant</SelectLabel>
                        {["Playfair Display", "Cinzel", "Lora", "Merriweather", "DM Serif Display"].map((font) => (
                          <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                            {font}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel className="text-text-muted text-[10px] font-medium">Handwritten</SelectLabel>
                        {["Pacifico", "Lobster", "Dancing Script", "Caveat", "Permanent Marker"].map((font) => (
                          <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                            {font}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">
                    Font Size
                  </span>
                  <Input
                    type="number"
                    min={12}
                    max={72}
                    value={selectedSubtitle.style?.fontSize || 24}
                    onChange={(e) =>
                      updateSubtitle(selectedSubtitle.id, {
                        style: {
                          ...(selectedSubtitle.style || {}),
                          fontSize: parseInt(e.target.value) || 24,
                        } as typeof selectedSubtitle.style,
                      })
                    }
                    className="w-16 h-7 text-[10px] bg-background-tertiary border-border text-text-primary text-right"
                  />
                </div>
              </div>
            </Section>

            {/* Subtitle Colors */}
            <Section title="Colors">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">
                    Text Color
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedSubtitle.style?.color || "#ffffff"}
                      onChange={(e) =>
                        updateSubtitle(selectedSubtitle.id, {
                          style: {
                            ...(selectedSubtitle.style || {}),
                            color: e.target.value,
                          } as typeof selectedSubtitle.style,
                        })
                      }
                      className="w-6 h-6 rounded border border-border cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-text-muted uppercase">
                      {selectedSubtitle.style?.color || "#ffffff"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">
                    Background
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={
                        selectedSubtitle.style?.backgroundColor?.replace(
                          /rgba?\([^)]+\)/,
                          "#000000",
                        ) || "#000000"
                      }
                      onChange={(e) => {
                        const hex = e.target.value;
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        updateSubtitle(selectedSubtitle.id, {
                          style: {
                            ...(selectedSubtitle.style || {}),
                            backgroundColor: `rgba(${r}, ${g}, ${b}, 0.7)`,
                          } as typeof selectedSubtitle.style,
                        });
                      }}
                      className="w-6 h-6 rounded border border-border cursor-pointer"
                    />
                    <Select
                      value={
                        selectedSubtitle.style?.backgroundColor?.includes("0.7")
                          ? "0.7"
                          : selectedSubtitle.style?.backgroundColor?.includes("0.5")
                            ? "0.5"
                            : "1"
                      }
                      onValueChange={(v) => {
                        const currentBg =
                          selectedSubtitle.style?.backgroundColor ||
                          "rgba(0, 0, 0, 0.7)";
                        const newBg = currentBg.replace(
                          /[\d.]+\)$/,
                          `${v})`,
                        );
                        updateSubtitle(selectedSubtitle.id, {
                          style: {
                            ...(selectedSubtitle.style || {}),
                            backgroundColor: newBg,
                          } as typeof selectedSubtitle.style,
                        });
                      }}
                    >
                      <SelectTrigger className="w-auto min-w-[50px] bg-background-tertiary border-border text-text-primary text-[9px] h-6">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background-secondary border-border">
                        <SelectItem value="0">None</SelectItem>
                        <SelectItem value="0.5">50%</SelectItem>
                        <SelectItem value="0.7">70%</SelectItem>
                        <SelectItem value="1">100%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </Section>

            {/* Delete Subtitle */}
            <div className="pt-4 border-t border-border">
              <button
                onClick={() => {
                  const { removeSubtitle } = useProjectStore.getState();
                  removeSubtitle(selectedSubtitle.id);
                }}
                className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg text-[10px] transition-all"
              >
                Delete Subtitle
              </button>
            </div>
          </>
        ) : (
          <ProjectMetadataTable project={project} previewFps={previewFps} />
        )}
      </div>
    </div>
  );
};

export default InspectorPanel;
