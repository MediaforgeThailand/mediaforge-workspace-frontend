/**
 * Compute the params bag for a NEW node spawned from the canvas
 * picker, inheriting compatible settings from the source node so
 * the user doesn't have to re-pick model + ratio + resolution +
 * quality every time they extend a workflow downstream.
 *
 * Pure helper — no side effects, easy to unit-test.
 *
 * Strategy
 * ────────
 *   1. Start from the new schema's defaults (always — guarantees the
 *      result is a complete + valid params object even if the source
 *      had typos / drifted keys).
 *   2. If the source node exists, layer ELIGIBLE source params on top.
 *      Eligibility:
 *        a. Both schemas declare the same param key, AND
 *        b. The source's value is in the target schema's option list
 *           (for select-shape params) or within the target's range
 *           (for numeric ranges). Out-of-range values fall through to
 *           the target default.
 *        c. For DIFFERENT-family pairs, additionally restrict to a
 *           CROSS_FAMILY_KEYS allowlist:
 *           ['aspect_ratio', 'resolution', 'image_size'].
 *   3. Special case: GPT Image 2 stores `aspect_ratio` + `resolution`
 *      composed into a single `size` field. When going FROM gpt-image-2
 *      to a different family (e.g. video gen), decompose `size` into
 *      its (aspect_ratio, resolution) pair so those structural keys
 *      can carry over to the target. Same-family GPT→GPT lets `size`
 *      copy directly via the normal shared-key path.
 *
 * Family
 * ──────
 *   Derived from the schema key prefix:
 *     imageGenNode  → "image"
 *     videoGenNode  → "video"
 *     audioGenNode  → "audio"
 *     videoToPromptNode → "video"
 *     imageTo3dNode → "image"
 *     others (chatAi, mergeAudio, removeBackground) → null,
 *       which always counts as "different family" → cross-family
 *       allowlist applies.
 */

import type { Node } from "@xyflow/react";
import type { NodeApiDef, ParamDef } from "@/components/flow/nodes/nodeApiSchema";
import {
  getWorkspaceSchema,
  splitGptImageSize,
  resolveWsParam,
} from "./workspaceSchema";

type ParamsBag = Record<string, unknown>;

/** Cross-family inheritance is restricted to "structurally meaningful"
 *  keys — the visual sizing concept that translates across providers
 *  even when their model / quality / format vocabularies don't. */
const CROSS_FAMILY_KEYS = new Set<string>([
  "aspect_ratio",
  "resolution",
  "image_size",
]);

/** Best-effort family extraction from the schema key. We only need a
 *  rough bucket — exact equality between source + target families
 *  triggers the "copy every shared param" policy; anything else falls
 *  back to the cross-family allowlist. */
function familyOf(schemaKey: string | undefined | null): string | null {
  if (!schemaKey) return null;
  // Strip common Workspace suffix.
  const base = schemaKey.replace(/Node$/, "");
  // Take the leading lowercase word ("image" / "video" / "audio").
  const m = base.match(/^([a-z]+)/);
  if (!m) return null;
  const first = m[1];
  if (first === "image" || first === "video" || first === "audio" || first === "text") {
    return first;
  }
  return null;
}

/** Compute the schema's bare defaults — same shape as the store's
 *  `defaultParamsFor`, kept private here so the helper is self-contained
 *  and importable from anywhere. */
function schemaDefaults(schema: NodeApiDef): ParamsBag {
  const out: ParamsBag = {};
  for (const p of schema.params) out[p.key] = p.default;
  return out;
}

/** Pick the visible variant of a param for the given model. The schema
 *  occasionally splits a param into multiple entries gated by
 *  `supportedModels` — we want the one whose option list actually
 *  applies under the target's active model. If no variant supports the
 *  model the param is treated as nonexistent on the target (return
 *  undefined) so we don't carry a value that wouldn't render. */
function paramDefFor(
  schema: NodeApiDef,
  key: string,
  model: string,
): ParamDef | undefined {
  const candidates = schema.params.filter((p) => p.key === key);
  if (candidates.length === 0) return undefined;
  const visible = candidates.find(
    (p) => !p.supportedModels || p.supportedModels.includes(model),
  );
  if (!visible) return undefined;
  return resolveWsParam(visible, model);
}

/** Is `value` accepted by this param def? Numeric sliders compare
 *  against [min,max]; selects compare against the options list; free-
 *  text accepts any string. Falls through to "no" for unknown shapes. */
function valueIsValid(p: ParamDef, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  switch (p.type) {
    case "select": {
      if (!Array.isArray(p.options)) return true;
      return p.options.includes(String(value));
    }
    case "slider": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return false;
      if (typeof p.min === "number" && n < p.min) return false;
      if (typeof p.max === "number" && n > p.max) return false;
      return true;
    }
    case "text":
    case "textarea":
    case "json":
      return typeof value === "string" || typeof value === "number";
    case "dynamic":
      // Already resolved by paramDefFor; treat as text fallback.
      return true;
    default:
      return true;
  }
}

