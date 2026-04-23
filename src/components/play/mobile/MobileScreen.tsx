import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Grid3x3 } from "lucide-react";
import { MobileTopNav } from "./MobileTopNav";
import { MobileActionBar } from "./MobileActionBar";
import { MobileResultsView } from "./MobileResultsView";
import { DifficultyBadge, type DifficultyLevel } from "@/components/DifficultyBadge";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import type { RunGroup } from "@/components/play/ResultsView";

export interface MobilePreviewItem {
  url: string;
  type?: "image" | "video";
}

export interface MobileScreenProps {
  flowName: string;
  flowDescription?: string;
  credits: number;
  results: MobilePreviewItem[];
  exampleOutputs: MobilePreviewItem[];
  runGroups?: RunGroup[];
  isRunning: boolean;
  generateDisabled: boolean;
  requiredTotal?: number;
  requiredFilled?: number;
  priceLabel?: string;
  difficulty?: DifficultyLevel;
  creatorName?: string;
  creatorAvatarUrl?: string | null;
  autoSwitchToResults?: boolean;
  onConfigure: () => void;
  onGenerate: () => void;
  rightSlot?: React.ReactNode;
}

const VIDEO_EXTS = /\.(mp4|webm|mov|m4v|avi)(\?|$)/i;
function isVideoUrl(url: string, hint?: "image" | "video") {
  if (hint) return hint === "video";
  return VIDEO_EXTS.test(url);
}

