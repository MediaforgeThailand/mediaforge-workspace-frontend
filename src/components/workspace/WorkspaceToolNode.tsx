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
  useNodes,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Film, Loader2, Pause, Play, RotateCw, Sparkles, Scissors, Combine, FileVideo, Languages,
  Maximize2, Box, Image as ImageIcon, Music, Info, Users, SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { CLEAN_NODE_BODY_TOP_PX, PortIcon } from "./PortIcon";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import InsufficientCreditsDialog from "@/components/InsufficientCreditsDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSignInModal } from "@/hooks/useSignInModal";
import { friendlyError } from "@/lib/friendlyError";

import { type ParamDef } from "@/components/flow/nodes/nodeApiSchema";
import { useNodeCreditCosts as useCreatorCreditCosts } from "@/hooks/useNodeCreditCosts";
import { useCredits } from "@/hooks/useCredits";
import { useVoicePreview } from "@/hooks/useVoicePreview";
import {
  applyNodeCostDiscount,
  applyPackageCostDiscount,
  calculateNodeCostQuote,
  effectiveNodeDiscountPercent,
} from "@/lib/nodeCostCalculator";
import {
  featureLabelForPlanLock,
  freePlanBlockedFeatureForNodeType,
  isWorkspaceFreePlan,
  type WorkspacePaidFeature,
} from "@/lib/workspacePlanAccess";
import PromptMentionTextarea from "@/components/flow/nodes/PromptMentionTextarea";
import MultiShotBuilder, {
  type SceneBlock,
} from "@/components/flow/nodes/MultiShotBuilder";
import {
  countPromptChars,
  findOverLimitScenes,
  getPromptCharLimit,
  KLING_MULTISHOT_SCENE_LIMIT,
} from "@/lib/promptLimits";
import {
  TogglePill,
  MiniSelect,
  MiniSlider,
  MiniTextInput,
  isBinarySelect,
} from "./CompactParamWidgets";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useDebugLogStore } from "@/store/useDebugLogStore";
import { useCanvasRecoveryJobsForNode } from "@/store/useCanvasJobsRecovery";
import {
  selectIsViewer,
  useWorkspaceShareRole,
} from "@/store/useWorkspaceShareRole";
import NodeResultDialog from "./NodeResultDialog";
import { RunTimer } from "./RunTimer";
import type { Generation } from "./NodeResultBar";
import { AudioPlayButton } from "./AudioPlayButton";
import GenerateIcon from "@/components/GenerateIcon";
// Voice catalog imports were removed when the hardcoded preset
// lists were deleted. Audio gen nodes no longer surface a voice
// picker on the canvas — backend uses its own per-provider default.
import { cloneNodeFresh } from "./cloneNode";
import { useFreshSignedUrl } from "./useFreshSignedUrl";
import { getSignedUrl } from "@/hooks/useSignedUrl";
import {
  isSeedanceReferenceVideoDurationValid,
  isSeedanceReferenceVideoPixelCountValid,
  readVideoMetadataFromSource,
  SEEDANCE_REF_VIDEO_MAX_SEC,
  SEEDANCE_REF_VIDEO_MIN_SEC,
  seedanceReferenceVideoPixelMessage,
  type VideoMetadata,
} from "./videoMetadata";
import NodeQuickActionRail from "./NodeQuickActionRail";
import { normalizeUrlAssetSource, validateUrlAssetSource } from "./urlAssetValidation";
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
  isNodeMentionedAnywhere,
  isVideoFrameImageOutputHandle,
  portTypeFromHandleId,
  splitGptImageSize,
  textNodeImageOutputNodeId,
  textNodeVideoOutputNodeId,
} from "./workspaceSchema";
import { cleanModelLabelMap } from "./modelDisplay";
import {
  captureVideoFrameAtSecondsBlob,
  extractAndUploadVideoFrames,
  safeStorageSegment,
  uploadExtractedFrame,
} from "./videoFrameExtraction";

const RUN_EDGE_FUNCTION = "workspace-run-node";
const DEFAULT_WORKSPACE_INFRASTRUCTURE_BUFFER_PERCENT = 40;
const MAX_VISIBLE_RUN_MS = 60 * 60_000;
const STALE_RUN_GRACE_MS = 30_000;
const MULTI_GEN_MAX = 3;
const MULTI_GEN_X_OFFSET = 480;
const JOB_RECOVERY_LOOKBACK_MS = 5_000;
const TERMINAL_JOB_STATUSES = new Set([
  "completed",
  "failed",
  "permanent_failed",
  "cancelled",
  "canceled",
]);

function hasActiveWorkspaceJob(data?: NodeData | null): boolean {
  if (!data) return false;
  if (data.status === "processing") return true;
  if (data.activeRunId || data.runStartedAt) return true;
  if (!data.backgroundJobId) return false;
  const jobStatus = String(data.jobStatus ?? "").toLowerCase();
  return jobStatus !== "" && !TERMINAL_JOB_STATUSES.has(jobStatus);
}
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

/**
 * Per-row ▶ button rendered INSIDE each item in the searchable Gemini
 * voice picker. It does NOT mount its own `useVoicePreview` instance —
 * that would create 30 isolated <audio> elements that wouldn't stop
 * each other when a different voice is auditioned. Instead, the
 * parent (WorkspaceToolNode) holds one shared hook and pipes state
 * into each row via these props.
 */
function VoicePreviewItemButton({
  voiceId,
  isPlaying,
  isLoading,
  onPlay,
}: {
  voiceId: string;
  isPlaying: boolean;
  isLoading: boolean;
  onPlay: (voiceId: string) => void;
}) {
  const { t } = useLanguage();
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPlay(voiceId);
  };
  const previewLabel = t(
    isPlaying ? "workspace.toolNode.voicePreviewStop" : "workspace.toolNode.voicePreviewPlay",
    { voiceId },
  );
  return (
    <button
      type="button"
      onClick={handleClick}
      title={previewLabel}
      aria-label={previewLabel}
      className={cn(
        "grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full transition",
        "bg-white/[0.08] text-zinc-200 hover:bg-white/[0.16] hover:text-white",
        isPlaying && "bg-amber-300/30 text-amber-200",
      )}
    >
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : isPlaying ? (
        <Pause className="h-3 w-3" />
      ) : (
        <Play className="h-3 w-3" />
      )}
    </button>
  );
}

function isSeedanceV2VideoModel(model: string | undefined): boolean {
  const m = String(model ?? "").toLowerCase();
  return (
    m.startsWith("seedance-2-0") ||
    m.startsWith("dreamina-seedance-2-0") ||
    m.startsWith("replicate-seedance-2-0")
  );
}

function isKlingMotionVideoModel(model: string | undefined): boolean {
  const m = String(model ?? "").toLowerCase();
  return (
    m === "kling-v2-6-motion-pro" ||
    m === "kling-v3-motion-pro" ||
    m === "replicate-kling-v3-motion-pro"
  );
}

function seedanceReferenceVideoDurationMessage(durationSec?: number | null): string {
  const durationLabel =
    typeof durationSec === "number" && Number.isFinite(durationSec)
      ? ` (${durationSec.toFixed(1)}s)`
      : "";
  return `Seedance 2.0 reference videos must be ${SEEDANCE_REF_VIDEO_MIN_SEC}-${SEEDANCE_REF_VIDEO_MAX_SEC} seconds${durationLabel}.`;
}

