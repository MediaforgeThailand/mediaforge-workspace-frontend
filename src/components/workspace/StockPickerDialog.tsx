import { type FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Image as ImageIcon,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface StockResource {
  id: number | string;
  title?: string;
  filename?: string;
  image?: {
    type?: string;
    orientation?: string;
    source?: { url?: string };
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
}

interface StockDownloadResponse {
  data?: {
    filename?: string;
    url?: string;
    signed_url?: string;
  };
  error?: string;
}

const QUICK_TERMS = [
  "vectors",
  "photos",
  "illustrations",
  "templates",
  "mockups",
  "icons",
];

function isValidImageUrl(url: string | undefined): url is string {
  return Boolean(url && /^https?:\/\//i.test(url));
}

/** Pull a file extension out of either a filename or a URL path. Falls
 *  back to "jpg" — Freepik photos arrive as JPEG and the canvas will
 *  refuse a totally extension-less name. */
function pickExtension(filename: string | undefined, url: string): string {
  const fromName = filename?.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1];
  if (fromName) return fromName;
  const fromUrl = url.split("?")[0]?.match(/\.([a-z0-9]+)$/i)?.[1];
  if (fromUrl) return fromUrl;
  return "jpg";
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Inline stock picker — opens over the canvas so the user never
 * leaves the workspace. Searches the Freepik library via the
 * `freepik-stock` edge function and, on insert, downloads the
 * resource then re-uploads it through the existing
 * `workspace-upload-files` pipeline so the asset lives in the user's
 * own storage (signed Freepik URLs would expire otherwise).
 */
const StockPickerDialog = ({ open, onClose }: Props) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState("creator stock content");
  const [submittedQuery, setSubmittedQuery] = useState("creator stock content");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<StockResource[]>([]);
  const [meta, setMeta] = useState<StockSearchResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalLabel = useMemo(() => {
    const total = Number(meta?.total ?? 0);
    return total
      ? t("workspace.stock.assets_count", { count: total.toLocaleString() })
      : t("workspace.stock.total_fallback");
  }, [meta?.total, t]);

  const runSearch = async (nextPage = 1, term?: string) => {
    const q = (term ?? submittedQuery).trim() || "creator stock content";
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } =
        await supabase.functions.invoke<StockSearchResponse>("freepik-stock", {
          body: {
            action: "search-resources",
            query: q,
            page: nextPage,
            limit: 24,
            order: "relevance",
          },
        });
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(data.error);
      setItems(Array.isArray(data?.data) ? data.data : []);
      setMeta(data?.meta ?? null);
      setPage(nextPage);
    } catch (err) {
      console.error("Stock search failed:", err);
      const message = t("workspace.stock.search_failed");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submittedQuery]);

  // Reset transient state when the dialog closes.
  useEffect(() => {
    if (open) return;
    setError(null);
    setInsertingId(null);
  }, [open]);

  const submit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const term = query.trim() || "creator stock content";
    setSubmittedQuery(term);
  };

  /** Download → fetch as blob → push through the canvas upload bridge.
   *  Keeps Freepik assets persisted in the user's storage so a stale
   *  signed URL doesn't break the AssetNode tomorrow. */
  const insertResource = async (item: StockResource) => {
    const resourceId = String(item.id);
    setInsertingId(resourceId);
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
      const downloadUrl = data?.data?.signed_url ?? data?.data?.url;
      if (!downloadUrl) throw new Error(t("workspace.stock.no_url"));

      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const ext = pickExtension(data?.data?.filename, downloadUrl);
      const baseName =
        data?.data?.filename ?? item.filename ?? `mediaforge-stock-${resourceId}.${ext}`;
      const finalName = baseName.includes(".") ? baseName : `${baseName}.${ext}`;
      const file = new File([blob], finalName, {
        type: blob.type || "image/jpeg",
      });

      window.dispatchEvent(
        new CustomEvent("workspace-upload-files", {
          detail: { files: [file] },
        }),
      );
      toast.success(t("workspace.stock.insert_success"));
      onClose();
    } catch (err) {
      console.error("Stock insert failed:", err);
      toast.error(t("workspace.stock.insert_failed"));
    } finally {
      setInsertingId(null);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex h-[78vh] w-[min(960px,92vw)] flex-col overflow-hidden rounded-xl bg-zinc-950 shadow-2xl ring-1 ring-white/[0.06]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-5 py-3">
          <form onSubmit={submit} className="flex h-10 flex-1 items-center rounded-full bg-white/[0.06] px-4">
            <Search className="mr-2 h-4 w-4 shrink-0 text-zinc-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("workspace.stock.search_placeholder")}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-zinc-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="grid h-7 w-7 place-items-center rounded-full bg-white text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={t("workspace.stock.search_button")}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            </button>
          </form>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.04] text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
            aria-label={t("workspace.stock.close_preview")}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.04] px-5 py-2.5">
          <div className="text-[12px] text-zinc-500">{totalLabel}</div>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {QUICK_TERMS.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => {
                  setQuery(term);
                  setSubmittedQuery(term);
                }}
                className="rounded-full bg-white/[0.04] px-3 py-1 text-[12px] font-medium text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                {term}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-100">
              {error}
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="grid min-h-[280px] place-items-center text-[14px] text-zinc-400">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("workspace.stock.searching")}
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="grid min-h-[280px] place-items-center text-center text-zinc-400">
              <div>
                <ImageIcon className="mx-auto h-8 w-8 text-zinc-600" />
                <div className="mt-2 text-[15px] font-semibold text-white">
                  {t("workspace.stock.empty_title")}
                </div>
                <div className="mt-1 text-[13px]">{t("workspace.stock.empty_hint")}</div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {items.map((item) => (
                <StockCard
                  key={String(item.id)}
                  item={item}
                  inserting={insertingId === String(item.id)}
                  onInsert={() => void insertResource(item)}
                />
              ))}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.04] px-5 py-3 text-[12px] text-zinc-400">
          <span>
            {t("workspace.stock.page_of", {
              current: meta?.current_page ?? page,
              total: meta?.last_page ?? "?",
            })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading || page <= 1}
              onClick={() => void runSearch(page - 1)}
              className="rounded-full bg-white/[0.06] px-4 py-1.5 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("workspace.stock.previous")}
            </button>
            <button
              type="button"
              disabled={loading || (meta?.last_page ? page >= meta.last_page : false)}
              onClick={() => void runSearch(page + 1)}
              className="rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("workspace.stock.next")}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
};

