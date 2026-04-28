/**
 * Floating debug panel — bottom-right of the canvas.
 *
 * Timeline of every event the dispatcher emits per Run:
 *   info → resolve → send → recv → success / error
 *
 * Each row is clickable to expand. The expanded body is rendered with
 * a structured view that highlights the things that usually matter
 * (model, ref_image URL, mentioned assets, prompt) — falling back to
 * pretty-printed JSON for any unknown shape.
 */

import { useCallback, useState } from "react";
import {
  Bug,
  Trash2,
  ChevronDown,
  ChevronRight,
  Send,
  ArrowDown,
  AlertTriangle,
  CheckCircle,
  Info,
  Copy,
  ExternalLink,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useDebugLogStore,
  type DebugLogEntry,
  type DebugLogLevel,
} from "@/store/useDebugLogStore";

const ICON: Record<DebugLogLevel, LucideIcon> = {
  info: Info,
  send: Send,
  recv: ArrowDown,
  success: CheckCircle,
  error: AlertTriangle,
};

const COLOR: Record<DebugLogLevel, string> = {
  info: "text-zinc-400",
  send: "text-sky-400",
  recv: "text-violet-400",
  success: "text-emerald-400",
  error: "text-red-400",
};

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-GB", { hour12: false }) +
  "." +
  String(ts % 1000).padStart(3, "0");

