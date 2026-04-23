import { Play, Music, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import MediaThumbnail from "@/components/MediaThumbnail";
import { ProcessingCard } from "./ProcessingCard";
import type { Asset } from "./types";
import { formatDuration, TYPE_HUE } from "./types";

interface ProcessingTask {
  runId: string;
  flowName: string;
  flowId: string;
  startedAt: number;
  status: "processing" | "failed";
  errorMessage?: string;
  refunded?: boolean;
}

function TypeBadge({ type }: { type: string }) {
  const hue = TYPE_HUE[type] ?? 300;
  return (
    <div
      className="flex items-center gap-1 px-1.5 h-5 rounded-md text-[9.5px] font-bold tracking-wider uppercase"
      style={{
        background: `hsl(${hue} 70% 50% / 0.22)`,
        color: `hsl(${hue} 85% 75%)`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 70% 55% / 0.3)`,
      }}
    >
      {type === "image" ? "IMG" : type.toUpperCase()}
    </div>
  );
}

function MasonryCard({
  asset,
  selected,
  onToggle,
  onOpen,
}: {
  asset: Asset;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: (a: Asset) => void;
}) {
  return (
    <div
      onClick={() => onOpen(asset)}
      className="relative group rounded-2xl bg-card/60 border border-strong overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_hsl(var(--primary)/0.5)]"
    >
      <div
        className="relative bg-muted/40"
        style={{ aspectRatio: asset.ratio || 1 }}
      >
        {asset.file_type === "image" || asset.file_type === "video" ? (
          <MediaThumbnail
            url={asset.thumbnail_url || asset.file_url}
            alt={asset.name}
            hoverPlay
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-500/20 to-emerald-700/20">
            <Music className="w-8 h-8 text-emerald-300/80" />
          </div>
        )}

        <div className="absolute top-2 left-2">
          <TypeBadge type={asset.file_type} />
        </div>
        {asset.file_type !== "image" && asset.duration != null && (
          <div className="absolute top-2 right-2 flex items-center gap-1 h-5 px-1.5 rounded-md bg-black/55 backdrop-blur-sm text-[10px] text-white/90 font-medium">
            {asset.file_type === "video" ? (
              <Play className="w-2.5 h-2.5" />
            ) : (
              <Music className="w-2.5 h-2.5" />
            )}
            {formatDuration(asset.duration)}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 p-3 pt-8 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition">
          <div className="text-[12px] font-medium text-white truncate">
            {asset.name}
          </div>
          {asset.flow_name && (
            <div className="text-[10px] text-white/70 truncate">
              {asset.flow_name}
            </div>
          )}
          {asset.bundle_id && (
            <div className="mt-1 inline-flex items-center gap-1 px-1.5 h-4 rounded text-[9px] font-semibold uppercase tracking-wider bg-white/15 text-white max-w-full">
              <span className="truncate">
                {asset.bundle_name ? `Bundle · ${asset.bundle_name}` : "From bundle"}
              </span>
            </div>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(asset.id);
          }}
          className={cn(
            "absolute bottom-2 left-2 h-6 w-6 rounded-lg border flex items-center justify-center transition",
            selected
              ? "bg-primary border-primary text-primary-foreground opacity-100"
              : "bg-black/40 backdrop-blur-sm border-white/30 text-transparent opacity-0 group-hover:opacity-100 group-hover:text-white"
          )}
        >
          <Check className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

interface Props {
  assets: Asset[];
  processing: ProcessingTask[];
  selected: Set<string>;
  toggle: (id: string) => void;
  open: (a: Asset) => void;
  onDismiss?: (runId: string) => void;
  onRetry?: (flowId: string, runId?: string | null) => void;
}

export const MasonryView = ({ assets, processing, selected, toggle, open, onDismiss, onRetry }: Props) => {
  return (
    <div className="columns-2 md:columns-3 lg:columns-4 gap-3.5 [&>*]:break-inside-avoid [&>*]:mb-3.5">
      {processing.map((p) => (
        <div key={p.runId} className="inline-block w-full">
          <ProcessingCard
            flowName={p.flowName}
            startedAt={p.startedAt}
            status={p.status}
            errorMessage={p.errorMessage}
            refunded={p.refunded}
            onDismiss={onDismiss ? () => onDismiss(p.runId) : undefined}
            onRetry={p.status === "failed" && onRetry && p.flowId ? () => onRetry(p.flowId, p.runId) : undefined}
          />
        </div>
      ))}
      {assets.map((a) => (
        <div key={a.id} className="inline-block w-full">
          <MasonryCard
            asset={a}
            selected={selected.has(a.id)}
            onToggle={toggle}
            onOpen={open}
          />
        </div>
      ))}
    </div>
  );
};

interface KanbanProps extends Props {}

export const KanbanView = ({
  assets,
  processing,
  selected,
  toggle,
  open,
}: KanbanProps) => {
  const buckets = [
    { key: "today", label: "Today", hue: 262 },
    { key: "week", label: "This week", hue: 300 },
    { key: "month", label: "This month", hue: 38 },
    { key: "older", label: "Earlier", hue: 190 },
  ] as const;

  function bucketOf(a: Asset): string {
    const d = new Date(a.created_at);
    const hrs = (Date.now() - d.getTime()) / 3600e3;
    if (hrs < 24) return "today";
    if (hrs < 24 * 7) return "week";
    if (hrs < 24 * 30) return "month";
    return "older";
  }

  const groups: Record<string, Asset[]> = {
    today: [],
    week: [],
    month: [],
    older: [],
  };
  assets.forEach((a) => groups[bucketOf(a)].push(a));

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {buckets.map((b) => (
        <div
          key={b.key}
          className="rounded-2xl border border-strong bg-card/30 flex flex-col min-h-[400px]"
        >
          <div className="flex items-center justify-between px-4 h-11 border-b border-strong">
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: `hsl(${b.hue} 80% 60%)` }}
              />
              <span className="text-[12px] font-semibold text-foreground">
                {b.label}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground/70">
              {groups[b.key].length}
            </span>
          </div>
          <div className="p-3 space-y-3 overflow-y-auto flex-1">
            {b.key === "today" &&
              processing.map((p) => (
                <ProcessingCard
                  key={p.runId}
                  flowName={p.flowName}
                  startedAt={p.startedAt}
                  status={p.status}
                  errorMessage={p.errorMessage}
                  refunded={p.refunded}
                />
              ))}
            {groups[b.key].map((a) => (
              <MasonryCard
                key={a.id}
                asset={a}
                selected={selected.has(a.id)}
                onToggle={toggle}
                onOpen={open}
              />
            ))}
            {groups[b.key].length === 0 && b.key !== "today" && (
              <div className="text-center text-[11px] text-muted-foreground/70 py-6">
                Nothing here
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
