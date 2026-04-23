import { useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus, Search, MoreVertical, Play, Upload, Copy, Archive, Pencil, Trash2,
  Zap, Clock, CheckCircle2, Eye, Loader2, Image as ImageIcon, Film, Settings2,
  Send, MessageSquare, XCircle, Rocket, EyeOff, AlertTriangle, Coins,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFlows, useFlowStats, formatDuration, formatTimeAgo } from "@/hooks/useFlows";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { hasErrors } from "@/lib/flowValidation";
import { calculateNodeCost } from "@/lib/nodeCostCalculator";
import { phFlowCreated } from "@/lib/posthogEvents";
import { useCreatorCreditCosts } from "@/hooks/useCreatorCreditCosts";
import type { FlowGraph } from "@/pages/play-flow/types";
import { useLanguage } from "@/contexts/LanguageContext";

const STATUS_CONFIG: Record<string, { labelKey: string; color: string; icon: typeof CheckCircle2 }> = {
  draft: { labelKey: "stuStatusDraft", color: "text-gray-400 bg-gray-500/10 border-gray-500/30", icon: Pencil },
  testing: { labelKey: "stuStatusTesting", color: "text-orange-400 bg-orange-500/10 border-orange-500/30", icon: Play },
  submitted: { labelKey: "stuStatusSubmitted", color: "text-sky-400 bg-sky-500/10 border-sky-500/30", icon: Send },
  in_review: { labelKey: "stuStatusInReview", color: "text-amber-400 bg-amber-500/10 border-amber-500/30", icon: Clock },
  approved: { labelKey: "stuStatusApproved", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle2 },
  changes_requested: { labelKey: "stuStatusChangesReq", color: "text-orange-400 bg-orange-500/10 border-orange-500/30", icon: MessageSquare },
  rejected: { labelKey: "stuStatusRejected", color: "text-red-400 bg-red-500/10 border-red-500/30", icon: XCircle },
  published: { labelKey: "stuStatusPublished", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle2 },
  archived: { labelKey: "stuStatusArchived", color: "text-gray-500 bg-gray-600/10 border-gray-600/30", icon: Archive },
};

const NODE_TYPE_KEYS: Record<string, string> = {
  klingVideoNode: "klingVideoNode",
  bananaProNode: "bananaProNode",
  chatAiNode: "chatAiNode",
};

/** Calculate total base cost for a flow graph using credit_costs data */
function calcFlowBaseCost(graph: FlowGraph | null, creditCosts: import("@/hooks/useCreatorCreditCosts").CreditCostRow[]): number | null {
  if (!graph || !graph.nodes || graph.nodes.length === 0 || creditCosts.length === 0) return null;
  let total = 0;
  let hasAction = false;
  for (const node of graph.nodes) {
    const schemaKey = NODE_TYPE_KEYS[node.type];
    if (!schemaKey) continue;
    hasAction = true;
    const params = (node.data?.params as Record<string, unknown>) ?? {};
    const cost = calculateNodeCost({ schemaKey, params, creditCosts });
    if (cost === null) return null; // missing pricing
    total += cost;
  }
  if (!hasAction) return null;
  return total;
}

const FlowStudioDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [uploadingFlowId, setUploadingFlowId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFlowIdRef = useRef<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const { t } = useLanguage();

  const { data: flows, isLoading } = useFlows();
  const { data: creditCosts } = useCreatorCreditCosts();
  const stats = useFlowStats(flows);

  const filtered = (flows ?? []).filter((f) => {
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const STATS_DISPLAY = [
    { label: t("totalFlows"), value: String(stats.totalFlows), icon: Zap, color: "text-blue-400" },
    { label: t("totalRuns"), value: stats.totalRuns.toLocaleString(), icon: Play, color: "text-emerald-400" },
    { label: t("successRate"), value: stats.avgSuccess > 0 ? `${stats.avgSuccess}%` : "—", icon: CheckCircle2, color: "text-green-400" },
    { label: t("avgTime"), value: formatDuration(stats.avgTimeMs), icon: Clock, color: "text-amber-400" },
  ];

  const handleCreateFlow = async () => {
    if (!user) return;
    const existingNames = (flows ?? [])
      .map((f) => f.name)
      .filter((n) => /^Draft \d+$/.test(n));
    const maxNum = existingNames.reduce((max, n) => {
      const num = parseInt(n.replace("Draft ", ""), 10);
      return num > max ? num : max;
    }, 0);
    const newName = `Draft ${maxNum + 1}`;

    const { data, error } = await supabase
      .from("flows")
      .insert({ user_id: user.id, name: newName, status: "draft", category: "general" })
      .select("id")
      .single();
    if (error) { toast.error(t("stuCreateFailed")); return; }

    // Auto-scaffold a default Output node
    await supabase.from("flow_nodes").insert({
      flow_id: data.id,
      node_type: "outputNode",
      label: "Output",
      position_x: 600,
      position_y: 200,
      sort_order: 0,
      config: { outputType: "video" },
    });

    phFlowCreated(data.id, newName);
    queryClient.invalidateQueries({ queryKey: ["flows"] });
    navigate(`/app/flow-studio/${data.id}`);
  };

  const handleDuplicate = async (flowId: string, name: string) => {
    if (!user) return;
    try {
      // 1. Fetch the original flow (all columns except id/timestamps)
      const { data: original, error: fetchErr } = await supabase
        .from("flows")
        .select("*")
        .eq("id", flowId)
        .maybeSingle();
      if (fetchErr || !original) { toast.error(t("stuDuplicateReadFailed")); return; }

      // 2. Create the new flow with all settings/metadata copied
      const { id: _id, created_at: _ca, updated_at: _ua, status: _s, current_version: _cv, embedding: _emb, ...rest } = original;
      const { data: newFlow, error: insertErr } = await supabase
        .from("flows")
        .insert({
          ...rest,
          user_id: user.id,
          name: `${name} (Copy)`,
          status: "draft",
          current_version: 1,
          embedding: null,
        })
        .select("id")
        .single();
      if (insertErr || !newFlow) { toast.error(t("stuDuplicateFailed")); return; }

      // 3. Copy all nodes with their full config (prompts, params, connections)
      const { data: srcNodes, error: nodesErr } = await supabase
        .from("flow_nodes")
        .select("*")
        .eq("flow_id", flowId)
        .order("sort_order", { ascending: true });

      if (!nodesErr && srcNodes && srcNodes.length > 0) {
        // Keep same node IDs so internal connections/references stay valid
        const newNodes = srcNodes.map(({ created_at, updated_at, ...n }) => ({
          ...n,
          id: crypto.randomUUID(),
          flow_id: newFlow.id,
        }));

        // Build old→new ID map for remapping connections
        const idMap = new Map<string, string>();
        srcNodes.forEach((orig, i) => idMap.set(orig.id, newNodes[i].id));

        // Remap connection references inside config
        const remappedNodes = newNodes.map((n) => {
          const cfg = n.config as Record<string, unknown> | null;
          if (cfg?.connections && Array.isArray(cfg.connections)) {
            const remappedConns = (cfg.connections as Array<Record<string, unknown>>).map((c) => ({
              ...c,
              source: idMap.get(c.source as string) ?? c.source,
            }));
            return { ...n, config: { ...cfg, connections: remappedConns } };
          }
          return n;
        });

        const { error: nodeInsertErr } = await supabase.from("flow_nodes").insert(remappedNodes as any);
        if (nodeInsertErr) console.error("[Duplicate] node copy failed:", nodeInsertErr);
      }

      phFlowCreated(newFlow.id, `${name} (Copy)`);
      queryClient.invalidateQueries({ queryKey: ["flows"] });
      toast.success(t("stuDuplicateSuccess"));
    } catch (err) {
      console.error("[Duplicate] error:", err);
      toast.error(t("stuDuplicateFailed"));
    }
  };

  const handleArchive = async (flowId: string) => {
    const { error } = await supabase.from("flows").update({ status: "archived" }).eq("id", flowId);
    if (error) { toast.error(t("stuArchiveFailed")); return; }
    queryClient.invalidateQueries({ queryKey: ["flows"] });
    toast.success(t("stuArchiveSuccess"));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.rpc("delete_flow_with_dependencies", { p_flow_id: deleteTarget.id });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["flows"] });
      toast.success(t("stuDeleteSuccess"));
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || t("stuDeleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePublish = async (flowId: string) => {
    // Validate before publishing
    const flow = flows?.find((f) => f.id === flowId);
    if (flow && hasErrors(flow.warnings)) {
      toast.error(t("flowCannotPublish"), {
        description: flow.warnings.filter((w) => w.type === "error").map((w) => w.message).join(", "),
        duration: 6000,
      });
      return;
    }

    setPublishingId(flowId);
    try {
      const { error } = await supabase
        .from("flows")
        .update({ status: "published" })
        .eq("id", flowId)
        .eq("status", "approved");
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["flows"] });
      toast.success(t("stuPublishSuccess"));
    } catch (err: any) {
      toast.error(err.message || t("stuPublishFailed"));
    } finally {
      setPublishingId(null);
    }
  };

  const handleUnpublish = async (flowId: string) => {
    setPublishingId(flowId);
    try {
      const { error } = await supabase
        .from("flows")
        .update({ status: "approved" })
        .eq("id", flowId)
        .eq("status", "published");
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["flows"] });
      toast.success(t("stuUnpublishSuccess"));
    } catch (err: any) {
      toast.error(err.message || t("stuUnpublishFailed"));
    } finally {
      setPublishingId(null);
    }
  };

  const handleThumbnailUpload = (flowId: string) => {
    pendingFlowIdRef.current = flowId;
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const flowId = pendingFlowIdRef.current;
    if (!file || !flowId || !user) return;
    e.target.value = "";

    const isValid = file.type.startsWith("image/") || file.type === "video/mp4" || file.type === "video/webm";
    if (!isValid) { toast.error(t("stuFileInvalid")); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error(t("stuFileTooLarge")); return; }

    setUploadingFlowId(flowId);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/flow-thumb-${flowId}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("preset-thumbnails")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("preset-thumbnails").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateErr } = await supabase
        .from("flows")
        .update({ thumbnail_url: publicUrl })
        .eq("id", flowId);
      if (updateErr) throw updateErr;

      queryClient.invalidateQueries({ queryKey: ["flows"] });
      toast.success(t("stuThumbUpdated"));
    } catch (err: any) {
      toast.error(err.message || t("stuUploadFailed"));
    } finally {
      setUploadingFlowId(null);
      pendingFlowIdRef.current = null;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <input ref={fileInputRef} type="file" className="hidden" accept="image/*,video/mp4,video/webm" onChange={onFileSelected} />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("pfFlowStudio")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("studioDesc")}</p>
        </div>
        <Button className="gap-1.5 bg-primary hover:bg-primary/90" onClick={handleCreateFlow}>
          <Plus className="w-4 h-4" /> {t("flowCreate")}
        </Button>
      </motion.div>

      {/* Stats Grid */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATS_DISPLAY.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border/50 bg-background/30 backdrop-blur-md p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{stat.label}</span>
              <stat.icon className={cn("w-4 h-4", stat.color)} />
            </div>
            <div className="text-2xl font-bold text-foreground">{stat.value}</div>
          </div>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("flowSearchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-background/30 backdrop-blur-sm border-border/50" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {["all", "published", "approved", "submitted", "testing", "draft", "archived"].map((s) => (
            <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)}
              className={cn("text-xs capitalize", statusFilter === s ? "" : "bg-background/30 backdrop-blur-sm border-border/50 text-muted-foreground")}>
              {s === "all" ? t("stuFilterAll") : t(STATUS_CONFIG[s]?.labelKey as any ?? s)}
            </Button>
          ))}
        </div>
      </motion.div>

      {/* Flow Table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="rounded-xl border border-border/50 bg-background/30 backdrop-blur-md overflow-hidden">
        <div className="hidden lg:grid grid-cols-[56px_1fr_200px_70px_60px_80px_90px_80px_100px_40px] gap-3 px-4 py-2.5 bg-muted/30 border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          <span></span><span>{t("stuName")}</span><span>{t("stuStatus")}</span><span>{t("stuCredits")}</span><span>{t("stuVer")}</span><span>{t("stuRun")}</span><span>{t("stuSuccess")}</span><span>{t("stuAvgTime")}</span><span>{t("stuUpdated")}</span><span></span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{flows?.length === 0 ? t("stuNoFlowsYet") : t("stuNoFlowsFound")}</p>
          </div>
        ) : (
          filtered.map((flow) => {
            const status = STATUS_CONFIG[flow.status] ?? STATUS_CONFIG.draft;
            const isUploading = uploadingFlowId === flow.id;
            const thumbUrl = flow.thumbnail_url;
            const isApproved = flow.status === "approved";
            const isPublished = flow.status === "published";
            const isPublishing = publishingId === flow.id;
            const flowWarnings = flow.warnings;
            const hasWarnings = flowWarnings.length > 0;
            const flowHasErrors = hasErrors(flowWarnings);

            // Calculate credit cost from graph
            const baseCost = calcFlowBaseCost(flow.graph, creditCosts ?? []);
            const multiplier = flow.markup_multiplier || 4.0;
            const displayCredits = baseCost !== null ? Math.ceil(baseCost * multiplier) : null;

            return (
              <Link key={flow.id}
                to={`/app/flow-studio/${flow.id}`}
                className="grid grid-cols-1 lg:grid-cols-[56px_1fr_200px_70px_60px_80px_90px_80px_100px_40px] gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/10 transition-colors cursor-pointer group">
                {/* Thumbnail - bigger */}
                <div className="hidden lg:flex items-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="w-12 h-12 rounded-lg overflow-hidden border border-border/50 bg-muted/20 hover:border-primary/50 transition-colors shrink-0 relative"
                    onClick={() => handleThumbnailUpload(flow.id)}
                    title="Upload thumbnail"
                  >
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary absolute inset-0 m-auto" />
                    ) : thumbUrl ? (
                      thumbUrl.match(/\.(mp4|webm)/i) ? (
                        <video src={thumbUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                      ) : (
                        <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                      )
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-muted-foreground/40 absolute inset-0 m-auto" />
                    )}
                  </button>
                </div>
                {/* Name + warnings */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="lg:hidden w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex items-center gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{flow.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{flow.category.replace("_", " ")}</p>
                    </div>
                    {hasWarnings && (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={cn(
                              "shrink-0 w-5 h-5 rounded-full flex items-center justify-center",
                              flowHasErrors ? "bg-red-500/15" : "bg-amber-500/15"
                            )}>
                              <AlertTriangle className={cn("w-3.5 h-3.5", flowHasErrors ? "text-red-400" : "text-amber-400")} />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[280px] text-xs space-y-1">
                            {flowWarnings.map((w, i) => (
                              <div key={i} className={cn("flex items-start gap-1", w.type === "error" ? "text-red-400" : "text-amber-400")}>
                                <span className="shrink-0">{w.type === "error" ? "❌" : "⚠️"}</span>
                                <span>{w.message}</span>
                              </div>
                            ))}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>
                {/* Status */}
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px] gap-1", status.color)}>
                    <status.icon className="w-3 h-3" />{t(status.labelKey as any)}
                  </Badge>
                  {isApproved && (
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                      onClick={(e) => { e.stopPropagation(); handlePublish(flow.id); }}
                      disabled={isPublishing}
                    >
                      {isPublishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />}
                      {t("stuPublishBtn")}
                    </Button>
                  )}
                  {isPublished && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px] gap-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                      onClick={(e) => { e.stopPropagation(); handleUnpublish(flow.id); }}
                      disabled={isPublishing}
                    >
                      {isPublishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <EyeOff className="w-3 h-3" />}
                      {t("stuUnpublishBtn")}
                    </Button>
                  )}
                </div>
                {/* Credits */}
                <div className="flex items-center text-xs">
                  {displayCredits !== null ? (
                    <span className="flex items-center gap-1 text-amber-400 font-medium">
                      <Coins className="w-3 h-3" />
                      {displayCredits.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </div>
                <div className="flex items-center text-xs text-muted-foreground">v{flow.current_version}</div>
                <div className="flex items-center text-xs text-foreground font-medium">{flow.runs.toLocaleString()}</div>
                <div className="flex items-center text-xs">
                  <span className={cn("font-medium",
                    flow.successRate >= 95 ? "text-emerald-400" :
                    flow.successRate >= 90 ? "text-amber-400" :
                    flow.successRate > 0 ? "text-red-400" : "text-muted-foreground")}>
                    {flow.successRate > 0 ? `${flow.successRate}%` : "—"}
                  </span>
                </div>
                <div className="flex items-center text-xs text-muted-foreground">{formatDuration(flow.avgTimeMs)}</div>
                <div className="flex items-center text-[11px] text-muted-foreground">{formatTimeAgo(flow.updated_at)}</div>
                <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="gap-2 text-xs" onClick={() => navigate(`/app/flow-studio/${flow.id}`)}><Pencil className="w-3.5 h-3.5" /> {t("stuEdit")}</DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 text-xs" onClick={() => handleThumbnailUpload(flow.id)}>
                        <ImageIcon className="w-3.5 h-3.5" /> {t("stuUploadThumb")}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 text-xs" onClick={() => navigate(`/play/${flow.id}`)}><Eye className="w-3.5 h-3.5" /> {t("stuPreview")}</DropdownMenuItem>
                      {isApproved && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-xs text-emerald-400" onClick={() => handlePublish(flow.id)}>
                            <Rocket className="w-3.5 h-3.5" /> {t("stuPublishFlow")}
                          </DropdownMenuItem>
                        </>
                      )}
                      {isPublished && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-xs text-amber-400" onClick={() => handleUnpublish(flow.id)}>
                            <EyeOff className="w-3.5 h-3.5" /> {t("stuUnpublishHide")}
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="gap-2 text-xs" onClick={() => handleDuplicate(flow.id, flow.name)}><Copy className="w-3.5 h-3.5" /> {t("stuDuplicate")}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="gap-2 text-xs text-destructive" onClick={() => handleArchive(flow.id)}><Archive className="w-3.5 h-3.5" /> {t("stuArchive")}</DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 text-xs text-destructive"
                        onClick={() => setDeleteTarget({ id: flow.id, name: flow.name })}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {t("stuDeleteBtn")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Link>
            );
          })
        )}
      </motion.div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("stuDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("stuDeleteDesc1")} <span className="text-foreground font-medium">{deleteTarget?.name}</span> {t("stuDeleteDesc2")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("stuDeleteCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t("flowDeleting") : t("flowConfirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FlowStudioDashboard;
