/**
 * Centralized API endpoint configuration.
 *
 * All external service URLs should be defined here so they can be
 * swapped for different environments or self-hosted instances.
 */

const isDev = import.meta.env.DEV;

/**
 * OpenReel cloud worker URL.
 *
 * Reads from VITE_KIEAI_WORKER_URL when set so deployments can point at
 * their own Cloudflare Worker / self-hosted proxy instead of the
 * fork-bundled default. Set in .env / .env.production:
 *
 *   VITE_KIEAI_WORKER_URL=https://my-worker.example.com
 *
 * Fallback retains the historical dev URL when in development, and the
 * fork-authoring developer's Cloudflare Workers subdomain in production.
 * Replace the fallback for your fork by setting VITE_KIEAI_WORKER_URL in
 * apps/web/.env.production.
 */
const ENV_WORKER_URL = (import.meta.env.VITE_KIEAI_WORKER_URL as string | undefined) || "";
export const OPENREEL_CLOUD_URL = ENV_WORKER_URL.trim() !== ""
  ? ENV_WORKER_URL
  : isDev
    ? "http://localhost:8787"
    : "https://openreel-cloud.niiyeboah1996.workers.dev";

/**
 * OpenReel transcription / TTS service.
 *
 * @deprecated The legacy transcribe.openreel.video endpoint was retired in
 * V6 and replaced with the OpenAI-Whisper-via-Supabase pipeline. Callers
 * should use `services/captions-client.ts` (`transcribeAudio()`) instead.
 * This constant is retained only to keep the file's intent documented; if
 * you need a TTS endpoint, point it at your own service.
 */
export const OPENREEL_TTS_URL = "";

/**
 * Third-party API base URLs.
 * These are used by the api-proxy service in dev mode (direct calls)
 * and by the Cloudflare Pages Function proxy in production.
 * Application code should use apiFetch() from services/api-proxy.ts
 * instead of importing these directly.
 */
