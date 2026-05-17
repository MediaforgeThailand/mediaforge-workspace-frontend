/**
 * CaptionsPanel — left-panel tab for AI Captions in OpenReel Video.
 *
 * Displays:
 *  - Source clip picker
 *  - Language + custom-prompt
 *  - Layout / Font / Style / Animation / Preset sections
 *  - Live preview
 *  - Generate button
 *  - Group control panel (when a caption group exists in the project)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Captions as CaptionsIcon,
  Upload,
  Trash2,
  Loader2,
  Sparkles,
  ChevronDown,
  CheckCircle2,
  Wand2,
  Save,
  Bookmark,
  RefreshCw,
} from "lucide-react";
import { useProjectStore } from "../../stores/project-store";
import { useCaptionsStore } from "../../stores/captions-store";
import { useUIStore } from "../../stores/ui-store";
import { useTimelineStore } from "../../stores/timeline-store";
import { toast } from "../../stores/notification-store";
import { useI18n } from "../../services/i18n";
import {
  ScrollArea,
  LabeledSlider,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/openreel-ui";
import {
  generateCaptions,
  captionSettingsToTextStyle,
  captionPositionToTransform,
} from "../../services/captions-generator";
import {
  AUTO_SUPTITLE_TRACK_NAME,
  autoSuptitleSettingsToTextEmphasisAnimation,
  autoSuptitleSettingsToTextAnimation,
  materializeAutoSuptitleTrack,
} from "../../services/auto-suptitle";
import { CAPTIONS_LANGUAGES } from "../../services/captions-client";
import {
  BUILTIN_CAPTION_PRESETS,
  CAPTION_TEXT_ANIMATION_OPTIONS,
  CAPTION_TRANSITION_OPTIONS,
  applyCaptionCase,
  captionTextAnimationOptionFor,
  captionTransitionOptionFor,
  deleteUserPreset,
  listAllPresets,
  loadUserPresets,
  saveUserPreset,
  type CaptionPreset,
  type CaptionStyleSettings,
} from "../../services/caption-presets";
import {
  BUILTIN_FONT_PRESETS,
  listSavedFonts,
  loadFontFromFile,
  removeFont,
} from "../../services/font-manager";
import type { TextClip, CaptionClipMeta } from "@/lib/openreel-core";

const Section: React.FC<{
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  testId?: string;
}> = ({ title, defaultOpen = true, children, testId }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3 border-b border-border/30 pb-3" data-section={testId}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-2"
      >
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? "" : "-rotate-90"} text-text-muted`}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{title}</span>
      </button>
      {open && <div className="space-y-2 pl-1">{children}</div>}
    </div>
  );
};

const LabelRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-[10px] text-text-secondary">{label}</span>
    {children}
  </div>
);

const Toggle: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; title?: string }> = ({ active, onClick, children, title }) => (
  <button
    onClick={onClick}
    title={title}
    className={`shrink-0 px-2.5 py-1 text-[10px] rounded transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "bg-background-tertiary text-text-secondary hover:text-text-primary"
    }`}
  >
    {children}
  </button>
);

const ColorSwatch: React.FC<{ value: string; onChange: (v: string) => void; testId?: string }> = ({ value, onChange, testId }) => (
  <label className="inline-flex items-center gap-1.5 cursor-pointer">
    <span
      className="inline-block w-5 h-5 rounded border border-border"
      style={{ background: value || "transparent" }}
    />
    <input
      type="color"
      value={hexFromCSS(value)}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testId}
      className="sr-only"
    />
    <span className="text-[10px] text-text-secondary font-mono">{value.slice(0, 9)}</span>
  </label>
);

// Color pickers expect a #RRGGBB string; convert rgba(...) inputs to their hex
// equivalent so the native picker still opens to roughly the right color.
function hexFromCSS(css: string): string {
  if (!css) return "#000000";
  if (css.startsWith("#")) return css.length === 7 ? css : "#000000";
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const [r, g, b] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
    return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
  }
  return "#000000";
}

const DURATION_WARNING_MINUTES = 20;

export const CaptionsPanel: React.FC = () => {
  const t = useI18n();
  const settings = useCaptionsStore((s) => s.settings);
  const updateSettings = useCaptionsStore((s) => s.updateSettings);
  const applySettings = useCaptionsStore((s) => s.applySettings);
  const progress = useCaptionsStore((s) => s.progress);
  const isGenerating = useCaptionsStore((s) => s.isGenerating);
  const setProgress = useCaptionsStore((s) => s.setProgress);
  const setGenerating = useCaptionsStore((s) => s.setGenerating);
  const sourceClipId = useCaptionsStore((s) => s.sourceClipId);
  const setSourceClipId = useCaptionsStore((s) => s.setSourceClipId);
  const language = useCaptionsStore((s) => s.language);
  const setLanguage = useCaptionsStore((s) => s.setLanguage);
  const promptText = useCaptionsStore((s) => s.prompt);
  const setPrompt = useCaptionsStore((s) => s.setPrompt);
  const bulkShiftY = useCaptionsStore((s) => s.bulkShiftY);
  const setBulkShiftY = useCaptionsStore((s) => s.setBulkShiftY);

  const project = useProjectStore((s) => s.project);
  const getClip = useProjectStore((s) => s.getClip);
  const getMediaItem = useProjectStore((s) => s.getMediaItem);
  const getAllTextClips = useProjectStore((s) => s.getAllTextClips);
  const deleteTextClip = useProjectStore((s) => s.deleteTextClip);
  const updateTextStyle = useProjectStore((s) => s.updateTextStyle);
  const updateTextTransform = useProjectStore((s) => s.updateTextTransform);
  const updateTextAnimation = useProjectStore((s) => s.updateTextAnimation);
  const updateClipEmphasisAnimation = useProjectStore((s) => s.updateClipEmphasisAnimation);
  const seekTo = useTimelineStore((s) => s.seekTo);

  const [savedFonts, setSavedFonts] = useState<Array<{ name: string; fileName: string }>>([]);
  const [allPresets, setAllPresets] = useState<CaptionPreset[]>(listAllPresets());
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    void listSavedFonts().then((list) => setSavedFonts(list.map((f) => ({ name: f.name, fileName: f.fileName }))));
  }, []);

  // Sync allPresets if local-storage changes externally — we re-read on focus.
  useEffect(() => {
    const onFocus = () => setAllPresets(listAllPresets());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Clips usable as the source (video / audio with a backing MediaItem)
  const candidateClips = useMemo(() => {
    return project.timeline.tracks
      .filter((tr) => tr.type === "video" || tr.type === "audio")
      .flatMap((tr) => tr.clips.map((c) => ({ ...c, trackName: tr.name, trackType: tr.type })))
      .filter((c) => {
        const item = getMediaItem(c.mediaId);
        return item && (item.type === "video" || item.type === "audio");
      });
  }, [project.timeline.tracks, getMediaItem]);

  // The clip we'll actually use for generation. If the user picked one, use that.
  // Otherwise pick the first candidate (auto-detect).
  const effectiveSourceClipId = useMemo(() => {
    if (sourceClipId && candidateClips.find((c) => c.id === sourceClipId)) return sourceClipId;
    return candidateClips[0]?.id ?? "";
  }, [sourceClipId, candidateClips]);

  const effectiveClipDurationMin = useMemo(() => {
    const clip = candidateClips.find((c) => c.id === effectiveSourceClipId);
    return clip ? clip.duration / 60 : 0;
  }, [effectiveSourceClipId, candidateClips]);

  // Caption-group lookup — gathers all text clips that belong to a group.
  const captionGroups = useMemo(() => {
    const allTextClips = getAllTextClips();
    const groups = new Map<string, { meta: CaptionClipMeta; clips: TextClip[] }>();
    for (const clip of allTextClips) {
      if (!clip.captionMeta) continue;
      const key = clip.captionMeta.groupId;
      const entry = groups.get(key);
      if (entry) {
        entry.clips.push(clip);
      } else {
        groups.set(key, { meta: clip.captionMeta, clips: [clip] });
      }
    }
    return Array.from(groups.values()).sort((a, b) => b.meta.generatedAt - a.meta.generatedAt);
  }, [project.modifiedAt, getAllTextClips]);

  const activeGroup = captionGroups[0]; // most recent

  // Apply settings.bulkShiftY live to the active group.
  useEffect(() => {
    if (!activeGroup) return;
    // refHeight is the canvas height; we shift by px relative to canvas size.
    const refHeight = project.settings.height || 1080;
    const shiftNorm = bulkShiftY / refHeight;
    for (const clip of activeGroup.clips) {
      const base = captionPositionToTransform(settings, refHeight, project.settings.width || 1920);
      updateTextTransform(clip.id, {
        position: { x: base.x, y: base.y + shiftNorm },
      });
    }
    // We intentionally don't include `settings` in deps — bulkShiftY changes
    // alone should retrigger the shift. Re-applying full position resets when
    // the user later restyles via the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkShiftY, activeGroup?.meta.groupId]);

  // ---------------------- Generate handler ----------------------
  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;
    if (!effectiveSourceClipId) {
      toast.error("No source clip", "Add a video or audio clip to the timeline first");
      return;
    }
    const sourceClip = getClip(effectiveSourceClipId);
    if (!sourceClip) {
      toast.error("Source clip not found");
      return;
    }
    const mediaItem = getMediaItem(sourceClip.mediaId);
    if (!mediaItem) {
      toast.error("Missing media for source clip");
      return;
    }
    // Whisper needs audio. Reject pure-image clips and video-only clips up
    // front rather than burning the user's OpenAI quota on a request that
    // will return no words. We use channels/audioTrackCount as the signal —
    // image clips have channels=0, and so do video-only files.
    const hasAudioStream =
      mediaItem.type === "audio" ||
      (mediaItem.metadata?.channels ?? 0) > 0 ||
      (mediaItem.metadata?.audioTrackCount ?? 0) > 0;
    if (!hasAudioStream || mediaItem.type === "image") {
      toast.error(
        "Source clip has no audio",
        "Captions can only be generated for clips with an audio track.",
      );
      return;
    }

    setGenerating(true);
    setProgress({ phase: "extracting", progress: 5, message: "Extracting audio..." });
    try {
      const generated = await generateCaptions({
        clip: sourceClip,
        mediaItem,
        settings,
        language,
        prompt: promptText,
        onProgress: (p) => setProgress(p),
      });

      const materialized = await materializeAutoSuptitleTrack({
        result: {
          whisperResponse: generated.whisperResponse,
          cues: generated.lines,
          meta: generated.meta,
          algorithm: {
            wordsPerLine: settings.wordsPerLine,
            maxLineDuration: settings.maxLineDuration,
            maxCharsPerLine: 42,
            minLineDuration: 0.45,
            maxSilenceGap: 0.75,
            splitOnPunctuation: true,
          },
        },
        settings,
        trackName: AUTO_SUPTITLE_TRACK_NAME,
      });
      if (!materialized) {
        toast.error("Could not create Auto Suptitle track");
        return;
      }

      const firstStart = generated.lines[0]?.startTime ?? null;
      // Reset bulk shift so the user can apply fresh
      setBulkShiftY(0);

      toast.success(
        `Created ${materialized.clips.length} Auto Suptitle clips`,
        `Language: ${generated.meta.language.toUpperCase()}`,
      );

      // Seek to first caption
      if (firstStart !== null) {
        try { seekTo(firstStart); } catch { /* ignore if no seek API */ }
      }

      setTimeout(() => {
        setProgress(null);
      }, 1500);
    } catch (err) {
      console.error("[Auto Suptitle] Generation failed:", err);
      const msg = err instanceof Error ? err.message : "Auto Suptitle generation failed";
      toast.error("Auto Suptitle generation failed", msg);
      setProgress({ phase: "error", progress: 0, message: msg });
      setTimeout(() => setProgress(null), 4000);
    } finally {
      setGenerating(false);
    }
  }, [
    isGenerating,
    effectiveSourceClipId,
    getClip,
    getMediaItem,
    setGenerating,
    setProgress,
    settings,
    language,
    promptText,
    setBulkShiftY,
    seekTo,
  ]);

  // ---------------------- Font upload ----------------------
  const fontFileRef = useRef<HTMLInputElement>(null);
  const handleFontFile = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const fontName = file.name.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, "");
    try {
      await loadFontFromFile(fontName, file);
      const list = await listSavedFonts();
      setSavedFonts(list.map((f) => ({ name: f.name, fileName: f.fileName })));
      updateSettings({ font: fontName });
      toast.success("Font uploaded", fontName);
    } catch (err) {
      toast.error("Font upload failed", err instanceof Error ? err.message : "Unknown error");
    }
  }, [updateSettings]);

  const handleFontDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void handleFontFile(e.dataTransfer.files);
  }, [handleFontFile]);

  // ---------------------- Preset save / load ----------------------
  const handleLoadPreset = (presetId: string) => {
    const preset = allPresets.find((p) => p.id === presetId);
    if (preset) {
      applySettings(preset.settings);
      setSelectedPresetId(presetId);
      toast.success(`Loaded preset: ${preset.name}`);
    }
  };

  const handleSavePreset = () => {
    const name = window.prompt("Preset name:", `My preset ${new Date().toLocaleTimeString()}`);
    if (!name) return;
    const preset: CaptionPreset = {
      id: `user-${Date.now()}`,
      name: name.trim(),
      builtin: false,
      settings,
    };
    saveUserPreset(preset);
    const list = listAllPresets();
    setAllPresets(list);
    setSelectedPresetId(preset.id);
    toast.success(`Saved preset: ${preset.name}`);
  };

  const handleDeletePreset = (presetId: string) => {
    deleteUserPreset(presetId);
    setAllPresets(listAllPresets());
    if (selectedPresetId === presetId) setSelectedPresetId("");
    toast.success("Preset deleted");
  };

  // ---------------------- Group control ----------------------
  const handleDeleteGroup = () => {
    if (!activeGroup) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    for (const clip of activeGroup.clips) {
      deleteTextClip(clip.id);
    }
    setConfirmDelete(false);
    setBulkShiftY(0);
    toast.success(`Removed ${activeGroup.clips.length} caption clips`);
  };

  const handleRestyleGroup = () => {
    if (!activeGroup) return;
    const refHeight = project.settings.height || 1080;
    const refWidth = project.settings.width || 1920;
    const transformPos = captionPositionToTransform(settings, refHeight, refWidth);
    const baseStyle = captionSettingsToTextStyle(settings);
    const animation = autoSuptitleSettingsToTextAnimation(settings);
    const emphasisAnimation = autoSuptitleSettingsToTextEmphasisAnimation(settings);
    for (const clip of activeGroup.clips) {
      updateTextStyle(clip.id, baseStyle);
      updateTextTransform(clip.id, { position: transformPos });
      if (animation) {
        updateTextAnimation(clip.id, animation);
      }
      updateClipEmphasisAnimation(clip.id, emphasisAnimation);
    }
    toast.success(`Restyled ${activeGroup.clips.length} caption clips`);
  };

  const handleSelectAll = () => {
    if (!activeGroup) return;
    const ids = activeGroup.clips.map((c) => c.id);
    useUIStore.getState().selectMultiple(ids.map((id) => ({ type: "clip" as const, id })));
    toast.success(`Selected ${ids.length} caption clips`);
  };

  // ---------------------- Render ----------------------
  // Rendered inside the AssetsPanel <aside>, so this is just a <div> to
  // avoid the "complementary landmark inside another complementary landmark"
  // axe-core violation (landmark-complementary-is-top-level).
  return (
    <div
      data-tour="captions"
      data-testid="captions-panel"
      className="w-full h-full min-w-0 flex flex-col bg-background-secondary border-r border-border relative overflow-hidden"
    >
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {/* Header */}
          <div className="flex items-center gap-2 pb-2 border-b border-border/30">
            <CaptionsIcon size={14} className="text-primary" />
            <h3 className="text-[12px] font-semibold tracking-tight">Auto Suptitle</h3>
          </div>

          {/* ─────── 1. SOURCE ─────── */}
          <Section title="Source" testId="source">
            <LabelRow label="Source clip">
              <Select
                value={effectiveSourceClipId}
                onValueChange={(v) => setSourceClipId(v)}
              >
                <SelectTrigger
                  aria-label="Source clip"
                  className="bg-background-tertiary border-border text-text-primary text-[11px] h-7 w-44"
                  data-testid="captions-source-select"
                >
                  <SelectValue placeholder="Auto-detect first clip" />
                </SelectTrigger>
                <SelectContent className="bg-background-secondary border-border">
                  {candidateClips.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      No video or audio clips
                    </SelectItem>
                  ) : (
                    candidateClips.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.trackName} — {c.duration.toFixed(1)}s
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </LabelRow>
          </Section>

          {/* ─────── Duration warning ─────── */}
          {effectiveSourceClipId && (
            <div
              className={`rounded px-2.5 py-1.5 text-[10px] leading-relaxed ${
                effectiveClipDurationMin > DURATION_WARNING_MINUTES
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  : "bg-blue-500/10 text-blue-400/80"
              }`}
            >
              {effectiveClipDurationMin > DURATION_WARNING_MINUTES
                ? `${t("captions_duration_warning")} (${Math.round(effectiveClipDurationMin)} min)`
                : t("captions_duration_recommendation")}
            </div>
          )}

          {/* ─────── 2. LANGUAGE ─────── */}
          <Section title="Language">
            <LabelRow label="Language">
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger
                  aria-label="Language"
                  className="bg-background-tertiary border-border text-text-primary text-[11px] h-7 w-44"
                  data-testid="captions-language-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background-secondary border-border">
                  {CAPTIONS_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelRow>
            <div>
              <span className="text-[10px] text-text-secondary block mb-1">Prompt (optional — names, jargon)</span>
              <textarea
                value={promptText}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                placeholder="e.g. MediaForge, OpenReel, TikTok"
                className="w-full p-1.5 bg-background-tertiary border border-border rounded text-[11px] text-text-primary resize-none"
                data-testid="captions-prompt"
              />
            </div>
          </Section>

          {/* ─────── 3. LAYOUT ─────── */}
          <Section title="Layout">
            <LabeledSlider
              label="Words per line"
              value={settings.wordsPerLine}
              onChange={(v) => updateSettings({ wordsPerLine: v })}
              min={1}
              max={10}
              step={1}
            />
            <LabeledSlider
              label="Max line duration"
              value={settings.maxLineDuration}
              onChange={(v) => updateSettings({ maxLineDuration: v })}
              min={0.5}
              max={8}
              step={0.1}
              unit="s"
            />
            <div className="pt-1">
              <span className="text-[10px] text-text-secondary block mb-1">Vertical</span>
              <div className="flex gap-1">
                {(["top", "middle", "bottom"] as const).map((p) => (
                  <Toggle
                    key={p}
                    active={settings.positionV === p}
                    onClick={() => updateSettings({ positionV: p })}
                  >
                    {p[0].toUpperCase() + p.slice(1)}
                  </Toggle>
                ))}
              </div>
            </div>
            <div>
              <span className="text-[10px] text-text-secondary block mb-1">Horizontal</span>
              <div className="flex gap-1">
                {(["left", "center", "right"] as const).map((p) => (
                  <Toggle
                    key={p}
                    active={settings.positionH === p}
                    onClick={() => updateSettings({ positionH: p })}
                  >
                    {p[0].toUpperCase() + p.slice(1)}
                  </Toggle>
                ))}
              </div>
            </div>
            <LabeledSlider
              label="Edge margin"
              value={settings.margin}
              onChange={(v) => updateSettings({ margin: v })}
              min={0}
              max={400}
              step={1}
              unit="px"
            />
          </Section>

          {/* ─────── 4. FONT ─────── */}
          <Section title="Font">
            <div className="grid grid-cols-2 gap-1">
              {BUILTIN_FONT_PRESETS.map((f) => (
                <button
                  key={f.name}
                  onClick={() => updateSettings({ font: f.name })}
                  className={`p-1.5 rounded border text-[11px] truncate transition-colors ${
                    settings.font === f.name
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background-tertiary text-text-secondary hover:border-text-secondary"
                  }`}
                  style={{ fontFamily: `"${f.name}", ${f.fallback}`, fontWeight: f.weight }}
                  title={f.label}
                  data-testid={`captions-font-${f.name.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {/* Uploaded fonts */}
            {savedFonts.length > 0 && (
              <div className="pt-1">
                <span className="text-[10px] text-text-secondary block mb-1">Uploaded</span>
                <div className="grid grid-cols-2 gap-1">
                  {savedFonts.map((f) => (
                    <div key={f.name} className="flex items-center gap-1">
                      <button
                        onClick={() => updateSettings({ font: f.name })}
                        className={`flex-1 p-1.5 rounded border text-[11px] truncate transition-colors ${
                          settings.font === f.name
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background-tertiary text-text-secondary hover:border-text-secondary"
                        }`}
                        style={{ fontFamily: `"${f.name}"` }}
                        title={f.fileName}
                      >
                        {f.name}
                      </button>
                      <button
                        onClick={async () => {
                          await removeFont(f.name);
                          const list = await listSavedFonts();
                          setSavedFonts(list.map((sf) => ({ name: sf.name, fileName: sf.fileName })));
                          toast.success(`Removed ${f.name}`);
                        }}
                        title="Remove font"
                        className="p-1 text-text-muted hover:text-red-400"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Upload dropzone */}
            <div
              onClick={() => fontFileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={handleFontDrop}
              className="border border-dashed border-border rounded p-2 cursor-pointer hover:border-primary/50 transition-colors text-center"
              data-testid="captions-font-dropzone"
            >
              <Upload size={12} className="mx-auto mb-1 text-text-muted" />
              <span className="text-[10px] text-text-secondary">Drop .ttf / .otf / .woff to upload</span>
              <input
                ref={fontFileRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                onChange={(e) => handleFontFile(e.target.files)}
                className="hidden"
              />
            </div>
            <LabeledSlider
              label="Size"
              value={settings.size}
              onChange={(v) => updateSettings({ size: v })}
              min={12}
              max={140}
              step={1}
              unit="px"
            />
            <LabelRow label="Weight">
              <Select value={String(settings.weight)} onValueChange={(v) => updateSettings({ weight: parseInt(v, 10) })}>
                <SelectTrigger aria-label="Font weight" className="bg-background-tertiary border-border text-text-primary text-[11px] h-7 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background-secondary border-border">
                  {[300, 400, 500, 600, 700, 800, 900].map((w) => (
                    <SelectItem key={w} value={String(w)}>{w}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelRow>
            <LabelRow label="Italic">
              <Toggle active={settings.italic} onClick={() => updateSettings({ italic: !settings.italic })}>
                {settings.italic ? "On" : "Off"}
              </Toggle>
            </LabelRow>
            <LabelRow label="Case">
              <Select value={settings.case} onValueChange={(v) => updateSettings({ case: v as CaptionStyleSettings["case"] })}>
                <SelectTrigger aria-label="Text case" className="bg-background-tertiary border-border text-text-primary text-[11px] h-7 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background-secondary border-border">
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="upper">UPPER</SelectItem>
                  <SelectItem value="lower">lower</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                </SelectContent>
              </Select>
            </LabelRow>
          </Section>

          {/* ─────── 5. STYLE ─────── */}
          <Section title="Style">
            <LabelRow label="Fill">
              <ColorSwatch value={settings.fill} onChange={(v) => updateSettings({ fill: v })} testId="captions-fill-color" />
            </LabelRow>
            {/* Stroke */}
            <div className="border-t border-border/20 pt-2">
              <LabelRow label="Stroke">
                <Toggle active={settings.stroke.enabled} onClick={() => updateSettings({ stroke: { ...settings.stroke, enabled: !settings.stroke.enabled } })}>
                  {settings.stroke.enabled ? "On" : "Off"}
                </Toggle>
              </LabelRow>
              {settings.stroke.enabled && (
                <div className="pl-2 mt-1 space-y-1">
                  <LabelRow label="Color">
                    <ColorSwatch value={settings.stroke.color} onChange={(v) => updateSettings({ stroke: { ...settings.stroke, color: v } })} />
                  </LabelRow>
                  <LabeledSlider
                    label="Width"
                    value={settings.stroke.width}
                    onChange={(v) => updateSettings({ stroke: { ...settings.stroke, width: v } })}
                    min={0}
                    max={20}
                    step={1}
                    unit="px"
                  />
                </div>
              )}
            </div>
            {/* Shadow */}
            <div className="border-t border-border/20 pt-2">
              <LabelRow label="Shadow">
                <Toggle active={settings.shadow.enabled} onClick={() => updateSettings({ shadow: { ...settings.shadow, enabled: !settings.shadow.enabled } })}>
                  {settings.shadow.enabled ? "On" : "Off"}
                </Toggle>
              </LabelRow>
              {settings.shadow.enabled && (
                <div className="pl-2 mt-1 space-y-1">
                  <LabelRow label="Color">
                    <ColorSwatch value={settings.shadow.color} onChange={(v) => updateSettings({ shadow: { ...settings.shadow, color: v } })} />
                  </LabelRow>
                  <LabeledSlider label="X" value={settings.shadow.offsetX} onChange={(v) => updateSettings({ shadow: { ...settings.shadow, offsetX: v } })} min={-20} max={20} step={1} />
                  <LabeledSlider label="Y" value={settings.shadow.offsetY} onChange={(v) => updateSettings({ shadow: { ...settings.shadow, offsetY: v } })} min={-20} max={20} step={1} />
                  <LabeledSlider label="Blur" value={settings.shadow.blur} onChange={(v) => updateSettings({ shadow: { ...settings.shadow, blur: v } })} min={0} max={40} step={1} />
                </div>
              )}
            </div>
            {/* Background */}
            <div className="border-t border-border/20 pt-2">
              <LabelRow label="Background">
                <Toggle active={settings.background.enabled} onClick={() => updateSettings({ background: { ...settings.background, enabled: !settings.background.enabled } })}>
                  {settings.background.enabled ? "On" : "Off"}
                </Toggle>
              </LabelRow>
              {settings.background.enabled && (
                <div className="pl-2 mt-1 space-y-1">
                  <LabelRow label="Color">
                    <ColorSwatch value={settings.background.color} onChange={(v) => updateSettings({ background: { ...settings.background, color: v } })} />
                  </LabelRow>
                  <LabeledSlider label="Padding" value={settings.background.padding} onChange={(v) => updateSettings({ background: { ...settings.background, padding: v } })} min={0} max={60} step={1} unit="px" />
                  <LabeledSlider label="Radius" value={settings.background.cornerRadius} onChange={(v) => updateSettings({ background: { ...settings.background, cornerRadius: v } })} min={0} max={40} step={1} unit="px" />
                </div>
              )}
            </div>
          </Section>

          {/* ─────── 6. TEXT TRANSITION ─────── */}
          <Section title="Text transition">
            <div className="grid grid-cols-2 gap-1">
              {CAPTION_TRANSITION_OPTIONS.map((option) => (
                <Toggle
                  key={option.id}
                  active={settings.animation === option.id}
                  onClick={() => updateSettings({ animation: option.id })}
                  title={option.description}
                >
                  {option.label}
                </Toggle>
              ))}
            </div>
            <p className="text-[10px] leading-relaxed text-text-muted">
              {captionTransitionOptionFor(settings.animation).description}
            </p>
          </Section>

          <Section title="Text animation">
            <div className="grid grid-cols-2 gap-1">
              {CAPTION_TEXT_ANIMATION_OPTIONS.map((option) => (
                <Toggle
                  key={option.id}
                  active={(settings.textAnimation ?? "none") === option.id}
                  onClick={() => updateSettings({ textAnimation: option.id })}
                  title={option.description}
                >
                  {option.label}
                </Toggle>
              ))}
            </div>
            <p className="text-[10px] leading-relaxed text-text-muted">
              {captionTextAnimationOptionFor(settings.textAnimation).description}
            </p>
          </Section>

          {/* ─────── 7. PRESETS ─────── */}
          <Section title="Presets">
            <div className="grid grid-cols-2 gap-1">
              {BUILTIN_CAPTION_PRESETS.map((p) => (
                <Toggle
                  key={p.id}
                  active={selectedPresetId === p.id}
                  onClick={() => handleLoadPreset(p.id)}
                  title={p.name}
                >
                  {p.name}
                </Toggle>
              ))}
            </div>
            {loadUserPresets().length > 0 && (
              <div className="pt-1 border-t border-border/20">
                <span className="text-[10px] text-text-secondary block mb-1">Your presets</span>
                <div className="space-y-1">
                  {loadUserPresets().map((p) => (
                    <div key={p.id} className="flex items-center gap-1">
                      <button
                        onClick={() => handleLoadPreset(p.id)}
                        className={`flex-1 p-1 rounded border text-[10px] text-left truncate transition-colors ${
                          selectedPresetId === p.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background-tertiary text-text-secondary hover:border-text-secondary"
                        }`}
                      >
                        {p.name}
                      </button>
                      <button onClick={() => handleDeletePreset(p.id)} className="p-1 text-text-muted hover:text-red-400" title="Delete">
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={handleSavePreset}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-background-tertiary border border-border hover:border-primary rounded text-[10px] text-text-secondary hover:text-primary transition-colors"
              data-testid="captions-save-preset"
            >
              <Save size={10} /> Save current as preset
            </button>
          </Section>

          {/* ─────── 8. LIVE PREVIEW ─────── */}
          <Section title="Preview" defaultOpen testId="preview">
            <CaptionPreview settings={settings} />
          </Section>

          {/* ─────── 9. GENERATE ─────── */}
          <div className="pt-2">
            {progress ? (
              <div className="space-y-2" data-testid="captions-progress">
                <div className="flex items-center gap-2">
                  {progress.phase === "complete" ? (
                    <CheckCircle2 size={14} className="text-green-500" />
                  ) : progress.phase === "error" ? (
                    <Sparkles size={14} className="text-red-400" />
                  ) : (
                    <Loader2 size={14} className="animate-spin text-primary" />
                  )}
                  <span className="text-[11px] text-text-primary truncate">{progress.message}</span>
                </div>
                <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      progress.phase === "error" ? "bg-red-500" : progress.phase === "complete" ? "bg-green-500" : "bg-primary"
                    }`}
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !effectiveSourceClipId}
                className="w-full py-2.5 bg-primary hover:bg-primary/80 disabled:bg-background-tertiary disabled:text-text-muted text-black rounded-md text-[12px] font-bold tracking-tight flex items-center justify-center gap-2 transition-all"
                data-testid="captions-generate"
              >
                <Wand2 size={14} />
                Generate Auto Suptitle
              </button>
            )}
          </div>

          {/* ─────── 10. GROUP CONTROL ─────── */}
          {activeGroup && (
            <div className="mt-3 pt-3 border-t border-border" data-testid="captions-group">
              <div className="flex items-center gap-2 mb-2">
                <Bookmark size={12} className="text-primary" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">Existing Auto Suptitle</span>
              </div>
              <div className="bg-background-tertiary rounded p-2 mb-2 text-[10px] text-text-secondary space-y-0.5" data-testid="captions-group-info">
                <div>Generated: {new Date(activeGroup.meta.generatedAt).toLocaleTimeString()}</div>
                <div>Lines: <span className="text-text-primary">{activeGroup.clips.length}</span></div>
                <div>Language: <span className="text-text-primary">{activeGroup.meta.language.toUpperCase()}</span></div>
                <div>Animation: <span className="text-text-primary">{activeGroup.meta.animation}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-1 mb-2">
                <button onClick={handleSelectAll} className="p-1.5 bg-background-tertiary border border-border hover:border-primary rounded text-[10px] text-text-secondary hover:text-primary transition-colors">Select all</button>
                <button onClick={handleRestyleGroup} className="p-1.5 bg-background-tertiary border border-border hover:border-primary rounded text-[10px] text-text-secondary hover:text-primary transition-colors" data-testid="captions-restyle">Re-style all</button>
                <button onClick={handleGenerate} className="p-1.5 bg-background-tertiary border border-border hover:border-primary rounded text-[10px] text-text-secondary hover:text-primary transition-colors flex items-center justify-center gap-1">
                  <RefreshCw size={10} /> Regenerate
                </button>
                <button
                  onClick={handleDeleteGroup}
                  className={`p-1.5 border rounded text-[10px] transition-colors flex items-center justify-center gap-1 ${
                    confirmDelete
                      ? "bg-red-500/20 border-red-500 text-red-400"
                      : "bg-background-tertiary border-border text-text-secondary hover:border-red-500 hover:text-red-400"
                  }`}
                  data-testid="captions-delete-group"
                >
                  <Trash2 size={10} />
                  {confirmDelete ? "Confirm" : "Delete all"}
                </button>
              </div>
              <LabeledSlider
                label="Shift Y"
                value={bulkShiftY}
                onChange={setBulkShiftY}
                min={-400}
                max={400}
                step={1}
                unit="px"
              />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

/**
 * Tiny live preview box that renders sample text using the current settings.
 * Uses CSS instead of canvas so it updates instantly without re-render passes.
 */
const CaptionPreview: React.FC<{ settings: CaptionStyleSettings }> = ({ settings }) => {
  const sample = applyCaptionCase("Lorem ipsum dolor sit amet", settings.case);
  const textShadow = settings.shadow.enabled
    ? `${settings.shadow.offsetX}px ${settings.shadow.offsetY}px ${settings.shadow.blur}px ${settings.shadow.color}`
    : undefined;
  // Approximate CSS stroke via -webkit-text-stroke (Chromium / Safari support)
  // plus a fallback text-shadow trick wrapped in style-jam string.
  const strokeStyle = settings.stroke.enabled
    ? {
        WebkitTextStroke: `${settings.stroke.width}px ${settings.stroke.color}`,
        paintOrder: "stroke fill",
      }
    : {};
  const bgStyle = settings.background.enabled
    ? {
        background: settings.background.color,
        padding: `${settings.background.padding}px`,
        borderRadius: `${settings.background.cornerRadius}px`,
      }
    : {};

  return (
    <div
      data-testid="captions-preview"
      className="w-full h-24 bg-neutral-900 rounded border border-border flex items-center justify-center overflow-hidden relative"
      style={{
        justifyContent: settings.positionH === "left" ? "flex-start" : settings.positionH === "right" ? "flex-end" : "center",
        alignItems: settings.positionV === "top" ? "flex-start" : settings.positionV === "bottom" ? "flex-end" : "center",
        padding: "8px",
      }}
    >
      <div
        style={{
          fontFamily: `"${settings.font}", system-ui, sans-serif`,
          fontWeight: settings.weight,
          fontStyle: settings.italic ? "italic" : "normal",
          fontSize: `${Math.min(28, settings.size * 0.4)}px`,
          color: settings.fill,
          textShadow,
          ...strokeStyle,
          ...bgStyle,
          lineHeight: 1.2,
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        {sample}
      </div>
    </div>
  );
};
