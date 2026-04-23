import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { phStockSearched } from "@/lib/posthogEvents";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search, Image, Film, Download, Loader2, ChevronLeft, ChevronRight,
  ExternalLink, Sparkles, ArrowRight, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";

/* ─── Types ─── */
interface FreepikResource {
  id: number;
  title: string;
  url: string;
  image?: { source?: { url: string; size?: string } };
  thumbnail?: { url: string };
  thumbnails?: { url: string }[];
  preview?: { url: string };
}

interface FreepikVideo {
  id: number;
  title: string;
  url: string;
  thumbnail?: { url: string };
  thumbnails?: { url: string }[];
  preview?: { url: string };
  video?: { url: string };
}

type MediaType = "photos" | "videos";

/* ─── Category definitions ─── */
const CATEGORIES = [
  { key: "photos", label: "Photos", query: "photography studio professional" },
  { key: "vectors", label: "Vectors", query: "vector illustration colorful" },
  { key: "illustrations", label: "Illustrations", query: "digital illustration art" },
  { key: "mockups", label: "Mockups", query: "product mockup design" },
  { key: "videos", label: "Videos", query: "popular" },
  { key: "icons", label: "Icons", query: "icon set minimal" },
] as const;

/* ─── Popular search suggestions ─── */
const POPULAR_SEARCHES = [
  "product mockup", "food photography", "nature", "business",
  "technology", "fashion", "social media", "abstract",
  "lifestyle", "architecture", "minimal", "vintage",
];

/* ─── Trending collections ─── */
const TRENDING_COLLECTIONS = [
  { label: "Product Photography", query: "product photography studio" },
  { label: "Social Media Templates", query: "social media template" },
  { label: "Food & Beverage", query: "food photography overhead" },
  { label: "Business & Corporate", query: "business corporate modern" },
  { label: "Fashion & Lifestyle", query: "fashion editorial portrait" },
  { label: "Nature & Landscape", query: "nature landscape scenic" },
];

/* ─── Stock Card ─── */
const StockCard = ({
  item,
  type,
  onDownload,
  downloading,
}: {
  item: FreepikResource | FreepikVideo;
  type: "photo" | "video";
  onDownload: (item: FreepikResource | FreepikVideo) => void;
  downloading: number | null;
}) => {
  const thumbUrl =
    (item as any).image?.source?.url ||
    (item as any).thumbnail?.url ||
    (item as any).thumbnails?.[0]?.url ||
    (item as any).preview?.url ||
    "";

  const isDownloading = downloading === item.id;
  const { t } = useLanguage();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      layout
      className="rounded-xl overflow-hidden border border-border/20 bg-card/30 backdrop-blur-sm group relative cursor-pointer"
    >
      <div className="relative aspect-[4/3] bg-muted/10 overflow-hidden">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={item.title || "Stock media"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {type === "video" ? (
              <Film className="w-8 h-8 text-muted-foreground/20" />
            ) : (
              <Image className="w-8 h-8 text-muted-foreground/20" />
            )}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end p-3">
          <div className="flex items-center gap-1.5 w-full">
            <Button
              size="sm"
              className="flex-1 h-8 text-xs gap-1.5 bg-white text-black hover:bg-white/90 font-medium"
              onClick={(e) => { e.stopPropagation(); onDownload(item); }}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Download className="w-3 h-3" />
              )}
              {isDownloading ? t("stockLibDownloading") : t("download")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-white/80 hover:text-white hover:bg-white/10"
              onClick={(e) => { e.stopPropagation(); window.open(item.url, "_blank"); }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {type === "video" && (
          <Badge className="absolute top-2 left-2 text-[10px] bg-black/50 backdrop-blur-md border-0 text-white">
            <Film className="w-2.5 h-2.5 mr-1" />
            Video
          </Badge>
        )}
      </div>
    </motion.div>
  );
};

