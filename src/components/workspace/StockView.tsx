import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Box,
  Camera,
  Download,
  FileImage,
  Grid2X2,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Maximize2,
  Menu,
  Mic,
  Music2,
  Palette,
  Search,
  Shapes,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface StockResource {
  id: number | string;
  title?: string;
  url?: string;
  filename?: string;
  licenses?: Array<{ type?: string; url?: string }>;
  products?: Array<{ type?: string; url?: string }>;
  image?: {
    type?: string;
    orientation?: string;
    source?: {
      url?: string;
      size?: string;
      key?: string;
    };
  };
  author?: {
    name?: string;
    slug?: string;
    avatar?: string;
  };
  stats?: {
    downloads?: number;
    likes?: number;
  };
  meta?: {
    published_at?: string;
    is_new?: boolean;
    available_formats?: Record<string, unknown>;
  };
}

interface StockSearchResponse {
  data?: StockResource[];
  meta?: {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
  };
  error?: string;
  details?: unknown;
}

interface StockDownloadResponse {
  data?: {
    filename?: string;
    url?: string;
    signed_url?: string;
  };
  error?: string;
}

type StockCategory = {
  id: string;
  label: string;
  query: string;
  Icon: typeof Shapes;
  swatch: string;
  preview: string;
};

const CATEGORIES: StockCategory[] = [
  {
    id: "vectors",
    label: "Vectors",
    query: "modern vector illustration pack",
    Icon: Shapes,
    swatch: "from-[#ff9f8f] via-[#f75f8f] to-[#461a6b]",
    preview: "https://img.freepik.com/free-vector/hand-drawn-flat-design-people-pattern_23-2149251292.jpg",
  },
  {
    id: "photos",
    label: "Photos",
    query: "premium editorial lifestyle photo",
    Icon: Camera,
    swatch: "from-[#c8fff1] via-[#8ad2ff] to-[#365d8d]",
    preview: "https://img.freepik.com/free-photo/beautiful-shot-sea-beach-sunrise_181624-3715.jpg",
  },
  {
    id: "illustrations",
    label: "Illustrations",
    query: "surreal digital illustration portrait",
    Icon: Palette,
    swatch: "from-[#d5ff82] via-[#ff85b8] to-[#6d46ff]",
    preview: "https://img.freepik.com/free-vector/gradient-abstract-colorful-background_23-2149131349.jpg",
  },
  {
    id: "templates",
    label: "Templates",
    query: "brand presentation template",
    Icon: Layers3,
    swatch: "from-[#7b7dff] via-[#ff5ca8] to-[#ffc837]",
    preview: "https://img.freepik.com/free-vector/gradient-business-template-design_23-2149575947.jpg",
  },
  {
    id: "psds",
    label: "PSDs",
    query: "poster psd template",
    Icon: FileImage,
    swatch: "from-[#16171d] via-[#42435a] to-[#f7d2ff]",
    preview: "https://img.freepik.com/free-psd/vertical-poster-template-fashion-sale_23-2149488890.jpg",
  },
  {
    id: "mockups",
    label: "Mockups",
    query: "product packaging mockup",
    Icon: Box,
    swatch: "from-[#f8f8f8] via-[#a4a9b5] to-[#18181b]",
    preview: "https://img.freepik.com/free-psd/isolated-business-card-mockup_125540-1382.jpg",
  },
  {
    id: "videos",
    label: "Videos",
    query: "cinematic video thumbnail motion background",
    Icon: Video,
    swatch: "from-[#ffd1f2] via-[#9ed8ff] to-[#354c86]",
    preview: "https://img.freepik.com/free-photo/beautiful-mountains-landscape_23-2150787887.jpg",
  },
  {
    id: "icons",
    label: "Icons",
    query: "colorful icon set",
    Icon: Grid2X2,
    swatch: "from-[#b8fff5] via-[#a78bfa] to-[#22c55e]",
    preview: "https://img.freepik.com/free-vector/social-media-icons-set_98292-4250.jpg",
  },
  {
    id: "sound",
    label: "Sound Effects",
    query: "audio waveform abstract",
    Icon: Mic,
    swatch: "from-[#40115f] via-[#b51ea1] to-[#ff75d8]",
    preview: "https://img.freepik.com/free-vector/colorful-sound-wave-equalizer-background_23-2148420765.jpg",
  },
  {
    id: "music",
    label: "Music",
    query: "music album visualizer cover",
    Icon: Music2,
    swatch: "from-[#070707] via-[#b222ff] to-[#ff8d1a]",
    preview: "https://img.freepik.com/free-vector/gradient-music-equalizer-background_23-2149039322.jpg",
  },
  {
    id: "3d",
    label: "3D Models",
    query: "3d abstract object white studio",
    Icon: Box,
    swatch: "from-[#ffffff] via-[#e4e4e7] to-[#9ca3af]",
    preview: "https://img.freepik.com/free-psd/3d-rendering-abstract-shape_23-2150901966.jpg",
  },
  {
    id: "fonts",
    label: "Fonts",
    query: "typography font poster lettering",
    Icon: Sparkles,
    swatch: "from-[#d9fbff] via-[#ffffff] to-[#7dd3fc]",
    preview: "https://img.freepik.com/free-vector/hand-drawn-lettering-quotes-collection_23-2149064656.jpg",
  },
];

