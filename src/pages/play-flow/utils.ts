import { NODE_API_SCHEMA } from "@/components/flow/nodes/nodeApiSchema";
import { NODE_PROVIDER_MAP } from "./constants";
import type { FlowGraph, GraphNode, InputField, ExposedField, ExampleMediaItem, TextInputField } from "./types";

/* ─── Param registry lookup ─── */
export const getParamRegistry = (
  nodeType: string
): Array<{ key: string; label: string; type: string; options?: string[]; default: string | number; min?: number; max?: number; step?: number }> => {
  const schemaDef = NODE_API_SCHEMA[nodeType];
  if (schemaDef) {
    return schemaDef.params.map(p => ({
      key: p.key, label: p.label, type: p.type as string,
      options: p.options, default: p.default, min: p.min, max: p.max, step: p.step,
    }));
  }
  return [];
};

/* ─── Extract exposed fields from graph ─── */
export const extractFields = (graph: FlowGraph): { inputs: InputField[]; exposed: ExposedField[]; textInputs: TextInputField[] } => {
  const inputs: InputField[] = [];
  const exposed: ExposedField[] = [];
  const textInputs: TextInputField[] = [];
  // Build a set of input node IDs that have outgoing connections to action/AI nodes
  const connectedInputNodeIds = new Set<string>();
  for (const edge of graph.edges) {
    connectedInputNodeIds.add(edge.source);
  }

  for (const node of graph.nodes) {
    const d = node.data;
    if (node.type === "inputNode") {
      if (d.creatorAsset) continue;
      // Skip unconnected input nodes — they shouldn't appear in PlayFlow
      if (!connectedInputNodeIds.has(node.id)) continue;
      const cfg = (d.config as Record<string, unknown>) ?? {};
      inputs.push({
        nodeId: node.id,
        label: (d.label as string) || "Upload",
        fieldLabel: (d.fieldLabel as string) || (cfg.field_label as string) || "Upload your file",
        fieldType: (d.fieldType as "image" | "text" | "video") || "image",
        required: d.required === true,
        accept: d.accept as string | undefined,
        placeholder: d.placeholder as string | undefined,
        exampleImageUrls: (cfg.example_image_urls as string[]) ?? undefined,
      });
      continue;
    }
    if (node.type === "textInputNode") {
      textInputs.push({
        nodeId: node.id,
        label: (d.nodeName as string) || (d.label as string) || "Text Input",
        fieldLabel: (d.fieldLabel as string) || "Enter your text",
        placeholder: (d.placeholder as string) || "",
        defaultValue: (d.textValue as string) || "",
        required: d.isRequired === true,
        exampleText: (d.exampleText as string) || undefined,
      });
      continue;
    }
    const exposedMap = (d.exposed as Record<string, boolean>) ?? {};
    const params = (d.params as Record<string, unknown>) ?? {};
    const registry = getParamRegistry(node.type || "");
    for (const [key, isExposed] of Object.entries(exposedMap)) {
      if (!isExposed) continue;
      const meta = registry.find((p) => p.key === key);
      exposed.push({
        nodeId: node.id,
        nodeLabel: (d.label as string) || node.type || "Node",
        nodeType: node.type || "",
        paramKey: key,
        paramLabel: meta?.label || key,
        paramType: meta?.type || "text",
        options: meta?.options,
        defaultValue: (params[key] as string | number) ?? meta?.default ?? "",
        min: meta?.min,
        max: meta?.max,
        step: meta?.step,
      });
    }
  }
  // Sort textInputs by their first appearance order in prompt text (#[Name](nodeId))
  // Collect all prompt texts from action/AI nodes
  const allPromptTexts: string[] = [];
  for (const node of graph.nodes) {
    const d = node.data;
    const params = (d.params as Record<string, unknown>) ?? {};
    if (typeof params.prompt === "string") allPromptTexts.push(params.prompt);
    // Also check multi_prompt scenes
    const multiPrompt = params.multi_prompt;
    if (Array.isArray(multiPrompt)) {
      for (const scene of multiPrompt) {
        if (typeof scene === "object" && scene && typeof (scene as Record<string, unknown>).prompt === "string") {
          allPromptTexts.push((scene as Record<string, unknown>).prompt as string);
        }
      }
    }
  }
  const combinedPrompt = allPromptTexts.join("\n");

  const sortedTextInputs = [...textInputs].sort((a, b) => {
    const idxA = combinedPrompt.indexOf(a.nodeId);
    const idxB = combinedPrompt.indexOf(b.nodeId);
    // If not found in prompt, push to end
    const posA = idxA === -1 ? Infinity : idxA;
    const posB = idxB === -1 ? Infinity : idxB;
    return posA - posB;
  });

  return { inputs, exposed, textInputs: sortedTextInputs };
};

