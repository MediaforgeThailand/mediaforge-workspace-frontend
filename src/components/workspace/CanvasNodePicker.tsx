/**
 * Spawn-from-edge picker.
 *
 * When the user drags a wire from any handle (input or output) and
 * releases on empty canvas, this floating panel appears at the drop
 * point with a list of node types whose ports can complete the wire.
 *
 * Port-type matching is heuristic-but-deterministic — based on handle
 * id naming + the active model's schema. Picking an option spawns
 * the chosen node at the drop position and immediately wires it up.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Lucide from "lucide-react";
import { cn } from "@/lib/utils";
import type { Node } from "@xyflow/react";
import { getWorkspaceSchema } from "./workspaceSchema";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/contexts/locales/en";

export type WirePortType = "text" | "image" | "video" | "audio" | "element";

export interface PickerOption {
  /** node.type to spawn */
  nodeType: string;
  /** Display label in the row */
  label: string;
  labelKey: TranslationKey;
  /** lucide icon name */
  icon: string;
  /** Default `data.label` for the new node */
  defaultLabel: string;
  /**
   * Where the wire connects on the new node:
   *   - if user dragged from an OUTPUT, this is the new node's input handle
   *   - if user dragged from an INPUT,  this is the new node's output handle
   */
  newNodeHandle: string;
  /** One-line hint of which port the wire will land in (mono, muted) */
  portHint: string;
  portHintKey: TranslationKey;
  /** Optional initial data overrides for the spawned node. */
  initialData?: Record<string, unknown>;
}

export interface CanvasNodePickerState {
  /** Screen pixel coords to anchor the panel. */
  screen: { x: number; y: number };
  /** Flow coords where the new node lands. */
  flow: { x: number; y: number };
  /** The node the user dragged from. `null` when the picker is opened
   *  without a source (keyboard `N` shortcut or top-bar "+" button) —
   *  in that case every catalog entry is shown unfiltered. */
  fromNode: Node | null;
  /** Handle id on `fromNode` — `null` for the no-source case. */
  fromHandleId: string | null;
  /** True when the dragged handle is a source (output). Ignored when
   *  `fromNode` is null. */
  fromIsOutput: boolean;
}

/** Coarse type inference from handle id naming. Matches the workspace
 *  conventions used everywhere else in the canvas. */
export function portTypeOf(
  node: Node,
  handleId: string,
  isOutput: boolean,
): WirePortType | null {
  const t = node.type ?? "";

  // Workspace-native node sources / sinks.
  if (t === "textNode") return "text";
  if (t === "elementNode") return "element";
  if (t === "assetNode") {
    const ft = (node.data as { fieldType?: string } | undefined)?.fieldType;
    if (ft === "video") return "video";
    if (ft === "audio") return "audio";
    return "image";
  }

  // Schema-driven nodes — look up the handle, then fall back to id naming.
  const schema = getWorkspaceSchema(t);
  if (schema) {
    const handles = isOutput ? schema.outputs : schema.inputs;
    const handle = handles.find((h) => h.id === handleId);
    void handle; // we only use the id below; keeping the lookup as a check.
  }

  if (handleId === "text" || handleId === "context" || handleId === "context_text") return "text";
  if (handleId === "audio") return "audio";
  if (handleId === "elements") return "element";
  if (handleId.includes("video")) return "video";
  // Default for image-shaped handle ids (ref_image, start_frame, end_frame,
  // image, image_input, output_*_frame, etc.).
  return "image";
}

/* ────────────────────────────────────────────────────────────── */
/* Compatibility catalogues                                       */
/*                                                                */
/* For each picker option, declare what we'd plug the wire into   */
/* on the new node. Keep this minimal — wireframe stage only —    */
/* and grow when new node types ship.                             */
/* ────────────────────────────────────────────────────────────── */

interface CatalogEntry {
  nodeType: string;
  label: string;
  labelKey: TranslationKey;
  defaultLabel: string;
  icon: string;
  /** Handles on this node that can RECEIVE a wire (target side). */
  inputs: Array<{ id: string; type: WirePortType; hint: string; hintKey: TranslationKey }>;
  /** Handles on this node that can SEND a wire (source side). */
  outputs: Array<{ id: string; type: WirePortType; hint: string; hintKey: TranslationKey }>;
}

