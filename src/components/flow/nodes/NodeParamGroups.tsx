/**
 * NodeParamGroups — Renders a node's visible params bucketed into
 * CollapsibleGroups. Handles model_name → ModelSelectButton swap.
 *
 * Test2 redesign: model row uses `.fs-param-row` shell with `EyeBtn`.
 */
import { memo, useCallback } from "react";
import { groupVisibleParams, type ParamDef } from "./nodeApiSchema";
import NodeParamRenderer from "./NodeParamRenderer";
import { CollapsibleGroup, ModelSelectButton, EyeBtn } from "./primitives";
import { cn } from "@/lib/utils";

interface NodeParamGroupsProps {
  nodeType: string;
  nodeId: string;
  params: Record<string, unknown>;
  exposed: Record<string, boolean>;
  selectedModel: string;
  accent: string;
  onUpdateParam: (key: string, value: unknown) => void;
  onToggleExpose: (key: string) => void;
}

const NodeParamGroups = memo(({
  nodeType,
  nodeId,
  params,
  exposed,
  selectedModel,
  accent,
  onUpdateParam,
  onToggleExpose,
}: NodeParamGroupsProps) => {
  const groups = groupVisibleParams(nodeType, selectedModel);

  return (
    <>
      {groups.map((group) => (
        <CollapsibleGroup
          key={group.label}
          label={group.label}
          accent={accent}
          defaultOpen
          count={group.params.length}
        >
          {group.params.map((param) => {
            // Special-case the primary model selector with the rich 2-line button
            if (param.key === "model_name" && param.type === "select") {
              return (
                <ModelParamRow
                  key={param.key}
                  param={param}
                  value={String(params[param.key] ?? param.default)}
                  isExposed={exposed[param.key] ?? false}
                  accent={accent}
                  onChange={(v) => onUpdateParam(param.key, v)}
                  onToggleExpose={() => onToggleExpose(param.key)}
                />
              );
            }

            return (
              <NodeParamRenderer
                key={param.key}
                param={param}
                value={params[param.key]}
                isExposed={exposed[param.key] ?? false}
                accentColor={accent}
                selectedModel={selectedModel}
                onUpdateParam={onUpdateParam}
                onToggleExpose={onToggleExpose}
                nodeId={nodeId}
                nodeType={nodeType}
              />
            );
          })}
        </CollapsibleGroup>
      ))}
    </>
  );
});

NodeParamGroups.displayName = "NodeParamGroups";
export default NodeParamGroups;

/* ─── Internal: model row using ModelSelectButton ─── */
interface ModelParamRowProps {
  param: ParamDef;
  value: string;
  isExposed: boolean;
  accent: string;
  onChange: (v: string) => void;
  onToggleExpose: () => void;
}

const ModelParamRow = memo(({
  param,
  value,
  isExposed,
  accent,
  onChange,
  onToggleExpose,
}: ModelParamRowProps) => {
  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);
  return (
    <div className={cn("fs-param-row group", isExposed && "exposed")}>
      <div className="flex items-center justify-between gap-2 mb-1.5" onMouseDown={stop}>
        <span className="flex items-center gap-1 text-[10.5px] font-medium text-white/75">
          {param.label}
          {param.required && <span className="text-red-400">*</span>}
        </span>
        <EyeBtn on={isExposed} onClick={onToggleExpose} />
      </div>
      <ModelSelectButton
        value={value}
        options={param.options ?? []}
        optionLabels={param.optionLabels}
        onChange={onChange}
        accent={accent}
      />
    </div>
  );
});

ModelParamRow.displayName = "ModelParamRow";
