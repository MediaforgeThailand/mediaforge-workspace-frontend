/**
 * Asset Expanded Dialog — shown when the user clicks an AssetNode's
 * preview area. Displays the image/video at a usable size and lists
 * the tools that can be applied to this asset.
 *
 * Clicking a tool creates the matching AI node on the canvas and
 * auto-connects the asset's output → the new node's input.
 */

import { useMemo } from "react";
import { Scissors, Film, Sparkles, Image as ImageIcon, Music, type LucideIcon } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import type { AssetNodeData } from "./AssetNode";
import { AudioPlayButton } from "./AudioPlayButton";

interface ToolOption {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** NODE_API_SCHEMA key of the AI tool to create. */
  nodeType: string;
  /** Default label on the new node. */
  nodeLabel: string;
  /** Input handle id on the new node to connect the asset to. */
  targetHandle: string;
}

/** Tools available when the asset is an IMAGE. */
const IMAGE_TOOLS: ToolOption[] = [
  {
    id: "remove-bg",
    label: "Remove Background",
    description: "Cut the subject out of its background",
    icon: Scissors,
    nodeType: "removeBackgroundNode",
    nodeLabel: "Remove Background",
    targetHandle: "image",
  },
  {
    id: "kling-video",
    label: "Animate to Video",
    description: "Image → video via Kling",
    icon: Film,
    nodeType: "klingVideoNode",
    nodeLabel: "Kling Video",
    targetHandle: "start_frame",
  },
  {
    id: "seed-dance",
    label: "SeedDance",
    description: "Image → video via SeedDance",
    icon: Sparkles,
    nodeType: "seedDanceNode",
    nodeLabel: "SeedDance",
    targetHandle: "start_frame",
  },
];

/** Tools available when the asset is a VIDEO. */
const VIDEO_TOOLS: ToolOption[] = [
  // Nothing wired yet — wireframe only. Adding video-edit tools here later.
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  data: AssetNodeData;
}

const AssetExpandedDialog = ({ open, onOpenChange, nodeId, data }: Props) => {
  const tools = useMemo(
    () => (data.fieldType === "image" ? IMAGE_TOOLS : VIDEO_TOOLS),
    [data.fieldType],
  );

  const applyTool = (tool: ToolOption) => {
    const store = useWorkspaceStore.getState();
    const sourceNode = store.current?.nodes.find((n) => n.id === nodeId);
    if (!sourceNode) return;

    const position = {
      x: sourceNode.position.x + 320,
      y: sourceNode.position.y,
    };
    const newNodeId = store.addSchemaNode(tool.nodeType, tool.nodeLabel, position);

    store.onConnect({
      source: nodeId,
      sourceHandle: "default",
      target: newNodeId,
      targetHandle: tool.targetHandle,
    } as any);

    onOpenChange(false);
  };

  const Icon =
    data.fieldType === "video" ? Film
      : data.fieldType === "audio" ? Music
      : ImageIcon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 p-0">
        <DialogHeader className="border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-zinc-400" />
            <DialogTitle className="text-sm font-medium">
              {data.label || data.fileName || "Asset"}
            </DialogTitle>
          </div>
          {data.fileName && data.fileName !== data.label && (
            <DialogDescription className="mt-1 truncate text-[11px]">
              {data.fileName}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex max-h-[75vh] flex-col gap-0 md:flex-row">
          {/* Preview */}
          <div className="flex min-h-[320px] flex-1 items-center justify-center overflow-hidden bg-black">
            {data.previewUrl ? (
              data.fieldType === "video" ? (
                <video
                  src={data.previewUrl}
                  controls
                  className="max-h-[75vh] max-w-full object-contain"
                />
              ) : data.fieldType === "audio" ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-zinc-900/80 p-8">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Audio
                  </div>
                  <AudioPlayButton
                    src={data.previewUrl}
                    label={data.label || data.fileName || "Play audio"}
                    buttonClassName="h-14 w-14"
                  />
                </div>
              ) : (
                <img
                  src={data.previewUrl}
                  alt={data.label || data.fileName || "asset"}
                  className="max-h-[75vh] max-w-full object-contain"
                />
              )
            ) : (
              <div className="text-xs text-zinc-500">no preview</div>
            )}
          </div>

          {/* Tool sidebar */}
          <aside className="flex w-full shrink-0 flex-col bg-zinc-950 md:w-72 md:border-t-0">
            <div className="border-b border-zinc-800 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Apply tool
            </div>
            {tools.length === 0 ? (
              <div className="p-4 text-xs text-zinc-500">
                No tools available for this asset type yet.
              </div>
            ) : (
              <ul className="flex-1 space-y-1 overflow-y-auto p-2">
                {tools.map((t) => {
                  const ToolIcon = t.icon;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => applyTool(t)}
                        className="flex w-full items-start gap-2 rounded bg-zinc-900 px-3 py-2 text-left hover:bg-zinc-800"
                      >
                        <ToolIcon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-zinc-100">{t.label}</div>
                          <div className="text-[11px] leading-snug text-zinc-500">
                            {t.description}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500">
              Clicking a tool adds it to the canvas and wires it to this asset.
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssetExpandedDialog;
