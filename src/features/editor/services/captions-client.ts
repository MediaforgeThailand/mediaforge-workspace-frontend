/**
 * Thin client for the `captions-transcribe` Supabase edge function.
 *
 * Wraps Supabase functions.invoke() so the Authorization header is set
 * automatically using the current user's session. The function returns
 * a structured response with word-level timestamps; we forward it to the
 * caller untouched.
 */
import { getSupabase } from "./supabase-client";
import type { CloudflareWhisperResponse } from "@/lib/openreel-core";

export interface CaptionsTranscribeOptions {
  language?: string;
  prompt?: string;
  /** "word" (default) requests Whisper word-level timestamps. */
  granularity?: "word" | "segment";
}

/**
 * Send an audio blob to the captions-transcribe edge function and return
 * Whisper's verbose_json response (words + segments + text).
 *
 * Throws an Error with a human-readable message on any failure. Callers
 * should catch and surface to a toast / banner.
 */
export async function transcribeAudio(
  audio: Blob,
  options: CaptionsTranscribeOptions = {},
): Promise<CloudflareWhisperResponse> {
  const supabase = getSupabase();

  // Confirm the user is signed in — the function rejects anonymous calls.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error(
      "Please sign in to MediaForge to use AI Captions. (Authentication required.)",
    );
  }

  const formData = new FormData();
  formData.append("audio", audio, "captions.wav");
  if (options.language && options.language !== "auto") {
    formData.append("language", options.language);
  }
  if (options.prompt) {
    formData.append("prompt", options.prompt);
  }
  if (options.granularity) {
    formData.append("granularity", options.granularity);
  }

  const { data, error } = await supabase.functions.invoke(
    "captions-transcribe",
    { body: formData },
  );

  if (error) {
    // supabase-js wraps the error; surface enough detail to be debuggable.
    const err = error as {
      message?: string;
      context?: { status?: number; statusText?: string } & Response;
      status?: number;
    };
    const detail = err.message ?? "Unknown error";

    // Best-effort HTTP status extraction. supabase-js attaches the
    // Response on `context`; older versions expose `status` directly.
    let status: number | undefined =
      err.status ?? err.context?.status ?? undefined;
    if (status === undefined && err.context && typeof err.context === "object") {
      const ctx = err.context as { status?: number };
      status = ctx.status;
    }

    // Friendly error for the common deploy-misconfiguration cases.
    // The actual response body usually carries an `OpenAI API key not
    // configured` string; we also catch raw 401/404 from the edge layer.
    const lower = detail.toLowerCase();
    const apiKeyMissing =
      lower.includes("openai api key") ||
      lower.includes("api key not configured") ||
      lower.includes("missing api key") ||
      status === 401;
    const functionMissing =
      lower.includes("not deployed") ||
      lower.includes("function not found") ||
      status === 404;

    if (apiKeyMissing) {
      const e = new Error(
        "OpenAI API key not configured. See apps/web/CAPTIONS_SETUP.md to deploy the edge function with a valid OPENAI_API_KEY.",
      );
      (e as Error & { setupDocUrl?: string }).setupDocUrl = "/CAPTIONS_SETUP.md";
      throw e;
    }
    if (functionMissing) {
      const e = new Error(
        "Captions edge function not deployed. Run `npx supabase functions deploy captions-transcribe` — see apps/web/CAPTIONS_SETUP.md.",
      );
      (e as Error & { setupDocUrl?: string }).setupDocUrl = "/CAPTIONS_SETUP.md";
      throw e;
    }
    throw new Error(`Captions transcription failed: ${detail}`);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Captions transcription returned no data");
  }

  return data as CloudflareWhisperResponse;
}

/** Languages Whisper officially supports — the ones most likely used here. */
export const CAPTIONS_LANGUAGES: { code: string; label: string }[] = [
  { code: "auto", label: "Auto-detect" },
  { code: "th", label: "Thai (ไทย)" },
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese (日本語)" },
  { code: "ko", label: "Korean (한국어)" },
  { code: "zh", label: "Chinese (中文)" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "id", label: "Indonesian" },
  { code: "vi", label: "Vietnamese" },
  { code: "ms", label: "Malay" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "ru", label: "Russian" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
];
