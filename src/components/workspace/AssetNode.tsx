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

import { memo, useCallback, useMemo, useState } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { Image as ImageIcon, Film, Music, Box, Loader2, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFreshSignedUrl } from "./useFreshSignedUrl";
import { PortIcon } from "./PortIcon";
import { MiniSelect } from "./CompactParamWidgets";
import { useLanguage } from "@/contexts/LanguageContext";
import { AudioPlayButton } from "./AudioPlayButton";

export interface AssetNodeData {
  /** Editable label — this is what @-mentions reference. */
  label: string;
  fieldType: "image" | "video" | "audio" | "model3d";
  /** Signed URL (post-upload) or blob URL (pre-upload). */
  previewUrl?: string;
  /** Optional poster image — for 3D models, this is the
   *  rendered_image PNG that shows while the GLB streams in (or
   *  permanently if model-viewer can't load the mesh). Saves the
   *  tile from rendering as a black box. */
  posterUrl?: string;
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
  /** User-controlled card width via the corner resize handle. Default
   *  219. Same field-name + range used by WorkspaceToolNode so the
   *  resize gesture feels identical across node types. */
  compactWidth?: number;
}

export type ReferenceRole =
  | "general"
  | "subject"
  | "scene"
  | "style"
  | "object"
  | "pose";

type RoleLabelKey =
  | "workspace.node.role_general"
  | "workspace.node.role_subject"
  | "workspace.node.role_scene"
  | "workspace.node.role_style"
  | "workspace.node.role_object"
  | "workspace.node.role_pose";

const REFERENCE_ROLE_OPTIONS: Array<{ value: ReferenceRole; labelKey: RoleLabelKey }> = [
  { value: "general", labelKey: "workspace.node.role_general" },
  { value: "subject", labelKey: "workspace.node.role_subject" },
  { value: "scene", labelKey: "workspace.node.role_scene" },
  { value: "style", labelKey: "workspace.node.role_style" },
  { value: "object", labelKey: "workspace.node.role_object" },
  { value: "pose", labelKey: "workspace.node.role_pose" },
];

const PORT_COLOR: Record<AssetNodeData["fieldType"], string> = {
  image: "hsl(160 84% 39%)",
  video: "hsl(258 90% 66%)",
  audio: "hsl(43 96% 56%)",
  model3d: "hsl(43 96% 56%)",
};

const WORKSPACE_NODE_UI_SCALE = 1.15;
const DEFAULT_ASSET_NODE_WIDTH = 219;

const AssetNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as AssetNodeData;
  const { setNodes } = useReactFlow();
  const { t } = useLanguage();
  const [isHovered, setIsHovered] = useState(false);
  // Re-sign the previewUrl on mount in case it was generated under
  // the old 24h TTL and has since expired. Falls back to the raw
  // URL untouched for blob:/data: URLs and non-Supabase sources.
  // 3D models render statically from `posterUrl` here — the GLB
  // mirror only happens when the user opens the lightbox, so we
  // don't need useMirroredTripoUrl on this path.
  const imagePreviewTransform = useMemo(
    () => ({
      width: Math.max(
        512,
        Math.min(
          1280,
          Math.ceil(
            ((d.compactWidth ?? DEFAULT_ASSET_NODE_WIDTH) as number) *
              WORKSPACE_NODE_UI_SCALE *
              2,
          ),
        ),
      ),
      quality: 82,
      resize: "contain" as const,
    }),
    [d.compactWidth],
  );
  const livePreviewUrl = useFreshSignedUrl(
    d.previewUrl,
    d.fieldType === "image" || d.fieldType === "model3d"
      ? imagePreviewTransform
      : undefined,
  );
  const livePosterUrl = useFreshSignedUrl(
    d.posterUrl,
    d.fieldType === "model3d" ? imagePreviewTransform : undefined,
  );

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

  /* ── Manual resize via the bottom-right corner handle ──────
   * Same drag-to-scale gesture WorkspaceToolNode uses. Width
   * drives the layout; the inner image keeps its natural aspect
   * ratio inside the new card width. Title input + role picker
   * stay at fixed pixel sizes. */
  const onResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth =
        (d.compactWidth as number | undefined) ?? DEFAULT_ASSET_NODE_WIDTH;
      const onMove = (ev: PointerEvent) => {
        const delta = (ev.clientX - startX) / WORKSPACE_NODE_UI_SCALE;
        const next = Math.max(
          160,
          Math.min(640, Math.round(startWidth + delta)),
        );
        setNodes((ns) =>
          ns.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, compactWidth: next } }
              : n,
          ),
        );
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.classList.remove("ws-resizing");
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      document.body.classList.add("ws-resizing");
    },
    [id, d.compactWidth, setNodes],
  );

  // Preview opens via the canvas-level `onNodeDoubleClick` handler
  // (WorkspaceCanvas → NodePreviewLightbox). Asset node no longer
  // owns its own expanded dialog — single source of truth, and the
  // CSS click-gate stays clean.

  const Icon =
    d.fieldType === "video" ? Film
    : d.fieldType === "audio" ? Music
    : d.fieldType === "model3d" ? Box
    : ImageIcon;
  // Title icon stays neutral grey across every node type — team
  // feedback was that a multi-coloured canvas was too noisy. The
  // glyph alone (Image vs Film vs Music vs Box) is what now signals
  // the field type. PORT_COLOR is still exported below for the
  // actual port handle / wire colour, which DOES stay tinted.

  return (
    <div
      className="ws-clean-node relative"
      data-state={selected ? "selected" : "idle"}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      // Default tile width — 219 (200 → 230 → 219). Now also
      // user-resizable via the corner handle below; persists in
      // `data.compactWidth` so the card keeps the chosen size
      // across re-mounts. Inner text (label input, role picker
      // chip) stays at fixed pixel sizes so the gesture only
      // enlarges the visual tile.
      style={{
        width:
          ((d.compactWidth as number | undefined) ??
            DEFAULT_ASSET_NODE_WIDTH) * WORKSPACE_NODE_UI_SCALE,
      }}
    >
      {/* Floating title — icon + editable name. */}
      <div className="ws-clean-title">
        <Icon
          className="ws-clean-title-icon text-zinc-400"
          strokeWidth={2.25}
        />
        <input
          value={d.label ?? ""}
          onChange={(e) => onLabelChange(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="ws-clean-title-input nodrag"
          placeholder={t("workspace.node.asset_name_placeholder")}
        />
      </div>

      {/* Body — single rounded card holding the preview. The role
       *  picker used to sit at the TOP as a permanent select chip,
       *  but team feedback was that it cluttered the asset card
       *  and looked nothing like the AI-gen tool nodes (whose
       *  settings live in a hover/select-floating overlay). Moved
       *  to `.ws-compact-overlay` inside the preview wrapper below
       *  so it now fades in only on hover/select — same affordance
       *  as the gen-node settings strip. */}
      <div
        className={cn(
          "workspace-node-shell ws-clean-body overflow-hidden",
          selected && "is-selected",
        )}
        data-state={selected ? "selected" : "idle"}
        style={{ padding: 0 }}
      >

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
        {/* Reference role picker — fades in on hover/select via the
         *  shared `.ws-compact-overlay` rule (same affordance the
         *  AI-gen tool nodes use for their settings strip). 3D
         *  models still skip this — they aren't referenced as
         *  image inputs and a "general / subject / scene" role
         *  doesn't change downstream behaviour for them. */}
        {d.fieldType !== "model3d" && (selected || isHovered) && (
          <div className="ws-compact-overlay">
            <div className="ws-compact-toolbar">
              {/* Reference role picker — shares the Radix-based
               *  MiniSelect with every AI-gen tool node so the look /
               *  open animation / dropdown chrome match exactly.
               *  (The native <select> here used to render with the
               *  OS picker which felt out-of-place against the
               *  custom-styled gen-node settings.) */}
              <MiniSelect
                value={d.referenceType ?? "general"}
                options={REFERENCE_ROLE_OPTIONS.map((o) => o.value)}
                optionLabels={Object.fromEntries(
                  REFERENCE_ROLE_OPTIONS.map((o) => [o.value, t(o.labelKey)]),
                )}
                onChange={(v) => onRoleChange(v as ReferenceRole)}
                truncateAt={28}
              />
            </div>
          </div>
        )}
        {livePreviewUrl ? (
          d.fieldType === "model3d" ? (
            // 3D models render as a STATIC poster on the canvas —
            // running WebGL in every visible AssetNode + tile pegs
            // the GPU and tanks the framerate. The interactive
            // <model-viewer> only spins up in the lightbox (one
            // canvas, one context) when the user double-clicks to
            // inspect. The little "3D" pill in the corner signals
            // that drilling in opens a real 3D viewer.
            <div className="relative">
              {livePosterUrl ? (
                <img
                  src={livePosterUrl}
                  alt={d.label || d.fileName || "3D model"}
                  className="block h-auto w-full"
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  style={{ aspectRatio: "1 / 1", objectFit: "contain", background: "hsl(0 0% 6%)" }}
                />
              ) : (
                <div
                  className="flex w-full items-center justify-center text-zinc-600"
                  style={{ aspectRatio: "1 / 1", background: "hsl(0 0% 6%)" }}
                >
                  <Box className="h-10 w-10" />
                </div>
              )}
              <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-amber-300">
                3D
              </span>
            </div>
          ) : d.fieldType === "video" ? (
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
                "grid min-h-[104px] place-items-center px-3 py-3",
                d.uploading && "opacity-50",
              )}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <AudioPlayButton
                src={livePreviewUrl}
                label={d.fileName ?? "Play audio"}
                buttonClassName="h-11 w-11"
              />
            </div>
          ) : (
            <img
              src={livePreviewUrl}
              alt={d.label || d.fileName || "asset"}
              className={cn("block h-auto w-full", d.uploading && "opacity-50")}
              loading="lazy"
              decoding="async"
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

      {/* Bottom-right corner resize handle — drag to scale the
       *  asset card uniformly. Same gesture / styling as the AI-gen
       *  tool nodes. Visible only on hover/select via shared CSS. */}
      <div
        className="ws-compact-resize-handle nodrag"
        onPointerDown={onResizeStart}
        onMouseDown={(e) => e.stopPropagation()}
        title={t("workspace.node.asset_drag_resize")}
        aria-label={t("workspace.node.asset_resize")}
      />
    </div>
  );
});

AssetNode.displayName = "AssetNode";
export default AssetNode;
