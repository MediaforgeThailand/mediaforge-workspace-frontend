/**
 * cloneNode — shared helper for "duplicate a node" gestures.
 *
 * Two consumers today:
 *   • Alt+drag         (WorkspaceCanvas.onNodeDragStart)
 *   • Ctrl+D / button  (NodeQuickToolbar.onDuplicate)
 *
 * The clone is a faithful deep copy of the original's content with
 * only transient run-state reset, so:
 *   • The image preview / generated result stays on the copy
 *     (`generations[]`, `selectedGenIndex` preserved). Bug report:
 *     "Alt-drag an Image Generation node with a preview → clone
 *     showed only the prompt, no image, no model dropdown" — caused
 *     by the previous version of this helper deleting `generations`
 *     and `selectedGenIndex` from the copy.
 *   • A node mid-run reads as idle on the copy (`status` reset to
 *     "idle"), so a duplicate of an in-flight Image Gen doesn't
 *     pretend to also be running. The actual results, if any, were
 *     already captured into `generations[]` by the runner so we keep
 *     them — only the live "processing" / "error" badge is dropped.
 *   • Selection / drag flags don't leak from the original to the copy.
 *   • Label is bumped: `Foo` → `Foo copy`, `Foo copy` → `Foo copy 2`,
 *     `Foo copy 2` → `Foo copy 3`, …
 *
 * The label bump targets whichever field the node's UI actually displays
 * (params.nodeName for tool nodes, data.label for TextNode / AssetNode,
 * data.name for ElementNode), so the user sees the new name in the title
 * bar regardless of which node type they cloned.
 *
 * `structuredClone` handles the deep copy — it walks nested objects
 * (`params`, each `generations[]` entry, `referenceType`, …) so no
 * shared references survive between original and copy. Node data
 * never holds DOM refs / functions, so structuredClone is safe.
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
 * Reset only the LIVE run badge so a copy of a mid-run node doesn't
 * appear to also be running. We keep `generations[]` and
 * `selectedGenIndex` so the rendered image / video / asset preview
 * survives onto the copy — that's the user's whole point in
 * duplicating a finished node.
 *
 * Reasoning for resetting `status` to "idle" rather than "done": the
 * status field drives the running spinner / error chrome, NOT the
 * preview image (which is read straight off `generations[]`). Setting
 * "idle" hides the spinner; the preview still renders because
 * generations[0] is still there. If the original was idle anyway this
 * is a no-op.
 *
 * Static config (params, label, fieldType, previewUrl, posterUrl,
 * referenceType, …) is left alone — `structuredClone` already gave
 * us deep copies of those.
 */
function resetRunBadge(
  rawData: Record<string, unknown>,
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...rawData };
  // ── Clear EVERY transient run-state field ──
  // The dispatcher correlates a node's "is this run still alive?"
  // by its `taskId` / `runId`. If we leave the parent's already-
  // completed task id on the clone, the clone immediately reads
  // as "done" against a stale id and never fires its own request
  // when the user hits Run. Clear ALL keys that could carry the
  // parent's identity over to the clone.
  //
  // `generations[]` + `selectedGenIndex` are deliberately kept
  // (handled outside this function) so the clone shows the same
  // image — the user's whole point in duplicating.
  data.status = "idle";
  data.runStatus = "idle";
  data.isRunning = false;
  data.runId = null;
  data.taskId = null;
  data.pollAt = null;
  data.progress = null;
  data.runStartedAt = null;
  data.runError = null;
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
  const reset = resetRunBadge(baseData);
  const labeled = bumpDisplayLabel(reset);
  return {
    ...node,
    id: newId,
    data: labeled,
    position: { ...node.position },
    selected: false,
    dragging: false,
  };
}
