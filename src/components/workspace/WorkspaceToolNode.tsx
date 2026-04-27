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
import { type NodeProps, useEdges, useReactFlow } from "@xyflow/react";
import {
  Film, Loader2, Play, RotateCw, Sparkles, Scissors, Combine, FileVideo,
  Maximize2, Box,
  type LucideIcon,
} from "lucide-react";
import { PortIcon } from "./PortIcon";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

import { type ParamDef } from "@/components/flow/nodes/nodeApiSchema";
import { useCreatorCreditCosts } from "@/hooks/useCreatorCreditCosts";
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
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useDebugLogStore } from "@/store/useDebugLogStore";
import NodeResultDialog from "./NodeResultDialog";
import type { Generation } from "./NodeResultBar";
import { findVoice, VOICE_TINT_GRADIENT } from "./geminiVoices";
// Workspace-local schema + helpers — kept out of the shared file so
// the main flow editor stays untouched.
import {
  cleanWsParamsOnModelChange,
  getWorkspaceSchema,
  getWsOverflowingHandles,
  getWsRemovedHandleIds,
  getWsVisibleInputs,
  getWsVisibleParams,
  portTypeFromHandleId,
} from "./workspaceSchema";

const RUN_EDGE_FUNCTION = "workspace-run-node";

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

const ICONS: Record<string, LucideIcon> = {
  imageGenNode: Sparkles,
  videoGenNode: Film,
  removeBackgroundNode: Scissors,
  mergeAudioNode: Combine,
  videoToPromptNode: FileVideo,
  imageTo3dNode: Box,
};

const OMNI_MODELS = new Set(["kling-v3-omni"]);

interface NodeData {
  label?: string;
  params?: Record<string, unknown>;
  exposed?: Record<string, boolean>;
  /** Run history. Newest first; index 0 is the latest unless the user
   *  picks an older one via the history dialog. */
  generations?: Generation[];
  selectedGenIndex?: number;
  /** User-controlled card width (Space + drag). Default 400. The
   *  number drives the outer wrapper's pixel width directly; the
   *  preview image fills the new width while ports/settings stay
   *  the same fixed size. */
  compactWidth?: number;
}

