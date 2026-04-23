import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, ImagePlus, Film, Type,
  FastForward, Move, PanelLeftClose, Sparkles, Image,
  FileVideo, MessageSquare, Layers, Eraser, Music, Clapperboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

export interface PaletteNodeDef {
  type: string;
  label: string;
  icon: typeof ImagePlus;
  category: "user_input" | "creator_input" | "ai" | "output";
  description: string;
  defaultOverrides?: Record<string, unknown>;
  /** Optional highlight color for the icon & label */
  highlight?: string;
}

export const NODE_PALETTE: PaletteNodeDef[] = [
  // ── User Input ──
  {
    type: "inputNode",
    label: "Image Upload",
    icon: ImagePlus,
    category: "user_input",
    description: "nodeDescImageUpload",
    defaultOverrides: { fieldType: "image", accept: "image/*" },
  },
  {
    type: "inputNode",
    label: "Video Upload",
    icon: FileVideo,
    category: "user_input",
    description: "nodeDescVideoUpload",
    defaultOverrides: { fieldType: "video", accept: "video/*" },
  },
  {
    type: "textInputNode",
    label: "Text Input",
    icon: Type,
    category: "user_input",
    description: "nodeDescTextInput",
    highlight: "#4ade80",
  },
  // ── Creator Input ──
  {
    type: "inputNode",
    label: "Creator Image",
    icon: Image,
    category: "creator_input",
    description: "nodeDescCreatorImage",
    defaultOverrides: { fieldType: "image", accept: "image/*", creatorAsset: true },
  },
  {
    type: "inputNode",
    label: "Creator Video",
    icon: Film,
    category: "creator_input",
    description: "nodeDescCreatorVideo",
    defaultOverrides: { fieldType: "video", accept: "video/*", creatorAsset: true },
  },
  {
    type: "mp3InputNode",
    label: "MP3 Audio (Creator)",
    icon: Music,
    category: "creator_input",
    description: "nodeDescMp3Input",
    highlight: "#fbbf24",
  },
  // ── AI Processing ──
  {
    type: "chatAiNode",
    label: "Chat AI (Gemini / GPT)",
    icon: MessageSquare,
    category: "ai",
    description: "nodeDescChatAi",
  },
  {
    type: "bananaProNode",
    label: "Banana Pro (Image Gen)",
    icon: Layers,
    category: "ai",
    description: "nodeDescImageGen",
    highlight: "#a855f7",
  },
  {
    type: "klingVideoNode",
    label: "Image to Video (Kling)",
    icon: Film,
    category: "ai",
    description: "nodeDescVideoGen",
  },
  {
    type: "removeBackgroundNode",
    label: "Remove Background",
    icon: Eraser,
    category: "ai",
    description: "nodeDescRemoveBg",
    highlight: "#a855f7",
  },
  {
    type: "mergeAudioNode",
    label: "Merge Audio + Video",
    icon: Clapperboard,
    category: "ai",
    description: "nodeDescMergeAudio",
    highlight: "#34d399",
  },
  // Output node is auto-created with the flow — not user-addable
];

const CATEGORIES = [
  { key: "user_input", label: "USER INPUT", dotColor: "#60a5fa", dotGlow: "0 0 8px rgba(96,165,250,0.5)" },
  { key: "creator_input", label: "CREATOR INPUT", dotColor: "#f59e0b", dotGlow: "0 0 8px rgba(245,158,11,0.5)" },
  { key: "ai", label: "AI PROCESSING", dotColor: "#a855f7", dotGlow: "0 0 8px rgba(168,85,247,0.5)" },
  
] as const;

interface NodePaletteProps {
  onAddNode: (type: string, label: string, position?: { x: number; y: number }, overrides?: Record<string, unknown>) => void;
  onCollapse: () => void;
}

const NodePalette = ({ onAddNode, onCollapse }: NodePaletteProps) => {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");

  const filtered = NODE_PALETTE.filter((n) =>
    n.label.toLowerCase().includes(search.toLowerCase()) ||
    t(n.description as any).toLowerCase().includes(search.toLowerCase())
  );

  const onDragStart = (e: React.DragEvent, node: PaletteNodeDef) => {
    e.dataTransfer.setData("application/reactflow-type", node.type);
    e.dataTransfer.setData("application/reactflow-label", node.label);
    if (node.defaultOverrides) {
      e.dataTransfer.setData("application/reactflow-overrides", JSON.stringify(node.defaultOverrides));
    }
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside
      className="w-[256px] shrink-0 h-full flex flex-col border-r backdrop-blur-xl z-20"
      style={{ background: "rgba(8,9,11,0.95)", borderColor: "rgba(255,255,255,0.12)" }}
    >
      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[11px] h-[11px] text-[#94a3b8]/50" />
          <input
            type="text"
            placeholder={t("nodePaletteSearch")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl px-4 pl-10 py-2.5 text-sm text-[#f8fafc] placeholder:text-[#94a3b8]/50 focus:outline-none focus:border-[#8a4cfc]/40 border transition-colors"
            style={{ background: "rgba(18,20,26,0.5)", borderColor: "rgba(255,255,255,0.12)" }}
          />
        </div>
      </div>

      {/* Node categories */}
      <ScrollArea className="flex-1 px-3 pt-2 pb-10">
        <div className="flex flex-col gap-7">
          {CATEGORIES.map((cat) => {
            const items = filtered.filter((n) => n.category === cat.key);
            if (items.length === 0) return null;

            return (
              <div key={cat.key} className="flex flex-col gap-3">
                {/* Category header */}
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: cat.dotColor, boxShadow: cat.dotGlow }}
                    />
                    <span className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-[1px]">
                      {cat.label}
                    </span>
                  </div>
                  <div className="rounded-lg px-1.5 py-0.5" style={{ background: "#12141a" }}>
                    <span className="text-[8px] font-semibold text-[#94a3b8] uppercase tracking-[1px]">
                      {items.length}
                    </span>
                  </div>
                </div>

                {/* Node items */}
                {items.map((node, idx) => (
                  <button
                    key={`${node.type}-${node.label}-${idx}`}
                    className="flex gap-3 items-start p-2.5 rounded-2xl hover:bg-white/5 cursor-grab active:cursor-grabbing transition-colors text-left w-full"
                    onClick={() => onAddNode(node.type, node.label, undefined, node.defaultOverrides)}
                    draggable
                    onDragStart={(e) => onDragStart(e, node)}
                  >
                    <node.icon
                      className="shrink-0 mt-0.5"
                      style={{ color: node.highlight || "#94a3b8" }}
                      width={15}
                      height={15}
                    />
                    <div className="min-w-0">
                      <div
                        className="text-xs font-semibold"
                        style={{ color: node.highlight || "#f8fafc" }}
                      >
                        {node.label}
                      </div>
                      <div className="text-[9px] text-[#94a3b8] mt-0.5">
                        {t(node.description as any)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Collapse button */}
      <div className="border-t px-4 py-4" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
        <button
          onClick={onCollapse}
          className="flex items-center gap-3 text-[#94a3b8] hover:text-[#f8fafc] transition-colors"
        >
          <PanelLeftClose className="w-[15px] h-[10px]" />
          <span className="text-xs font-semibold">Collapse</span>
        </button>
      </div>
    </aside>
  );
};

export default NodePalette;
