/**
 * Element Node — two modes in one component, gated by `data.brand_element_id`.
 *
 * 1. CREATOR MODE (no brand_element_id yet)
 *    User wires AssetNode (image) into Ref 1..4 + optional Frontal,
 *    fills in name + description, and clicks "Create". On click we:
 *      a) walk our own input edges → collect ref URLs
 *      b) INSERT into public.brand_elements (RLS scoped to auth.uid())
 *      c) stash the returned id into node data → flips to saved mode
 *    Once flipped, the ref slots disappear and the node becomes a
 *    portable Element (the same row also surfaces in the Asset
 *    Library's "Elements" tab → drag back onto any canvas).
 *
 * 2. SAVED MODE (data.brand_element_id present)
 *    Pure display. Shows thumbnails of the cached refs and the
 *    element's editable name. The output port still emits the
 *    Kling Omni element shape:
 *      { name, reference_image_urls: [...], frontal_image_url, brand_element_id }
 *    so downstream Video Gen Omni nodes work the same in either mode.
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  type NodeProps,
  useEdges,
  useNodes,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { Users, Plus, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useFreshSignedUrl } from "./useFreshSignedUrl";
import { CLEAN_NODE_BODY_TOP_PX, PortIcon } from "./PortIcon";
import NodeQuickActionRail from "./NodeQuickActionRail";

const IMAGE_COLOR = "hsl(160 84% 39%)";
const ELEMENT_COLOR = "hsl(328 86% 70%)";

const REF_SLOTS = [
  { id: "ref_1", label: "Ref 1" },
  { id: "ref_2", label: "Ref 2" },
  { id: "ref_3", label: "Ref 3" },
  { id: "ref_4", label: "Ref 4" },
];

interface ElementNodeData {
  label?: string;
  description?: string;
  /** Set after Create succeeds — flips the node to saved mode. */
  brand_element_id?: string;
  /** Cached ref URLs, populated in saved mode. */
  reference_images?: string[];
  frontal_image_url?: string;
  thumbnail_url?: string;
}

