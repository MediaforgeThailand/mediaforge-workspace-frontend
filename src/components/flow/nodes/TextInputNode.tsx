/**
 * TextInputNode — A global text variable for prompt injection.
 * Referenced via #[Name](id) syntax in prompts — no edge connections needed.
 * Test2 redesign: matches handoff spec — green accent, no ports, default-value
 * + end-user-view groups, mono footer "referenced via #[name](id)".
 */
import { memo, useCallback } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { Type, Hash } from "lucide-react";
import BaseNodeWrapper from "./BaseNodeWrapper";
import { GroupHeader, ToggleRow } from "./primitives";
import { useLanguage } from "@/contexts/LanguageContext";

export interface TextInputNodeData {
  label: string;
  nodeName?: string;
  fieldLabel?: string;
  textValue?: string;
  placeholder?: string;
  isRequired?: boolean;
  exampleText?: string;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

const TextInputNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as TextInputNodeData;
  const { setNodes } = useReactFlow();
  const { t } = useLanguage();

  const updateNodeData = useCallback(
    (updates: Partial<TextInputNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...updates } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  const displayName = d.nodeName || d.label || "Text Variable";

  return (
    <BaseNodeWrapper
      title={displayName}
      badge="TEXT VAR"
      accent="green"
      icon={Type}
      inputs={[]}
      outputs={[]}
      selected={selected}
      width={280}
      onTitleChange={(name) => updateNodeData({ nodeName: name })}
      footerLeft="referenced via #[name](id)"
      footerRight={d.isRequired ? "required" : "optional"}
    >
      {/* Inline hint banner */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/[0.06] border border-emerald-400/20 text-[10.5px] text-emerald-200/90">
        <Hash className="w-3 h-3 shrink-0" />
        <span>
          No ports — injected as{" "}
          <span className="fs-chip textvar">
            <Hash className="w-2 h-2" />
            {displayName}
          </span>{" "}
          in prompts
        </span>
      </div>

      {/* Default value */}
      <div>
        <GroupHeader label="DEFAULT VALUE" accent="green" />
        <textarea
          value={d.textValue ?? ""}
          onChange={(e) => { stop(e); updateNodeData({ textValue: e.target.value }); }}
          onClick={stop}
          onMouseDown={stop}
          onPointerDown={stop}
          onKeyDown={(e) => {
            if (e.key === "Backspace" || e.key === "Delete") e.stopPropagation();
          }}
          placeholder={d.placeholder || "Enter default value..."}
          className="fs-field fs-field-textarea mt-1.5 min-h-[44px] max-h-[120px] resize-none cursor-text select-text nodrag nopan nowheel"
        />
      </div>

      {/* End-user view */}
      <div>
        <GroupHeader label="END-USER VIEW" accent="green" />
        <div className="mt-1.5 space-y-2">
          <div>
            <label className="block text-[10px] text-white/55 mb-1 font-medium">
              User sees
            </label>
            <input
              type="text"
              value={d.fieldLabel ?? ""}
              onChange={(e) => { stop(e); updateNodeData({ fieldLabel: e.target.value }); }}
              onClick={stop}
              onMouseDown={stop}
              placeholder={t("nodeEnterText")}
              className="fs-field nodrag"
            />
          </div>

          <div>
            <label className="block text-[10px] text-white/55 mb-1 font-medium">
              {t("nodeExampleLabel")}
            </label>
            <input
              type="text"
              value={d.exampleText ?? ""}
              onChange={(e) => { stop(e); updateNodeData({ exampleText: e.target.value }); }}
              onClick={stop}
              onMouseDown={stop}
              placeholder={t("nodeExamplePlaceholder")}
              className="fs-field nodrag"
            />
          </div>

          <div className="flex items-center justify-between px-0.5 pt-0.5">
            <span className="text-[10.5px] text-white/70">{t("nodeRequiredToggle")}</span>
            <ToggleRow
              value={d.isRequired === true}
              onChange={(v) => updateNodeData({ isRequired: v })}
              accent="green"
              labelOn="ON"
              labelOff="OFF"
            />
          </div>
        </div>
      </div>
    </BaseNodeWrapper>
  );
});

TextInputNode.displayName = "TextInputNode";
export default TextInputNode;
