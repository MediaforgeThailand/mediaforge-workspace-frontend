/**
 * Generic workspace tool node — renders `imageGenNode` / `videoGenNode`
 * (and anything else that becomes unified later) from the shared schema.
 *
 * Ported from the legacy `KlingVideoNode` but parametrised on
 * `props.type` so one component drives multiple schema keys. All the
 * Kling-specific goodies (MultiShotBuilder, duration auto-sum from
 * scenes, ref_video edge detection, per-model port/param visibility)
 * live here and self-disable when the selected model doesn't support
 * them — so SeedDance / Banana / SeedDream share the same renderer
 * without leaking Kling controls.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Node,
  type NodeProps,
  useEdges,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Film, Loader2, Play, RotateCw, Sparkles, Scissors, Combine, FileVideo,
  Maximize2, Box, Image as ImageIcon, Music,
  type LucideIcon,
} from "lucide-react";
import { CLEAN_NODE_BODY_TOP_PX, PortIcon } from "./PortIcon";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import InsufficientCreditsDialog from "@/components/InsufficientCreditsDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { friendlyError } from "@/lib/friendlyError";

import { type ParamDef } from "@/components/flow/nodes/nodeApiSchema";
import { useNodeCreditCosts as useCreatorCreditCosts } from "@/hooks/useNodeCreditCosts";
import { calculateNodeCost } from "@/lib/nodeCostCalculator";
import PromptMentionTextarea from "@/components/flow/nodes/PromptMentionTextarea";
import MultiShotBuilder, {
  type SceneBlock,
} from "@/components/flow/nodes/MultiShotBuilder";
import {
  TogglePill,
  MiniSelect,
  MiniSlider,
  isBinarySelect,
} from "./CompactParamWidgets";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useDebugLogStore } from "@/store/useDebugLogStore";
import {
  selectIsViewer,
  useWorkspaceShareRole,
} from "@/store/useWorkspaceShareRole";
import NodeResultDialog from "./NodeResultDialog";
import { RunTimer } from "./RunTimer";
import type { Generation } from "./NodeResultBar";
// Voice catalog imports were removed when the hardcoded preset
// lists were deleted. Audio gen nodes no longer surface a voice
// picker on the canvas — backend uses its own per-provider default.
import { cloneNodeFresh } from "./cloneNode";
import { useFreshSignedUrl } from "./useFreshSignedUrl";
import { getSignedUrl } from "@/hooks/useSignedUrl";
import NodeQuickActionRail from "./NodeQuickActionRail";
// Workspace-local schema + helpers — kept out of the shared file so
// the main flow editor stays untouched.
import {
  cleanWsParamsOnModelChange,
  composeGptImageSize,
  getWorkspaceSchema,
  getWsOverflowingHandles,
  getWsRemovedHandleIds,
  getWsVisibleInputs,
  getWsVisibleParams,
  GPT_IMAGE_2_ASPECT_RATIOS,
  gptImage2ResolutionsFor,
  portTypeFromHandleId,
  splitGptImageSize,
} from "./workspaceSchema";
import { cleanModelLabelMap } from "./modelDisplay";

const RUN_EDGE_FUNCTION = "workspace-run-node";
const DEFAULT_WORKSPACE_INFRASTRUCTURE_BUFFER_PERCENT = 40;
const MAX_VISIBLE_RUN_MS = 60 * 60_000;
const STALE_RUN_GRACE_MS = 30_000;
const MULTI_GEN_MAX = 3;
const MULTI_GEN_X_OFFSET = 480;
const MULTI_GEN_NODE_TYPES = new Set([
  "imageGenNode",
  "videoGenNode",
  "chatAiNode",
  "bananaProNode",
  "klingVideoNode",
]);
const PROMPT_TOOLBAR_FALLBACK_H = 28;
const PROMPT_TOOLBAR_GAP = 20;
const PROMPT_TOP_RESERVE_RATIO = 0.3;
const PROMPT_TOP_RESERVE_MIN = 52;
const PROMPT_MIN_EDIT_H = 38;
const PROMPT_MAX_EDIT_H = 240;
const SEEDANCE_REF_VIDEO_MIN_SEC = 2;
const SEEDANCE_REF_VIDEO_MAX_SEC = 15;

function isSeedanceV2VideoModel(model: string | undefined): boolean {
  const m = String(model ?? "").toLowerCase();
  return m.startsWith("seedance-2-0") || m.startsWith("dreamina-seedance-2-0");
}

function seedanceReferenceVideoDurationMessage(durationSec?: number | null): string {
  const durationLabel =
    typeof durationSec === "number" && Number.isFinite(durationSec)
      ? ` (${durationSec.toFixed(1)}s)`
      : "";
  return `Seedance 2.0 reference videos must be ${SEEDANCE_REF_VIDEO_MIN_SEC}-${SEEDANCE_REF_VIDEO_MAX_SEC} seconds${durationLabel}.`;
}

function isSeedanceReferenceVideoDurationValid(
  durationSec: number | null | undefined,
): durationSec is number {
  return (
    typeof durationSec === "number" &&
    Number.isFinite(durationSec) &&
    durationSec >= SEEDANCE_REF_VIDEO_MIN_SEC &&
    durationSec <= SEEDANCE_REF_VIDEO_MAX_SEC
  );
}

function readVideoDurationFromSource(src: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () =>
      finish(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => finish(null);
    window.setTimeout(() => finish(null), 5000);
    video.src = src;
  });
}

function videoInputUrls(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

async function readReferenceVideoDuration(url: string): Promise<number | null> {
  const readableUrl =
    /^(https?:|blob:|data:)/i.test(url) ? url : await getSignedUrl(url);
  return readVideoDurationFromSource(readableUrl);
}

async function validateSeedanceReferenceVideos(inputs: Record<string, unknown>): Promise<void> {
  const urls = videoInputUrls(inputs.ref_video);
  if (urls.length === 0) return;
  let totalDuration = 0;
  for (const url of urls) {
    const durationSec = await readReferenceVideoDuration(url);
    if (durationSec == null) {
      throw new Error(
        "Could not read the Seedance 2.0 reference video duration. Use an MP4/MOV video between 2 and 15 seconds.",
      );
    }
    if (!isSeedanceReferenceVideoDurationValid(durationSec)) {
      throw new Error(seedanceReferenceVideoDurationMessage(durationSec));
    }
    totalDuration += durationSec;
  }
  if (totalDuration > SEEDANCE_REF_VIDEO_MAX_SEC) {
    throw new Error(
      `Seedance 2.0 reference videos must total ${SEEDANCE_REF_VIDEO_MAX_SEC} seconds or less (${totalDuration.toFixed(1)}s).`,
    );
  }
}

function computePromptMaxHeight(previewHeight: number, toolbarHeight: number): number {
  const liftedBottom = Math.ceil(toolbarHeight) + PROMPT_TOOLBAR_GAP;
  const topReserve = Math.max(
    PROMPT_TOP_RESERVE_MIN,
    Math.round(previewHeight * PROMPT_TOP_RESERVE_RATIO),
  );
  const available = Math.floor(previewHeight - liftedBottom - topReserve);
  return Math.max(PROMPT_MIN_EDIT_H, Math.min(available, PROMPT_MAX_EDIT_H));
}

function workspaceCostMultiplierForNode(
  schemaKey: string,
  model: string,
  workspaceMultiplier: number,
): number {
  // Gemini TTS still routes through the legacy text-to-speech function, which
  // owns its own credit deduction path. Keep the canvas estimate aligned with
  // standalone tools until that backend path is moved under workspace pricing.
  if (schemaKey === "audioGenNode" && model.startsWith("gemini-")) return 1;
  return workspaceMultiplier;
}

const NEW_ID = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const isInsufficientCreditsError = (message: string) =>
  /insufficient|not enough|credit/i.test(message) &&
  !/api credit|provider credit/i.test(message);

/** Trim a long URL down to "host…/last_segment" for one-line debug rows. */
function shortUrl(u: string | undefined): string {
  if (!u) return "";
  try {
    const parsed = new URL(u);
    const last = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    return `${parsed.host}/${last.length > 36 ? last.slice(0, 36) + "…" : last}`;
  } catch {
    return u.length > 48 ? u.slice(0, 48) + "…" : u;
  }
}

/**
 * Mention token format used by TextNode + every prompt textarea via
 * the shared PromptMentionTextarea component:
 *
 *   `@[Label](nodeId)`
 *
 * Atomic span in the editor, serialised to this bracketed form.
 * `nodeId` is the canonical lookup key — `Label` is just the chip's
 * display text and may contain spaces / special chars (regex-safe by
 * the surrounding brackets).
 */
const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

interface MentionedAsset {
  /** "asset" = AssetNode (image/video/audio); "element" = saved/creator
   *  ElementNode that resolves to a Kling Omni element entry.
   *  Backend uses `kind` to decide the prompt rewrite target —
   *  asset/image → `@Image{N}`, asset/video → `@Video`,
   *  element → `@Element{N}`. */
  kind: "asset" | "element";
  label: string;
  nodeId: string;
  /** Asset-only: previewUrl/storagePath of the file. */
  url: string | null;
  /** Asset-only: drives whether mention becomes `@Image` or `@Video`. */
  fieldType: "image" | "video" | "audio" | null;
  /** Asset-only: creator-picked reference role (subject/scene/style/…).
   *  Drives backend's Banana/OpenAI `[Context: …]` block. */
  role?: string;
  /** Element-only: assembled refs to feed into Kling Omni's
   *  `body.elements[]` array. */
  name?: string;
  reference_image_urls?: string[];
  frontal_image_url?: string;
  brand_element_id?: string;
}

/** Walk an ElementNode's data + canvas edges to produce the Kling Omni
 *  element shape — same logic for both saved (cached refs on data) and
 *  creator (refs come from upstream AssetNode wires) modes. Shared by
 *  resolveMentions (when @-mentioned) and resolveInputs (when wired). */
function collectElementRefs(
  node: { id: string; data?: unknown },
  allNodes: ReadonlyArray<{ id: string; type?: string; data?: unknown }>,
  allEdges: ReadonlyArray<{ source: string; target: string; targetHandle?: string | null }>,
): {
  name: string;
  reference_image_urls: string[];
  frontal_image_url: string | undefined;
  brand_element_id: string | undefined;
} {
  const d = (node.data ?? {}) as any;
  const name = (d?.label as string) || "element";
  const brand_element_id =
    typeof d?.brand_element_id === "string" ? d.brand_element_id : undefined;

  // Saved mode → use cached refs straight off the row.
  if (brand_element_id) {
    const refs = Array.isArray(d?.reference_images)
      ? (d.reference_images as unknown[]).filter(
          (u): u is string => typeof u === "string" && !!u,
        )
      : [];
    const frontal =
      typeof d?.frontal_image_url === "string" ? d.frontal_image_url : undefined;
    return {
      name,
      reference_image_urls: refs,
      frontal_image_url: frontal,
      brand_element_id,
    };
  }

  // Creator mode → walk own input edges in slot order.
  const refSlots: Record<string, string> = {};
  let frontalUrl: string | undefined;
  for (const e of allEdges) {
    if (e.target !== node.id) continue;
    const refSrc = allNodes.find((n) => n.id === e.source);
    if (!refSrc || refSrc.type !== "assetNode") continue;
    const refData = (refSrc.data ?? {}) as any;
    const url = refData?.previewUrl ?? refData?.storagePath;
    if (typeof url !== "string" || !url) continue;
    const slot = e.targetHandle ?? "";
    if (slot === "frontal") frontalUrl = url;
    else refSlots[slot] = url;
  }
  const ordered: string[] = [];
  for (const slotId of ["ref_1", "ref_2", "ref_3", "ref_4"]) {
    if (refSlots[slotId]) ordered.push(refSlots[slotId]);
  }
  return {
    name,
    reference_image_urls: ordered,
    frontal_image_url: frontalUrl,
    brand_element_id: undefined,
  };
}

/**
 * Walk a prompt string, replace every `@<label>` token with the bare
 * label (so the model sees natural language instead of the token), and
 * collect the URLs of any asset nodes referenced. The mentioned list
 * lets the dispatcher attach those URLs as `ref_image` / `ref_video`
 * fallbacks even when no explicit edge connects asset → tool.
 *
 * Lookup is by `data.label` (then `data.nodeName` as fallback). Tokens
 * that don't resolve to any node are left untouched.
 */
