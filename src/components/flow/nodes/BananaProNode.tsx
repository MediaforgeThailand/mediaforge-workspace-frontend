import { memo, useCallback, useMemo } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import BaseNodeWrapper, { type PortDef } from "./BaseNodeWrapper";
import NodeParamGroups from "./NodeParamGroups";
import { NODE_API_SCHEMA } from "./nodeApiSchema";
import { useNodeCreditCosts as useCreatorCreditCosts } from "@/hooks/useNodeCreditCosts";
import { calculateNodeCost } from "@/lib/nodeCostCalculator";

export interface BananaProNodeData {
  label: string;
  params: Record<string, unknown>;
  exposed: Record<string, boolean>;
}

const SCHEMA = NODE_API_SCHEMA.bananaProNode;

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

const BananaProNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as BananaProNodeData;
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

  const { data: creditCosts } = useCreatorCreditCosts();
  const nodeCost = useMemo(() => {
    if (!creditCosts) return null;
    return calculateNodeCost({ schemaKey: "bananaProNode", params, creditCosts });
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
      footerLeft={
        exposedCount > 0
          ? `${exposedCount} param${exposedCount > 1 ? "s" : ""} exposed`
          : "No params exposed"
      }
      footerRight={selectedModel}
    >
      <NodeParamGroups
        nodeType="bananaProNode"
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

BananaProNode.displayName = "BananaProNode";
export default BananaProNode;
