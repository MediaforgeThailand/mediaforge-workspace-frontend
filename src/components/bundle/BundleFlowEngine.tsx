/**
 * BundleFlowEngine — A self-contained PlayFlow engine isolated for use inside Bundle pages.
 *
 * Each <BundleFlowEngine flowId=X /> instance owns its own state. The Bundle page
 * mounts engines per active flow and toggles slot rendering via `mode`.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { extractVideoDuration } from "@/hooks/useVideoDuration";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCredits } from "@/hooks/useCredits";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import QuickCheckoutModal from "@/components/QuickCheckoutModal";
import { phFlowExecuted, phFlowRunCompleted, phFlowRunFailed, phCreditBalanceZero } from "@/lib/posthogEvents";

import { POLL_INTERVAL_MS, MAX_POLL_DURATION_MS } from "@/pages/play-flow/constants";
import { extractFields, findActionNode, findAllActionNodes, buildNodeParams, normalizeExampleMedia, classifyPollResult, resolveOutputNodeResults } from "@/pages/play-flow/utils";
import { sanitizeGraphNodes } from "@/components/flow/nodes/nodeApiSchema";
import type { FlowGraph, ExecutionState } from "@/pages/play-flow/types";
import ConfigPanel from "@/pages/play-flow/ConfigPanel";
import MobileConfigDrawer from "@/pages/play-flow/MobileConfigDrawer";
import { useBackgroundExecutionStore } from "@/store/useBackgroundExecutionStore";
import { PreviewPane, type FlowResult } from "@/components/play/PreviewPane";
import type { RunGroup } from "@/components/play/ResultsView";
import { registerBundleRun, getBundleRunIds } from "@/lib/bundleRunRegistry";

export type BundleEngineMode = "config" | "preview" | "drawer";

export interface BundleFlowEngineProps {
  flowId: string;
  bundleId?: string;
  mode: BundleEngineMode;
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
  className?: string;
  onStateChange?: (state: { runGroups: RunGroup[]; isRunning: boolean; flowName?: string }) => void;
  /** Optional pre-fetched flow data (from parent's usePlayBundle) — bypasses internal query (avoids RLS issues for non-published flows in a bundle). */
  flowData?: any;
}

