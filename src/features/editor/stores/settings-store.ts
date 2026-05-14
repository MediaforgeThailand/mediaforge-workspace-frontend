import { create } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";
import { onSessionLock } from "../services/secure-storage";

export interface ServiceConfig {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly docsUrl?: string;
}

/**
 * Registry of supported external services that require API keys.
 * Add new services here as the app integrates more third-party APIs.
 */
export const SERVICE_REGISTRY: readonly ServiceConfig[] = [
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    description: "AI voice generation and text-to-speech",
    docsUrl: "https://elevenlabs.io/docs/api-reference",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT models for script generation and AI features",
    docsUrl: "https://platform.openai.com/docs/api-reference",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude models for AI-assisted editing",
    docsUrl: "https://docs.anthropic.com/en/docs",
  },
  {
    id: "kie-ai",
    label: "Kie.ai",
    description: "AI aggregator for video/image generation, upscaling, and editing",
    docsUrl: "https://kie.ai",
  },
  {
    id: "freepik",
    label: "Freepik",
    description: "AI aggregator for image generation, vectors, and creative assets",
    docsUrl: "https://www.freepik.com/api",
  },
] as const;

export type TtsProvider = "piper" | "elevenlabs";
export type LlmProvider = "openai" | "anthropic";
export type AggregatorProvider = "kie-ai" | "freepik";
export type SettingsTab = "general" | "rendering" | "api-keys";

/**
 * Preview renderer mode (NOT export — export always uses WebCodecs when
 * available and FFmpeg.wasm as a fallback, both fully local).
 *
 * - `auto`     — prefer WebGPU when supported, else Canvas2D. Recommended.
 * - `webgpu`   — fail (and toast) if no GPU adapter is available.
 * - `canvas2d` — skip WebGPU init entirely; pure CPU-side compositing.
 *
 * The choice is persisted to localStorage and applied on next renderer
 * init (which happens on page reload or when the renderer is recreated).
 */
export type RendererMode = "auto" | "webgpu" | "canvas2d";

export interface SettingsState {
  // General preferences
  autoSave: boolean;
  autoSaveInterval: number;
  language: string;
  // Preview playback FPS — clamped to [15, 60]. Throttles the render loop
  // so it doesn't render faster than the user wants. Default 30 matches the
  // most common timeline frame rate; 60 is the cinematic-smooth upper bound.
  previewFps: number;
  // Preview renderer choice — see RendererMode comments. Default "auto"
  // gives the user the fastest path (WebGPU) but falls back to Canvas2D
  // when WebGPU isn't available. Both run entirely on the user's device.
  rendererMode: RendererMode;

  // AI/Service preferences
  defaultTtsProvider: TtsProvider;
  defaultLlmProvider: LlmProvider;
  defaultAggregator: AggregatorProvider;
  elevenLabsModel: string;
  favoriteVoices: Array<{ voiceId: string; name: string; previewUrl?: string }>;
  favoriteModels: Array<{ modelId: string; name: string }>;
  configuredServices: string[]; // IDs of services with stored API keys

  // Session-scoped API caches (cleared on session lock, not persisted)
  cachedElevenLabsVoices: Array<{ voice_id: string; name: string; category: string; labels: Record<string, string>; preview_url?: string }> | null;
  cachedElevenLabsModels: Array<{ model_id: string; name: string; description?: string; can_do_text_to_speech?: boolean; languages?: Array<{ language_id: string; name: string }> }> | null;

  // Settings dialog state
  settingsOpen: boolean;
  settingsTab: SettingsTab;

  // Actions
  setAutoSave: (enabled: boolean) => void;
  setAutoSaveInterval: (minutes: number) => void;
  setLanguage: (lang: string) => void;
  setPreviewFps: (fps: number) => void;
  setRendererMode: (mode: RendererMode) => void;
  setDefaultTtsProvider: (provider: TtsProvider) => void;
  setDefaultLlmProvider: (provider: LlmProvider) => void;
  setDefaultAggregator: (provider: AggregatorProvider) => void;
  setElevenLabsModel: (model: string) => void;
  addFavoriteVoice: (voice: { voiceId: string; name: string; previewUrl?: string }) => void;
  removeFavoriteVoice: (voiceId: string) => void;
  addFavoriteModel: (model: { modelId: string; name: string }) => void;
  removeFavoriteModel: (modelId: string) => void;
  addConfiguredService: (serviceId: string) => void;
  removeConfiguredService: (serviceId: string) => void;
  setCachedElevenLabsVoices: (voices: SettingsState["cachedElevenLabsVoices"]) => void;
  setCachedElevenLabsModels: (models: SettingsState["cachedElevenLabsModels"]) => void;
  clearApiCaches: () => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        autoSave: true,
        autoSaveInterval: 5,
        language: "en",
        previewFps: 30,
        rendererMode: "auto" as RendererMode,

