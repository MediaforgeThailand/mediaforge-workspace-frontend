/**
 * MobileTopNav — Mobile top navigation (56px fixed)
 * Per handoff v2 mobile spec.
 * LOCKED PROPS: credits, onBack
 */

import { ArrowLeft } from "lucide-react";
import logoIcon from "@/assets/mediaforge-icon.png";

export interface MobileTopNavProps {
  credits: number;
  onBack: () => void;
  rightSlot?: React.ReactNode;
}

export function MobileTopNav({ credits, onBack, rightSlot }: MobileTopNavProps) {
  return (
    <header className="fixed top-0 inset-x-0 h-14 z-30 flex items-center px-4 bg-[hsl(var(--background))]/70 backdrop-blur-xl border-b border-white/[0.06]">
      <button
        onClick={onBack}
        aria-label="Back"
        className="w-9 h-9 -ml-2 rounded-[10px] flex items-center justify-center text-[hsl(var(--text-2))] hover:bg-white/[0.06] transition-colors"
      >
        <ArrowLeft size={18} />
      </button>
      <div className="flex items-center ml-1">
        <img src={logoIcon} alt="MediaForge" className="h-7 w-auto select-none" draggable={false} />
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08]">
        <span className="text-[hsl(var(--brand))]/80 text-[11px] font-bold">✦</span>
        <span className="text-[11px] font-semibold font-mono text-white/70">
          {credits.toLocaleString()}
        </span>
      </div>
      {rightSlot && <div className="ml-2">{rightSlot}</div>}
    </header>
  );
}
