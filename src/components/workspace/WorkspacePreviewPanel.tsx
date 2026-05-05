/**
 * Preview panel — right side.
 *
 * Params live inside each node (handled by NodeParamGroups). This
 * panel is now preview-only — a bigger space to inspect the selected
 * node's last output.
 */

import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { NODE_API_SCHEMA } from "@/components/flow/nodes/nodeApiSchema";
import { useLanguage } from "@/contexts/LanguageContext";

const WorkspacePreviewPanel = () => {
  const { t: i18n } = useLanguage();
  const selectedNodeId = useWorkspaceStore((s) => s.selectedNodeId);
  const node = useWorkspaceStore((s) =>
    s.current?.nodes.find((n) => n.id === selectedNodeId) ?? null,
  );

  if (!node) {
    return (
      <aside className="flex h-full w-[320px] shrink-0 flex-col bg-zinc-950 text-zinc-300">
        <div className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {i18n("common.preview")}
        </div>
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-zinc-500">
          {i18n("workspace.previewPanel.selectNodeToInspectItsOutput")}
        </div>
      </aside>
    );
  }

  const schema = NODE_API_SCHEMA[node.type ?? ""];
  const d = node.data ?? ({} as any);
  const title = d.label ?? schema?.displayName ?? node.type;
  const selectedModel = (d.params?.model_name as string) ?? schema?.defaultModel ?? "—";

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col bg-zinc-950 text-zinc-200">
      <div className="border-b border-zinc-800 px-3 py-2">
        <div className="text-sm font-medium leading-tight">{title}</div>
        <div className="truncate text-[11px] text-zinc-500">{selectedModel}</div>
      </div>

      <div className="p-3">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">{i18n("common.output")}</div>
        <div className="flex aspect-video w-full items-center justify-center rounded border border-dashed border-zinc-700 bg-zinc-900 text-xs text-zinc-500">
          {i18n("workspace.previewPanel.noOutputYet")}
        </div>
      </div>

      <div className="mt-auto px-3 py-2 text-[11px] text-zinc-500">
        {i18n("workspace.previewPanel.editParametersDirectlyOnNode")}
      </div>
    </aside>
  );
};

export default WorkspacePreviewPanel;