function resolveMentions(
  text: string | undefined,
  allNodes: ReadonlyArray<{ id: string; type?: string; data?: unknown }>,
  allEdges: ReadonlyArray<{ source: string; target: string; targetHandle?: string | null }> = [],
): { cleanText: string; mentioned: MentionedAsset[] } {
  const src = text ?? "";
  const mentioned: MentionedAsset[] = [];
  const seen = new Set<string>();

  const pushMention = (
    label: string,
    node: { id: string; type?: string; data?: unknown },
  ) => {
    if (seen.has(node.id)) return;
    const d = (node.data ?? {}) as any;
    if (node.type === "assetNode") {
      seen.add(node.id);
      mentioned.push({
        kind: "asset",
        role: typeof d.referenceType === "string" ? d.referenceType : "general",
        label,
        nodeId: node.id,
        url: d.previewUrl ?? d.storagePath ?? null,
        fieldType: d.fieldType ?? null,
      });
      return;
    }
    if (node.type === "elementNode") {
      seen.add(node.id);
      const refs = collectElementRefs(node, allNodes, allEdges);
      // Skip empty elements — nothing for the model to lock onto.
      if (refs.reference_image_urls.length === 0 && !refs.frontal_image_url) return;
      mentioned.push({
        kind: "element",
        label,
        nodeId: node.id,
        url: null,
        fieldType: null,
        name: refs.name,
        reference_image_urls: refs.reference_image_urls,
        frontal_image_url: refs.frontal_image_url,
        brand_element_id: refs.brand_element_id,
      });
      return;
    }
    // Tool nodes (Image Gen, Video Gen, Banana Pro, Kling, BG remove,
    // …) — the user mentions an upstream gen by name and the
    // dispatcher pulls the currently-selected generation's URL into
    // ref_image / ref_video on the prompt's owning model. The same
    // treatment lets the user write "@MyBrandShot turn it into video"
    // and have the brand image flow into the video model as a
    // reference frame.
    const gens = Array.isArray(d?.generations)
      ? (d.generations as Array<{ url?: string; type?: string; model_url?: string }>)
      : [];
    if (gens.length > 0) {
      seen.add(node.id);
      const idx =
        typeof d?.selectedGenIndex === "number" ? (d.selectedGenIndex as number) : 0;
      const g = gens[idx] ?? gens[0];
      // 3D outputs expose a `model_url` instead of `url`; we pass
      // either through unchanged so the dispatcher can decide which
      // slot it belongs in.
      const url = g?.url ?? g?.model_url ?? null;
      if (!url) return;
      const fieldType =
        g?.type === "video" ? "video" : g?.type === "audio" ? "audio" : "image";
      mentioned.push({
        kind: "asset",
        role: "general",
        label,
        nodeId: node.id,
        url,
        fieldType,
      });
    }
  };

  // Bracketed `@[Label](nodeId)` — preferred (PromptMentionTextarea).
  // Lookup by nodeId for unambiguous resolution.
  const bracketRe = new RegExp(MENTION_REGEX.source, "g");
  let m: RegExpExecArray | null;
  while ((m = bracketRe.exec(src)) !== null) {
    const [, label, nodeId] = m;
    const node = allNodes.find((x) => x.id === nodeId);
    if (node) pushMention(label, node);
  }

  // Plain `@<label>` fallback — covers text typed manually (e.g. before
  // the autocomplete picker shipped, or in environments where chips
  // aren't available). Lookup by `data.label` / `data.nodeName`.
  // The `[` exclusion in the char class prevents double-matching
  // bracketed tokens.
  const plainRe = /@([^\s@[]+)/g;
  while ((m = plainRe.exec(src)) !== null) {
    const name = m[1];
    const node = allNodes.find((x) => {
      const d = (x.data ?? {}) as any;
      const matchType = x.type === "assetNode" || x.type === "elementNode";
      return matchType && (d?.label === name || d?.nodeName === name);
    });
    if (node) pushMention(name, node);
  }

  return { cleanText: src, mentioned };
}

/**
 * Resolve upstream edges into an `inputs` object keyed by targetHandle.
 * TextNode → string content;  AssetNode → uploaded URL.
 *
 * Also bubbles up mentions found inside any TextNode's content so the
 * caller can attach asset URLs as ref_image fallbacks for the model.
 */
function resolveInputs(nodeId: string): {
  inputs: Record<string, unknown>;
  textMentioned: MentionedAsset[];
} {
  const s = useWorkspaceStore.getState();
  const edges = s.current?.edges ?? [];
  const nodes = s.current?.nodes ?? [];
  const out: Record<string, unknown> = {};
  const textMentioned: MentionedAsset[] = [];

  /** Push a value into out[key]. Multiple edges into the same handle
   *  accumulate as an array — matching the per-model maxConnections
   *  caps in the schema (Banana ref_image: 14, gpt-image-2: 16, …). */
  const pushAt = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (out[key] === undefined) {
      out[key] = value;
    } else if (Array.isArray(out[key])) {
      (out[key] as unknown[]).push(value);
    } else {
      out[key] = [out[key], value];
    }
  };

  for (const e of edges) {
    if (e.target !== nodeId) continue;
    const src = nodes.find((n) => n.id === e.source);
    if (!src) continue;
    const srcData = src.data as any;
    const key = e.targetHandle ?? "default";
    if (src.type === "textNode") {
      const { cleanText, mentioned } = resolveMentions(srcData?.content ?? "", nodes, edges);
      pushAt(key, cleanText);
      textMentioned.push(...mentioned);
    } else if (src.type === "assetNode") {
      // Block enqueue if an upstream asset is still uploading. The
      // local preview URL at this point is a `blob:` URL that won't
      // resolve from the provider's side — they'd see "Failed to
      // download image" and we'd waste credits. The audit caught
      // this exact path: user drags a 50 MB video, clicks Run on a
      // wired Kling node 200 ms later, the bucket upload is still
      // in flight, the request goes out with the blob URL, and
      // refund happens 5 minutes later via the sweep cron.
      if (srcData?.uploading === true) {
        throw new Error(
          "ไฟล์อ้างอิงยังอัปโหลดไม่เสร็จ — รอสักครู่แล้วกด Run อีกครั้ง / " +
            "Reference asset is still uploading — wait a moment and click Run again",
        );
      }
      pushAt(key, srcData?.previewUrl ?? srcData?.storagePath ?? null);
    } else if (src.type === "elementNode") {
      // Both saved (cached refs) + creator (walk edges) modes share the
      // same logic now — collectElementRefs handles both.
      const refs = collectElementRefs(src, nodes, edges);
      pushAt(key, {
        name: refs.name,
        reference_image_urls: refs.reference_image_urls,
        frontal_image_url: refs.frontal_image_url,
        brand_element_id: refs.brand_element_id,
      });
    } else if (src.type === "groupNode") {
      // Group has multiple typed output ports (image / video / audio).
      // The edge tells us WHICH port the user wired up via
      // `e.sourceHandle`; we collect ONLY children that emit that
      // type so an image-port edge doesn't accidentally pull a
      // video child's URL into a ref_image slot.
      //
      // Per-child URL extraction:
      //   asset     → previewUrl / storagePath  (type from fieldType)
      //   element   → first ref / frontal       (always image)
      //   tool node → currently-selected gen    (type from gen.type)
      const wantedType = (e.sourceHandle ?? "image") as "image" | "video" | "audio";
      const childUrls: string[] = [];
      for (const child of nodes) {
        if (child.parentId !== src.id) continue;
        const cd = (child.data ?? {}) as Record<string, unknown>;
        let url: string | null = null;
        let urlType: "image" | "video" | "audio" = "image";

        if (child.type === "assetNode") {
          url =
            (cd.previewUrl as string | undefined) ??
            (cd.storagePath as string | undefined) ??
            null;
          const ft = cd.fieldType as string | undefined;
          if (ft === "image" || ft === "video" || ft === "audio") urlType = ft;
        } else if (child.type === "elementNode") {
          const refs = Array.isArray(cd.reference_images)
            ? (cd.reference_images as unknown[]).filter(
                (u): u is string => typeof u === "string" && !!u,
              )
            : [];
          url =
            refs[0] ??
            (cd.frontal_image_url as string | undefined) ??
            (cd.thumbnail_url as string | undefined) ??
            null;
          urlType = "image";
        } else if (Array.isArray(cd.generations) && cd.generations.length > 0) {
          const gens = cd.generations as Array<{
            url?: string;
            text?: string;
            type?: string;
          }>;
          const idx =
            typeof cd.selectedGenIndex === "number"
              ? (cd.selectedGenIndex as number)
              : 0;
          const g = gens[idx] ?? gens[0];
          url = g?.url ?? null;
          const gt = g?.type;
          urlType = gt === "video" ? "video" : gt === "audio" ? "audio" : "image";
        }

        if (url && urlType === wantedType) childUrls.push(url);
      }
      for (const u of childUrls) pushAt(key, u);
    } else if (Array.isArray(srcData?.generations) && srcData.generations.length > 0) {
      // Tool nodes (Image Gen, Video Gen, BG Remove, Audio Merge, …)
      // store their Run output under `data.generations` — array of
      // { id, type, url?, text?, createdAt }, latest at index 0.
      // Wire the most-recently-selected generation's URL/text into
      // the downstream node's input.
      const idx =
        typeof srcData.selectedGenIndex === "number"
          ? (srcData.selectedGenIndex as number)
          : 0;
      const gen = srcData.generations[idx] ?? srcData.generations[0];
      pushAt(key, gen?.url ?? gen?.text ?? null);
    }
  }
  return { inputs: out, textMentioned };
}

/**
 * Title-bar icon per tool-node schema. Mirrors the OUTPUT MEDIA TYPE
 * the node produces — image gens get an image glyph, video gens a
 * film glyph, audio gens a music note — so the icon family alone
 * tells the user what flows out without reading the label.
 *
 * History: image-gen nodes used to render `Sparkles` (a generic
 * "AI magic" star), which read identically to every other generative
 * tool on the canvas. Switched to `ImageIcon` to match the AssetNode
 * pattern — both kinds of "image source" now share the same glyph.
 */
const ICONS: Record<string, LucideIcon> = {
  imageGenNode: ImageIcon,
  videoGenNode: Film,
  audioGenNode: Music,
  removeBackgroundNode: Scissors,
  mergeAudioNode: Combine,
  videoToPromptNode: FileVideo,
  imageTo3dNode: Box,
};

const DURATION_COST_MODELS = new Set(["kling-v3-pro", "kling-v3-omni"]);
const WORKSPACE_NODE_UI_SCALE = 1.15;
const DEFAULT_COMPACT_WIDTH = 437;

const PORT_LABEL_KEYS = {
  ref_audio: "workspace.port.ref_audio",
  ref_video: "workspace.port.ref_video",
  ref_image: "workspace.port.ref_image",
  reference_image: "workspace.port.reference_image",
  elements: "workspace.port.elements",
} as const;

interface NodeData {
  label?: string;
  params?: Record<string, unknown>;
  exposed?: Record<string, boolean>;
  /** Run history. Newest first; index 0 is the latest unless the user
   *  picks an older one via the history dialog. */
  generations?: Generation[];
  selectedGenIndex?: number;
  /** User-controlled card width (Space + drag). Default 437.
   *  History: 400 → 460 (+15% per team feedback that previews were
   *  too small at canvas zoom) → 437 (-5% per follow-up feedback
   *  that 460 was a touch too wide for the canvas density they
   *  prefer). Net effect over baseline: +9.25%. Inner UI stays at
   *  fixed pixel sizes; only the outer card width follows. */
  compactWidth?: number;
  multiGenCount?: number;
  runStartedAt?: number | null;
  activeRunId?: string | null;
  lastRunError?: string | null;
  backgroundJobId?: string | null;
  jobStatus?: string | null;
  jobAttempts?: number | null;
}

