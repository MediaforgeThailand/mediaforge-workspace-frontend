import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Send, ChevronRight, ChevronLeft, ImageIcon, Sparkles, Loader2 } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import ShineBorder from "@/components/ShineBorder";
import FlowDataCard, { FlowDataCardSkeleton } from "@/components/FlowDataCard";
import OptimizedVideo from "@/components/ui/OptimizedVideo";
import CommunityFlows, { type CommunityFlowsHandle, enrichFlows } from "@/components/home/CommunityFlows";
import { useMarketplaceFlows } from "@/hooks/useMarketplaceFlows";
import { useCategoryFlows } from "@/hooks/useCategoryFlows";
import { useFlowCategories } from "@/hooks/useFlowCategories";
import { useDebounce } from "@/hooks/useDebounce";
import { useLanguage } from "@/contexts/LanguageContext";

import { cn } from "@/lib/utils";



/* ─── Horizontal scroll row ─── */
const CategoryScrollRow = ({
  category,
  flows,
  isLoading,
}: {
  category: string;
  flows: any[];
  isLoading: boolean;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { t } = useLanguage();

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.7;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  if (!isLoading && flows.length === 0) return null;

  return (
    <section className="mt-10 first:mt-6">
      <div className="flex items-center justify-between mb-4 px-2 md:px-8">
        <h2 className="text-[24px] font-bold text-white">{category}</h2>
        <button
          onClick={() => navigate("/app/home")}
          className="flex items-center gap-1.5 text-[14px] font-medium text-white hover:text-white/80 transition-colors"
        >
          {t("homeViewMore")}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="relative px-2 md:px-8">
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto pb-2"
          style={{
            scrollbarWidth: "none",
            maskImage: "linear-gradient(to right, black 92%, rgba(0,0,0,0.1) 96.7%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to right, black 92%, rgba(0,0,0,0.1) 96.7%, transparent 100%)",
          }}
        >
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <FlowDataCardSkeleton key={i} />
              ))
            : flows.map((flow, i) => (
                <FlowDataCard key={flow.id} flow={flow} index={i} />
              ))}
        </div>
        <button
          onClick={() => scroll("right")}
          className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-black/80 transition-colors z-10"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
};

/* ─── Video slug → file mapping ─── */
const VIDEO_SLUGS = ["packshot", "magic-background", "before-after", "ai-model-tryon", "lifestyle-in-context", "social-media-ads", "preview-teaser", "illustration-graphic"] as const;

const VIDEO_MAP: Record<string, { mp4: string; webm: string; mobileMp4: string }> = {
  packshot: { mp4: "/videos/Thumbnail_Packshot_1.mp4", webm: "/videos/Thumbnail_Packshot_1.webm", mobileMp4: "/videos/mobile/Thumbnail_Packshot_1.mp4" },
  "magic-background": { mp4: "/videos/Thumbnail_magic_bg.mp4", webm: "/videos/Thumbnail_magic_bg.webm", mobileMp4: "/videos/mobile/Thumbnail_magic_bg.mp4" },
  "before-after": { mp4: "/videos/thumbnail_ba.mp4", webm: "/videos/thumbnail_ba.webm", mobileMp4: "/videos/mobile/thumbnail_ba.mp4" },
  "ai-model-tryon": { mp4: "/videos/thumbnail_try_on.mp4", webm: "/videos/thumbnail_try_on.webm", mobileMp4: "/videos/mobile/thumbnail_try_on.mp4" },
  "lifestyle-in-context": { mp4: "/videos/thumbnail_lifestyle_1.mp4", webm: "/videos/thumbnail_lifestyle_1.webm", mobileMp4: "/videos/mobile/thumbnail_lifestyle_1.mp4" },
  "social-media-ads": { mp4: "/videos/thumbnail_ads2.mp4", webm: "/videos/thumbnail_ads2.webm", mobileMp4: "/videos/mobile/thumbnail_ads2.mp4" },
  "preview-teaser": { mp4: "/videos/Thumbnail_preview_New.mp4", webm: "/videos/Thumbnail_preview_New.webm", mobileMp4: "/videos/mobile/Thumbnail_preview_New.mp4" },
  "illustration-graphic": { mp4: "/videos/thumbnail_vector.mp4", webm: "/videos/thumbnail_vector.webm", mobileMp4: "/videos/mobile/thumbnail_vector.mp4" },
  "3d-mockup": { mp4: "/videos/thumbnail_brand_mockup.mp4", webm: "/videos/thumbnail_brand_mockup.webm", mobileMp4: "/videos/mobile/thumbnail_brand_mockup.mp4" },
};

