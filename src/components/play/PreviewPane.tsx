import { useState, useEffect } from 'react';
import { Star, Flame, Eye, Grid3x3, Sparkles } from 'lucide-react';
import MediaThumbnail, { isVideoUrl } from '@/components/MediaThumbnail';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { ResultsView, type RunGroup } from './ResultsView';

/**
 * PreviewPane (Desktop)
 * 3-column layout:
 *   [ Config 400px ][ Preview flex ][ Results 380px (xl≥1280) ]
 */

export type FlowState = Record<string, unknown>;

export interface FlowResult {
  id: string;
  url?: string;
  label?: string;
  createdAt: string;
}

export interface PreviewPaneProps {
  flowId: string;
  state: FlowState;
  results: FlowResult[] | null;
  exampleResults?: FlowResult[] | null;
  runGroups?: RunGroup[];
  flowName?: string;
  flowDescription?: string;
  isRunning: boolean;
  activeTab: 'preview' | 'results';
  setActiveTab: (t: 'preview' | 'results') => void;
  /** Creator info shown in the top chip (real data, not mockup). */
  creatorName?: string;
  creatorAvatarUrl?: string | null;
  creatorRank?: string | null;
  /**
   * When true, render in a relative full-size container (used by Bundle pages
   * that already provide their own outer chrome) instead of the fixed 3-column
   * positioning used on the standalone Play Flow page.
   * Also hides the redundant top chrome row (Creator/Difficulty/Fast queue).
   */
  inline?: boolean;
}