const WorkspaceToolNode = memo(({ id, data, type, selected }: NodeProps) => {
  const schemaKey = String(type ?? "");
  const schema = getWorkspaceSchema(schemaKey);
  const { getEdges, getNodes, setNodes, setEdges } = useReactFlow();
  const edges = useEdges();
  const prevHasRefVideo = useRef<boolean | undefined>(undefined);
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  // Used by friendlyError() to localize jargon errors before they
  // reach the user. Raw text still lands in console.error.
  const { language, t } = useLanguage();
  const currentWorkspaceId = useWorkspaceStore((s) => s.current?.workspaceId ?? null);

  // Refs + ResizeObserver for the dynamic prompt-lift logic. The
  // prompt overlay sits above the settings toolbar and used to lift
  // by a HARD-CODED 48px on hover/select — fine for a single-row
  // toolbar (~28px tall) but the moment a model exposed enough
  // params to wrap to two rows (Kling Omni: Model + Aspect + Duration
  // + Audio + Keep Original Sound + Multi-Shot) the toolbar grew to
  // ~56-64px and the prompt text ran on top of the second row.
  // Reported by user: "ตัว text ทับกับ setting" on a multi-row toolbar.
  //
  // Solution: measure the toolbar's actual rendered height with a
  // ResizeObserver and publish it as `--ws-toolbar-h` on the
  // preview element. The CSS rule for `:hover`/`:selected`/
  // `:focus-within` then computes `bottom: calc(var(--ws-toolbar-h) +
  // gap)` so the prompt always parks just above whatever height the
  // toolbar happens to be. The same measurement also feeds the
  // focused prompt height cap, so small resized nodes keep a real
  // ceiling instead of letting text climb into the preview header.
  const previewRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [promptMaxH, setPromptMaxH] = useState<number | null>(null);
  useEffect(() => {
    const target = toolbarRef.current;
    const root = previewRef.current;
    if (!target || !root) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // contentRect doesn't include padding — the toolbar's
        // padding is 0 so this == its visual height. Round up so
        // a sub-pixel size doesn't leave a 0.4px gap below the
        // text.
        const h = Math.ceil(entry.contentRect.height || PROMPT_TOOLBAR_FALLBACK_H);
        const previewH = Math.ceil(root.getBoundingClientRect().height);
        const promptCap = computePromptMaxHeight(previewH, h);
        root.style.setProperty("--ws-toolbar-h", `${h}px`);
        root.style.setProperty("--ws-prompt-max-h", `${promptCap}px`);
        setPromptMaxH(promptCap);
      }
    });
    ro.observe(target);
    return () => ro.disconnect();
  }, [selected, isHovered]);

  /* ── Publish preview height as `--ws-preview-h` ──
   *
   * The compact prompt overlay (`.ws-compact-prompt-overlay`) needs
   * to cap its growth at a percentage of the actual rendered
   * preview height so it doesn't swallow the artwork on small
   * landscape nodes. CSS `max-height: 70%` alone doesn't work
   * because the overlay is a `display: flex` auto-height absolute
   * box — `%` on a max-height resolves against an auto containing
   * block ⇒ the cap is effectively ignored, which is exactly what
   * the user kept seeing ("ลอยขึ้นไปสูงเลย").
   *
   * Fix: same pattern as `--ws-toolbar-h` above — observe the
   * preview's actual rendered px height with a ResizeObserver and
   * publish it on the same element. The prompt CSS then uses
   * `max-height: calc(0.7 * var(--ws-preview-h, 320px))` to cap
   * itself in real px, which IS a resolved length the engine can
   * apply. Fallback `320px` is the rough size of a 16:9 preview at
   * the default node width — used for the brief frame before the
   * observer has fired so the prompt doesn't flash full-height. */
  /* Computed prompt cap in px. Recomputed by the ResizeObserver
   *  below every time the preview's actual rendered height changes
   *  (e.g. user resizes the node, or a new image with a different
   *  aspect ratio lands). Stored in React state so we can pass it
   *  to PromptMentionTextarea as a prop and let it set
   *  `style.maxHeight` inline — that's the only way to outrank the
   *  Tailwind `max-h-[280px]` class baked into the editor. */
  useEffect(() => {
    const root = previewRef.current;
    if (!root) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.ceil(entry.contentRect.height);
        const toolbarH = Math.ceil(
          toolbarRef.current?.getBoundingClientRect().height ||
            PROMPT_TOOLBAR_FALLBACK_H,
        );
        root.style.setProperty("--ws-preview-h", `${h}px`);
        /* Compute the prompt's max-height in real px and publish it
         *  on TWO channels:
         *    1. CSS var `--ws-prompt-max-h` for the focus-within
         *       rule in workspace.css (kept for backward compat).
         *    2. React state → inline style on the contentEditable.
         *       Inline style is the only thing that reliably beats
         *       Tailwind's `max-h-[280px]` class on every browser
         *       and every cascade order, so this is the channel
         *       that ACTUALLY enforces the cap.
         *
         *  Knobs:
         *    • Floor: 60px (~2.5 lines) so the empty placeholder
         *      stays readable on the tiniest preview slot.
         *    • 70% of the preview, per the user's spec.
         *    • Ceiling: 240px (~10 lines) so a tall portrait node
         *      (9:16) doesn't hand the user a 23-line wall — that
         *      felt as bad as the no-cap bug. */
        const promptCap = computePromptMaxHeight(h, toolbarH);
        root.style.setProperty("--ws-toolbar-h", `${toolbarH}px`);
        root.style.setProperty("--ws-prompt-max-h", `${promptCap}px`);
        setPromptMaxH(promptCap);
      }
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  const d = (data ?? {}) as NodeData & { status?: "idle" | "processing" | "done" | "error" };
  const params = d.params ?? {};
  const selectedModel = (params.model_name as string) ?? schema?.defaultModel ?? "";

  // Set of node ids that are wired UPSTREAM into this node (any edge
  // whose target == this node). The mention dropdown is restricted
  // to this set so users only see nodes they can actually reference
  // — fixes the bug where typing `@` showed every asset on the
  // canvas, including unrelated nodes from other branches.
  // Re-computed whenever edges change (useEdges() subscribes) so
  // newly-drawn connections light up the dropdown immediately.
  const connectedSourceIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.target === id) set.add(e.source);
    }
    return set;
  }, [edges, id]);
  const isMultiShot = String(params.multi_shot) === "true";
  const runStatus = d.status ?? "idle";
  const isRunning = runStatus === "processing";
  const supportsMultiGen = MULTI_GEN_NODE_TYPES.has(schemaKey);
  const multiGenCount = Math.min(
    MULTI_GEN_MAX,
    Math.max(1, Number(d.multiGenCount ?? 1) || 1),
  );
  // Viewer-mode read-only — runs require a credit deduction
  // and a writable workspace, neither of which a viewer can
  // perform. The Run button below is disabled in this state;
  // we ALSO bail inside runNode as a defence-in-depth so a stale
  // hotkey binding can't bypass the UI.
  const isViewer = useWorkspaceShareRole(selectIsViewer);

  const runNode = useCallback(async () => {
    if (isRunning) return;
    if (isViewer) {
      toast.info(t("workspace.toolNode.viewOnlyRunsDisabled"));
      return;
    }
    const storeState = useWorkspaceStore.getState();
    const log = useDebugLogStore.getState().push;
    const nodeLabelForLog =
      (d.params?.nodeName as string) || schema?.displayName || schemaKey;
    const runId = NEW_ID();
    const runStartedAt = Date.now();
    const runStillActive = () => {
      const current = getNodes().find((node) => node.id === id);
      return ((current?.data as NodeData | undefined)?.activeRunId ?? null) === runId;
    };

    // (audioGenNode previously short-circuited here with a "preview
    // only" toast because workspace-run-node had no executor. The
    // backend now ships a Google Cloud TTS executor — see
    // `executeGoogleTts` in workspace-run-node — so the run goes
    // through the same path as every other node type. Provider
    // selection is driven by `params.model_name` (google-tts-* /
    // gemini-2.5-*-tts).)

    // Set processing status (drives the node-shell glow ring too).
    // Stamp `runStartedAt` so <RunTimer /> can show elapsed time
    // next to the spinner. Cleared back to null on success/error.
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                status: "processing",
                runStartedAt,
                activeRunId: runId,
                lastRunError: null,
                backgroundJobId: null,
                jobStatus: null,
                jobAttempts: 0,
              },
            }
          : n,
      ),
    );

    log({
      level: "info",
      nodeId: id,
      title: `Run · ${nodeLabelForLog}${selectedModel ? ` · ${selectedModel}` : ""}`,
      payload: { node_type: schemaKey, model: selectedModel, params },
    });

    try {
      const { inputs, textMentioned } = resolveInputs(id);

      // The schema's `text` input port semantically IS the prompt — a
      // wired Text node should populate `params.prompt` directly so
      // the request body is one canonical field, not a redundant
      // `params.prompt: ""` + `inputs.text: "…"` pair. Fold it in
      // before mention resolution so paramMentioned picks up tokens
      // that arrived via the wire.
      const promptParamIsBlank = !String(params.prompt ?? "").trim();
      const wiredText =
        typeof inputs.text === "string" ? (inputs.text as string) : "";
      const effectivePrompt =
        promptParamIsBlank && wiredText
          ? wiredText
          : (params.prompt as string | undefined) ?? "";

      // Also resolve @mentions inside the effective prompt (covers
      // both the Prompt field and any Text wire).
      const allNodes = storeState.current?.nodes ?? [];
      const allEdges = storeState.current?.edges ?? [];
      const { cleanText: cleanPrompt, mentioned: paramMentioned } = resolveMentions(
        effectivePrompt,
        allNodes,
        allEdges,
      );
      const cleanParams = { ...params, prompt: cleanPrompt };
      // Drop the now-redundant inputs.text — its content lives in
      // params.prompt, and keeping it in `inputs` would either duplicate
      // the mention-rewrite work backend-side or get re-mapped via
      // HANDLE_SCHEMA into something else by mistake.
      if (promptParamIsBlank && wiredText) {
        delete (inputs as Record<string, unknown>).text;
      }

      // Combine mentions found in upstream TextNode content + this
      // node's own Prompt field. De-dupe by nodeId so a single asset
      // referenced from both places only counts once.
      const mentionedMap = new Map<string, MentionedAsset>();
      for (const m of [...textMentioned, ...paramMentioned]) {
        if (!mentionedMap.has(m.nodeId)) mentionedMap.set(m.nodeId, m);
      }
      const mentioned = Array.from(mentionedMap.values());

      // Merge mention-resolved URLs into inputs as a fallback ref_image
      // (only for asset/image — so the backend can pick a primary
      // reference if no explicit ref_image edge is connected). Element
      // mentions don't enter this fallback path; they go straight into
      // `body.elements[]` server-side.
      const mentionedImage = mentioned.find(
        (m) => m.kind === "asset" && m.fieldType === "image" && m.url,
      );
      if (mentionedImage) {
        if (schemaKey === "videoGenNode" && isSeedanceV2VideoModel(selectedModel)) {
          const alreadyInKeyframeMode = Boolean(inputs.start_frame || inputs.end_frame);
          if (!alreadyInKeyframeMode && !inputs.reference_image) {
            inputs.reference_image = mentionedImage.url;
          }
        } else if (!inputs.ref_image) {
          inputs.ref_image = mentionedImage.url;
        }
      }

      if (schemaKey === "videoGenNode" && isSeedanceV2VideoModel(selectedModel)) {
        await validateSeedanceReferenceVideos(inputs);
      }

      log({
        level: "info",
        nodeId: id,
        title: `Resolved · ${Object.keys(inputs).length} input(s) · ${mentioned.length} mention(s)`,
        payload: { inputs, prompt: cleanPrompt, mentioned },
      });

      const requestBody = {
        node_type: schemaKey,
        params: cleanParams,
        inputs,
        mentioned_assets: mentioned,
        project_id: storeState.current?.projectId ?? null,
        workspace_id: storeState.current?.workspaceId ?? null,
        canvas_id: storeState.current?.id ?? null,
        node_id: id,
      };

      log({
        level: "send",
        nodeId: id,
        title: `→ POST ${RUN_EDGE_FUNCTION} · model=${selectedModel || "—"}`,
        payload: requestBody,
      });

      // Debug: surface the resolved payload so mis-wired text/asset edges
      // are visible in DevTools without having to instrument the edge fn.
      // eslint-disable-next-line no-console
      console.log("[workspace-run-node] sending", requestBody);

      {
        const { data: enqueueResp, error: enqueueErr } = await supabase.functions.invoke(
          RUN_EDGE_FUNCTION,
          {
            body: {
              ...requestBody,
              action: "enqueue_workspace_job",
            },
          },
        );
        const enqueueData = enqueueResp as {
          job_id?: string;
          error?: string;
          status?: string;
          background?: boolean;
        } | null;
        if (enqueueErr || enqueueData?.error || !enqueueData?.job_id) {
          throw new Error(
            enqueueData?.error ??
              (enqueueErr as { message?: string } | null)?.message ??
              "Failed to enqueue workspace generation",
          );
        }
        const jobId = enqueueData.job_id;
        setNodes((ns) =>
          ns.map((n) =>
            n.id === id && ((n.data as NodeData | undefined)?.activeRunId ?? null) === runId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    backgroundJobId: jobId,
                    jobStatus: "queued",
                  },
                }
              : n,
          ),
        );
        log({
          level: "info",
          nodeId: id,
          title: `Background job queued · ${jobId.slice(0, 8)}`,
          payload: enqueueData,
        });

        // ── Realtime job tracking ──────────────────────────────────
        // Subscribe to the row's UPDATE events instead of polling
        // every 3s. The user's SELECT RLS policy on
        // workspace_generation_jobs gates Realtime delivery, so each
        // user only sees their own job updates. We still do a single
        // catch-up SELECT after subscribe lands, in case the worker
        // already updated the row between INSERT and our subscription
        // becoming active (e.g. fast Banana 2 generations finishing
        // in 2-3s while the WebSocket handshake is still happening).
        // Hard timeout falls back to the same MAX_VISIBLE_RUN_MS as
        // the durable worker deadline; DB-side sweep only releases stale
        // locks for retry before that deadline.
        const pollJob = (): Promise<Record<string, unknown>> =>
          new Promise((resolve, reject) => {
            let lastStatus = "queued";
            let settled = false;

            const handleJob = (job: Record<string, unknown> | null | undefined) => {
              if (settled || !job) return;
              const status = String(job.status ?? "");
              const attempts = Number(job.attempts ?? 0);
              if (status !== lastStatus) {
                lastStatus = status;
                setNodes((ns) =>
                  ns.map((n) =>
                    n.id === id &&
                    ((n.data as NodeData | undefined)?.activeRunId ?? null) === runId
                      ? { ...n, data: { ...n.data, jobStatus: status, jobAttempts: attempts } }
                      : n,
                  ),
                );
                log({
                  level: "info",
                  nodeId: id,
                  title: `Background job ${status} · attempt ${attempts}`,
                  payload: job,
                });
              }
              if (status === "completed") {
                const result = job.result as Record<string, unknown> | undefined;
                if (!result) {
                  settled = true;
                  cleanup();
                  reject(new Error("Background job completed without result"));
                  return;
                }
                settled = true;
                cleanup();
                resolve(result);
                return;
              }
              if (status === "failed" || status === "permanent_failed") {
                settled = true;
                cleanup();
                reject(new Error(String(job.error ?? job.last_error ?? "Generation failed")));
              }
            };

            // Realtime channel — filtered to this single row so we
            // don't get fanned-out updates for every job in the table.
            const channel = supabase
              .channel(`ws-job-${jobId}`)
              .on(
                "postgres_changes",
                {
                  event: "UPDATE",
                  schema: "public",
                  table: "workspace_generation_jobs",
                  filter: `id=eq.${jobId}`,
                },
                (payload) => handleJob(payload.new as Record<string, unknown>),
              )
              .subscribe(async (subStatus) => {
                if (subStatus === "SUBSCRIBED") {
                  // Catch-up: fetch the current row in case the
                  // worker already updated it during the subscribe
                  // handshake. If the job is already terminal we
                  // settle immediately without waiting for an event.
                  try {
                    const { data: catchUp } = await supabase
                      .from("workspace_generation_jobs")
                      .select("*")
                      .eq("id", jobId)
                      .maybeSingle();
                    if (catchUp) handleJob(catchUp as Record<string, unknown>);
                  } catch (_err) {
                    // Non-fatal — realtime will still deliver future
                    // updates. Logged as info so it shows in the
                    // debug panel without alarming the user.
                    log({
                      level: "info",
                      nodeId: id,
                      title: "Job catch-up SELECT failed (realtime still active)",
                    });
                  }
                }
              });

            // Cancel-watch — frontend cancellations (user clicks
            // Stop or runs the node again) flip runStillActive to
            // false; we surface that here so the spinner clears.
            const cancelInterval = setInterval(() => {
              if (settled) return;
              if (!runStillActive()) {
                settled = true;
                cleanup();
                reject(new Error("__RUN_CANCELLED__"));
              }
            }, 1_000);

            let serverPollInFlight = false;
            const serverPollInterval = setInterval(() => {
              if (settled || serverPollInFlight) return;
              serverPollInFlight = true;
              void supabase.functions
                .invoke(RUN_EDGE_FUNCTION, {
                  body: { action: "poll_workspace_job", job_id: jobId },
                })
                .then(({ data, error }) => {
                  if (settled) return;
                  if (error) {
                    log({
                      level: "info",
                      nodeId: id,
                      title: `Job server-poll skipped: ${
                        (error as { message?: string } | null)?.message ?? "unknown"
                      }`,
                    });
                    return;
                  }
                  const job = (data as { job?: Record<string, unknown> } | null)?.job;
                  if (job) handleJob(job);
                })
                .catch((err) => {
                  if (settled) return;
                  log({
                    level: "info",
                    nodeId: id,
                    title: `Job server-poll threw: ${err instanceof Error ? err.message : String(err)}`,
                  });
                })
                .finally(() => {
                  serverPollInFlight = false;
                });
            }, 5_000);

            // Hard wall — keep this aligned with the durable worker's
            // one-hour deadline in case the realtime channel disconnects
            // silently.
            const timeoutId = setTimeout(() => {
              if (settled) return;
              settled = true;
              cleanup();
              reject(
                new Error(
                  `Generation timed out after ${Math.round(MAX_VISIBLE_RUN_MS / 60_000)} minutes.`,
                ),
              );
            }, MAX_VISIBLE_RUN_MS + STALE_RUN_GRACE_MS);

            const cleanup = () => {
              clearInterval(cancelInterval);
              clearInterval(serverPollInterval);
              clearTimeout(timeoutId);
              try {
                supabase.removeChannel(channel);
              } catch (_err) {
                /* ignore — channel already torn down */
              }
            };
          });

        const jobResult = await pollJob();
        if (!runStillActive()) return;
        const r = jobResult as {
          type: "image" | "video" | "text" | "audio";
          url?: string;
          text?: string;
          prompt_used?: string;
          prompt_source?: string;
          provider_meta?: {
            model_url?: string;
          };
        };

        storeState.addGeneration(id, {
          id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
          job_id: jobId,
          type: r.type,
          url: r.url,
          text: r.text,
          model_url: r.provider_meta?.model_url,
          prompt_used: r.prompt_used,
          prompt_source: r.prompt_source,
          createdAt: Date.now(),
        } as any);

        setNodes((ns) =>
          ns.map((n) =>
            n.id === id && ((n.data as NodeData | undefined)?.activeRunId ?? null) === runId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    status: "done",
                    runStartedAt: null,
                    activeRunId: null,
                    backgroundJobId: jobId,
                    jobStatus: "completed",
                    lastRunError: null,
                  },
                }
              : n,
          ),
        );
        const snippet = (r.prompt_used ?? "").slice(0, 60);
        const srcLabel =
          r.prompt_source === "text_input_edge"
            ? "via connected Text"
            : r.prompt_source === "prompt_param"
              ? "via Prompt field"
              : "";
        log({
          level: "success",
          nodeId: id,
          title: `✓ ${nodeLabelForLog} · ${r.type}${srcLabel ? ` (${srcLabel})` : ""}`,
          payload: { url: r.url, prompt_used: r.prompt_used, prompt_source: r.prompt_source, job_id: jobId },
        });
        toast.success(
          snippet
            ? `Generated ${srcLabel ? `(${srcLabel})` : ""}: "${snippet}${
                (r.prompt_used?.length ?? 0) > 60 ? "…" : ""
              }"`
            : "Generated",
        );
        return;
      }

      // ────────────────────────────────────────────────────────────
      // Retry loop — Phase 3 of the long-job UX work.
      // ────────────────────────────────────────────────────────────
      // Sync providers (OpenAI gpt-image-2, Banana / Gemini) sometimes
      // either timeout, return 5xx, or have their response dropped by
      // a middle-box on a long idle connection. The edge function has
      // a 150s wall clock; the round trip can drop right at that
      // boundary. Async providers (Kling, Seedance, Tripo3D) already
      // have their own polling loop further down — this OUTER loop
      // covers the INITIAL submit only (if Kling's submit returns
      // 503 we retry the submit; once we have a task_id the inner
      // polling takes over).
      //
      // Behaviour:
      //   • Per-attempt timeout: 180s (longer than the edge fn's
      //     150s wall clock so the response has time to land).
      //   • Total budget: 60 minutes — user-visible spinner for
      //     the entire window. No error toasts during retry.
      //   • Backoff: 3, 5, 10, 15, 30, 60s (cap). Spaces out provider
      //     hits so we don't pile on a struggling endpoint.
      //   • Permanent errors (4xx / billing / auth / validation /
      //     content policy / unsupported node type / "key not
      //     configured") fail immediately — retry won't help and
      //     spending the budget on those is wasted UX.
      //   • Transient errors (5xx, our 180s attempt timeout, network
      //     drop, "temporary upstream") loop until budget is spent.
      const TOTAL_BUDGET_MS = MAX_VISIBLE_RUN_MS;
      const PER_ATTEMPT_TIMEOUT_MS = 120_000;
      const BACKOFF_MS = [3_000, 5_000, 10_000, 15_000, 30_000, 60_000];
      const PERMANENT_ERROR_PATTERNS: RegExp[] = [
        /PROVIDER_BILLING_ERROR/i,
        /^OpenAI (401|403)/,
        /authentication|unauthor(ized|ised)|invalid.*api.?key/i,
        /content[\s_-]*polic|moderation|blocked|safety system/i,
        /unsupported node type/i,
        /\bnot configured\b|missing.*key/i,
        /is not defined|is not a function|cannot read prop(?:erty|erties) of (?:undefined|null)/i,
        /ReferenceError|TypeError|SyntaxError/i,
        /HTTP 4\d\d/,
        /(prompt|input|argument).*required/i,
        /Validation/,
      ];
      const isPermanentError = (err: unknown): boolean => {
        const msg = err instanceof Error ? err.message : String(err);
        return PERMANENT_ERROR_PATTERNS.some((p) => p.test(msg));
      };
      const computeBackoff = (attemptNumber: number): number => {
        // attemptNumber is 1-based for the FIRST retry (i.e. after
        // attempt #1 failed, this returns BACKOFF_MS[0]).
        return BACKOFF_MS[Math.min(attemptNumber - 1, BACKOFF_MS.length - 1)];
      };

      const startedAt = Date.now();
      let attempt = 0;
      let resp: unknown = null;
      let lastErr: Error | null = null;
      let serverErrorBody: unknown = null;
      let serverErrorMessage: string | undefined;

      retryLoop: while (Date.now() - startedAt < TOTAL_BUDGET_MS) {
        attempt++;

        if (attempt > 1) {
          log({
            level: "info",
            nodeId: id,
            title: `↻ Retry attempt ${attempt} (transient error or no response)`,
            payload: { lastError: lastErr?.message, elapsedMs: Date.now() - startedAt },
          });
        }

        let attemptResp: unknown = null;
        let attemptError: unknown = null;
        let attemptTimeoutTimer: number | null = null;

        try {
          const invokePromise = supabase.functions.invoke(RUN_EDGE_FUNCTION, {
            body: requestBody,
          });
          const timeoutPromise = new Promise<never>((_res, rej) => {
            attemptTimeoutTimer = window.setTimeout(() => {
              rej(new Error("__ATTEMPT_TIMEOUT__"));
            }, PER_ATTEMPT_TIMEOUT_MS);
            void invokePromise.finally(() => {
              if (attemptTimeoutTimer != null) {
                window.clearTimeout(attemptTimeoutTimer);
                attemptTimeoutTimer = null;
              }
            });
          });
          const result = await Promise.race([invokePromise, timeoutPromise]);
          const r = result as { data?: unknown; error?: unknown };
          attemptResp = r.data;
          attemptError = r.error;
        } catch (raceErr) {
          attemptError = raceErr;
        } finally {
          if (attemptTimeoutTimer != null) {
            window.clearTimeout(attemptTimeoutTimer);
          }
        }

        // Pull the server's error body out of a Supabase
        // FunctionsHttpError context (where the actual message lives —
        // serialises as `{}` if you just console.log the error). Same
        // logic as before, just wrapped per-attempt.
        let attemptServerErrorBody: unknown = null;
        let attemptServerErrorMessage: string | undefined;
        if (attemptError) {
          const ctx = (attemptError as { context?: Response | unknown }).context;
          if (ctx && typeof (ctx as Response).clone === "function") {
            try {
              const cloned = (ctx as Response).clone();
              const text = await cloned.text();
              if (text) {
                try {
                  attemptServerErrorBody = JSON.parse(text);
                  attemptServerErrorMessage =
                    (attemptServerErrorBody as { error?: string })?.error ?? text;
                } catch {
                  attemptServerErrorBody = text;
                  attemptServerErrorMessage = text;
                }
              }
            } catch {
              /* couldn't read body — keep going */
            }
          }
        }

        const respErr = (attemptResp as { error?: string } | null)?.error;

        if (attemptError || respErr) {
          const msg =
            attemptServerErrorMessage ??
            respErr ??
            (attemptError as { message?: string })?.message ??
            "Unknown run error";
          const err = new Error(msg);
          lastErr = err;
          serverErrorBody = attemptServerErrorBody;
          serverErrorMessage = attemptServerErrorMessage;

          if (isPermanentError(err)) {
            log({
              level: "error",
              nodeId: id,
              title: `✗ Permanent error (no retry): ${msg}`,
              payload: { sentBody: requestBody, serverErrorBody, attempt },
            });
            break retryLoop;
          }
          // Transient — fall through to backoff
        } else {
          // Success
          resp = attemptResp;
          break retryLoop;
        }

        // Backoff before next attempt — bail if backoff would push us
        // past the 30-min budget anyway (no point waiting then giving up).
        if (!runStillActive()) return;

        const backoff = computeBackoff(attempt);
        const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
        if (remaining < backoff + 1_000) break retryLoop;
        await new Promise((res) => setTimeout(res, backoff));
        if (!runStillActive()) return;
      }

      const durationMs = Date.now() - startedAt;

      if (resp == null) {
        // Loop exited without success — either permanent error (lastErr
        // set, isPermanent true) or 30-min budget exhausted.
        const finalErr =
          lastErr ??
          new Error(
            `Generation timed out after ${Math.round(
              TOTAL_BUDGET_MS / 60_000,
            )} minutes (${attempt} attempts). Try again or reduce quality / size.`,
          );
        log({
          level: "error",
          nodeId: id,
          title: `✗ ${finalErr.message} (${durationMs}ms, ${attempt} attempts)`,
          payload: {
            sentBody: requestBody,
            errorMessage: finalErr.message,
            serverErrorBody,
            attempts: attempt,
          },
        });
        throw finalErr;
      }

      // eslint-disable-next-line no-console
      console.log("[workspace-run-node] received (after retries)", {
        resp, attempts: attempt, durationMs,
      });

      const r = resp as {
        type: "image" | "video" | "text" | "audio";
        url?: string;
        text?: string;
        prompt_used?: string;
        prompt_source?: string;
        task_id?: string;
        provider_meta?: {
          poll_endpoint?: string;
          provider?: string;
          model?: string;
          provider_model_id?: string;
          model_url?: string;
          rendered_image?: string;
        };
      };

      log({
        level: "recv",
        nodeId: id,
        title: `← ${r.type}${r.url ? ` · ${shortUrl(r.url)}` : ""}${r.task_id && !r.url ? ` · task=${r.task_id.slice(0, 8)}…` : ""} (${durationMs}ms)`,
        payload: r,
      });

      // ── Async poll path ──
      // Each poll is one short edge-fn call (~1s) — no risk of the
      // platform's 150s worker limit even on multi-minute jobs. We
      // dispatch by `provider_meta.provider`:
      //   - "tripo3d"  → POST action="poll_tripo3d"
      //   - "seedance" → POST action="poll_seedance"
      //   - "veo"      → POST action="poll_veo"
      //   - else       → POST action="poll_kling"  (default for video)
      const pollEndpoint = r.provider_meta?.poll_endpoint;
      const pollProvider = String(r.provider_meta?.provider ?? "kling").toLowerCase();
      if (r.task_id && !r.url && pollEndpoint) {
        const pollStart = Date.now();
        const isTripo3d = pollProvider === "tripo3d";
        const isSeedance = pollProvider === "seedance";
        const isVeo = pollProvider === "veo";
        const POLL_INTERVAL_MS = isTripo3d ? 4_000 : 5_000;
        const POLL_TIMEOUT_MS = isTripo3d ? 8 * 60_000 : 6 * 60_000;
        const pollAction = isTripo3d
          ? "poll_tripo3d"
          : isSeedance
            ? "poll_seedance"
            : isVeo
              ? "poll_veo"
              : "poll_kling";
        const providerLabel = isTripo3d
          ? "Tripo3D"
          : isSeedance
            ? "Seedance"
            : isVeo
              ? "Veo"
              : "Kling";
        let polledUrl: string | undefined;
        let polledModelUrl: string | undefined;
        let polledPreview: string | undefined;
        let polledStatus = "submitted";

        log({
          level: "info",
          nodeId: id,
          title: `⏳ Polling ${providerLabel} task ${r.task_id.slice(0, 8)}…`,
          payload: { task_id: r.task_id, poll_endpoint: pollEndpoint, action: pollAction },
        });

        const pollModel = r.provider_meta?.model ?? r.provider_meta?.provider_model_id;
        const pollProviderModelId = r.provider_meta?.provider_model_id;

        while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
          await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
          if (!runStillActive()) return;
          const { data: pollResp, error: pollErr } = await supabase.functions.invoke(
            RUN_EDGE_FUNCTION,
            {
              body: {
                action: pollAction,
                task_id: r.task_id,
                poll_endpoint: pollEndpoint,
                model: pollModel,
                provider_model_id: pollProviderModelId,
              },
            },
          );
          if (pollErr) {
            log({
              level: "info",
              nodeId: id,
              title: `… poll error (will retry): ${(pollErr as any)?.message ?? "unknown"}`,
            });
            continue;
          }
          const p = pollResp as {
            status?: string;
            url?: string;
            model_url?: string;
            preview_image?: string;
            message?: string;
          };
          polledStatus = String(p?.status ?? "");
          if (polledStatus === "succeed" || polledStatus === "success") {
            polledUrl = p?.url;
            polledModelUrl = p?.model_url;
            polledPreview = p?.preview_image;
            break;
          }
          if (polledStatus === "failed" || polledStatus === "fail") {
            throw new Error(`${providerLabel} task failed: ${p?.message ?? "no detail"}`);
          }
          // submitted / processing / queued / running — keep waiting
        }

        if (!polledUrl) {
          throw new Error(
            `${providerLabel} polling timed out after ${Math.round(
              (Date.now() - pollStart) / 1000,
            )}s (last status: ${polledStatus})`,
          );
        }

        // Patch the response so the persistence path below sees the URL.
        r.url = polledUrl;
        // Tripo3D gives us both a rendered preview (image) and the
        // GLB itself — stash the latter on provider_meta so the
        // node's UI can hand it to <model-viewer> down the line.
        if (polledModelUrl) {
          r.provider_meta = {
            ...(r.provider_meta ?? {}),
            model_url: polledModelUrl,
            rendered_image: polledPreview ?? polledUrl,
          };
        }
        log({
          level: "recv",
          nodeId: id,
          title: `← ready · ${shortUrl(polledUrl)} (${Math.round(
            (Date.now() - pollStart) / 1000,
          )}s polling)`,
          payload: {
            url: polledUrl,
            model_url: polledModelUrl,
            task_id: r.task_id,
          },
        });
      }

      if (!runStillActive()) return;

      storeState.addGeneration(id, {
        id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
        type: r.type,
        url: r.url,
        text: r.text,
        // Tripo3D rides the GLB URL back via provider_meta.model_url
        // (set in either the inline executor response or the poll
        // loop above). Persist it so the preview can render
        // <model-viewer> for that specific generation.
        model_url: r.provider_meta?.model_url,
        prompt_used: r.prompt_used,
        prompt_source: r.prompt_source,
        createdAt: Date.now(),
      } as any);

      setNodes((ns) =>
        ns.map((n) =>
          n.id === id && ((n.data as NodeData | undefined)?.activeRunId ?? null) === runId
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: "done",
                  runStartedAt: null,
                  activeRunId: null,
                  lastRunError: null,
                },
              }
            : n,
        ),
      );
      // Show which prompt + source so the user can tell at a glance
      // whether the connected Text node was actually honored.
      const snippet = (r.prompt_used ?? "").slice(0, 60);
      const srcLabel =
        r.prompt_source === "text_input_edge"
          ? "via connected Text"
          : r.prompt_source === "prompt_param"
            ? "via Prompt field"
            : "";
      log({
        level: "success",
        nodeId: id,
        title: `✓ ${nodeLabelForLog} · ${r.type}${srcLabel ? ` (${srcLabel})` : ""}`,
        payload: { url: r.url, prompt_used: r.prompt_used, prompt_source: r.prompt_source },
      });
      toast.success(
        snippet
          ? `Generated ${srcLabel ? `(${srcLabel})` : ""}: "${snippet}${
              (r.prompt_used?.length ?? 0) > 60 ? "…" : ""
            }"`
          : "Generated",
      );
    } catch (e: any) {
      const errorMessage = String(e?.message ?? e);
      const shouldToast = runStillActive();
      const insufficientCredits = isInsufficientCreditsError(errorMessage);
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id && ((n.data as NodeData | undefined)?.activeRunId ?? null) === runId
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: "error",
                  runStartedAt: null,
                  activeRunId: null,
                  lastRunError: errorMessage,
                },
              }
            : n,
        ),
      );
      log({
        level: "error",
        nodeId: id,
        title: `✗ ${nodeLabelForLog} · ${String(e?.message ?? e)}`,
      });
      if (insufficientCredits) setInsufficientOpen(true);
      if (shouldToast && !insufficientCredits) {
        // Translate jargon errors (`PROVIDER_BILLING_ERROR`,
        // `function consume_credits_for(…) does not exist`,
        // OpenAI 401 …) to friendly Thai/EN copy. Raw error
        // stays in console.error for the team.
        toast.error(friendlyError(errorMessage, language === "th" ? "th" : "en"));
      }
    }
  }, [getNodes, id, isRunning, isViewer, params, schemaKey, setNodes, selectedModel, schema, d.params?.nodeName, language, t]);

  useEffect(() => {
    if (!isRunning) return;
    const startedAt =
      typeof d.runStartedAt === "number" && Number.isFinite(d.runStartedAt)
        ? d.runStartedAt
        : null;
    const activeRunId = d.activeRunId ?? null;
    if (!startedAt) return;

    let didTimeout = false;
    const maxElapsedMs = MAX_VISIBLE_RUN_MS + STALE_RUN_GRACE_MS;
    const timeoutMessage = `Generation timed out after ${Math.round(
      MAX_VISIBLE_RUN_MS / 60_000,
    )} minutes. Please retry.`;

    const clearIfStale = () => {
      if (didTimeout) return;
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs < maxElapsedMs) return;
      didTimeout = true;
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id &&
          (activeRunId
            ? ((n.data as NodeData | undefined)?.activeRunId ?? null) === activeRunId
            : ((n.data as NodeData | undefined)?.activeRunId ?? null) == null &&
              (n.data as NodeData | undefined)?.runStartedAt === startedAt)
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: "error",
                  runStartedAt: null,
                  activeRunId: null,
                  lastRunError: timeoutMessage,
                },
              }
            : n,
        ),
      );
      useDebugLogStore.getState().push({
        level: "error",
        nodeId: id,
        title: `Run timed out after ${Math.round(elapsedMs / 1000)}s`,
      });
      toast.error(timeoutMessage);
    };

    clearIfStale();
    const timer = window.setInterval(clearIfStale, 15_000);
    return () => window.clearInterval(timer);
  }, [d.activeRunId, d.runStartedAt, id, isRunning, setNodes]);

  const updateMultiGenCount = useCallback(
    (next: number) => {
      const clamped = Math.min(MULTI_GEN_MAX, Math.max(1, next));
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, multiGenCount: clamped } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  const runMultiGen = useCallback(
    (count: number) => {
      const n = Math.min(MULTI_GEN_MAX, Math.max(1, count));
      if (n === 1) {
        void runNode();
        return;
      }
      if (isRunning || isViewer) return;

      const sourceNode = getNodes().find((node) => node.id === id) as Node | undefined;
      if (!sourceNode) return;

      useWorkspaceStore.getState().pushHistory();

      const incomingEdges = getEdges().filter((edge) => edge.target === sourceNode.id);
      const cloned: Node[] = [];
      const newEdges: typeof incomingEdges = [];

      for (let i = 1; i < n; i++) {
        const cloneId = NEW_ID();
        const fresh = cloneNodeFresh(sourceNode, cloneId);
        cloned.push({
          ...fresh,
          data: { ...fresh.data, runOnMount: true },
          position: {
            x: sourceNode.position.x + MULTI_GEN_X_OFFSET * i,
            y: sourceNode.position.y,
          },
          selected: false,
        });

        for (const edge of incomingEdges) {
          newEdges.push({
            ...edge,
            id: NEW_ID(),
            target: cloneId,
            selected: false,
          });
        }
      }

      setNodes((nds) => [
        ...nds.map((node) => (node.selected ? { ...node, selected: false } : node)),
        ...cloned,
      ]);
      setEdges((eds) => [...eds, ...newEdges]);
      void runNode();
      toast.success(`Generating ${n} variations in parallel`);
    },
    [getEdges, getNodes, id, isRunning, isViewer, runNode, setEdges, setNodes],
  );

  useEffect(() => {
    const knownJobId = d.backgroundJobId ?? null;
    const canRecoverByNode =
      !knownJobId && (runStatus === "processing" || runStatus === "error");
    if ((!knownJobId && !canRecoverByNode) || d.jobStatus === "completed") return;

    let cancelled = false;
    let pollTimer: number | null = null;

    const applyCompletedJob = (job: Record<string, unknown>) => {
      const resolvedJobId = String(job.id ?? knownJobId ?? "");
      const result = job.result as {
        type?: "image" | "video" | "text" | "audio";
        url?: string;
        text?: string;
        prompt_used?: string;
        prompt_source?: string;
        provider_meta?: { model_url?: string };
      } | null;
      if (!result) return;

      const node = getNodes().find((n) => n.id === id);
      const nodeData = node?.data as NodeData | undefined;
      const generations = Array.isArray(nodeData?.generations)
        ? (nodeData.generations as Array<Record<string, unknown>>)
        : [];
      const alreadyApplied = generations.some((gen) =>
        (!!resolvedJobId && gen.job_id === resolvedJobId) ||
        (!!result.url && gen.url === result.url) ||
        (!!result.text && gen.text === result.text)
      );

      if (!alreadyApplied) {
        useWorkspaceStore.getState().addGeneration(id, {
          id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
          job_id: resolvedJobId || undefined,
          type: result.type ?? "image",
          url: result.url,
          text: result.text,
          model_url: result.provider_meta?.model_url,
          prompt_used: result.prompt_used,
          prompt_source: result.prompt_source,
          createdAt: Date.now(),
        } as Record<string, unknown>);
      }

      setNodes((ns) =>
        ns.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: "done",
                  runStartedAt: null,
                  activeRunId: null,
                  backgroundJobId: resolvedJobId || knownJobId,
                  jobStatus: "completed",
                  lastRunError: null,
                },
              }
            : n,
        ),
      );
    };

    const checkJob = async () => {
      let query = supabase
        .from("workspace_generation_jobs")
        .select("*");

      if (knownJobId) {
        query = query.eq("id", knownJobId);
      } else {
        const current = useWorkspaceStore.getState().current;
        query = query.eq("node_id", id).order("created_at", { ascending: false }).limit(1);
        if (current?.id) query = query.eq("canvas_id", current.id);
        if (current?.workspaceId) query = query.eq("workspace_id", current.workspaceId);
      }

      const { data: job, error } = await query.maybeSingle();
      if (cancelled || error || !job) return;

      const status = String(job.status ?? "");
      const attempts = Number(job.attempts ?? 0);
      if (status === "completed") {
        applyCompletedJob(job as Record<string, unknown>);
        if (pollTimer != null) window.clearInterval(pollTimer);
        return;
      }
      if (status === "failed" || status === "permanent_failed") {
        setNodes((ns) =>
          ns.map((n) =>
            n.id === id && (n.data as NodeData | undefined)?.status !== "done"
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    status: "error",
                    runStartedAt: null,
                    activeRunId: null,
                    jobStatus: status,
                    jobAttempts: attempts,
                    lastRunError: String(job.error ?? job.last_error ?? "Generation failed"),
                  },
                }
              : n,
          ),
        );
        if (pollTimer != null) window.clearInterval(pollTimer);
        return;
      }

      setNodes((ns) =>
        ns.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  jobStatus: status || (n.data as NodeData | undefined)?.jobStatus,
                  jobAttempts: attempts,
                },
              }
            : n,
        ),
      );
    };

    void checkJob();
    pollTimer = window.setInterval(() => void checkJob(), 5_000);
    return () => {
      cancelled = true;
      if (pollTimer != null) window.clearInterval(pollTimer);
    };
  }, [d.backgroundJobId, d.jobStatus, getNodes, id, runStatus, setNodes]);

  /* ── Listen for Ctrl+Enter / Ctrl+Shift+Enter shortcut ────
   * useWorkspaceShortcuts dispatches a `workspace-run-shortcut`
   * window event with `detail.nodeId`. Each tool node responds
   * if the event targets it, calling its own runNode(). This
   * avoids lifting Run into a global store action just to hook
   * up a keyboard shortcut. */
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ nodeId?: string }>;
      if (ce.detail?.nodeId !== id) return;
      void runNode();
    };
    window.addEventListener("workspace-run-shortcut", handler);
    return () => window.removeEventListener("workspace-run-shortcut", handler);
  }, [id, runNode]);

  /* ── Multi-gen auto-run on mount ──────────────────────────
   * When NodeQuickToolbar's "x2 / x3" multi-gen picker clones
   * the source node, each clone is stamped with
   * `data.runOnMount = true`. The toolbar can't dispatch the
   * run-shortcut event right after `setNodes(...)` because
   * this <WorkspaceToolNode> hasn't mounted yet — so its
   * window listener (above) isn't registered → the event would
   * be dropped on the floor. Instead, the clone fires its own
   * runNode() once mounted, and clears the flag in the same
   * setNodes pass so a render re-fire from upstream state
   * doesn't trigger a duplicate run.
   *
   * Only runs once on mount: the effect intentionally has
   * empty deps + reads `data.runOnMount` from the closure
   * snapshot at mount time. Subsequent data updates don't
   * re-trigger it. */
  useEffect(() => {
    const flag = (data as { runOnMount?: boolean } | undefined)?.runOnMount;
    if (!flag) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id
          ? {
              ...n,
              data: { ...n.data, runOnMount: false },
            }
          : n,
      ),
    );
    void runNode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleParams = useMemo(
    () => (schema ? getWsVisibleParams(schemaKey, selectedModel) : []),
    [schema, schemaKey, selectedModel],
  );
  const visibleInputs = useMemo(
    () => (schema ? getWsVisibleInputs(schemaKey, selectedModel) : []),
    [schema, schemaKey, selectedModel],
  );
  const visibleOutputs = useMemo(() => {
    if (!schema) return [];
    return schema.outputs.filter(
      (o) => !o.supportedModels || o.supportedModels.includes(selectedModel),
    );
  }, [schema, selectedModel]);

  /* React Flow caches handle positions and IDs in its internal store
   * the first time a node mounts. When `visibleInputs` / `visibleOutputs`
   * change because the user picked a different model (e.g. switching
   * Kling Pro → Kling Motion Pro swaps `start_frame`/`end_frame` for
   * `ref_image`/`ref_video`), the new handles render in the DOM but
   * React Flow's cached layout still points at the OLD handle ids.
   *
   * Result: dragging a wire onto the new handle silently fails — the
   * connection-validation system can't find a registered handle at
   * that DOM position, so the drop is rejected with no toast. This is
   * the canonical bug the React Flow docs warn about for nodes whose
   * handle set is dynamic:
   *   https://reactflow.dev/api-reference/hooks/use-update-node-internals
   *
   * We fingerprint the visible handle ids (in render order) and call
   * `updateNodeInternals(id)` whenever that fingerprint changes.
   * Bandwidth: only fires on actual handle-set churn (model swap,
   * schema reload), not every render. */
  const updateNodeInternals = useUpdateNodeInternals();
  const handleFingerprint = useMemo(() => {
    const ins = visibleInputs.map((i) => i.id).join("|");
    const outs = visibleOutputs.map((o) => o.id).join("|");
    return `${ins}>>${outs}`;
  }, [visibleInputs, visibleOutputs]);
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, handleFingerprint, updateNodeInternals]);

  const updateParam = useCallback(
    (key: string, value: unknown) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prevParams = (n.data as any).params ?? {};
          if (key === "model_name") {
            const newModel = String(value);
            const cleaned = cleanWsParamsOnModelChange(schemaKey, newModel, prevParams);
            const removed = getWsRemovedHandleIds(schemaKey, newModel);
            if (removed.length > 0) {
              setEdges((eds) =>
                eds.filter(
                  (e) => !(e.target === id && removed.includes(e.targetHandle ?? "")),
                ),
              );
            }
            // Warn (don't auto-trim) when the new model has a smaller
            // maxConnections than the current edge count for any kept
            // handle — e.g. user wired 5 refs into Banana (max 14)
            // then switched to a model that only accepts 4. The user
            // chooses which to drop.
            const remainingEdges = edges.filter(
              (e) => !(e.target === id && removed.includes(e.targetHandle ?? "")),
            );
            const countByHandle = new Map<string, number>();
            for (const e of remainingEdges) {
              if (e.target !== id) continue;
              const h = e.targetHandle ?? "";
              countByHandle.set(h, (countByHandle.get(h) ?? 0) + 1);
            }
            const overruns = getWsOverflowingHandles(schemaKey, newModel, countByHandle);
            if (overruns.length > 0) {
              const lines = overruns
                .map((o) => `${o.label}: ${o.count} wires, max ${o.max}`)
                .join("\n");
              toast.warning(
                `Some connections exceed the new model's limit:\n${lines}\nDelete extras manually before running.`,
              );
            }
            return { ...n, data: { ...n.data, params: cleaned } };
          }
          return { ...n, data: { ...n.data, params: { ...prevParams, [key]: value } } };
        }),
      );
    },
    [id, setNodes, setEdges, schemaKey, edges],
  );

  const updateNodeField = useCallback(
    (field: string, value: unknown) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n)),
      );
    },
    [id, setNodes],
  );

  // Multi-shot scenes → auto-sum durations and clamp.
  const handleScenesChange = useCallback(
    (newScenes: SceneBlock[]) => {
      const totalSum = newScenes.reduce((s, sc) => s + Number(sc.duration || 0), 0);
      const clampedDuration = Math.max(3, Math.min(totalSum, 15));
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = (n.data as any).params ?? {};
          return {
            ...n,
            data: {
              ...n.data,
              params: { ...prev, multi_prompt: newScenes, duration: clampedDuration },
            },
          };
        }),
      );
    },
    [id, setNodes],
  );

  // Sync whether a ref_video edge is connected into params (Kling backend needs it).
  useEffect(() => {
    const hasRefVideoEdge = edges.some(
      (e) => e.target === id && e.targetHandle === "ref_video",
    );
    if (prevHasRefVideo.current !== hasRefVideoEdge) {
      prevHasRefVideo.current = hasRefVideoEdge;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = (n.data as any).params ?? {};
          if (prev._has_ref_video === hasRefVideoEdge) return n;
          return {
            ...n,
            data: { ...n.data, params: { ...prev, _has_ref_video: hasRefVideoEdge } },
          };
        }),
      );
    }
  }, [edges, id, setNodes]);

  // Inline `inputPorts` / `outputPorts` were here — removed because
  // ports now render as external floating bubbles (see the Handle
  // siblings near the bottom of the JSX). Schema's visibleInputs /
  // visibleOutputs drive the bubbles directly.

  const { data: creditCosts, isLoading: creditCostsLoading } = useCreatorCreditCosts();
  const { data: workspaceCreditMultiplier = 1 + DEFAULT_WORKSPACE_INFRASTRUCTURE_BUFFER_PERCENT / 100 } =
    useQuery({
      queryKey: ["workspace-credit-multiplier"],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("subscription_settings")
          .select("value")
          .eq("key", "workspace_infrastructure_buffer_percent")
          .maybeSingle();
        if (error) throw new Error(error.message);
        const parsed = Number(data?.value);
        const bufferPercent =
          Number.isFinite(parsed) && parsed >= 0
            ? parsed
            : DEFAULT_WORKSPACE_INFRASTRUCTURE_BUFFER_PERCENT;
        return 1 + bufferPercent / 100;
      },
      staleTime: 1000 * 60 * 5,
    });
  const isMotionModel = selectedModel.includes("motion");
  const showsDurationCost = DURATION_COST_MODELS.has(selectedModel);

  const baseNodeCost = useMemo(() => {
    if (!creditCosts || !schema) return null;
    if (isMotionModel) {
      const perSecond = creditCosts.find(
        (r) =>
          r.feature === "generate_freepik_video" &&
          r.model === selectedModel &&
          r.pricing_type === "per_second",
      );
      return perSecond?.cost ?? null;
    }
    return calculateNodeCost({ schemaKey, params, creditCosts });
  }, [creditCosts, isMotionModel, params, schema, schemaKey, selectedModel]);

  const nodeCost = useMemo(() => {
    if (baseNodeCost == null) return null;
    if (baseNodeCost <= 0) return 0;
    const multiplier = workspaceCostMultiplierForNode(
      schemaKey,
      selectedModel,
      workspaceCreditMultiplier,
    );
    return Math.max(1, Math.ceil(baseNodeCost * multiplier));
  }, [baseNodeCost, schemaKey, selectedModel, workspaceCreditMultiplier]);

  const costSuffix = isMotionModel
    ? "/s"
    : showsDurationCost
      ? ` (${params.duration ?? 5}s)`
      : undefined;

  const Icon = ICONS[schemaKey] ?? Sparkles;

  // ── Port colour palette ─────────────────────────────────────
  // Maps the schema's port `color` keyword (sky/emerald/violet/…)
  // to the actual --handle-color value. Wires share these tones.
  const PORT_COLORS: Record<string, string> = {
    sky: "hsl(217 91% 60%)",
    blue: "hsl(217 91% 60%)",
    emerald: "hsl(160 84% 39%)",
    violet: "hsl(258 90% 66%)",
    amber: "hsl(43 96% 56%)",
    pink: "hsl(328 86% 70%)",
    zinc: "hsl(0 0% 65%)",
  };
  const colorOf = (c: string) => PORT_COLORS[c] ?? PORT_COLORS.zinc;

  // ── Latest generation (or selected from history) for the preview ──
  const generations = (d.generations ?? []) as Generation[];
  const selectedGenIndex =
    typeof d.selectedGenIndex === "number" ? d.selectedGenIndex : 0;
  const currentGen = generations.length > 0
    ? (generations[selectedGenIndex] ?? generations[0])
    : null;
  const imagePreviewTransform = useMemo(
    () => ({
      width: Math.max(
        768,
        Math.min(
          1600,
          Math.ceil(
            ((d.compactWidth ?? DEFAULT_COMPACT_WIDTH) as number) *
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
  const previewImageUrl = useFreshSignedUrl(
    currentGen?.url && (currentGen.type === "image" || currentGen.model_url)
      ? currentGen.url
      : null,
    imagePreviewTransform,
  );

  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  // Reset measured dims when the displayed media swaps so the badge
  // reflects the new generation, not the previous one.
  useEffect(() => {
    setImgDims(null);
  }, [currentGen?.url]);

  const previewBadge = useMemo(() => {
    if (!currentGen) return null;
    if (currentGen.type === "image" && imgDims) {
      return `${imgDims.w} × ${imgDims.h}`;
    }
    if (currentGen.type === "video") {
      const dur = (params.duration as number | string | undefined) ?? null;
      return dur ? `${dur}s` : null;
    }
    return null;
  }, [currentGen, imgDims, params.duration]);

  // Settings to render in the floating toolbar — every visible param
  // EXCEPT the prompt textarea (which renders as the always-visible
  // bottom strip) and any conditional params hidden by visibleWhen.
  // Multi-shot's `multi_prompt` is rendered as a separate full-width
  // builder when active.
  const toolbarParams = useMemo(() => {
    return visibleParams.filter((p) => {
      if (p.key === "prompt") return false;
      // negative_prompt is a long textarea — would explode the toolbar.
      // Reserved for an "advanced" popover later; hidden in toolbar.
      if (p.key === "negative_prompt") return false;
      if (p.key === "multi_prompt") return false;
      if (p.visibleWhen) {
        const hidden = Object.entries(p.visibleWhen).some(
          ([k, v]) => String(params[k] ?? "") !== v,
        );
        if (hidden) return false;
      }
      // In multi-shot mode, duration is dictated by the scene sum.
      if (isMultiShot && p.key === "duration") return false;
      return true;
    });
  }, [visibleParams, params, isMultiShot]);

  /** Render one toolbar param using the most appropriate compact
   *  widget. Falls through to MiniSelect / a plain pill for anything
   *  the matchers don't handle. */
  const renderToolbarParam = useCallback(
    (param: ParamDef) => {
      const resolved = param.type === "dynamic" && param.dynamicType
        ? param.dynamicType(selectedModel)
        : null;
      const effectiveType = resolved?.type ?? param.type;
      const effectiveOptions = resolved?.options ?? param.options ?? [];
      const rawEffectiveLabels = resolved?.optionLabels ?? param.optionLabels;
      const effectiveLabels =
        param.key === "model_name"
          ? cleanModelLabelMap(rawEffectiveLabels)
          : rawEffectiveLabels;
      const localizedEffectiveLabels = effectiveOptions.includes("adaptive")
        ? {
            ...effectiveLabels,
            adaptive: t("workspace.standalone.option.adaptive"),
          }
        : effectiveLabels;
      const value = params[param.key] ?? resolved?.default ?? param.default;

      // Voice picker for audio gen was removed — see audioGenNode in
      // workspaceSchema.ts for context. Voice id falls back to the
      // backend's per-provider default.

      // GPT Image 2 — Aspect Ratio + Resolution split (UI-only).
      // The OpenAI gpt-image API takes a single `size` field, but
      // creators pick by aspect ratio first and resolution tier
      // second. We render two MiniSelects that compose back into
      // the canonical `size` value (see workspaceSchema helpers).
      // Old nodes with a stored `size` parse cleanly via splitGptImageSize.
      if (param.key === "size" && selectedModel === "gpt-image-2") {
        const { aspectRatio, resolution } = splitGptImageSize(String(value));
        const arOptions = GPT_IMAGE_2_ASPECT_RATIOS;
        const resOptions = gptImage2ResolutionsFor(aspectRatio);
        return (
          <span key={param.key} className="contents">
            <MiniSelect
              value={aspectRatio}
              options={arOptions}
              onChange={(nextAr) => {
                // When AR changes, keep the same resolution if it's
                // still valid; otherwise composeGptImageSize falls
                // back to the first tier available for the new AR.
                const nextSize = composeGptImageSize(nextAr, resolution);
                updateParam("size", nextSize);
              }}
            />
            <MiniSelect
              value={resolution}
              options={resOptions}
              onChange={(nextRes) => {
                const nextSize = composeGptImageSize(aspectRatio, nextRes);
                updateParam("size", nextSize);
              }}
            />
          </span>
        );
      }

      if (effectiveType === "select") {
        if (isBinarySelect(effectiveOptions)) {
          return (
            <TogglePill
              key={param.key}
              label={param.label}
              value={String(value)}
              options={effectiveOptions as [string, string]}
              optionLabels={localizedEffectiveLabels}
              onChange={(v) => updateParam(param.key, v)}
            />
          );
        }
        return (
          <MiniSelect
            key={param.key}
            value={String(value)}
            options={effectiveOptions}
            optionLabels={localizedEffectiveLabels}
            onChange={(v) => updateParam(param.key, v)}
            // Long lists (model_name today, future picker-style params)
            // open as a search-and-keyboard-nav dropdown instead of a
            // plain Radix Select. Keeps short dropdowns snappy.
            searchable={param.key === "model_name"}
            searchFooter={
              param.key === "model_name" ? t("createImagePanel.allModels") : undefined
            }
          />
        );
      }
      if (effectiveType === "slider") {
        const min = Number(resolved?.min ?? param.min ?? 0);
        const max = Number(resolved?.max ?? param.max ?? 1);
        const step = Number(resolved?.step ?? param.step ?? 1);
        const unit = param.key === "duration" ? "s" : "";
        return (
          <MiniSlider
            key={param.key}
            label={param.label}
            value={Number(value)}
            min={min}
            max={max}
            step={step}
            unit={unit}
            onChange={(v) => updateParam(param.key, v)}
          />
        );
      }
      // Anything else (text, json) is intentionally omitted from the
      // toolbar; falls through to nothing.
      return null;
    },
    [params, selectedModel, t, updateParam, schemaKey, id],
  );

  const localizePortLabel = (handleId: string, fallback: string): string => {
    const key = PORT_LABEL_KEYS[handleId as keyof typeof PORT_LABEL_KEYS];
    return key ? t(key) : fallback;
  };

  // Some node types (Image to 3D / Tripo3D) take only an image input
  // — the model's API doesn't accept a text prompt, so showing the
  // prompt textarea is misleading. Detect by checking whether the
  // schema's params actually declare a `prompt` entry; if it doesn't,
  // we hide the prompt overlay AND don't ship a `prompt` field in
  // the run request.
  const hasPromptParam = useMemo(
    () => schema?.params?.some((p) => p.key === "prompt") ?? false,
    [schema],
  );

  // The Tripo3D rendered_image is a small square thumbnail — letting
  // it drive the preview's height collapses the node to a tiny
  // landscape strip. Force the preview area to a 1:1 box so the
  // node looks consistent before AND after a 3D generation lands.
  const forceSquarePreview = schemaKey === "imageTo3dNode";

  // History dialog — opens when user clicks the preview's expand
  // affordance so they can scrub through previous generations.
  const [historyOpen, setHistoryOpen] = useState(false);
  const showInteractiveControls =
    selected || isHovered || isRunning || runStatus === "error" || historyOpen;

  /* ── Manual resize via the bottom-right corner handle ──────
   * Drag the small dot in the corner to scale the node's body
   * uniformly (width drives the layout — height auto-follows the
   * preview's aspect ratio, so the card stays in its current shape).
   * Settings widgets, ports, and the prompt text all stay at fixed
   * pixel sizes — only the rounded card / preview area grows. */
  const onResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = (d.compactWidth as number | undefined) ?? DEFAULT_COMPACT_WIDTH;
      const onMove = (ev: PointerEvent) => {
        const delta = (ev.clientX - startX) / WORKSPACE_NODE_UI_SCALE;
        const next = Math.max(
          320,
          Math.min(1200, Math.round(startWidth + delta)),
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
  const onSelectHistoryIndex = useCallback(
    (i: number) => updateNodeField("selectedGenIndex", i),
    [updateNodeField],
  );
  const onDeleteNode = useCallback(() => {
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    setNodes((ns) => ns.filter((node) => node.id !== id));
  }, [id, setEdges, setNodes]);

  // Multi-shot scenes (Kling VIDEO 3.0 / Omni when multi_shot=true).
  const multiShotScenes: SceneBlock[] = Array.isArray(params.multi_prompt)
    ? (params.multi_prompt as SceneBlock[])
    : [];

  if (!schema) {
    return (
      <div className="rounded-md border border-red-500 bg-red-950 px-3 py-2 text-xs text-red-200">
        {t("workspace.toolNode.unknownNodeType", { nodeType: schemaKey })}
      </div>
    );
  }

  return (
    <>
      <div
        className="ws-clean-node nodrag-shell"
        data-state={selected ? "selected" : "idle"}
        data-status={runStatus}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          width:
            ((d.compactWidth as number | undefined) ?? DEFAULT_COMPACT_WIDTH) *
            WORKSPACE_NODE_UI_SCALE,
        }}
      >
        {/* ── Floating title — sits ABOVE the body, no border. ── */}
        {/* Title icon stays neutral grey across every node type. The
         *  schema's `accentColor` still drives the port handle / wire
         *  colour for visual graph topology, but the title chrome
         *  itself reads as quiet greyscale to keep a busy canvas
         *  scannable. */}
        <NodeQuickActionRail
          visible={selected || isHovered}
          onDelete={!isViewer && selected ? onDeleteNode : undefined}
          nodeId={id}
          mediaKind={
            currentGen?.type === "image" || currentGen?.type === "video"
              ? currentGen.type
              : null
          }
          bodyTopOffsetPx={CLEAN_NODE_BODY_TOP_PX}
        />

        <div className="ws-clean-title">
          <Icon className="ws-clean-title-icon text-zinc-400" />
          <input
            value={(d.params?.nodeName as string) ?? schema.displayName}
            onChange={(e) =>
              updateNodeField("params", { ...params, nodeName: e.target.value })
            }
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="ws-clean-title-input nodrag"
            placeholder={schema.displayName}
          />
        </div>

        {/* Body card — single rounded container holding the preview
         *  (top) and prompt (bottom). No internal border between
         *  them; the whole node reads as one frame with a label
         *  floating above. */}
        <div
          className="ws-compact-node workspace-node-shell"
          data-state={selected ? "selected" : "idle"}
          data-status={runStatus}
        >

        {/* ── Preview area — 3D model / image / video / placeholder ── */}
        <div
          ref={previewRef}
          className="ws-compact-preview ws-preview-zone"
          data-square={forceSquarePreview ? "true" : undefined}
        >
          {/* 3D model output — render the rendered_image PNG as a
           *  static preview. Mounting `<model-viewer>` per node
           *  spins up a WebGL context per node, which collapses the
           *  whole canvas to ~5fps once you have a few 3D nodes.
           *  The interactive 3D viewer lives in the lightbox (one
           *  context, on demand) — double-click the node to open it.
           *  The "3D" chip tells users there's a real model behind
           *  the thumbnail. */}
          {currentGen?.model_url ? (
            <div className="relative h-full w-full">
              {currentGen.url ? (
                <img
                  src={previewImageUrl ?? currentGen.url}
                  alt={t("workspace.toolNode.modelPreviewAlt")}
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    objectFit: "contain",
                    background: "hsl(0 0% 6%)",
                    display: "block",
                    // Blur the previous output while a new run is in
                    // progress so users can tell the node is busy
                    // even when the prior image is still on screen.
                    filter: isRunning ? "blur(10px) brightness(0.85)" : undefined,
                    transition: "filter 200ms ease",
                  }}
                />
              ) : (
                <div
                  className="flex w-full items-center justify-center text-zinc-600"
                  style={{ aspectRatio: "1 / 1", background: "hsl(0 0% 6%)" }}
                >
                  <span className="text-xs">{t("workspace.lightbox.alt_3d_model")}</span>
                </div>
              )}
              <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-amber-300">
                {t("workspace.toolNode.open3dPreviewHint")}
              </span>
            </div>
          ) : currentGen?.type === "image" && currentGen.url && (
            <img
              src={previewImageUrl ?? currentGen.url}
              alt=""
              draggable={false}
              loading="lazy"
              decoding="async"
              onLoad={(e) => {
                const img = e.target as HTMLImageElement;
                setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
              }}
              style={{
                // Blur the prior image during a re-run so the running
                // state is unmistakable. The RunTimer + spinner stay
                // sharp because they live outside this <img>.
                filter: isRunning ? "blur(10px) brightness(0.85)" : undefined,
                transition: "filter 200ms ease",
              }}
            />
          )}
          {currentGen?.type === "video" && currentGen.url && (
            <video
              src={currentGen.url}
              muted
              playsInline
              onMouseEnter={(e) =>
                (e.target as HTMLVideoElement).play().catch(() => {})
              }
              onMouseLeave={(e) => {
                const v = e.target as HTMLVideoElement;
                v.pause();
                v.currentTime = 0;
              }}
              style={{
                // Same blur-on-rerun treatment as the image branch.
                filter: isRunning ? "blur(10px) brightness(0.85)" : undefined,
                transition: "filter 200ms ease",
              }}
            />
          )}
          {currentGen?.type === "text" && (
            <div className="max-h-[220px] overflow-y-auto p-3 text-[11px] leading-snug text-white/80">
              {currentGen.text}
            </div>
          )}
          {!currentGen && <div className="ws-compact-preview-empty" />}

          {/* Top-right info badge */}
          {previewBadge && (
            <div className="ws-compact-preview-badge">{previewBadge}</div>
          )}

          {/* Multi-history affordance — only show when 2+ generations */}
          {showInteractiveControls && generations.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setHistoryOpen(true);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="ws-history-toggle absolute left-2 top-2 nodrag flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white/80 backdrop-blur-sm hover:bg-black/80"
              title={t("workspace.toolNode.browseHistory")}
            >
              <Maximize2 className="h-2.5 w-2.5" />
              {selectedGenIndex + 1}/{generations.length}
            </button>
          )}

          {/* ── Settings overlay — fades in on hover/select ── */}
          {showInteractiveControls && (
            <div className="ws-compact-overlay">
              <div ref={toolbarRef} className="ws-compact-toolbar">
                {toolbarParams.map((p) => renderToolbarParam(p))}
                {supportsMultiGen && !isMultiShot && (
                  <MultiGenStepper
                    count={multiGenCount}
                    disabled={isRunning || isViewer}
                    onChange={updateMultiGenCount}
                  />
                )}
              </div>
            </div>
          )}

          {/* ── Prompt — pinned to the bottom of the preview, lifts
           *  on hover so it clears the settings toolbar. The Run
           *  button used to live INSIDE this row, which made it
           *  rise with the prompt; the team reported the button
           *  drifting up too high when hovering. The Run button is
           *  now its own anchor (see below), so the prompt overlay
           *  is purely the textarea. */}
          {showInteractiveControls && !isMultiShot && (
            <div
              className={cn(
                "ws-compact-prompt-overlay has-run-anchor",
                !hasPromptParam && "is-no-prompt",
              )}
            >
              {hasPromptParam ? (
                <PromptMentionTextarea
                  value={String(params.prompt ?? "")}
                  onChange={(v) => updateParam("prompt", v)}
                  /* Inline-style cap that scales with the preview
                   *  height. Beats every other CSS rule in the
                   *  cascade so the prompt never swallows a small
                   *  node — the user kept hitting that bug on
                   *  resize after generation. */
                  maxHeightPx={promptMaxH}
                  placeholder={
                    schema.displayName.toLowerCase().includes("video")
                      ? t("workspace.toolNode.videoPromptPlaceholder")
                      : t("workspace.toolNode.imagePromptPlaceholder")
                  }
                  excludeNodeId={id}
                  scrollRestoreKey={`workspace-tool-node:${id}:prompt`}
                  className="ws-compact-prompt-input"
                  allowedNodeTypes={[
                    "assetNode",
                    "inputNode",
                    "elementNode",
                    "imageGenNode",
                    "videoGenNode",
                    "audioGenNode",
                    "videoToPromptNode",
                    "imageTo3dNode",
                    "removeBackgroundNode",
                    "mergeAudioNode",
                    "bananaProNode",
                    "klingVideoNode",
                    "chatAiNode",
                    "groupNode",
                  ]}
                  allowedNodeIds={connectedSourceIds}
                  allowedTextVarTypes={["textInputNode", "textNode"]}
                />
              ) : (
                <span className="ws-compact-prompt-hint">
                  {t("workspace.toolNode.wireImageAndRun")}
                </span>
              )}
            </div>
          )}

          {/* ── Run button anchor — fixed at the bottom-right corner
           *  of the preview. Fades in on hover/select with the same
           *  slide-up animation as the settings toolbar so the user
           *  reads it as part of the same "controls reveal" gesture.
           *  Lives outside .ws-compact-prompt-overlay so it doesn't
           *  inherit the prompt's dynamic-lift behaviour. */}
          {showInteractiveControls && !isMultiShot && (
            <div className="ws-compact-run-anchor">
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      runMultiGen(multiGenCount);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    disabled={isRunning || isViewer}
                    className={cn(
                      "ws-compact-run nodrag",
                      runStatus === "error" && "is-error",
                    )}
                  >
                    {isRunning ? (
                      <Loader2 className="animate-spin" />
                    ) : runStatus === "error" ? (
                      <RotateCw />
                    ) : (
                      <Play className="fill-current" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="end">
                  <div className="flex flex-col gap-0.5 text-xs">
                    <span>
                      {isViewer
                        ? "View only — runs disabled"
                        : isRunning
                          ? "Running…"
                          : runStatus === "error"
                            ? "Retry"
                            : "Run (Ctrl+Enter)"}
                    </span>
                    {!isViewer && (
                      <span className="text-muted-foreground">
                        {creditCostsLoading
                          ? "Loading cost…"
                          : nodeCost != null
                            ? `Cost: ${nodeCost}${costSuffix ?? ""} credits`
                            : "Pricing unavailable"}
                      </span>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
              {isRunning && (
                <RunTimer
                  startedAt={(d.runStartedAt as number | null | undefined) ?? null}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Multi-shot scene builder (Kling VIDEO 3.0 / Omni) — keeps its
         *  own row below the preview because the scene list grows
         *  too tall to overlay sensibly. */}
        {runStatus === "error" && d.lastRunError && (
          <div className="border-t border-red-500/20 bg-red-950/45 px-3 py-2 text-[11px] font-medium leading-snug text-red-100">
            {d.lastRunError}
          </div>
        )}

        {showInteractiveControls && isMultiShot && (
          <div className="bg-zinc-900/60 p-2">
            <MultiShotBuilder
              scenes={multiShotScenes}
              onChange={handleScenesChange}
              excludeNodeId={id}
            />
          </div>
        )}

        {/* Corner resize handle — drag from the bottom-right corner
         *  to scale the card. Visible only when the node is hovered
         *  or selected. The handle uses pointerdown capture (in the
         *  inline JS handler above) to take ownership of the gesture
         *  so React Flow's drag-node doesn't fight us. */}
        <div
          className="ws-compact-resize-handle nodrag"
          onPointerDown={onResizeStart}
          onMouseDown={(e) => e.stopPropagation()}
          title={t("workspace.toolNode.dragToResize")}
          aria-label={t("workspace.toolNode.resizeNode")}
        />
        </div> {/* end ws-compact-node body card */}
      </div>

      {/* History dialog (shared with the legacy NodeResultBar). */}
      {historyOpen && generations.length > 0 && (
        <NodeResultDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          generations={generations}
          selectedIndex={selectedGenIndex}
          onSelect={onSelectHistoryIndex}
        />
      )}

      {/* ── Port icon cluster ── */}
      {visibleInputs.map((inp, i) => (
        <PortIcon
          key={`in-${inp.id}`}
          dir="target"
          handleId={inp.id}
          label={localizePortLabel(inp.id, inp.label)}
          portType={portTypeFromHandleId(inp.id)}
          color={colorOf(inp.color)}
          index={i}
        />
      ))}
      {visibleOutputs.map((out, i) => (
        <PortIcon
          key={`out-${out.id}`}
          dir="source"
          handleId={out.id}
          label={localizePortLabel(out.id, out.label)}
          portType={portTypeFromHandleId(out.id)}
          color={colorOf(out.color)}
          index={i}
          bodyTopOffsetPx={CLEAN_NODE_BODY_TOP_PX}
        />
      ))}
      {insufficientOpen && (
        <InsufficientCreditsDialog
          open={insufficientOpen}
          onOpenChange={setInsufficientOpen}
          requiredCredits={nodeCost ?? undefined}
          workspaceId={currentWorkspaceId}
        />
      )}
    </>
  );
});

WorkspaceToolNode.displayName = "WorkspaceToolNode";
export default WorkspaceToolNode;

function MultiGenStepper({
  count,
  disabled,
  onChange,
}: {
  count: number;
  disabled: boolean;
  onChange: (count: number) => void;
}) {
  const { t } = useLanguage();
  const decDisabled = disabled || count <= 1;
  const incDisabled = disabled || count >= MULTI_GEN_MAX;

  return (
    <div
      className="nodrag flex h-7 items-center gap-0.5 rounded-full bg-black/35 px-1 text-[11px] font-semibold text-zinc-100"
      title={t("workspace.toolNode.variationStepperTip")}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={decDisabled}
        onClick={() => onChange(count - 1)}
        className={cn(
          "grid h-5 w-5 place-items-center rounded-full transition-colors",
          decDisabled ? "cursor-not-allowed text-zinc-600" : "text-zinc-300 hover:bg-white/10 hover:text-white",
        )}
        aria-label={t("workspace.toolNode.decreaseVariation")}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-6 text-center tabular-nums">x{count}</span>
      <button
        type="button"
        disabled={incDisabled}
        onClick={() => onChange(count + 1)}
        className={cn(
          "grid h-5 w-5 place-items-center rounded-full transition-colors",
          incDisabled ? "cursor-not-allowed text-zinc-600" : "text-zinc-300 hover:bg-white/10 hover:text-white",
        )}
        aria-label={t("workspace.toolNode.increaseVariation")}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* VoicePickerButton + VoicePickerDialog were removed when the
 * hardcoded voice preset lists were deleted. Audio gen on the canvas
 * is select-only at the model level; voice id uses the backend's
 * per-provider default. */
