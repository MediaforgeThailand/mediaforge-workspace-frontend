/**
 * Workspace Canvas — React Flow surface.
 *
 * Unified tool nodes (imageGenNode, videoGenNode) go through the
 * workspace-specific `WorkspaceToolNode` renderer, which reads the
 * shared schema + handles Kling custom logic when it applies.
 *
 * Simple AI tools (BG remove, Merge audio) still use their legacy
 * per-tool components directly. The result bar / history dialog is
 * now rendered directly inside each node component when
 * `data.generations` is populated — there's no shared HOC anymore.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionLineType,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useConnection,
  useEdges,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnConnectStartParams,
  type Viewport,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./workspace.css";
// Side-effect import — registers the <model-viewer> custom element
// the moment the workspace canvas mounts. Bundled locally instead
// of via CDN so it always loads (the previous CDN tag occasionally
// failed to attach the element class, leaving 3D previews blank).
// `<model-viewer>` is loaded from a CDN script in index.html (per
// the official guide at modelviewer.dev). The npm bundle path was
// unreliable under Vite — keep this comment as a breadcrumb so we
// don't reach for `import "@google/model-viewer";` again. The
// custom element is globally registered before main.tsx runs.
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import {
  selectIsViewer,
  useWorkspaceShareRole,
} from "@/store/useWorkspaceShareRole";

import WorkspaceToolNode from "./WorkspaceToolNode";
import AssetNode from "./AssetNode";
import ElementNode from "./ElementNode";
import TextNode from "./TextNode";
import GroupNode from "./GroupNode";
import StickyNoteNode from "./StickyNoteNode";
import { cloneNodeFresh } from "./cloneNode";
import MultiSelectionFrame from "./MultiSelectionFrame";
import NodePreviewLightbox, {
  getNodePreview,
  getNodeDownloadable,
  type PreviewPayload,
} from "./NodePreviewLightbox";
// ImageCropTool stays eager: NodePreviewLightbox imports it eagerly,
// so a lazy() here would still land in the main canvas chunk.
// Follow-up: lazy inside NPL too, then flip this to lazy.
import { ImageCropTool } from "./ImageCropTool";
import {
  getWorkspaceSchema,
  getWsVisibleInputs,
  isTextNodeImageOutputHandle,
  isTextNodeVideoOutputHandle,
  isVideoFrameImageOutputHandle,
  portTypeFromHandleId,
  textNodeVideoOutputHandle,
} from "./workspaceSchema";
import { inheritParamsFromSource } from "./inheritParams";
import CanvasNodePicker, {
  type CanvasNodePickerState,
  type PickerOption,
} from "./CanvasNodePicker";
import type { ContextMenuState, ToolItem } from "./CanvasContextMenu";
// Lazy: CanvasContextMenu only renders on canvas right-click. No other
// file imports it eagerly, so Vite carves it into its own chunk.
const CanvasContextMenu = lazy(() => import("./CanvasContextMenu"));
// MediaContextMenu stays eager: AssetNode, NodeResultBar, AssetsView,
// and StandaloneGenerator all import it eagerly, so a lazy() here
// would be cosmetic — it'd still land in the main canvas chunk.
// Follow-up: lazy those sites too, then flip this to lazy.
import MediaContextMenu, { type MediaContextMenuItem } from "./MediaContextMenu";
import {
  Copy as CtxCopyIcon,
  Download as CtxDownloadIcon,
  Eye as CtxEyeIcon,
  FileArchive as CtxFileArchiveIcon,
  Group as CtxGroupIcon,
  Trash2 as CtxTrash2Icon,
} from "lucide-react";
import { downloadFromUrl } from "./downloadAsset";
import {
  buildExtractedAudioFile,
  buildMutedVideoFile,
  extractAudioBlobFromVideo,
  removeAudioFromVideoBlob,
} from "./videoAudioActions";
import { bundleNodesAsZip, harvestAssetsFromNode } from "./bundleNodes";
import CanvasFloatingSidebar from "./CanvasFloatingSidebar";
// Lazy: dialog only opens via keyboard shortcut or settings button.
const ShortcutsDialog = lazy(() => import("./ShortcutsDialog"));
// VoicePickerDialog was removed when the hardcoded preset voice
// lists were deleted. The canvas no longer hosts a voice picker —
// audio nodes use the backend's per-provider default voice.
import { useCanvasJobsRecovery } from "@/store/useCanvasJobsRecovery";
import { useCanvasToolStore } from "./useCanvasToolStore";
import { useWorkspaceShortcuts } from "./useWorkspaceShortcuts";
import { useCanvasAutosave } from "./useCanvasAutosave";
import { useCanvasRealtime } from "./useCanvasRealtime";
import CanvasCollaborationOverlay from "./CanvasCollaborationOverlay";
import { useCanvasCollaborationStore } from "./canvasCollaboration";
import { useLanguage } from "@/contexts/LanguageContext";
import { friendlyError } from "@/lib/friendlyError";

const VIEWPORT_KEY = (canvasId: string) => `workspace-viewport-${canvasId}`;
const STORAGE_BUCKET = "ai-media";

type NodeDataWithParams = {
  params?: { model_name?: string };
};

type AssetNodeData = {
  fieldType?: string;
};

function nodeModelName(node: Node | undefined, fallback: string): string {
  const data = node?.data as NodeDataWithParams | undefined;
  return data?.params?.model_name ?? fallback;
}

function assetFieldType(node: Node | undefined): string | undefined {
  const data = node?.data as AssetNodeData | undefined;
  return typeof data?.fieldType === "string" ? data.fieldType : undefined;
}
// Supabase Storage signed-URL TTL. Was 24h — way too short for a
// canvas the user keeps open across sessions. The previous value
// turned every asset into a ticking time-bomb (URL 403'd at the
// 24h mark, image broke, looked like data loss). Bump to ~1 year
// (Supabase max). Long-term fix is `useFreshSignedUrl` below which
// re-signs on display, but generous TTL up front is belt-and-braces.
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 365;

/**
 * Port-type compatibility table. Used by `isValidConnection` to reject
 * nonsense wiring (e.g. dropping a TextNode edge into a ref_image slot).
 * Matched by handle id — keep in sync with schema port ids.
 */
// NOTE on the *_TARGETS sets below: keep in sync with the
// `*_HANDLE_IDS` sets in `workspaceSchema.ts` (which feed
// `portTypeFromHandleId`) AND with the backend `HANDLE_SCHEMA` in
// `mediaforge-workspace-backend/.../workspace-run-node/index.ts`.
// Drift between any of these means a wire visible to one layer is
// rejected by another. Audit Round 2 caught `mask` / `image_input` /
// `context_text` / `ref_audio` missing here.
const TEXT_TARGETS = new Set(["text", "context", "context_text"]);

/**
 * Find the topmost groupNode whose absolute bbox contains the given
 * point. Used both by `onDrop` (sidebar drops landing on a group's
 * frame) and `onNodeDragStop` (canvas-to-canvas drags) so the
 * grouping behaviour is consistent: drop a node anywhere inside a
 * group's frame → it becomes a child of that group.
 *
 * Bbox check is point-in-rect (drop point or dragged-node centre),
 * NOT bbox-overlap, so dragging through a group on the way somewhere
 * else doesn't accidentally re-parent.
 */
function findContainingGroup(
  point: { x: number; y: number },
  allNodes: ReadonlyArray<Node>,
  excludeNodeId?: string,
): Node | null {
  for (const n of allNodes) {
    if (n.type !== "groupNode") continue;
    if (excludeNodeId && n.id === excludeNodeId) continue;
    if (!n.position || typeof n.position.x !== "number") continue;
    const gx = n.position.x;
    const gy = n.position.y;
    const gw =
      (n.style?.width as number | undefined) ??
      (n as Node & { measured?: { width?: number } }).measured?.width ??
      400;
    const gh =
      (n.style?.height as number | undefined) ??
      (n as Node & { measured?: { height?: number } }).measured?.height ??
      300;
    if (point.x >= gx && point.x <= gx + gw && point.y >= gy && point.y <= gy + gh) {
      return n;
    }
  }
  return null;
}

/**
 * Count how many children of the given group emit the given media
 * type. Used by the connection validator: a group with 10 image
 * children can't legally land on a port that maxes out at 9 refs,
 * and a group with > 1 child can't land on a single-slot port like
 * `start_frame` at all.
 *
 * Resolution per child mirrors WorkspaceToolNode.resolveInputs so
 * the validator's count matches what actually gets sent at Run time.
 */
function countGroupChildrenOfType(
  groupId: string,
  type: "image" | "video" | "audio",
  allNodes: ReadonlyArray<Node>,
): number {
  // Mirror GroupNode.outputTypes: count ONLY children that produce a
  // real URL right now — tool nodes without generations contribute
  // zero, so the port doesn't advertise (GroupNode hides it) and
  // this counter doesn't over-promise. Keeps validator and renderer
  // in lockstep.
  let count = 0;
  for (const child of allNodes) {
    if (child.parentId !== groupId) continue;
    const cd = (child.data ?? {}) as Record<string, unknown>;
    let childType: "image" | "video" | "audio" | null = null;

    if (child.type === "assetNode") {
      const ft = cd.fieldType as string | undefined;
      const url =
        (cd.previewUrl as string | undefined) ??
        (cd.storagePath as string | undefined);
      if ((ft === "image" || ft === "video" || ft === "audio") && url) {
        childType = ft;
      }
    } else if (child.type === "elementNode") {
      const refs = Array.isArray(cd.reference_images)
        ? (cd.reference_images as unknown[]).filter(
            (u): u is string => typeof u === "string" && !!u,
          )
        : [];
      const hasUrl =
        refs.length > 0 ||
        typeof cd.frontal_image_url === "string" ||
        typeof cd.thumbnail_url === "string";
      if (hasUrl) childType = "image";
    } else if (Array.isArray(cd.generations) && cd.generations.length > 0) {
      const gens = cd.generations as Array<{ type?: string; url?: string }>;
      const idx =
        typeof cd.selectedGenIndex === "number"
          ? (cd.selectedGenIndex as number)
          : 0;
      const g = gens[idx] ?? gens[0];
      if (g?.url) {
        const t = g.type;
        childType = t === "video" ? "video" : t === "audio" ? "audio" : "image";
      }
    }
    // Tool node with no generations yet → contributes nothing.

    if (childType === type) count++;
  }
  return count;
}
/** TextNode's img_1/2/3 slots accept either image OR video, so they   */
/* appear in both sets below.                                         */
const IMAGE_TARGETS = new Set([
  "image", "image_input", "ref_image", "reference_image", "start_frame", "end_frame", "mask",
  "img_1", "img_2", "img_3",
  // ElementNode (Kling element) — 4 reference slots + 1 frontal
  "ref_1", "ref_2", "ref_3", "ref_4", "frontal",
]);
const VIDEO_TARGETS = new Set([
  "video", "ref_video",
  "img_1", "img_2", "img_3",
]);
const AUDIO_TARGETS = new Set(["audio", "ref_audio"]);
const ELEMENT_TARGETS = new Set(["elements", "element"]);
const MODEL3D_TARGETS = new Set(["model3d", "model_3d", "ref_model"]);
const SEEDANCE_V2_KEYFRAME_TARGETS = new Set(["start_frame", "end_frame"]);
const SEEDANCE_V2_REFERENCE_TARGETS = new Set(["reference_image", "ref_video", "ref_image", "ref_audio"]);

function isSeedanceV2VideoModel(model: string | undefined): boolean {
  const m = String(model ?? "").toLowerCase();
  return m.startsWith("seedance-2-0") || m.startsWith("dreamina-seedance-2-0");
}

function seedanceV2InputMode(handleId: string | null | undefined): "keyframe" | "reference" | null {
  const h = String(handleId ?? "");
  if (SEEDANCE_V2_KEYFRAME_TARGETS.has(h)) return "keyframe";
  if (SEEDANCE_V2_REFERENCE_TARGETS.has(h)) return "reference";
  return null;
}

