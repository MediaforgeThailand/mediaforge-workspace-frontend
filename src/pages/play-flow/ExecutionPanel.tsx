import { useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Download, RefreshCw, FileImage, FileVideo, FileText, Sparkles, Clock } from "lucide-react";
import { toast } from "sonner";
import { downloadMedia } from "@/lib/downloadMedia";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatTimer } from "./utils";
import GenOrbitLoader from "@/components/play/GenOrbitLoader";
import logoIcon from "@/assets/logo-icon.png";
import type { ExecutionState } from "./types";

/* ─── URL-based media type detection ─── */
const VIDEO_EXTS = /\.(mp4|webm|mov|m4v|avi)(\?|$)/i;
const IMAGE_EXTS = /\.(png|jpe?g|webp|gif|bmp|svg|tiff?)(\?|$)/i;

function detectMediaType(url: string, hint?: "video" | "image" | "text"): "video" | "image" | "text" {
  if (VIDEO_EXTS.test(url)) return "video";
  if (IMAGE_EXTS.test(url)) return "image";
  return hint || "image";
}

function getExtFromUrl(url: string): string {
  const match = url.match(/\.([a-zA-Z0-9]+)(\?|$)/);
  return match ? match[1].toLowerCase() : "file";
}

interface ExecutionPanelProps {
  state: ExecutionState;
  flowName: string;
  statusMessage: string;
  progress: number;
  elapsedSeconds: number;
  resultUrl: string | null;
  resultType?: "video" | "image" | "text";
  resultHistory?: Array<{ url: string; type: "video" | "image" | "text" }>;
  errorMessage: string | null;
  wasRefunded?: boolean;
  /** Aggregate node-progress across the pipeline (for multi-node flows) */
  nodeProgress?: { completed: number; total: number; failed?: number };
  /** Credits refunded for partially-failed nodes (shown on done state) */
  partialRefundCredits?: number;
  onReset: () => void;
}

