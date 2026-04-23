import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || "";
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

function hasConsent(): boolean {
  return localStorage.getItem("mf-cookie-consent") === "accepted";
}

export function initPostHog() {
  if (!hasConsent() || !POSTHOG_KEY) return;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false, // we handle SPA pageviews manually
    capture_pageleave: true,
    autocapture: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask]",
    },
    persistence: "localStorage+cookie",
    loaded: (ph) => {
      if (import.meta.env.DEV) {
        console.log("[PostHog] Initialized", ph.get_distinct_id());
      }
    },
  });
}

export { posthog };
