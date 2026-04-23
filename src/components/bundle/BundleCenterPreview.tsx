/**
 * BundleCenterPreview — Center column wrapper that mirrors the HTML mock.
 *
 * Top: FlowSelector (large card grid) — switches the active flow.
 * Mid: bundle chip + active flow chip + Fast queue ETA pill.
 * Bottom: rendered slot for the actual engine preview (PreviewPane).
 *
 * Layout is fixed to live between the 400px config column and the 380px results column.
 */
import { ReactNode } from "react";
import { FlowSelector } from "./FlowSelector";
import type { BundleFlow, FlowTabStyle } from "./types";
import logoIcon from "@/assets/mediaforge-icon.png";

interface BundleCenterPreviewProps {
  flows: BundleFlow[];
  activeFlowId: string;
  activeFlow: BundleFlow;
  onChangeFlow: (id: string) => void;
  flowTabStyle?: FlowTabStyle;
  /** rendered engine preview slots — one mounted per flow, only active visible */
  children: ReactNode;
}

export function BundleCenterPreview({
  flows,
  activeFlowId,
  activeFlow,
  onChangeFlow,
  flowTabStyle = "card",
  children,
}: BundleCenterPreviewProps) {
  return (
    <main
      className="hidden xl:flex fixed flex-col z-20"
      style={{ left: 420, right: 400, top: 40, bottom: 12 }}
    >
      {/* ===== FLOW SELECTOR (top) ===== */}
      <div className="shrink-0 mb-3">
        <FlowSelector
          flows={flows}
          activeId={activeFlowId}
          onChange={onChangeFlow}
          style={flowTabStyle}
        />
      </div>

      {/* ===== Bundle chip + active flow chip + Fast queue pill ===== */}
      <div className="shrink-0 flex items-center gap-2 py-1 mb-2">
        <div className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
          <img
            src={logoIcon}
            alt="MediaForge"
            className="w-[22px] h-[22px] object-contain"
            draggable={false}
            style={{ filter: "drop-shadow(0 0 6px rgba(167,139,250,0.45))" }}
          />
          <span className="text-[11.5px] font-bold text-white/85">MediaForge</span>
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
            style={{
              background: "rgba(167,139,250,0.1)",
              border: "1px solid rgba(167,139,250,0.18)",
            }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="#c4b5fd">
              <path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
            </svg>
            <span className="text-[9px] font-bold tracking-wider uppercase text-[#c4b5fd]">
              Novice
            </span>
          </div>
        </div>

        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{
            background: `${activeFlow.color}1a`,
            border: `1px solid ${activeFlow.color}33`,
          }}
        >
          <span className="text-[12px]">{activeFlow.emoji}</span>
          <span
            className="text-[10.5px] font-bold tracking-wider uppercase truncate max-w-[160px]"
            style={{ color: activeFlow.color }}
          >
            {activeFlow.name}
          </span>
        </div>

        <div className="flex-1" />
      </div>

      {/* ===== Engine preview slot ===== */}
      <div className="flex-1 min-h-0 relative">
        {children}
      </div>
    </main>
  );
}
