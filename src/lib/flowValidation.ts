/**
 * Flow graph validation — checks structural issues before publishing.
 */

import type { FlowGraph } from "@/pages/play-flow/types";
import { NODE_PROVIDER_MAP } from "@/pages/play-flow/constants";
import {
  countPromptChars,
  getPromptCharLimit,
  KLING_MULTISHOT_SCENE_LIMIT,
} from "@/lib/promptLimits";

export interface FlowWarning {
  type: "error" | "warning";
  message: string;
  nodeId?: string;
}

/** Node types that are self-contained (don't need incoming connections) */
const STANDALONE_NODE_TYPES = new Set(["textInputNode", "inputNode"]);

/** Node types that are action/processing nodes (need connections) */
const ACTION_NODE_TYPES = new Set(Object.keys(NODE_PROVIDER_MAP));

/** Schema keys whose textarea params should be checked against per-model char limits */
const PROMPT_KEYS = ["prompt", "negative_prompt", "system_prompt"] as const;

export type TranslatorFn = (key: string, params?: Record<string, string | number>) => string;

export function validateFlowGraph(graph: FlowGraph | null | undefined, t?: TranslatorFn): FlowWarning[] {
  const warnings: FlowWarning[] = [];
  const tr = t ?? ((k: string) => k);

  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    warnings.push({ type: "error", message: tr("flowValNoNodes") });
    return warnings;
  }

  const { nodes, edges } = graph;

  // Build connection maps
  const nodesWithIncoming = new Set(edges.map((e) => e.target));
  const nodesWithOutgoing = new Set(edges.map((e) => e.source));

  // Check: Action nodes that have NO incoming connections (orphaned)
  for (const node of nodes) {
    if (!node.type) continue;

    if (ACTION_NODE_TYPES.has(node.type)) {
      // Action nodes should have at least one incoming OR outgoing connection
      if (!nodesWithIncoming.has(node.id) && !nodesWithOutgoing.has(node.id)) {
        const label = (node.data?.label as string) || node.type;
        warnings.push({
          type: "error",
          message: tr("flowValNodeDisconnected", { label }),
          nodeId: node.id,
        });
      }
    }

    // Input nodes (non-standalone) should have outgoing connections
    if (node.type === "inputNode") {
      if (!nodesWithOutgoing.has(node.id)) {
        const label = (node.data?.label as string) || (node.data?.fieldLabel as string) || "Input";
        warnings.push({
          type: "error",
          message: tr("flowValInputDisconnected", { label }),
          nodeId: node.id,
        });
      }
    }

    // Output nodes should have incoming connections
    if (node.type === "outputNode") {
      if (!nodesWithIncoming.has(node.id)) {
        const label = (node.data?.label as string) || "Output";
        warnings.push({
          type: "error",
          message: tr("flowValOutputNoIncoming", { label }),
          nodeId: node.id,
        });
      }
    }

    // ── Per-model prompt char limit checks ──
    if (ACTION_NODE_TYPES.has(node.type)) {
      const data = (node.data as Record<string, unknown>) ?? {};
      const params = (data.params as Record<string, unknown>) ?? {};
      const model = (params.model_name as string) ?? "";
      const nodeLabel =
        (params.nodeName as string) ||
        (data.label as string) ||
        node.type;

      // Standard prompt fields
      for (const key of PROMPT_KEYS) {
        const limit = getPromptCharLimit(node.type, model, key);
        if (!limit) continue;
        const raw = params[key];
        if (typeof raw !== "string" || !raw) continue;
        const count = countPromptChars(raw);
        if (count > limit) {
          warnings.push({
            type: "error",
            message: tr("flowValPromptOverLimit", {
              label: nodeLabel,
              count,
              limit,
              over: count - limit,
            }),
            nodeId: node.id,
          });
        }
      }

      // Multi-shot per-scene checks (Kling Director Mode)
      if (node.type === "klingVideoNode" && String(params.multi_shot) === "true") {
        const scenes = Array.isArray(params.multi_prompt) ? (params.multi_prompt as Array<{ prompt?: string }>) : [];
        scenes.forEach((scene, i) => {
          const count = countPromptChars(scene?.prompt ?? "");
          if (count > KLING_MULTISHOT_SCENE_LIMIT) {
            warnings.push({
              type: "error",
              message: tr("flowValMultiShotOverLimit", {
                label: nodeLabel,
                scene: i + 1,
                count,
                limit: KLING_MULTISHOT_SCENE_LIMIT,
              }),
              nodeId: node.id,
            });
          }
        });
      }
    }
  }

  // Check: No action nodes at all
  const actionNodes = nodes.filter((n) => ACTION_NODE_TYPES.has(n.type));
  if (actionNodes.length === 0) {
    warnings.push({ type: "error", message: tr("flowValNoActionNode") });
  }

  // Check: No output nodes
  const outputNodes = nodes.filter((n) => n.type === "outputNode");
  if (outputNodes.length === 0) {
    warnings.push({ type: "warning", message: tr("flowValNoOutputNode") });
  }

  return warnings;
}

export function hasErrors(warnings: FlowWarning[]): boolean {
  return warnings.some((w) => w.type === "error");
}
