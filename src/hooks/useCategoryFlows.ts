import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FlowCardData } from "@/components/FlowDataCard";
import { OFFICIAL_CATEGORIES } from "@/constants/categories";
import { getDifficultyFromGraph } from "@/components/DifficultyBadge";

const DISPLAY_CATEGORIES = OFFICIAL_CATEGORIES.filter((c) => c !== "General");

export interface CategoryRow {
  category: string;
  flows: FlowCardData[];
  isLoading: boolean;
}

export const useCategoryFlows = () => {
  const queries = useQueries({
    queries: DISPLAY_CATEGORIES.map((cat) => ({
      queryKey: ["category-flows", cat],
      queryFn: async (): Promise<{ category: string; flows: FlowCardData[] }> => {
        const { data: flowsData } = await supabase
          .from("flows")
          .select(`
            id, name, description, category, thumbnail_url, selling_price,
            is_official, tags, user_id, settings,
            flow_metrics ( avg_rating, total_runs )
          `)
          .eq("status", "published")
          .eq("category", cat)
          .order("created_at", { ascending: false })
          .limit(10);

        if (!flowsData?.length) return { category: cat, flows: [] };

        const userIds = [...new Set(flowsData.map((f) => f.user_id))];
        const { data: profiles } = userIds.length
          ? await supabase.from("profiles_public").select("user_id, display_name, avatar_url").in("user_id", userIds)
          : { data: [] };

        const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p]));

        const flows: FlowCardData[] = flowsData.map((f) => {
          const profile = profileMap[f.user_id];
          const metrics = Array.isArray(f.flow_metrics) ? f.flow_metrics[0] : f.flow_metrics;
          const graph = (f.settings as Record<string, unknown>)?.graph ?? null;
          return {
            id: f.id,
            name: f.name,
            description: f.description,
            category: f.category,
            thumbnail_url: f.thumbnail_url,
            estimated_credits: f.selling_price,
            output_type: "image" as const,
            creator_name: profile?.display_name ?? (f.is_official ? "MediaForge" : "Creator"),
            creator_avatar: profile?.avatar_url ?? null,
            is_official: f.is_official,
            avg_rating: (metrics as any)?.avg_rating ?? null,
            difficulty: getDifficultyFromGraph(graph as any),
          };
        });

        return { category: cat, flows };
      },
      staleTime: 60_000,
    })),
  });

  const rows: CategoryRow[] = queries.map((q, i) => ({
    category: DISPLAY_CATEGORIES[i],
    flows: q.data?.flows ?? [],
    isLoading: q.isLoading,
  }));

  const isLoading = queries.some((q) => q.isLoading);

  return { rows, isLoading };
};