function hasSeedanceV2ModeConflict(args: {
  targetNode: Node | undefined;
  selectedModel: string;
  targetHandle: string | null | undefined;
  edges: ReadonlyArray<Edge>;
}): boolean {
  if (args.targetNode?.type !== "videoGenNode" || !isSeedanceV2VideoModel(args.selectedModel)) {
    return false;
  }
  const nextMode = seedanceV2InputMode(args.targetHandle);
  if (!nextMode) return false;
  const hasOppositeMode = args.edges.some((edge) => {
    if (edge.target !== args.targetNode?.id) return false;
    const mode = seedanceV2InputMode(edge.targetHandle);
    return mode !== null && mode !== nextMode;
  });
  return hasOppositeMode;
}

function availableVideoTargetHandlesForNode(
  targetNode: Node | undefined,
  edgeList: ReadonlyArray<Edge>,
): string[] {
  if (!targetNode?.type) return [];
  const schema = getWorkspaceSchema(targetNode.type);
  if (!schema) return [];
  const selectedModel = nodeModelName(targetNode, schema.defaultModel);
  return getWsVisibleInputs(targetNode.type, selectedModel)
    .filter((input) => VIDEO_TARGETS.has(input.id))
    .filter((input) => {
      const max = input.maxConnections ?? 1;
      const existing = edgeList.filter(
        (edge) => edge.target === targetNode.id && edge.targetHandle === input.id,
      ).length;
      return existing < max;
    })
    .map((input) => input.id);
}

function textNodeConnectedVideoSourceIds(
  textNodeId: string,
  nodeList: ReadonlyArray<Node>,
  edgeList: ReadonlyArray<Edge>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const edge of edgeList) {
    if (edge.target !== textNodeId) continue;
    if ((edge.targetHandle ?? "") !== "ref_video") continue;
    const source = nodeList.find((node) => node.id === edge.source);
    const sourceType = source?.type ?? "";
    const sourceData = (source?.data ?? {}) as AssetNodeData & { generations?: Array<{ type?: string; url?: string }> };
    const fieldType = sourceType === "assetNode" || sourceType === "inputNode"
      ? sourceData.fieldType
      : undefined;
    const generation = Array.isArray(sourceData.generations)
      ? sourceData.generations[0]
      : undefined;
    const isVideoSource =
      fieldType === "video" ||
      portTypeFromHandleId(edge.sourceHandle ?? "") === "video" ||
      (generation?.type === "video" && typeof generation.url === "string");
    if (!isVideoSource || seen.has(edge.source)) continue;
    seen.add(edge.source);
    ids.push(edge.source);
  }
  return ids;
}

/**
 * Module-level stable empty arrays. Zustand selectors return these
 * when `current` is null/undefined so the snapshot identity stays
 * stable across renders. Returning a fresh `[]` literal each call
 * — which `s.current?.nodes ?? []` does — makes `useSyncExternalStore`
 * detect a "change" on every render → triggers a re-render → calls
 * the selector again → another fresh `[]` → infinite loop. React
 * raises invariant #185 ("Maximum update depth exceeded") and the
 * WorkspaceErrorBoundary catches it as a full-screen crash card.
 *
 * Read more: https://zustand-demo.pmnd.rs/ "getSnapshot" warning.
 */
const STABLE_EMPTY_NODES: Node[] = [];
const STABLE_EMPTY_EDGES: Edge[] = [];

/**
 * Module-level stable references for ReactFlow PROP arrays — same
 * identity-stability problem as the selector empty arrays above.
 *
 * Background: ReactFlow stores these arrays in its internal store
 * via useSyncExternalStore. When we passed `[1, 2]` / `["Delete",
 * "Backspace"]` / `["Shift", "Meta", "Control"]` as inline literals
 * EVERY render allocated a new array → ReactFlow's snapshot check
 * saw a "change" → the ReactFlow store published an update → React
 * scheduled a re-render of every store subscriber (which includes
 * THIS component, because we read nodes/edges) → re-render →
 * inline `[1, 2]` again → loop.
 *
 * The bisect that disabled DebugPanel / RightSidebar / Mascot kept
 * failing because the loop's source isn't in those panels — it's
 * here, in the props of the ReactFlow component itself. Lifting
 * the literals out of render breaks the cycle.
 */
const PAN_ON_DRAG_HAND: number[] = [0, 1, 2];
const PAN_ON_DRAG_DEFAULT: number[] = [1, 2];
const DELETE_KEYS: string[] = ["Delete", "Backspace"];
const MULTI_SELECT_KEYS: string[] = ["Shift", "Meta", "Control"];
const DEFAULT_EDGE_OPTIONS = { type: "default" } as const;
const PRO_OPTIONS = { hideAttribution: true } as const;

const PASTE_FILE_EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

function isClipboardMediaType(type: string): boolean {
  const lower = type.toLowerCase();
  return (
    lower.startsWith("image/") ||
    lower.startsWith("video/") ||
    lower.startsWith("audio/")
  );
}

function isClipboardMediaFile(file: File): boolean {
  if (isClipboardMediaType(file.type)) return true;
  return /\.(png|jpe?g|webp|gif|svg|mp4|webm|mov|mp3|wav|m4a)$/i.test(
    file.name,
  );
}

function inferClipboardMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return lower.includes("audio") ? "audio/webm" : "video/webm";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  return "image/png";
}

function pastedFileName(type: string, index: number): string {
  const lower = type.toLowerCase();
  const kind = lower.startsWith("video/")
    ? "video"
    : lower.startsWith("audio/")
      ? "audio"
      : "image";
  const ext =
    PASTE_FILE_EXT_BY_MIME[lower] ??
    lower.split("/")[1]?.replace(/[^a-z0-9]/gi, "") ??
    "png";
  return `pasted-${kind}-${Date.now()}-${index + 1}.${ext}`;
}

function normalizeClipboardFile(file: File, index: number): File {
  const inferredType = file.type || inferClipboardMimeFromName(file.name);
  if (file.name && file.name.trim() && file.type) return file;
  return new File([file], file.name?.trim() || pastedFileName(inferredType, index), {
    type: inferredType,
    lastModified: Date.now(),
  });
}

function clipboardFiles(event: ClipboardEvent): File[] {
  const directFiles = Array.from(event.clipboardData?.files ?? []);
  if (directFiles.length > 0) {
    return directFiles.map((file, index) => normalizeClipboardFile(file, index));
  }
  const items = Array.from(event.clipboardData?.items ?? []);
  return items
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .map((file, index) => normalizeClipboardFile(file, index));
}

async function asyncClipboardFiles(): Promise<File[]> {
  if (!navigator.clipboard?.read) return [];
  try {
    const items = await navigator.clipboard.read();
    const files: File[] = [];
    for (const item of items) {
      const type = item.types.find(isClipboardMediaType);
      if (!type) continue;
      const blob = await item.getType(type);
      files.push(
        new File([blob], pastedFileName(blob.type || type, files.length), {
          type: blob.type || type,
          lastModified: Date.now(),
        }),
      );
    }
    return files;
  } catch {
    return [];
  }
}

