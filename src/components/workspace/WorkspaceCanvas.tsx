/**
 * Workspace Canvas — React Flow surface.
 *
 * Unified tool nodes (imageGenNode, videoGenNode) go through the
 * workspace-specific `WorkspaceToolNode` renderer, which reads the
 * shared schema + handles Kling custom logic when it applies.
 *
 * Simple AI tools (BG remove, Merge audio) still use their legacy
 * per-tool components directly.
 *
 * All are wrapped with `withResultHistory` so they gain the result-
 * bar / history-dialog affordance when `data.generations` is populated.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useConnection,
  useReactFlow,
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
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

import WorkspaceToolNode from "./WorkspaceToolNode";
import AssetNode from "./AssetNode";
import ElementNode from "./ElementNode";
import TextNode from "./TextNode";
import GroupNode from "./GroupNode";
import NodeQuickToolbar from "./NodeQuickToolbar";
import MultiSelectionFrame from "./MultiSelectionFrame";
import NodePreviewLightbox, {
  getNodePreview,
  type PreviewPayload,
} from "./NodePreviewLightbox";
import { getWorkspaceSchema, portTypeFromHandleId } from "./workspaceSchema";
import CanvasNodePicker, {
  type CanvasNodePickerState,
  type PickerOption,
} from "./CanvasNodePicker";
import { useWorkspaceShortcuts } from "./useWorkspaceShortcuts";

const VIEWPORT_KEY = (canvasId: string) => `workspace-viewport-${canvasId}`;
const STORAGE_BUCKET = "ai-media";
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
  "image", "image_input", "ref_image", "start_frame", "end_frame", "mask",
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

const nodeTypes = {
  // All schema-driven tools route through WorkspaceToolNode — that's
  // the only place where the V2 Run button + workspace-run-node
  // dispatcher live. WorkspaceToolNode now uses the preview-first
  // compact layout (see CompactParamWidgets / workspace.css), so the
  // result strip and history dialog are baked into the node itself.
  // The previous `withResultHistory` HOC is no longer needed here.
  imageGenNode: WorkspaceToolNode,
  videoGenNode: WorkspaceToolNode,
  removeBackgroundNode: WorkspaceToolNode,
  mergeAudioNode: WorkspaceToolNode,
  videoToPromptNode: WorkspaceToolNode,
  // Workspace-only.
  assetNode: AssetNode,
  elementNode: ElementNode,
  textNode: TextNode,
  groupNode: GroupNode,
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
  const { getNode } = useReactFlow();
  useEffect(() => {
    const body = document.body;
    if (connection.inProgress) {
      body.setAttribute("data-rfc", "true");
      const handleId = connection.fromHandle?.id ?? "";
      const fromNodeId = connection.fromNode?.id ?? null;
      // Side: handle.type is "source" (output) or "target" (input).
      const dir = connection.fromHandle?.type ?? "source";

      /* Resolve the wire's data type with three fallbacks:
       *   1. Schema-based lookup by handle id (covers `ref_image`,
       *      `start_frame`, `output_video`, etc. — most cases).
       *   2. DOM `data-port-type` attribute on the actual handle —
       *      authoritative because every PortIcon writes it.
       *   3. Node-type aware default (TextNode → text, AssetNode →
       *      its fieldType). This catches the generic `id="default"`
       *      handles where the schema lookup would misclassify.
       *
       * Without (2) and (3), dragging from a TextNode output (id
       * "default") would set `data-rfc-type="image"` because of the
       * schema fallback, lighting up `ref_image` slots instead of
       * text-typed inputs. */
      let dataType: string = portTypeFromHandleId(handleId);

      if (fromNodeId) {
        // (2) Read the data-port-type attribute from the DOM. The
        // selector targets the React Flow handle child of the node's
        // wrapper (which carries `data-id="<nodeId>"`).
        const handleEl = document.querySelector(
          `.react-flow__node[data-id="${CSS.escape(fromNodeId)}"] ` +
            `.react-flow__handle[data-handleid="${CSS.escape(handleId)}"]`,
        ) as HTMLElement | null;
        const domType = handleEl?.getAttribute("data-port-type");
        if (domType) {
          dataType = domType;
        } else {
          // (3) Fallback by source node type for the "default"
          // generic handle ids.
          const node = getNode(fromNodeId);
          if (node?.type === "textNode") {
            dataType = "text";
          } else if (node?.type === "assetNode") {
            const ft = (node.data as Record<string, unknown> | undefined)
              ?.fieldType;
            if (ft === "image" || ft === "video" || ft === "audio") {
              dataType = ft;
            }
          }
        }
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
    getNode,
  ]);
};

