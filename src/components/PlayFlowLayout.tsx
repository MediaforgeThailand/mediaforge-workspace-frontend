/**
 * PlayFlowLayout.tsx
 *
 * Flexible 2-column layout for the PlayFlow execution page.
 *
 * LAYOUT STRUCTURE (Desktop):
 * ┌──────┬────────────────────────────────────┬──────────────────┐
 * │ Side │  Left Panel (Preview + Gallery)    │  Right Panel     │
 * │ bar  │                                    │  (Config + CTA)  │
 * │ 64px │  flex-1                            │  w-[620px]       │
 * └──────┴────────────────────────────────────┴──────────────────┘
 */

import React, { useState, useCallback, useMemo, type ReactNode } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

/** Format a date string for run grouping */
function formatRunDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
import { downloadMedia } from "@/lib/downloadMedia";
import { DifficultyBadge } from "@/components/DifficultyBadge";
import { motion } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crown,
  Download,
  Heart,
  MoreHorizontal,
  Play,
  Sparkles,
  Star,
  Trophy,
  Upload,
  Coins,
} from "lucide-react";

// ============================================================
// TYPES (exported for consumers)
// ============================================================

export interface FlowCreator {
  name: string;
  avatarUrl?: string;
  rank?: string;
  badgeUrl?: string;
}

export interface FlowMeta {
  title: string;
  description: string;
  thumbnailUrl?: string;
  previewImages?: string[];
  exampleInputs?: string[];
  setupInstructions?: string;
  creator: FlowCreator;
  difficultyLevel?: import("@/components/DifficultyBadge").DifficultyLevel;
}

export interface OutputItem {
  id: string;
  type: "image" | "video";
  url: string;
  label?: string;
  span?: "normal" | "wide";
}