function clipboardHtmlImageSources(event: ClipboardEvent): string[] {
  const html = event.clipboardData?.getData("text/html")?.trim();
  if (!html) return [];
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return Array.from(doc.querySelectorAll("img"))
      .map((img) => img.getAttribute("src")?.trim() ?? "")
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function clipboardHtmlFiles(event: ClipboardEvent): Promise<File[]> {
  const sources = clipboardHtmlImageSources(event);
  const files: File[] = [];
  for (const source of sources) {
    try {
      const response = await fetch(source);
      if (!response.ok) continue;
      const blob = await response.blob();
      if (!isClipboardMediaType(blob.type)) continue;
      files.push(
        new File([blob], pastedFileName(blob.type, files.length), {
          type: blob.type,
          lastModified: Date.now(),
        }),
      );
    } catch {
      // Cross-origin image URLs and foreign blob: URLs are not always
      // readable. Keep trying other clipboard representations.
    }
  }
  return files;
}

const nodeTypes = {
  // All schema-driven tools route through WorkspaceToolNode — that's
  // the only place where the V2 Run button + workspace-run-node
  // dispatcher live. WorkspaceToolNode uses the preview-first
  // compact layout (see CompactParamWidgets / workspace.css), so the
  // result strip and history dialog are baked into the node itself.
  imageGenNode: WorkspaceToolNode,
  videoGenNode: WorkspaceToolNode,
  audioGenNode: WorkspaceToolNode,
  removeBackgroundNode: WorkspaceToolNode,
  mergeAudioNode: WorkspaceToolNode,
  videoToPromptNode: WorkspaceToolNode,
  imageTo3dNode: WorkspaceToolNode,
  // Workspace-only.
  assetNode: AssetNode,
  elementNode: ElementNode,
  textNode: TextNode,
  groupNode: GroupNode,
  stickyNoteNode: StickyNoteNode,
};

/**
 * Reflects React Flow's "connection in progress" state onto the
 * document body as data attributes:
 *
 *   data-rfc="true"            anyone is dragging a wire right now
 *   data-rfc-type="image|…"    the data type of the dragged port
 *                              (derived from its handle id)
 *   data-rfc-dir="source|target"   which side the drag started from
 *                              source = drag from an OUTPUT  → reveal
 *                                       compatible INPUT bubbles
 *                              target = drag from an INPUT   → reveal
 *                                       compatible OUTPUT bubbles
 *
 * The CSS layer in workspace.css uses these attrs to fade in ONLY
 * handles whose `data-port-type` matches AND whose React-Flow side
 * (.react-flow__handle-source / -target) is the opposite of where
 * the drag started — i.e. real compatibility, not "show everything".
 */
const useConnectingAttribute = () => {
  const connection = useConnection();
  useEffect(() => {
    const body = document.body;
    if (connection.inProgress) {
      body.setAttribute("data-rfc", "true");
      const handleId = connection.fromHandle?.id ?? "";
      const fromNodeId = connection.fromNode?.id ?? null;
      // Side: handle.type is "source" (output) or "target" (input).
      const dir = connection.fromHandle?.type ?? "source";

      /* Resolve the wire's data type from two sources:
       *   1. DOM `data-port-type` attribute on the actual handle —
       *      authoritative because every PortIcon writes it. This
       *      covers the generic `id="default"` handles too (TextNode
       *      tags as "text", AssetNode tags as its fieldType).
       *   2. Schema-based lookup by handle id — fallback for handles
       *      that somehow lost their DOM attribute.
       *
       * Earlier version had a third fallback that called
       * `getNode(fromNodeId)` from useReactFlow. That was the
       * source of a React #185 infinite loop because `getNode`'s
       * identity changes on every internal React Flow state update,
       * making this useEffect re-run on every mousemove during a
       * drag. Dropped it — every PortIcon-rendered handle has
       * `data-port-type` set, so the DOM read alone covers every
       * real case. */
      let dataType: string = portTypeFromHandleId(handleId);
      if (fromNodeId) {
        const handleEl = document.querySelector(
          `.react-flow__node[data-id="${CSS.escape(fromNodeId)}"] ` +
            `.react-flow__handle[data-handleid="${CSS.escape(handleId)}"]`,
        ) as HTMLElement | null;
        const domType = handleEl?.getAttribute("data-port-type");
        if (domType) dataType = domType;
      }

      body.setAttribute("data-rfc-dir", dir);
      body.setAttribute("data-rfc-type", dataType);
    } else {
      body.removeAttribute("data-rfc");
      body.removeAttribute("data-rfc-dir");
      body.removeAttribute("data-rfc-type");
    }
    return () => {
      body.removeAttribute("data-rfc");
      body.removeAttribute("data-rfc-dir");
      body.removeAttribute("data-rfc-type");
    };
  }, [
    connection.inProgress,
    connection.fromHandle?.id,
    connection.fromHandle?.type,
    connection.fromNode?.id,
  ]);
};

/**
 * Highlight the wires touching the currently-selected node(s).
 *
 * UX problem: clicking a node didn't visually show what it was
 * connected to. Users had to either click each connected wire
 * one by one OR mentally trace the lines through a busy canvas.
 * Rendering all connected edges with a glow when the node is
 * selected gives instant visual feedback ("this node connects to
 * THESE 3 things").
 *
 * Implementation: instead of mutating each edge's `selected` /
 * `className` (which would dirty the autosave fingerprint and
 * trigger network writes on every click), we inject a single
 * `<style>` element with rules targeting React-Flow's per-edge
 * `data-id` attribute. Pure presentational, no edge data
 * touched. Cleared automatically when no node is selected (the
 * component returns null, the style tag unmounts).
 */
const EdgeHighlightOnNodeSelect = () => {
  // Subscribe to the SET of selected node ids, encoded as a sorted
  // comma-joined string so React's referential equality short-
  // circuits when the selection hasn't actually changed (just
  // hovered, just panned, etc.).
  const selectedKey = useStore(
    (s) => {
      const ids: string[] = [];
      for (const n of s.nodeLookup.values()) {
        if (n.selected) ids.push(n.id);
      }
      ids.sort();
      return ids.join(",");
    },
  );
  const edges = useEdges();

  const css = useMemo(() => {
    if (!selectedKey) return "";
    const selected = new Set(selectedKey.split(","));
    const matchedEdgeIds: string[] = [];
    for (const e of edges) {
      if (selected.has(e.source) || selected.has(e.target)) {
        matchedEdgeIds.push(e.id);
      }
    }
    if (matchedEdgeIds.length === 0) return "";
    // CSS.escape keeps edge ids that contain `:` / `-` / `.` legal
    // inside the attribute selector.
    const selector = matchedEdgeIds
      .map(
        (id) =>
          `.react-flow__edge[data-id="${CSS.escape(id)}"] .react-flow__edge-path`,
      )
      .join(", ");
    return `${selector} {
      stroke: hsl(217 91% 70%) !important;
      stroke-width: 2.5px !important;
      filter: drop-shadow(0 0 6px hsl(217 91% 60% / 0.7));
      transition:
        stroke 120ms var(--ws-ease),
        stroke-width 120ms var(--ws-ease),
        filter 120ms var(--ws-ease);
    }`;
  }, [selectedKey, edges]);

  if (!css) return null;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
};

const Inner = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const {
    screenToFlowPosition,
    setViewport,
    getViewport,
    setNodes,
    setEdges,
    getEdges,
  } = useReactFlow();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  // Viewer-mode flag — when true, the canvas renders read-only:
  // no node drags, no new connections, no marquee selection (still
  // selectable so the lightbox/preview affordances work, just no
  // mutating actions). The ShareModeBanner up top tells the user
  // they're in this state. Editor mode is NOT read-only — editors
  // can mutate the local graph and run nodes; their changes just
  // don't persist (see useCanvasAutosave for the bail-out).
  const isViewer = useWorkspaceShareRole(selectIsViewer);
  // RE-ENABLED after the React #185 refactor: dropped the unstable
  // `getNode` dep in favour of a DOM-only data-port-type read, so
  // the effect now only re-runs when the connection target changes
  // (not on every mousemove). Drives the "fade incompatible handles"
  // CSS during a wire drag — without it, users had to manually
  // hover the target node to see its input ports, which led to the
  // user complaint that only `ref_image` showed (it was the only
  // already-extended port; start_frame/end_frame stayed tucked in
  // until the node was actively hovered).
  useConnectingAttribute();
  // Server-side autosave (Figma-style). Pushes the active canvas
  // to `workspace_canvases` on every change (debounced 600ms) +
  // flushes via fetch keepalive on tab close. The `saveState`
  // value is also broadcast to the tab bar via a window event so
  // a small "Saved / Saving…" indicator can render up there.
  const saveState = useCanvasAutosave();
  useCanvasRealtime();
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("workspace-save-state", { detail: { state: saveState } }),
    );
  }, [saveState]);

  const canvasId = useWorkspaceStore((s) => s.current?.id);
  const canvasWorkspaceId = useWorkspaceStore((s) => s.current?.workspaceId);

  // Batched canvas-wide load of completed jobs for orphan recovery.
  // Replaces the per-WorkspaceToolNode select that fired N times on
  // mount; tool nodes now read their slice from useCanvasJobsRecovery.
  useEffect(() => {
    if (!canvasId || !canvasWorkspaceId) return;
    void useCanvasJobsRecovery
      .getState()
      .loadForCanvas(canvasId, canvasWorkspaceId);
  }, [canvasId, canvasWorkspaceId]);

  // STABLE_EMPTY_* — see comment near the top of this file. Returning a
  // fresh `[]` literal each call would loop the store-snapshot check.
  const nodes = useWorkspaceStore((s) => (s.current?.nodes as Node[] | undefined) ?? STABLE_EMPTY_NODES);
  const edges = useWorkspaceStore((s) => (s.current?.edges as Edge[] | undefined) ?? STABLE_EMPTY_EDGES);
  const onNodesChange = useWorkspaceStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkspaceStore((s) => s.onEdgesChange);
  const onConnect = useWorkspaceStore((s) => s.onConnect);
  const onConnectWithTextVideoPassthrough = useCallback(
    (connection: Connection) => {
      onConnect(connection);

      const sourceHandle = connection.sourceHandle ?? "default";
      const targetHandle = connection.targetHandle ?? "";
      if (
        sourceHandle !== "default" ||
        !connection.source ||
        !connection.target ||
        !TEXT_TARGETS.has(targetHandle)
      ) {
        return;
      }

      let state = useWorkspaceStore.getState();
      let nodeList = state.current?.nodes ?? [];
      let edgeList = state.current?.edges ?? [];
      const sourceNode = nodeList.find((node) => node.id === connection.source);
      const targetNode = nodeList.find((node) => node.id === connection.target);
      if (sourceNode?.type !== "textNode" || !targetNode) return;

      const videoSourceIds = textNodeConnectedVideoSourceIds(
        sourceNode.id,
        nodeList,
        edgeList,
      );
      if (videoSourceIds.length === 0) return;

      for (const videoSourceId of videoSourceIds) {
        state = useWorkspaceStore.getState();
        nodeList = state.current?.nodes ?? [];
        edgeList = state.current?.edges ?? [];
        const nextHandle = availableVideoTargetHandlesForNode(targetNode, edgeList)[0];
        if (!nextHandle) break;
        const videoOutputHandle = textNodeVideoOutputHandle(videoSourceId);
        const duplicate = edgeList.some(
          (edge) =>
            edge.source === sourceNode.id &&
            edge.sourceHandle === videoOutputHandle &&
            edge.target === targetNode.id &&
            edge.targetHandle === nextHandle,
        );
        if (duplicate) continue;
        onConnect({
          source: sourceNode.id,
          sourceHandle: videoOutputHandle,
          target: targetNode.id,
          targetHandle: nextHandle,
        });
      }
    },
    [onConnect],
  );
  const addSchemaNode = useWorkspaceStore((s) => s.addSchemaNode);
  const addAssetNode = useWorkspaceStore((s) => s.addAssetNode);
  const updateNodeData = useWorkspaceStore((s) => s.updateNodeData);
  const setSelectedNode = useWorkspaceStore((s) => s.setSelectedNode);
  const pushHistory = useWorkspaceStore((s) => s.pushHistory);
  const cursorEnabled = useCanvasCollaborationStore((s) => s.cursorEnabled);
  const publishCursor = useCanvasCollaborationStore((s) => s.publishCursor);
  const publishSelection = useCanvasCollaborationStore((s) => s.publishSelection);
  const cursorThrottleRef = useRef(0);

  const publishCanvasCursor = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!canvasId || !cursorEnabled) return;
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const now = Date.now();
      if (now - cursorThrottleRef.current < 100) return;
      cursorThrottleRef.current = now;
      publishCursor({
        canvasId,
        xPct: (event.clientX - rect.left) / rect.width,
        yPct: (event.clientY - rect.top) / rect.height,
        sentAt: now,
        cursorEnabled: true,
      });
    },
    [canvasId, cursorEnabled, publishCursor],
  );

  const hideCanvasCursor = useCallback(() => {
    if (!canvasId) return;
    publishCursor({
      canvasId,
      xPct: 0,
      yPct: 0,
      sentAt: Date.now(),
      cursorEnabled: false,
    });
  }, [canvasId, publishCursor]);

  useEffect(() => {
    if (!canvasId) return;
    const raw = localStorage.getItem(VIEWPORT_KEY(canvasId));
    if (!raw) return;
    try {
      const vp = JSON.parse(raw) as Viewport;
      setViewport(vp);
    } catch {
      /* ignore */
    }
  }, [canvasId, setViewport]);

  const onMoveEnd = useCallback(() => {
    if (!canvasId) return;
    localStorage.setItem(VIEWPORT_KEY(canvasId), JSON.stringify(getViewport()));
  }, [canvasId, getViewport]);

  const uploadAsset = useCallback(
    async (file: File, position: XYPosition) => {
      if (!user) {
        toast.error(t("workspace.toast.login_to_upload"));
        return;
      }
      // 200 MB cap — covers Thai-creator typical workflows (4k video
      // clips, RAW DSLR photos, multi-page PSDs) without letting the
      // bucket get blasted. The bucket also has a server-side
      // file_size_limit migration of the same value as defence in
      // depth; this client check just gives a friendly toast instead
      // of waiting for the upload to fail mid-stream.
      const MAX_BYTES = 200 * 1024 * 1024;
      if (file.size > MAX_BYTES) {
        const sizeMb = Math.round(file.size / (1024 * 1024));
        toast.error(
          `ไฟล์ใหญ่เกินไป (${sizeMb}MB) — สูงสุด 200MB / File too large (max 200 MB)`,
        );
        return;
      }
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      const isAudio = file.type.startsWith("audio/");
      // 3D mesh detection — extension-based because browsers usually
      // give us empty / generic mime types for .glb / .gltf / .usdz.
      // The extensions match what `<model-viewer>` can load, so we
      // route them straight into a 3d-typed AssetNode.
      const isModel3d = /\.(glb|gltf|usdz|obj|fbx)$/i.test(file.name);
      if (!isImage && !isVideo && !isAudio && !isModel3d) {
        toast.error(t("workspace.toast.supported_files"));
        return;
      }

      const fieldType: "image" | "video" | "audio" | "model3d" =
        isModel3d ? "model3d"
        : isVideo ? "video"
        : isAudio ? "audio"
        : "image";
      const localPreview = URL.createObjectURL(file);
      const defaultLabel = file.name.replace(/\.[^.]+$/, "").slice(0, 40);

      const nodeId = addAssetNode(
        {
          label: defaultLabel,
          fieldType,
          previewUrl: localPreview,
          fileName: file.name,
          uploading: true,
        },
        position,
      );

      // If the file was dropped over a group's frame, re-parent the
      // freshly-spawned AssetNode so it becomes a child of that
      // group. Same logic the sync drop paths use, but here we run
      // it inline because uploadAsset is async and the new node is
      // already on canvas before storage upload finishes.
      const allNodes = useWorkspaceStore.getState().current?.nodes ?? [];
      const target = findContainingGroup(position, allNodes, nodeId);
      if (target) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  parentId: target.id,
                  position: {
                    x: position.x - target.position.x,
                    y: position.y - target.position.y,
                  },
                }
              : n,
          ),
        );
      }

      const ext =
        file.name.split(".").pop() ||
        (isModel3d ? "glb" : isVideo ? "mp4" : isAudio ? "mp3" : "png");
      const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: true });

      if (upErr) {
        toast.error(t("workspace.toast.upload_failed", { name: file.name }));
        updateNodeData(nodeId, { uploading: false });
        URL.revokeObjectURL(localPreview);
        return;
      }

      const { data: signed } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);

      updateNodeData(nodeId, {
        previewUrl: signed?.signedUrl ?? localPreview,
        storagePath,
        uploading: false,
      });
      URL.revokeObjectURL(localPreview);
    },
    [user, addAssetNode, updateNodeData, setNodes, t],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files") ? "copy" : "move";
  }, []);

  /**
   * After a fresh node is spawned via onDrop (sidebar tile / file
   * drop / asset re-use / element re-use), check whether the drop
   * point landed inside any groupNode's frame; if so, re-parent the
   * new node so it becomes a child of that group, with its position
   * converted to be relative to the group origin. Without this,
   * sidebar drops on top of a group would visually overlap the
   * frame but stay free, which is what the user reported as
   * "not becoming a group asset".
   */
  const reparentSpawned = useCallback(
    (newId: string, dropPointAbs: { x: number; y: number }) => {
      const all = useWorkspaceStore.getState().current?.nodes ?? [];
      const target = findContainingGroup(dropPointAbs, all, newId);
      if (!target) return;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== newId) return n;
          return {
            ...n,
            parentId: target.id,
            position: {
              x: dropPointAbs.x - target.position.x,
              y: dropPointAbs.y - target.position.y,
            },
          };
        }),
      );
    },
    [setNodes],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        // File uploads spawn AssetNodes asynchronously inside
        // uploadAsset. The async path means we can't easily intercept
        // the new id here; uploadAsset itself handles the parent
        // assignment via the same group-bbox check below.
        Array.from(files).forEach((file, i) => {
          const offset = { x: position.x + i * 28, y: position.y + i * 28 };
          void uploadAsset(file, offset);
        });
        return;
      }

      // Saved-element re-use payload — spawn an ElementNode in saved
      // mode (cached refs already on the row, no edge wiring needed).
      const elemReuseRaw = e.dataTransfer.getData("application/reactflow-element-reuse");
      if (elemReuseRaw) {
        try {
          const er = JSON.parse(elemReuseRaw) as {
            brand_element_id: string;
            name: string;
            thumbnail_url?: string;
            reference_images?: string[];
            frontal_image_url?: string;
          };
          if (er?.brand_element_id) {
            const newId = addSchemaNode("elementNode", er.name ?? "Element", position, {
              brand_element_id: er.brand_element_id,
              reference_images: er.reference_images ?? [],
              frontal_image_url: er.frontal_image_url,
              thumbnail_url: er.thumbnail_url,
            });
            reparentSpawned(newId, position);
            return;
          }
        } catch {
          /* ignore malformed payload */
        }
      }

      // Re-use payload from the asset library — spawn an AssetNode
      // pointing at the existing URL without re-uploading.
      const reuseRaw = e.dataTransfer.getData("application/reactflow-asset-reuse");
      if (reuseRaw) {
        try {
          const reuse = JSON.parse(reuseRaw) as {
            fieldType: "image" | "video" | "audio" | "model3d";
            url: string;
            label?: string;
            fileName?: string;
            /** Optional poster (3D rendered_image) so AssetNode
             *  doesn't render as a black box while the GLB streams. */
            posterUrl?: string;
          };
          if (reuse?.url && reuse?.fieldType) {
            const newId = addAssetNode(
              {
                label: reuse.label ?? reuse.fileName ?? "asset",
                fieldType: reuse.fieldType,
                previewUrl: reuse.url,
                posterUrl: reuse.posterUrl,
                fileName: reuse.fileName,
                uploading: false,
              },
              position,
            );
            reparentSpawned(newId, position);
            return;
          }
        } catch {
          /* ignore malformed payload */
        }
      }

      const type = e.dataTransfer.getData("application/reactflow-type");
      if (!type) return;
      const label = e.dataTransfer.getData("application/reactflow-label") || type;
      const overridesRaw = e.dataTransfer.getData("application/reactflow-overrides");
      let overrides: Record<string, unknown> = {};
      try {
        if (overridesRaw) overrides = JSON.parse(overridesRaw);
      } catch {
        /* ignore */
      }
      const newId = addSchemaNode(type, label, position, overrides);
      reparentSpawned(newId, position);
    },
    [uploadAsset, addSchemaNode, addAssetNode, screenToFlowPosition, reparentSpawned],
  );

  const isNodeControlEvent = (event: React.MouseEvent): boolean =>
    (event.target as HTMLElement | null)?.closest?.(
      ".node-quick-action-rail, .node-quick-menu, .node-quick-action-button",
    ) != null;

  const onNodeClick: NodeMouseHandler = useCallback(
    (e, node) => {
      if (isNodeControlEvent(e)) return;
      setSelectedNode(node.id);
      publishSelection(node.id);
    },
    [publishSelection, setSelectedNode],
  );
  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      // Sticky mode: a click on empty canvas plants a Post-it where
      // the cursor is. Falls through to deselection for the default
      // (select / cursor) tool so single-clicks still clear focus.
      const t = useCanvasToolStore.getState().tool;
      if (t === "sticky") {
        const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const id = `s_${crypto.randomUUID()}`;
        useWorkspaceStore.setState((s) => {
          const stickyNode: Node = {
            id,
            type: "stickyNoteNode",
            position: flowPos,
            data: { text: "" },
          };
          if (!s.current) return {};
          const nextNodes = [...s.current.nodes, stickyNode];
          return {
            current: { ...s.current, nodes: nextNodes },
            graphs: { ...s.graphs, [s.current.id]: { ...s.current, nodes: nextNodes } },
          };
        });
        reparentSpawned(id, flowPos);
        // Drop the user back into select mode after planting one — a
        // single sticky is the common case; if they want to spam
        // them, they can re-click the sticky tool.
        useCanvasToolStore.getState().setTool("select");
        return;
      }
      setSelectedNode(null);
      publishSelection(null);
    },
    [publishSelection, setSelectedNode, screenToFlowPosition, reparentSpawned],
  );

  /** Cut tool: clicking a wire deletes it. Bound to React Flow's
   *  `onEdgeClick`. We early-out for any other tool so clicks behave
   *  normally (selecting the edge for highlight). */
  const onEdgeClick = useCallback(
    (_e: React.MouseEvent, edge: Edge) => {
      const t = useCanvasToolStore.getState().tool;
      if (t !== "cut") return;
      onEdgesChange([{ id: edge.id, type: "remove" }]);
    },
    [onEdgesChange],
  );

  /* ── Drag-to-empty-canvas → spawn picker ─────────────────────
   *  Track which port the user grabbed in onConnectStart, then in
   *  onConnectEnd check whether the drop landed on empty canvas (no
   *  handle / no node under the cursor). If so, surface the picker
   *  with node types whose ports can complete the wire.
   */
  const connectStartRef = useRef<{
    nodeId: string | null;
    handleId: string | null;
    handleType: "source" | "target" | null;
  } | null>(null);
  const [picker, setPicker] = useState<CanvasNodePickerState | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [quickCrop, setQuickCrop] = useState<{
    src: string;
    label: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // Right-click on a NODE (single or multi-selected) → small action
  // menu with Download / Download all generations / Copy / Delete (and
  // the multi-selection "Download all as ZIP" variant). Empty-canvas
  // right-click is owned by the `contextMenu` state above
  // (CanvasContextMenu / tool palette) — these two never collide
  // because React Flow's `onNodeContextMenu` and `onPaneContextMenu`
  // are mutually exclusive event channels, and the wrapper-level
  // onContextMenu skips when the cursor was on a node element.
  const [nodeContextMenu, setNodeContextMenu] = useState<{
    position: { x: number; y: number };
    /** The actual nodes the menu is acting on. For a right-click on a
     *  node that's NOT part of the current selection, this is just
     *  [that-node]; for a right-click anywhere on a multi-selection,
     *  it's the full selection. */
    targetNodes: Node[];
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Voice picker state was removed when the hardcoded preset voice
  // lists were deleted. Audio gen nodes use the backend's
  // per-provider default voice; users override only in the
  // standalone /app voice gen tool.

  // Tool mode (select / hand / cut / sticky). Read once at the top
  // so we can flip ReactFlow props (panOnDrag, selectionOnDrag) and
  // handle pane / edge clicks based on the active tool.
  const tool = useCanvasToolStore((s) => s.tool);

  /** Right-click on canvas → open the categorised tool picker at the
   *  click point. We block both the browser context menu and the
   *  React-Flow pane click that would otherwise deselect everything.
   *
   *  EXCEPTION: when the user has a multi-selection active and right-
   *  clicks on empty canvas, surface the NODE context menu (with
   *  "Download all as ZIP" etc.) instead of the tool palette — that's
   *  the gesture they reach for to act on the selection without
   *  re-clicking individual tiles. */
  const onPaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      e.preventDefault();
      // Viewer mode is read-only — the pane/tool-palette menu offers
      // node creation + deletion, both of which are mutations. Bail
      // out with the browser's default suppressed so right-click is
      // a no-op rather than surfacing actions the visitor can't take.
      if (isViewer) return;
      // Active multi-selection? Route to node menu, not tool palette.
      const allNodes =
        useWorkspaceStore.getState().current?.nodes ?? [];
      const sel = allNodes.filter((n) => n.selected);
      if (sel.length >= 2) {
        setContextMenu(null);
        setNodeContextMenu({
          position: { x: e.clientX, y: e.clientY },
          targetNodes: sel,
        });
        return;
      }
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setContextMenu({
        screen: { x: e.clientX, y: e.clientY },
        flow,
      });
    },
    [screenToFlowPosition, isViewer],
  );

  /** Right-click on a SINGLE node → small action menu (Download /
   *  Download all generations / Copy / Delete). If the right-clicked
   *  node is part of the current multi-selection, we treat the gesture
   *  as a "act on the whole selection" and surface the multi variant
   *  ("Download all (N) as ZIP" etc.) instead. React Flow fires this
   *  event INSTEAD of `onPaneContextMenu` when the cursor is on a
   *  node, so the two never compete. */
  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      // Suppress the browser's native context menu and the pane-level
      // tool palette — both would steal focus from our menu.
      e.preventDefault();
      e.stopPropagation();
      // Viewer mode → no node-action menu (delete, duplicate, etc.
      // are all mutations). Right-click becomes a silent no-op.
      if (isViewer) return;
      // Always close the tool palette first (defensive — multiple
      // right-click variants in flight create stacked overlays).
      setContextMenu(null);

      const allNodes =
        useWorkspaceStore.getState().current?.nodes ?? [];
      const sel = allNodes.filter((n) => n.selected);
      const isPartOfSelection = sel.some((n) => n.id === node.id);
      const targetNodes =
        isPartOfSelection && sel.length >= 2 ? sel : [node];

      setNodeContextMenu({
        position: { x: e.clientX, y: e.clientY },
        targetNodes,
      });
    },
    [isViewer],
  );

  /** Right-click on the multi-selection bounding box (React Flow's
   *  `onSelectionContextMenu` event — fires when the click lands
   *  inside the selection rectangle even if not on a specific node).
   *  We route to the same node-context handler with the full
   *  selection. */
  const onSelectionContextMenu = useCallback(
    (e: React.MouseEvent, nodes: Node[]) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu(null);
      if (nodes.length === 0) return;
      setNodeContextMenu({
        position: { x: e.clientX, y: e.clientY },
        targetNodes: nodes,
      });
    },
    [],
  );

  /* ── Right-click action handlers ──
   *
   *  These mirror the existing keyboard / toolbar paths so behaviour
   *  is identical regardless of how the user fires the action. Each
   *  one is a *closure* the menu fires on item click — the menu
   *  itself is dumb (no business logic). */
  const onCtxDownloadSingle = useCallback((node: Node) => {
    const downloadable = getNodeDownloadable(node);
    if (!downloadable) {
      toast.error(t("workspace.toast.nothing_dl_no_output"));
      return;
    }
    void downloadFromUrl(downloadable.url, downloadable.label);
  }, [t]);

  const onCtxPreview = useCallback((node: Node) => {
    const all = useWorkspaceStore.getState().current?.nodes ?? [];
    /* Look up the node by id in the LATEST store snapshot rather
     *  than trusting the captured `node` object that was attached
     *  to the right-click event. The captured one can lag behind
     *  generations that landed after the menu opened — using the
     *  fresh row means clicking Preview right after a job
     *  completes always finds the new asset. */
    const fresh = all.find((n) => n.id === node.id) ?? node;
    const p = getNodePreview(fresh, all);
    if (!p) {
      toast.error(t("workspace.canvas.noPreviewAvailable"));
      return;
    }
    setPreview(p);
  }, [t]);

  useEffect(() => {
    const handler = (evt: Event) => {
      const nodeId = (evt as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (!nodeId) return;
      const all = useWorkspaceStore.getState().current?.nodes ?? [];
      const node = all.find((n) => n.id === nodeId);
      if (!node) return;
      const p = getNodePreview(node, all);
      if (p) setPreview(p);
    };
    window.addEventListener("workspace-open-node-preview", handler);
    return () => window.removeEventListener("workspace-open-node-preview", handler);
  }, []);

  const uploadTransformedFile = useCallback(
    async (file: File) => {
      const centre = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      await uploadAsset(file, centre);
    },
    [screenToFlowPosition, uploadAsset],
  );

  const onQuickNodeAction = useCallback(
    async (
      action: "crop" | "export-audio" | "remove-audio",
      nodeId: string,
    ) => {
      const all = useWorkspaceStore.getState().current?.nodes ?? [];
      const node = all.find((n) => n.id === nodeId);
      if (!node) return;
      const p = getNodePreview(node, all);
      const label =
        (p?.label && p.label.trim()) ||
        ((node.data as Record<string, unknown> | undefined)?.label as string | undefined) ||
        "asset";

      if (action === "crop") {
        if (!p || p.type !== "image" || !p.url) {
          toast.error(t("workspace.canvas.cropImageOnly"));
          return;
        }
        setQuickCrop({ src: p.url, label });
        return;
      }

      if (!p || p.type !== "video" || !p.url) {
        toast.error(t("workspace.canvas.actionVideoOnly"));
        return;
      }

      const toastId = toast.loading(
        action === "export-audio"
          ? t("workspace.canvas.exportingAudio")
          : t("workspace.canvas.removingAudio"),
      );
      try {
        if (action === "export-audio") {
          const audioBlob = await extractAudioBlobFromVideo(p.url);
          await uploadTransformedFile(buildExtractedAudioFile(audioBlob, label));
          toast.success(t("workspace.canvas.audioAssetAdded"), { id: toastId });
          return;
        }

        const mutedVideoBlob = await removeAudioFromVideoBlob(p.url);
        await uploadTransformedFile(buildMutedVideoFile(mutedVideoBlob, label));
        toast.success(t("workspace.canvas.mutedVideoAdded"), { id: toastId });
      } catch (err) {
        toast.error(
          err instanceof Error
            ? friendlyError(err.message, language === "th" ? "th" : "en")
            : t("workspace.canvas.videoProcessFailed"),
          { id: toastId },
        );
      }
    },
    [uploadTransformedFile, t, language],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | {
            nodeId?: string;
            action?: "crop" | "export-audio" | "remove-audio";
          }
        | undefined;
      if (!detail?.nodeId || !detail.action) return;
      void onQuickNodeAction(detail.action, detail.nodeId);
    };
    window.addEventListener("workspace-node-quick-action", handler);
    return () =>
      window.removeEventListener("workspace-node-quick-action", handler);
  }, [onQuickNodeAction]);

  const onCtxDownloadZip = useCallback(async (nodes: Node[]) => {
    // Aggregate harvest count up front so we can show an accurate
    // "Bundling N assets..." message — `nodes.length` would lie when
    // the selection includes zero-output nodes (they contribute zero
    // files to the ZIP).
    const refs = nodes.flatMap((n) => harvestAssetsFromNode(n));
    if (refs.length === 0) {
      toast.error(t("workspace.toast.nothing_dl_selection"));
      return;
    }
    const id = toast.loading(t("workspace.toast.bundling", { count: refs.length }));
    try {
      const res = await bundleNodesAsZip(nodes);
      if (res.succeeded === 0) {
        toast.error(
          res.firstError ? t("workspace.toast.bundle_failed_reason", { reason: res.firstError }) : t("workspace.toast.bundle_failed"),
          { id },
        );
        return;
      }
      const partial =
        res.failed > 0
          ? t("workspace.toast.partial_suffix", { failed: res.failed, reason: res.firstError ?? "unknown" })
          : "";
      toast.success(t("workspace.toast.downloaded", { name: res.bundleName, partial }), { id });
    } catch (err) {
      toast.error(
        t("workspace.toast.bundle_failed_reason", { reason: err instanceof Error ? err.message : String(err) }),
        { id },
      );
    }
  }, [t]);

  const onCtxDuplicate = useCallback(
    (nodes: Node[]) => {
      if (nodes.length === 0) return;
      pushHistory();
      const idMap = new Map<string, string>();
      const cloned: Node[] = nodes.map((n) => {
        const newId = `n_${crypto.randomUUID()}`;
        idMap.set(n.id, newId);
        const fresh = cloneNodeFresh(n, newId);
        return {
          ...fresh,
          position: { x: n.position.x + 30, y: n.position.y + 30 },
          selected: true,
        };
      });
      // Keep edges that are fully internal to the duplicated subgraph.
      const internalEdges = getEdges()
        .filter((e) => idMap.has(e.source) && idMap.has(e.target))
        .map((e) => ({
          ...e,
          id: `e_${crypto.randomUUID()}`,
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!,
          selected: false,
        }));
      setNodes((nds) => [
        ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
        ...cloned,
      ]);
      setEdges((eds) => [...eds, ...internalEdges]);
    },
    [getEdges, setNodes, setEdges, pushHistory],
  );

  const onCtxDelete = useCallback(
    (nodes: Node[]) => {
      if (nodes.length === 0) return;
      pushHistory();
      const ids = new Set(nodes.map((n) => n.id));
      setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
      setEdges((eds) =>
        eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
      );
    },
    [setNodes, setEdges, pushHistory],
  );

  const onCtxGroup = useCallback((nodes: Node[]) => {
    const ids = new Set(nodes.map((n) => n.id));
    useWorkspaceStore.setState((s) => {
      if (!s.current) return s;
      return {
        ...s,
        current: {
          ...s.current,
          nodes: s.current.nodes.map((n) => ({
            ...n,
            selected: ids.has(n.id),
          })),
        },
      };
    });
    useWorkspaceStore.getState().groupSelectedNodes();
  }, []);

  /** Build the action list for the current right-click target — used
   *  by the menu render below. Memo'd against the menu state so we
   *  don't recompute every parent render. */
  const nodeContextMenuItems = useMemo<MediaContextMenuItem[]>(() => {
    if (!nodeContextMenu) return [];
    const targets = nodeContextMenu.targetNodes;
    if (targets.length === 0) return [];

    if (targets.length === 1) {
      const node = targets[0];
      const downloadable = getNodeDownloadable(node);
      /* Preview row used to be `disabled: !getNodePreview(...)` —
       *  but that snapshot was captured at MENU-OPEN time. If the
       *  user right-clicked an empty tool node, the item would be
       *  permanently greyed out for the lifetime of the menu, and
       *  even if a generation landed before they got around to
       *  clicking, the row stayed dead. The handler itself
       *  (`onCtxPreview`) already re-checks the latest store state
       *  and toasts "No preview available" when there's nothing to
       *  show, so leaving the row enabled lets it work whenever a
       *  preview becomes available without needing a re-open.
       *  Matches the double-click path, which is how the user
       *  expected this to behave.
       *
       *  Also dropped the "Move to Board" and "Copy to Board"
       *  rows. Both were placeholders shipped `disabled: true`
       *  with no implementation behind them — visible-but-greyed
       *  cluttered the menu and signalled features that aren't
       *  there. They can come back when the Boards UI ships. */
      const items: MediaContextMenuItem[] = [];
      if (node.type !== "textNode") {
        items.push({
          key: "preview",
          label: "Preview",
          icon: CtxEyeIcon,
          onSelect: () => onCtxPreview(node),
        });
      }
      items.push(
        {
          key: "download",
          label: t("workspace.nodemenu.download"),
          icon: CtxDownloadIcon,
          disabled: !downloadable,
          onSelect: () => onCtxDownloadSingle(node),
        },
        {
          key: "duplicate",
          label: t("workspace.nodemenu.duplicate"),
          icon: CtxCopyIcon,
          onSelect: () => onCtxDuplicate([node]),
        },
        {
          key: "delete",
          label: t("workspace.nodemenu.delete"),
          icon: CtxTrash2Icon,
          separatorBefore: true,
          danger: true,
          onSelect: () => onCtxDelete([node]),
        },
      );
      return items;
    }

    // Multi-selection — `Download all (N) as ZIP` headline action.
    const downloadable = targets.reduce(
      (acc, n) => acc + harvestAssetsFromNode(n).length,
      0,
    );
    const groupable = targets.filter(
      (n) => n.type !== "groupNode" && !n.parentId,
    ).length;
    return [
      {
        key: "group",
        label: "Group",
        icon: CtxGroupIcon,
        shortcut: "G",
        disabled: groupable < 2,
        onSelect: () => onCtxGroup(targets),
      },
      {
        key: "download-zip",
        label: t("workspace.nodemenu.download_zip", { count: targets.length }),
        icon: CtxFileArchiveIcon,
        disabled: downloadable === 0,
        onSelect: () => void onCtxDownloadZip(targets),
      },
      {
        key: "duplicate-all",
        label: t("workspace.nodemenu.duplicate_all", { count: targets.length }),
        icon: CtxCopyIcon,
        separatorBefore: true,
        onSelect: () => onCtxDuplicate(targets),
      },
      {
        key: "delete-all",
        label: t("workspace.nodemenu.delete_all", { count: targets.length }),
        icon: CtxTrash2Icon,
        danger: true,
        onSelect: () => onCtxDelete(targets),
      },
    ];
  }, [
    nodeContextMenu,
    onCtxDownloadSingle,
    onCtxPreview,
    onCtxDownloadZip,
    onCtxDuplicate,
    onCtxDelete,
    onCtxGroup,
    t,
  ]);

  /** Picking a tool from the right-click menu spawns it at the
   *  original click position (flow coords) and closes the menu.
   *  Schema-driven nodes go through `addSchemaNode`; the special
   *  built-ins (Text / Sticky / Element) route through their own
   *  paths so they pick up the right defaults. */
  const onContextMenuPick = useCallback(
    (item: ToolItem) => {
      if (!contextMenu) return;
      const pos = contextMenu.flow;
      let newId: string | null = null;
      if (item.nodeType === "stickyNoteNode") {
        // Sticky uses addSchemaNode-style path but with no schema —
        // just stamp a node directly via the store.
        const id = `s_${crypto.randomUUID()}`;
        useWorkspaceStore.setState((s) => {
          const stickyNode: Node = {
            id,
            type: "stickyNoteNode",
            position: pos,
            data: { text: "" },
          };
          const nextNodes = [...(s.current?.nodes ?? []), stickyNode];
          return s.current
            ? {
                current: { ...s.current, nodes: nextNodes },
                graphs: { ...s.graphs, [s.current.id]: { ...s.current, nodes: nextNodes } },
              }
            : {};
        });
        newId = id;
      } else {
        newId = addSchemaNode(item.nodeType, item.defaultLabel, pos);
      }
      if (newId) reparentSpawned(newId, pos);
      setContextMenu(null);
    },
    [contextMenu, addSchemaNode, reparentSpawned],
  );

  /** Non-spawn actions from the right-click menu — Upload / Assets /
   *  Stock. Bridges to pre-existing event channels handled by
   *  WorkspaceCanvasMediaBridges (mounted on the Canvas page) so we
   *  don't duplicate dialog/file-picker logic. */
  const onContextMenuAction = useCallback(
    (item: ToolItem) => {
      if (item.action === "assets") {
        window.dispatchEvent(new CustomEvent("workspace-open-all-assets"));
      } else if (item.action === "upload") {
        window.dispatchEvent(new CustomEvent("workspace-trigger-upload"));
      } else if (item.action === "stock") {
        // Inline picker — never navigates the user away from the canvas.
        window.dispatchEvent(new CustomEvent("workspace-open-stock"));
      }
      setContextMenu(null);
    },
    [],
  );

  /** "+" button in the floating sidebar — opens the same picker, but
   *  anchored next to the trigger button instead of at the screen
   *  centre. The sidebar passes us the button's `getBoundingClientRect`
   *  so the menu reads as a popover off the "+" rather than appearing
   *  detached in the middle of the canvas. We still resolve the *flow*
   *  position from the centre of the viewport — that's where the
   *  spawned node should land, NOT next to the toolbar pill (which
   *  is way off in the corner). */
  const openContextMenuAtAnchor = useCallback(
    (anchor: { x: number; y: number }) => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      setContextMenu({
        screen: anchor, // popover anchor — visible on screen
        flow: screenToFlowPosition({ x: cx, y: cy }), // spawn point
      });
    },
    [screenToFlowPosition],
  );

  /* ── Keyboard shortcuts ───────────────────────────────────
   * Single global listener handles copy/cut/paste/duplicate,
   * select-all, undo/redo, viewport zoom, generation flip, and
   * Run dispatch. The `N` key opens the picker at the current
   * viewport centre. The `A` key triggers a fullscreen preview of
   * the currently-selected node. See useWorkspaceShortcuts.ts for
   * the full key map. */
  useWorkspaceShortcuts({
    onAddNode: () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const screenCentre = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      const flow = screenToFlowPosition(screenCentre);
      setPicker({
        screen: screenCentre,
        flow,
        // No source — picker behaves the same as drag-to-empty (no
        // edge gets created on pick). CanvasNodePicker treats null
        // fromNode as "show every catalog entry unfiltered".
        fromNode: null,
        fromHandleId: null,
        fromIsOutput: false,
      });
    },
    onPreviewSelected: () => {
      const all = useWorkspaceStore.getState().current?.nodes ?? [];
      const sel = all.find((n) => n.selected);
      if (!sel) return;
      const p = getNodePreview(sel, all);
      if (p) setPreview(p);
    },
  });

  /** Double-click on a node opens the same fullscreen preview —
   *  EXCEPT when the user double-clicked on an editable element
   *  inside the node (title input, prompt textarea, contenteditable
   *  mention area, etc.). Double-clicking inside a text field is
   *  the OS-level "select word" gesture; opening a lightbox there
   *  hijacks a basic text-editing reflex.
   *
   *  Reported by user as: double-clicking the node-name input opens
   *  the preview lightbox instead of letting them rename. */
  const onNodeDoubleClick = useCallback(
    (e: React.MouseEvent, node: Node) => {
      if (node.type === "textNode") {
        e.stopPropagation();
        return;
      }
      if (isNodeControlEvent(e)) {
        e.stopPropagation();
        return;
      }
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        target?.isContentEditable === true ||
        target?.closest?.(
          'input, textarea, [contenteditable="true"], select, button',
        ) != null;
      if (isEditable) return;
      e.stopPropagation();
      const all = useWorkspaceStore.getState().current?.nodes ?? [];
      const p = getNodePreview(node, all);
      if (p) setPreview(p);
    },
    [],
  );

  /* Asset panel → lightbox bridge.
   *
   * The asset panel lives in the right sidebar and doesn't share a
   * React tree with the lightbox state, so we use a window event as
   * the open command. Payload shape mirrors PreviewPayload so the
   * panel doesn't need to know about node shapes — it just hands
   * over a `{ url, fieldType }` for the asset it owns. */
  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as
        | {
            url?: string;
            fieldType?: "image" | "video" | "audio" | "model3d";
            label?: string;
            fileName?: string;
            poster?: string;
          }
        | undefined;
      if (!detail?.url) return;
      const ft = detail.fieldType ?? "image";
      if (ft === "model3d") {
        setPreview({
          type: "model3d",
          model_url: detail.url,
          poster: detail.poster,
          label: detail.label ?? "3d model",
          caption: (detail.fileName ?? "") + " · drag to rotate",
        });
        return;
      }
      setPreview({
        type:
          ft === "video" ? "video" : ft === "audio" ? "audio" : "image",
        url: detail.url,
        label: detail.label ?? "asset",
        caption: detail.fileName,
      });
    };
    window.addEventListener("workspace-open-asset-preview", handler);
    return () =>
      window.removeEventListener("workspace-open-asset-preview", handler);
  }, []);

  /* All-assets dialog → canvas spawn bridge.
   *
   * The dialog hands us an array of asset descriptors and the canvas
   * spawns one AssetNode per item, fanned out from the current
   * viewport centre so they don't all stack on top of each other.
   * Same payload shape the dialog uses for single-asset drag-reuse
   * — keeps the dialog dumb (no canvas math) and the spawn rules
   *   centralised here. */
  useEffect(() => {
    const onSpawn = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as
        | {
            assets?: Array<{
              fieldType: "image" | "video" | "audio" | "model3d";
              url: string;
              label?: string;
              fileName?: string;
              posterUrl?: string;
            }>;
          }
        | undefined;
      const list = detail?.assets ?? [];
      if (list.length === 0 || !wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const centre = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      // Tile in a grid so multiple assets don't stack — 5 per row,
      // 240px gap matches a comfortable AssetNode spacing.
      const PER_ROW = 5;
      const STEP_X = 240;
      const STEP_Y = 280;
      list.forEach((a, i) => {
        const col = i % PER_ROW;
        const row = Math.floor(i / PER_ROW);
        const pos = {
          x: centre.x + (col - (PER_ROW - 1) / 2) * STEP_X,
          y: centre.y + row * STEP_Y,
        };
        const newId = addAssetNode(
          {
            label: a.label ?? a.fileName ?? "asset",
            fieldType: a.fieldType,
            previewUrl: a.url,
            posterUrl: a.posterUrl,
            fileName: a.fileName,
            uploading: false,
          },
          pos,
        );
        reparentSpawned(newId, pos);
      });
    };
    window.addEventListener("workspace-spawn-assets", onSpawn);
    return () => window.removeEventListener("workspace-spawn-assets", onSpawn);
  }, [addAssetNode, screenToFlowPosition, reparentSpawned]);

  /* Voice picker bridge was removed alongside the preset catalog
   * cleanup. The canvas no longer hosts a voice dialog; audio gen
   * nodes use whatever default voice the backend executor picks for
   * their model. Users who need a specific voice swap models from
   * the standalone /app voice gen tool. */

  /* All-assets dialog → upload bridge.
   *
   * The dialog can hand us OS files (file picker or drag-drop into
   * the modal). We route them through the existing uploadAsset path
   * so re-parenting + storage upload + signed-URL refresh stay in
   * one place. Files tile out from viewport centre, same fan-out as
   * the spawn-assets handler so the placement pattern stays familiar. */
  useEffect(() => {
    const onUpload = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as
        | { files?: File[] }
        | undefined;
      const files = detail?.files ?? [];
      if (files.length === 0 || !wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const centre = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      const PER_ROW = 5;
      const STEP_X = 240;
      const STEP_Y = 280;
      files.forEach((file, i) => {
        const col = i % PER_ROW;
        const row = Math.floor(i / PER_ROW);
        const pos = {
          x: centre.x + (col - (PER_ROW - 1) / 2) * STEP_X,
          y: centre.y + row * STEP_Y,
        };
        void uploadAsset(file, pos);
      });
    };
    window.addEventListener("workspace-upload-files", onUpload);
    return () => window.removeEventListener("workspace-upload-files", onUpload);
  }, [uploadAsset, screenToFlowPosition]);

  /* Clipboard image paste -> AssetNode.
   *
   * Copied screenshots and copied image files arrive as File blobs on
   * ClipboardEvent.clipboardData. Route them through the same upload
   * path as drag/drop so storage upload, signed URLs, grouping, and
   * AssetNode state all stay consistent. Text paste still falls through
   * because we only preventDefault after finding media files. */
  useEffect(() => {
    const pasteFilesAtViewportCentre = (files: File[]) => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const centre = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      const PER_ROW = 5;
      const STEP_X = 240;
      const STEP_Y = 280;
      files.forEach((file, i) => {
        const col = i % PER_ROW;
        const row = Math.floor(i / PER_ROW);
        const pos = {
          x: centre.x + (col - (PER_ROW - 1) / 2) * STEP_X,
          y: centre.y + row * STEP_Y,
        };
        void uploadAsset(file, pos);
      });
      toast.success(
        files.length === 1
          ? "Pasted media added to canvas"
          : `${files.length} pasted media files added to canvas`,
      );
    };

    const onPaste = (event: ClipboardEvent) => {
      if (isViewer) return;
      const files = clipboardFiles(event).filter((file) =>
        isClipboardMediaFile(file),
      );
      if (files.length > 0) {
        event.preventDefault();
        pasteFilesAtViewportCentre(files);
        return;
      }

      const htmlSources = clipboardHtmlImageSources(event);
      if (htmlSources.length > 0) {
        event.preventDefault();
        void (async () => {
          const asyncFiles = (await asyncClipboardFiles()).filter((file) =>
            isClipboardMediaFile(file),
          );
          if (asyncFiles.length > 0) {
            pasteFilesAtViewportCentre(asyncFiles);
            return;
          }
          const htmlFiles = (await clipboardHtmlFiles(event)).filter((file) =>
            isClipboardMediaFile(file),
          );
          if (htmlFiles.length > 0) pasteFilesAtViewportCentre(htmlFiles);
        })();
        return;
      }

      // Snipping Tool and some browser/image apps put bitmap data on the
      // Async Clipboard API instead of ClipboardEvent.files. Try that path too
      // so copied screenshots paste just like copied files.
      void asyncClipboardFiles().then((asyncFiles) => {
        const mediaFiles = asyncFiles.filter((file) =>
          isClipboardMediaFile(file),
        );
        if (mediaFiles.length === 0) return;
        pasteFilesAtViewportCentre(mediaFiles);
      });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [isViewer, screenToFlowPosition, uploadAsset]);

  /**
   * Live grouping — figures out whether the node the user just
   * finished dragging should be parented to a group, taken out of
   * one, or moved between groups.
   *
   * Rule: if the dragged node's centre is inside a `groupNode`'s
   * bbox, it becomes a child of that group; otherwise it's free.
   * Position is converted between absolute / relative-to-parent
   * accordingly so the visual location stays exactly where the
   * user dropped it.
   *
   * GroupNodes themselves don't get re-parented (no nested groups
   * for now), and we don't try to auto-resize the group frame to
   * fit the new child — keeps the math simple, user can re-Group
   * if they want a tight fit.
   */
  /**
   * Alt+drag → duplicate the dragged selection (Figma-style).
   *
   * On drag-start, if Alt is held, clone every node currently being
   * dragged (RF passes the full drag set as the third arg — covers
   * single-node drag and multi-select drag uniformly). Connected
   * edges are cloned too: any edge whose source OR target is in the
   * drag set gets a copy with the corresponding endpoint rewritten
   * to the clone's id, so external connections survive AND
   * inter-selection wires (between two cloned nodes) come along.
   *
   * The original keeps the drag focus — RF was already tracking it
   * before we ran — so visually the cloned copy stays anchored at
   * the original's start position while the user drags the original
   * to the new location. End state: original at new position, copy
   * at old position, both fully wired.
   *
   * Note: we do NOT cancel the drag or swap the dragged node. RF
   * doesn't expose a clean way to do that mid-drag and the result
   * would feel jumpy. Original-moves / copy-stays is functionally
   * equivalent for the user's purpose ("I want a duplicate with the
   * same connections at a different location").
   */
  const onNodeDragStart = useCallback(
    (event: React.MouseEvent, _node: Node, draggedNodes: Node[]) => {
      publishSelection(_node.id);
      if (!event.altKey) return;
      if (!draggedNodes || draggedNodes.length === 0) return;

      const idMap = new Map<string, string>();
      const cloned: Node[] = draggedNodes.map((n) => {
        const newId = `n_${crypto.randomUUID()}`;
        idMap.set(n.id, newId);
        // `cloneNodeFresh` deep-copies data (params, generations,
        // previewUrl, referenceType, …) so the duplicate keeps the
        // original's image preview and model/param settings, then
        // resets only the live `status` flag to "idle" so a copy of
        // an in-flight node doesn't pretend to also be processing.
        // Display label is bumped ("Foo" → "Foo copy", "Foo copy"
        // → "Foo copy 2") so the two are distinguishable in the
        // title bar without renaming.
        return cloneNodeFresh(n, newId);
      });

      const allEdges = getEdges();
      const clonedEdges: Edge[] = [];
      for (const e of allEdges) {
        const newSource = idMap.get(e.source);
        const newTarget = idMap.get(e.target);
        if (!newSource && !newTarget) continue;
        clonedEdges.push({
          ...e,
          id: `e_${crypto.randomUUID()}`,
          source: newSource ?? e.source,
          target: newTarget ?? e.target,
          selected: false,
        });
      }

      // Snapshot for Ctrl+Z BEFORE the clone lands so undo removes
      // both the cloned node and its cloned edges in one step.
      pushHistory();
      setNodes((nds) => [...nds, ...cloned]);
      setEdges((eds) => [...eds, ...clonedEdges]);
    },
    [getEdges, publishSelection, setNodes, setEdges, pushHistory],
  );

  const onNodeDragStop = useCallback(
    (_e: React.MouseEvent | React.TouchEvent, dragged: Node) => {
      // Don't reparent groups themselves.
      if (dragged.type === "groupNode") return;
      // Hard guard — React Flow occasionally emits a drag-stop with an
      // un-positioned node (e.g. mid-flight cancel). Any access to
      // `.x` / `.y` on undefined would throw and the
      // WorkspaceErrorBoundary would catch it as a full-screen crash
      // card. Bail silently instead — the next drag will recover.
      if (!dragged.position || typeof dragged.position.x !== "number") return;

      const allNodes = useWorkspaceStore.getState().current?.nodes ?? [];

      // Compute dragged node's ABSOLUTE position. parentId-aware,
      // 1 level deep (we don't allow nested groups).
      const draggedParent = dragged.parentId
        ? allNodes.find((n) => n.id === dragged.parentId)
        : null;
      const dpx = draggedParent?.position?.x ?? 0;
      const dpy = draggedParent?.position?.y ?? 0;
      const absX = dpx + dragged.position.x;
      const absY = dpy + dragged.position.y;
      const w =
        (dragged as Node & { measured?: { width?: number } }).measured?.width ??
        dragged.width ??
        260;
      const h =
        (dragged as Node & { measured?: { height?: number } }).measured?.height ??
        dragged.height ??
        200;
      const cx = absX + w / 2;
      const cy = absY + h / 2;

      // Find which group (if any) contains the centre point.
      const targetGroup = allNodes.find((n) => {
        if (n.type !== "groupNode") return false;
        if (n.id === dragged.id) return false;
        if (!n.position) return false;
        const gx = n.position.x;
        const gy = n.position.y;
        if (typeof gx !== "number" || typeof gy !== "number") return false;
        const gw =
          (n.style?.width as number | undefined) ??
          (n as Node & { measured?: { width?: number } }).measured?.width ??
          400;
        const gh =
          (n.style?.height as number | undefined) ??
          (n as Node & { measured?: { height?: number } }).measured?.height ??
          300;
        return cx >= gx && cx <= gx + gw && cy >= gy && cy <= gy + gh;
      });

      const currentParent = dragged.parentId ?? null;
      const newParent = targetGroup?.id ?? null;
      if (currentParent === newParent) return;

      // Re-parent — convert position to be relative to the new
      // parent (or absolute when leaving every group).
      const reactFlow = useWorkspaceStore.getState();
      void reactFlow;
      const updateAll = (nds: Node[]) =>
        nds.map((n) => {
          if (n.id !== dragged.id) return n;
          let newPos = { x: absX, y: absY };
          if (newParent) {
            const parent = allNodes.find((p) => p.id === newParent);
            if (parent) {
              newPos = { x: absX - parent.position.x, y: absY - parent.position.y };
            }
          }
          // Strip parentId / extent if leaving a group.
          const { parentId: _p, extent: _e, ...rest } = n as typeof n & {
            extent?: unknown;
          };
          if (newParent) {
            return {
              ...rest,
              parentId: newParent,
              position: newPos,
            } as Node;
          }
          return { ...rest, position: newPos } as Node;
        });

      // Keep group BEFORE its children in the array — z-order rule.
      // After updating positions/parentage, re-sort so all groupNodes
      // come first, then everything else (preserving relative order
      // within each bucket).
      setNodes((nds) => {
        const updated = updateAll(nds);
        const groups = updated.filter((n) => n.type === "groupNode");
        const others = updated.filter((n) => n.type !== "groupNode");
        return [...groups, ...others];
      });
    },
    [setNodes],
  );

  const onConnectStart = useCallback(
    (_e: React.MouseEvent | React.TouchEvent, params: OnConnectStartParams) => {
      connectStartRef.current = {
        nodeId: params.nodeId,
        handleId: params.handleId,
        handleType: params.handleType,
      };
    },
    [],
  );

  const onConnectEnd = useCallback(
    (
      event: MouseEvent | TouchEvent,
      connectionState?: { isValid: boolean | null; toHandle?: { nodeId?: string; id?: string | null } | null },
    ) => {
      const start = connectStartRef.current;
      connectStartRef.current = null;
      if (!start?.nodeId || !start.handleType) return;

      const targetEl = event.target as HTMLElement | null;
      const droppedOnHandle =
        targetEl?.classList.contains("react-flow__handle") ||
        connectionState?.toHandle?.nodeId != null;
      const droppedOnNode = targetEl?.closest(".react-flow__node");

      // Drop landed on a handle but React Flow rejected it → tell the user why.
      if (droppedOnHandle && connectionState && connectionState.isValid === false) {
        const tgtNodeId = connectionState.toHandle?.nodeId;
        const tgtHandle = connectionState.toHandle?.id ?? "";
        const state = useWorkspaceStore.getState();
        const allNodes = state.current?.nodes ?? [];
        const allEdges = state.current?.edges ?? [];
        const tgt = allNodes.find((n) => n.id === tgtNodeId);
        const src = allNodes.find((n) => n.id === start.nodeId);

        // Compose the most-specific reason we can. The order matters
        // — port-full beats type-mismatch which beats group-overflow.
        let reason = "Connection rejected — incompatible port types.";
        if (tgt) {
          const schema = getWorkspaceSchema(tgt.type ?? "");
          if (schema) {
            const selectedModel = nodeModelName(tgt, schema.defaultModel);
            const handle = schema.inputs.find(
              (i) =>
                i.id === tgtHandle &&
                (!i.supportedModels || i.supportedModels.includes(selectedModel)),
            );
            const max = handle?.maxConnections ?? 1;
            const portLabel = handle?.label ?? tgtHandle;
            const existing = allEdges.filter(
              (e) => e.target === tgtNodeId && e.targetHandle === tgtHandle,
            ).length;

            const seedanceConflict = hasSeedanceV2ModeConflict({
              targetNode: tgt,
              selectedModel,
              targetHandle: tgtHandle,
              edges: allEdges,
            });

            if (seedanceConflict) {
              reason =
                "Seedance 2.0 uses either start/end frames or reference media, not both. Remove the other Seedance input first.";
            } else if (existing >= max) {
              reason = `Port "${portLabel}" is full — accepts max ${max} connection(s) for ${selectedModel}.`;
            } else if (src?.type === "groupNode") {
              // Group → count children of the dragged port's type and
              // report the exact mismatch so the user can either pick
              // a wider port or trim the group.
              const sh = (start.handleId ?? "image") as
                | "image"
                | "video"
                | "audio";
              const childCount = countGroupChildrenOfType(src.id, sh, allNodes);
              if (childCount > max) {
                reason =
                  max === 1
                    ? `Port "${portLabel}" only accepts a single ${sh} ref, ` +
                      `but the group has ${childCount} ${sh} item(s). ` +
                      `Wire one asset directly, or pick a port that accepts multiple refs.`
                    : `Group has ${childCount} ${sh} item(s) but "${portLabel}" ` +
                      `accepts max ${max} for ${selectedModel}. Trim the group or change model.`;
              } else if (handle && tgtHandle) {
                // Type mismatch despite count fitting — e.g. dragging a
                // group's video port into an audio target.
                const portTypeFromHandle = (id: string): string => {
                  if (TEXT_TARGETS.has(id)) return "text";
                  if (IMAGE_TARGETS.has(id)) return "image";
                  if (VIDEO_TARGETS.has(id)) return "video";
                  if (AUDIO_TARGETS.has(id)) return "audio";
                  if (ELEMENT_TARGETS.has(id)) return "element";
                  return "?";
                };
                const tgtKind = portTypeFromHandle(tgtHandle);
                const srcKind = sh;
                if (tgtKind !== srcKind) {
                  reason = `Type mismatch — group's ${srcKind} output can't connect to ${tgtKind} port "${portLabel}".`;
                }
              }
            } else {
              // Generic source → describe the type mismatch in plain
              // language. Pull source type from src's data / schema.
              let srcKind: string = "media";
              if (src?.type === "textNode") {
                srcKind = isTextNodeImageOutputHandle(start.handleId)
                  ? "image"
                  : isTextNodeVideoOutputHandle(start.handleId)
                    ? "video"
                    : "text";
              }
              else if (src?.type === "elementNode") srcKind = "element";
              else if (src?.type === "assetNode") {
                srcKind = isVideoFrameImageOutputHandle(start.handleId)
                  ? "image"
                  : assetFieldType(src) ?? "media";
              } else if (src?.type) {
                const sh = start.handleId ?? "";
                if (sh === "output_video" || sh === "video") srcKind = "video";
                else if (sh === "audio") srcKind = "audio";
                else if (sh === "text") srcKind = "text";
                else srcKind = "image";
              }
              const portKindOf = (id: string): string => {
                if (TEXT_TARGETS.has(id)) return "text";
                if (IMAGE_TARGETS.has(id)) return "image";
                if (VIDEO_TARGETS.has(id)) return "video";
                if (AUDIO_TARGETS.has(id)) return "audio";
                if (ELEMENT_TARGETS.has(id)) return "element";
                return "?";
              };
              const tgtKind = portKindOf(tgtHandle);
              if (tgtKind !== "?" && srcKind !== tgtKind) {
                reason = `Type mismatch — ${srcKind} output can't connect to ${tgtKind} port "${portLabel}".`;
              }
            }
          }
        }
        toast.warning(reason);
        return;
      }

      // Dropped on a node body (not a specific handle) or a real handle
      // that succeeded → React Flow's own onConnect handles it. No picker.
      if (droppedOnHandle || droppedOnNode) return;

      // Empty canvas → spawn picker.
      const clientX = "clientX" in event ? event.clientX : event.changedTouches[0]?.clientX ?? 0;
      const clientY = "clientY" in event ? event.clientY : event.changedTouches[0]?.clientY ?? 0;

      const state = useWorkspaceStore.getState();
      const fromNode = (state.current?.nodes ?? []).find((n) => n.id === start.nodeId);
      if (!fromNode) return;

      setPicker({
        screen: { x: clientX, y: clientY },
        flow: screenToFlowPosition({ x: clientX, y: clientY }),
        fromNode,
        fromHandleId: start.handleId ?? "",
        fromIsOutput: start.handleType === "source",
      });
    },
    [screenToFlowPosition],
  );

  const onPickerPick = useCallback(
    (option: PickerOption) => {
      if (!picker) return;
      // Inherit compatible params from the source node so the user
      // doesn't have to re-pick model + ratio + resolution + quality
      // every time they extend a workflow downstream. When the picker
      // was opened without a source (keyboard / +-button), the helper
      // falls through to bare schema defaults — unchanged behaviour.
      const targetSchema = getWorkspaceSchema(option.nodeType);
      const inheritedParams = inheritParamsFromSource(
        picker.fromNode,
        targetSchema,
        option.nodeType,
      );
      const newId = addSchemaNode(option.nodeType, option.defaultLabel, picker.flow, {
        params: inheritedParams,
      });
      // No source (keyboard `N` shortcut) → just spawn the node, no
      // edge to create. Drag-from-port path → wire the new node back
      // to the source on the matching handle.
      if (picker.fromNode && picker.fromHandleId) {
        const conn: Connection = picker.fromIsOutput
          ? {
              source: picker.fromNode.id,
              sourceHandle: picker.fromHandleId || null,
              target: newId,
              targetHandle: option.newNodeHandle,
            }
          : {
              source: newId,
              sourceHandle: option.newNodeHandle,
              target: picker.fromNode.id,
              targetHandle: picker.fromHandleId || null,
            };
        onConnectWithTextVideoPassthrough(conn);
      }
      setPicker(null);
    },
    [picker, addSchemaNode, onConnectWithTextVideoPassthrough],
  );

  /**
   * Reject wires whose data types don't line up — e.g. a TextNode's
   * output can only plug into handles in TEXT_TARGETS, not ref_image.
   * React Flow calls this while the user is dragging; returning false
   * keeps the connection line red and prevents the edge from being
   * added on release.
   */
  const isValidConnection = useCallback((conn: Connection | Edge) => {
    const state = useWorkspaceStore.getState();
    const nodeList = state.current?.nodes ?? [];
    const edgeList = state.current?.edges ?? [];
    const src = nodeList.find((n) => n.id === conn.source);
    if (!src) return true;

    const th = conn.targetHandle ?? "";
    const srcType = src.type ?? "";

    /* ── 1. Type compatibility ─────────────────────────────────
     * IMPORTANT: default to `false` (fail-closed). The previous code
     * defaulted to `true` so any source-handle id we forgot to enumerate
     * would silently allow any wire — meaning a typo in a node's
     * sourceHandle would bypass type checking entirely. With this fix,
     * unknown handle ids are rejected and surface a toast so we can fix
     * the schema instead of silently accepting garbage edges. */
    let typeOk = false;
    if (srcType === "textNode") {
      const sh = conn.sourceHandle ?? "default";
      typeOk = isTextNodeImageOutputHandle(sh)
        ? IMAGE_TARGETS.has(th)
        : isTextNodeVideoOutputHandle(sh)
          ? VIDEO_TARGETS.has(th)
          : TEXT_TARGETS.has(th);
    }
    else if (srcType === "elementNode") typeOk = ELEMENT_TARGETS.has(th);
    else if (srcType === "assetNode") {
      const ft = assetFieldType(src);
      if (isVideoFrameImageOutputHandle(conn.sourceHandle)) typeOk = IMAGE_TARGETS.has(th);
      else if (ft === "image") typeOk = IMAGE_TARGETS.has(th);
      else if (ft === "video") typeOk = VIDEO_TARGETS.has(th);
      else if (ft === "audio") typeOk = AUDIO_TARGETS.has(th);
      else if (ft === "model3d") typeOk = MODEL3D_TARGETS.has(th);
    } else if (srcType === "groupNode") {
      // Group has multiple typed output ports — `image` / `video` /
      // `audio`. The edge's `sourceHandle` tells us which one was
      // dragged, and the target handle has to accept that media type.
      const sh = conn.sourceHandle ?? "image";
      if (sh === "video") typeOk = VIDEO_TARGETS.has(th);
      else if (sh === "audio") typeOk = AUDIO_TARGETS.has(th);
      else typeOk = IMAGE_TARGETS.has(th); // default + "image" port
    } else {
      // Tool nodes — derive type from sourceHandle id. Centralised in
      // workspaceSchema's `portTypeFromHandleId` so adding a new port
      // type only requires updating that table.
      const sh = conn.sourceHandle ?? "";
      const srcKind = portTypeFromHandleId(sh);
      if (srcKind === "image") typeOk = IMAGE_TARGETS.has(th);
      else if (srcKind === "video") typeOk = VIDEO_TARGETS.has(th);
      else if (srcKind === "text") typeOk = TEXT_TARGETS.has(th);
      else if (srcKind === "audio") typeOk = AUDIO_TARGETS.has(th);
      else if (srcKind === "element") typeOk = ELEMENT_TARGETS.has(th);
      else if (srcKind === "model3d") typeOk = MODEL3D_TARGETS.has(th);
    }
    if (!typeOk) return false;

    /* ── 2. Per-handle maxConnections (from schema) ────────── */
    if (conn.target && conn.targetHandle) {
      const tgt = nodeList.find((n) => n.id === conn.target);
      const schema = tgt ? getWorkspaceSchema(tgt.type ?? "") : undefined;
      if (schema && tgt) {
        const selectedModel = nodeModelName(tgt, schema.defaultModel);
        if (
          hasSeedanceV2ModeConflict({
            targetNode: tgt,
            selectedModel,
            targetHandle: conn.targetHandle,
            edges: edgeList,
          })
        ) {
          return false;
        }
        // Find the visible variant of this handle for the active model
        // (handles can be split per provider, e.g. ref_image with
        // different maxConnections for Banana 14 vs OpenAI 16).
        const handle = schema.inputs.find(
          (i) =>
            i.id === conn.targetHandle &&
            (!i.supportedModels || i.supportedModels.includes(selectedModel)),
        );
        const max = handle?.maxConnections ?? 1;
        const existing = edgeList.filter(
          (e) => e.target === conn.target && e.targetHandle === conn.targetHandle,
        ).length;
        if (existing >= max) return false;

        /* ── 3. Group source: child count must fit the port ──
         * A group emits N child URLs. If the target port caps refs
         * at M (e.g. start_frame = 1, ref_image = 14), a group with
         * N > M can't legally land — onConnectEnd surfaces a toast
         * explaining exactly why. */
        if (srcType === "groupNode") {
          const sh = (conn.sourceHandle ?? "image") as
            | "image"
            | "video"
            | "audio";
          const childCount = countGroupChildrenOfType(src.id, sh, nodeList);
          if (childCount > max) return false;
        }
      }
    }

    return true;
  }, []);

  const memoNodeTypes = useMemo(() => nodeTypes, []);

  return (
    <div
      ref={wrapperRef}
      className="workspace-root relative h-full w-full bg-[#1b1c1c]"
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPointerMove={publishCanvasCursor}
      onPointerLeave={hideCanvasCursor}
      onContextMenu={(e) => {
        // Wrapper-level right-click handler — fires for clicks on
        // the pane AND on nodes. We open the categorised picker at
        // the cursor regardless of what was under it. Skip when the
        // user right-clicked an interactive child (input / textarea /
        // button) so contextual edits like "Inspect" or text-field
        // copy-paste still work — those targets have their own
        // implicit behaviour we don't want to hijack.
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName ?? "";
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "BUTTON" ||
          tag === "SELECT" ||
          target?.isContentEditable === true
        ) {
          return;
        }
        // Skip when the cursor is over a NODE — React Flow's
        // `onNodeContextMenu` (or `onSelectionContextMenu`) handles
        // those clicks and surfaces the per-node action menu
        // (Download / Duplicate / Delete). Without this guard, the
        // wrapper would race the React Flow event and pop the
        // tool palette ON TOP of the node menu.
        if (
          target?.closest?.(
            ".react-flow__node, .react-flow__nodesselection",
          ) != null
        ) {
          return;
        }
        // React Flow's own onPaneContextMenu also fires for pane
        // clicks — guard against opening the menu twice. We open
        // here for "anywhere on the canvas wrapper" coverage; the
        // pane handler is left wired up as a defensive secondary
        // path but we close it via onPaneContextMenu doing the same
        // setContextMenu call (idempotent).
        e.preventDefault();
        // Active multi-selection on empty canvas → node action menu
        // (matches `onPaneContextMenu`'s behaviour exactly so the
        // wrapper-level path doesn't undo what the pane handler
        // would have done).
        const allNodes =
          useWorkspaceStore.getState().current?.nodes ?? [];
        const sel = allNodes.filter((n) => n.selected);
        if (sel.length >= 2) {
          setNodeContextMenu({
            position: { x: e.clientX, y: e.clientY },
            targetNodes: sel,
          });
          return;
        }
        const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        setContextMenu({
          screen: { x: e.clientX, y: e.clientY },
          flow,
        });
      }}
    >
      <div className="workspace-grid-surface" />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={memoNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnectWithTextVideoPassthrough}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onMoveEnd={onMoveEnd}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onSelectionContextMenu={onSelectionContextMenu}
        onEdgeClick={onEdgeClick}
        isValidConnection={isValidConnection}
        // Viewer mode locks the graph: nodes can't be dragged, new
        // edges can't be drawn, the delete key is disabled. The
        // canvas still PANS / ZOOMS (via the parent panOnDrag flag
        // below) so the visitor can navigate around — they just
        // can't change anything. Edges/nodes remain selectable so
        // the click-to-open-lightbox affordance keeps working.
        nodesDraggable={!isViewer}
        nodesConnectable={!isViewer}
        edgesReconnectable={!isViewer}
        deleteKeyCode={isViewer ? null : DELETE_KEYS}
        fitView
        onlyRenderVisibleElements
        proOptions={PRO_OPTIONS}
        minZoom={0.25}
        maxZoom={2.5}
        // Edges are bezier-curved by default — matches the soft,
        // organic look of Figma / Krea wires. The colour palette
        // (resting / hover / selected / dragging) is owned by
        // workspace.css so it stays consistent with our theme; we
        // just declare the SHAPE here and let CSS style the strokes.
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        connectionLineType={ConnectionLineType.Bezier}
        // ── Marquee vs hand selection ──
        // Tool-mode reactive: in "select" we marquee on left-drag and
        // pan on middle/right; in "hand" we pan on left-drag too and
        // disable marquee (Figma's H key behaviour). The arrays must
        // be MODULE-LEVEL constants (not inline literals) — see the
        // STABLE_* / PAN_ON_DRAG_* comment at the top of this file
        // for the React #185 loop they cause if recreated per render.
        selectionOnDrag={tool === "select"}
        selectionMode={SelectionMode.Partial}
        panOnDrag={tool === "hand" ? PAN_ON_DRAG_HAND : PAN_ON_DRAG_DEFAULT}
        multiSelectionKeyCode={MULTI_SELECT_KEYS}
        className={cn(
          tool === "hand" && "ws-tool-hand",
          tool === "cut" && "ws-tool-cut",
          tool === "sticky" && "ws-tool-sticky",
        )}
      >
        {/* Floating action bar — appears above the bbox of any
         *  current selection, with context-aware buttons. Lives
         *  inside the ReactFlow tree so it can subscribe to
         *  selection / viewport via useOnSelectionChange and
         *  useViewport hooks. */}
        {/* Translucent bounding frame behind 2+ selected nodes.
         *  Mounts into `.react-flow__viewport` via portal so it
         *  inherits the viewport's pan/zoom transform. */}
        <MultiSelectionFrame />
        {/* Glow on edges that touch the selected node(s). Reads
         *  selection from React-Flow store + edges from useEdges()
         *  → injects a `<style>` tag with rules keyed off each
         *  edge's `data-id`. Pure presentational, no edge data
         *  mutation, no autosave dirty. */}
        <EdgeHighlightOnNodeSelect />
      </ReactFlow>
      <CanvasCollaborationOverlay />
      {picker && (
        <CanvasNodePicker
          state={picker}
          onPick={onPickerPick}
          onClose={() => setPicker(null)}
        />
      )}
      {/* Per-surface Suspense boundaries — one shared boundary would
       *  suspend ALL four whenever any single chunk is in flight,
       *  visibly delaying unrelated UI (open shortcuts ⇒ context
       *  menu also goes blank). Each gets its own. Null fallback is
       *  right for modal/menu surfaces where a transient empty frame
       *  is invisible (vs. a spinner that would flash). */}
      {contextMenu && (
        <Suspense fallback={null}>
          <CanvasContextMenu
            state={contextMenu}
            onPick={onContextMenuPick}
            onAction={onContextMenuAction}
            onClose={() => setContextMenu(null)}
          />
        </Suspense>
      )}
      {nodeContextMenu && nodeContextMenuItems.length > 0 && (
        <MediaContextMenu
          position={nodeContextMenu.position}
          items={nodeContextMenuItems}
          onClose={() => setNodeContextMenu(null)}
          ariaLabel={t("workspace.nodemenu.aria")}
        />
      )}
      {preview && (
        <NodePreviewLightbox
          preview={preview}
          onClose={() => setPreview(null)}
          /* Crop confirm — turn the cropped Blob into a File and
           * route it through the existing uploadAsset path. The new
           * AssetNode spawns at the centre of the current viewport
           * so it appears in view rather than offscreen. The
           * lightbox itself closes after the upload completes. */
          onCropConfirmed={async (blob, filename) => {
            const file = new File([blob], filename, {
              type: blob.type || "image/png",
            });
            // Spawn at the visible viewport centre so the user
            // sees the cropped node land in front of them.
            const centre = screenToFlowPosition({
              x: window.innerWidth / 2,
              y: window.innerHeight / 2,
            });
            await uploadAsset(file, centre);
            toast.success(t("workspace.crop.toast_added_canvas"));
          }}
        />
      )}
      {quickCrop && (
        <ImageCropTool
          src={quickCrop.src}
          suggestedFilename={`${quickCrop.label}.png`}
          onCancel={() => setQuickCrop(null)}
          onCropConfirmed={async (blob, filename) => {
            const file = new File([blob], filename, {
              type: blob.type || "image/png",
            });
            await uploadTransformedFile(file);
            setQuickCrop(null);
            toast.success(t("workspace.crop.toast_added_canvas"));
          }}
        />
      )}
      <CanvasFloatingSidebar
        onAddNode={openContextMenuAtAnchor}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {settingsOpen && (
        <Suspense fallback={null}>
          <ShortcutsDialog
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
        </Suspense>
      )}
      {/* VoicePickerDialog render removed — the dialog and its
       *  hardcoded preset catalog are gone. */}
    </div>
  );
};

const WorkspaceCanvas = () => (
  <ReactFlowProvider>
    <Inner />
  </ReactFlowProvider>
);

export default WorkspaceCanvas;
