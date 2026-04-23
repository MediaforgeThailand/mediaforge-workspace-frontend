import { createRoot } from "react-dom/client";
import { PostHogProvider } from "posthog-js/react";
import App from "./App.tsx";
import "./index.css";
import { initPostHog, posthog } from "./lib/posthog";
import { captureFromUrl } from "./lib/tracking/referralCapture";

// Polyfill crypto.randomUUID for non-secure contexts (e.g. LAN HTTP testing)
if (typeof crypto !== "undefined" && !crypto.randomUUID) {
  crypto.randomUUID = () =>
    "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)
    ) as `${string}-${string}-${string}-${string}-${string}`;
}

initPostHog();

// CRITICAL: Capture referral code from URL BEFORE React mounts.
// React Router's <Navigate replace> strips the query string synchronously
// during render, before any useEffect can read it. captureFromUrl() persists
// the code to cookie + localStorage synchronously (before any awaits), so
// signup attribution survives even though the network call (track-click)
// completes asynchronously. Wrapped in try/catch to never block render.
try {
  void captureFromUrl();
} catch (err) {
  console.warn("[main] captureFromUrl failed:", err);
}

createRoot(document.getElementById("root")!).render(
  <PostHogProvider client={posthog}>
    <App />
  </PostHogProvider>
);
