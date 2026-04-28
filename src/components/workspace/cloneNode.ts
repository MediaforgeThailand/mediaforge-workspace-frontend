/**
 * cloneNode — shared helper for "duplicate a node" gestures.
 *
 * Two consumers today:
 *   • Alt+drag         (WorkspaceCanvas.onNodeDragStart)
 *   • Ctrl+D / button  (NodeQuickToolbar.onDuplicate)
 *
 * Both used to do `structuredClone(n.data)` and ship the result as-is,
 * which carried run-state into the copy:
 *   • `status: "processing"` made the new node display a spinner
 *     even though it hadn't been run yet
 *   • `generations[]` cloned the original's run history into the copy
 *     so deleting one would feel like it deleted the other's results
 *   • `selectedGenIndex` pointed at a generation that didn't logically
 *     belong to the copy
 *
 * This helper produces a "fresh duplicate":
 *   • Run-state fields stripped (status / generations / selectedGenIndex /
 *     dragging / selected — anything ephemeral)
 *   • Label is bumped: `Foo` → `Foo copy`, `Foo copy` → `Foo copy 2`,
 *     `Foo copy 2` → `Foo copy 3`, …
 *
 * The label bump targets whichever field the node's UI actually displays
 * (params.nodeName for tool nodes, data.label for TextNode / AssetNode,
 * data.name for ElementNode), so the user sees the new name in the title
 * bar regardless of which node type they cloned.
 */

import type { Node } from "@xyflow/react";

/** Append " copy" to a name, or increment an existing copy counter. */
function bumpCopySuffix(name: string): string {
  const m = name.match(/^(.*) copy(?: (\d+))?$/i);
  if (m) {
    const base = m[1];
    const n = m[2] ? parseInt(m[2], 10) + 1 : 2;
    return `${base} copy ${n}`;
  }
  return `${name} copy`;
}

/**
 * Strip transient run-state fields from a node's data so the copy
 * starts fresh. Keep static config (params, label, fieldType, etc.).
 */
function stripRunState(
  rawData: Record<string, unknown>,
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...rawData };
  delete data.status; // "idle" | "processing" | "done" | "error"
  delete data.generations; // history of past runs
  delete data.selectedGenIndex;
  return data;
}

/**
 * Find the user-visible label on a node and bump it. Mutates the
 * supplied data clone in place; returns the same object for chaining.
 *
 * Order of preference matches the UI's title-input lookup:
 *   1. params.nodeName  (WorkspaceToolNode tools — Image / Video Gen)
 *   2. data.label       (TextNode, AssetNode, GroupNode, sticky note)
 *   3. data.name        (ElementNode and a few fallbacks)
 *
 * If none are set we don't invent a name out of thin air — the node's
 * placeholder (schema displayName etc.) will keep showing as before.
 */
function bumpDisplayLabel(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const params = data.params as Record<string, unknown> | undefined;
  if (params && typeof params.nodeName === "string" && params.nodeName) {
    data.params = {
      ...params,
      nodeName: bumpCopySuffix(params.nodeName),
    };
    return data;
  }
  if (typeof data.label === "string" && data.label) {
    data.label = bumpCopySuffix(data.label);
    return data;
  }
  if (typeof data.name === "string" && data.name) {
    data.name = bumpCopySuffix(data.name);
    return data;
  }
  return data;
}

/**
 * Build a "fresh duplicate" of `node` with `newId`. The caller is
 * responsible for assigning a unique id; this just stamps it in.
 *
 * Position is shallow-cloned (the caller usually offsets it by a few
 * pixels for visual separation in Ctrl+D, or leaves it on top of the
 * original for Alt+drag where the cursor takes over the original).
 */
export function cloneNodeFresh(node: Node, newId: string): Node {
  const baseData = structuredClone(node.data ?? {}) as Record<string, unknown>;
  const cleaned = stripRunState(baseData);
  const labeled = bumpDisplayLabel(cleaned);
  return {
    ...node,
    id: newId,
    data: labeled,
    position: { ...node.position },
    selected: false,
    dragging: false,
  };
}
