import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { phFlowPublished } from "@/lib/posthogEvents";
import type { Node, Edge } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";

const defaultEdgeOptions = {
  animated: true,
  type: "smoothstep" as const,
  style: { stroke: "hsl(217 91% 60% / 0.5)", strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(217 91% 60% / 0.6)", width: 16, height: 16 },
};

export interface FlowData {
  id: string;
  name: string;
  status: string;
  current_version: number;
  category: string;
  description: string | null;
  tags: string[] | null;
  is_official: boolean;
}

export const useFlowEditor = () => {
  const { flowId } = useParams<{ flowId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = flowId === "new";

  // Canvas state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [flowMeta, setFlowMeta] = useState<FlowData | null>(null);
  const initializedRef = useRef(false);

  // ── Fetch flow metadata ──
  const { data: flowRecord, isLoading: flowLoading } = useQuery({
    queryKey: ["flow", flowId],
    enabled: !!flowId && !isNew && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flows")
        .select("*")
        .eq("id", flowId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) { navigate("/app/studio"); return null; }
      return data;
    },
  });

  // ── Fetch flow nodes ──
  const { data: dbNodes, isLoading: nodesLoading } = useQuery({
    queryKey: ["flow-nodes", flowId],
    enabled: !!flowId && !isNew && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flow_nodes")
        .select("*")
        .eq("flow_id", flowId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Sync DB → local state once on load
  useEffect(() => {
    if (initializedRef.current) return;
    if (flowRecord) {
      setFlowMeta({
        id: flowRecord.id,
        name: flowRecord.name,
        status: flowRecord.status,
        current_version: flowRecord.current_version,
        category: flowRecord.category,
        description: flowRecord.description,
        tags: flowRecord.tags,
        is_official: (flowRecord as any).is_official ?? false,
      });
    }
    if (dbNodes) {
      const rfNodes: Node[] = dbNodes.map((n) => ({
        id: n.id,
        type: "flowNode",
        position: { x: n.position_x, y: n.position_y },
        data: { label: n.label, nodeType: n.node_type, config: n.config },
      }));
      setNodes(rfNodes);

      // Build edges from config.connections if present
      const builtEdges: Edge[] = [];
      dbNodes.forEach((n) => {
        const cfg = n.config as Record<string, unknown>;
        const conns = cfg?.connections as Array<{ source: string; sourceHandle?: string; targetHandle?: string }> | undefined;
        if (conns) {
          conns.forEach((c) => {
            builtEdges.push({
              id: `e-${c.source}-${n.id}-${c.targetHandle ?? ''}`,
              source: c.source,
              target: n.id,
              sourceHandle: c.sourceHandle ?? null,
              targetHandle: c.targetHandle ?? null,
              ...defaultEdgeOptions,
            });
          });
        }
      });
      setEdges(builtEdges);
      initializedRef.current = true;
    }
  }, [flowRecord, dbNodes]);

  // ── Save flow name ──
  const saveNameMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!flowMeta) return;
      const { error } = await supabase.from("flows").update({ name }).eq("id", flowMeta.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["flows"] }),
  });

  // ── Save flow tags ──
  const saveTagsMutation = useMutation({
    mutationFn: async (tags: string[]) => {
      if (!flowMeta) return;
      const { error } = await supabase.from("flows").update({ tags }).eq("id", flowMeta.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["flows"] }),
  });

  // ── Save all nodes ──
  const saveNodesMutation = useMutation({
    mutationFn: async () => {
      if (!flowMeta) throw new Error("No flow");

      // ── SAFETY: Never delete existing nodes if local state is empty ──
      if (nodes.length === 0) {
        const { count } = await supabase
          .from("flow_nodes")
          .select("id", { count: "exact", head: true })
          .eq("flow_id", flowMeta.id);
        if (count && count > 0) {
          console.warn(`[FlowEditor] Blocked save: local nodes=0 but DB has ${count} nodes. Skipping destructive save.`);
          return;
        }
        // DB also has 0 nodes, nothing to do
        return;
      }

      // Delete existing then re-insert (atomic-ish)
      await supabase.from("flow_nodes").delete().eq("flow_id", flowMeta.id);

      // Build connection map from edges (include handle info)
      const connectionMap = new Map<string, Array<{ source: string; sourceHandle?: string | null; targetHandle?: string | null }>>();
      edges.forEach((e) => {
        const existing = connectionMap.get(e.target) ?? [];
        existing.push({ source: e.source, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle });
        connectionMap.set(e.target, existing);
      });

      const rows = nodes.map((n, i) => {
        const d = n.data as Record<string, unknown> | undefined;
        const existingConfig = (d?.config as Record<string, unknown>) ?? {};
        return {
        flow_id: flowMeta.id,
        id: n.id,
        node_type: (d?.nodeType as string) || "input/text_input",
        label: (d?.label as string) || "Untitled",
        position_x: n.position.x,
        position_y: n.position.y,
        sort_order: i,
        config: {
          ...existingConfig,
          connections: connectionMap.get(n.id) ?? [],
        },
        };
      });

      const { error } = await supabase.from("flow_nodes").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Flow saved");
      queryClient.invalidateQueries({ queryKey: ["flow-nodes", flowMeta?.id] });
    },
    onError: (err) => {
      console.error("[FlowEditor] Save failed:", err);
      toast.error("Failed to save");
    },
  });

  // ── Add a node from palette ──
  const addNode = useCallback((nodeType: string, label: string) => {
    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
      type: "flowNode",
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: { label, nodeType, config: {} },
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(id);
  }, []);

  // ── Delete selected node ──
  const deleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [selectedNodeId]);

  // ── Duplicate nodes ──
  const duplicateNodes = useCallback((nodeIds: string[]) => {
    setNodes((prev) => {
      const toDuplicate = prev.filter((n) => nodeIds.includes(n.id));
      const idMap = new Map<string, string>();
      const newNodes = toDuplicate.map((n) => {
        const newId = crypto.randomUUID();
        idMap.set(n.id, newId);
        return {
          ...n,
          id: newId,
          position: { x: n.position.x + 40, y: n.position.y + 40 },
          selected: true,
          data: { ...n.data },
        };
      });
      // Deselect originals
      const updated = prev.map((n) => nodeIds.includes(n.id) ? { ...n, selected: false } : n);
      return [...updated, ...newNodes];
    });
    // Duplicate internal edges between duplicated nodes
    setEdges((prev) => {
      const idMap = new Map<string, string>();
      // rebuild id map (need to match the nodes we just added)
      // We'll handle edges in the keyboard handler instead
      return prev;
    });
  }, []);

  // ── Clipboard ──
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });

  const copySelected = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0 && selectedNodeId) {
      const single = nodes.find((n) => n.id === selectedNodeId);
      if (single) clipboardRef.current = { nodes: [single], edges: [] };
    } else {
      const ids = new Set(selectedNodes.map((n) => n.id));
      const relatedEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
      clipboardRef.current = { nodes: selectedNodes, edges: relatedEdges };
    }
    toast.success(`Copied ${clipboardRef.current.nodes.length} node(s)`);
  }, [nodes, edges, selectedNodeId]);

  const pasteClipboard = useCallback(() => {
    const { nodes: clipNodes, edges: clipEdges } = clipboardRef.current;
    if (clipNodes.length === 0) return;
    const idMap = new Map<string, string>();
    const newNodes = clipNodes.map((n) => {
      const newId = crypto.randomUUID();
      idMap.set(n.id, newId);
      return {
        ...n,
        id: newId,
        position: { x: n.position.x + 60, y: n.position.y + 60 },
        selected: true,
        data: { ...n.data },
      };
    });
    const newEdges = clipEdges.map((e) => ({
      ...e,
      id: `e-${idMap.get(e.source)}-${idMap.get(e.target)}`,
      source: idMap.get(e.source) || e.source,
      target: idMap.get(e.target) || e.target,
    }));
    setNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), ...newNodes]);
    setEdges((prev) => [...prev, ...newEdges]);
    toast.success(`Pasted ${newNodes.length} node(s)`);
  }, []);

  const selectAll = useCallback(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, selected: true })));
  }, []);

  const deleteSelected = useCallback(() => {
    const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
    if (selectedIds.length === 0 && selectedNodeId) {
      deleteNode(selectedNodeId);
      return;
    }
    const idSet = new Set(selectedIds);
    setNodes((prev) => prev.filter((n) => !idSet.has(n.id)));
    setEdges((prev) => prev.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)));
    if (selectedNodeId && idSet.has(selectedNodeId)) setSelectedNodeId(null);
  }, [nodes, selectedNodeId, deleteNode]);

  // ── Update node label/config ──
  const updateNodeData = useCallback((nodeId: string, updates: Record<string, unknown>) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n
      )
    );
  }, []);

  // ── Publish flow (with version snapshot) ──
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!flowMeta || !user) throw new Error("No flow");
      // Save nodes first
      await saveNodesMutation.mutateAsync();

      // Create version snapshot
      const newVersion = flowMeta.current_version + 1;
      const snapshot = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: (n.data as Record<string, unknown>)?.nodeType,
          label: (n.data as Record<string, unknown>)?.label,
          position: n.position,
          config: (n.data as Record<string, unknown>)?.config,
        })),
        edges: edges.map((e) => ({ source: e.source, target: e.target })),
      };

      const { error: versionErr } = await supabase.from("flow_versions").insert([{
        flow_id: flowMeta.id,
        version: newVersion,
        created_by: user.id,
        snapshot: snapshot as unknown as import("@/integrations/supabase/types").Json,
        change_note: `Published v${newVersion}`,
      }]);
      if (versionErr) throw versionErr;

      // Update flow status + version
      const { error } = await supabase
        .from("flows")
        .update({ status: "published", current_version: newVersion })
        .eq("id", flowMeta.id);
      if (error) throw error;
      setFlowMeta((prev) => prev ? { ...prev, status: "published", current_version: newVersion } : prev);
    },
    onSuccess: () => {
      toast.success("Flow published!");
      if (flowMeta) phFlowPublished(flowMeta.id, flowMeta.name ?? "", flowMeta.is_official ?? false);
      queryClient.invalidateQueries({ queryKey: ["flows"] });
    },
    onError: () => toast.error("Failed to publish"),
  });

  const isLoading = flowLoading || nodesLoading;
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return {
    flowId,
    flowMeta,
    isLoading,
    isNew,
    nodes,
    edges,
    setNodes,
    setEdges,
    selectedNode,
    selectedNodeId,
    setSelectedNodeId,
    addNode,
    deleteNode,
    deleteSelected,
    duplicateNodes,
    copySelected,
    pasteClipboard,
    selectAll,
    updateNodeData,
    saveName: (name: string) => {
      setFlowMeta((prev) => prev ? { ...prev, name } : prev);
      saveNameMutation.mutate(name);
    },
    saveTags: (tags: string[]) => {
      setFlowMeta((prev) => prev ? { ...prev, tags } : prev);
      saveTagsMutation.mutate(tags);
    },
    saveNodes: () => saveNodesMutation.mutate(),
    publish: () => publishMutation.mutate(),
    isSaving: saveNodesMutation.isPending,
    isPublishing: publishMutation.isPending,
  };
};