function StockCard({
  item,
  inserting,
  onInsert,
}: {
  item: StockResource;
  inserting: boolean;
  onInsert: () => void;
}) {
  const { t } = useLanguage();
  const imageUrl = item.image?.source?.url;

  return (
    <button
      type="button"
      onClick={onInsert}
      disabled={inserting}
      className={cn(
        "group relative overflow-hidden rounded-xl bg-white/[0.04] text-left transition",
        "hover:bg-white/[0.08]",
        inserting && "opacity-60",
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-zinc-900">
        {isValidImageUrl(imageUrl) ? (
          <img
            src={imageUrl}
            alt={item.title ?? item.filename ?? t("workspace.stock.asset_alt")}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <ImageIcon className="h-7 w-7 text-zinc-600" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-2 opacity-0 transition group-hover:opacity-100">
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-3 py-1.5 text-[12px] font-semibold text-white shadow-lg">
            {inserting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {t("workspace.stock.insert")}
          </span>
        </div>
      </div>
      <div className="px-2 py-1.5">
        <div className="line-clamp-1 text-[12.5px] font-medium text-zinc-200">
          {item.title ?? item.filename ?? t("workspace.stock.asset_id_fallback", { id: String(item.id) })}
        </div>
      </div>
    </button>
  );
}

export default StockPickerDialog;
