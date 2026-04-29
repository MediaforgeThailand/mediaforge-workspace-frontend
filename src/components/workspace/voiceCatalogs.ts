/**
 * Unified voice-lookup shim across Google Cloud TTS and the legacy
 * Gemini catalog.
 *
 * The audio gen node stores a `voice` param string; depending on
 * which model the user picked it's either a Google voice id
 * (`en-US-Studio-O`) or a Gemini voice id (`Charon`). The node body
 * doesn't know which — it just needs to render a chip with the
 * voice's display name + tint. This module:
 *
 *   - `findAnyVoice(id)` → returns a normalised "display record"
 *     by trying Google first, then Gemini, then a sensible default
 *     (so a stale id never blanks the chip).
 *   - `voiceTintGradient(tint)` → resolves a tint key to a CSS
 *     gradient. Both catalogs use the SAME tint palette, so this
 *     just delegates to the Google catalog's gradient map.
 *
 * Keep this file tiny and dependency-free — it's imported by the
 * canvas-side WorkspaceToolNode component which is already huge.
 */

import {
  GOOGLE_VOICES,
  GOOGLE_VOICE_TINT_GRADIENT,
  DEFAULT_GOOGLE_VOICE_ID,
  type GoogleVoice,
} from "./googleTtsVoices";
import {
  GEMINI_VOICES,
  type GeminiVoice,
} from "./geminiVoices";

/** Common shape used by the chip / picker button. Both catalogs
 *  expose a superset of this; we narrow to it so callers don't
 *  branch on type. */
export interface VoiceDisplayRecord {
  id: string;
  name: string;
  characteristic: string;
  tint: GoogleVoice["tint"]; // the tint palette is shared between catalogs
}

function fromGoogle(v: GoogleVoice): VoiceDisplayRecord {
  return { id: v.id, name: v.name, characteristic: v.characteristic, tint: v.tint };
}

function fromGemini(v: GeminiVoice): VoiceDisplayRecord {
  return { id: v.id, name: v.name, characteristic: v.characteristic, tint: v.tint };
}

/** Resolve an id to a display record across both catalogs. Falls
 *  back to the Google default voice (Aria / en-US-Studio-O) if the
 *  id matches nothing — we used to fall back to the Gemini default
 *  ("Charon") but that's now a legacy code path most users will
 *  never see. */
export function findAnyVoice(id: string | undefined): VoiceDisplayRecord {
  if (id) {
    const g = GOOGLE_VOICES.find((v) => v.id === id);
    if (g) return fromGoogle(g);
    const m = GEMINI_VOICES.find((v) => v.id === id);
    if (m) return fromGemini(m);
  }
  const fallback = GOOGLE_VOICES.find((v) => v.id === DEFAULT_GOOGLE_VOICE_ID)!;
  return fromGoogle(fallback);
}

/** Tint key → CSS gradient. Both catalogs share the same palette so
 *  this is just a thin wrapper that picks the Google map. */
export function voiceTintGradient(tint: VoiceDisplayRecord["tint"]): string {
  return GOOGLE_VOICE_TINT_GRADIENT[tint];
}
