import { memo, useCallback, useMemo, useEffect, useRef, Fragment } from "react";
import { type NodeProps, useReactFlow, useEdges } from "@xyflow/react";
import { Film } from "lucide-react";
import {
  NODE_API_SCHEMA,
  getVisibleParams,
  getVisibleInputs,
  getRemovedHandleIds,
  cleanParamsOnModelChange,
  type ParamDef,
} from "./nodeApiSchema";
import NodeParamRenderer from "./NodeParamRenderer";
import BaseNodeWrapper, { type PortDef } from "./BaseNodeWrapper";
import { CollapsibleGroup, ModelSelectButton, EyeBtn } from "./primitives";
import { cn } from "@/lib/utils";
import { useNodeCreditCosts as useCreatorCreditCosts } from "@/hooks/useNodeCreditCosts";
import { calculateNodeCost } from "@/lib/nodeCostCalculator";
import MultiShotBuilder, { type SceneBlock } from "./MultiShotBuilder";

const SCHEMA = NODE_API_SCHEMA.klingVideoNode;
const OMNI_MODELS = new Set(["kling-v3-omni"]);

/** @deprecated Use NODE_API_SCHEMA.klingVideoNode.params instead */
export const KLING_PARAMS = SCHEMA.params;
export type { ParamDef as KlingParam };

export interface KlingVideoNodeData {
  label: string;
  params: Record<string, unknown>;
  exposed: Record<string, boolean>;
}

const KlingVideoNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as KlingVideoNodeData;
  const { setNodes, setEdges } = useReactFlow();

  const updateNodeField = useCallback(
    (field: string, value: unknown) => {
      setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n));
    },
    [id, setNodes],
  );

  const params = d.params ?? {};
  const exposed = d.exposed ?? {};
  const selectedModel = (params.model_name as string) ?? SCHEMA.defaultModel;
  const isMultiShot = String(params.multi_shot) === "true";

  const visibleParams = useMemo(
    () => getVisibleParams("klingVideoNode", selectedModel),
    [selectedModel],
  );

  const visibleInputs = useMemo(
    () => getVisibleInputs("klingVideoNode", selectedModel),
    [selectedModel],
  );

  const toggleExpose = useCallback(
    (key: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  exposed: { ...(n.data as any).exposed, [key]: !(n.data as any).exposed?.[key] },
                },
              }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const updateParam = useCallback(
    (key: string, value: unknown) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prevParams = (n.data as any).params ?? {};

          if (key === "model_name") {
            const cleaned = cleanParamsOnModelChange("klingVideoNode", String(value), prevParams);
            const removedHandles = getRemovedHandleIds("klingVideoNode", String(value));
            if (removedHandles.length > 0) {
              setEdges((eds) =>
                eds.filter(
                  (e) => !(e.target === id && removedHandles.includes(e.targetHandle ?? "")),
                ),
              );
            }
            return { ...n, data: { ...n.data, params: cleaned } };
          }

          return {
            ...n,
            data: { ...n.data, params: { ...prevParams, [key]: value } },
          };
        }),
      );
    },
    [id, setNodes, setEdges],
  );

  // ── Multi-Shot scene change handler with auto-duration sync ──
  const handleScenesChange = useCallback(
    (newScenes: SceneBlock[]) => {
      const totalSum = newScenes.reduce((s, sc) => s + Number(sc.duration || 0), 0);
      const clampedDuration = Math.max(3, Math.min(totalSum, 15));
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = (n.data as any).params ?? {};
          return {
            ...n,
            data: {
              ...n.data,
              params: { ...prev, multi_prompt: newScenes, duration: clampedDuration },
            },
          };
        }),
      );
    },
    [id, setNodes],
  );

  const exposedCount = Object.values(exposed).filter(Boolean).length;

  const inputPorts: PortDef[] = visibleInputs.map((inp) => ({
    id: inp.id,
    label: inp.label,
    color: inp.color,
  }));

  const outputPorts: PortDef[] = SCHEMA.outputs.map((out) => ({
    id: out.id,
    label: out.label,
    color: out.color,
  }));

  const { data: creditCosts, isLoading: creditCostsLoading } = useCreatorCreditCosts();

  const isMotionModel = selectedModel.includes("motion");
  const isOmniModel = OMNI_MODELS.has(selectedModel);

  // ── Phase 2: Edge Detection — sync _has_ref_video into params ──
  const edges = useEdges();
  const prevHasRefVideo = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    const hasRefVideoEdge = edges.some(
      (e) => e.target === id && e.targetHandle === "ref_video",
    );
    // Only dispatch update when the boolean actually changes to avoid infinite loops
    if (prevHasRefVideo.current !== hasRefVideoEdge) {
      prevHasRefVideo.current = hasRefVideoEdge;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = (n.data as any).params ?? {};
          if (prev._has_ref_video === hasRefVideoEdge) return n; // no-op guard
          return {
            ...n,
            data: { ...n.data, params: { ...prev, _has_ref_video: hasRefVideoEdge } },
          };
        }),
      );
    }
  }, [edges, id, setNodes]);

  const nodeCost = useMemo(() => {
    if (!creditCosts) return null;
    if (isMotionModel) {
      const perSecondMatch = creditCosts.find(
        (r) =>
          r.feature === "generate_freepik_video" &&
          r.model === selectedModel &&
          r.pricing_type === "per_second",
      );
      return perSecondMatch?.cost ?? null;
    }
    return calculateNodeCost({ schemaKey: "klingVideoNode", params, creditCosts });
  }, [params, creditCosts, isMotionModel, selectedModel]);

  const costSuffix = isMotionModel ? "/s" : isOmniModel ? ` (${params.duration ?? 5}s)` : undefined;

  return (
    <BaseNodeWrapper
      title={d.params?.nodeName as string || SCHEMA.displayName}
      onTitleChange={(name) => updateNodeField("params", { ...params, nodeName: name })}
      badge={SCHEMA.category}
      accent={SCHEMA.accentColor}
      icon={Film}
      inputs={inputPorts}
      outputs={outputPorts}
      selected={selected}
      width={300}
      creditCost={nodeCost}
      creditCostLoading={creditCostsLoading}
      creditCostSuffix={costSuffix}
      footerLeft={exposedCount > 0 ? `${exposedCount} param${exposedCount > 1 ? "s" : ""} exposed` : "No params exposed"}
      footerRight={selectedModel}
    >
      {(() => {
        // ── Bucket visible params by group label (preserves schema order) ──
        const groupOrder: string[] = [];
        const groups = new Map<string, ParamDef[]>();
        for (const p of visibleParams) {
          const label = p.group?.trim() || (p.key === "model_name" ? "Model" : "Parameters");
          if (!groups.has(label)) {
            groups.set(label, []);
            groupOrder.push(label);
          }
          groups.get(label)!.push(p);
        }

        const stop = (e: React.SyntheticEvent) => e.stopPropagation();

        return groupOrder.map((label) => (
          <CollapsibleGroup
            key={label}
            label={label}
            accent={SCHEMA.accentColor}
            defaultOpen
            count={groups.get(label)!.length}
          >
            {groups.get(label)!.map((param) => {
              // ── visibleWhen gate ──
              if (param.visibleWhen) {
                const hidden = Object.entries(param.visibleWhen).some(
                  ([k, v]) => String(params[k] ?? "") !== v,
                );
                if (hidden) return null;
              }

              // ── Hide standard prompt when multi_shot is ON ──
              if (isMultiShot && param.key === "prompt") return null;

              // ── Replace multi_prompt JSON with scene builder ──
              if (param.key === "multi_prompt" && isMultiShot) {
                const currentScenes = Array.isArray(params.multi_prompt)
                  ? (params.multi_prompt as SceneBlock[])
                  : [];
                return (
                  <MultiShotBuilder
                    key={param.key}
                    scenes={currentScenes}
                    onChange={handleScenesChange}
                    excludeNodeId={id}
                  />
                );
              }

              // ── Rich model selector for model_name ──
              if (param.key === "model_name" && param.type === "select") {
                const isExposedModel = exposed[param.key] ?? false;
                return (
                  <div key={param.key} className={cn("fs-param-row group", isExposedModel && "exposed")}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="flex items-center gap-1 text-[10.5px] font-medium text-white/75">
                        {param.label}
                        {param.required && <span className="text-red-400">*</span>}
                      </span>
                      <EyeBtn on={isExposedModel} onClick={() => toggleExpose(param.key)} />
                    </div>
                    <ModelSelectButton
                      value={String(params[param.key] ?? param.default)}
                      options={param.options ?? []}
                      optionLabels={param.optionLabels}
                      onChange={(v) => updateParam(param.key, v)}
                      accent={SCHEMA.accentColor}
                    />
                  </div>
                );
              }

              // ── Disable duration slider when multi_shot is ON ──
              if (isMultiShot && param.key === "duration") {
                return (
                  <div key={param.key} className="group opacity-60 pointer-events-none">
                    <NodeParamRenderer
                      param={param}
                      value={params[param.key]}
                      isExposed={exposed[param.key] ?? false}
                      accentColor="violet"
                      selectedModel={selectedModel}
                      onUpdateParam={updateParam}
                      onToggleExpose={toggleExpose}
                      nodeId={id}
                      nodeType="klingVideoNode"
                    />
                  </div>
                );
              }

              return (
                <NodeParamRenderer
                  key={param.key}
                  param={param}
                  value={params[param.key]}
                  isExposed={exposed[param.key] ?? false}
                  accentColor="violet"
                  selectedModel={selectedModel}
                  onUpdateParam={updateParam}
                  onToggleExpose={toggleExpose}
                  nodeId={id}
                  nodeType="klingVideoNode"
                />
              );
            })}
          </CollapsibleGroup>
        ));
      })()}
    </BaseNodeWrapper>
  );
});

KlingVideoNode.displayName = "KlingVideoNode";
export default KlingVideoNode;
