import { useEffect, useMemo, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { XYPosition } from "@xyflow/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  useWorkspaceStore,
  type CanvasGraph,
  type WorkspaceEdge,
  type WorkspaceNode,
} from "@/store/useWorkspaceStore";
import { selectCanMutate, useWorkspaceShareRole } from "@/store/useWorkspaceShareRole";
import {
  colorForCollaborator,
  isCanvasCollaborationEnabled,
  useCanvasCollaborationStore,
  type CanvasCollaborator,
  type CursorBroadcast,
} from "./canvasCollaboration";

type PatchPayload =
  | {
      kind: "node_positions";
      canvasId: string;
      clientId: string;
      opId: string;
      sentAt: number;
      nodePositions: Array<{
        id: string;
        position: XYPosition;
        positionAbsolute?: XYPosition;
      }>;
    }
  | {
      kind: "snapshot";
      canvasId: string;
      clientId: string;
      opId: string;
      sentAt: number;
      nodes: WorkspaceNode[];
      edges: WorkspaceEdge[];
      viewport?: CanvasGraph["viewport"];
    };

const BROADCAST_EVENT = "canvas_patch";
const CURSOR_EVENT = "canvas_cursor";

type CursorPayload = CursorBroadcast & {
  clientId: string;
  userId: string;
  name: string;
  color: string;
  email?: string | null;
  avatarUrl?: string | null;
};

function tabClientId(): string {
  const key = "workspace-realtime-client-id";
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function nodeShapeFingerprint(nodes: WorkspaceNode[], edges: WorkspaceEdge[]): string {
  return JSON.stringify({
    nodes: nodes.map((node) => {
      const {
        position: _position,
        positionAbsolute: _positionAbsolute,
        selected: _selected,
        dragging: _dragging,
        ...rest
      } = node as WorkspaceNode & {
        positionAbsolute?: XYPosition;
        selected?: boolean;
        dragging?: boolean;
      };
      return rest;
    }),
    edges,
  });
}

function positionsFingerprint(nodes: WorkspaceNode[]): string {
  return JSON.stringify(
    nodes.map((node) => ({
      id: node.id,
      position: node.position,
      positionAbsolute: (node as WorkspaceNode & { positionAbsolute?: XYPosition }).positionAbsolute,
    })),
  );
}

function graphFingerprint(graph: CanvasGraph): string {
  return JSON.stringify({
    id: graph.id,
    nodes: graph.nodes,
    edges: graph.edges,
    viewport: graph.viewport ?? null,
  });
}

function userCollaborator(
  user: NonNullable<ReturnType<typeof useAuth>["user"]>,
  clientId: string,
): CanvasCollaborator {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const rawName =
    metadata.full_name ??
    metadata.name ??
    metadata.user_name ??
    metadata.preferred_username;
  const name =
    typeof rawName === "string" && rawName.trim()
      ? rawName.trim()
      : user.email?.split("@")[0] ?? "Member";
  const rawAvatar = metadata.avatar_url ?? metadata.picture;
  const avatarUrl = typeof rawAvatar === "string" ? rawAvatar : null;
  return {
    clientId,
    userId: user.id,
    name,
    email: user.email ?? null,
    avatarUrl,
    color: colorForCollaborator(user.id || clientId),
    onlineAt: Date.now(),
    selectedNodeId: null,
    cursorEnabled: true,
    cursor: null,
  };
}

function flattenPresenceState(state: Record<string, unknown[]>): CanvasCollaborator[] {
  const members: CanvasCollaborator[] = [];
  for (const entries of Object.values(state)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const item = entry as Partial<CanvasCollaborator>;
      if (!item.clientId || !item.userId || !item.name) continue;
      members.push({
        clientId: item.clientId,
        userId: item.userId,
        name: item.name,
        email: item.email ?? null,
        avatarUrl: item.avatarUrl ?? null,
        color: item.color ?? colorForCollaborator(item.userId),
        onlineAt: typeof item.onlineAt === "number" ? item.onlineAt : Date.now(),
        selectedNodeId: item.selectedNodeId ?? null,
        cursorEnabled: item.cursorEnabled !== false,
        cursor: item.cursor ?? null,
      });
    }
  }
  return members;
}