const QUICK_TERMS = [
  "thai college campaign",
  "luxury product mockup",
  "futuristic social media post",
  "education presentation template",
  "minimal brand identity",
];

function formatCount(value?: number): string {
  if (!value) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function availableFormats(item: StockResource): string[] {
  return Object.keys(item.meta?.available_formats ?? {}).slice(0, 4);
}

function pickAccessLabel(item: StockResource): string {
  const values = [...(item.products ?? []), ...(item.licenses ?? [])]
    .map((entry) => String(entry.type ?? "").toLowerCase())
    .join(" ");
  return values.includes("premium") ? "Premium" : "Included";
}

function isValidImageUrl(url: string | undefined): url is string {
  return Boolean(url && /^https?:\/\//i.test(url));
}

function userStockError(err: unknown, fallback: string): string {
  console.error("Stock library request failed:", err);
  return fallback;
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function StockView({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("creator stock content");
  const [submittedQuery, setSubmittedQuery] = useState("creator stock content");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<StockResource[]>([]);
  const [meta, setMeta] = useState<StockSearchResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<StockResource | null>(null);

  const heroImages = useMemo(() => {
    const apiImages = items
      .map((item) => item.image?.source?.url)
      .filter(isValidImageUrl)
      .slice(0, 8);
    return apiImages.length >= 4
      ? apiImages
      : CATEGORIES.map((category) => category.preview).slice(0, 8);
  }, [items]);

  const totalLabel = useMemo(() => {
    const total = Number(meta?.total ?? 0);
    return total
      ? t("workspace.stock.assets_count", { count: total.toLocaleString() })
      : t("workspace.stock.total_fallback");
  }, [meta?.total, t]);

  const runSearch = async (nextPage = 1) => {
    const term = submittedQuery.trim() || query.trim() || "creator stock content";
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } =
        await supabase.functions.invoke<StockSearchResponse>("freepik-stock", {
          body: {
            action: "search-resources",
            query: term,
            page: nextPage,
            limit: 36,
            order: "relevance",
          },
        });
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(data.error);
      setItems(Array.isArray(data?.data) ? data.data : []);
      setMeta(data?.meta ?? null);
      setPage(nextPage);
    } catch (err) {
      const message = userStockError(err, t("workspace.stock.search_failed"));
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedQuery]);

  const submit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const term = query.trim() || "creator stock content";
    setActiveCategory("all");
    setSubmittedQuery(term);
  };

  const searchCategory = (category: StockCategory) => {
    setActiveCategory(category.id);
    setQuery(category.query);
    setSubmittedQuery(category.query);
  };

  const downloadResource = async (item: StockResource) => {
    const resourceId = String(item.id);
    setDownloadingId(resourceId);
    try {
      const { data, error: invokeError } =
        await supabase.functions.invoke<StockDownloadResponse>("freepik-stock", {
          body: {
            action: "download-resource",
            resourceId,
            title: item.title ?? item.filename ?? `mediaforge-stock-${resourceId}`,
            imageSize: item.image?.type === "photo" ? "large" : undefined,
          },
        });
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(data.error);
      const url = data?.data?.signed_url ?? data?.data?.url;
      if (!url) throw new Error(t("workspace.stock.no_url"));
      triggerDownload(url, data?.data?.filename ?? item.filename ?? `mediaforge-stock-${resourceId}`);
      toast.success(t("workspace.stock.download_started"));
    } catch (err) {
      const message = userStockError(err, t("workspace.stock.download_failed"));
      toast.error(message);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="ws-scroll-hide flex h-full min-h-0 flex-col overflow-y-auto bg-[hsl(0_0%_8%)] text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-white/[0.05] bg-[hsl(0_0%_8%)]/95 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1460px] items-center gap-3">
          {onOpenSidebar && (
            <button
              type="button"
              onClick={onOpenSidebar}
              className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.06] text-zinc-100 ring-1 ring-inset ring-white/10 md:hidden"
              aria-label={t("workspace.stock.open_sidebar")}
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <form onSubmit={submit} className="mx-auto flex h-12 w-full max-w-[760px] items-center rounded-full bg-white/[0.10] px-4 text-zinc-100 ring-1 ring-inset ring-white/[0.06]">
            <Grid2X2 className="mr-3 h-4 w-4 shrink-0 text-zinc-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("workspace.stock.search_placeholder")}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-zinc-400"
            />
            <button
              type="button"
              className="mr-1 grid h-9 w-9 place-items-center rounded-full text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
              aria-label={t("workspace.stock.voice_search")}
              title={t("workspace.stock.voice_search")}
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="mr-1 grid h-9 w-9 place-items-center rounded-full text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
              aria-label={t("workspace.stock.image_search")}
              title={t("workspace.stock.image_search")}
            >
              <Camera className="h-4 w-4" />
            </button>
            <button
              type="submit"
              disabled={loading}
              className="grid h-9 w-9 place-items-center rounded-full bg-white text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={t("workspace.stock.search_button")}
              title={t("workspace.stock.search_button")}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1460px] flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[28px] bg-black">
          <HeroMosaic images={heroImages.slice(0, 4)} side="left" />
          <HeroMosaic images={heroImages.slice(4, 8)} side="right" />
          <div className="relative z-10 mx-auto flex min-h-[230px] max-w-[760px] flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-5 flex items-center gap-2 text-[13px] font-semibold text-zinc-300">
              <span>{t("workspace.sidebar.home")}</span>
              <span className="text-zinc-600">/</span>
              <span className="text-white">{t("workspace.stock.eyebrow")}</span>
            </div>
            <h1 className="text-balance text-[34px] font-semibold leading-tight tracking-tight text-white md:text-[44px]">
              {t("workspace.stock.hero_title")}
            </h1>
            <p className="mt-4 max-w-[620px] text-pretty text-[17px] leading-7 text-zinc-200">
              {t("workspace.stock.hero_subtitle")}
            </p>
          </div>
        </section>

        <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => searchCategory(category)}
              className={cn(
                "group flex min-h-[108px] items-center gap-5 rounded-2xl bg-white/[0.035] p-3 text-left ring-1 ring-inset ring-white/[0.04] transition",
                "hover:-translate-y-0.5 hover:bg-white/[0.055] hover:ring-white/[0.10]",
                activeCategory === category.id && "bg-white/[0.08] ring-sky-300/35",
              )}
            >
              <div className="relative h-[86px] w-[86px] shrink-0 overflow-hidden rounded-xl bg-zinc-900">
                <img
                  src={category.preview}
                  alt=""
                  className="h-full w-full object-cover opacity-90 transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className={cn("absolute inset-0 bg-gradient-to-br opacity-25", category.swatch)} />
                <div className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-lg bg-black/55 text-white backdrop-blur">
                  <category.Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[16px] font-semibold text-white">{category.label}</div>
                <div className="mt-1 line-clamp-1 text-[13px] text-zinc-500">
                  {category.query}
                </div>
              </div>
            </button>
          ))}
        </section>

        <section className="mt-16">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-[28px] font-semibold tracking-tight text-white">
                {t("workspace.stock.results_title")}
              </h2>
              <p className="mt-2 text-[16px] text-zinc-400">{totalLabel}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_TERMS.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => {
                    setActiveCategory("all");
                    setQuery(term);
                    setSubmittedQuery(term);
                  }}
                  className="rounded-full bg-white/[0.06] px-4 py-2 text-[13px] font-semibold text-zinc-200 ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.10] hover:text-white"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-[14px] text-rose-100">
              {error}
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="mt-6 grid min-h-[360px] place-items-center rounded-3xl bg-white/[0.035] ring-1 ring-inset ring-white/[0.06]">
              <div className="flex items-center gap-3 text-[15px] text-zinc-300">
                <Loader2 className="h-5 w-5 animate-spin text-sky-300" />
                {t("workspace.stock.searching")}
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="mt-6 grid min-h-[360px] place-items-center rounded-3xl border border-dashed border-white/15 bg-white/[0.03] text-center">
              <div>
                <ImageIcon className="mx-auto h-9 w-9 text-zinc-500" />
                <h2 className="mt-4 text-[21px] font-semibold text-white">{t("workspace.stock.empty_title")}</h2>
                <p className="mt-1 text-[15px] text-zinc-400">{t("workspace.stock.empty_hint")}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                {items.map((item) => (
                  <StockAssetCard
                    key={String(item.id)}
                    item={item}
                    downloading={downloadingId === String(item.id)}
                    onPreview={() => setPreviewItem(item)}
                    onDownload={() => void downloadResource(item)}
                  />
                ))}
              </div>

              <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/8 pt-5 sm:flex-row">
                <p className="text-[13px] text-zinc-500">
                  {t("workspace.stock.page_of", {
                    current: meta?.current_page ?? page,
                    total: meta?.last_page ?? "?",
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={loading || page <= 1}
                    onClick={() => void runSearch(page - 1)}
                    className="rounded-full bg-white/[0.06] px-5 py-2.5 text-[14px] font-semibold text-zinc-200 ring-1 ring-inset ring-white/[0.08] transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("workspace.stock.previous")}
                  </button>
                  <button
                    type="button"
                    disabled={loading || (meta?.last_page ? page >= meta.last_page : false)}
                    onClick={() => void runSearch(page + 1)}
                    className="rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("workspace.stock.next")}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>

      {previewItem && (
        <StockPreviewModal
          item={previewItem}
          downloading={downloadingId === String(previewItem.id)}
          onClose={() => setPreviewItem(null)}
          onDownload={() => void downloadResource(previewItem)}
        />
      )}
    </div>
  );
}

function HeroMosaic({ images, side }: { images: string[]; side: "left" | "right" }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-0 hidden h-full w-[31%] grid-cols-2 gap-3 opacity-85 blur-[0.1px] md:grid",
        side === "left" ? "left-0 -translate-x-[7%]" : "right-0 translate-x-[7%]",
      )}
    >
      {images.map((src, index) => (
        <div
          key={`${side}-${src}-${index}`}
          className={cn(
            "overflow-hidden rounded-xl bg-white/[0.06]",
            index % 2 === 0 ? "translate-y-0" : "-translate-y-7",
          )}
        >
          <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
        </div>
      ))}
      <div
        className={cn(
          "absolute inset-y-0 w-1/2",
          side === "left"
            ? "right-0 bg-gradient-to-r from-transparent to-black"
            : "left-0 bg-gradient-to-l from-transparent to-black",
        )}
      />
    </div>
  );
}

