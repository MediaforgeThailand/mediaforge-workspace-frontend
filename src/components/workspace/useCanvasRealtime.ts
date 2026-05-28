import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  useWorkspaceStore,
  type CanvasGraph,
  type WorkspaceEdge,
  type WorkspaceNode,
} from "@/store/useWorkspaceStore";

const OWN_WRITE_ECHO_GRACE_MS = 12_000;

function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map((entry) => normalize(entry));
    if (!item || typeof item !== "object") return item;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(item as Record<string, unknown>).sort()) {
      const normalized = normalize((item as Record<string, unknown>)[key]);
      if (normalized !== undefined) out[key] = normalized;
    }
    return out;
  };
  return JSON.stringify(normalize(value));
}

function stripEphemeralNodeState(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.map((node) => {
    const {
      selected: _selected,
      dragging: _dragging,
      resizing: _resizing,
      positionAbsolute: _positionAbsolute,
      ...persisted
    } = node as WorkspaceNode & {
      positionAbsolute?: unknown;
      selected?: boolean;
      dragging?: boolean;
      resizing?: boolean;
    };
    return persisted as WorkspaceNode;
  });
}

function graphFingerprint(graph: CanvasGraph): string {
  return stableJson({
    id: graph.id,
    nodes: stripEphemeralNodeState(graph.nodes),
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
  const current = useWorkspaceStore((state) => state.current);
  const replaceCanvasGraph = useWorkspaceStore((state) => state.replaceCanvasGraph);
  const lastGraphRef = useRef<CanvasGraph | null>(null);
  const remoteApplyingRef = useRef(false);
  const lastLocalEditAtRef = useRef(0);

  useEffect(() => {
    const canvasId = current?.id;
    if (!canvasId || !user?.id) return;

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
        const graph = toGraph(row);
        if (!graph) return;
        const currentGraph = useWorkspaceStore.getState().graphs[canvasId];
        if (currentGraph && graphFingerprint(currentGraph) === graphFingerprint(graph)) return;
        if (
          row.updated_by === user.id &&
          Date.now() - lastLocalEditAtRef.current < OWN_WRITE_ECHO_GRACE_MS
        ) {
          return;
        }
        remoteApplyingRef.current = true;
        replaceCanvasGraph(graph);
      },
    );

    dbChannel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        console.warn("[canvas-realtime] canvas row subscription disconnected", status);
      }
    });

    return () => {
      void supabase.removeChannel(dbChannel);
    };
  }, [current?.id, replaceCanvasGraph, user?.id]);

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

    if (graphFingerprint(previous) !== graphFingerprint(current)) {
      lastLocalEditAtRef.current = Date.now();
    }
    lastGraphRef.current = current;
  }, [current]);
}