        defaultTtsProvider: "elevenlabs" as TtsProvider,
        defaultLlmProvider: "openai" as LlmProvider,
        defaultAggregator: "kie-ai" as AggregatorProvider,
        elevenLabsModel: "eleven_v3",
        favoriteVoices: [],
        favoriteModels: [],
        configuredServices: [],

        cachedElevenLabsVoices: null,
        cachedElevenLabsModels: null,

        settingsOpen: false,
        settingsTab: "general" as SettingsTab,

        setAutoSave: (enabled: boolean) => set({ autoSave: enabled }),

        setAutoSaveInterval: (minutes: number) =>
          set({ autoSaveInterval: Math.max(1, Math.min(30, minutes)) }),

        setLanguage: (lang: string) => set({ language: lang }),

        setPreviewFps: (fps: number) =>
          // Clamp to [15, 60]: below 15 the playhead jitters visibly, above 60
          // is wasted work because most displays cap at 60Hz refresh anyway.
          set({ previewFps: Math.max(15, Math.min(60, Math.round(fps))) }),

        setRendererMode: (mode: RendererMode) => set({ rendererMode: mode }),

        setDefaultTtsProvider: (provider: TtsProvider) =>
          set({ defaultTtsProvider: provider }),

        setDefaultLlmProvider: (provider: LlmProvider) =>
          set({ defaultLlmProvider: provider }),

        setDefaultAggregator: (provider: AggregatorProvider) =>
          set({ defaultAggregator: provider }),

        setElevenLabsModel: (model: string) =>
          set({ elevenLabsModel: model }),

        addFavoriteVoice: (voice) => {
          const { favoriteVoices } = get();
          if (!favoriteVoices.some((v) => v.voiceId === voice.voiceId)) {
            set({ favoriteVoices: [...favoriteVoices, voice] });
          }
        },

        removeFavoriteVoice: (voiceId: string) => {
          const { favoriteVoices } = get();
          set({ favoriteVoices: favoriteVoices.filter((v) => v.voiceId !== voiceId) });
        },

        addFavoriteModel: (model) => {
          const { favoriteModels } = get();
          if (!favoriteModels.some((m) => m.modelId === model.modelId)) {
            set({ favoriteModels: [...favoriteModels, model] });
          }
        },

        removeFavoriteModel: (modelId: string) => {
          const { favoriteModels } = get();
          set({ favoriteModels: favoriteModels.filter((m) => m.modelId !== modelId) });
        },

        addConfiguredService: (serviceId: string) => {
          const { configuredServices } = get();
          if (!configuredServices.includes(serviceId)) {
            set({ configuredServices: [...configuredServices, serviceId] });
          }
        },

        removeConfiguredService: (serviceId: string) => {
          const { configuredServices } = get();
          set({
            configuredServices: configuredServices.filter((id) => id !== serviceId),
          });
        },

        setCachedElevenLabsVoices: (voices) =>
          set({ cachedElevenLabsVoices: voices }),

        setCachedElevenLabsModels: (models) =>
          set({ cachedElevenLabsModels: models }),

        clearApiCaches: () =>
          set({ cachedElevenLabsVoices: null, cachedElevenLabsModels: null }),

        openSettings: (tab?: SettingsTab) =>
          set({
            settingsOpen: true,
            settingsTab: tab ?? get().settingsTab,
          }),

        closeSettings: () => set({ settingsOpen: false }),
      }),
      {
        name: "openreel-settings",
        version: 2,
        partialize: (state) => ({
          autoSave: state.autoSave,
          autoSaveInterval: state.autoSaveInterval,
          language: state.language,
          previewFps: state.previewFps,
          rendererMode: state.rendererMode,
          defaultTtsProvider: state.defaultTtsProvider,
          defaultLlmProvider: state.defaultLlmProvider,
          defaultAggregator: state.defaultAggregator,
          elevenLabsModel: state.elevenLabsModel,
          favoriteVoices: state.favoriteVoices,
          favoriteModels: state.favoriteModels,
          configuredServices: state.configuredServices,
        }),
      },
    ),
  ),
);

// Clear API caches when the secure session locks
onSessionLock(() => {
  useSettingsStore.getState().clearApiCaches();
});
