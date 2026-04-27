/**
 * Gemini 2.5 TTS prebuilt voice catalog.
 *
 * Google ships 30 named voices with the `gemini-2.5-flash-preview-tts`
 * and `gemini-2.5-pro-preview-tts` models. Each name is taken from a
 * star or moon (Achernar = α Eridani, Aoede = a moon of Jupiter,
 * etc.) and each ships with a one-word "characteristic" descriptor
 * that hints at its tonal personality.
 *
 * Source: https://ai.google.dev/gemini-api/docs/speech-generation
 *
 * The descriptors below were transcribed from Google's docs. Gender
 * isn't part of the public spec — Google designs the TTS family
 * non-binary by name — but the pre-trained voices DO read with a
 * perceptual male / female lean, so the dialog filter exposes that
 * as a soft hint. Keep the lean field as "neutral" for any voice
 * Google later re-tunes; it just hides the filter chip.
 *
 * Use-case suggestions are our own mapping — no public spec — and
 * mirror the four categories from the reference dialog
 * (Advertisement / Informative / Narrative / Social Media). A voice
 * can belong to multiple categories.
 */

export type VoiceLean = "male" | "female" | "neutral";

export type VoiceUseCase =
  | "advertisement"
  | "informative_educational"
  | "narrative_story"
  | "social_media";

export interface GeminiVoice {
  /** Exact API id — passed verbatim into the TTS request. */
  id: string;
  /** Display label — same as id, but capitalised cosmetically. */
  name: string;
  /** Google's one-word characteristic. Surfaced as the row subtitle. */
  characteristic: string;
  /** Perceptual lean. Used by the gender filter chip. */
  lean: VoiceLean;
  /** Mapped use cases. A voice can fit multiple. */
  useCases: VoiceUseCase[];
  /** Tint hint for the avatar fallback (initial-circle gradient). */
  tint: "violet" | "rose" | "amber" | "emerald" | "sky" | "zinc";
}

export const GEMINI_VOICES: GeminiVoice[] = [
  { id: "Achernar",      name: "Achernar",      characteristic: "Soft",          lean: "female",  useCases: ["narrative_story", "social_media"],                tint: "rose" },
  { id: "Achird",        name: "Achird",        characteristic: "Friendly",      lean: "male",    useCases: ["social_media", "advertisement"],                  tint: "sky" },
  { id: "Algenib",       name: "Algenib",       characteristic: "Gravelly",      lean: "male",    useCases: ["narrative_story"],                                tint: "amber" },
  { id: "Algieba",       name: "Algieba",       characteristic: "Smooth",        lean: "male",    useCases: ["narrative_story", "informative_educational"],    tint: "violet" },
  { id: "Alnilam",       name: "Alnilam",       characteristic: "Firm",          lean: "male",    useCases: ["informative_educational", "advertisement"],       tint: "sky" },
  { id: "Aoede",         name: "Aoede",         characteristic: "Breezy",        lean: "female",  useCases: ["advertisement", "social_media"],                  tint: "emerald" },
  { id: "Autonoe",       name: "Autonoe",       characteristic: "Bright",        lean: "female",  useCases: ["advertisement", "social_media"],                  tint: "amber" },
  { id: "Callirrhoe",    name: "Callirrhoe",    characteristic: "Easy-going",    lean: "female",  useCases: ["social_media"],                                   tint: "rose" },
  { id: "Charon",        name: "Charon",        characteristic: "Informative",   lean: "male",    useCases: ["informative_educational"],                        tint: "sky" },
  { id: "Despina",       name: "Despina",       characteristic: "Smooth",        lean: "female",  useCases: ["narrative_story", "advertisement"],               tint: "violet" },
  { id: "Enceladus",     name: "Enceladus",     characteristic: "Breathy",       lean: "male",    useCases: ["narrative_story"],                                tint: "violet" },
  { id: "Erinome",       name: "Erinome",       characteristic: "Clear",         lean: "female",  useCases: ["informative_educational", "advertisement"],       tint: "sky" },
  { id: "Fenrir",        name: "Fenrir",        characteristic: "Excitable",     lean: "male",    useCases: ["advertisement", "social_media"],                  tint: "amber" },
  { id: "Gacrux",        name: "Gacrux",        characteristic: "Mature",        lean: "male",    useCases: ["narrative_story", "informative_educational"],    tint: "amber" },
  { id: "Iapetus",       name: "Iapetus",       characteristic: "Clear",         lean: "male",    useCases: ["informative_educational"],                        tint: "sky" },
  { id: "Kore",          name: "Kore",          characteristic: "Firm",          lean: "female",  useCases: ["informative_educational", "advertisement"],       tint: "emerald" },
  { id: "Laomedeia",     name: "Laomedeia",     characteristic: "Upbeat",        lean: "female",  useCases: ["advertisement", "social_media"],                  tint: "rose" },
  { id: "Leda",          name: "Leda",          characteristic: "Youthful",      lean: "female",  useCases: ["social_media", "advertisement"],                  tint: "rose" },
  { id: "Orus",          name: "Orus",          characteristic: "Firm",          lean: "male",    useCases: ["informative_educational"],                        tint: "sky" },
  { id: "Puck",          name: "Puck",          characteristic: "Upbeat",        lean: "male",    useCases: ["advertisement", "social_media"],                  tint: "amber" },
  { id: "Pulcherrima",   name: "Pulcherrima",   characteristic: "Forward",       lean: "female",  useCases: ["advertisement"],                                  tint: "violet" },
  { id: "Rasalgethi",    name: "Rasalgethi",    characteristic: "Informative",   lean: "male",    useCases: ["informative_educational"],                        tint: "sky" },
  { id: "Sadachbia",     name: "Sadachbia",     characteristic: "Lively",        lean: "female",  useCases: ["advertisement", "social_media"],                  tint: "rose" },
  { id: "Sadaltager",    name: "Sadaltager",    characteristic: "Knowledgeable", lean: "male",    useCases: ["informative_educational"],                        tint: "violet" },
  { id: "Schedar",       name: "Schedar",       characteristic: "Even",          lean: "male",    useCases: ["informative_educational", "narrative_story"],     tint: "sky" },
  { id: "Sulafat",       name: "Sulafat",       characteristic: "Warm",          lean: "female",  useCases: ["narrative_story"],                                tint: "amber" },
  { id: "Umbriel",       name: "Umbriel",       characteristic: "Easy-going",    lean: "male",    useCases: ["social_media", "narrative_story"],                tint: "violet" },
  { id: "Vindemiatrix",  name: "Vindemiatrix",  characteristic: "Gentle",        lean: "female",  useCases: ["narrative_story"],                                tint: "rose" },
  { id: "Zephyr",        name: "Zephyr",        characteristic: "Bright",        lean: "female",  useCases: ["advertisement", "social_media"],                  tint: "amber" },
  { id: "Zubenelgenubi", name: "Zubenelgenubi", characteristic: "Casual",        lean: "male",    useCases: ["social_media"],                                   tint: "sky" },
];