function videoInputUrls(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

async function readReferenceVideoMetadata(url: string): Promise<VideoMetadata | null> {
  const readableUrl = /^(blob:|data:)/i.test(url) ? url : await getSignedUrl(url);
  return readVideoMetadataFromSource(readableUrl);
}

async function validateSeedanceReferenceVideos(inputs: Record<string, unknown>): Promise<void> {
  const urls = videoInputUrls(inputs.ref_video);
  if (urls.length === 0) return;
  let totalDuration = 0;
  for (const url of urls) {
    const metadata = await readReferenceVideoMetadata(url);
    const durationSec = metadata?.durationSec ?? null;
    if (durationSec == null) {
      throw new Error(
        "Could not read the Seedance 2.0 reference video metadata. Use an MP4/MOV video between 2 and 15 seconds at 1080p or smaller.",
      );
    }
    if (!isSeedanceReferenceVideoDurationValid(durationSec)) {
      throw new Error(seedanceReferenceVideoDurationMessage(durationSec));
    }
    if (!metadata || !isSeedanceReferenceVideoPixelCountValid(metadata)) {
      throw new Error(seedanceReferenceVideoPixelMessage(metadata));
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
  // Gemini TTS runs inline inside workspace-run-node via the Gemini API; it
  // doesn't apply the workspace infrastructure multiplier yet, so keep the
  // canvas estimate aligned with the standalone tools preview.
  if (schemaKey === "audioGenNode" && model.startsWith("gemini-")) return 1;
  return workspaceMultiplier;
}

function formatCreditAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.ceil(value));
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
  /** Asset-only: browser-extracted end-frame JPEG for video sources.
   *  Set when the user @-mentions a video node in an image-gen prompt
   *  so the backend can substitute the JPG URL for the raw video
   *  URL — Gemini / Banana otherwise rejects an .mp4 ref with HTTP
   *  400 "Unable to process input image". Populated by the video
   *  source node's frame-extraction effect; falls back to null if
   *  the frame hasn't been captured yet. */
  imageFrameUrl?: string | null;
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

/**
 * Resolve a mention's image URL for image-gen consumers. Returns the
 * raw `url` for native image mentions, or `imageFrameUrl` for video
 * mentions that carry a browser-extracted end-frame. Returns null for
 * anything else (audio mentions, element mentions, videos with no
 * frame yet) so callers can short-circuit cleanly.
 */
function effectiveMentionImageRefUrl(m: MentionedAsset): string | null {
  if (m.kind !== "asset") return null;
  if (m.fieldType === "image" && typeof m.url === "string" && m.url) return m.url;
  if (m.fieldType === "video" && typeof m.imageFrameUrl === "string" && m.imageFrameUrl) return m.imageFrameUrl;
  return null;
}

/** Walk an ElementNode's data + canvas edges to produce the Kling Omni
 *  element shape — same logic for both saved (cached refs on data) and
 *  creator (refs come from upstream AssetNode wires) modes. Shared by
 *  resolveMentions (when @-mentioned) and resolveInputs (when wired). */
function collectElementRefs(
  node: { id: string; data?: unknown },
  allNodes: ReadonlyArray<{ id: string; type?: string; data?: unknown }>,
  allEdges: ReadonlyArray<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>,
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
    const url = assetUrlForSourceHandle(refData, e.sourceHandle);
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
  allowedNodeIds?: ReadonlySet<string>,
): { cleanText: string; mentioned: MentionedAsset[] } {
  const src = text ?? "";
  const mentioned: MentionedAsset[] = [];
  const seen = new Set<string>();

  const pushMention = (
    label: string,
    node: { id: string; type?: string; data?: unknown },
  ) => {
    if (allowedNodeIds && !allowedNodeIds.has(node.id)) return;
    if (seen.has(node.id)) return;
    const d = (node.data ?? {}) as any;
    if (node.type === "assetNode" || node.type === "inputNode") {
      seen.add(node.id);
      const fieldType = d.fieldType ?? "image";
      mentioned.push({
        kind: "asset",
        role: typeof d.referenceType === "string" ? d.referenceType : "general",
        label,
        nodeId: node.id,
        url: d.previewUrl ?? d.storagePath ?? null,
        fieldType,
        // Uploaded videos: surface the captured end-frame JPG so the
        // mention can target image-gen prompts. extractAndUploadVideoFrames
        // populated d.endFrameUrl as soon as the node was selected /
        // hovered / wired or mentioned.
        imageFrameUrl: fieldType === "video" ? (d.endFrameUrl ?? null) : null,
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
      ? (d.generations as Array<{ url?: string; type?: string; model_url?: string; endFrameUrl?: string }>)
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
        // AI-generated videos: surface the captured end-frame JPG so
        // an image-gen prompt mentioning this node receives a real
        // image ref via the backend's mention fallback. Frame
        // extraction is kicked off by the video tool node's
        // useEffect when it sees an outgoing frame edge or detects
        // it has been mentioned anywhere.
        imageFrameUrl: fieldType === "video" ? (g.endFrameUrl ?? null) : null,
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
      const matchType =
        x.type === "assetNode" || x.type === "inputNode" || x.type === "elementNode";
      return matchType && (d?.label === name || d?.nodeName === name);
    });
    if (node) pushMention(name, node);
  }

  return { cleanText: src, mentioned };
}

function selectedNodeGeneration(data: Record<string, unknown>) {
  const generations = Array.isArray(data.generations)
    ? (data.generations as Array<{ url?: string; type?: string; model_url?: string }>)
    : [];
  const selectedIndex =
    typeof data.selectedGenIndex === "number" ? (data.selectedGenIndex as number) : 0;
  return generations[selectedIndex] ?? generations[0];
}

function assetUrlForSourceHandle(
  data: Record<string, unknown>,
  sourceHandle: string | null | undefined,
): string | null {
  if (data.uploading === true) {
    throw new Error(
      "Reference asset is still uploading - wait a moment and click Run again",
    );
  }

  if (isVideoFrameImageOutputHandle(sourceHandle)) {
    const key = sourceHandle === "output_start_frame" ? "startFrameUrl" : "endFrameUrl";
    const url = data[key];
    if (typeof url === "string" && url.length > 0) return url;
    if (data.extractingVideoFrames === true) {
      throw new Error(
        "Video frame image is still preparing. Wait a moment and click Run again.",
      );
    }
    const detail =
      typeof data.frameExtractionError === "string" && data.frameExtractionError
        ? ` ${data.frameExtractionError}`
        : "";
    throw new Error(`Video frame image is not ready yet.${detail}`);
  }

  return typeof data.previewUrl === "string"
    ? data.previewUrl
    : typeof data.storagePath === "string"
      ? data.storagePath
      : null;
}

function nodeCanProvideImageMentionRef(
  node: { id: string; type?: string; data?: unknown } | undefined,
  sourceHandle: string | null | undefined,
): boolean {
  if (!node) return false;
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (node.type === "assetNode" || node.type === "inputNode") {
    if (node.type === "assetNode" && isVideoFrameImageOutputHandle(sourceHandle)) return true;
    const fieldType = typeof data.fieldType === "string" ? data.fieldType : "image";
    return fieldType === "image";
  }
  if (node.type === "groupNode") return false;
  if (sourceHandle && portTypeFromHandleId(sourceHandle) !== "image") return false;
  const generation = selectedNodeGeneration(data);
  if (generation) return generation.type === "image" && typeof generation.url === "string";
  return ["imageGenNode", "upscaleImageNode", "removeBackgroundNode", "bananaProNode", "vfxQwenImageNode"].includes(node.type ?? "");
}

function nodeCanProvideVideoMentionRef(
  node: { id: string; type?: string; data?: unknown } | undefined,
  sourceHandle: string | null | undefined,
): boolean {
  if (!node) return false;
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (node.type === "assetNode" || node.type === "inputNode") {
    const fieldType = typeof data.fieldType === "string" ? data.fieldType : "image";
    return fieldType === "video";
  }
  if (node.type === "groupNode") return false;
  if (sourceHandle && portTypeFromHandleId(sourceHandle) !== "video") return false;
  const generation = selectedNodeGeneration(data);
  if (generation) return generation.type === "video" && typeof generation.url === "string";
  return ["videoGenNode", "klingVideoNode", "upscaleImageNode"].includes(node.type ?? "");
}

function imageUrlFromWorkspaceNode(
  node: { id: string; type?: string; data?: unknown } | undefined,
  sourceHandle?: string | null,
): string | null {
  if (!node) return null;
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (node.type === "assetNode" || node.type === "inputNode") {
    return assetUrlForSourceHandle(data, sourceHandle);
  }
  const generation = selectedNodeGeneration(data);
  if (generation?.type === "image" && typeof generation.url === "string") {
    return generation.url;
  }
  const fallback =
    typeof data.previewUrl === "string"
      ? data.previewUrl
      : typeof data.imageUrl === "string"
        ? data.imageUrl
        : typeof data.image_url === "string"
          ? data.image_url
          : null;
  return fallback;
}

function videoUrlFromWorkspaceNode(
  node: { id: string; type?: string; data?: unknown } | undefined,
  sourceHandle?: string | null,
): string | null {
  if (!node) return null;
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (node.type === "assetNode" || node.type === "inputNode") {
    return assetUrlForSourceHandle(data, sourceHandle);
  }
  const generation = selectedNodeGeneration(data);
  if (generation?.type === "video" && typeof generation.url === "string") {
    return generation.url;
  }
  const fallback =
    typeof data.previewUrl === "string"
      ? data.previewUrl
      : typeof data.videoUrl === "string"
        ? data.videoUrl
        : typeof data.video_url === "string"
          ? data.video_url
          : null;
  return fallback;
}

function connectedTextNodeImageSourceIds(
  textNodeId: string,
  allNodes: ReadonlyArray<{ id: string; type?: string; data?: unknown }>,
  allEdges: ReadonlyArray<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>,
): Set<string> {
  const ids = new Set<string>();
  for (const edge of allEdges) {
    if (edge.target !== textNodeId) continue;
    if ((edge.targetHandle ?? "") !== "ref_image") continue;
    const source = allNodes.find((node) => node.id === edge.source);
    if (nodeCanProvideImageMentionRef(source, edge.sourceHandle)) ids.add(edge.source);
  }
  return ids;
}

function connectedTextNodeVideoSourceIds(
  textNodeId: string,
  allNodes: ReadonlyArray<{ id: string; type?: string; data?: unknown }>,
  allEdges: ReadonlyArray<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>,
): Set<string> {
  const ids = new Set<string>();
  for (const edge of allEdges) {
    if (edge.target !== textNodeId) continue;
    if ((edge.targetHandle ?? "") !== "ref_video") continue;
    const source = allNodes.find((node) => node.id === edge.source);
    if (nodeCanProvideVideoMentionRef(source, edge.sourceHandle)) ids.add(edge.source);
  }
  return ids;
}

function connectedTextNodeMediaSourceIds(
  textNodeId: string,
  allNodes: ReadonlyArray<{ id: string; type?: string; data?: unknown }>,
  allEdges: ReadonlyArray<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>,
): Set<string> {
  return new Set([
    ...connectedTextNodeImageSourceIds(textNodeId, allNodes, allEdges),
    ...connectedTextNodeVideoSourceIds(textNodeId, allNodes, allEdges),
  ]);
}

function extractMentionNodeIds(text: string | undefined): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(MENTION_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text ?? "")) !== null) {
    const nodeId = match[2];
    if (!seen.has(nodeId)) {
      seen.add(nodeId);
      ids.push(nodeId);
    }
  }
  return ids;
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

  const setMediaInputMeta = (
    key: string,
    sourceData: Record<string, unknown>,
    mediaType: string | undefined,
  ) => {
    if (key !== "media") return;
    if (mediaType === "audio" || mediaType === "video") {
      out.media_type = mediaType;
      out.source_media_type = mediaType;
    }
    const contentType =
      typeof sourceData.mime === "string"
        ? sourceData.mime
        : typeof sourceData.contentType === "string"
          ? sourceData.contentType
          : typeof sourceData.type === "string" && sourceData.type.includes("/")
            ? sourceData.type
            : "";
    if (contentType) out.source_content_type = contentType;
    const duration = Number(
      sourceData.durationSec ??
        sourceData.duration_seconds ??
        sourceData.duration,
    );
    if (Number.isFinite(duration) && duration > 0) {
      out.source_duration_seconds = duration;
    }
  };

  for (const e of edges) {
    if (e.target !== nodeId) continue;
    const src = nodes.find((n) => n.id === e.source);
    if (!src) continue;
    const srcData = (src.data ?? {}) as Record<string, unknown>;
    const key = e.targetHandle ?? "default";
    if (src.type === "textNode") {
      const imageSourceNodeId = textNodeImageOutputNodeId(e.sourceHandle);
      if (imageSourceNodeId) {
        const allowedImageIds = connectedTextNodeImageSourceIds(src.id, nodes, edges);
        if (!allowedImageIds.has(imageSourceNodeId)) {
          throw new Error(
            "Text node image output is no longer connected to that reference. Reconnect the image into the Text node, or remove the stale wire.",
          );
        }
        const imageNode = nodes.find((n) => n.id === imageSourceNodeId);
        const imageEdge = edges.find(
          (edge) =>
            edge.source === imageSourceNodeId &&
            edge.target === src.id &&
            (edge.targetHandle ?? "") === "ref_image",
        );
        const imageUrl = imageUrlFromWorkspaceNode(imageNode, imageEdge?.sourceHandle);
        if (!imageUrl) {
          throw new Error(
            "Text node image output is not ready yet. Upload or generate that image ref first.",
          );
        }
        pushAt(key, imageUrl);
        continue;
      }
      const videoSourceNodeId = textNodeVideoOutputNodeId(e.sourceHandle);
      if (videoSourceNodeId) {
        const allowedVideoIds = connectedTextNodeVideoSourceIds(src.id, nodes, edges);
        if (!allowedVideoIds.has(videoSourceNodeId)) {
          throw new Error(
            "Text node video output is no longer connected to that reference. Reconnect the video into the Text node, or remove the stale wire.",
          );
        }
        const videoNode = nodes.find((n) => n.id === videoSourceNodeId);
        const videoEdge = edges.find(
          (edge) =>
            edge.source === videoSourceNodeId &&
            edge.target === src.id &&
            (edge.targetHandle ?? "") === "ref_video",
        );
        const videoUrl = videoUrlFromWorkspaceNode(videoNode, videoEdge?.sourceHandle);
        if (!videoUrl) {
          throw new Error(
            "Text node video output is not ready yet. Upload or generate that video ref first.",
          );
        }
        pushAt(key, videoUrl);
        continue;
      }
      // Text node has TWO content fields:
      //   data.content      — "Result prompt" tab (optimized/canonical output)
      //   data.inputContent — "Prompt" tab (raw human input)
      // The wire is supposed to carry the canonical output, but if the
      // user only typed in the Prompt tab and hasn't run the optimizer,
      // `content` stays empty. Reading just `content` then sends "" to
      // the image model, which throws "A prompt is required" with no
      // hint to the user that the Result-prompt tab is the one being
      // shipped. Prefer `content` when set (preserves the optimizer's
      // output), else fall back to the raw `inputContent` so the wire
      // never silently ships empty text.
      const resultText = typeof srcData.content === "string" ? srcData.content : "";
      const inputText = typeof srcData.inputContent === "string" ? srcData.inputContent : "";
      const textContent = resultText.trim() ? resultText : inputText;
      const allowedMediaIds = connectedTextNodeMediaSourceIds(src.id, nodes, edges);
      const tokenNodeIds = extractMentionNodeIds(textContent);
      const disconnected = tokenNodeIds.filter((nodeId) => !allowedMediaIds.has(nodeId));
      if (disconnected.length > 0) {
        throw new Error(
          "Text node has @mentions that are not wired into its media-ref input. Connect those media nodes to the Text node first, or remove the stale mention chips.",
        );
      }
      const { cleanText, mentioned } = resolveMentions(
        textContent,
        nodes,
        edges,
        allowedMediaIds,
      );
      const resolvedMentionIds = new Set(mentioned.map((m) => m.nodeId));
      const unresolved = tokenNodeIds.filter((nodeId) => !resolvedMentionIds.has(nodeId));
      if (unresolved.length > 0) {
        throw new Error(
          "Text node has @mentions whose media output is not ready yet. Upload or generate those media refs first.",
        );
      }
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
      if (srcData.uploading === true) {
        throw new Error(
          "ไฟล์อ้างอิงยังอัปโหลดไม่เสร็จ — รอสักครู่แล้วกด Run อีกครั้ง / " +
            "Reference asset is still uploading — wait a moment and click Run again",
        );
      }
      const assetUrl = assetUrlForSourceHandle(srcData, e.sourceHandle);
      pushAt(key, assetUrl);
      setMediaInputMeta(
        key,
        srcData,
        typeof srcData.fieldType === "string" ? srcData.fieldType : undefined,
      );
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
    } else if (Array.isArray(srcData.generations) && srcData.generations.length > 0) {
      // Tool nodes (Image Gen, Video Gen, BG Remove, Audio Merge, …)
      // store their Run output under `data.generations` — array of
      // { id, type, url?, text?, createdAt }, latest at index 0.
      // Wire the most-recently-selected generation's URL/text into
      // the downstream node's input.
      const generations = srcData.generations as Array<{
        url?: string;
        text?: string;
        type?: string;
        startFrameUrl?: string;
        endFrameUrl?: string;
      }>;
      const idx =
        typeof srcData.selectedGenIndex === "number"
          ? (srcData.selectedGenIndex as number)
          : 0;
      const gen = generations[idx] ?? generations[0];
      // Frame-handle wires (output_start_frame / output_end_frame /
      // output_last_frame) on a video gen need the extracted JPEG, not
      // the raw video URL — otherwise downstream image models (Banana,
      // OpenAI) reject the request with "Unable to process input
      // image". Frames are populated by the useEffect inside
      // WorkspaceToolNode when an outgoing frame edge is present.
      if (gen?.type === "video" && isVideoFrameImageOutputHandle(e.sourceHandle)) {
        const frameUrl =
          e.sourceHandle === "output_start_frame"
            ? gen.startFrameUrl
            : gen.endFrameUrl;
        if (!frameUrl) {
          throw new Error(
            "Video frame image is still preparing. Wait a moment and click Run again.",
          );
        }
        pushAt(key, frameUrl);
      } else {
        pushAt(key, gen?.url ?? gen?.text ?? null);
        setMediaInputMeta(
          key,
          gen as unknown as Record<string, unknown>,
          gen?.type,
        );
      }
    }
  }
  return { inputs: out, textMentioned };
}

function inputValueCount(value: unknown): number {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string" && item.length > 0).length;
  }
  return typeof value === "string" && value.length > 0 ? 1 : 0;
}

function visibleImageRefHandles(schemaKey: string, selectedModel: string) {
  return getWsVisibleInputs(schemaKey, selectedModel).filter((input) => {
    if (!["ref_image", "reference_image", "image_input", "image", "start_frame"].includes(input.id)) {
      return false;
    }
    return portTypeFromHandleId(input.id) === "image";
  });
}

function imageMentionLimitForTarget(
  schemaKey: string,
  selectedModel: string,
  inputs: Record<string, unknown>,
): { supported: boolean; max: number; label: string; reason?: string } {
  const model = selectedModel.toLowerCase();
  if (
    schemaKey === "videoGenNode" &&
    (model.startsWith("seedance-2-0") || model.startsWith("dreamina-seedance-2-0")) &&
    (inputs.start_frame || inputs.end_frame)
  ) {
    return {
      supported: false,
      max: 0,
      label: "Seedance 2.0",
      reason:
        "Seedance 2.0 cannot mix start/end frames with Text-node image mentions. Remove one mode first.",
    };
  }

  const handles = visibleImageRefHandles(schemaKey, selectedModel);
  if (handles.length === 0) {
    return { supported: false, max: 0, label: selectedModel };
  }

  if (schemaKey === "videoGenNode" && model.startsWith("veo-")) {
    return { supported: true, max: 1, label: "Veo start frame" };
  }

  const preferred =
    handles.find((handle) => handle.id === "ref_image") ??
    handles.find((handle) => handle.id === "reference_image") ??
    handles[0];
  return {
    supported: true,
    max: preferred.maxConnections ?? 1,
    label: preferred.label ?? preferred.id,
  };
}

function validateMentionedImageRefsForTarget(args: {
  schemaKey: string;
  selectedModel: string;
  inputs: Record<string, unknown>;
  mentioned: MentionedAsset[];
}): string | null {
  const mentionedUrls = args.mentioned
    .map((m) => effectiveMentionImageRefUrl(m))
    .filter((u): u is string => u !== null);
  if (mentionedUrls.length === 0) return null;

  const capability = imageMentionLimitForTarget(
    args.schemaKey,
    args.selectedModel,
    args.inputs,
  );
  if (!capability.supported) {
    return capability.reason ?? `${args.selectedModel || args.schemaKey} does not support image refs from Text-node mentions.`;
  }

  const handles = visibleImageRefHandles(args.schemaKey, args.selectedModel);
  const explicitUrls = handles.flatMap((handle) => {
    const value = args.inputs[handle.id];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && item.length > 0);
    }
    return typeof value === "string" && value.length > 0 ? [value] : [];
  });
  const explicitUrlSet = new Set(explicitUrls);
  const additionalMentionedUrls = mentionedUrls.filter((url) => !explicitUrlSet.has(url));
  const total = new Set([...explicitUrls, ...mentionedUrls]).size;
  if (total > capability.max) {
    return `${args.selectedModel || args.schemaKey} accepts max ${capability.max} image ref(s), but this run has ${total} from direct wires + Text-node @mentions.`;
  }
  if (
    capability.max === 1 &&
    inputValueCount(args.inputs.start_frame) + inputValueCount(args.inputs.image) > 0 &&
    additionalMentionedUrls.length > 0
  ) {
    return `${args.selectedModel || args.schemaKey} already has a single image input wired. Remove the extra Text-node image mention or the direct image input.`;
  }
  return null;
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
  voiceTranslateNode: Languages,
  upscaleImageNode: Maximize2,
  removeBackgroundNode: Scissors,
  mergeAudioNode: Combine,
  videoToPromptNode: FileVideo,
  imageTo3dNode: Box,
  vfxStartFrameNode: ImageIcon,
  vfxBackgroundNode: Film,
  vfxDepthNode: Box,
  vfxCannyNode: Scissors,
  vfxPoseNode: Users,
  vfxTrackNode: Maximize2,
  vfxMaskNode: Scissors,
  vfxQwenImageNode: Sparkles,
  vfxVariableNode: SlidersHorizontal,
};

const VFX_PREPROCESS_NODE_TYPES = new Set([
  "vfxVariableNode",
  "vfxStartFrameNode",
  "vfxBackgroundNode",
  "vfxDepthNode",
  "vfxCannyNode",
  "vfxPoseNode",
  "vfxTrackNode",
  "vfxMaskNode",
]);

function firstStringInput(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstStringInput(item);
      if (found) return found;
    }
  }
  return null;
}

function requiredInput(
  inputs: Record<string, unknown>,
  keys: string[],
  message: string,
): string {
  for (const key of keys) {
    const value = firstStringInput(inputs[key]);
    if (value) return value;
  }
  throw new Error(message);
}

