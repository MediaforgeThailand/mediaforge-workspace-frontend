import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  Search,
  Command,
  ChevronDown,
  FileVideo,
  Film,
  Music,
  Sun,
  Moon,
  SunMoon,
  Loader2,
  X,
  Check,
  FileCode,
  Settings,
  Zap,
  Circle,
  History,
  Diamond,
  Sparkles,
  Play,
  UserPlus,
  Menu as MenuIcon,
} from "lucide-react";
import { useProjectStore } from "../stores/project-store";
import { useUIStore } from "../stores/ui-store";
import { useThemeStore } from "../stores/theme-store";
import { useRouter } from "../hooks/use-router";
import {
  getExportEngine,
  getDeviceProfile,
  estimateExportTime,
  type VideoExportSettings,
  type AudioExportSettings,
  type ExportResult,
  type DeviceProfile,
  type TimeEstimate,
} from "@/lib/openreel-core";
import { ExportDialog } from "./ExportDialog";
import { ScreenRecorder } from "./ScreenRecorder";
import { HistoryPanel } from "./inspector/HistoryPanel";
// ProjectSwitcher removed from toolbar — inline editable title now handles
// rename, and Menu → New Project covers creating a fresh project. Recent
// projects are still reachable from the Welcome screen.
import { SettingsDialog } from "./settings/SettingsDialog";
import { toast } from "../stores/notification-store";
import { useSettingsStore } from "../stores/settings-store";
import { useAnalytics, AnalyticsEvents } from "../hooks/useAnalytics";
import { startTour, ONBOARDING_KEY, startMoGraphTour, MOGRAPH_TOUR_KEY } from "./tour";
import { autoSaveManager } from "../services/auto-save";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/openreel-ui";
import { useI18n, useI18nStore } from "../services/i18n";
// Supabase client is lazy-loaded inside the MediaForge export branch — it
// only matters when the user actually exports to cloud. Keeping it static
// pulled @supabase/supabase-js into the main editor bundle.
import { Cloud } from "lucide-react";
import { projectManager } from "../services/project-manager";

type ExportType =
  | "mp4"
  | "prores"
  | "gif"
  | "wav"
  | "4k-master"
  | "4k-prores"
  | "4k"
  | "1080p-high"
  | "4k-60-master"
  | "1080p-60"
  | "project"
  | "mediaforge";

interface ExportState {
  isExporting: boolean;
  progress: number;
  phase: string;
  error: string | null;
  complete: boolean;
}

