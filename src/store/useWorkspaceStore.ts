/**
 * Workspace store — auto-saves to localStorage via zustand persist.
 *
 * State model:
 *   - `canvases[]`            list shown on the workspace dashboard
 *   - `graphs[canvasId]`      every canvas's full graph (source of truth)
 *   - `current`               the active canvas graph (= `graphs[currentId]`,
 *                             kept as a top-level slot so React Flow / panels
 *                             can subscribe to it without re-deriving)
 *
 * Every mutation that touches `current` also writes the same value into
 * `graphs[current.id]`, so the persisted snapshot stays in sync without
 * the caller having to remember.
 *
 * Node shape mirrors the legacy flow editor so we can reuse its nodes
 * verbatim:
 *   - `type` is the schema key (e.g. "imageGenNode")
 *   - `data.label`   free-text title (editable on the node)
 *   - `data.params`  form values keyed by ParamDef.key
 *   - `data.exposed` which params are exposed (kept for API compat)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Edge, Node, XYPosition } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges, addEdge } from "@xyflow/react";
import type { NodeChange, EdgeChange, Connection } from "@xyflow/react";
import { getWorkspaceSchema } from "@/components/workspace/workspaceSchema";

export interface WorkspaceNodeData extends Record<string, unknown> {
  label?: string;
  params: Record<string, unknown>;
  exposed?: Record<string, boolean>;
}

export type WorkspaceNode = Node<WorkspaceNodeData>;
export type WorkspaceEdge = Edge;

/** Image attached to a chat message (from paste / file picker).
 *  Stored as a base64 data URL so we don't need a separate upload
 *  pipeline for chat — small enough payloads ride inline; large
 *  ones are rejected by the upload helper before they reach here. */
export interface ChatAttachment {
  /** "image/png", "image/jpeg", … */
  mime: string;
  /** Full base64 `data:<mime>;base64,<…>` URL — used both for the
   *  in-bubble preview and as the model API payload. */
  dataUrl: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Optional image attachments (paste or file upload). Only set on
   *  user messages currently — the assistant doesn't return images
   *  through this panel. */
  attachments?: ChatAttachment[];
  createdAt: number;
}

/** Top-level project / "Workspace" — owns multiple tabs (Canvases).
 *  Maps 1:1 with what the dashboard at /app/workspace lists. */
export interface WorkspaceMeta {
  id: string;
  name: string;
  updatedAt: number;
}

export interface CanvasMeta {
  id: string;
  /** Which workspace this tab belongs to. Tabs without a workspace
   *  are legacy persisted state from v1 and get migrated on load. */
  workspaceId: string;
  name: string;
  updatedAt: number;
}

export interface CanvasGraph extends CanvasMeta {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
}

/** Snapshot used by the undo / redo stacks — only nodes + edges,
 *  no metadata. Stored in-memory only (excluded from persist) so a
 *  reload always starts with a clean history. */
export interface HistorySnap {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
}

interface WorkspaceState {
  /** Top-level workspaces shown on /app/workspace dashboard. Each
   *  workspace owns 1+ canvases (= tabs). */
  workspaces: WorkspaceMeta[];
  canvases: CanvasMeta[];
  graphs: Record<string, CanvasGraph>;
  current: CanvasGraph | null;
  selectedNodeId: string | null;

  /** Tombstones — workspace ids the user explicitly deleted on this
   *  device. Persisted across reloads so the dashboard's
   *  "push local-only workspaces back to server" sync doesn't
   *  resurrect a workspace the user just deleted but whose local
   *  store entry hasn't been fully cleared on every device.
   *
   *  Stored as `{ id → deletedAt (ms) }` so we can prune entries
   *  older than the tombstone TTL — keeps the localStorage payload
   *  bounded for users that delete dozens of workspaces over time.
   *
   *  TTL is generous (7 days). The window only needs to outlive
   *  whatever stale localStorage another device might still have;
   *  in practice every device re-syncs within minutes once the
   *  user opens the dashboard there. */
  deletedWorkspaceIds: Record<string, number>;

  /** Past states — newest at the end. `undo` pops from here. */
  history: HistorySnap[];
  /** Redo stack — populated by `undo`, drained by `redo`. Cleared
   *  whenever any new mutation lands. */
  redoStack: HistorySnap[];

  // workspace-level (top-level entity)
  /** Creates a workspace + a default "Untitled canvas" tab inside it.
   *  Returns the new canvas id so the caller can navigate to it. */
  createWorkspace: (name?: string) => { workspaceId: string; canvasId: string };
  renameWorkspace: (id: string, name: string) => void;
  /** Deletes a workspace and CASCADES — every canvas owned by this
   *  workspace is removed too. */
  deleteWorkspace: (id: string) => void;

  // canvas-level (= tabs within a workspace)
  /** Creates a tab/canvas inside the given workspace. If no
   *  workspaceId is given, falls back to the most recent workspace
   *  (or creates a new "Untitled workspace" if none exist). */
  createCanvas: (workspaceId?: string, name?: string) => string;
  openCanvas: (id: string) => void;
  renameCanvas: (id: string, name: string) => void;
  deleteCanvas: (id: string) => void;
  /** Replace a canvas's cached graph wholesale — used by the server
   *  autosave loader to overwrite stale localStorage with the truth
   *  from `workspace_canvases`. Inserts the canvas into the meta list
   *  if it wasn't there yet (e.g. user opens a server-only canvas
   *  from a different device). */
  replaceCanvasGraph: (graph: CanvasGraph) => void;

  /** Merge a server-side workspace list into the local list. Used by
   *  the dashboard's mount-time hydration to make spaces appear that
   *  were created on a different device. Last-write-wins by
   *  `updatedAt` so a stale server row never clobbers a fresher
   *  local rename. Server-only workspaces are appended; local-only
   *  workspaces are kept (the caller fires upserts to push them up). */
  mergeServerWorkspaces: (server: WorkspaceMeta[]) => void;

