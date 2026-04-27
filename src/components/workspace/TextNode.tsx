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
    <div
      className={cn(
        "workspace-node-shell relative overflow-visible rounded-md border bg-zinc-900 text-zinc-200",
        selected ? "border-zinc-500" : "border-zinc-700",
      )}
      data-state={selected ? "selected" : "idle"}
      style={{ width: 260 }}
    >
      {/* Header — editable name. */}
      <div className="flex items-center gap-1.5 border-b border-zinc-700 bg-zinc-900/80 px-2 py-1.5">
        <Type className="h-3.5 w-3.5 shrink-0 text-blue-400" />
        <input
          value={d.label ?? ""}
          onChange={(e) => updateField("label", e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="nodrag min-w-0 flex-1 truncate bg-transparent text-xs font-medium text-zinc-200 outline-none"
          placeholder="Text name…"
        />
      </div>

      {/* Body — rich-text mention editor. */}
      <div className="p-2">
        <PromptMentionTextarea
          value={d.content ?? ""}
          onChange={onContentChange}
          placeholder='Type "@" to reference another node…'
          excludeNodeId={id}
          // Workspace assets show up under `assetNode`. Include the
          // legacy `inputNode` so a flow imported from the main
          // editor still resolves its mentions here.
          allowedNodeTypes={["assetNode", "inputNode"]}
          className="min-h-[88px] rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs leading-relaxed text-zinc-100 focus-within:border-zinc-600"
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
