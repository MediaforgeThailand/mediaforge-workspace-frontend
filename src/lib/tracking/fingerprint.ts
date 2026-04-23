// Lazy-loaded FingerprintJS visitor ID with sessionStorage cache.
import type { Agent } from "@fingerprintjs/fingerprintjs";

const STORAGE_KEY = "mf_fp";

let agentPromise: Promise<Agent> | null = null;

const loadAgent = (): Promise<Agent> => {
  if (!agentPromise) {
    agentPromise = import("@fingerprintjs/fingerprintjs").then((mod) =>
      mod.default.load()
    );
  }
  return agentPromise;
};

export async function getVisitorId(): Promise<string> {
  try {
    if (typeof window !== "undefined") {
      const cached = window.sessionStorage.getItem(STORAGE_KEY);
      if (cached) return cached;
    }

    const agent = await loadAgent();
    const result = await agent.get();
    const id = result.visitorId;

    try {
      window.sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      // sessionStorage may be unavailable (private mode, etc.)
    }
    return id;
  } catch (err) {
    console.warn("[fingerprint] Failed to get visitor ID:", err);
    return "unknown";
  }
}
