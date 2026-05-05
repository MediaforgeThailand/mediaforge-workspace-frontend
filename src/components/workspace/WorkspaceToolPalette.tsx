/**
 * Tool Palette — left rail.
 *
 * Compact icon-only vertical bar (Krea / Freepik feel). Each tool is
 * a draggable button; hovering one pops a tooltip out to the right
 * showing the tool's name, category, and a one-line description so
 * the user knows what it does without reading a 220px text list.
 *
 * Drag payload (matches legacy flow editor convention):
 *   application/reactflow-type   → NODE_API_SCHEMA key
 *   application/reactflow-label  → default display label
 *
 * Categories survive only as the tooltip subtitle. The bar itself is
 * a flat list because dividing the icons into named sections costs
 * more vertical space than it pays back.
 */

import {
  Sparkles, Film, AudioLines, Scissors, Combine, FileVideo,
  Users, Type, Box, type LucideIcon,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/contexts/locales/en";

interface PaletteItem {
  type: string;
  defaultLabel: string;
  labelKey: TranslationKey;
  categoryKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: LucideIcon;
}

const ITEMS: PaletteItem[] = [
  {
    type: "textNode",
    defaultLabel: "Text",
    labelKey: "workspace.toolnames.text",
    categoryKey: "workspace.picker.cat_text",
    descriptionKey: "workspace.toolnames.text_desc",
    icon: Type,
  },
  {
    type: "imageGenNode",
    defaultLabel: "Image Generation",
    labelKey: "workspace.toolnames.image_gen",
    categoryKey: "workspace.toolPalette.category.aiImage",
    descriptionKey: "workspace.toolnames.image_gen_desc",
    icon: Sparkles,
  },
  {
    type: "videoGenNode",
    defaultLabel: "Video Generation",
    labelKey: "workspace.toolnames.video_gen",
    categoryKey: "workspace.toolPalette.category.aiVideo",
    descriptionKey: "workspace.toolnames.video_gen_desc",
    icon: Film,
  },
  {
    type: "audioGenNode",
    defaultLabel: "Audio Generation",
    labelKey: "workspace.toolnames.audio_gen",
    categoryKey: "workspace.toolPalette.category.aiAudio",
    descriptionKey: "workspace.toolnames.audio_gen_desc",
    icon: AudioLines,
  },
  {
    type: "removeBackgroundNode",
    defaultLabel: "Remove Background",
    labelKey: "workspace.toolnames.remove_bg",
    categoryKey: "workspace.toolPalette.category.aiImage",
    descriptionKey: "workspace.toolnames.remove_bg_desc",
    icon: Scissors,
  },
  {
    type: "mergeAudioNode",
    defaultLabel: "Merge Audio + Video",
    labelKey: "workspace.toolnames.merge_av",
    categoryKey: "workspace.toolPalette.category.aiAudio",
    descriptionKey: "workspace.toolnames.merge_av_desc",
    icon: Combine,
  },
  {
    type: "elementNode",
    defaultLabel: "Kling Element",
    labelKey: "workspace.toolnames.kling_element",
    categoryKey: "workspace.picker.cat_character",
    descriptionKey: "workspace.toolnames.kling_element_desc",
    icon: Users,
  },
  {
    type: "videoToPromptNode",
    defaultLabel: "Video to Prompt",
    labelKey: "workspace.toolnames.video_to_prompt",
    categoryKey: "workspace.toolnames.assistant",
    descriptionKey: "workspace.toolnames.video_to_prompt_desc",
    icon: FileVideo,
  },
  {
    type: "imageTo3dNode",
    defaultLabel: "Image to 3D",
    labelKey: "workspace.toolnames.image_to_3d",
    categoryKey: "workspace.toolPalette.category.ai3d",
    descriptionKey: "workspace.toolnames.image_to_3d_desc",
    icon: Box,
  },
];

const onDragStart = (e: React.DragEvent, type: string, label: string) => {
  e.dataTransfer.setData("application/reactflow-type", type);
  e.dataTransfer.setData("application/reactflow-label", label);
  e.dataTransfer.effectAllowed = "move";
};

const WorkspaceToolPalette = () => {
  return (
    <aside className="ws-tool-palette flex h-full w-[52px] shrink-0 flex-col items-center gap-1 bg-zinc-950 py-2">
      {ITEMS.map((item) => (
        <PaletteIcon key={item.type} item={item} />
      ))}
    </aside>
  );
};

export default WorkspaceToolPalette;

/* ─── Atom: hover-tooltip icon button ──────────────────────── */

function PaletteIcon({ item }: { item: PaletteItem }) {
  const { t } = useLanguage();
  const Icon = item.icon;
  const label = t(item.labelKey);
  const category = t(item.categoryKey);
  const description = t(item.descriptionKey);
  return (
    <div className="ws-tool-icon group relative">
      <button
        type="button"
        draggable
        onDragStart={(e) => onDragStart(e, item.type, item.defaultLabel)}
        className="flex h-10 w-10 cursor-grab items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-zinc-100 active:cursor-grabbing active:bg-zinc-700"
        aria-label={label}
      >
        <Icon className="h-[18px] w-[18px]" />
      </button>

      {/* Tooltip — reveal on hover. Lives inside the icon's stacking
       *  context but absolutely positioned to the right so it
       *  overflows the 52px palette without affecting layout. */}
      <div
        role="tooltip"
        className="ws-tool-tooltip pointer-events-none absolute left-full top-1/2 z-[80] ml-2 w-[260px] -translate-y-1/2 rounded-lg bg-zinc-900/95 px-3.5 py-3 opacity-0 shadow-xl shadow-black/40 transition-opacity duration-150 group-hover:opacity-100 backdrop-blur"
      >
        <div className="text-[15px] font-semibold leading-5 text-white">
          {label}
        </div>
        <div className="mt-0.5 text-[12.5px] font-semibold uppercase text-zinc-300">
          {category}
        </div>
        <div className="mt-1.5 text-[13.5px] leading-5 text-zinc-300">
          {description}
        </div>
      </div>
    </div>
  );
}
