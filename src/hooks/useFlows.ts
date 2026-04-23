import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { validateFlowGraph, type FlowWarning } from "@/lib/flowValidation";
import type { FlowGraph } from "@/pages/play-flow/types";

export interface FlowWithStats {
  id: string;
  name: string;
  status: string;
  current_version: number;
  category: string;
  updated_at: string;
  created_at: string;
  description: string | null;
  tags: string[] | null;
  thumbnail_url: string | null;
  selling_price: number;
  markup_multiplier: number;
  settings: Record<string, unknown> | null;
  // Computed
  graph: FlowGraph | null;
  warnings: FlowWarning[];
  // Aggregated stats
  runs: number;
  successRate: number;
  avgTimeMs: number | null;
}

export const useFlows = () => {
  const { user } = useAuth();
  const { t } = useLanguage();

  return useQuery({
    queryKey: ["flows", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<FlowWithStats[]> => {
      const { data: flows, error } = await supabase
        .from("flows")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });

      if (error) throw error;
      if (!flows?.length) return [];

      const flowIds = flows.map((f) => f.id);
      const { data: runs } = await supabase
        .from("flow_runs")
        .select("flow_id, status, duration_ms")
        .in("flow_id", flowIds);

      const statsMap = new Map<string, { total: number; success: number; totalMs: number; countMs: number }>();
      (runs ?? []).forEach((r) => {
        const s = statsMap.get(r.flow_id) ?? { total: 0, success: 0, totalMs: 0, countMs: 0 };
        s.total++;
        if (r.status === "completed") s.success++;
        if (r.duration_ms) { s.totalMs += r.duration_ms; s.countMs++; }
        statsMap.set(r.flow_id, s);
      });

      return flows.map((f) => {
        const s = statsMap.get(f.id);
        const settings = (f.settings as Record<string, unknown>) ?? null;
        const graph = (settings?.graph as FlowGraph) ?? null;
        const warnings = validateFlowGraph(graph, t);

        return {
          id: f.id,
          name: f.name,
          status: f.status,
          current_version: f.current_version,
          category: f.category,
          updated_at: f.updated_at,
          created_at: f.created_at,
          description: f.description,
          tags: f.tags,
          thumbnail_url: f.thumbnail_url,
          selling_price: f.selling_price,
          markup_multiplier: f.markup_multiplier,
          settings,
          graph,
          warnings,
          runs: s?.total ?? 0,
          successRate: s && s.total > 0 ? Math.round((s.success / s.total) * 1000) / 10 : 0,
          avgTimeMs: s && s.countMs > 0 ? Math.round(s.totalMs / s.countMs) : null,
        };
      });
    },
  });
};

export const useFlowStats = (flows: FlowWithStats[] | undefined) => {
  const totalFlows = flows?.length ?? 0;
  const totalRuns = flows?.reduce((sum, f) => sum + f.runs, 0) ?? 0;
  const flowsWithRuns = flows?.filter((f) => f.runs > 0) ?? [];
  const avgSuccess = flowsWithRuns.length > 0
    ? Math.round(flowsWithRuns.reduce((sum, f) => sum + f.successRate, 0) / flowsWithRuns.length * 10) / 10
    : 0;
  const avgTimeMs = flowsWithRuns.length > 0
    ? Math.round(flowsWithRuns.reduce((sum, f) => sum + (f.avgTimeMs ?? 0), 0) / flowsWithRuns.length)
    : 0;

  return { totalFlows, totalRuns, avgSuccess, avgTimeMs };
};

export const formatDuration = (ms: number | null): string => {
  if (!ms) return "—";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
};

export const formatTimeAgo = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
};
