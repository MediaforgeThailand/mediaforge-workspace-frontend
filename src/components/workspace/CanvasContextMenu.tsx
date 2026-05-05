import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AudioLines,
  Box,
  Combine,
  FileVideo,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Layers2,
  LayoutGrid,
  Music,
  PenTool,
  Scissors,
  Search,
  Sparkles,
  Type,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/contexts/locales/en";

export type ToolCategory =
  | "all"
  | "media"
  | "character"
  | "image"
  | "video"
  | "audio"
  | "text"
  | "addon";

type ToolSection = "basics" | "media" | "references";

const SECTION_ORDER: ToolSection[] = ["basics", "media", "references"];
const SECTION_LABEL_KEYS: Record<ToolSection, TranslationKey> = {
  basics: "workspace.picker.section.basics",
  media: "workspace.picker.section.media",
  references: "workspace.picker.section.references",
};

const CATEGORY_TABS: Array<{
  id: ToolCategory;
  labelKey: TranslationKey;
  icon: LucideIcon;
}> = [
  { id: "all", labelKey: "workspace.picker.cat_all", icon: LayoutGrid },
  { id: "media", labelKey: "workspace.picker.cat_media", icon: Layers2 },
  { id: "character", labelKey: "workspace.picker.cat_character", icon: Users },
  { id: "image", labelKey: "workspace.picker.cat_image", icon: ImageIcon },
  { id: "video", labelKey: "workspace.picker.cat_video", icon: Film },
  { id: "audio", labelKey: "workspace.picker.cat_audio", icon: Music },
  { id: "text", labelKey: "workspace.picker.cat_text", icon: Type },
  { id: "addon", labelKey: "workspace.picker.cat_addon", icon: PenTool },
];

export interface ToolItem {
  nodeType: string;
  action?: "upload" | "assets" | "stock";
  labelKey?: TranslationKey;
  labelText?: string;
  descriptionKey?: TranslationKey;
  descriptionText?: string;
  defaultLabel: string;
  section: ToolSection;
  category: ToolCategory;
  icon: LucideIcon;
  tint?: "violet" | "emerald" | "sky" | "amber" | "rose" | "zinc";
  isNew?: boolean;
  comingSoon?: boolean;
  keywords?: string[];
  label?: string;
  description?: string;
}

const CATALOG: ToolItem[] = [
  {
    nodeType: "textNode",
    labelKey: "workspace.toolnames.text",
    descriptionKey: "workspace.toolnames.text_desc",
    defaultLabel: "Text",
    section: "basics",
    category: "text",
    icon: Type,
    tint: "violet",
    keywords: ["note", "prompt", "text"],
  },
  {
    nodeType: "imageGenNode",
    labelKey: "workspace.toolnames.image_gen",
    descriptionKey: "workspace.toolnames.image_gen_desc",
    defaultLabel: "Image Generation",
    section: "basics",
    category: "image",
    icon: ImageIcon,
    tint: "sky",
    keywords: ["banana", "seedream", "gpt image", "photo"],
  },
  {
    nodeType: "videoGenNode",
    labelKey: "workspace.toolnames.video_gen",
    descriptionKey: "workspace.toolnames.video_gen_desc",
    defaultLabel: "Video Generation",
    section: "basics",
    category: "video",
    icon: Film,
    tint: "emerald",
    keywords: ["kling", "seedance", "video"],
  },
  {
    nodeType: "chatAiNode",
    labelKey: "workspace.toolnames.assistant",
    descriptionKey: "workspace.toolnames.assistant_desc",
    defaultLabel: "Chat AI",
    section: "basics",
    category: "addon",
    icon: Sparkles,
    tint: "violet",
    keywords: ["chat", "ai", "gemini", "assistant"],
  },
  {
    nodeType: "audioGenNode",
    labelKey: "workspace.toolnames.audio_gen",
    descriptionKey: "workspace.toolnames.audio_gen_desc",
    defaultLabel: "Audio Generation",
    section: "basics",
    category: "audio",
    icon: AudioLines,
    tint: "amber",
    keywords: ["tts", "voice", "sound"],
  },
  {
    nodeType: "__upload__",
    action: "upload",
    labelKey: "workspace.toolnames.upload",
    descriptionKey: "workspace.toolnames.upload_desc",
    defaultLabel: "Upload",
    section: "media",
    category: "media",
    icon: Upload,
    tint: "zinc",
    keywords: ["file", "import", "media"],
  },
  {
    nodeType: "__assets__",
    action: "assets",
    labelKey: "workspace.toolnames.assets",
    descriptionKey: "workspace.toolnames.assets_desc",
    defaultLabel: "Assets",
    section: "media",
    category: "media",
    icon: FolderOpen,
    tint: "zinc",
    keywords: ["library", "files", "history"],
  },
  {
    nodeType: "__stock__",
    action: "stock",
    labelKey: "workspace.toolnames.stock",
    descriptionKey: "workspace.toolnames.stock_desc",
    defaultLabel: "Stock",
    section: "media",
    category: "media",
    icon: Search,
    tint: "zinc",
    keywords: ["stock", "freepik", "search"],
  },
  {
    nodeType: "elementNode",
    labelKey: "workspace.toolnames.kling_element",
    descriptionKey: "workspace.toolnames.kling_element_desc",
    defaultLabel: "Kling Element",
    section: "references",
    category: "character",
    icon: Users,
    tint: "rose",
    keywords: ["character", "identity", "element"],
  },
  {
    nodeType: "videoToPromptNode",
    labelKey: "workspace.toolnames.video_to_prompt",
    descriptionKey: "workspace.toolnames.video_to_prompt_desc",
    defaultLabel: "Video to Prompt",
    section: "references",
    category: "addon",
    icon: FileVideo,
    tint: "amber",
    keywords: ["analysis", "describe", "prompt"],
  },
  {
    nodeType: "removeBackgroundNode",
    labelKey: "workspace.toolnames.remove_bg",
    descriptionKey: "workspace.toolnames.remove_bg_desc",
    defaultLabel: "Remove Background",
    section: "references",
    category: "image",
    icon: Scissors,
    tint: "emerald",
    keywords: ["cutout", "transparent", "mask"],
  },
  {
    nodeType: "imageTo3dNode",
    labelKey: "workspace.toolnames.image_to_3d",
    descriptionKey: "workspace.toolnames.image_to_3d_desc",
    defaultLabel: "Image to 3D",
    section: "references",
    category: "image",
    icon: Box,
    tint: "violet",
    keywords: ["tripo", "mesh", "model"],
  },
  {
    nodeType: "mergeAudioNode",
    labelKey: "workspace.toolnames.merge_av",
    descriptionKey: "workspace.toolnames.merge_av_desc",
    defaultLabel: "Merge Audio + Video",
    section: "references",
    category: "addon",
    icon: Combine,
    tint: "amber",
    keywords: ["mux", "soundtrack", "audio video"],
  },
];