export function PreviewPane({
  results, exampleResults, runGroups, flowName, flowDescription, isRunning, activeTab, setActiveTab,
  creatorName, creatorAvatarUrl, creatorRank,
  inline = false,
}: PreviewPaneProps) {
  const resultList = results ?? [];
  const exampleList = exampleResults ?? [];
  // On desktop (non-inline), the right-side ResultsPanel handles results.
  // The center column should ALWAYS show the flow preview (example outputs).
  const forcePreview = !inline;
  const effectiveTab: 'preview' | 'results' = forcePreview ? 'preview' : activeTab;
  const list = effectiveTab === 'preview'
    ? (exampleList.length > 0 ? exampleList : resultList)
    : resultList;
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (activeIdx >= list.length) setActiveIdx(0);
  }, [list.length, activeIdx, effectiveTab]);

  const activeUrl = list[activeIdx]?.url;

  const rootClass = inline
    ? "relative w-full h-full flex flex-col overflow-hidden"
    : "fixed left-[420px] right-3 xl:right-[400px] top-[60px] bottom-3 flex flex-col overflow-hidden pr-1";

  return (
    <main className={rootClass}>
      {inline ? null : (
      <div className="shrink-0 flex items-center gap-2.5 flex-wrap mb-3 py-1">
        <CreatorChip name={creatorName} avatarUrl={creatorAvatarUrl} rank={creatorRank} />
        <DifficultyChip level="medium" />
        <div className="xl:hidden">
          <TabSwitcher tab={activeTab} setTab={setActiveTab} hasResults={resultList.length > 0} />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[hsl(var(--brand)/0.08)] border border-[hsl(var(--brand)/0.2)] text-[11px] font-semibold text-[hsl(var(--accent-success))]">
          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-success))] animate-pulse" />
          Fast queue · ~45s
        </div>
      </div>
      )}


      {(effectiveTab === 'preview') ? (
        <div className="flex-1 min-h-0 flex flex-col items-center gap-3 pt-0">
          {/* Main preview — top-aligned, NO heart/download */}
          <div
            className="relative rounded-[20px] border border-white/[0.06] overflow-hidden shrink-0"
            style={{ aspectRatio: '4/5', height: 'min(68vh, 560px)' }}
          >
            <PreviewMedia url={activeUrl} isRunning={isRunning} fitMode={list.length > 0 && resultList.length > 0 ? 'contain' : 'cover'} />

            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 bg-black/50 backdrop-blur-md rounded-full text-[10px] text-white/85 font-semibold border border-white/[0.06]">
              <Sparkles size={10} className="text-[hsl(var(--brand))]" />
              {resultList.length > 0 ? 'Your output' : 'Example output'}
            </div>

            {list.length > 0 && (
              <div className="absolute left-3 bottom-3 text-[11px] text-white/55 font-mono">
                {activeIdx + 1} / {list.length}
              </div>
            )}
          </div>

          {/* Thumbnail strip — labeled, horizontal, no scrollbar, 58×58 */}
          {list.length > 0 && (
            <div className="shrink-0 flex gap-2 overflow-x-auto scrollbar-hide max-w-full px-1">
              {list.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => setActiveIdx(i)}
                  className="flex flex-col items-center gap-1 shrink-0 group"
                >
                  <div
                    className="w-[58px] h-[58px] rounded-[12px] overflow-hidden bg-black/40 transition"
                    style={{
                      outline: i === activeIdx
                        ? '2px solid hsl(var(--brand) / 0.8)'
                        : '1px solid rgba(255,255,255,0.06)',
                      outlineOffset: i === activeIdx ? 2 : 0,
                      opacity: i === activeIdx ? 1 : 0.65,
                    }}
                  >
                    <ThumbMedia url={r.url} />
                  </div>
                  {r.label && (
                    <span className="text-[9.5px] text-white/55 group-hover:text-white/85 transition truncate max-w-[68px]">
                      {r.label}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {(flowName || flowDescription) && (
            <div className="shrink-0 space-y-1 pt-1 self-stretch">
              {flowName && (
                <h2 className="text-[16px] font-bold text-foreground font-prompt leading-tight">
                  {flowName}
                </h2>
              )}
              {flowDescription && (
                <p className="text-[12.5px] text-[hsl(var(--text-2))] leading-snug font-prompt line-clamp-3">
                  {flowDescription}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <ResultsView
            groups={runGroups ?? []}
            isRunning={isRunning}
          />
        </div>
      )}
    </main>
  );
}

const RANK_LABELS: Record<string, string> = {
  novice: 'Novice',
  rising_star: 'Rising Star',
  top_rated: 'Top Rated',
  elite: 'Elite',
};

function CreatorChip({
  name,
  avatarUrl,
  rank,
}: {
  name?: string;
  avatarUrl?: string | null;
  rank?: string | null;
}) {
  const displayName = name?.trim() || 'Creator';
  const initial = displayName.charAt(0).toUpperCase();
  const rankKey = (rank || 'novice').toLowerCase().replace(/\s+/g, '_');
  const rankLabel = RANK_LABELS[rankKey] ?? RANK_LABELS.novice;
  return (
    <div className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
      <div className="w-[22px] h-[22px] rounded-full overflow-hidden flex items-center justify-center text-[10px] font-extrabold text-white bg-gradient-to-br from-[#a855f7] to-[#7c3aed]">
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </div>
      <span className="text-[11.5px] font-bold text-foreground">{displayName}</span>
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[hsl(var(--brand)/0.1)] border border-[hsl(var(--brand)/0.18)]">
        <Star size={9} className="text-[#c4b5fd]" />
        <span className="text-[9px] font-bold tracking-wider uppercase text-[#c4b5fd]">{rankLabel}</span>
      </div>
    </div>
  );
}

function DifficultyChip({ level }: { level: 'easy' | 'medium' | 'hard' }) {
  const cfg = {
    easy:   { label: 'Easy',   color: '#c4b5fd', bg: 'rgba(196,181,253,0.08)' },
    medium: { label: 'Medium', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
    hard:   { label: 'Hard',   color: '#c15173', bg: 'rgba(193,81,115,0.1)' },
  }[level];
  return (
    <div
      className="flex items-center gap-1 px-2.5 py-1 rounded-full"
      style={{ background: cfg.bg, border: `1px solid ${cfg.color}33` }}
    >
      <Flame size={10} style={{ color: cfg.color }} />
      <span className="text-[10.5px] font-bold tracking-wider uppercase" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
    </div>
  );
}

function TabSwitcher({
  tab, setTab, hasResults,
}: { tab: 'preview' | 'results'; setTab: (t: 'preview' | 'results') => void; hasResults: boolean }) {
  const items = [
    { k: 'preview' as const, l: 'Preview', icon: Eye },
    { k: 'results' as const, l: 'Results', icon: Grid3x3 },
  ];
  return (
    <div className="flex gap-0.5 p-[3px] rounded-[10px] bg-white/[0.04] border border-white/[0.06]">
      {items.map(t => {
        const Ic = t.icon;
        const active = tab === t.k;
        return (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[11.5px] font-semibold transition',
              active ? 'bg-white/[0.08] text-foreground' : 'text-[hsl(var(--text-dim))] hover:text-foreground',
            ].join(' ')}
          >
            <Ic size={12} />
            {t.l}
            {t.k === 'results' && hasResults && (
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-success))] animate-pulse" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function PreviewMedia({
  url,
  isRunning,
  fitMode = 'contain',
}: {
  url?: string;
  isRunning?: boolean;
  fitMode?: 'contain' | 'cover';
}) {
  const signed = useSignedUrl(url);
  if (!url) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-[hsl(var(--text-faint))] text-[13px]">
          {isRunning ? 'Generating…' : ''}
        </div>
      </div>
    );
  }
  if (!signed) {
    return <div className="absolute inset-0 flex items-center justify-center text-[hsl(var(--text-faint))] text-[12px]">Loading…</div>;
  }
  if (isVideoUrl(signed)) {
    return (
      <video
        src={signed}
        controls
        autoPlay
        loop
        playsInline
        className={`absolute inset-0 w-full h-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
      />
    );
  }
  return (
    <img
      src={signed}
      alt="Generated preview"
      className={`absolute inset-0 w-full h-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
    />
  );
}

function ThumbMedia({ url }: { url?: string }) {
  const signed = useSignedUrl(url);
  return <MediaThumbnail url={signed} className="w-full h-full object-cover" hoverPlay />;
}
