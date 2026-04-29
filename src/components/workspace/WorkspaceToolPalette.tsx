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

interface PaletteItem {
  type: string;
  label: string;
  category: string;
  description: string;
  icon: LucideIcon;
}

const ITEMS: PaletteItem[] = [
  {
    type: "textNode",
    label: "Text",
    category: "Text",
    description:
      "Plain text node. Use @ to mention image / video assets — the mention turns into a chip and the model reads the asset as a ref.",
    icon: Type,
  },
  {
    type: "imageGenNode",
    label: "Image Gen",
    category: "AI · Image",
    description:
      "Generate or edit images. Pick a model: Banana (Gemini), SeedDream (BytePlus), or GPT Image 2 (OpenAI). Up to 14–16 ref images depending on model.",
    icon: Sparkles,
  },
  {
    type: "videoGenNode",
    label: "Video Gen",
    category: "AI · Video",
    description:
      "Generate videos. Kling family (Standard / Motion Control / Omni v3) and SeedDance. Omni v3 supports Element refs for character consistency.",
    icon: Film,
  },
  {
    type: "audioGenNode",
    label: "Audio Gen",
    category: "AI · Audio",
    description:
      "Generate narration with Gemini TTS voices. Output is an audio asset ready for Merge A/V.",
    icon: AudioLines,
  },
  {
    type: "removeBackgroundNode",
    label: "Remove BG",
    category: "AI · Image",
    description:
      "Strip the background from an image using BiRefNet (via Replicate). Output is a transparent PNG.",
    icon: Scissors,
  },
  {
    type: "mergeAudioNode",
    label: "Merge A/V",
    category: "AI · Audio",
    description: "Mux an audio track onto a video clip. Output is an MP4 with the new soundtrack.",
    icon: Combine,
  },
  {
    type: "elementNode",
    label: "Kling Element",
    category: "Character",
    description:
      "Save a character or object as a reusable Kling Omni element (4 ref + 1 frontal). Drop the saved element back onto any canvas later.",
    icon: Users,
  },
  {
    type: "videoToPromptNode",
    label: "Video to Prompt",
    category: "Assistant",
    description:
      "Read a video clip and write a scene-by-scene prompt breakdown — useful as input for a downstream Image / Video generator.",
    icon: FileVideo,
  },
  {
    type: "imageTo3dNode",
    label: "Image to 3D",
    category: "AI · 3D",
    description:
      "Turn a reference image into a 3D model (GLB) via Tripo3D. The result is saved to the node preview and asset library.",
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
    <aside className="ws-tool-palette flex h-full w-[52px] shrink-0 flex-col items-center gap-1 border-r border-zinc-800 bg-zinc-950 py-2">
      {ITEMS.map((item) => (
        <PaletteIcon key={item.type} item={item} />
      ))}
    </aside>
  );
};

export default WorkspaceToolPalette;

/* ─── Atom: hover-tooltip icon button ──────────────────────── */

function PaletteIcon({ item }: { item: PaletteItem }) {
  const Icon = item.icon;
  return (
    <div className="ws-tool-icon group relative">
      <button
        type="button"
        draggable
        onDragStart={(e) => onDragStart(e, item.type, item.label)}
        className="flex h-10 w-10 cursor-grab items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-zinc-100 active:cursor-grabbing active:bg-zinc-700"
        aria-label={item.label}
      >
        <Icon className="h-[18px] w-[18px]" />
      </button>

      {/* Tooltip — reveal on hover. Lives inside the icon's stacking
       *  context but absolutely positioned to the right so it
       *  overflows the 52px palette without affecting layout. */}
      <div
        role="tooltip"
        className="ws-tool-tooltip pointer-events-none absolute left-full top-1/2 z-[80] ml-2 w-[240px] -translate-y-1/2 rounded-md border border-zinc-700/80 bg-zinc-900/95 px-3 py-2 opacity-0 shadow-xl shadow-black/40 transition-opacity duration-150 group-hover:opacity-100 backdrop-blur"
      >
        <div className="text-[12px] font-semibold leading-tight text-zinc-100">
          {item.label}
        </div>
        <div className="mt-0.5 text-[9.5px] uppercase tracking-wide text-zinc-500">
          {item.category}
        </div>
        <div className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
          {item.description}
        </div>
      </div>
    </div>
  );
}