function secondsForFrame(params: Record<string, unknown>): number {
  const frameIndex = Math.max(0, Number(params.frame_index ?? 0));
  const fps = Math.max(1, Number(params.force_rate || params.fps || 24));
  if (!Number.isFinite(frameIndex) || !Number.isFinite(fps)) return 0;
  return frameIndex / fps;
}

async function uploadVfxFrameFromVideo(args: {
  sourceUrl: string;
  seconds: number;
  userId: string;
  nodeId: string;
  label: string;
}): Promise<string> {
  const blob = await captureVideoFrameAtSecondsBlob(args.sourceUrl, args.seconds);
  const path = [
    args.userId,
    "vfx-preprocess",
    safeStorageSegment(args.nodeId),
    `${safeStorageSegment(args.label)}-${Date.now()}.jpg`,
  ].join("/");
  return uploadExtractedFrame(blob, path);
}

async function prepareLocalVfxGeneration(args: {
  schemaKey: string;
  inputs: Record<string, unknown>;
  params: Record<string, unknown>;
  userId: string;
  nodeId: string;
}): Promise<Record<string, unknown>> {
  const genBase = {
    id: NEW_ID(),
    createdAt: Date.now(),
    prompt_used: "VFX local preprocess",
    prompt_source: "local_preprocess",
  };

  if (args.schemaKey === "vfxVariableNode") {
    const videoUrl = requiredInput(
      args.inputs,
      ["input_video", "video", "ref_video"],
      "Connect a source video into VFX Variables before preparing this stage.",
    );
    return {
      ...genBase,
      type: "video",
      url: videoUrl,
      label: "Source video",
    };
  }

  if (args.schemaKey === "vfxStartFrameNode") {
    const videoUrl = requiredInput(
      args.inputs,
      ["input_video", "video", "ref_video"],
      "Connect the source video before extracting a start frame.",
    );
    const url = await uploadVfxFrameFromVideo({
      sourceUrl: videoUrl,
      seconds: secondsForFrame(args.params),
      userId: args.userId,
      nodeId: args.nodeId,
      label: "start-frame",
    });
    return {
      ...genBase,
      type: "image",
      url,
      label: "Start frame",
    };
  }

  if (args.schemaKey === "vfxMaskNode") {
    const maskImage = firstStringInput(args.inputs.mask_image);
    if (maskImage) {
      return {
        ...genBase,
        type: "image",
        url: maskImage,
        label: "Provided mask image",
      };
    }
    const maskVideo = firstStringInput(args.inputs.mask_video);
    if (maskVideo) {
      const url = await uploadVfxFrameFromVideo({
        sourceUrl: maskVideo,
        seconds: secondsForFrame(args.params),
        userId: args.userId,
        nodeId: args.nodeId,
        label: "mask-frame",
      });
      return {
        ...genBase,
        type: "image",
        url,
        label: "Mask frame",
      };
    }
    throw new Error(
      "Connect a prepared black/white mask image or mask video to VFX Mask. SAM/Depth/Canny GPU preprocessing is not wired to the workspace runtime yet.",
    );
  }

  if (args.schemaKey === "vfxBackgroundNode") {
    const imageUrl = firstStringInput(args.inputs.start_image);
    if (imageUrl) {
      return {
        ...genBase,
        type: "image",
        url: imageUrl,
        label: "Background reference",
      };
    }
    throw new Error(
      "Background pass needs a start image or a dedicated GPU preprocess service before it can output a plate.",
    );
  }

  throw new Error(
    "This VFX control pass is configured in the canvas, but its GPU preprocess executor is not connected yet.",
  );
}

type VfxCardTone = "source" | "matte" | "control" | "generate" | "review";

interface VfxCardMeta {
  stage: string;
  stageLabel: string;
  title: string;
  summary: string;
  artifactLabel: string;
  tone: VfxCardTone;
  primaryParamKeys: string[];
}

function getVfxCardMeta(
  schemaKey: string,
  params: Record<string, unknown>,
  fallbackTitle: string,
): VfxCardMeta | null {
  if (!schemaKey.startsWith("vfx")) return null;

  if (schemaKey === "vfxVariableNode") {
    return {
      stage: "01",
      stageLabel: "Setup",
      title: "VFX Variables",
      summary: "Project-wide size, fps, model pack, and frame sampling.",
      artifactLabel: "Shared settings",
      tone: "source",
      primaryParamKeys: ["resolution", "aspect_ratio", "fps"],
    };
  }

  if (schemaKey === "vfxStartFrameNode") {
    return {
      stage: "02",
      stageLabel: "Source",
      title: fallbackTitle || "Start Frame",
      summary: "Choose the exact frame that anchors the rest of the VFX pipeline.",
      artifactLabel: "Start image",
      tone: "source",
      primaryParamKeys: ["frame_index", "frame_load_cap"],
    };
  }

  if (schemaKey === "vfxMaskNode") {
    return {
      stage: "03",
      stageLabel: "Matte",
      title: fallbackTitle || "Subject Mask",
      summary: "Build the protected subject matte that decides what must stay untouched.",
      artifactLabel: "Mask plate",
      tone: "matte",
      primaryParamKeys: ["segment_prompt", "confidence_threshold", "mask_expand", "mask_blur", "plate_mask_expand"],
    };
  }

  if (schemaKey === "vfxTrackNode") {
    return {
      stage: "04",
      stageLabel: "Track",
      title: fallbackTitle || "Camera Track",
      summary: "Extract motion and anchor points for camera continuity.",
      artifactLabel: "Tracking pass",
      tone: "matte",
      primaryParamKeys: ["points", "track_step", "confidence_threshold", "track_length", "mask_expand"],
    };
  }

  if (schemaKey === "vfxBackgroundNode") {
    return {
      stage: "05",
      stageLabel: "Background",
      title: fallbackTitle || "Background Pass",
      summary: "Generate or prepare a clean background/control plate.",
      artifactLabel: "Background plate",
      tone: "control",
      primaryParamKeys: ["background_mode", "width", "height"],
    };
  }

  if (schemaKey === "vfxDepthNode") {
    return {
      stage: "06",
      stageLabel: "Depth",
      title: fallbackTitle || "Depth Map",
      summary: "Estimate scene depth so later generation respects foreground and space.",
      artifactLabel: "Depth map",
      tone: "control",
      primaryParamKeys: ["num_inference_steps", "guidance_scale", "window_size", "overlap"],
    };
  }

  if (schemaKey === "vfxCannyNode") {
    return {
      stage: "07",
      stageLabel: "Edges",
      title: fallbackTitle || "Canny",
      summary: "Capture hard structure lines for layout and object boundaries.",
      artifactLabel: "Edge pass",
      tone: "control",
      primaryParamKeys: ["low_threshold", "high_threshold"],
    };
  }

  if (schemaKey === "vfxPoseNode") {
    return {
      stage: "08",
      stageLabel: "Pose",
      title: fallbackTitle || "Pose",
      summary: "Extract body, hand, and face guides when character continuity matters.",
      artifactLabel: "Pose guide",
      tone: "control",
      primaryParamKeys: ["detect_body", "detect_hand", "detect_face", "pose_resolution"],
    };
  }

  if (schemaKey === "vfxQwenImageNode") {
    const preset = String(params.workflow_preset ?? "");
    if (preset === "masked_edit") {
      return {
        stage: "10",
        stageLabel: "Edit",
        title: fallbackTitle || "Masked Edit",
        summary: "Change only the masked area while protecting the original plate.",
        artifactLabel: "Edited frame",
        tone: "generate",
        primaryParamKeys: ["workflow_preset", "model_name", "protect_original", "mask_expand", "mask_feather", "steps"],
      };
    }
    if (preset === "plate_generate") {
      return {
        stage: "09",
        stageLabel: "Plate",
        title: fallbackTitle || "Plate Generator",
      summary: "Create a clean environment plate before the masked edit step.",
      artifactLabel: "Plate image",
      tone: "generate",
      primaryParamKeys: ["model_name", "aspect_ratio", "steps"],
      };
    }
    return {
      stage: "09",
      stageLabel: "Start Image",
      title: fallbackTitle || "Qwen Start Image",
      summary: "Generate the hero start frame used as the visual reference.",
      artifactLabel: "Reference frame",
      tone: "generate",
      primaryParamKeys: ["model_name", "lightning_lora", "steps"],
    };
  }

  return {
    stage: "00",
    stageLabel: "VFX",
    title: fallbackTitle || "VFX Node",
    summary: "Pipeline stage",
    artifactLabel: "Output",
    tone: "review",
    primaryParamKeys: [],
  };
}

function getVfxPortIds(
  schemaKey: string,
  params: Record<string, unknown>,
  direction: "input" | "output",
): Set<string> {
  if (schemaKey === "vfxVariableNode") {
    return new Set(direction === "input" ? ["input_video"] : ["input_video"]);
  }
  if (schemaKey === "vfxStartFrameNode") {
    return new Set(direction === "input" ? ["input_video"] : ["start_image"]);
  }
  if (schemaKey === "vfxBackgroundNode") {
    return new Set(direction === "input" ? ["input_video", "start_image"] : ["background_image"]);
  }
  if (schemaKey === "vfxDepthNode") {
    return new Set(direction === "input" ? ["input_video"] : ["depth_video"]);
  }
  if (schemaKey === "vfxCannyNode") {
    return new Set(direction === "input" ? ["input_video"] : ["canny_video"]);
  }
  if (schemaKey === "vfxPoseNode") {
    return new Set(direction === "input" ? ["input_video"] : ["pose_video"]);
  }
  if (schemaKey === "vfxTrackNode") {
    return new Set(direction === "input" ? ["input_video", "mask_image", "mask_video"] : ["track_video"]);
  }
  if (schemaKey === "vfxMaskNode") {
    return new Set(
      direction === "input"
        ? ["input_video", "start_image", "mask_image", "mask_video"]
        : ["mask_image"],
    );
  }
  if (schemaKey === "vfxQwenImageNode") {
    const preset = String(params.workflow_preset ?? "");
    if (preset === "plate_generate") {
      return new Set(direction === "input" ? ["text"] : ["image"]);
    }
    if (preset === "masked_edit") {
      return new Set(direction === "input" ? ["text", "ref_image", "mask_image"] : ["image"]);
    }
    return new Set(direction === "input" ? ["text", "ref_image"] : ["image"]);
  }
  return new Set<string>();
}

