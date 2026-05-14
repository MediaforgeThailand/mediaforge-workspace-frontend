/**
 * Captions tab state — settings panel, generation progress, group selection.
 *
 * The panel reads/writes the entire CaptionStyleSettings object here so it
 * survives tab switches. Generated caption-group metadata is also tracked
 * so the panel can show "Existing Captions" controls.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WhisperTranscriptionProgress } from "@/lib/openreel-core";
import {
  DEFAULT_CAPTION_SETTINGS,
  type CaptionStyleSettings,
} from "../services/caption-presets";

export interface CaptionsState {
  /** Current settings (synced to UI live). */
  settings: CaptionStyleSettings;
  /** Setter — partial update merged in. */
  updateSettings: (changes: Partial<CaptionStyleSettings>) => void;
  /** Reset to defaults. */
  resetSettings: () => void;
  /** Apply a complete settings object (e.g. when loading a preset). */
  applySettings: (settings: CaptionStyleSettings) => void;

  /** Generation progress (null when idle). */
  progress: WhisperTranscriptionProgress | null;
  setProgress: (p: WhisperTranscriptionProgress | null) => void;
  /** Whether a generation pass is currently running. */
  isGenerating: boolean;
  setGenerating: (g: boolean) => void;

  /** Source clip ID the user selected (empty = auto-detect first audio clip). */
  sourceClipId: string;
  setSourceClipId: (id: string) => void;
  /** Whisper language code or "auto". */
  language: string;
  setLanguage: (lang: string) => void;
  /** Optional Whisper prompt. */
  prompt: string;
  setPrompt: (prompt: string) => void;

  /** Bulk Y-axis shift in px (applied live to all clips in the active group). */
  bulkShiftY: number;
  setBulkShiftY: (px: number) => void;
}

export const useCaptionsStore = create<CaptionsState>()(
  persist(
    (set, _get) => ({
      settings: DEFAULT_CAPTION_SETTINGS,
      updateSettings: (changes) =>
        set((state) => ({ settings: { ...state.settings, ...changes } })),
      resetSettings: () => set({ settings: DEFAULT_CAPTION_SETTINGS }),
      applySettings: (settings) => set({ settings }),

      progress: null,
      setProgress: (p) => set({ progress: p }),
      isGenerating: false,
      setGenerating: (g) => set({ isGenerating: g }),

      sourceClipId: "",
      setSourceClipId: (id) => set({ sourceClipId: id }),
      language: "auto",
      setLanguage: (lang) => set({ language: lang }),
      prompt: "",
      setPrompt: (prompt) => set({ prompt }),

      bulkShiftY: 0,
      setBulkShiftY: (px) => set({ bulkShiftY: px }),
    }),
    {
      name: "mediaforge:captions-settings",
      // Don't persist progress / generating / shift — those are per-session.
      partialize: (state) => ({
        settings: state.settings,
        language: state.language,
        prompt: state.prompt,
      }),
    },
  ),
);

// Expose for e2e self-tests (same pattern as project-store / engine-store).
if (typeof window !== "undefined") {
  (window as unknown as { __or_captionsStore?: typeof useCaptionsStore }).__or_captionsStore =
    useCaptionsStore;
}
