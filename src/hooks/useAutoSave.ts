import { useRef, useEffect, useCallback, useState } from "react";

export type AutoSaveStatus = "idle" | "edited" | "saving" | "saved" | "error";

interface UseAutoSaveOptions {
  /** Data to watch for changes (will be JSON-serialized for comparison) */
  data: unknown;
  /** The async save function */
  onSave: () => Promise<void>;
  /** Debounce delay in ms (default 1500) */
  delay?: number;
  /** Whether autosave is enabled */
  enabled?: boolean;
}

/**
 * Debounced autosave hook.
 * - Skips the initial load (only saves after user edits)
 * - Shows status: idle → edited → saving → saved
 * - Registers beforeunload guard when dirty
 * - Forces a flush on unmount if a save is pending (prevents data loss)
 */
export const useAutoSave = ({ data, onSave, delay = 1500, enabled = true }: UseAutoSaveOptions) => {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const initializedRef = useRef(false);
  const snapshotRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Track whether there is a pending (dirty) save that hasn't fired yet
  const isDirtyRef = useRef(false);
  // Track the serialized data at all times so unmount flush can use it
  const latestSerializedRef = useRef<string>("");

  // Serialize current data for comparison
  const serialized = JSON.stringify(data);
  latestSerializedRef.current = serialized;

  useEffect(() => {
    if (!enabled) return;

    // First render: capture baseline snapshot, don't trigger save
    if (!initializedRef.current) {
      snapshotRef.current = serialized;
      initializedRef.current = true;
      return;
    }

    // No actual change from last saved snapshot
    if (serialized === snapshotRef.current) {
      isDirtyRef.current = false;
      return;
    }

    // Mark as dirty/edited
    isDirtyRef.current = true;
    setStatus("edited");

    // Clear previous timer
    if (timerRef.current) clearTimeout(timerRef.current);

    // Start debounce
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      setStatus("saving");
      try {
        await onSaveRef.current();
        isDirtyRef.current = false;
        snapshotRef.current = latestSerializedRef.current;
        setStatus("saved");
      } catch {
        isDirtyRef.current = true;
        setStatus("error");
      }
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [serialized, delay, enabled]);

  // ── Flush on unmount: fire the pending save synchronously ──
  useEffect(() => {
    return () => {
      // Cancel any pending debounce timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // If there's a dirty save that never fired, flush it now
      if (isDirtyRef.current && latestSerializedRef.current !== snapshotRef.current) {
        // Fire-and-forget — component is unmounting, we can't update state,
        // but we CAN ensure the network request goes out.
        onSaveRef.current()
          .then(() => {
            snapshotRef.current = latestSerializedRef.current;
          })
          .catch(() => {
            // Swallow — component is already gone
          });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // beforeunload guard
  useEffect(() => {
    const isDirty = status === "edited" || status === "saving" || status === "error";
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        void onSaveRef.current().catch(() => {
          // Browser may cancel async work during unload — best effort only
        });
      }
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  // Manual save (for Ctrl+S)
  const saveNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setStatus("saving");
    try {
      await onSaveRef.current();
      isDirtyRef.current = false;
      snapshotRef.current = JSON.stringify(data);
      setStatus("saved");
    } catch {
      isDirtyRef.current = true;
      setStatus("error");
    }
  }, [data]);

  // Reset snapshot (e.g. after initial load completes)
  const resetSnapshot = useCallback(() => {
    snapshotRef.current = JSON.stringify(data);
    latestSerializedRef.current = snapshotRef.current;
    initializedRef.current = true;
    isDirtyRef.current = false;
    setStatus("idle");
  }, [data]);

  return { status, saveNow, resetSnapshot };
};