/* Use-case display data — labels + the 4 cards at the head of the
 * picker. The gradient uses two tinted colour stops we apply to the
 * card's background so each category reads at a glance. */
export const VOICE_USE_CASES: Array<{
  id: VoiceUseCase;
  label: string;
  /** Two-line label split — the reference shows "Informative" then
   *  "Educational" stacked. */
  labelLines?: string[];
  gradient: string;
}> = [
  {
    id: "advertisement",
    label: "Advertisement",
    gradient: "linear-gradient(135deg, hsl(258 65% 35%), hsl(258 60% 18%))",
  },
  {
    id: "informative_educational",
    label: "Informative Educational",
    labelLines: ["Informative", "Educational"],
    gradient: "linear-gradient(135deg, hsl(28 70% 38%), hsl(28 65% 22%))",
  },
  {
    id: "narrative_story",
    label: "Narrative Story",
    gradient: "linear-gradient(135deg, hsl(140 45% 28%), hsl(140 50% 16%))",
  },
  {
    id: "social_media",
    label: "Social Media",
    gradient: "linear-gradient(135deg, hsl(310 55% 38%), hsl(310 50% 22%))",
  },
];

/** Default voice used when a fresh audioGenNode is dropped on canvas.
 *  Picked because Charon / Informative reads as a "neutral baseline"
 *  to most listeners — works for ads, narration, social all OK. */
export const DEFAULT_VOICE_ID = "Charon";

/** Lookup helper for components that have a voice id and need the
 *  full record (e.g. the node body rendering the current voice
 *  chip). Falls back to the default if the id is stale. */
export function findVoice(id: string | undefined): GeminiVoice {
  return (
    GEMINI_VOICES.find((v) => v.id === id) ??
    GEMINI_VOICES.find((v) => v.id === DEFAULT_VOICE_ID)!
  );
}

/** Tint → CSS gradient pair for the voice avatar circle. Centralised
 *  so the picker dialog and any future "current voice" chip in the
 *  node share one palette. */
export const VOICE_TINT_GRADIENT: Record<GeminiVoice["tint"], string> = {
  violet: "linear-gradient(135deg, hsl(258 75% 45%), hsl(258 65% 28%))",
  rose: "linear-gradient(135deg, hsl(345 75% 50%), hsl(345 65% 32%))",
  amber: "linear-gradient(135deg, hsl(35 80% 50%), hsl(35 70% 32%))",
  emerald: "linear-gradient(135deg, hsl(160 65% 38%), hsl(160 60% 22%))",
  sky: "linear-gradient(135deg, hsl(205 75% 45%), hsl(205 65% 28%))",
  zinc: "linear-gradient(135deg, hsl(0 0% 35%), hsl(0 0% 22%))",
};