const lucideIcon = (name: string): Lucide.LucideIcon => {
  const icons = Lucide as unknown as Record<string, Lucide.LucideIcon>;
  return icons[name] ?? Lucide.Box;
};

const CATALOG: CatalogEntry[] = [
  {
    nodeType: "textNode",
    label: "Text",
    labelKey: "workspace.toolnames.text",
    defaultLabel: "Text",
    icon: "Type",
    inputs: [],
    outputs: [{ id: "default", type: "text", hint: "text", hintKey: "workspace.picker.port.text" }],
  },
  {
    nodeType: "imageGenNode",
    label: "Image Gen",
    labelKey: "workspace.toolnames.image_gen",
    defaultLabel: "Image Generation",
    icon: "Sparkles",
    inputs: [
      { id: "text", type: "text", hint: "→ prompt", hintKey: "workspace.picker.port.to_prompt" },
      { id: "ref_image", type: "image", hint: "→ ref image", hintKey: "workspace.picker.port.to_ref_image" },
    ],
    outputs: [{ id: "image", type: "image", hint: "image", hintKey: "workspace.picker.port.image" }],
  },
  {
    nodeType: "videoGenNode",
    label: "Video Gen",
    labelKey: "workspace.toolnames.video_gen",
    defaultLabel: "Video Generation",
    icon: "Film",
    inputs: [
      { id: "text", type: "text", hint: "→ prompt", hintKey: "workspace.picker.port.to_prompt" },
      { id: "start_frame", type: "image", hint: "→ start frame", hintKey: "workspace.picker.port.to_start_frame" },
      { id: "end_frame", type: "image", hint: "→ end frame", hintKey: "workspace.picker.port.to_end_frame" },
      { id: "ref_image", type: "image", hint: "→ ref image", hintKey: "workspace.picker.port.to_ref_image" },
      { id: "reference_image", type: "image", hint: "→ reference image", hintKey: "workspace.picker.port.to_reference_image" },
      { id: "ref_video", type: "video", hint: "→ ref video", hintKey: "workspace.picker.port.to_ref_video" },
      { id: "elements", type: "element", hint: "→ elements", hintKey: "workspace.picker.port.to_elements" },
    ],
    outputs: [
      { id: "output_video", type: "video", hint: "video", hintKey: "workspace.picker.port.video" },
      { id: "output_start_frame", type: "image", hint: "first frame", hintKey: "workspace.picker.port.first_frame" },
      { id: "output_end_frame", type: "image", hint: "last frame", hintKey: "workspace.picker.port.last_frame" },
      { id: "output_last_frame", type: "image", hint: "last frame", hintKey: "workspace.picker.port.last_frame" },
    ],
  },
  {
    nodeType: "removeBackgroundNode",
    label: "BG Remove",
    labelKey: "workspace.toolnames.remove_bg",
    defaultLabel: "Remove Background",
    icon: "Scissors",
    inputs: [{ id: "image", type: "image", hint: "→ image", hintKey: "workspace.picker.port.to_image" }],
    outputs: [{ id: "image", type: "image", hint: "cutout", hintKey: "workspace.picker.port.cutout" }],
  },
  {
    nodeType: "mergeAudioNode",
    label: "Audio Merge",
    labelKey: "workspace.toolnames.merge_av",
    defaultLabel: "Merge Audio + Video",
    icon: "Combine",
    inputs: [
      { id: "video", type: "video", hint: "→ video", hintKey: "workspace.picker.port.to_video" },
      { id: "audio", type: "audio", hint: "→ audio", hintKey: "workspace.picker.port.to_audio" },
    ],
    outputs: [{ id: "output_video", type: "video", hint: "video", hintKey: "workspace.picker.port.video" }],
  },
  {
    nodeType: "chatAiNode",
    label: "Chat AI",
    labelKey: "workspace.toolnames.assistant",
    defaultLabel: "Chat AI",
    icon: "MessageSquare",
    inputs: [{ id: "context", type: "text", hint: "→ context", hintKey: "workspace.picker.port.to_context" }],
    outputs: [{ id: "text", type: "text", hint: "text", hintKey: "workspace.picker.port.text" }],
  },
  {
    nodeType: "audioGenNode",
    label: "Audio Gen",
    labelKey: "workspace.toolnames.audio_gen",
    defaultLabel: "Audio Generation",
    icon: "AudioLines",
    inputs: [{ id: "text", type: "text", hint: "→ script", hintKey: "workspace.picker.port.to_script" }],
    outputs: [{ id: "audio", type: "audio", hint: "audio", hintKey: "workspace.picker.port.audio" }],
  },
  {
    nodeType: "videoToPromptNode",
    label: "Video to Prompt",
    labelKey: "workspace.toolnames.video_to_prompt",
    defaultLabel: "Video to Prompt",
    icon: "FileVideo",
    inputs: [{ id: "video", type: "video", hint: "→ video", hintKey: "workspace.picker.port.to_video" }],
    outputs: [{ id: "text", type: "text", hint: "prompt", hintKey: "workspace.picker.port.prompt" }],
  },
  {
    nodeType: "imageTo3dNode",
    label: "Image to 3D",
    labelKey: "workspace.toolnames.image_to_3d",
    defaultLabel: "Image to 3D",
    icon: "Box",
    inputs: [{ id: "image", type: "image", hint: "→ image", hintKey: "workspace.picker.port.to_image" }],
    outputs: [],
  },
];

