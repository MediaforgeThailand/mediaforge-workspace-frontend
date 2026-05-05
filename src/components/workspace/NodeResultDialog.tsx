/**
 * Full-size preview + history filmstrip for a node's generations.
 *
 * Click a thumbnail in the strip → selects that generation (the node's
 * result-bar thumbnail updates too, since both read the same index).
 */

import { memo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Generation } from "./NodeResultBar";
import { AudioPlayButton } from "./AudioPlayButton";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generations: Generation[];
  selectedIndex: number;
  onSelect?: (i: number) => void;
}

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleString();
};

const NodeResultDialog = memo(
  ({ open, onOpenChange, generations, selectedIndex, onSelect }: Props) => {
    const { t: i18n } = useLanguage();
    const current = generations[selectedIndex] ?? generations[0];

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl gap-0 p-0">
          <DialogTitle className="sr-only">{i18n("workspace.nodeResultDialog.generationHistory")}</DialogTitle>
          <DialogDescription className="sr-only">
            {i18n("workspace.nodeResultDialog.description")}
          </DialogDescription>

          {/* Main preview — natural aspect, clip to viewport */}
          <div className="flex min-h-[360px] items-center justify-center overflow-hidden bg-black">
            {current.type === "image" && current.url && (
              <img
                src={current.url}
                alt=""
                className="max-h-[70vh] max-w-full object-contain"
              />
            )}
            {current.type === "video" && current.url && (
              <video
                src={current.url}
                controls
                className="max-h-[70vh] max-w-full object-contain"
              />
            )}
            {current.type === "text" && (
              <div className="max-h-[70vh] overflow-y-auto p-6 text-sm leading-relaxed text-white/90">
                {current.text}
              </div>
            )}
            {current.type === "audio" && current.url && (
              <div className="flex flex-col items-center justify-center gap-3 p-8">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                  {i18n("workspace.nodeResultDialog.audioOutput")}
                </div>
                <AudioPlayButton
                  src={current.url}
                  label={i18n("workspace.common.playAudio")}
                  buttonClassName="h-14 w-14"
                />
              </div>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-between px-4 py-2 text-[11px] text-zinc-400">
            <div>
              {selectedIndex === 0 ? i18n("common.latest") : `#${generations.length - selectedIndex}`} ·{" "}
              {formatTime(current.createdAt)}
            </div>
            <div className="uppercase tracking-wide text-zinc-500">{current.type}</div>
          </div>

          {/* History filmstrip */}
          {generations.length > 1 && (
            <div className="bg-zinc-950 p-3">
              <div className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">
                {i18n("common.history")} — {generations.length}{" "}
                {i18n(generations.length === 1 ? "workspace.generation.singular" : "workspace.generation.plural")}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {generations.map((gen, i) => (
                  <button
                    key={gen.id}
                    type="button"
                    onClick={() => onSelect?.(i)}
                    title={formatTime(gen.createdAt)}
                    className={cn(
                      "relative h-20 w-20 shrink-0 overflow-hidden rounded border-2 bg-zinc-900 transition-opacity",
                      i === selectedIndex
                        ? "border-white/60"
                        : "border-zinc-700 opacity-60 hover:opacity-100",
                    )}
                  >
                    {gen.type === "image" && gen.url && (
                      <img src={gen.url} className="h-full w-full object-cover" alt="" />
                    )}
                    {gen.type === "video" && gen.url && (
                      <video src={gen.url} muted className="h-full w-full object-cover" />
                    )}
                    {gen.type === "text" && (
                      <div className="p-1 text-left text-[8px] leading-tight text-white/60">
                        {gen.text?.slice(0, 60)}
                      </div>
                    )}
                    {gen.type === "audio" && (
                      // Thumbnail for audio gens — a stylised
                      // speaker glyph + the gen index. Filmstrip
                      // tile is too small to render a real player.
                      <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-[20px] text-white/60">
                        ♪
                      </div>
                    )}
                    {i === 0 && (
                      <div className="absolute bottom-0 left-0 right-0 bg-emerald-500/80 py-[1px] text-center text-[8px] font-semibold text-black">
                        {i18n("common.latest2")}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  },
);

NodeResultDialog.displayName = "NodeResultDialog";
export default NodeResultDialog;