const BundleFlowEngine = ({
  flowId,
  bundleId,
  mode,
  drawerOpen,
  onDrawerOpenChange,
  className,
  onStateChange,
  flowData,
}: BundleFlowEngineProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { credits, refetch: refetchCredits } = useCredits();
  const addBackgroundTask = useBackgroundExecutionStore((s) => s.addTask);
  const failBackgroundTask = useBackgroundExecutionStore((s) => s.failTask);
  const completeBackgroundTask = useBackgroundExecutionStore((s) => s.completeTask);

  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [fileUploads, setFileUploads] = useState<Record<string, File | null>>({});
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});
  /** Extracted video durations (seconds, rounded up) keyed by nodeId */
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>({});
  const [executionState, setExecutionState] = useState<ExecutionState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultType, setResultType] = useState<"video" | "image" | "text">("video");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pollProgress, setPollProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showCreditsDialog, setShowCreditsDialog] = useState(false);
  const [requiredCredits, setRequiredCredits] = useState<number | undefined>();
  const [wasRefunded, setWasRefunded] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [lastCreditCost, setLastCreditCost] = useState(0);
  const [mobileConfigOpen, setMobileConfigOpen] = useState(false);

  // Local tab state — Bundle owns its own tab system; we only flip "results" internally to mirror PlayFlow auto-switch behavior.
  type LocalTab = "preview" | "results";
  const [activeTab, setActiveTabState] = useState<LocalTab>("preview");
  const setActiveTab = useCallback((tab: LocalTab) => {
    setActiveTabState(tab);
  }, []);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number>(0);
  const abortRef = useRef(false);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (executionState === "submitting" || executionState === "processing") {
      setElapsedSeconds(0);
      elapsedIntervalRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else {
      if (elapsedIntervalRef.current) { clearInterval(elapsedIntervalRef.current); elapsedIntervalRef.current = null; }
    }
    return () => { if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current); };
  }, [executionState]);

  /* ─── Fetch flow (skip when parent provided flowData) ─── */
  const { data: queriedFlow, isLoading: isLoadingQueried } = useQuery({
    queryKey: ["play-flow", flowId],
    enabled: !!flowId && !flowData,
    queryFn: async () => {
      const { data, error } = await supabase.from("flows").select("*").eq("id", flowId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const flow = flowData ?? queriedFlow;
  const isLoading = flowData ? false : isLoadingQueried;

  /* ─── Fetch creator info ─── */
  const { data: creator } = useQuery({
    queryKey: ["flow-creator", flow?.user_id],
    enabled: !!flow?.user_id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("display_name, avatar_url, creator_rank").eq("user_id", flow!.user_id).maybeSingle();
      return data;
    },
  });

  /* ─── Bundle context ─── */
  // bundleId is provided as a prop. Other flows in the bundle would be needed
  // for cross-flow run aggregation, but in the per-engine path we only care about
  // OUR flowId; the parent BundleResultsPanel aggregates across engines.
  const bundleFlowIds = useMemo<string[]>(() => [flowId], [flowId]);

  /* ─── Fetch historical completed runs ─── */
  // In bundle mode: query runs across all bundle flows, filtered by run IDs registered to this bundle.
  // In solo mode: query runs for the current flow only.
  const { data: historicalRuns, refetch: refetchHistory } = useQuery({
    queryKey: ["flow-history", bundleId ?? flowId, user?.id, bundleId ? bundleFlowIds.join(",") : null],
    enabled: !!user?.id && (bundleId ? bundleFlowIds.length > 0 : !!flowId),
    queryFn: async () => {
      let query = supabase
        .from("flow_runs")
        .select("id, status, outputs, credits_used, started_at, flow_id")
        .eq("user_id", user!.id)
        .eq("status", "completed")
        .order("started_at", { ascending: false })
        .limit(50);

      if (bundleId) {
        const registeredIds = getBundleRunIds(bundleId);
        if (registeredIds.length === 0) return [];
        query = query.in("flow_id", bundleFlowIds).in("id", registeredIds);
      } else {
        query = query.eq("flow_id", flowId!);
      }

      const { data } = await query;
      if (!data) return [];

      // Build flow_id → set of "terminal" node IDs (sources of edges that target an Output node).
      // Used to filter out intermediate-step outputs from the result list.
      const flowIdsToFetch = Array.from(new Set(data.map((r: any) => r.flow_id).filter(Boolean)));
      const terminalNodeMap = new Map<string, Set<string>>();
      if (flowIdsToFetch.length > 0) {
        const { data: flowsForGraph } = await supabase
          .from("flows")
          .select("id, settings")
          .in("id", flowIdsToFetch);
        for (const f of flowsForGraph ?? []) {
          const g = (f.settings as any)?.graph;
          const nodes = Array.isArray(g?.nodes) ? g.nodes : [];
          const edges = Array.isArray(g?.edges) ? g.edges : [];
          const outputIds = new Set(
            nodes.filter((n: any) => n?.type === "outputNode").map((n: any) => n.id),
          );
          const terminals = new Set<string>();
          for (const e of edges) if (outputIds.has(e?.target)) terminals.add(e.source);
          terminalNodeMap.set(f.id, terminals);
        }
      }

      const VIDEO_EXTS = /\.(mp4|webm|mov|m4v|avi)(\?|$)/i;

      return data.flatMap((r: any) => {
        const out = (r.outputs as Record<string, unknown> | null) ?? null;
        if (!out) return [];

        const collected: Array<{ id: string; type: "image" | "video"; url: string; label: string }> = [];
        const seen = new Set<string>();

        const pushResult = (value: unknown, typeHint?: unknown, label = "Output") => {
          if (typeof value !== "string" || !value || seen.has(value)) return;
          seen.add(value);

          const normalizedHint = typeof typeHint === "string" ? typeHint.toLowerCase() : "";
          const type: "image" | "video" =
            normalizedHint.includes("video") || VIDEO_EXTS.test(value) ? "video" : "image";

          collected.push({ id: `${r.id}-${collected.length}`, type, url: value, label });
        };

        const byNode = out.by_node;
        const hasByNode = byNode && typeof byNode === "object" && Object.keys(byNode).length > 0;

        // Skip root-level URLs when by_node is present — they duplicate one of the terminal outputs.
        if (!hasByNode) {
          pushResult(out.result_url, out.output_type, "Output");
          pushResult(out.video_url, "video", "Video");
          pushResult(out.image_url, "image", "Image");
        }

        const terminals = terminalNodeMap.get(r.flow_id);
        if (byNode && typeof byNode === "object") {
          for (const [nodeId, nodeData] of Object.entries(byNode as Record<string, unknown>)) {
            if (!nodeData || typeof nodeData !== "object") continue;
            // Only surface outputs from nodes that feed an Output node directly.
            if (terminals && terminals.size > 0 && !terminals.has(nodeId)) continue;

            const nodeRecord = nodeData as Record<string, unknown>;
            const nodeOutputs =
              nodeRecord.outputs && typeof nodeRecord.outputs === "object"
                ? (nodeRecord.outputs as Record<string, unknown>)
                : nodeRecord;

            pushResult(nodeRecord.result_url, nodeRecord.output_type, "Output");

            for (const [key, candidate] of Object.entries(nodeOutputs)) {
              if (!/^(result_url|video_url|image_url|output_)/.test(key)) continue;
              const hint = key.includes("video")
                ? "video"
                : key.includes("image")
                  ? "image"
                  : nodeRecord.output_type;
              pushResult(candidate, hint, key);
            }
          }
        }

        if (collected.length === 0) return [];

        return [{
          id: r.id,
          outputs: collected,
          createdAt: r.started_at,
          creditsUsed: r.credits_used || 0,
          status: r.status,
        }];
      });
    },
  });

  const graph = useMemo<FlowGraph | null>(() => {
    if (!flow) return null;
    const settings = flow.settings as Record<string, unknown> | null;
    return (settings?.graph as FlowGraph) ?? null;
  }, [flow]);

  const { inputs, exposed, textInputs } = useMemo(() => (graph ? extractFields(graph) : { inputs: [], exposed: [], textInputs: [] }), [graph]);
  const exampleOutputs = useMemo(() => normalizeExampleMedia(flow), [flow]);

  /* ─── Centralized pricing via quote-flow endpoint ─── */
  const [finalPrice, setFinalPrice] = useState(0);
  const [isPricing, setIsPricing] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const quoteAbortRef = useRef<AbortController | null>(null);
  const quoteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build all_node_params from exposed fields for accurate quoting
  const allNodeParamsForQuote = useMemo(() => {
    if (!graph) return undefined;
    const actionNodes = findAllActionNodes(graph);
    if (actionNodes.length === 0) return undefined;
    const paramOverrides: Record<string, Record<string, unknown>> = {};
    for (const field of exposed) {
      const fieldKey = `${field.nodeId}__${field.paramKey}`;
      const value = formValues[fieldKey] ?? field.defaultValue;
      if (!paramOverrides[field.nodeId]) paramOverrides[field.nodeId] = {};
      paramOverrides[field.nodeId][field.paramKey] = value;
    }
    const result: Record<string, Record<string, unknown>> = {};
    for (const { node } of actionNodes) {
      const baseParams = (node.data?.params as Record<string, unknown>) ?? {};
      const merged = { ...baseParams, ...(paramOverrides[node.id] ?? {}) };

      // Inject ref_video_duration for motion models (per_second pricing)
      const modelName = String(merged.model_name ?? "");
      if (modelName.includes("motion")) {
        const refVideoEdge = graph.edges?.find(
          (e: { target: string; targetHandle?: string }) => e.target === node.id && e.targetHandle === "ref_video"
        );
        if (refVideoEdge) {
          const sourceNodeId = refVideoEdge.source;
          const dur = videoDurations[sourceNodeId];
          if (dur) merged.ref_video_duration = dur;
        }
      }

      // Inject _has_ref_video for Omni models (video-ref pricing tier)
      const OMNI_SLUGS = ["kling-v3-omni"];
      if (OMNI_SLUGS.includes(modelName)) {
        const hasRefVideoEdge = graph.edges?.some(
          (e: { target: string; targetHandle?: string }) => e.target === node.id && e.targetHandle === "ref_video"
        );
        merged._has_ref_video = !!hasRefVideoEdge;
      }

      result[node.id] = merged;
    }
    return result;
  }, [graph, exposed, formValues, videoDurations]);

  useEffect(() => {
    if (!flowId || !graph || !user) { setFinalPrice(0); return; }

    // Debounce quote requests by 500ms
    if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
    quoteDebounceRef.current = setTimeout(async () => {
      if (quoteAbortRef.current) quoteAbortRef.current.abort();
      const controller = new AbortController();
      quoteAbortRef.current = controller;

      setIsPricing(true);
      setPricingError(null);
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) { setIsPricing(false); return; }

        const sanitizedNodes = sanitizeGraphNodes(graph.nodes);
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quote-flow`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            flow_id: flowId,
            graph_nodes: sanitizedNodes,
            all_node_params: allNodeParamsForQuote,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (res.status === 400 && body.code === "PRICING_CONFIG_MISSING") {
            setPricingError(body.error || "Pricing not configured for this model. Please contact support.");
            toast.error("Pricing not configured for this model. Please contact support.");
            setFinalPrice(0);
            return;
          }
          throw new Error(body.error || "Quote failed");
        }

        const quote = await res.json();
        setFinalPrice(quote.price ?? 0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.warn("[PlayFlow] quote-flow error, using 0:", err);
          setFinalPrice(0);
        }
      } finally {
        setIsPricing(false);
      }
    }, 500);

    return () => {
      if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
    };
  }, [flowId, graph, user, allNodeParamsForQuote]);

  const hasEnoughCredits = (credits?.balance ?? 0) >= finalPrice;

  /* ─── Handlers ─── */
  const updateValue = useCallback((key: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleFileSelect = useCallback((nodeId: string, file: File | null) => {
    setFileUploads((prev) => ({ ...prev, [nodeId]: file }));
    if (file) {
      const url = URL.createObjectURL(file);
      setFilePreviews((prev) => ({ ...prev, [nodeId]: url }));

      // Extract video duration for per_second pricing (motion models)
      if (file.type.startsWith("video/")) {
        extractVideoDuration(url)
          .then((dur) => setVideoDurations((prev) => ({ ...prev, [nodeId]: dur })))
          .catch(() => setVideoDurations((prev) => { const n = { ...prev }; delete n[nodeId]; return n; }));
      } else {
        setVideoDurations((prev) => { const n = { ...prev }; delete n[nodeId]; return n; });
      }
    } else {
      setFilePreviews((prev) => {
        const next = { ...prev };
        if (next[nodeId]) URL.revokeObjectURL(next[nodeId]);
        delete next[nodeId];
        return next;
      });
      setVideoDurations((prev) => { const n = { ...prev }; delete n[nodeId]; return n; });
    }
  }, []);

  const uploadFileToStorage = async (file: File, nodeId: string): Promise<string> => {
    if (!user) throw new Error("Not authenticated");
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/flow-inputs/${flowId}/${nodeId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("ai-media").upload(path, file, { contentType: file.type, upsert: true });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
    // Use signed URL since ai-media is a private bucket — external AI providers need accessible URLs
    const { data: signedData, error: signError } = await supabase.storage.from("ai-media").createSignedUrl(path, 3600);
    if (signError || !signedData?.signedUrl) throw new Error(`Failed to create signed URL: ${signError?.message}`);
    return signedData.signedUrl;
  };

  /* ─── Poll for async status ─── */
  /** Collected step outputs keyed by node ID, for Output node resolution */
  const stepOutputsByNodeIdRef = useRef<Record<string, Record<string, string>>>({});

  const pollStatus = useCallback(
    async (taskId: string, runId: string, creditCost: number, outputType: "video_url" | "image_url", sourceNodeId?: string) => {
      if (abortRef.current) return;
      const elapsed = Date.now() - pollStartRef.current;
      if (elapsed > MAX_POLL_DURATION_MS) {
        try {
          const { data: session } = await supabase.auth.getSession();
          const tkn = session?.session?.access_token;
          if (tkn && runId) {
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-flow-status`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${tkn}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
              body: JSON.stringify({ task_id: taskId, run_id: runId, credit_cost: creditCost, force_timeout: true }),
            });
          }
        } catch { /* best effort */ }
        setExecutionState("error");
        setWasRefunded(true);
        setErrorMessage(t("pfTimedOut"));
        return;
      }
      const progressPct = Math.min(90, 40 + (elapsed / (5 * 60 * 1000)) * 50);
      setPollProgress(progressPct);
      if (elapsed > 180000) setStatusMessage(t("pfAlmostThere"));
      else if (elapsed > 60000) setStatusMessage(t("pfStillGenerating"));

      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) throw new Error("Not authenticated");
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-flow-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ task_id: taskId, run_id: runId, credit_cost: creditCost }),
        });
        const result = await res.json();
        const classified = classifyPollResult(result, outputType, t("pfGenerationFailed"));
        if (classified.outcome === "succeed") {
          // Store outputs keyed by the ACTUAL source node ID (passed from caller)
          const resolvedNodeId = sourceNodeId || (() => {
            // Fallback: try to find the action node from the graph
            const actionNodes = graph ? findAllActionNodes(graph) : [];
            return actionNodes.length > 0 ? actionNodes[actionNodes.length - 1].node.id : "unknown";
          })();

          if (classified.outputs) {
            stepOutputsByNodeIdRef.current[resolvedNodeId] = {
              ...(stepOutputsByNodeIdRef.current[resolvedNodeId] || {}),
              ...classified.outputs,
              result_url: classified.resultUrl,
            };
          }

          // NOW resolve Output nodes — polling is done, we have real URLs
          if (graph) {
            const outputNodeResults = resolveOutputNodeResults(
              graph,
              stepOutputsByNodeIdRef.current,
              { ...(classified.outputs || {}), result_url: classified.resultUrl },
            );

            if (outputNodeResults.length > 0) {
              setResultHistory((prev) => {
                const newItems = outputNodeResults
                  .filter((r) => !prev.some((p) => p.url === r.url))
                  .map((r) => ({ url: r.url, type: r.type }));
                return [...prev, ...newItems];
              });
              setResultUrl(outputNodeResults[0].url);
              setResultType(outputNodeResults[0].type);
            } else {
              setResultUrl(classified.resultUrl);
              setResultType(classified.resultType);
            }
          } else {
            setResultUrl(classified.resultUrl);
            setResultType(classified.resultType);
          }

          setPollProgress(100);
          setExecutionState("done");
          setStatusMessage(t("pfGenerationCompleteMsg"));
          setLastRunId(runId || null);
          setLastCreditCost(creditCost || 0);
          setReviewed(false);
          refetchCredits();
          phFlowRunCompleted({ flow_id: flowId!, run_id: runId || "", duration_ms: Date.now() - (pollStartRef.current || Date.now()), output_type: outputType });
          toast.success(t("pfGenerationCompleteMsg"));
        } else if (classified.outcome === "failed") {
          setExecutionState("error");
          setWasRefunded(classified.wasRefunded);
          setErrorMessage(classified.error);
          phFlowRunFailed({ flow_id: flowId!, run_id: runId || "", error: classified.error || "Unknown", refunded: classified.wasRefunded });
        } else {
          pollTimerRef.current = setTimeout(() => pollStatus(taskId, runId, creditCost, outputType, sourceNodeId), POLL_INTERVAL_MS);
        }
      } catch (err) {
        console.error("[PlayFlow] Poll error:", err);
        pollTimerRef.current = setTimeout(() => pollStatus(taskId, runId, creditCost, outputType, sourceNodeId), POLL_INTERVAL_MS);
      }
    },
    [refetchCredits, graph],
  );

  /* ─── Recovery helper: check DB if step completed despite HTTP timeout ─── */
  const recoverStepFromDB = useCallback(async (
    executionId: string,
    stepIndex: number,
  ): Promise<{ node_id?: string; result_url?: string; outputs?: Record<string, string>; task_id?: string; is_async?: boolean; output_type?: string; status?: string } | null> => {
    // Wait a moment for the DB write to settle (the edge function may still be writing)
    await new Promise((r) => setTimeout(r, 3000));
    // Poll up to 3 times with 3s intervals
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: exec } = await supabase
        .from("pipeline_executions")
        .select("step_results, status")
        .eq("id", executionId)
        .maybeSingle();
      if (!exec) return null;
      if (exec.status === "failed" || exec.status === "failed_refunded") return null;
      const results = (exec.step_results ?? []) as Array<Record<string, unknown>>;
      const stepResult = results.find((r) => r.step_index === stepIndex);
      if (stepResult && (stepResult.status === "completed" || stepResult.status === "running")) {
        console.log(`[PlayFlow] Recovered step ${stepIndex} from DB (status=${stepResult.status})`);
        return {
          node_id: stepResult.node_id as string | undefined,
          result_url: stepResult.result_url as string | undefined,
          outputs: stepResult.outputs as Record<string, string> | undefined,
          task_id: stepResult.task_id as string | undefined,
          is_async: !!(stepResult.task_id),
          output_type: stepResult.output_type as string | undefined,
          status: stepResult.status as string,
        };
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
    }
    return null;
  }, []);

  /* ─── Pipeline step executor (for multi-node flows) ─── */
  const executePipelineSteps = useCallback(async (
    token: string,
    executionId: string,
    totalSteps: number,
    pipelineInfo: Array<{ step: number; node_id?: string; node_type: string; is_async: boolean; output_type: string }>,
    runId: string,
    creditCost: number,
  ) => {
    // Reset step outputs tracker
    stepOutputsByNodeIdRef.current = {};

    for (let step = 0; step < totalSteps; step++) {
      if (abortRef.current) return;

      const stepInfo = pipelineInfo[step];
      const isLastStep = step === totalSteps - 1;
      const progressBase = 20 + (step / totalSteps) * 60;
      setStatusMessage(t("pfProcessingStep", { step: step + 1, total: totalSteps }));
      setPollProgress(progressBase);

      let stepRes: Response;
      try {
        stepRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/execute-pipeline-step`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ execution_id: executionId, step_index: step }),
        });
      } catch (networkErr) {
        // Network error / 504 timeout — check if the step actually completed in the DB
        console.warn(`[PlayFlow] Step ${step} fetch failed (likely 504), checking DB for recovery...`, networkErr);
        const recovered = await recoverStepFromDB(executionId, step);
        if (recovered) {
          // Step completed despite timeout — continue pipeline
          const stepNodeId = recovered.node_id || stepInfo?.node_id || `step_${step}`;
          if (recovered.outputs) {
            stepOutputsByNodeIdRef.current[stepNodeId] = { ...stepOutputsByNodeIdRef.current[stepNodeId], ...recovered.outputs };
          }
          if (recovered.result_url) {
            stepOutputsByNodeIdRef.current[stepNodeId] = { ...stepOutputsByNodeIdRef.current[stepNodeId], result_url: recovered.result_url };
          }
          if (recovered.is_async && recovered.task_id) {
            if (isLastStep) {
              setExecutionState("processing");
              setStatusMessage(t("pfAiGenerating"));
              pollStartRef.current = Date.now();
              pollTimerRef.current = setTimeout(() => pollStatus(recovered.task_id!, runId, creditCost, (recovered.output_type || "video_url") as "image_url" | "video_url", stepNodeId), POLL_INTERVAL_MS);
              return;
            }
          } else if (isLastStep) {
            finalizePipelineResults(runId, creditCost, recovered as Record<string, unknown>);
            return;
          }
          continue; // Non-last step succeeded, proceed to next
        }
        throw new Error(t("pfStepTimeout", { step: step + 1 }));
      }

      if (!stepRes.ok) {
        const errBody = await stepRes.json().catch(() => ({}));
        setWasRefunded(!!errBody.refunded);
        throw new Error(errBody.error || `Step ${step + 1} failed`);
      }

      const stepData = await stepRes.json();
      const stepNodeId = stepData.node_id || stepInfo?.node_id || `step_${step}`;

      // Store step outputs by node ID for Output node resolution later
      if (stepData.outputs) {
        stepOutputsByNodeIdRef.current[stepNodeId] = {
          ...(stepOutputsByNodeIdRef.current[stepNodeId] || {}),
          ...stepData.outputs,
        };
      }
      if (stepData.result_url) {
        stepOutputsByNodeIdRef.current[stepNodeId] = {
          ...(stepOutputsByNodeIdRef.current[stepNodeId] || {}),
          result_url: stepData.result_url,
        };
      }

      if (stepData.is_async && stepData.task_id) {
        if (isLastStep) {
          // Last async step — pollStatus will handle Output node resolution
          setExecutionState("processing");
          setStatusMessage(t("pfAiGenerating"));
          setPollProgress(progressBase + 10);
          pollStartRef.current = Date.now();
          pollTimerRef.current = setTimeout(
            () => pollStatus(stepData.task_id, runId, creditCost, stepData.output_type || "video_url", stepNodeId),
            POLL_INTERVAL_MS,
          );
          return;
        } else {
          setStatusMessage(t("pfStepWaiting", { step: step + 1, total: totalSteps }));
          const asyncResult = await pollStepUntilDone(token, stepData.task_id, runId, creditCost, stepNodeId);
          if (!asyncResult) {
            throw new Error(t("pfStepTimeout", { step: step + 1 }));
          }
        }
      } else if (stepData.status === "completed") {
        if (isLastStep) {
          // All steps done — resolve Output nodes from graph
          finalizePipelineResults(runId, creditCost, stepData);
          return;
        }
      }
    }

    // Edge case fallback
    finalizePipelineResults(runId, creditCost, null);
  }, [pollStatus, refetchCredits, t, graph]);

  /** Resolve Output nodes and display results after all pipeline steps complete */
  const finalizePipelineResults = useCallback((runId: string, creditCost: number, lastStepData: Record<string, unknown> | null) => {
    if (graph) {
      const flatOutputs = lastStepData?.result_url
        ? { result_url: lastStepData.result_url as string }
        : undefined;

      const outputNodeResults = resolveOutputNodeResults(
        graph,
        stepOutputsByNodeIdRef.current,
        flatOutputs,
      );

      if (outputNodeResults.length > 0) {
        setResultHistory((prev) => {
          const newItems = outputNodeResults
            .filter((r) => !prev.some((p) => p.url === r.url))
            .map((r) => ({ url: r.url, type: r.type }));
          return [...prev, ...newItems];
        });
        setResultUrl(outputNodeResults[0].url);
        setResultType(outputNodeResults[0].type);
      } else if (lastStepData?.result_url) {
        // Fallback: no Output nodes in graph, use last step result
        const rt: "video" | "image" | "text" =
          lastStepData.output_type === "image_url" ? "image" :
          lastStepData.output_type === "text" ? "text" : "video";
        setResultUrl(lastStepData.result_url as string);
        setResultType(rt);
      }
    } else if (lastStepData?.result_url) {
      const url = lastStepData.result_url as string;
      const isVideo = /\.(mp4|webm|mov|m4v|avi)(\?|$)/i.test(url);
      setResultUrl(url);
      setResultType(isVideo ? "video" : "image");
    }

    setPollProgress(100);
    setExecutionState("done");
    setStatusMessage(t("pfGenerationCompleteMsg"));
    setLastRunId(runId || null);
    setLastCreditCost(creditCost || 0);
    setReviewed(false);
    refetchCredits();
    toast.success(t("pfGenerationCompleteMsg"));
  }, [graph, refetchCredits, t]);

  /* ─── Poll an intermediate async step until completion ─── */
  const pollStepUntilDone = async (
    token: string,
    taskId: string,
    runId: string,
    creditCost: number,
    nodeId: string,
  ): Promise<boolean> => {
    const maxWait = 5 * 60 * 1000; // 5 minutes
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      if (abortRef.current) return false;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-flow-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ task_id: taskId, run_id: runId, credit_cost: creditCost }),
        });
        const result = await res.json();
        if (result.status === "succeed") {
          // Capture the REAL outputs from polling into stepOutputsByNodeIdRef
          if (result.outputs) {
            stepOutputsByNodeIdRef.current[nodeId] = {
              ...(stepOutputsByNodeIdRef.current[nodeId] || {}),
              ...result.outputs,
            };
          }
          if (result.result_url) {
            stepOutputsByNodeIdRef.current[nodeId] = {
              ...(stepOutputsByNodeIdRef.current[nodeId] || {}),
              result_url: result.result_url,
            };
          }
          return true;
        }
        if (result.status === "failed" || result.status === "failed_refunded") return false;
      } catch (err) {
        console.error("[PlayFlow] Step poll error:", err);
      }
    }
    return false;
  };

  /* ─── Submit flow ─── */
  const handleSubmit = useCallback(async () => {
    if (!flowId || !graph || !user) {
      toast.error(t("pfMissingData"));
      return;
    }
    if (!hasEnoughCredits) {
      phCreditBalanceZero();
      setShowCreditsDialog(true);
      setRequiredCredits(finalPrice);
      return;
    }

    const actionResult = findActionNode(graph);
    if (!actionResult) {
      toast.error(t("pfNoActionNode"));
      return;
    }
    const { node: actionNode, providerInfo } = actionResult;

    abortRef.current = false;
    setExecutionState("submitting");
    setStatusMessage(t("pfPreparing"));
    setResultUrl(null);
    setErrorMessage(null);
    setPollProgress(10);
    setWasRefunded(false);

    // ── EARLY OPTIMISTIC TASK ── Add immediately so it survives navigation
    // (e.g. user clicks Generate then navigates to /app/assets while upload is in progress)
    const optimisticRunId = crypto.randomUUID();
    // Tag this run as belonging to the current bundle (if any) so the
    // ResultsPanel can aggregate outputs across all flows in the bundle.
    if (bundleId) registerBundleRun(bundleId, optimisticRunId);
    addBackgroundTask({
      runId: optimisticRunId,
      flowId: flowId!,
      flowName: flow?.name || "Flow",
      status: "processing",
      outputType: providerInfo.output_type,
      startedAt: Date.now(),
    });

    try {
      const inputUrls: Record<string, string> = {};
      for (const inp of inputs) {
        const file = fileUploads[inp.nodeId];
        if (file) {
          setStatusMessage(t("pfUploading", { name: file.name }));
          inputUrls[inp.nodeId] = await uploadFileToStorage(file, inp.nodeId);
        }
      }

      const paramOverrides: Record<string, Record<string, unknown>> = {};
      for (const field of exposed) {
        const fieldKey = `${field.nodeId}__${field.paramKey}`;
        const value = formValues[fieldKey] ?? field.defaultValue;
        if (!paramOverrides[field.nodeId]) paramOverrides[field.nodeId] = {};
        paramOverrides[field.nodeId][field.paramKey] = value;
      }

      const nodeParams = buildNodeParams(actionNode, paramOverrides);

      // Inject ref_video_duration for motion models into nodeParams
      const actionModelName = String(nodeParams.model_name ?? "");
      if (actionModelName.includes("motion")) {
        const refVideoEdge = graph.edges?.find(
          (e: { target: string; targetHandle?: string }) => e.target === actionNode.id && e.targetHandle === "ref_video"
        );
        if (refVideoEdge) {
          const dur = videoDurations[refVideoEdge.source];
          if (dur) nodeParams.ref_video_duration = dur;
        }
      }

      // Build params for ALL action nodes (for multi-node pipeline)
      const allActionNodes = findAllActionNodes(graph);
      const allNodeParams: Record<string, Record<string, unknown>> = {};
      for (const { node } of allActionNodes) {
        const params = buildNodeParams(node, paramOverrides);
        const mn = String(params.model_name ?? "");
        if (mn.includes("motion")) {
          const edge = graph.edges?.find(
            (e: { target: string; targetHandle?: string }) => e.target === node.id && e.targetHandle === "ref_video"
          );
          if (edge) {
            const dur = videoDurations[edge.source];
            if (dur) params.ref_video_duration = dur;
          }
        }
        allNodeParams[node.id] = params;
      }

      setStatusMessage(t("pfStarting"));
      setPollProgress(25);

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      // ── Pre-flight payload sanitization ──
      const sanitizedNodes = sanitizeGraphNodes(graph.nodes);

      // ── Inject user-entered TextInputNode values into graph_nodes ──
      for (const ti of textInputs) {
        const fieldKey = `__textinput__${ti.nodeId}`;
        const userValue = formValues[fieldKey] ?? ti.defaultValue;
        const node = sanitizedNodes.find((n: { id: string }) => n.id === ti.nodeId);
        if (node) {
          node.data = { ...node.data, textValue: String(userValue ?? "") };
        }
      }

      console.log("[PlayFlow] Sanitized Payload:", JSON.stringify(sanitizedNodes, null, 2));

      // ── OPTIMISTIC UI: optimisticRunId already added before upload — pass to backend ──
      console.log("[PlayFlow] Using optimistic run ID:", optimisticRunId);

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-flow-init`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({
          flow_id: flowId,
          run_id: optimisticRunId,
          node_type: actionNode.type,
          provider: providerInfo.provider,
          is_async: providerInfo.is_async,
          output_type: providerInfo.output_type,
          input_urls: inputUrls,
          params: nodeParams,
          all_node_params: allNodeParams,
          graph_nodes: sanitizedNodes,
          graph_edges: graph.edges,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        // Remove the optimistic task on immediate failure
        failBackgroundTask(optimisticRunId, { refunded: true, errorMessage: errBody.error || `Server error ${res.status}` });
        throw new Error(errBody.error || `Server error ${res.status}`);
      }

      const initData = await res.json();

      // Handled provider failure (e.g. "No image was generated") — refund already issued server-side.
      // Edge function returns 200 with { handled: true, error, refunded } so the SDK doesn't throw.
      if (initData?.handled && initData?.error) {
        const handledRunId = optimisticRunId || initData.run_id;
        if (handledRunId) failBackgroundTask(handledRunId, { refunded: !!initData.refunded, errorMessage: initData.error });
        setExecutionState("idle");
        setErrorMessage(initData.error);
        setWasRefunded(!!initData.refunded);
        toast.error(initData.error);
        await refetchCredits();
        phFlowRunFailed({ flow_id: flowId!, run_id: handledRunId || "", error: initData.error, refunded: !!initData.refunded });
        return;
      }

      const { task_id, credit_cost, result_url, output_type, status, execution_id, total_steps, pipeline } = initData;

      // ── Robust ID extraction — prefer optimistic ID, fallback to server response ──
      const run_id = optimisticRunId || initData.run_id || initData.id || initData.runId;
      console.log("[PlayFlow] run-flow-init response:", { status, run_id, task_id, execution_id, keys: Object.keys(initData) });
      phFlowExecuted(flowId!, { cost_credits: credit_cost, provider: providerInfo.provider });

      if (initData.simulated && status === "failed_refunded") {
        toast.info(t("pfSimulatedFailure"), { duration: 6000 });
        setExecutionState("idle");
        return;
      }

      // ── MULTI-NODE PIPELINE: drive steps from frontend ───
      if (status === "pipeline_created" && execution_id && total_steps > 0) {
        setExecutionState("processing");
        setStatusMessage(t("pfProcessingStep", { step: 1, total: total_steps }));
        setPollProgress(20);
        pollStartRef.current = Date.now();
        // Update optimistic task with credit_cost from server
        addBackgroundTask({
          runId: run_id,
          flowId: flowId!,
          flowName: flow?.name || "Flow",
          status: "processing",
          creditCost: credit_cost,
          startedAt: Date.now(),
        });

        try {
          await executePipelineSteps(token!, execution_id, total_steps, pipeline || [], run_id, credit_cost);
        } catch (pipeErr) {
          console.error("[PlayFlow] Pipeline error:", pipeErr);
          setExecutionState("error");
          setErrorMessage(pipeErr instanceof Error ? pipeErr.message : "Pipeline execution failed");
          setWasRefunded(true);
          if (run_id) failBackgroundTask(run_id, { refunded: true, errorMessage: pipeErr instanceof Error ? pipeErr.message : "Pipeline failed" });
        }
        return;
      }

      if (status === "completed" && result_url) {
        const rt: "video" | "image" | "text" = output_type === "image_url" ? "image" : output_type === "text" ? "text" : "video";
        if (graph) {
          const actionNodeId = actionNode.id;
          const nodeOutputs: Record<string, string> = { result_url };
          if (initData.outputs && typeof initData.outputs === "object") {
            Object.assign(nodeOutputs, initData.outputs);
          }
          stepOutputsByNodeIdRef.current = { [actionNodeId]: nodeOutputs };
          const outputNodeResults = resolveOutputNodeResults(graph, stepOutputsByNodeIdRef.current, nodeOutputs);
          if (outputNodeResults.length > 0) {
            setResultHistory(outputNodeResults.map((r) => ({ url: r.url, type: r.type })));
            setResultUrl(outputNodeResults[0].url);
            setResultType(outputNodeResults[0].type);
          } else {
            setResultUrl(result_url);
            setResultType(rt);
          }
        } else {
          setResultUrl(result_url);
          setResultType(rt);
        }
        setPollProgress(100);
        setExecutionState("done");
        setStatusMessage(t("pfGenerationCompleteMsg"));
        setLastRunId(run_id || null);
        setLastCreditCost(credit_cost || 0);
        setReviewed(false);
        // Mark optimistic background task as completed (sync-completion path)
        if (run_id) completeBackgroundTask(run_id);
        refetchCredits();
        phFlowRunCompleted({ flow_id: flowId!, run_id: run_id || "", output_type });
        toast.success(t("pfGenerationCompleteMsg"));
      } else if (task_id || run_id) {
        setExecutionState("processing");
        setStatusMessage(t("pfAiGenerating"));
        setPollProgress(40);
        pollStartRef.current = Date.now();
        // Update optimistic task with task_id and credit_cost from server
        addBackgroundTask({
          runId: run_id,
          flowId: flowId!,
          flowName: flow?.name || "Flow",
          status: "processing",
          taskId: task_id,
          outputType: output_type || providerInfo.output_type,
          creditCost: credit_cost,
          startedAt: Date.now(),
        });
        if (task_id) {
          pollTimerRef.current = setTimeout(() => pollStatus(task_id, run_id, credit_cost, output_type || providerInfo.output_type), POLL_INTERVAL_MS);
        }
      } else {
        console.warn("[PlayFlow] Unexpected response — no task_id or run_id:", initData);
        throw new Error(t("pfUnexpectedResponse"));
      }
    } catch (err) {
      console.error("[PlayFlow] Submit error:", err);
      setExecutionState("error");
      const errMsg = err instanceof Error ? err.message : "An unexpected error occurred";
      setErrorMessage(errMsg);
      phFlowRunFailed({ flow_id: flowId!, run_id: "", error: errMsg, refunded: false });
      toast.error(err instanceof Error ? err.message : t("pfFailedToStart"));
    }
  }, [flowId, graph, inputs, exposed, fileUploads, formValues, videoDurations, pollStatus, refetchCredits, user, hasEnoughCredits, finalPrice]);

  const resetExecution = useCallback(() => {
    abortRef.current = true;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setExecutionState("idle");
    setResultUrl(null);
    setErrorMessage(null);
    setPollProgress(0);
    setWasRefunded(false);
    setElapsedSeconds(0);
    setResultHistory([]);
    stepOutputsByNodeIdRef.current = {};
  }, []);

  /* ─── Result history for gallery ─── */
  const [resultHistory, setResultHistory] = useState<Array<{ url: string; type: "video" | "image" | "text" }>>([]);

  useEffect(() => {
    if (executionState === "done" && resultUrl) {
      setResultHistory((prev) => {
        if (prev.some((r) => r.url === resultUrl)) return prev;
        return [...prev, { url: resultUrl, type: resultType }];
      });
      setActiveTab("results");
      refetchHistory();
    }
  }, [executionState, resultUrl, resultType, setActiveTab, refetchHistory]);

  const displayResults = useMemo(() => {
    const seen = new Set<string>();

    const liveResults = resultHistory
      .filter((r) => r.type !== "text" && !!r.url)
      .map((r, i) => ({
        id: `live-${i}`,
        url: r.url,
        type: r.type as "video" | "image",
        createdAt: new Date().toISOString(),
      }));

    // historicalRuns is already a flattened array of { id, type, url, label }
    const historicalResults = (historicalRuns ?? []).map((item: any) => ({
      id: item.id,
      url: item.url,
      type: item.type as "video" | "image",
      createdAt: item.createdAt ?? new Date(0).toISOString(),
    }));

    return [...liveResults, ...historicalResults].filter((item) => {
      if (!item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }, [historicalRuns, resultHistory]);

  /* ─── Group results by run for the new ResultsView ─── */
  const runGroups = useMemo(() => {
    const groups: Array<{
      id: string;
      createdAt: string;
      creditsUsed?: number;
      prompt?: string;
      outputs: Array<{ id: string; url: string; type?: "image" | "video" }>;
      meta?: { tags?: string[]; categories?: string[]; dimensions?: string };
    }> = [];

    // Derive category labels from flow.categories (fallback to tags)
    const categories = Array.isArray(flow?.categories)
      ? (flow!.categories as string[]).slice(0, 3)
      : Array.isArray((flow as Record<string, unknown> | null)?.tags)
        ? ((flow as Record<string, unknown>).tags as string[]).slice(0, 3)
        : undefined;

    // Surface the configured aspect/dimensions from the first action node
    let dimensions: string | undefined;
    if (graph) {
      const actionNodes = findAllActionNodes(graph);
      const first = actionNodes[0]?.node;
      const params = (first?.data?.params as Record<string, unknown> | undefined) ?? undefined;
      const aspect = (params?.aspect_ratio ?? params?.aspectRatio) as string | undefined;
      const width = params?.width as number | string | undefined;
      const height = params?.height as number | string | undefined;
      if (width && height) dimensions = `${width}×${height}`;
      else if (aspect) dimensions = String(aspect);
    }

    // Live "Just now" group from current session resultHistory
    const liveOutputs = resultHistory
      .filter((r) => r.type !== "text" && !!r.url)
      .map((r, i) => ({ id: `live-${i}`, url: r.url, type: r.type as "image" | "video" }));
    if (liveOutputs.length > 0) {
      groups.push({
        id: `live-${liveOutputs[0]?.url ?? "now"}`,
        createdAt: new Date().toISOString(),
        creditsUsed: lastCreditCost ?? undefined,
        outputs: liveOutputs,
        meta: { categories, dimensions },
      });
    }

    // Historical run groups
    for (const run of (historicalRuns ?? []) as Array<{
      id: string;
      outputs: Array<{ id: string; url: string; type: "image" | "video" }>;
      createdAt: string;
      creditsUsed?: number;
    }>) {
      if (!run.outputs?.length) continue;
      groups.push({
        id: run.id,
        createdAt: run.createdAt,
        creditsUsed: run.creditsUsed,
        outputs: run.outputs.map((o) => ({ id: o.id, url: o.url, type: o.type })),
        meta: { categories, dimensions },
      });
    }

    return groups;
  }, [historicalRuns, resultHistory, lastCreditCost, flow, graph]);

  const isRunning = executionState === "submitting" || executionState === "processing";

  /* ─── Bubble state up to parent for shared results aggregation ─── */
  useEffect(() => {
    onStateChange?.({ runGroups, isRunning, flowName: flow?.name });
  }, [runGroups, isRunning, flow?.name, onStateChange]);

  /* ─── Loading skeleton ─── */
  if (isLoading) {
    return (
      <div className={className ?? "w-full h-full"}>
        <div className="w-full h-full flex items-center justify-center p-6">
          <Skeleton className="w-full h-full rounded-[20px] bg-white/5" />
        </div>
      </div>
    );
  }

  if (!flow || !graph) {
    const reason = !flow
      ? "Flow นี้ยังไม่เผยแพร่ (อยู่ในสถานะ Draft/Submitted) — ไม่สามารถเรียกใช้งานในบันเดิลสาธารณะได้"
      : "Flow นี้ยังไม่มีการตั้งค่า กรุณาเปิดใน Flow Studio เพื่อเพิ่ม nodes";
    return (
      <div className={className ?? "w-full h-full"}>
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-white/55" />
          </div>
          <p className="text-white/70 text-sm max-w-[280px] leading-relaxed">{reason}</p>
          <p className="text-white/40 text-xs">เลือก flow อื่นในบันเดิล →</p>
        </div>
      </div>
    );
  }


  const previewResults: FlowResult[] = displayResults.map((r) => ({
    id: r.id,
    url: r.url,
    createdAt: r.createdAt,
  }));
  const examplePreviewResults: FlowResult[] = exampleOutputs.map((item, i) => ({
    id: `example-${i}`,
    url: item.url,
    createdAt: new Date().toISOString(),
  }));

  /* ─── Slot-based render ─── */
  if (mode === "config") {
    return (
      <div className={className} data-bundle-config-host="true">
        <ConfigPanel
          inputs={inputs}
          exposed={exposed}
          textInputs={textInputs}
          formValues={formValues}
          fileUploads={fileUploads}
          filePreviews={filePreviews}
          executionState={executionState}
          statusMessage={statusMessage}
          pollProgress={pollProgress}
          elapsedSeconds={elapsedSeconds}
          resultUrl={resultUrl}
          resultType={resultType}
          resultHistory={resultHistory}
          errorMessage={errorMessage}
          wasRefunded={wasRefunded}
          flowName={flow.name}
          creditsBalance={credits?.balance ?? 0}
          finalPrice={finalPrice}
          hasEnoughCredits={hasEnoughCredits}
          isRunning={isRunning}
          isPricing={isPricing}
          pricingError={pricingError}
          lastRunId={lastRunId}
          lastCreditCost={lastCreditCost}
          reviewed={reviewed}
          setupInstructions={((flow.settings as Record<string, unknown>)?.setup_instructions as string) ?? undefined}
          flowDescription={flow.description ?? undefined}
          onUpdateValue={updateValue}
          onFileSelect={handleFileSelect}
          onSubmit={handleSubmit}
          onReset={resetExecution}
          onReviewed={() => { setReviewed(true); refetchCredits(); }}
          onNavigatePricing={() => navigate("/app/pricing")}
          inline
        />
        <QuickCheckoutModal
          open={showCreditsDialog}
          onOpenChange={setShowCreditsDialog}
          currentBalance={credits?.balance ?? 0}
          requiredCredits={requiredCredits}
        />
      </div>
    );
  }

  if (mode === "preview") {
    return (
      <div className={className}>
        <PreviewPane
          flowId={flowId}
          state={formValues}
          results={previewResults.length > 0 ? previewResults : null}
          exampleResults={examplePreviewResults}
          runGroups={runGroups}
          flowName={flow.name}
          flowDescription={flow.description ?? undefined}
          isRunning={isRunning}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          creatorName={creator?.display_name ?? undefined}
          creatorAvatarUrl={creator?.avatar_url ?? undefined}
          creatorRank={creator?.creator_rank ?? undefined}
          inline
        />
      </div>
    );
  }

  if (mode === "drawer") {
    return (
      <MobileConfigDrawer
        open={!!drawerOpen}
        onOpenChange={(o) => onDrawerOpenChange?.(o)}
        inputs={inputs}
        exposed={exposed}
        textInputs={textInputs}
        formValues={formValues}
        fileUploads={fileUploads}
        filePreviews={filePreviews}
        executionState={executionState}
        statusMessage={statusMessage}
        pollProgress={pollProgress}
        elapsedSeconds={elapsedSeconds}
        resultUrl={resultUrl}
        resultType={resultType}
        resultHistory={resultHistory}
        errorMessage={errorMessage}
        wasRefunded={wasRefunded}
        flowName={flow.name}
        setupInstructions={((flow.settings as Record<string, unknown>)?.setup_instructions as string) ?? undefined}
        flowDescription={flow.description ?? undefined}
        onUpdateValue={updateValue}
        onFileSelect={handleFileSelect}
        onReset={resetExecution}
      />
    );
  }

  return null;
};

export default BundleFlowEngine;