function toGraph(row: Record<string, unknown>): CanvasGraph | null {
  const id = typeof row.id === "string" ? row.id : "";
  const workspaceId = typeof row.workspace_id === "string" ? row.workspace_id : "";
  if (!id || !workspaceId) return null;
  return {
    id,
    ownerId: typeof row.user_id === "string" ? row.user_id : null,
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    workspaceId,
    name: typeof row.name === "string" ? row.name : "Page 1",
    nodes: Array.isArray(row.nodes) ? (row.nodes as WorkspaceNode[]) : [],
    edges: Array.isArray(row.edges) ? (row.edges as WorkspaceEdge[]) : [],
    viewport: row.viewport as CanvasGraph["viewport"],
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).getTime() : Date.now(),
  };
}

export function useCanvasRealtime() {
  const { user } = useAuth();
  const canMutate = useWorkspaceShareRole(selectCanMutate);
  const current = useWorkspaceStore((state) => state.current);
  const applyRemoteCanvasPatch = useWorkspaceStore((state) => state.applyRemoteCanvasPatch);
  const replaceCanvasGraph = useWorkspaceStore((state) => state.replaceCanvasGraph);
  const collaborationChannelRef = useRef<RealtimeChannel | null>(null);
  const lastGraphRef = useRef<CanvasGraph | null>(null);
  const remoteApplyingRef = useRef(false);
  const pendingTimerRef = useRef<number | null>(null);
  const clientId = useMemo(tabClientId, []);
  const localCollaborator = useMemo(
    () => (user ? userCollaborator(user, clientId) : null),
    [clientId, user],
  );

  useEffect(() => {
    const canvasId = current?.id;
    if (!canvasId || !user?.id) return;
    const collaborationEnabled = isCanvasCollaborationEnabled() && localCollaborator != null;

    // Keep durable canvas sync independent from private presence/broadcast.
    // Private Realtime can fail if realtime.messages policies are missing or
    // temporarily unavailable; row updates should still flow through the
    // workspace_canvases RLS-protected postgres_changes channel.
    const dbChannel = supabase.channel(`workspace-canvas-db:${canvasId}`);

    dbChannel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "workspace_canvases",
        filter: `id=eq.${canvasId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (row.updated_by === user.id) return;
        const graph = toGraph(row);
        if (!graph) return;
        const currentGraph = useWorkspaceStore.getState().graphs[canvasId];
        if (currentGraph && graphFingerprint(currentGraph) === graphFingerprint(graph)) return;
        remoteApplyingRef.current = true;
        replaceCanvasGraph(graph);
      },
    );

    dbChannel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        console.warn("[canvas-realtime] canvas row subscription disconnected", status);
      }
    });

    let collaborationChannel: RealtimeChannel | null = null;
    let heartbeat: number | null = null;

    if (collaborationEnabled && localCollaborator) {
      const liveChannel = supabase.channel(`workspace-canvas:${canvasId}`, {
        config: {
          private: true,
          broadcast: { self: false, ack: false },
          presence: { key: clientId },
        },
      });
      collaborationChannel = liveChannel;
      collaborationChannelRef.current = liveChannel;
      const collaboration = useCanvasCollaborationStore.getState();
      collaboration.setLocalUser(localCollaborator);
      collaboration.setStatus("connecting");

      const trackPresence = () => {
        const state = useCanvasCollaborationStore.getState();
        if (!state.localUser) return;
        void liveChannel.track({
          ...state.localUser,
          onlineAt: Date.now(),
          cursorEnabled: state.cursorEnabled,
        });
      };

      collaboration.setRealtimeSenders({
        trackPresence,
        sendCursor: (message) => {
          const state = useCanvasCollaborationStore.getState();
          if (!state.localUser) return;
          const payload: CursorPayload = {
            ...message,
            selectedNodeId: message.selectedNodeId ?? state.localUser.selectedNodeId ?? null,
            clientId,
            userId: state.localUser.userId,
            name: state.localUser.name,
            email: state.localUser.email,
            avatarUrl: state.localUser.avatarUrl,
            color: state.localUser.color,
          };
          void liveChannel.send({
            type: "broadcast",
            event: CURSOR_EVENT,
            payload,
          });
        },
        sendSelection: (selectedNodeId) => {
          const state = useCanvasCollaborationStore.getState();
          if (!state.localUser) return;
          const localUser = { ...state.localUser, selectedNodeId };
          state.setLocalUser(localUser);
          void liveChannel.track({
            ...localUser,
            onlineAt: Date.now(),
            cursorEnabled: state.cursorEnabled,
          });
        },
      });

      liveChannel.on("presence", { event: "sync" }, () => {
        useCanvasCollaborationStore
          .getState()
          .setMembers(flattenPresenceState(liveChannel.presenceState() as Record<string, unknown[]>));
      });

      liveChannel.on("broadcast", { event: BROADCAST_EVENT }, ({ payload }) => {
        const patch = payload as PatchPayload | undefined;
        if (!patch || patch.canvasId !== canvasId || patch.clientId === clientId) return;

        remoteApplyingRef.current = true;
        if (patch.kind === "node_positions") {
          applyRemoteCanvasPatch(canvasId, {
            nodePositions: patch.nodePositions,
            updatedAt: patch.sentAt,
          });
        } else {
          applyRemoteCanvasPatch(canvasId, {
            nodes: patch.nodes,
            edges: patch.edges,
            viewport: patch.viewport,
            updatedAt: patch.sentAt,
          });
        }
      });

      liveChannel.on("broadcast", { event: CURSOR_EVENT }, ({ payload }) => {
        const message = payload as CursorPayload | undefined;
        if (!message || message.canvasId !== canvasId || message.clientId === clientId) return;
        useCanvasCollaborationStore.getState().upsertMember({
          clientId: message.clientId,
          userId: message.userId,
          name: message.name || "Member",
          email: message.email ?? null,
          avatarUrl: message.avatarUrl ?? null,
          color: message.color || colorForCollaborator(message.userId),
          onlineAt: Date.now(),
          selectedNodeId: message.selectedNodeId ?? null,
          cursorEnabled: message.cursorEnabled,
          cursor: message.cursorEnabled
            ? {
                xPct: message.xPct,
                yPct: message.yPct,
                sentAt: message.sentAt,
              }
            : null,
        });
      });

      liveChannel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          const state = useCanvasCollaborationStore.getState();
          state.setStatus("connected");
          state.senders.trackPresence?.();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          useCanvasCollaborationStore.getState().setStatus("error");
          console.warn("[canvas-realtime] collaboration channel disconnected", status);
        }
      });

      heartbeat = window.setInterval(() => {
        useCanvasCollaborationStore.getState().senders.trackPresence?.();
      }, 15_000);
    }

    return () => {
      if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current);
      if (heartbeat) window.clearInterval(heartbeat);
      void supabase.removeChannel(dbChannel);
      if (collaborationEnabled) {
        useCanvasCollaborationStore.getState().clearMembers();
      }
      collaborationChannelRef.current = null;
      if (collaborationChannel) void supabase.removeChannel(collaborationChannel);
    };
  }, [applyRemoteCanvasPatch, clientId, current?.id, localCollaborator, replaceCanvasGraph, user?.id]);

  useEffect(() => {
    if (!current?.id) {
      lastGraphRef.current = null;
      return;
    }

    const previous = lastGraphRef.current;
    if (!previous || previous.id !== current.id) {
      lastGraphRef.current = current;
      return;
    }

    if (remoteApplyingRef.current) {
      remoteApplyingRef.current = false;
      lastGraphRef.current = current;
      return;
    }

    const channel = collaborationChannelRef.current;
    if (!channel || !canMutate || !user?.id) {
      lastGraphRef.current = current;
      return;
    }

    const previousShape = nodeShapeFingerprint(previous.nodes, previous.edges);
    const nextShape = nodeShapeFingerprint(current.nodes, current.edges);
    const previousPositions = positionsFingerprint(previous.nodes);
    const nextPositions = positionsFingerprint(current.nodes);
    const positionsChanged = previousPositions !== nextPositions;
    const shapeChanged = previousShape !== nextShape;
    if (!positionsChanged && !shapeChanged) {
      lastGraphRef.current = current;
      return;
    }

    const payload: PatchPayload = !shapeChanged && positionsChanged
      ? {
          kind: "node_positions",
          canvasId: current.id,
          clientId,
          opId: crypto.randomUUID(),
          sentAt: Date.now(),
          nodePositions: current.nodes.map((node) => ({
            id: node.id,
            position: node.position,
            positionAbsolute: (node as WorkspaceNode & { positionAbsolute?: XYPosition }).positionAbsolute,
          })),
        }
      : {
          kind: "snapshot",
          canvasId: current.id,
          clientId,
          opId: crypto.randomUUID(),
          sentAt: Date.now(),
          nodes: current.nodes,
          edges: current.edges,
          viewport: current.viewport,
        };

    lastGraphRef.current = current;
    if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = window.setTimeout(() => {
      void channel.send({
        type: "broadcast",
        event: BROADCAST_EVENT,
        payload,
      });
    }, payload.kind === "node_positions" ? 80 : 180);
  }, [canMutate, clientId, current, user?.id]);
}
