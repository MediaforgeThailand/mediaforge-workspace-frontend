/**
 * Text Node — a reusable prompt block.
 *
 * Body uses the legacy `PromptMentionTextarea` so @mentions render as
 * blue chips (atomic — backspace deletes the whole pill in one go).
 * Tokens are serialised on the wire as `@[Label](nodeId)`, which the
 * backend's `workspace-run-node` dispatcher rewrites into positional
 * "image N" references plus a `[Context: …]` block before calling
 * the model.
 *
 * Data shape:
 *   { label: string     // editable; other nodes can @-mention it
 *   , content: string   // raw payload, contains @[Label](nodeId) tokens
 *   , width?: number    // drag-resized box width (px); falls back to default
 *   , height?: number   // drag-resized box height (px); falls back to default
 *   }
 */

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { type Edge, type NodeProps, useEdges, useNodes, useReactFlow } from "@xyflow/react";
import { AtSign, Loader2, Play, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl } from "@/hooks/useSignedUrl";
import PromptMentionTextarea from "@/components/flow/nodes/PromptMentionTextarea";
import { CLEAN_NODE_BODY_TOP_PX, PortIcon } from "./PortIcon";
import { useLanguage } from "@/contexts/LanguageContext";
import NodeQuickActionRail from "./NodeQuickActionRail";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { toast } from "sonner";
import { portTypeFromHandleId } from "./workspaceSchema";
import { friendlyErrorOr, functionErrorMessage } from "@/lib/friendlyError";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TextNodeData {
  label: string;
  content: string;
  width?: number;
  height?: number;
}

const TEXT_COLOR = "hsl(217 91% 60%)"; // blue — text output

/* Resize bounds. Defaults bumped +30% (260→338, 180→234) per user
 *  feedback that the Text node felt too small relative to other
 *  canvas tiles — at 260×180 it read as a small annotation when
 *  the whole point of TextNode is to be the prompt source for
 *  multi-mention chains. Existing nodes already have a saved
 *  `data.width` / `data.height`, so this only affects newly-
 *  created nodes; the corner resize handle can still drag back
 *  down to MIN. */
const DEFAULT_W = 338;
const DEFAULT_H = 234;
const MIN_W = 200;
const MIN_H = 120;
const MAX_W = 900;
const MAX_H = 800;
/* The body has padding/title/handle margin around the textarea.
 *  This subtraction lets the textarea fill the resized box exactly,
 *  with the inline-style cap from PromptMentionTextarea handling
 *  scroll when content exceeds visible height. */
