/**
 * BundleTopBar — Top navigation for the Bundle Play page.
 * Fixed header with breadcrumb, mobile tab switcher, and user avatar.
 */
import { ArrowLeft, Package, ChevronRight, List, Eye, Grid3x3 } from "lucide-react";
import logoIcon from "@/assets/mediaforge-icon.png";
import { cn } from "@/lib/utils";
import UserAvatarMenu from "@/pages/play-flow/UserAvatarMenu";
import type { BundleFlow, BundleMobileTab } from "./types";

interface BundleTopBarProps {
  bundle: { name: string; id: string };
  activeFlow: BundleFlow;
  mobileTab: BundleMobileTab;
  onChangeMobileTab: (t: BundleMobileTab) => void;
  onBack: () => void;
}

const TAB_ITEMS: { key: BundleMobileTab; label: string; Icon: typeof List }[] = [
  { key: "config", label: "Config", Icon: List },
  { key: "preview", label: "Preview", Icon: Eye },
  { key: "results", label: "Results", Icon: Grid3x3 },
];

export function BundleTopBar({ bundle, activeFlow, mobileTab, onChangeMobileTab, onBack }: BundleTopBarProps) {
  return (
    <header className="fixed top-1 left-3 right-3 h-12 z-40 flex items-center px-3 bg-transparent border-b border-white/[0.06]">
      {/* Back */}
      <button
        onClick={onBack}
        aria-label="Back"
        className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white/60 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:text-white transition shrink-0"
      >
        <ArrowLeft size={14} />
      </button>

      <div className="w-2 shrink-0" />

      {/* Logo */}
      <img
        src={logoIcon}
        alt="MediaForge"
        className="h-5 w-auto select-none shrink-0"
        draggable={false}
        style={{ animation: "mf-glow-pulse 2.8s ease-in-out infinite" }}
      />

      {/* Breadcrumb — hidden on small screens */}
      <div className="hidden md:flex items-center gap-1.5 ml-3 min-w-0">
        <ChevronSep />
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase truncate max-w-[180px]"
          style={{
            background: "rgba(167,139,250,0.1)",
            border: "1px solid rgba(167,139,250,0.2)",
            color: "#c4b5fd",
          }}
        >
          <Package size={10} />
          {bundle.name}
        </span>
        <ChevronSep />
        <span className="text-[11px] text-white/70 font-semibold truncate max-w-[160px]">
          {activeFlow.emoji} {activeFlow.name}
        </span>
      </div>

      <div className="flex-1" />

      {/* Mobile tab switcher — visible below xl */}
      <div className="xl:hidden flex gap-0.5 p-[3px] rounded-[10px] bg-white/[0.04] border border-white/[0.06]">
        {TAB_ITEMS.map((t) => {
          const active = mobileTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onChangeMobileTab(t.key)}
              className={cn(
                "flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-[7px] text-[11px] font-semibold transition",
                active ? "text-white" : "text-white/45 hover:text-white/70"
              )}
              style={active ? {
                background: "linear-gradient(180deg, #8b5cf6, #7c3aed)",
                boxShadow: "0 0 14px -3px rgba(167,139,250,0.6)",
              } : undefined}
            >
              <t.Icon size={12} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="w-2 shrink-0" />

      {/* User avatar w/ dropdown */}
      <UserAvatarMenu />

    </header>
  );
}

function ChevronSep() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
      <path d="M3.5 2L6.5 5L3.5 8" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
