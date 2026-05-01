/**
 * Canvas tool picker — categorised, searchable, keyboard-driven.
 *
 * Activation:
 *   - Right-click anywhere on the canvas → opens at the cursor.
 *   - Click "+" in the floating sidebar → opens beside the trigger.
 *   - `N` global shortcut (legacy, still wired) → opens at viewport
 *     centre via the older CanvasNodePicker — that path is now mostly
 *     reserved for "drag wire onto empty canvas" disambiguation.
 *
 * Visual model (Krea / Magnific-style):
 *   - Soft dark surface, rounded-2xl, ring-of-light edge.
 *   - Big search bar at the head, full-width.
 *   - Category strip as one row of rounded-icon buttons; the active
 *     one gets a filled tint, the rest stay quiet.
 *   - Tool rows: tinted icon tile on the left + name + optional
 *     subtitle + optional "New" pill / "∞" credit chip.
 *   - Hover row reveals a subtle accent — picking is one click.
 *   - Footer is a row of dim mono hints (N Open · ↑↓ Navigate · ↵
 *     Insert).
 *
 * Keyboard:
 *   ↑ / ↓ navigate the visible list, ⏎ insert, Esc close.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Lucide from "lucide-react";
import {
  Search,
  LayoutGrid,
  Layers,
  Sparkles,
  Image as ImageIcon,
  Film,
  Music,
  Type,
  PenTool,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

/* ── Categories ────────────────────────────────────────────── */

export type ToolCategory =
  | "all"
  | "media"
  | "character"
  | "image"
  | "video"
  | "audio"
  | "text"
  | "addon";

type CatLabelKey =
  | "workspace.picker.cat_all"
  | "workspace.picker.cat_media"
  | "workspace.picker.cat_character"
  | "workspace.picker.cat_image"
  | "workspace.picker.cat_video"
  | "workspace.picker.cat_audio"
  | "workspace.picker.cat_text"
  | "workspace.picker.cat_addon";

const CATEGORY_TABS: Array<{
  id: ToolCategory;
  labelKey: CatLabelKey;
  icon: LucideIcon;
}> = [
  { id: "all", labelKey: "workspace.picker.cat_all", icon: LayoutGrid },
  { id: "media", labelKey: "workspace.picker.cat_media", icon: Layers },
  { id: "character", labelKey: "workspace.picker.cat_character", icon: Sparkles },
  { id: "image", labelKey: "workspace.picker.cat_image", icon: ImageIcon },
  { id: "video", labelKey: "workspace.picker.cat_video", icon: Film },
  { id: "audio", labelKey: "workspace.picker.cat_audio", icon: Music },
  { id: "text", labelKey: "workspace.picker.cat_text", icon: Type },
  { id: "addon", labelKey: "workspace.picker.cat_addon", icon: PenTool },
];

/* ── Catalog ────────────────────────────────────────────────
 *
 * One row per spawnable tool. `subtitle` shows under the label for
 * variants under a parent (think "Auto · Image Generator"); leave
 * undefined for top-level tools. `comingSoon` greys the row out and
 * disables clicks so users can preview the roadmap. */
type ToolLabelKey =
  | "workspace.toolnames.text" | "workspace.toolnames.image_gen" | "workspace.toolnames.video_gen"
  | "workspace.toolnames.audio_gen" | "workspace.toolnames.video_to_prompt" | "workspace.toolnames.upload"
  | "workspace.toolnames.assets" | "workspace.toolnames.stock" | "workspace.toolnames.kling_element"
  | "workspace.toolnames.remove_bg" | "workspace.toolnames.image_to_3d" | "workspace.toolnames.merge_av";
type ToolDescKey =
  | "workspace.toolnames.text_desc" | "workspace.toolnames.image_gen_desc" | "workspace.toolnames.video_gen_desc"
  | "workspace.toolnames.audio_gen_desc" | "workspace.toolnames.video_to_prompt_desc" | "workspace.toolnames.upload_desc"
  | "workspace.toolnames.assets_desc" | "workspace.toolnames.stock_desc" | "workspace.toolnames.kling_element_desc"
  | "workspace.toolnames.remove_bg_desc" | "workspace.toolnames.image_to_3d_desc" | "workspace.toolnames.merge_av_desc";

