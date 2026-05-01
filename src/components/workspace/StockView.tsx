import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Menu,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface FreepikResource {
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

interface FreepikSearchResponse {
  data?: FreepikResource[];
  meta?: {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
  };
  error?: string;
  details?: unknown;
}

interface FreepikDownloadResponse {
  data?: {
    filename?: string;
    url?: string;
    signed_url?: string;
  };
  error?: string;
}

const STOCK_TYPES = [
  { value: "all", label: "All" },
  { value: "photo", label: "Photos" },
  { value: "vector", label: "Vectors" },
  { value: "psd", label: "PSD" },
  { value: "ai", label: "AI" },
];

const ORIENTATIONS = [
  { value: "all", label: "Any orientation" },
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
  { value: "square", label: "Square" },
  { value: "panoramic", label: "Panoramic" },
];

const ORDERS = [
  { value: "relevance", label: "Relevant" },
  { value: "recent", label: "Recent" },
];

const QUICK_TERMS = [
  "education classroom",
  "social media marketing",
  "product mockup",
  "thai college student",
  "business presentation",
];

function formatCount(value?: number): string {
  if (!value) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function availableFormats(item: FreepikResource): string[] {
  return Object.keys(item.meta?.available_formats ?? {}).slice(0, 4);
}

function pickLicense(item: FreepikResource): string {
  return item.products?.[0]?.type ?? item.licenses?.[0]?.type ?? "freepik";
}

export default function StockView({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const [query, setQuery] = useState("education classroom");
  const [submittedQuery, setSubmittedQuery] = useState("education classroom");
  const [contentType, setContentType] = useState("all");
  const [orientation, setOrientation] = useState("all");
  const [order, setOrder] = useState("relevance");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FreepikResource[]>([]);
  const [meta, setMeta] = useState<FreepikSearchResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalLabel = useMemo(() => {
    const total = Number(meta?.total ?? 0);
    return total ? `${total.toLocaleString()} assets` : "Freepik stock assets";
  }, [meta?.total]);

  const runSearch = async (nextPage = 1) => {
    const term = submittedQuery.trim() || query.trim();
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<FreepikSearchResponse>(
        "freepik-stock",
        {
          body: {
            action: "search-resources",
            query: term,
            page: nextPage,
            limit: 30,
            order,
            contentType: contentType === "all" ? undefined : contentType,
            orientation: orientation === "all" ? undefined : orientation,
          },
        },
      );
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(data.error);
      setItems(Array.isArray(data?.data) ? data.data : []);
      setMeta(data?.meta ?? null);
      setPage(nextPage);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType, orientation, order, submittedQuery]);

  const submit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setSubmittedQuery(query.trim() || "education classroom");
  };

  const downloadResource = async (item: FreepikResource) => {
    const resourceId = String(item.id);
    setDownloadingId(resourceId);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<FreepikDownloadResponse>(
        "freepik-stock",
        {
          body: {
            action: "download-resource",
            resourceId,
            title: item.title ?? item.filename ?? `freepik-${resourceId}`,
            imageSize: item.image?.type === "photo" ? "large" : undefined,
          },
        },
      );
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(data.error);
      const url = data?.data?.signed_url ?? data?.data?.url;
      if (!url) throw new Error("Freepik did not return a download URL");
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success("Download link opened");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Download failed";
      toast.error(message);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[hsl(0_0%_5%)] text-zinc-100">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/8 px-4 py-4 sm:px-6 lg:px-8">
        {onOpenSidebar && (
          <button
            type="button"
            onClick={onOpenSidebar}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-zinc-100 ring-1 ring-inset ring-white/10 md:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Stock</p>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Freepik stock search</h1>
          <p className="mt-1 text-sm text-zinc-400">{totalLabel}</p>
        </div>
      </header>

      <section className="shrink-0 border-b border-white/8 px-4 py-4 sm:px-6 lg:px-8">
        <form onSubmit={submit} className="flex flex-col gap-3 xl:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Freepik photos, vectors, PSDs..."
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] pl-11 pr-4 text-sm text-white outline-none transition focus:border-sky-400/60 focus:bg-white/[0.07]"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </form>

        <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {QUICK_TERMS.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => {
                  setQuery(term);
                  setSubmittedQuery(term);
                }}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 transition hover:border-sky-400/50 hover:text-white"
              >
                {term}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <StockSelect label="Type" value={contentType} onChange={setContentType} options={STOCK_TYPES} />
            <StockSelect label="Orientation" value={orientation} onChange={setOrientation} options={ORIENTATIONS} />
            <StockSelect label="Sort" value={order} onChange={setOrder} options={ORDERS} />
          </div>
        </div>
      </section>

      <main className="ws-scroll-hide min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="grid min-h-[360px] place-items-center rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-3 text-sm text-zinc-300">
              <Loader2 className="h-5 w-5 animate-spin text-sky-300" />
              Searching Freepik...
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="grid min-h-[360px] place-items-center rounded-3xl border border-dashed border-white/15 bg-white/[0.03] text-center">
            <div>
              <ImageIcon className="mx-auto h-8 w-8 text-zinc-500" />
              <h2 className="mt-4 text-lg font-semibold text-white">No stock assets found</h2>
              <p className="mt-1 text-sm text-zinc-400">Try a broader keyword or remove filters.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.map((item) => (
                <article
                  key={String(item.id)}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition hover:border-sky-300/40 hover:bg-white/[0.06]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-zinc-950">
                    {item.image?.source?.url ? (
                      <img
                        src={item.image.source.url}
                        alt={item.title ?? item.filename ?? "Freepik stock asset"}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <ImageIcon className="h-8 w-8 text-zinc-600" />
                      </div>
                    )}
                    <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-black/65 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
                        {item.image?.type ?? "asset"}
                      </span>
                      <span className="rounded-full bg-sky-500/90 px-2 py-1 text-[11px] font-semibold text-white">
                        {pickLicense(item)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="min-h-[68px]">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-white">
                        {item.title ?? item.filename ?? `Freepik asset ${item.id}`}
                      </h3>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {item.author?.name ? `by ${item.author.name}` : "Freepik"}
                        {item.image?.orientation ? ` · ${item.image.orientation}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {availableFormats(item).map((format) => (
                        <span key={format} className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-zinc-300">
                          {format.toUpperCase()}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-zinc-500">
                        {formatCount(item.stats?.downloads)} downloads
                      </div>
                      <div className="flex items-center gap-1.5">
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.06] text-zinc-200 transition hover:bg-white/[0.12] hover:text-white"
                            title="Open on Freepik"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => void downloadResource(item)}
                          disabled={downloadingId === String(item.id)}
                          className="inline-flex h-9 items-center gap-2 rounded-xl bg-sky-500 px-3 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {downloadingId === String(item.id) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Download
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-white/8 pt-5 sm:flex-row">
              <p className="text-xs text-zinc-500">
                Page {meta?.current_page ?? page} of {meta?.last_page ?? "?"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={loading || page <= 1}
                  onClick={() => void runSearch(page - 1)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={loading || (meta?.last_page ? page >= meta.last_page : false)}
                  onClick={() => void runSearch(page + 1)}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StockSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex min-w-[150px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-500" />
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-8 w-full bg-transparent text-xs font-semibold text-zinc-200 outline-none",
          "[&>option]:bg-zinc-950 [&>option]:text-zinc-100",
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
