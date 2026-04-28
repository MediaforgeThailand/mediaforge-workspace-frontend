/**
 * Text Node — a reusable prompt block.
 *
 * Body uses the legacy `PromptMentionTextarea` so @mentions render as
 * blue chips (atomic — backspace deletes the whole pill in one go).
 * Tokens are serialised on the wire as `@[Label](nodeId)`, which the
 * backend's `workspace-run-node` dispatcher rewrites into positional
 * "image N" references plus a `[Context: …]` block before calling
 * the model.
 *
 * Data shape:
 *   { label: string     // editable; other nodes can @-mention it
 *   , content: string   // raw payload, contains @[Label](nodeId) tokens
 *   }
 */

import { memo, useCallback, useMemo } from "react";
import {
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import { Type, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import PromptMentionTextarea from "@/components/flow/nodes/PromptMentionTextarea";
import { PortIcon } from "./PortIcon";

interface TextNodeData {
  label: string;
  content: string;
}

const TEXT_COLOR = "hsl(217 91% 60%)"; // blue — text output

const TextNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as TextNodeData;
  const { setNodes } = useReactFlow();

  const updateField = useCallback(
    (field: "label" | "content", value: string) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n)),
      );
    },
    [id, setNodes],
  );

  const onContentChange = useCallback(
    (v: string) => updateField("content", v),
    [updateField],
  );

  // Token count derived from serialised form — used by the footer chip.
  const mentionCount = useMemo(() => {
    const text = d.content ?? "";
    const matches = text.match(/@\[[^\]]+\]\([^)]+\)/g);
    return matches?.length ?? 0;
  }, [d.content]);

  return (
    // Outer wrapper — `overflow-visible` so the floating title sits
    // OUTSIDE the body box and ports can overhang the corners.
    <div
      className="ws-clean-node relative"
      data-state={selected ? "selected" : "idle"}
      style={{ width: 260 }}
    >
      {/* Floating title — icon + editable name, NO background, NO
       *  border, sits above the body (matches the design reference). */}
      <div className="ws-clean-title">
        <Type className="ws-clean-title-icon" style={{ color: TEXT_COLOR }} />
        <input
          value={d.label ?? ""}
          onChange={(e) => updateField("label", e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="ws-clean-title-input nodrag"
          placeholder="Text name…"
        />
      </div>

      {/* Body — single clean rounded box, no internal dividers. */}
      <div
        className={cn(
          "workspace-node-shell ws-clean-body",
          selected && "is-selected",
        )}
        data-state={selected ? "selected" : "idle"}
      >
        <PromptMentionTextarea
          value={d.content ?? ""}
          onChange={onContentChange}
          placeholder='Try "Happy dog with sunglasses and floating ring"'
          excludeNodeId={id}
          // Workspace assets show up under `assetNode`. Include the
          // legacy `inputNode` so a flow imported from the main
          // editor still resolves its mentions here.
          allowedNodeTypes={["assetNode", "inputNode"]}
          className="ws-clean-textarea min-h-[110px] text-xs leading-relaxed text-zinc-100"
        />

        {mentionCount > 0 && (
          <div className="mt-1 flex items-center gap-1 text-[9px] text-zinc-500">
            <AtSign className="h-2.5 w-2.5" />
            {mentionCount} ref{mentionCount === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {/* Output handle — text-typed icon at the top-right cluster. */}
      <PortIcon
        dir="source"
        handleId="default"
        label="Text output"
        portType="text"
        color={TEXT_COLOR}
        index={0}
      />
    </div>
  );
});

TextNode.displayName = "TextNode";
export default TextNode;