export interface ToolItem {
  nodeType: string;
  /** When set, fires a non-spawn action — Upload / Assets / Stock —
   *  routed back to the canvas via the menu's `onAction` callback. */
  action?: "upload" | "assets" | "stock";
  /** Translation key for the visible label in the picker. */
  labelKey: ToolLabelKey;
  subtitle?: string;
  /** Stable English label saved as `node.data.label` when spawned.
   *  NOT translated — keeps node names language-agnostic. */
  defaultLabel: string;
  /** Translation key for the description / tooltip / search corpus. */
  descriptionKey: ToolDescKey;
  category: ToolCategory;
  icon: LucideIcon;
  /** Tint colour family for the icon tile background. Pre-mapped
   *  inside the component to a semi-transparent gradient. */
  tint?: "violet" | "emerald" | "sky" | "amber" | "rose" | "zinc";
  isNew?: boolean;
  comingSoon?: boolean;
  keywords?: string[];
  /** Convenience accessors — populated at render time so the consumer
   *  callback (`onPick`) gets a plain `label` / `description` in the
   *  user's current language without having to call useLanguage itself. */
  label?: string;
  description?: string;
}

const CATALOG: ToolItem[] = [
  // ── BASICS ────────────────────────────────────────────────
  {
    nodeType: "textNode",
    labelKey: "workspace.toolnames.text",
    defaultLabel: "Text",
    descriptionKey: "workspace.toolnames.text_desc",
    category: "text",
    icon: Lucide.Type,
    tint: "sky",
    keywords: ["prompt", "string", "note"],
  },
  {
    nodeType: "imageGenNode",
    labelKey: "workspace.toolnames.image_gen",
    defaultLabel: "Image Generation",
    descriptionKey: "workspace.toolnames.image_gen_desc",
    category: "image",
    icon: Lucide.Sparkles,
    tint: "violet",
    keywords: ["banana", "seeddream", "gpt", "ai"],
  },
  {
    nodeType: "videoGenNode",
    labelKey: "workspace.toolnames.video_gen",
    defaultLabel: "Video Generation",
    descriptionKey: "workspace.toolnames.video_gen_desc",
    category: "video",
    icon: Lucide.Film,
    tint: "rose",
    keywords: ["kling", "seeddance", "omni"],
  },
  {
    nodeType: "audioGenNode",
    labelKey: "workspace.toolnames.audio_gen",
    defaultLabel: "Audio Generation",
    descriptionKey: "workspace.toolnames.audio_gen_desc",
    category: "audio",
    icon: Lucide.AudioLines,
    tint: "amber",
    isNew: true,
    keywords: ["voice", "tts", "speech", "gemini", "narration"],
  },
  {
    nodeType: "videoToPromptNode",
    labelKey: "workspace.toolnames.video_to_prompt",
    defaultLabel: "Video to Prompt",
    descriptionKey: "workspace.toolnames.video_to_prompt_desc",
    category: "addon",
    icon: Lucide.FileVideo,
    tint: "amber",
    keywords: ["assistant", "describe"],
  },

  // ── MEDIA ─────────────────────────────────────────────────
  {
    nodeType: "__upload__",
    action: "upload",
    labelKey: "workspace.toolnames.upload",
    defaultLabel: "Upload",
    descriptionKey: "workspace.toolnames.upload_desc",
    category: "media",
    icon: Lucide.Upload,
    tint: "sky",
    keywords: ["file", "import"],
  },
  {
    nodeType: "__assets__",
    action: "assets",
    labelKey: "workspace.toolnames.assets",
    defaultLabel: "Assets",
    descriptionKey: "workspace.toolnames.assets_desc",
    category: "media",
    icon: Lucide.Layers,
    tint: "emerald",
    keywords: ["library", "history"],
  },
  {
    nodeType: "__stock__",
    action: "stock",
    labelKey: "workspace.toolnames.stock",
    defaultLabel: "Stock",
    descriptionKey: "workspace.toolnames.stock_desc",
    category: "media",
    icon: Lucide.Globe,
    tint: "zinc",
    comingSoon: true,
    keywords: ["freepik", "library"],
  },

  // ── CHARACTER ─────────────────────────────────────────────
  {
    nodeType: "elementNode",
    labelKey: "workspace.toolnames.kling_element",
    defaultLabel: "Kling Element",
    descriptionKey: "workspace.toolnames.kling_element_desc",
    category: "character",
    icon: Lucide.Users,
    tint: "rose",
    keywords: ["consistency", "identity", "actor"],
  },

  // ── IMAGE ─────────────────────────────────────────────────
  {
    nodeType: "removeBackgroundNode",
    labelKey: "workspace.toolnames.remove_bg",
    defaultLabel: "Remove Background",
    descriptionKey: "workspace.toolnames.remove_bg_desc",
    category: "image",
    icon: Lucide.Scissors,
    tint: "emerald",
    keywords: ["cutout", "transparent", "matte"],
  },
  {
    nodeType: "imageTo3dNode",
    labelKey: "workspace.toolnames.image_to_3d",
    defaultLabel: "Image to 3D",
    descriptionKey: "workspace.toolnames.image_to_3d_desc",
    category: "image",
    icon: Lucide.Box,
    tint: "violet",
    isNew: true,
    keywords: ["tripo", "model3d", "mesh"],
  },

  // ── ADDON ─────────────────────────────────────────────────
  {
    nodeType: "mergeAudioNode",
    labelKey: "workspace.toolnames.merge_av",
    defaultLabel: "Merge Audio + Video",
    descriptionKey: "workspace.toolnames.merge_av_desc",
    category: "addon",
    icon: Lucide.Combine,
    tint: "amber",
    keywords: ["mux", "soundtrack"],
  },
];