function formatVfxParamValue(param: ParamDef, value: unknown): string {
  const raw = value ?? param.default;
  if (typeof raw === "string") {
    return param.optionLabels?.[raw] ?? raw.replace(/_/g, " ");
  }
  if (typeof raw === "number") {
    return Number.isInteger(raw) ? String(raw) : raw.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
  if (typeof raw === "boolean") return raw ? "On" : "Off";
  return String(raw ?? "");
}

type VfxParamHelp = {
  labelTh: string;
  descriptionTh: string;
  descriptionEn: string;
};

const VFX_PARAM_HELP_BY_KEY: Record<string, VfxParamHelp> = {
  model_name: {
    labelTh: "เอนจิน",
    descriptionTh: "เลือก backend หรือ model executor ที่จะใช้รันขั้นตอนนี้",
    descriptionEn: "Selects the engine or executor used for this stage.",
  },
  variable_scope: {
    labelTh: "ชุดค่าตั้งต้น",
    descriptionTh: "เลือกกลุ่มตัวแปรหลัก เช่น ขนาดวิดีโอ pass ควบคุม mask หรือชุดโมเดล Qwen",
    descriptionEn: "Chooses which group of shared VFX variables this node is organizing.",
  },
  auto_wire: {
    labelTh: "ต่อสายอัตโนมัติ",
    descriptionTh: "ให้ระบบช่วยต่อค่าหลักไปยัง stage ถัดไป เพื่อลดการลากสายซ้ำ",
    descriptionEn: "Lets the workspace wire shared values into downstream VFX stages.",
  },
  resolution: {
    labelTh: "ความละเอียด",
    descriptionTh: "กำหนด preset ความละเอียดของงาน เพื่อคุมคุณภาพและเวลาประมวลผล",
    descriptionEn: "Sets the working resolution preset for quality and runtime control.",
  },
  aspect_ratio: {
    labelTh: "อัตราส่วนภาพ",
    descriptionTh: "กำหนดสัดส่วนภาพหลักของ plate หรือ output ให้ตรงกับ footage",
    descriptionEn: "Sets the canvas aspect ratio used by plates and generated outputs.",
  },
  custom_width: {
    labelTh: "ความกว้างเอง",
    descriptionTh: "ใช้เมื่อเลือก Custom เพื่อระบุความกว้างเองเป็น pixel",
    descriptionEn: "Custom pixel width used when the size preset is set to Custom.",
  },
  custom_height: {
    labelTh: "ความสูงเอง",
    descriptionTh: "ใช้เมื่อเลือก Custom เพื่อระบุความสูงเองเป็น pixel",
    descriptionEn: "Custom pixel height used when the size preset is set to Custom.",
  },
  fps: {
    labelTh: "เฟรมต่อวินาที",
    descriptionTh: "กำหนด frame rate ของ pass/output ให้ตรงกับวิดีโอต้นฉบับ",
    descriptionEn: "Sets the frame rate for prepared passes and outputs.",
  },
  frame_load_cap: {
    labelTh: "จำนวนเฟรมสูงสุด",
    descriptionTh: "จำกัดจำนวนเฟรมที่โหลดหรือประมวลผล ใช้ทดสอบสั้น ๆ ก่อนรันเต็ม",
    descriptionEn: "Limits how many frames are loaded or processed for test runs.",
  },
  skip_first_frames: {
    labelTh: "ข้ามเฟรมแรก",
    descriptionTh: "ข้ามเฟรมช่วงต้นก่อนเริ่ม process เพื่อเลือกช่วงที่ต้องการจริง",
    descriptionEn: "Skips the first frames before processing the selected clip range.",
  },
  qwen_unet: {
    labelTh: "ไฟล์ Qwen UNet",
    descriptionTh: "ชื่อไฟล์โมเดลหลักของ Qwen image edit ที่ worker จะโหลด",
    descriptionEn: "Main Qwen image edit model file loaded by the worker.",
  },
  qwen_lora: {
    labelTh: "ไฟล์ Qwen LoRA",
    descriptionTh: "LoRA เร่งหรือปรับพฤติกรรม Qwen สำหรับ workflow นี้",
    descriptionEn: "LoRA used to tune or speed up this Qwen workflow.",
  },
  qwen_clip: {
    labelTh: "ไฟล์ Qwen CLIP",
    descriptionTh: "text/image encoder ที่ช่วยให้ Qwen เข้าใจ prompt และ reference",
    descriptionEn: "Encoder file used for prompt and reference-image conditioning.",
  },
  qwen_vae: {
    labelTh: "ไฟล์ Qwen VAE",
    descriptionTh: "VAE สำหรับ encode/decode latent กลับเป็นภาพจริง",
    descriptionEn: "VAE used to encode and decode images through the latent space.",
  },
  frame_index: {
    labelTh: "เฟรมที่เลือก",
    descriptionTh: "เลือกเฟรมจากวิดีโอต้นฉบับเพื่อใช้เป็น start image หรือ reference",
    descriptionEn: "Selects the source-video frame used as the start image/reference.",
  },
  force_rate: {
    labelTh: "บังคับ FPS",
    descriptionTh: "กำหนด FPS ใหม่ตอนอ่านวิดีโอ ถ้า footage เดิมอ่านค่าไม่ตรง",
    descriptionEn: "Overrides detected FPS when the source clip needs a fixed rate.",
  },
  select_every_nth: {
    labelTh: "เลือกทุก N เฟรม",
    descriptionTh: "ลดจำนวนเฟรมโดยเลือกเป็นช่วง เหมาะสำหรับ preview หรือ preprocess เร็วขึ้น",
    descriptionEn: "Samples every Nth frame to reduce workload for previews/preprocess.",
  },
  format: {
    labelTh: "รูปแบบ output",
    descriptionTh: "รูปแบบข้อมูลที่ส่งต่อให้ pipeline ถัดไป เช่น AnimateDiff-style batch",
    descriptionEn: "Output format passed to the next stage in the VFX pipeline.",
  },
  output_prefix: {
    labelTh: "ชื่อโฟลเดอร์ output",
    descriptionTh: "prefix สำหรับตั้งชื่อไฟล์ผลลัพธ์ของ stage นี้",
    descriptionEn: "Filename prefix for outputs produced by this stage.",
  },
  background_mode: {
    labelTh: "โหมดพื้นหลัง",
    descriptionTh: "กำหนดว่าจะสร้าง control plate เป็นสีเทา clean plate หรือ plate จากต้นฉบับ",
    descriptionEn: "Chooses the background/control plate strategy for this pass.",
  },
  width: {
    labelTh: "ความกว้าง",
    descriptionTh: "ความกว้าง output เป็น pixel ถ้า stage นี้สร้างภาพหรือวิดีโอใหม่",
    descriptionEn: "Output width in pixels for generated images or plates.",
  },
  height: {
    labelTh: "ความสูง",
    descriptionTh: "ความสูง output เป็น pixel ถ้า stage นี้สร้างภาพหรือวิดีโอใหม่",
    descriptionEn: "Output height in pixels for generated images or plates.",
  },
  crf: {
    labelTh: "คุณภาพบีบอัด",
    descriptionTh: "ค่าคุณภาพวิดีโอ ยิ่งต่ำไฟล์ยิ่งคมแต่ขนาดใหญ่ขึ้น",
    descriptionEn: "Video compression quality. Lower values look cleaner but create larger files.",
  },
  codec: {
    labelTh: "ตัวเข้ารหัสวิดีโอ",
    descriptionTh: "codec สำหรับบันทึกวิดีโอ output ให้เล่นได้กว้าง",
    descriptionEn: "Video codec used when saving the prepared output.",
  },
  pix_fmt: {
    labelTh: "รูปแบบพิกเซล",
    descriptionTh: "pixel format ของวิดีโอ output เพื่อความเข้ากันได้กับ player/editor",
    descriptionEn: "Pixel format used for compatibility with players and editors.",
  },
  depth_model: {
    labelTh: "โมเดล Depth",
    descriptionTh: "เลือกโมเดลสร้าง depth map เพื่อบอกระยะหน้า-หลังของฉาก",
    descriptionEn: "Model used to generate a depth map for scene-space guidance.",
  },
  num_inference_steps: {
    labelTh: "จำนวน step",
    descriptionTh: "จำนวนรอบ inference ยิ่งสูงอาจละเอียดขึ้นแต่ใช้เวลามากขึ้น",
    descriptionEn: "Inference steps. Higher values can improve detail but take longer.",
  },
  guidance_scale: {
    labelTh: "แรงยึด guidance",
    descriptionTh: "ควบคุมว่าผลลัพธ์จะยึดตาม guidance แรงแค่ไหน",
    descriptionEn: "Controls how strongly the model follows the conditioning guidance.",
  },
  window_size: {
    labelTh: "ขนาดหน้าต่าง",
    descriptionTh: "จำนวนเฟรม/พื้นที่ที่โมเดลดูพร้อมกันเพื่อให้ depth ต่อเนื่อง",
    descriptionEn: "Temporal/window size used to keep depth results consistent.",
  },
  overlap: {
    labelTh: "เฟรมซ้อนทับ",
    descriptionTh: "จำนวนเฟรมที่ซ้อนกันระหว่าง window เพื่อช่วยลดรอยต่อ",
    descriptionEn: "Overlap between windows to reduce seams between processed chunks.",
  },
  low_threshold: {
    labelTh: "ขอบขั้นต่ำ",
    descriptionTh: "threshold ต่ำของ Canny สำหรับจับเส้นขอบที่ละเอียดกว่า",
    descriptionEn: "Lower Canny threshold for detecting softer edge detail.",
  },
  high_threshold: {
    labelTh: "ขอบขั้นสูง",
    descriptionTh: "threshold สูงของ Canny สำหรับคุมเส้นขอบหลักที่ชัดเจน",
    descriptionEn: "Upper Canny threshold for stronger structural edges.",
  },
  max_resolution: {
    labelTh: "ความละเอียดสูงสุด",
    descriptionTh: "จำกัดขนาดภาพตอนสร้าง control pass เพื่อไม่ให้หนักเกินจำเป็น",
    descriptionEn: "Caps control-pass resolution to balance detail and processing cost.",
  },
  pose_model: {
    labelTh: "โมเดล Pose",
    descriptionTh: "เลือกโมเดลตรวจจับ skeleton/body guide สำหรับตัวละคร",
    descriptionEn: "Model used to extract pose guides for character continuity.",
  },
  detect_body: {
    labelTh: "ตรวจจับร่างกาย",
    descriptionTh: "เปิด/ปิดการจับโครงร่างลำตัว แขน ขา",
    descriptionEn: "Toggles body pose detection.",
  },
  detect_hand: {
    labelTh: "ตรวจจับมือ",
    descriptionTh: "เปิด/ปิดการจับตำแหน่งมือและนิ้ว",
    descriptionEn: "Toggles hand landmark detection.",
  },
  detect_face: {
    labelTh: "ตรวจจับใบหน้า",
    descriptionTh: "เปิด/ปิดการจับตำแหน่งใบหน้า",
    descriptionEn: "Toggles face landmark detection.",
  },
  pose_resolution: {
    labelTh: "ความละเอียด Pose",
    descriptionTh: "ขนาดภาพที่ใช้ประมวลผล pose ยิ่งสูงยิ่งละเอียดแต่ช้าขึ้น",
    descriptionEn: "Resolution used for pose detection. Higher is more detailed but slower.",
  },
  track_model: {
    labelTh: "โมเดล Track",
    descriptionTh: "เลือกโมเดล tracking จุดเคลื่อนไหวเพื่อรักษา motion/camera continuity",
    descriptionEn: "Model used to track motion points across frames.",
  },
  points: {
    labelTh: "จำนวนจุด Track",
    descriptionTh: "จำนวน anchor point ที่ใช้ติดตาม ยิ่งมากยิ่งละเอียดแต่หนักขึ้น",
    descriptionEn: "Number of tracking points. More points add detail but cost more.",
  },
  track_length: {
    labelTh: "ช่วง Track",
    descriptionTh: "ความยาวเฟรมที่พยายามติดตามจุดเดียวกัน",
    descriptionEn: "How long a point should be tracked through the clip.",
  },
  track_step: {
    labelTh: "ระยะห่าง Track",
    descriptionTh: "ความถี่ในการวางจุด track ค่าน้อยจะละเอียดและหนักขึ้น",
    descriptionEn: "Point sampling interval. Lower values track more densely.",
  },
  confidence_threshold: {
    labelTh: "ความมั่นใจ",
    descriptionTh: "เกณฑ์ความมั่นใจของ detection/tracking ค่าสูงจะเข้มงวดขึ้น",
    descriptionEn: "Confidence cutoff used by detection or tracking stages.",
  },
  mask_expand: {
    labelTh: "ขยาย/หด Mask",
    descriptionTh: "ปรับขอบ mask ให้กินพื้นที่มากขึ้นหรือน้อยลงเพื่อแก้ edge spill",
    descriptionEn: "Expands or contracts mask boundaries to improve edge cleanup.",
  },
  subject_mask_expand: {
    labelTh: "ขยาย/หดตัวแบบ",
    descriptionTh: "ปรับขอบ mask ของตัวแบบหลัก เพื่อคุมพื้นที่ที่ต้องปกป้อง",
    descriptionEn: "Adjusts the subject mask used for protected foreground areas.",
  },
  draw_tracks: {
    labelTh: "แสดงเส้น Track",
    descriptionTh: "เปิด preview เส้น tracking เพื่อ debug ก่อนนำไปใช้จริง",
    descriptionEn: "Draws tracking lines for debugging the motion pass.",
  },
  segment_model: {
    labelTh: "โมเดลตัด Mask",
    descriptionTh: "เลือกโมเดล segmentation สำหรับแยกคน/วัตถุจากฉาก",
    descriptionEn: "Segmentation model used to separate the subject or object.",
  },
  segment_prompt: {
    labelTh: "คำสั่ง Mask",
    descriptionTh: "บอกระบบว่าต้องการแยกอะไร เช่น person, actor หรือ object",
    descriptionEn: "Text target for segmentation, such as person, actor, or object.",
  },
  mask_blur: {
    labelTh: "เบลอขอบ Mask",
    descriptionTh: "ทำให้ขอบ mask นุ่มขึ้น เพื่อลดขอบแข็งตอน composite",
    descriptionEn: "Softens mask edges for smoother compositing.",
  },
  plate_mask_expand: {
    labelTh: "ขยาย Mask สำหรับ Plate",
    descriptionTh: "ปรับพื้นที่ mask ที่ใช้สร้าง clean plate หรือ background plate",
    descriptionEn: "Adjusts the mask used when preparing a clean/background plate.",
  },
  max_segments: {
    labelTh: "จำนวนชิ้นสูงสุด",
    descriptionTh: "จำกัดจำนวน segment ที่โมเดลเลือก 0 คือให้ระบบตัดสินใจเอง",
    descriptionEn: "Limits selected segments. 0 lets the system decide automatically.",
  },
  invert_mask: {
    labelTh: "กลับด้าน Mask",
    descriptionTh: "สลับพื้นที่ขาว/ดำ เมื่อ mask ที่ได้ตรงข้ามกับสิ่งที่ต้องการ",
    descriptionEn: "Inverts the mask when white/black areas are reversed.",
  },
  mask_output_prefix: {
    labelTh: "ชื่อ output Mask",
    descriptionTh: "prefix สำหรับไฟล์ mask ที่ stage นี้สร้าง",
    descriptionEn: "Filename prefix for generated mask outputs.",
  },
  plate_output_prefix: {
    labelTh: "ชื่อ output Plate",
    descriptionTh: "prefix สำหรับไฟล์ plate ที่สร้างจาก mask",
    descriptionEn: "Filename prefix for mask-plate outputs.",
  },
  model_pack: {
    labelTh: "ชุดโมเดล",
    descriptionTh: "เลือกชุดไฟล์โมเดล/LoRA ที่ประกอบกันเป็น workflow นี้",
    descriptionEn: "Selects the model bundle used by the Qwen workflow.",
  },
  workflow_preset: {
    labelTh: "รูปแบบงาน VFX",
    descriptionTh: "เลือกหน้าที่ของ Qwen node เช่น start image, masked edit หรือสร้าง plate",
    descriptionEn: "Chooses whether Qwen generates a start image, masked edit, or plate.",
  },
  prompt: {
    labelTh: "พรอมป์",
    descriptionTh: "คำสั่งหลักที่บอกว่าต้องการเปลี่ยนภาพหรือสร้าง plate แบบไหน",
    descriptionEn: "Main instruction describing the desired VFX change or plate.",
  },
  negative_prompt: {
    labelTh: "สิ่งที่ไม่ต้องการ",
    descriptionTh: "บอก artifact ที่ควรหลีกเลี่ยง เช่น ขอบเพี้ยน ตัวหนังสือ หรือภาพบิด",
    descriptionEn: "Artifacts to avoid, such as bad edges, text, or warping.",
  },
  steps: {
    labelTh: "จำนวน Sampling",
    descriptionTh: "จำนวน sampling step ของการเจนภาพ ค่าสูงขึ้นมักช้าขึ้น",
    descriptionEn: "Sampling steps for image generation. Higher usually takes longer.",
  },
  cfg: {
    labelTh: "แรงตาม Prompt",
    descriptionTh: "คุมว่าภาพจะยึด prompt มากแค่ไหน สูงไปอาจแข็งหรือเพี้ยน",
    descriptionEn: "Prompt guidance strength. Too high can look rigid or distorted.",
  },
  denoise: {
    labelTh: "แรงเปลี่ยนภาพ",
    descriptionTh: "คุมระดับการเปลี่ยนจากภาพอ้างอิง ต่ำคือคงเดิมมาก สูงคือเปลี่ยนมาก",
    descriptionEn: "Controls how strongly the image is changed from the reference.",
  },
  protect_original: {
    labelTh: "ปกป้องนอก Mask",
    descriptionTh: "เปิดไว้เพื่อ composite เฉพาะพื้นที่ mask และคงภาพเดิมด้านนอก",
    descriptionEn: "Keeps the unmasked area from the original plate.",
  },
  mask_feather: {
    labelTh: "เกลี่ยขอบ Mask",
    descriptionTh: "เพิ่ม feather เพื่อให้ขอบส่วนที่แก้เนียนกับภาพเดิม",
    descriptionEn: "Feathers edited edges so they blend into the original image.",
  },
  sampler_name: {
    labelTh: "Sampler",
    descriptionTh: "อัลกอริทึม sampling ที่ใช้สร้างภาพ",
    descriptionEn: "Sampling algorithm used by the image generation workflow.",
  },
  scheduler: {
    labelTh: "Scheduler",
    descriptionTh: "ตารางการลด noise ระหว่าง sampling",
    descriptionEn: "Noise schedule used during sampling.",
  },
  lightning_lora: {
    labelTh: "LoRA เร่งความเร็ว",
    descriptionTh: "เปิดเพื่อรันเร็วขึ้น เหมาะกับ draft ปิดเพื่อเน้นคุณภาพ",
    descriptionEn: "Turns on the fast Lightning LoRA for drafts; off favors quality.",
  },
  seed: {
    labelTh: "เลข Seed",
    descriptionTh: "ใส่ seed เพื่อให้ผลลัพธ์ repeat ได้ เว้นว่างเพื่อสุ่มใหม่",
    descriptionEn: "Seed for repeatable outputs. Leave blank for random.",
  },
};

function getVfxParamHelp(param: ParamDef): VfxParamHelp {
  return VFX_PARAM_HELP_BY_KEY[param.key] ?? {
    labelTh: param.label,
    descriptionTh: "ค่าตั้งต้นของ stage นี้ ใช้ปรับพฤติกรรมของ node ก่อนรัน",
    descriptionEn: "Controls this node stage before it runs.",
  };
}

function VfxParamTooltipContent({
  param,
  help,
  value,
}: {
  param: ParamDef;
  help: VfxParamHelp;
  value?: string;
}) {
  return (
    <TooltipContent
      side="top"
      align="start"
      className="max-w-[300px] border-white/10 bg-[#171717] p-3 text-[11px] leading-4 text-zinc-100 shadow-2xl shadow-black/45"
    >
      <div className="mb-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 font-semibold text-white">
        <span>{param.label}</span>
        <span className="text-zinc-400">/</span>
        <span className="text-sky-200">{help.labelTh}</span>
      </div>
      <div className="space-y-1 text-zinc-300">
        <p>{help.descriptionTh}</p>
        <p className="text-zinc-500">{help.descriptionEn}</p>
      </div>
      {value ? (
        <div className="mt-2 border-t border-white/10 pt-2 text-[10px] font-medium text-zinc-400">
          Current: <span className="text-zinc-200">{value}</span>
        </div>
      ) : null}
    </TooltipContent>
  );
}

const DURATION_COST_MODELS = new Set(["kling-v3-pro", "kling-v3-omni"]);
const WORKSPACE_NODE_UI_SCALE = 1.15;
const DEFAULT_COMPACT_WIDTH = 437;
const DEFAULT_VFX_COMPACT_WIDTH = 250;
const MIN_VFX_COMPACT_WIDTH = 220;
const MAX_VFX_COMPACT_WIDTH = 250;

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
  const runInFlightRef = useRef(false);
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const [insufficientReason, setInsufficientReason] =
    useState<"credits" | "feature_locked">("credits");
  const [insufficientFeature, setInsufficientFeature] =
    useState<WorkspacePaidFeature | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [optimisticRun, setOptimisticRun] = useState<{
    runId: string;
    startedAt: number;
  } | null>(null);
  // Used by friendlyError() to localize jargon errors before they
  // reach the user. Raw text still lands in console.error.
  const { language, t } = useLanguage();
  const { user, profile } = useAuth();
  const openSignInModal = useSignInModal();
  const currentWorkspaceId = useWorkspaceStore((s) => s.current?.workspaceId ?? null);
  const { credits } = useCredits(currentWorkspaceId);

  // Shared voice-preview hook for the audio gen node. Mounted on
  // every node type (cheap — just a couple of useState refs until
  // the first ▶ click), so the searchable Voice MiniSelect can pipe
  // a single play/pause/loading state into all 30 row buttons. A
  // per-row hook would mount 30 isolated <audio> elements that
  // wouldn't stop each other when the user auditions a new voice.
  const voicePreview = useVoicePreview("gemini");

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
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const patchNodeDataNow = useCallback(
    (
      patch: Record<string, unknown>,
      options: { activeRunId?: string | null; skipReactFlow?: boolean } = {},
    ) => {
      const expectedRunId = options.activeRunId ?? null;
      const store = useWorkspaceStore.getState();
      const storeNode = store.current?.nodes.find((node) => node.id === id);
      const storeData = storeNode?.data as NodeData | undefined;
      const storeMatches =
        !expectedRunId || ((storeData?.activeRunId ?? null) === expectedRunId);

      if (storeMatches) {
        store.updateNodeData(id, patch);
      }

      if (!options.skipReactFlow) {
        setNodes((ns) =>
          ns.map((n) => {
            if (n.id !== id) return n;
            if (
              expectedRunId &&
              ((n.data as NodeData | undefined)?.activeRunId ?? null) !== expectedRunId
            ) {
              return n;
            }
            return { ...n, data: { ...n.data, ...patch } };
          }),
        );
      }

      return storeMatches;
    },
    [id, setNodes],
  );
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

  /* ── Extract start/end frame JPEGs for video gens ──
   * Mirror of AssetNode's pattern (for uploaded videos), generalized
   * to AI-generated video tool nodes. When the user wires this node's
   * `output_start_frame` / `output_end_frame` / `output_last_frame`
   * port into a downstream image input, the wire must carry a real
   * image URL — the raw video URL trips a 400 "Unable to process
   * input image" at Gemini / Banana. We capture the frames in the
   * browser, upload as JPEGs, and stash the signed URLs back onto the
   * current generation object so `resolveInputs` can hand them to
   * downstream nodes. */
  const allNodesForMentionScan = useNodes();
  const frameExtractionInFlightFor = useRef<string | null>(null);
  useEffect(() => {
    const d = data as NodeData | undefined;
    const generations = d?.generations;
    if (!Array.isArray(generations) || generations.length === 0) return;
    const idx =
      typeof d?.selectedGenIndex === "number" ? d.selectedGenIndex : 0;
    const gen = generations[idx] ?? generations[0];
    if (!gen || gen.type !== "video" || !gen.url || !gen.id) return;
    if (gen.startFrameUrl && gen.endFrameUrl) return;

    const hasFrameEdge = edges.some(
      (edge) =>
        edge.source === id && isVideoFrameImageOutputHandle(edge.sourceHandle),
    );
    // Also extract when this video gen is referenced via a chip in any
    // other node's prompt — the mention path needs the JPG just as
    // much as a wired frame port does.
    const isMentionedAnywhere = isNodeMentionedAnywhere(id, allNodesForMentionScan);
    if (!hasFrameEdge && !isMentionedAnywhere) return;
    // The `frameExtractionInFlightFor` ref already prevents
    // double-kickoff for the same gen.id. Don't add a cleanup-driven
    // `cancelled` flag here — when this effect re-runs after the
    // setNodes patch lands (because `data` is in the deps), the old
    // cleanup would set cancelled=true and the in-flight async's
    // completion patch would silently drop, leaving the gen with no
    // startFrameUrl/endFrameUrl. resolveInputs then throws "Video
    // frame image is still preparing" forever. Same bug pattern as
    // AssetNode's pre-existing extraction effect — both fixed in
    // this PR.
    if (frameExtractionInFlightFor.current === gen.id) return;
    frameExtractionInFlightFor.current = gen.id;

    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) {
        openSignInModal();
        return;
      }
      const basePath = `${userId}/video-frames/${safeStorageSegment(id)}/${safeStorageSegment(gen.id)}`;
      const frames = await extractAndUploadVideoFrames(gen.url!, basePath);
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          const nd = node.data as NodeData;
          const gens = nd.generations ?? [];
          const patched = gens.map((g) =>
            g.id === gen.id ? { ...g, ...frames } : g,
          );
          return { ...node, data: { ...nd, generations: patched } };
        }),
      );
    })()
      .catch((err) => {
        console.error("[workspace-tool-node] frame extraction failed", err);
      })
      .finally(() => {
        if (frameExtractionInFlightFor.current === gen.id) {
          frameExtractionInFlightFor.current = null;
        }
      });
  }, [allNodesForMentionScan, data, edges, id, openSignInModal, setNodes]);

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
  const rawSelectedModel = (params.model_name as string) ?? schema?.defaultModel ?? "";
  const selectedModel =
    schemaKey === "upscaleImageNode" && rawSelectedModel !== "gpt-image-2-enhance"
      ? "gpt-image-2-enhance"
      : rawSelectedModel;
  useEffect(() => {
    setShowAdvancedParams(false);
  }, [schemaKey, selectedModel]);
  useEffect(() => {
    if (schemaKey !== "upscaleImageNode") return;
    if (params.model_name === "gpt-image-2-enhance") return;
    patchNodeDataNow({
      params: {
        ...params,
        model_name: "gpt-image-2-enhance",
        media_type: "image",
      },
    });
  }, [params, patchNodeDataNow, schemaKey]);
  const connectedMediaDurationSeconds = useMemo(() => {
    if (schemaKey !== "voiceTranslateNode") return null;
    const mediaEdge = edges.find(
      (edge) => edge.target === id && edge.targetHandle === "media",
    );
    if (!mediaEdge) return null;
    const sourceNode = allNodesForMentionScan.find((node) => node.id === mediaEdge.source);
    const sourceData = sourceNode?.data as (NodeData & Record<string, unknown>) | undefined;
    if (!sourceData) return null;
    const rawDuration =
      sourceData.durationSec ??
      sourceData.duration_seconds ??
      sourceData.duration;
    const duration = Number(rawDuration);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  }, [allNodesForMentionScan, edges, id, schemaKey]);
  const quoteParams = useMemo(() => {
    if (
      schemaKey !== "voiceTranslateNode" ||
      connectedMediaDurationSeconds == null
    ) {
      return params;
    }
    return {
      ...params,
      source_duration_seconds: connectedMediaDurationSeconds,
    };
  }, [connectedMediaDurationSeconds, params, schemaKey]);

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
  const storedRunStatus = d.status ?? "idle";
  // The previous version also gated this on `storedRunStatus !==
  // "done"/"error"` to avoid a stuck optimistic spinner if the
  // post-run cleanup forgot to clear `optimisticRun`. That guard
  // hid the spinner on click 1 whenever the node had already
  // completed a previous run (the common case — the node carries
  // status="done" from the prior generation), so the user thought
  // nothing happened and clicked again. The cleanup IS guaranteed
  // by the `finally` in `runNode` (and the orphan-completion sweep
  // covers the page-reload case), so trust `!!optimisticRun` alone.
  const optimisticRunActive = !!optimisticRun;
  const runStatus = optimisticRunActive ? "processing" : storedRunStatus;
  const isRunning = runStatus === "processing";
  const visibleRunStartedAt =
    optimisticRunActive ? optimisticRun.startedAt : d.runStartedAt;
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

  const isNodeCurrentlyProcessing = useCallback(() => {
    const current =
      useWorkspaceStore.getState().current?.nodes.find((node) => node.id === id) ??
      getNodes().find((node) => node.id === id);
    return hasActiveWorkspaceJob(current?.data as NodeData | undefined);
  }, [getNodes, id]);

  const runNode = useCallback(async () => {
    if (runInFlightRef.current || isNodeCurrentlyProcessing()) return;
    if (isViewer) {
      toast.info(t("workspace.toolNode.viewOnlyRunsDisabled"));
      return;
    }
    if (!user?.id) {
      openSignInModal();
      return;
    }
    const lockedFeature = isWorkspaceFreePlan(profile)
      ? freePlanBlockedFeatureForNodeType(schemaKey)
      : null;
    if (lockedFeature) {
      setInsufficientReason("feature_locked");
      setInsufficientFeature(lockedFeature);
      setInsufficientOpen(true);
      return;
    }

    // Flip ref + optimistic run BEFORE validation. Previously these
    // sat after the prompt-length block, so a node whose previous
    // generation left status="done" had no spinner state during the
    // microtask window before patchNodeDataNow committed — the user
    // saw nothing happen and clicked again, which sometimes produced
    // a duplicate paid run. Validation paths below `return` through
    // the `finally` so these get cleared if we bail out.
    runInFlightRef.current = true;
    const runId = NEW_ID();
    const runStartedAt = Date.now();
    setOptimisticRun({ runId, startedAt: runStartedAt });
    try {

    // ── Provider-side prompt-length guard ──
    // Some providers (Kling: 2500, Banana: 2000, …) enforce a hard
    // character cap server-side. We have a soft warning UI in the
    // textarea, but `maxLength` doesn't actually prevent typing/pasting
    // past the cap on a contentEditable, so a 2540-char prompt would
    // still fly through to Kling and come back as the cryptic
    // `code:1201, "prompt: size must be between 0 and 2500"`. Bail
    // here with a translated toast instead so the user knows what to
    // shorten before any credit/processing state is touched.
    {
      const promptLimit = getPromptCharLimit(schemaKey, selectedModel, "prompt");
      const negativeLimit = getPromptCharLimit(schemaKey, selectedModel, "negative_prompt");
      const promptChars = countPromptChars(params.prompt as string | undefined);
      const negativeChars = countPromptChars(params.negative_prompt as string | undefined);
      const isKlingMultiShot =
        schemaKey === "klingVideoNode" && String(params.multi_shot) === "true";
      const overLimitScenes = isKlingMultiShot
        ? findOverLimitScenes(
            Array.isArray(params.multi_prompt)
              ? (params.multi_prompt as SceneBlock[])
              : null,
          )
        : [];

      // In multi-shot mode each scene has its own 512-char cap and
      // the top-level `prompt` field is unused — skip the main-prompt
      // check so a stale value left in the field doesn't block the
      // run when it won't be sent.
      if (!isKlingMultiShot && promptLimit && promptChars > promptLimit) {
        toast.error(
          t("workspace.toolNode.promptTooLong", {
            count: promptChars,
            limit: promptLimit,
          }),
        );
        return;
      }
      if (negativeLimit && negativeChars > negativeLimit) {
        toast.error(
          t("workspace.toolNode.negativePromptTooLong", {
            count: negativeChars,
            limit: negativeLimit,
          }),
        );
        return;
      }
      if (overLimitScenes.length > 0) {
        toast.error(
          t("workspace.toolNode.multiShotSceneTooLong", {
            scene: overLimitScenes[0] + 1,
            limit: KLING_MULTISHOT_SCENE_LIMIT,
          }),
        );
        return;
      }
    }

    // ── Kling Motion Pro ref_video guard ──
    // /v1/videos/motion-control requires both image_url and video_url
    // — without a ref_video the backend throws "Motion Control requires
    // a video_url". Bail here with a toast + return (matching the
    // prompt-length validators above) so the node never enters the
    // "processing" → "error" cycle: that cycle leaves `lastRunError`
    // set without a backgroundJobId, which trips the recovery-polling
    // effect into re-querying the latest job for this node every 5s,
    // re-applying its stale error, and looping forever (the "flashing"
    // node + console-flood symptom).
    if (schemaKey === "videoGenNode" && isKlingMotionVideoModel(selectedModel)) {
      const hasRefVideoEdge = getEdges().some(
        (e) => e.target === id && e.targetHandle === "ref_video",
      );
      if (!hasRefVideoEdge) {
        toast.error(
          friendlyError(
            `${selectedModel} requires a reference video — connect a video into the ref_video port (it dictates the motion and duration).`,
            language === "th" ? "th" : "en",
          ),
        );
        return;
      }
    }

    const storeState = useWorkspaceStore.getState();
    const log = useDebugLogStore.getState().push;
    const nodeLabelForLog =
      (d.params?.nodeName as string) || schema?.displayName || schemaKey;
    const runStillActive = () => {
      const current =
        useWorkspaceStore.getState().current?.nodes.find((node) => node.id === id) ??
        getNodes().find((node) => node.id === id);
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
    patchNodeDataNow({
      status: "processing",
      runStartedAt,
      activeRunId: runId,
      lastRunError: null,
      backgroundJobId: null,
      jobStatus: null,
      jobAttempts: 0,
    });

    log({
      level: "info",
      nodeId: id,
      title: `Run · ${nodeLabelForLog}${selectedModel ? ` · ${selectedModel}` : ""}`,
      payload: { node_type: schemaKey, model: selectedModel, params },
    });

    try {
      const { inputs, textMentioned } = resolveInputs(id);
      if (VFX_PREPROCESS_NODE_TYPES.has(schemaKey)) {
        const gen = await prepareLocalVfxGeneration({
          schemaKey,
          inputs,
          params,
          userId: user.id,
          nodeId: id,
        });

        storeState.addGeneration(id, gen);
        patchNodeDataNow(
          {
            status: "done",
            runStartedAt: null,
            activeRunId: null,
            lastRunError: null,
          },
          { activeRunId: runId },
        );
        log({
          level: "success",
          nodeId: id,
          title: `Prepared VFX stage · ${nodeLabelForLog}`,
          payload: { inputs, generation: gen },
        });
        toast.success(`Prepared ${nodeLabelForLog}`);
        return;
      }

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

      const imageRefValidationError = validateMentionedImageRefsForTarget({
        schemaKey,
        selectedModel,
        inputs,
        mentioned,
      });
      if (imageRefValidationError) {
        throw new Error(imageRefValidationError);
      }

      if (schemaKey === "voiceTranslateNode") {
        const mediaInput = inputs.media;
        const hasMedia =
          typeof mediaInput === "string"
            ? mediaInput.length > 0
            : Array.isArray(mediaInput)
              ? mediaInput.some((item) => typeof item === "string" && item.length > 0)
              : false;
        if (!hasMedia) {
          throw new Error("Connect an MP3 or MP4 source before running Dubbing.");
        }
        const hasConsent =
          cleanParams.consent === true ||
          String(cleanParams.consent ?? "").toLowerCase() === "true";
        if (!hasConsent) {
          throw new Error("Confirm permission to translate this file and preserve or clone the speaker voice.");
        }
      }

      if (schemaKey === "urlAssetNode") {
        const sourceUrl = normalizeUrlAssetSource(String(cleanParams.source_url || cleanParams.prompt || ""));
        const validation = validateUrlAssetSource(sourceUrl, String(cleanParams.model_name || cleanParams.model || ""));
        if (validation) throw new Error(validation);
        cleanParams.source_url = sourceUrl;
      }

      if (schemaKey === "upscaleImageNode") {
        const imageCount = inputValueCount(inputs.image) + inputValueCount(inputs.image_url);
        const videoCount = inputValueCount(inputs.video) + inputValueCount(inputs.video_url);
        if (imageCount === 0 && videoCount === 0) {
          throw new Error("Connect one image source before running Upscale Mediaforge.");
        }
        if (videoCount > 0) {
          throw new Error("Upscale Mediaforge supports image input only.");
        }
        cleanParams.model_name = "gpt-image-2-enhance";
        cleanParams.media_type = "image";
      }

      // Merge mention-resolved URLs into inputs as a fallback ref_image
      // (asset/image AND asset/video-with-extracted-frame — so the
      // backend can pick a primary reference if no explicit ref_image
      // edge is connected). Element mentions don't enter this
      // fallback path; they go straight into `body.elements[]`
      // server-side.
      let mentionedImageRefUrl: string | null = null;
      for (const m of mentioned) {
        const u = effectiveMentionImageRefUrl(m);
        if (u) {
          mentionedImageRefUrl = u;
          break;
        }
      }
      if (mentionedImageRefUrl) {
        if (schemaKey === "videoGenNode" && isSeedanceV2VideoModel(selectedModel)) {
          const alreadyInKeyframeMode = Boolean(inputs.start_frame || inputs.end_frame);
          if (!alreadyInKeyframeMode && !inputs.reference_image) {
            inputs.reference_image = mentionedImageRefUrl;
          }
        } else if (!inputs.ref_image) {
          inputs.ref_image = mentionedImageRefUrl;
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
        patchNodeDataNow(
          {
            backgroundJobId: jobId,
            jobStatus: "queued",
          },
          { activeRunId: runId },
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
                patchNodeDataNow(
                  { jobStatus: status, jobAttempts: attempts },
                  { activeRunId: runId },
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

        patchNodeDataNow(
          {
            status: "done",
            runStartedAt: null,
            activeRunId: null,
            backgroundJobId: jobId,
            jobStatus: "completed",
            lastRunError: null,
          },
          { activeRunId: runId },
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
          output_type?: string;
          target_lang?: string;
          output_language?: string;
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
      //   - "replicate_veo" / "replicate_video" -> Replicate poll action
      //   - "freepik_veo" / "freepik_seedance" → POST action="poll_freepik_video"
      //   - else       → POST action="poll_kling"  (default for video)
      const pollEndpoint = r.provider_meta?.poll_endpoint;
      const pollProvider = String(r.provider_meta?.provider ?? "kling").toLowerCase();
      if (r.task_id && !r.url && pollEndpoint) {
        const pollStart = Date.now();
        const isTripo3d = pollProvider === "tripo3d";
        const isSeedance = pollProvider === "seedance";
        const isVeo = pollProvider === "veo";
        const isReplicateVeo = pollProvider === "replicate_veo";
        const isReplicateVideo = pollProvider === "replicate_video";
        const isRunpodQwen = pollProvider === "runpod_qwen";
        const isFreepikVideo = pollProvider === "freepik_veo" || pollProvider === "freepik_seedance";
        const isElevenLabsDubbing = pollProvider === "elevenlabs_dubbing";
        const POLL_INTERVAL_MS = isTripo3d ? 4_000 : 5_000;
        const POLL_TIMEOUT_MS = isElevenLabsDubbing
          ? 30 * 60_000
          : isRunpodQwen
            ? 20 * 60_000
            : isTripo3d ? 8 * 60_000 : 6 * 60_000;
        const pollAction = isTripo3d
          ? "poll_tripo3d"
          : isSeedance
            ? "poll_seedance"
            : isVeo
              ? "poll_veo"
              : isReplicateVeo
                ? "poll_replicate_veo"
                : isReplicateVideo
                  ? "poll_replicate_video"
                  : isRunpodQwen
                    ? "poll_runpod_qwen"
                  : isFreepikVideo
                    ? "poll_freepik_video"
                    : isElevenLabsDubbing
                      ? "poll_elevenlabs_dubbing"
                    : "poll_kling";
        const providerLabel = isTripo3d
          ? "Tripo3D"
          : isSeedance
            ? "Seedance"
            : isVeo
              ? "Veo"
              : isReplicateVeo
                ? "Replicate Veo"
                : isReplicateVideo
                  ? "Replicate Video"
                : isRunpodQwen
                  ? "Runpod Qwen"
                : isFreepikVideo
                  ? pollProvider === "freepik_seedance" ? "Freepik Seedance" : "Freepik Veo"
                  : isElevenLabsDubbing
                    ? "ElevenLabs Dubbing"
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
                output_type: r.provider_meta?.output_type,
                target_lang: r.provider_meta?.target_lang,
                output_language: r.provider_meta?.output_language,
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

      patchNodeDataNow(
        {
          status: "done",
          runStartedAt: null,
          activeRunId: null,
          lastRunError: null,
        },
        { activeRunId: runId },
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
      const userErrorMessage = friendlyError(errorMessage, language === "th" ? "th" : "en");
      const shouldToast = runStillActive();
      const insufficientCredits = isInsufficientCreditsError(errorMessage);
      const featureLocked = /FEATURE_LOCKED_FREE_PLAN|requires Starter/i.test(errorMessage);
      patchNodeDataNow(
        {
          status: "error",
          runStartedAt: null,
          activeRunId: null,
          lastRunError: insufficientCredits || featureLocked ? errorMessage : userErrorMessage,
        },
        { activeRunId: runId },
      );
      log({
        level: "error",
        nodeId: id,
        title: `✗ ${nodeLabelForLog} · ${String(e?.message ?? e)}`,
      });
      if (insufficientCredits) {
        setInsufficientReason("credits");
        setInsufficientFeature(null);
        setInsufficientOpen(true);
      }
      if (featureLocked) {
        setInsufficientReason("feature_locked");
        setInsufficientFeature(freePlanBlockedFeatureForNodeType(schemaKey));
        setInsufficientOpen(true);
      }
      if (shouldToast && !insufficientCredits && !featureLocked) {
        // Translate jargon errors (`PROVIDER_BILLING_ERROR`,
        // `function consume_credits_for(…) does not exist`,
        // OpenAI 401 …) to friendly Thai/EN copy. Raw error
        // stays in console.error for the team.
        toast.error(userErrorMessage);
      }
    }
    } finally {
      // Outer finally — fires for every exit (validation bail,
      // throw inside the inner try, or success). Replaces the
      // previous inner-only finally so a `return` from the
      // prompt-length validator no longer skipped cleanup.
      setOptimisticRun(null);
      runInFlightRef.current = false;
    }
  }, [getNodes, id, isNodeCurrentlyProcessing, isViewer, openSignInModal, params, schemaKey, patchNodeDataNow, selectedModel, schema, d.params?.nodeName, language, profile, t, user?.id]);

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
      const timeoutPatch = {
        status: "error",
        runStartedAt: null,
        activeRunId: null,
        lastRunError: timeoutMessage,
      };
      if (activeRunId) {
        patchNodeDataNow(timeoutPatch, { activeRunId });
      } else {
        patchNodeDataNow(timeoutPatch);
      }
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
  }, [d.activeRunId, d.runStartedAt, id, isRunning, patchNodeDataNow]);

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
      if (runInFlightRef.current || isNodeCurrentlyProcessing() || isViewer) return;
      const lockedFeature = isWorkspaceFreePlan(profile)
        ? freePlanBlockedFeatureForNodeType(schemaKey)
        : null;
      if (lockedFeature) {
        setInsufficientReason("feature_locked");
        setInsufficientFeature(lockedFeature);
        setInsufficientOpen(true);
        return;
      }

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
      toast.success(t("workspace.toolNode.runVariationsToast", { n }));
    },
    [getEdges, getNodes, id, isNodeCurrentlyProcessing, isViewer, profile, runNode, schemaKey, setEdges, setNodes, t],
  );

  const recoveryJobs = useCanvasRecoveryJobsForNode(id);

  /* ── Orphaned-completion sweep ──
   *  Production incident (run 14123ecb): user clicked Run, the
   *  spinner repaint was lost to the synchronous-state race fixed
   *  elsewhere in this file, the user closed the canvas, the
   *  backend completed the job and charged 364 credits — but the
   *  result never appeared on the node. The existing recovery
   *  effect below only fires when `backgroundJobId` is set OR
   *  `runStatus` is processing/error, and the node-id branch
   *  picks the SINGLE latest row — so once even one earlier
   *  generation is recorded on the node, any subsequent run that
   *  failed to deliver client-side stays stranded forever.
   *
   *  Reconciles the last five completed jobs for this node against
   *  the local `generations` array, applying any that are missing.
   *  Source data: useCanvasJobsRecovery — a single canvas-level
   *  batch fetched once when WorkspaceCanvas mounts. The per-node
   *  apply logic stays here so dedup + addGeneration is co-located
   *  with the node's other state writes. Dedup by job_id / url /
   *  text keeps it idempotent if the existing realtime path already
   *  delivered the row. */
  useEffect(() => {
    // Don't sweep while runNode is actively running in this component.
    // The sweep's `patchNodeDataNow({activeRunId: null, status: "done"})`
    // would stomp the just-set "processing" state and runNode's
    // pollJob would `__RUN_CANCELLED__` within 1s, vanishing the
    // spinner and enabling the button while the backend job keeps
    // going (the exact "spinner 1s then clickable + double charge"
    // user reported).
    if (runInFlightRef.current) return;
    if (!recoveryJobs || recoveryJobs.length === 0) return;

    const node =
      useWorkspaceStore.getState().current?.nodes.find((n) => n.id === id) ??
      getNodes().find((n) => n.id === id);
    const existingGens = Array.isArray((node?.data as NodeData | undefined)?.generations)
      ? ((node!.data as NodeData & {
          generations?: Array<Record<string, unknown>>;
        }).generations as Array<Record<string, unknown>>)
      : [];
    let recoveredJobId: string | null = null;
    // Walk oldest → newest so addGeneration appends in
    // chronological order; the existing UI sorts the carousel
    // newest-first independently.
    for (const job of [...recoveryJobs].reverse()) {
      const result = job.result;
      if (!result || (!result.url && !result.text)) continue;
      const jobId = String(job.id ?? "");
      const dup = existingGens.some((g) =>
        (!!jobId && g.job_id === jobId) ||
        (!!result.url && g.url === result.url) ||
        (!!result.text && g.text === result.text)
      );
      if (dup) continue;
      useWorkspaceStore.getState().addGeneration(id, {
        id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
        job_id: jobId || undefined,
        type: result.type ?? "image",
        url: result.url,
        text: result.text,
        model_url: result.provider_meta?.model_url,
        prompt_used: result.prompt_used,
        prompt_source: result.prompt_source,
        createdAt: Date.now(),
      } as Record<string, unknown>);
      useDebugLogStore.getState().push({
        level: "info",
        nodeId: id,
        title: `Recovered orphaned completion · ${jobId.slice(0, 8)}`,
      });
      recoveredJobId = jobId || recoveredJobId;
    }
    if (recoveredJobId) {
      // Pin to the newest completed row in the fetched window
      // (recoveryJobs[0] — store delivers newest-first) regardless
      // of which one we actually recovered — pinning to an older
      // recovered row would silently roll back the backgroundJobId
      // from a newer realtime-delivered job.
      const newestJobId = String(recoveryJobs[0]?.id ?? recoveredJobId);
      patchNodeDataNow({
        status: "done",
        runStartedAt: null,
        activeRunId: null,
        backgroundJobId: newestJobId,
        jobStatus: "completed",
        lastRunError: null,
      });
    }
  }, [recoveryJobs, getNodes, id, patchNodeDataNow]);

  useEffect(() => {
    // Same race as the sweep above: this effect's `applyCompletedJob`
    // unconditionally patches `activeRunId: null` regardless of
    // whether a fresh runNode is in flight. Before the user's click
    // finishes enqueuing (knownJobId is still null), checkJob's
    // node_id query returns the PREVIOUS completed run for this
    // node and applyCompletedJob stomps the newly-set processing
    // state. runNode's pollJob then sees `runStillActive()` flip
    // to false within ~1s and rejects, clearing the spinner. Skip
    // entirely while runNode owns the run.
    if (runInFlightRef.current) return;
    const knownJobId = d.backgroundJobId ?? null;
    const activeRunStartedAt =
      typeof d.runStartedAt === "number" && Number.isFinite(d.runStartedAt)
        ? d.runStartedAt
        : null;
    const canRecoverByNode =
      !knownJobId &&
      (runStatus === "processing" ||
        runStatus === "error" ||
        // Broadened in the same incident: a stale-autosave race
        // could leave `runStatus === "idle"` while persisted node
        // fields (`runStartedAt`, `activeRunId`, `lastRunError`)
        // still betray a half-finished run. Treat any of these as
        // a signal to keep polling for the missed completion.
        d.runStartedAt != null ||
        d.activeRunId != null ||
        d.lastRunError != null);
    if ((!knownJobId && !canRecoverByNode) || d.jobStatus === "completed") return;
    // Terminal failure is also "done" as far as recovery is concerned —
    // once we've recorded the failure on the node (lastRunError + status:
    // "error"), continuing to poll a job whose backend retry budget is
    // spent just re-logs the same friendlyError every 5s and keeps the
    // node's red footer flickering. The user has been informed; clicking
    // Run resets jobStatus to null and re-engages this effect for the
    // fresh attempt.
    if (d.jobStatus === "failed" || d.jobStatus === "permanent_failed") return;
    if (!knownJobId && runInFlightRef.current) return;

    let cancelled = false;
    let pollTimer: number | null = null;

    const applyCompletedJob = (job: Record<string, unknown>) => {
      const resolvedJobId = String(job.id ?? knownJobId ?? "");
      const createdAtMs = Date.parse(String(job.created_at ?? ""));
      if (
        !knownJobId &&
        activeRunStartedAt != null &&
        Number.isFinite(createdAtMs) &&
        createdAtMs < activeRunStartedAt - JOB_RECOVERY_LOOKBACK_MS
      ) {
        return;
      }
      const result = job.result as {
        type?: "image" | "video" | "text" | "audio";
        url?: string;
        text?: string;
        prompt_used?: string;
        prompt_source?: string;
        provider_meta?: { model_url?: string };
      } | null;
      if (!result) return;

      const node =
        useWorkspaceStore.getState().current?.nodes.find((n) => n.id === id) ??
        getNodes().find((n) => n.id === id);
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

      patchNodeDataNow({
        status: "done",
        runStartedAt: null,
        activeRunId: null,
        backgroundJobId: resolvedJobId || knownJobId,
        jobStatus: "completed",
        lastRunError: null,
      });
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
        if (activeRunStartedAt != null) {
          query = query.gte(
            "created_at",
            new Date(Math.max(0, activeRunStartedAt - JOB_RECOVERY_LOOKBACK_MS)).toISOString(),
          );
        }
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
        const rawError = String(job.error ?? job.last_error ?? "Generation failed");
        const userError = friendlyError(rawError, language === "th" ? "th" : "en");
        const currentNode = useWorkspaceStore.getState().current?.nodes.find((n) => n.id === id);
        if ((currentNode?.data as NodeData | undefined)?.status !== "done") {
          patchNodeDataNow({
            status: "error",
            runStartedAt: null,
            activeRunId: null,
            jobStatus: status,
            jobAttempts: attempts,
            lastRunError: userError,
          });
        }
        if (pollTimer != null) window.clearInterval(pollTimer);
        return;
      }

      patchNodeDataNow({
        jobStatus:
          status ||
          ((useWorkspaceStore.getState().current?.nodes.find((n) => n.id === id)
            ?.data as NodeData | undefined)?.jobStatus ?? null),
        jobAttempts: attempts,
      });
    };

    void checkJob();
    pollTimer = window.setInterval(() => void checkJob(), 5_000);
    return () => {
      cancelled = true;
      if (pollTimer != null) window.clearInterval(pollTimer);
    };
  }, [
    d.backgroundJobId,
    d.jobStatus,
    d.runStartedAt,
    d.activeRunId,
    d.lastRunError,
    getNodes,
    id,
    language,
    runStatus,
    patchNodeDataNow,
  ]);

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
   * When NodeQuickActionRail's "x2 / x3" multi-gen picker clones
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
                t("workspace.toolNode.connectionsExceedLimit", { lines }),
              );
            }
            return { ...n, data: { ...n.data, params: cleaned } };
          }
          return { ...n, data: { ...n.data, params: { ...prevParams, [key]: value } } };
        }),
      );
    },
    [id, setNodes, setEdges, schemaKey, edges, t],
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

  const baseNodeQuote = useMemo(() => {
    if (!creditCosts || !schema) return null;
    if (isMotionModel) {
      const perSecond = creditCosts.find(
        (r) =>
          r.feature === "generate_freepik_video" &&
          r.model === selectedModel &&
          r.pricing_type === "per_second",
      );
      return perSecond
        ? {
            baseCost: perSecond.cost,
            discountPercent: Number(perSecond.discount_percent ?? 0),
          }
        : null;
    }
    return calculateNodeCostQuote({ schemaKey, params: quoteParams, creditCosts });
  }, [creditCosts, isMotionModel, params, quoteParams, schema, schemaKey, selectedModel]);

  const nodeCostQuote = useMemo(() => {
    if (!baseNodeQuote) return null;
    const packageDiscountPercent = Math.max(
      0,
      Math.min(100, Number(credits?.package_discount_percent ?? 0) || 0),
    );
    if (baseNodeQuote.baseCost <= 0) {
      return {
        fullCost: 0,
        modelCost: 0,
        finalCost: 0,
        discountPercent: 0,
        packageDiscountPercent,
        packageDiscountLabel: credits?.package_discount_label ?? null,
        effectiveDiscountPercent: 0,
      };
    }
    const multiplier = workspaceCostMultiplierForNode(
      schemaKey,
      selectedModel,
      workspaceCreditMultiplier,
    );
    const fullCost = Math.max(1, Math.ceil(baseNodeQuote.baseCost * multiplier));
    const discountPercent = Math.max(0, Math.min(100, Number(baseNodeQuote.discountPercent) || 0));
    const modelCost = applyNodeCostDiscount(fullCost, discountPercent);
    const finalCost = applyPackageCostDiscount(modelCost, packageDiscountPercent);
    return {
      fullCost,
      modelCost,
      finalCost,
      discountPercent,
      packageDiscountPercent,
      packageDiscountLabel: credits?.package_discount_label ?? null,
      effectiveDiscountPercent: effectiveNodeDiscountPercent(fullCost, finalCost),
    };
  }, [baseNodeQuote, credits?.package_discount_label, credits?.package_discount_percent, schemaKey, selectedModel, workspaceCreditMultiplier]);

  const nodeCost = nodeCostQuote?.finalCost ?? null;

  const costSuffix = isMotionModel
    ? "/s"
    : showsDurationCost
      ? ` (${params.duration ?? 5}s)`
      : undefined;

  const baseNodeCostDisplay = useMemo(() => {
    if (!nodeCostQuote) return null;
    return Math.max(0, Math.ceil(nodeCostQuote.fullCost));
  }, [nodeCostQuote]);

  const costTotalDiscountPercent = useMemo(() => {
    return nodeCostQuote?.effectiveDiscountPercent ?? 0;
  }, [nodeCostQuote]);

  const hasCostDiscount =
    baseNodeCostDisplay != null &&
    nodeCost != null &&
    nodeCost < baseNodeCostDisplay &&
    costTotalDiscountPercent > 0;

  const costDiscountRows = useMemo(() => {
    if (!nodeCostQuote) return [];
    const rows: Array<{
      label: string;
      value: string;
      className: string;
    }> = [];
    if (nodeCostQuote.discountPercent > 0) {
      rows.push({
        label: "Model",
        value: `-${nodeCostQuote.discountPercent}%`,
        className: "text-sky-300",
      });
    }
    if (nodeCostQuote.packageDiscountPercent > 0) {
      rows.push({
        label: nodeCostQuote.packageDiscountLabel ?? "Package",
        value: `-${nodeCostQuote.packageDiscountPercent}%`,
        className: "text-yellow-300",
      });
    }
    if (costTotalDiscountPercent > 0) {
      rows.push({
        label: "Total",
        value: `-${costTotalDiscountPercent}%`,
        className: "text-emerald-300",
      });
    }
    return rows;
  }, [costTotalDiscountPercent, nodeCostQuote]);

  const costSummaryLabel = creditCostsLoading
    ? "Loading cost..."
    : nodeCost != null
      ? `Total ${formatCreditAmount(nodeCost)}${costSuffix ?? ""} credits`
      : "Pricing unavailable";

  const Icon = ICONS[schemaKey] ?? Sparkles;

  // ── Port colour palette ─────────────────────────────────────
  // Maps the schema's port `color` keyword (sky/emerald/violet/…)
  // to the actual --handle-color value. Wires share these tones.
  const PORT_COLORS: Record<string, string> = {
    sky: "hsl(217 91% 60%)",
    blue: "hsl(217 91% 60%)",
    emerald: "hsl(160 84% 39%)",
    violet: "hsl(64 100% 50%)",
    amber: "hsl(43 96% 56%)",
    pink: "hsl(64 100% 68%)",
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
  // Mirrors the render branches at 3247-3326. If a generation lands
  // without any of the fields a branch needs (e.g. SeedDream used to
  // commit `{type: "image", url: undefined}` because the executor
  // didn't set `result_url`), every branch falls through AND the
  // `!currentGen` placeholder check below also fails — the preview
  // area renders zero children and collapses to a thin line. Treat
  // those rows the same as "no gen yet" so the empty placeholder
  // shows.
  const hasRenderableContent = !!(
    currentGen &&
    (currentGen.model_url ||
      ((currentGen.type === "image" ||
        currentGen.type === "video" ||
        currentGen.type === "audio") &&
        currentGen.url) ||
      (currentGen.type === "text" && currentGen.text))
  );
  const imagePreviewTransform = useMemo(
    () => ({
      width: Math.max(
        768,
        Math.min(
          1600,
          Math.ceil(
            ((d.compactWidth ??
              (schemaKey.startsWith("vfx")
                ? DEFAULT_VFX_COMPACT_WIDTH
                : DEFAULT_COMPACT_WIDTH)) as number) *
              WORKSPACE_NODE_UI_SCALE *
              2,
          ),
        ),
      ),
      quality: 82,
      resize: "contain" as const,
    }),
    [d.compactWidth, schemaKey],
  );
  const previewImageUrl = useFreshSignedUrl(
    currentGen?.url && (currentGen.type === "image" || currentGen.model_url)
      ? currentGen.url
      : null,
    imagePreviewTransform,
    { jobId: currentGen?.job_id ?? null },
  );

  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  // Reset measured dims when the displayed media swaps so the badge
  // reflects the new generation, not the previous one.
  useEffect(() => {
    setImgDims(null);
    setPreviewImageFailed(false);
  }, [currentGen?.id, currentGen?.url, currentGen?.model_url, previewImageUrl]);

  const showBrokenImagePlaceholder =
    previewImageFailed &&
    Boolean(
      currentGen &&
        currentGen.url &&
        (currentGen.type === "image" || currentGen.model_url),
    );

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
      if (p.key === "multi_prompt") return false;
      if (p.visibleWhen) {
        const hidden = Object.entries(p.visibleWhen).some(
          ([k, v]) => String(params[k] ?? "") !== v,
        );
        if (hidden) return false;
      }
      // In multi-shot mode, duration is dictated by the scene sum.
      if (isMultiShot && p.key === "duration") return false;
      const group = String(p.group ?? "").toLowerCase();
      if (group.includes("advanced") || p.key === "negative_prompt") return false;
      return true;
    });
  }, [visibleParams, params, isMultiShot]);

  const advancedToolbarParams = useMemo(() => {
    return visibleParams.filter((p) => {
      if (p.key === "prompt") return false;
      if (p.key === "multi_prompt") return false;
      if (p.visibleWhen) {
        const hidden = Object.entries(p.visibleWhen).some(
          ([k, v]) => String(params[k] ?? "") !== v,
        );
        if (hidden) return false;
      }
      if (isMultiShot && p.key === "duration") return false;
      const group = String(p.group ?? "").toLowerCase();
      return group.includes("advanced") || p.key === "negative_prompt";
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
        // Gemini TTS voice picker: searchable MiniSelect with a ▶
        // preview button INSIDE each list row so creators can audition
        // any speaker without committing to it. Selection still happens
        // when the user clicks the row body (or hits Enter); the action
        // button stops propagation so its click never selects.
        if (
          param.key === "voice" &&
          typeof selectedModel === "string" &&
          selectedModel.startsWith("gemini-")
        ) {
          return (
            <MiniSelect
              key={param.key}
              value={String(value)}
              options={effectiveOptions}
              optionLabels={localizedEffectiveLabels}
              onChange={(v) => updateParam(param.key, v)}
              searchable
              searchFooter="All preset voices"
              renderItemAction={(voiceId) => (
                <VoicePreviewItemButton
                  voiceId={voiceId}
                  isPlaying={voicePreview.playingId === voiceId}
                  isLoading={voicePreview.loadingId === voiceId}
                  onPlay={(vid) => {
                    void voicePreview
                      .play(vid, { modelId: String(selectedModel) })
                      .catch((err) => {
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : t("workspace.toolNode.voicePreviewFailed"),
                        );
                      });
                  }}
                />
              )}
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
      if (effectiveType === "text" && (param.key === "seed" || schemaKey.startsWith("vfx"))) {
        return (
          <MiniTextInput
            key={param.key}
            label={param.label}
            value={String(value ?? "")}
            placeholder={param.placeholder}
            onChange={(v) => updateParam(param.key, v)}
          />
        );
      }
      if (effectiveType === "textarea" && schemaKey.startsWith("vfx")) {
        return (
          <MiniTextInput
            key={param.key}
            label={param.label}
            value={String(value ?? "")}
            placeholder={param.placeholder}
            onChange={(v) => updateParam(param.key, v)}
          />
        );
      }
      // Anything else (text, json) is intentionally omitted from the
      // toolbar; falls through to nothing.
      return null;
    },
    [params, selectedModel, t, updateParam, schemaKey, id, voicePreview],
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
  const isUrlAssetNode = schemaKey === "urlAssetNode";
  const isVfxNode = schemaKey.startsWith("vfx");
  const isVfxControlNode = isVfxNode && schemaKey !== "vfxQwenImageNode";

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
      const defaultWidth = isVfxNode
        ? DEFAULT_VFX_COMPACT_WIDTH
        : DEFAULT_COMPACT_WIDTH;
      const minWidth = isVfxNode ? MIN_VFX_COMPACT_WIDTH : 320;
      const maxWidth = isVfxNode ? MAX_VFX_COMPACT_WIDTH : 1200;
      const startWidth = (d.compactWidth as number | undefined) ?? defaultWidth;
      const onMove = (ev: PointerEvent) => {
        const delta = (ev.clientX - startX) / WORKSPACE_NODE_UI_SCALE;
        const next = Math.max(
          minWidth,
          Math.min(maxWidth, Math.round(startWidth + delta)),
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
    [id, d.compactWidth, isVfxNode, setNodes],
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
  const vfxMeta = useMemo(
    () =>
      getVfxCardMeta(
        schemaKey,
        params,
        String((d.params?.nodeName as string | undefined) ?? schema?.displayName ?? ""),
      ),
    [d.params?.nodeName, params, schema?.displayName, schemaKey],
  );
  const vfxPrimaryParams = useMemo(() => {
    if (!vfxMeta) return [];
    const primaryKeys = new Set(vfxMeta.primaryParamKeys);
    return visibleParams.filter((param) => {
      if (param.key === "prompt" || param.key === "multi_prompt") return false;
      if (param.visibleWhen) {
        const hidden = Object.entries(param.visibleWhen).some(
          ([key, value]) => String(params[key] ?? "") !== value,
        );
        if (hidden) return false;
      }
      return primaryKeys.has(param.key);
    });
  }, [params, vfxMeta, visibleParams]);
  const vfxAdvancedParams = useMemo(() => {
    if (!vfxMeta) return [];
    const primaryKeys = new Set(vfxMeta.primaryParamKeys);
    return visibleParams.filter((param) => {
      if (param.key === "prompt" || param.key === "multi_prompt") return false;
      if (primaryKeys.has(param.key)) return false;
      if (param.visibleWhen) {
        const hidden = Object.entries(param.visibleWhen).some(
          ([key, value]) => String(params[key] ?? "") !== value,
        );
        if (hidden) return false;
      }
      return true;
    });
  }, [params, vfxMeta, visibleParams]);
  const vfxPromptParam = useMemo(
    () => visibleParams.find((param) => param.key === "prompt") ?? null,
    [visibleParams],
  );
  const vfxVisibleInputs = useMemo(() => {
    if (!vfxMeta) return visibleInputs;
    const ids = getVfxPortIds(schemaKey, params, "input");
    return visibleInputs.filter((input) => ids.has(input.id));
  }, [params, schemaKey, vfxMeta, visibleInputs]);
  const vfxVisibleOutputs = useMemo(() => {
    if (!vfxMeta) return visibleOutputs;
    const ids = getVfxPortIds(schemaKey, params, "output");
    return visibleOutputs.filter((output) => ids.has(output.id));
  }, [params, schemaKey, vfxMeta, visibleOutputs]);
  const renderVfxParamControl = useCallback(
    (param: ParamDef) => {
      const value = formatVfxParamValue(param, params[param.key]);
      const help = getVfxParamHelp(param);
      return (
        <Tooltip key={param.key} delayDuration={1000}>
          <TooltipTrigger asChild>
            <div
              className="ws-vfx-control"
              aria-label={`${param.label} / ${help.labelTh}: ${help.descriptionTh}`}
            >
              <div className="ws-vfx-control-head">
                <span className="ws-vfx-control-label">{param.label}</span>
                <span className="ws-vfx-control-value">{value}</span>
              </div>
              <div className="ws-vfx-control-widget">{renderToolbarParam(param)}</div>
            </div>
          </TooltipTrigger>
          <VfxParamTooltipContent param={param} help={help} value={value} />
        </Tooltip>
      );
    },
    [params, renderToolbarParam],
  );

  if (!schema) {
    return (
      <div className="rounded-md border border-red-500 bg-red-950 px-3 py-2 text-xs text-red-200">
        {t("workspace.toolNode.unknownNodeType", { nodeType: schemaKey })}
      </div>
    );
  }

  if (isVfxNode && vfxMeta) {
    const vfxStatusLabel = isRunning
      ? "Running"
      : runStatus === "error"
        ? "Review"
        : runStatus === "done"
          ? "Ready"
          : VFX_PREPROCESS_NODE_TYPES.has(schemaKey)
            ? "Setup"
            : "Ready";

    return (
      <>
        <div
          className={cn("ws-vfx-node nodrag-shell", `is-${vfxMeta.tone}`)}
          data-state={selected ? "selected" : "idle"}
          data-status={runStatus}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            width:
              Math.min(
                (d.compactWidth as number | undefined) ?? DEFAULT_VFX_COMPACT_WIDTH,
                MAX_VFX_COMPACT_WIDTH,
              ) *
              WORKSPACE_NODE_UI_SCALE,
          }}
          title={vfxMeta.summary}
        >
          <NodeQuickActionRail
            visible={selected || isHovered}
            selected={selected}
            onDelete={!isViewer ? onDeleteNode : undefined}
            nodeId={id}
            mediaKind={
              currentGen?.type === "image" || currentGen?.type === "video" || currentGen?.type === "audio"
                ? currentGen.type
                : null
            }
            mediaUrl={
              currentGen?.type === "image"
                ? (previewImageUrl ?? currentGen.url ?? null)
                : currentGen?.type === "video"
                  ? (currentGen.url ?? null)
                  : currentGen?.type === "audio"
                    ? (currentGen.url ?? null)
                    : currentGen?.model_url
                      ? (previewImageUrl ?? currentGen.url ?? null)
                      : null
            }
            mediaFileName={schema.displayName}
            mediaCreatedAt={currentGen?.createdAt ?? null}
            bodyTopOffsetPx={CLEAN_NODE_BODY_TOP_PX}
          />

          <div className="ws-vfx-card workspace-node-shell">
            <div className="ws-vfx-header">
              <div className="ws-vfx-stage-mark">
                <span>{vfxMeta.stage}</span>
              </div>
              <div className="ws-vfx-title-block">
                <div className="ws-vfx-kicker">
                  <Icon className="h-3.5 w-3.5" />
                  <span>{vfxMeta.stageLabel}</span>
                </div>
                <input
                  value={(d.params?.nodeName as string) ?? vfxMeta.title}
                  onChange={(e) =>
                    updateNodeField("params", { ...params, nodeName: e.target.value })
                  }
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="ws-vfx-title-input nodrag"
                  placeholder={vfxMeta.title}
                />
              </div>
              <Tooltip delayDuration={1000}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="ws-vfx-info-button nodrag"
                    onMouseDown={(e) => e.stopPropagation()}
                    aria-label="Stage info"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-[260px] border-white/10 bg-[#151515] text-xs leading-5 text-zinc-100 shadow-2xl shadow-black/40"
                >
                  {vfxMeta.summary}
                </TooltipContent>
              </Tooltip>
              <span className="ws-vfx-status-pill" data-status={runStatus}>
                {vfxStatusLabel}
              </span>
            </div>

            <div className="ws-vfx-tabs" aria-hidden="true">
              <span className="is-active">Edit</span>
              <span>Results</span>
            </div>

            <div className="ws-vfx-preview">
              {currentGen?.type === "image" && currentGen.url && !previewImageFailed ? (
                <img
                  src={previewImageUrl ?? currentGen.url}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  onError={() => {
                    setImgDims(null);
                    setPreviewImageFailed(true);
                  }}
                />
              ) : currentGen?.type === "video" && currentGen.url ? (
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
                />
              ) : (
                <div className="ws-vfx-preview-empty">
                  <Icon className="h-5 w-5" />
                  <span>{vfxMeta.artifactLabel}</span>
                </div>
              )}
              {isRunning && (
                <div className="ws-vfx-running-overlay">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <RunTimer startedAt={(visibleRunStartedAt as number | null | undefined) ?? null} />
                </div>
              )}
            </div>

            {vfxPrimaryParams.length > 0 && (
              <div className="ws-vfx-param-grid nodrag">
                {vfxPrimaryParams.map((param) => renderVfxParamControl(param))}
              </div>
            )}

            {vfxPromptParam && (() => {
              const help = getVfxParamHelp(vfxPromptParam);
              return (
                <Tooltip delayDuration={1000}>
                  <TooltipTrigger asChild>
                    <textarea
                      value={String(params.prompt ?? "")}
                      onChange={(e) => updateParam("prompt", e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="ws-vfx-prompt-input nodrag nowheel"
                      placeholder={String(vfxPromptParam.placeholder ?? "Describe the VFX change")}
                      rows={3}
                      spellCheck={false}
                      aria-label={`${vfxPromptParam.label} / ${help.labelTh}: ${help.descriptionTh}`}
                    />
                  </TooltipTrigger>
                  <VfxParamTooltipContent
                    param={vfxPromptParam}
                    help={help}
                    value={String(params.prompt ?? "").trim() ? undefined : "Blank"}
                  />
                </Tooltip>
              );
            })()}

            {(vfxAdvancedParams.length > 0 || runStatus === "error") && (
              <div className="ws-vfx-footer">
                {vfxAdvancedParams.length > 0 && (
                  <button
                    type="button"
                    className="ws-vfx-secondary-action nodrag"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setShowAdvancedParams((value) => !value);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span>{showAdvancedParams ? "Less" : "Advanced"}</span>
                  </button>
                )}
                {runStatus === "error" && d.lastRunError && (
                  <span className="ws-vfx-error-text">{d.lastRunError}</span>
                )}
              </div>
            )}

            {showAdvancedParams && vfxAdvancedParams.length > 0 && (
              <div className="ws-vfx-advanced-panel nodrag">
                {vfxAdvancedParams.map((param) => renderVfxParamControl(param))}
              </div>
            )}

            <div className="ws-vfx-action-row">
              <button
                type="button"
                className={cn("ws-vfx-run-button nodrag", runStatus === "error" && "is-error")}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDownCapture={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void runNode();
                }}
                disabled={isRunning || isViewer}
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : runStatus === "error" ? (
                  <RotateCw className="h-4 w-4" />
                ) : (
                  <GenerateIcon className="h-4 w-4" />
                )}
                <span>{VFX_PREPROCESS_NODE_TYPES.has(schemaKey) ? "Prepare" : "Run"}</span>
              </button>
            </div>

            <div
              className="ws-compact-resize-handle nodrag"
              onPointerDown={onResizeStart}
              onMouseDown={(e) => e.stopPropagation()}
              title={t("workspace.toolNode.dragToResize")}
              aria-label={t("workspace.toolNode.resizeNode")}
            />
          </div>
        </div>

        {historyOpen && generations.length > 0 && (
          <NodeResultDialog
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            generations={generations}
            selectedIndex={selectedGenIndex}
            onSelect={onSelectHistoryIndex}
          />
        )}

        {vfxVisibleInputs.map((inp, i) => (
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
        {vfxVisibleOutputs.map((out, i) => (
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
            reason={insufficientReason}
            featureName={featureLabelForPlanLock(insufficientFeature)}
          />
        )}
      </>
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
          selected={selected}
          onDelete={!isViewer ? onDeleteNode : undefined}
          nodeId={id}
          mediaKind={
            currentGen?.type === "image" || currentGen?.type === "video" || currentGen?.type === "audio"
              ? currentGen.type
              : null
          }
          mediaUrl={
            currentGen?.type === "image"
              ? (previewImageUrl ?? currentGen.url ?? null)
              : currentGen?.type === "video"
                ? (currentGen.url ?? null)
                : currentGen?.type === "audio"
                  ? (currentGen.url ?? null)
                  : currentGen?.model_url
                    ? (previewImageUrl ?? currentGen.url ?? null)
                    : null
          }
          mediaFileName={schema.displayName}
          mediaCreatedAt={currentGen?.createdAt ?? null}
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
          data-compact-empty={isVfxControlNode ? "true" : undefined}
          onDoubleClick={(event) => {
            const target = event.target as HTMLElement | null;
            if (
              target?.closest?.(
                'button, input, textarea, select, [contenteditable="true"]',
              )
            ) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            window.dispatchEvent(
              new CustomEvent("workspace-open-node-preview", {
                detail: { nodeId: id },
              }),
            );
          }}
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
              {currentGen.url && !previewImageFailed ? (
                <img
                  src={previewImageUrl ?? currentGen.url}
                  alt={t("workspace.toolNode.modelPreviewAlt")}
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  onError={() => {
                    setImgDims(null);
                    setPreviewImageFailed(true);
                  }}
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
          ) : currentGen?.type === "image" && currentGen.url && !previewImageFailed && (
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
              onError={() => {
                setImgDims(null);
                setPreviewImageFailed(true);
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
          {currentGen?.type === "audio" && currentGen.url && (
            <div className="ws-compact-audio-preview">
              <div className="ws-compact-audio-card nodrag">
                <div className="ws-compact-audio-icon">
                  <Music className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold leading-[18px] text-white">
                    {t("workspace.toolnames.audio_gen")}
                  </div>
                  <div className="mt-1 h-[18px] overflow-hidden rounded-full bg-white/[0.08]">
                    <div className="flex h-full items-center gap-[3px] px-2">
                      {Array.from({ length: 24 }).map((_, index) => (
                        <span
                          key={index}
                          className="block w-[3px] rounded-full bg-amber-300/70"
                          style={{
                            height: `${6 + ((index * 7) % 12)}px`,
                            opacity: 0.35 + ((index % 5) * 0.12),
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <AudioPlayButton
                  src={currentGen.url}
                  label={t("workspace.common.playAudio")}
                  className="shrink-0"
                  buttonClassName="h-10 w-10 shadow-[0_10px_24px_-14px_rgba(255,255,255,.8)]"
                />
              </div>
            </div>
          )}
          {(!hasRenderableContent || showBrokenImagePlaceholder) && (
            <div className="ws-compact-preview-empty" />
          )}

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
                {advancedToolbarParams.length > 0 && (
                  <button
                    type="button"
                    className="ws-advanced-param-toggle nodrag"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setShowAdvancedParams((value) => !value);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    title={showAdvancedParams ? "Hide advanced settings" : "Show advanced settings"}
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    <span>{showAdvancedParams ? "Less" : "More"}</span>
                  </button>
                )}
                {showAdvancedParams &&
                  advancedToolbarParams.map((p) => renderToolbarParam(p))}
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
                !hasPromptParam && !isUrlAssetNode && "is-no-prompt",
                isUrlAssetNode && "is-url-asset",
              )}
            >
              {isUrlAssetNode ? (
                <textarea
                  value={String(params.source_url ?? "")}
                  onChange={(e) => updateParam("source_url", e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="ws-compact-prompt-input ws-url-asset-input nodrag nowheel"
                  placeholder={t("workspace.toolNode.urlAssetPlaceholder")}
                  spellCheck={false}
                  rows={2}
                  aria-label="Source URL"
                />
              ) : hasPromptParam ? (
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
                    "urlAssetNode",
                    "videoToPromptNode",
                    "imageTo3dNode",
                    "vfxVariableNode",
                    "vfxStartFrameNode",
                    "vfxBackgroundNode",
                    "vfxDepthNode",
                    "vfxCannyNode",
                    "vfxPoseNode",
                    "vfxTrackNode",
                    "vfxMaskNode",
                    "vfxQwenImageNode",
                    "upscaleImageNode",
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
          {!isMultiShot && (
            <div className="ws-compact-run-anchor">
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onPointerDownCapture={(e) => {
                      e.stopPropagation();
                    }}
                    onMouseDownCapture={(e) => {
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      runMultiGen(multiGenCount);
                    }}
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
                      <GenerateIcon className="h-[18px] w-[18px]" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="end"
                  className="ws-ui-copy-tooltip ws-run-summary-tooltip overflow-visible border-white/10 bg-[#151515] text-zinc-100 shadow-2xl shadow-black/40"
                >
                  <div className="flex flex-col gap-1.5 text-zinc-100">
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
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-zinc-100">
                        {nodeCost != null && !creditCostsLoading ? (
                          <span className="flex items-baseline gap-1.5 text-zinc-100">
                            <span className="font-medium">Total</span>
                            <span className="font-semibold">
                              {formatCreditAmount(nodeCost)}
                              {costSuffix ?? ""}
                            </span>
                            <span>credits</span>
                            {hasCostDiscount && baseNodeCostDisplay != null && (
                              <>
                                <span className="text-[10px] leading-none text-zinc-200/65 line-through">
                                  {formatCreditAmount(baseNodeCostDisplay)}
                                  {costSuffix ?? ""}
                                </span>
                                <span className="text-[10px] font-semibold leading-none text-zinc-100">
                                  -{costTotalDiscountPercent}%
                                </span>
                              </>
                            )}
                          </span>
                        ) : (
                          <span>{costSummaryLabel}</span>
                        )}
                        {costDiscountRows.length > 0 && (
                          <span className="group/cost relative inline-flex items-center">
                            <span
                              className="inline-grid h-[15px] w-[15px] place-items-center rounded-full border border-zinc-100/45 text-zinc-100/90 transition-colors hover:border-zinc-100 hover:bg-white/10 hover:text-white"
                              aria-label="Cost details"
                            >
                              <Info className="h-[10px] w-[10px]" strokeWidth={2.4} />
                            </span>
                            <span className="pointer-events-none absolute bottom-full right-0 z-[70] mb-2 hidden w-[168px] rounded-md border border-white/10 bg-[#111] p-2 text-left text-[11px] leading-[16px] text-zinc-100 shadow-2xl shadow-black/50 group-hover/cost:block">
                              {costDiscountRows.map((row) => (
                                <span key={`${row.label}:${row.value}`} className="flex items-center justify-between gap-3">
                                  <span className="truncate text-zinc-300">{row.label}</span>
                                  <span className={cn("font-semibold", row.className)}>
                                    {row.value}
                                  </span>
                                </span>
                              ))}
                            </span>
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
              {isRunning && (
                <RunTimer
                  startedAt={(visibleRunStartedAt as number | null | undefined) ?? null}
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
          reason={insufficientReason}
          featureName={featureLabelForPlanLock(insufficientFeature)}
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
