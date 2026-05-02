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
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastGraphRef = useRef<CanvasGraph | null>(null);
  const remoteApplyingRef = useRef(false);
  const pendingTimerRef = useRef<number | null>(null);
  const clientId = useMemo(tabClientId, []);

  useEffect(() => {
    const canvasId = current?.id;
    if (!canvasId || !user?.id) return;

    const channel = supabase.channel(`workspace-canvas:${canvasId}`, {
      config: {
        private: true,
        broadcast: { self: false, ack: false },
      },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: BROADCAST_EVENT }, ({ payload }) => {
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

    channel.on(
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

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("[canvas-realtime] channel authorization failed or disconnected");
      }
    });

    return () => {
      if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [applyRemoteCanvasPatch, clientId, current?.id, replaceCanvasGraph, user?.id]);

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

    const channel = channelRef.current;
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