const WorkspaceToolNode = memo(({ id, data, type, selected }: NodeProps) => {
  const schemaKey = String(type ?? "");
  const schema = getWorkspaceSchema(schemaKey);
  const { setNodes, setEdges } = useReactFlow();
  const edges = useEdges();
  const prevHasRefVideo = useRef<boolean | undefined>(undefined);

  const d = (data ?? {}) as NodeData & { status?: "idle" | "processing" | "done" | "error" };
  const params = d.params ?? {};
  const selectedModel = (params.model_name as string) ?? schema?.defaultModel ?? "";
  const isMultiShot = String(params.multi_shot) === "true";
  const runStatus = d.status ?? "idle";
  const isRunning = runStatus === "processing";

  const runNode = useCallback(async () => {
    if (isRunning) return;
    const storeState = useWorkspaceStore.getState();
    const log = useDebugLogStore.getState().push;
    const nodeLabelForLog =
      (d.params?.nodeName as string) || schema?.displayName || schemaKey;

    // Set processing status (drives the node-shell glow ring too).
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, status: "processing" } } : n)),
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
      if (mentionedImage && !inputs.ref_image) {
        inputs.ref_image = mentionedImage.url;
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

      const startedAt = Date.now();
      const { data: resp, error } = await supabase.functions.invoke(RUN_EDGE_FUNCTION, {
        body: requestBody,
      });
      const durationMs = Date.now() - startedAt;

      // Supabase wraps non-2xx into FunctionsHttpError — the actual server
      // error message is in `error.context` (a Response object), which
      // serialises as `{}` in console.log. Read its body explicitly.
      let serverErrorBody: unknown = null;
      let serverErrorMessage: string | undefined;
      if (error) {
        const ctx = (error as { context?: Response | unknown }).context;
        if (ctx && typeof (ctx as Response).clone === "function") {
          try {
            const cloned = (ctx as Response).clone();
            const text = await cloned.text();
            if (text) {
              try {
                serverErrorBody = JSON.parse(text);
                serverErrorMessage = (serverErrorBody as { error?: string })?.error ?? text;
              } catch {
                serverErrorBody = text;
                serverErrorMessage = text;
              }
            }
          } catch {
            /* couldn't read body — keep going with whatever message we have */
          }
        }
      }

      // eslint-disable-next-line no-console
      console.log("[workspace-run-node] received", {
        resp, error, serverErrorBody, durationMs,
      });

      const respErr = (resp as any)?.error as string | undefined;
      if (error || respErr) {
        const msg =
          serverErrorMessage ??
          respErr ??
          (error as any)?.message ??
          "Unknown run error";
        log({
          level: "error",
          nodeId: id,
          title: `✗ ${msg} (${durationMs}ms)`,
          payload: {
            sentBody: requestBody,
            errorMessage: msg,
            serverErrorBody,
            httpError: error
              ? { name: (error as any).name, message: (error as any).message }
              : null,
            resp,
          },
        });
        throw new Error(msg);
      }

      const r = resp as {
        type: "image" | "video" | "text";
        url?: string;
        text?: string;
        prompt_used?: string;
        prompt_source?: string;
        task_id?: string;
        provider_meta?: {
          poll_endpoint?: string;
          provider?: string;
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
      //   - "tripo3d" → POST action="poll_tripo3d"
      //   - else      → POST action="poll_kling"  (default for video)
      const pollEndpoint = r.provider_meta?.poll_endpoint;
      const pollProvider = String(r.provider_meta?.provider ?? "kling").toLowerCase();
      if (r.task_id && !r.url && pollEndpoint) {
        const pollStart = Date.now();
        const isTripo3d = pollProvider === "tripo3d";
        const POLL_INTERVAL_MS = isTripo3d ? 4_000 : 5_000;
        const POLL_TIMEOUT_MS = isTripo3d ? 8 * 60_000 : 6 * 60_000;
        const pollAction = isTripo3d ? "poll_tripo3d" : "poll_kling";
        const providerLabel = isTripo3d ? "Tripo3D" : "Kling";
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

        while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
          await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
          const { data: pollResp, error: pollErr } = await supabase.functions.invoke(
            RUN_EDGE_FUNCTION,
            {
              body: {
                action: pollAction,
                task_id: r.task_id,
                poll_endpoint: pollEndpoint,
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
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, status: "done" } } : n)),
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
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, status: "error" } } : n)),
      );
      log({
        level: "error",
        nodeId: id,
        title: `✗ ${nodeLabelForLog} · ${String(e?.message ?? e)}`,
      });
      toast.error(String(e?.message ?? e));
    }
  }, [id, isRunning, params, schemaKey, setNodes, selectedModel, schema, d.params?.nodeName]);

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
  const isMotionModel = selectedModel.includes("motion");
  const isOmniModel = OMNI_MODELS.has(selectedModel);

  const nodeCost = useMemo(() => {
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

  const costSuffix = isMotionModel
    ? "/s"
    : isOmniModel
      ? ` (${params.duration ?? 5}s)`
      : undefined;

  if (!schema) {
    return (
      <div className="rounded-md border border-red-500 bg-red-950 px-3 py-2 text-xs text-red-200">
        Unknown node type: {schemaKey}
      </div>
    );
  }

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
      const effectiveLabels = resolved?.optionLabels ?? param.optionLabels;
      const value = params[param.key] ?? resolved?.default ?? param.default;

      // Audio-gen Voice picker — replace the default MiniSelect with a
      // bespoke button that fires the rich picker dialog (avatar grid
      // + use-case cards + preview play). The select-style fallback
      // would still work for keyboard users but the button gives the
      // primary visual affordance.
      if (param.key === "voice" && schemaKey === "audioGenNode") {
        return (
          <VoicePickerButton
            key={param.key}
            voiceId={String(value)}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("workspace-open-voice-picker", {
                  detail: { nodeId: id, voiceId: String(value) },
                }),
              );
            }}
          />
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
              optionLabels={effectiveLabels}
              onChange={(v) => updateParam(param.key, v)}
            />
          );
        }
        return (
          <MiniSelect
            key={param.key}
            value={String(value)}
            options={effectiveOptions}
            optionLabels={effectiveLabels}
            onChange={(v) => updateParam(param.key, v)}
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
    [params, selectedModel, updateParam, schemaKey, id],
  );

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
      const startWidth = (d.compactWidth as number | undefined) ?? 400;
      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
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

  // Multi-shot scenes (only used when multi_shot=true on Kling Omni).
  const multiShotScenes: SceneBlock[] = Array.isArray(params.multi_prompt)
    ? (params.multi_prompt as SceneBlock[])
    : [];

  return (
    <>
      <div
        className="ws-clean-node nodrag-shell"
        data-state={selected ? "selected" : "idle"}
        data-status={runStatus}
        style={{ width: d.compactWidth ?? 400 }}
      >
        {/* ── Floating title — sits ABOVE the body, no border. ── */}
        <div className="ws-clean-title">
          <Icon
            className="ws-clean-title-icon"
            style={{ color: colorOf(schema.accentColor) }}
          />
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
          {nodeCost != null && !creditCostsLoading && (
            <span
              className="ws-compact-header-badge"
              style={{ pointerEvents: "auto" }}
            >
              {nodeCost}
              {costSuffix ?? ""}
            </span>
          )}
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
                  src={currentGen.url}
                  alt="3D model preview"
                  draggable={false}
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    objectFit: "contain",
                    background: "hsl(0 0% 6%)",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  className="flex w-full items-center justify-center text-zinc-600"
                  style={{ aspectRatio: "1 / 1", background: "hsl(0 0% 6%)" }}
                >
                  <span className="text-xs">3D model</span>
                </div>
              )}
              <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-amber-300">
                3D · double-click to view
              </span>
            </div>
          ) : currentGen?.type === "image" && currentGen.url && (
            <img
              src={currentGen.url}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const img = e.target as HTMLImageElement;
                setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
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
          {generations.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setHistoryOpen(true);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute left-2 top-2 nodrag flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white/80 backdrop-blur-sm hover:bg-black/80"
              title="Browse history"
            >
              <Maximize2 className="h-2.5 w-2.5" />
              {selectedGenIndex + 1}/{generations.length}
            </button>
          )}

          {/* ── Settings overlay — fades in on hover/select ── */}
          <div className="ws-compact-overlay">
            <div className="ws-compact-toolbar">
              {toolbarParams.map((p) => renderToolbarParam(p))}
            </div>
          </div>

          {/* ── Prompt + Run row — pinned to the bottom of the
           *  preview. When the schema doesn't accept a text prompt
           *  (e.g. Tripo3D image_to_model) we drop the textarea and
           *  keep just the Run button on the right. */}
          {!isMultiShot && (
            <div
              className={cn(
                "ws-compact-prompt-overlay",
                !hasPromptParam && "is-no-prompt",
              )}
            >
              {hasPromptParam ? (
                <PromptMentionTextarea
                  value={String(params.prompt ?? "")}
                  onChange={(v) => updateParam("prompt", v)}
                  placeholder={`Describe the ${schema.displayName.toLowerCase().includes("video") ? "video" : "image"} you want to generate…`}
                  excludeNodeId={id}
                  className="ws-compact-prompt-input"
                />
              ) : (
                <span className="ws-compact-prompt-hint">
                  Wire an image into the input port and press Run
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void runNode();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={isRunning}
                className={cn(
                  "ws-compact-run nodrag",
                  runStatus === "error" && "is-error",
                )}
                title={
                  isRunning
                    ? "Running…"
                    : runStatus === "error"
                      ? "Retry"
                      : "Run (Ctrl+Enter)"
                }
              >
                {isRunning ? (
                  <Loader2 className="animate-spin" />
                ) : runStatus === "error" ? (
                  <RotateCw />
                ) : (
                  <Play className="fill-current" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* ── Multi-shot scene builder (Kling Omni only) — keeps its
         *  own row below the preview because the scene list grows
         *  too tall to overlay sensibly. */}
        {isMultiShot && (
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
          title="Drag to resize"
          aria-label="Resize node"
        />
        </div> {/* end ws-compact-node body card */}
      </div>

      {/* History dialog (shared with the legacy NodeResultBar). */}
      {generations.length > 0 && (
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
          label={inp.label}
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
          label={out.label}
          portType={portTypeFromHandleId(out.id)}
          color={colorOf(out.color)}
          index={i}
        />
      ))}
    </>
  );
});

WorkspaceToolNode.displayName = "WorkspaceToolNode";
export default WorkspaceToolNode;

/* ── Voice picker pill (audioGenNode only) ──────────────────
 *
 * Renders the currently-selected Gemini voice as a small pill with
 * an avatar (initial letter on a tinted gradient) + the name. The
 * actual picker UI lives in `VoicePickerDialog`, opened via a window
 * event so the canvas owns the dialog state and the node body stays
 * pure. We don't render the dialog here — that would mount one per
 * audio node, which is wasteful AND would compete for keyboard /
 * Esc focus across multiple nodes.
 */
function VoicePickerButton({
  voiceId,
  onClick,
}: {
  voiceId: string;
  onClick: () => void;
}) {
  const voice = findVoice(voiceId);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="nodrag flex h-7 items-center gap-2 rounded-full bg-white/[0.05] px-1 pr-3 text-[11px] text-zinc-100 ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-white/[0.10]"
      title={`Voice: ${voice.name} (${voice.characteristic}) — click to browse`}
    >
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ring-1 ring-inset ring-white/15"
        style={{ background: VOICE_TINT_GRADIENT[voice.tint] }}
      >
        {voice.name.charAt(0)}
      </span>
      <span className="font-medium">{voice.name}</span>
      <span className="text-zinc-500">·</span>
      <span className="text-zinc-400">{voice.characteristic}</span>
    </button>
  );
}
