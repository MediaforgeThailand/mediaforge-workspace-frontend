import { useCallback } from "react";

type EventProperties = Record<string, string | number | boolean | null>;

// posthog-js is now lazy-loaded after first paint (see main.tsx). Instead
// of using PostHogProvider/usePostHog (which pulls posthog-js/react into
// the main bundle), we read the initialized posthog instance off the
// global. While the lazy import is still in-flight `globalThis.__posthog`
// is undefined and capture/identify are silent no-ops — matching the
// previous behavior when telemetry was disabled.
interface MinimalPostHog {
  capture: (event: string, props?: EventProperties) => void;
  identify: (id: string, props?: EventProperties) => void;
}

function getPostHog(): MinimalPostHog | undefined {
  return (globalThis as { __posthog?: MinimalPostHog }).__posthog;
}

export function useAnalytics() {
  const track = useCallback((event: string, properties?: EventProperties) => {
    const posthog = getPostHog();
    if (posthog) {
      posthog.capture(event, properties);
    }
  }, []);

  const identify = useCallback(
    (userId: string, properties?: EventProperties) => {
      const posthog = getPostHog();
      if (posthog) {
        posthog.identify(userId, properties);
      }
    },
    [],
  );

  // isEnabled is now lazy: returns false until posthog-js finishes loading,
  // then flips to true. Callers should not rely on it for gating UI — only
  // for "was this captured" telemetry.
  return { track, identify, isEnabled: !!getPostHog() };
}

export const AnalyticsEvents = {
  PROJECT_CREATED: "project_created",
  PROJECT_OPENED: "project_opened",
  PROJECT_EXPORTED: "project_exported",
  CLIP_ADDED: "clip_added",
  TEXT_ADDED: "text_added",
  EFFECT_APPLIED: "effect_applied",
  PARTICLE_EFFECT_ADDED: "particle_effect_added",
  TEMPLATE_USED: "template_used",
} as const;