/* ─── Find action node (returns the LAST action node for output type, but we also expose all) ─── */
export const findActionNode = (graph: FlowGraph): { node: GraphNode; providerInfo: typeof NODE_PROVIDER_MAP[string] } | null => {
  for (const node of graph.nodes) {
    const info = NODE_PROVIDER_MAP[node.type];
    if (info) return { node, providerInfo: info };
  }
  return null;
};

/* ─── Find ALL action nodes in the graph ─── */
export const findAllActionNodes = (graph: FlowGraph): Array<{ node: GraphNode; providerInfo: typeof NODE_PROVIDER_MAP[string] }> => {
  const results: Array<{ node: GraphNode; providerInfo: typeof NODE_PROVIDER_MAP[string] }> = [];
  for (const node of graph.nodes) {
    const info = NODE_PROVIDER_MAP[node.type];
    if (info) results.push({ node, providerInfo: info });
  }
  return results;
};

/* ─── Build node params ─── */
export const buildNodeParams = (actionNode: GraphNode, paramOverrides: Record<string, Record<string, unknown>>): Record<string, unknown> => {
  const nodeParams = (actionNode.data.params as Record<string, unknown>) ?? {};
  const overrides = paramOverrides[actionNode.id] ?? {};
  return { ...nodeParams, ...overrides };
};

/* ─── Normalize example media ─── */
const isVideoPreviewUrl = (url: string) => /\.(mp4|webm|mov|m4v|avi)(\?|$)/i.test(url);

export const normalizeExampleMedia = (flow: { thumbnail_url?: string | null; settings?: unknown } | null): ExampleMediaItem[] => {
  if (!flow) return [];
  const settings = (flow.settings as Record<string, unknown> | null) ?? null;
  const sources = [settings?.preview_images, settings?.example_outputs, settings?.example_media, settings?.gallery, settings?.examples, settings?.preview_media];
  const items: ExampleMediaItem[] = [];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const raw of source) {
      if (typeof raw === "string") { items.push({ url: raw, type: isVideoPreviewUrl(raw) ? "video" : "image" }); continue; }
      if (raw && typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        const url = obj.url || obj.src || obj.media_url || obj.thumbnail_url;
        if (typeof url !== "string") continue;
        const rawType = obj.type || obj.media_type || obj.kind;
        const type = typeof rawType === "string" ? (rawType.toLowerCase().includes("video") ? "video" : "image") : isVideoPreviewUrl(url) ? "video" : "image";
        items.push({ url, type });
      }
    }
  }
  if (flow.thumbnail_url) items.unshift({ url: flow.thumbnail_url, type: isVideoPreviewUrl(flow.thumbnail_url) ? "video" : "image" });
  return items.filter((item, index, arr) => arr.findIndex((x) => x.url === item.url) === index).slice(0, 6);
};

/* ─── Format timer ─── */
export const formatTimer = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

/* ─── Classify poll result (pure, testable) ─── */
export type PollResultClassification =
  | { outcome: "succeed"; resultUrl: string; resultType: "video" | "image"; outputs?: Record<string, string> }
  | { outcome: "failed"; wasRefunded: boolean; error: string }
  | { outcome: "pending" };

export const classifyPollResult = (
  result: Record<string, unknown>,
  outputType: "video_url" | "image_url",
  fallbackError = "Generation failed"
): PollResultClassification => {
  if (result.status === "succeed") {
    const url = (result.result_url || result.video_url || "") as string;
    return {
      outcome: "succeed",
      resultUrl: url,
      resultType: outputType === "image_url" ? "image" : "video",
      outputs: (result.outputs as Record<string, string>) ?? undefined,
    };
  }
  if (result.status === "failed" || result.status === "failed_refunded") {
    return {
      outcome: "failed",
      wasRefunded: result.status === "failed_refunded" || !!result.refunded,
      error: (result.error as string) || fallbackError,
    };
  }
  return { outcome: "pending" };
};

