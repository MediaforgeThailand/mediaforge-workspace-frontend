import { useState } from "react";
import { Sparkles, Heart, Download, MoreHorizontal, Image as ImageIcon, Video as VideoIcon, Layers } from "lucide-react";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { downloadMedia } from "@/lib/downloadMedia";
import { isVideoUrl } from "@/components/MediaThumbnail";
import GenOrbitLoader from "./GenOrbitLoader";

export interface RunResultItem {
  id: string;
  url: string;
  type?: "image" | "video";
}

export interface RunGroup {
  id: string;
  createdAt: string; // ISO
  creditsUsed?: number;
  prompt?: string;
  outputs: RunResultItem[];
  meta?: {
    dimensions?: string;
    tier?: string;
    version?: string;
    tags?: string[];
    categories?: string[];
  };
  status?: "ready" | "pending" | "failed";
  favorite?: boolean;
}

export interface ResultsViewProps {
  groups: RunGroup[];
  isRunning: boolean;
  /** @deprecated kept for backward-compat; description now lives in Preview tab only */
  flowName?: string;
  /** @deprecated kept for backward-compat; description now lives in Preview tab only */
  flowDescription?: string;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatTimeOfDay(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDateShort(d: Date) {
  // e.g. "12 Apr"
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * Returns a friendly time label for a result group.
 * - <30s: "Just now · 12 Apr 14:32"
 * - same day: "Today 14:32"
 * - yesterday: "Yesterday 14:32"
 * - else: "12 Apr 14:32"
 */
function formatGroupTime(iso: string): string {
  const d = new Date(iso);
  const t = d.getTime();
  if (!t || Number.isNaN(t)) return "";

  const now = new Date();
  const diffSec = Math.floor((now.getTime() - t) / 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const time = formatTimeOfDay(d);

  if (diffSec < 30) return `Just now · ${formatDateShort(d)} ${time}`;
  if (t >= startOfToday) return `Today ${time}`;
  if (t >= startOfYesterday) return `Yesterday ${time}`;
  return `${formatDateShort(d)} ${time}`;
}

function deriveFormat(outputs: RunResultItem[]): "image" | "video" | "mixed" | null {
  if (!outputs.length) return null;
  let hasImg = false;
  let hasVid = false;
  for (const o of outputs) {
    const isVid = o.type === "video" || (typeof o.url === "string" && isVideoUrl(o.url));
    if (isVid) hasVid = true; else hasImg = true;
    if (hasImg && hasVid) return "mixed";
  }
  return hasVid ? "video" : "image";
}

export function ResultsView({ groups, isRunning }: ResultsViewProps) {
  if (groups.length === 0 && !isRunning) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
          <Sparkles className="w-6 h-6 text-[hsl(var(--brand))]" />
        </div>
        <p className="text-[14px] font-semibold text-foreground mb-1">ยังไม่มีผลงาน</p>
        <p className="text-[12px] text-[hsl(var(--text-faint))]">เริ่มสร้างผลงานชิ้นแรกของคุณได้เลย</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {isRunning && (
        <RunGroupRow
          group={{
            id: "pending",
            createdAt: new Date().toISOString(),
            outputs: [],
            status: "pending",
            prompt: "กำลังสร้างผลงาน…",
          }}
          isPending
        />
      )}

      {groups.map((g) => (
        <RunGroupRow key={g.id} group={g} />
      ))}
    </div>
  );
}

function isAutoDim(d?: string) {
  if (!d) return false;
  const v = d.trim().toLowerCase();
  return v === "auto" || v === "auto×auto" || v === "auto x auto";
}

function RunGroupRow({ group, isPending = false }: { group: RunGroup; isPending?: boolean }) {
  const isMulti = group.outputs.length > 1;
  const format = deriveFormat(group.outputs);
  const formatLabel =
    format === "video" ? "Video" : format === "image" ? "Image" : format === "mixed" ? "Image + Video" : null;
  const FormatIcon = format === "video" ? VideoIcon : format === "mixed" ? Layers : ImageIcon;

  // For "auto" aspect, we measure the first output's natural size and surface it as the dimension chip
  const [measuredDim, setMeasuredDim] = useState<string | null>(null);
  const showAuto = isAutoDim(group.meta?.dimensions);
  const dimensionLabel = showAuto ? (measuredDim ?? "Auto") : group.meta?.dimensions;

  return (
    <section className="space-y-2.5">
      {/* Header: time · credits */}
      <div className="flex items-center gap-2 text-[11.5px]">
        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--brand))]" />
        <span className="font-semibold text-foreground">{formatGroupTime(group.createdAt)}</span>
        {group.creditsUsed != null && group.creditsUsed > 0 && (
          <>
            <span className="text-[hsl(var(--text-faint))]">·</span>
            <span className="text-[hsl(var(--text-dim))] font-mono">
              {group.creditsUsed.toLocaleString()} credits
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-[260px,1fr] gap-4 items-start">
        {/* Left: thumbnails (1-2 large) */}
        <div className={`grid gap-2 ${isMulti ? "grid-cols-2" : "grid-cols-1"}`}>
          {isPending ? (
            <PendingCard />
          ) : (
            group.outputs.slice(0, 4).map((o, idx) => (
              <ResultThumb
                key={o.id}
                item={o}
                onMeasured={idx === 0 && showAuto ? (w, h) => setMeasuredDim(`${w}×${h}`) : undefined}
              />
            ))
          )}
        </div>

        {/* Right: meta chips + actions */}
        <div className="flex flex-col h-full">
          <div className="flex flex-wrap gap-1.5">
            {group.meta?.categories?.slice(0, 3).map((c) => (
              <Chip key={`cat-${c}`} tone="brand">{c}</Chip>
            ))}
            {dimensionLabel && <Chip>{dimensionLabel}</Chip>}
            {formatLabel && (
              <Chip>
                <FormatIcon size={10} className="opacity-80" />
                {formatLabel}
                {isMulti ? ` ×${group.outputs.length}` : ""}
              </Chip>
            )}
            {group.meta?.tier && <Chip>{group.meta.tier}</Chip>}
            {group.meta?.version && <Chip>{group.meta.version}</Chip>}
          </div>

          {!isPending && group.outputs.length > 0 && (
            <div className="mt-auto pt-4 flex items-center justify-between">
              <button
                onClick={() => {
                  group.outputs.forEach((o, i) =>
                    setTimeout(() => downloadMedia(o.url, `mediaforge-${group.id}-${i + 1}`), i * 200),
                  );
                }}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[hsl(var(--text-2))] hover:text-foreground transition-colors"
              >
                <Download size={13} />
                {isMulti ? `Download All (${group.outputs.length})` : "Download"}
              </button>
              <div className="flex items-center gap-1">
                <IconBtn>
                  <Heart size={14} />
                </IconBtn>
                <IconBtn>
                  <MoreHorizontal size={14} />
                </IconBtn>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "brand" }) {
  const toneClass =
    tone === "brand"
      ? "bg-[hsl(var(--brand)/0.1)] border-[hsl(var(--brand)/0.22)] text-[hsl(var(--brand-foreground,var(--brand)))]"
      : "bg-white/[0.05] border-white/[0.06] text-[hsl(var(--text-2))]";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10.5px] font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

function IconBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-7 h-7 rounded-lg flex items-center justify-center text-[hsl(var(--text-dim))] hover:text-foreground hover:bg-white/[0.05] transition-colors"
    >
      {children}
    </button>
  );
}

function ResultThumb({
  item,
  onMeasured,
}: {
  item: RunResultItem;
  onMeasured?: (width: number, height: number) => void;
}) {
  const signed = useSignedUrl(item.url);
  const [aspectRatio, setAspectRatio] = useState<number>(1);
  const isVideo = !!signed && (item.type === "video" || isVideoUrl(signed));

  return (
    <div
      className="relative overflow-hidden rounded-[18px] bg-black/40 border border-white/[0.06] w-full"
      style={{ aspectRatio }}
    >
      {!signed ? (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[hsl(var(--text-faint))]">
          Loading…
        </div>
      ) : isVideo ? (
        <video
          src={signed}
          muted
          loop
          playsInline
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
          onLoadedMetadata={(e) => {
            const { videoWidth, videoHeight } = e.currentTarget;
            if (videoWidth > 0 && videoHeight > 0) {
              setAspectRatio(videoWidth / videoHeight);
              onMeasured?.(videoWidth, videoHeight);
            }
          }}
        />
      ) : (
        <img
          src={signed}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onLoad={(e) => {
            const { naturalWidth, naturalHeight } = e.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) {
              setAspectRatio(naturalWidth / naturalHeight);
              onMeasured?.(naturalWidth, naturalHeight);
            }
          }}
        />
      )}
    </div>
  );
}

function PendingCard() {
  return (
    <div
      className="relative overflow-hidden rounded-[18px] bg-black/40 border border-white/[0.06] w-full flex items-center justify-center"
      style={{ aspectRatio: 1 }}
    >
      <GenOrbitLoader size={88} />
    </div>
  );
}