/** Tint → CSS gradient + icon-color pair for the icon tile. Centralised
 *  so swapping the palette later is a one-file change. */
const TINT_STYLE: Record<
  NonNullable<ToolItem["tint"]>,
  { bg: string; fg: string }
> = {
  violet:  { bg: "linear-gradient(140deg, hsl(258 75% 25% / 0.55), hsl(258 80% 18% / 0.55))", fg: "hsl(258 90% 80%)" },
  emerald: { bg: "linear-gradient(140deg, hsl(160 65% 22% / 0.55), hsl(160 70% 14% / 0.55))", fg: "hsl(160 75% 65%)" },
  sky:     { bg: "linear-gradient(140deg, hsl(205 70% 25% / 0.55), hsl(205 75% 16% / 0.55))", fg: "hsl(205 90% 75%)" },
  amber:   { bg: "linear-gradient(140deg, hsl(35 75% 30% / 0.55), hsl(35 80% 22% / 0.55))",   fg: "hsl(40 95% 70%)" },
  rose:    { bg: "linear-gradient(140deg, hsl(340 70% 28% / 0.55), hsl(340 75% 18% / 0.55))", fg: "hsl(345 85% 75%)" },
  zinc:    { bg: "linear-gradient(140deg, hsl(0 0% 22% / 0.55), hsl(0 0% 14% / 0.55))",       fg: "hsl(0 0% 70%)" },
};

/* ── Component ─────────────────────────────────────────────── */

export interface ContextMenuState {
  /** Anchor in viewport pixels. */
  screen: { x: number; y: number };
  /** Where the spawned node should land (flow coords). */
  flow: { x: number; y: number };
}

interface Props {
  state: ContextMenuState;
  onClose: () => void;
  onPick: (item: ToolItem) => void;
  onAction: (item: ToolItem) => void;
}

const PANEL_WIDTH = 360;
const PANEL_MAX_HEIGHT = 540;
/* Visual scale applied via CSS `transform: scale()` with the
 * top-left as the origin. Keeps the design tokens (paddings, gaps,
 * radii, font-sizes) untouched so the proportions still match the
 * Figma spec, while making the whole panel land smaller on screen.
 * 0.8 = 20 % smaller — what the team asked for. */
const DESKTOP_PANEL_SCALE = 0.8;