/* ─── Main Page ─── */
const StockLibrary = () => {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<MediaType>("photos");
  const [orientation, setOrientation] = useState<string>("");
  const [order, setOrder] = useState<string>("relevance");
  const [loading, setLoading] = useState(false);
  const [resources, setResources] = useState<FreepikResource[]>([]);
  const [videos, setVideos] = useState<FreepikVideo[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [trendingPhotos, setTrendingPhotos] = useState<FreepikResource[]>([]);
  const [categoryPreviews, setCategoryPreviews] = useState<Record<string, string>>({});
  const [collectionPreviews, setCollectionPreviews] = useState<Record<string, string>>({});
  // Load trending photos on mount
  useEffect(() => {
    loadTrending();
    loadCategoryPreviews();
    loadCollectionPreviews();
  }, []);

  const loadCategoryPreviews = async () => {
    const previews: Record<string, string> = {};
    await Promise.all(
      CATEGORIES.map(async (cat) => {
        try {
          const { data } = await supabase.functions.invoke("freepik-stock", {
            body: { action: "search-resources", query: cat.query, page: 1, limit: 1 },
          });
          const url = data?.data?.[0]?.image?.source?.url || data?.data?.[0]?.thumbnail?.url || data?.data?.[0]?.thumbnails?.[0]?.url;
          if (url) previews[cat.key] = url;
        } catch {}
      })
    );
    setCategoryPreviews(previews);
  };

  const loadCollectionPreviews = async () => {
    const previews: Record<string, string> = {};
    await Promise.all(
      TRENDING_COLLECTIONS.map(async (col) => {
        try {
          const { data } = await supabase.functions.invoke("freepik-stock", {
            body: { action: "search-resources", query: col.query, page: 1, limit: 1 },
          });
          const url = data?.data?.[0]?.image?.source?.url || data?.data?.[0]?.thumbnail?.url || data?.data?.[0]?.thumbnails?.[0]?.url;
          if (url) previews[col.label] = url;
        } catch {}
      })
    );
    setCollectionPreviews(previews);
  };

  const loadTrending = async () => {
    try {
      const { data } = await supabase.functions.invoke("freepik-stock", {
        body: { action: "search-resources", query: "trending popular creative", page: 1, limit: 12 },
      });
      if (data?.data) setTrendingPhotos(data.data);
    } catch (e) {
      console.error("Failed to load trending:", e);
    }
  };

  const searchStock = useCallback(
    async (searchPage = 1) => {
      if (!query.trim()) return;
      setLoading(true);
      setHasSearched(true);

      try {
        const action = activeType === "photos" ? "search-resources" : "search-videos";
        const { data, error } = await supabase.functions.invoke("freepik-stock", {
          body: {
            action,
            query: query.trim(),
            page: searchPage,
            limit: 24,
            ...(activeType === "photos" && orientation && orientation !== "all" ? { orientation } : {}),
            ...(order && order !== "relevance" ? { order } : {}),
          },
        });

        if (error) throw error;

        if (activeType === "photos") {
          setResources(data?.data || []);
        } else {
          setVideos(data?.data || []);
        }

        const meta = data?.meta;
        const totalResults = meta?.pagination?.total || 0;
        phStockSearched({ query: query.trim(), type: activeType, results_count: totalResults });
        if (meta) {
          setTotalPages(Math.ceil((totalResults) / (meta.pagination?.limit || 24)));
        }
        setPage(searchPage);
      } catch (err) {
        console.error("Stock search error:", err);
        toast.error(t("stockLibSearchFailed"));
      } finally {
        setLoading(false);
      }
    },
    [query, activeType, orientation, order]
  );

  const handleDownload = async (item: FreepikResource | FreepikVideo) => {
    setDownloading(item.id);
    try {
      const isVideo = activeType === "videos";
      const action = isVideo ? "download-video" : "download-resource";
      const idKey = isVideo ? "videoId" : "resourceId";

      const { data, error } = await supabase.functions.invoke("freepik-stock", {
        body: { action, [idKey]: item.id, title: item.title },
      });

      if (error) throw error;

      const downloadUrl = data?.data?.url;
      if (downloadUrl) {
        window.open(downloadUrl, "_blank");
        toast.success(t("stockLibDownloadSuccess"));
      } else {
        toast.error(t("stockLibDownloadLinkNotFound"));
      }
    } catch (err) {
      console.error("Download error:", err);
      toast.error(t("stockLibDownloadFailed"));
    } finally {
      setDownloading(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchStock(1);
  };

  const handleQuickSearch = (term: string) => {
    setQuery(term);
    setHasSearched(true);
    setLoading(true);
    // trigger search
    supabase.functions.invoke("freepik-stock", {
      body: {
        action: activeType === "photos" ? "search-resources" : "search-videos",
        query: term,
        page: 1,
        limit: 24,
      },
    }).then(({ data }) => {
      if (activeType === "photos") {
        setResources(data?.data || []);
      } else {
        setVideos(data?.data || []);
      }
      const meta = data?.meta;
      if (meta) setTotalPages(Math.ceil((meta.pagination?.total || 0) / (meta.pagination?.limit || 24)));
      setPage(1);
    }).catch(() => toast.error(t("stockLibSearchFailed"))).finally(() => setLoading(false));
  };

  const items = activeType === "photos" ? resources : videos;

  return (
    <div className="space-y-8 pb-16 max-w-7xl mx-auto">

      {/* ── Hero Section with Search ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/8 via-accent/5 to-transparent border border-border/20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_hsl(var(--primary)/0.06),_transparent_60%)]" />
        <div className="relative px-6 py-10 md:px-10 md:py-14 text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            {t("stockLibHeroTitle")}
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2 max-w-lg mx-auto">
            {t("stockLibHeroDesc")}
          </p>

          {/* Search bar */}
          <form onSubmit={handleSubmit} className="mt-6 max-w-2xl mx-auto">
            <div className="flex items-center bg-background/70 backdrop-blur-md border border-border/40 rounded-xl overflow-hidden shadow-lg shadow-black/5">
              {/* Type selector */}
              <div className="hidden sm:flex items-center border-r border-border/30 px-3">
                <button
                  type="button"
                  onClick={() => { setActiveType("photos"); setResources([]); setVideos([]); setHasSearched(false); }}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                    activeType === "photos"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Image className="w-3.5 h-3.5 inline mr-1.5" />
                  Photos
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveType("videos"); setResources([]); setVideos([]); setHasSearched(false); }}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                    activeType === "videos"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Film className="w-3.5 h-3.5 inline mr-1.5" />
                  Videos
                </button>
              </div>

              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("stockSearchPlaceholder")}
                  className="pl-10 h-12 border-0 bg-transparent focus-visible:ring-0 text-sm"
                />
              </div>

              <Button type="submit" disabled={loading || !query.trim()} className="mr-1.5 h-9 px-5 rounded-lg text-xs font-medium">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("stockLibSearch")}
              </Button>
            </div>
          </form>

          {/* Mobile type toggle */}
          <div className="flex sm:hidden items-center justify-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => { setActiveType("photos"); setResources([]); setVideos([]); setHasSearched(false); }}
              className={cn(
                "px-4 py-1.5 text-xs font-medium rounded-full border transition-colors",
                activeType === "photos"
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border/30 text-muted-foreground"
              )}
            >
              Photos
            </button>
            <button
              type="button"
              onClick={() => { setActiveType("videos"); setResources([]); setVideos([]); setHasSearched(false); }}
              className={cn(
                "px-4 py-1.5 text-xs font-medium rounded-full border transition-colors",
                activeType === "videos"
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border/30 text-muted-foreground"
              )}
            >
              Videos
            </button>
          </div>
        </div>
      </div>

      {/* ── Search Results ── */}
      {hasSearched && (
        <div className="space-y-4">
          {/* Filters bar */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              {loading ? t("stockLibSearching") : `${t("stockLibSearchResultsFor")} "${query}"`}
            </h2>
            <div className="flex items-center gap-2">
              {activeType === "photos" && (
                <Select value={orientation} onValueChange={(v) => { setOrientation(v); }}>
                  <SelectTrigger className="w-[120px] h-8 text-xs">
                    <SelectValue placeholder={t("stockLibOrientation")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("stockLibAll")}</SelectItem>
                    <SelectItem value="landscape">{t("stockLibLandscape")}</SelectItem>
                    <SelectItem value="portrait">{t("stockLibPortrait")}</SelectItem>
                    <SelectItem value="square">{t("stockLibSquare")}</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Select value={order} onValueChange={setOrder}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue placeholder={t("stockLibSortBy")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance">{t("stockLibRelevant")}</SelectItem>
                  <SelectItem value="recent">{t("stockLibRecent")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
              <span className="text-sm text-muted-foreground">{t("stockLibSearching")}</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Search className="w-10 h-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">{t("stockLibNoResults")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <StockCard
                    key={item.id}
                    item={item}
                    type={activeType === "photos" ? "photo" : "video"}
                    onDownload={handleDownload}
                    downloading={downloading}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && items.length > 0 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => searchStock(page - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => searchStock(page + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Browse Categories (shown when not searching) ── */}
      {!hasSearched && (
        <>
          {/* Category Grid */}
          <div>
            <h2 className="text-base font-semibold text-foreground mb-4">{t("stockLibBrowseCategory")}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {CATEGORIES.map((cat) => {
                return (
                  <button
                    key={cat.key}
                    onClick={() => {
                      if (cat.key === "videos") {
                        setActiveType("videos");
                        handleQuickSearch("popular");
                      } else {
                        setActiveType("photos");
                        handleQuickSearch(cat.label.toLowerCase());
                      }
                    }}
                    className="group rounded-xl border border-border/20 overflow-hidden bg-card/30 backdrop-blur-sm text-left hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
                  >
                    <div className="aspect-[3/2] bg-muted/10 overflow-hidden">
                      {categoryPreviews[cat.key] ? (
                        <img src={categoryPreviews[cat.key]} alt={cat.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-muted/20 to-muted/5 animate-pulse" />
                      )}
                    </div>
                    <div className="p-3">
                      <span className="text-sm font-medium text-foreground">{cat.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Popular Searches */}
          <div>
            <h2 className="text-base font-semibold text-foreground mb-3">{t("stockLibPopularSearches")}</h2>
            <div className="flex flex-wrap gap-2">
              {POPULAR_SEARCHES.map((term) => (
                <button
                  key={term}
                  onClick={() => handleQuickSearch(term)}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-full border border-border/30 bg-card/30 backdrop-blur-sm text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          {/* Trending Collections */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                {t("stockLibCuratedCollections")}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {TRENDING_COLLECTIONS.map((col) => (
                <button
                  key={col.label}
                  onClick={() => handleQuickSearch(col.query)}
                  className="group rounded-xl border border-border/20 bg-card/30 backdrop-blur-sm overflow-hidden text-left hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 flex items-center gap-0"
                >
                  <div className="w-20 h-20 flex-shrink-0 overflow-hidden">
                    {collectionPreviews[col.label] ? (
                      <img src={collectionPreviews[col.label]} alt={col.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-muted/20 to-muted/5 animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 px-4">
                    <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t("stockLibExploreCollection")}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0 mr-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Trending Photos Grid */}
          {trendingPhotos.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  {t("stockLibTrendingNow")}
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
                {trendingPhotos.map((item) => (
                  <StockCard
                    key={item.id}
                    item={item}
                    type="photo"
                    onDownload={handleDownload}
                    downloading={downloading}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StockLibrary;