export const Toolbar: React.FC = () => {
  const { project, renameProject, createNewProject } = useProjectStore();
  const {
    openModal,
    selectedItems,
    setExportState: setGlobalExportState,
    keyframeEditorOpen,
    toggleKeyframeEditor,
    panels,
    togglePanel,
  } = useUIStore();
  const { mode: themeMode, toggleTheme } = useThemeStore();
  const t = useI18n();
  const currentLocale = useI18nStore((s) => s.locale);
  const toggleLocale = useI18nStore((s) => s.toggleLocale);
  const { navigate } = useRouter();
  const { openSettings } = useSettingsStore();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const { importMedia } = useProjectStore();
  const { track } = useAnalytics();

  // Inline-editable project name (CapCut-style — click to edit, no pill chrome)
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // V4: "unsaved changes" dirty indicator.
  // We track the most recent saved timestamp from the autoSaveManager event.
  // If `project.modifiedAt` is newer than `lastSavedAt`, we render a small dot
  // after the project name to signal "you have unsaved local changes".
  // (Auto-save eventually catches up; manual Cmd+S also fires "saved".)
  const [lastSavedAt, setLastSavedAt] = useState<number>(() => project.modifiedAt);
  useEffect(() => {
    const onSaved = (data: unknown) => {
      const d = data as { timestamp?: number } | undefined;
      if (d?.timestamp) setLastSavedAt(d.timestamp);
      else setLastSavedAt(Date.now());
    };
    autoSaveManager.on("saved", onSaved);
    return () => autoSaveManager.off("saved", onSaved);
  }, []);
  // The dot should appear immediately on the first edit so users see "you
  // have unsaved changes" without waiting. Auto-save debounces 2s before
  // persisting (debounceTime config), so the dot is naturally hidden a few
  // seconds later when the `saved` event fires — no flicker risk.
  // V6-final: 0ms threshold matches industry NLE conventions (CapCut /
  // Premiere / FCP all flip the dirty indicator on the first edit).
  const isDirty = project.modifiedAt > lastSavedAt;

  useEffect(() => {
    setEditName(project.name);
  }, [project.name]);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleSaveName = useCallback(async () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== project.name) {
      await renameProject(trimmed);
    } else {
      setEditName(project.name);
    }
    setIsEditingName(false);
  }, [editName, project.name, renameProject]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSaveName();
      } else if (e.key === "Escape") {
        setEditName(project.name);
        setIsEditingName(false);
      }
    },
    [handleSaveName, project.name],
  );

  // Menu dropdown actions
  const handleNewProject = useCallback(() => {
    createNewProject();
  }, [createNewProject]);

  const handleSaveProject = useCallback(async () => {
    try {
      const ok = await projectManager.saveProject(project);
      if (ok) {
        toast.success("Project saved");
      } else {
        toast.error("Save failed");
      }
    } catch (e) {
      toast.error("Save failed", String(e));
    }
  }, [project]);

  const dispatchShortcut = useCallback((name: string) => {
    window.dispatchEvent(new CustomEvent(name));
  }, []);

  const handleShare = useCallback(() => {
    setIsExportOpen(true);
  }, []);

  const handleStartTour = useCallback(() => {
    localStorage.removeItem(ONBOARDING_KEY);
    startTour();
  }, []);

  const handleStartMoGraphTour = useCallback(() => {
    localStorage.removeItem(MOGRAPH_TOUR_KEY);
    startMoGraphTour();
  }, []);

  // Retained for future "selected-clip aware" surfaces. Touch unused-locals.
  void selectedItems;
  const [exportState, setExportState] = useState<ExportState>({
    isExporting: false,
    progress: 0,
    phase: "",
    error: null,
    complete: false,
  });
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile | null>(null);
  const [exportEstimates, setExportEstimates] = useState<Map<string, TimeEstimate>>(new Map());

  useEffect(() => {
    setGlobalExportState({
      isExporting: exportState.isExporting,
      progress: exportState.progress,
      phase: exportState.phase,
    });
  }, [exportState.isExporting, exportState.progress, exportState.phase, setGlobalExportState]);

  // Wire Cmd/Ctrl+S and Cmd/Ctrl+E keyboard shortcuts. The shortcut hook
  // dispatches "openreel:save" / "openreel:export" because save and export
  // state are local to this toolbar.
  useEffect(() => {
    const onSave = async () => {
      try {
        const ok = await projectManager.saveProject(project);
        if (ok) {
          toast.success("Project saved");
        } else {
          toast.error("Save failed");
        }
      } catch (e) {
        toast.error("Save failed", String(e));
      }
    };
    const onExport = () => setIsExportOpen(true);
    // Cmd/Ctrl+K → open search modal. Cmd/Ctrl+, → open settings. Both are
    // wired here because the openModal/openSettings handles live on local
    // UI state hooks that any-mount component cannot reach directly.
    const onOpenSearch = () => openModal("search");
    const onOpenSettings = () => openSettings();
    window.addEventListener("openreel:save", onSave);
    window.addEventListener("openreel:export", onExport);
    window.addEventListener("openreel:open-search", onOpenSearch);
    window.addEventListener("openreel:open-settings", onOpenSettings);
    return () => {
      window.removeEventListener("openreel:save", onSave);
      window.removeEventListener("openreel:export", onExport);
      window.removeEventListener("openreel:open-search", onOpenSearch);
      window.removeEventListener("openreel:open-settings", onOpenSettings);
    };
  }, [project, openModal, openSettings]);

  useEffect(() => {
    if (isExportOpen && !deviceProfile) {
      getDeviceProfile()
        .then(setDeviceProfile)
        .catch((err) => console.warn("[Toolbar] getDeviceProfile failed:", err));
    }
  }, [isExportOpen, deviceProfile]);

  useEffect(() => {
    if (!deviceProfile || !project.timeline?.duration) {
      return;
    }

    const duration = project.timeline.duration;
    const estimates = new Map<string, TimeEstimate>();

    const configs: Array<{ key: string; width: number; height: number; frameRate: number; codec: "h264" | "h265" | "vp9" | "av1" }> = [
      { key: "mp4", width: project.settings.width, height: project.settings.height, frameRate: 30, codec: "h264" },
      { key: "4k", width: 3840, height: 2160, frameRate: 30, codec: "h264" },
      { key: "4k-60-master", width: 3840, height: 2160, frameRate: 60, codec: "h264" },
      { key: "4k-master", width: 3840, height: 2160, frameRate: 30, codec: "h264" },
      { key: "1080p-high", width: 1920, height: 1080, frameRate: 30, codec: "h264" },
      { key: "1080p-60", width: 1920, height: 1080, frameRate: 60, codec: "h264" },
      { key: "prores", width: project.settings.width, height: project.settings.height, frameRate: 30, codec: "h264" },
    ];

    for (const config of configs) {
      const estimate = estimateExportTime(deviceProfile, {
        width: config.width,
        height: config.height,
        frameRate: config.frameRate,
        duration,
        codec: config.codec,
      });
      estimates.set(config.key, estimate);
    }

    setExportEstimates(estimates);
  }, [deviceProfile, project.timeline?.duration, project.settings.width, project.settings.height]);

  const handleSearch = useCallback(() => {
    openModal("search");
  }, [openModal]);

  const runExport = useCallback(
    async (videoSettings: Partial<VideoExportSettings>, _ext: string, writableStream: FileSystemWritableFileStream) => {
      const engine = getExportEngine();
      await engine.initialize();

      const generator = engine.exportVideo(project, videoSettings, writableStream);
      let finalResult: ExportResult | undefined;

      while (true) {
        const { value, done } = await generator.next();
        if (done) {
          finalResult = value;
          break;
        }
        setExportState((prev) => ({
          ...prev,
          progress: value.progress * 100,
          phase: value.phase === "complete" ? "Complete!" : `${value.phase}...`,
        }));
      }

      if (finalResult?.success) {
        setExportState((prev) => ({ ...prev, complete: true, phase: "Saved!" }));
        track(AnalyticsEvents.PROJECT_EXPORTED, {
          format: videoSettings.format ?? "mp4",
          codec: videoSettings.codec ?? "h264",
          width: videoSettings.width ?? project.settings.width,
          height: videoSettings.height ?? project.settings.height,
          frameRate: videoSettings.frameRate ?? project.settings.frameRate,
          duration: project.timeline?.duration ?? 0,
        });
      } else {
        throw new Error(finalResult?.error?.message || "Export failed");
      }
    },
    [project, track],
  );

  const showSavePicker = useCallback(async (filename: string, ext: string): Promise<FileSystemWritableFileStream> => {
    const mimeMap: Record<string, string> = {
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      wav: "audio/wav",
    };
    const mime = mimeMap[ext] || "application/octet-stream";

    if ("showSaveFilePicker" in window) {
      const handle = await (window as unknown as {
        showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
      }).showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: "Media file",
          accept: { [mime]: [`.${ext}`] },
        }],
      });
      return handle.createWritable();
    }

    let buffer = new Uint8Array(16 * 1024 * 1024);
    let length = 0;
    let cursor = 0;

    const grow = (needed: number) => {
      if (needed <= buffer.length) return;
      let newSize = buffer.length;
      while (newSize < needed) newSize *= 2;
      const next = new Uint8Array(newSize);
      next.set(buffer.subarray(0, length));
      buffer = next;
    };

    const triggerDownload = () => {
      const blob = new Blob([buffer.slice(0, length)], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const writeBytes = (bytes: Uint8Array, position: number) => {
      const end = position + bytes.byteLength;
      grow(end);
      buffer.set(bytes, position);
      if (end > length) length = end;
      cursor = end;
    };

    return {
      seek(position: number) {
        cursor = position;
        return Promise.resolve();
      },
      write(data: unknown) {
        if (data instanceof ArrayBuffer) {
          writeBytes(new Uint8Array(data), cursor);
        } else if (ArrayBuffer.isView(data)) {
          writeBytes(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), cursor);
        }
        return Promise.resolve();
      },
      close() {
        triggerDownload();
        return Promise.resolve();
      },
      abort() {
        return Promise.resolve();
      },
      truncate() {
        return Promise.resolve();
      },
    } as unknown as FileSystemWritableFileStream;
  }, []);

  const handleExport = useCallback(
    async (type: ExportType) => {
      setIsExportOpen(false);

      // Friendly empty-timeline check — prevents the export engine from
      // running for ~0s and emitting a blank file. Counts both media clips
      // and text/graphic overlays as "content".
      const hasMediaClips = project.timeline.tracks.some(
        (t) => t.clips && t.clips.length > 0,
      );
      const hasOverlays =
        (project.textClips && project.textClips.length > 0) ||
        (project.shapeClips && project.shapeClips.length > 0);
      if (!hasMediaClips && !hasOverlays) {
        toast.error(
          "Nothing to export",
          "Add at least one clip to the timeline before exporting.",
        );
        return;
      }

      try {
        if (type === "mediaforge") {
          // Sign-in check first — dynamic import keeps supabase-js out of
          // the main editor bundle until cloud export is invoked.
          const { isSignedIn } = await import("../services/supabase-client");
          const ok = await isSignedIn();
          if (!ok) {
            setExportState((prev) => ({
              ...prev,
              isExporting: false,
              error:
                "Sign in to MediaForge first (Media tab → MediaForge section)",
            }));
            return;
          }

          // Buffered export to MP4 then upload
          setExportState({
            isExporting: true,
            progress: 0,
            phase: "Exporting to MediaForge...",
            error: null,
            complete: false,
          });

          const engine = getExportEngine();
          await engine.initialize();

          const base = {
            width: project.settings.width,
            height: project.settings.height,
            frameRate: project.settings.frameRate,
          };
          const settings: Partial<VideoExportSettings> = {
            ...base,
            format: "mp4",
            codec: "h264",
            bitrate: 12000,
            quality: 85,
          };

          // Buffer chunks into a single Blob.
          const chunks: BlobPart[] = [];
          const writable = {
            write(chunk: unknown) {
              if (chunk instanceof Uint8Array) {
                // Copy into a tight ArrayBuffer to avoid SharedArrayBuffer typing.
                const copy = new Uint8Array(chunk.byteLength);
                copy.set(chunk);
                chunks.push(copy.buffer);
              } else if (
                typeof chunk === "object" &&
                chunk !== null &&
                "data" in chunk
              ) {
                chunks.push((chunk as { data: BlobPart }).data);
              }
              return Promise.resolve();
            },
            seek() {
              return Promise.resolve();
            },
            close() {
              return Promise.resolve();
            },
            abort() {
              return Promise.resolve();
            },
            truncate() {
              return Promise.resolve();
            },
          } as unknown as FileSystemWritableFileStream;

          const generator = engine.exportVideo(project, settings, writable);
          let finalResult: ExportResult | undefined;
          while (true) {
            const { value, done } = await generator.next();
            if (done) {
              finalResult = value;
              break;
            }
            setExportState((prev) => ({
              ...prev,
              progress: value.progress * 100,
              phase: `${value.phase}...`,
            }));
          }

          if (!finalResult?.success) {
            throw new Error(
              finalResult?.error?.message || "Export to MediaForge failed",
            );
          }

          const blob =
            finalResult.blob || new Blob(chunks, { type: "video/mp4" });
          setExportState((prev) => ({
            ...prev,
            phase: "Uploading to MediaForge...",
            progress: 95,
          }));

          const { uploadExportedVideo } = await import(
            "../services/supabase-client"
          );
          const result = await uploadExportedVideo(
            blob,
            `${project.name || "openreel"}.mp4`,
          );
          if (!result) {
            throw new Error("Upload to MediaForge failed");
          }

          setExportState((prev) => ({
            ...prev,
            complete: true,
            phase: "Saved to MediaForge!",
            progress: 100,
          }));
          toast.success("Saved to MediaForge", result.path);
          track(AnalyticsEvents.PROJECT_EXPORTED, {
            format: "mp4",
            destination: "mediaforge",
            duration: project.timeline?.duration ?? 0,
          });

          setTimeout(() => {
            setExportState({
              isExporting: false,
              progress: 0,
              phase: "",
              error: null,
              complete: false,
            });
          }, 2500);
          return;
        }

        if (type === "wav") {
          const writable = await showSavePicker(`${project.name || "export"}.wav`, "wav");

          setExportState({
            isExporting: true,
            progress: 0,
            phase: "Initializing...",
            error: null,
            complete: false,
          });

          const engine = getExportEngine();
          await engine.initialize();

          const audioSettings: Partial<AudioExportSettings> = {
            format: "wav",
            sampleRate: 48000,
            channels: 2,
            bitDepth: 24,
          };

          const generator = engine.exportAudio(project, audioSettings);
          let finalResult: ExportResult | undefined;

          while (true) {
            const { value, done } = await generator.next();
            if (done) {
              finalResult = value;
              break;
            }
            setExportState((prev) => ({
              ...prev,
              progress: value.progress * 100,
              phase: value.phase === "complete" ? "Complete!" : `${value.phase}...`,
            }));
          }

          if (finalResult?.success && finalResult.blob) {
            if ("showSaveFilePicker" in window) {
              await finalResult.blob.stream().pipeTo(writable as unknown as WritableStream<Uint8Array>);
            } else {
              const url = URL.createObjectURL(finalResult.blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${project.name || "export"}.wav`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }
            setExportState((prev) => ({ ...prev, complete: true, phase: "Saved!" }));
            track(AnalyticsEvents.PROJECT_EXPORTED, {
              format: "wav",
              duration: project.timeline?.duration ?? 0,
            });
          } else {
            try { await writable.abort(); } catch {}
            throw new Error(finalResult?.error?.message || "Export failed");
          }
        } else {
          const base = {
            width: project.settings.width,
            height: project.settings.height,
            frameRate: project.settings.frameRate,
          };

          const presets: Record<string, { settings: Partial<VideoExportSettings>; ext: string }> = {
            mp4: { settings: { ...base, format: "mp4", codec: "h264", bitrate: 12000, quality: 85 }, ext: "mp4" },
            gif: { settings: { ...base, format: "webm", codec: "vp9", bitrate: 8000 }, ext: "webm" },
            project: { settings: { ...base, format: "mp4", codec: "h264", bitrate: 12000, quality: 85 }, ext: "mp4" },
            "4k-60-master": { settings: { ...base, width: 3840, height: 2160, frameRate: 60, format: "mov", codec: "h265", bitrate: 100000, quality: 95 }, ext: "mov" },
            "4k-master": { settings: { ...base, width: 3840, height: 2160, frameRate: 30, format: "mov", codec: "h265", bitrate: 80000, quality: 95 }, ext: "mov" },
            "4k-prores": { settings: { ...base, width: 3840, height: 2160, frameRate: 30, format: "mov", codec: "prores", bitrate: 880000, quality: 100 }, ext: "mov" },
            "4k": { settings: { ...base, width: 3840, height: 2160, frameRate: 30, format: "mp4", codec: "h264", bitrate: 50000, quality: 90 }, ext: "mp4" },
            "1080p-60": { settings: { ...base, width: 1920, height: 1080, frameRate: 60, format: "mp4", codec: "h264", bitrate: 25000, quality: 95 }, ext: "mp4" },
            "1080p-high": { settings: { ...base, width: 1920, height: 1080, frameRate: 30, format: "mp4", codec: "h264", bitrate: 20000, quality: 95 }, ext: "mp4" },
            prores: { settings: { ...base, format: "mov", codec: "prores", bitrate: 220000, quality: 100 }, ext: "mov" },
          };

          const preset = presets[type] ?? presets.mp4;
          const writable = await showSavePicker(`${project.name || "export"}.${preset.ext}`, preset.ext);

          setExportState({
            isExporting: true,
            progress: 0,
            phase: "Initializing...",
            error: null,
            complete: false,
          });

          await runExport(preset.settings, preset.ext, writable);
        }

        setTimeout(() => {
          setExportState({ isExporting: false, progress: 0, phase: "", error: null, complete: false });
        }, 2000);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setExportState((prev) => ({
          ...prev,
          isExporting: false,
          error: error instanceof Error ? error.message : "Export failed",
        }));
      }
    },
    [project, track, runExport, showSavePicker],
  );

  const handleCancelExport = useCallback(() => {
    const engine = getExportEngine();
    engine.cancel();
    setExportState({
      isExporting: false,
      progress: 0,
      phase: "",
      error: null,
      complete: false,
    });
  }, []);

  const handleCustomExport = useCallback(
    async (settings: VideoExportSettings) => {
      setIsExportDialogOpen(false);

      const hasMediaClips = project.timeline.tracks.some(
        (t) => t.clips && t.clips.length > 0,
      );
      const hasOverlays =
        (project.textClips && project.textClips.length > 0) ||
        (project.shapeClips && project.shapeClips.length > 0);
      if (!hasMediaClips && !hasOverlays) {
        toast.error(
          "Nothing to export",
          "Add at least one clip to the timeline before exporting.",
        );
        return;
      }

      try {
        const ext = settings.format === "mov" ? "mov" : settings.format === "webm" ? "webm" : "mp4";
        const writable = await showSavePicker(`${project.name || "export"}.${ext}`, ext);

        setExportState({
          isExporting: true,
          progress: 0,
          phase: "Initializing...",
          error: null,
          complete: false,
        });

        const needsUpscaling =
          settings.width > project.settings.width ||
          settings.height > project.settings.height;

        const exportSettings: Partial<VideoExportSettings> = {
          ...settings,
          upscaling:
            settings.upscaling?.enabled && needsUpscaling
              ? settings.upscaling
              : undefined,
        };

        await runExport(exportSettings, ext, writable);

        track(AnalyticsEvents.PROJECT_EXPORTED, {
          format: settings.format,
          codec: settings.codec,
          width: settings.width,
          height: settings.height,
          frameRate: settings.frameRate,
          duration: project.timeline?.duration ?? 0,
          exportType: "custom",
          upscaling: settings.upscaling?.enabled ?? false,
        });

        setTimeout(() => {
          setExportState({ isExporting: false, progress: 0, phase: "", error: null, complete: false });
        }, 2000);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setExportState((prev) => ({
          ...prev,
          isExporting: false,
          error: error instanceof Error ? error.message : "Export failed",
        }));
      }
    },
    [project, track, runExport, showSavePicker],
  );


  const handleRecordingComplete = useCallback(
    async (screenBlob: Blob, webcamBlob?: Blob) => {
      if (!screenBlob || screenBlob.size === 0) {
        toast.error(
          "Recording failed",
          "No video data was captured. Please try again.",
        );
        return;
      }

      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:-]/g, "");
      let importCount = 0;
      const errors: string[] = [];

      const screenFile = new File([screenBlob], `Screen_${timestamp}.webm`, {
        type: screenBlob.type || "video/webm",
      });
      const screenResult = await importMedia(screenFile);
      if (screenResult.success) {
        importCount++;
      } else {
        errors.push(
          screenResult.error?.message || "Failed to import screen recording",
        );
      }

      if (webcamBlob && webcamBlob.size > 0) {
        const webcamFile = new File([webcamBlob], `Webcam_${timestamp}.webm`, {
          type: webcamBlob.type || "video/webm",
        });
        const webcamResult = await importMedia(webcamFile);
        if (webcamResult.success) {
          importCount++;
        } else {
          errors.push(
            webcamResult.error?.message || "Failed to import webcam recording",
          );
        }
      }

      if (importCount > 0) {
        toast.success(
          `${importCount} recording${importCount > 1 ? "s" : ""} imported!`,
          webcamBlob && webcamBlob.size > 0
            ? "Screen and webcam added to assets. Use the timeline to composite them."
            : "Screen recording added to assets.",
        );
      } else if (errors.length > 0) {
        toast.error("Import failed", errors.join(". "));
      }
    },
    [importMedia],
  );

  const projectRes = `${project.settings.width}×${project.settings.height}`;
  const aspectRatio = project.settings.width / project.settings.height;
  const isVertical = aspectRatio < 0.9;

  const exportOptions: Array<{
    label: string;
    icon: typeof FileVideo;
    desc: string;
    type: ExportType;
    recommended?: boolean;
    separator?: boolean;
  }> = [
    {
      label: "MP4 Standard",
      icon: Zap,
      desc: `${projectRes} H.264 - Web & social`,
      type: "mp4",
      recommended: true,
    },
    {
      label: "",
      icon: Film,
      desc: "",
      type: "mp4",
      separator: true,
    },
    ...(isVertical
      ? []
      : [
          {
            label: "4K Standard",
            icon: FileVideo,
            desc: "3840×2160 - YouTube 4K",
            type: "4k" as ExportType,
          },
        ]),
    {
      label: "1080p High Quality",
      icon: FileVideo,
      desc: "1920×1080 30fps - High bitrate",
      type: "1080p-high",
    },
    {
      label: "1080p 60fps",
      icon: FileVideo,
      desc: "1920×1080 - Smooth playback",
      type: "1080p-60",
    },
    {
      label: "Audio Only (WAV)",
      icon: Music,
      desc: "Uncompressed audio",
      type: "wav",
    },
    {
      label: "",
      icon: Cloud,
      desc: "",
      type: "mediaforge",
      separator: true,
    },
    {
      label: "Save to MediaForge",
      icon: Cloud,
      desc: "Upload MP4 to MediaForge cloud",
      type: "mediaforge",
    },
  ];

  return (
    <div className="h-12 border-b border-border flex items-center px-4 justify-between bg-background shrink-0 z-30 relative">
      {/* Left: Logo + small wordmark + Menu dropdown */}
      <div className="flex items-center gap-2 min-w-[200px]">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => navigate("welcome")}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              title="Back to Home"
              data-testid="brand-logo"
            >
              <img
                src="/mediaforge-logo.svg"
                alt=""
                role="presentation"
                className="h-5 w-auto select-none"
                draggable={false}
              />
              <span className="text-[13px] font-semibold text-text-primary tracking-tight hidden lg:block">
                MediaForge
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Back to Home</TooltipContent>
        </Tooltip>

        {/* Menu dropdown — File / Edit / View / Help, all dispatch existing keyboard events */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-colors text-[12px] font-medium"
              data-testid="toolbar-menu"
              title="Menu"
            >
              <MenuIcon size={14} />
              <span>Menu</span>
              <ChevronDown size={11} className="opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={handleNewProject} className="gap-2">
              <FileVideo size={13} />
              <span>New Project</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSaveProject} className="gap-2">
              <Check size={13} />
              <span>Save</span>
              <span className="ml-auto text-[10px] text-text-secondary font-mono">⌘S</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsExportOpen(true)} className="gap-2">
              <Zap size={13} />
              <span>Export</span>
              <span className="ml-auto text-[10px] text-text-secondary font-mono">⌘E</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => dispatchShortcut("openreel:undo")} className="gap-2">
              <History size={13} />
              <span>Undo</span>
              <span className="ml-auto text-[10px] text-text-secondary font-mono">⌘Z</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => dispatchShortcut("openreel:redo")} className="gap-2">
              <History size={13} className="rotate-180" />
              <span>Redo</span>
              <span className="ml-auto text-[10px] text-text-secondary font-mono">⌘⇧Z</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => useUIStore.getState().openModal("scriptView")} className="gap-2">
              <FileCode size={13} />
              <span>Project JSON</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openSettings()} className="gap-2">
              <Settings size={13} />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleStartTour} className="gap-2">
              <Play size={13} />
              <span>Editor Tour</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleStartMoGraphTour} className="gap-2">
              <Sparkles size={13} className="text-purple-400" />
              <span>Animation Tour</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-text-muted">
              <Command size={13} />
              <span>Press ? for shortcuts</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

      </div>

      {/* Center: Inline-editable project name */}
      <div className="flex-1 flex items-center justify-center px-4">
        {isEditingName ? (
          <input
            ref={nameInputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={handleNameKeyDown}
            data-testid="toolbar-project-name-input"
            className="bg-background-elevated border border-primary/50 rounded-md px-3 py-1 text-[13px] font-medium text-text-primary text-center outline-none min-w-[160px] max-w-[320px]"
          />
        ) : (
          <button
            onClick={() => setIsEditingName(true)}
            data-testid="toolbar-project-name"
            title={isDirty ? "Unsaved changes — click to rename project" : "Click to rename project"}
            className="px-3 py-1 rounded-md text-[13px] font-medium text-text-primary hover:bg-background-elevated transition-colors truncate max-w-[320px] inline-flex items-center gap-1.5"
          >
            <span className="truncate">{project.name}</span>
            {isDirty && (
              <span
                aria-label="Unsaved changes"
                title="Unsaved changes"
                data-testid="toolbar-project-dirty"
                className="inline-block w-1.5 h-1.5 rounded-full bg-primary"
              />
            )}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 min-w-[200px] justify-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md hover:bg-background-elevated text-text-secondary hover:text-text-primary transition-colors"
              aria-label={`Toggle theme (current: ${themeMode})`}
            >
              {themeMode === "light" ? (
                <Sun size={14} />
              ) : themeMode === "dark" ? (
                <Moon size={14} />
              ) : (
                <SunMoon size={14} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Theme: {themeMode}</p>
          </TooltipContent>
        </Tooltip>

        {/* Language toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleLocale}
              className="px-1.5 py-1 rounded-md hover:bg-background-elevated text-text-secondary hover:text-text-primary transition-colors text-[10px] font-bold tracking-wide"
              aria-label="Toggle language"
            >
              {currentLocale === "th" ? "TH" : "EN"}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{currentLocale === "th" ? "ภาษาไทย" : "English"}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleKeyframeEditor}
              className={`p-1.5 rounded-md transition-colors ${
                keyframeEditorOpen
                  ? "bg-primary/20 text-primary"
                  : "hover:bg-background-elevated text-text-secondary hover:text-text-primary"
              }`}
              aria-label="Keyframe editor"
              aria-pressed={keyframeEditorOpen}
            >
              <Diamond size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Keyframe Editor</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => togglePanel("audioMixer")}
              className={`p-1.5 rounded-md transition-colors ${
                panels.audioMixer?.visible
                  ? "bg-primary/20 text-primary"
                  : "hover:bg-background-elevated text-text-secondary hover:text-text-primary"
              }`}
              aria-label="Audio mixer"
              aria-pressed={!!panels.audioMixer?.visible}
            >
              <Music size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Audio Mixer</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className={`p-1.5 rounded-md transition-colors ${
                isHistoryOpen
                  ? "bg-primary/20 text-primary"
                  : "hover:bg-background-elevated text-text-secondary hover:text-text-primary"
              }`}
              aria-label="Undo history"
              aria-pressed={isHistoryOpen}
            >
              <History size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>History</p>
          </TooltipContent>
        </Tooltip>

        {/* Command+K small icon — relocated from middle search bar */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleSearch}
              data-testid="toolbar-search"
              className="p-1.5 rounded-md hover:bg-background-elevated text-text-secondary hover:text-text-primary transition-colors"
              aria-label="Search"
            >
              <Search size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Search ⌘K</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setIsRecorderOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1.5 bg-error/10 hover:bg-error/20 text-error rounded-md transition-colors"
              aria-label="Start screen recording"
            >
              <Circle size={12} className="fill-current" />
              <span className="text-[11px] font-medium">{currentLocale === "th" ? "บันทึก" : "Record"}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Screen Recording</p>
          </TooltipContent>
        </Tooltip>

        {/* Share button — pill with user-plus icon, opens share modal */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleShare}
              data-testid="toolbar-share"
              className="h-8 px-3 bg-background-elevated hover:bg-background-tertiary border border-border text-text-primary rounded-md flex items-center gap-1.5 transition-colors"
              aria-label="Share project"
            >
              <UserPlus size={13} />
              <span className="text-[12px] font-medium">Share</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Share / Export</p>
          </TooltipContent>
        </Tooltip>

        <div className="relative">
          {exportState.isExporting ? (
            <div className="h-8 px-3 bg-background-secondary border border-border rounded-md flex items-center gap-2 min-w-[160px]">
              <Loader2 size={12} className="text-primary animate-spin" />
              <div className="flex-1">
                <div className="text-[9px] text-text-secondary">
                  {exportState.phase}
                </div>
                <div className="h-1 bg-background-tertiary rounded-full mt-0.5 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${exportState.progress}%` }}
                  />
                </div>
              </div>
              <button
                onClick={handleCancelExport}
                className="p-0.5 hover:bg-background-tertiary rounded text-text-muted hover:text-error transition-colors"
              >
                <X size={10} />
              </button>
            </div>
          ) : exportState.error ? (
            <div className="h-8 px-3 bg-error/10 border border-error/30 rounded-md flex items-center gap-2">
              <span className="text-[11px] text-error">{exportState.error}</span>
              <button
                onClick={() =>
                  setExportState((prev) => ({ ...prev, error: null }))
                }
                className="p-0.5 hover:bg-error/20 rounded text-error transition-colors"
              >
                <X size={10} />
              </button>
            </div>
          ) : exportState.complete ? (
            <div className="h-8 px-3 bg-primary/10 border border-primary/30 rounded-md flex items-center gap-2">
              <Check size={12} className="text-primary" />
              <span className="text-[11px] text-primary">Downloaded!</span>
            </div>
          ) : (
            <DropdownMenu open={isExportOpen} onOpenChange={setIsExportOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className={`h-8 px-3 bg-primary hover:brightness-110 active:brightness-95 text-black font-bold rounded-md flex items-center gap-1.5 transition-all ${
                    isExportOpen ? "shadow-none" : ""
                  }`}
                >
                  <span className="text-[12px] tracking-wide">{t("export").toUpperCase()}</span>
                  <ChevronDown
                    size={12}
                    className={`transition-transform duration-200 ${
                      isExportOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 p-0 rounded-xl bg-background-secondary border-border">
                <div className="p-3 space-y-1 max-h-[460px] overflow-y-auto">
                  {exportOptions.map((option, index) =>
                    option.separator ? (
                      <DropdownMenuSeparator key={`sep-${index}`} />
                    ) : (
                      <DropdownMenuItem
                        key={option.type + index}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer ${
                          option.recommended
                            ? "bg-primary/10 hover:bg-primary/20 border border-primary/30"
                            : ""
                        }`}
                        onClick={() => handleExport(option.type)}
                      >
                        <div
                          className={`p-2 rounded-lg transition-colors ${
                            option.recommended
                              ? "bg-primary/20 text-primary"
                              : "bg-background-tertiary group-hover:bg-background-elevated text-text-secondary group-hover:text-primary"
                          }`}
                        >
                          <option.icon size={18} />
                        </div>
                        <div className="flex-1">
                          <div
                            className={`text-sm font-medium transition-colors ${
                              option.recommended
                                ? "text-primary"
                                : "text-text-primary"
                            }`}
                          >
                            {option.label}
                            {option.recommended && (
                              <span className="ml-2 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                                Best Match
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-text-muted mt-0.5">
                            {option.desc}
                          </div>
                          {exportEstimates.get(option.type) && (
                            <div className="text-[10px] text-text-secondary mt-1">
                              Est. {exportEstimates.get(option.type)?.formatted}
                            </div>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ),
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="flex items-center gap-3 p-3 rounded-lg cursor-pointer"
                    onClick={() => setIsExportDialogOpen(true)}
                  >
                    <div className="p-2 bg-primary/10 rounded-lg text-primary transition-colors">
                      <Settings size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-primary transition-colors">
                        Custom Export...
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        Full settings with AI upscaling
                      </div>
                    </div>
                    <Settings
                      size={14}
                      className="text-text-muted"
                    />
                  </DropdownMenuItem>
                </div>
                <div className="bg-background-tertiary px-3 py-2.5 text-xs text-center text-text-muted border-t border-border">
                  {project.settings.width}×{project.settings.height} •{" "}
                  {project.settings.frameRate}fps
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <ExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        onExport={handleCustomExport}
        duration={project.timeline?.duration ?? 0}
        projectWidth={project.settings?.width ?? 1920}
        projectHeight={project.settings?.height ?? 1080}
      />

      <ScreenRecorder
        isOpen={isRecorderOpen}
        onClose={() => setIsRecorderOpen(false)}
        onRecordingComplete={handleRecordingComplete}
      />

      <SettingsDialog />

      {isHistoryOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setIsHistoryOpen(false)}
          />
          <div className="fixed top-12 right-0 bottom-0 w-80 bg-background-secondary border-l border-border z-50 shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <span className="text-sm font-medium text-text-primary">Action History</span>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="h-[calc(100%-49px)]">
              <HistoryPanel />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Toolbar;
