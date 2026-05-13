/**
 * useCanvasAutosave — Figma-style autosave for the workspace canvas.
 *
 * Runs inside the canvas page, watches the active `current` graph,
 * and pushes changes to Supabase's `workspace_canvases` table:
 *
 *   - Debounced save after the user pauses editing. We intentionally
 *     do not persist every keystroke; saving too aggressively can
 *     race with realtime echoes and make text feel like it jumps
 *     backwards while the user is still typing.
 *   - Max-wait save for long continuous edit sessions. The user can
 *     keep typing, but the server still receives periodic checkpoints.
 *   - Force flush on `beforeunload` / `pagehide` via fetch keepalive
 *     so closing or refreshing the tab keeps the latest edits.
 *   - Visibility flush schedules a short delayed checkpoint when the
 *     tab is hidden, without double-saving the same payload.
 *
 * Returns the current save state for UI ("idle" | "saving" | "saved"
 * | "error" | "guest" | "tableMissing"), so the tab bar can render a
 * tiny indicator.
 *
 * Guest users (signed-out) get state "guest" and skip the network —
 * Zustand's local persist still saves their work locally.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useWorkspaceStore,
  type CanvasGraph,
} from "@/store/useWorkspaceStore";
import {
  selectCanPersist,
  useWorkspaceShareRole,
} from "@/store/useWorkspaceShareRole";
import {
  flushSaveOnUnload,
  loadCanvasFromServer,
  saveCanvasToServer,
} from "./canvasPersistence";

export type SaveState =
  | "idle"
  | "saving"
  | "saved"
  | "error"
  | "guest"
  | "tableMissing"
  | "viewer"
  | "editor-readonly";

const IDLE_SAVE_MS = 5_000;
const MAX_WAIT_SAVE_MS = 30_000;
const HIDDEN_SAVE_MS = 2_000;
const SAVED_FLASH_MS = 1500;

function stripEphemeralNodeState(nodes: CanvasGraph["nodes"]): CanvasGraph["nodes"] {
  return nodes.map((node) => {
    const {
      selected: _selected,
      dragging: _dragging,
      resizing: _resizing,
      positionAbsolute: _positionAbsolute,
      ...persisted
    } = node as CanvasGraph["nodes"][number] & {
      selected?: boolean;
      dragging?: boolean;
      resizing?: boolean;
      positionAbsolute?: unknown;
    };
    return persisted as CanvasGraph["nodes"][number];
  }) as CanvasGraph["nodes"];
}

function toPersistableGraph(g: CanvasGraph): CanvasGraph {
  return {
    ...g,
    nodes: stripEphemeralNodeState(g.nodes),
  };
}

/** Fingerprint a graph for change-detection — stable JSON of the
 *  bits we actually persist. Avoids saving when only ephemeral
 *  selection state changed. */
function fingerprint(g: CanvasGraph): string {
  const persistable = toPersistableGraph(g);
  return JSON.stringify({
    id: persistable.id,
    name: persistable.name,
    nodes: persistable.nodes,
    edges: persistable.edges,
    viewport: persistable.viewport ?? null,
  });
}

