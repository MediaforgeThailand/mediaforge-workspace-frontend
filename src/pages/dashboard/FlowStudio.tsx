import { useState, useCallback, useRef, useEffect, useMemo, type DragEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  Panel,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  ReactFlowProvider,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ArrowLeft, Save, Play, Check, Upload, Settings2, Loader2,
  PanelLeftClose, Trash2, ImagePlus, Sparkles, Cloud, CloudOff, Pencil,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getFreshToken } from "@/lib/getFreshToken";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAutoSave, type AutoSaveStatus } from "@/hooks/useAutoSave";
import { phFlowSubmittedForReview, phFlowStudioSession } from "@/lib/posthogEvents";

// Custom nodes
import InputNode from "@/components/flow/nodes/InputNode";
import BananaProNode from "@/components/flow/nodes/BananaProNode";
import KlingVideoNode from "@/components/flow/nodes/KlingVideoNode";
import ChatAiNode from "@/components/flow/nodes/ChatAiNode";
import RemoveBackgroundNode from "@/components/flow/nodes/RemoveBackgroundNode";
import TextInputNode from "@/components/flow/nodes/TextInputNode";
import OutputNode from "@/components/flow/nodes/OutputNode";
import Mp3InputNode from "@/components/flow/nodes/Mp3InputNode";
import MergeAudioNode from "@/components/flow/nodes/MergeAudioNode";
import SeedDanceNode from "@/components/flow/nodes/SeedDanceNode";
import SeedDreamNode from "@/components/flow/nodes/SeedDreamNode";
import AnimatedEdge from "@/components/flow/AnimatedEdge";
import NodePalette from "@/components/flow/NodePalette";
import { NODE_API_SCHEMA } from "@/components/flow/nodes/nodeApiSchema";

/* ─── Node type registry for React Flow ─── */
const nodeTypes = {
  inputNode: InputNode,
  textInputNode: TextInputNode,
  bananaProNode: BananaProNode,
  klingVideoNode: KlingVideoNode,
  chatAiNode: ChatAiNode,
  removeBackgroundNode: RemoveBackgroundNode,
  mp3InputNode: Mp3InputNode,
  mergeAudioNode: MergeAudioNode,
  seedDanceNode: SeedDanceNode,
  seedDreamNode: SeedDreamNode,
  outputNode: OutputNode,
};

/* ─── Graph JSON shape (ComfyUI-style) ─── */
export interface FlowGraphJSON {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }>;
}

/* ─── Default data per node type ─── */
const getDefaultData = (type: string, label: string): Record<string, unknown> => {
  switch (type) {
    case "inputNode":
      return {
        label,
        nodeName: label,
        fieldLabel: label.includes("Video") ? "Upload your video" : "Upload your image",
        fieldType: label.includes("Video") ? "video" : "image",
        required: true,
        accept: label.includes("Video") ? "video/*" : "image/*",
      };
    case "textInputNode":
      return {
        label,
        nodeName: label,
        fieldLabel: "Enter your text",
        textValue: "",
        placeholder: "Enter text value...",
      };
    case "bananaProNode":
    case "klingVideoNode":
    case "chatAiNode":
    case "removeBackgroundNode":
    case "seedDanceNode":
    case "seedDreamNode": {
      const schemaDef = NODE_API_SCHEMA[type];
      if (schemaDef) {
        const params: Record<string, unknown> = {};
        schemaDef.params.forEach((p) => { params[p.key] = p.default; });
        return { label, params, exposed: {} };
      }
      return { label, params: {}, exposed: {} };
    }
    case "chatAiNode": {
      const schema = NODE_API_SCHEMA.chatAiNode;
      const params: Record<string, unknown> = {};
      schema.params.forEach((p) => { params[p.key] = p.default; });
      return { label, params, exposed: {} };
    }
    case "outputNode":
      return { label, outputType: "video" };
    default:
      return { label };
  }
};

/* ═══════════════════════════════════
   FlowStudioInner — Canvas (needs ReactFlowProvider wrapper)
   ═══════════════════════════════════ */

