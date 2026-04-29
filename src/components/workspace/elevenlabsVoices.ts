/**
 * ElevenLabs prebuilt voice catalog.
 *
 * The IDs below are the 11 default preset voices that ship on every
 * ElevenLabs account — they exist on the free tier, the Starter tier,
 * and every business tier. Picking from this list means a fresh
 * workspace project can run TTS without anyone needing to clone a
 * voice or pay for the Voice Library marketplace first.
 *
 * Source — public ElevenLabs API:
 *   GET https://api.elevenlabs.io/v1/voices
 * The `voice_id` returned by that endpoint is the same opaque token
 * we ship as `id` here. ElevenLabs guarantees these IDs are stable
 * across plans (deprecating one would break every old preset link).
 *
 * Preview & gen API endpoint:
 *   POST https://api.elevenlabs.io/v1/text-to-speech/<voice_id>
 *
 * Voice character notes are paraphrased from ElevenLabs' own card
 * copy in the Voice Library. We keep the descriptions short so they
 * fit the picker's row subtitle without truncation.
 */

export type ElevenLabsVoiceLean = "male" | "female" | "neutral";

export type ElevenLabsVoiceUseCase =
  | "advertisement"
  | "informative_educational"
  | "narrative_story"
  | "social_media";

export interface ElevenLabsVoice {
  /** Stable ElevenLabs voice id — passed verbatim to /v1/text-to-speech. */
  id: string;
  /** Friendly name. ElevenLabs uses first-name-only labels for presets. */
  name: string;
  /** Short personality blurb shown under the row title. */
  characteristic: string;
  /** Perceptual lean — used by the gender filter chip. */
  lean: ElevenLabsVoiceLean;
  /** ElevenLabs accent label. We surface it as the country flag chip. */
  accent: "American" | "British" | "Australian" | "Irish";
  /** Country flag emoji for the row chip. */
  flag: string;
  /** Mapped use cases — purely UX for the use-case filter cards. */
  useCases: ElevenLabsVoiceUseCase[];
  /** Tint hint for the avatar fallback (initial-circle gradient). */
  tint: "violet" | "rose" | "amber" | "emerald" | "sky" | "zinc";
}

export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  /* ── American female ── */
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    characteristic: "Calm, narrator-style female",
    lean: "female",
    accent: "American",
    flag: "🇺🇸",
    useCases: ["narrative_story", "informative_educational"],
    tint: "rose",
  },
  {
    id: "AZnzlk1XvdvUeBnXmlld",
    name: "Domi",
    characteristic: "Strong, confident female",
    lean: "female",
    accent: "American",
    flag: "🇺🇸",
    useCases: ["advertisement", "social_media"],
    tint: "amber",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Bella",
    characteristic: "Soft, soothing female",
    lean: "female",
    accent: "American",
    flag: "🇺🇸",
    useCases: ["narrative_story", "social_media"],
    tint: "violet",
  },
  {
    id: "MF3mGyEYCl7XYWbV9V6O",
    name: "Elli",
    characteristic: "Emotional, youthful female",
    lean: "female",
    accent: "American",
    flag: "🇺🇸",
    useCases: ["narrative_story", "social_media"],
    tint: "emerald",
  },

  /* ── American male ── */
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Antoni",
    characteristic: "Well-rounded male",
    lean: "male",
    accent: "American",
    flag: "🇺🇸",
    useCases: ["informative_educational", "advertisement"],
    tint: "sky",
  },
  {
    id: "VR6AewLTigWG4xSOukaG",
    name: "Arnold",
    characteristic: "Crisp, authoritative male",
    lean: "male",
    accent: "American",
    flag: "🇺🇸",
    useCases: ["informative_educational", "narrative_story"],
    tint: "violet",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    characteristic: "Deep, mature male",
    lean: "male",
    accent: "American",
    flag: "🇺🇸",
    useCases: ["narrative_story", "advertisement"],
    tint: "amber",
  },
  {
    id: "TxGEqnHWrfWFTfGW9XjX",
    name: "Josh",
    characteristic: "Deep, calm male",
    lean: "male",
    accent: "American",
    flag: "🇺🇸",
    useCases: ["narrative_story", "informative_educational"],
    tint: "sky",
  },
  {
    id: "yoZ06aMxZJJ28mfd3POQ",
    name: "Sam",
    characteristic: "Raspy, casual male",
    lean: "male",
    accent: "American",
    flag: "🇺🇸",
    useCases: ["social_media", "advertisement"],
    tint: "amber",
  },

  /* ── British ── */
  {
    id: "CYw3kZ02Hs0563khs1Fj",
    name: "Dave",
    characteristic: "Conversational British male",
    lean: "male",
    accent: "British",
    flag: "🇬🇧",
    useCases: ["social_media", "informative_educational"],
    tint: "emerald",
  },
  {
    id: "ThT5KcBeYPX3keUQqHPh",
    name: "Dorothy",
    characteristic: "Pleasant British female",
    lean: "female",
    accent: "British",
    flag: "🇬🇧",
    useCases: ["narrative_story", "informative_educational"],
    tint: "rose",
  },
];

export const ELEVENLABS_VOICE_TINT_GRADIENT: Record<
  ElevenLabsVoice["tint"],
  string
> = {
  violet: "linear-gradient(135deg, hsl(258 75% 45%), hsl(258 65% 28%))",
  rose: "linear-gradient(135deg, hsl(345 75% 50%), hsl(345 65% 32%))",
  amber: "linear-gradient(135deg, hsl(35 80% 50%), hsl(35 70% 32%))",
  emerald: "linear-gradient(135deg, hsl(160 65% 38%), hsl(160 60% 22%))",
  sky: "linear-gradient(135deg, hsl(205 75% 45%), hsl(205 65% 28%))",
  zinc: "linear-gradient(135deg, hsl(0 0% 35%), hsl(0 0% 22%))",
};

/** Default voice picked when the user first switches to the
 *  ElevenLabs provider tab. Rachel reads as a low-friction baseline
 *  to most listeners — works across narration / explainer / brand. */
export const DEFAULT_ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export function findElevenLabsVoice(
  id: string | undefined,
): ElevenLabsVoice {
  return (
    ELEVENLABS_VOICES.find((v) => v.id === id) ??
    ELEVENLABS_VOICES.find((v) => v.id === DEFAULT_ELEVENLABS_VOICE_ID)!
  );
}