  // node-level
  /** Returns the new node's id — lets callers wire up edges right after. */
  addSchemaNode: (
    nodeType: string,
    label: string,
    position: XYPosition,
    extraData?: Record<string, unknown>,
  ) => string;
  /** Drop a file from the OS → creates an AssetNode immediately. Returns its id. */
  addAssetNode: (data: Record<string, unknown>, position: XYPosition) => string;
  /** Generic patch for any node's `data` (used while an asset uploads). */
  updateNodeData: (nodeId: string, patch: Record<string, unknown>) => void;
  /**
   * Prepend a generation to a tool node's history. The latest item is
   * always at index 0, and `selectedGenIndex` resets to 0 so the node's
   * thumbnail immediately reflects the new output.
   *
   * `Generation` shape (kept generic so we don't need a cross-import):
   *   { id, type: "image" | "video" | "text", url?, text?, createdAt }
   */
  addGeneration: (nodeId: string, gen: Record<string, unknown>) => void;
  setSelectedNode: (id: string | null) => void;

  /** Wrap every currently-selected node in a new groupNode frame.
   *  Children get `parentId` + `extent: "parent"` so they render
   *  inside the frame and can't be dragged out. Returns the new
   *  group's id (or null when nothing is selected). */
  groupSelectedNodes: (label?: string) => string | null;
  /** Pop a group: children get their absolute positions back and
   *  the frame node is removed. Safe no-op for non-group ids. */
  ungroupNode: (groupId: string) => void;
  /** Re-position selected nodes into a grid (top-left of the existing
   *  selection bbox stays put; nodes flow row-by-row). */
  arrangeSelectedAsGrid: (columns?: number) => void;

  /** Push the current canvas (nodes + edges) onto the undo stack and
   *  clear the redo stack. Called by every mutation that the user
   *  would expect Ctrl+Z to reverse. Safe to call when there's no
   *  active canvas — no-op. */
  pushHistory: () => void;
  /** Pop one entry off the undo stack and apply it. Current state
   *  goes onto the redo stack so Ctrl+Shift+Z can roll forward. */
  undo: () => void;
  /** Redo the most recently undone action. */
  redo: () => void;

  // ── Workspace AI Assistant chat ──────────────────────────
  /** Message history for the right-panel AI assistant. */
  chatMessages: ChatMessage[];
  /** True while the assistant is producing a reply (disables input). */
  chatIsStreaming: boolean;
  /** Append a message; id + timestamp filled for you. */
  addChatMessage: (msg: Omit<ChatMessage, "id" | "createdAt">) => void;
  /** Append text to the last message (used for streaming tokens). */
  appendLastChat: (textDelta: string) => void;
  /** Toggle the streaming flag. */
  setChatStreaming: (v: boolean) => void;
  /** Clear conversation (e.g. "New chat" button). */
  clearChat: () => void;

  // React Flow handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
}

/** Stable id generator. Prefer `crypto.randomUUID()` (collision-safe
 *  to ~2^61 ids) and fall back to a 10-char base36 hash only for
 *  ancient browsers that lack the API. The fallback was previously
 *  the default — fine for tens of nodes per session, but with multi-
 *  tab + multi-canvas we'd start hitting collisions in long sessions
 *  (Math.random + 8 chars ≈ 2^41 ≈ 0.001% collision at 65k ids). */
const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
const now = () => Date.now();

/** Default name for a new canvas tab inside a workspace. We use the
 *  pattern "Page N" where N is one greater than the highest existing
 *  Page number in the workspace — so creating tabs in order yields
 *  Page 1, Page 2, Page 3, … even after renames or deletes (the
 *  scan only looks at canvases that still match `Page <number>`).
 *
 *  Renamed tabs don't claim a number — if the user renames "Page 2"
 *  to "Brainstorm" and then makes a new tab, the new tab becomes
 *  "Page 3" (it considers Page 1 + Page 3 already taken). That's
 *  intentional: skipping numbers signals "something used to live
 *  here" without forcing the user to restate the renamed tab. */