export function MobileScreen({
  flowName,
  flowDescription,
  credits,
  results,
  exampleOutputs,
  runGroups,
  isRunning,
  generateDisabled,
  requiredTotal,
  requiredFilled,
  priceLabel,
  difficulty = "easy",
  creatorName,
  creatorAvatarUrl,
  autoSwitchToResults = false,
  onConfigure,
  onGenerate,
  rightSlot,
}: MobileScreenProps) {
  const navigate = useNavigate();
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<"preview" | "results">("preview");

  const hasResults = results.length > 0;

  useEffect(() => {
    if (autoSwitchToResults && activeTab === "preview") setActiveTab("results");
  }, [autoSwitchToResults, activeTab]);

  const items: MobilePreviewItem[] = useMemo(() => {
    if (activeTab === "results") return results;
    return exampleOutputs.length > 0 ? exampleOutputs : results;
  }, [activeTab, results, exampleOutputs]);

  const showingExample = activeTab === "preview" && exampleOutputs.length > 0;
  const current = items[Math.min(activeIdx, Math.max(items.length - 1, 0))];

  const handleBack = () => {
    if (window.history.length > 2) navigate(-1);
    else navigate("/app/home");
  };

  const initial = (creatorName ?? "M").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen w-full relative overflow-hidden">
      <MobileTopNav credits={credits} onBack={handleBack} rightSlot={rightSlot} />

      <main className="pt-[68px] pb-[92px] px-3 max-w-[440px] mx-auto">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
            {creatorAvatarUrl ? (
              <img
                src={creatorAvatarUrl}
                alt={creatorName ?? "Creator"}
                className="w-5 h-5 rounded-full object-cover"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-[hsl(var(--brand)/0.25)] text-[hsl(var(--brand))] text-[9px] font-bold flex items-center justify-center">
                {initial}
              </div>
            )}
            <span className="text-[10px] font-semibold text-[hsl(var(--text-2))] max-w-[120px] truncate font-prompt">
              {creatorName ?? "MediaForge"}
            </span>
          </div>
          <DifficultyBadge level={difficulty} size="sm" />
        </div>

        <h1 className="text-[18px] font-bold text-foreground leading-tight font-prompt line-clamp-2">
          {flowName}
        </h1>
        {flowDescription && (
          <p className="mt-1 text-[12px] text-[hsl(var(--text-2))] leading-snug font-prompt line-clamp-2">
            {flowDescription}
          </p>
        )}

        <div className="mt-3 mb-2 grid grid-cols-2 gap-1 p-1 rounded-full bg-white/[0.04] border border-white/[0.06] w-full">
          {([
            { k: "preview" as const, l: "Preview", Icon: Eye },
            { k: "results" as const, l: "Results", Icon: Grid3x3 },
          ]).map(({ k, l, Icon }) => {
            const active = activeTab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setActiveTab(k);
                  setActiveIdx(0);
                }}
                className={[
                  "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-semibold transition-all w-full",
                  active
                    ? "bg-[hsl(var(--brand)/0.18)] text-foreground border border-[hsl(var(--brand)/0.35)] shadow-[0_0_12px_hsl(var(--brand)/0.25)]"
                    : "text-[hsl(var(--text-2))] hover:text-foreground border border-transparent",
                ].join(" ")}
              >
                <Icon size={13} />
                {l}
                {k === "results" && hasResults && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-success))] animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        {activeTab === "results" ? (
          <MobileResultsView groups={runGroups ?? []} isRunning={isRunning} />
        ) : (
          <>
            <div
              className="relative overflow-hidden rounded-[22px] w-full"
              style={{
                aspectRatio: "4 / 5",
                background: "radial-gradient(ellipse at center, #0f0a1a 0%, #050308 100%)",
              }}
            >
              {current ? (
                isVideoUrl(current.url, current.type) ? (
                  <video
                    key={current.url}
                    src={current.url}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <img
                    key={current.url}
                    src={current.url}
                    alt="Preview"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[hsl(var(--text-faint))] text-xs">
                  {isRunning ? "Generating…" : "ตัวอย่างผลงาน"}
                </div>
              )}
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md text-[10px] text-white/85 font-semibold border border-white/[0.08]">
                {showingExample ? "Example output" : "Result"}
              </div>
            </div>

            {items.length > 1 && (
              <div className="flex gap-2 overflow-x-auto mt-3 scrollbar-hide pb-1">
                {items.slice(0, 8).map((item, i) => {
                  const active = i === activeIdx;
                  return (
                    <button
                      key={`${item.url}-${i}`}
                      onClick={() => setActiveIdx(i)}
                      className="w-16 h-16 rounded-[12px] shrink-0 overflow-hidden transition-all"
                      style={{
                        opacity: active ? 1 : 0.55,
                        outline: active ? "2px solid hsl(var(--brand) / 0.85)" : "none",
                        outlineOffset: 2,
                      }}
                    >
                      {isVideoUrl(item.url, item.type) ? (
                        <video src={item.url} muted playsInline className="w-full h-full object-cover" />
                      ) : (
                        <img src={item.url} alt="" className="w-full h-full object-cover" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      <MobileActionBar
        onConfigureClick={onConfigure}
        onGenerate={onGenerate}
        isRunning={isRunning}
        disabled={generateDisabled}
        requiredTotal={requiredTotal}
        requiredBadgeCount={
          requiredTotal !== undefined && requiredFilled !== undefined
            ? requiredTotal - requiredFilled
            : undefined
        }
        priceLabel={priceLabel}
      />
    </div>
  );
}

function MobileResultCard({ item, index }: { item: MobilePreviewItem; index: number }) {
  const signedUrl = useSignedUrl(item.url);
  const [aspectRatio, setAspectRatio] = useState<number>(1);
  const isVideo = !!signedUrl && isVideoUrl(signedUrl, item.type);

  return (
    <div className="relative overflow-hidden rounded-[22px] w-full border border-white/[0.06] bg-black/30">
      <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md text-[10px] text-white/85 font-semibold border border-white/[0.08]">
        Result {index + 1}
      </div>
      <div className="relative w-full" style={{ aspectRatio }}>
        {!signedUrl ? (
          <div className="absolute inset-0 flex items-center justify-center text-[hsl(var(--text-faint))] text-xs">
            Loading…
          </div>
        ) : isVideo ? (
          <video
            src={signedUrl}
            controls
            playsInline
            className="absolute inset-0 w-full h-full object-contain bg-black"
            onLoadedMetadata={(e) => {
              const { videoWidth, videoHeight } = e.currentTarget;
              if (videoWidth > 0 && videoHeight > 0) setAspectRatio(videoWidth / videoHeight);
            }}
          />
        ) : (
          <img
            src={signedUrl}
            alt={`Result ${index + 1}`}
            className="absolute inset-0 w-full h-full object-contain bg-black"
            onLoad={(e) => {
              const { naturalWidth, naturalHeight } = e.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) setAspectRatio(naturalWidth / naturalHeight);
            }}
          />
        )}
      </div>
    </div>
  );
}