const ElementNode = memo(({ id, data, selected }: NodeProps) => {
  const d = (data ?? {}) as ElementNodeData;
  const { setNodes } = useReactFlow();
  const { t: i18n } = useLanguage();
  const { user } = useAuth();
  const edges = useEdges();
  const allNodes = useNodes();
  const canvasId = useWorkspaceStore((s) => s.current?.id);

  const [creating, setCreating] = useState(false);
  const isSaved = !!d.brand_element_id;

  /* React Flow caches handle layout on mount. When `isSaved` flips
   * (Create succeeds → ref_1..4 + frontal handles vanish), we have
   * to notify React Flow or its connection-validation system keeps
   * trying to land wires on now-invisible handles. See the matching
   * comment in WorkspaceToolNode for the full story. */
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, isSaved, updateNodeInternals]);

  const updateField = useCallback(
    (patch: Partial<ElementNodeData>) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [id, setNodes],
  );
  const onDeleteNode = useCallback(() => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
  }, [id, setNodes]);

  /** Gather ref URLs by walking incoming edges in creator mode. */
  const wiredRefs = useMemo(() => {
    if (isSaved) return { refs: [], frontal: undefined as string | undefined };
    const refs: string[] = [];
    let frontal: string | undefined;
    const slotMap: Record<string, string> = {};
    for (const e of edges) {
      if (e.target !== id) continue;
      const src = allNodes.find((n) => n.id === e.source);
      if (!src || src.type !== "assetNode") continue;
      const sd = (src.data ?? {}) as any;
      const url = sd?.previewUrl ?? sd?.storagePath;
      if (typeof url !== "string" || !url) continue;
      const slot = e.targetHandle ?? "";
      if (slot === "frontal") frontal = url;
      else slotMap[slot] = url;
    }
    for (const slotId of ["ref_1", "ref_2", "ref_3", "ref_4"]) {
      if (slotMap[slotId]) refs.push(slotMap[slotId]);
    }
    return { refs, frontal };
  }, [edges, allNodes, id, isSaved]);

  const onCreate = useCallback(async () => {
    if (creating || isSaved) return;
    if (!user) {
      toast.error(i18n("workspace.elementNode.pleaseLogInToCreateElement"));
      return;
    }
    const name = (d.label ?? "").trim();
    if (!name) {
      toast.error(i18n("workspace.elementNode.elementNameIsRequired"));
      return;
    }
    if (wiredRefs.refs.length === 0 && !wiredRefs.frontal) {
      toast.error(i18n("workspace.elementNode.wireAtLeastOneReferenceImageFirst"));
      return;
    }
    setCreating(true);
    try {
      const thumbnail = wiredRefs.refs[0] ?? wiredRefs.frontal ?? null;
      const { data: row, error } = await supabase
        .from("brand_elements")
        .insert({
          user_id: user.id,
          workspace_canvas_id: canvasId ?? null,
          element_name: name,
          description: (d.description ?? "").trim() || null,
          thumbnail_url: thumbnail,
          reference_images: wiredRefs.refs,
          frontal_image_url: wiredRefs.frontal ?? null,
          // kling_element_id stays null until the Kling Element Create
          // endpoint is wired — workspace falls back to inline refs at
          // Video Gen run time.
        })
        .select("id")
        .single();
      if (error) throw error;
      updateField({
        brand_element_id: row.id,
        reference_images: wiredRefs.refs,
        frontal_image_url: wiredRefs.frontal,
        thumbnail_url: thumbnail ?? undefined,
      });
      toast.success(i18n("workspace.elementNode.elementSaved", { name }));
    } catch (e: any) {
      console.error("[element-create]", e);
      toast.error(e?.message ?? i18n("workspace.elementNode.failedToSaveElement"));
    } finally {
      setCreating(false);
    }
  }, [creating, isSaved, user, d.label, d.description, wiredRefs, canvasId, updateField, i18n]);

  // Choose the visual height so handles line up cleanly. Creator mode
  // needs enough room for ref slots + name/desc; saved mode is a card.
  // 262 = 240 → 276 (+15% bump for canvas-zoom legibility) → 262 (−5%
  // trim per follow-up feedback that nodes felt a touch too wide).
  // Same scaling applied to AssetNode + tool nodes so the canvas
  // reads consistently across types.
  const width = 262;

  return (
    <div
      className="ws-clean-node relative"
      data-state={selected ? "selected" : "idle"}
      style={{ width }}
    >
      {/* Floating title — icon + name (+ saved-badge). */}
      <NodeQuickActionRail
        visible={selected}
        onDelete={onDeleteNode}
        nodeId={id}
        mediaKind={null}
        bodyTopOffsetPx={CLEAN_NODE_BODY_TOP_PX}
      />

      <div className="ws-clean-title">
        <Users className="ws-clean-title-icon text-zinc-400" />
        <input
          value={d.label ?? ""}
          onChange={(e) => updateField({ label: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="ws-clean-title-input nodrag"
          placeholder={i18n("workspace.elementNode.characterElementName")}
          disabled={isSaved}
        />
        {isSaved && (
          <Check
            className="h-3 w-3 shrink-0 text-emerald-400"
            titleAccess={i18n("workspace.elementNode.saved")}
            style={{ pointerEvents: "auto" }}
          />
        )}
      </div>

      <div
        className={cn(
          "workspace-node-shell ws-clean-body",
          selected && "is-selected",
        )}
        data-state={selected ? "selected" : "idle"}
        style={{ padding: 0 }}
      >
      {isSaved ? (
        /* ── Saved mode — show thumbnails + read-only metadata ── */
        <div className="p-2">
          <div className="mb-1.5 grid grid-cols-3 gap-1">
            {(d.reference_images ?? []).slice(0, 6).map((url, i) => (
              <ElementRefThumb key={i} url={url} alt={`ref ${i + 1}`} />
            ))}
            {d.frontal_image_url && (
              <ElementRefThumb
                url={d.frontal_image_url}
                alt="frontal"
                accent
                title={i18n("workspace.elementNode.frontalView")}
              />
            )}
          </div>
          {d.description && (
            <div className="text-[10px] text-zinc-500">{d.description}</div>
          )}
          <div className="mt-1 truncate font-mono text-[9px] text-zinc-600">
            id: {d.brand_element_id}
          </div>
        </div>
      ) : (
        /* ── Creator mode — ref slots + Create button ── */
        <div className="p-2">
          {/* Description */}
          <input
            value={d.description ?? ""}
            onChange={(e) => updateField({ description: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="nodrag mb-2 w-full truncate bg-transparent text-[10px] text-zinc-400 outline-none placeholder:text-zinc-600"
            placeholder={i18n("common.descriptionOptional")}
          />

          {/* Ref slot rows */}
          <div className="relative text-[10px] text-zinc-400">
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
              {i18n("workspace.elementNode.referenceImages")} ({wiredRefs.refs.length}/4)
            </div>
            <ul className="space-y-1">
              {REF_SLOTS.map((slot, i) => {
                const filled = !!wiredRefs.refs[i];
                return (
                  <li
                    key={slot.id}
                    className={cn(
                      "flex items-center gap-1.5",
                      filled ? "text-zinc-300" : "text-zinc-600",
                    )}
                  >
                    <span className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      filled ? "bg-emerald-400" : "bg-zinc-700",
                    )} />
                    {slot.label}
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
              {i18n("workspace.elementNode.frontal")} {wiredRefs.frontal ? "✓" : i18n("common.optional")}
            </div>
          </div>

          {/* Create button */}
          <div className="mt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void onCreate();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={creating}
              className={cn(
                "nodrag flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors",
                creating
                  ? "cursor-wait bg-white/[0.06] text-white/60"
                  : "bg-pink-500/20 text-pink-200 hover:bg-pink-500/30",
              )}
              title={i18n("workspace.elementNode.saveAsReUsableElementListed")}
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {creating ? i18n("workspace.elementNode.creating") : i18n("workspace.elementNode.createElement")}
            </button>
          </div>
        </div>
      )}
      </div>

      {/* Reference image inputs — clustered as icons at the top.
       *  Slot order matches REF_SLOTS so wiring a visual at index
       *  N targets `ref_{N+1}` consistently with collectElementRefs.
       *  Only shown in creator mode (saved-mode hides them). */}
      {!isSaved &&
        REF_SLOTS.map((slot, i) => (
          <PortIcon
            key={slot.id}
            dir="target"
            handleId={slot.id}
            label={slot.label}
            portType="image"
            color={IMAGE_COLOR}
            index={i}
          />
        ))}
      {!isSaved && (
        <PortIcon
          dir="target"
          handleId="frontal"
          label={i18n("workspace.elementNode.frontalOptional")}
          portType="image"
          color={IMAGE_COLOR}
          index={REF_SLOTS.length}
        />
      )}

      {/* Output — element shape always emitted, both modes */}
      <PortIcon
        dir="source"
        handleId="element"
        label={i18n("workspace.elementNode.elementOutput")}
        portType="element"
        color={ELEMENT_COLOR}
        index={0}
        bodyTopOffsetPx={CLEAN_NODE_BODY_TOP_PX}
      />
    </div>
  );
});

ElementNode.displayName = "ElementNode";
export default ElementNode;

/* ── Atom: thumbnail with auto-refreshing signed URL ────────────
 * Each thumbnail re-signs its source URL via useFreshSignedUrl so
 * old elements created under the previous 24h TTL still display.
 * Falls through to the raw URL for non-Supabase sources. */
function ElementRefThumb({
  url,
  alt,
  title,
  accent = false,
}: {
  url: string;
  alt: string;
  title?: string;
  accent?: boolean;
}) {
  const live = useFreshSignedUrl(url);
  return (
    <img
      src={live ?? url}
      alt={alt}
      title={title}
      className={cn(
        "aspect-square w-full rounded object-cover",
        accent ? "border border-pink-500/40" : "",
      )}
      draggable={false}
    />
  );
}
