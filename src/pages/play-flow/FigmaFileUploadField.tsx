import { useCallback, useState } from "react";
import { X, ImageIcon, Plus, Info } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { InputField } from "./types";

interface FigmaFileUploadFieldProps {
  field: InputField;
  file: File | null;
  preview?: string;
  onSelect: (f: File | null) => void;
}

const openFilePicker = (accept: string, onFile: (f: File) => void) => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.onchange = (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) onFile(f);
  };
  input.click();
};

export default function FigmaFileUploadField({ field, file, preview, onSelect }: FigmaFileUploadFieldProps) {
  const { t } = useLanguage();
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const [dropHot, setDropHot] = useState(false);

  const fetchAsFile = useCallback(async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "png").split("+")[0];
      return new File([blob], `result.${ext}`, { type: blob.type });
    } catch {
      return null;
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDropHot(false);
    // 1) Result drag from ResultsPanel
    const mfPayload = e.dataTransfer.getData("application/x-mf-result");
    if (mfPayload) {
      try {
        const { url } = JSON.parse(mfPayload) as { url: string };
        if (url) {
          const f = await fetchAsFile(url);
          if (f) onSelect(f);
        }
      } catch { /* ignore */ }
      return;
    }
    // 2) Native file drop
    const dropped = e.dataTransfer.files[0];
    if (dropped) onSelect(dropped);
  }, [onSelect, fetchAsFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes("application/x-mf-result") ||
      e.dataTransfer.types.includes("Files")
    ) {
      e.preventDefault();
      setDropHot(true);
    }
  }, []);

  const accept = field.accept || "image/*";
  const pickFile = () => openFilePicker(accept, (f) => onSelect(f));

  const exampleUrls = field.exampleImageUrls ?? [];
  const hasExamples = exampleUrls.length > 0;
  const maxFiles = 1;
  const currentCount = file ? 1 : 0;
  const isVideo = field.fieldType === "video";
  const fileTypesHint = isVideo ? t("pfFileTypesVideo") : t("pfFileTypes");

  return (
    <div className="flex flex-col gap-2">
      {/* Header: label + required dot + count */}
      <div className="flex items-center gap-2">
        <label className="text-[12px] font-semibold text-white/80 font-prompt flex items-center gap-1.5">
          {field.fieldLabel}
          {field.required && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400"
              aria-label="required"
              title="Required"
            />
          )}
        </label>
        <span className="text-[10px] text-white/30 tabular-nums ml-auto font-mono">
          {currentCount}/{maxFiles}
        </span>
      </div>

      {/* Upload area */}
      {file && preview ? (
        <div
          className={`relative w-full h-20 rounded-xl border border-white/[0.12] bg-black/20 overflow-hidden group/uploaded ${dropHot ? "drop-zone-hot" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={() => setDropHot(false)}
          onDrop={handleDrop}
        >
          {field.fieldType === "image" ? (
            <img src={preview} alt="Uploaded" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/[0.03]">
              <ImageIcon className="w-5 h-5 text-white/30" />
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(null); }}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/70 text-white/80 flex items-center justify-center opacity-0 group-hover/uploaded:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={pickFile}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDropHot(false)}
          className={`w-full h-[72px] rounded-xl border border-dashed border-white/[0.14] bg-white/[0.03] flex flex-col items-center justify-center gap-1 hover:border-violet-400/40 hover:bg-violet-400/[0.04] transition-colors cursor-pointer group/upload ${dropHot ? "drop-zone-hot" : ""}`}
        >
          <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center group-hover/upload:bg-violet-400/15 group-hover/upload:border-violet-400/30 transition-colors">
            <Plus className="w-3.5 h-3.5 text-white/55" />
          </div>
          <span className="text-[11px] text-white/70 font-medium font-prompt leading-none">
            {t("pfClickOrDrag")}
          </span>
          <span className="text-[9px] text-white/30 font-mono tracking-[0.3px] leading-none">
            {fileTypesHint}
          </span>
        </button>
      )}

      {/* Example thumbs row (creator-uploaded examples) */}
      {hasExamples && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[10px] text-white/40 font-prompt shrink-0">ตัวอย่างที่แนะนำ:</span>
          <div className="flex items-center gap-1.5">
            {exampleUrls.slice(0, 4).map((url, i) => (
              <HoverCard key={i} openDelay={120} closeDelay={80}>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setFullscreenUrl(url)}
                    className="w-7 h-7 rounded-[6px] overflow-hidden border border-white/[0.12] hover:border-violet-400/50 hover:scale-110 transition-all shrink-0"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                </HoverCardTrigger>
                <HoverCardContent
                  side="top"
                  align="center"
                  sideOffset={10}
                  className="w-auto p-1.5 bg-[#0c1120]/98 backdrop-blur-2xl border border-white/[0.1] rounded-2xl shadow-2xl z-[9999]"
                >
                  <img
                    src={url}
                    alt={`Example ${i + 1}`}
                    className="w-[200px] h-[200px] rounded-xl object-cover"
                    loading="lazy"
                  />
                </HoverCardContent>
              </HoverCard>
            ))}
          </div>
          <Info className="w-3 h-3 text-amber-400/70 ml-auto shrink-0" />
        </div>
      )}

      {/* Fullscreen image dialog */}
      <Dialog open={!!fullscreenUrl} onOpenChange={() => setFullscreenUrl(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-2 bg-black/90 border-none flex items-center justify-center">
          {fullscreenUrl && (
            <img src={fullscreenUrl} alt="" className="max-w-full max-h-[90vh] object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
