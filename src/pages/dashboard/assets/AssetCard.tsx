import {
  Image as ImageIcon,
  Film,
  Music,
  Play,
  Eye,
  Download,
  MoreHorizontal,
  Check,
  GitBranch,
  Package,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import MediaThumbnail from "@/components/MediaThumbnail";
import type { Asset } from "./types";
import { SOURCE_META, TYPE_HUE, formatDuration } from "./types";

function TypeBadge({ type }: { type: string }) {
  const hue = TYPE_HUE[type] ?? 300;
  const map: Record<string, { label: string; Icon: any }> = {
    image: { label: "IMG", Icon: ImageIcon },
    video: { label: "VIDEO", Icon: Film },
    audio: { label: "AUDIO", Icon: Music },
  };
  const m = map[type] ?? map.image;
  const I = m.Icon;
  return (
    <div
      className="flex items-center gap-1 px-1.5 h-5 rounded-md text-[9.5px] font-bold tracking-wider uppercase"
      style={{
        background: `hsl(${hue} 70% 50% / 0.22)`,
        color: `hsl(${hue} 85% 75%)`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 70% 55% / 0.3)`,
      }}
    >
      <I className="w-2.5 h-2.5" /> {m.label}
    </div>
  );
}

export function SourceTag({ source }: { source: string }) {
  const meta = SOURCE_META[source] ?? { label: source, hue: 262 };
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium"
      style={{ color: `hsl(${meta.hue} 70% 72%)` }}
    >
      <span
        className="w-1 h-1 rounded-full"
        style={{ background: `hsl(${meta.hue} 80% 60%)` }}
      />
      {meta.label}
    </span>
  );
}

interface Props {
  asset: Asset;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: (a: Asset) => void;
  onDownload?: (a: Asset) => void;
  density?: "compact" | "comfortable" | "airy";
}

export const AssetCard = ({
  asset,
  selected,
  onToggle,
  onOpen,
  onDownload,
  density = "comfortable",
}: Props) => {
  const pad =
    density === "compact" ? "p-2" : density === "airy" ? "p-4" : "p-3";
  return (
    <div
      onClick={() => onOpen(asset)}
      className="relative group rounded-2xl bg-gradient-to-b from-card/80 to-card/40 border border-strong card-hover overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_hsl(var(--primary)/0.5)]"
    >
      <div className={cn("relative", pad, "pb-0")}>
        <div
          className="relative overflow-hidden rounded-xl border border-strong bg-muted/40"
          style={{ aspectRatio: 1 }}
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

          {/* hover overlay */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-gradient-to-t from-black/70 via-black/10 to-transparent flex items-end p-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(asset);
                }}
                className="h-8 w-8 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-white/20"
                title="Preview"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload?.(asset);
                }}
                className="h-8 w-8 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-white/20"
                title="Download"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => e.stopPropagation()}
                className="h-8 w-8 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-white/20"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

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

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(asset.id);
            }}
            className={cn(
              "absolute bottom-2 left-2 h-6 w-6 rounded-lg border transition flex items-center justify-center",
              selected
                ? "bg-primary border-primary text-primary-foreground opacity-100"
                : "bg-black/40 backdrop-blur-sm border-white/30 text-transparent hover:text-white opacity-0 group-hover:opacity-100"
            )}
          >
            <Check className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className={pad}>
        <div className="flex items-center justify-between gap-2">
          <SourceTag source={asset.source} />
          <span className="text-[10px] text-muted-foreground/70">
            {formatDistanceToNow(new Date(asset.created_at), { addSuffix: true })}
          </span>
        </div>
        <div
          className="mt-1 font-medium text-[13px] truncate text-foreground"
          title={asset.name}
        >
          {asset.name}
        </div>
        {asset.flow_name && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-primary truncate">
            <GitBranch className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{asset.flow_name}</span>
          </div>
        )}
        {asset.bundle_id && (
          <div
            className="mt-1 inline-flex items-center gap-1 px-1.5 h-5 rounded-md text-[10px] font-semibold uppercase tracking-wider max-w-full"
            style={{
              background: "hsl(var(--accent) / 0.18)",
              color: "hsl(var(--accent-foreground))",
              boxShadow: "inset 0 0 0 1px hsl(var(--accent) / 0.35)",
            }}
            title={asset.bundle_name ? `From bundle: ${asset.bundle_name}` : "From bundle"}
          >
            <Package className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">
              {asset.bundle_name ? `From: ${asset.bundle_name}` : "From bundle"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
