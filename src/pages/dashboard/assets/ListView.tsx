import { Loader2, AlertTriangle, Download, ExternalLink, Trash2, Music, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import MediaThumbnail from "@/components/MediaThumbnail";
import type { Asset } from "./types";
import { formatDuration } from "./types";
import { SourceTag } from "./AssetCard";

interface ProcessingTask {
  runId: string;
  flowName: string;
  flowId: string;
  startedAt: number;
  status: "processing" | "failed";
  errorMessage?: string;
  refunded?: boolean;
}

interface Props {
  assets: Asset[];
  processing: ProcessingTask[];
  selected: Set<string>;
  toggle: (id: string) => void;
  open: (a: Asset) => void;
  onDownload: (a: Asset) => void;
  onDelete: (id: string) => void;
  /** runId is the flow_run_id; lets the host route to a bundle if registered. */
  onOpenFlow: (flowId: string, runId?: string | null) => void;
  onDismiss?: (runId: string) => void;
}

const COLS = "grid-cols-[32px_60px_1fr_180px_110px_110px_120px_120px]";

function TypeBadgeSmall({ type }: { type: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-5 px-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider",
        type === "image" && "bg-fuchsia-500/15 text-fuchsia-300",
        type === "video" && "bg-amber-500/15 text-amber-300",
        type === "audio" && "bg-emerald-500/15 text-emerald-300"
      )}
    >
      {type}
    </span>
  );
}

export const ListView = ({
  assets,
  processing,
  selected,
  toggle,
  open,
  onDownload,
  onDelete,
  onOpenFlow,
  onDismiss,
}: Props) => {
  return (
    <div className="rounded-2xl border border-strong bg-card/30 overflow-hidden">
      <div
        className={cn(
          "grid px-4 h-10 items-center text-[10.5px] uppercase tracking-wider text-muted-foreground/70 border-b border-strong bg-card/50",
          COLS
        )}
      >
        <span></span>
        <span>Preview</span>
        <span>Name</span>
        <span>Flow</span>
        <span>Type</span>
        <span>Source</span>
        <span>Created</span>
        <span className="text-right pr-2">Actions</span>
      </div>

      {processing.map((p) => {
        const isFailed = p.status === "failed";
        return (
          <div
            key={p.runId}
            className={cn(
              "grid px-4 h-16 items-center border-b border-strong",
              COLS,
              isFailed && "bg-destructive/5"
            )}
          >
            <span />
            <div
              className={cn(
                "w-11 h-11 rounded-lg flex items-center justify-center",
                isFailed
                  ? "bg-destructive/10 border border-destructive/30"
                  : "bg-muted animate-pulse"
              )}
            >
              {isFailed && <AlertTriangle className="w-4 h-4 text-destructive" />}
            </div>
            <div className="flex items-center gap-2 ml-3 min-w-0">
              {isFailed ? (
                <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-sm text-foreground truncate">{p.flowName}</div>
                {isFailed && p.errorMessage && (
                  <div
                    className="text-[10.5px] text-destructive/85 truncate"
                    title={p.errorMessage}
                  >
                    {p.errorMessage}
                  </div>
                )}
              </div>
            </div>
            <span className="text-[12px] text-muted-foreground truncate">
              {p.flowName}
            </span>
            <span>
              <span
                className={cn(
                  "inline-flex items-center h-5 px-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider",
                  isFailed
                    ? "bg-destructive/15 text-destructive"
                    : "bg-primary/15 text-primary"
                )}
              >
                {isFailed ? (p.refunded ? "Failed · refunded" : "Failed") : "Processing"}
              </span>
            </span>
            <span className="text-[11px] text-muted-foreground">Workflow</span>
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(p.startedAt), { addSuffix: true })}
            </span>
            <div className="flex items-center justify-end gap-1">
              {isFailed && p.flowId && (
                <button
                  className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                  onClick={() => onOpenFlow(p.flowId, p.runId)}
                  title="Try again"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
              {onDismiss && (
                <button
                  className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                  onClick={() => onDismiss(p.runId)}
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {assets.map((a) => {
        const sel = selected.has(a.id);
        const flowId = a.metadata?.flow_id;
        return (
          <div
            key={a.id}
            onClick={() => open(a)}
            className={cn(
              "group grid px-4 h-16 items-center border-b border-strong cursor-pointer transition",
              COLS,
              sel ? "bg-primary/10" : "hover:bg-card/50"
            )}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggle(a.id);
              }}
              className={cn(
                "h-5 w-5 rounded-md border flex items-center justify-center transition",
                sel
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-strong text-transparent hover:border-muted-foreground hover:text-muted-foreground"
              )}
            >
              <Check className="w-3 h-3" />
            </button>
            <div className="w-11 h-11 rounded-lg overflow-hidden border border-strong bg-muted/40 flex-shrink-0 flex items-center justify-center">
              {a.file_type === "image" || a.file_type === "video" ? (
                <MediaThumbnail
                  url={a.thumbnail_url || a.file_url}
                  alt={a.name}
                  hoverPlay
                />
              ) : (
                <Music className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div className="ml-3 min-w-0">
              <div className="text-[13px] font-medium truncate text-foreground">
                {a.name}
              </div>
              <div className="text-[11px] text-muted-foreground/70">
                {a.size_mb ? `${a.size_mb} MB` : ""}
                {a.duration ? ` · ${formatDuration(a.duration)}` : ""}
              </div>
            </div>
            <div className="text-[12px] text-primary truncate">
              {a.flow_name || (
                <span className="text-muted-foreground/40">—</span>
              )}
              {a.bundle_id && (
                <div
                  className="mt-0.5 text-[10px] uppercase tracking-wider font-semibold truncate"
                  style={{ color: "hsl(var(--accent-foreground))" }}
                  title={a.bundle_name ? `From bundle: ${a.bundle_name}` : "From bundle"}
                >
                  {a.bundle_name ? `📦 ${a.bundle_name}` : "📦 From bundle"}
                </div>
              )}
            </div>
            <div>
              <TypeBadgeSmall type={a.file_type} />
            </div>
            <div>
              <SourceTag source={a.source} />
            </div>
            <div className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
            </div>
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100"
            >
              <button
                className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={() => onDownload(a)}
                title="Download"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              {flowId && (
                <button
                  className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                  onClick={() => onOpenFlow(flowId, a.metadata?.flow_run_id ?? a.metadata?.run_id ?? null)}
                  title="Open flow"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(a.id)}
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
