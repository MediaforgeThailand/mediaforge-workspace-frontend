/**
 * BundleResultsPanel — Right-side aggregated results column for the Bundle Play page.
 *
 * Differs from src/components/play/ResultsPanel.tsx by displaying a "Shared · Bundle"
 * badge and accepting a `flowsMeta` map so each capsule can show which flow it came from.
 */
import { useMemo, useState } from "react";
import {
  Grid3x3,
  Sparkles,
  Heart,
  Download,
  MoreHorizontal,
  ArrowDownUp,
  LayoutGrid,
  Package,
} from "lucide-react";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { downloadMedia } from "@/lib/downloadMedia";
import { isVideoUrl } from "@/components/MediaThumbnail";
import type { RunGroup, RunResultItem } from "@/components/play/ResultsView";
import type { BundleFlow } from "./types";

export interface BundleResultsPanelProps {
  /** Aggregated run groups across all flows in the bundle, newest-first */
  runGroups: RunGroup[];
  /** Map of flowId → BundleFlow for badge color/emoji */
  flowsById: Record<string, BundleFlow>;
  isRunning: boolean;
  /** Optional: which flow the active panel is on (used for "all" vs "this flow" filters) */
  activeFlowId?: string;
  /**
   * When true, renders inline as a full-width/height panel instead of a fixed
   * right-rail. Used by the mobile Results tab where the parent positions us.
   */
  mobileFullWidth?: boolean;
}

type FilterId = "all" | "thisFlow" | "fav" | "today";