const BODY_CHROME_H = 58;
const PROMPT_OPTIMIZER_FUNCTION = "workspace-chat";
const PROMPT_OPTIMIZER_MODEL = "gpt-5.5";
const WORKSPACE_MEDIA_BUCKET = "ai-media";
const BRACKETED_TOKEN_RE = /([#@])\[([^\]]+)\]\(([^)]+)\)/g;
const PLAIN_MENTION_RE = /@([A-Za-z0-9_][A-Za-z0-9_.-]*)/g;

const TEXT_NODE_MENTION_TYPES = [
  "assetNode",
  "inputNode",
  "elementNode",
  "imageGenNode",
  "videoGenNode",
  "audioGenNode",
  "videoToPromptNode",
  "imageTo3dNode",
  "removeBackgroundNode",
  "mergeAudioNode",
  "bananaProNode",
  "klingVideoNode",
  "chatAiNode",
  "groupNode",
];

const TEXT_NODE_IMAGE_INPUT_HANDLE = "ref_image";

const PROMPT_OPTIMIZER_SYSTEM_PROMPT = `You are a MediaForge prompt optimization engine.
Rewrite the user's rough instruction into one practical English prompt for image/video generation or editing.
Return only the final prompt text. No markdown, no title, no commentary.
Preserve every protected reference placeholder exactly, including spelling and brackets.
Use concrete, production-ready language: subject, action, visual changes, composition, lighting, identity preservation, and constraints when relevant.
Do not add new references. Do not invent unsupported model features.`;

type MentionableNode = {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
};

type TextImageMentionOption = {
  nodeId: string;
  label: string;
  type?: string;
  icon?: "image" | "video" | "text" | "ai" | "textvar";
  previewUrl?: string;
  sourceUrl?: string;
};

type PromptOptimizerAttachment = {
  imageUrl?: string;
  dataUrl?: string;
  mime?: string;
  detail?: "low" | "high" | "auto";
  label?: string;
  sourceNodeId?: string;
};

type ProtectedToken = {
  token: string;
  placeholder: string;
  label: string;
};

function textValue(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function getNodeLabel(node: MentionableNode): string {
  const data = node.data ?? {};
  const params = data.params as Record<string, unknown> | undefined;
  return (
    textValue(params?.nodeName) ||
    textValue(data.nodeName) ||
    textValue(data.label) ||
    node.id
  );
}

function selectedGeneration(data: Record<string, unknown>) {
  const generations = Array.isArray(data.generations)
    ? (data.generations as Array<Record<string, unknown>>)
    : [];
  const selectedIndex =
    typeof data.selectedGenIndex === "number" ? data.selectedGenIndex : 0;
  return generations[selectedIndex] ?? generations[0];
}

function storageBucketUrl(bucket: string, rawPath: string): string {
  const path = rawPath.trim().replace(/^\/+/, "");
  if (!path) return "";
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  if (path.startsWith(`${bucket}/`)) return `/${path}`;
  return `/${bucket}/${path}`;
}

function imagePreviewForNode(node: MentionableNode): string | undefined {
  const data = node.data ?? {};
  const params = data.params as Record<string, unknown> | undefined;
  const candidates = [
    data.previewUrl,
    data.preview_url,
    data.thumbnailUrl,
    data.thumbnail_url,
    data.imageUrl,
    data.image_url,
    data.storagePath,
    data.url,
    params?.previewUrl,
    params?.image_url,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  const generation = selectedGeneration(data);
  if (generation?.type === "image" && typeof generation.url === "string") {
    return generation.url;
  }
  return undefined;
}

function imageSourceForPromptOptimizer(node: MentionableNode): string | undefined {
  const data = node.data ?? {};
  const params = data.params as Record<string, unknown> | undefined;
  const generation = selectedGeneration(data);
  if (generation?.type === "image" && typeof generation.url === "string") {
    return generation.url;
  }

  /* Prefer already-fetchable URLs, then fall back to raw canvas
   *  storage paths by explicitly pinning them to the ai-media bucket. */
  const candidates = [
    data.imageUrl,
    data.image_url,
    data.previewUrl,
    data.preview_url,
    data.thumbnailUrl,
    data.thumbnail_url,
    data.url,
    params?.image_url,
    params?.previewUrl,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  const storageCandidates = [
    data.storagePath,
    data.storage_path,
    params?.storagePath,
    params?.storage_path,
  ];
  for (const candidate of storageCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return storageBucketUrl(WORKSPACE_MEDIA_BUCKET, candidate);
    }
  }
  return undefined;
}

function nodeCanProvideImageMention(
  node: MentionableNode | undefined,
  sourceHandle: string | null | undefined,
): boolean {
  if (!node) return false;
  const data = node.data ?? {};
  if (node.type === "assetNode" || node.type === "inputNode") {
    const fieldType = typeof data.fieldType === "string" ? data.fieldType : "image";
    return fieldType === "image";
  }
  if (node.type === "groupNode") return false;
  if (sourceHandle && portTypeFromHandleId(sourceHandle) !== "image") return false;
  const generation = selectedGeneration(data);
  if (generation) return generation.type === "image" && typeof generation.url === "string";
  return false;
}

function buildConnectedImageMentionOptions(
  textNodeId: string,
  nodes: MentionableNode[],
  edges: Edge[],
): TextImageMentionOption[] {
  const byNode = new Map<string, TextImageMentionOption>();
  for (const edge of edges) {
    if (edge.target !== textNodeId) continue;
    if ((edge.targetHandle ?? "") !== TEXT_NODE_IMAGE_INPUT_HANDLE) continue;
    const source = nodes.find((node) => node.id === edge.source);
    if (!nodeCanProvideImageMention(source, edge.sourceHandle)) continue;
    if (!source || byNode.has(source.id)) continue;
    byNode.set(source.id, {
      nodeId: source.id,
      label: getNodeLabel(source),
      type: source.type ?? "assetNode",
      icon: "image",
      previewUrl: imagePreviewForNode(source),
      sourceUrl: imageSourceForPromptOptimizer(source),
    });
  }
  return Array.from(byNode.values());
}

function safeMentionLabel(label: string): string {
  return (
    label
      .replace(/[\]()]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "reference"
  );
}

function normalizeMentionKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function isPlainMentionBoundary(text: string, index: number): boolean {
  if (index <= 0) return true;
  return !/[A-Za-z0-9_.-]/.test(text[index - 1] ?? "");
}

function canonicalizePlainMentions(
  prompt: string,
  candidates: TextImageMentionOption[],
): string {
  const byKey = new Map<string, MentionableNode>();

  for (const option of candidates) {
    const node: MentionableNode = {
      id: option.nodeId,
      type: option.type,
      data: { label: option.label },
    };
    const label = option.label;
    const keys = [
      normalizeMentionKey(label),
      normalizeMentionKey(node.id),
      normalizeMentionKey(label.replace(/\s+/g, "")),
    ].filter(Boolean);
    for (const key of keys) {
      if (!byKey.has(key)) byKey.set(key, node);
    }
  }

  return prompt.replace(
    PLAIN_MENTION_RE,
    (full, rawName: string, offset: number, text: string) => {
      if (!isPlainMentionBoundary(text, offset)) return full;
      const node = byKey.get(normalizeMentionKey(rawName));
      if (!node) return full;
      return `@[${safeMentionLabel(getNodeLabel(node))}](${node.id})`;
    },
  );
}

function compactMentionWhitespace(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripDisconnectedImageMentions(
  prompt: string,
  allowedImageNodeIds: ReadonlySet<string>,
): { text: string; removedLabels: string[] } {
  const removedLabels: string[] = [];
  const bracketed = new RegExp(BRACKETED_TOKEN_RE.source, "g");
  const text = prompt.replace(
    bracketed,
    (full: string, sigil: string, label: string, nodeId: string) => {
      if (sigil !== "@") return full;
      if (allowedImageNodeIds.has(nodeId)) return full;
      removedLabels.push(label || nodeId);
      return "";
    },
  );
  return {
    text: compactMentionWhitespace(text),
    removedLabels,
  };
}

function rangeOverlaps(
  range: { start: number; end: number },
  ranges: Array<{ start: number; end: number }>,
): boolean {
  return ranges.some(
    (existing) => range.start < existing.end && range.end > existing.start,
  );
}

function protectPromptTokens(prompt: string): {
  text: string;
  tokens: ProtectedToken[];
};
function protectPromptTokens(
  prompt: string,
  allowedImageNodeIds?: ReadonlySet<string>,
): {
  text: string;
  tokens: ProtectedToken[];
} {
  const ranges: Array<{
    start: number;
    end: number;
    token: string;
    label: string;
  }> = [];
  let match: RegExpExecArray | null;
  const bracketed = new RegExp(BRACKETED_TOKEN_RE.source, "g");
  while ((match = bracketed.exec(prompt)) !== null) {
    const sigil = match[1] ?? "";
    const nodeId = match[3] ?? "";
    if (sigil === "@" && allowedImageNodeIds && !allowedImageNodeIds.has(nodeId)) {
      continue;
    }
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
      token: match[0],
      label: match[2] ?? match[0],
    });
  }

  if (!allowedImageNodeIds) {
    const plain = new RegExp(PLAIN_MENTION_RE.source, "g");
    while ((match = plain.exec(prompt)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (!isPlainMentionBoundary(prompt, start)) continue;
      if (rangeOverlaps({ start, end }, ranges)) continue;
      ranges.push({
        start,
        end,
        token: match[0],
        label: match[1] ?? match[0],
      });
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  let cursor = 0;
  let text = "";
  const tokens: ProtectedToken[] = [];

  ranges.forEach((range, index) => {
    const placeholder = `[[MEDIAFORGE_REFERENCE_${index + 1}]]`;
    text += prompt.slice(cursor, range.start);
    text += placeholder;
    cursor = range.end;
    tokens.push({ token: range.token, placeholder, label: range.label });
  });
  text += prompt.slice(cursor);

  return { text, tokens };
}

function stripPromptWrapper(text: string): string {
  return text
    .trim()
    .replace(/^```(?:text|prompt)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^(optimized prompt|final prompt|prompt)\s*:\s*/i, "")
    .trim();
}

function restoreProtectedTokens(
  text: string,
  tokens: ProtectedToken[],
): string {
  let restored = stripPromptWrapper(text);
  for (const token of tokens) {
    restored = restored.split(token.placeholder).join(token.token);
  }

  const missing = tokens.filter((token) => !restored.includes(token.token));
  if (missing.length > 0) {
    const suffix = `Required references: ${missing.map((token) => token.token).join(", ")}.`;
    restored = `${restored.replace(/\s+$/, "")}${restored.endsWith(".") ? "" : "."} ${suffix}`;
  }
  return restored.trim();
}

function inferDataUrlMime(dataUrl: string): string | undefined {
  const match = /^data:([^;]+);base64,/i.exec(dataUrl);
  return match?.[1];
}

async function buildPromptOptimizerAttachments(
  refs: TextImageMentionOption[],
): Promise<PromptOptimizerAttachment[]> {
  const seen = new Set<string>();
  const attachments: PromptOptimizerAttachment[] = [];

  for (const ref of refs) {
    const sourceUrl = ref.sourceUrl ?? ref.previewUrl;
    if (!sourceUrl) {
      throw new Error(
        `Image reference "${ref.label}" has no finished image URL yet. Generate or re-add that image, then click Prompt again.`,
      );
    }

    if (/^blob:/i.test(sourceUrl)) {
      throw new Error(
        `Image reference "${ref.label}" is still uploading. Wait for it to finish, then click Prompt again.`,
      );
    }

    if (/^data:/i.test(sourceUrl)) {
      const key = `${ref.nodeId}:data`;
      if (seen.has(key)) continue;
      seen.add(key);
      attachments.push({
        dataUrl: sourceUrl,
        mime: inferDataUrlMime(sourceUrl),
        detail: "low",
        label: ref.label,
        sourceNodeId: ref.nodeId,
      });
      continue;
    }

    const imageUrl = await getSignedUrl(sourceUrl);
    /* getSignedUrl falls back to the raw input string on failure
     *  (e.g. wrong-bucket guess, missing object). OpenAI then rejects
     *  it as "invalid URL format". Validate up front so the user gets
     *  an actionable error tied to the specific reference. */
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
      throw new Error(
        `Image reference "${ref.label}" could not be resolved to a fetchable URL. The asset may be missing or the upload didn't finish — try removing and re-adding it.`,
      );
    }
    const key = imageUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    attachments.push({
      imageUrl,
      detail: "low",
      label: ref.label,
      sourceNodeId: ref.nodeId,
    });
  }

  return attachments;
}

function buildOptimizerUserMessage(
  prompt: string,
  tokens: ProtectedToken[],
  attachments: PromptOptimizerAttachment[] = [],
): string {
  const refs = tokens.length
    ? tokens
        .map((token) => `- ${token.placeholder} = ${token.label}`)
        .join("\n")
    : "- none";
  const attachedRefs = attachments.length
    ? attachments
        .map((attachment, index) => {
          const label = attachment.label ?? attachment.sourceNodeId ?? "image reference";
          const nodeId = attachment.sourceNodeId ? ` (${attachment.sourceNodeId})` : "";
          return `- image input ${index + 1}: ${label}${nodeId}`;
        })
        .join("\n")
    : "- none";

  return [
    "Optimize this prompt for a real MediaForge generation node.",
    "The prompt may be written in Thai or mixed Thai/English. Convert the intent into clear English.",
    "Keep every reference placeholder in the final prompt exactly as listed.",
    "Actual connected image inputs may be attached to this request. Use them to understand visual details, identity, style, and composition.",
    "If an attached image is not explicitly represented by a protected placeholder, use it only as visual context and do not invent a new placeholder for it.",
    "",
    "Protected references:",
    refs,
    "",
    "Attached connected images:",
    attachedRefs,
    "",
    "User prompt:",
    prompt,
  ].join("\n");
}

function buildCanvasContext(
  nodes: MentionableNode[],
  edges: Array<{
    source?: string;
    target?: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }>,
) {
  const state = useWorkspaceStore.getState();
  const current = state.current;
  const project = state.projects.find((p) => p.id === current?.projectId);
  const workspace = state.workspaces.find((w) => w.id === current?.workspaceId);

  return {
    project_id: current?.projectId ?? null,
    project_name: project?.name ?? null,
    workspace_id: current?.workspaceId ?? null,
    workspace_name: workspace?.name ?? null,
    canvas_id: current?.id ?? null,
    canvas_name: current?.name ?? null,
    nodes: nodes.slice(0, 60).map((node) => {
      const data = node.data ?? {};
      const params = data.params as Record<string, unknown> | undefined;
      return {
        id: node.id,
        type: node.type,
        label: getNodeLabel(node),
        model: textValue(params?.model_name) || undefined,
      };
    }),
    edges: edges.slice(0, 80).map((edge) => ({
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    })),
  };
}

const TextNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as TextNodeData;
  const { setNodes, getNodes, getEdges } = useReactFlow();
  const graphNodes = useNodes();
  const edges = useEdges();
  const { t, language } = useLanguage();
  const [isHovered, setIsHovered] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const width = d.width ?? DEFAULT_W;
  const height = d.height ?? DEFAULT_H;

  const updateField = useCallback(
    (field: "label" | "content", value: string) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  const onContentChange = useCallback(
    (v: string) => updateField("content", v),
    [updateField],
  );

  const connectedImageMentionOptions = useMemo(
    () =>
      buildConnectedImageMentionOptions(
        id,
        graphNodes as MentionableNode[],
        edges,
      ),
    [edges, graphNodes, id],
  );

  const connectedImageMentionNodeIds = useMemo(
    () => new Set(connectedImageMentionOptions.map((option) => option.nodeId)),
    [connectedImageMentionOptions],
  );

  const optimizePrompt = useCallback(async () => {
    const source = (d.content ?? "").trim();
    if (!source || isOptimizing) return;

    setIsOptimizing(true);
    try {
      const nodes = getNodes() as MentionableNode[];
      const edges = getEdges();
      const freshConnectedOptions = buildConnectedImageMentionOptions(
        id,
        nodes,
        edges,
      );
      const freshConnectedNodeIds = new Set(
        freshConnectedOptions.map((option) => option.nodeId),
      );
      const { text: connectedOnlySource, removedLabels } =
        stripDisconnectedImageMentions(source, freshConnectedNodeIds);
      if (removedLabels.length > 0 && connectedOnlySource !== source) {
        updateField("content", connectedOnlySource);
        toast.info("Removed old image refs that are no longer connected to this Text node.");
      }
      if (!connectedOnlySource.trim()) {
        throw new Error("Connect an image ref or write a prompt before optimizing.");
      }
      const canonicalPrompt = canonicalizePlainMentions(
        connectedOnlySource,
        freshConnectedOptions,
      );
      const protectedPrompt = protectPromptTokens(
        canonicalPrompt,
        freshConnectedNodeIds,
      );
      const attachments = await buildPromptOptimizerAttachments(
        freshConnectedOptions,
      );
      const userMessage = buildOptimizerUserMessage(
        protectedPrompt.text,
        protectedPrompt.tokens,
        attachments,
      );

      const { data: result, error } = await supabase.functions.invoke(
        PROMPT_OPTIMIZER_FUNCTION,
        {
          body: {
            model: PROMPT_OPTIMIZER_MODEL,
            system_prompt: PROMPT_OPTIMIZER_SYSTEM_PROMPT,
            messages: [{ role: "user", content: userMessage, attachments }],
            canvas_context: buildCanvasContext(nodes, edges),
          },
        },
      );

      if (error) {
        /* supabase-js wraps non-2xx as a generic "Edge Function returned
         *  a non-2xx status code". The real message (e.g. the OpenAI
         *  error text the function threw) lives on `error.context` —
         *  surface it so the toast says *why*, not just *that*. */
        throw new Error(await functionErrorMessage(error));
      }
      const content =
        typeof (result as { content?: unknown } | null)?.content === "string"
          ? (result as { content: string }).content
          : "";
      if (!content.trim())
        throw new Error(t("workspace.node.prompt_optimize_empty_error"));

      const optimized = restoreProtectedTokens(content, protectedPrompt.tokens);
      updateField("content", optimized);
      toast.success(t("workspace.node.prompt_optimize_success"));
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const fallback = raw || t("workspace.node.prompt_optimize_failed");
      toast.error(friendlyErrorOr(err, language, fallback));
    } finally {
      setIsOptimizing(false);
    }
  }, [
    d.content,
    id,
    getEdges,
    getNodes,
    isOptimizing,
    language,
    t,
    updateField,
  ]);

  // Token count derived from serialised form — used by the footer chip.
  const onDeleteNode = useCallback(() => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
  }, [id, setNodes]);

  const mentionCount = useMemo(() => {
    const text = d.content ?? "";
    const matches = [...text.matchAll(/@\[[^\]]+\]\(([^)]+)\)/g)];
    if (matches.length === 0) return 0;
    return matches.filter((m) => connectedImageMentionNodeIds.has(m[1])).length;
  }, [connectedImageMentionNodeIds, d.content]);

  /* Drag-to-resize from the bottom-right corner. Pointer-event based
   *  so it covers mouse + pen + touch with one handler. Pointer
   *  capture means the drag keeps tracking even when the cursor
   *  leaves the dot. Stop propagation so React Flow doesn't
   *  interpret the gesture as a node-drag. Width + height are
   *  committed to `node.data` on every move so undo/redo + live
   *  multiplayer overlays see the change in real time. */
  const startSizeRef = useRef<{
    w: number;
    h: number;
    x: number;
    y: number;
  } | null>(null);
  const onResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      startSizeRef.current = {
        w: width,
        h: height,
        x: e.clientX,
        y: e.clientY,
      };

      const onMove = (ev: PointerEvent) => {
        const start = startSizeRef.current;
        if (!start) return;
        const nextW = Math.max(
          MIN_W,
          Math.min(MAX_W, start.w + (ev.clientX - start.x)),
        );
        const nextH = Math.max(
          MIN_H,
          Math.min(MAX_H, start.h + (ev.clientY - start.y)),
        );
        setNodes((ns) =>
          ns.map((n) =>
            n.id === id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    width: Math.round(nextW),
                    height: Math.round(nextH),
                  },
                }
              : n,
          ),
        );
      };

      const onEnd = () => {
        startSizeRef.current = null;
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onEnd);
        target.removeEventListener("pointercancel", onEnd);
      };

      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onEnd);
      target.addEventListener("pointercancel", onEnd);
    },
    [id, setNodes, width, height],
  );

  return (
    // Outer wrapper — `overflow-visible` so the floating title sits
    // OUTSIDE the body box and ports can overhang the corners.
    <div
      className="ws-clean-node relative"
      data-state={selected ? "selected" : "idle"}
      data-status={isOptimizing ? "processing" : "idle"}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ width }}
    >
      {/* Floating title — icon + editable name, NO background, NO
       *  border, sits above the body (matches the design reference). */}
      <NodeQuickActionRail
        visible={selected || isHovered}
        selected={selected}
        onDelete={selected ? onDeleteNode : undefined}
        nodeId={id}
        mediaKind="text"
        bodyTopOffsetPx={CLEAN_NODE_BODY_TOP_PX}
      />

      <div className="ws-clean-title">
        {/* Title icon is neutral grey across every node type — TEXT_COLOR
         *  still drives the output port + wire colour below. */}
        <Type className="ws-clean-title-icon text-zinc-400" />
        <input
          value={d.label ?? ""}
          onChange={(e) => updateField("label", e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="ws-clean-title-input nodrag"
          placeholder={t("workspace.node.text_name_placeholder")}
        />
      </div>

      {/* Body — single clean rounded box, no internal dividers.
       *  Height is now driven by the resized `height` (or default)
       *  so the box is a real container the textarea can fill. */}
      <div
        className={cn(
          "workspace-node-shell ws-clean-body flex flex-col overflow-hidden",
          selected && "is-selected",
        )}
        data-state={selected ? "selected" : "idle"}
        style={{ height }}
      >
        <div className="min-h-0 flex-1 overflow-hidden">
          <PromptMentionTextarea
            value={d.content ?? ""}
            onChange={onContentChange}
            placeholder={t("workspace.node.text_body_placeholder")}
            excludeNodeId={id}
            // Workspace assets show up under `assetNode`. Include the
            // legacy `inputNode` so a flow imported from the main
            // editor still resolves its mentions here.
            allowedNodeTypes={TEXT_NODE_MENTION_TYPES}
            mentionOptionsOverride={connectedImageMentionOptions}
            /* `leading-snug` (1.375) replaces `leading-relaxed`
             *  (1.625). User reported the lines felt too far apart
             *  on the Text node specifically — same fix as
             *  StickyNote, slightly looser because the body text is
             *  bigger (15.5px vs 13px) and benefits from a touch
             *  more breathing room for Thai diacritics. */
            className="ws-clean-textarea min-h-[48px] text-[15.5px] leading-snug text-zinc-100"
            /* Cap the rendered textarea to the resized body height
             *  minus the body's own padding + footer chip area.
             *  Inline-style cap (set inside PromptMentionTextarea)
             *  beats Tailwind's `max-h-[280px]` so the textarea
             *  always fits the user's chosen height and scrolls
             *  inside the box when content overflows. */
            maxHeightPx={Math.max(48, height - BODY_CHROME_H)}
          />
        </div>

        {mentionCount > 0 && (
          <div className="mt-0.5 flex shrink-0 items-center gap-1 pr-[86px] text-[9px] font-medium leading-none text-zinc-400/90">
            <AtSign className="h-2.5 w-2.5 text-zinc-500" />
            <span>
              {mentionCount}{" "}
              {mentionCount === 1
                ? t("workspace.node.text_ref_singular")
                : t("workspace.node.text_ref_plural")}
            </span>
          </div>
        )}

        <div className="ws-text-prompt-anchor">
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void optimizePrompt();
                }}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDownCapture={(e) => e.stopPropagation()}
                aria-disabled={isOptimizing || !(d.content ?? "").trim()}
                aria-label={t("workspace.node.prompt_optimize_aria")}
                className={cn(
                  "ws-text-prompt-button nodrag nopan",
                  (isOptimizing || !(d.content ?? "").trim()) && "is-disabled",
                )}
              >
                {isOptimizing ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Play className="fill-current" />
                )}
                <span>{t("workspace.node.prompt_optimize_label")}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align="end"
              className="max-w-[220px] border-white/10 bg-[#151515] px-3 py-2 text-xs leading-snug text-zinc-100 shadow-2xl shadow-black/40"
            >
              {isOptimizing
                ? t("workspace.node.prompt_optimize_running")
                : t("workspace.node.prompt_optimize_tip")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Resize handle — tiny dot anchored at the bottom-right of
       *  the body. Visible while the node is selected so an idle
       *  text card stays clean. `nodrag nopan` so React Flow
       *  doesn't grab the pointer for canvas pan; `cursor-nwse-
       *  resize` makes the affordance obvious. */}
      {selected && (
        <div
          onPointerDown={onResizeStart}
          className="nodrag nopan absolute -bottom-1 -right-1 z-10 h-3 w-3 cursor-nwse-resize rounded-full bg-blue-500 shadow-md ring-2 ring-zinc-900/80"
          style={{ touchAction: "none" }}
          title="Drag to resize"
        />
      )}

      {/* Image refs wired here are the only nodes exposed in @mention. */}
      <PortIcon
        dir="target"
        handleId={TEXT_NODE_IMAGE_INPUT_HANDLE}
        label={t("workspace.port.ref_image")}
        portType="image"
        color={TEXT_COLOR}
        index={0}
        bodyTopOffsetPx={CLEAN_NODE_BODY_TOP_PX}
      />

      {/* Output handle — text-typed icon at the top-right cluster. */}
      <PortIcon
        dir="source"
        handleId="default"
        label={t("workspace.node.text_output")}
        portType="text"
        color={TEXT_COLOR}
        index={0}
        bodyTopOffsetPx={CLEAN_NODE_BODY_TOP_PX}
      />
    </div>
  );
});

TextNode.displayName = "TextNode";
export default TextNode;