const HIDDEN_NODE_TYPES = new Set(["chatAiNode", "mergeAudioNode", "videoToPromptNode"]);
const VISIBLE_CATALOG = CATALOG.filter((entry) => !HIDDEN_NODE_TYPES.has(entry.nodeType));

/**
 * Build the picker options for a given drop. Each catalog entry
 * contributes one option per compatible port — so a single node type
 * may show twice if it has two ports that fit (rare; usually 0 or 1).
 */
export function getPickerOptions(state: CanvasNodePickerState): PickerOption[] {
  // No source — keyboard "Add Node" shortcut. Surface every entry
  // once (use the first input port as the default newNodeHandle so
  // the picker still has something to wire into when adopted).
  if (!state.fromNode || !state.fromHandleId) {
    return VISIBLE_CATALOG.map((entry) => {
      const firstPort = entry.inputs[0] ?? entry.outputs[0];
      return {
        nodeType: entry.nodeType,
        label: entry.label,
        labelKey: entry.labelKey,
        icon: entry.icon,
        defaultLabel: entry.defaultLabel,
        newNodeHandle: firstPort?.id ?? "",
        portHint: firstPort?.hint,
        portHintKey: firstPort?.hintKey ?? "workspace.picker.port.text",
      };
    });
  }

  const sourceType = portTypeOf(state.fromNode, state.fromHandleId, state.fromIsOutput);
  if (!sourceType) return [];

  const opts: PickerOption[] = [];
  for (const entry of VISIBLE_CATALOG) {
    const ports = state.fromIsOutput ? entry.inputs : entry.outputs;
    for (const p of ports) {
      if (p.type !== sourceType) continue;
      opts.push({
        nodeType: entry.nodeType,
        label: entry.label,
        labelKey: entry.labelKey,
        icon: entry.icon,
        defaultLabel: entry.defaultLabel,
        newNodeHandle: p.id,
        portHint: p.hint,
        portHintKey: p.hintKey,
      });
    }
  }
  return opts;
}

/* ────────────────────────────────────────────────────────────── */
/* Grouping                                                        */
/*                                                                 */
/* Multiple compatible ports on the same target node type read as  */
/* visual noise (three "Video Gen" rows differing only by hint).   */
/* Roll those into a single parent row with a hover flyout listing */
/* the ports.                                                      */
/* ────────────────────────────────────────────────────────────── */

interface PickerGroup {
  key: string;
  label: string;
  icon: string;
  children: PickerOption[];
}

/**
 * Group picker options by `nodeType`, preserving first-seen order.
 * Single-child groups stay collapsed (rendered as a flat leaf row);
 * multi-child groups produce a parent row with a flyout submenu.
 */
