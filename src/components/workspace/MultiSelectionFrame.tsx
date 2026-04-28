/**
 * MultiSelectionFrame — translucent rounded rectangle that visually
 * groups two-or-more selected nodes (Figma / Photoshop pattern).
 *
 * Renders nothing for 0 or 1 selected nodes. When 2+ are selected,
 * computes the union bounding box of their positions and dimensions
 * and draws a faint blue panel behind them.
 *
 * Mounted via React portal into `.react-flow__viewport` so React
 * Flow's pan/zoom transform applies automatically — the frame moves
 * and scales with the canvas without us recomputing screen coords on
 * every viewport tick. We only re-render when the selection changes
 * or any selected node's position/size changes.
 *
 * Z-order: inside `.react-flow__viewport`, the default React Flow
 * stack is roughly background pane (0) → edges (1) → nodes (4). We
 * set the frame's `zIndex` to 0 so it sits ABOVE the canvas pane but
 * BEHIND both edges and nodes — visible only in the gaps between
 * selected nodes, never tinting the nodes themselves.
 *
 * Position math:
 *   • For each selected node, take its `position` (already in flow
 *     coords for top-level nodes; for grouped children we walk the
 *     parent chain).
 *   • bbox = union of (position, position + measured size).
 *   • Pad by FRAME_PADDING_PX so the frame breathes around the nodes.
 */

import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNodes, type Node } from "@xyflow/react";

const FRAME_PADDING_PX = 22;

/** Resolve a node's absolute flow-coord position by walking its
 *  parent chain (since React Flow stores child positions relative
 *  to the parent group). */
function getAbsolutePosition(
  node: Node,
  byId: Map<string, Node>,
): { x: number; y: number } | null {
  // Defensive — React Flow occasionally hands us a node whose
  // `position` is undefined during drag transitions (e.g. between an
  // optimistic add and the first measure). Returning null here lets
  // the caller skip the node instead of throwing into the error
  // boundary and blanking the whole canvas.
  if (!node.position || typeof node.position.x !== "number") return null;
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  // Cap at depth 16 — nested groups beyond that level aren't a thing
  // in this app and the cap stops a malformed cycle from looping.
  for (let i = 0; i < 16 && parentId; i++) {
    const parent = byId.get(parentId);
    if (!parent || !parent.position) break;
    x += parent.position.x ?? 0;
    y += parent.position.y ?? 0;
    parentId = parent.parentId;
  }
  return { x, y };
}

const MultiSelectionFrame = memo(() => {
  const nodes = useNodes();

  // Find the React Flow viewport DOM node once it mounts. This is
  // the transformed container — children inherit pan/zoom for free.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // The viewport is rendered synchronously by React Flow on mount,
    // so by the time this effect runs we expect to find it. If it's
    // ever missing (e.g. portal mounted before ReactFlow), retry on
    // the next frame.
    let cancelled = false;
    const find = () => {
      if (cancelled) return;
      const el = document.querySelector(
        ".react-flow__viewport",
      ) as HTMLElement | null;
      if (el) {
        setPortalTarget(el);
      } else {
        requestAnimationFrame(find);
      }
    };
    find();
    return () => {
      cancelled = true;
    };
  }, []);

  const bbox = useMemo(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length < 2) return null;

    const byId = new Map(nodes.map((n) => [n.id, n]));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const n of selected) {
      const w = n.measured?.width ?? n.width ?? 0;
      const h = n.measured?.height ?? n.height ?? 0;
      // Skip nodes whose dimensions haven't been measured yet — they'd
      // collapse the bbox to a point and produce a 0×0 frame.
      if (!w || !h) continue;
      const pos = getAbsolutePosition(n, byId);
      if (!pos) continue; // missing position — skip
      const { x, y } = pos;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    }

    if (!Number.isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  }, [nodes]);

  if (!bbox || !portalTarget) return null;

  const left = bbox.minX - FRAME_PADDING_PX;
  const top = bbox.minY - FRAME_PADDING_PX;
  const width = bbox.maxX - bbox.minX + FRAME_PADDING_PX * 2;
  const height = bbox.maxY - bbox.minY + FRAME_PADDING_PX * 2;

  return createPortal(
    <div
      className="ws-multi-selection-frame"
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        // Behind nodes (z 4) and edges (z 1), but above the pane (z 0).
        zIndex: 0,
        pointerEvents: "none",
      }}
    />,
    portalTarget,
  );
});

MultiSelectionFrame.displayName = "MultiSelectionFrame";
export default MultiSelectionFrame;