const CanvasContextMenu = ({ state, onClose, onPick, onAction }: Props) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<ToolCategory>("all");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelScale =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
      ? 1
      : DESKTOP_PANEL_SCALE;
  const visualWidth = PANEL_WIDTH * panelScale;
  const visualMaxHeight = PANEL_MAX_HEIGHT * panelScale;

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG
      .map((it) => ({
        ...it,
        label: t(it.labelKey),
        description: t(it.descriptionKey),
      }))
      .filter((it) => {
        if (active !== "all" && it.category !== active) return false;
        if (!q) return true;
        const hay =
          `${it.label} ${it.subtitle ?? ""} ${it.description} ${(it.keywords ?? []).join(" ")}`.toLowerCase();
        return hay.includes(q);
      });
  }, [query, active, t]);

  useEffect(() => {
    setHighlight(0);
  }, [query, active]);

  // Clamp using the VISUAL (post-scale) footprint so the right /
  // bottom edge guard accounts for the actual rendered size.
  const left = Math.min(
    state.screen.x,
    Math.max(8, window.innerWidth - visualWidth - 8),
  );
  const top = Math.min(
    state.screen.y,
    Math.max(8, window.innerHeight - visualMaxHeight - 8),
  );

  const fire = (it: ToolItem) => {
    if (it.comingSoon) return;
    if (it.action) onAction(it);
    else onPick(it);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[highlight];
      if (it) fire(it);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const onItemDragStart = (e: React.DragEvent, it: ToolItem) => {
    if (it.action || it.comingSoon) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("application/reactflow-type", it.nodeType);
    e.dataTransfer.setData("application/reactflow-label", it.defaultLabel);
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => onClose(), 0);
  };

  return createPortal(
    <>
      {/* Click-outside scrim, including swallowing native context menu. */}
      <div
        className="fixed inset-0 z-[1300]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "fixed z-[1310] flex flex-col overflow-hidden",
          "rounded-2xl border border-white/10",
          // Stacked surface treatment:
          //  1. very-dark zinc base for legibility
          //  2. a faint top-light gradient overlay (drawn via the
          //     ::before of an inner wrapper) so the panel reads as
          //     glass-sheened rather than flat
          //  3. soft drop shadow that grounds it on the canvas
          "bg-[hsl(220_10%_8%)]/95 backdrop-blur-2xl",
          "shadow-[0_24px_60px_-20px_hsl(0_0%_0%/0.7),0_0_0_1px_hsl(0_0%_100%/0.04)]",
        )}
        style={{
          left,
          top,
          width: PANEL_WIDTH,
          maxHeight: PANEL_MAX_HEIGHT,
          fontFamily: "'Prompt', system-ui, sans-serif",
          // CSS `transform: scale` shrinks the entire panel uniformly.
          // `transform-origin: top left` keeps the click point pinned
          // to the panel's visible top-left, so the existing
          // (left, top) coordinates still correspond to where the
          // user right-clicked. The visual-size constants above are
          // what the edge-clamp uses.
          transform: `scale(${panelScale})`,
          transformOrigin: "top left",
        }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Top sheen — single thin gradient strip that gives the panel
         *  a frosted-glass highlight along its top edge. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
        />

        {/* ── Search ── */}
        <div className="px-3 pt-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder={t("workspace.picker.search")}
              className={cn(
                "nodrag w-full rounded-xl border border-white/[0.06] bg-white/[0.04] py-3 pl-9 pr-3 lg:py-2.5",
                "text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500",
                "transition-colors focus:border-white/10 focus:bg-white/[0.06]",
              )}
            />
          </div>
        </div>

        {/* ── Category tabs ── */}
        <div className="flex items-center gap-1 px-3 pb-2">
          {CATEGORY_TABS.map((cat) => {
            const Icon = cat.icon;
            const isActive = active === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActive(cat.id)}
                title={t(cat.labelKey)}
                aria-pressed={isActive}
                className={cn(
                  "flex h-11 flex-1 items-center justify-center rounded-lg transition-all lg:h-9",
                  isActive
                    ? "bg-white/[0.08] text-zinc-50 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.06)]"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        {/* Hairline */}
        <div className="mx-3 mt-1 h-px bg-white/5" />

        {/* ── List ── */}
        <div className="ws-scroll-hide flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-10 text-center text-[12px] italic text-zinc-500">
              {t("workspace.picker.no_match", { query })}
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {filtered.map((it, i) => {
                const isHighlight = i === highlight;
                const Icon = it.icon;
                const tint = TINT_STYLE[it.tint ?? "zinc"];
                return (
                  <li key={`${it.nodeType}-${it.label}`}>
                    <button
                      type="button"
                      draggable={!it.action && !it.comingSoon}
                      onDragStart={(e) => onItemDragStart(e, it)}
                      onClick={() => fire(it)}
                      onMouseEnter={() => setHighlight(i)}
                      disabled={it.comingSoon}
                      title={it.description}
                      className={cn(
                        "group flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors lg:min-h-0",
                        isHighlight
                          ? "bg-white/[0.06]"
                          : "hover:bg-white/[0.04]",
                        it.comingSoon && "opacity-40",
                      )}
                    >
                      {/* Tinted icon tile */}
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-white/[0.06]"
                        style={{ background: tint.bg, color: tint.fg }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>

                      {/* Title + subtitle */}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-zinc-100">
                          {it.label}
                        </span>
                        {it.subtitle && (
                          <span className="block truncate text-[11px] text-zinc-500">
                            {it.subtitle}
                          </span>
                        )}
                      </span>

                      {/* Right-side chips */}
                      {it.isNew && <Chip kind="new">{t("workspace.picker.new")}</Chip>}
                      {it.comingSoon && <Chip kind="muted">{t("workspace.picker.soon")}</Chip>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center gap-4 border-t border-white/5 bg-black/20 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Kbd>N</Kbd> {t("workspace.picker.hint_open")}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↑↓</Kbd> {t("workspace.picker.hint_navigate")}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> {t("workspace.picker.hint_insert")}
          </span>
        </div>
      </div>
    </>,
    document.body,
  );
};

/* ── Atoms ─────────────────────────────────────────────────── */

function Chip({
  kind,
  children,
}: {
  kind: "new" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide",
        kind === "new"
          ? "bg-white/10 text-zinc-100 ring-1 ring-inset ring-white/10"
          : "bg-white/[0.04] text-zinc-500 ring-1 ring-inset ring-white/[0.06]",
      )}
    >
      {children}
    </span>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.1rem] items-center justify-center rounded border border-white/10 bg-white/[0.04] px-1 py-px text-[9px] font-bold text-zinc-300">
      {children}
    </kbd>
  );
}

export default CanvasContextMenu;
