import type { MouseEvent } from "react";
import { useCallback, useState } from "react";

/**
 * Position state + open/close helpers for a portal-rendered media
 * context menu. Every workspace surface that shows a right-click menu
 * over an asset / generation tile needs the same boilerplate — track
 * `{x, y} | null`, open at the cursor on `onContextMenu`, close on
 * dismiss. This hook bundles all three so call sites stay terse.
 *
 * `openAt` always calls preventDefault + stopPropagation on the event,
 * which is what every existing call site already did. Call sites that
 * want to gate the menu (e.g. only open if a downloadable URL exists)
 * can do their own check before calling `openAt`.
 */
export function useMediaContextMenu() {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  const openAt = useCallback((event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setPosition({ x: event.clientX, y: event.clientY });
  }, []);

  const close = useCallback(() => setPosition(null), []);

  return { position, openAt, close };
}
