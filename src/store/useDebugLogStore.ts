/**
 * Workspace debug log — append-only ring buffer.
 *
 * The dispatcher (`WorkspaceToolNode.runNode`) pushes events at each
 * stage of a generation: resolve, send, receive, success, error.
 * The floating `WorkspaceDebugPanel` reads from here and renders a
 * timeline so the operator can see exactly what was sent to the
 * backend and what came back, without opening DevTools.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type DebugLogLevel = "info" | "send" | "recv" | "success" | "error";

export interface DebugLogEntry {
  id: string;
  ts: number;
  level: DebugLogLevel;
  /** One-line summary shown collapsed. Keep under ~80 chars. */
  title: string;
  /** Optional structured detail — shown when the row is expanded. */
  payload?: unknown;
  /** Originating node id, if any. Lets us colour-tag rows by source. */
  nodeId?: string;
}

interface State {
  entries: DebugLogEntry[];
  /** Header collapsed/expanded (chevron). Doesn't hide the panel. */
  open: boolean;
  /**
   * Whether the panel is dismissed entirely. When true the panel is
   * hidden and only a tiny floating bug button remains so the operator
   * can bring it back. Persisted across refreshes — once you close
   * the debug panel it stays closed until you click the bug button
   * again, Figma-style.
   */
  dismissed: boolean;
  push: (e: Omit<DebugLogEntry, "id" | "ts">) => void;
  clear: () => void;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  /** Hide the panel entirely (gakabaht / X button). */
  dismiss: () => void;
  /** Bring it back from the floating bug button. */
  show: () => void;
}

const MAX_ENTRIES = 200;
const uid = () => Math.random().toString(36).slice(2, 10);

export const useDebugLogStore = create<State>()(
  persist(
    (set) => ({
      entries: [],
      open: true,
      dismissed: false,
      push: (e) =>
        set((s) => {
          const entry: DebugLogEntry = { ...e, id: uid(), ts: Date.now() };
          const next = [entry, ...s.entries];
          if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES;
          return { entries: next };
        }),
      clear: () => set({ entries: [] }),
      toggle: () => set((s) => ({ open: !s.open })),
      setOpen: (open) => set({ open }),
      dismiss: () => set({ dismissed: true }),
      show: () => set({ dismissed: false, open: true }),
    }),
    {
      name: "workspace-debug-panel-ui",
      storage: createJSONStorage(() => localStorage),
      // Persist only the UI prefs, never the in-memory log entries —
      // they're per-session and can balloon to 200 records easily.
      partialize: (s) => ({ open: s.open, dismissed: s.dismissed }),
    }
  )
);

// Dev helper — global expose so the console can poke it.
if (typeof window !== "undefined") {
  (window as unknown as { __debugLog: typeof useDebugLogStore }).__debugLog =
    useDebugLogStore;
}
