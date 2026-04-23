/**
 * FlowSelector — Desktop grid of flow tabs for the Bundle page.
 * Supports 3 visual styles: card (default), pill, segmented.
 */
import { cn } from "@/lib/utils";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import type { BundleFlow, FlowTabStyle } from "./types";

interface FlowSelectorProps {
  flows: BundleFlow[];
  activeId: string;
  onChange: (id: string) => void;
  style?: FlowTabStyle;
}

export function FlowSelector({ flows, activeId, onChange, style = "card" }: FlowSelectorProps) {
  const activeIdx = flows.findIndex((f) => f.id === activeId);

  return (
    <div className="shrink-0 mb-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-[#c4b5fd]">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-[#c4b5fd]">
            Flows in Bundle
          </span>
          <span className="text-[9.5px] text-white/35 font-mono">
            · {activeIdx + 1}/{flows.length} · max 4
          </span>
        </div>
      </div>

      {/* Flow grid */}
      <div className="grid grid-cols-4 gap-2 py-1 px-1 -mx-1">
        {flows.map((f) => (
          <FlowTab key={f.id} flow={f} active={f.id === activeId} onClick={() => onChange(f.id)} style={style} />
        ))}
      </div>
    </div>
  );
}

function FlowTab({ flow, active, onClick, style }: { flow: BundleFlow; active: boolean; onClick: () => void; style: FlowTabStyle }) {
  const signed = useSignedUrl(flow.thumbnail_url);

  if (style === "pill") {
    return (
      <button
        onClick={onClick}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 rounded-full transition-all text-[11px] font-semibold",
          active ? "text-white scale-[1.03]" : "text-white/55 hover:text-white/80"
        )}
        style={active ? {
          background: `${flow.color}20`,
          border: `1.5px solid ${flow.color}90`,
          boxShadow: `0 0 18px -4px ${flow.color}90`,
        } : {
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <span>{flow.emoji}</span>
        <span className="truncate">{flow.name}</span>
      </button>
    );
  }

  if (style === "segmented") {
    return (
      <button
        onClick={onClick}
        className={cn(
          "px-3 py-2 text-[11px] font-semibold transition-all border-b-2",
          active
            ? "text-white border-current"
            : "text-white/55 border-transparent hover:text-white/80"
        )}
        style={active ? { color: flow.color, borderColor: flow.color } : undefined}
      >
        {flow.emoji} {flow.name}
      </button>
    );
  }

  // Default: card style (h-76px)
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2.5 h-[76px] rounded-[14px] px-3 py-2.5 transition-all overflow-hidden group",
        active ? "text-white" : "text-white/70 hover:text-white"
      )}
      style={{
        background: active
          ? `linear-gradient(135deg, ${flow.color}18, rgba(255,255,255,0.03))`
          : "rgba(255,255,255,0.03)",
        border: active
          ? `1.5px solid ${flow.color}60`
          : "1px solid rgba(255,255,255,0.06)",
        boxShadow: active
          ? `0 0 32px -8px ${flow.color}, 0 12px 30px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)`
          : "none",
      }}
    >
      {/* Thumbnail */}
      <div className="w-[52px] h-[52px] rounded-[10px] overflow-hidden bg-black/40 shrink-0 relative">
        {signed ? (
          <img src={signed} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[20px]">
            {flow.emoji}
          </div>
        )}
        <span className="absolute bottom-0.5 right-0.5 text-[12px] leading-none drop-shadow-lg">
          {flow.emoji}
        </span>
      </div>

      {/* Name + desc */}
      <div className="min-w-0 flex-1 text-left">
        <div className="text-[11px] font-bold truncate">{flow.name}</div>
        {flow.description && (
          <div className="text-[9px] text-white/45 line-clamp-2 mt-0.5 leading-[1.3]">
            {flow.description}
          </div>
        )}
      </div>

      {/* Active indicator dot */}
      {active && (
        <span
          className="absolute top-2 right-2 w-2 h-2 rounded-full anim-pulseGlow"
          style={{ background: flow.color, boxShadow: `0 0 8px ${flow.color}` }}
        />
      )}
    </button>
  );
}
