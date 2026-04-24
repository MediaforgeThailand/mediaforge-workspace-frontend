import { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Clock, TrendingUp, Sparkles, SlidersHorizontal, X, Loader2, RefreshCw } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFlowCategories } from "@/hooks/useFlowCategories";
import { useLanguage } from "@/contexts/LanguageContext";
import FlowDataCard, { FlowDataCardSkeleton, type FlowCardData } from "@/components/FlowDataCard";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getDifficultyFromGraph } from "@/components/DifficultyBadge";
import {
  enrichBundlesWithFlows,
  findBundlesByCategoryIds,
  type BundleBaseRow,
} from "@/lib/bundleEnrichment";

/* ─── Sort options ─── */
type SortKey = "trending" | "latest" | "most_gen";
type ContentType = "all" | "flow" | "bundle";

const CONTENT_TYPE_OPTIONS: Array<{ key: ContentType; label: string }> = [
  { key: "all", label: "All" },
  { key: "flow", label: "Flow" },
  { key: "bundle", label: "Bundle" },
];

interface SortOption {
  key: SortKey;
  labelKey: string;
  icon: typeof Flame;
}

const SORT_OPTIONS: SortOption[] = [
  { key: "trending", labelKey: "cfTrending", icon: Flame },
  { key: "latest", labelKey: "cfLatest", icon: Clock },
  { key: "most_gen", labelKey: "cfMostGenerated", icon: TrendingUp },
];

const PAGE_SIZE = typeof window !== "undefined" && window.innerWidth < 768 ? 12 : 20;

/* ─── Data fetcher ─── */
async function fetchCommunityFlows(
  industryId: string | null,
  useCaseId: string | null,
  sort: SortKey,
  page: number,
  contentType: ContentType = "all",
): Promise<FlowCardData[]> {
  // Bundle-only: skip flow query entirely, return enriched bundles on page 0,
  // empty on subsequent pages so infinite scroll terminates cleanly.
  if (contentType === "bundle") {
    if (page !== 0) return [];
    return fetchBundlesAsFlowCards(industryId, useCaseId);
  }

  // If categories are selected, get flow IDs from junction table
  let flowIdFilter: string[] | null = null;

  if (industryId || useCaseId) {
    const categoryIds = [industryId, useCaseId].filter(Boolean) as string[];
    const { data: mappings } = await supabase
      .from("flow_category_mappings")
      .select("flow_id, category_id")
      .in("category_id", categoryIds);

    if (!mappings || mappings.length === 0) return [];

    if (industryId && useCaseId) {
      // Both filters: find flows that match BOTH categories
      const byCategory = new Map<string, Set<string>>();
      mappings.forEach((m) => {
        if (!byCategory.has(m.flow_id)) byCategory.set(m.flow_id, new Set());
        byCategory.get(m.flow_id)!.add(m.category_id);
      });
      flowIdFilter = [...byCategory.entries()]
        .filter(([, cats]) => cats.has(industryId) && cats.has(useCaseId))
        .map(([fid]) => fid);
    } else {
      flowIdFilter = [...new Set(mappings.map((m) => m.flow_id))];
    }

    if (flowIdFilter.length === 0) return [];
  }

  let query = supabase
    .from("flows")
    .select("id, name, description, category, tags, thumbnail_url, base_cost, markup_multiplier, is_official, user_id, selling_price, settings")
    .eq("status", "published");

  if (flowIdFilter) {
    query = query.in("id", flowIdFilter);
  }

  if (sort === "latest") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  const from = page * PAGE_SIZE;
  query = query.range(from, from + PAGE_SIZE - 1);
  const { data, error } = await query;
  if (error || !data) return [];

  const enrichedFlows = await enrichFlows(data, sort);

  // Flow-only or non-first page: no bundle merging.
  if (contentType === "flow" || page !== 0) return enrichedFlows;

  // "all" on page 0: blend bundles into the grid.
  const bundleCards = await fetchBundlesAsFlowCards(industryId, useCaseId);
  if (bundleCards.length === 0) return enrichedFlows;

  // Official bundles float to the very top alongside official flows.
  const officialBundles = bundleCards.filter((b) => b.is_official);
  const regularBundles = bundleCards.filter((b) => !b.is_official);
  return [...officialBundles, ...enrichedFlows, ...regularBundles];
}