const FlowStudioInner = () => {
  const { flowId } = useParams<{ flowId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const reactFlowInstance = useReactFlow();
  const edgeTypes = useMemo(() => ({ animated: AnimatedEdge }), []);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flowName, setFlowName] = useState("Untitled Flow");
  const [flowStatus, setFlowStatus] = useState("draft");
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const initializedRef = useRef(false);
  const flowWrapperRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const sessionStartRef = useRef(Date.now());

  // Track session duration on unmount
  useEffect(() => {
    return () => {
      const duration = Date.now() - sessionStartRef.current;
      if (flowId && flowId !== "new" && duration > 5000) {
        phFlowStudioSession({ flow_id: flowId, duration_ms: duration, node_count: nodes.length });
      }
    };
  }, []);

  /* ─── Load flow from DB ─── */
  const { data: flowRecord, isLoading } = useQuery({
    queryKey: ["flow", flowId],
    enabled: !!flowId && flowId !== "new" && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flows")
        .select("*")
        .eq("id", flowId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) { navigate("/app/flow-studio"); return null; }
      return data;
    },
  });

  /* ─── Refresh expired signed URLs for nodes with storagePath ─── */
  const refreshNodeSignedUrls = useCallback(
    async (nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }>) => {
      const refreshed = await Promise.all(
        nodes.map(async (n) => {
          const d = n.data as Record<string, unknown>;
          const storagePath = d.storagePath as string | undefined;
          if (!storagePath) return n;

          try {
            const { data: signedData } = await supabase.storage
              .from("ai-media")
              .createSignedUrl(storagePath, 60 * 60 * 24);

            if (signedData?.signedUrl) {
              return { ...n, data: { ...d, previewUrl: signedData.signedUrl } };
            }
          } catch {
            // keep existing previewUrl if refresh fails
          }
          return n;
        })
      );
      return refreshed;
    },
    []
  );

  /* ─── Initialize canvas from DB settings JSON ─── */
  useEffect(() => {
    if (initializedRef.current || !flowRecord) return;

    setIsCanvasReady(false);

    setFlowName(flowRecord.name);
    setFlowStatus(flowRecord.status);

    const settings = flowRecord.settings as Record<string, unknown> | null;
    const graph = settings?.graph as FlowGraphJSON | undefined;

    if (graph?.nodes && graph?.edges) {
      const rawNodes = graph.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data as Record<string, unknown>,
        // Output node is permanent — cannot be deleted
        ...(n.type === "outputNode" ? { deletable: false } : {}),
      }));

      // Self-heal: ensure exactly one outputNode exists
      const hasOutput = rawNodes.some((n) => n.type === "outputNode");
      if (!hasOutput) {
        rawNodes.push({
          id: crypto.randomUUID(),
          type: "outputNode",
          position: { x: 600, y: 200 },
          data: getDefaultData("outputNode", "Output"),
          deletable: false,
        });
      }

      // Set nodes immediately, then refresh signed URLs in background
      setNodes(rawNodes);
      setEdges(
        graph.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
          type: "animated",
        }))
      );

      // Refresh any expired signed URLs
      void refreshNodeSignedUrls(rawNodes).then((refreshedNodes) => {
        const refreshedNodeMap = new Map(refreshedNodes.map((node) => [node.id, node]));

        setNodes((prev) =>
          prev.map((node) => {
            const refreshedNode = refreshedNodeMap.get(node.id);
            if (!refreshedNode) return node;

            return {
              ...node,
              data: {
                ...node.data,
                ...(refreshedNode.data as Record<string, unknown>),
              },
            };
          })
        );
      });
    } else {
      // Brand-new flow with no graph yet — seed with a default Output node
      setNodes([
        {
          id: crypto.randomUUID(),
          type: "outputNode",
          position: { x: 600, y: 200 },
          data: getDefaultData("outputNode", "Output"),
          deletable: false,
        },
      ]);
      setEdges([]);
    }

    requestAnimationFrame(() => {
      initializedRef.current = true;
      setIsCanvasReady(true);
    });
  }, [flowRecord, navigate, refreshNodeSignedUrls]);

  /* ─── React Flow callbacks ─── */
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      // — Rule: Output node only accepts edges from AI Processing nodes (not inputNode)
      const targetNode = nodes.find((n) => n.id === connection.target);
      const sourceNode = nodes.find((n) => n.id === connection.source);
      if (targetNode?.type === "outputNode" && sourceNode?.type === "inputNode") {
        return;
      }

      setEdges((eds) => addEdge({ ...connection, type: "animated" }, eds));
    },
    [nodes, edges]
  );

  /* ─── Add node (click or drop) ─── */
  const addNode = useCallback((type: string, label: string, position?: { x: number; y: number }, overrides?: Record<string, unknown>) => {
    const id = crypto.randomUUID();
    const baseData = getDefaultData(type, label);
    const newNode: Node = {
      id,
      type,
      position: position ?? { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: overrides ? { ...baseData, ...overrides } : baseData,
    };
    setNodes((prev) => [...prev, newNode]);
  }, []);

  /* ─── Drop from palette OR external file ─── */
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files") ? "copy" : "move";
  }, []);

  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingFile(true);
    }
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDraggingFile(false);
    }
  }, []);

  const uploadAndCreateNode = useCallback(
    async (file: File, position: { x: number; y: number }) => {
      if (!user) {
        toast.error("Please log in to upload files");
        return;
      }
      const id = crypto.randomUUID();
      const name = file.name.replace(/\.[^.]+$/, "");
      const ext = file.name.split(".").pop() || "png";
      const storagePath = `${user.id}/${id}.${ext}`;
      const isVideo = file.type.startsWith("video/");
      const fieldType = isVideo ? "video" : "image";

      const localPreview = URL.createObjectURL(file);
      const newNode: Node = {
        id,
        type: "inputNode",
        position,
        data: {
          label: name || (isVideo ? "Creator Video" : "Creator Image"),
          nodeName: name || (isVideo ? "Creator Video" : "Creator Image"),
          fieldLabel: name || (isVideo ? "Pre-set video" : "Pre-set image"),
          fieldType,
          required: true,
          accept: isVideo ? "video/*" : "image/*",
          previewUrl: localPreview,
          fileName: file.name,
          uploading: true,
          creatorAsset: true,
        },
      };
      setNodes((prev) => [...prev, newNode]);

      const { error: uploadErr } = await supabase.storage
        .from("ai-media")
        .upload(storagePath, file, { contentType: file.type, upsert: true });

      if (uploadErr) {
        toast.error(`Upload failed: ${file.name}`);
        setNodes((prev) => prev.filter((n) => n.id !== id));
        URL.revokeObjectURL(localPreview);
        return;
      }

      const { data: signedData } = await supabase.storage
        .from("ai-media")
        .createSignedUrl(storagePath, 60 * 60 * 24);

      const finalUrl = signedData?.signedUrl || localPreview;

      setNodes((prev) =>
        prev.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  previewUrl: finalUrl,
                  storagePath,
                  uploading: false,
                },
              }
            : n
        )
      );
      URL.revokeObjectURL(localPreview);
    },
    [user]
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDraggingFile(false);

      const bounds = flowWrapperRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const mediaFiles = Array.from(files).filter(
          (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
        );
        if (mediaFiles.length > 0) {
          mediaFiles.forEach((file, i) => {
            uploadAndCreateNode(file, {
              x: position.x + i * 280,
              y: position.y,
            });
          });
          toast.success(`Uploading ${mediaFiles.length} file(s)...`);
          return;
        } else {
          toast.error("Only image and video files are supported");
          return;
        }
      }

      const type = e.dataTransfer.getData("application/reactflow-type");
      const label = e.dataTransfer.getData("application/reactflow-label");
      if (!type) return;

      let overrides: Record<string, unknown> | undefined;
      try {
        const raw = e.dataTransfer.getData("application/reactflow-overrides");
        if (raw) overrides = JSON.parse(raw);
      } catch { /* ignore */ }

      addNode(type, label, position, overrides);
    },
    [addNode, reactFlowInstance, uploadAndCreateNode]
  );

  /* ─── Delete selected nodes (output node is protected) ─── */
  const deleteSelectedNodes = useCallback(() => {
    setNodes((nds) => {
      const selectedIds = new Set(
        nds.filter((n) => n.selected && n.type !== "outputNode").map((n) => n.id)
      );
      if (selectedIds.size === 0) return nds;
      setEdges((eds) => eds.filter((e) => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
      return nds.filter((n) => !selectedIds.has(n.id));
    });
  }, []);

  /* ─── Build graph JSON ─── */
  const buildGraphJSON = useCallback((): FlowGraphJSON => {
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type || "inputNode",
        position: n.position,
        data: n.data as Record<string, unknown>,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      })),
    };
  }, [nodes, edges]);

  /* ─── Autosave data — only track serializable essentials ─── */
  const autosaveData = useMemo(() => ({
    name: flowName,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
  }), [flowName, nodes, edges]);

  const performSave = useCallback(async () => {
    if (!flowId || flowId === "new" || !user) return;

    // SAFETY: Don't save empty graph if we haven't initialized yet
    if (!initializedRef.current || !isCanvasReady) {
      console.warn("[FlowStudio] Blocked autosave: not yet initialized");
      return;
    }

    try {
      const graph = buildGraphJSON();

      const [{ data: freshFlow, error: flowFetchError }, { count: legacyNodeCount, error: legacyCountError }] = await Promise.all([
        supabase
          .from("flows")
          .select("settings")
          .eq("id", flowId)
          .maybeSingle(),
        supabase
          .from("flow_nodes")
          .select("id", { count: "exact", head: true })
          .eq("flow_id", flowId),
      ]);

      if (flowFetchError) throw flowFetchError;
      if (legacyCountError) throw legacyCountError;

      const existingSettings = (freshFlow?.settings as Record<string, unknown>) ?? {};
      const existingGraph = (existingSettings.graph as FlowGraphJSON | undefined) ?? undefined;
      const remoteGraphNodeCount = Array.isArray(existingGraph?.nodes) ? existingGraph.nodes.length : 0;

      if (graph.nodes.length === 0 && (remoteGraphNodeCount > 0 || (legacyNodeCount ?? 0) > 0)) {
        throw new Error("Blocked destructive save because the local canvas is empty while a saved flow still exists.");
      }

      const mergedSettings = { ...existingSettings, graph };

      const { error } = await supabase
        .from("flows")
        .update({
          name: flowName,
          settings: mergedSettings as unknown as import("@/integrations/supabase/types").Json,
        })
        .eq("id", flowId);

      if (error) throw error;

      toast.dismiss("flow-save-error");
      queryClient.invalidateQueries({ queryKey: ["flows"] });
      queryClient.invalidateQueries({ queryKey: ["flow", flowId] });
    } catch (error) {
      console.error("[FlowStudio] Save failed:", error);
      toast.error("⚠️ Failed to save flow! Please check your connection.", { id: "flow-save-error" });
      throw error;
    }
  }, [flowId, user, isCanvasReady, flowName, buildGraphJSON, queryClient]);

  const { status: autoSaveStatus, saveNow, resetSnapshot } = useAutoSave({
    data: autosaveData,
    onSave: performSave,
    delay: 1500,
    enabled: !!flowId && flowId !== "new" && !!user && isCanvasReady,
  });

  /* Reset snapshot after flow finishes loading */
  useEffect(() => {
    if (!isCanvasReady || !flowRecord) return;
    resetSnapshot();
  }, [isCanvasReady, flowRecord, resetSnapshot]);

  /* ─── Submit for review ─── */
  const handleSubmitForReview = useCallback(async () => {
    if (!flowId || flowId === "new" || !user) return;
    await saveNow();
    setIsSubmitting(true);
    try {
      const token = await getFreshToken();
      const res = await supabase.functions.invoke("submit-flow-for-review", {
        body: { flow_id: flowId },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error) throw res.error;
      setFlowStatus("submitted");
      phFlowSubmittedForReview(flowId);
      toast.success("Flow submitted for review!");
      queryClient.invalidateQueries({ queryKey: ["flows"] });
    } catch {
      toast.error("Failed to submit for review");
    } finally {
      setIsSubmitting(false);
    }
  }, [flowId, user, saveNow, queryClient]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "s") {
        e.preventDefault();
        saveNow();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelectedNodes();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveNow, deleteSelectedNodes]);

  const selectedCount = nodes.filter((n) => n.selected).length;

  /* ─── Status badge config ─── */
  const statusConfig: Record<string, { bg: string; border: string; text: string; label: string }> = {
    draft: { bg: "bg-white/10", border: "border-white/20", text: "text-white/60", label: "DRAFT" },
    submitted: { bg: "bg-[rgba(250,204,21,0.2)]", border: "border-[rgba(250,204,21,0.3)]", text: "text-[#facc15]", label: "SUBMITTED" },
    in_review: { bg: "bg-[rgba(96,165,250,0.2)]", border: "border-[rgba(96,165,250,0.3)]", text: "text-[#60a5fa]", label: "IN REVIEW" },
    published: { bg: "bg-[rgba(16,185,129,0.2)]", border: "border-[rgba(16,185,129,0.3)]", text: "text-[#34d399]", label: "PUBLISHED" },
    rejected: { bg: "bg-[rgba(239,68,68,0.2)]", border: "border-[rgba(239,68,68,0.3)]", text: "text-[#f87171]", label: "REJECTED" },
  };
  const sc = statusConfig[flowStatus] || statusConfig.draft;

  /* ─── Submit button config ─── */
  const isSubmitted = flowStatus === "submitted" || flowStatus === "in_review";
  const isPublished = flowStatus === "published";

  /* ─── Loading state ─── */
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "#020403" }}>
        <Loader2 className="w-8 h-8 animate-spin text-[#94a3b8]" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: "#020403" }}>
      {/* ━━━ HEADER — Top Navigation (56px) ━━━━━━━━━━━━━━━━━━━━━━ */}
      <header
        className="h-[56px] shrink-0 flex items-center justify-between px-6 backdrop-blur-md border-b"
        style={{ background: "rgba(2,4,3,0.9)", borderColor: "rgba(255,255,255,0.12)" }}
      >
        {/* Left: Back + Flow name */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/app/flow-studio")}
            className="flex items-center gap-2 text-[#94a3b8] hover:text-[#f8fafc] transition-colors"
          >
            <ArrowLeft className="w-[13px] h-[13px]" strokeWidth={2.5} />
            <span className="text-sm font-bold">Back</span>
          </button>
          <div className="h-4 w-px mx-2" style={{ background: "rgba(255,255,255,0.12)" }} />
          <div className="flex items-center gap-3">
            <Input
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="h-7 w-56 bg-transparent border-none text-sm font-bold text-white tracking-tight focus-visible:ring-0 px-0 font-prompt"
            />
            <span
              className={cn("text-[10px] font-semibold uppercase tracking-[1px] px-[11px] py-[3px] rounded-lg border", sc.bg, sc.border, sc.text)}
            >
              {sc.label}
            </span>
          </div>
        </div>

        {/* Right: Action buttons */}
        <div className="flex items-center gap-3">
          {selectedCount > 0 && (
            <button
              onClick={deleteSelectedNodes}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-semibold transition-colors"
              style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "#f87171" }}
            >
              <Trash2 className="w-[11px] h-[11px]" strokeWidth={2.5} />
              Delete ({selectedCount})
            </button>
          )}
          {/* AutoSave Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
            {!isCanvasReady && (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-[#94a3b8]" />
                <span className="text-[11px] font-medium text-[#94a3b8]">Loading canvas...</span>
              </>
            )}
            {isCanvasReady && autoSaveStatus === "saving" && (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-[#60a5fa]" />
                <span className="text-[11px] font-medium text-[#60a5fa]">Saving...</span>
              </>
            )}
            {isCanvasReady && autoSaveStatus === "saved" && (
              <>
                <Cloud className="w-3 h-3 text-[#34d399]" />
                <span className="text-[11px] font-medium text-[#34d399]">{t("flowSavedToCloud")}</span>
              </>
            )}
            {isCanvasReady && autoSaveStatus === "edited" && (
              <>
                <Pencil className="w-3 h-3 text-[#facc15]" />
                <span className="text-[11px] font-medium text-[#facc15]">{t("flowUnsavedChanges")}</span>
              </>
            )}
            {isCanvasReady && autoSaveStatus === "error" && (
              <>
                <CloudOff className="w-3 h-3 text-[#f87171]" />
                <span className="text-[11px] font-medium text-[#f87171]">{t("flowSaveFailed")}</span>
              </>
            )}
            {isCanvasReady && autoSaveStatus === "idle" && (
              <>
                <Cloud className="w-3 h-3 text-[#94a3b8]/50" />
                <span className="text-[11px] font-medium text-[#94a3b8]/50">{t("flowUpToDate")}</span>
              </>
            )}
          </div>
          <button
            onClick={() => navigate(`/play/${flowId}`)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-semibold text-[#f8fafc] hover:bg-white/5 transition-colors"
            style={{ borderColor: "rgba(255,255,255,0.12)" }}
          >
            <Play className="w-[13px] h-[9px]" strokeWidth={2.5} />
            Preview
          </button>
          {isSubmitted ? (
            <button
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold"
              style={{
                background: "rgba(16,185,129,0.2)",
                border: "1px solid rgba(16,185,129,0.3)",
                color: "#34d399",
                boxShadow: "0 10px 15px -3px rgba(16,185,129,0.1), 0 4px 6px -4px rgba(16,185,129,0.1)",
              }}
              disabled
            >
              <Check className="w-[10px] h-[10px]" strokeWidth={3} />
              Submitted
            </button>
          ) : isPublished ? (
            <button
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold"
              style={{
                background: "rgba(16,185,129,0.2)",
                border: "1px solid rgba(16,185,129,0.3)",
                color: "#34d399",
              }}
              disabled
            >
              <Check className="w-[10px] h-[10px]" strokeWidth={3} />
              Published
            </button>
          ) : (
            <button
              onClick={handleSubmitForReview}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white transition-colors disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, rgba(138,76,252,0.8), rgba(168,85,247,0.7))",
                border: "1px solid rgba(168,85,247,0.3)",
                boxShadow: "0 4px 16px rgba(138,76,252,0.25)",
              }}
            >
              <Upload className="w-[11px] h-[11px]" strokeWidth={2.5} />
              {isSubmitting ? "Submitting..." : "Submit"}
            </button>
          )}
        </div>
      </header>

      {/* ━━━ MAIN BODY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel — Node Palette */}
        {leftPanelOpen && (
          <NodePalette
            onAddNode={addNode}
            onCollapse={() => setLeftPanelOpen(false)}
          />
        )}

        {/* Center — Canvas */}
        <div
          className="flex-1 relative"
          ref={flowWrapperRef}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {/* Glow overlays */}
          <div className="absolute inset-0 pointer-events-none z-[1]" style={{ background: "radial-gradient(ellipse at 30% 20%, rgba(168,85,247,0.15), transparent 60%)" }} />
          <div className="absolute inset-0 pointer-events-none z-[1]" style={{ background: "radial-gradient(ellipse at 70% 80%, rgba(34,211,238,0.1), transparent 60%)" }} />

          {/* File drop overlay */}
          {isDraggingFile && (
            <div className="absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed rounded-lg pointer-events-none" style={{ background: "rgba(96,165,250,0.05)", borderColor: "rgba(96,165,250,0.4)" }}>
              <div className="flex flex-col items-center gap-2" style={{ color: "rgba(96,165,250,0.7)" }}>
                <ImagePlus className="w-10 h-10" />
                <span className="text-sm font-medium">Drop image or video to create Input Node</span>
              </div>
            </div>
          )}

          {!leftPanelOpen && (
            <button
              className="absolute left-2 top-2 z-10 h-7 w-7 flex items-center justify-center rounded-lg text-[#94a3b8] hover:text-white/70 backdrop-blur-xl border transition-colors"
              style={{ background: "rgba(8,9,11,0.8)", borderColor: "rgba(255,255,255,0.12)" }}
              onClick={() => setLeftPanelOpen(true)}
            >
              <PanelLeftClose className="w-3.5 h-3.5 rotate-180" />
            </button>
          )}

          <ReactFlow
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            defaultEdgeOptions={{ type: "animated" }}
            fitView
            fitViewOptions={{ padding: 0.4 }}
            proOptions={{ hideAttribution: true }}
            connectionLineStyle={{
              stroke: "rgba(168,85,247,0.4)",
              strokeWidth: 2,
            }}
            snapToGrid
            snapGrid={[15, 15]}
            deleteKeyCode={["Backspace", "Delete"]}
            edgesFocusable
            edgesReconnectable
            elevateEdgesOnSelect
            style={{ background: "#020403" }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="rgba(255,255,255,0.04)"
            />
            <Controls
              className="!rounded-2xl !overflow-hidden !backdrop-blur-xl !border [&_button]:!w-9 [&_button]:!h-9 [&_button]:!bg-transparent [&_button]:!border-b [&_button:last-child]:!border-b-0 [&_button]:!text-[#f8fafc] [&_button]:hover:!bg-white/5 [&_button]:!transition-colors [&_button_svg]:!fill-[#f8fafc]"
              style={{
                background: "rgba(8,9,11,0.9)",
                borderColor: "rgba(255,255,255,0.12)",
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              }}
              showInteractive={false}
            />
            <MiniMap
              className="!rounded-2xl !backdrop-blur-xl !border"
              style={{
                background: "rgba(8,9,11,0.8)",
                borderColor: "rgba(255,255,255,0.12)",
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
                width: 224,
                height: 144,
              }}
              nodeColor="rgba(255,255,255,0.1)"
              maskColor="rgba(2,4,3,0.9)"
              pannable
              zoomable
            />
            <Panel
              position="top-left"
              className="flex items-center gap-2 px-4 py-1.5 rounded-full backdrop-blur-md border"
              style={{ background: "rgba(8,9,11,0.6)", borderColor: "rgba(255,255,255,0.12)" }}
            >
              <Sparkles className="w-3 h-3 text-[#a855f7]" />
              <span className="text-[10px] font-semibold text-white">
                {nodes.length} nodes • {edges.length} edges
              </span>
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {/* ━━━ FOOTER — Bottom Status Bar (40px) ━━━━━━━━━━━━━━━━━━━ */}
      <footer
        className="h-10 shrink-0 flex items-center justify-between px-6 border-t"
        style={{ background: "#08090b", borderColor: "rgba(255,255,255,0.12)" }}
      >
        {/* Left: Status */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              !isCanvasReady
                ? "bg-[#94a3b8]"
                : autoSaveStatus === "error"
                  ? "bg-[#f87171]"
                  : autoSaveStatus === "edited" || autoSaveStatus === "saving"
                    ? "bg-[#facc15]"
                    : "bg-[#10b981]"
            )} />
            <span className="text-[11px] font-semibold text-[#94a3b8]">
              {!isCanvasReady
                ? t("flowLoadingCanvas")
                : autoSaveStatus === "saving"
                  ? t("flowSaving")
                  : autoSaveStatus === "edited"
                    ? t("flowUnsavedChanges")
                    : autoSaveStatus === "error"
                      ? t("flowSaveFailed")
                      : t("flowAutoSaveActive")}
            </span>
          </div>
          <div className="w-px h-3" style={{ background: "rgba(255,255,255,0.12)" }} />
          <span className="text-[11px] font-semibold text-[#94a3b8]">
            {nodes.length} nodes • {edges.length} edges active
          </span>
        </div>

        {/* Right: Shortcuts */}
        <div className="flex items-center gap-8">
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg border"
            style={{ background: "#12141a", borderColor: "rgba(255,255,255,0.12)" }}
          >
            <Save className="w-[10px] h-[10px] text-[#94a3b8]" strokeWidth={2.5} />
            <span className="text-[9px] font-medium text-[#94a3b8]">S</span>
            <span className="text-[11px] font-semibold text-[#94a3b8] pl-1">Save</span>
          </div>
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg border"
            style={{ background: "#12141a", borderColor: "rgba(255,255,255,0.12)" }}
          >
            <span className="text-[11px] font-medium text-[#94a3b8]/60">Del</span>
            <span className="text-[11px] font-semibold text-[#94a3b8] pl-1">Delete</span>
          </div>
          <span className="text-[11px] font-semibold text-[#94a3b8] opacity-70">
            Drag from palette or drop assets to build
          </span>
        </div>
      </footer>
    </div>
  );
};

/* ═══════════════════════════════════
   FlowStudio — Wrapper with ReactFlowProvider
   ═══════════════════════════════════ */

const FlowStudio = () => (
  <ReactFlowProvider>
    <FlowStudioInner />
  </ReactFlowProvider>
);

export default FlowStudio;
