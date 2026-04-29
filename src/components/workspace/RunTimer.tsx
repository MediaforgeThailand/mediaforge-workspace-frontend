/**
 * RunTimer — small monospace pill showing elapsed time on a
 * generating node. Sits next to the spinner indicator inside the
 * Run button (or wherever the parent mounts it).
 *
 * Re-renders every 250ms while `startedAt` is set; mounts/unmounts
 * the interval as the prop toggles between a number and null. We
 * keep the tick state local so the parent node component doesn't
 * have to re-render once per frame just to update the timer.
 */

import { useEffect, useState } from "react";

export function RunTimer({ startedAt }: { startedAt: number | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return null;
  const elapsed = Math.max(0, Date.now() - startedAt);
  return <span className="ws-run-timer">{format(elapsed)}</span>;
}

function format(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}.${Math.floor((ms % 1000) / 100)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