const TINT_CLASSES: Record<NonNullable<ToolItem["tint"]>, string> = {
  violet: "bg-violet-500/20 text-violet-300 ring-violet-300/10",
  emerald: "bg-emerald-500/20 text-emerald-300 ring-emerald-300/10",
  sky: "bg-sky-500/20 text-sky-300 ring-sky-300/10",
  amber: "bg-amber-500/20 text-amber-300 ring-amber-300/10",
  rose: "bg-rose-500/20 text-rose-300 ring-rose-300/10",
  zinc: "bg-zinc-700/60 text-zinc-300 ring-white/10",
};

export interface ContextMenuState {
  screen: { x: number; y: number };
  flow: { x: number; y: number };
}

interface Props {
  state: ContextMenuState;
  onClose: () => void;
  onPick: (item: ToolItem) => void;
  onAction: (item: ToolItem) => void;
}

const PANEL_WIDTH = 270;
const PANEL_MAX_HEIGHT = 440;

const CanvasContextMenu = ({ state, onClose, onPick, onAction }: Props) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<ToolCategory>("all");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG
      .map((item) => {
        const label = item.labelKey ? t(item.labelKey) : item.labelText ?? item.defaultLabel;
        const description = item.descriptionKey
          ? t(item.descriptionKey)
          : item.descriptionText ?? "";
        return { ...item, label, description };
      })
      .filter((item) => {
        if (active !== "all" && item.category !== active) return false;
        if (!q) return true;
        return [
          item.label,
          item.description,
          item.defaultLabel,
          ...(item.keywords ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
  }, [active, query, t]);

  const groupedItems = useMemo(() => {
    let nextIndex = 0;
    return SECTION_ORDER.map((section) => {
      const items = visibleItems
        .filter((item) => item.section === section)
        .map((item) => ({ item, index: nextIndex++ }));
      return { section, items };
    }).filter((group) => group.items.length > 0);
  }, [visibleItems]);

  useEffect(() => {
    setHighlight(0);
  }, [active, query]);

  useEffect(() => {
    if (highlight > visibleItems.length - 1) {
      setHighlight(Math.max(0, visibleItems.length - 1));
    }
  }, [highlight, visibleItems.length]);

  const viewportWidth = typeof window === "undefined" ? PANEL_WIDTH : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? PANEL_MAX_HEIGHT : window.innerHeight;
  const left = Math.min(state.screen.x, Math.max(8, viewportWidth - PANEL_WIDTH - 8));
  const top = Math.min(state.screen.y, Math.max(8, viewportHeight - PANEL_MAX_HEIGHT - 8));

  const fire = (item: ToolItem) => {
    if (item.comingSoon) return;
    if (item.action) onAction(item);
    else onPick(item);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (visibleItems.length === 0) return;
      setHighlight((current) => Math.min(visibleItems.length - 1, current + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (visibleItems.length === 0) return;
      setHighlight((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = visibleItems[highlight];
      if (item) fire(item);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  const onItemDragStart = (event: DragEvent, item: ToolItem) => {
    if (item.action || item.comingSoon) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("application/reactflow-type", item.nodeType);
    event.dataTransfer.setData("application/reactflow-label", item.defaultLabel);
    event.dataTransfer.effectAllowed = "move";
    setTimeout(onClose, 0);
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[1300]"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "fixed z-[1310] flex flex-col overflow-hidden rounded-[13px]",
          "bg-[#1f1f1f]/96 text-white backdrop-blur-xl",
          "shadow-[0_20px_70px_-28px_rgba(0,0,0,0.95),0_0_0_1px_rgba(255,255,255,0.025)]",
        )}
        style={{
          left,
          top,
          width: PANEL_WIDTH,
          maxHeight: PANEL_MAX_HEIGHT,
          fontFamily: "var(--font-sans)",
        }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <label className="flex h-9 shrink-0 items-center px-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("workspace.picker.search")}
            className="nodrag h-full min-w-0 flex-1 bg-transparent px-2 text-[14.5px] font-medium leading-none text-zinc-100 outline-none placeholder:text-zinc-500"
          />
        </label>

        <div className="flex shrink-0 items-center gap-0.5 px-2.5 py-1.5">
          {CATEGORY_TABS.map((category) => {
            const Icon = category.icon;
            const isActive = active === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setActive(category.id)}
                title={t(category.labelKey)}
                aria-label={t(category.labelKey)}
                aria-pressed={isActive}
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors [aspect-ratio:1/1]",
                  isActive
                    ? "bg-white/[0.10] text-zinc-50"
                    : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200",
                )}
              >
                <Icon className="h-[15px] w-[15px]" />
              </button>
            );
          })}
        </div>

        <div className="ws-picker-scroll max-h-[356px] overflow-y-auto px-2.5 pb-7">
          {visibleItems.length === 0 ? (
            <div className="px-1 py-8 text-center text-[14px] font-medium text-zinc-400">
              {t("workspace.picker.no_match", { query })}
            </div>
          ) : (
            groupedItems.map((group) => (
              <div key={group.section} className="pb-1">
                <div className="px-1 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.03em] text-zinc-500">
                  {t(SECTION_LABEL_KEYS[group.section])}
                </div>
                <ul className="space-y-px">
                  {group.items.map(({ item, index }) => {
                    const Icon = item.icon;
                    const isHighlight = index === highlight;
                    return (
                      <li key={`${item.nodeType}-${item.defaultLabel}`}>
                        <button
                          type="button"
                          draggable={!item.action && !item.comingSoon}
                          disabled={item.comingSoon}
                          onDragStart={(event) => onItemDragStart(event, item)}
                          onMouseEnter={() => setHighlight(index)}
                          onClick={() => fire(item)}
                          title={item.description}
                          className={cn(
                            "group flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left transition-colors",
                            isHighlight
                              ? "bg-white/[0.075] text-zinc-50"
                              : "text-zinc-200 hover:bg-white/[0.055] hover:text-zinc-50",
                            item.comingSoon && "cursor-not-allowed opacity-45",
                          )}
                        >
                          <span
                            className={cn(
                              "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[5px] ring-1 ring-inset [aspect-ratio:1/1]",
                              TINT_CLASSES[item.tint ?? "zinc"],
                            )}
                          >
                            <Icon className="h-[12.5px] w-[12.5px]" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium leading-none text-inherit">
                            {item.label}
                          </span>
                          {item.isNew && <Chip>{t("workspace.picker.new")}</Chip>}
                          {item.comingSoon && <Chip>{t("workspace.picker.soon")}</Chip>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-6 items-center gap-2.5 bg-gradient-to-t from-[#1f1f1f] via-[#1f1f1f]/96 to-transparent px-3 text-[10px] font-medium text-zinc-500">
          <HintKey>N</HintKey>
          <span>{t("workspace.picker.hint_open")}</span>
          <HintKey>↕</HintKey>
          <span>{t("workspace.picker.hint_navigate")}</span>
          <HintKey>↵</HintKey>
          <span>{t("workspace.picker.hint_insert")}</span>
        </div>
      </div>
    </>,
    document.body,
  );
};

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded bg-white/[0.08] px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none text-zinc-400">
      {children}
    </span>
  );
}

function HintKey({ children }: { children: ReactNode }) {
  return (
    <kbd className="grid h-[14px] min-w-[17px] place-items-center rounded bg-white/[0.08] px-1 font-mono text-[8.5px] font-semibold text-zinc-300">
      {children}
    </kbd>
  );
}

export default CanvasContextMenu;