function StockAssetCard({
  item,
  downloading,
  onPreview,
  onDownload,
}: {
  item: StockResource;
  downloading: boolean;
  onPreview: () => void;
  onDownload: () => void;
}) {
  const { t } = useLanguage();
  const imageUrl = item.image?.source?.url;
  return (
    <article
      onClick={onPreview}
      className="group cursor-zoom-in overflow-hidden rounded-[24px] bg-white/[0.04] ring-1 ring-inset ring-white/[0.05] transition hover:-translate-y-0.5 hover:bg-white/[0.06] hover:ring-white/[0.13]"
    >
      <div className="relative aspect-[16/11] overflow-hidden bg-zinc-950 md:aspect-[4/3]">
        {isValidImageUrl(imageUrl) ? (
          <img
            src={imageUrl}
            alt={item.title ?? item.filename ?? t("workspace.stock.asset_alt")}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.035]"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <ImageIcon className="h-8 w-8 text-zinc-600" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-black/65 px-2.5 py-1 text-[12px] font-semibold capitalize text-white backdrop-blur">
            {item.image?.type ?? "asset"}
          </span>
          <span className="rounded-full bg-sky-500/90 px-2.5 py-1 text-[12px] font-semibold text-white shadow-lg shadow-sky-950/20">
            {pickAccessLabel(item)}
          </span>
        </div>
        <div className="absolute right-3 top-3 flex gap-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onPreview();
            }}
            className="grid h-10 w-10 place-items-center rounded-full bg-black/65 text-white backdrop-blur transition hover:bg-white hover:text-zinc-950"
            title={t("workspace.stock.preview")}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDownload();
            }}
            disabled={downloading}
            className="grid h-10 w-10 place-items-center rounded-full bg-sky-500 text-white shadow-lg shadow-sky-950/30 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            title={t("workspace.stock.download")}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 pt-14">
          <h3 className="line-clamp-2 text-[16px] font-semibold leading-6 text-white">
            {item.title ?? item.filename ?? t("workspace.stock.asset_id_fallback", { id: String(item.id) })}
          </h3>
          <p className="mt-1 truncate text-[13px] text-zinc-300">
            {item.image?.orientation ?? t("workspace.stock.asset_fallback_meta")}
            {item.stats?.downloads ? ` · ${t("workspace.stock.downloads_count", { count: formatCount(item.stats.downloads) })}` : ""}
          </p>
        </div>
      </div>
    </article>
  );
}