const PLACEHOLDER_BG = "bg-primary/15";

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
};

/* ─── Synced Video Cards ─── */
const SyncedVideoCards = ({
  categories,
  onCardClick,
}: {
  categories: Array<{ name: string; slug: string; description?: string }>;
  onCardClick: (slug: string) => void;
}) => {
  const isMobile = useIsMobile();
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [allReady, setAllReady] = useState(false);
  const readySet = useRef(new Set<string>());

  const videoSlugs = categories
    .filter((c) => VIDEO_MAP[c.slug])
    .map((c) => c.slug);
  const totalVideos = videoSlugs.length;

  const playAll = useCallback(() => {
    if (allReady) return;
    setAllReady(true);
    videoRefs.current.forEach((vid) => {
      vid.currentTime = 0;
      vid.play().catch(() => {});
    });
  }, [allReady]);

  useEffect(() => {
    if (isMobile || allReady || totalVideos === 0) return;
    const timer = setTimeout(playAll, 4000);
    return () => clearTimeout(timer);
  }, [isMobile, allReady, totalVideos, playAll]);

  const handleCanPlay = useCallback(
    (slug: string) => {
      readySet.current.add(slug);
      if (readySet.current.size >= totalVideos) {
        playAll();
      }
    },
    [totalVideos, playAll],
  );

  const registerRef = useCallback((slug: string, el: HTMLVideoElement | null) => {
    if (el) {
      videoRefs.current.set(slug, el);
    } else {
      videoRefs.current.delete(slug);
    }
  }, []);

  return (
    <>
      {categories.map((cat, idx) => {
        const hasVideo = VIDEO_MAP[cat.slug];
        return (
          <div
            key={cat.slug || cat.name}
            onClick={() => onCardClick(cat.slug)}
            className="group relative shrink-0 aspect-[5/7] rounded-[16px] overflow-hidden cursor-pointer"
            style={{ width: "var(--card-w)" }}
          >
            {isMobile ? (
              <>
                <div className={cn("absolute inset-0", PLACEHOLDER_BG)} />
                {hasVideo && (
                  <OptimizedVideo
                    src={VIDEO_MAP[cat.slug].mobileMp4}
                    className="absolute inset-0 w-full h-full"
                  />
                )}
              </>
            ) : (
              <>
                <div
                  className={cn(
                    "absolute inset-0 transition-opacity duration-700",
                    PLACEHOLDER_BG,
                    allReady && hasVideo ? "opacity-0" : "opacity-100",
                  )}
                />
                {hasVideo && (
                  <OptimizedVideo
                    src={VIDEO_MAP[cat.slug].webm}
                    fallbackSrc={VIDEO_MAP[cat.slug].mp4}
                    className={cn(
                      "absolute inset-0 w-full h-full transition-all duration-700 group-hover:scale-[1.08]",
                      allReady ? "opacity-100" : "opacity-0",
                    )}
                  />
                )}
              </>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="absolute left-4 right-4 bottom-4">
              <span className="text-[13px] md:text-[16px] font-semibold text-white block transform transition-transform duration-300 ease-out group-hover:-translate-y-9 relative z-10">
                {cat.name}
              </span>
              {cat.description && (
                <p className="absolute left-0 right-0 bottom-0 text-[11px] text-white/60 line-clamp-2 opacity-0 transform translate-y-2 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 z-0">
                  {cat.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};

/* ─── Main Home Page ─── */
const Home = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data, isLoading: featuredLoading } = useMarketplaceFlows();
  const { rows, isLoading: categoryLoading } = useCategoryFlows();
  const { data: categoriesData } = useFlowCategories();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const communityRef = useRef<CommunityFlowsHandle>(null);
  const { t } = useLanguage();

  const handleFormatCardClick = useCallback((slug: string) => {
    communityRef.current?.setUseCaseFilter(slug);
    setTimeout(() => communityRef.current?.scrollIntoView(), 100);
  }, []);

  const SEARCH_PAGE_SIZE = 20;
  const {
    data: searchData,
    isLoading: searchLoading,
    fetchNextPage: fetchNextSearchPage,
    hasNextPage: hasNextSearchPage,
    isFetchingNextPage: isFetchingNextSearchPage,
  } = useInfiniteQuery({
    queryKey: ["home-instant-search", debouncedSearch],
    queryFn: async ({ pageParam = 0 }) => {
      const term = debouncedSearch.trim();
      const { hybridSearchFlows } = await import("@/lib/hybridSearch");
      const results = await hybridSearchFlows(term, {
        matchCount: SEARCH_PAGE_SIZE,
        matchThreshold: 0.15,
        matchOffset: pageParam * SEARCH_PAGE_SIZE,
      });
      return enrichFlows(results);
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < SEARCH_PAGE_SIZE ? undefined : allPages.length,
    initialPageParam: 0,
    enabled: searchActive && debouncedSearch.trim().length > 0,
    staleTime: 20_000,
  });
  const searchResults = useMemo(() => searchData?.pages.flat() ?? [], [searchData?.pages]);
  const [searchColCount, setSearchColCount] = useState(() => {
    if (typeof window === "undefined") return 2;
    const w = window.innerWidth;
    return w >= 1024 ? 5 : w >= 768 ? 4 : w >= 640 ? 3 : 2;
  });
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setSearchColCount(w >= 1024 ? 5 : w >= 768 ? 4 : w >= 640 ? 3 : 2);
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const searchColumns = useMemo(() => {
    const cols: typeof searchResults[] = Array.from({ length: searchColCount }, () => []);
    searchResults.forEach((flow, i) => cols[i % searchColCount].push(flow));
    return cols;
  }, [searchResults, searchColCount]);
  const searchSentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = searchSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextSearchPage && !isFetchingNextSearchPage) {
          fetchNextSearchPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextSearchPage, isFetchingNextSearchPage, fetchNextSearchPage]);

  const triggerSearch = () => {
    if (searchQuery.trim()) {
      setSearchActive(true);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchActive(false);
  };

  const featuredScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateFeaturedScroll = () => {
    const el = featuredScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  const featuredSection = data?.sections?.find((s) => s.section_type !== "hero");
  const featuredFlows = featuredSection?.flows ?? [];

  /* ── Search bar component (shared between hero & sticky top) ── */
  const searchBar = (
    <ShineBorder speed="12s" thickness="1.5px" inset="0rem" borderRadius="1.5rem">
      <div
        className="relative flex w-full items-center rounded-3xl p-3.5 glass-border"
        style={{
          background: "rgba(18, 18, 26, 0.8)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!e.target.value.trim()) {
              setSearchActive(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              triggerSearch();
            }
          }}
          placeholder={t("homeProductPlaceholder")}
          className="flex-1 px-2.5 py-1.5 text-base text-white placeholder:text-muted-foreground bg-transparent outline-none border-none text-center"
        />
        <div className="flex items-center gap-4">
          {searchActive && (
            <button
              onClick={clearSearch}
              className="text-muted-foreground hover:text-white transition-colors text-sm"
            >
              Clear
            </button>
          )}
          <div className="h-6 w-px bg-white/10" />
          <button
            onClick={triggerSearch}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <Send className="w-[19px] h-[16px]" />
          </button>
        </div>
      </div>
    </ShineBorder>
  );

  return (
    <div className="relative min-h-screen -mx-4 md:-mx-8 lg:-mx-12 xl:-mx-16 -mt-8">
      {/* ── Hero / Sticky Search ── */}
      <motion.section
        initial={false}
        animate={{
          height: searchActive ? 80 : 600,
          opacity: 1,
        }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex items-center justify-center overflow-hidden"
      >
        {/* Hero background — fades out when search active */}
        <motion.div
          initial={false}
          animate={{ opacity: searchActive ? 0 : 1 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0 pointer-events-none"
        >
          <OptimizedVideo
            src={isMobile ? "/videos/mobile/hero_home.mp4" : "/videos/hero_home.webm"}
            fallbackSrc="/videos/hero_home.mp4"
            poster="/videos/hero_home_poster.jpg"
            className="absolute inset-0 w-full h-full"
          />
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to right, #020403 0%, rgba(2,4,3,0.7) 4%, rgba(2,4,3,0.3) 8%, rgba(2,4,3,0.1) 12%, transparent 18%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to bottom, transparent 60%, rgba(2,4,3,0.15) 72%, rgba(2,4,3,0.4) 82%, rgba(2,4,3,0.7) 90%, #020403 100%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at 50% 30%, hsl(var(--primary) / 0.12), transparent 60%)",
            }}
          />
        </motion.div>

        {/* Hero title — fades out */}
        <div className="relative flex flex-col items-center gap-8 w-full mx-auto px-4" style={{ maxWidth: searchActive ? "100%" : "896px" }}>
          <motion.h1
            initial={false}
            animate={{
              opacity: searchActive ? 0 : 1,
              height: searchActive ? 0 : "auto",
              marginBottom: searchActive ? 0 : undefined,
            }}
            transition={{ duration: 0.3 }}
            className="text-center text-[56px] md:text-[72px] font-extrabold uppercase leading-none tracking-[0.08em] text-white overflow-hidden"
            style={{ textShadow: "0px 0px 40px hsl(var(--accent) / 0.3)" }}
          >
            FORGE YOUR{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              MEDIA
            </span>
          </motion.h1>

          <motion.div
            layout
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="w-full relative"
            style={{ maxWidth: searchActive ? "768px" : "768px" }}
          >
            {searchBar}
          </motion.div>
        </div>
      </motion.section>

      {/* ── Content Body ── */}
      {searchActive ? (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="px-2 md:px-8 mt-8 pb-24"
        >
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-[20px] md:text-[24px] font-bold text-white">
              AI Results for "<span className="text-primary">{searchQuery}</span>"
            </h2>
          </div>

          {searchLoading || debouncedSearch !== searchQuery ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <FlowDataCardSkeleton key={i} span="normal" gridMode />
              ))}
            </div>
          ) : searchResults.length > 0 ? (
            <>
              <div className="flex gap-1.5">
                {searchColumns.map((col, colIdx) => (
                  <div key={colIdx} className="flex-1 flex flex-col gap-1.5">
                    {col.map((flow, rowIdx) => (
                      <FlowDataCard key={flow.id} flow={flow} index={colIdx + rowIdx * searchColCount} gridMode />
                    ))}
                    {isFetchingNextSearchPage && <FlowDataCardSkeleton span="normal" gridMode />}
                  </div>
                ))}
              </div>
              <div ref={searchSentinelRef} className="h-1" />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Sparkles className="w-10 h-10 mb-4 opacity-30" />
              <p className="text-lg font-medium">{t("homeNoSearchResults")}</p>
              <p className="text-sm mt-1">{t("homeNoSearchResultsHint")}</p>
            </div>
          )}
        </motion.section>
      ) : (
        <>
          {/* ── Formats and Features ── */}
          <section className="px-4 md:px-10 mt-4">
            <div className="mb-2">
              <h2 className="text-[18px] md:text-[24px] font-bold text-white">{t("homeContentTypes")}</h2>
            </div>

            <div className="relative">
              <div
                ref={featuredScrollRef}
                onScroll={updateFeaturedScroll}
                className="flex gap-1.5 overflow-x-auto pb-2 [--card-w:calc((100%-2*6px)/2.3)] sm:[--card-w:calc((100%-3*6px)/3.5)] md:[--card-w:calc((100%-4*6px)/5)] lg:[--card-w:calc((100%-6*6px)/7)]"
                style={{
                  scrollbarWidth: "none",
                  maskImage: canScrollRight
                    ? canScrollLeft
                      ? "linear-gradient(to right, transparent 0%, black 5%, black 88%, rgba(0,0,0,0.15) 95%, transparent 100%)"
                      : "linear-gradient(to right, black 88%, rgba(0,0,0,0.15) 95%, transparent 100%)"
                    : canScrollLeft
                      ? "linear-gradient(to right, transparent 0%, black 5%, black 100%)"
                      : undefined,
                  WebkitMaskImage: canScrollRight
                    ? canScrollLeft
                      ? "linear-gradient(to right, transparent 0%, black 5%, black 88%, rgba(0,0,0,0.15) 95%, transparent 100%)"
                      : "linear-gradient(to right, black 88%, rgba(0,0,0,0.15) 95%, transparent 100%)"
                    : canScrollLeft
                      ? "linear-gradient(to right, transparent 0%, black 5%, black 100%)"
                      : undefined,
                }}
              >
                {featuredLoading ? (
                  Array.from({ length: 7 }).map((_, i) => (
                    <FlowDataCardSkeleton key={i} />
                  ))
                ) : (
                  <SyncedVideoCards
                    categories={categoriesData?.useCases ?? [
                      { name: "Packshot", slug: "packshot", description: t("homeCatPackshot") },
                      { name: "Magic Background", slug: "magic-background", description: t("homeCatMagicBg") },
                      { name: "Before & After", slug: "before-after", description: t("homeCatBeforeAfter") },
                      { name: "Model Try-on", slug: "ai-model-tryon", description: t("homeCatModelTryon") },
                      { name: "Lifestyle in Context", slug: "lifestyle-in-context", description: t("homeCatLifestyle") },
                      { name: "Ad Creatives", slug: "social-media-ads", description: t("homeCatAdCreatives") },
                      { name: "Preview / Teaser", slug: "preview-teaser", description: t("homeCatPreview") },
                      { name: "3D Mockup", slug: "3d-mockup", description: t("homeCat3dMockup") },
                      { name: "Illustration / Graphic", slug: "illustration-graphic", description: t("homeCatIllustration") },
                    ]}
                    onCardClick={handleFormatCardClick}
                  />
                )}
              </div>
              {canScrollLeft && (
                <button
                  onClick={() => featuredScrollRef.current?.scrollBy({ left: -featuredScrollRef.current.clientWidth * 0.7, behavior: "smooth" })}
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-black/80 transition-colors z-10"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {canScrollRight && (
                <button
                  onClick={() => featuredScrollRef.current?.scrollBy({ left: featuredScrollRef.current.clientWidth * 0.7, behavior: "smooth" })}
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-black/80 transition-colors z-10"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </section>

          {/* ── Community Flows with Filters ── */}
          <CommunityFlows ref={communityRef} />

          <div className="pb-24" />

          {(featuredLoading || categoryLoading) && (
            <div className="pb-12 flex items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:200ms]" />
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:400ms]" />
                <span className="ml-1">{t("homeLoadingFlow")}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Home;
