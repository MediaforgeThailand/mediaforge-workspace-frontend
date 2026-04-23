import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrls } from "@/hooks/useSignedUrl";
import { phAssetDownloaded } from "@/lib/posthogEvents";
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
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isToday, isThisWeek, isThisMonth } from "date-fns";
import { downloadMedia } from "@/lib/downloadMedia";
import { useProcessingRuns } from "@/hooks/useProcessingRuns";
import { cn } from "@/lib/utils";
import { findBundleForRun, getAllBundleRunIds } from "@/lib/bundleRunRegistry";

import { AssetsHeader } from "./assets/AssetsHeader";
import { FilterBar, type Filters } from "./assets/FilterBar";
import { AssetCard } from "./assets/AssetCard";
import { ProcessingCard } from "./assets/ProcessingCard";
import { ListView } from "./assets/ListView";
import { MasonryView, KanbanView } from "./assets/MasonryView";
import { PreviewDrawer } from "./assets/PreviewDrawer";
import { BulkBar } from "./assets/BulkBar";
import type { Asset, ViewMode } from "./assets/types";

const AssetManager = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { runs: processingRuns, dismissRun } = useProcessingRuns();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [flowNames, setFlowNames] = useState<Map<string, string>>(new Map());
  const [bundleNames, setBundleNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const hideFailedRun = (runId: string) => {
    void dismissRun(runId);
  };

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filters, setFilters] = useState<Filters>({
    type: "all",
    source: "all",
    time: "all",
    sortAsc: false,
  });
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Asset | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; ids: string[] }>({
    open: false,
    ids: [],
  });

  const fetchAssets = useCallback(async ({ showLoader = false }: { showLoader?: boolean } = {}) => {
    if (!user) {
      setAssets([]);
      setFlowNames(new Map());
      setLoading(false);
      return;
    }

    if (showLoader) setLoading(true);

    const { data, error } = await supabase
      .from("user_assets")
      .select("id, name, file_url, file_type, source, thumbnail_url, metadata, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      if (showLoader) setLoading(false);
      return;
    }

    const rows = data ?? [];
    const urls = rows.map((a: any) => a.thumbnail_url || a.file_url).filter(Boolean);
    const signedMap = urls.length > 0 ? await getSignedUrls(urls) : new Map<string, string>();
    const resolved: Asset[] = rows.map((a: any) => ({
      ...a,
      file_url: signedMap.get(a.file_url) || a.file_url,
      thumbnail_url: a.thumbnail_url
        ? signedMap.get(a.thumbnail_url) || a.thumbnail_url
        : null,
    }));
    setAssets(resolved);

    const flowIds = [...new Set(rows.map((a: any) => a.metadata?.flow_id).filter(Boolean))] as string[];
    if (flowIds.length > 0) {
      const { data: flows } = await supabase
        .from("flows")
        .select("id, name")
        .in("id", flowIds);

      const map = new Map<string, string>();
      (flows ?? []).forEach((f: any) => map.set(f.id, f.name));
      setFlowNames(map);
    } else {
      setFlowNames(new Map());
    }

    if (showLoader) setLoading(false);
  }, [user]);

  useEffect(() => {
    void fetchAssets({ showLoader: true });
  }, [fetchAssets]);

  // Resolve bundle display names for any bundles referenced by this device's run registry.
  useEffect(() => {
    let cancelled = false;
    const allRunIds = getAllBundleRunIds();
    if (allRunIds.length === 0) {
      setBundleNames(new Map());
      return;
    }
    const bundleIds = new Set<string>();
    for (const rid of allRunIds) {
      const bid = findBundleForRun(rid);
      if (bid) bundleIds.add(bid);
    }
    if (bundleIds.size === 0) {
      setBundleNames(new Map());
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from("bundles")
        .select("id, name")
        .in("id", [...bundleIds]);
      if (cancelled) return;
      const map = new Map<string, string>();
      (data ?? []).forEach((b: any) => map.set(b.id, b.name));
      setBundleNames(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, assets.length]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`user_assets:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_assets",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void fetchAssets();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchAssets]);

  // Decorate assets with flow_name + bundle origin (memo)
  const decoratedAssets = useMemo(
    () =>
      assets.map((a) => {
        const runId = a.metadata?.flow_run_id || a.metadata?.run_id || null;
        const bundleId = runId ? findBundleForRun(runId) : null;
        return {
          ...a,
          flow_name: a.metadata?.flow_id
            ? flowNames.get(a.metadata.flow_id) ?? null
            : null,
          bundle_id: bundleId,
          bundle_name: bundleId ? bundleNames.get(bundleId) ?? null : null,
        };
      }),
    [assets, flowNames, bundleNames]
  );

  // Processing + Failed cards come from the database (shared across devices).
  const processingTasks = useMemo(
    () =>
      processingRuns.map((r) => ({
        runId: r.runId,
        flowName: r.flowName,
        flowId: r.flowId ?? "",
        startedAt: r.startedAt,
        status: r.status,
        errorMessage: r.errorMessage,
        refunded: r.refunded,
      })),
    [processingRuns]
  );

  // Filter + search + sort
  const filteredAssets = useMemo(() => {
    let r = decoratedAssets.slice();
    if (filters.type !== "all") r = r.filter((a) => a.file_type === filters.type);
    if (filters.source !== "all") {
      r = r.filter((a) => {
        if (filters.source === "workflow") return a.source === "workflow";
        if (filters.source === "image") return a.file_type === "image";
        if (filters.source === "video") return a.file_type === "video";
        return true;
      });
    }
    if (filters.time !== "all") {
      r = r.filter((a) => {
        const d = new Date(a.created_at);
        if (filters.time === "today") return isToday(d);
        if (filters.time === "week") return isThisWeek(d);
        if (filters.time === "month") return isThisMonth(d);
        return true;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.flow_name || "").toLowerCase().includes(q) ||
          a.source.toLowerCase().includes(q)
      );
    }
    if (filters.sortAsc) r.reverse();
    return r;
  }, [decoratedAssets, filters, search]);

  const counts = useMemo(
    () => ({
      all: decoratedAssets.length,
      image: decoratedAssets.filter((a) => a.file_type === "image").length,
      video: decoratedAssets.filter((a) => a.file_type === "video").length,
      audio: decoratedAssets.filter((a) => a.file_type === "audio").length,
    }),
    [decoratedAssets]
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleDownload = async (asset: Asset) => {
    phAssetDownloaded({
      asset_type: asset.file_type || "unknown",
      flow_id: asset.metadata?.flow_id || undefined,
    });
    await downloadMedia(asset.file_url, asset.name);
  };

  const requestDelete = (ids: string[]) =>
    setDeleteConfirm({ open: true, ids });

  const confirmDelete = async () => {
    const { ids } = deleteConfirm;
    setDeleteConfirm({ open: false, ids: [] });
    for (const id of ids) {
      await supabase.from("user_assets").delete().eq("id", id);
    }
    setAssets((prev) => prev.filter((a) => !ids.includes(a.id)));
    setSelectedIds(new Set());
    toast.success(`Deleted ${ids.length} asset${ids.length > 1 ? "s" : ""}`);
  };

  const bulkDownload = async () => {
    const selected = decoratedAssets.filter((a) => selectedIds.has(a.id));
    toast.success(`Downloading ${selected.length} files`);
    for (const asset of selected) {
      await handleDownload(asset);
      if (selected.length > 1) await new Promise((r) => setTimeout(r, 400));
    }
  };

  /**
   * Navigate to the originating context for an asset:
   * - If the asset's run is registered as belonging to a bundle on this device,
   *   open the bundle player (`/play/bundle/:bundleId`).
   * - Otherwise, fall back to the solo flow page (`/play/:flowId`).
   */
  const openFlow = (flowId: string, runId?: string | null) => {
    if (runId) {
      const bundleId = findBundleForRun(runId);
      if (bundleId) {
        navigate(`/play/bundle/${bundleId}`);
        return;
      }
    }
    navigate(`/play/${flowId}`);
  };

  /** Convenience for asset rows: pulls run id from metadata. */
  const openFlowFromAsset = (flowId: string, asset?: { metadata?: any } | null) => {
    const runId = asset?.metadata?.flow_run_id || asset?.metadata?.run_id || null;
    openFlow(flowId, runId);
  };

  return (
    <div className="relative -mx-4 lg:-mx-6 -mt-4 lg:-mt-6 min-h-screen bg-background">
      <main className="relative">
        {/* mesh background */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(600px 400px at 15% -10%, hsl(var(--primary) / 0.10), transparent 60%),
              radial-gradient(500px 400px at 95% 10%, hsl(var(--accent) / 0.08), transparent 60%),
              radial-gradient(700px 500px at 50% 120%, hsl(var(--primary) / 0.06), transparent 60%)
            `,
          }}
        />

        <div className="relative max-w-[1480px] mx-auto px-6 lg:px-10 py-6 lg:py-8">
          <AssetsHeader
            total={decoratedAssets.length}
            filtered={filteredAssets.length}
            search={search}
            setSearch={setSearch}
            viewMode={viewMode}
            setViewMode={setViewMode}
          />

          <div className="mt-6">
            <FilterBar filters={filters} setFilters={setFilters} counts={counts} />
          </div>

          <div className="mt-5">
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : (
              <>
                {viewMode === "grid" && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                    {processingTasks.map((p) => (
                      <ProcessingCard
                        key={p.runId}
                        flowName={p.flowName}
                        startedAt={p.startedAt}
                        status={p.status}
                        errorMessage={p.errorMessage}
                        refunded={p.refunded}
                        onDismiss={
                          p.status === "failed"
                            ? () => hideFailedRun(p.runId)
                            : undefined
                        }
                        onRetry={
                          p.status === "failed" && p.flowId
                            ? () => openFlow(p.flowId, p.runId)
                            : undefined
                        }
                      />
                    ))}
                    {filteredAssets.map((a) => (
                      <AssetCard
                        key={a.id}
                        asset={a}
                        selected={selectedIds.has(a.id)}
                        onToggle={toggle}
                        onOpen={setPreview}
                        onDownload={handleDownload}
                      />
                    ))}
                  </div>
                )}

                {viewMode === "list" && (
                  <ListView
                    assets={filteredAssets}
                    processing={processingTasks}
                    selected={selectedIds}
                    toggle={toggle}
                    open={setPreview}
                    onDownload={handleDownload}
                    onDelete={(id) => requestDelete([id])}
                    onOpenFlow={openFlow}
                    onDismiss={hideFailedRun}
                  />
                )}

                {viewMode === "masonry" && (
                  <MasonryView
                    assets={filteredAssets}
                    processing={processingTasks}
                    selected={selectedIds}
                    toggle={toggle}
                    open={setPreview}
                    onDismiss={hideFailedRun}
                    onRetry={openFlow}
                  />
                )}

                {viewMode === "kanban" && (
                  <KanbanView
                    assets={filteredAssets}
                    processing={processingTasks}
                    selected={selectedIds}
                    toggle={toggle}
                    open={setPreview}
                  />
                )}

                {filteredAssets.length === 0 &&
                  processingTasks.length === 0 &&
                  viewMode !== "kanban" && (
                    <div className="flex flex-col items-center justify-center py-28 text-center">
                      <div
                        className={cn(
                          "w-14 h-14 rounded-2xl bg-card border border-border",
                          "flex items-center justify-center mb-3 text-muted-foreground"
                        )}
                      >
                        <FolderOpen className="w-6 h-6" />
                      </div>
                      <div className="font-semibold text-foreground">
                        No assets match
                      </div>
                      <div className="mt-1 text-[12px] text-muted-foreground/70">
                        Try removing filters or search terms
                      </div>
                    </div>
                  )}
              </>
            )}
          </div>

          <div className="h-24" />
        </div>
      </main>

      <BulkBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onDownload={bulkDownload}
        onDelete={() => requestDelete(Array.from(selectedIds))}
      />

      <PreviewDrawer
        asset={preview}
        onClose={() => setPreview(null)}
        onDownload={handleDownload}
        onDelete={(id) => requestDelete([id])}
        onOpenFlow={openFlow}
      />

      <AlertDialog
        open={deleteConfirm.open}
        onOpenChange={(o) =>
          !o && setDeleteConfirm({ open: false, ids: [] })
        }
      >
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteConfirm.ids.length} asset
              {deleteConfirm.ids.length > 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected file
              {deleteConfirm.ids.length > 1 ? "s" : ""} will be permanently
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AssetManager;
