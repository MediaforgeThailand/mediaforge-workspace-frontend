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
  SlidersHorizontal,
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
  | "threed"
  | "image"
  | "vfx"
  | "video"
  | "audio"
  | "text"
  | "addon";

type ToolSection = "basics" | "media" | "vfx" | "video" | "threed" | "tools";
type VfxStage = "input" | "control" | "mask" | "generate";

const SECTION_ORDER: ToolSection[] = ["basics", "media", "vfx", "video", "threed", "tools"];
const SECTION_LABEL_KEYS: Record<ToolSection, TranslationKey> = {
  basics: "workspace.picker.section.basics",
  media: "workspace.picker.section.media",
  vfx: "workspace.picker.section.vfx",
  video: "workspace.picker.section.video",
  threed: "workspace.picker.section.threed",
  tools: "workspace.picker.section.tools",
};
const VFX_STAGE_ORDER: VfxStage[] = ["input", "control", "mask", "generate"];
const VFX_STAGE_META: Record<VfxStage, { label: string; hint: string }> = {
  input: {
    label: "1. Input & Plate Setup",
    hint: "Prepare source video, first frame, size, FPS, and base plates.",
  },
  control: {
    label: "2. Control Passes",
    hint: "Create structure guides like background, depth, edges, and pose.",
  },
  mask: {
    label: "3. Mask & Tracking",
    hint: "Define protected areas and motion guidance before generation.",
  },
  generate: {
    label: "4. Generate & Edit",
    hint: "Use prepared refs/masks to create or edit final VFX imagery.",
  },
};
export interface ToolItem {
  nodeType: string;
  action?: "upload" | "assets" | "stock" | "vfx-template";
  labelKey?: string;
  labelText?: string;
  descriptionKey?: string;
  descriptionText?: string;
  defaultLabel: string;
  section: ToolSection;
  category: ToolCategory;
  stage?: VfxStage;
  icon: LucideIcon;
  tint?: "violet" | "emerald" | "sky" | "amber" | "rose" | "zinc";
  isNew?: boolean;
  comingSoon?: boolean;
  initialData?: Record<string, unknown>;
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
    nodeType: "__vfx_template__",
    action: "vfx-template",
    labelText: "VFX Full Setup",
    descriptionText: "Create the full staged VFX graph: variables, input, controls, mask, track, and Qwen edit nodes.",
    defaultLabel: "VFX Full Setup",
    section: "vfx",
    category: "vfx",
    stage: "input",
    icon: Sparkles,
    tint: "amber",
    isNew: true,
    keywords: ["vfx", "template", "workflow", "setup", "comfy", "auto"],
  },
  {
    nodeType: "vfxVariableNode",
    labelText: "VFX Variables",
    descriptionText: "Central hub for video size, FPS, model pack names, and reusable workflow values.",
    defaultLabel: "VFX Variables",
    section: "vfx",
    category: "vfx",
    stage: "input",
    icon: SlidersHorizontal,
    tint: "sky",
    isNew: true,
    keywords: ["vfx", "variable", "set", "get", "rgthree", "workflow"],
  },
  {
    nodeType: "vfxStartFrameNode",
    labelText: "VFX Start Frame",
    descriptionText: "Extract a controllable first frame or start image from the source video.",
    defaultLabel: "VFX Start Frame",
    section: "vfx",
    category: "vfx",
    stage: "input",
    icon: ImageIcon,
    tint: "amber",
    isNew: true,
    keywords: ["vfx", "start frame", "preprocess", "video input", "comfy"],
  },
  {
    nodeType: "vfxBackgroundNode",
    labelText: "VFX Background",
    descriptionText: "Prepare grey, empty, or source background plates for later VFX generation.",
    defaultLabel: "VFX Background",
    section: "vfx",
    category: "vfx",
    stage: "control",
    icon: Film,
    tint: "emerald",
    isNew: true,
    keywords: ["vfx", "background", "plate", "grey", "preprocess"],
  },
  {
    nodeType: "vfxDepthNode",
    labelText: "VFX Depth",
    descriptionText: "Generate a depth control pass from video for spatial continuity.",
    defaultLabel: "VFX Depth",
    section: "vfx",
    category: "vfx",
    stage: "control",
    icon: Box,
    tint: "violet",
    isNew: true,
    keywords: ["vfx", "depth", "depthcrafter", "control", "preprocess"],
  },
  {
    nodeType: "vfxCannyNode",
    labelText: "VFX Canny",
    descriptionText: "Extract edge lines as a control pass for structure-preserving edits.",
    defaultLabel: "VFX Canny",
    section: "vfx",
    category: "vfx",
    stage: "control",
    icon: Scissors,
    tint: "sky",
    isNew: true,
    keywords: ["vfx", "canny", "edges", "line", "control"],
  },
  {
    nodeType: "vfxPoseNode",
    labelText: "VFX Pose",
    descriptionText: "Build a pose control pass to keep body movement consistent.",
    defaultLabel: "VFX Pose",
    section: "vfx",
    category: "vfx",
    stage: "control",
    icon: Users,
    tint: "rose",
    isNew: true,
    keywords: ["vfx", "pose", "dwpose", "person", "motion"],
  },
  {
    nodeType: "vfxTrackNode",
    labelText: "VFX Track",
    descriptionText: "Create tracking guidance from masks and video motion.",
    defaultLabel: "VFX Track",
    section: "vfx",
    category: "vfx",
    stage: "mask",
    icon: Maximize2,
    tint: "emerald",
    isNew: true,
    keywords: ["vfx", "track", "cotracker", "motion", "mask"],
  },
  {
    nodeType: "vfxMaskNode",
    labelText: "VFX Mask",
    descriptionText: "Generate and refine subject/object masks for protected VFX edits.",
    defaultLabel: "VFX Mask",
    section: "vfx",
    category: "vfx",
    stage: "mask",
    icon: Scissors,
    tint: "violet",
    isNew: true,
    keywords: ["vfx", "mask", "sam", "segmentation", "subject"],
  },
  {
    nodeType: "vfxQwenImageNode",
    labelText: "VFX Start Image",
    descriptionText: "Qwen first-frame design from a video frame or reference image, based on the Startimage workflow.",
    defaultLabel: "VFX Start Image",
    section: "vfx",
    category: "vfx",
    stage: "generate",
    icon: Sparkles,
    tint: "amber",
    isNew: true,
    initialData: {
      params: {
        nodeName: "VFX Start Image",
        workflow_preset: "start_image",
        model_name: "qwen-image-edit-2511-runpod",
        steps: 4,
        cfg: 1,
        denoise: 1,
        lightning_lora: "on",
        protect_original: "off",
        prompt:
          "Create a cinematic VFX start frame from the reference frame. Preserve the subject identity and camera perspective while designing the new environment.",
      },
    },
    keywords: ["vfx", "qwen", "start image", "first frame", "comfy", "runpod"],
  },
  {
    nodeType: "vfxQwenImageNode",
    labelText: "VFX Mask Edit",
    descriptionText: "Qwen masked image edit with protect-outside-mask controls for VFX plate fixes.",
    defaultLabel: "VFX Mask Edit",
    section: "vfx",
    category: "vfx",
    stage: "generate",
    icon: Scissors,
    tint: "amber",
    isNew: true,
    initialData: {
      params: {
        nodeName: "VFX Mask Edit",
        workflow_preset: "masked_edit",
        model_name: "qwen-image-edit-2511-runpod",
        steps: 40,
        cfg: 4,
        denoise: 1,
        protect_original: "on",
        mask_expand: 4,
        mask_feather: 12,
        prompt:
          "Edit only the masked area. Match the original lighting, perspective, texture, grain, and edge continuity.",
      },
    },
    keywords: ["vfx", "qwen", "image edit", "mask", "inpaint", "comfy", "runpod"],
  },
  {
    nodeType: "vfxQwenImageNode",
    labelText: "VFX Plate Generator",
    descriptionText: "Text-to-image background/reference plate generator for VFX look development.",
    defaultLabel: "VFX Plate Generator",
    section: "vfx",
    category: "vfx",
    stage: "generate",
    icon: ImageIcon,
    tint: "amber",
    initialData: {
      params: {
        nodeName: "VFX Plate Generator",
        workflow_preset: "plate_generate",
        model_name: "qwen-image-runpod",
        aspect_ratio: "16:9",
        width: 1664,
        height: 928,
        steps: 20,
        cfg: 4,
        denoise: 1,
        prompt:
          "Generate a clean cinematic VFX background plate with realistic lighting, production design, and camera perspective.",
      },
    },
    keywords: ["vfx", "qwen", "background", "plate", "reference", "comfy", "runpod"],
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

type ResolvedToolItem = ToolItem & {
  label: string;
  description: string;
};

const PANEL_WIDTH = 590;
const PANEL_MAX_HEIGHT = 430;
const CATEGORY_WIDTH = 184;

const CanvasContextMenu = ({ state, onClose, onPick, onAction }: Props) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [activeSection, setActiveSection] = useState<ToolSection>("basics");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleItems = useMemo<ResolvedToolItem[]>(() => {
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
          item.stage ? VFX_STAGE_META[item.stage].label : "",
          item.stage ? VFX_STAGE_META[item.stage].hint : "",
          ...(item.keywords ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
  }, [query, t]);

  const groupedItems = useMemo(() => {
    return SECTION_ORDER.map((section) => {
      const items = visibleItems
        .filter((item) => item.section === section)
      return {
        section,
        label: t(SECTION_LABEL_KEYS[section]),
        items,
      };
    }).filter((group) => group.items.length > 0);
  }, [t, visibleItems]);

  const activeGroup = useMemo(() => {
    return groupedItems.find((group) => group.section === activeSection)
      ?? groupedItems[0]
      ?? null;
  }, [activeSection, groupedItems]);

  const activeItems = activeGroup?.items ?? [];

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    if (highlight > activeItems.length - 1) {
      setHighlight(Math.max(0, activeItems.length - 1));
    }
  }, [activeItems.length, highlight]);

  useEffect(() => {
    const hasActiveSection = groupedItems.some((group) => group.section === activeSection);
    if (!hasActiveSection && groupedItems[0]) {
      setActiveSection(groupedItems[0].section);
    }
  }, [activeSection, groupedItems]);

  useEffect(() => {
    setHighlight(0);
  }, [activeSection]);

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
      if (activeItems.length === 0) return;
      setHighlight((current) => Math.min(activeItems.length - 1, current + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (activeItems.length === 0) return;
      setHighlight((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = activeItems[highlight];
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
    if (item.initialData) {
      event.dataTransfer.setData(
        "application/reactflow-overrides",
        JSON.stringify(item.initialData),
      );
    }
    event.dataTransfer.effectAllowed = "move";
    setTimeout(onClose, 0);
  };

  const renderToolRow = (item: ResolvedToolItem, index: number) => {
    const Icon = item.icon;
    const isHighlight = index === highlight;
    return (
      <li key={`${item.nodeType}-${item.defaultLabel}`}>
        <button
          type="button"
          draggable={!item.action && !item.comingSoon}
          disabled={item.comingSoon}
          title={item.description}
          onDragStart={(event) => onItemDragStart(event, item)}
          onMouseEnter={() => setHighlight(index)}
          onClick={() => fire(item)}
          className={cn(
            "group flex w-full items-center gap-[9px] rounded-[7px] px-[9px] py-[8px] text-left transition-colors",
            isHighlight
              ? "bg-white/[0.11] text-zinc-50"
              : "text-[#f2f2f2] hover:bg-white/[0.075] hover:text-zinc-50",
            item.comingSoon && "cursor-not-allowed opacity-45",
          )}
        >
          <span
            className={cn(
              "grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[6px] bg-white/[0.06]",
              item.tint === "sky" && "text-sky-300",
              item.tint === "emerald" && "text-emerald-300",
              item.tint === "amber" && "text-amber-300",
              item.tint === "violet" && "text-violet-300",
              item.tint === "rose" && "text-rose-300",
              item.tint === "zinc" && "text-zinc-300",
            )}
          >
            <Icon className="h-[14px] w-[14px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-[6px]">
              <span className="truncate text-[13px] font-semibold leading-[1.15] text-inherit">
                {item.label}
              </span>
              {item.isNew ? (
                <span className="rounded-[4px] bg-[#d7ff30]/15 px-[4px] py-[1px] text-[9px] font-bold leading-none text-[#dcff42]">
                  NEW
                </span>
              ) : null}
            </span>
            {item.description ? (
              <span className="mt-[3px] block truncate text-[11px] font-medium leading-[1.25] text-zinc-500 group-hover:text-zinc-400">
                {item.description}
              </span>
            ) : null}
          </span>
        </button>
      </li>
    );
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

        <div className="mt-[8px] flex min-h-0 flex-1 border-t border-white/[0.07]">
          {visibleItems.length === 0 ? (
            <div className="w-full px-1 py-8 text-center text-[14px] font-medium text-zinc-400">
              {t("workspace.picker.no_match", { query })}
            </div>
          ) : (
            <>
              <div
                className="shrink-0 border-r border-white/[0.07] px-[8px] py-[8px]"
                style={{ width: CATEGORY_WIDTH }}
              >
                <div className="space-y-[4px]">
                  {groupedItems.map((group) => {
                    const isActive = group.section === activeGroup?.section;
                    return (
                    <button
                      key={group.section}
                      type="button"
                      onMouseEnter={() => setActiveSection(group.section)}
                      onClick={() => setActiveSection(group.section)}
                      className={cn(
                        "flex h-[34px] w-full items-center justify-between rounded-[6px] px-[8px] text-left transition-colors",
                        isActive
                          ? "bg-white/[0.12] text-zinc-50"
                          : "text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100",
                      )}
                    >
                      <span className="truncate text-[11px] font-bold uppercase leading-none tracking-normal">
                        {group.label}
                      </span>
                      <span className="ml-[8px] rounded-full bg-white/[0.07] px-[6px] py-[2px] text-[10px] font-bold leading-none text-zinc-400">
                        {group.items.length}
                      </span>
                    </button>
                    );
                  })}
                </div>
              </div>

              <div className="ws-picker-scroll min-w-0 flex-1 overflow-y-auto px-[10px] py-[8px]">
                {activeGroup ? (
                  <div>
                    <div className="mb-[7px] flex h-[24px] items-center justify-between px-[2px]">
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-bold uppercase leading-none tracking-normal text-zinc-300">
                          {activeGroup.label}
                        </div>
                      </div>
                      <div className="text-[10px] font-semibold leading-none text-zinc-600">
                        {activeGroup.items.length} nodes
                      </div>
                    </div>
                    {activeGroup.section === "vfx" ? (
                      <div className="space-y-[9px]">
                        {VFX_STAGE_ORDER.map((stage) => {
                          const stageItems = activeGroup.items.filter((item) => item.stage === stage);
                          if (stageItems.length === 0) return null;
                          return (
                            <div key={stage}>
                              <div className="px-[3px] pb-[5px]">
                                <div className="text-[11px] font-bold leading-none text-zinc-300">
                                  {VFX_STAGE_META[stage].label}
                                </div>
                                <div className="mt-[3px] truncate text-[10px] font-medium leading-none text-zinc-600">
                                  {VFX_STAGE_META[stage].hint}
                                </div>
                              </div>
                              <ul className="space-y-[2px]">
                                {stageItems.map((item) => renderToolRow(item, activeItems.indexOf(item)))}
                              </ul>
                            </div>
                          );
                        })}
                        {activeGroup.items.some((item) => !item.stage) ? (
                          <ul className="space-y-[2px]">
                            {activeGroup.items
                              .filter((item) => !item.stage)
                              .map((item) => renderToolRow(item, activeItems.indexOf(item)))}
                          </ul>
                        ) : null}
                      </div>
                    ) : (
                      <ul className="space-y-[2px]">
                        {activeGroup.items.map((item, index) => renderToolRow(item, index))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
};

export default CanvasContextMenu;
