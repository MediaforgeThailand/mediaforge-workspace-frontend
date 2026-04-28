import { memo, useCallback, useMemo } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import BaseNodeWrapper, { type PortDef } from "./BaseNodeWrapper";
import NodeParamGroups from "./NodeParamGroups";
import { NODE_API_SCHEMA } from "./nodeApiSchema";
import { useCreatorCreditCosts } from "@/hooks/useCreatorCreditCosts";
import { calculateNodeCost } from "@/lib/nodeCostCalculator";

const SCHEMA = NODE_API_SCHEMA.seedDreamNode;

const INPUT_PORTS: PortDef[] = SCHEMA.inputs.map((h) => ({
  id: h.id,
  label: h.label,
  color: h.color,
}));
const OUTPUT_PORTS: PortDef[] = SCHEMA.outputs.map((h) => ({
  id: h.id,
  label: h.label,
  color: h.color,
}));

const SeedDreamNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as { label: string; params: Record<string, unknown>; exposed: Record<string, boolean> };
  const { setNodes } = useReactFlow();

  const params = d.params ?? {};
  const exposed = d.exposed ?? {};
  const selectedModel = (params.model_name as string) ?? SCHEMA.defaultModel;

  const updateParam = useCallback(
    (key: string, value: unknown) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? { ...n, data: { ...n.data, params: { ...(n.data as any).params, [key]: value } } }
            : n,
        ),
      );
    },
    [id, setNodes],
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
    return calculateNodeCost({ schemaKey: "seedDreamNode", params, creditCosts });
  }, [params, creditCosts]);

  const exposedCount = Object.values(exposed).filter(Boolean).length;

  return (
    <BaseNodeWrapper
      title={(params as any).nodeName || SCHEMA.displayName}
      onTitleChange={(name) => updateParam("nodeName", name)}
      badge="AI PROCESS"
      accent={SCHEMA.accentColor}
      icon={Sparkles}
      inputs={INPUT_PORTS}
      outputs={OUTPUT_PORTS}
      selected={selected}
      width={300}
      creditCost={nodeCost}
      creditCostLoading={creditCostsLoading}
      footerLeft={
        exposedCount > 0
          ? `${exposedCount} param${exposedCount > 1 ? "s" : ""} exposed`
          : "No params exposed"
      }
      footerRight={selectedModel}
    >
      <NodeParamGroups
        nodeType="seedDreamNode"
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

SeedDreamNode.displayName = "SeedDreamNode";
export default SeedDreamNode;
