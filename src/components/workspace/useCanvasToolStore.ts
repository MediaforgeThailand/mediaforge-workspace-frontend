/**
 * Tool-mode state for the canvas.
 *
 * Tools live in their own tiny store so any UI element (the floating
 * sidebar, the canvas itself, edge components, hotkey listeners) can
 * read or flip the active tool without prop drilling. Lives outside
 * `useWorkspaceStore` because it's session-only — no need to persist
 * to localStorage or sync to the autosave bus.
 *
 * Tools:
 *   - "select"  →  default. Click-to-select, drag-box for multi-select.
 *   - "hand"    →  pan canvas with left-mouse drag (Figma's H key).
 *   - "cut"     →  click an edge to delete it. Cursor turns into
 *                  scissors over connector strokes.
 *   - "sticky"  →  click empty canvas to drop a sticky-note node.
 *
 * Push / pop API for momentary tool switches. Holding space toggles
 * to "hand" via `pushTool("hand")`; the keyup handler `popTool()`
 * restores whatever the user had before. Avoids the bug where
 * release-spacebar would always land on "select" even if the user
 * was on "cut".
 */

import { create } from "zustand";

export type CanvasTool = "select" | "hand" | "cut" | "pen" | "text" | "sticky";

interface CanvasToolState {
  tool: CanvasTool;
  /** Pre-push tool, restored on `popTool()`. Null when no push is active. */
  prevTool: CanvasTool | null;
  setTool: (t: CanvasTool) => void;
  /** Save current tool, switch to `t`. No-op if a push is already in flight. */
  pushTool: (t: CanvasTool) => void;
  /** Restore prevTool. No-op if no push is active. */
  popTool: () => void;
}

export const useCanvasToolStore = create<CanvasToolState>((set) => ({
  tool: "select",
  prevTool: null,
  setTool: (t) => set({ tool: t, prevTool: null }),
  pushTool: (t) =>
    set((s) => (s.prevTool ? {} : { tool: t, prevTool: s.tool })),
  popTool: () =>
    set((s) =>
      s.prevTool ? { tool: s.prevTool, prevTool: null } : {},
    ),
}));
