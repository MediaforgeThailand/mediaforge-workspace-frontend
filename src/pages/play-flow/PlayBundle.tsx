/**
 * PlayBundle — Multi-flow bundle execution page (rebuilt to match Play_Bundle.html mock).
 *
 * Layout:
 *   xl ≥ 1280:  [Config 400px @ left-3] [Center preview @ left-[420px] right-[400px]] [Results 380px @ right-3]
 *   < xl:       Mobile tabs Config / Preview / Results (top: BundleTopBar @ 12px + MobileFlowSelector @ 56px)
 *
 * Each flow gets its own <BundleFlowEngine flowId={...} key={flowId} /> instance per slot,
 * so per-flow state (inputs, runs, polling) is preserved when switching tabs.
 *
 * Drag-to-reuse: native HTML5 drag from BundleResultsPanel → FigmaFileUploadField in
 * the active config (already supports the `application/x-mf-result` MIME type).
 *
 * Keyboard: Ctrl/Cmd + Tab cycles forward through the bundle's flows (+Shift = backward).
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import { usePlayBundle } from "@/hooks/useBundles";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import BundleFlowEngine from "@/components/bundle/BundleFlowEngine";
import { BundleTopBar } from "@/components/bundle/BundleTopBar";
import PageLoadingAnim from "@/components/ui/PageLoadingAnim";

import { BundleCenterPreview } from "@/components/bundle/BundleCenterPreview";
import { BundleResultsPanel } from "@/components/bundle/BundleResultsPanel";
import { deriveFlowMeta } from "@/components/bundle/flow-meta";
import type { BundleFlow, BundleMobileTab } from "@/components/bundle/types";
import type { RunGroup } from "@/components/play/ResultsView";

const ACTIVE_FLOW_KEY = (bid: string) => `mf:bundle:${bid}:activeFlow`;
const MOBILE_TAB_KEY = (bid: string) => `mf:bundle:${bid}:mobileTab`;

const PlayBundle = () => {
  const { bundleId } = useParams<{ bundleId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading, error } = usePlayBundle(bundleId);

  const flows: BundleFlow[] = useMemo(
    () => (data?.flows ?? []).map((f, i) => deriveFlowMeta(f, i)),
    [data],
  );
  const flowsById = useMemo(
    () => Object.fromEntries(flows.map((f) => [f.id, f])) as Record<string, BundleFlow>,
    [flows],
  );
  /** Raw flow rows (with full settings) keyed by id — passed to each BundleFlowEngine to bypass RLS-restricted re-queries. */
  const rawFlowsById = useMemo(
    () => Object.fromEntries((data?.flows ?? []).map((f: any) => [f.id, f])) as Record<string, any>,
    [data],
  );

  const [activeFlowId, setActiveFlowId] = useState<string>("");
  const [mobileTab, setMobileTab] = useState<BundleMobileTab>("preview");

  // Per-engine state — keyed by flowId
  const [enginesState, setEnginesState] = useState<
    Record<string, { runGroups: RunGroup[]; isRunning: boolean; flowName?: string }>
  >({});

  /* ─── Initialize active flow + mobile tab (from localStorage or first usable) ─── */
  useEffect(() => {
    if (!bundleId || flows.length === 0) return;
    if (activeFlowId && flows.some((f) => f.id === activeFlowId)) return;

    // Prefer the first flow that has a real graph (skip empty placeholder flows).
    const isUsable = (f: BundleFlow) => {
      const settings = (data?.flows.find((df) => df.id === f.id) as any)?.settings;
      const nodes = settings?.graph?.nodes;
      return Array.isArray(nodes) && nodes.length > 0;
    };
    const firstUsable = flows.find(isUsable);
    let initial = (firstUsable ?? flows[0]).id;

    try {
      const saved = localStorage.getItem(ACTIVE_FLOW_KEY(bundleId));
      // Only honour saved selection if it still maps to a usable flow
      if (saved && flows.some((f) => f.id === saved && isUsable(f))) initial = saved;
    } catch { /* ignore */ }
    setActiveFlowId(initial);
    try {
      const savedTab = localStorage.getItem(MOBILE_TAB_KEY(bundleId)) as BundleMobileTab | null;
      if (savedTab === "config" || savedTab === "preview" || savedTab === "results") {
        setMobileTab(savedTab);
      }
    } catch { /* ignore */ }
  }, [bundleId, flows, activeFlowId, data]);

  /* ─── Persist active flow + tab ─── */
  useEffect(() => {
    if (!bundleId || !activeFlowId) return;
    try { localStorage.setItem(ACTIVE_FLOW_KEY(bundleId), activeFlowId); } catch { /* ignore */ }
  }, [bundleId, activeFlowId]);
  useEffect(() => {
    if (!bundleId) return;
    try { localStorage.setItem(MOBILE_TAB_KEY(bundleId), mobileTab); } catch { /* ignore */ }
  }, [bundleId, mobileTab]);

  /* ─── Ctrl/Cmd + Tab cycle ─── */
  useEffect(() => {
    if (flows.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== "Tab") return;
      e.preventDefault();
      const idx = flows.findIndex((f) => f.id === activeFlowId);
      if (idx < 0) return;
      const next = e.shiftKey
        ? (idx - 1 + flows.length) % flows.length
        : (idx + 1) % flows.length;
      setActiveFlowId(flows[next].id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flows, activeFlowId]);

  /* ─── Aggregate runs across all engines, newest-first ─── */
  const aggregatedRuns: RunGroup[] = useMemo(() => {
    const all: RunGroup[] = [];
    for (const [flowId, state] of Object.entries(enginesState)) {
      for (const g of state.runGroups ?? []) {
        all.push({ ...g, flowId } as any);
      }
    }
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return all;
  }, [enginesState]);

  const anyRunning = useMemo(
    () => Object.values(enginesState).some((s) => s.isRunning),
    [enginesState],
  );

  const handleEngineState = useCallback(
    (flowId: string) =>
      (state: { runGroups: RunGroup[]; isRunning: boolean; flowName?: string }) => {
        setEnginesState((prev) => {
          const cur = prev[flowId];
          if (
            cur &&
            cur.isRunning === state.isRunning &&
            cur.flowName === state.flowName &&
            cur.runGroups === state.runGroups
          ) {
            return prev;
          }
          return { ...prev, [flowId]: state };
        });
      },
    [],
  );

  /* ─── Loading / errors ─── */
  if (isLoading) {
    return <PageLoadingAnim />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-foreground">Bundle not found</p>
        <Button onClick={() => navigate("/app/home")} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back home
        </Button>
      </div>
    );
  }

  if (!flows.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-foreground">This bundle has no flows yet</p>
        <Button onClick={() => navigate("/app/home")} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back home
        </Button>
      </div>
    );
  }

  if (!user) {
    navigate(`/auth?redirect=${encodeURIComponent(window.location.pathname)}`);
    return null;
  }

  const activeFlow = flowsById[activeFlowId] ?? flows[0];

  /* ─── Render ─── */
  return (
    <div className="play-flow-bg">
      <BundleTopBar
        bundle={{ name: data.bundle.name, id: data.bundle.id }}
        activeFlow={activeFlow}
        mobileTab={mobileTab}
        onChangeMobileTab={setMobileTab}
        onBack={() => navigate("/app/home")}
      />

      {/* ───────── Desktop layout (≥xl): 3 fixed columns ───────── */}

      {/* Left: Config column 400px */}
      <aside
        className="hidden xl:flex fixed left-3 top-[60px] bottom-3 z-30 w-[400px] flex-col rounded-3xl glass-panel overflow-hidden"
        style={{
          boxShadow:
            "0 40px 80px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(167,139,250,0.04)",
        }}
      >
        <div className="flex-1 min-h-0 overflow-hidden">
          {flows.map((f) => (
            <BundleFlowEngine
              key={`cfg-${f.id}`}
              flowId={f.id}
              bundleId={bundleId}
              mode="config"
              className={f.id === activeFlowId ? "block h-full" : "hidden"}
              onStateChange={handleEngineState(f.id)}
              flowData={rawFlowsById[f.id]}
            />
          ))}
        </div>
      </aside>

      {/* Center: FlowSelector + chips + engine preview */}
      <BundleCenterPreview
        flows={flows}
        activeFlowId={activeFlowId}
        activeFlow={activeFlow}
        onChangeFlow={setActiveFlowId}
        flowTabStyle="card"
      >
        {flows.map((f) => (
          <BundleFlowEngine
            key={`prev-${f.id}`}
            flowId={f.id}
            bundleId={bundleId}
            mode="preview"
            className={f.id === activeFlowId ? "block h-full" : "hidden"}
            onStateChange={handleEngineState(f.id)}
            flowData={rawFlowsById[f.id]}
          />
        ))}
      </BundleCenterPreview>

      {/* Right: Aggregated results column 380px */}
      <BundleResultsPanel
        runGroups={aggregatedRuns}
        flowsById={flowsById}
        isRunning={anyRunning}
        activeFlowId={activeFlowId}
      />

      {/* ───────── Mobile layout (<xl) ───────── */}
      <div className="xl:hidden fixed left-3 right-3 top-[68px] bottom-3 z-20">
        {/* Config tab */}
        <div className={mobileTab === "config" ? "block h-full" : "hidden"}>
          <div
            className="h-full rounded-3xl glass-panel overflow-hidden anim-fadeInUp"
            style={{
              boxShadow:
                "0 40px 80px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            {flows.map((f) => (
              <BundleFlowEngine
                key={`m-cfg-${f.id}`}
                flowId={f.id}
                bundleId={bundleId}
                mode="config"
                className={f.id === activeFlowId ? "block h-full" : "hidden"}
                onStateChange={handleEngineState(f.id)}
                flowData={rawFlowsById[f.id]}
              />
            ))}
          </div>
        </div>

        {/* Preview tab */}
        <div className={mobileTab === "preview" ? "block h-full" : "hidden"}>
          <div className="h-full rounded-3xl glass-panel overflow-hidden anim-fadeInUp">
            {flows.map((f) => (
              <BundleFlowEngine
                key={`m-prev-${f.id}`}
                flowId={f.id}
                bundleId={bundleId}
                mode="preview"
                className={f.id === activeFlowId ? "block h-full" : "hidden"}
                onStateChange={handleEngineState(f.id)}
                flowData={rawFlowsById[f.id]}
              />
            ))}
          </div>
        </div>

        {/* Results tab */}
        <div className={mobileTab === "results" ? "block h-full" : "hidden"}>
          <div className="h-full anim-fadeInUp">
            <BundleResultsPanel
              runGroups={aggregatedRuns}
              flowsById={flowsById}
              isRunning={anyRunning}
              activeFlowId={activeFlowId}
              mobileFullWidth
            />
          </div>
        </div>
      </div>

    </div>
  );
};

export default PlayBundle;
