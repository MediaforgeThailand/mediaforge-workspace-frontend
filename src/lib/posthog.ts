import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || "";
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

function hasConsent(): boolean {
  return localStorage.getItem("mf-cookie-consent") === "accepted";
}

/**
 * Always initialize PostHog — in cookieless mode (memory-only, no session
 * recording) until the visitor consents, then upgrade to full tracking.
 * Cookieless mode stores nothing on the device so it doesn't require consent.
 */
export function initPostHog() {
  if (!POSTHOG_KEY) return;

  const consented = hasConsent();

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false, // we handle SPA pageviews manually
    capture_pageleave: true,
    autocapture: consented,
    disable_session_recording: !consented,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask]",
    },
    persistence: consented ? "localStorage+cookie" : "memory",
    loaded: (ph) => {
      if (import.meta.env.DEV) {
        console.log("[PostHog] Initialized (consent=%s)", consented, ph.get_distinct_id());
      }
    },
  });
}

/** Upgrade from cookieless to full tracking after user consents. */
export function upgradePostHogConsent() {
  posthog.set_config({
    persistence: "localStorage+cookie",
    autocapture: true,
    disable_session_recording: false,
  });
  posthog.startSessionRecording();
}

export { posthog };
