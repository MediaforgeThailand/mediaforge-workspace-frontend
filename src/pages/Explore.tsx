import { useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Search, Sparkles, X, Brain } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useFlowCategories } from "@/hooks/useFlowCategories";
import { useDebounce } from "@/hooks/useDebounce";
import { hybridSearchFlows } from "@/lib/hybridSearch";
import { enrichBundlesWithFlows, findBundlesByCategoryIds, type BundleBaseRow } from "@/lib/bundleEnrichment";
import FlowDataCard, { FlowDataCardSkeleton, getBentoSpan } from "@/components/FlowDataCard";
import type { FlowCardData } from "@/components/FlowDataCard";
import { useLanguage } from "@/contexts/LanguageContext";

/* ─── Node → Model mapping ─── */
const NODE_MODEL_MAP: Record<string, { label: string; output: "image" | "video" | "text" }> = {
  bananaProNode: { label: "Banana Pro", output: "image" },
  klingVideoNode: { label: "Image to Video", output: "video" },
  chatAiNode: { label: "Chat AI", output: "text" },
};

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
});

/* ─── Main Page ─── */
const Explore = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [searchQuery, setSearchQuery] = useState(initialQ);
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const { data: categoriesData } = useFlowCategories();
  const { t } = useLanguage();

  const toggleCategory = useCallback((id: string) => {
    setActiveCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }, []);

  const clearFilters = useCallback(() => {
    setActiveCategories([]);
    setSearchQuery("");
    setSearchParams({});
  }, [setSearchParams]);

  const { data: flows = [], isLoading: loading, isFetching } = useQuery({
    queryKey: ["explore-flows", activeCategories, debouncedSearch],
    queryFn: async () => {
      const hasSearch = debouncedSearch.trim().length > 0;

      // ── Hybrid AI Search path ──
      if (hasSearch && activeCategories.length === 0) {
        const results = await hybridSearchFlows(debouncedSearch, { matchCount: 30 });

        if (results.length === 0) return [];

        // Only flow rows need node/runs enrichment — bundles skip these joins.
        const flowOnlyIds = results.filter((r) => !r.is_bundle).map((r) => r.id);
        const creatorIds = [...new Set(results.map((r) => r.user_id))];

        const [nodesRes, creatorsRes, runsRes] = await Promise.all([
          flowOnlyIds.length
            ? supabase.from("flow_nodes").select("flow_id, node_type").in("flow_id", flowOnlyIds)
            : Promise.resolve({ data: [] }),
          supabase.from("profiles_public").select("user_id, display_name, avatar_url").in("user_id", creatorIds),
          flowOnlyIds.length
            ? supabase.from("flow_runs").select("flow_id, status").in("flow_id", flowOnlyIds)
            : Promise.resolve({ data: [] }),
        ]);

        const flowNodeMap: Record<string, string[]> = {};
        nodesRes.data?.forEach((n) => {
          if (!flowNodeMap[n.flow_id]) flowNodeMap[n.flow_id] = [];
          flowNodeMap[n.flow_id].push(n.node_type);
        });

        const creatorMap: Record<string, { name: string | null; avatar: string | null }> = {};
        creatorsRes.data?.forEach((c) => {
          if (c.user_id) creatorMap[c.user_id] = { name: c.display_name, avatar: c.avatar_url };
        });

        const runCountMap: Record<string, number> = {};
        runsRes.data?.forEach((r) => {
          runCountMap[r.flow_id] = (runCountMap[r.flow_id] || 0) + 1;
        });

        return results.map((f): FlowCardData => {
          const nodeTypes = flowNodeMap[f.id] || [];
          const actionNode = nodeTypes.find((nt) => NODE_MODEL_MAP[nt]);
          const modelInfo = actionNode ? NODE_MODEL_MAP[actionNode] : null;
          const creator = creatorMap[f.user_id];

          return {
            id: f.id,
            name: f.name,
            description: f.description,
            category: f.category,
            tags: f.tags,
            thumbnail_url: f.thumbnail_url,
            is_official: f.is_official,
            is_bundle: f.is_bundle,
            model_badge: f.is_bundle ? "Bundle" : (modelInfo?.label || "AI"),
            estimated_credits: 0,
            final_price: f.selling_price || f.base_cost || 0,
            price_range_max: f.is_bundle ? (f.price_range_max ?? null) : null,
            output_type: f.is_bundle ? ("unknown" as const) : (modelInfo?.output || ("unknown" as const)),
            creator_name: creator?.name || null,
            creator_avatar: creator?.avatar || null,
          };
        });
      }

      // ── Standard browse path (categories / no search) ──
      let flowIds: string[] | null = null;

      if (activeCategories.length > 0) {
        const { data: mappings } = await supabase
          .from("flow_category_mappings")
          .select("flow_id")
          .in("category_id", activeCategories);

        if (!mappings || mappings.length === 0) return [];
        flowIds = [...new Set(mappings.map((m) => m.flow_id))];
      }

      let query = supabase
        .from("flows")
        .select("id, name, description, category, tags, thumbnail_url, current_version, base_cost, markup_multiplier, is_official, user_id, selling_price, keywords")
        .eq("status", "published")
        .order("updated_at", { ascending: false });

      if (flowIds) {
        query = query.in("id", flowIds);
      }

      if (hasSearch) {
        const term = debouncedSearch.trim();
        query = query.or(
          `name.ilike.%${term}%,description.ilike.%${term}%,keywords.cs.{"${term.toLowerCase()}"}`
        );
      }

      // Fetch published bundles in parallel. Category filter is satisfied by
      // matching any constituent flow via flow_category_mappings.
      const bundleIdsByCategoryPromise = activeCategories.length > 0
        ? findBundlesByCategoryIds(activeCategories)
        : Promise.resolve<string[] | null>(null);

      const [flowsRes, bundleIdsByCategory] = await Promise.all([
        query,
        bundleIdsByCategoryPromise,
      ]);

      let bundleQuery = supabase
        .from("bundles" as any)
        .select("id, user_id, name, description, thumbnail_url, tags, is_official, keywords")
        .eq("status", "published")
        .order("updated_at", { ascending: false })
        .limit(30);

      if (bundleIdsByCategory !== null) {
        if (bundleIdsByCategory.length === 0) {
          bundleQuery = bundleQuery.in("id", ["__no_match__"]); // force empty
        } else {
          bundleQuery = bundleQuery.in("id", bundleIdsByCategory);
        }
      }

      if (hasSearch) {
        const term = debouncedSearch.trim();
        bundleQuery = bundleQuery.or(
          `name.ilike.%${term}%,description.ilike.%${term}%,keywords.cs.{"${term.toLowerCase()}"}`,
        );
      }

      const bundlesRes = await bundleQuery;
      const flowsData = flowsRes.data;
      const bundleBaseRows = ((bundlesRes as any).data ?? []) as BundleBaseRow[];
      const enrichedBundles = await enrichBundlesWithFlows(bundleBaseRows);
      const filteredBundles = enrichedBundles;

      if ((!flowsData || flowsData.length === 0) && filteredBundles.length === 0) return [];

      const fIds = (flowsData ?? []).map((f) => f.id);
      const creatorIds = [
        ...new Set([
          ...(flowsData ?? []).map((f) => f.user_id),
          ...filteredBundles.map((b) => b.user_id),
        ]),
      ];

      const [nodesRes, costsRes, creatorsRes, runsRes] = await Promise.all([
        supabase.from("flow_nodes").select("flow_id, node_type").in("flow_id", fIds),
        supabase.from("credit_costs").select("feature, model, cost").order("cost", { ascending: true }),
        supabase.from("profiles_public").select("user_id, display_name, avatar_url").in("user_id", creatorIds),
        supabase.from("flow_runs").select("flow_id, status").in("flow_id", fIds),
      ]);

      const flowNodeMap: Record<string, string[]> = {};
      nodesRes.data?.forEach((n) => {
        if (!flowNodeMap[n.flow_id]) flowNodeMap[n.flow_id] = [];
        flowNodeMap[n.flow_id].push(n.node_type);
      });

      const costMap: Record<string, number> = {};
      costsRes.data?.forEach((c) => {
        const key = c.model || c.feature;
        if (!costMap[key]) costMap[key] = c.cost;
      });

      const creatorMap: Record<string, { name: string | null; avatar: string | null }> = {};
      creatorsRes.data?.forEach((c) => {
        if (c.user_id) creatorMap[c.user_id] = { name: c.display_name, avatar: c.avatar_url };
      });

      const runCountMap: Record<string, number> = {};
      runsRes.data?.forEach((r) => {
        runCountMap[r.flow_id] = (runCountMap[r.flow_id] || 0) + 1;
      });

      const enriched: FlowCardData[] = (flowsData ?? []).map((f) => {
        const nodeTypes = flowNodeMap[f.id] || [];
        const actionNode = nodeTypes.find((nt) => NODE_MODEL_MAP[nt]);
        const modelInfo = actionNode ? NODE_MODEL_MAP[actionNode] : null;

        let estimatedCredits = 0;
        if (actionNode === "bananaProNode") {
          estimatedCredits = costMap["nano-banana-pro"] || costMap["generate_freepik_image"] || 104;
        } else if (actionNode === "klingVideoNode") {
          estimatedCredits = costMap["kling-v2-6-pro"] || 700;
        } else if (actionNode === "chatAiNode") {
          estimatedCredits = 25;
        }

        const finalPrice = f.selling_price > 0
          ? f.selling_price
          : f.base_cost > 0
            ? Math.round(f.base_cost * (f.markup_multiplier || 4.0))
            : estimatedCredits;

        const creator = creatorMap[f.user_id];

        return {
          ...f,
          model_badge: modelInfo?.label || "AI",
          estimated_credits: estimatedCredits,
          final_price: finalPrice,
          output_type: modelInfo?.output || ("unknown" as const),
          creator_name: creator?.name || null,
          creator_avatar: creator?.avatar || null,
        };
      });

      // Map enriched bundles into FlowCardData shape and append. Category and
      // price are derived from the bundle's constituent flows.
      for (const b of filteredBundles) {
        const creator = creatorMap[b.user_id];
        enriched.push({
          id: b.id,
          name: b.name,
          description: b.description,
          category: b.categories[0] ?? "Bundle",
          tags: b.tags,
          thumbnail_url: b.thumbnail_url,
          is_official: b.is_official,
          is_bundle: true,
          model_badge: "Bundle",
          estimated_credits: 0,
          final_price: b.min_price,
          price_range_max: b.max_price,
          output_type: "unknown" as const,
          creator_name: creator?.name ?? null,
          creator_avatar: creator?.avatar ?? null,
        });
      }

      // Trend sorting: official first, then by run count (bundles have 0 runs).
      enriched.sort((a, b) => {
        if (a.is_official && !b.is_official) return -1;
        if (!a.is_official && b.is_official) return 1;
        return (runCountMap[b.id] || 0) - (runCountMap[a.id] || 0);
      });

      return enriched;
    },
    staleTime: 30_000,
  });

  const hasActiveFilters = activeCategories.length > 0 || searchQuery.trim().length > 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-20">
        {/* ─── Search + Filters bar ─── */}
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl pb-4 pt-2 -mx-4 px-4 sm:-mx-6 sm:px-6">
          {/* Search */}
          <div className="relative max-w-sm mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input
              type="text"
              placeholder={t("exploreSearchPlaceholder")}
              className="pl-9 h-9 bg-card/60 border-border/20 rounded-lg text-sm focus-visible:ring-primary/30"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter chips — single row, scrollable */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {categoriesData?.all.map((cat) => (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className={cn(
                  "shrink-0 text-xs px-3 py-1.5 rounded-full border transition-all whitespace-nowrap",
                  activeCategories.includes(cat.id)
                    ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                    : "bg-card/40 border-border/20 text-muted-foreground hover:text-foreground hover:border-border/40"
                )}
              >
                {cat.name}
              </button>
            ))}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 ml-1"
              >
                <X className="w-3 h-3" /> {t("clearFilters")}
              </button>
            )}
          </div>
        </div>

        {/* ─── Results ─── */}
        {(loading || isFetching) ? (
          <div className="space-y-3">
            {isFetching && debouncedSearch.trim() && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                <Brain className="w-4 h-4 text-primary" />
                {t("aiSearch")}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <FlowDataCardSkeleton key={i} span={getBentoSpan(i)} />
              ))}
            </div>
          </div>
        ) : flows.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {flows.map((flow, i) => (
              <FlowDataCard key={flow.id} flow={flow} span={getBentoSpan(i)} index={i} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/20 bg-card/10 py-24 text-center">
            <Sparkles className="w-7 h-7 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? `${t("noResults")} "${searchQuery}"` : t("noWorkflow")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Explore;
