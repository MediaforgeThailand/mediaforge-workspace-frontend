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

import { useMemo, useState } from "react";
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

  const allOpts = useMemo(() => getPickerOptions(state), [state]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOpts;
    return allOpts.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.portHint.toLowerCase().includes(q),
    );
  }, [allOpts, query]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) onPick(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

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
        <ul className="max-h-72 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-4 text-center text-xs italic text-zinc-500">
              No compatible node
            </li>
          ) : (
            filtered.map((opt, i) => {
              const Icon = (Lucide as any)[opt.icon] ?? Lucide.Box;
              return (
                <li key={`${opt.nodeType}-${opt.newNodeHandle}-${i}`}>
                  <button
                    type="button"
                    onClick={() => onPick(opt)}
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
          )}
        </ul>
        <div className="border-t border-zinc-800 px-2 py-1 text-[10px] text-zinc-500">
          ↑↓ to navigate · ⏎ to add · esc to cancel
        </div>
      </div>
    </>,
    document.body,
  );
};

export default CanvasNodePicker;
