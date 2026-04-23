/**
 * bundleRunRegistry — Tracks which flow_runs were initiated from a bundle context.
 *
 * Why client-side localStorage rather than DB column?
 * - Avoids a schema migration on flow_runs
 * - Bundle context is purely a UX grouping concept (results aggregation),
 *   not a billing/auditing concern
 * - Per-device tracking is acceptable: results are personal anyway
 *
 * Storage key: `mf:bundle-runs:<bundleId>` → JSON array of run_ids (capped at 200, FIFO).
 */

const KEY_PREFIX = "mf:bundle-runs:";
const MAX_PER_BUNDLE = 200;

function safeRead(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function safeWrite(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* quota exceeded — ignore */
  }
}

/** Register a run as belonging to a bundle. Idempotent. */
export function registerBundleRun(bundleId: string, runId: string) {
  if (!bundleId || !runId) return;
  const key = `${KEY_PREFIX}${bundleId}`;
  const list = safeRead(key);
  if (list.includes(runId)) return;
  list.unshift(runId);
  if (list.length > MAX_PER_BUNDLE) list.length = MAX_PER_BUNDLE;
  safeWrite(key, list);
}

/** Read all run IDs registered for a bundle. */
export function getBundleRunIds(bundleId: string): string[] {
  if (!bundleId) return [];
  return safeRead(`${KEY_PREFIX}${bundleId}`);
}

/**
 * Aggregate every run-id known to belong to ANY bundle on this device.
 * Used by solo PlayFlow to exclude bundle-originated runs from its history.
 */
export function getAllBundleRunIds(): string[] {
  const ids = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      for (const id of safeRead(key)) ids.add(id);
    }
  } catch {
    /* ignore */
  }
  return [...ids];
}

/**
 * Reverse lookup: given a runId, find the bundleId it was registered under (if any).
 * Returns null if the run was not generated from a bundle on this device.
 */
export function findBundleForRun(runId: string): string | null {
  if (!runId) return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      const ids = safeRead(key);
      if (ids.includes(runId)) {
        return key.slice(KEY_PREFIX.length);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}
