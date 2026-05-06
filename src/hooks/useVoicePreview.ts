import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type VoicePreviewProvider = "gemini" | "elevenlabs" | "google";

interface PreviewResponse {
  url?: string;
  error?: string;
  // voice-preview also accepts an optional language hint (en/th) so
  // Thai voices read the Thai sample sentence — callers can pass it
  // through `play(voiceId, { language })`.
}

interface PreviewPlayOptions {
  /** Provider-specific model id (e.g. "gemini-3.1-flash-tts-preview"
   *  vs. "gemini-2.5-pro-preview-tts" — same voice id, different
   *  rendering model). The edge function partitions its cache by
   *  model so two models for the same voice don't share a sample. */
  modelId?: string;
  language?: "en" | "th";
}

/** Best-effort extraction of the actual server error message from a
 *  Supabase FunctionsHttpError. The library's surfaced `.message` is
 *  the generic "Edge Function returned a non-2xx status code"; the
 *  real body lives on `.context.responseText` or `.context.body`
 *  depending on supabase-js version. We try both before falling
 *  through to the generic message. */
async function readErrorContext(error: unknown): Promise<string | null> {
  if (!error || typeof error !== "object") return null;
  const ctx = (error as { context?: unknown }).context;
  if (!ctx || typeof ctx !== "object") return null;
  const candidates: Array<unknown> = [
    (ctx as { responseText?: unknown }).responseText,
    (ctx as { body?: unknown }).body,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      try {
        const parsed = JSON.parse(c) as { error?: string };
        if (parsed?.error) return parsed.error;
      } catch {
        return c.slice(0, 200);
      }
    }
  }
  // Some versions ship a `Response` on `context.response` we can read.
  const resp = (ctx as { response?: Response }).response;
  if (resp && typeof resp.text === "function") {
    try {
      const t = await resp.text();
      if (t) {
        try {
          const parsed = JSON.parse(t) as { error?: string };
          if (parsed?.error) return parsed.error;
        } catch {
          return t.slice(0, 200);
        }
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Voice-preview hook.
 *
 * Wraps the `voice-preview` edge function with:
 *   • per-voice URL caching (the function itself caches in Storage,
 *     but we also memoise on the client to avoid the round-trip after
 *     the first click)
 *   • a single shared `<audio>` element so clicking ▶ on a different
 *     voice cleanly stops the previous one
 *   • `playing` state callers use to toggle the button between play
 *     and stop, plus a per-voice `loading` flag so the spinner shows
 *     during the synthesis-on-miss path
 *
 * The edge function is rate-limited (20/min/user) and free; no credit
 * deduction. Errors are toasted by the caller — this hook just
 * rejects.
 */
export function useVoicePreview(provider: VoicePreviewProvider) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());

  // Tear down the audio element on provider change / unmount so the
  // previous voice doesn't keep playing after the panel switches.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingId(null);
  }, []);

  const play = useCallback(
    async (voiceId: string, opts: PreviewPlayOptions = {}) => {
      // Toggle off if the user clicks ▶ on the currently-playing voice.
      if (playingId === voiceId && audioRef.current && !audioRef.current.paused) {
        stop();
        return;
      }

      // Stop any other voice that's mid-play before kicking off.
      if (audioRef.current) {
        audioRef.current.pause();
      }

      const cacheKey = opts.modelId ? `${voiceId}@${opts.modelId}` : voiceId;
      let url = cacheRef.current.get(cacheKey);
      if (!url) {
        setLoadingId(voiceId);
        try {
          const { data, error } = await supabase.functions.invoke<PreviewResponse>(
            "voice-preview",
            {
              body: {
                provider,
                voice_id: voiceId,
                model_id: opts.modelId,
                language: opts.language,
              },
            },
          );
          if (error) {
            // supabase-js wraps non-2xx as a generic "Edge Function
            // returned a non-2xx status code". The actual server
            // message lives on `error.context.responseText` (the
            // FunctionsHttpError shape) — surface it so the toast
            // tells the user *why*, not just *that*.
            const ctxText = await readErrorContext(error);
            throw new Error(
              ctxText
                ? `voice-preview: ${ctxText}`
                : (error.message ?? "voice-preview failed"),
            );
          }
          if (data?.error) throw new Error(data.error);
          if (!data?.url) throw new Error("voice-preview returned no URL");
          url = data.url;
          cacheRef.current.set(cacheKey, url);
        } finally {
          setLoadingId((prev) => (prev === voiceId ? null : prev));
        }
      }

      // Build / reuse the shared audio element. Reusing avoids the
      // browser spinning up a new Web Audio context per click.
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.preload = "auto";
        audioRef.current.addEventListener("ended", () => setPlayingId(null));
        audioRef.current.addEventListener("error", () => setPlayingId(null));
      }
      audioRef.current.src = url;
      setPlayingId(voiceId);
      try {
        await audioRef.current.play();
      } catch (err) {
        // Autoplay block, user gesture issue, etc. — surface as a
        // playback failure so the caller can toast.
        setPlayingId(null);
        throw err;
      }
    },
    [provider, playingId, stop],
  );

  return {
    /** Voice currently being played, or `null` if nothing is playing. */
    playingId,
    /** Voice currently waiting on edge-function synthesis. */
    loadingId,
    /** Start (or toggle off) preview for a voice. Idempotent and safe
     *  to call from button onClick handlers. */
    play,
    stop,
  };
}
