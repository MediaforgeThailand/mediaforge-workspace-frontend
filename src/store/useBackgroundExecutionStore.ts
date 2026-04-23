import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TaskStatus = "processing" | "completed" | "failed";

export interface BackgroundTask {
  runId: string;
  flowId: string;
  flowName: string;
  status: TaskStatus;
  taskId?: string;
  outputType?: string;
  creditCost?: number;
  startedAt: number;
  completedAt?: number;
  errorMessage?: string;
  refunded?: boolean;
  /** Hidden from the floating toast/notification but still tracked in Library. */
  hiddenFromToast?: boolean;
}

interface BackgroundExecutionState {
  activeTasks: BackgroundTask[];
  addTask: (task: BackgroundTask) => void;
  removeTask: (runId: string) => void;
  /** Hide from floating notification only — still appears in Asset Library while processing. */
  hideToast: (runId: string) => void;
  /** Fully remove (used by Library when user dismisses a failed card). */
  dismissTask: (runId: string) => void;
  completeTask: (runId: string) => void;
  failTask: (runId: string, opts?: { refunded?: boolean; errorMessage?: string }) => void;
  getTask: (runId: string) => BackgroundTask | undefined;
}

export const useBackgroundExecutionStore = create<BackgroundExecutionState>()(
  persist(
    (set, get) => ({
      activeTasks: [],

      addTask: (task) =>
        set((state) => ({
          activeTasks: [
            ...state.activeTasks.filter((t) => t.runId !== task.runId),
            { ...task, status: "processing", hiddenFromToast: false },
          ],
        })),

      removeTask: (runId) =>
        set((state) => ({
          activeTasks: state.activeTasks.filter((t) => t.runId !== runId),
        })),

      hideToast: (runId) =>
        set((state) => ({
          activeTasks: state.activeTasks.map((t) =>
            t.runId === runId ? { ...t, hiddenFromToast: true } : t,
          ),
        })),

      dismissTask: (runId) =>
        set((state) => ({
          activeTasks: state.activeTasks.filter((t) => t.runId !== runId),
        })),

      completeTask: (runId) =>
        set((state) => ({
          activeTasks: state.activeTasks.map((t) =>
            t.runId === runId ? { ...t, status: "completed" as TaskStatus, completedAt: Date.now() } : t
          ),
        })),

      failTask: (runId, opts) =>
        set((state) => ({
          activeTasks: state.activeTasks.map((t) =>
            t.runId === runId
              ? { ...t, status: "failed" as TaskStatus, completedAt: Date.now(), refunded: opts?.refunded, errorMessage: opts?.errorMessage }
              : t
          ),
        })),

      getTask: (runId) => get().activeTasks.find((t) => t.runId === runId),
    }),
    {
      name: "mf-background-tasks",
    },
  ),
);
