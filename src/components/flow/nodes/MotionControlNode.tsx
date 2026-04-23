import { memo, useCallback, useMemo } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { Move } from "lucide-react";
import { NODE_API_SCHEMA, getVisibleParams, cleanParamsOnModelChange, type ParamDef } from "./nodeApiSchema";
import NodeParamRenderer from "./NodeParamRenderer";
import BaseNodeWrapper, { type PortDef } from "./BaseNodeWrapper";
import { useCreatorCreditCosts } from "@/hooks/useCreatorCreditCosts";
import { calculateNodeCost } from "@/lib/nodeCostCalculator";

const SCHEMA = NODE_API_SCHEMA.motionControlNode;

/** @deprecated Use NODE_API_SCHEMA.motionControlNode.params instead */
export const MOTION_PARAMS = SCHEMA.params;
export type { ParamDef as MotionParam };

export interface MotionControlNodeData {
  label: string;
  params: Record<string, unknown>;
  exposed: Record<string, boolean>;
}

const MotionControlNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as MotionControlNodeData;
  const { setNodes } = useReactFlow();

  const updateNodeField = useCallback(
    (field: string, value: unknown) => {
      setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n));
    },
    [id, setNodes],
  );

  const params = d.params ?? {};
  const exposed = d.exposed ?? {};
  const selectedModel = (params.model_name as string) ?? SCHEMA.defaultModel;

  const visibleParams = useMemo(
    () => getVisibleParams("motionControlNode", selectedModel),
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
            const cleaned = cleanParamsOnModelChange("motionControlNode", String(value), prevParams);
            return { ...n, data: { ...n.data, params: cleaned } };
          }

          return {
            ...n,
            data: { ...n.data, params: { ...prevParams, [key]: value } },
          };
        }),
      );
    },
    [id, setNodes],
  );

  const exposedCount = Object.values(exposed).filter(Boolean).length;

  const inputPorts: PortDef[] = SCHEMA.inputs.map((inp) => ({
    id: inp.id,
    label: inp.label,
    color: inp.color,
  }));

  const outputPorts: PortDef[] = SCHEMA.outputs.map((out) => ({
    id: out.id,
    label: out.label,
    color: out.color,
  }));

  const { data: creditCosts } = useCreatorCreditCosts();
  const nodeCost = useMemo(() => {
    if (!creditCosts) return null;
    return calculateNodeCost({ schemaKey: "motionControlNode", params, creditCosts });
  }, [params, creditCosts]);

  return (
    <BaseNodeWrapper
      title={d.params?.nodeName as string || SCHEMA.displayName}
      onTitleChange={(name) => updateNodeField("params", { ...params, nodeName: name })}
      badge={SCHEMA.category}
      accent={SCHEMA.accentColor}
      icon={Move}
      inputs={inputPorts}
      outputs={outputPorts}
      selected={selected}
      width={300}
      creditCost={nodeCost}
      footerLeft={exposedCount > 0 ? `${exposedCount} param${exposedCount > 1 ? "s" : ""} exposed` : "No params exposed"}
      footerRight={selectedModel}
    >
      {visibleParams.map((param) => (
        <NodeParamRenderer
          key={param.key}
          param={param}
          value={params[param.key]}
          isExposed={exposed[param.key] ?? false}
          accentColor="cyan"
          selectedModel={selectedModel}
          onUpdateParam={updateParam}
          onToggleExpose={toggleExpose}
          nodeId={id}
          nodeType="motionControlNode"
        />
      ))}
    </BaseNodeWrapper>
  );
});

MotionControlNode.displayName = "MotionControlNode";
export default MotionControlNode;
