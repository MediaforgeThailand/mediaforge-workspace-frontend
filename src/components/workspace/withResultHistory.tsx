/**
 * withResultHistory — HOC that attaches a NodeResultBar to the top of
 * a React Flow node, visually merged into the node via CSS so the bar
 * and the legacy node body read as ONE card (no double border).
 *
 * Always renders the bar, even when no generations exist, so the node
 * shows a "Results will appear here" placeholder from the moment it's
 * placed on the canvas (matching Krea / Freepik AI canvas patterns).
 *
 * Legacy flow editor is unaffected — this HOC is only applied in the
 * workspace `nodeTypes` registration. Legacy continues to render the
 * per-tool components directly, unwrapped.
 *
 * Data the HOC reads from `node.data`:
 *   generations:      Generation[]   // newest first
 *   selectedGenIndex: number         // default 0 (latest)
 */

import { type ComponentType, useCallback } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import NodeResultBar, { type Generation } from "./NodeResultBar";

interface WorkspaceNodeData {
  generations?: Generation[];
  selectedGenIndex?: number;
}

/** Widths legacy node components declare via `width={...}` on BaseNodeWrapper. */
const DEFAULT_NODE_WIDTH = 300;

export function withResultHistory<P extends NodeProps>(
  Inner: ComponentType<P>,
  opts: { width?: number } = {},
) {
  const width = opts.width ?? DEFAULT_NODE_WIDTH;

  const Wrapped = (props: P) => {
    const d = (props.data ?? {}) as WorkspaceNodeData;
    const { setNodes } = useReactFlow();

    const selectIndex = useCallback(
      (i: number) => {
        setNodes((ns) =>
          ns.map((n) =>
            n.id === props.id ? { ...n, data: { ...n.data, selectedGenIndex: i } } : n,
          ),
        );
      },
      [setNodes, props.id],
    );

    return (
      <div className="workspace-node-merged">
        <NodeResultBar
          generations={d.generations}
          selectedIndex={d.selectedGenIndex ?? 0}
          onSelectIndex={selectIndex}
          width={width}
        />
        <Inner {...props} />
      </div>
    );
  };

  Wrapped.displayName = `withResultHistory(${Inner.displayName ?? Inner.name ?? "Node"})`;
  return Wrapped;
}
