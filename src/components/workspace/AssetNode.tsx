/**
 * Asset Node — minimal container for a user-supplied image/video file.
 *
 * Created when the user drops a file from their OS onto the canvas.
 * The file is uploaded to Supabase storage (`ai-media` bucket) and
 * the node shows a thumbnail + editable name. The name is what other
 * nodes' prompts can @-mention.
 *
 * Only has an output handle — assets are sources, not sinks.
 */

import { memo, useCallback } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { Image as ImageIcon, Film, Music, Loader2, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFreshSignedUrl } from "./useFreshSignedUrl";
import { PortIcon } from "./PortIcon";

export interface AssetNodeData {
  /** Editable label — this is what @-mentions reference. */
  label: string;
  fieldType: "image" | "video" | "audio";
  /** Signed URL (post-upload) or blob URL (pre-upload). */
  previewUrl?: string;
  fileName?: string;
  /** Supabase storage path, populated after upload completes. */
  storagePath?: string;
  uploading?: boolean;
  /**
   * Creator-picked role for this reference. Drives the per-image
   * instruction the backend dispatcher emits in the [Context: …]
   * block (subject preserves face, scene = background only, style =
   * palette/aesthetic only, etc.). Defaults to "general".
   * Mirror of the main project's input-node `referenceType` field.
   */
  referenceType?: ReferenceRole;
}

export type ReferenceRole =
  | "general"
  | "subject"
  | "scene"
  | "style"
  | "object"
  | "pose";

const REFERENCE_ROLE_OPTIONS: Array<{ value: ReferenceRole; label: string }> = [
  { value: "general", label: "General" },
  { value: "subject", label: "Subject (face / identity)" },
  { value: "scene", label: "Scene / background" },
  { value: "style", label: "Style / palette" },
  { value: "object", label: "Object / product" },
  { value: "pose", label: "Pose / composition" },
];

const PORT_COLOR: Record<AssetNodeData["fieldType"], string> = {
  image: "hsl(160 84% 39%)",
  video: "hsl(258 90% 66%)",
  audio: "hsl(43 96% 56%)",
};

const AssetNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as AssetNodeData;
  const { setNodes } = useReactFlow();
  // Re-sign the previewUrl on mount in case it was generated under
  // the old 24h TTL and has since expired. Falls back to the raw
  // URL untouched for blob:/data: URLs and non-Supabase sources.
  const livePreviewUrl = useFreshSignedUrl(d.previewUrl);

  const onLabelChange = useCallback(
    (label: string) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)),
      );
    },
    [id, setNodes],
  );

  const onRoleChange = useCallback(
    (role: ReferenceRole) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, referenceType: role } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  // Preview opens via the canvas-level `onNodeDoubleClick` handler
  // (WorkspaceCanvas → NodePreviewLightbox). Asset node no longer
  // owns its own expanded dialog — single source of truth, and the
  // CSS click-gate stays clean.

  const Icon =
    d.fieldType === "video" ? Film
    : d.fieldType === "audio" ? Music
    : ImageIcon;

  return (
    <div
      className={cn(
        "workspace-node-shell overflow-hidden rounded-md border bg-zinc-900 text-zinc-200",
        selected ? "border-zinc-500" : "border-zinc-700",
      )}
      data-state={selected ? "selected" : "idle"}
      style={{ width: 200 }}
    >
      {/* Title row — editable label for @-mention */}
      <div className="flex items-center gap-1.5 border-b border-zinc-700 bg-zinc-900/80 px-2 py-1">
        <Icon className="h-3 w-3 shrink-0 text-zinc-400" />
        <input
          value={d.label ?? ""}
          onChange={(e) => onLabelChange(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="nodrag min-w-0 flex-1 truncate bg-transparent text-[11px] font-medium text-zinc-200 outline-none"
          placeholder="Name…"
        />
      </div>

      {/* Reference role picker — tells the backend how to USE this asset
          when it's referenced (subject vs scene vs style vs …). */}
      <div className="border-b border-zinc-700 bg-zinc-900/60 px-2 py-1">
        <select
          value={d.referenceType ?? "general"}
          onChange={(e) => onRoleChange(e.target.value as ReferenceRole)}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="nodrag w-full rounded bg-zinc-950 px-1.5 py-0.5 text-[10px] text-zinc-300 outline-none focus:bg-zinc-900"
          title="How should models use this asset when referenced?"
        >
          {REFERENCE_ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Preview — natural aspect ratio. Single click does NOTHING
       *  beyond selecting the node (handled by React Flow). The
       *  fullscreen preview opens on DOUBLE click via the canvas's
       *  onNodeDoubleClick → NodePreviewLightbox path. The
       *  `ws-preview-zone` class also gates pointer-events while
       *  the node isn't selected (see workspace.css). */}
      <div
        className={cn(
          "group relative bg-black ws-preview-zone",
          !d.uploading && d.previewUrl && "cursor-pointer",
        )}
      >
        {livePreviewUrl ? (
          d.fieldType === "video" ? (
            <video
              src={livePreviewUrl}
              muted
              playsInline
              className={cn("block h-auto w-full", d.uploading && "opacity-50")}
              onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
              onMouseLeave={(e) => {
                const v = e.target as HTMLVideoElement;
                v.pause();
                v.currentTime = 0;
              }}
            />
          ) : d.fieldType === "audio" ? (
            <div
              className={cn(
                "flex flex-col items-stretch gap-2 px-3 py-3",
                d.uploading && "opacity-50",
              )}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                <Music className="h-3 w-3 shrink-0 text-amber-400" />
                <span className="truncate font-mono">
                  {d.fileName ?? "audio"}
                </span>
              </div>
              <audio
                src={livePreviewUrl}
                controls
                preload="metadata"
                className="nodrag h-8 w-full"
              />
            </div>
          ) : (
            <img
              src={livePreviewUrl}
              alt={d.label || d.fileName || "asset"}
              className={cn("block h-auto w-full", d.uploading && "opacity-50")}
            />
          )
        ) : (
          <div className="flex aspect-video items-center justify-center text-[11px] text-zinc-500">
            no preview
          </div>
        )}
        {/* Expand affordance on hover */}
        {!d.uploading && d.previewUrl && (
          <div className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Maximize2 className="h-3 w-3 text-white/80" />
          </div>
        )}
        {d.uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-4 w-4 animate-spin text-white/80" />
          </div>
        )}
      </div>

      {/* Output handle — icon at the top-right cluster.
       *  AssetNode emits a single typed output; its glyph reflects
       *  fieldType (image/video/audio) so the user can tell at a
       *  glance what's flowing out without reading the tooltip. */}
      <PortIcon
        dir="source"
        handleId="default"
        label={`${d.fieldType} output`}
        portType={d.fieldType}
        color={PORT_COLOR[d.fieldType]}
        index={0}
      />
    </div>
  );
});

AssetNode.displayName = "AssetNode";
export default AssetNode;
