/**
 * PortIcon — a compact icon-button wrapping a React Flow Handle.
 *
 * Layout (corner-anchored, "floating outside" style):
 *
 *   Inputs  (`dir="target"`) → BOTTOM-LEFT corner of the node, stack
 *                              upward as more inputs are added.
 *   Outputs (`dir="source"`) → TOP-RIGHT corner of the node, stack
 *                              downward as more outputs are added.
 *
 * Idle / active animation:
 *
 *   • idle (no hover, no selection, no compatible drag in flight)
 *     The icon is invisible and tucked back AGAINST the node edge —
 *     user sees a clean node with no port chrome.
 *   • node hovered or selected (or a compatible wire is being
 *     dragged anywhere)
 *     The icon fades in AND slides outward, away from the node body,
 *     so the connection point sits in clear space — no overlap with
 *     the node's own content. The slide direction is anchor-aware:
 *     left ports slide further LEFT, right ports slide further RIGHT.
 *
 * The slide is implemented via a CSS custom property `--port-tx`
 * that gates an extra horizontal translate on top of the centring
 * transform. CSS in workspace.css holds the actual animation rules
 * (so the same component drives idle / hover / drag-compatible /
 * connectingto states without prop ping-pong).
 *
 * Vertical placement:
 *   • Inputs anchor to `bottom: PORT_INSET_PX + index * PORT_GAP_PX`
 *     so input[0] is at the bottom-left corner; later inputs stack
 *     UPWARD along the left edge.
 *   • Outputs anchor to `top: PORT_INSET_PX + index * PORT_GAP_PX`
 *     so output[0] is at the top-right corner; later outputs stack
 *     DOWNWARD along the right edge.
 *
 * Tooltip:
 *   The `.ws-port-tooltip` span (rendered as a child of Handle)
 *   floats to the OUTSIDE of the node (left of left ports, right of
 *   right ports) so it can never overlap the node body. It fades in
 *   only when THIS handle is hovered specifically.
 */

import { Handle, Position, useEdges, useNodeId } from "@xyflow/react";
import {
  Image as ImageIcon,
  Film,
  Music,
  Type,
  Users,
  Box,
  type LucideIcon,
} from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import type { WirePortType } from "./workspaceSchema";

export const PORT_GAP_PX = 36;
export const PORT_INSET_PX = 16;

const ICON_BY_TYPE: Record<WirePortType, LucideIcon> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  text: Type,
  element: Users,
  model3d: Box,
};

interface PortIconProps {
  /** Connection direction. "target" = input (bottom-left corner),
   *  "source" = output (top-right corner). */
  dir: "target" | "source";
  /** React Flow handle id — used in edge.targetHandle / sourceHandle. */
  handleId: string;
  /** Tooltip text shown on hover. */
  label: string;
  /** Drives glyph + the data-port-type compat filter. */
  portType: WirePortType;
  /** Border colour — usually matches the wire colour for this type. */
  color: string;
  /** 0-based vertical position within the node's column. Inputs stack
   *  upward from the bottom; outputs stack downward from the top. */
  index: number;
  /** Optional override (e.g. a different glyph for a special role). */
  icon?: LucideIcon;
}

export function PortIcon({
  dir,
  handleId,
  label,
  portType,
  color,
  index,
  icon,
}: PortIconProps) {
  const Icon = icon ?? ICON_BY_TYPE[portType];
  const side = dir === "target" ? "left" : "right";
  const position = dir === "target" ? Position.Left : Position.Right;
  const offset = PORT_INSET_PX + index * PORT_GAP_PX;
  const style: CSSProperties = {
    ["--handle-color" as never]: color,
  };
  if (side === "left") {
    // Anchor at bottom-left corner; stack upward.
    style.left = "0";
    style.top = "auto";
    style.bottom = `${offset}px`;
  } else {
    // Anchor at top-right corner; stack downward.
    style.right = "0";
    style.left = "auto";
    style.bottom = "auto";
    style.top = `${offset}px`;
  }

  /* Detect whether THIS handle has a wire attached. Connected
   * ports stay visible at their full "extended" state instead of
   * fading out with the node — the user wants the wires they've
   * already built to be readable without hovering each node. */
  const nodeId = useNodeId();
  const edges = useEdges();
  const isConnected = useMemo(() => {
    if (!nodeId) return false;
    if (dir === "target") {
      return edges.some(
        (e) => e.target === nodeId && (e.targetHandle ?? "") === handleId,
      );
    }
    return edges.some(
      (e) => e.source === nodeId && (e.sourceHandle ?? "") === handleId,
    );
  }, [edges, nodeId, dir, handleId]);

  return (
    <Handle
      type={dir}
      position={position}
      id={handleId}
      className="workspace-handle"
      data-port-type={portType}
      data-port-anchor={side}
      data-connected={isConnected ? "true" : undefined}
      style={style}
    >
      <Icon className="ws-port-glyph" />
      <span className="ws-port-tooltip">{label}</span>
    </Handle>
  );
}