export interface HistoricalRun {
  id: string;
  outputs: OutputItem[];
  createdAt: string;
  creditsUsed: number;
  status: string;
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface ConfigField {
  id: string;
  type: "image-upload" | "textarea" | "select" | "text";
  label: string;
  placeholder?: string;
  options?: SelectOption[];
  defaultValue?: string;
  inline?: boolean;
}

export type PlayFlowTab = "preview" | "results";

export interface PlayFlowLayoutProps {
  flow: FlowMeta;
  outputs: OutputItem[];
  historicalRuns?: HistoricalRun[];
  fields: ConfigField[];
  creditsRemaining?: number;
  processingEstimate?: string;
  onGenerate?: () => void;
  isGenerating?: boolean;
  configPanelOverride?: ReactNode;
  headerDescription?: string;
  navigationSlot?: ReactNode;
  headerRightSlot?: ReactNode;
  activeTab?: PlayFlowTab;
  onTabChange?: (tab: PlayFlowTab) => void;
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Rank config */
const RANK_CONFIG: Record<string, { label: string; icon: typeof Sparkles; color: string; bg: string }> = {
  novice:      { label: "Novice",      icon: Sparkles, color: "text-slate-300",  bg: "bg-slate-500/10" },
  rising_star: { label: "Rising Star", icon: Star,     color: "text-purple-400", bg: "bg-purple-500/10" },
  top_rated:   { label: "Top Rated",   icon: Trophy,   color: "text-pink-400",   bg: "bg-pink-500/10" },
  elite:       { label: "Elite",       icon: Crown,    color: "text-amber-400",  bg: "bg-amber-500/10" },
};

/** Creator profile header card */
function CreatorCard({ creator }: { creator: FlowCreator }) {
  const rankKey = creator.rank?.toLowerCase().replace(/\s+/g, "_") || "novice";
  const rankCfg = RANK_CONFIG[rankKey] || RANK_CONFIG.novice;
  const RankIcon = rankCfg.icon;

  return (
    <div className="bg-[#131b2e] rounded-xl h-9 flex items-center justify-between px-3 shrink-0 max-w-xs glass-border">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-[#2d3449] overflow-hidden shrink-0">
          {creator.avatarUrl ? (
            <img src={creator.avatarUrl} alt={creator.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#c7c5cd] text-[8px] font-bold">
              {creator.name.charAt(0)}
            </div>
          )}
        </div>
        <span className="font-bold text-[11px] text-[#dae2fd] font-prompt">
          {creator.name}
        </span>
        {/* Rank badge */}
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${rankCfg.bg}`}>
          <RankIcon className={`w-2.5 h-2.5 ${rankCfg.color}`} />
          <span className={`text-[8px] font-semibold uppercase tracking-wide ${rankCfg.color}`}>
            {rankCfg.label}
          </span>
        </div>
        {creator.badgeUrl && <img src={creator.badgeUrl} alt="Badge" className="w-4 h-6 ml-0.5" />}
      </div>
    </div>
  );
}

/** Example Inputs Gallery — shows recommended input examples */
function ExampleInputsGallery({ items }: { items: string[] }) {
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const { t } = useLanguage();

  return (
    <div className="flex flex-col gap-3 mt-2">
      <div className="flex items-center gap-2 px-1">
        <Upload className="w-4 h-4 text-[#b4c5ff]" />
        <h3 className="text-sm font-semibold text-[#dae2fd] font-prompt">{t("pfSuggestedImages")}</h3>
        <span className="text-[10px] text-[#c7c5cd]/60 font-prompt">({items.length})</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {items.map((url, i) => {
          const isVideo = VIDEO_EXTS.test(url);
          return (
            <button
              key={i}
              onClick={() => setFullscreenUrl(url)}
              className="shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-white/10 hover:border-[#b4c5ff]/50 transition-all bg-[#131b2e] relative group"
            >
              {isVideo ? (
                <video src={url} muted loop playsInline preload="metadata" className="w-full h-full object-cover"
                  onMouseEnter={(e) => { e.currentTarget.currentTime = 0; e.currentTarget.play().catch(() => {}); }}
                  onMouseLeave={(e) => e.currentTarget.pause()}
                />
              ) : (
                <img src={url} alt={`Example ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
              )}
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white/80" />
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={!!fullscreenUrl} onOpenChange={() => setFullscreenUrl(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-2 bg-black/90 border-none flex items-center justify-center">
          {fullscreenUrl && (
            VIDEO_EXTS.test(fullscreenUrl) ? (
              <video src={fullscreenUrl} controls autoPlay muted loop className="max-w-full max-h-[90vh] object-contain" />
            ) : (
              <img src={fullscreenUrl} alt="" className="max-w-full max-h-[90vh] object-contain" />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** URL-based media type detection */
const VIDEO_EXTS = /\.(mp4|webm|mov|m4v|avi)(\?|$)/i;
const IMAGE_EXTS = /\.(png|jpe?g|webp|gif|bmp|svg|tiff?)(\?|$)/i;

function detectMediaType(url: string, hint?: "image" | "video"): "image" | "video" {
  if (VIDEO_EXTS.test(url)) return "video";
  if (IMAGE_EXTS.test(url)) return "image";
  return hint || "image";
}

/** Video preview with poster-first loading: shows first frame immediately, autoplays when ready */
function PreviewVideo({ url }: { url: string }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const { t } = useLanguage();

  return (
    <div className="relative w-full max-h-[60vh]">
      <video
        ref={videoRef}
        src={url}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className={`w-full max-h-[60vh] object-contain transition-opacity duration-300 ${isLoaded ? "opacity-100" : "opacity-0"}`}
        onCanPlayThrough={() => setIsLoaded(true)}
        onLoadedData={() => {
          // Start playing as soon as data is available
          videoRef.current?.play().catch(() => {});
        }}
      />
      {/* Poster placeholder while video loads */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#131b2e]">
          <div className="flex flex-col items-center gap-2">
            <Play className="w-8 h-8 text-[#b4c5ff]/40 animate-pulse" />
            <span className="text-[10px] text-[#c7c5cd]/50">{t("pfLoadingVideo")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Result card for a single generation run (may contain multiple outputs) */
function ResultCard({
  items,
  index,
  flowTitle,
  description,
}: {
  items: OutputItem[];
  index: number;
  flowTitle: string;
  description: string;
}) {
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const dimensionTag = "1024×1024";

  const handleDownloadAll = async () => {
    for (let i = 0; i < items.length; i++) {
      await downloadMedia(items[i].url, items[i].label || `output_${i + 1}`);
      if (items.length > 1) await new Promise((r) => setTimeout(r, 400));
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className="rounded-[24px] overflow-hidden mb-[18px]"
        style={{ background: "#171717" }}
      >
        <div className="flex flex-col xl:flex-row">
          {/* Left: Media thumbnails — natural aspect ratio, fixed height */}
          <div className="shrink-0 p-[10px] flex gap-2 overflow-x-auto">
            {items.map((item, i) => (
              <div
                key={item.id}
                className="relative shrink-0 h-[308px] rounded-[16px] overflow-hidden cursor-pointer group"
                onClick={() => setFullscreenUrl(item.url)}
              >
                {detectMediaType(item.url, item.type) === "video" ? (
                  <video
                    src={item.url}
                    className="h-full w-auto object-contain"
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}); }}
                    onMouseLeave={(e) => e.currentTarget.pause()}
                  />
                ) : (
                  <img
                    src={item.url}
                    alt={item.label || `Output ${i + 1}`}
                    className="h-full w-auto object-contain"
                  />
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
              </div>
            ))}
          </div>

          {/* Right: Info panel */}
          <div className="flex-1 min-w-0 flex flex-col px-[14px] pt-[30px] pb-[14px]">
            {/* Description */}
            <p
              className="text-[14px] font-normal leading-[1.5]"
              style={{
                color: "#fafafa",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {description || `Generated output`}
            </p>

            {/* Tag badges */}
            <div className="flex flex-wrap gap-1 mt-2">
              {[flowTitle, dimensionTag].filter(Boolean).map((tag, i) => (
                <span
                  key={i}
                  className="inline-flex items-center shrink-0 rounded-[4px] text-[12px] leading-[16px] h-[20px] px-[4px]"
                  style={{ background: "rgba(255,255,255,0.2)", color: "#fafafa" }}
                >
                  {tag}
                </span>
              ))}
              {detectMediaType(items[0]?.url || "", items[0]?.type) === "video" && (
                <span
                  className="inline-flex items-center gap-1 shrink-0 rounded-[4px] text-[12px] leading-[16px] h-[20px] px-[4px]"
                  style={{ background: "rgba(255,255,255,0.2)", color: "#fafafa" }}
                >
                  <Clock className="w-3 h-3" /> Dynamic
                </span>
              )}
              <span
                className="inline-flex items-center shrink-0 rounded-[4px] text-[12px] leading-[16px] h-[20px] px-[4px]"
                style={{ background: "rgba(255,255,255,0.2)", color: "#fafafa" }}
              >
                Fast
              </span>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Actions */}
            <div className="flex items-center justify-between mt-4">
              {items.length > 0 && (
                <button
                  onClick={handleDownloadAll}
                  className="flex items-center gap-1.5 text-[12px] text-[#fafafa]/70 hover:text-[#fafafa] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {items.length > 1 ? `Download All (${items.length})` : "Download"}
                </button>
              )}
              <button className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10 ml-auto">
                <MoreHorizontal className="w-4 h-4 text-[#fafafa]" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Fullscreen dialog */}
      <Dialog open={!!fullscreenUrl} onOpenChange={() => setFullscreenUrl(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-2 bg-black/90 border-none flex items-center justify-center">
          {fullscreenUrl && (
            VIDEO_EXTS.test(fullscreenUrl) ? (
              <video src={fullscreenUrl} controls autoPlay muted loop className="max-w-full max-h-[90vh] object-contain" />
            ) : (
              <img src={fullscreenUrl} alt="" className="max-w-full max-h-[90vh] object-contain" />
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Flow description + output gallery with preview images support */
function OutputGallery({
  title,
  description,
  outputs,
  previewImages,
  thumbnailUrl,
}: {
  title: string;
  description: string;
  outputs: OutputItem[];
  previewImages?: string[];
  thumbnailUrl?: string;
}) {
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const [selectedPreview, setSelectedPreview] = useState(0);
  const { t } = useLanguage();

  // Use preview_images if available, else fallback to thumbnail
  const galleryImages = previewImages && previewImages.length > 0
    ? previewImages
    : thumbnailUrl
      ? [thumbnailUrl]
      : [];

  // Re-detect media type from URL to fix mismatches
  const resolvedOutputs = outputs.map((item) => ({
    ...item,
    type: detectMediaType(item.url, item.type),
  }));

  const hasResults = resolvedOutputs.length > 0;

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Flow title & description (shown when no results) */}
      {!hasResults && (
        <div className="flex flex-col gap-2 px-1 mb-4">
          <h2 className="font-semibold text-xl lg:text-[24px] text-[#dae2fd] leading-snug font-prompt">{title}</h2>
          <p className="text-base text-[#c7c5cd] leading-6 font-prompt">{description}</p>
        </div>
      )}

      {hasResults ? (
        /* ── Result cards — latest first, all outputs in one row ── */
        <div>
          <h3 className="text-[14px] font-normal mt-1 mb-2" style={{ color: "#fafafa" }}>
            Today
          </h3>
          <ResultCard
            items={[...resolvedOutputs].reverse()}
            index={0}
            flowTitle={title}
            description={description}
          />
        </div>
      ) : galleryImages.length > 0 ? (
        /* ── Preview images/video gallery (no results yet) ── */
        <div className="flex flex-col gap-3">
          {/* Main preview — glass card like ResultCard */}
          <div className="relative rounded-[24px] bg-[#171717] p-3">
            <div
              className="group relative overflow-hidden rounded-[16px] cursor-pointer"
              onClick={() => setFullscreenUrl(galleryImages[selectedPreview])}
            >
            {VIDEO_EXTS.test(galleryImages[selectedPreview]) ? (
              <PreviewVideo url={galleryImages[selectedPreview]} />
            ) : (
              <img
                src={galleryImages[selectedPreview]}
                alt={`Preview ${selectedPreview + 1}`}
                className="w-full max-h-[60vh] object-contain"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            {/* Prev / Next arrows */}
            {galleryImages.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedPreview((p) => (p - 1 + galleryImages.length) % galleryImages.length); }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedPreview((p) => (p + 1) % galleryImages.length); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
            <div className="absolute bottom-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[10px] text-white/70 bg-black/40 backdrop-blur px-2 py-0.5 rounded-full">
                {t("pfExampleWork", { current: selectedPreview + 1, total: galleryImages.length })}
              </span>
            </div>
            </div>
          </div>

          {/* Thumbnail row */}
          {galleryImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {galleryImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedPreview(i)}
                  className={`shrink-0 w-24 h-24 rounded-lg overflow-hidden border-2 transition-all ${
                    i === selectedPreview
                      ? "border-[#b4c5ff] ring-1 ring-[#b4c5ff]/30"
                      : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  {VIDEO_EXTS.test(img) ? (
                    <video src={img} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                  ) : (
                    <img src={img} alt={`Thumb ${i + 1}`} className="w-full h-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Empty state ── */
        <div className="flex-1 flex items-center justify-center border border-dashed border-white/10 min-h-[200px] lg:min-h-[400px] rounded-[24px]">
          <div className="flex flex-col items-center gap-3 text-[#c7c5cd]">
            <Sparkles className="w-10 h-10 lg:w-12 lg:h-12 opacity-30" />
            <p className="text-sm font-prompt">{t("pfResultsHere")}</p>
            <p className="text-xs opacity-60 font-prompt">{t("pfPressGenerate")}</p>
          </div>
        </div>
      )}

      {/* Fullscreen dialog */}
      <Dialog open={!!fullscreenUrl} onOpenChange={() => setFullscreenUrl(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-2 bg-black/90 border-none flex items-center justify-center">
          {fullscreenUrl && (
            VIDEO_EXTS.test(fullscreenUrl) ? (
              <video src={fullscreenUrl} controls autoPlay muted loop className="max-w-full max-h-[90vh] object-contain" />
            ) : (
              <img src={fullscreenUrl} alt="" className="max-w-full max-h-[90vh] object-contain" />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Generic input field renderer */
function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: string;
  onChange: (val: string) => void;
}) {
  const { t } = useLanguage();
  switch (field.type) {
    case "image-upload":
      return (
        <div className="flex flex-col gap-3 w-full">
          <label className="text-xs font-semibold text-[#c7c5cd] uppercase tracking-[1.2px]">
            {field.label}
          </label>
          <div className="bg-[#060e20] border border-white/[0.04] rounded-2xl p-4 flex items-center gap-4">
            <div className="w-16 h-16 rounded-lg bg-[#2d3449] overflow-hidden shrink-0 flex items-center justify-center">
              {value ? (
                <img src={value} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="text-3xl text-white/40">+</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {value && <span className="text-xs text-[#c7c5cd]">{t("pfUploadedFile")}</span>}
              <button className="flex items-center gap-2 bg-[#222a3d] hover:bg-[#2d3449] transition-colors rounded-lg px-3 py-1.5 w-fit">
                <Upload className="w-[10px] h-[10px] text-[#b4c5ff]" />
                <span className="text-xs font-semibold text-[#b4c5ff]">{t("pfUpload")}</span>
              </button>
            </div>
          </div>
        </div>
      );

    case "textarea":
      return (
        <div className="flex flex-col gap-3 w-full">
          <label className="text-xs font-semibold text-[#c7c5cd] uppercase tracking-[1.2px]">
            {field.label}
          </label>
          <div className="relative">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              className="w-full h-32 bg-[#060e20] border border-[#6b7280] rounded-2xl p-4 text-sm text-[#dae2fd] placeholder:text-[#c7c5cd]/50 resize-none focus:outline-none focus:border-[#b4c5ff] transition-colors"
            />
            <button className="absolute bottom-3 right-3 p-1.5 hover:bg-white/5 rounded-lg transition-colors">
              <Sparkles className="w-4 h-4 text-[#c7c5cd]" />
            </button>
          </div>
        </div>
      );

    case "select":
      return (
        <div className="flex flex-col gap-2 w-full">
          <label className="text-[10px] font-semibold text-[#c7c5cd] uppercase tracking-[1px]">
            {field.label}
          </label>
          <div className="relative">
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-full h-[34px] bg-[#060e20] border border-[#6b7280] rounded-2xl px-3 text-xs text-[#dae2fd] appearance-none focus:outline-none focus:border-[#b4c5ff] transition-colors cursor-pointer"
            >
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[#c7c5cd] pointer-events-none" />
          </div>
        </div>
      );

    case "text":
      return (
        <div className="flex flex-col gap-3 w-full">
          <label className="text-xs font-semibold text-[#c7c5cd] uppercase tracking-[1.2px]">
            {field.label}
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="w-full h-10 bg-[#060e20] border border-[#6b7280] rounded-2xl px-4 text-sm text-[#dae2fd] placeholder:text-[#c7c5cd]/50 focus:outline-none focus:border-[#b4c5ff] transition-colors"
          />
        </div>
      );

    default:
      return null;
  }
}

/** Configuration panel (right column) */
function ConfigPanel({
  fields,
  headerDescription,
  processingEstimate,
  creditsRemaining,
  onGenerate,
  isGenerating,
  children,
}: {
  fields: ConfigField[];
  headerDescription?: string;
  processingEstimate?: string;
  creditsRemaining?: number;
  onGenerate?: () => void;
  isGenerating?: boolean;
  children?: ReactNode;
}) {
  const { t } = useLanguage();
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    fields.forEach((f) => {
      initial[f.id] = f.defaultValue || (f.type === "select" && f.options?.[0]?.value) || "";
    });
    return initial;
  });

  const updateField = (id: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [id]: value }));
  };

  const fullFields = fields.filter((f) => !f.inline);
  const inlineFields = fields.filter((f) => f.inline);

  return (
    <div className="w-full lg:w-[620px] shrink-0 flex flex-col h-full overflow-y-auto">
      <div className="flex flex-col gap-6 p-6 pt-10 flex-1">
        {/* Header */}
        <div>
          <div className="relative">
            <h2
              className="font-extrabold text-lg lg:text-2xl text-[#dae2fd] tracking-[-0.4px] leading-6 lg:leading-8 font-prompt"
            >
              Configuration
            </h2>
            <div className="w-12 h-1 bg-[#b4c5ff] rounded-full mt-1" />
          </div>
          {headerDescription && (
            <p className="text-sm text-white leading-5 mt-2 lg:mt-3 font-prompt">
              {headerDescription}
            </p>
          )}
        </div>

        {fullFields.map((field) => (
          <FieldRenderer
            key={field.id}
            field={field}
            value={fieldValues[field.id] || ""}
            onChange={(val) => updateField(field.id, val)}
          />
        ))}

        {inlineFields.length > 0 && (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${Math.min(inlineFields.length, 3)}, 1fr)` }}
          >
            {inlineFields.map((field) => (
              <FieldRenderer
                key={field.id}
                field={field}
                value={fieldValues[field.id] || ""}
                onChange={(val) => updateField(field.id, val)}
              />
            ))}
          </div>
        )}

        {children}
      </div>

      {/* Footer */}
      <div className="p-6 pt-0 mt-auto">
        {creditsRemaining !== undefined && (
          <div className="flex items-center justify-between text-xs text-[#c7c5cd] mb-4">
            <span>{t("pfCreditsRemaining")}</span>
            <span className="text-emerald-400 font-semibold">{creditsRemaining.toLocaleString()} credits</span>
          </div>
        )}

        <div className="border-t border-white/[0.03] pt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3 text-[#c7c5cd]" />
            <span className="text-xs font-medium text-[#c7c5cd] leading-4">
              {processingEstimate || "Estimated Processing: 1-3 minutes"}
            </span>
          </div>
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className="flex items-center gap-3 px-8 py-3 rounded-full text-[#002a78] font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-[0_20px_30px_-5px_rgba(180,197,255,0.3)]"
            style={{
              background: "linear-gradient(133deg, rgb(180,197,255) 0%, rgb(75,125,255) 100%)",
              boxShadow: "0 20px 25px -5px rgba(180,197,255,0.2), 0 8px 10px -6px rgba(180,197,255,0.2)",
            }}
          >
            <Play className="w-[11px] h-[14px] fill-current" />
            {isGenerating ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN LAYOUT
// ============================================================

/** Tab bar for switching between Preview and Results */
function ViewTabBar({
  activeTab,
  onTabChange,
  hasResults,
}: {
  activeTab: PlayFlowTab;
  onTabChange: (tab: PlayFlowTab) => void;
  hasResults: boolean;
}) {
  const tabs: { key: PlayFlowTab; label: string; icon: typeof Sparkles }[] = [
    { key: "preview", label: "Preview", icon: Play },
    { key: "results", label: "Results", icon: Sparkles },
  ];

  return (
    <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-1 glass-border self-start">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
              isActive
                ? "bg-white/[0.12] text-[#dae2fd] shadow-sm"
                : "text-[#c7c5cd]/70 hover:text-[#c7c5cd] hover:bg-white/[0.04]"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.key === "results" && hasResults && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function PlayFlowLayout({
  flow,
  outputs,
  historicalRuns,
  fields,
  creditsRemaining,
  processingEstimate,
  onGenerate,
  isGenerating,
  configPanelOverride,
  headerDescription,
  navigationSlot,
  headerRightSlot,
  activeTab = "preview",
  onTabChange,
}: PlayFlowLayoutProps) {
  const { t } = useLanguage();
  // Derive setup instructions: explicit prop > flow.setupInstructions > flow.description > fallback
  const resolvedDescription = headerDescription
    || flow.setupInstructions
    || flow.description
    || "";

  // Merge current session outputs + historical runs for Results tab
  const allRuns: HistoricalRun[] = useMemo(() => {
    const runs: HistoricalRun[] = [];

    // Current session results (if any)
    if (outputs.length > 0) {
      runs.push({
        id: "current-session",
        outputs,
        createdAt: new Date().toISOString(),
        creditsUsed: 0,
        status: "completed",
      });
    }

    // Historical runs (skip duplicates with current session URLs)
    const currentUrls = new Set(outputs.map((o) => o.url));
    if (historicalRuns) {
      for (const run of historicalRuns) {
        const filtered = run.outputs.filter((o) => !currentUrls.has(o.url));
        if (filtered.length > 0) {
          runs.push({ ...run, outputs: filtered });
        }
      }
    }

    return runs;
  }, [outputs, historicalRuns]);

  const hasAnyResults = allRuns.length > 0;

  return (
    <div className="min-h-screen bg-[#020403] text-white font-prompt [&_*]:font-prompt">
      {/* ─── PlayFlow Header Bar ─── */}
      <header className="fixed top-3 left-3 right-3 z-50 h-14 rounded-2xl bg-transparent flex items-center px-5">
        {/* Left: Back button */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {navigationSlot}
        </div>
        {/* Center: Remaining credits pill — CI Aether spec */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4">
          {creditsRemaining !== undefined && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-400/[0.06] border border-violet-400/[0.15]">
              <Coins className="w-3 h-3 text-violet-300" />
              <span className="text-[11.5px] text-white/60 font-prompt">{t("pfCreditsRemaining")}</span>
              <span className="text-[12.5px] font-bold text-violet-200 font-mono tabular-nums">
                {creditsRemaining.toLocaleString()}
              </span>
            </div>
          )}
        </div>
        {/* Right: User avatar / custom slot */}
        <div className="flex items-center ml-auto">
          {headerRightSlot}
        </div>
      </header>

      {/* Config panel override rendered as fixed sidebar (it positions itself) */}
      {configPanelOverride}

      <main className="min-h-screen pt-[56px] pl-4 lg:pl-[408px]">
        {/* ─── Main Content (Preview + Gallery) ─── */}
        <div
          className="min-w-0 pr-6 pb-8 flex flex-col gap-4 overflow-y-auto scrollbar-hide"
          style={{ height: "calc(100vh - 64px)" }}
        >
          {/* Creator card + Difficulty + Tab bar row */}
          <div className="flex items-center gap-3 flex-wrap">
            <CreatorCard creator={flow.creator} />
            {flow.difficultyLevel && (
              <DifficultyBadge level={flow.difficultyLevel} size="md" />
            )}
            <ViewTabBar
              activeTab={activeTab}
              onTabChange={onTabChange || (() => {})}
              hasResults={hasAnyResults}
            />
          </div>

          {activeTab === "preview" ? (
            <>
              <OutputGallery
                title={flow.title}
                description={flow.description}
                outputs={[]}
                previewImages={flow.previewImages}
                thumbnailUrl={flow.thumbnailUrl}
              />
              {flow.exampleInputs && flow.exampleInputs.length > 0 && (
                <ExampleInputsGallery items={flow.exampleInputs} />
              )}
            </>
          ) : hasAnyResults ? (
            <div className="flex flex-col gap-1">
              {allRuns.map((run, idx) => {
                const dateLabel = run.id === "current-session"
                  ? "Just now"
                  : formatRunDate(run.createdAt);
                return (
                  <div key={run.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-[13px] font-medium text-[#c7c5cd]/80">{dateLabel}</h3>
                      {run.creditsUsed > 0 && (
                        <span className="text-[10px] text-[#c7c5cd]/50">• {run.creditsUsed} credits</span>
                      )}
                    </div>
                    <ResultCard
                      items={run.outputs.map((o) => ({ ...o, type: detectMediaType(o.url, o.type) }))}
                      index={idx}
                      flowTitle={flow.title}
                      description={flow.description}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            /* Empty results state */
            <div className="flex-1 flex items-center justify-center border border-dashed border-white/10 min-h-[200px] lg:min-h-[400px] rounded-[24px]">
              <div className="flex flex-col items-center gap-3 text-[#c7c5cd]">
                <Sparkles className="w-10 h-10 lg:w-12 lg:h-12 opacity-30" />
                <p className="text-sm font-prompt">{t("pfNoResults")}</p>
                <p className="text-xs opacity-60 font-prompt">{t("pfPressGenerate")}</p>
              </div>
            </div>
          )}
        </div>

        {/* ─── MOBILE: Config Panel below content ─── */}
        <div className="lg:hidden">
          {configPanelOverride || (
            <ConfigPanel
              fields={fields}
              headerDescription={resolvedDescription}
              processingEstimate={processingEstimate}
              creditsRemaining={creditsRemaining}
              onGenerate={onGenerate}
              isGenerating={isGenerating}
            />
          )}
        </div>
      </main>
    </div>
  );
}