/* ─── Resolve Output node results from graph edges + step outputs ─── */

export interface OutputNodeResult {
  outputNodeId: string;
  label: string;
  type: "video" | "image";
  url: string;
}

/**
 * Given the flow graph and a structured outputs dict from execution results,
 * resolves each Output node in the graph to its actual result URL by tracing
 * the edge from the Output node's input handle back to the source action node's
 * output handle (e.g., "output_video", "output_start_frame").
 *
 * @param graph - The flow graph containing nodes and edges
 * @param allOutputs - Combined outputs dict from all completed steps
 *   e.g. { "klingNodeId": { output_video: "url1", output_start_frame: "url2" } }
 *   OR a flat dict { output_video: "url1", output_start_frame: "url2" } for single-action flows
 * @param flatOutputs - Optional flat outputs dict (from poll result) for single-action fallback
 */
export const resolveOutputNodeResults = (
  graph: FlowGraph,
  stepOutputsByNodeId: Record<string, Record<string, string>>,
  flatOutputs?: Record<string, string>,
): OutputNodeResult[] => {
  const results: OutputNodeResult[] = [];

  const outputNodes = graph.nodes.filter((n) => n.type === "outputNode");
  if (outputNodes.length === 0) return results;

  // Also check flatOutputs for a "by_node" aggregated dict from the backend
  const byNodeFromBackend = (flatOutputs as Record<string, unknown>)?.by_node as Record<string, Record<string, string>> | undefined;

  // Merge by_node data from backend into stepOutputsByNodeId
  const mergedOutputs = { ...stepOutputsByNodeId };
  if (byNodeFromBackend) {
    for (const [nodeId, nodeData] of Object.entries(byNodeFromBackend)) {
      if (nodeData && typeof nodeData === "object") {
        const existing = mergedOutputs[nodeId] ?? {};
        const outputsInner = (nodeData as Record<string, unknown>).outputs as Record<string, string> | undefined;
        mergedOutputs[nodeId] = {
          ...existing,
          ...(outputsInner || {}),
          ...(nodeData.result_url ? { result_url: nodeData.result_url } : {}),
        };
      }
    }
  }

  for (const outNode of outputNodes) {
    const d = outNode.data as { label?: string; outputType?: string };
    const label = (d.label as string) || "Output";

    // Find the edge that connects TO this output node
    const incomingEdge = graph.edges.find((e) => e.target === outNode.id);
    if (!incomingEdge) continue;

    const sourceNodeId = incomingEdge.source;
    const sourceHandle = incomingEdge.sourceHandle || "output_video";

    // Try to find the URL from step outputs keyed by source node ID
    let url: string | undefined;
    const nodeOutputs = mergedOutputs[sourceNodeId];
    if (nodeOutputs) {
      url = nodeOutputs[sourceHandle];
    }

    // Fallback: try flat outputs dict (for single-action flows / poll results)
    if (!url && flatOutputs) {
      url = flatOutputs[sourceHandle];
    }

    // Fallback: if source handle is output_video and we have a result_url
    if (!url && flatOutputs && sourceHandle === "output_video") {
      url = flatOutputs["result_url"] || flatOutputs["video_url"];
    }

    // Fallback: check merged node outputs for result_url
    if (!url && nodeOutputs) {
      url = nodeOutputs["result_url"];
    }

    if (url) {
      // Detect type from URL rather than trusting node metadata
      const VIDEO_EXTS = /\.(mp4|webm|mov|m4v|avi)(\?|$)/i;
      const IMAGE_EXTS = /\.(png|jpe?g|webp|gif|bmp|svg|tiff?)(\?|$)/i;
      let resolvedType: "video" | "image";
      if (VIDEO_EXTS.test(url)) resolvedType = "video";
      else if (IMAGE_EXTS.test(url)) resolvedType = "image";
      else resolvedType = (d.outputType as "video" | "image") || "image";

      results.push({ outputNodeId: outNode.id, label, type: resolvedType, url });
    }
  }

  return results;
};
