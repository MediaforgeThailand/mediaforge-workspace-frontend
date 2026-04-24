import { memo, useCallback, useMemo } from "react";
import { type NodeProps, useReactFlow, useEdges } from "@xyflow/react";
import { Film } from "lucide-react";
import BaseNodeWrapper, { type PortDef } from "./BaseNodeWrapper";
import NodeParamGroups from "./NodeParamGroups";
import {
  NODE_API_SCHEMA,
  getVisibleInputs,
  cleanParamsOnModelChange,
  getRemovedHandleIds,
} from "./nodeApiSchema";
import { useCreatorCreditCosts } from "@/hooks/useCreatorCreditCosts";
import { calculateNodeCost } from "@/lib/nodeCostCalculator";

const SCHEMA = NODE_API_SCHEMA.seedDanceNode;

const OUTPUT_PORTS: PortDef[] = SCHEMA.outputs.map((h) => ({
  id: h.id,
  label: h.label,
  color: h.color,
}));

const SeedDanceNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as { label: string; params: Record<string, unknown>; exposed: Record<string, boolean> };
  const { setNodes, setEdges } = useReactFlow();

  const params = d.params ?? {};
  const exposed = d.exposed ?? {};
  const selectedModel = (params.model_name as string) ?? SCHEMA.defaultModel;

  const visibleInputs = useMemo(
    () => getVisibleInputs("seedDanceNode", selectedModel),
    [selectedModel],
  );

  const inputPorts: PortDef[] = visibleInputs.map((inp) => ({
    id: inp.id,
    label: inp.label,
    color: inp.color,
  }));

  const updateParam = useCallback(
    (key: string, value: unknown) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prevParams = (n.data as any).params ?? {};

          if (key === "model_name") {
            const cleaned = cleanParamsOnModelChange("seedDanceNode", String(value), prevParams);
            const removedHandles = getRemovedHandleIds("seedDanceNode", String(value));
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

  const { data: creditCosts, isLoading: creditCostsLoading } = useCreatorCreditCosts();
  const nodeCost = useMemo(() => {
    if (!creditCosts) return null;
    return calculateNodeCost({ schemaKey: "seedDanceNode", params, creditCosts });
  }, [params, creditCosts]);

  const exposedCount = Object.values(exposed).filter(Boolean).length;

  return (
    <BaseNodeWrapper
      title={(params as any).nodeName || SCHEMA.displayName}
      onTitleChange={(name) => updateParam("nodeName", name)}
      badge="AI PROCESS"
      accent={SCHEMA.accentColor}
      icon={Film}
      inputs={inputPorts}
      outputs={OUTPUT_PORTS}
      selected={selected}
      width={300}
      creditCost={nodeCost}
      creditCostLoading={creditCostsLoading}
      creditCostSuffix={` (${params.duration ?? 5}s)`}
      footerLeft={
        exposedCount > 0
          ? `${exposedCount} param${exposedCount > 1 ? "s" : ""} exposed`
          : "No params exposed"
      }
      footerRight={selectedModel}
    >
      <NodeParamGroups
        nodeType="seedDanceNode"
        nodeId={id}
        params={params}
        exposed={exposed}
        selectedModel={selectedModel}
        accent={SCHEMA.accentColor}
        onUpdateParam={updateParam}
        onToggleExpose={toggleExpose}
      />
    </BaseNodeWrapper>
  );
});

SeedDanceNode.displayName = "SeedDanceNode";
export default SeedDanceNode;