const WorkspaceDebugPanel = () => {
  const entries = useDebugLogStore((s) => s.entries);
  const open = useDebugLogStore((s) => s.open);
  const dismissed = useDebugLogStore((s) => s.dismissed);
  const toggle = useDebugLogStore((s) => s.toggle);
  const clear = useDebugLogStore((s) => s.clear);
  const dismiss = useDebugLogStore((s) => s.dismiss);
  const show = useDebugLogStore((s) => s.show);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Dismissed state: panel is hidden, only a tiny floating bug button
  // remains so the operator can bring it back. Persisted across
  // refreshes (see store.partialize).
  if (dismissed) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          show();
        }}
        // Wrap a fixed-position button. h-9 w-9 = 36px target — Apple
        // HIG minimum is 44 but we're tight on canvas real estate;
        // 36 is what the rest of the workspace floating sidebar uses.
        // pointer-events-auto guards against any ancestor that
        // accidentally turns events off.
        className="pointer-events-auto fixed bottom-3 right-3 z-[60] flex h-9 w-9 items-center justify-center rounded-full border border-amber-500/40 bg-zinc-950 text-amber-400 shadow-lg shadow-black/50 transition-colors hover:bg-zinc-900 hover:text-amber-300"
        title="Show debug panel"
        aria-label="Show debug panel"
      >
        <Bug className="h-4 w-4" />
        {entries.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-zinc-950">
            {entries.length > 99 ? "99+" : entries.length}
          </span>
        )}
      </button>
    );
  }

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="pointer-events-auto fixed bottom-3 right-3 z-[60] w-[460px] rounded-md border border-zinc-700 bg-zinc-950/95 text-zinc-200 shadow-xl backdrop-blur">
      {/* Header — always visible. */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-2 py-1.5">
        <button
          type="button"
          onClick={toggle}
          className="flex flex-1 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-300 hover:text-white"
        >
          <Bug className="h-3.5 w-3.5 text-amber-400" />
          Debug
          <span className="font-mono text-[10px] text-zinc-500">
            ({entries.length})
          </span>
        </button>
        {open && entries.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Clear all entries"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={toggle}
          className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", !open && "rotate-180")}
          />
        </button>
        {/* Hide the panel entirely. Brought back via the floating
            bug button rendered in the dismissed-state branch above.
            stopPropagation is defensive — without it a stray click
            handler on an ancestor (the panel root has none today,
            but futures-proofs in case one is added) could swallow
            the dismiss intent. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="rounded p-0.5 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-300"
          title="Hide debug panel"
          aria-label="Hide debug panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="max-h-[60vh] overflow-y-auto">
          {entries.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs italic text-zinc-500">
              No events yet — hit Run on a tool node.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800/70">
              {entries.map((e) => (
                <LogRow
                  key={e.id}
                  entry={e}
                  expanded={expanded.has(e.id)}
                  onToggle={() => toggleExpand(e.id)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── One row + expanded detail ──────────────────────────────────── */

const LogRow = ({
  entry,
  expanded,
  onToggle,
}: {
  entry: DebugLogEntry;
  expanded: boolean;
  onToggle: () => void;
}) => {
  const Icon = ICON[entry.level];
  const hasPayload = entry.payload !== undefined && entry.payload !== null;

  const onCopy = useCallback(
    async (ev: React.MouseEvent) => {
      ev.stopPropagation();
      try {
        await navigator.clipboard.writeText(safeStringify(entry.payload));
        toast.success("Copied to clipboard");
      } catch {
        toast.error("Copy failed");
      }
    },
    [entry.payload],
  );

  return (
    <li className="text-[11px]">
      {/* Whole row is the click target — expands the detail panel. */}
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasPayload}
        className={cn(
          "flex w-full items-start gap-1.5 px-2 py-1.5 text-left",
          hasPayload ? "hover:bg-zinc-900/60" : "opacity-90",
        )}
      >
        <span className="mt-0.5 shrink-0">
          {hasPayload ? (
            expanded ? (
              <ChevronDown className="h-3 w-3 text-zinc-500" />
            ) : (
              <ChevronRight className="h-3 w-3 text-zinc-500" />
            )
          ) : (
            <span className="block h-3 w-3" />
          )}
        </span>
        <Icon className={cn("mt-0.5 h-3 w-3 shrink-0", COLOR[entry.level])} />
        <span className="mt-0.5 shrink-0 font-mono text-[9px] text-zinc-600">
          {fmtTime(entry.ts)}
        </span>
        <span className="flex-1 break-words text-zinc-300">{entry.title}</span>
        {hasPayload && (
          <span
            role="button"
            tabIndex={-1}
            onClick={onCopy}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title="Copy payload as JSON"
          >
            <Copy className="h-3 w-3" />
          </span>
        )}
      </button>

      {expanded && hasPayload && (
        <div className="border-t border-zinc-800/70 bg-zinc-900/40">
          <DetailBody entry={entry} />
        </div>
      )}
    </li>
  );
};

/* ─── Structured detail rendering ────────────────────────────────── */

const DetailBody = ({ entry }: { entry: DebugLogEntry }) => {
  const p = entry.payload as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") {
    return <PreJson value={entry.payload} />;
  }

  // Request body sent to the edge function.
  if (entry.level === "send") {
    return <RequestDetail payload={p} />;
  }

  // Response from the edge function.
  if (entry.level === "recv") {
    return <ResponseDetail payload={p} />;
  }

  // info / success / error — show known fields if any, else JSON.
  return <GenericDetail payload={p} />;
};

const RequestDetail = ({ payload }: { payload: Record<string, unknown> }) => {
  const nodeType = (payload.node_type as string) ?? "—";
  const params = (payload.params as Record<string, unknown>) ?? {};
  const inputs = (payload.inputs as Record<string, unknown>) ?? {};
  const mentioned = (payload.mentioned_assets as Array<Record<string, unknown>>) ?? [];
  const model = String(params.model_name ?? "—");
  const prompt = String(params.prompt ?? "");

  return (
    <div className="px-3 py-2">
      <KvRow label="Endpoint" value="POST workspace-run-node" mono />
      <KvRow label="Node type" value={nodeType} mono />
      <KvRow label="Model" value={model} mono />

      {prompt && (
        <Section label="Prompt">
          <div className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[10.5px] text-zinc-200">
            {prompt}
          </div>
        </Section>
      )}

      <Section label={`Inputs (${Object.keys(inputs).length})`}>
        {Object.keys(inputs).length === 0 ? (
          <Empty>no upstream wires</Empty>
        ) : (
          <ul className="space-y-0.5">
            {Object.entries(inputs).map(([k, v]) => (
              <li key={k} className="flex gap-2 text-[10.5px]">
                <span className="shrink-0 font-mono text-zinc-500">{k}</span>
                <ValueLine value={v} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label={`Mentioned assets (${mentioned.length})`}>
        {mentioned.length === 0 ? (
          <Empty>no @-mentions resolved</Empty>
        ) : (
          <ul className="space-y-1">
            {mentioned.map((m, i) => (
              <li
                key={i}
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10.5px]"
              >
                <div className="flex items-center gap-1.5 text-zinc-200">
                  <span className="font-mono text-emerald-300">@{String(m.label)}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="font-mono text-zinc-500">{String(m.fieldType ?? "—")}</span>
                </div>
                {m.url && <UrlRow url={String(m.url)} />}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label="Full request">
        <PreJson value={payload} />
      </Section>
    </div>
  );
};

const ResponseDetail = ({ payload }: { payload: Record<string, unknown> }) => {
  const type = String(payload.type ?? "—");
  const url = (payload.url as string) ?? "";
  const text = (payload.text as string) ?? "";
  const promptUsed = (payload.prompt_used as string) ?? "";
  const promptSource = (payload.prompt_source as string) ?? "";

  return (
    <div className="px-3 py-2">
      <KvRow label="Type" value={type} mono />
      {promptSource && <KvRow label="Prompt source" value={promptSource} mono />}
      {promptUsed && (
        <Section label="Prompt used">
          <div className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[10.5px] text-zinc-200">
            {promptUsed}
          </div>
        </Section>
      )}
      {url && (
        <Section label="Output URL">
          <UrlRow url={url} preview={type === "image"} />
        </Section>
      )}
      {text && (
        <Section label="Text">
          <div className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[10.5px] text-zinc-200">
            {text}
          </div>
        </Section>
      )}
      <Section label="Full response">
        <PreJson value={payload} />
      </Section>
    </div>
  );
};

const GenericDetail = ({ payload }: { payload: Record<string, unknown> }) => {
  const inputs = payload.inputs as Record<string, unknown> | undefined;
  const mentioned = payload.mentioned as Array<Record<string, unknown>> | undefined;
  const params = payload.params as Record<string, unknown> | undefined;
  const prompt = (payload.prompt as string) ?? (params?.prompt as string) ?? "";
  const model = (payload.model as string) ?? (params?.model_name as string) ?? "";

  return (
    <div className="px-3 py-2">
      {model && <KvRow label="Model" value={model} mono />}
      {payload.node_type && (
        <KvRow label="Node type" value={String(payload.node_type)} mono />
      )}
      {prompt && (
        <Section label="Prompt">
          <div className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[10.5px] text-zinc-200">
            {prompt}
          </div>
        </Section>
      )}
      {inputs && (
        <Section label={`Inputs (${Object.keys(inputs).length})`}>
          {Object.keys(inputs).length === 0 ? (
            <Empty>no upstream wires</Empty>
          ) : (
            <ul className="space-y-0.5">
              {Object.entries(inputs).map(([k, v]) => (
                <li key={k} className="flex gap-2 text-[10.5px]">
                  <span className="shrink-0 font-mono text-zinc-500">{k}</span>
                  <ValueLine value={v} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      {mentioned && (
        <Section label={`Mentions (${mentioned.length})`}>
          {mentioned.length === 0 ? (
            <Empty>none</Empty>
          ) : (
            <ul className="space-y-1">
              {mentioned.map((m, i) => (
                <li
                  key={i}
                  className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10.5px]"
                >
                  <span className="font-mono text-emerald-300">@{String(m.label)}</span>
                  {m.url && <UrlRow url={String(m.url)} />}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      <Section label="Raw">
        <PreJson value={payload} />
      </Section>
    </div>
  );
};

/* ─── Small render helpers ───────────────────────────────────────── */

const KvRow = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex items-baseline gap-2 py-0.5 text-[10.5px]">
    <span className="w-24 shrink-0 text-zinc-500">{label}</span>
    <span className={cn("min-w-0 flex-1 break-all text-zinc-200", mono && "font-mono")}>
      {value}
    </span>
  </div>
);

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <details className="mt-2 group" open>
    <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-300">
      <span className="inline-block w-3 group-open:rotate-90 transition-transform">›</span>
      {label}
    </summary>
    <div className="mt-1 pl-3">{children}</div>
  </details>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] italic text-zinc-600">{children}</div>
);

const ValueLine = ({ value }: { value: unknown }) => {
  if (value == null) return <span className="text-zinc-600">null</span>;
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value)) return <UrlRow url={value} />;
    return <span className="break-all text-zinc-300">{value}</span>;
  }
  return <span className="font-mono text-zinc-300">{JSON.stringify(value)}</span>;
};

const UrlRow = ({ url, preview }: { url: string; preview?: boolean }) => (
  <div className="mt-0.5 flex items-start gap-2">
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex min-w-0 items-center gap-1 break-all font-mono text-[10px] text-sky-400 hover:underline"
    >
      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{url}</span>
    </a>
    {preview && (
      <img
        src={url}
        alt="preview"
        className="h-12 w-12 shrink-0 rounded border border-zinc-800 object-cover"
      />
    )}
  </div>
);

const PreJson = ({ value }: { value: unknown }) => (
  <pre className="max-h-64 overflow-auto rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-[10px] leading-snug text-zinc-300">
    {safeStringify(value)}
  </pre>
);

/**
 * JSON.stringify that won't blow up on circular refs. Caps long strings
 * (URLs / base64) at 240 chars so the panel stays readable.
 */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, val) => {
      if (typeof val === "string" && val.length > 240) return val.slice(0, 240) + "…";
      if (val && typeof val === "object") {
        if (seen.has(val as object)) return "[Circular]";
        seen.add(val as object);
      }
      return val;
    },
    2,
  );
}

export default WorkspaceDebugPanel;
