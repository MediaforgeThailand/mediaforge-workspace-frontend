/**
 * ResultsPanel — Desktop right-side column for PlayFlow.
 * Glass capsule list with ambient drift glow, filter chips, drag-to-reuse outputs.
 *
 * Layout: 3-column desktop shell
 *   [ Config 400px ][ Preview flex ][ Results 380px ]
 */
import { useMemo, useState } from "react";
import {
  Grid3x3,
  Sparkles,
  Download,
  MoreHorizontal,
  ArrowDownUp,
  LayoutGrid,
} from "lucide-react";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { downloadMedia } from "@/lib/downloadMedia";
import { isVideoUrl } from "@/components/MediaThumbnail";
import type { RunGroup, RunResultItem } from "./ResultsView";

export interface ResultsPanelProps {
  runGroups: RunGroup[];
  isRunning: boolean;
}

type FilterId = "all" | "today" | "image";

const FILTERS: ReadonlyArray<{ id: FilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "image", label: "Image" },
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatGroupTime(iso: string): string {
  const d = new Date(iso);
  const t = d.getTime();
  if (!t || Number.isNaN(t)) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (t >= startOfToday) return `Today ${time}`;
  if (t >= startOfYesterday) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`;
}

export function ResultsPanel({ runGroups, isRunning }: ResultsPanelProps) {
  const [filter, setFilter] = useState<FilterId>("all");

  const filteredGroups = useMemo(() => {
    if (filter === "today") {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      return runGroups.filter((g) => new Date(g.createdAt).getTime() >= startOfToday.getTime());
    }
    if (filter === "image") {
      return runGroups.filter((g) =>
        g.outputs.every((o) => o.type !== "video" && !isVideoUrl(o.url || "")),
      );
    }
    return runGroups;
  }, [runGroups, filter]);

  const filterCounts: Record<FilterId, number> = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return {
      all: runGroups.reduce((a, g) => a + g.outputs.length, 0),
      today: runGroups
        .filter((g) => new Date(g.createdAt).getTime() >= startOfToday.getTime())
        .reduce((a, g) => a + g.outputs.length, 0),
      image: runGroups.reduce(
        (a, g) =>
          a + g.outputs.filter((o) => o.type !== "video" && !isVideoUrl(o.url || "")).length,
        0,
      ),
    };
  }, [runGroups]);

  const totalRuns = runGroups.length;
  const totalOutputs = filterCounts.all;

  return (
    <aside
      className="fixed right-3 top-[60px] bottom-3 z-30 hidden xl:flex w-[380px] min-w-[340px] flex-col rounded-3xl glass-panel overflow-hidden"
      style={{
        boxShadow:
          "0 40px 80px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(167,139,250,0.04)",
      }}
    >
      {/* Ambient violet drift glows */}
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
        <ResultsHeader totalRuns={totalRuns} totalOutputs={totalOutputs} isRunning={isRunning} />
        <ResultsFilters active={filter} onChange={setFilter} counts={filterCounts} />
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-3 space-y-3">
          {filteredGroups.length === 0 && !isRunning ? (
            <EmptyResults />
          ) : (
            filteredGroups.map((g, i) => (
              <RunCapsule key={g.id} group={g} delay={i * 60} />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

/* ─── Header ─── */
function ResultsHeader({
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
            <div className="text-[13px] font-bold leading-tight font-prompt">ผลงานของคุณ</div>
            <div className="text-[10.5px] text-white/45 font-mono mt-0.5">
              {totalRuns} runs · {totalOutputs} ชิ้น
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            title="Sort"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.06] transition"
          >
            <ArrowDownUp size={12} />
          </button>
          <button
            title="Toggle view"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.06] transition"
          >
            <LayoutGrid size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Filter chips ─── */
function ResultsFilters({
  active,
  onChange,
  counts,
}: {
  active: FilterId;
  onChange: (id: FilterId) => void;
  counts: Record<FilterId, number>;
}) {
  return (
    <div className="shrink-0 px-4 py-2.5 border-b border-white/[0.04]">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {FILTERS.map((f) => {
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
function RunCapsule({
  group,
  delay,
}: {
  group: RunGroup;
  delay: number;
}) {
  const isMulti = group.outputs.length > 1;
  return (
    <section
      className="relative rounded-2xl p-[1px] anim-fadeInUp"
      style={{
        background:
          "linear-gradient(140deg, rgba(167,139,250,0.35) 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.02) 100%)",
        animationDelay: `${delay}ms`,
      }}
    >
      <div
        className="rounded-2xl p-2.5"
        style={{
          background: "linear-gradient(180deg, rgba(24,20,44,0.9), rgba(14,10,28,0.9))",
        }}
      >
        {/* Header line */}
        <div className="flex items-center justify-between px-1 mb-2">
          <div className="flex items-center gap-1.5 text-[10.5px]">
            <span
              className="w-1.5 h-1.5 rounded-full bg-[#c4b5fd]"
              style={{ boxShadow: "0 0 6px #c4b5fd" }}
            />
            <span className="font-semibold text-white/90">{formatGroupTime(group.createdAt)}</span>
          </div>
          {group.creditsUsed != null && group.creditsUsed > 0 && (
            <span className="text-[9.5px] text-white/40 font-mono">
              {group.creditsUsed.toLocaleString()} credits
            </span>
          )}
        </div>

        {/* Image grid — 1-col if single, else 2-col. Show ALL outputs. */}
        <div className={`grid ${isMulti ? "grid-cols-2" : "grid-cols-1"} gap-1.5`}>
          {group.outputs.map((o, i) => (
            <ResultThumbDraggable
              key={o.id}
              item={o}
              runId={group.id}
              index={i}
            />
          ))}
        </div>

        {/* Tags + actions */}
        <div className="flex items-center justify-between mt-2 px-1">
          <div className="flex gap-1 flex-wrap">
            {group.meta?.categories?.slice(0, 2).map((t) => (
              <span
                key={t}
                className="text-[9px] font-semibold text-white/55 px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]"
              >
                {t}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() =>
                group.outputs.forEach((o, i) =>
                  setTimeout(
                    () => downloadMedia(o.url, `mediaforge-${group.id}-${i + 1}`),
                    i * 200,
                  ),
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

/* ─── Draggable thumbnail ─── */
function ResultThumbDraggable({
  item,
  runId,
  index,
}: {
  item: RunResultItem;
  runId: string;
  index: number;
}) {
  const signed = useSignedUrl(item.url);
  const isVideo = !!signed && (item.type === "video" || isVideoUrl(signed));

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/x-mf-result",
      JSON.stringify({ url: item.url, runId, itemId: item.id }),
    );
    e.dataTransfer.effectAllowed = "copy";
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
      {/* Per-image download — appears on hover */}
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            downloadMedia(item.url, `mediaforge-${runId}-${index + 1}`);
          }}
          aria-label="Download this output"
          title="ดาวน์โหลดรูปนี้"
          className="w-6 h-6 rounded-md bg-black/60 backdrop-blur flex items-center justify-center hover:bg-black/80 transition text-white/85 hover:text-white"
        >
          <Download size={11} />
        </button>
      </div>
    </div>
  );
}

/* ─── Empty state ─── */
function EmptyResults() {
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
        <div
          className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full bg-[#a78bfa]"
          style={{
            boxShadow: "0 0 10px #a78bfa",
            animation: "mf-orbit-a 4s linear infinite",
            marginLeft: -4,
            marginTop: -4,
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-[#c4b5fd]"
          style={{
            boxShadow: "0 0 8px #c4b5fd",
            animation: "mf-orbit-b 5.5s linear infinite",
            marginLeft: -3,
            marginTop: -3,
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 w-1 h-1 rounded-full bg-[#ddd6fe]"
          style={{
            boxShadow: "0 0 6px #ddd6fe",
            animation: "mf-orbit-c 7s linear infinite",
            marginLeft: -2,
            marginTop: -2,
          }}
        />
      </div>
      <div className="text-[13px] font-semibold text-white/90 mb-1 font-prompt">
        พื้นที่ของผลงานคุณ
      </div>
      <div className="text-[11px] text-white/45 leading-relaxed max-w-[220px] font-prompt">
        กด <span className="text-[#c4b5fd] font-semibold">Generate</span>{" "}
        แล้วผลงานจะปรากฏที่นี่
        <br />
        ลากภาพไปใช้เป็น input ใหม่ได้เลย
      </div>
    </div>
  );
}
