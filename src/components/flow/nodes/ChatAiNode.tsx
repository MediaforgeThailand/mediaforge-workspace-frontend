import { memo, useCallback, useMemo } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { MessageSquare } from "lucide-react";
import { NODE_API_SCHEMA } from "./nodeApiSchema";
import NodeParamGroups from "./NodeParamGroups";
import BaseNodeWrapper, { type PortDef } from "./BaseNodeWrapper";
import { useCreatorCreditCosts } from "@/hooks/useCreatorCreditCosts";
import { calculateNodeCost } from "@/lib/nodeCostCalculator";

export interface ChatAiNodeData {
  label: string;
  params: Record<string, unknown>;
  exposed: Record<string, boolean>;
}

const schema = NODE_API_SCHEMA.chatAiNode;

const ChatAiNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as ChatAiNodeData;
  const { setNodes } = useReactFlow();

  const updateNodeField = useCallback(
    (field: string, value: unknown) => {
      setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n));
    },
    [id, setNodes],
  );

  const params = d.params ?? {};
  const exposed = d.exposed ?? {};
  const selectedModel = (params.model_name as string) ?? schema.defaultModel;

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
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: { ...n.data, params: { ...(n.data as any).params, [key]: value } },
              }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const exposedCount = Object.values(exposed).filter(Boolean).length;

  const inputPorts: PortDef[] = schema.inputs.map((inp) => ({
    id: inp.id,
    label: inp.label,
    color: inp.color,
  }));

  const outputPorts: PortDef[] = schema.outputs.map((out) => ({
    id: out.id,
    label: out.label,
    color: out.color,
  }));

  const { data: creditCosts } = useCreatorCreditCosts();
  const nodeCost = useMemo(() => {
    if (!creditCosts) return null;
    return calculateNodeCost({ schemaKey: "chatAiNode", params, creditCosts });
  }, [params, creditCosts]);

  return (
    <BaseNodeWrapper
      title={d.params?.nodeName as string || schema.displayName}
      onTitleChange={(name) => updateNodeField("params", { ...params, nodeName: name })}
      badge={schema.category}
      accent={schema.accentColor}
      icon={MessageSquare}
      inputs={inputPorts}
      outputs={outputPorts}
      selected={selected}
      width={300}
      creditCost={nodeCost}
      footerLeft={exposedCount > 0 ? `${exposedCount} param${exposedCount > 1 ? "s" : ""} exposed` : "No params exposed"}
      footerRight={selectedModel}
    >
      <NodeParamGroups
        nodeType="chatAiNode"
        nodeId={id}
        params={params}
        exposed={exposed}
        selectedModel={selectedModel}
        accent={schema.accentColor}
        onUpdateParam={updateParam}
        onToggleExpose={toggleExpose}
      />
    </BaseNodeWrapper>
  );
});

ChatAiNode.displayName = "ChatAiNode";
export default ChatAiNode;