const Inner = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, setViewport, getViewport, setNodes } = useReactFlow();
  const { user } = useAuth();
  useConnectingAttribute();

  const canvasId = useWorkspaceStore((s) => s.current?.id);
  const nodes = useWorkspaceStore((s) => s.current?.nodes ?? []);
  const edges = useWorkspaceStore((s) => s.current?.edges ?? []);
  const onNodesChange = useWorkspaceStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkspaceStore((s) => s.onEdgesChange);
  const onConnect = useWorkspaceStore((s) => s.onConnect);
  const addSchemaNode = useWorkspaceStore((s) => s.addSchemaNode);
  const addAssetNode = useWorkspaceStore((s) => s.addAssetNode);
  const updateNodeData = useWorkspaceStore((s) => s.updateNodeData);
  const setSelectedNode = useWorkspaceStore((s) => s.setSelectedNode);

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
        toast.error("Please log in to upload files");
        return;
      }
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      const isAudio = file.type.startsWith("audio/");
      if (!isImage && !isVideo && !isAudio) {
        toast.error("Only image, video, and audio files are supported");
        return;
      }

      const fieldType: "image" | "video" | "audio" =
        isVideo ? "video" : isAudio ? "audio" : "image";
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
        (isVideo ? "mp4" : isAudio ? "mp3" : "png");
      const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: true });

      if (upErr) {
        toast.error(`Upload failed: ${file.name}`);
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
    [user, addAssetNode, updateNodeData, setNodes],
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

      // Re-use payload from WorkspaceAssetPanel — spawn an AssetNode
      // pointing at the existing URL without re-uploading.
      const reuseRaw = e.dataTransfer.getData("application/reactflow-asset-reuse");
      if (reuseRaw) {
        try {
          const reuse = JSON.parse(reuseRaw) as {
            fieldType: "image" | "video" | "audio";
            url: string;
            label?: string;
            fileName?: string;
          };
          if (reuse?.url && reuse?.fieldType) {
            const newId = addAssetNode(
              {
                label: reuse.label ?? reuse.fileName ?? "asset",
                fieldType: reuse.fieldType,
                previewUrl: reuse.url,
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

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => setSelectedNode(node.id),
    [setSelectedNode],
  );
  const onPaneClick = useCallback(() => setSelectedNode(null), [setSelectedNode]);

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

  /** Double-click on a node opens the same fullscreen preview. */
  const onNodeDoubleClick = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.stopPropagation();
      const all = useWorkspaceStore.getState().current?.nodes ?? [];
      const p = getNodePreview(node, all);
      if (p) setPreview(p);
    },
    [],
  );

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
  const onNodeDragStop = useCallback(
    (_e: React.MouseEvent | React.TouchEvent, dragged: Node) => {
      // Don't reparent groups themselves.
      if (dragged.type === "groupNode") return;

      const allNodes = useWorkspaceStore.getState().current?.nodes ?? [];

      // Compute dragged node's ABSOLUTE position. parentId-aware,
      // 1 level deep (we don't allow nested groups).
      const draggedParent = dragged.parentId
        ? allNodes.find((n) => n.id === dragged.parentId)
        : null;
      const absX = (draggedParent?.position.x ?? 0) + dragged.position.x;
      const absY = (draggedParent?.position.y ?? 0) + dragged.position.y;
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
            const selectedModel =
              ((tgt.data as any)?.params?.model_name as string | undefined) ??
              schema.defaultModel;
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

            if (existing >= max) {
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
              if (src?.type === "textNode") srcKind = "text";
              else if (src?.type === "elementNode") srcKind = "element";
              else if (src?.type === "assetNode") {
                srcKind = ((src.data as any)?.fieldType as string) ?? "media";
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
      const newId = addSchemaNode(option.nodeType, option.defaultLabel, picker.flow);
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
        onConnect(conn);
      }
      setPicker(null);
    },
    [picker, addSchemaNode, onConnect],
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
    if (srcType === "textNode") typeOk = TEXT_TARGETS.has(th);
    else if (srcType === "elementNode") typeOk = ELEMENT_TARGETS.has(th);
    else if (srcType === "assetNode") {
      const ft = (src.data as any)?.fieldType;
      if (ft === "image") typeOk = IMAGE_TARGETS.has(th);
      else if (ft === "video") typeOk = VIDEO_TARGETS.has(th);
      else if (ft === "audio") typeOk = AUDIO_TARGETS.has(th);
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
    }
    if (!typeOk) return false;

    /* ── 2. Per-handle maxConnections (from schema) ────────── */
    if (conn.target && conn.targetHandle) {
      const tgt = nodeList.find((n) => n.id === conn.target);
      const schema = tgt ? getWorkspaceSchema(tgt.type ?? "") : undefined;
      if (schema && tgt) {
        const selectedModel =
          ((tgt.data as any)?.params?.model_name as string | undefined) ??
          schema.defaultModel;
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
      className="workspace-root relative h-full w-full bg-zinc-950"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="workspace-grid-surface" />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={memoNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onMoveEnd={onMoveEnd}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        isValidConnection={isValidConnection}
        deleteKeyCode={["Delete", "Backspace"]}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.25}
        maxZoom={2.5}
        // ── Marquee selection ──
        // Left-drag on empty canvas draws a selection box (Photoshop /
        // Figma feel). Pan moves to middle-click / right-click — that
        // matches design tools and keeps left-click as the primary
        // "select / drag-box" interaction.
        //
        // SelectionMode.Partial: a node is grabbed as soon as the
        // marquee TOUCHES it, not only when it fully encloses it.
        // Default `Full` mode forced users to drag the box past every
        // node's edges, which felt sticky on dense canvases.
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1, 2]}
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
      >
        {/* Floating action bar — appears above the bbox of any
         *  current selection, with context-aware buttons. Lives
         *  inside the ReactFlow tree so it can subscribe to
         *  selection / viewport via useOnSelectionChange and
         *  useViewport hooks. */}
        <NodeQuickToolbar />
        {/* Translucent bounding frame behind 2+ selected nodes.
         *  Mounts into `.react-flow__viewport` via portal so it
         *  inherits the viewport's pan/zoom transform. */}
        <MultiSelectionFrame />
      </ReactFlow>
      {picker && (
        <CanvasNodePicker
          state={picker}
          onPick={onPickerPick}
          onClose={() => setPicker(null)}
        />
      )}
      {preview && (
        <NodePreviewLightbox preview={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
};

const WorkspaceCanvas = () => (
  <ReactFlowProvider>
    <Inner />
  </ReactFlowProvider>
);

export default WorkspaceCanvas;
