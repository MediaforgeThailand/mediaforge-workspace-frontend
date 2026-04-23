import {
  X,
  Download,
  Copy,
  ExternalLink,
  Trash2,
  GitBranch,
  Package,
  Image as ImageIcon,
  Film,
  Music,
} from "lucide-react";
import MediaThumbnail from "@/components/MediaThumbnail";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Asset } from "./types";
import { SOURCE_META, TYPE_HUE, formatDuration } from "./types";

interface Props {
  asset: Asset | null;
  onClose: () => void;
  onDownload: (a: Asset) => void;
  onDelete: (id: string) => void;
  /** runId is the flow_run_id; lets the host route to a bundle if registered. */
  onOpenFlow: (flowId: string, runId?: string | null) => void;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-muted/60 border border-strong min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div className="mt-0.5 text-foreground truncate text-[12px]" title={value}>
        {value}
      </div>
    </div>
  );
}

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
      }}
    >
      <I className="w-2.5 h-2.5" /> {m.label}
    </div>
  );
}

export const PreviewDrawer = ({
  asset,
  onClose,
  onDownload,
  onDelete,
  onOpenFlow,
}: Props) => {
  if (!asset) return null;
  const meta = SOURCE_META[asset.source];
  const flowId = asset.metadata?.flow_id;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(asset.file_url);
      toast.success("Link copied");
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Sheet open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:w-[460px] sm:max-w-[92vw] max-w-full p-0 bg-card border-l border-strong flex flex-col"
      >
        <div className="flex items-center justify-between h-12 px-4 border-b border-strong">
          <div className="flex items-center gap-2">
            <TypeBadge type={asset.file_type} />
            <span className="text-[11px] text-muted-foreground/70">
              {new Date(asset.created_at).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <div
            className="rounded-2xl overflow-hidden border border-strong bg-muted/40"
            style={{ aspectRatio: asset.ratio || 1 }}
          >
            {asset.file_type === "image" || asset.file_type === "video" ? (
              <MediaThumbnail
                url={asset.file_url}
                alt={asset.name}
                hoverPlay={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-500/20 to-emerald-700/20">
                <Music className="w-12 h-12 text-emerald-300/80" />
              </div>
            )}
          </div>

          <h3 className="mt-4 font-display text-[18px] font-bold break-words text-foreground">
            {asset.name}
          </h3>
          {asset.flow_name && (
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-primary">
              <GitBranch className="w-3 h-3" /> {asset.flow_name}
            </div>
          )}
          {asset.bundle_id && (
            <div
              className="mt-2 inline-flex items-center gap-1.5 px-2 h-6 rounded-md text-[11px] font-semibold uppercase tracking-wider"
              style={{
                background: "hsl(var(--accent) / 0.18)",
                color: "hsl(var(--accent-foreground))",
                boxShadow: "inset 0 0 0 1px hsl(var(--accent) / 0.35)",
              }}
            >
              <Package className="w-3 h-3" />
              {asset.bundle_name ? `From bundle · ${asset.bundle_name}` : "From bundle"}
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3 text-[12px]">
            <Field label="Source" value={meta?.label || asset.source} />
            <Field label="Type" value={asset.file_type} />
            {asset.size_mb != null && (
              <Field label="Size" value={`${asset.size_mb} MB`} />
            )}
            {asset.duration != null && (
              <Field label="Duration" value={formatDuration(asset.duration) || "—"} />
            )}
            <Field
              label="Created"
              value={new Date(asset.created_at).toLocaleString()}
            />
            <Field label="ID" value={asset.id} />
          </div>
        </div>

        <div className="p-3 border-t border-strong flex items-center gap-2">
          <button
            onClick={() => onDownload(asset)}
            className={cn(
              "flex-1 h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm",
              "flex items-center justify-center gap-2 hover:brightness-110",
              "shadow-[0_0_40px_hsl(var(--primary)/0.35),inset_0_0_0_1px_hsl(var(--primary)/0.25)]"
            )}
          >
            <Download className="w-3.5 h-3.5" /> Download
          </button>
          <button
            onClick={copyLink}
            className="h-10 px-3 rounded-xl bg-muted border border-strong text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm"
          >
            <Copy className="w-3.5 h-3.5" /> Link
          </button>
          {flowId && (
            <button
              onClick={() => onOpenFlow(flowId, asset.metadata?.flow_run_id ?? asset.metadata?.run_id ?? null)}
              className="h-10 px-3 rounded-xl bg-muted border border-strong text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm"
              title="Open flow"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => {
              onDelete(asset.id);
              onClose();
            }}
            className="h-10 w-10 rounded-xl bg-muted border border-strong text-muted-foreground hover:text-destructive flex items-center justify-center"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
