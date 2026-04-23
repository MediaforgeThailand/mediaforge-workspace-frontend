import { Sparkles, ImagePlus, Video, Type, ListFilter, Film, Mic, MessageSquare, Scissors, Maximize, Combine, Music, Clapperboard, FileText, Image, Volume2, Camera, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, typeof Sparkles> = {
  "input/image_upload": ImagePlus,
  "input/video_upload": Video,
  "input/text_input": Type,
  "input/select": ListFilter,
  "ai/image_gen": Sparkles,
  "ai/kling_2_6_i2v": Film,
  "ai/kling_2_6_camera": Camera,
  "ai/kling_3_0_i2v": Film,
  "ai/voice_gen": Mic,
  "ai/text_gen": MessageSquare,
  "ai/chat_ai": MessageSquare,
  "ai/bg_remove": Scissors,
  "ai/upscale": Maximize,
  "transform/video_concat": Combine,
  "transform/audio_mix": Music,
  "transform/video_audio_merge": Clapperboard,
  "transform/prompt_builder": FileText,
  "output/image": Image,
  "output/video": Video,
  "output/audio": Volume2,
};

const CATEGORY_STYLES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  input: { label: "INPUT", bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  ai: { label: "AI", bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  transform: { label: "TRANSFORM", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  output: { label: "OUTPUT", bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
};

interface FlowNode {
  id: string;
  node_type: string;
  label: string;
  sort_order: number;
  config: Record<string, unknown>;
}

interface Props {
  nodes: FlowNode[];
}

export default function FlowPreviewPanel({ nodes }: Props) {
  const sorted = [...nodes].sort((a, b) => a.sort_order - b.sort_order);

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 py-12 text-center">
        <p className="text-sm text-muted-foreground">No nodes in this flow</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">Flow Pipeline (Read-only)</h3>
      <div className="flex flex-wrap items-center gap-2">
        {sorted.map((node, i) => {
          const category = node.node_type.split("/")[0];
          const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.input;
          const Icon = ICON_MAP[node.node_type] || Sparkles;
          const config = node.config || {};
          const configEntries = Object.entries(config).filter(
            ([k, v]) => v !== "" && v !== null && v !== undefined && k !== "label"
          );

          return (
            <div key={node.id} className="flex items-center gap-2">
              <div className={cn(
                "rounded-xl border p-3 min-w-[160px] max-w-[220px]",
                style.border, style.bg
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn("w-6 h-6 rounded-md flex items-center justify-center", style.bg)}>
                    <Icon className={cn("w-3.5 h-3.5", style.text)} />
                  </div>
                  <span className={cn("text-[9px] font-semibold tracking-widest uppercase", style.text)}>
                    {style.label}
                  </span>
                </div>
                <p className="text-xs font-medium text-foreground truncate">{node.label}</p>
                {configEntries.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {configEntries.slice(0, 3).map(([k, v]) => (
                      <p key={k} className="text-[10px] text-muted-foreground truncate">
                        <span className="text-muted-foreground/60">{k}:</span> {String(v)}
                      </p>
                    ))}
                    {configEntries.length > 3 && (
                      <p className="text-[10px] text-muted-foreground/50">+{configEntries.length - 3} more</p>
                    )}
                  </div>
                )}
              </div>
              {i < sorted.length - 1 && (
                <ArrowRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
