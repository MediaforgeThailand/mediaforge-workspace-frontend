import { useState } from "react";
import { Sparkles, Download, MoreHorizontal, Loader2 } from "lucide-react";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { downloadMedia } from "@/lib/downloadMedia";
import { isVideoUrl } from "@/components/MediaThumbnail";
import type { RunGroup, RunResultItem } from "@/components/play/ResultsView";

export interface MobileResultsViewProps {
  groups: RunGroup[];
  isRunning: boolean;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t || Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 30) return "Just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function MobileResultsView({ groups, isRunning }: MobileResultsViewProps) {
  if (groups.length === 0 && !isRunning) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
          <Sparkles className="w-6 h-6 text-[hsl(var(--brand))]" />
        </div>
        <p className="text-[14px] font-semibold text-foreground mb-1 font-prompt">ยังไม่มีผลงาน</p>
        <p className="text-[12px] text-[hsl(var(--text-faint))] font-prompt">เริ่มสร้างผลงานชิ้นแรกได้เลย</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {isRunning && (
        <MobileGroupCard
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
        <MobileGroupCard key={g.id} group={g} />
      ))}
    </div>
  );
}

function MobileGroupCard({ group, isPending = false }: { group: RunGroup; isPending?: boolean }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--brand))]" />
        <span className="font-semibold text-foreground">{timeAgo(group.createdAt)}</span>
        {group.creditsUsed != null && group.creditsUsed > 0 && (
          <>
            <span className="text-[hsl(var(--text-faint))]">·</span>
            <span className="text-[hsl(var(--text-dim))] font-mono">
              {group.creditsUsed.toLocaleString()} credits
            </span>
          </>
        )}
      </div>

      {group.prompt && (
        <p className="text-[12px] text-foreground leading-snug font-prompt line-clamp-2">
          {group.prompt}
        </p>
      )}

      {isPending ? (
        <div
          className="relative overflow-hidden rounded-[18px] bg-black/40 border border-white/[0.06] flex items-center justify-center"
          style={{ aspectRatio: 1 }}
        >
          <Loader2 className="w-6 h-6 text-[hsl(var(--brand))] animate-spin" />
        </div>
      ) : (
        <div className={`grid gap-2 ${group.outputs.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {group.outputs.map((o) => (
            <MobileThumb key={o.id} item={o} />
          ))}
        </div>
      )}

      {!isPending && group.outputs.length > 0 && (
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() =>
              group.outputs.forEach((o, i) =>
                setTimeout(() => downloadMedia(o.url, `mediaforge-${group.id}-${i + 1}`), i * 200),
              )
            }
            className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[hsl(var(--text-2))] hover:text-foreground transition-colors"
          >
            <Download size={12} />
            {group.outputs.length > 1 ? `Download All (${group.outputs.length})` : "Download"}
          </button>
          <div className="flex items-center gap-1">
            <IconBtn>
              <MoreHorizontal size={13} />
            </IconBtn>
          </div>
        </div>
      )}
    </section>
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

function MobileThumb({ item }: { item: RunResultItem }) {
  const signed = useSignedUrl(item.url);
  const [aspectRatio, setAspectRatio] = useState<number>(1);
  const isVideo = !!signed && (item.type === "video" || isVideoUrl(signed));

  return (
    <div
      className="relative overflow-hidden rounded-[16px] bg-black/40 border border-white/[0.06]"
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
            if (videoWidth > 0 && videoHeight > 0) setAspectRatio(videoWidth / videoHeight);
          }}
        />
      ) : (
        <img
          src={signed}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onLoad={(e) => {
            const { naturalWidth, naturalHeight } = e.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) setAspectRatio(naturalWidth / naturalHeight);
          }}
        />
      )}
    </div>
  );
}