/**
 * Fetch published bundles and shape them as FlowCardData so the same
 * FlowDataCard grid can render them. Respects the active category filter by
 * matching any constituent flow via flow_category_mappings.
 */
async function fetchBundlesAsFlowCards(
  industryId: string | null,
  useCaseId: string | null,
): Promise<FlowCardData[]> {
  const categoryIds = [industryId, useCaseId].filter(Boolean) as string[];

  let bundleQuery = supabase
    .from("bundles" as any)
    .select("id, user_id, name, description, thumbnail_url, tags, is_official, keywords")
    .eq("status", "published")
    .order("is_official", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(20);

  if (categoryIds.length > 0) {
    const matchingBundleIds = await findBundlesByCategoryIds(categoryIds);
    if (matchingBundleIds.length === 0) return [];
    bundleQuery = bundleQuery.in("id", matchingBundleIds);
  }

  const { data } = await bundleQuery;
  const rows = (data as unknown as BundleBaseRow[]) ?? [];
  if (rows.length === 0) return [];

  const enriched = await enrichBundlesWithFlows(rows);

  // Resolve creator profiles
  const userIds = [...new Set(enriched.map((b) => b.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));

  return enriched.map((b): FlowCardData => {
    const profile = profileMap.get(b.user_id);
    return {
      id: b.id,
      name: b.name,
      description: b.description,
      category: b.categories[0] ?? "Bundle",
      tags: b.tags,
      thumbnail_url: b.thumbnail_url,
      is_official: b.is_official,
      is_bundle: true,
      model_badge: "Bundle",
      final_price: b.min_price,
      price_range_max: b.max_price,
      creator_name: profile?.display_name || undefined,
      creator_avatar: profile?.avatar_url || undefined,
    };
  });
}

export async function enrichFlows(data: any[], sort?: SortKey): Promise<FlowCardData[]> {
  const userIds = [...new Set(data.map((f) => f.user_id))];
  const flowIds = data.map((f) => f.id);

  const [profilesRes, metricsRes, runsRes] = await Promise.all([
    supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds),
    supabase.from("flow_metrics").select("flow_id, avg_rating, total_runs").in("flow_id", flowIds),
    sort === "most_gen"
      ? supabase.from("flow_runs").select("flow_id").in("flow_id", flowIds)
      : Promise.resolve({ data: null }),
  ]);

  const profileMap = new Map(profilesRes.data?.map((p) => [p.user_id, p]) ?? []);
  const metricsMap = new Map(metricsRes.data?.map((m) => [m.flow_id, m]) ?? []);

  let runCountMap: Record<string, number> = {};
  if (runsRes.data) {
    runsRes.data.forEach((r: any) => {
      runCountMap[r.flow_id] = (runCountMap[r.flow_id] || 0) + 1;
    });
  }

  const enriched = data.map((f) => {
    const profile = profileMap.get(f.user_id);
    const metric = metricsMap.get(f.id);
    const graph = (f.settings as Record<string, unknown> | null)?.graph ?? null;
    const isBundle = !!f.is_bundle;
    return {
      id: f.id,
      name: f.name,
      description: f.description,
      category: f.category,
      tags: f.tags,
      thumbnail_url: f.thumbnail_url,
      final_price: f.selling_price || Math.ceil((f.base_cost || 0) * (f.markup_multiplier || 1)),
      // Preserve bundle-specific fields so search results link correctly
      // and display the price range from constituent flows.
      price_range_max: f.price_range_max ?? null,
      is_bundle: isBundle || undefined,
      model_badge: isBundle ? "Bundle" : undefined,
      is_official: f.is_official,
      creator_name: profile?.display_name || undefined,
      creator_avatar: profile?.avatar_url || undefined,
      avg_rating: metric?.avg_rating ?? null,
      difficulty: isBundle ? undefined : getDifficultyFromGraph(graph as any),
    };
  });

  // Sort
  if (sort === "trending") {
    enriched.sort((a, b) => {
      if (a.is_official && !b.is_official) return -1;
      if (!a.is_official && b.is_official) return 1;
      return (metricsMap.get(b.id)?.total_runs || 0) - (metricsMap.get(a.id)?.total_runs || 0);
    });
  } else if (sort === "most_gen") {
    enriched.sort((a, b) => (runCountMap[b.id] || 0) - (runCountMap[a.id] || 0));
  }

  return enriched;
}

/* ─── Scrollable pill row ─── */
const PillRow = ({
  items,
  activeKey,
  onSelect,
  allLabel,
}: {
  items: Array<{ id: string; name: string }>;
  activeKey: string | null;
  onSelect: (key: string | null) => void;
  allLabel: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border",
          activeKey === null
            ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
            : "bg-card/50 text-muted-foreground border-border/40 hover:border-border hover:text-foreground hover:bg-card",
        )}
      >
        {allLabel}
      </button>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className={cn(
            "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border whitespace-nowrap",
            activeKey === item.id
              ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
              : "bg-card/50 text-muted-foreground border-border/40 hover:border-border hover:text-foreground hover:bg-card",
          )}
        >
          {item.name}
        </button>
      ))}
    </div>
  );
};

