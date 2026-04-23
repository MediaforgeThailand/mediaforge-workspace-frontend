import { useEffect, useRef, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, XCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getFreshToken } from "@/lib/getFreshToken";
import { useBackgroundExecutionStore, type BackgroundTask } from "@/store/useBackgroundExecutionStore";
import { useIsMobile } from "@/hooks/use-mobile";

const POLL_INTERVAL = 7000;
const STALE_PROCESSING_WINDOW_MS = 20 * 60 * 1000;

/* ── Inline shine border effect for each card ── */
function CardShineEffect() {
  return (
    <>
      <div
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{
          padding: "1px",
          mask: "linear-gradient(white, white) content-box exclude, linear-gradient(white, white)",
          WebkitMask: "linear-gradient(white, white) content-box exclude, linear-gradient(white, white)",
          background: "linear-gradient(174deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.12) 100%)",
        }}
      />
      <div
        className="absolute inset-0 rounded-xl pointer-events-none overflow-hidden"
        style={{
          padding: "1px",
          mask: "linear-gradient(white, white) content-box exclude, linear-gradient(white, white)",
          WebkitMask: "linear-gradient(white, white) content-box exclude, linear-gradient(white, white)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            offsetPath: "border-box",
            offsetDistance: "0%",
            animation: "shineOrbit 14s linear infinite",
            width: "120px",
            height: "120px",
            background: "radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(110,96,238,0.5) 30%, transparent 70%)",
            mixBlendMode: "plus-lighter",
          }}
        />
      </div>
      <style>{`
        @keyframes shineOrbit {
          0% { offset-distance: 0%; }
          100% { offset-distance: 100%; }
        }
      `}</style>
    </>
  );
}

function TaskCard({
  task,
  onNavigate,
  onDismiss,
}: {
  task: BackgroundTask;
  onNavigate: (flowId: string) => void;
  onDismiss: (runId: string) => void;
}) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - task.startedAt) / 1000));

  useEffect(() => {
    if (task.status !== "processing") return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - task.startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [task.startedAt, task.status]);

  const isProcessing = task.status === "processing";
  const isCompleted = task.status === "completed";
  const isFailed = task.status === "failed";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.9 }}
      transition={{ type: "spring", damping: 22, stiffness: 300 }}
      className="relative flex items-center gap-3 rounded-xl shadow-2xl px-4 py-3 min-w-[280px] max-w-[340px]
        bg-card/90 backdrop-blur-md cursor-pointer transition-all duration-200 hover:bg-accent/30"
      onClick={() => onNavigate(task.flowId)}
    >
      <CardShineEffect />

      <div className="relative shrink-0 z-10">
        {isProcessing && (
          <>
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
          </>
        )}
        {isCompleted && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
        {isFailed && <XCircle className="w-5 h-5 text-red-400" />}
      </div>

      <div className="flex-1 min-w-0 z-10">
        <p className="text-sm font-medium text-foreground truncate">{task.flowName}</p>
        <p className="text-[11px] text-muted-foreground">
          {isProcessing && "Generating..."}
          {isCompleted && "Completed! Click to view result"}
          {isFailed && `Failed${task.refunded ? " — credits refunded" : ""}`}
        </p>
      </div>

      {isProcessing && (
        <span className="text-[11px] font-mono text-primary/80 shrink-0 z-10">{elapsed}s</span>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(task.runId);
        }}
        className="shrink-0 p-0.5 rounded-full transition-opacity hover:bg-foreground/10 opacity-60 hover:opacity-100 z-10"
        aria-label="Dismiss notification"
        title={isProcessing ? "Hide notification (still generating in Library)" : "Dismiss"}
      >
        <X className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </motion.div>
  );
}

export default function GlobalExecutionWatcher() {
  const { activeTasks, completeTask, failTask, dismissTask, hideToast, removeTask } = useBackgroundExecutionStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconcileRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const processingTasks = activeTasks.filter((t) => t.status === "processing");

  const reconcileWithDb = useCallback(async () => {
    const now = Date.now();
    const stored = useBackgroundExecutionStore.getState().activeTasks.filter(
      (t) => t.status === "processing" && !t.runId.startsWith("fake-"),
    );
    if (stored.length === 0) return;

    const ids = stored.map((t) => t.runId);
    const { data, error } = await supabase
      .from("flow_runs")
      .select("id, status, dismissed_at")
      .in("id", ids);
    if (error) return;

    const byId = new Map((data || []).map((r) => [r.id, r]));
    for (const task of stored) {
      if (now - task.startedAt > STALE_PROCESSING_WINDOW_MS) {
        removeTask(task.runId);
        continue;
      }

      const row = byId.get(task.runId);
      if (!row || row.dismissed_at) {
        removeTask(task.runId);
        continue;
      }
      if (row.status === "completed") {
        completeTask(task.runId);
      } else if (row.status === "failed" || row.status === "failed_refunded") {
        failTask(task.runId, { refunded: row.status === "failed_refunded" });
      }
    }
  }, [completeTask, failTask, removeTask]);

  useEffect(() => {
    void reconcileWithDb();
    const onFocus = () => {
      void reconcileWithDb();
    };
    window.addEventListener("focus", onFocus);
    reconcileRef.current = setInterval(() => {
      void reconcileWithDb();
    }, 30000);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (reconcileRef.current) clearInterval(reconcileRef.current);
    };
  }, [reconcileWithDb]);

  const visibleTasks = activeTasks.filter((t) => !t.hiddenFromToast);

  const pollTasks = useCallback(async () => {
    if (processingTasks.length === 0) return;

    const token = await getFreshToken();
    if (!token) return;

    for (const task of processingTasks) {
      if (task.runId.startsWith("fake-")) continue;
      if (Date.now() - task.startedAt > STALE_PROCESSING_WINDOW_MS) {
        removeTask(task.runId);
        continue;
      }

      if (!task.taskId) {
        try {
          const { data: run } = await supabase
            .from("flow_runs")
            .select("status, outputs, error_message")
            .eq("id", task.runId)
            .maybeSingle();

          if (!run) {
            removeTask(task.runId);
            continue;
          }
          if (run.status === "completed") {
            completeTask(task.runId);
          } else if (run.status === "failed" || run.status === "failed_refunded") {
            failTask(task.runId, { refunded: run.status === "failed_refunded" });
          }
        } catch {
          /* ignore */
        }
        continue;
      }

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-flow-status`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ task_id: task.taskId, run_id: task.runId, credit_cost: task.creditCost ?? 0 }),
          },
        );
        const result = await res.json();
        if (result.status === "succeed") {
          completeTask(task.runId);
        } else if (result.status === "failed" || result.status === "failed_refunded") {
          failTask(task.runId, { refunded: result.refunded });
        }
      } catch {
        /* keep polling */
      }
    }
  }, [processingTasks, completeTask, failTask, removeTask]);

  useEffect(() => {
    if (processingTasks.length > 0) {
      void pollTasks();
      intervalRef.current = setInterval(() => {
        void pollTasks();
      }, POLL_INTERVAL);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [processingTasks.length, pollTasks]);

  if (visibleTasks.length === 0) return null;

  const handleDismiss = (task: BackgroundTask) => {
    if (task.status === "processing") hideToast(task.runId);
    else dismissTask(task.runId);
  };

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {visibleTasks.map((task) => (
          <div key={task.runId} className="pointer-events-auto group/card">
            <TaskCard
              task={task}
              onNavigate={(fid) => navigate(isMobile ? `/play/${fid}?tab=results` : "/app/assets")}
              onDismiss={() => handleDismiss(task)}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}