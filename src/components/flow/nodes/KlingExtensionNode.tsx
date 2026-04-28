import { memo, useCallback, useMemo } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { FastForward, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNodeCreditCosts as useCreatorCreditCosts } from "@/hooks/useNodeCreditCosts";
import { calculateNodeCost } from "@/lib/nodeCostCalculator";
import BaseNodeWrapper, { type PortDef } from "./BaseNodeWrapper";

/* ─── Parameter definition ─── */
export interface ExtensionParam {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "slider";
  options?: string[];
  default: string | number;
  min?: number;
  max?: number;
  step?: number;
}

export const EXTENSION_PARAMS: ExtensionParam[] = [
  { key: "model_version", label: "Model Version", type: "select", options: ["kling-v2-6", "kling-v3-pro"], default: "kling-v2-6" },
  { key: "prompt", label: "Prompt", type: "textarea", default: "" },
  { key: "negative_prompt", label: "Negative Prompt", type: "textarea", default: "" },
  { key: "cfg_scale", label: "CFG Scale", type: "slider", default: 0.5, min: 0, max: 1, step: 0.05 },
  { key: "extend_duration", label: "Extend Duration (s)", type: "select", options: ["3", "5", "10"], default: "5" },
];

export interface KlingExtensionNodeData {
  label: string;
  params: Record<string, unknown>;
  exposed: Record<string, boolean>;
}

const INPUT_PORTS: PortDef[] = [{ id: "source_video", label: "source_video", color: "violet" }];
const OUTPUT_PORTS: PortDef[] = [{ id: "video", label: "VIDEO", color: "emerald" }];

const KlingExtensionNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as KlingExtensionNodeData;
  const { setNodes } = useReactFlow();

  const updateNodeField = useCallback(
    (field: string, value: unknown) => {
      setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n));
    },
    [id, setNodes],
  );

  const params = d.params ?? {};
  const exposed = d.exposed ?? {};

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

  const { data: creditCosts } = useCreatorCreditCosts();
  const nodeCost = useMemo(() => {
    if (!creditCosts) return null;
    return calculateNodeCost({ schemaKey: "klingExtensionNode", params, creditCosts });
  }, [params, creditCosts]);

  const exposedCount = Object.values(exposed).filter(Boolean).length;

  return (
    <BaseNodeWrapper
      title={(params as any).nodeName || "Kling Extension"}
      onTitleChange={(name) => updateNodeField("params", { ...params, nodeName: name })}
      badge="AI PROCESS"
      accent="orange"
      icon={FastForward}
      inputs={INPUT_PORTS}
      outputs={OUTPUT_PORTS}
      selected={selected}
      width={300}
      creditCost={nodeCost}
      footerLeft={exposedCount > 0 ? `${exposedCount} param${exposedCount > 1 ? "s" : ""} exposed` : "No params exposed"}
    >
      {EXTENSION_PARAMS.map((param) => {
        const value = params[param.key] ?? param.default;
        const isExposed = exposed[param.key] ?? false;

        return (
          <div key={param.key} className="group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium tracking-wider text-white/40">
                {param.label}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpose(param.key);
                }}
                className={cn(
                  "w-5 h-5 flex items-center justify-center rounded transition-colors",
                  isExposed
                    ? "text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                    : "text-white/20 hover:text-white/40 hover:bg-white/[0.05] opacity-0 group-hover:opacity-100",
                )}
                title={isExposed ? "Exposed to user — click to hide" : "Hidden — click to expose"}
              >
                {isExposed ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
            </div>

            {param.type === "textarea" ? (
              <textarea
                value={String(value)}
                onChange={(e) => updateParam(param.key, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-[11px] text-white/70 resize-none min-h-[40px] focus:outline-none focus:border-white/20 transition-colors placeholder:text-white/20 nodrag nopan"
                placeholder={`Enter ${param.label.toLowerCase()}...`}
              />
            ) : param.type === "select" && param.options ? (
              <select
                value={String(value)}
                onChange={(e) => { e.stopPropagation(); updateParam(param.key, e.target.value); }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-[11px] text-white/70 focus:outline-none focus:border-white/20 transition-colors nodrag"
              >
                {param.options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : param.type === "slider" ? (
              <div className="flex items-center gap-2 nodrag" onMouseDown={(e) => e.stopPropagation()}>
                <input
                  type="range"
                  min={param.min ?? 0}
                  max={param.max ?? 1}
                  step={param.step ?? 0.05}
                  value={Number(value)}
                  onChange={(e) => updateParam(param.key, parseFloat(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="flex-1 h-1 rounded-full accent-orange-500"
                />
                <span className="text-[10px] font-mono text-white/50 w-8 text-right tabular-nums">
                  {Number(value).toFixed(2)}
                </span>
              </div>
            ) : (
              <input
                type="text"
                value={String(value)}
                onChange={(e) => updateParam(param.key, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-[11px] text-white/70 focus:outline-none focus:border-white/20 transition-colors nodrag"
              />
            )}
          </div>
        );
      })}
    </BaseNodeWrapper>
  );
});

KlingExtensionNode.displayName = "KlingExtensionNode";
export default KlingExtensionNode;