/* ─── Imperative handle for parent to control filters ─── */
export interface CommunityFlowsHandle {
  setUseCaseFilter: (slug: string) => void;
  scrollIntoView: () => void;
}

/* ─── Component ─── */
const CommunityFlows = forwardRef<CommunityFlowsHandle>((_, ref) => {
  const [industryFilter, setIndustryFilter] = useState<string | null>(null);
  const [useCaseFilter, setUseCaseFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("latest");
  const [contentType, setContentType] = useState<ContentType>("all");
  const sectionRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  const { data: categoriesData } = useFlowCategories();

  useImperativeHandle(ref, () => ({
    setUseCaseFilter: (slug: string) => {
      // Find use case by slug
      const uc = categoriesData?.useCases?.find((c) => c.slug === slug);
      if (uc) {
        setUseCaseFilter(uc.id);
      }
    },
    scrollIntoView: () => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  }));

  const queryKey = ["community-flows", industryFilter, useCaseFilter, sortKey, contentType];

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 0 }) =>
      fetchCommunityFlows(industryFilter, useCaseFilter, sortKey, pageParam, contentType),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    initialPageParam: 0,
    staleTime: 60_000,
  });

  // Stable flows reference — only changes when actual data changes, not on every render
  const pages = data?.pages;
  const flows = useMemo(() => pages?.flat() ?? [], [pages]);

  // Responsive column count — stable ref to avoid remounting cards on resize
  const [colCount, setColCount] = useState(() => {
    if (typeof window === "undefined") return 2;
    const w = window.innerWidth;
    return w >= 1024 ? 5 : w >= 768 ? 4 : w >= 640 ? 3 : 2;
  });
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setColCount(w >= 1024 ? 5 : w >= 768 ? 4 : w >= 640 ? 3 : 2);
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Distribute items into columns via round-robin (stable: index N always maps to column N % cols)
  const columns = useMemo(() => {
    const cols: FlowCardData[][] = Array.from({ length: colCount }, () => []);
    flows.forEach((flow, i) => cols[i % colCount].push(flow));
    return cols;
  }, [flows, colCount]);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <section ref={sectionRef} className="mt-6 px-2 md:px-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[24px] font-bold text-white">
          {t("cfExploreFlows")}
        </h2>
      </div>

      {/* ─── Sort + Filter button ─── */}
      <div className="flex items-center gap-2 mb-5">
        {/* Sort pills */}
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortKey(opt.key)}
            className={cn(
              "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border",
              sortKey === opt.key
                ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                : "bg-card/50 text-muted-foreground border-border/40 hover:border-border hover:text-foreground hover:bg-card",
            )}
          >
            <opt.icon className="w-3 h-3" />
            {t(opt.labelKey as any)}
          </button>
        ))}

        {/* Divider */}
        <div className="h-5 w-px bg-border/40 shrink-0" />

        {/* Content type toggle (All / Flow / Bundle) */}
        {CONTENT_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setContentType(opt.key)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border",
              contentType === opt.key
                ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                : "bg-card/50 text-muted-foreground border-border/40 hover:border-border hover:text-foreground hover:bg-card",
            )}
          >
            {opt.label}
          </button>
        ))}

        {/* Divider */}
        <div className="h-5 w-px bg-border/40 shrink-0" />

        {/* Filter popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border",
                (industryFilter || useCaseFilter)
                  ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                  : "bg-card/50 text-muted-foreground border-border/40 hover:border-border hover:text-foreground hover:bg-card",
              )}
            >
              <SlidersHorizontal className="w-3 h-3" />
              {t("cfFilter")}
              {(industryFilter || useCaseFilter) && (
                <span className="ml-0.5 bg-primary-foreground/20 text-primary-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center">
                  {(industryFilter ? 1 : 0) + (useCaseFilter ? 1 : 0)}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[420px] p-0 bg-card border-border/60">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <span className="text-sm font-semibold text-foreground">{t("cfFilters")}</span>
              {(industryFilter || useCaseFilter) && (
                <button
                  onClick={() => { setIndustryFilter(null); setUseCaseFilter(null); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("cfClearAll")}
                </button>
              )}
            </div>

            <div className="p-4 space-y-4">
              {/* Industry */}
              {(categoriesData?.industries?.length ?? 0) > 0 && (
                <div>
                  <span className="text-[11px] text-muted-foreground/70 font-medium uppercase tracking-wider mb-2 block">{t("cfIndustry")}</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setIndustryFilter(null)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 border",
                        industryFilter === null
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card/50 text-muted-foreground border-border/40 hover:border-border hover:text-foreground",
                      )}
                    >
                      {t("cfAll")}
                    </button>
                    {categoriesData!.industries.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setIndustryFilter(item.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 border",
                          industryFilter === item.id
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card/50 text-muted-foreground border-border/40 hover:border-border hover:text-foreground",
                        )}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Use Case */}
              {(categoriesData?.useCases?.length ?? 0) > 0 && (
                <div>
                  <span className="text-[11px] text-muted-foreground/70 font-medium uppercase tracking-wider mb-2 block">{t("cfType")}</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setUseCaseFilter(null)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 border",
                        useCaseFilter === null
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card/50 text-muted-foreground border-border/40 hover:border-border hover:text-foreground",
                      )}
                    >
                      {t("cfAll")}
                    </button>
                    {categoriesData!.useCases.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setUseCaseFilter(item.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 border",
                          useCaseFilter === item.id
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card/50 text-muted-foreground border-border/40 hover:border-border hover:text-foreground",
                        )}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Grid layout — 4 per row */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${industryFilter}-${useCaseFilter}-${sortKey}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <FlowDataCardSkeleton key={i} span="normal" gridMode />
              ))}
            </div>
          ) : isError && flows.length === 0 ? (
            <div className="py-16 text-center">
              <RefreshCw className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">
                {t("cfFailedToLoad")}
              </p>
              <button
                onClick={() => refetch()}
                className="px-4 py-1.5 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {t("cfTryAgain")}
              </button>
            </div>
          ) : flows.length > 0 ? (
            <div className="flex gap-1.5">
              {columns.map((col, colIdx) => (
                <div key={colIdx} className="flex-1 flex flex-col gap-1.5">
                  {col.map((flow, rowIdx) => (
                    <FlowDataCard key={flow.id} flow={flow} index={colIdx + rowIdx * colCount} gridMode />
                  ))}
                  {/* Skeleton placeholders in each column while loading next page */}
                  {isFetchingNextPage && <FlowDataCardSkeleton span="normal" gridMode />}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <Sparkles className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {t("cfNoFlows")}
              </p>
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {isError && flows.length > 0 && (
            <div className="flex justify-center py-6">
              <button
                onClick={() => fetchNextPage()}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium bg-card/50 text-muted-foreground border border-border/40 hover:text-foreground hover:border-border transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                {t("cfLoadMoreFailed")}
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
});

CommunityFlows.displayName = "CommunityFlows";
export default CommunityFlows;
