/**
 * MobileFlowSelector — Horizontal scrolling pill strip for <xl screens.
 */
import { cn } from "@/lib/utils";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import type { BundleFlow } from "./types";

interface MobileFlowSelectorProps {
  flows: BundleFlow[];
  activeId: string;
  onChange: (id: string) => void;
}

export function MobileFlowSelector({ flows, activeId, onChange }: MobileFlowSelectorProps) {
  const activeIdx = flows.findIndex((f) => f.id === activeId);

  return (
    <div className="fixed top-[56px] left-3 right-3 z-30 rounded-2xl glass-panel px-3 py-2.5">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-[#c4b5fd]">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#c4b5fd]">
            Flows
          </span>
        </div>
        <span className="text-[9px] text-white/35 font-mono">
          {activeIdx + 1}/{flows.length}
        </span>
      </div>

      {/* Scrollable pill row */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {flows.map((f) => (
          <FlowPill key={f.id} flow={f} active={f.id === activeId} onClick={() => onChange(f.id)} />
        ))}
      </div>
    </div>
  );
}

function FlowPill({ flow, active, onClick }: { flow: BundleFlow; active: boolean; onClick: () => void }) {
  const signed = useSignedUrl(flow.thumbnail_url);

  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full transition-all text-[11px] font-semibold",
        active ? "text-white" : "text-white/55 hover:text-white/80"
      )}
      style={active ? {
        background: `linear-gradient(135deg, ${flow.color}30, ${flow.color}15)`,
        border: `1px solid ${flow.color}60`,
        boxShadow: `0 0 18px -4px ${flow.color}90`,
      } : {
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="w-5 h-5 rounded-full overflow-hidden bg-black/40 shrink-0">
        {signed ? (
          <img src={signed} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="flex items-center justify-center w-full h-full text-[10px]">{flow.emoji}</span>
        )}
      </div>
      <span className="truncate max-w-[100px]">{flow.name}</span>
    </button>
  );
}
