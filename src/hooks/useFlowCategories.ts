import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FlowCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_group: "industry" | "use_case";
  icon: string;
  sort_order: number;
}

export function useFlowCategories() {
  return useQuery({
    queryKey: ["flow-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flow_categories")
        .select("id, name, slug, description, category_group, icon, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      const industries = (data ?? []).filter((c) => c.category_group === "industry") as FlowCategory[];
      const useCases = (data ?? []).filter((c) => c.category_group === "use_case") as FlowCategory[];

      return { industries, useCases, all: (data ?? []) as FlowCategory[] };
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
}

/** Fetch category IDs mapped to a specific flow */
export function useFlowCategoryMappings(flowId: string | undefined) {
  return useQuery({
    queryKey: ["flow-category-mappings", flowId],
    queryFn: async () => {
      if (!flowId) return [];
      const { data, error } = await supabase
        .from("flow_category_mappings")
        .select("category_id")
        .eq("flow_id", flowId);

      if (error) throw error;
      return (data ?? []).map((m) => m.category_id);
    },
    enabled: !!flowId,
  });
}