function nextPageName(canvases: CanvasMeta[], workspaceId: string): string {
  let max = 0;
  for (const c of canvases) {
    if (c.workspaceId !== workspaceId) continue;
    const m = c.name.match(/^Page\s+(\d+)$/i);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `Page ${max + 1}`;
}

/** Pre-fill params with each ParamDef.default so the node is usable immediately. */
const defaultParamsFor = (nodeType: string): Record<string, unknown> => {
  const schema = getWorkspaceSchema(nodeType);
  if (!schema) return {};
  const out: Record<string, unknown> = {};
  for (const p of schema.params) out[p.key] = p.default;
  return out;
};

/** Cap the history stack — keeps memory bounded for users who edit
 *  for hours. Anything older than this drops off the back. */
const HISTORY_LIMIT = 80;

/** Module-level flag — true while a drag is in progress so onNodesChange
 *  knows to snapshot ONCE at drag-start (capturing the original
 *  position) rather than every frame OR only at drag-end (which would
 *  capture mid-drag state, making undo a no-op). Reset on drag-end.
 *
 *  Also reset on:
 *    - canvas switch (openCanvas / createCanvas)
 *    - tab blur / `pointercancel` (covers Esc-cancel where React Flow
 *      may not emit `dragging:false` at all)
 *    - undo/redo (the stack mutation outside a drag obviously means
 *      no drag is in flight)
 *  Reset hooks installed at module scope below the store creation. */
let _dragSnapshotTaken = false;

/**
 * After mutating `current`, mirror it into `graphs[current.id]` and
 * keep `canvases.updatedAt` in sync. Use this as the return value of
 * any `set` callback that produces a new `current`.
 */
function withCurrent(
  state: WorkspaceState,
  next: CanvasGraph,
  extra: Partial<WorkspaceState> = {},
): Partial<WorkspaceState> {
  const stamped = { ...next, updatedAt: now() };
  return {
    current: stamped,
    graphs: { ...state.graphs, [stamped.id]: stamped },
    // CRITICAL: keep ALL existing meta fields (`workspaceId` chief
    // among them) when rebuilding the canvas row. The previous
    // version explicitly listed `{ id, name, updatedAt }` which
    // silently dropped `workspaceId` on every node mutation —
    // tab bar then filters by workspaceId and the active tab
    // appeared to vanish the moment the user added a node.
    canvases: state.canvases.map((c) =>
      c.id === stamped.id
        ? { ...c, name: stamped.name, updatedAt: stamped.updatedAt }
        : c,
    ),
    ...extra,
  };
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      canvases: [],
      graphs: {},
      current: null,
      selectedNodeId: null,
      deletedWorkspaceIds: {},
      history: [],
      redoStack: [],
      chatMessages: [],
      chatIsStreaming: false,

      /* ── Workspace-level actions ──────────────────────────── */

      createWorkspace: (name) => {
        const wsId = uid();
        const wsMeta: WorkspaceMeta = {
          id: wsId,
          name: name || "Untitled workspace",
          updatedAt: now(),
        };
        // Every workspace starts with one empty canvas — opening a
        // workspace with zero tabs would surface as a hostile UX
        // (no canvas to land on, blank tab bar). The first canvas is
        // always "Page 1" — subsequent tabs auto-increment via
        // `nextPageName` in createCanvas.
        const canvasId = uid();
        const canvasMeta: CanvasMeta = {
          id: canvasId,
          workspaceId: wsId,
          name: "Page 1",
          updatedAt: now(),
        };
        const fresh: CanvasGraph = { ...canvasMeta, nodes: [], edges: [] };
        _dragSnapshotTaken = false;
        set((s) => ({
          workspaces: [wsMeta, ...s.workspaces],
          canvases: [canvasMeta, ...s.canvases],
          graphs: { ...s.graphs, [canvasId]: fresh },
          current: fresh,
          selectedNodeId: null,
          history: [],
          redoStack: [],
        }));
        return { workspaceId: wsId, canvasId };
      },

      renameWorkspace: (id, name) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === id ? { ...w, name, updatedAt: now() } : w,
          ),
        })),

      deleteWorkspace: (id) =>
        set((s) => {
          // Cascade — drop every canvas owned by this workspace, plus
          // their persisted viewport keys. If the active canvas
          // belongs to the deleted workspace, clear `current` so the
          // Canvas page bounces back to the dashboard.
          const owned = new Set(
            s.canvases.filter((c) => c.workspaceId === id).map((c) => c.id),
          );
          const remainingGraphs: Record<string, CanvasGraph> = {};
          for (const [cid, g] of Object.entries(s.graphs)) {
            if (!owned.has(cid)) remainingGraphs[cid] = g;
          }
          if (typeof window !== "undefined") {
            for (const cid of owned) {
              try {
                localStorage.removeItem(`workspace-viewport-${cid}`);
              } catch {
                /* ignore */
              }
            }
          }
          // Tombstone — record the deletion so the dashboard's
          // server-sync doesn't resurrect this workspace from any
          // other device's stale localStorage. Without the tombstone,
          // the sync's "push every local-only workspace up to the
          // server" branch would re-create the workspace row the
          // moment another device with old localStorage opens the
          // dashboard. Stored as `{ id → deletedAt }` so old
          // tombstones can be pruned on a TTL.
          return {
            workspaces: s.workspaces.filter((w) => w.id !== id),
            canvases: s.canvases.filter((c) => c.workspaceId !== id),
            graphs: remainingGraphs,
            current: owned.has(s.current?.id ?? "") ? null : s.current,
            selectedNodeId:
              s.current && owned.has(s.current.id) ? null : s.selectedNodeId,
            deletedWorkspaceIds: {
              ...s.deletedWorkspaceIds,
              [id]: now(),
            },
          };
        }),

      /* ── Canvas-level actions (= tabs within a workspace) ── */

      createCanvas: (workspaceId, name) => {
        // Resolve workspace: explicit param → currently-open canvas's
        // workspace → most-recently-updated workspace → create one.
        const state = get();
        let wsId = workspaceId;
        // Validate explicit workspaceId — if a stale id was passed
        // (e.g. workspace was deleted in another tab between calls),
        // treat it as missing instead of orphaning the canvas.
        if (wsId && !state.workspaces.some((w) => w.id === wsId)) {
          wsId = undefined;
        }
        if (!wsId && state.current) wsId = state.current.workspaceId;
        if (!wsId && state.workspaces.length > 0) wsId = state.workspaces[0].id;
        if (!wsId) {
          // No workspace exists — bootstrap one and put this canvas
          // inside it. Same code path as createWorkspace's default
          // canvas, but we want to return THIS canvas's id (matches
          // the legacy v1 contract where createCanvas returned the
          // canvas id directly).
          const created = get().createWorkspace(name || "Untitled workspace");
          return created.canvasId;
        }

        const id = uid();
        // Auto-name the tab "Page N" when the caller didn't supply
        // an explicit non-empty name OR passed the legacy "Untitled"
        // placeholder (the old default before Page-numbering was
        // introduced — kept here so we don't have to touch every
        // call-site at once).
        const wantsAutoName =
          !name || name === "Untitled" || name === "Untitled canvas";
        const resolvedName = wantsAutoName
          ? nextPageName(state.canvases, wsId)
          : name;
        const meta: CanvasMeta = {
          id,
          workspaceId: wsId,
          name: resolvedName,
          updatedAt: now(),
        };
        const fresh: CanvasGraph = { ...meta, nodes: [], edges: [] };
        // Drag flag survives across canvases otherwise — a stuck flag
        // from canvas A would silently break the FIRST drag-snapshot
        // on canvas B.
        _dragSnapshotTaken = false;
        set((s) => ({
          canvases: [meta, ...s.canvases],
          graphs: { ...s.graphs, [id]: fresh },
          current: fresh,
          selectedNodeId: null,
          // Touch the parent workspace so dashboard sort-by-recent
          // bubbles it to the top.
          workspaces: s.workspaces.map((w) =>
            w.id === wsId ? { ...w, updatedAt: now() } : w,
          ),
          history: [],
          redoStack: [],
        }));
        return id;
      },

      openCanvas: (id) => {
        const state = get();
        // Idempotent — if we're already on this canvas, do nothing.
        // Without this, any caller that re-runs openCanvas(currentId)
        // would WIPE the undo / redo history. The Canvas page's
        // useEffect used to call this on every store update because
        // its deps included the `canvases` array; even after that
        // fix, this guard makes the action safe for all callers.
        if (state.current?.id === id) return;
        const meta = state.canvases.find((c) => c.id === id);
        if (!meta) return;
        const cached = state.graphs[id];
        const next: CanvasGraph = cached ?? { ...meta, nodes: [], edges: [] };
        // Same reasoning as createCanvas — clear stuck drag flag.
        _dragSnapshotTaken = false;
        set((s) => ({
          current: next,
          // Make sure graphs has an entry even on first open so future
          // mutations don't leave a stale `canvases` row pointing at no graph.
          graphs: cached ? s.graphs : { ...s.graphs, [id]: next },
          selectedNodeId: null,
          history: [],
          redoStack: [],
        }));
      },

      mergeServerWorkspaces: (serverList) =>
        set((s) => {
          // Tombstone filter — a workspace the user just deleted on
          // this device should NOT come back from the server even if
          // it's still in the response (race window before our
          // delete request lands, or another device hasn't synced
          // yet). Skip tombstoned ids entirely.
          const tombstones = s.deletedWorkspaceIds;
          const liveServer = serverList.filter(
            (w) => !(w.id in tombstones),
          );

          // Build a quick lookup of what we already have locally.
          const localById = new Map(s.workspaces.map((w) => [w.id, w]));
          // Last-write-wins by updatedAt — same row but the server
          // is fresher means we adopt the server name; vice-versa
          // we keep what's local (the upsert will catch the server
          // up shortly via the dashboard's fire-and-forget hook).
          for (const server of liveServer) {
            const local = localById.get(server.id);
            if (!local) {
              localById.set(server.id, server);
            } else if (server.updatedAt > local.updatedAt) {
              localById.set(server.id, { ...local, ...server });
            }
            // else: keep local — it's fresher than the server copy.
          }
          // Re-sort newest-first so dashboard's default ordering
          // stays stable.
          const merged = Array.from(localById.values()).sort(
            (a, b) => b.updatedAt - a.updatedAt,
          );
          return { workspaces: merged };
        }),

      replaceCanvasGraph: (graph) =>
        set((s) => {
          const meta: CanvasMeta = {
            id: graph.id,
            workspaceId: graph.workspaceId,
            name: graph.name,
            updatedAt: graph.updatedAt,
          };
          const existsInList = s.canvases.some((c) => c.id === graph.id);
          return {
            graphs: { ...s.graphs, [graph.id]: graph },
            canvases: existsInList
              ? s.canvases.map((c) => (c.id === graph.id ? meta : c))
              : [meta, ...s.canvases],
            // If this is the currently-open canvas, swap its in-memory
            // copy too — without this the React Flow surface keeps
            // showing the stale local nodes while the store changes
            // around it.
            current: s.current?.id === graph.id ? graph : s.current,
            // Drop history because the local actions don't apply to
            // the server-loaded graph state.
            history: s.current?.id === graph.id ? [] : s.history,
            redoStack: s.current?.id === graph.id ? [] : s.redoStack,
          };
        }),

      renameCanvas: (id, name) =>
        set((s) => {
          const renamedAt = now();
          const updatedGraphs = s.graphs[id]
            ? { ...s.graphs, [id]: { ...s.graphs[id], name, updatedAt: renamedAt } }
            : s.graphs;
          return {
            canvases: s.canvases.map((c) => (c.id === id ? { ...c, name, updatedAt: renamedAt } : c)),
            graphs: updatedGraphs,
            current:
              s.current?.id === id ? { ...s.current, name, updatedAt: renamedAt } : s.current,
          };
        }),

      deleteCanvas: (id) =>
        set((s) => {
          const { [id]: _drop, ...rest } = s.graphs;
          // Drop persisted viewport for this canvas too.
          if (typeof window !== "undefined") {
            try { localStorage.removeItem(`workspace-viewport-${id}`); } catch { /* ignore */ }
          }
          return {
            canvases: s.canvases.filter((c) => c.id !== id),
            graphs: rest,
            current: s.current?.id === id ? null : s.current,
            selectedNodeId: s.current?.id === id ? null : s.selectedNodeId,
          };
        }),

      /* ── Undo / redo plumbing ────────────────────────────────
       * Snapshot the current canvas state and clear the redo stack.
       * Every public mutation (add / delete / group / arrange / etc.)
       * calls this BEFORE running so Ctrl+Z lands on a coherent
       * "before" state. Drag-move snapshots happen via onNodesChange
       * with `dragging: false` so we get one entry per drag, not one
       * per pixel. */
      pushHistory: () =>
        set((s) => {
          if (!s.current) return s;
          const snap: HistorySnap = {
            nodes: s.current.nodes,
            edges: s.current.edges,
          };
          return {
            history: [...s.history, snap].slice(-HISTORY_LIMIT),
            redoStack: [],
          };
        }),

      undo: () =>
        set((s) => {
          if (!s.current || s.history.length === 0) return s;
          const prev = s.history[s.history.length - 1];
          const newHistory = s.history.slice(0, -1);
          const redoEntry: HistorySnap = {
            nodes: s.current.nodes,
            edges: s.current.edges,
          };
          return withCurrent(
            s,
            { ...s.current, nodes: prev.nodes, edges: prev.edges },
            {
              history: newHistory,
              redoStack: [...s.redoStack, redoEntry],
            },
          );
        }),

      redo: () =>
        set((s) => {
          if (!s.current || s.redoStack.length === 0) return s;
          const next = s.redoStack[s.redoStack.length - 1];
          const newRedo = s.redoStack.slice(0, -1);
          const histEntry: HistorySnap = {
            nodes: s.current.nodes,
            edges: s.current.edges,
          };
          return withCurrent(
            s,
            { ...s.current, nodes: next.nodes, edges: next.edges },
            {
              history: [...s.history, histEntry].slice(-HISTORY_LIMIT),
              redoStack: newRedo,
            },
          );
        }),

      addSchemaNode: (nodeType, label, position, extraData = {}) => {
        const nodeId = `n_${uid()}`;
        set((s) => {
          if (!s.current) return s;
          const baseData =
            nodeType === "textNode"
              ? { label, content: "", params: {} }
              : { label, params: defaultParamsFor(nodeType), exposed: {} };
          const node: WorkspaceNode = {
            id: nodeId,
            type: nodeType,
            position,
            data: { ...baseData, ...extraData },
          };
          // Snapshot BEFORE adding so Ctrl+Z removes this node.
          const snap: HistorySnap = {
            nodes: s.current.nodes,
            edges: s.current.edges,
          };
          return withCurrent(
            s,
            { ...s.current, nodes: [...s.current.nodes, node] },
            {
              history: [...s.history, snap].slice(-HISTORY_LIMIT),
              redoStack: [],
            },
          );
        });
        return nodeId;
      },

      addAssetNode: (data, position) => {
        const nodeId = `a_${uid()}`;
        set((s) => {
          if (!s.current) return s;
          const node: WorkspaceNode = {
            id: nodeId,
            type: "assetNode",
            position,
            data: { label: "", params: {}, ...data },
          };
          const snap: HistorySnap = {
            nodes: s.current.nodes,
            edges: s.current.edges,
          };
          return withCurrent(
            s,
            { ...s.current, nodes: [...s.current.nodes, node] },
            {
              history: [...s.history, snap].slice(-HISTORY_LIMIT),
              redoStack: [],
            },
          );
        });
        return nodeId;
      },

      updateNodeData: (nodeId, patch) =>
        set((s) => {
          if (!s.current) return s;
          return withCurrent(s, {
            ...s.current,
            nodes: s.current.nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n,
            ),
          });
        }),

      addGeneration: (nodeId, gen) =>
        set((s) => {
          if (!s.current) return s;
          return withCurrent(s, {
            ...s.current,
            nodes: s.current.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const prev = ((n.data as any).generations ?? []) as unknown[];
              return {
                ...n,
                data: {
                  ...n.data,
                  generations: [gen, ...prev],
                  selectedGenIndex: 0,
                },
              };
            }),
          });
        }),

      setSelectedNode: (id) => set({ selectedNodeId: id }),

      /* ── Grouping ────────────────────────────────────────────
       * Wraps the current selection in a new `groupNode`. Children
       * are converted to use ReactFlow's parent/child mechanism:
       *   parentId = group's id
       *   extent   = "parent"   (clamped to frame bounds)
       *   position = relative to the group's top-left
       *
       * The group itself sits BEFORE its children in the nodes
       * array — ReactFlow treats array order as z-order, so the
       * frame paints under the children. Skipping this would make
       * children disappear behind the frame's hit area. */
      groupSelectedNodes: (label = "New group") => {
        const state = get();
        if (!state.current) return null;
        const selected = state.current.nodes.filter((n) => n.selected);
        if (selected.length < 2) return null;

        // Don't wrap a group in another group, and don't wrap children
        // that already belong to a different group — keeps the
        // hierarchy single-level for now.
        const eligible = selected.filter(
          (n) => n.type !== "groupNode" && !n.parentId,
        );
        if (eligible.length < 2) return null;

        // Generous frame inset so children breathe inside the box —
        // tight padding read as a "broken layout" in user feedback.
        // Vertical gets extra room because the floating title bar
        // sits ABOVE the frame and we don't want it overlapping the
        // top child.
        const PADDING_X = 48;
        const PADDING_TOP = 56;
        const PADDING_BOTTOM = 48;
        const NODE_W_FALLBACK = 300;
        const NODE_H_FALLBACK = 320;
        // Try ReactFlow-measured dims first; fall back to declared
        // width/height; finally to defaults. Without this, big Asset
        // tiles got under-counted and the frame ended up tight.
        const dimsOf = (n: WorkspaceNode) => {
          const m =
            (n as WorkspaceNode & {
              measured?: { width?: number; height?: number };
            }).measured;
          return {
            w: m?.width ?? n.width ?? NODE_W_FALLBACK,
            h: m?.height ?? n.height ?? NODE_H_FALLBACK,
          };
        };
        const xs = eligible.map((n) => n.position.x);
        const ys = eligible.map((n) => n.position.y);
        const xs2 = eligible.map((n) => n.position.x + dimsOf(n).w);
        const ys2 = eligible.map((n) => n.position.y + dimsOf(n).h);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs2);
        const maxY = Math.max(...ys2);

        const groupOriginX = minX - PADDING_X;
        const groupOriginY = minY - PADDING_TOP;
        const groupId = `g_${uid()}`;
        const groupNode: WorkspaceNode = {
          id: groupId,
          type: "groupNode",
          position: { x: groupOriginX, y: groupOriginY },
          data: { label, params: {} },
          // ReactFlow reads dims off `style` for sized container nodes.
          style: {
            width: maxX - minX + PADDING_X * 2,
            height: maxY - minY + PADDING_TOP + PADDING_BOTTOM,
          },
          // Frame should sit under everything in z-order.
          selected: true,
        };

        const eligibleIds = new Set(eligible.map((n) => n.id));
        set((s) => {
          if (!s.current) return s;
          const updatedChildren = s.current.nodes.map((n) => {
            if (!eligibleIds.has(n.id)) return n;
            // NOTE: deliberately NOT setting `extent: "parent"` —
            // children stay free to drag out of the frame. The
            // canvas-level `onNodeDragStop` handler reparents /
            // unparents based on whether the node ended up inside
            // a group's bbox. Photoshop / Figma-style live grouping.
            return {
              ...n,
              parentId: groupId,
              selected: false, // shift selection to the group itself
              position: {
                x: n.position.x - groupOriginX,
                y: n.position.y - groupOriginY,
              },
            };
          });
          // Group must come BEFORE its children in the array —
          // ReactFlow honours array order for z-index AND for
          // parent-resolution (parent must already exist when child
          // is processed). Both reasons converge here.
          const others = updatedChildren.filter((n) => !eligibleIds.has(n.id));
          const childrenInGroup = updatedChildren.filter((n) =>
            eligibleIds.has(n.id),
          );
          const snap: HistorySnap = {
            nodes: s.current.nodes,
            edges: s.current.edges,
          };
          return withCurrent(
            s,
            { ...s.current, nodes: [...others, groupNode, ...childrenInGroup] },
            {
              history: [...s.history, snap].slice(-HISTORY_LIMIT),
              redoStack: [],
            },
          );
        });

        return groupId;
      },

      ungroupNode: (groupId) =>
        set((s) => {
          if (!s.current) return s;
          const group = s.current.nodes.find((n) => n.id === groupId);
          if (!group || group.type !== "groupNode") return s;
          const updated = s.current.nodes
            .filter((n) => n.id !== groupId)
            .map((n) => {
              if (n.parentId !== groupId) return n;
              // Strip parent linkage and bake position back to absolute.
              const { parentId: _p, extent: _e, ...rest } = n as typeof n & {
                extent?: unknown;
              };
              return {
                ...rest,
                position: {
                  x: n.position.x + group.position.x,
                  y: n.position.y + group.position.y,
                },
                selected: true, // surface them as the new selection
              } as WorkspaceNode;
            });
          const snap: HistorySnap = {
            nodes: s.current.nodes,
            edges: s.current.edges,
          };
          return withCurrent(
            s,
            { ...s.current, nodes: updated },
            {
              history: [...s.history, snap].slice(-HISTORY_LIMIT),
              redoStack: [],
            },
          );
        }),

      arrangeSelectedAsGrid: (columns = 2) =>
        set((s) => {
          if (!s.current) return s;
          const selected = s.current.nodes.filter((n) => n.selected);
          if (selected.length < 2) return s;

          // Sort by current position so the layout feels stable —
          // top-rows first, then left-to-right within each row.
          const sorted = [...selected].sort(
            (a, b) =>
              a.position.y - b.position.y || a.position.x - b.position.x,
          );
          const baseX = sorted[0].position.x;
          const baseY = sorted[0].position.y;
          // Use the largest selected node as the cell size so wider
          // nodes aren't clipped by neighbours. Falls back to default.
          const cellW = Math.max(
            ...sorted.map((n) => n.width ?? 260),
            260,
          );
          const cellH = Math.max(
            ...sorted.map((n) => n.height ?? 200),
            200,
          );
          const GAP = 24;

          const positionMap = new Map<string, { x: number; y: number }>();
          sorted.forEach((n, i) => {
            const col = i % columns;
            const row = Math.floor(i / columns);
            positionMap.set(n.id, {
              x: baseX + col * (cellW + GAP),
              y: baseY + row * (cellH + GAP),
            });
          });

          const updated = s.current.nodes.map((n) => {
            const p = positionMap.get(n.id);
            return p ? { ...n, position: p } : n;
          });
          const snap: HistorySnap = {
            nodes: s.current.nodes,
            edges: s.current.edges,
          };
          return withCurrent(
            s,
            { ...s.current, nodes: updated },
            {
              history: [...s.history, snap].slice(-HISTORY_LIMIT),
              redoStack: [],
            },
          );
        }),

      addChatMessage: (msg) =>
        set((s) => ({
          chatMessages: [
            ...s.chatMessages,
            { ...msg, id: (globalThis.crypto?.randomUUID?.() ?? uid()), createdAt: now() },
          ],
        })),

      appendLastChat: (delta) =>
        set((s) => {
          if (s.chatMessages.length === 0) return s;
          const next = s.chatMessages.slice();
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + delta };
          return { chatMessages: next };
        }),

      setChatStreaming: (v) => set({ chatIsStreaming: v }),

      clearChat: () => set({ chatMessages: [], chatIsStreaming: false }),

      onNodesChange: (changes) =>
        set((s) => {
          if (!s.current) return s;

          // ── History snapshot decision ──
          //
          // For drags we want EXACTLY ONE snapshot per drag, captured
          // BEFORE the position changes (so undo restores the
          // original position). React Flow emits:
          //
          //   1st frame:   { type: "position", dragging: true,  position: …new… }
          //   …more drags: { type: "position", dragging: true,  position: …    }
          //   release:     { type: "position", dragging: false, position: …    }
          //
          // The trick: snapshot on the FIRST `dragging: true` change
          // we see (state still has original position at that point),
          // and reset the flag on `dragging: false`. Module-level
          // `_dragSnapshotTaken` survives across set() calls.
          //
          // For non-drag mutations (add / remove / replace) we
          // always snapshot — those happen as one-shot events and
          // already represent the "before" state.
          const isFirstDragFrame = changes.some(
            (c) => c.type === "position" && c.dragging === true,
          );
          const isDragEnd = changes.some(
            (c) => c.type === "position" && c.dragging === false,
          );
          // Group resizes via NodeResizer emit `dimensions` changes
          // — same drag-style {start, …, end} sequence with a
          // `resizing` flag. Treat them like position drags so undo
          // gets ONE snapshot per resize gesture, not one per pixel.
          const isFirstResizeFrame = changes.some(
            (c) =>
              c.type === "dimensions" &&
              (c as { resizing?: boolean }).resizing === true,
          );
          const isResizeEnd = changes.some(
            (c) =>
              c.type === "dimensions" &&
              (c as { resizing?: boolean }).resizing === false,
          );
          const otherMeaningful = changes.some((c) => {
            if (c.type === "add") return true;
            if (c.type === "remove") return true;
            if (c.type === "replace") return true;
            return false;
          });

          let history = s.history;
          let redoStack = s.redoStack;
          let pushNow = otherMeaningful;
          if (isFirstDragFrame && !_dragSnapshotTaken) {
            _dragSnapshotTaken = true;
            pushNow = true;
          }
          if (isDragEnd) _dragSnapshotTaken = false;
          // Same one-snapshot-per-gesture trick for group resize.
          // Reuses the same flag — drag and resize don't overlap.
          if (isFirstResizeFrame && !_dragSnapshotTaken) {
            _dragSnapshotTaken = true;
            pushNow = true;
          }
          if (isResizeEnd) _dragSnapshotTaken = false;

          if (pushNow) {
            history = [
              ...s.history,
              { nodes: s.current.nodes, edges: s.current.edges },
            ].slice(-HISTORY_LIMIT);
            redoStack = [];
          }

          // ── Auto-ungroup-on-delete ──
          // ReactFlow's `parentId` is just an id reference — when the
          // parent is removed, children become orphans rendered at
          // their RELATIVE position (which looks like a teleport).
          // Detect group deletions in this batch and pre-emptively
          // bake child positions back to absolute + drop the parent
          // linkage. This way `Delete` on a group works intuitively:
          // the frame disappears, the children stay where they were.
          const groupRemovals = new Set<string>();
          for (const c of changes) {
            if (c.type === "remove") {
              const node = s.current.nodes.find((n) => n.id === c.id);
              if (node?.type === "groupNode") groupRemovals.add(c.id);
            }
          }

          let pre = s.current.nodes;
          if (groupRemovals.size > 0) {
            const parentLookup = new Map(
              s.current.nodes
                .filter((n) => groupRemovals.has(n.id))
                .map((n) => [n.id, n]),
            );
            pre = pre.map((n) => {
              if (!n.parentId || !groupRemovals.has(n.parentId)) return n;
              const parent = parentLookup.get(n.parentId);
              if (!parent) return n;
              const { parentId: _p, extent: _e, ...rest } = n as typeof n & {
                extent?: unknown;
              };
              return {
                ...rest,
                position: {
                  x: n.position.x + parent.position.x,
                  y: n.position.y + parent.position.y,
                },
              } as WorkspaceNode;
            });
          }

          return withCurrent(
            s,
            {
              ...s.current,
              nodes: applyNodeChanges(changes, pre) as WorkspaceNode[],
            },
            { history, redoStack },
          );
        }),

      onEdgesChange: (changes) =>
        set((s) => {
          if (!s.current) return s;
          // Same rules as onNodesChange: snapshot only the meaningful
          // edits — add / remove / replace. `select` events fire while
          // the user clicks an edge to highlight it, that's not undo-
          // worthy.
          const meaningful = changes.some(
            (c) =>
              c.type === "add" || c.type === "remove" || c.type === "replace",
          );
          let history = s.history;
          let redoStack = s.redoStack;
          if (meaningful) {
            history = [
              ...s.history,
              { nodes: s.current.nodes, edges: s.current.edges },
            ].slice(-HISTORY_LIMIT);
            redoStack = [];
          }
          return withCurrent(
            s,
            { ...s.current, edges: applyEdgeChanges(changes, s.current.edges) },
            { history, redoStack },
          );
        }),

      onConnect: (connection) =>
        set((s) => {
          if (!s.current) return s;
          const snap: HistorySnap = {
            nodes: s.current.nodes,
            edges: s.current.edges,
          };
          return withCurrent(
            s,
            { ...s.current, edges: addEdge(connection, s.current.edges) },
            {
              history: [...s.history, snap].slice(-HISTORY_LIMIT),
              redoStack: [],
            },
          );
        }),
    }),
    {
      name: "mf-workspace-v1",
      // BUMP this when WorkspaceNode.data shape changes in a breaking
      // way. The `migrate` callback below maps older versions forward
      // — without it, persisted state from before the change either
      // crashes the app at runtime or silently drops data. Keep the
      // migrate function small and well-commented.
      //
      // v1: flat canvases[] (each canvas was a top-level "workspace")
      // v2: workspaces[] + canvases[] with workspaceId — tab/workspace
      //     hierarchy split (the dashboard now shows workspaces, the
      //     tab bar shows the canvases inside one workspace).
      // v3: SANITIZE pass — stricter validation of persisted state
      //     after the workspace V2 port to main. Some users had
      //     malformed v2 data left over from preview deploys
      //     (canvases referencing missing workspaces, graphs without
      //     proper nodes/edges arrays) which produced a render-phase
      //     crash that the WorkspaceErrorBoundary kept catching.
      //     Sanitize on load + drop invalid rows instead of trusting
      //     the wire shape.
      version: 3,
      storage: createJSONStorage(() => localStorage),
      // Skip ephemeral fields: current is derived from graphs, the
      // selection/streaming flags shouldn't outlive the tab.
      //
      // CRITICAL: chatMessages are NOT persisted here. They contain
      // base64 image attachments (paste / upload) that easily blow
      // past localStorage's ~5MB quota — when the write throws
      // QuotaExceededError zustand silently swallows it and the
      // ENTIRE state stops persisting from that point on, so the
      // user's nodes appear to vanish on the next reload. The chat
      // panel reloads its history from Supabase on canvas change
      // anyway, so dropping it here is lossless for signed-in users
      // (guests lose their in-memory chat on refresh — that's the
      // same as before).
      partialize: (state) => ({
        workspaces: state.workspaces,
        canvases: state.canvases,
        graphs: state.graphs,
        // Persist tombstones across reloads — that's the whole point.
        // Without this, a refresh resets `deletedWorkspaceIds` to {}
        // and the next dashboard sync resurrects everything that was
        // just deleted.
        deletedWorkspaceIds: state.deletedWorkspaceIds,
      }),
      // ── Forward-migration ────────────────────────────────
      // v1 → v2: every existing canvas was a top-level entry on the
      // dashboard. Group all of them under a single "My workspace"
      // so the user's existing data still shows up — they can rename
      // / split later. Never throw — return a usable state on any
      // unrecognised shape, or the whole app refuses to boot for
      // affected users.
      migrate: (persistedState, fromVersion) => {
        // Always returns sane state — never throws, never returns
        // partial. Either the state was valid (returned cleaned), or
        // we hit corruption / older version and reset to empty so the
        // user lands on the dashboard with a fresh slate.
        const reset = () => ({
          workspaces: [],
          canvases: [],
          graphs: {},
        }) as never;

        try {
          const ps = (persistedState ?? {}) as Record<string, unknown>;

          // ── v1 → v2: flat canvases promoted into one default workspace ──
          let working = ps;
          if (fromVersion < 2) {
            const oldCanvases = Array.isArray(ps.canvases)
              ? (ps.canvases as Array<{
                  id: string;
                  name?: string;
                  updatedAt?: number;
                }>)
              : [];
            const oldGraphs = (ps.graphs && typeof ps.graphs === "object"
              ? (ps.graphs as Record<string, CanvasGraph>)
              : {}) as Record<string, CanvasGraph>;

            const defaultWsId =
              globalThis.crypto?.randomUUID?.() ??
              `ws_${Math.random().toString(36).slice(2, 10)}`;
            const defaultWs: WorkspaceMeta = {
              id: defaultWsId,
              name: "My workspace",
              updatedAt:
                Math.max(
                  ...oldCanvases.map((c) => c.updatedAt ?? 0),
                  0,
                ) || Date.now(),
            };
            const newCanvases = oldCanvases.map((c) => ({
              ...c,
              workspaceId: defaultWsId,
            }));
            const newGraphs: Record<string, CanvasGraph> = {};
            for (const [cid, g] of Object.entries(oldGraphs)) {
              newGraphs[cid] = { ...g, workspaceId: defaultWsId };
            }
            working = {
              ...ps,
              workspaces: [defaultWs],
              canvases: newCanvases,
              graphs: newGraphs,
            };
          }

          // ── v2 → v3: SANITIZE everything ──────────────────────
          // Drop any row that's missing required fields. After the
          // port to main, some users had v2 data with malformed
          // shapes (canvases without workspaceId, graphs without
          // arrays) that crashed downstream rendering. Validate
          // strictly here so the runtime never sees bad data.
          const rawWorkspaces = Array.isArray(working.workspaces)
            ? working.workspaces : [];
          const rawCanvases = Array.isArray(working.canvases)
            ? working.canvases : [];
          const rawGraphs = (working.graphs && typeof working.graphs === "object"
            ? working.graphs as Record<string, unknown>
            : {});

          const validWorkspaces: WorkspaceMeta[] = rawWorkspaces.filter(
            (w: unknown): w is WorkspaceMeta => {
              const o = w as Record<string, unknown>;
              return !!(o && typeof o.id === "string" && typeof o.name === "string");
            },
          );
          const wsIds = new Set(validWorkspaces.map((w) => w.id));

          const validCanvases: CanvasMeta[] = rawCanvases.filter(
            (c: unknown): c is CanvasMeta => {
              const o = c as Record<string, unknown>;
              return !!(
                o &&
                typeof o.id === "string" &&
                typeof o.name === "string" &&
                typeof o.workspaceId === "string" &&
                wsIds.has(o.workspaceId as string)
              );
            },
          );
          const canvasIds = new Set(validCanvases.map((c) => c.id));

          const validGraphs: Record<string, CanvasGraph> = {};
          for (const [cid, g] of Object.entries(rawGraphs)) {
            if (!canvasIds.has(cid)) continue;
            const o = g as Record<string, unknown> | null;
            if (!o) continue;
            // Replace missing/invalid arrays with empty ones — the
            // canvas is still openable, just without nodes.
            validGraphs[cid] = {
              id: cid,
              workspaceId: (o.workspaceId as string) ?? "",
              name: (o.name as string) ?? "Untitled canvas",
              updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : Date.now(),
              nodes: Array.isArray(o.nodes) ? (o.nodes as CanvasGraph["nodes"]) : [],
              edges: Array.isArray(o.edges) ? (o.edges as CanvasGraph["edges"]) : [],
              viewport: o.viewport as CanvasGraph["viewport"],
            };
          }

          return {
            workspaces: validWorkspaces,
            canvases: validCanvases,
            graphs: validGraphs,
          } as never;
        } catch (err) {
          console.error(
            "[workspace-store] migrate failed; resetting:",
            err,
          );
          return reset();
        }
      },
      // ── Rehydration hook ─────────────────────────────────
      // Runs AFTER the persist library has merged persistedState into
      // initial state. We use it to:
      //   1. Reset ephemeral fields (current / selectedNodeId / chat
      //      streaming flag) so reloads always boot fresh.
      //   2. Detect corruption (state === null when JSON.parse failed)
      //      and surface a console warning — Zustand will already have
      //      fallen back to the initial state, but the user should
      //      know their old canvases didn't load.
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error(
            "[workspace-store] rehydrate failed — local data may be corrupted:",
            error,
          );
          // No way to surface a toast from here (no React context yet),
          // so console + telemetry. Apps reading from this store will
          // see the initial empty state and behave cleanly.
          return;
        }
        if (state) {
          state.current = null;
          state.selectedNodeId = null;
          state.chatIsStreaming = false;
        }
      },
    },
  ),
);

// ── Drag flag failsafes ────────────────────────────────────
// React Flow MOSTLY emits a `dragging:false` change when a drag
// ends, but corner cases (Esc-cancel, pointercancel during a
// scroll-wheel zoom, blur away from the canvas mid-drag) can leave
// our snapshot flag stuck "true". A stuck flag silently skips the
// next drag's snapshot → undo loses the move. These window-level
// listeners reset it on any plausible drag-aborting event.
if (typeof window !== "undefined") {
  const reset = () => {
    _dragSnapshotTaken = false;
  };
  window.addEventListener("pointercancel", reset, true);
  window.addEventListener("blur", reset);
  // Esc anywhere — covers explicit drag-cancel.
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") reset();
    },
    true,
  );
  // Page hidden → tab switch / minimise. Drag is gone.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reset();
  });
}

// Dev helper: expose store on window so it can be poked from the browser
// console for wireframe debugging. Removed before production.
if (typeof window !== "undefined") {
  (window as unknown as { __workspaceStore: typeof useWorkspaceStore }).__workspaceStore =
    useWorkspaceStore;
}