function StockPreviewModal({
  item,
  downloading,
  onClose,
  onDownload,
}: {
  item: StockResource;
  downloading: boolean;
  onClose: () => void;
  onDownload: () => void;
}) {
  const { t } = useLanguage();
  const imageUrl = item.image?.source?.url;
  const formats = availableFormats(item);

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/85 p-3 backdrop-blur-md sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-[28px] bg-zinc-950 ring-1 ring-white/10 lg:flex-row"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid min-h-[320px] flex-1 place-items-center bg-black lg:min-h-[720px]">
          {isValidImageUrl(imageUrl) ? (
            <img
              src={imageUrl}
              alt={item.title ?? item.filename ?? t("workspace.stock.asset_alt")}
              className="max-h-[72vh] w-full object-contain"
            />
          ) : (
            <ImageIcon className="h-14 w-14 text-zinc-700" />
          )}
        </div>
        <aside className="w-full shrink-0 border-t border-white/10 p-5 lg:w-[340px] lg:border-l lg:border-t-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-[0.18em] text-sky-300">
                {t("workspace.stock.eyebrow")}
              </div>
              <h2 className="mt-3 text-[22px] font-semibold leading-8 text-white">
                {item.title ?? item.filename ?? t("workspace.stock.asset_id_fallback", { id: String(item.id) })}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-zinc-200 transition hover:bg-white hover:text-zinc-950"
              aria-label={t("workspace.stock.close_preview")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[13px] font-semibold capitalize text-zinc-200">
              {item.image?.type ?? "asset"}
            </span>
            <span className="rounded-full bg-sky-500/90 px-3 py-1.5 text-[13px] font-semibold text-white">
              {pickAccessLabel(item)}
            </span>
            {item.image?.orientation && (
              <span className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[13px] font-semibold capitalize text-zinc-200">
                {item.image.orientation}
              </span>
            )}
          </div>

          {formats.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-[13px] font-semibold text-zinc-400">{t("workspace.stock.formats")}</div>
              <div className="flex flex-wrap gap-2">
                {formats.map((format) => (
                  <span key={format} className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[12px] text-zinc-300">
                    {format.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 text-[15px] font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t("workspace.stock.download")}
          </button>
        </aside>
      </div>
    </div>
  );
}