export function useCanvasAutosave(): SaveState {
  const current = useWorkspaceStore((s) => s.current);
  const { user } = useAuth();
  // Reads the share role; only "owner" mode persists to server.
  // Viewers and editors run with a local-only canvas — their edits
  // do NOT write back to the owner's row. (See useWorkspaceShareRole
  // for the rationale on the stricter editor policy.)
  const canPersist = useWorkspaceShareRole(selectCanPersist);
  const role = useWorkspaceShareRole((s) => s.role);
  const [state, setState] = useState<SaveState>("idle");

  // Last successfully-saved fingerprint per canvas. Stops us from
  // re-uploading the same payload after every store re-emit.
  const lastSavedRef = useRef<Map<string, string>>(new Map());
  // Active debounce timer.
  const timerRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const maxTimerCanvasRef = useRef<string | null>(null);
  const dirtySinceRef = useRef<Map<string, number>>(new Map());
  const inFlightRef = useRef(false);
  const rerunAfterInFlightRef = useRef(false);
  const currentRef = useRef<CanvasGraph | null>(null);
  const userIdRef = useRef<string | null>(null);
  const canPersistRef = useRef(false);
  const scheduleSaveRef = useRef<(delayMs: number, reason: string) => void>(() => {});
  const saveLatestRef = useRef<(reason: string) => void>(() => {});
  // Flash-to-idle timer.
  const flashRef = useRef<number | null>(null);

  currentRef.current = current ?? null;
  userIdRef.current = user?.id ?? null;
  canPersistRef.current = Boolean(canPersist);

  const clearIdleTimer = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const clearMaxTimer = () => {
    if (maxTimerRef.current) window.clearTimeout(maxTimerRef.current);
    maxTimerRef.current = null;
    maxTimerCanvasRef.current = null;
  };

  const clearFlashTimer = () => {
    if (flashRef.current) window.clearTimeout(flashRef.current);
    flashRef.current = null;
  };

  const flushGraphOnUnload = useCallback((graph: CanvasGraph | null | undefined, userId = userIdRef.current) => {
    if (!graph?.id || !userId || !canPersistRef.current) return;
    const fp = fingerprint(graph);
    if (fp === lastSavedRef.current.get(graph.id)) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (maxTimerRef.current) window.clearTimeout(maxTimerRef.current);
    maxTimerRef.current = null;
    maxTimerCanvasRef.current = null;
    flushSaveOnUnload(toPersistableGraph(graph), userId);
    lastSavedRef.current.set(graph.id, fp);
  }, []);

  scheduleSaveRef.current = (delayMs: number, reason: string) => {
    clearIdleTimer();
    timerRef.current = window.setTimeout(() => {
      saveLatestRef.current(reason);
    }, delayMs);
  };

  saveLatestRef.current = (reason: string) => {
    const graph = currentRef.current;
    const userId = userIdRef.current;
    if (!graph?.id || !userId || !canPersistRef.current) return;

    const fp = fingerprint(graph);
    if (fp === lastSavedRef.current.get(graph.id)) {
      dirtySinceRef.current.delete(graph.id);
      clearIdleTimer();
      clearMaxTimer();
      return;
    }

    if (inFlightRef.current) {
      rerunAfterInFlightRef.current = true;
      return;
    }

    const saveGraph = toPersistableGraph(graph);
    const saveFp = fp;
    inFlightRef.current = true;
    rerunAfterInFlightRef.current = false;
    clearIdleTimer();
    setState("saving");

    void saveCanvasToServer(saveGraph, userId).then((res) => {
      inFlightRef.current = false;
      const latest = currentRef.current;
      const latestFp =
        latest?.id === saveGraph.id ? fingerprint(latest) : null;

      if (res.ok) {
        lastSavedRef.current.set(saveGraph.id, saveFp);
        if (latestFp === saveFp) {
          dirtySinceRef.current.delete(saveGraph.id);
          clearMaxTimer();
          clearFlashTimer();
          setState("saved");
          flashRef.current = window.setTimeout(
            () => setState("idle"),
            SAVED_FLASH_MS,
          );
          return;
        }

        if (latest?.id === saveGraph.id && latestFp && latestFp !== saveFp) {
          dirtySinceRef.current.set(saveGraph.id, Date.now());
          scheduleSaveRef.current(IDLE_SAVE_MS, `${reason}:followup`);
          setState("idle");
          return;
        }
      } else if (res.tableMissing) {
        setState("tableMissing");
        return;
      } else if (res.staleLocal) {
        void loadCanvasFromServer(saveGraph.id).then((serverGraph) => {
          if (serverGraph) {
            useWorkspaceStore.getState().replaceCanvasGraph(serverGraph);
            lastSavedRef.current.set(serverGraph.id, fingerprint(serverGraph));
          }
          setState("idle");
        });
        return;
      } else {
        console.error("[autosave] failed:", res.error);
        setState("error");
        return;
      }

      setState("idle");
    });
  };

  /* ── Main save loop ────────────────────────────────────── */
  useEffect(() => {
    if (!current?.id) return;
    if (!user?.id) {
      clearIdleTimer();
      clearMaxTimer();
      setState("guest");
      return;
    }
    // Share-mode short-circuit. Viewers can't mutate so their
    // canvas never differs from the loaded server state; editors
    // can mutate but those mutations stay local. Either way we
    // skip the network entirely.
    if (!canPersist) {
      clearIdleTimer();
      clearMaxTimer();
      setState(role === "viewer" ? "viewer" : "editor-readonly");
      return;
    }
    const fp = fingerprint(current);
    const prev = lastSavedRef.current.get(current.id);
    if (prev === undefined && current.ownerId) {
      lastSavedRef.current.set(current.id, fp);
      dirtySinceRef.current.delete(current.id);
      clearIdleTimer();
      clearMaxTimer();
      setState("idle");
      return;
    }
    if (fp === prev) {
      dirtySinceRef.current.delete(current.id);
      clearIdleTimer();
      clearMaxTimer();
      return;
    }

    clearFlashTimer();
    const nowMs = Date.now();
    const dirtySince = dirtySinceRef.current.get(current.id) ?? nowMs;
    dirtySinceRef.current.set(current.id, dirtySince);

    scheduleSaveRef.current(IDLE_SAVE_MS, "idle");
    if (maxTimerCanvasRef.current !== current.id) clearMaxTimer();
    if (!maxTimerRef.current) {
      const remainingMs = Math.max(
        0,
        MAX_WAIT_SAVE_MS - (nowMs - dirtySince),
      );
      maxTimerCanvasRef.current = current.id;
      maxTimerRef.current = window.setTimeout(() => {
        maxTimerRef.current = null;
        maxTimerCanvasRef.current = null;
        saveLatestRef.current("max-wait");
      }, remainingMs);
    }

    return () => {
      clearIdleTimer();
    };
    // We intentionally re-run on EVERY `current` change. The store
    // emits a new `current` reference whenever any node/edge mutation
    // lands, which is exactly what we want to watch.
  }, [current, user?.id, canPersist, role]);

  /* ── beforeunload / pagehide flush ──────────────────────
   * If the user closes the tab mid-edit, the debounced save above
   * hasn't fired yet. We use fetch keepalive (handled in
   * flushSaveOnUnload) to send the final state on the way out. */
  useEffect(() => {
    const canvasId = current?.id;
    const effectUserId = user?.id;
    if (!canvasId || !effectUserId) return;
    if (!canPersist) return; // viewer / editor — no server flushes
    const flushEffectCanvas = () => {
      const graph =
        useWorkspaceStore.getState().graphs[canvasId] ??
        (currentRef.current?.id === canvasId ? currentRef.current : null);
      flushGraphOnUnload(graph, effectUserId);
    };
    const onUnload = () => {
      flushEffectCanvas();
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
      flushEffectCanvas();
    };
  }, [current?.id, user?.id, canPersist, flushGraphOnUnload]);

  /* ── Visibility flush — tab blur saves shortly after hiding ──── */
  useEffect(() => {
    if (!user?.id) return;
    if (!canPersist) return; // viewer / editor — no server flushes
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      const c = useWorkspaceStore.getState().current;
      if (!c?.id) return;
      const fp = fingerprint(c);
      if (fp === lastSavedRef.current.get(c.id)) return;
      scheduleSaveRef.current(HIDDEN_SAVE_MS, "hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [user?.id, canPersist]);

  return state;
}
