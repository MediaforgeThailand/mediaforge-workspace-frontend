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

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Lucide from "lucide-react";
import { cn } from "@/lib/utils";
import type { Node } from "@xyflow/react";
import { getWorkspaceSchema } from "./workspaceSchema";

export type WirePortType = "text" | "image" | "video" | "audio" | "element";

export interface PickerOption {
  /** node.type to spawn */
  nodeType: string;
  /** Display label in the row */
  label: string;
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
  defaultLabel: string;
  icon: string;
  /** Handles on this node that can RECEIVE a wire (target side). */
  inputs: Array<{ id: string; type: WirePortType; hint: string }>;
  /** Handles on this node that can SEND a wire (source side). */
  outputs: Array<{ id: string; type: WirePortType; hint: string }>;
}

const CATALOG: CatalogEntry[] = [
  {
    nodeType: "textNode",
    label: "Text",
    defaultLabel: "Text",
    icon: "Type",
    inputs: [],
    outputs: [{ id: "default", type: "text", hint: "text" }],
  },
  {
    nodeType: "imageGenNode",
    label: "Image Gen",
    defaultLabel: "Image Generation",
    icon: "Sparkles",
    inputs: [
      { id: "text", type: "text", hint: "→ prompt" },
      { id: "ref_image", type: "image", hint: "→ ref image" },
    ],
    outputs: [{ id: "image", type: "image", hint: "image" }],
  },
  {
    nodeType: "videoGenNode",
    label: "Video Gen",
    defaultLabel: "Video Generation",
    icon: "Film",
    inputs: [
      { id: "text", type: "text", hint: "→ prompt" },
      { id: "start_frame", type: "image", hint: "→ start frame" },
      { id: "end_frame", type: "image", hint: "→ end frame" },
      { id: "ref_image", type: "image", hint: "→ ref image" },
      { id: "ref_video", type: "video", hint: "→ ref video" },
      { id: "elements", type: "element", hint: "→ elements" },
    ],
    outputs: [
      { id: "output_video", type: "video", hint: "video" },
      { id: "output_start_frame", type: "image", hint: "first frame" },
      { id: "output_end_frame", type: "image", hint: "last frame" },
    ],
  },
  {
    nodeType: "removeBackgroundNode",
    label: "BG Remove",
    defaultLabel: "Remove Background",
    icon: "Scissors",
    inputs: [{ id: "image", type: "image", hint: "→ image" }],
    outputs: [{ id: "image", type: "image", hint: "cutout" }],
  },
  {
    nodeType: "mergeAudioNode",
    label: "Audio Merge",
    defaultLabel: "Merge Audio + Video",
    icon: "Combine",
    inputs: [
      { id: "video", type: "video", hint: "→ video" },
      { id: "audio", type: "audio", hint: "→ audio" },
    ],
    outputs: [{ id: "output_video", type: "video", hint: "video" }],
  },
  {
    nodeType: "chatAiNode",
    label: "Chat AI",
    defaultLabel: "Chat AI",
    icon: "MessageSquare",
    inputs: [{ id: "context", type: "text", hint: "→ context" }],
    outputs: [{ id: "text", type: "text", hint: "text" }],
  },
];

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
    return CATALOG.map((entry) => {
      const firstPort = entry.inputs[0] ?? entry.outputs[0];
      return {
        nodeType: entry.nodeType,
        label: entry.label,
        icon: entry.icon,
        defaultLabel: entry.defaultLabel,
        newNodeHandle: firstPort?.id ?? "",
        portHint: firstPort?.hint,
      };
    });
  }

  const sourceType = portTypeOf(state.fromNode, state.fromHandleId, state.fromIsOutput);
  if (!sourceType) return [];

  const opts: PickerOption[] = [];
  for (const entry of CATALOG) {
    const ports = state.fromIsOutput ? entry.inputs : entry.outputs;
    for (const p of ports) {
      if (p.type !== sourceType) continue;
      opts.push({
        nodeType: entry.nodeType,
        label: entry.label,
        icon: entry.icon,
        defaultLabel: entry.defaultLabel,
        newNodeHandle: p.id,
        portHint: p.hint,
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
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  // Which group key is currently expanded (showing flyout). null = none.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  // Highlighted child index inside the open flyout (for keyboard nav).
  const [childHighlight, setChildHighlight] = useState(0);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);

  const allOpts = useMemo(() => getPickerOptions(state), [state]);

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
        className="fixed z-50 w-72 rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl"
        style={{
          left: state.screen.x,
          top: state.screen.y,
          transform: "translate(-12px, 6px)",
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseLeave={() => setOpenGroup(null)}
      >
        <div className="border-b border-zinc-800 px-2 py-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Add node…"
            className="nodrag w-full rounded bg-transparent px-1.5 py-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
        </div>
        <ul className="relative max-h-72 overflow-y-auto p-1">
          {visibleRowCount === 0 ? (
            <li className="px-3 py-4 text-center text-xs italic text-zinc-500">
              No compatible node
            </li>
          ) : isSearching ? (
            // Flat search-results list — no submenus, all matches inline.
            filteredFlat.map((opt, i) => {
              const Icon = (Lucide as any)[opt.icon] ?? Lucide.Box;
              return (
                <li key={`${opt.nodeType}-${opt.newNodeHandle}-${i}`}>
                  <button
                    type="button"
                    onClick={() => commit(opt)}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                      i === highlight
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-300 hover:bg-zinc-800/60",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <span className="flex-1 truncate">{opt.label}</span>
                    <span className="font-mono text-[10px] text-zinc-500">
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
              const Icon = (Lucide as any)[g.icon] ?? Lucide.Box;
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
                    onClick={() => commit(g.children[0])}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                      i === highlight
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-300 hover:bg-zinc-800/60",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <span className="flex-1 truncate">{g.label}</span>
                    {hasChildren ? (
                      <Lucide.ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    ) : (
                      <span className="font-mono text-[10px] text-zinc-500">
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
                  className="absolute left-full ml-2 w-52 rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl"
                  style={{
                    top: flyoutAnchor ? flyoutAnchor.top : 0,
                    animation: "canvas-picker-flyout-in 100ms ease-out",
                  }}
                  onMouseEnter={() => setOpenGroup(g.key)}
                >
                  <ul className="max-h-72 overflow-y-auto p-1">
                    {g.children.map((opt, j) => {
                      const ChildIcon = (Lucide as any)[opt.icon] ?? Lucide.Box;
                      return (
                        <li key={`${opt.nodeType}-${opt.newNodeHandle}-${j}`}>
                          <button
                            type="button"
                            onClick={() => commit(opt)}
                            onMouseEnter={() => setChildHighlight(j)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                              j === childHighlight
                                ? "bg-zinc-800 text-zinc-100"
                                : "text-zinc-300 hover:bg-zinc-800/60",
                            )}
                          >
                            <ChildIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
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

        <div className="border-t border-zinc-800 px-2 py-1 text-[10px] text-zinc-500">
          ↑↓ to navigate · → to expand · ⏎ to add · esc to cancel
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
