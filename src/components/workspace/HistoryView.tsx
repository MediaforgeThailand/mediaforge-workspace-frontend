/**
 * Generation history — chronological list of every workspace_run_node
 * job the signed-in user has launched, regardless of whether it
 * finished, failed, or got swept by the stuck-job cron.
 *
 * Why this view exists:
 *   • Workspace V2 runs everything as a background job
 *     (workspace_generation_jobs). Until now those jobs were only
 *     visible while the source canvas tab was open — close the tab
 *     and the user lost the result. This page is the "ground" the
 *     async system needed to be useful: the user can submit a gen,
 *     close the tab, come back later, and find their image / video /
 *     3D model here.
 *   • Realtime subscription on INSERT prepends new rows live so a
 *     gen kicked off in another tab also shows up here without a
 *     refresh.
 *
 * Implementation notes:
 *   • RLS policy on workspace_generation_jobs already restricts
 *     `auth.uid() = user_id` for SELECT, so this query needs no
 *     server-side filter — Postgres + Realtime do it for us.
 *   • Pagination is offset-based with a 50-row page size. Switching
 *     to keyset (`created_at < cursor`) would be cheaper on a deeply
 *     scrolled feed but the index `(user_id, created_at DESC)`
 *     already makes offset cheap in practice.
 *   • The card grid intentionally renders even failed / cancelled
 *     jobs (greyed out) so the user can spot a refunded charge
 *     without having to hunt through credit_transactions.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Image as ImageIcon,
  Film,
  Music,
  Box,
  ExternalLink,
  Download,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

type JobRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  canvas_id: string | null;
  node_id: string | null;
  node_type: string;
  provider: string | null;
  model: string | null;
  status: string;
  attempts: number;
  request: Record<string, unknown> | null;
  result: {
    url?: string;
    type?: string;
    text?: string;
    provider_meta?: { model_url?: string };
  } | null;
  error: string | null;
  last_error: string | null;
  credits_charged: number;
  credits_refunded: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

const PROVIDER_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  banana:    ImageIcon,
  openai:    ImageIcon,
  seedream:  ImageIcon,
  kling:     Film,
  seedance:  Film,
  google_tts: Music,
  gemini_tts: Music,
  hyper3d:   Box,
  tripo3d:   Box,
};

const STATUS_CHIP: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  completed: { label: "Completed",  cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",  icon: CheckCircle2 },
  failed:    { label: "Failed",     cls: "bg-red-500/15 text-red-300 ring-red-500/30",              icon: XCircle },
  permanent_failed: { label: "Failed", cls: "bg-red-500/15 text-red-300 ring-red-500/30",          icon: XCircle },
  running:   { label: "Running…",   cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30",       icon: Loader2 },
  queued:    { label: "Queued",     cls: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",          icon: Clock },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function summariseRequest(job: JobRow): string {
  const params = (job.request?.params ?? {}) as Record<string, unknown>;
  const prompt = String(params.prompt ?? params.system_prompt ?? "").trim();
  if (prompt) return prompt.length > 180 ? prompt.slice(0, 180) + "…" : prompt;
  return job.model ?? job.node_type;
}

export default function HistoryView({
  onOpenCanvas,
}: {
  onOpenCanvas?: (canvasId: string, nodeId: string | null) => void;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<"all" | "completed" | "failed" | "running">("all");

  const fetchPage = useCallback(
    async (offset: number) => {
      if (!user) return;
      let q = supabase
        .from("workspace_generation_jobs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (filter === "completed") q = q.eq("status", "completed");
      else if (filter === "running") q = q.in("status", ["queued", "running"]);
      else if (filter === "failed") q = q.in("status", ["failed", "permanent_failed"]);

      const { data, error } = await q;
      if (error) {
        toast.error(`History load failed: ${error.message}`);
        return;
      }
      const next = (data ?? []) as JobRow[];
      setRows((prev) => (offset === 0 ? next : [...prev, ...next]));
      setHasMore(next.length === PAGE_SIZE);
    },
    [user, filter],
  );

  // Initial + filter-change reload.
  useEffect(() => {
    setLoading(true);
    setRows([]);
    setHasMore(true);
    void fetchPage(0).finally(() => setLoading(false));
  }, [fetchPage]);

  // Realtime: prepend new rows + patch updates in-place. INSERT and
  // UPDATE both pass through the same RLS gate, so the user only ever
  // gets their own jobs even though the channel is global.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("workspace-job-history")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "workspace_generation_jobs",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as JobRow;
          setRows((prev) => {
            // De-dup in case the catch-up fetch races with the
            // realtime event.
            if (prev.some((r) => r.id === row.id)) return prev;
            return [row, ...prev];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "workspace_generation_jobs",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as JobRow;
          setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const grouped = useMemo(() => {
    const out: Array<{ label: string; items: JobRow[] }> = [];
    let bucket: { label: string; items: JobRow[] } | null = null;
    for (const row of rows) {
      const label = formatBucket(row.created_at);
      if (!bucket || bucket.label !== label) {
        bucket = { label, items: [] };
        out.push(bucket);
      }
      bucket.items.push(row);
    }
    return out;
  }, [rows]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/5 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Generation history</h1>
          <p className="text-xs text-zinc-500">
            Every gen you've launched — close a tab and come back, your work is here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FilterPill label="All"       active={filter === "all"}       onClick={() => setFilter("all")} />
          <FilterPill label="Done"      active={filter === "completed"} onClick={() => setFilter("completed")} />
          <FilterPill label="Running"   active={filter === "running"}   onClick={() => setFilter("running")} />
          <FilterPill label="Failed"    active={filter === "failed"}    onClick={() => setFilter("failed")} />
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setRows([]);
              setHasMore(true);
              void fetchPage(0).finally(() => setLoading(false));
            }}
            className="ml-1 rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
            title="Refresh"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-zinc-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-6 pb-12">
            {grouped.map((g) => (
              <section key={g.label} className="flex flex-col gap-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  {g.label}
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {g.items.map((row) => (
                    <JobCard key={row.id} job={row} onOpenCanvas={onOpenCanvas} />
                  ))}
                </div>
              </section>
            ))}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={() => void fetchPage(rows.length)}
                  className="rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const FilterPill = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-full px-3 py-1 text-[12px] transition-colors",
      active
        ? "bg-white/[0.10] text-zinc-50 ring-1 ring-inset ring-white/10"
        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
    )}
  >
    {label}
  </button>
);

const EmptyState = () => (
  <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-zinc-500">
    <ImageIcon className="h-8 w-8 text-zinc-600" />
    <div className="text-sm">No generations yet</div>
    <div className="max-w-xs text-xs text-zinc-600">
      Run any image / video / 3D node and your generations will land here automatically.
    </div>
  </div>
);

const JobCard = ({
  job,
  onOpenCanvas,
}: {
  job: JobRow;
  onOpenCanvas?: (canvasId: string, nodeId: string | null) => void;
}) => {
  const status = STATUS_CHIP[job.status] ?? STATUS_CHIP.queued;
  const StatusIcon = status.icon;
  const ProviderIcon = job.provider ? PROVIDER_ICON[job.provider] ?? ImageIcon : ImageIcon;

  const previewUrl = job.result?.url;
  const isImage = job.result?.type === "image" && previewUrl;
  const isVideo = job.result?.type === "video" && previewUrl;
  const is3D = !!job.result?.provider_meta?.model_url;

  const errorMsg = job.error ?? job.last_error;
  const summary = summariseRequest(job);
  const refundedNote =
    job.credits_refunded > 0
      ? `${job.credits_refunded} credit${job.credits_refunded === 1 ? "" : "s"} refunded`
      : null;

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-white/5 bg-white/[0.03] transition-colors hover:bg-white/[0.05]">
      {/* Preview */}
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-black/40">
        {isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={summary}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
        {isVideo && (
          <video
            src={previewUrl}
            className="h-full w-full object-cover"
            muted
            loop
            playsInline
            preload="metadata"
            onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
          />
        )}
        {!isImage && !isVideo && (
          <ProviderIcon className="h-10 w-10 text-zinc-700" />
        )}

        {/* Status chip */}
        <span
          className={cn(
            "absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
            status.cls,
          )}
        >
          <StatusIcon
            className={cn("h-3 w-3", job.status === "running" && "animate-spin")}
          />
          {status.label}
        </span>

        {/* 3D badge */}
        {is3D && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-200 ring-1 ring-inset ring-violet-400/30">
            <Box className="h-3 w-3" /> 3D
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1.5 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <ProviderIcon className="h-3 w-3" />
          <span className="truncate">{job.model ?? job.node_type}</span>
          <span className="ml-auto">{formatDate(job.created_at)}</span>
        </div>
        <div
          className="line-clamp-2 text-[12.5px] leading-snug text-zinc-200"
          title={summary}
        >
          {summary}
        </div>
        {errorMsg && job.status !== "completed" && (
          <div className="line-clamp-2 text-[11px] text-red-300/90" title={errorMsg}>
            {errorMsg}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
          <span>
            {job.credits_charged} cr{job.credits_charged === 1 ? "" : "s"}
          </span>
          {refundedNote && (
            <span className="text-emerald-400/80">· {refundedNote}</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10.5px] text-zinc-300 hover:bg-white/[0.10] hover:text-zinc-100"
              title="Open / download"
            >
              <Download className="h-3 w-3" /> Open
            </a>
          )}
          {job.canvas_id && onOpenCanvas && (
            <button
              type="button"
              onClick={() => onOpenCanvas(job.canvas_id!, job.node_id)}
              className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10.5px] text-zinc-300 hover:bg-white/[0.10] hover:text-zinc-100"
              title="Open in space"
            >
              <ExternalLink className="h-3 w-3" /> Space
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

function formatBucket(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) return "Earlier this week";
  if (diffDays < 30) return "Earlier this month";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}
