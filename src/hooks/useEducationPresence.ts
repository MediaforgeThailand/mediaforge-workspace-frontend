import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type EducationScopeRow = {
  organization_id?: string | null;
  class_id?: string | null;
  class_role?: string | null;
};

export function useEducationPresence(args: {
  userId?: string | null;
  enabled?: boolean;
  projectId?: string | null;
  workspaceId?: string | null;
  canvasId?: string | null;
  activity?: string | null;
}) {
  const scopeRef = useRef<EducationScopeRow | null>(null);

  useEffect(() => {
    if (!args.enabled || !args.userId) {
      scopeRef.current = null;
      return;
    }

    let cancelled = false;

    const resolveScope = async () => {
      try {
        const { data, error } = await (supabase as any).rpc("workspace_education_credit_scope", {
          p_user_id: args.userId,
        });
        if (error) {
          if (!/function .*workspace_education_credit_scope/i.test(error.message)) {
            console.warn("[education-presence] scope lookup skipped:", error.message);
          }
          return;
        }
        if (cancelled) return;
        const row = Array.isArray(data) ? data[0] : data;
        scopeRef.current = row && typeof row === "object" ? row as EducationScopeRow : null;
      } catch (err) {
        console.warn("[education-presence] scope lookup failed:", err instanceof Error ? err.message : String(err));
      }
    };

    void resolveScope();

    return () => {
      cancelled = true;
    };
  }, [args.enabled, args.userId]);

  useEffect(() => {
    if (!args.enabled || !args.userId) return;

    let stopped = false;
    const writePresence = async (forceOffline = false) => {
      const scope = scopeRef.current;
      if (!scope?.organization_id || !scope.class_id || scope.class_role !== "student") return;

      const status = forceOffline ? "offline" : document.hidden ? "idle" : "online";
      try {
        await (supabase as any).from("education_student_screen_presence").upsert({
          organization_id: scope.organization_id,
          class_id: scope.class_id,
          user_id: args.userId,
          status,
          screen_state: "not_shared",
          current_project_id: args.projectId ?? null,
          current_workspace_id: args.workspaceId ?? null,
          current_canvas_id: args.canvasId ?? null,
          current_activity: args.activity ?? window.location.pathname,
          last_seen_at: new Date().toISOString(),
          metadata: {
            path: window.location.pathname,
            visibility: document.visibilityState,
            user_agent: navigator.userAgent.slice(0, 120),
          },
        }, { onConflict: "class_id,user_id" });
      } catch (err) {
        if (!stopped) {
          console.warn("[education-presence] heartbeat failed:", err instanceof Error ? err.message : String(err));
        }
      }
    };

    const tick = () => void writePresence(false);
    const interval = window.setInterval(tick, 20_000);
    const onVisibility = () => tick();
    const onBeforeUnload = () => void writePresence(true);

    tick();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void writePresence(true);
    };
  }, [
    args.activity,
    args.canvasId,
    args.enabled,
    args.projectId,
    args.userId,
    args.workspaceId,
  ]);
}
