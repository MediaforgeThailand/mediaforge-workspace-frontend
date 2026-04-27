/**
 * useCanvasAutosave — Figma-style autosave for the workspace canvas.
 *
 * Runs inside the canvas page, watches the active `current` graph,
 * and pushes changes to Supabase's `workspace_canvases` table:
 *
 *   - Debounced save 600ms after the latest mutation (keystrokes,
 *     drag, edge add, etc.). 600ms strikes a balance between "feels
 *     instant on idle" and "doesn't hammer the API on a continuous
 *     drag".
 *   - Force flush on `beforeunload` / `pagehide` via fetch keepalive
 *     so closing the tab mid-edit doesn't lose the last 600ms.
 *   - Visibility flush — when the tab loses focus we save right away
 *     so the user sees their work the moment they switch back.
 *
 * Returns the current save state for UI ("idle" | "saving" | "saved"
 * | "error" | "guest" | "tableMissing"), so the tab bar can render a
 * tiny indicator.
 *
 * Guest users (signed-out) get state "guest" and skip the network —
 * Zustand's local persist still saves their work locally.
 */

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useWorkspaceStore,
  type CanvasGraph,
} from "@/store/useWorkspaceStore";
import {
  flushSaveOnUnload,
  saveCanvasToServer,
} from "./canvasPersistence";

export type SaveState =
  | "idle"
  | "saving"
  | "saved"
  | "error"
  | "guest"
  | "tableMissing";

const DEBOUNCE_MS = 600;
const SAVED_FLASH_MS = 1500;

/** Fingerprint a graph for change-detection — stable JSON of the
 *  bits we actually persist. Avoids saving when only ephemeral
 *  selection state changed. */
function fingerprint(g: CanvasGraph): string {
  return JSON.stringify({
    id: g.id,
    name: g.name,
    nodes: g.nodes,
    edges: g.edges,
    viewport: g.viewport ?? null,
  });
}

export function useCanvasAutosave(): SaveState {
  const current = useWorkspaceStore((s) => s.current);
  const { user } = useAuth();
  const [state, setState] = useState<SaveState>("idle");

  // Last successfully-saved fingerprint per canvas. Stops us from
  // re-uploading the same payload after every store re-emit.
  const lastSavedRef = useRef<Map<string, string>>(new Map());
  // Active debounce timer.
  const timerRef = useRef<number | null>(null);
  // Flash-to-idle timer.
  const flashRef = useRef<number | null>(null);

  /* ── Main save loop ────────────────────────────────────── */
  useEffect(() => {
    if (!current?.id) return;
    if (!user?.id) {
      setState("guest");
      return;
    }
    const fp = fingerprint(current);
    const prev = lastSavedRef.current.get(current.id);
    if (fp === prev) return; // nothing changed since last save

    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (flashRef.current) window.clearTimeout(flashRef.current);

    timerRef.current = window.setTimeout(async () => {
      setState("saving");
      const res = await saveCanvasToServer(current, user.id);
      if (res.ok) {
        lastSavedRef.current.set(current.id, fp);
        setState("saved");
        flashRef.current = window.setTimeout(
          () => setState("idle"),
          SAVED_FLASH_MS,
        );
      } else if (res.tableMissing) {
        setState("tableMissing");
      } else {
        console.error("[autosave] failed:", res.error);
        setState("error");
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // We intentionally re-run on EVERY `current` change. The store
    // emits a new `current` reference whenever any node/edge mutation
    // lands, which is exactly what we want to watch.
  }, [current, user?.id]);

  /* ── beforeunload / pagehide flush ──────────────────────
   * If the user closes the tab mid-edit, the debounced save above
   * hasn't fired yet. We use fetch keepalive (handled in
   * flushSaveOnUnload) to send the final state on the way out. */
  useEffect(() => {
    if (!user?.id) return;
    const onUnload = () => {
      const c = useWorkspaceStore.getState().current;
      if (!c?.id) return;
      const fp = fingerprint(c);
      if (fp === lastSavedRef.current.get(c.id)) return;
      flushSaveOnUnload(c, user.id);
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
    };
  }, [user?.id]);

  /* ── Visibility flush — tab blur saves immediately ──── */
  useEffect(() => {
    if (!user?.id) return;
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      const c = useWorkspaceStore.getState().current;
      if (!c?.id) return;
      const fp = fingerprint(c);
      if (fp === lastSavedRef.current.get(c.id)) return;
      // Try the keepalive path so the request survives the page
      // pause (mobile Safari aggressively suspends background tabs).
      flushSaveOnUnload(c, user.id);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [user?.id]);

  return state;
}