/**
 * Compute the params bag for a NEW node created via the picker.
 *
 * @param sourceNode The node the user dragged FROM. `null` when the
 *   picker was opened without a source (keyboard / +-button) — the
 *   helper falls through to bare schema defaults in that case.
 * @param targetSchema The schema for the node type being spawned.
 * @param targetSchemaKey The schema key (e.g. `"videoGenNode"`) — used
 *   to derive family alongside the source.
 */
export function inheritParamsFromSource(
  sourceNode: Node | null,
  targetSchema: NodeApiDef | undefined,
  targetSchemaKey: string,
): ParamsBag {
  // No schema → caller will use {} or a non-schema default. Mirrors
  // `defaultParamsFor(unknown)` returning {}.
  if (!targetSchema) return {};

  const defaults = schemaDefaults(targetSchema);

  // No source, or the source is a non-tool node (asset / element / text /
  // group / sticky) — those don't have schema params we can carry over.
  // The helper's first guard handles them naturally: `sourceParams` is
  // empty so no key is eligible, and we return defaults.
  const sourceData = (sourceNode?.data ?? {}) as { params?: ParamsBag };
  let sourceParams: ParamsBag = sourceData.params ?? {};
  const sourceType = sourceNode?.type ?? null;
  const sourceSchema = sourceType ? getWorkspaceSchema(sourceType) : undefined;

  if (!sourceNode || !sourceSchema || Object.keys(sourceParams).length === 0) {
    return defaults;
  }

  const sourceFamily = familyOf(sourceType);
  const targetFamily = familyOf(targetSchemaKey);
  const sameFamily =
    sourceFamily !== null && targetFamily !== null && sourceFamily === targetFamily;

  // GPT Image 2 special case — when crossing families AND source is
  // GPT Image 2, decompose its composed `size` field into (aspect_ratio,
  // resolution) so the structural keys can carry over to the target.
  // Same-family GPT→GPT is NOT decomposed: `size` is itself a shared key
  // and copying it directly preserves the exact pixel dimensions.
  const sourceModel =
    typeof sourceParams["model_name"] === "string"
      ? (sourceParams["model_name"] as string)
      : undefined;
  if (
    !sameFamily &&
    sourceType === "imageGenNode" &&
    sourceModel === "gpt-image-2" &&
    typeof sourceParams["size"] === "string"
  ) {
    const split = splitGptImageSize(sourceParams["size"] as string);
    // Layer the split keys ONTO the source params so the eligibility
    // loop below sees them. Don't mutate the original `data.params`
    // object — that's a foreign reference. We're working on a clone
    // of just the keys we'll iterate over.
    sourceParams = {
      ...sourceParams,
      aspect_ratio: split.aspectRatio,
      // Image-side resolution lives under `image_size` in this codebase
      // (1K / 2K / 4K). The split helper returns those exact tokens.
      image_size: split.resolution,
      // Some video schemas (SeedDance) call the same concept `resolution`
      // — surface it under that key too so the cross-family allowlist
      // catches whichever name the target uses.
      resolution: split.resolution,
    };
  }

  // Resolve the active model on the TARGET so per-model param variants
  // (e.g. ref_image split by provider, image_size 1K/2K vs 1K/2K/4K)
  // are evaluated against the right option list.
  // If model_name is a shared key and the source's model is supported by
  // the target schema, that model carries over and we should evaluate
  // the rest of the params against it. Otherwise the target default
  // model wins.
  let targetModel = String(defaults["model_name"] ?? targetSchema.defaultModel);
  if (sameFamily && typeof sourceParams["model_name"] === "string") {
    const candidate = sourceParams["model_name"] as string;
    if (targetSchema.supportedModels.includes(candidate)) {
      targetModel = candidate;
    }
  }

  const out: ParamsBag = { ...defaults, model_name: targetModel };

  // Walk every key the source declares; layer on anything eligible.
  for (const key of Object.keys(sourceParams)) {
    if (key === "model_name") continue; // already handled
    // Cross-family allowlist gate.
    if (!sameFamily && !CROSS_FAMILY_KEYS.has(key)) continue;

    const targetParam = paramDefFor(targetSchema, key, targetModel);
    if (!targetParam) continue; // target schema doesn't declare this key

    const value = sourceParams[key];
    if (!valueIsValid(targetParam, value)) continue;

    out[key] = value;
  }

  return out;
}

/* ── Test helpers (export for unit tests) ─────────────────────── */
// Exposed so a future unit test can drive the policy without
// reaching into the function — and so the policy is documented
// once, in code.
export const __TEST__ = {
  CROSS_FAMILY_KEYS,
  familyOf,
  schemaDefaults,
  valueIsValid,
};
