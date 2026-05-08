/**
 * Display metadata for AI models surfaced in the Teacher Center.
 *
 * Workspace logs raw model_id strings (e.g. "kling-v2.1") into
 * workspace_activity; the Teacher Center maps them onto friendly
 * names + icons + category for the analytics tables.
 *
 * If a model_id arrives that isn't in this map we render a sensible
 * fallback (truncated id + generic icon) so new models don't break the
 * UI before this map is updated.
 */

export type ModelCategory = "video" | "image" | "text" | "audio" | "other";

export interface ModelMeta {
  display: string;
  category: ModelCategory;
  emoji: string;
  vendor?: string;
}

const MODEL_META: Record<string, ModelMeta> = {
  // Kling AI — video generation
  "kling-v2.1":             { display: "Kling Video v2.1",       category: "video", emoji: "🎬", vendor: "Kling AI" },
  "kling-v1.6":             { display: "Kling Video v1.6",       category: "video", emoji: "🎬", vendor: "Kling AI" },
  // OpenAI image
  "gpt-image-1":            { display: "GPT Image 1",            category: "image", emoji: "🖼️", vendor: "OpenAI" },
  "dall-e-3":               { display: "DALL·E 3",                category: "image", emoji: "🖼️", vendor: "OpenAI" },
  // Stability / Flux
  "flux-schnell":           { display: "Flux Schnell",           category: "image", emoji: "⚡", vendor: "Black Forest Labs" },
  "flux-pro":               { display: "Flux Pro",                category: "image", emoji: "⚡", vendor: "Black Forest Labs" },
  "stable-diffusion-xl":    { display: "Stable Diffusion XL",    category: "image", emoji: "🎨", vendor: "Stability AI" },
  // Text
  "lovable-text":           { display: "Lovable Text Gen",       category: "text",  emoji: "✍️", vendor: "Lovable AI" },
  "gpt-4o-mini":            { display: "GPT-4o mini",             category: "text",  emoji: "💬", vendor: "OpenAI" },
  // Audio
  "elevenlabs-tts":         { display: "ElevenLabs TTS",         category: "audio", emoji: "🎤", vendor: "ElevenLabs" },
  "whisper-1":              { display: "Whisper",                category: "audio", emoji: "🎙️", vendor: "OpenAI" },
};

const CATEGORY_COLOR: Record<ModelCategory, string> = {
  video: "#E7FF12",      // violet
  image: "#0ea5e9",      // sky
  text:  "#10b981",      // emerald
  audio: "#f59e0b",      // amber
  other: "#94a3b8",      // slate
};

export function getModelMeta(id: string): ModelMeta {
  return (
    MODEL_META[id] ?? {
      display: id,
      category: "other" as const,
      emoji: "🔧",
    }
  );
}

export function getCategoryColor(category: ModelCategory): string {
  return CATEGORY_COLOR[category];
}