export default function ExecutionPanel({
  state, flowName, statusMessage, progress, elapsedSeconds, resultUrl, resultType, resultHistory, errorMessage, wasRefunded,
  nodeProgress, partialRefundCredits, onReset,
}: ExecutionPanelProps) {
  const { t } = useLanguage();
  const isActive = state === "submitting" || state === "processing";

  const allResults = useMemo(() => {
    const raw = (resultHistory && resultHistory.length > 0)
      ? resultHistory
      : resultUrl
        ? [{ url: resultUrl, type: resultType || ("image" as const) }]
        : [];
    return raw.map(r => ({ ...r, type: detectMediaType(r.url, r.type) }));
  }, [resultHistory, resultUrl, resultType]);

  const handleDownload = useCallback(async (url: string, index: number) => {
    await downloadMedia(url, `Output_${index + 1}`);
  }, []);

  const handleDownloadAll = useCallback(async () => {
    for (let i = 0; i < allResults.length; i++) {
      const r = allResults[i];
      if (r.type === "text") continue;
      await handleDownload(r.url, i);
    }
  }, [allResults, handleDownload]);

  const waitingTips = useMemo(() => [
    t("pfTip1"), t("pfTip2"), t("pfTip3"), t("pfTip4"), t("pfTip5"), t("pfTip6"),
  ], [t]);

  const tipIndex = Math.floor(elapsedSeconds / 12) % waitingTips.length;

  const FileIcon = ({ type }: { type: "video" | "image" | "text" }) => {
    if (type === "video") return <FileVideo className="w-4 h-4 text-violet-300 shrink-0" />;
    if (type === "text") return <FileText className="w-4 h-4 text-amber-300 shrink-0" />;
    return <FileImage className="w-4 h-4 text-sky-300 shrink-0" />;
  };

  return (
    <div className="space-y-4">
      {isActive && (
        <div className="relative p-8 flex flex-col items-center gap-4 min-h-[280px] justify-center">
          <GenOrbitLoader size={104} />

          <div className="text-center">
            <h3 className="text-[16px] font-bold text-white">{t("pfGeneratingOutput")}</h3>
            {nodeProgress && nodeProgress.total > 1 && (
              <p className="mt-1 text-[12px] text-white/70 font-mono tabular-nums">
                {nodeProgress.completed}/{nodeProgress.total}
                {nodeProgress.failed && nodeProgress.failed > 0 ? (
                  <span className="ml-2 text-rose-300/80">({nodeProgress.failed} failed)</span>
                ) : null}
              </p>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-[320px]">
            <div className="flex items-center justify-end text-[11px] font-mono text-white/55 mb-1.5">
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${progress}%`,
                  background: "linear-gradient(90deg, #a78bfa, #7c3aed)",
                  boxShadow: "0 0 12px rgba(167,139,250,0.6)",
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-mono text-white/35">
            <Clock className="w-2.5 h-2.5" /> {formatTimer(elapsedSeconds)}
          </div>

          <AnimatePresence mode="wait">
            <motion.p
              key={tipIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="text-[10px] text-white/40 text-center max-w-[280px]"
            >
              {waitingTips[tipIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      )}

      {state === "done" && (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            background: "linear-gradient(180deg, rgba(20,18,36,0.6) 0%, rgba(10,8,20,0.7) 100%)",
            border: "1px solid rgba(167,139,250,0.15)",
          }}
        >
          <div className="text-center">
            <div className="w-10 h-10 mx-auto rounded-xl bg-violet-400/10 border border-violet-400/25 flex items-center justify-center mb-2">
              <img src={logoIcon} alt="" className="w-5 h-5 object-contain" draggable={false} />
            </div>
            {nodeProgress && nodeProgress.total > 1 && nodeProgress.failed && nodeProgress.failed > 0 ? (
              <p className="text-[11px] text-white/55 mt-0.5">
                {nodeProgress.completed}/{nodeProgress.total} succeeded
                {partialRefundCredits && partialRefundCredits > 0 ? (
                  <span className="ml-1 text-violet-300">· refunded {partialRefundCredits.toLocaleString()} credits</span>
                ) : null}
              </p>
            ) : allResults.length > 1 ? (
              <p className="text-[11px] text-white/55 mt-0.5">{allResults.length} outputs generated</p>
            ) : null}
          </div>

          {allResults.length > 0 && (
            <div className="space-y-1.5">
              {allResults.map((item, i) => {
                const ext = getExtFromUrl(item.url);
                const filename = `Output_${i + 1}.${ext}`;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.05 }}
                    className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 group hover:bg-white/[0.06] transition-colors"
                  >
                    <FileIcon type={item.type} />
                    <span className="text-[12px] text-white/85 truncate flex-1 font-medium">{filename}</span>
                    {item.type === "text" ? (
                      <button
                        onClick={() => { navigator.clipboard.writeText(item.url); toast.success(t("pfCopied")); }}
                        className="text-[10px] text-white/55 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/5"
                      >
                        {t("pfCopyText")}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDownload(item.url, i)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-white/55 hover:text-white hover:bg-white/5 transition-colors opacity-60 group-hover:opacity-100"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <button
              className="flex-1 h-10 rounded-xl btn-glass text-white/75 hover:text-white text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
              onClick={onReset}
            >
              <RefreshCw className="w-3.5 h-3.5" /> {t("pfRunAgain")}
            </button>
            {allResults.filter(r => r.type !== "text").length > 0 && (
              <button
                onClick={allResults.filter(r => r.type !== "text").length === 1
                  ? () => handleDownload(allResults.find(r => r.type !== "text")!.url, 0)
                  : handleDownloadAll}
                className="flex-1 h-10 rounded-xl btn-primary-violet text-[12px] font-bold flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                {allResults.filter(r => r.type !== "text").length > 1
                  ? `${t("pfDownload")} (${allResults.filter(r => r.type !== "text").length})`
                  : t("pfDownload")}
              </button>
            )}
          </div>
        </div>
      )}

      {state === "error" && (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            background: "linear-gradient(180deg, rgba(36,18,18,0.6) 0%, rgba(20,8,8,0.7) 100%)",
            border: "1px solid rgba(193,81,115,0.25)",
          }}
        >
          <div className="text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-rose-300" />
            </div>
            <h3 className="text-[14px] font-bold text-white">{t("pfGenerationFailed")}</h3>
            {errorMessage && <p className="text-[12px] text-white/65 leading-relaxed">{errorMessage}</p>}
            {wasRefunded && (
              <span className="inline-flex items-center gap-1 text-[10px] border border-violet-400/25 text-violet-300 bg-violet-400/5 rounded-md px-2 py-0.5">
                <RefreshCw className="w-2.5 h-2.5" /> {t("pfCreditsRefunded")}
              </span>
            )}
          </div>
          <button
            className="w-full h-10 rounded-xl btn-glass text-white/75 hover:text-white text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
            onClick={onReset}
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t("pfTryAgain")}
          </button>
        </div>
      )}
    </div>
  );
}