export function BundleResultsPanel({
  runGroups,
  flowsById,
  isRunning,
  activeFlowId,
  mobileFullWidth = false,
}: BundleResultsPanelProps) {
  const [filter, setFilter] = useState<FilterId>("all");

  const filteredGroups = useMemo(() => {
    if (filter === "thisFlow" && activeFlowId) {
      return runGroups.filter((g) => (g as any).flowId === activeFlowId);
    }
    if (filter === "fav") return runGroups.filter((g) => g.favorite);
    if (filter === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return runGroups.filter((g) => new Date(g.createdAt).getTime() >= start.getTime());
    }
    return runGroups;
  }, [runGroups, filter, activeFlowId]);

  const counts: Record<FilterId, number> = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return {
      all: runGroups.reduce((a, g) => a + g.outputs.length, 0),
      thisFlow: activeFlowId
        ? runGroups.filter((g) => (g as any).flowId === activeFlowId).reduce((a, g) => a + g.outputs.length, 0)
        : 0,
      fav: runGroups.filter((g) => g.favorite).reduce((a, g) => a + g.outputs.length, 0),
      today: runGroups
        .filter((g) => new Date(g.createdAt).getTime() >= start.getTime())
        .reduce((a, g) => a + g.outputs.length, 0),
    };
  }, [runGroups, activeFlowId]);

  const shellClass = mobileFullWidth
    ? "relative w-full h-full flex flex-col rounded-3xl glass-panel overflow-hidden"
    : "fixed right-3 top-[60px] bottom-3 z-30 hidden xl:flex w-[380px] min-w-[340px] flex-col rounded-3xl glass-panel overflow-hidden";

  return (
    <aside
      className={shellClass}
      style={{
        boxShadow:
          "0 40px 80px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(167,139,250,0.04)",
      }}
    >
      {/* ambient drifts */}
      <div
        aria-hidden
        className="absolute -top-24 -left-20 w-64 h-64 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(124,58,237,0.18), transparent 70%)",
          animation: "mf-drift 14s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-20 -right-16 w-60 h-60 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(167,139,250,0.12), transparent 70%)",
          animation: "mf-drift 18s ease-in-out infinite reverse",
        }}
      />

      <div className="relative flex flex-col flex-1 min-h-0">
        <BundleResultsHeader
          totalRuns={runGroups.length}
          totalOutputs={counts.all}
          isRunning={isRunning}
        />
        <BundleFilterChips active={filter} onChange={setFilter} counts={counts} hasFlow={!!activeFlowId} />
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-3 space-y-3">
          {filteredGroups.length === 0 && !isRunning ? (
            <BundleEmptyState />
          ) : (
            filteredGroups.map((g, i) => (
              <BundleRunCapsule
                key={g.id}
                group={g}
                flow={flowsById[(g as any).flowId]}
                delay={i * 60}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

/* ─── Header ─── */
function BundleResultsHeader({
  totalRuns,
  totalOutputs,
  isRunning,
}: {
  totalRuns: number;
  totalOutputs: number;
  isRunning: boolean;
}) {
  return (
    <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/[0.05] relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(167,139,250,0.18), transparent 70%)",
        }}
      />
      <div className="flex items-center justify-between gap-2 relative">
        <div className="flex items-center gap-2.5">
          <div
            className="relative w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(167,139,250,0.22), rgba(124,58,237,0.1))",
              border: "1px solid rgba(167,139,250,0.3)",
            }}
          >
            <Grid3x3 size={14} className="text-[#c4b5fd]" />
            {isRunning && (
              <span
                className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[hsl(var(--accent-success))] animate-pulse"
                style={{ boxShadow: "0 0 8px hsl(var(--accent-success) / 0.8)" }}
              />
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <div className="text-[13px] font-bold leading-tight font-prompt">Results</div>
            </div>
            <div className="text-[10.5px] text-white/45 font-mono mt-0.5">
              {totalRuns} runs · {totalOutputs} outputs
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Filter chips ─── */
function BundleFilterChips({
  active,
  onChange,
  counts,
  hasFlow,
}: {
  active: FilterId;
  onChange: (id: FilterId) => void;
  counts: Record<FilterId, number>;
  hasFlow: boolean;
}) {
  const chips: { id: FilterId; label: string; show: boolean }[] = [
    { id: "all", label: "All", show: true },
    { id: "thisFlow", label: "This flow", show: hasFlow },
    { id: "fav", label: "Favorites", show: true },
    { id: "today", label: "Today", show: true },
  ];
  return (
    <div className="shrink-0 px-4 py-2.5 border-b border-white/[0.04]">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {chips.filter((c) => c.show).map((f) => {
          const isActive = active === f.id;
          return (
            <button
              key={f.id}
              onClick={() => onChange(f.id)}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-semibold transition"
              style={{
                background: isActive
                  ? "linear-gradient(180deg, rgba(167,139,250,0.22), rgba(124,58,237,0.14))"
                  : "rgba(255,255,255,0.03)",
                border: `1px solid ${isActive ? "rgba(167,139,250,0.45)" : "rgba(255,255,255,0.07)"}`,
                color: isActive ? "#e9e3ff" : "rgba(240,240,250,0.6)",
                boxShadow: isActive ? "0 0 18px -4px rgba(167,139,250,0.4)" : "none",
              }}
            >
              {f.label}
              <span className="font-mono text-[9px] opacity-60">{counts[f.id] ?? 0}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Run capsule ─── */
function BundleRunCapsule({ group, flow, delay }: { group: RunGroup; flow?: BundleFlow; delay: number }) {
  const isMulti = group.outputs.length > 1;
  const accent = flow?.color ?? "#a78bfa";
  return (
    <section
      className="relative rounded-2xl p-[1px] anim-fadeInUp"
      style={{
        background: `linear-gradient(140deg, ${accent}55 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.02) 100%)`,
        animationDelay: `${delay}ms`,
      }}
    >
      <div
        className="rounded-2xl p-2.5"
        style={{ background: "linear-gradient(180deg, rgba(24,20,44,0.9), rgba(14,10,28,0.9))" }}
      >
        {/* Header line — flow chip + time + credits */}
        <div className="flex items-center justify-between px-1 mb-2 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {flow && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider truncate max-w-[110px]"
                style={{
                  background: `${accent}18`,
                  border: `1px solid ${accent}40`,
                  color: accent,
                }}
                title={flow.name}
              >
                <span>{flow.emoji}</span>
                <span className="truncate">{flow.name}</span>
              </span>
            )}
            <span className="text-[10px] text-white/50 font-mono shrink-0">
              {formatGroupTime(group.createdAt)}
            </span>
          </div>
          {group.creditsUsed != null && group.creditsUsed > 0 && (
            <span className="text-[9.5px] text-white/40 font-mono shrink-0">
              {group.creditsUsed.toLocaleString()}c
            </span>
          )}
        </div>

        {/* Image grid */}
        <div className={`grid ${isMulti ? "grid-cols-2" : "grid-cols-1"} gap-1.5`}>
          {group.outputs.slice(0, 4).map((o) => (
            <DraggableThumb key={o.id} item={o} runId={group.id} />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end mt-2 px-1">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() =>
                group.outputs.forEach((o, i) =>
                  setTimeout(() => downloadMedia(o.url, `mediaforge-${group.id}-${i + 1}`), i * 200),
                )
              }
              className="w-6 h-6 rounded-md flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.05] transition"
              title="Download all"
            >
              <Download size={11} />
            </button>
            <button
              className="w-6 h-6 rounded-md flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.05] transition"
              title="More"
            >
              <MoreHorizontal size={11} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Draggable thumb (with ghost overlay) ─── */
function DraggableThumb({ item, runId }: { item: RunResultItem; runId: string }) {
  const signed = useSignedUrl(item.url);
  const isVideo = !!signed && (item.type === "video" || isVideoUrl(signed));

  const handleDragStart = (e: React.DragEvent) => {
    // 1) Native HTML5 payload — picked up by FigmaFileUploadField drop handlers
    e.dataTransfer.setData(
      "application/x-mf-result",
      JSON.stringify({ url: item.url, runId, itemId: item.id }),
    );
    e.dataTransfer.effectAllowed = "copy";

    // 2) Custom ghost element so the drag overlay matches our design
    if (signed) {
      const ghost = document.createElement("div");
      ghost.className = "bundle-drag-ghost";
      const tag = isVideo ? "video" : "img";
      const media = document.createElement(tag);
      (media as HTMLImageElement | HTMLVideoElement).src = signed;
      if (tag === "video") {
        const v = media as HTMLVideoElement;
        v.muted = true;
        v.playsInline = true;
      }
      ghost.appendChild(media);
      ghost.style.left = "-9999px";
      ghost.style.top = "-9999px";
      document.body.appendChild(ghost);
      try {
        e.dataTransfer.setDragImage(ghost, 40, 40);
      } catch {
        /* setDragImage may fail in some browsers */
      }
      // cleanup after the browser has captured the snapshot
      setTimeout(() => ghost.remove(), 0);
    }
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="group relative rounded-xl overflow-hidden bg-black/40 aspect-square cursor-grab active:cursor-grabbing"
    >
      {!signed ? (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/40">
          Loading…
        </div>
      ) : isVideo ? (
        <video
          src={signed}
          muted
          loop
          playsInline
          autoPlay
          className="absolute inset-0 w-full h-full object-cover transition duration-700 group-hover:scale-[1.07]"
        />
      ) : (
        <img
          src={signed}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition duration-700 group-hover:scale-[1.07]"
        />
      )}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ background: "linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.8))" }}
      />
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition">
        <button className="w-6 h-6 rounded-md bg-black/60 backdrop-blur text-white/85 flex items-center justify-center">
          <Heart size={10} />
        </button>
      </div>
    </div>
  );
}

/* ─── Empty ─── */
function BundleEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="relative w-28 h-28 mb-4">
        <div
          className="absolute inset-0 rounded-full border border-dashed border-[rgba(167,139,250,0.22)]"
          style={{ animation: "spin 40s linear infinite" }}
        />
        <div
          className="absolute inset-3 rounded-full border border-dashed border-[rgba(167,139,250,0.15)]"
          style={{ animation: "spin 28s linear infinite reverse" }}
        />
        <div
          className="absolute inset-5 rounded-full flex items-center justify-center"
          style={{
            background: "radial-gradient(circle at 30% 30%, #c4b5fd, #7c3aed 60%, #4c1d95)",
            boxShadow: "0 0 30px rgba(167,139,250,0.5), inset 0 -6px 12px rgba(0,0,0,0.3)",
            animation: "mf-glow-pulse 2.8s ease-in-out infinite",
          }}
        >
          <Sparkles size={22} className="text-white" />
        </div>
      </div>
      <div className="text-[13px] font-semibold text-white/90 mb-1 font-prompt">Bundle results</div>
      <div className="text-[11px] text-white/45 leading-relaxed max-w-[230px] font-prompt">
        ผลลัพธ์จากทุก flow ในชุดนี้จะมารวมที่นี่ ลากภาพไปวางใน input ของ flow ถัดไปได้เลย
      </div>
    </div>
  );
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function formatGroupTime(iso: string): string {
  const d = new Date(iso);
  const t = d.getTime();
  if (!t || Number.isNaN(t)) return "";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYest = startToday - 86_400_000;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (t >= startToday) return `Today ${time}`;
  if (t >= startYest) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`;
}
