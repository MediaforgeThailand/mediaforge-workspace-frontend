import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  AudioLines,
  Box,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Link,
  Maximize2,
  Languages,
  Scissors,
  Search,
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
  | "threed"
  | "image"
  | "video"
  | "audio"
  | "text"
  | "addon";

type ToolSection = "basics" | "media" | "video" | "threed" | "tools";

const SECTION_ORDER: ToolSection[] = ["basics", "media", "video", "threed", "tools"];
const SECTION_LABEL_KEYS: Record<ToolSection, TranslationKey> = {
  basics: "workspace.picker.section.basics",
  media: "workspace.picker.section.media",
  video: "workspace.picker.section.video",
  threed: "workspace.picker.section.threed",
  tools: "workspace.picker.section.tools",
};

export interface ToolItem {
  nodeType: string;
  action?: "upload" | "assets" | "stock";
  labelKey?: string;
  labelText?: string;
  descriptionKey?: string;
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
    nodeType: "voiceTranslateNode",
    labelKey: "workspace.toolnames.voice_translate",
    descriptionKey: "workspace.toolnames.voice_translate_desc",
    defaultLabel: "Dubbing",
    section: "basics",
    category: "audio",
    icon: Languages,
    tint: "sky",
    keywords: ["dubbing", "translate", "voice", "mp3", "mp4"],
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
    nodeType: "urlAssetNode",
    labelKey: "workspace.toolnames.url_asset",
    descriptionKey: "workspace.toolnames.url_asset_desc",
    defaultLabel: "URL to Asset",
    section: "media",
    category: "media",
    icon: Link,
    tint: "sky",
    isNew: true,
    keywords: ["url", "link", "import", "mp4", "mp3", "png", "asset"],
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
    section: "video",
    category: "addon",
    icon: Users,
    tint: "rose",
    keywords: ["character", "identity", "element"],
  },
  {
    nodeType: "removeBackgroundNode",
    labelKey: "workspace.toolnames.remove_bg",
    descriptionKey: "workspace.toolnames.remove_bg_desc",
    defaultLabel: "Remove Background",
    section: "tools",
    category: "image",
    icon: Scissors,
    tint: "emerald",
    keywords: ["cutout", "transparent", "mask"],
  },
  {
    nodeType: "upscaleImageNode",
    labelKey: "workspace.toolnames.upscale",
    descriptionKey: "workspace.toolnames.upscale_desc",
    defaultLabel: "Upscale Image",
    section: "tools",
    category: "image",
    icon: Maximize2,
    tint: "sky",
    keywords: ["upscale", "mediaforge", "resolution", "enhance"],
  },
  {
    nodeType: "imageTo3dNode",
    labelKey: "workspace.toolnames.image_to_3d",
    descriptionKey: "workspace.toolnames.image_to_3d_desc",
    defaultLabel: "Image to 3D",
    section: "threed",
    category: "threed",
    icon: Box,
    tint: "violet",
    keywords: ["tripo", "mesh", "model"],
  },
];

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
const PANEL_MAX_HEIGHT = 430;

const CanvasContextMenu = ({ state, onClose, onPick, onAction }: Props) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
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
  }, [query, t]);

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
  }, [query]);

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
          "fixed z-[1310] flex flex-col overflow-hidden rounded-[9px]",
          "border border-white/[0.12] bg-[#101111] text-white",
          "shadow-[0_18px_46px_rgba(0,0,0,.54)]",
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
        <label className="mx-[10px] mt-[10px] flex h-[38px] shrink-0 items-center rounded-[7px] bg-[#151616] px-[11px] ring-1 ring-white/[0.1] transition focus-within:ring-[#f4ff00]/45">
          <Search className="h-[15px] w-[15px] shrink-0 text-[#83878d]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("workspace.picker.search")}
            className="nodrag h-full min-w-0 flex-1 bg-transparent px-2 text-[14px] font-medium leading-none text-zinc-100 outline-none placeholder:text-[#777a80]"
          />
        </label>

        <div className="ws-picker-scroll mt-[8px] max-h-[372px] overflow-y-auto px-[8px] pb-[8px]">
          {visibleItems.length === 0 ? (
            <div className="px-1 py-8 text-center text-[14px] font-medium text-zinc-400">
              {t("workspace.picker.no_match", { query })}
            </div>
          ) : (
            groupedItems.map((group) => (
              <div key={group.section} className="pb-[8px]">
                <div className="px-[6px] pb-[5px] pt-[5px] text-[11px] font-medium uppercase tracking-normal text-[#7b7f86]">
                  {t(SECTION_LABEL_KEYS[group.section])}
                </div>
                <ul className="space-y-[1px]">
                  {group.items.map(({ item, index }) => {
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
                          className={cn(
                            "group flex h-[28px] w-full items-center rounded-[4px] px-[8px] text-left transition-colors",
                            isHighlight
                              ? "bg-white/[0.12] text-zinc-50"
                              : "text-[#f2f2f2] hover:bg-white/[0.08] hover:text-zinc-50",
                            item.comingSoon && "cursor-not-allowed opacity-45",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-none text-inherit">
                            {item.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </>,
    document.body,
  );
};

export default CanvasContextMenu;
