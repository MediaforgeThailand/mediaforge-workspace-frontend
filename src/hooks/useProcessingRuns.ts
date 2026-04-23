import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Database-backed processing card data.
 * Replaces device-local `useBackgroundExecutionStore` for the Asset Library
 * so all devices logged into the same account see identical processing/failed
 * state in real time.
 */
export interface ProcessingRun {
  runId: string;
  flowId: string | null;
  flowName: string;
  status: "processing" | "failed";
  startedAt: number;
  errorMessage?: string;
  refunded?: boolean;
}

const PROCESSING_STATUSES = ["pending", "running", "processing"];
const FAILED_STATUSES = ["failed", "failed_refunded"];
const FAILED_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const STALE_PROCESSING_WINDOW_MS = 20 * 60 * 1000; // align with stuck-run sweep threshold

type FlowRunRow = {
  id: string;
  flow_id: string | null;
  status: string;
  started_at: string;
  error_message: string | null;
  dismissed_at: string | null;
  flows?: { name?: string | null } | null;
};

function toProcessingRun(row: FlowRunRow): ProcessingRun | null {
  if (row.dismissed_at) return null;

  const isProcessing = PROCESSING_STATUSES.includes(row.status);
  const isFailed = FAILED_STATUSES.includes(row.status);
  if (!isProcessing && !isFailed) return null;

  const startedAt = new Date(row.started_at).getTime();
  if (isProcessing && Date.now() - startedAt > STALE_PROCESSING_WINDOW_MS) return null;
  if (isFailed && Date.now() - startedAt > FAILED_WINDOW_MS) return null;

  return {
    runId: row.id,
    flowId: row.flow_id,
    flowName: row.flows?.name || "Workflow",
    status: isProcessing ? "processing" : "failed",
    startedAt,
    errorMessage: row.error_message ?? undefined,
    refunded: row.status === "failed_refunded",
  };
}

export function useProcessingRuns() {
  const { user } = useAuth();
  const [runs, setRuns] = useState<ProcessingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const flowNameCacheRef = useRef<Map<string, string>>(new Map());

  const fetchRuns = useCallback(async () => {
    if (!user) {
      setRuns([]);
      setLoading(false);
      return;
    }

    const since = new Date(Date.now() - FAILED_WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from("flow_runs")
      .select(
        "id, flow_id, status, started_at, error_message, dismissed_at, flows(name)"
      )
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .or(
        `status.in.(${PROCESSING_STATUSES.join(",")}),and(status.in.(${FAILED_STATUSES.join(",")}),started_at.gte.${since})`
      )
      .order("started_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[useProcessingRuns] fetch error", error);
      setLoading(false);
      return;
    }

    const mapped = ((data || []) as FlowRunRow[])
      .map((r) => {
        if (r.flow_id && r.flows?.name) {
          flowNameCacheRef.current.set(r.flow_id, r.flows.name);
        }
        return toProcessingRun(r);
      })
      .filter((r): r is ProcessingRun => r !== null);

    setRuns(mapped);
    setLoading(false);
  }, [user]);

  // Initial fetch only. Ongoing updates come from Realtime, so avoid focus-triggered refresh flicker.
  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  // Realtime: subscribe to changes on this user's flow_runs
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`flow_runs:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "flow_runs",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = (payload.new || payload.old) as FlowRunRow;
          if (!row?.id) return;

          if (row.flow_id && flowNameCacheRef.current.has(row.flow_id)) {
            row.flows = { name: flowNameCacheRef.current.get(row.flow_id) };
          }

          setRuns((prev) => {
            const next = prev.filter((r) => r.runId !== row.id);
            if (payload.eventType === "DELETE") return next;
            const mapped = toProcessingRun(row);
            if (!mapped) return next;
            return [mapped, ...next].sort((a, b) => b.startedAt - a.startedAt);
          });

          if (row.flow_id && !flowNameCacheRef.current.has(row.flow_id)) {
            void supabase
              .from("flows")
              .select("name")
              .eq("id", row.flow_id)
              .maybeSingle()
              .then(({ data }) => {
                if (data?.name) {
                  flowNameCacheRef.current.set(row.flow_id!, data.name);
                  setRuns((prev) =>
                    prev.map((r) =>
                      r.flowId === row.flow_id ? { ...r, flowName: data.name! } : r
                    )
                  );
                }
              });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  /** Hide a failed run from the Library (writes to DB, syncs to all devices). */
  const dismissRun = useCallback(async (runId: string) => {
    setRuns((prev) => prev.filter((r) => r.runId !== runId));
    const { error } = await supabase
      .from("flow_runs")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", runId);
    if (error) {
      console.error("[useProcessingRuns] dismiss error", error);
      void fetchRuns();
    }
  }, [fetchRuns]);

  return { runs, loading, dismissRun, refetch: fetchRuns };
}