function groupPickerOptions(opts: PickerOption[]): PickerGroup[] {
  const order: string[] = [];
  const map = new Map<string, PickerGroup>();
  for (const opt of opts) {
    let g = map.get(opt.nodeType);
    if (!g) {
      g = {
        key: opt.nodeType,
        label: opt.label,
        icon: opt.icon,
        children: [],
      };
      map.set(opt.nodeType, g);
      order.push(opt.nodeType);
    }
    g.children.push(opt);
  }
  return order.map((k) => map.get(k)!);
}

/* ────────────────────────────────────────────────────────────── */
/* UI                                                              */
/* ────────────────────────────────────────────────────────────── */

interface Props {
  state: CanvasNodePickerState;
  onPick: (option: PickerOption) => void;
  onClose: () => void;
}

const CanvasNodePicker = ({ state, onPick, onClose }: Props) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  // Which group key is currently expanded (showing flyout). null = none.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  // Highlighted child index inside the open flyout (for keyboard nav).
  const [childHighlight, setChildHighlight] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);

  const allOpts = useMemo(
    () =>
      getPickerOptions(state).map((option) => ({
        ...option,
        label: t(option.labelKey),
        portHint: t(option.portHintKey),
      })),
    [state, t],
  );

  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  // When searching: show a flat filtered list (no submenus) so users
  // see every match inline. Otherwise: group by nodeType.
  const filteredFlat = useMemo(() => {
    if (!isSearching) return allOpts;
    return allOpts.filter(
      (o) =>
        o.label.toLowerCase().includes(trimmedQuery) ||
        o.portHint.toLowerCase().includes(trimmedQuery),
    );
  }, [allOpts, trimmedQuery, isSearching]);

  const groups = useMemo(() => groupPickerOptions(allOpts), [allOpts]);

  // The visible rows in their current shape — flat options (when
  // searching) or groups (when not). Used by keyboard nav to compute
  // the highlight target.
  const visibleRowCount = isSearching ? filteredFlat.length : groups.length;

  // Reset highlight + close any open flyout when the visible list
  // changes shape (e.g. user starts typing).
  useEffect(() => {
    setHighlight(0);
    setOpenGroup(null);
    setChildHighlight(0);
  }, [isSearching]);

  // Clamp highlight if the visible list shrinks underneath it.
  useEffect(() => {
    if (highlight >= visibleRowCount && visibleRowCount > 0) {
      setHighlight(visibleRowCount - 1);
    }
  }, [visibleRowCount, highlight]);

  const commit = (opt: PickerOption) => onPick(opt);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isSearching && openGroup) {
        const g = groups.find((x) => x.key === openGroup);
        if (g) {
          setChildHighlight((i) => Math.min(g.children.length - 1, i + 1));
          return;
        }
      }
      setHighlight((i) => Math.min(visibleRowCount - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isSearching && openGroup) {
        setChildHighlight((i) => Math.max(0, i - 1));
        return;
      }
      setHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === "ArrowRight") {
      if (isSearching) return;
      const g = groups[highlight];
      if (g && g.children.length > 1) {
        e.preventDefault();
        setOpenGroup(g.key);
        setChildHighlight(0);
      }
    } else if (e.key === "ArrowLeft") {
      if (openGroup) {
        e.preventDefault();
        setOpenGroup(null);
        setChildHighlight(0);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isSearching) {
        const opt = filteredFlat[highlight];
        if (opt) commit(opt);
        return;
      }
      // Grouped mode: enter on parent → first child; enter on focused
      // child (when flyout is open) → that child.
      const g = groups[highlight];
      if (!g) return;
      if (openGroup === g.key && g.children[childHighlight]) {
        commit(g.children[childHighlight]);
      } else {
        commit(g.children[0]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (openGroup) {
        setOpenGroup(null);
        setChildHighlight(0);
      } else {
        onClose();
      }
    }
  };

  // Track the open group's parent row so the flyout can anchor its top
  // edge to it. We measure on every render (cheap; offsetTop is sync).
  // `useState` here so a row mounting after the flyout opens triggers
  // a re-render with the correct offset.
  const [flyoutAnchor, setFlyoutAnchor] = useState<{ top: number } | null>(null);
  useEffect(() => {
    if (!openGroup || isSearching) {
      setFlyoutAnchor(null);
      return;
    }
    const idx = groups.findIndex((g) => g.key === openGroup);
    const el = rowRefs.current[idx];
    if (!el) {
      setFlyoutAnchor(null);
      return;
    }
    // offsetTop is relative to the offsetParent — the <ul>. The picker
    // root is positioned, so we add the <ul>'s own offsetTop too.
    const ul = el.offsetParent as HTMLElement | null;
    const ulTop = ul ? ul.offsetTop : 0;
    setFlyoutAnchor({ top: ulTop + el.offsetTop });
  }, [openGroup, isSearching, groups, query]);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const preferredLeft = state.screen.x - 12;
    const preferredTop = state.screen.y + 6;
    const flyoutReserve = openGroup ? 198 : 0;
    const nextLeft = Math.min(preferredLeft, window.innerWidth - rect.width - flyoutReserve - pad);
    const nextTop = Math.min(preferredTop, window.innerHeight - rect.height - pad);
    el.style.left = `${Math.max(pad, nextLeft)}px`;
    el.style.top = `${Math.max(pad, nextTop)}px`;
  }, [state.screen.x, state.screen.y, visibleRowCount, openGroup, query]);

  // Render through a portal to <body> so the picker positions in
  // viewport space, NOT inside the canvas DOM tree. The picker uses
  // `clientX/Y` (viewport coords) for left/top and the parent it
  // used to mount under (`workspace-root`, `position: relative`) sits
  // ~40px below the viewport top thanks to the WorkspaceTabBar — so
  // an absolute-positioned picker rendered there ended up shifted.
  // Worse, on small screens the scrim's invisible `z-40` div would
  // appear to "block everything" when the user couldn't immediately
  // spot the offset picker. Portal + position:fixed makes the
  // coordinates and the visible position match exactly.
  return createPortal(
    <>
      {/* Click-outside scrim — invisible but covers the rest of the
          canvas so a stray click closes the picker. */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        ref={panelRef}
        className="fixed z-50 w-[268px] max-w-[calc(100vw-1rem)] overflow-visible rounded-[8px] border border-[#2d2d2d] bg-[#171717] py-[5px] shadow-[0_18px_40px_rgba(0,0,0,.52)]"
        style={{ left: state.screen.x, top: state.screen.y, fontFamily: "var(--font-sans)" }}
        onClick={(e) => e.stopPropagation()}
        onMouseLeave={() => setOpenGroup(null)}
      >
        <div className="border-b border-[#2a2a2a] px-[8px] pb-[7px] pt-[5px]">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder={t("workspace.picker.add_node")}
            className="nodrag h-[36px] w-full rounded-[8px] bg-[#202020] px-[10px] text-[13px] font-medium leading-none text-white outline-none ring-1 ring-transparent placeholder:text-[#8b8d91] focus:ring-[#3a3a3a]"
          />
        </div>
        <ul className="relative max-h-[min(18rem,calc(100vh-10rem))] overflow-y-auto px-[5px] py-[5px]">
          {visibleRowCount === 0 ? (
            <li className="px-[10px] py-[12px] text-center text-[13px] font-medium text-[#8b8d91]">
              {t("workspace.picker.no_compatible")}
            </li>
          ) : isSearching ? (
            // Flat search-results list — no submenus, all matches inline.
            filteredFlat.map((opt, i) => {
              const Icon = lucideIcon(opt.icon);
              return (
                <li key={`${opt.nodeType}-${opt.newNodeHandle}-${i}`}>
                  <button
                    type="button"
                    onClick={() => commit(opt)}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      "flex h-[34px] w-full items-center gap-[10px] rounded-[7px] px-[10px] text-left text-[13px] font-semibold leading-none transition-colors",
                      i === highlight
                        ? "bg-[#2a2a2a] text-white"
                        : "text-[#d7d7d7] hover:bg-[#242424] hover:text-white",
                    )}
                  >
                    <Icon className="h-[16px] w-[16px] shrink-0 text-[#d7d7d7]" strokeWidth={2} />
                    <span className="flex-1 truncate">{opt.label}</span>
                    <span className="text-[11.5px] font-medium text-[#a0a3a8]">
                      {opt.portHint}
                    </span>
                  </button>
                </li>
              );
            })
          ) : (
            // Grouped list — parent rows, with optional hover flyout
            // for groups that have 2+ ports.
            groups.map((g, i) => {
              const Icon = lucideIcon(g.icon);
              const hasChildren = g.children.length > 1;
              const onlyChild = g.children[0];
              return (
                <li
                  key={g.key}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  onMouseEnter={() => {
                    setHighlight(i);
                    if (hasChildren) {
                      setOpenGroup(g.key);
                      setChildHighlight(0);
                    } else {
                      setOpenGroup(null);
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (hasChildren) {
                        setOpenGroup(g.key);
                        setChildHighlight(0);
                        return;
                      }
                      commit(g.children[0]);
                    }}
                    className={cn(
                      "flex h-[34px] w-full items-center gap-[10px] rounded-[7px] px-[10px] text-left text-[13px] font-semibold leading-none transition-colors",
                      i === highlight
                        ? "bg-[#2a2a2a] text-white"
                        : "text-[#d7d7d7] hover:bg-[#242424] hover:text-white",
                    )}
                  >
                    <Icon className="h-[16px] w-[16px] shrink-0 text-[#d7d7d7]" strokeWidth={2} />
                    <span className="flex-1 truncate">{g.label}</span>
                    {hasChildren ? (
                      <Lucide.ChevronRight className="h-[16px] w-[16px] shrink-0 text-[#a0a3a8]" strokeWidth={2} />
                    ) : (
                      <span className="text-[11.5px] font-medium text-[#a0a3a8]">
                        {onlyChild.portHint}
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {/* Flyout panel — anchored to the right of the parent picker.
            Rendered as a sibling so the open/close transition can be
            scoped without re-laying out the parent list. */}
        {!isSearching && openGroup
          ? (() => {
              const g = groups.find((x) => x.key === openGroup);
              if (!g || g.children.length <= 1) return null;
              return (
                <div
                  className="absolute left-full ml-2 w-[190px] overflow-hidden rounded-[8px] border border-[#2d2d2d] bg-[#171717] py-[5px] shadow-[0_14px_30px_rgba(0,0,0,.48)]"
                  style={{
                    top: flyoutAnchor ? flyoutAnchor.top : 0,
                    animation: "canvas-picker-flyout-in 100ms ease-out",
                  }}
                  onMouseEnter={() => setOpenGroup(g.key)}
                >
                  <ul className="max-h-[min(16rem,calc(100vh-12rem))] overflow-y-auto px-[5px] py-0">
                    {g.children.map((opt, j) => {
                      const ChildIcon = lucideIcon(opt.icon);
                      return (
                        <li key={`${opt.nodeType}-${opt.newNodeHandle}-${j}`}>
                          <button
                            type="button"
                            onClick={() => commit(opt)}
                            onMouseEnter={() => setChildHighlight(j)}
                            className={cn(
                              "flex h-[32px] w-full items-center gap-[9px] rounded-[7px] px-[10px] text-left text-[13px] font-semibold leading-none transition-colors",
                              j === childHighlight
                                ? "bg-[#2a2a2a] text-white"
                                : "text-[#d7d7d7] hover:bg-[#242424] hover:text-white",
                            )}
                          >
                            <ChildIcon className="h-[15px] w-[15px] shrink-0 text-[#d7d7d7]" strokeWidth={2} />
                            <span className="flex-1 truncate">
                              {opt.portHint.replace(/^→\s*/, "")}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })()
          : null}

        <div className="border-t border-[#2a2a2a] px-[12px] py-[8px] text-[11px] font-medium leading-none text-[#8b8d91]">
          {t("workspace.picker.hint_row")}
        </div>
      </div>
      <style>{`
        @keyframes canvas-picker-flyout-in {
          from { opacity: 0; transform: translateX(4px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>,
    document.body,
  );
};

export default CanvasNodePicker;
