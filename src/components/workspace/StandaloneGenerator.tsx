import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  Box,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Crop,
  Copy,
  Download,
  Eye,
  ExternalLink,
  Film,
  FolderOpen,
  GripVertical,
  ImagePlus,
  Loader2,
  Menu,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { friendlyError, functionErrorMessage } from "@/lib/friendlyError";
import { UserMenu } from "@/components/workspace/UserMenu";
import {
  CreateImagePanel,
  CreateVideoPanel,
  StandalonePromptMentionTextarea,
  type CreateVideoPanelSetting,
} from "@/components/workspace/CreateImagePanel";
import InsufficientCreditsDialog from "@/components/InsufficientCreditsDialog";
import {
  applyNodeCostDiscount,
  applyPackageCostDiscount,
  calculateNodeCostQuote,
  effectiveNodeDiscountPercent,
} from "@/lib/nodeCostCalculator";
import { useNodeCreditCosts } from "@/hooks/useNodeCreditCosts";
import { useCredits } from "@/hooks/useCredits";
import {
  buildDownloadFilename,
  downloadFromUrl,
  triggerBlobDownload,
} from "./downloadAsset";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import NodePreviewLightbox, { type PreviewPayload } from "./NodePreviewLightbox";
import { useFreshSignedUrl } from "./useFreshSignedUrl";
import { getSignedUrl } from "@/hooks/useSignedUrl";
import { AudioPlayButton } from "./AudioPlayButton";
import GenerateIcon from "@/components/GenerateIcon";
import {
  build3dParams,
  buildAudioParams,
  buildImageParams,
  buildVideoParams,
  gptImageResolutionsFor,
  GPT_IMAGE_ASPECT_RATIOS,
  IMAGE_STYLE_PRESETS,
  isKlingMotionVideoModel,
  seedanceResolutionOptionsForModel,
  seedanceVideoSupportsAudio,
  isSeedance20VideoModel,
  isSeedanceVideoModel,
  isSeedreamImageModel,
  isReplicateVeoVideoModel,
  isVeoVideoModel,
  STANDALONE_TOOL_ORDER,
  STANDALONE_TOOLS,
  type StandaloneToolKey,
  videoDurationsForModel,
  videoSupportsEndFrame,
  videoSupportsReferenceImage,
  videoSupportsReferenceVideo,
  videoSupportsStartEndFrames,
} from "./standaloneGenerationCatalog";
import { GEMINI_TTS_VOICES, DEFAULT_GEMINI_TTS_VOICE } from "./workspaceSchema";
import { useVoicePreview } from "@/hooks/useVoicePreview";
import { modelLogoFor, orderModelsByRecommendation } from "./modelDisplay";
import { getProjectAvatar } from "./projectAvatars";
import MediaContextMenu, {
  type MediaContextMenuItem,
} from "./MediaContextMenu";
// Hardcoded voice catalogs (Gemini star names, Google Studio
// labels, ElevenLabs default presets) were deleted in the
// preset-purge cleanup. ElevenLabs voices come from a live
// /v1/voices fetch (account-bound, real); Gemini and Google use
// the backend provider defaults and only expose style instructions.

/** Empty default voice — backend executors carry their own
 *  per-provider fallback (`Charon` for Gemini, `en-US-Studio-O`
 *  for Google, first account voice for ElevenLabs) so an empty
 *  string is fine. */
const DEFAULT_VOICE_ID = "";

const RUN_EDGE_FUNCTION = "workspace-run-node";
const AUTO_PROMPT_EDGE_FUNCTION = "workspace-chat";
const AUTO_PROMPT_MODEL = "gpt-5.5";
const AUTO_PROMPT_SYSTEM_PROMPT = `You help MediaForge users create production-ready prompts for the active generation tool.
Turn rough human language into a clear prompt that can be used immediately.
Preserve every @mention token exactly as provided, including label and id.
If selected references are listed, include the relevant @mention tokens when they should be passed into generation.
Do not invent references, models, parameters, or provider capabilities.`;
const STANDALONE_CANVAS_ID = "standalone";
const STORAGE_BUCKET = "ai-media";
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 365;
const IMAGE_REFERENCE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_REFERENCE_UPLOAD_MAX_SIDE = 1600;
const IMAGE_REFERENCE_UPLOAD_JPEG_QUALITY = 0.88;
const STANDALONE_JOB_SELECT =
  "id,node_type,provider,model,request,status,attempts,result,error,last_error,created_at,completed_at,run_after,deadline_at,locked_by,lock_expires_at,credits_charged,credits_refunded";
const DEFAULT_WORKSPACE_INFRASTRUCTURE_BUFFER_PERCENT = 40;
const SEEDANCE_REF_VIDEO_MIN_SEC = 2;
const SEEDANCE_REF_VIDEO_MAX_SEC = 15;

const isInsufficientCreditsError = (message: string) =>
  /insufficient|not enough|credit/i.test(message) &&
  !/api credit|provider credit/i.test(message);

function seedanceReferenceVideoDurationMessage(durationSec?: number | null): string {
  const durationLabel =
    typeof durationSec === "number" && Number.isFinite(durationSec)
      ? ` (${durationSec.toFixed(1)}s)`
      : "";
  return `Seedance 2.0 reference videos must be ${SEEDANCE_REF_VIDEO_MIN_SEC}-${SEEDANCE_REF_VIDEO_MAX_SEC} seconds${durationLabel}.`;
}

function unreadableSeedanceReferenceVideoMessage(): string {
  return "Could not read the reference video duration. Upload an MP4/MOV video between 2 and 15 seconds.";
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

function readVideoDurationFromSource(
  src: string,
  revoke?: () => void,
): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      video.removeAttribute("src");
      video.load();
      revoke?.();
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

function readVideoFileDuration(file: File): Promise<number | null> {
  const objectUrl = URL.createObjectURL(file);
  return readVideoDurationFromSource(objectUrl, () => URL.revokeObjectURL(objectUrl));
}

function readVideoUrlDuration(url: string): Promise<number | null> {
  return readVideoDurationFromSource(url);
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image reference."));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not normalize image reference."));
      },
      type,
      quality,
    );
  });
}

function replaceFileExtension(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "reference";
  return `${base}.${ext}`;
}

async function normalizeImageReferenceUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;
  if (file.size <= IMAGE_REFERENCE_UPLOAD_MAX_BYTES) return file;

  const img = await loadImageElement(file);
  const maxSourceSide = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
  if (!maxSourceSide) return file;

  const scale = Math.min(1, IMAGE_REFERENCE_UPLOAD_MAX_SIDE / maxSourceSide);
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await canvasToBlob(
    canvas,
    "image/jpeg",
    IMAGE_REFERENCE_UPLOAD_JPEG_QUALITY,
  );
  if (blob.size >= file.size) return file;

  return new File([blob], replaceFileExtension(file.name, "jpg"), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

type UploadSlot =
  | "image-ref"
  /* Character slot — same upload pipeline as image-ref, but the
   *  resulting `UploadedRef` carries `role: "character"` so the
   *  prompt composer can inject identity-preservation cues and
   *  re-order the ref list so the character image is read by the
   *  provider as the primary subject (Image 1). */
  | "image-character"
  | "video-start"
  | "video-end"
  | "video-ref-image"
  | "video-ref-video"
  | "model-image";

/** Optional reference role.
 *
 * `character` — user uploaded this expecting the model to preserve
 *               the person/subject's identity (face, build, outfit
 *               cues). The composer adds an explicit cue prompt so
 *               the LLM understands intent — even on providers that
 *               don't have a native "identity" channel.
 * `general`   — plain reference for composition / style / context.
 *               Default when omitted to stay backward-compatible
 *               with rows persisted before this change shipped. */
interface UploadedRef {
  id: string;
  name: string;
  url: string;
  mime: string;
  role?: "character" | "general";
  source?: "generation" | "user_asset" | "upload";
  assetId?: string;
  storageBucket?: "ai-media" | "user_assets";
  storagePath?: string;
  durationSec?: number;
}

interface StandaloneSceneBlock {
  prompt: string;
  duration: number;
}

const STANDALONE_MULTISHOT_MAX_SCENES = 6;
const STANDALONE_MULTISHOT_MIN_DURATION = 1;
const STANDALONE_MULTISHOT_TOTAL_MIN = 3;
const STANDALONE_MULTISHOT_TOTAL_MAX = 15;
const DEFAULT_STANDALONE_MULTISHOT_SCENE: StandaloneSceneBlock = {
  prompt: "",
  duration: 3,
};

function normalizeStandaloneScene(value: unknown): StandaloneSceneBlock | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawDuration = Number(record.duration);
  const duration = Number.isFinite(rawDuration)
    ? Math.max(STANDALONE_MULTISHOT_MIN_DURATION, Math.min(15, Math.round(rawDuration)))
    : DEFAULT_STANDALONE_MULTISHOT_SCENE.duration;
  return {
    prompt: typeof record.prompt === "string" ? record.prompt : "",
    duration,
  };
}

function parseStandaloneMultiShotScenes(value: string | null | undefined): StandaloneSceneBlock[] {
  if (!value?.trim()) return [{ ...DEFAULT_STANDALONE_MULTISHOT_SCENE }];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [{ ...DEFAULT_STANDALONE_MULTISHOT_SCENE }];
    const scenes = parsed
      .map(normalizeStandaloneScene)
      .filter((scene): scene is StandaloneSceneBlock => !!scene)
      .slice(0, STANDALONE_MULTISHOT_MAX_SCENES);
    return scenes.length > 0 ? scenes : [{ ...DEFAULT_STANDALONE_MULTISHOT_SCENE }];
  } catch {
    return [{ ...DEFAULT_STANDALONE_MULTISHOT_SCENE }];
  }
}

function serializeStandaloneMultiShotScenes(scenes: StandaloneSceneBlock[]): string {
  const normalized = (scenes.length > 0 ? scenes : [{ ...DEFAULT_STANDALONE_MULTISHOT_SCENE }])
    .map((scene) => ({
      prompt: scene.prompt ?? "",
      duration: Math.max(
        STANDALONE_MULTISHOT_MIN_DURATION,
        Math.min(15, Math.round(Number(scene.duration) || 1)),
      ),
    }))
    .slice(0, STANDALONE_MULTISHOT_MAX_SCENES);
  return JSON.stringify(normalized);
}

function standaloneMultiShotDuration(scenes: StandaloneSceneBlock[]): number {
  const total = scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0);
  return Math.max(
    STANDALONE_MULTISHOT_TOTAL_MIN,
    Math.min(STANDALONE_MULTISHOT_TOTAL_MAX, Math.round(total || 0)),
  );
}

type PanelReferenceAsset = {
  id: string;
  url: string;
  mime?: string;
  name?: string;
  source?: "generation" | "user_asset" | "upload";
  assetId?: string;
  storageBucket?: "ai-media" | "user_assets";
  storagePath?: string;
  durationSec?: number;
};

type DeletableReference = {
  id: string;
  url?: string;
  mime?: string;
  name?: string;
  source?: "generation" | "user_asset" | "upload";
  assetId?: string;
  storageBucket?: "ai-media" | "user_assets";
  storagePath?: string;
};

interface StandaloneJobRow {
  id: string;
  node_type: string;
  provider: string | null;
  model: string | null;
  request: {
    params?: Record<string, unknown>;
    inputs?: Record<string, unknown>;
  };
  status: "queued" | "running" | "completed" | "failed" | "permanent_failed";
  attempts: number | null;
  result: StandaloneResult | null;
  error: string | null;
  last_error: string | null;
  created_at: string;
  completed_at: string | null;
  run_after?: string | null;
  deadline_at?: string | null;
  locked_by?: string | null;
  lock_expires_at?: string | null;
  credits_charged?: number | null;
  credits_refunded?: number | null;
}

type ProjectReferenceAssetRow = Record<string, unknown>;

interface StandaloneResult {
  type?: "image" | "video" | "audio" | "text" | "model_3d";
  url?: string;
  text?: string;
  task_id?: string;
  outputs?: Record<string, string>;
  prompt_used?: string;
  provider_meta?: {
    poll_endpoint?: string;
    model_url?: string;
    rendered_image?: string;
    provider?: string;
    duration_seconds?: number | string;
    duration?: number | string;
    video_duration?: number | string;
    [key: string]: unknown;
  };
  credits_spent?: number;
}

type StandaloneVideoInputMode = "frames" | "reference";

interface StandaloneFormState {
  model: string;
  prompt: string;
  styleId: string;
  aspectRatio: string;
  imageResolution: string;
  quality: string;
  outputFormat: string;
  background: string;
  imageCount: number;
  imageRefs: UploadedRef[];
  videoRatio: string;
  videoResolution: string;
  videoDuration: number;
  videoCount: number;
  videoInputMode: StandaloneVideoInputMode;
  videoWithAudio: boolean;
  videoStart: UploadedRef | null;
  videoEnd: UploadedRef | null;
  videoRefImage: UploadedRef | null;
  videoRefVideo: UploadedRef | null;
  videoCharacterOrientation: "image" | "video";
  videoKeepOriginalSound: boolean;
  videoNegativePrompt: string;
  videoPersonGeneration: "allow_adult" | "allow_all";
  videoReturnLastFrame: boolean;
  videoMultiShot: boolean;
  videoMultiPrompt: string;
  script: string;
  voice: string;
  voiceStyle: string;
  /** ElevenLabs / Gemini "Voice Style" preset — Expressive / Neutral
   *  / Consistent. Maps onto numeric voice_settings on the backend. */
  voiceStylePreset: "expressive" | "neutral" | "consistent";
  /** Speech speed (0.7–1.2). ElevenLabs only — Google has its own
   *  speakingRate path, Gemini doesn't expose this. */
  voiceSpeed: number;
  /** ElevenLabs voice_settings.stability (0–1). */
  voiceStability: number;
  /** ElevenLabs voice_settings.similarity_boost (0–1). */
  voiceSimilarity: number;
  /** ElevenLabs voice_settings.style (0–1). */
  voiceStyleAmount: number;
  /** Gemini-only audio tag presets. The picker on the standalone tool
   *  bar maps these onto bracketed audio tags (e.g. `[whispers]`,
   *  `[laughs]`) that get prepended to the script before the run
   *  request leaves the client — see `composeGeminiAudioTagPrefix`.
   *  Empty array means "no preset emotion/personality" — the user
   *  can still type tags directly into the script field. */
  audioTagsEmotion: string[];
  audioTagsPersonality: string[];
  /** Speed bucket — emits a single bracketed tag (`[very slow]` /
   *  `[very fast]`) when not on `normal`. We discrete-segment instead
   *  of mapping a numeric slider so the on-wire value stays one of
   *  the documented Gemini tag tokens. */
  audioSpeed: "very_slow" | "normal" | "very_fast";
  modelImage: UploadedRef | null;
  modelImages: UploadedRef[];
  texture: boolean;
  pbr: boolean;
}

export interface StandaloneProjectOption {
  id: string;
  name: string;
  updatedAt: number;
}

/** Per-tool default voice params shared across the four tools.
 *  Picked to match Freepik's default voice studio panel: 1× speed,
 *  Neutral preset, 20% similarity (their displayed default). */
const DEFAULT_VOICE_PARAMS = {
  voice: DEFAULT_VOICE_ID,
  voiceStyle: "",
  voiceStylePreset: "neutral" as const,
  voiceSpeed: 1.0,
  voiceStability: 0.55,
  voiceSimilarity: 0.20,
  voiceStyleAmount: 0.30,
  audioTagsEmotion: [] as string[],
  audioTagsPersonality: [] as string[],
  audioSpeed: "normal" as const,
};

/** Gemini audio-tag catalogue. The string in `tag` is the literal
 *  token Gemini's TTS spec accepts inside `[...]` — keep these in
 *  English even when the script is Thai (Google parses the brackets
 *  before passing the rest of the prompt to the language model).
 *  The Thai sublabel is just UX flavour for our pickers.
 *
 *  Source: https://ai.google.dev/gemini-api/docs/speech-generation
 *  (verified May 2026).
 */
const GEMINI_EMOTION_TAGS: Array<{ tag: string; label: string; sub: string }> = [
  { tag: "whispers", label: "Whispers", sub: "กระซิบ" },
  { tag: "shouting", label: "Shouting", sub: "ตะโกน" },
  { tag: "laughs", label: "Laughs", sub: "หัวเราะ" },
  { tag: "sighs", label: "Sighs", sub: "ถอนหายใจ" },
  { tag: "crying", label: "Crying", sub: "ร้องไห้" },
  { tag: "excited", label: "Excited", sub: "ตื่นเต้น" },
];
const GEMINI_PERSONALITY_TAGS: Array<{ tag: string; label: string; sub: string }> = [
  { tag: "sarcastically", label: "Sarcastic", sub: "ประชด" },
  { tag: "dramatically", label: "Dramatic", sub: "ดราม่า" },
  { tag: "robotically", label: "Robotic", sub: "หุ่นยนต์" },
  { tag: "like a cartoon dog", label: "Cartoon dog", sub: "หมาการ์ตูน" },
  { tag: "like dracula", label: "Dracula", sub: "แดร็กคูล่า" },
  { tag: "calmly", label: "Calm", sub: "ใจเย็น" },
];
const GEMINI_SPEED_OPTIONS: Array<{
  id: "very_slow" | "normal" | "very_fast";
  label: string;
  tag: string | null;
}> = [
  { id: "very_slow", label: "Slow", tag: "very slow" },
  { id: "normal", label: "Normal", tag: null },
  { id: "very_fast", label: "Fast", tag: "very fast" },
];

/** Combine the picker selections into the bracketed prefix Gemini
 *  honours. Empty selections collapse to no prefix at all so a user
 *  who hasn't touched the picker isn't forced into any tone. We
 *  group emotion + personality into a single `[..., ...]` block
 *  (Gemini accepts comma-separated tags) and emit speed as a
 *  separate tag block — that matches the examples in Google's
 *  speech-generation guide. */
function composeGeminiAudioTagPrefix(args: {
  emotion: string[];
  personality: string[];
  speed: "very_slow" | "normal" | "very_fast";
}): string {
  const tags = [...args.emotion, ...args.personality]
    .map((t) => t.trim())
    .filter(Boolean);
  const blocks: string[] = [];
  if (tags.length > 0) blocks.push(`[${tags.join(", ")}]`);
  const speedTag = GEMINI_SPEED_OPTIONS.find((o) => o.id === args.speed)?.tag;
  if (speedTag) blocks.push(`[${speedTag}]`);
  return blocks.join(" ");
}

const INITIAL_FORMS: Record<StandaloneToolKey, StandaloneFormState> = {
  image_gen: {
    model: STANDALONE_TOOLS.image_gen.defaultModel,
    prompt: "",
    styleId: "none",
    aspectRatio: "Auto",
    imageResolution: "1K",
    quality: "medium",
    outputFormat: "png",
    background: "auto",
    imageCount: 1,
    imageRefs: [],
    videoRatio: "Auto",
    videoResolution: "720p",
    videoDuration: 5,
    videoCount: 1,
    videoInputMode: "frames",
    videoWithAudio: false,
    videoStart: null,
    videoEnd: null,
    videoRefImage: null,
    videoRefVideo: null,
    videoCharacterOrientation: "video",
    videoKeepOriginalSound: false,
    videoNegativePrompt: "",
    videoPersonGeneration: "allow_adult",
    videoReturnLastFrame: false,
    videoMultiShot: false,
    videoMultiPrompt: "",
    script: "",
    ...DEFAULT_VOICE_PARAMS,
    modelImage: null,
    modelImages: [],
    texture: true,
    pbr: true,
  },
  video_gen: {
    model: STANDALONE_TOOLS.video_gen.defaultModel,
    prompt: "",
    styleId: "cinematic",
    aspectRatio: "16:9",
    imageResolution: "1K",
    quality: "medium",
    outputFormat: "png",
    background: "auto",
    imageCount: 1,
    imageRefs: [],
    videoRatio: "16:9",
    videoResolution: "720p",
    videoDuration: 5,
    videoCount: 1,
    videoInputMode: "frames",
    videoWithAudio: false,
    videoStart: null,
    videoEnd: null,
    videoRefImage: null,
    videoRefVideo: null,
    videoCharacterOrientation: "video",
    videoKeepOriginalSound: false,
    videoNegativePrompt: "",
    videoPersonGeneration: "allow_adult",
    videoReturnLastFrame: false,
    videoMultiShot: false,
    videoMultiPrompt: "",
    script: "",
    ...DEFAULT_VOICE_PARAMS,
    modelImage: null,
    modelImages: [],
    texture: true,
    pbr: true,
  },
  voice_gen: {
    model: STANDALONE_TOOLS.voice_gen.defaultModel,
    prompt: "",
    styleId: "none",
    aspectRatio: "1:1",
    imageResolution: "1K",
    quality: "medium",
    outputFormat: "png",
    background: "auto",
    imageCount: 1,
    imageRefs: [],
    videoRatio: "16:9",
    videoResolution: "720p",
    videoDuration: 5,
    videoCount: 1,
    videoInputMode: "frames",
    videoWithAudio: false,
    videoStart: null,
    videoEnd: null,
    videoRefImage: null,
    videoRefVideo: null,
    videoCharacterOrientation: "video",
    videoKeepOriginalSound: false,
    videoNegativePrompt: "",
    videoPersonGeneration: "allow_adult",
    videoReturnLastFrame: false,
    videoMultiShot: false,
    videoMultiPrompt: "",
    script: "",
    ...DEFAULT_VOICE_PARAMS,
    modelImage: null,
    modelImages: [],
    texture: true,
    pbr: true,
  },
  image_to_3d: {
    model: STANDALONE_TOOLS.image_to_3d.defaultModel,
    prompt: "",
    styleId: "none",
    aspectRatio: "1:1",
    imageResolution: "1K",
    quality: "medium",
    outputFormat: "png",
    background: "auto",
    imageCount: 1,
    imageRefs: [],
    videoRatio: "16:9",
    videoResolution: "720p",
    videoDuration: 5,
    videoCount: 1,
    videoInputMode: "frames",
    videoWithAudio: false,
    videoStart: null,
    videoEnd: null,
    videoRefImage: null,
    videoRefVideo: null,
    videoCharacterOrientation: "video",
    videoKeepOriginalSound: false,
    videoNegativePrompt: "",
    videoPersonGeneration: "allow_adult",
    videoReturnLastFrame: false,
    videoMultiShot: false,
    videoMultiPrompt: "",
    script: "",
    ...DEFAULT_VOICE_PARAMS,
    modelImage: null,
    modelImages: [],
    texture: true,
    pbr: true,
  },
};

type TranslationFn = ReturnType<typeof useLanguage>["t"];
type TranslationKey = Parameters<TranslationFn>[0];

const STANDALONE_TOOL_TITLE_KEYS = {
  image_gen: "workspace.standalone.tool.image_gen.title",
  video_gen: "workspace.standalone.tool.video_gen.title",
  voice_gen: "workspace.standalone.tool.voice_gen.title",
  image_to_3d: "workspace.standalone.tool.image_to_3d.title",
} as const satisfies Record<StandaloneToolKey, TranslationKey>;

const STANDALONE_TOOL_NAV_KEYS = {
  image_gen: "workspace.standalone.tool.image_gen.nav",
  video_gen: "workspace.standalone.tool.video_gen.nav",
  voice_gen: "workspace.standalone.tool.voice_gen.nav",
  image_to_3d: "workspace.standalone.tool.image_to_3d.nav",
} as const satisfies Record<StandaloneToolKey, TranslationKey>;

const STANDALONE_MODEL_DESCRIPTION_KEYS = {
  "nano-banana-2": "workspace.standalone.model.nano_banana_2.desc",
  "nano-banana-pro": "workspace.standalone.model.nano_banana_pro.desc",
  "seedream-5-0-260128": "workspace.standalone.model.seedream_5_0.desc",
  "seedream-5-0-lite-260128": "workspace.standalone.model.seedream_5_0_lite.desc",
  "seedream-4-5-251128": "workspace.standalone.model.seedream_4_5.desc",
  "gpt-image-2": "workspace.standalone.model.gpt_image_2.desc",
  "kling-v2-6-pro": "workspace.standalone.model.kling_v2_6_pro.desc",
  "kling-v2-6-motion-pro": "workspace.standalone.model.kling_v2_6_motion_pro.desc",
  "kling-v3-pro": "workspace.standalone.model.kling_v3_pro.desc",
  "kling-v3-motion-pro": "workspace.standalone.model.kling_v3_motion_pro.desc",
  "kling-v3-omni": "workspace.standalone.model.kling_v3_omni.desc",
  "seedance-1-5-pro-251215": "workspace.standalone.model.seedance_1_5_pro.desc",
  "seedance-2-0-lite": "workspace.standalone.model.seedance_2_0_lite.desc",
  "seedance-2-0-pro": "workspace.standalone.model.seedance_2_0_pro.desc",
  "elevenlabs-multilingual-v2": "workspace.standalone.model.elevenlabs_multilingual_v2.desc",
  "elevenlabs-turbo-v2-5": "workspace.standalone.model.elevenlabs_turbo_v2_5.desc",
  "gemini-3.1-flash-tts-preview": "workspace.standalone.model.gemini_3_1_flash_tts.desc",
  "gemini-2.5-pro-preview-tts": "workspace.standalone.model.gemini_2_5_pro_tts.desc",
  "google-tts-studio": "workspace.standalone.model.google_tts_studio.desc",
  "tripo3d-p1": "workspace.standalone.model.tripo3d_p1.desc",
  "tripo3d-v3.1": "workspace.standalone.model.tripo3d_v3_1.desc",
  "tripo3d-v3.0": "workspace.standalone.model.tripo3d_v3_0.desc",
  "tripo3d-v2.5": "workspace.standalone.model.tripo3d_v2_5.desc",
  "hyper3d-gen2-260112": "workspace.standalone.model.hyper3d_gen2.desc",
} as const satisfies Record<string, TranslationKey>;

const STYLE_LABEL_KEYS = {
  none: "workspace.standalone.style.none.label",
  cinematic: "workspace.standalone.style.cinematic.label",
  product: "workspace.standalone.style.product.label",
  editorial: "workspace.standalone.style.editorial.label",
  anime: "workspace.standalone.style.anime.label",
  watercolor: "workspace.standalone.style.watercolor.label",
} as const satisfies Record<string, TranslationKey>;

const STYLE_DESCRIPTION_KEYS = {
  none: "workspace.standalone.style.none.desc",
  cinematic: "workspace.standalone.style.cinematic.desc",
  product: "workspace.standalone.style.product.desc",
  editorial: "workspace.standalone.style.editorial.desc",
  anime: "workspace.standalone.style.anime.desc",
  watercolor: "workspace.standalone.style.watercolor.desc",
} as const satisfies Record<string, TranslationKey>;

const STYLE_CHIP_KEYS = {
  none: "workspace.standalone.style.none.chip",
  cinematic: "workspace.standalone.style.cinematic.chip",
  product: "workspace.standalone.style.product.chip",
  editorial: "workspace.standalone.style.editorial.chip",
  anime: "workspace.standalone.style.anime.chip",
  watercolor: "workspace.standalone.style.watercolor.chip",
} as const satisfies Record<string, TranslationKey>;

const OPTION_LABEL_KEYS = {
  Auto: "workspace.standalone.option.auto",
  auto: "workspace.standalone.option.auto",
  low: "workspace.standalone.option.low",
  medium: "workspace.standalone.option.medium",
  high: "workspace.standalone.option.high",
  transparent: "workspace.standalone.option.transparent",
  opaque: "workspace.standalone.option.opaque",
  image: "workspace.standalone.option.image",
  video: "workspace.standalone.option.video",
} as const satisfies Record<string, TranslationKey>;

const STATUS_LABEL_KEYS = {
  queued: "workspace.standalone.status.queued",
  running: "workspace.standalone.status.running",
  completed: "workspace.standalone.status.completed",
  failed: "workspace.standalone.status.failed",
  permanent_failed: "workspace.standalone.status.permanent_failed",
} as const satisfies Record<StandaloneJobRow["status"], TranslationKey>;

function standaloneToolTitle(tool: StandaloneToolKey, t: TranslationFn) {
  return t(STANDALONE_TOOL_TITLE_KEYS[tool]);
}

function standaloneToolNav(tool: StandaloneToolKey, t: TranslationFn) {
  return t(STANDALONE_TOOL_NAV_KEYS[tool]);
}

function standaloneCreateActionTitle(
  tool: StandaloneToolKey,
  language: "en" | "th",
) {
  const labels: Record<StandaloneToolKey, { en: string; th: string }> = {
    image_gen: { en: "Create Image", th: "สร้างรูปภาพ" },
    video_gen: { en: "Create Video", th: "สร้างวิดีโอ" },
    voice_gen: { en: "Create Audio", th: "สร้างเสียง" },
    image_to_3d: { en: "Create 3D", th: "สร้าง 3D" },
  };
  return labels[tool][language];
}

function standaloneCreateButtonLabel(
  tool: StandaloneToolKey,
  language: "en" | "th",
  estimatedCost?: number | null,
) {
  if (
    estimatedCost != null &&
    Number.isFinite(estimatedCost) &&
    estimatedCost > 0
  ) {
    const base = language === "th" ? "สร้าง" : "Generate";
    return `${base} ${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(Math.ceil(estimatedCost))}`;
  }
  if (tool === "image_gen") {
    return language === "th" ? "สร้างฟรี" : "Create for Free";
  }
  return language === "th" ? "สร้าง" : "Generate";
}

function workspaceCostMultiplierForTool(
  tool: StandaloneToolKey,
  model: string,
  workspaceMultiplier: number,
) {
  // Gemini TTS proxies through the legacy text-to-speech edge function.
  // That function owns its own credit deduction and does not apply the
  // workspace infrastructure multiplier, so keep the preview in sync.
  if (tool === "voice_gen" && model.startsWith("gemini-")) return 1;
  return workspaceMultiplier;
}

function standaloneModelDescription(
  modelId: string,
  fallback: string,
  t: TranslationFn,
) {
  const key =
    STANDALONE_MODEL_DESCRIPTION_KEYS[
      modelId as keyof typeof STANDALONE_MODEL_DESCRIPTION_KEYS
    ];
  return key ? t(key) : fallback;
}

function standaloneStyleLabel(styleId: string, fallback: string, t: TranslationFn) {
  const key = STYLE_LABEL_KEYS[styleId as keyof typeof STYLE_LABEL_KEYS];
  return key ? t(key) : fallback;
}

function standaloneStyleDescription(
  styleId: string,
  fallback: string,
  t: TranslationFn,
) {
  const key =
    STYLE_DESCRIPTION_KEYS[styleId as keyof typeof STYLE_DESCRIPTION_KEYS];
  return key ? t(key) : fallback;
}

function standaloneStyleChip(styleId: string, fallback: string, t: TranslationFn) {
  const key = STYLE_CHIP_KEYS[styleId as keyof typeof STYLE_CHIP_KEYS];
  return key ? t(key) : fallback;
}

function standaloneOptionLabel(option: string, t: TranslationFn) {
  const key = OPTION_LABEL_KEYS[option as keyof typeof OPTION_LABEL_KEYS];
  return key ? t(key) : option;
}

type StandaloneInlineLabelKey =
  | "addVisualReferences"
  | "audio"
  | "aspect"
  | "background"
  | "duration"
  | "followImage"
  | "followVideo"
  | "format"
  | "instructions"
  | "keep"
  | "lastFrame"
  | "liveVoices"
  | "multiShot"
  | "multiShots"
  | "mute"
  | "negativePrompt"
  | "off"
  | "on"
  | "originalSound"
  | "people"
  | "quality"
  | "reference"
  | "resolution"
  | "return"
  | "shotListJson"
  | "startEnd"
  | "startFrame"
  | "style"
  | "texture"
  | "textToVideo"
  | "frameToVideo"
  | "videoAvoidPlaceholder"
  | "videoPromptPlaceholder"
  | "adultsOnly"
  | "allowChildren"
  | "director"
  | "addStartFrame"
  | "addEndFrame"
  | "history";

const STANDALONE_INLINE_LABELS: Record<
  StandaloneInlineLabelKey,
  Record<"en" | "th", string>
> = {
  addVisualReferences: { en: "Add visual references", th: "เพิ่มภาพอ้างอิง" },
  audio: { en: "Audio", th: "เสียง" },
  aspect: { en: "Aspect", th: "สัดส่วน" },
  background: { en: "Background", th: "พื้นหลัง" },
  duration: { en: "Duration", th: "ความยาว" },
  followImage: { en: "Follow Image", th: "ตามภาพ" },
  followVideo: { en: "Follow Video", th: "ตามวิดีโอ" },
  format: { en: "Format", th: "รูปแบบไฟล์" },
  instructions: { en: "Instructions", th: "คำสั่ง" },
  keep: { en: "Keep", th: "คงไว้" },
  lastFrame: { en: "Last frame", th: "เฟรมสุดท้าย" },
  liveVoices: { en: "Live voices", th: "เสียงจากบัญชี" },
  multiShot: { en: "Multi-shot", th: "หลายช็อต" },
  multiShots: { en: "Multi-shots", th: "หลายช็อต" },
  mute: { en: "Mute", th: "ปิดเสียง" },
  negativePrompt: { en: "Negative prompt", th: "คำสั่งที่ไม่ต้องการ" },
  off: { en: "Off", th: "ปิด" },
  on: { en: "On", th: "เปิด" },
  originalSound: { en: "Original sound", th: "เสียงต้นฉบับ" },
  people: { en: "People", th: "บุคคล" },
  quality: { en: "Quality", th: "คุณภาพ" },
  reference: { en: "Reference", th: "อ้างอิง" },
  resolution: { en: "Resolution", th: "ความละเอียด" },
  return: { en: "Return", th: "ส่งคืน" },
  shotListJson: { en: "Shot list (JSON)", th: "รายการช็อต (JSON)" },
  startEnd: { en: "Start/End", th: "เริ่ม/จบ" },
  startFrame: { en: "Start Frame", th: "เฟรมเริ่มต้น" },
  style: { en: "Style", th: "สไตล์" },
  texture: { en: "Texture", th: "พื้นผิว" },
  textToVideo: { en: "Text to Video", th: "ข้อความเป็นวิดีโอ" },
  frameToVideo: { en: "Frame to Video", th: "เฟรมเป็นวิดีโอ" },
  videoAvoidPlaceholder: {
    en: "What should the video avoid?",
    th: "อยากให้วิดีโอหลีกเลี่ยงอะไร?",
  },
  videoPromptPlaceholder: {
    en: "Describe scene transitions, camera movement trajectories, or character actions with text to precisely control the entire video.",
    th: "อธิบายฉาก การเคลื่อนกล้อง หรือการกระทำของตัวละคร เพื่อควบคุมวิดีโอให้ตรงตามต้องการ",
  },
  adultsOnly: { en: "Adults only", th: "ผู้ใหญ่เท่านั้น" },
  allowChildren: { en: "Allow children", th: "อนุญาตเด็ก" },
  director: { en: "Director", th: "โหมดกำกับ" },
  addStartFrame: { en: "Add a start frame", th: "เพิ่มเฟรมเริ่มต้น" },
  addEndFrame: { en: "Add an end frame", th: "เพิ่มเฟรมจบ" },
  history: { en: "History", th: "ประวัติ" },
};

function standaloneInlineLabel(
  key: StandaloneInlineLabelKey,
  language: "en" | "th",
) {
  return STANDALONE_INLINE_LABELS[key][language];
}

function standaloneStatusLabel(status: StandaloneJobRow["status"], t: TranslationFn) {
  return t(STATUS_LABEL_KEYS[status]);
}

function isGptImageModel(model: string) {
  return model === "gpt-image-2" || model === "replicate-gpt-image-2";
}

function isDirectGptImageModel(model: string) {
  return model === "gpt-image-2";
}

function isReplicateGptImageModel(model: string) {
  return model === "replicate-gpt-image-2";
}

function isBananaProImageModel(model: string) {
  return model === "nano-banana-pro" || model === "replicate-nano-banana-pro";
}

function isDirectBanana2ImageModel(model: string) {
  return model === "nano-banana-2";
}

function isReplicateBanana2ImageModel(model: string) {
  return model === "replicate-nano-banana-2";
}

function imageAspectOptionsForModel(model: string) {
  if (isReplicateGptImageModel(model)) return ["1:1", "3:2", "2:3"];
  if (isDirectGptImageModel(model)) return GPT_IMAGE_ASPECT_RATIOS;
  return ["Auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
}

function imageResolutionOptionsForModel(model: string, aspectRatio: string) {
  if (isDirectGptImageModel(model)) {
    return gptImageResolutionsFor(aspectRatio);
  }
  if (isReplicateGptImageModel(model)) {
    return [];
  }
  if (isSeedreamImageModel(model)) {
    return ["2K", "3K"];
  }
  if (isBananaProImageModel(model) || isDirectBanana2ImageModel(model)) {
    return ["1K", "2K", "4K"];
  }
  if (isReplicateBanana2ImageModel(model)) {
    return [];
  }
  return ["1K", "2K"];
}

function imageResolutionOptionsFor(form: StandaloneFormState) {
  return imageResolutionOptionsForModel(form.model, form.aspectRatio);
}

export default function StandaloneGenerator({
  activeTool,
  onToolChange,
  onOpenSidebar,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}: {
  activeTool: StandaloneToolKey;
  onToolChange: (tool: StandaloneToolKey) => void;
  onOpenSidebar: () => void;
  projects: StandaloneProjectOption[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onDeleteProject?: (projectId: string) => void;
}) {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();
  const { credits, loading: creditsLoading } = useCredits();
  const { data: creditCosts = [], isLoading: creditCostsLoading } =
    useNodeCreditCosts();
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
  const [forms, setForms] =
    useState<Record<StandaloneToolKey, StandaloneFormState>>(INITIAL_FORMS);
  const [running, setRunning] = useState(false);
  const [autoPrompting, setAutoPrompting] = useState(false);
  // Synchronous double-click guard. `setRunning` is async — between
  // a rapid second click and React committing the disabled-button
  // re-render, the second click would fly through validation and
  // enqueue a duplicate paid job. The ref flips synchronously so the
  // second invocation bails before any credits get charged.
  const runInFlightRef = useRef(false);
  const [uploading, setUploading] = useState<UploadSlot | null>(null);
  const [uploadAccept, setUploadAccept] = useState("image/*");
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const [insufficientRequiredCredits, setInsufficientRequiredCredits] =
    useState<number | undefined>();
  const [deleteReferenceTarget, setDeleteReferenceTarget] =
    useState<DeletableReference | null>(null);
  const [deletingReference, setDeletingReference] = useState(false);

  const activeDef = STANDALONE_TOOLS[activeTool];
  const form = forms[activeTool];
  const selectedModel =
    activeDef.models.find((model) => model.id === form.model) ??
    activeDef.models[0] ??
    null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSlotRef = useRef<UploadSlot>("image-ref");
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ??
    projects[0] ??
    null;
  const imageSettings =
    activeTool === "image_gen"
      ? {
          isGpt: isGptImageModel(form.model),
          isSeedream: isSeedreamImageModel(form.model),
        }
      : null;

  const jobsQuery = useStandaloneJobs(user?.id, activeProject?.id);
  const projectReferencesQuery = useProjectReferenceAssets(user?.id, activeProject?.id);
  const refetchJobs = jobsQuery.refetch;
  const hasActiveJobs = (jobsQuery.data ?? []).some((job) =>
    ["queued", "running"].includes(job.status),
  );
  const activeJobs = useMemo(
    () =>
      (jobsQuery.data ?? []).filter((job) =>
        ["queued", "running"].includes(job.status),
      ),
    [jobsQuery.data],
  );
  const activeJobIdsKey = activeJobs.map((job) => job.id).join("|");
  // Per-tool active-job count drives the Generate button's disabled
  // state. The previous gating only used the local `running` flag,
  // which we cleared as soon as the enqueue API returned (~1-2s)
  // instead of waiting for the actual job to finish (~30-60s) — so
  // the spinner flashed off, the button re-enabled, and a second
  // click queued a duplicate paid run while the first was still
  // generating. Filter by current tool's nodeType so a video gen
  // running in the background doesn't lock the image button (and
  // vice versa).
  const activeJobsForCurrentTool = useMemo(() => {
    const nodeType = STANDALONE_TOOLS[activeTool]?.nodeType;
    if (!nodeType) return 0;
    return activeJobs.filter((job) => job.node_type === nodeType).length;
  }, [activeJobs, activeTool]);

  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => {
      void refetchJobs();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs, refetchJobs]);

  useEffect(() => {
    if (!user?.id || !activeProject?.id) return;
    const channel = supabase
      .channel(`standalone-jobs-${user.id}-${activeProject.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_generation_jobs",
          filter: `project_id=eq.${activeProject.id}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["standalone-generation-jobs", user.id, activeProject.id],
          });
          void queryClient.invalidateQueries({
            queryKey: ["standalone-project-reference-assets", user.id, activeProject.id],
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeProject?.id, queryClient, user?.id]);

  useEffect(() => {
    if (!activeJobIdsKey) return;
    let cancelled = false;
    let inFlight = false;

    const pollActiveJobs = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        await Promise.all(
          activeJobs.map((job) =>
            supabase.functions.invoke(RUN_EDGE_FUNCTION, {
              body: { action: "poll_workspace_job", job_id: job.id },
            }),
          ),
        );
      } catch (err) {
        console.info(
          "[standalone-generation] background poll skipped",
          err instanceof Error ? err.message : String(err),
        );
      } finally {
        inFlight = false;
        if (!cancelled) void refetchJobs();
      }
    };

    void pollActiveJobs();
    const timer = window.setInterval(() => void pollActiveJobs(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeJobIdsKey, activeJobs, refetchJobs]);

  const updateForm = (patch: Partial<StandaloneFormState>) => {
    setForms((prev) => {
      const next = { ...prev[activeTool], ...patch };
      if (activeTool === "video_gen" && isVeoVideoModel(next.model)) {
        if (patch.videoResolution === "1080p" && next.videoDuration !== 8) {
          next.videoDuration = 8;
        } else if (
          patch.videoDuration != null &&
          Number(patch.videoDuration) !== 8 &&
          next.videoResolution === "1080p"
        ) {
          next.videoResolution = "720p";
        } else if (next.videoResolution === "1080p" && next.videoDuration !== 8) {
          next.videoResolution = "720p";
        }
      }
      return {
        ...prev,
        [activeTool]: next,
      };
    });
  };

  const setToolModel = (
    model: string,
    overridePatch: Partial<StandaloneFormState> = {},
  ) => {
    const nextPatch: Partial<StandaloneFormState> = { model };
    if (activeTool === "image_gen") {
      if (isGptImageModel(model)) {
        const aspectOptions = imageAspectOptionsForModel(model);
        nextPatch.aspectRatio = aspectOptions.includes(form.aspectRatio)
          ? form.aspectRatio
          : (aspectOptions[0] ?? "1:1");
        const resolutions = imageResolutionOptionsForModel(
          model,
          String(nextPatch.aspectRatio ?? form.aspectRatio),
        );
        if (resolutions.length > 0) {
          nextPatch.imageResolution = resolutions.includes(form.imageResolution)
            ? form.imageResolution
            : (resolutions[0] ?? "1K");
        }
      } else if (isSeedreamImageModel(model)) {
        nextPatch.imageResolution = ["2K", "3K"].includes(form.imageResolution)
          ? form.imageResolution
          : "2K";
      } else {
        nextPatch.aspectRatio = form.aspectRatio || "Auto";
        const resolutions = imageResolutionOptionsForModel(
          model,
          String(nextPatch.aspectRatio ?? form.aspectRatio),
        );
        if (resolutions.length > 0) {
          nextPatch.imageResolution =
            isBananaProImageModel(model) ? "2K" : (resolutions[0] ?? "1K");
        }
      }
      nextPatch.imageRefs = form.imageRefs.slice(0, maxImageRefsForModel(model));
    }
    if (activeTool === "video_gen") {
      const isSeedance = isSeedanceVideoModel(model);
      const supportsFrames = videoSupportsStartEndFrames(model);
      const supportsEnd = videoSupportsEndFrame(model);
      const supportsReference =
        videoSupportsReferenceImage(model) || videoSupportsReferenceVideo(model);
      if (isSeedance && form.videoRatio === "Auto") {
        nextPatch.videoRatio = "16:9";
      }
      if (isVeoVideoModel(model) && !["16:9", "9:16"].includes(form.videoRatio)) {
        nextPatch.videoRatio = "16:9";
      } else if (!isSeedance && !["Auto", "16:9", "9:16", "1:1"].includes(form.videoRatio)) {
        nextPatch.videoRatio = "Auto";
      }
      const durations = videoDurationsForModel(model);
      if (!durations.includes(form.videoDuration)) {
        nextPatch.videoDuration = durations.includes(5)
          ? 5
          : (durations[0] ?? 5);
      }
      const resolutionOptions = videoResolutionOptionsForModel(model);
      if (resolutionOptions.length > 0 && !resolutionOptions.includes(form.videoResolution)) {
        nextPatch.videoResolution = resolutionOptions.includes("1080p")
          ? "1080p"
          : (resolutionOptions[0] ?? "720p");
      }
      if (!supportsFrames) {
        nextPatch.videoStart = null;
      }
      if (!supportsFrames || !supportsEnd) {
        nextPatch.videoEnd = null;
      }
      if (!videoSupportsReferenceImage(model)) nextPatch.videoRefImage = null;
      if (!videoSupportsReferenceVideo(model)) nextPatch.videoRefVideo = null;
      if (!supportsFrames && supportsReference) {
        nextPatch.videoInputMode = "reference";
      } else if (!supportsReference && form.videoInputMode === "reference") {
        nextPatch.videoInputMode = "frames";
      }
      if (!model.startsWith("kling") && !model.startsWith("replicate-kling")) nextPatch.videoNegativePrompt = "";
      if (!isVeoVideoModel(model)) nextPatch.videoPersonGeneration = "allow_adult";
      if (!isSeedance) nextPatch.videoReturnLastFrame = false;
      if (!isVeoVideoModel(model) && isSeedance && !seedanceVideoSupportsAudio(model)) nextPatch.videoWithAudio = false;
      if (!videoSupportsMultiShot(model)) {
        nextPatch.videoMultiShot = false;
        nextPatch.videoMultiPrompt = "";
      }
    }
    if (activeTool === "image_to_3d") {
      const nextRefs = threeDReferencesForForm(form).slice(0, max3dRefsForModel(model));
      nextPatch.modelImages = nextRefs;
      nextPatch.modelImage = nextRefs[0] ?? null;
    }
    updateForm({ ...nextPatch, ...overridePatch });
  };

  const packageDiscountPercent = Math.max(
    0,
    Math.min(100, Number(credits?.package_discount_percent ?? 0) || 0),
  );
  const packageDiscountLabel = credits?.package_discount_label ?? null;

  const estimatedCostQuote = useMemo(() => {
    if (creditCostsLoading) return null;
    const params = buildCurrentParams(activeTool, form);
    if (!params) return null;
    const quote = calculateNodeCostQuote({
      schemaKey: activeDef.nodeType,
      params,
      creditCosts,
    });
    if (!quote) return null;
    const runCount =
      activeTool === "image_gen"
        ? Math.min(4, Math.max(1, Number(form.imageCount) || 1))
        : activeTool === "video_gen"
          ? Math.min(4, Math.max(1, Number(form.videoCount) || 1))
        : 1;
    if (quote.baseCost <= 0) {
      return {
        fullCost: 0,
        modelCost: 0,
        finalCost: 0,
        modelDiscountPercent: 0,
        packageDiscountPercent,
        packageDiscountLabel,
        totalDiscountPercent: 0,
      };
    }
    const multiplier = workspaceCostMultiplierForTool(
      activeTool,
      form.model,
      workspaceCreditMultiplier,
    );
    const fullRunCost = Math.max(1, Math.ceil(quote.baseCost * multiplier));
    const modelRunCost = applyNodeCostDiscount(fullRunCost, quote.discountPercent);
    const finalRunCost = applyPackageCostDiscount(modelRunCost, packageDiscountPercent);
    const fullCost = fullRunCost * runCount;
    const modelCost = modelRunCost * runCount;
    const finalCost = finalRunCost * runCount;
    return {
      fullCost,
      modelCost,
      finalCost,
      modelDiscountPercent: quote.discountPercent,
      packageDiscountPercent,
      packageDiscountLabel,
      totalDiscountPercent: effectiveNodeDiscountPercent(fullCost, finalCost),
    };
  }, [
    activeDef.nodeType,
    activeTool,
    creditCosts,
    creditCostsLoading,
    packageDiscountLabel,
    packageDiscountPercent,
    form,
    workspaceCreditMultiplier,
  ]);
  const estimatedCost = estimatedCostQuote?.finalCost ?? null;

  const openUpload = (slot: UploadSlot) => {
    pendingSlotRef.current = slot;
    const accept = uploadAcceptForSlot(slot);
    setUploadAccept(accept);
    if (fileInputRef.current) fileInputRef.current.accept = accept;
    fileInputRef.current?.click();
  };

  const panelBottom =
    activeTool === "video_gen"
      ? "video"
      : activeTool === "image_to_3d"
        ? "3d"
        : activeTool === "voice_gen"
          ? "audio"
          : "image";

  const videoSupportsFrames =
    activeTool === "video_gen" && videoSupportsStartEndFrames(form.model);
  const videoSupportsEnd =
    activeTool === "video_gen" && videoSupportsEndFrame(form.model);
  const videoSupportsReferenceMode =
    activeTool === "video_gen" &&
    (videoSupportsReferenceImage(form.model) || videoSupportsReferenceVideo(form.model));
  const videoPanelMode: StandaloneVideoInputMode =
    activeTool !== "video_gen"
      ? "frames"
      : form.videoInputMode === "reference" && videoSupportsReferenceMode
        ? "reference"
        : videoSupportsFrames
          ? "frames"
          : videoSupportsReferenceMode
            ? "reference"
            : "frames";
  const updateVideoInputMode = (videoInputMode: StandaloneVideoInputMode) => {
    if (activeTool === "video_gen" && videoInputMode === "frames" && !videoSupportsFrames) {
      return;
    }
    if (activeTool === "video_gen" && videoInputMode === "reference" && !videoSupportsReferenceMode) {
      return;
    }
    updateForm({ videoInputMode });
  };

  const panelPrompt = activeTool === "voice_gen" ? form.script : form.prompt;
  const updatePanelPrompt = (nextValue: string) => {
    if (activeTool === "voice_gen") {
      updateForm({ script: nextValue });
      return;
    }
    updateForm({ prompt: nextValue });
  };

  const panelReferences =
    activeTool === "image_gen"
      ? form.imageRefs
      : activeTool === "video_gen"
        ? videoPanelMode === "reference"
          ? [form.videoRefImage, form.videoRefVideo].filter(Boolean)
          : [form.videoStart, videoSupportsEnd ? form.videoEnd : null].filter(Boolean)
        : activeTool === "image_to_3d"
          ? threeDReferencesForForm(form)
          : [];

  const panelMaxReferences =
    activeTool === "image_gen"
      ? maxImageRefsForModel(form.model)
      : activeTool === "video_gen"
        ? videoPanelMode === "reference"
          ? Number(videoSupportsReferenceImage(form.model)) +
            Number(videoSupportsReferenceVideo(form.model))
          : videoSupportsEnd
            ? 2
            : videoSupportsFrames
              ? 1
              : 0
        : activeTool === "image_to_3d"
          ? max3dRefsForModel(form.model)
          : 0;

  const getPanelReferenceSlot = (): UploadSlot | null => {
    if (activeTool === "image_gen") {
      return "image-ref";
    }
    if (activeTool === "image_to_3d") {
      return "model-image";
    }
    if (activeTool === "video_gen") {
      if (videoPanelMode === "frames") {
        if (!videoSupportsFrames) return null;
        if (!form.videoStart) return "video-start";
        if (videoSupportsEnd && !form.videoEnd) return "video-end";
        return "video-start";
      }
      if (videoPanelMode === "reference") {
        if (videoSupportsReferenceImage(form.model) && !form.videoRefImage) {
          return "video-ref-image";
        }
        if (videoSupportsReferenceVideo(form.model) && !form.videoRefVideo) {
          return "video-ref-video";
        }
        if (videoSupportsReferenceImage(form.model)) return "video-ref-image";
        if (videoSupportsReferenceVideo(form.model)) return "video-ref-video";
      }
    }
    return null;
  };

  const openPanelReferenceUpload = () => {
    const slot = getPanelReferenceSlot();
    if (slot) {
      openUpload(slot);
    }
  };

  const applyUploadedReference = (slot: UploadSlot, uploaded: UploadedRef) => {
    setForms((prev) => {
      const current = prev[activeTool];
      const patch: Partial<StandaloneFormState> = {};
      if (slot === "image-ref") {
        const maxRefs = maxImageRefsForModel(current.model);
        if (current.imageRefs.some((ref) => standaloneReferencesMatch(ref, uploaded))) {
          return prev;
        }
        patch.imageRefs = [
          ...current.imageRefs,
          { ...uploaded, role: uploaded.role ?? "general" },
        ].slice(0, maxRefs);
      } else if (slot === "image-character") {
        const maxRefs = maxImageRefsForModel(current.model);
        const withoutPrevCharacter = current.imageRefs.filter(
          (ref) => ref.role !== "character",
        );
        patch.imageRefs = [
          { ...uploaded, role: "character" },
          ...withoutPrevCharacter,
        ].slice(0, maxRefs);
      } else if (slot === "video-start") {
        patch.videoStart = uploaded;
      } else if (slot === "video-end") {
        patch.videoEnd = uploaded;
      } else if (slot === "video-ref-image") {
        patch.videoRefImage = uploaded;
      } else if (slot === "video-ref-video") {
        patch.videoRefVideo = uploaded;
      } else if (slot === "model-image") {
        const maxRefs = max3dRefsForModel(current.model);
        const existingRefs = threeDReferencesForForm(current);
        if (existingRefs.some((ref) => standaloneReferencesMatch(ref, uploaded))) {
          return prev;
        }
        const nextRefs = [...existingRefs, uploaded].slice(0, maxRefs);
        patch.modelImages = nextRefs;
        patch.modelImage = nextRefs[0] ?? null;
      } else {
        patch.modelImage = uploaded;
      }
      return {
        ...prev,
        [activeTool]: { ...current, ...patch },
      };
    });
  };

  const uploadPanelReferenceFiles = async (
    files: File[],
    slotOverride?: UploadSlot,
  ) => {
    if (!activeProject?.id) {
      toast.error(t("workspace.toast.create_project_first_upload"));
      return;
    }
    const slot = slotOverride ?? getPanelReferenceSlot();
    if (!slot) return;
    const candidates =
      activeTool === "image_gen" || activeTool === "image_to_3d"
        ? files.slice(0, Math.max(0, panelMaxReferences - panelReferences.length))
        : files.slice(0, 1);
    if (candidates.length === 0) return;

    setUploading(slot);
    try {
      for (const file of candidates) {
        const needsVideo = slot === "video-ref-video";
        const isValidType = needsVideo
          ? file.type.startsWith("video/")
          : file.type.startsWith("image/");
        if (!isValidType) {
          toast.error(needsVideo ? t("workspace.toast.upload_video_ref") : t("workspace.toast.upload_image_ref"));
          continue;
        }
        let durationSec: number | null = null;
        if (
          needsVideo &&
          activeTool === "video_gen" &&
          isSeedance20VideoModel(form.model)
        ) {
          durationSec = await readVideoFileDuration(file);
          if (durationSec == null) {
            toast.error(unreadableSeedanceReferenceVideoMessage());
            continue;
          }
          if (!isSeedanceReferenceVideoDurationValid(durationSec)) {
            toast.error(seedanceReferenceVideoDurationMessage(durationSec));
            continue;
          }
        }
        const uploaded = await uploadReference(file, user?.id, activeProject.id);
        applyUploadedReference(slot, {
          ...uploaded,
          durationSec: durationSec ?? uploaded.durationSec,
        });
      }
      toast.success(t("workspace.toast.reference_uploaded"));
    } catch (err) {
      toast.error(friendlyError(err, language === "th" ? "th" : "en"));
    } finally {
      setUploading(null);
    }
  };

  const selectPanelReferenceAsset = async (
    reference: PanelReferenceAsset,
    slotOverride?: UploadSlot,
  ) => {
    const slot = slotOverride ?? getPanelReferenceSlot();
    if (!slot) return;
    const referenceMime = reference.mime ?? "image/jpeg";
    if (slot === "video-ref-video" && !referenceMime.startsWith("video/")) {
      toast.error(t("workspace.toast.upload_video_ref"));
      return;
    }
    if (slot !== "video-ref-video" && referenceMime.startsWith("video/")) {
      toast.error(t("workspace.toast.upload_image_ref"));
      return;
    }
    let durationSec = reference.durationSec;
    if (
      slot === "video-ref-video" &&
      activeTool === "video_gen" &&
      isSeedance20VideoModel(form.model)
    ) {
      durationSec = durationSec ?? (await readVideoUrlDuration(reference.url)) ?? undefined;
      if (durationSec == null) {
        toast.error(unreadableSeedanceReferenceVideoMessage());
        return;
      }
      if (!isSeedanceReferenceVideoDurationValid(durationSec)) {
        toast.error(seedanceReferenceVideoDurationMessage(durationSec));
        return;
      }
    }
    applyUploadedReference(slot, {
      id: reference.id,
      name: reference.name ?? "asset-reference",
      url: reference.url,
      mime: referenceMime,
      source: reference.source,
      assetId: reference.assetId,
      storageBucket: reference.storageBucket,
      storagePath: reference.storagePath,
      durationSec,
    });
  };

  const uploadFrameHistoryFiles = async (
    slot: "video-start" | "video-end",
    files: File[],
  ) => {
    if (!activeProject?.id) {
      toast.error(t("workspace.toast.create_project_first_upload"));
      return;
    }
    const file = files.find((candidate) => candidate.type.startsWith("image/"));
    if (!file) {
      toast.error(t("workspace.toast.upload_image_ref"));
      return;
    }

    setUploading(slot);
    try {
      const uploaded = await uploadReference(file, user?.id, activeProject.id);
      applyUploadedReference(slot, uploaded);
      toast.success(t("workspace.toast.reference_uploaded"));
    } catch (err) {
      toast.error(friendlyError(err, language === "th" ? "th" : "en"));
    } finally {
      setUploading(null);
    }
  };

  const selectFrameHistoryAsset = (
    slot: "video-start" | "video-end",
    reference: {
      id: string;
      url: string;
      mime?: string;
      name?: string;
      source?: "generation" | "user_asset" | "upload";
      assetId?: string;
      storageBucket?: "ai-media" | "user_assets";
      storagePath?: string;
    },
  ) => {
    const referenceMime = reference.mime ?? "image/jpeg";
    if (referenceMime.startsWith("video/")) {
      toast.error(t("workspace.toast.upload_image_ref"));
      return;
    }
    applyUploadedReference(slot, {
      id: reference.id,
      name: reference.name ?? "asset-reference",
      url: reference.url,
      mime: referenceMime,
      source: reference.source,
      assetId: reference.assetId,
      storageBucket: reference.storageBucket,
      storagePath: reference.storagePath,
    });
  };

  const removePanelReference = (id: string) => {
    setForms((prev) => {
      const current = prev[activeTool];
      const patch: Partial<StandaloneFormState> = {};
      if (activeTool === "image_gen") {
        patch.imageRefs = current.imageRefs.filter((ref) => ref.id !== id);
      } else if (activeTool === "video_gen") {
        if (current.videoStart?.id === id) patch.videoStart = null;
        if (current.videoEnd?.id === id) patch.videoEnd = null;
        if (current.videoRefImage?.id === id) patch.videoRefImage = null;
        if (current.videoRefVideo?.id === id) patch.videoRefVideo = null;
      } else if (activeTool === "image_to_3d") {
        const nextRefs = threeDReferencesForForm(current).filter((ref) => ref.id !== id);
        patch.modelImages = nextRefs;
        patch.modelImage = nextRefs[0] ?? null;
      }
      return {
        ...prev,
        [activeTool]: { ...current, ...patch },
      };
    });
  };

  const deletePanelReferenceAsset = (reference: DeletableReference) => {
    setDeleteReferenceTarget(reference);
  };

  const deleteStandaloneResult = (job: StandaloneJobRow) => {
    const result = job.result;
    const outputs = result?.outputs ?? {};
    const deleteUrl = firstText(
      result?.url,
      getStandaloneModelUrl(result),
      getStandalonePosterUrl(result, getStandaloneModelUrl(result)),
      outputs.image_url,
      outputs.video_url,
      outputs.audio_url,
      outputs.output_image,
      outputs.output_video,
      outputs.preview_image,
      outputs.rendered_image,
    );
    const params = job.request?.params ?? {};
    deletePanelReferenceAsset({
      id: `job-${job.id}`,
      source: "generation",
      assetId: job.id,
      url: deleteUrl,
      name: String(params.nodeName ?? params.prompt ?? job.model ?? "generation"),
    });
  };

  const confirmDeletePanelReferenceAsset = async () => {
    const reference = deleteReferenceTarget;
    if (!user?.id) return;

    setDeletingReference(true);
    try {
      const source = reference.source ?? (reference.id.startsWith("job-") ? "generation" : "user_asset");
      const assetId =
        reference.assetId ??
        (reference.id.startsWith("job-") || reference.id.startsWith("user-asset-")
          ? reference.id.replace(/^job-/, "").replace(/^user-asset-/, "")
          : reference.id);

      const { data, error } = await supabase.functions.invoke(RUN_EDGE_FUNCTION, {
        body: {
          action: "delete_workspace_asset",
          asset_source: source,
          asset_id: assetId,
          job_id: source === "generation" ? assetId : undefined,
          storage_bucket: reference.storageBucket,
          storage_path: reference.storagePath,
          url: reference.url,
        },
      });
      if (error) throw error;
      const result = (data ?? {}) as { error?: string };
      if (result.error) throw new Error(result.error);

      removePanelReference(reference.id);
      queryClient.setQueryData<UploadedRef[]>(
        ["standalone-project-reference-assets", user.id, activeProject?.id],
        (items) =>
          (items ?? []).filter(
            (item) => item.id !== reference.id && item.assetId !== assetId,
          ),
      );
      queryClient.setQueryData<StandaloneJobRow[]>(
        ["standalone-generation-jobs", user.id, activeProject?.id],
        (items) => (items ?? []).filter((item) => item.id !== assetId),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["standalone-project-reference-assets", user.id, activeProject?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["standalone-generation-jobs", user.id, activeProject?.id],
        }),
      ]);
      setDeleteReferenceTarget(null);
      toast.success(language === "th" ? "ลบไฟล์แล้ว" : "Asset deleted");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(
        language === "th"
          ? `ลบไฟล์ไม่สำเร็จ: ${message}`
          : `Could not delete asset: ${message}`,
      );
    } finally {
      setDeletingReference(false);
    }
  };

  const panelPromptLabel =
    activeTool === "voice_gen"
      ? t("workspace.standalone.script")
      : activeTool === "video_gen"
        ? t("workspace.standalone.describe_video")
        : activeTool === "image_to_3d"
          ? t("workspace.standalone.reference_image")
          : t("workspace.standalone.describe_image");

  const panelPromptPlaceholder =
    activeTool === "voice_gen"
      ? t("workspace.standalone.script_placeholder")
      : activeTool === "video_gen"
        ? t("workspace.standalone.describe_video")
        : activeTool === "image_to_3d"
          ? t("workspace.standalone.validation.model_image")
          : t("workspace.standalone.describe_image");

  const panelReferenceTitle =
    activeTool === "image_to_3d"
      ? t("workspace.standalone.reference_image")
      : activeTool === "video_gen"
        ? t("workspace.standalone.reference_image")
        : t("workspace.standalone.references");

  const panelReferenceAssets = useMemo(() => {
    const usesDedicatedMotionSlots =
      activeTool === "video_gen" &&
      videoPanelMode === "reference" &&
      isKlingMotionVideoModel(form.model);
    const wantsVideoAssets =
      activeTool === "video_gen" &&
      videoPanelMode === "reference" &&
      videoSupportsReferenceVideo(form.model) &&
      (!videoSupportsReferenceImage(form.model) || !!form.videoRefImage);
    return mergeReferenceOptions([
      ...(jobsQuery.data ?? []).map(referenceFromGenerationJob),
      ...(projectReferencesQuery.data ?? []),
    ])
      .filter((ref) => {
        if (usesDedicatedMotionSlots) {
          return ref.mime.startsWith("image/") || ref.mime.startsWith("video/");
        }
        return wantsVideoAssets
          ? ref.mime.startsWith("video/")
          : ref.mime.startsWith("image/");
      })
      .slice(0, 120);
  }, [
    activeTool,
    form.model,
    form.videoRefImage,
    jobsQuery.data,
    projectReferencesQuery.data,
    videoPanelMode,
  ]);

  const panelMentionOptions = useMemo(() => {
    if (activeTool !== "image_gen" && activeTool !== "video_gen") return [];
    return mergeReferenceOptions(panelReferences, 16);
  }, [activeTool, panelReferences]);
  const autoPromptTitle = standaloneAutoPromptTitle(language);
  const autoPromptDisabled =
    running || !!uploading || activeJobsForCurrentTool > 0 || !activeProject;
  const runAutoPrompt = async () => {
    if (autoPrompting || autoPromptDisabled) return;

    const source = panelPrompt.trim();
    const referenceOptions = panelMentionOptions;
    if (!source && referenceOptions.length === 0) {
      toast.info(
        language === "th"
          ? "พิมพ์ไอเดียหรือใส่รูป/วิดีโออ้างอิงก่อนใช้ Auto Prompt"
          : "Add a rough idea or media reference before using Auto Prompt.",
      );
      return;
    }

    setAutoPrompting(true);
    try {
      const userMessage = buildStandaloneAutoPromptUserMessage({
        prompt: source,
        tool: activeTool,
        toolLabel: standaloneCreateActionTitle(activeTool, language),
        modelLabel: selectedModel?.label ?? form.model,
        references: referenceOptions,
        language,
      });
      const { data: result, error } = await supabase.functions.invoke(
        AUTO_PROMPT_EDGE_FUNCTION,
        {
          body: {
            model: AUTO_PROMPT_MODEL,
            system_prompt: AUTO_PROMPT_SYSTEM_PROMPT,
            messages: [{ role: "user", content: userMessage }],
            canvas_context: {
              project_id: activeProject?.id ?? null,
              project_name: activeProject?.name ?? null,
              workspace_id: null,
              canvas_id: activeProject
                ? standaloneCanvasId(activeProject.id)
                : STANDALONE_CANVAS_ID,
            },
          },
        },
      );

      if (error) throw new Error(await functionErrorMessage(error));
      const content =
        typeof (result as { content?: unknown } | null)?.content === "string"
          ? (result as { content: string }).content
          : "";
      const optimized = cleanStandaloneAutoPromptResponse(content);
      if (!optimized) {
        throw new Error(
          language === "th"
            ? "Auto Prompt ยังไม่ได้ส่ง prompt กลับมา"
            : "Auto Prompt did not return a prompt.",
        );
      }

      updatePanelPrompt(optimized);
      toast.success(
        language === "th" ? "สร้าง Auto Prompt แล้ว" : "Auto Prompt ready",
      );
    } catch (err) {
      toast.error(friendlyError(err, language === "th" ? "th" : "en"));
    } finally {
      setAutoPrompting(false);
    }
  };

  const videoRatioOptions = videoRatioOptionsForModel(form.model);
  const videoResolutionOptions = videoResolutionOptionsForModel(form.model);
  const videoDurationOptions = videoDurationOptionsForSettings(
    form.model,
    form.videoResolution,
    Boolean(form.videoEnd),
  ).map(String);
  const videoFrameSlots =
    activeTool === "video_gen"
      ? [
          {
            id: "start" as const,
            label: standaloneInlineLabel("addStartFrame", language),
            historyLabel: standaloneInlineLabel("history", language),
            refItem: form.videoStart,
            uploading: uploading === "video-start",
            onUpload: () => openUpload("video-start"),
            onHistoryFiles: (files: File[]) =>
              uploadFrameHistoryFiles("video-start", files),
            onSelectHistoryAsset: (reference) =>
              selectFrameHistoryAsset("video-start", reference),
            onRemove: () => updateForm({ videoStart: null }),
          },
          ...(videoSupportsEnd
            ? [
                {
                  id: "end" as const,
                  label: standaloneInlineLabel("addEndFrame", language),
                  historyLabel: standaloneInlineLabel("history", language),
                  refItem: form.videoEnd,
                  uploading: uploading === "video-end",
                  onUpload: () => openUpload("video-end"),
                  onHistoryFiles: (files: File[]) =>
                    uploadFrameHistoryFiles("video-end", files),
                  onSelectHistoryAsset: (reference) =>
                    selectFrameHistoryAsset("video-end", reference),
                  onRemove: () => updateForm({ videoEnd: null }),
                },
              ]
            : []),
        ]
      : [];
  const videoReferenceSlots =
    activeTool === "video_gen" &&
    videoPanelMode === "reference" &&
    isKlingMotionVideoModel(form.model)
      ? [
          {
            id: "motion-start-image",
            label: t("workspace.standalone.start_image"),
            accept: "image" as const,
            refItem: form.videoRefImage,
            uploading: uploading === "video-ref-image",
            onFiles: (files: File[]) =>
              uploadPanelReferenceFiles(files, "video-ref-image"),
            onSelectAsset: (reference: PanelReferenceAsset) =>
              selectPanelReferenceAsset(reference, "video-ref-image"),
            onRemove: () => updateForm({ videoRefImage: null }),
          },
          {
            id: "motion-video",
            label: t("workspace.standalone.motion_video"),
            accept: "video" as const,
            refItem: form.videoRefVideo,
            uploading: uploading === "video-ref-video",
            onFiles: (files: File[]) =>
              uploadPanelReferenceFiles(files, "video-ref-video"),
            onSelectAsset: (reference: PanelReferenceAsset) =>
              selectPanelReferenceAsset(reference, "video-ref-video"),
            onRemove: () => updateForm({ videoRefVideo: null }),
          },
        ]
      : [];
  const videoReferenceAccept =
    videoPanelMode === "frames"
      ? "image/*"
      : videoSupportsReferenceImage(form.model) && videoSupportsReferenceVideo(form.model)
        ? "image/*,video/*"
        : videoSupportsReferenceVideo(form.model)
          ? "video/*"
          : "image/*";
  const videoReferenceHint =
    videoPanelMode === "frames"
      ? "JPEG/PNG/WEBP, 20 MB max"
      : videoSupportsReferenceImage(form.model) && videoSupportsReferenceVideo(form.model)
        ? isSeedance20VideoModel(form.model)
          ? "JPEG/PNG/WEBP/MP4, video 2-15s"
          : "JPEG/PNG/WEBP/MP4, 20 MB max"
        : videoSupportsReferenceVideo(form.model)
          ? isSeedance20VideoModel(form.model)
            ? "MP4/MOV, 2-15s"
            : "MP4/MOV/WEBM, 20 MB max"
          : "JPEG/PNG/WEBP, 20 MB max";
  const videoSettings =
    activeTool === "video_gen"
      ? buildVideoPanelSettings({
          form,
          ratioOptions: videoRatioOptions,
          resolutionOptions: videoResolutionOptions,
          durationOptions: videoDurationOptions,
          onChange: updateForm,
          language,
        })
      : [];
  const imagePanelSettings =
    activeTool === "image_gen"
      ? buildImagePanelSettings({
          form,
          resolutionOptions: imageResolutionOptionsFor(form),
          onChange: updateForm,
          t,
          language,
        })
      : [];
  const threeDPanelSettings =
    activeTool === "image_to_3d"
      ? buildThreeDPanelSettings({ form, onChange: updateForm, t, language })
      : [];
  const standaloneMultiShotActive =
    activeTool === "video_gen" &&
    videoSupportsMultiShot(form.model) &&
    form.videoMultiShot;
  const videoMultiShotScenes = useMemo(
    () => parseStandaloneMultiShotScenes(form.videoMultiPrompt),
    [form.videoMultiPrompt],
  );
  const updateVideoMultiShotScenes = (scenes: StandaloneSceneBlock[]) => {
    updateForm({
      videoMultiPrompt: serializeStandaloneMultiShotScenes(scenes),
      videoDuration: standaloneMultiShotDuration(scenes),
    });
  };
  const videoTextControls =
    activeTool === "video_gen"
      ? [
          ...(form.model.startsWith("kling")
            ? [
                {
                  id: "negative-prompt",
                  label: standaloneInlineLabel("negativePrompt", language),
                  value: form.videoNegativePrompt,
                  placeholder: standaloneInlineLabel(
                    "videoAvoidPlaceholder",
                    language,
                  ),
                  rows: 1,
                  onChange: (videoNegativePrompt: string) =>
                    updateForm({ videoNegativePrompt }),
                },
              ]
            : []),
        ]
      : [];
  const videoPanelTitle =
    videoPanelMode === "reference"
      ? standaloneInlineLabel("textToVideo", language)
      : standaloneInlineLabel("frameToVideo", language);

  const onFileSelected = async (file: File | undefined) => {
    if (!file) return;
    if (!activeProject?.id) {
      toast.error(t("workspace.toast.create_project_first_upload"));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const slot = pendingSlotRef.current;
    const needsVideo = slot === "video-ref-video";
    const isValidType = needsVideo
      ? file.type.startsWith("video/")
      : file.type.startsWith("image/");
    if (!isValidType) {
      toast.error(needsVideo ? t("workspace.toast.upload_video_ref") : t("workspace.toast.upload_image_ref"));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(slot);
    try {
      let durationSec: number | null = null;
      if (
        needsVideo &&
        activeTool === "video_gen" &&
        isSeedance20VideoModel(form.model)
      ) {
        durationSec = await readVideoFileDuration(file);
        if (durationSec == null) {
          toast.error(unreadableSeedanceReferenceVideoMessage());
          return;
        }
        if (!isSeedanceReferenceVideoDurationValid(durationSec)) {
          toast.error(seedanceReferenceVideoDurationMessage(durationSec));
          return;
        }
      }
      const uploaded = await uploadReference(file, user?.id, activeProject.id);
      applyUploadedReference(slot, {
        ...uploaded,
        durationSec: durationSec ?? uploaded.durationSec,
      });
      toast.success(t("workspace.toast.reference_uploaded"));
    } catch (err) {
      toast.error(friendlyError(err, language === "th" ? "th" : "en"));
    } finally {
      setUploading(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const run = async () => {
    // Synchronous re-entry guard. React's `setRunning(true)` below
    // doesn't disable the button until the next commit — a rapid
    // second click within that window would charge credits twice
    // (user reported two paid `gpt-image-2` jobs from one intended
    // generation). The ref flips before anything else and is reset
    // in `finally` so every exit path (validation bail, throw,
    // success) clears it.
    if (runInFlightRef.current) return;
    runInFlightRef.current = true;
    // Flip the visible loading state synchronously too — the previous
    // placement (after all validation) meant the first click had no
    // visual response, prompting users to click again.
    setRunning(true);
    try {
      if (!user?.id) {
        toast.error(t("workspace.toast.sign_in_first"));
        return;
      }
      if (!activeProject?.id) {
        toast.error(t("workspace.toast.create_project_first_gen"));
        return;
      }
      const params = buildCurrentParams(activeTool, form);
      if (!params) {
        toast.error(t("workspace.toast.tool_not_ready"));
        return;
      }
      const validation = validateForm(activeTool, form, t);
      if (validation) {
        toast.error(validation);
        return;
      }
      if (
        activeTool === "video_gen" &&
        form.videoInputMode === "reference" &&
        isSeedance20VideoModel(form.model) &&
        form.videoRefVideo
      ) {
        const durationSec =
          form.videoRefVideo.durationSec ??
          (await readVideoUrlDuration(form.videoRefVideo.url));
        if (durationSec == null) {
          toast.error(unreadableSeedanceReferenceVideoMessage());
          return;
        }
        if (!isSeedanceReferenceVideoDurationValid(durationSec)) {
          toast.error(seedanceReferenceVideoDurationMessage(durationSec));
          return;
        }
        if (form.videoRefVideo.durationSec == null) {
          updateForm({ videoRefVideo: { ...form.videoRefVideo, durationSec } });
        }
      }
      if (estimatedCost != null && estimatedCost > 0) {
        if (creditsLoading || !credits) {
          toast.error(
            language === "th"
              ? "ยังตรวจสอบเครดิตไม่ได้ กรุณารอสักครู่แล้วลองใหม่"
              : "Credits are still loading. Please try again in a moment.",
          );
          return;
        }
        if (Number(credits.balance ?? 0) < estimatedCost) {
          setInsufficientRequiredCredits(estimatedCost);
          setInsufficientOpen(true);
          return;
        }
      }

      const mentionPrompt =
        activeTool === "voice_gen" ? form.script : form.prompt;
      const mentionedAssets = resolveStandaloneMentionedAssets(
        mentionPrompt,
        panelMentionOptions,
      );
      const inputs = mergeStandaloneMentionInputs(
        activeTool,
        form,
        buildCurrentInputs(activeTool, form),
        mentionedAssets,
      );
      const runCount =
        activeTool === "image_gen"
          ? Math.min(4, Math.max(1, Number(form.imageCount) || 1))
          : activeTool === "video_gen"
            ? Math.min(4, Math.max(1, Number(form.videoCount) || 1))
          : 1;
      try {
        for (let index = 0; index < runCount; index += 1) {
          const batchParams =
            runCount > 1
              ? { ...params, batch_index: index + 1, batch_count: runCount }
              : params;
          const { data, error } = await supabase.functions.invoke(
            RUN_EDGE_FUNCTION,
            {
              body: {
                action: "enqueue_workspace_job",
                node_type: activeDef.nodeType,
                params: batchParams,
                inputs,
                mentioned_assets: mentionedAssets,
                project_id: activeProject.id,
                workspace_id: null,
                canvas_id: standaloneCanvasId(activeProject.id),
                node_id: `standalone-${activeProject.id}-${activeTool}-${Date.now()}-${index}`,
              },
            },
          );
          const resp = data as { job_id?: string; error?: string } | null;
          if (error || resp?.error || !resp?.job_id) {
            const serverMessage = error ? await functionErrorMessage(error) : undefined;
            throw new Error(
              resp?.error ??
                serverMessage ??
                t("workspace.standalone.error_failed_queue"),
            );
          }
        }
        toast.success(t("workspace.toast.gen_queued"));
        // Await — `setRunning(false)` in finally below would otherwise
        // race the in-flight refetch and the button could re-enable for
        // a frame before `activeJobsForCurrentTool` reflects the new
        // queued row.
        await jobsQuery.refetch();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isInsufficientCreditsError(message)) {
          setInsufficientRequiredCredits(estimatedCost ?? undefined);
          setInsufficientOpen(true);
        } else {
          // Audit fix: jargon errors (PROVIDER_BILLING_ERROR, OpenAI
          // 401, raw SQL function names) used to leak verbatim. Run
          // through friendlyError so the user sees a clean Thai/EN
          // message and the team gets the raw text in console.error.
          toast.error(friendlyError(err, language === "th" ? "th" : "en"));
        }
      }
    } finally {
      setRunning(false);
      runInFlightRef.current = false;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-app)] text-[var(--text-primary)]">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={uploadAccept}
        onChange={(event) => void onFileSelected(event.target.files?.[0])}
      />

      <MobileHeader
        activeTool={activeTool}
        onToolChange={onToolChange}
        onOpenSidebar={onOpenSidebar}
        projects={projects}
        activeProject={activeProject}
        showProjectPicker={Boolean(user?.id)}
        onSelectProject={onSelectProject}
        onCreateProject={onCreateProject}
        onDeleteProject={onDeleteProject}
      />
      <DesktopTopBar
        projects={projects}
        activeProject={activeProject}
        showProjectPicker={Boolean(user?.id)}
        onSelectProject={onSelectProject}
        onCreateProject={onCreateProject}
        onDeleteProject={onDeleteProject}
      />

      <div className="ws-scroll-hide flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--bg-app)] lg:flex-row lg:overflow-hidden">
        <aside className="ws-scroll-hide mx-auto flex min-h-[calc(100dvh-68px)] w-full max-w-[480px] shrink-0 flex-col bg-transparent px-[12px] pb-[12px] pt-[4px] lg:mx-0 lg:h-full lg:min-h-0 lg:w-[488px] lg:max-w-none lg:pb-0 lg:pl-2 lg:pr-0 lg:pt-0">
          {STANDALONE_TOOL_ORDER.includes(activeTool) ? (
            activeTool === "video_gen" ? (
            <CreateVideoPanel
              title={videoPanelTitle}
              modelCaption={t("workspace.standalone.model")}
              prompt={form.prompt}
              promptLabel={t("workspace.standalone.describe_video")}
              promptPlaceholder={standaloneInlineLabel(
                "videoPromptPlaceholder",
                language,
              )}
              onPromptChange={(prompt) => updateForm({ prompt })}
              autoPromptLabel="Auto Prompt"
              autoPromptTitle={autoPromptTitle}
              onAutoPrompt={() => void runAutoPrompt()}
              autoPromptRunning={autoPrompting}
              autoPromptDisabled={autoPromptDisabled}
              showPromptInput={!standaloneMultiShotActive}
              modelLabel={selectedModel?.label ?? "SeedDance 2.0 Pro"}
              modelValue={form.model}
              modelOptions={activeDef.models.filter((model) => model.id !== "google-tts-studio").map((model) => ({
                id: model.id,
                label: model.label,
                provider: model.provider,
                settings: videoModelSettingTags(model.id, language),
              }))}
              onModelChange={setToolModel}
              mode={videoPanelMode}
              onModeChange={updateVideoInputMode}
              supportsFrameMode={videoSupportsFrames}
              supportsReferenceMode={videoSupportsReferenceMode}
              frameSlots={videoFrameSlots}
              referenceSlots={videoReferenceSlots}
              references={panelReferences}
              maxReferences={panelMaxReferences}
              referenceTitle={standaloneInlineLabel(
                "addVisualReferences",
                language,
              )}
              referenceBadge={language === "th" ? "ไม่บังคับ" : "Optional"}
              referenceHint={videoReferenceHint}
              referenceAccept={videoReferenceAccept}
              referenceAssets={panelReferenceAssets}
              onAddReferences={openPanelReferenceUpload}
              onReferenceFiles={uploadPanelReferenceFiles}
              onSelectReferenceAsset={selectPanelReferenceAsset}
              onDeleteReferenceAsset={deletePanelReferenceAsset}
              onRemoveReference={removePanelReference}
              mentionOptions={panelMentionOptions}
              settings={videoSettings}
              textControls={videoTextControls}
              extraControls={
                standaloneMultiShotActive ? (
                  <StandaloneMultiShotBuilder
                    scenes={videoMultiShotScenes}
                    onChange={updateVideoMultiShotScenes}
                    mentionOptions={panelMentionOptions}
                  />
                ) : undefined
              }
              onCreate={() => void run()}
              createLabel={standaloneCreateButtonLabel(
                activeTool,
                language,
                estimatedCost,
              )}
              costQuote={estimatedCostQuote}
              runningLabel={t("workspace.standalone.loading")}
              running={running || !!uploading || activeJobsForCurrentTool > 0}
              quantity={form.videoCount}
              onQuantityChange={(videoCount) => updateForm({ videoCount })}
              bottom={panelBottom}
              onBottomChange={(tab) => {
                if (tab === "video") onToolChange("video_gen");
                if (tab === "image") onToolChange("image_gen");
                if (tab === "3d") onToolChange("image_to_3d");
                if (tab === "audio") onToolChange("voice_gen");
              }}
              density={activeTool === "voice_gen" ? "voice" : "default"}
            />
            ) : (
            <CreateImagePanel
              title={standaloneCreateActionTitle(activeTool, language)}
              modelCaption={t("workspace.standalone.model")}
              prompt={panelPrompt}
              promptLabel={panelPromptLabel}
              promptPlaceholder={panelPromptPlaceholder}
              onPromptChange={updatePanelPrompt}
              autoPromptLabel="Auto Prompt"
              autoPromptTitle={autoPromptTitle}
              onAutoPrompt={() => void runAutoPrompt()}
              autoPromptRunning={autoPrompting}
              autoPromptDisabled={autoPromptDisabled}
              showPromptInput={activeTool !== "image_to_3d"}
              modelLabel={selectedModel?.label ?? "Nano Banana Pro"}
              modelValue={form.model}
              modelOptions={activeDef.models.filter((model) => model.id !== "google-tts-studio").map((model) => ({
                id: model.id,
                label: model.label,
                provider: model.provider,
                settings:
                  activeTool === "image_gen"
                    ? imageModelSettingTags(model.id, language)
                    : activeTool === "image_to_3d"
                      ? threeDModelSettingTags(model.id, language)
                      : activeTool === "voice_gen"
                        ? audioModelSettingTags(model.id, language)
                        : [],
              }))}
              onModelChange={setToolModel}
              references={panelReferences}
              maxReferences={panelMaxReferences}
              showReferences={activeTool !== "voice_gen"}
              referenceTitle={panelReferenceTitle}
              referenceBadge={language === "th" ? "ไม่บังคับ" : "Optional"}
              referenceHint={
                activeTool === "video_gen"
                  ? "JPEG/PNG/WEBP/MP4, 20 MB max"
                  : activeTool === "image_to_3d"
                    ? panelMaxReferences > 1
                      ? "Front first, then left/back/right. JPEG/PNG/WEBP, 20 MB max"
                      : "JPEG/PNG/WEBP, 20 MB max"
                    : "JPEG/PNG/WEBP/GIF, 20 MB max"
              }
              referenceAccept={
                activeTool === "video_gen" ? "image/*,video/*" : "image/*"
              }
              referenceAssets={panelReferenceAssets}
              onAddReferences={
                activeTool === "voice_gen" ? undefined : openPanelReferenceUpload
              }
              onReferenceFiles={
                activeTool === "voice_gen" ? undefined : uploadPanelReferenceFiles
              }
              onSelectReferenceAsset={
                activeTool === "voice_gen" ? undefined : selectPanelReferenceAsset
              }
              onDeleteReferenceAsset={
                activeTool === "voice_gen" ? undefined : deletePanelReferenceAsset
              }
              onRemoveReference={removePanelReference}
              mentionOptions={panelMentionOptions}
              settings={
                activeTool === "image_gen"
                  ? imagePanelSettings
                  : activeTool === "image_to_3d"
                    ? threeDPanelSettings
                    : []
              }
              extraControls={
                activeTool === "voice_gen" ? (
                  <VoiceSettingsControls form={form} onChange={updateForm} />
                ) : undefined
              }
              onCreate={() => void run()}
              createLabel={standaloneCreateButtonLabel(
                activeTool,
                language,
                estimatedCost,
              )}
              costQuote={estimatedCostQuote}
              runningLabel={t("workspace.standalone.loading")}
              running={running || !!uploading || activeJobsForCurrentTool > 0}
              showQuantity={activeTool === "image_gen"}
              quantity={form.imageCount}
              onQuantityChange={(imageCount) => updateForm({ imageCount })}
              bottom={panelBottom}
              onBottomChange={(tab) => {
                if (tab === "video") onToolChange("video_gen");
                if (tab === "image") onToolChange("image_gen");
                if (tab === "3d") onToolChange("image_to_3d");
                if (tab === "audio") onToolChange("voice_gen");
              }}
            />
            )
          ) : (
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-[var(--border-overlay)] bg-[var(--bg-sidebar)] shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_22px_50px_-38px_rgba(238,255,0,.75)]">
            <div className="flex h-[56px] shrink-0 items-center justify-between border-b border-white/[0.04] px-4">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--text-default)] transition hover:bg-white/10 hover:text-white"
                  aria-label={standaloneCreateActionTitle(activeTool, language)}
                >
                  <ChevronDown className="h-4 w-4 rotate-90" />
                </button>
                <h2 className="truncate text-[18px] font-bold text-white">
                  {standaloneCreateActionTitle(activeTool, language)}
                </h2>
              </div>
              <button
                type="button"
                className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-white/[0.08] px-3 text-[13px] font-semibold text-white transition hover:bg-white/[0.12]"
              >
                <BookOpen className="h-4 w-4" />
                Tutorials
              </button>
            </div>

            <div className="ws-scroll-hide min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="space-y-3">
                {activeTool === "image_gen" && <ImageModeTabs />}

                <ModelPicker
                  models={activeDef.models.filter((model) => model.id !== "google-tts-studio")}
                  value={form.model}
                  onChange={setToolModel}
                />

                {activeTool === "image_gen" && (
                  <ImageControls
                    form={form}
                    onChange={updateForm}
                    uploading={uploading === "image-ref"}
                    uploadingCharacter={uploading === "image-character"}
                    onUpload={() => openUpload("image-ref")}
                    onUploadCharacter={() => openUpload("image-character")}
                  />
                )}
                {activeTool === "video_gen" && (
                  <VideoControls
                    form={form}
                    onChange={updateForm}
                    uploadingStart={uploading === "video-start"}
                    uploadingEnd={uploading === "video-end"}
                    uploadingRefImage={uploading === "video-ref-image"}
                    uploadingRefVideo={uploading === "video-ref-video"}
                    onUploadStart={() => openUpload("video-start")}
                    onUploadEnd={() => openUpload("video-end")}
                    onUploadRefImage={() => openUpload("video-ref-image")}
                    onUploadRefVideo={() => openUpload("video-ref-video")}
                  />
                )}
                {activeTool === "voice_gen" && (
                  <VoiceControls form={form} onChange={updateForm} />
                )}
                {activeTool === "image_to_3d" && (
                  <ThreeDControls
                    form={form}
                    onChange={updateForm}
                    uploading={uploading === "model-image"}
                    onUpload={() => openUpload("model-image")}
                  />
                )}

              </div>
            </div>

            <div className="shrink-0 border-t border-white/[0.04] bg-[var(--bg-sidebar)] px-3 py-3">
              <div className="space-y-3">
                {imageSettings && (
                  <ImageOutputSettings
                    form={form}
                    onChange={updateForm}
                    isGpt={imageSettings.isGpt}
                    isSeedream={imageSettings.isSeedream}
                    resolutionOptions={imageResolutionOptionsFor(form)}
                  />
                )}
              <div className="grid grid-cols-[124px_minmax(0,1fr)] gap-3">
                <div className="flex h-12 items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 text-[16px] font-semibold text-white">
                  <span className="text-lg leading-none text-zinc-300">−</span>
                  <span className="text-[15px] text-zinc-300">1/1</span>
                  <span className="text-lg leading-none text-white">+</span>
                </div>
                <button
                  type="button"
                  onClick={() => void run()}
                  disabled={running || !!uploading || activeJobsForCurrentTool > 0}
                  className="btn-cta flex w-full items-center justify-center gap-2 text-[14px] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300 disabled:shadow-none disabled:opacity-70"
                >
                  {running || activeJobsForCurrentTool > 0 ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GenerateIcon className="h-4 w-4" />
                  )}
                  {standaloneCreateButtonLabel(activeTool, language, estimatedCost)}
                </button>
              </div>
              </div>
            </div>

            <ToolTabs
              activeTool={activeTool}
              onToolChange={onToolChange}
              className="hidden shrink-0 lg:flex"
            />
          </section>
          )}
        </aside>

        <main className="ws-scroll-hide min-h-0 flex-1 overflow-visible bg-[var(--bg-app)] px-3 pb-3 pt-3 md:px-4 lg:overflow-hidden lg:pb-0 lg:pl-2 lg:pr-3 lg:pt-0">
          <section className="flex min-h-[560px] flex-1 flex-col overflow-hidden rounded-[20px] bg-[var(--bg-sidebar)] shadow-[inset_0_1px_0_rgba(255,255,255,.035),0_22px_50px_-38px_rgba(238,255,0,.45)] lg:h-full lg:min-h-0">
            <div className="ws-scroll-hide min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <CreationFeed
                jobs={filterJobsForTool(jobsQuery.data ?? [], activeTool)}
                loading={jobsQuery.isLoading}
                onDeleteJob={deleteStandaloneResult}
              />
            </div>
          </section>
        </main>
      </div>
      <InsufficientCreditsDialog
        open={insufficientOpen}
        onOpenChange={setInsufficientOpen}
        requiredCredits={insufficientRequiredCredits}
      />
      <Dialog
        open={!!deleteReferenceTarget}
        onOpenChange={(open) => !open && !deletingReference && setDeleteReferenceTarget(null)}
      >
        <DialogContent className="w-[360px] gap-0 overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#101113] p-0 text-white shadow-[0_24px_80px_rgba(0,0,0,.64)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#F4FF00] via-[#F4FF00] to-[#f8ff66]" />
          <div className="px-5 pb-4 pt-5">
            <DialogHeader className="space-y-2 pr-5">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-rose-300/20 bg-rose-500/12 text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <DialogTitle className="text-[16px] font-bold leading-tight text-white">
                  {deleteReferenceTarget?.source === "generation"
                    ? language === "th" ? "ลบผลลัพธ์นี้?" : "Delete result?"
                    : language === "th" ? "ลบไฟล์นี้?" : "Delete asset?"}
                </DialogTitle>
              </div>
              <DialogDescription className="text-[13px] leading-relaxed text-zinc-400">
                {deleteReferenceTarget?.source === "generation"
                  ? language === "th"
                    ? "ผลลัพธ์นี้จะถูกลบออกจากรายการด้านขวา รวมถึงไฟล์ที่เก็บไว้ใน MediaForge storage"
                    : "This removes the generation from the result panel. Stored MediaForge files are deleted too."
                  : language === "th"
                    ? "ไฟล์นี้จะถูกลบออกจากคลัง reference รวมถึงไฟล์ที่เก็บไว้ใน MediaForge storage"
                    : "This removes the file from your reference library. Stored MediaForge files are deleted too."}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] bg-white/[0.025] px-4 py-3">
            <button
              type="button"
              disabled={deletingReference}
              onClick={() => setDeleteReferenceTarget(null)}
              className="inline-flex h-8 items-center justify-center rounded-[9px] border border-white/[0.08] px-3 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.06] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deletingReference}
              onClick={() => void confirmDeletePanelReferenceAsset()}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] bg-red-500 px-3 text-[12px] font-bold text-white shadow-[0_10px_22px_rgba(239,68,68,.28)] transition hover:bg-red-400 disabled:opacity-60"
            >
              {deletingReference ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolTabs({
  activeTool,
  onToolChange,
  className,
  variant = "default",
}: {
  activeTool: StandaloneToolKey;
  onToolChange: (tool: StandaloneToolKey) => void;
  className?: string;
  variant?: "default" | "mobile";
}) {
  const { t } = useLanguage();
  const isMobile = variant === "mobile";

  return (
    <footer
      className={cn(
        isMobile
          ? "standalone-mobile-tool-tabs flex h-[42px] items-center justify-center gap-[8px] rounded-[14px] border border-white/[0.05] bg-[#151719] px-[8px] py-[4px] shadow-[inset_0_1px_0_rgba(255,255,255,.04),0_10px_24px_-20px_rgba(238,255,0,.75)]"
          : "flex items-center justify-between gap-2 border-t border-white/[0.05] bg-[#17191b] px-4 py-3",
        className,
      )}
    >
      {STANDALONE_TOOL_ORDER.map((key) => {
        const item = STANDALONE_TOOLS[key];
        const active = key === activeTool;
        const Icon = item.icon;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToolChange(key)}
            className={cn(
              "relative flex min-w-0 items-center justify-center overflow-hidden rounded-full font-semibold outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[var(--brand-soft)]/60",
              isMobile
                ? active
                  ? "h-[34px] min-w-[78px] px-[12px] text-[12px] bg-white text-black shadow-[0_0_18px_rgba(244,255,0,.5)]"
                  : "h-[34px] w-[34px] px-0 text-[var(--text-default)] hover:bg-white/10 hover:text-white"
                : cn(
                    "h-11 px-3 text-[13px]",
                    active
                      ? "min-w-[112px] bg-white text-black shadow-[0_4px_20px_rgba(238,255,0,0.45)]"
                      : "w-11 text-[var(--text-default)] hover:bg-white/10 hover:text-white",
                  ),
            )}
          >
            <Icon
              className={cn(
                "shrink-0 transition-transform duration-300",
                isMobile ? "h-[17px] w-[17px]" : "h-5 w-5",
                active
                  ? "scale-105"
                  : "opacity-70",
              )}
            />
            {active && (
              <span
                className={cn(
                  "ml-[6px] truncate leading-[14px]",
                  isMobile ? "max-w-[48px]" : "max-w-[72px]",
                )}
              >
                {standaloneToolNav(item.key, t)}
              </span>
            )}
          </button>
        );
      })}
    </footer>
  );
}

function MobileHeader({
  activeTool,
  onToolChange,
  onOpenSidebar,
  projects,
  activeProject,
  showProjectPicker,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}: {
  activeTool: StandaloneToolKey;
  onToolChange: (tool: StandaloneToolKey) => void;
  onOpenSidebar: () => void;
  projects: StandaloneProjectOption[];
  activeProject: StandaloneProjectOption | null;
  showProjectPicker: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onDeleteProject?: (projectId: string) => void;
}) {
  const { t } = useLanguage();

  return (
    <header className="shrink-0 bg-[var(--bg-app)] px-[12px] pb-[2px] pt-[12px] lg:hidden">
      <div className="mx-auto mb-[8px] flex max-w-[390px] items-center justify-between">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="grid h-8 w-8 place-items-center rounded-md text-zinc-200"
          aria-label={t("workspace.standalone.menu")}
        >
          <Menu className="h-4 w-4" />
        </button>
        {showProjectPicker ? (
          <ProjectPicker
            projects={projects}
            activeProject={activeProject}
            onSelectProject={onSelectProject}
            onCreateProject={onCreateProject}
            onDeleteProject={onDeleteProject}
            compact
          />
        ) : (
          <div className="h-8 min-w-[32px]" aria-hidden />
        )}
        <UserMenu />
      </div>
      <div className="mx-auto max-w-[390px]">
        <ToolTabs
          activeTool={activeTool}
          onToolChange={onToolChange}
          variant="mobile"
        />
      </div>
    </header>
  );
}

function DesktopTopBar({
  projects,
  activeProject,
  showProjectPicker,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}: {
  projects: StandaloneProjectOption[];
  activeProject: StandaloneProjectOption | null;
  showProjectPicker: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onDeleteProject?: (projectId: string) => void;
}) {
  return (
    <div className="hidden h-[66px] shrink-0 items-center justify-between bg-[var(--bg-app)] px-5 lg:flex">
      {showProjectPicker ? (
        <ProjectPicker
          projects={projects}
          activeProject={activeProject}
          onSelectProject={onSelectProject}
          onCreateProject={onCreateProject}
          onDeleteProject={onDeleteProject}
        />
      ) : (
        <div aria-hidden />
      )}
      <UserMenu />
    </div>
  );
}

function ProjectPicker({
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  compact,
}: {
  projects: StandaloneProjectOption[];
  activeProject: StandaloneProjectOption | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onDeleteProject?: (projectId: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  const projectName =
    activeProject?.name?.trim() || t("workspace.standalone.create_project");
  const projectAvatar = getProjectAvatar(activeProject ?? { id: "new-project", name: projectName });

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          if (projects.length === 0) {
            onCreateProject();
            return;
          }
          setOpen((value) => !value);
        }}
        className={cn(
          "flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-zinc-100 outline-none transition hover:bg-white/[0.05] focus-visible:ring-1 focus-visible:ring-white/20",
          compact ? "max-w-[170px]" : "max-w-[260px]",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full bg-[#0b0d0d] ring-1 ring-white/12">
          <img
            src={projectAvatar}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </span>
        <span className="truncate">{projectName}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute left-0 top-10 z-50 w-[236px] rounded-xl bg-[#111111] p-1.5 shadow-2xl shadow-black/70",
            compact && "left-1/2 -translate-x-1/2",
          )}
          role="menu"
        >
          <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">
            {t("workspace.standalone.projects")}
          </div>
          <div className="max-h-[220px] space-y-1 overflow-y-auto">
            {projects.map((project) => {
              const active = project.id === activeProject?.id;
              const canDelete = Boolean(onDeleteProject);
              const avatar = getProjectAvatar(project);
              return (
                <div
                  key={project.id}
                  className={cn(
                    "flex h-8 w-full items-center gap-1 rounded-lg px-2 text-left text-[11px] font-semibold transition",
                    active
                      ? "bg-white/[0.09] text-white"
                      : "text-zinc-300 hover:bg-white/[0.05] hover:text-white",
                  )}
                  role="menuitem"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProject(project.id);
                      setOpen(false);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-[#0b0d0d] ring-1 ring-white/12">
                      <img
                        src={avatar}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                      />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {active && (
                      <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[9px] uppercase text-zinc-400">
                        {t("workspace.standalone.active")}
                      </span>
                    )}
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (
                          !window.confirm(
                            t("workspace.standalone.delete_project_confirm", {
                              name: project.name,
                            }),
                          )
                        ) return;
                        onDeleteProject?.(project.id);
                        setOpen(false);
                      }}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-zinc-500 transition hover:bg-red-500/10 hover:text-red-300"
                      aria-label={t("workspace.standalone.delete_project_aria", {
                        name: project.name,
                      })}
                      title={t("workspace.standalone.delete_project")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              onCreateProject();
              setOpen(false);
            }}
            className="mt-1.5 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-white text-[12px] font-bold text-zinc-950 transition hover:bg-zinc-200"
            role="menuitem"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("workspace.standalone.new_project")}
          </button>
        </div>
      )}
    </div>
  );
}

function ModelPicker({
  models,
  value,
  onChange,
}: {
  models: Array<{
    id: string;
    label: string;
    provider: string;
    description: string;
    badge?: string;
  }>;
  value: string;
  onChange: (model: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const { t, language } = useLanguage();
  const selected =
    models.find((model) => model.id === value) ??
    models[0] ?? {
      id: "",
      label: t("workspace.standalone.model"),
      provider: "MediaForge",
      description: "",
    };
  const providers = Array.from(new Set(models.map((model) => model.provider)));
  const filteredModels = models.filter((model) => {
    const matchesQuery =
      !query.trim() ||
      `${model.label} ${model.provider} ${model.description} ${model.badge ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
    const matchesProvider =
      providerFilter === "all" || model.provider === providerFilter;
    return matchesQuery && matchesProvider;
  });
  const recommendedModels = orderModelsByRecommendation(models).slice(
    0,
    Math.min(3, models.length),
  );
  const uiText = {
    recommended: language === "th" ? "แนะนำ" : "Recommended",
    allModels: language === "th" ? "โมเดลทั้งหมด" : "All models",
    allProviders: language === "th" ? "ผู้ให้บริการทั้งหมด" : "All providers",
    search: language === "th" ? "ค้นหา" : "Search",
    active: language === "th" ? "ใช้งานอยู่" : "Active",
    noModels: language === "th" ? "ไม่พบโมเดล" : "No models found",
    closeModels: language === "th" ? "ปิดรายการโมเดล" : "Close models",
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-[58px] w-full items-center overflow-hidden rounded-[14px] border border-[var(--border-faint)] bg-[var(--bg-panel)] px-3 transition-all duration-200 hover:border-[var(--brand-primary)]/40 hover:bg-[var(--bg-surface-2)] hover:shadow-[0_0_0_1px_rgba(238,255,0,.25),0_8px_24px_-12px_rgba(238,255,0,.4)]"
      >
        <span className="flex w-full items-center gap-3">
          <StandaloneModelLogo model={selected} size="lg" />
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-[12px] font-medium text-[var(--text-tertiary)]">
              {t("workspace.standalone.model")}
            </span>
            <span className="block min-w-0 truncate text-[15px] font-semibold leading-5 text-white">
              {selected.label}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-default)] transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 opacity-100 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setOpen(false)}
          />
          <aside
            className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(480px,calc(100vw-32px))] flex-col overflow-hidden rounded-[20px] border border-[var(--border-overlay)] bg-[var(--bg-overlay)] shadow-[0_8px_64px_0_rgba(0,0,0,.5)]"
            style={{ animation: "panelIn .35s cubic-bezier(.4,0,.2,1) both" }}
          >
            <div className="pointer-events-none absolute -right-20 -top-32 h-[300px] w-[400px] rounded-full bg-[var(--brand-glow)] opacity-20 blur-3xl" />

            <div className="relative flex items-center justify-between px-6 pb-2 pt-5">
              <h2 className="text-xl font-semibold text-white">
                {t("workspace.standalone.model")}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-default)] transition hover:bg-white/10 hover:text-white"
                aria-label={uiText.closeModels}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative flex items-center gap-1.5 px-6 pb-3 text-sm text-[var(--text-default)]">
              <Sparkles className="h-4 w-4 text-[var(--brand-soft)]" />
              <span>{selected.provider}</span>
            </div>

            {recommendedModels.length > 0 && (
              <div className="relative px-6 pb-4">
                <div className="mb-2 text-xs text-[var(--text-tertiary)]">
                  {uiText.recommended}
                </div>
                <div className="ws-scroll-hide flex snap-x gap-3 overflow-x-auto">
                  {recommendedModels.map((model) => {
                    const active = model.id === value;
                    const visual = modelVisualFor(model);
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => {
                          onChange(model.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "group relative h-[180px] w-[260px] shrink-0 snap-start overflow-hidden rounded-2xl text-left transition-transform duration-300 hover:scale-[1.02]",
                          active
                            ? "ring-1 ring-[var(--brand-primary)]/70"
                            : "ring-1 ring-white/5 hover:ring-[var(--brand-primary)]/60",
                        )}
                        style={{ background: visual.gradient }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 min-w-0 p-3">
                          <div className="truncate font-semibold text-white">
                            {model.label}
                          </div>
                          <div className="line-clamp-2 text-xs text-white/70">
                            {standaloneModelDescription(model.id, model.description, t)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="relative flex items-center gap-2 border-t border-[var(--border-overlay)] px-6 py-2">
              <button
                type="button"
                onClick={() => setProviderFilter("all")}
                className={cn(
                  "h-8 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-all",
                  providerFilter === "all"
                    ? "bg-white text-black"
                    : "bg-transparent text-[var(--text-default)] ring-1 ring-white/10 hover:text-white hover:ring-white/30",
                )}
              >
                {uiText.allModels}
              </button>
              <select
                value={providerFilter}
                onChange={(event) => setProviderFilter(event.target.value)}
                className="h-8 rounded-full bg-transparent px-3 text-[13px] text-[var(--text-default)] outline-none ring-1 ring-white/10 transition hover:text-white hover:ring-white/30"
              >
                <option value="all" className="bg-zinc-950">
                  {uiText.allProviders}
                </option>
                {providers.map((provider) => (
                  <option key={provider} value={provider} className="bg-zinc-950">
                    {provider}
                  </option>
                ))}
              </select>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={uiText.search}
                  className="h-8 w-full rounded-full bg-white/5 pl-8 pr-3 text-[13px] text-white outline-none placeholder:text-[var(--text-tertiary)] focus:bg-white/10"
                />
              </div>
            </div>

            <div className="relative flex-1 overflow-y-auto px-3 pb-4 pt-2">
              {filteredModels.map((model, index) => {
                const active = model.id === value;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      onChange(model.id);
                      setOpen(false);
                    }}
                    style={{ animationDelay: `${index * 30}ms` }}
                    className={cn(
                      "flex w-full animate-[fadeSlideIn_.35s_ease-out_both] items-center gap-3 rounded-xl px-3 py-3 text-left transition-all duration-200 hover:bg-white/[0.04]",
                      active && "bg-white/[0.06]",
                    )}
                  >
                    <StandaloneModelLogo model={model} size="xl" />
                    <span className="min-w-0 flex-1">
                      <span className="block min-w-0">
                        <span className="block line-clamp-2 font-medium leading-5 text-white">
                          {model.label}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          {model.badge && <ModelBadge>{model.badge}</ModelBadge>}
                          {active && <ModelBadge variant="active">{uiText.active}</ModelBadge>}
                        </span>
                      </span>
                      <span className="mt-0.5 block line-clamp-1 text-xs text-[var(--text-default)]">
                        {standaloneModelDescription(model.id, model.description, t)}
                      </span>
                    </span>
                    <span className="hidden rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] text-[var(--text-default)] ring-1 ring-white/10 sm:inline-flex">
                      {model.provider}
                    </span>
                  </button>
                );
              })}
              {filteredModels.length === 0 && (
                <div className="px-3 py-10 text-center text-sm text-[var(--text-default)]">
                  {uiText.noModels}
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function ModelBadge({
  children,
  variant,
}: {
  children: string;
  variant?: "active";
}) {
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1",
        variant === "active"
          ? "bg-white text-black ring-white"
          : "bg-[var(--brand-primary)]/15 text-[var(--brand-soft)] ring-[var(--brand-primary)]/30",
      )}
    >
      {children}
    </span>
  );
}

function StandaloneModelLogo({
  model,
  size = "lg",
  className,
}: {
  model: { id?: string; label?: string; name?: string; provider?: string };
  size?: "lg" | "xl";
  className?: string;
}) {
  const logo = modelLogoFor(model);
  const markLength = logo.mark.length;
  const markClass =
    markLength > 5
      ? "text-[7px]"
      : markLength > 4
        ? "text-[8px]"
        : markLength > 3
          ? "text-[9px]"
          : markLength > 2
            ? "text-[10px]"
            : "text-[15px]";

  return (
    <span
      aria-label={`${logo.label} logo`}
      title={logo.label}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden border font-black uppercase leading-none tracking-normal",
        size === "xl" ? "h-10 w-10 rounded-lg" : "h-9 w-9 rounded-[10px]",
        className,
      )}
      style={{
        background: logo.background,
        color: logo.color,
        borderColor: logo.borderColor,
        boxShadow: logo.shadow,
      }}
    >
      {logo.imageSrc ? (
        <img
          src={logo.imageSrc}
          alt=""
          className="h-full w-full object-contain p-[5px]"
          draggable={false}
        />
      ) : (
        <span className={cn("max-w-full truncate px-[2px]", markClass)}>
          {logo.mark}
        </span>
      )}
    </span>
  );
}

function modelVisualFor(model: {
  label: string;
  provider: string;
}) {
  const seed = `${model.provider}:${model.label}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  }
  const gradients = [
    "linear-gradient(135deg,#9FB800,#F4FF00 55%,#F8FF66)",
    "linear-gradient(135deg,#3B2A8C,#E7FF12 55%,#EEFF00)",
    "linear-gradient(135deg,#202326,#9FB800 55%,#F4FF00)",
    "linear-gradient(135deg,#9fb800,#e7ff12 55%,#F8FF66)",
  ];
  return {
    gradient: gradients[hash % gradients.length],
    initial: model.provider.trim().charAt(0).toUpperCase() || "M",
  };
}

function ImageControls({
  form,
  onChange,
  uploading,
  uploadingCharacter,
  onUpload,
  onUploadCharacter,
}: {
  form: StandaloneFormState;
  onChange: (patch: Partial<StandaloneFormState>) => void;
  uploading: boolean;
  uploadingCharacter: boolean;
  onUpload: () => void;
  onUploadCharacter: () => void;
}) {
  const { t } = useLanguage();
  const resolutionOptions = imageResolutionOptionsFor(form);
  const maxRefs = maxImageRefsForModel(form.model);

  useEffect(() => {
    if (resolutionOptions.length > 0 && !resolutionOptions.includes(form.imageResolution)) {
      onChange({ imageResolution: resolutionOptions[0] ?? "1K" });
    }
  }, [form.imageResolution, onChange, resolutionOptions]);

  return (
    <>
      <ImagePromptPanel
        styleId={form.styleId}
        onStyleChange={(styleId) => onChange({ styleId })}
        refs={form.imageRefs}
        max={maxRefs}
        uploading={uploading}
        uploadingCharacter={uploadingCharacter}
        onUpload={onUpload}
        onUploadCharacter={onUploadCharacter}
        onRemove={(id) =>
          onChange({ imageRefs: form.imageRefs.filter((ref) => ref.id !== id) })
        }
        onClearRefs={() => onChange({ imageRefs: [] })}
        value={form.prompt}
        placeholder={t("workspace.standalone.describe_image")}
        onChange={(prompt) => onChange({ prompt })}
      />
    </>
  );
}

function ImagePromptPanel({
  styleId,
  onStyleChange,
  refs,
  max,
  uploading,
  uploadingCharacter,
  onUpload,
  onUploadCharacter,
  onRemove,
  onClearRefs,
  value,
  placeholder,
  onChange,
}: {
  styleId: string;
  onStyleChange: (styleId: string) => void;
  refs: UploadedRef[];
  max: number;
  uploading: boolean;
  uploadingCharacter: boolean;
  onUpload: () => void;
  onUploadCharacter: () => void;
  onRemove: (id: string) => void;
  onClearRefs: () => void;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const { t, language } = useLanguage();
  const [styleOpen, setStyleOpen] = useState(false);
  const selectedStyle =
    IMAGE_STYLE_PRESETS.find((preset) => preset.id === styleId) ??
    IMAGE_STYLE_PRESETS[0];
  const characterRef = refs.find((ref) => ref.role === "character");
  const optionalText = language === "th" ? "ไม่บังคับ" : "Optional";
  const copy =
    language === "th"
      ? {
          describe: "อธิบายรูปภาพของคุณ",
          addRefs: "เพิ่มภาพอ้างอิง",
          autoPolish: "Auto Polish",
        }
      : {
          describe: "Describe your image",
          addRefs: "Add visual references",
          autoPolish: "Auto Polish",
        };

  return (
    <div className="relative rounded-[16px] border border-[var(--border-faint)] bg-[var(--bg-panel)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-[14px] font-bold leading-none text-white">
          {copy.describe}
        </div>
        <ImagePlus className="h-4 w-4 text-[var(--text-default)]" />
      </div>

      <div className="mt-3 overflow-hidden rounded-[14px] border border-white/[0.06] bg-[#101112] shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
        <button
          type="button"
          onClick={onUpload}
          disabled={uploading || refs.length >= max}
          className="group relative flex h-[58px] w-full items-center gap-3 overflow-hidden border border-[var(--brand-primary)]/70 bg-[radial-gradient(85%_160%_at_50%_-60%,rgba(244,255,0,.6),rgba(238,255,0,.24)_38%,rgba(10,10,11,0)_80%)] px-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_0_24px_-10px_rgba(238,255,0,.9)] transition hover:border-[var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <div className="flex h-8 w-[60px] shrink-0 items-center -space-x-3 overflow-hidden">
            {refs.length > 0 ? (
              refs.slice(0, 3).map((ref) => (
                <img
                  key={ref.id}
                  src={ref.url}
                  alt=""
                  className="h-8 w-8 rounded-lg border border-white/20 object-cover shadow-lg"
                />
              ))
            ) : (
              <>
                <span className="h-8 w-8 rounded-lg border border-white/20 bg-[linear-gradient(135deg,#F4FF00,#F8FF66)] shadow-lg" />
                <span className="h-8 w-8 rounded-lg border border-white/20 bg-[linear-gradient(135deg,#9FB800,#F4FF00)] shadow-lg" />
                <span className="h-8 w-8 rounded-lg border border-white/20 bg-[linear-gradient(135deg,#202326,#F8FF66)] shadow-lg" />
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[12px] font-bold leading-none text-white">
                {copy.addRefs}
              </span>
              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-default)]">
                {optionalText}
              </span>
            </div>
            <div className="mt-1 truncate text-[10px] leading-none text-[var(--text-default)]">
              JPEG/PNG/WEBP/GIF, 50 MB max
            </div>
          </div>
          <span className="absolute right-2 top-2 rounded-md bg-black/45 px-1.5 py-0.5 text-[11px] font-bold text-white">
            {refs.length}/{max}
          </span>
        </button>

        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={4}
          placeholder={placeholder}
          className="h-[84px] w-full resize-none bg-transparent px-4 py-2 text-[12px] leading-[1.5] text-zinc-100 outline-none placeholder:text-[var(--text-tertiary)]"
        />

        <div className="flex h-10 items-center justify-between gap-3 border-t border-white/[0.04] px-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onUploadCharacter}
              disabled={uploadingCharacter}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-lg text-[var(--text-default)] transition hover:bg-white/10 hover:text-white disabled:opacity-60",
                characterRef && "text-[var(--brand-soft)]",
              )}
              title={t("workspace.standalone.character")}
            >
              {uploadingCharacter ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserRound className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setStyleOpen((open) => !open)}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-lg text-[var(--text-default)] transition hover:bg-white/10 hover:text-white",
                selectedStyle.id !== "none" && "text-[var(--brand-soft)]",
              )}
              title={t("workspace.standalone.style")}
            >
              <Sparkles className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClearRefs}
              disabled={refs.length === 0}
              className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-default)] transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              title={t("workspace.standalone.remove_reference")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            className="flex items-center gap-2 text-[13px] font-semibold text-white"
            aria-pressed="false"
          >
            {copy.autoPolish}
            <span className="relative h-6 w-10 rounded-full bg-zinc-700">
              <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-zinc-300" />
            </span>
          </button>
        </div>
      </div>

      {refs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {refs.slice(0, 8).map((ref) => (
            <div
              key={ref.id}
              className="group relative h-12 w-12 overflow-hidden rounded-lg bg-black/30 ring-1 ring-white/10"
            >
              <img src={ref.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(ref.id)}
                className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded bg-black/70 text-zinc-200 opacity-0 transition group-hover:opacity-100"
                aria-label={t("workspace.standalone.remove_reference")}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {styleOpen && (
        <div className="absolute left-3 right-3 top-[calc(100%-16px)] z-40 rounded-2xl border border-[var(--border-overlay)] bg-[var(--bg-overlay)] p-2 shadow-2xl shadow-black/70">
          {IMAGE_STYLE_PRESETS.map((style) => {
            const active = style.id === styleId;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => {
                  onStyleChange(style.id);
                  setStyleOpen(false);
                }}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl p-2 text-left transition",
                  active ? "bg-[var(--brand-primary)]/20" : "hover:bg-white/[0.05]",
                )}
              >
                <span
                  className="h-10 w-10 shrink-0 rounded-lg"
                  style={{ background: style.preview }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-bold text-white">
                    {standaloneStyleLabel(style.id, style.label, t)}
                  </span>
                  <span className="line-clamp-1 text-[11px] text-zinc-500">
                    {standaloneStyleDescription(style.id, style.description, t)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ImageOutputSettings({
  form,
  onChange,
  isGpt,
  isSeedream,
  resolutionOptions,
}: {
  form: StandaloneFormState;
  onChange: (patch: Partial<StandaloneFormState>) => void;
  isGpt: boolean;
  isSeedream: boolean;
  resolutionOptions: string[];
}) {
  const { t, language } = useLanguage();
  const aspectOptions = imageAspectOptionsForModel(form.model);
  const hasResolution = resolutionOptions.length > 0;
  const copy =
    language === "th"
      ? { output: "ผลลัพธ์", quality: "คุณภาพ", standard: "มาตรฐาน" }
      : { output: "Output", quality: "Quality", standard: "Standard" };
  const outputLabel = isSeedream
    ? form.imageResolution
    : [
        form.aspectRatio,
        ...(hasResolution ? [form.imageResolution] : []),
        ...(isGpt ? [form.outputFormat] : []),
      ].join(" · ");
  const qualityLabel = isGpt
    ? `${standaloneOptionLabel(form.quality, t)} · ${standaloneOptionLabel(form.background, t)}`
    : copy.standard;

  return (
    <div className="grid grid-cols-2 gap-[5px]">
      <div className="standalone-setting-card flex min-h-[38px] items-center gap-[6px] rounded-[10px] border border-[var(--border-faint)] bg-[var(--bg-panel)] px-[7px] py-[3px]">
        <div className="grid h-[24px] w-[24px] shrink-0 place-items-center rounded-[7px] bg-white/[0.05] text-white">
          <SlidersHorizontal className="h-[14px] w-[14px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium leading-[14px] text-[var(--text-tertiary)]">
            {copy.output}
          </div>
          <div className="relative min-w-0 truncate text-[15px] font-bold leading-[16px] text-white">
            {outputLabel}
            {!isSeedream && (
              <InvisibleSelectOverlay
                value={form.aspectRatio}
                options={aspectOptions}
                onChange={(aspectRatio) => {
                  if (!isDirectGptImageModel(form.model)) {
                    onChange({ aspectRatio });
                    return;
                  }
                  const nextResolutions = gptImageResolutionsFor(aspectRatio);
                  const imageResolution = nextResolutions.includes(form.imageResolution)
                    ? form.imageResolution
                    : (nextResolutions[0] ?? "1K");
                  onChange({ aspectRatio, imageResolution });
                }}
                className={
                  isGpt && hasResolution
                    ? "left-0 w-1/3"
                    : isGpt
                      ? "left-0 w-1/2"
                      : hasResolution
                        ? "left-0 w-1/2"
                        : "inset-x-0"
                }
                label={copy.output}
              />
            )}
            {hasResolution && (
              <InvisibleSelectOverlay
                value={form.imageResolution}
                options={resolutionOptions}
                onChange={(imageResolution) => onChange({ imageResolution })}
                className={
                  isSeedream
                    ? "inset-x-0"
                    : isGpt
                      ? "left-1/3 w-1/3"
                      : "left-1/2 w-1/2"
                }
                label={copy.output}
              />
            )}
            {isGpt && (
              <InvisibleSelectOverlay
                value={form.outputFormat}
                options={["png", "jpeg", "webp"]}
                onChange={(outputFormat) => onChange({ outputFormat })}
                className={hasResolution ? "right-0 w-1/3" : "right-0 w-1/2"}
                label={copy.output}
              />
            )}
          </div>
        </div>
        <ChevronRight className="h-[12px] w-[12px] shrink-0 text-[var(--text-tertiary)]" />
      </div>

      <div className="standalone-setting-card flex min-h-[38px] items-center gap-[6px] rounded-[10px] border border-[var(--border-faint)] bg-[var(--bg-panel)] px-[7px] py-[3px]">
        <div className="grid h-[24px] w-[24px] shrink-0 place-items-center rounded-[7px] bg-white/[0.05] text-white">
          <SlidersHorizontal className="h-[14px] w-[14px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium leading-[14px] text-[var(--text-tertiary)]">
            {copy.quality}
          </div>
          <div className="relative min-w-0 truncate text-[15px] font-bold leading-[16px] text-white">
            {qualityLabel}
            {isGpt ? (
              <>
                <InvisibleSelectOverlay
                  value={form.quality}
                  options={["low", "medium", "high"]}
                  onChange={(quality) => onChange({ quality })}
                  className="left-0 w-1/2"
                  label={copy.quality}
                />
                <InvisibleSelectOverlay
                  value={form.background}
                  options={["auto", "transparent", "opaque"]}
                  onChange={(background) => onChange({ background })}
                  disabled={form.outputFormat === "jpeg"}
                  className="left-1/2 w-1/2"
                  label={copy.quality}
                />
              </>
            ) : null}
          </div>
        </div>
        <ChevronRight className="h-[12px] w-[12px] shrink-0 text-[var(--text-tertiary)]" />
      </div>
    </div>
  );
}

function InvisibleSelectOverlay({
  value,
  options,
  onChange,
  className,
  label,
  disabled,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  className: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "absolute inset-y-0 cursor-pointer opacity-0 disabled:cursor-not-allowed",
        className,
      )}
      aria-label={label}
    >
      {options.map((option) => (
        <option key={option} value={option} className="bg-zinc-950">
          {option}
        </option>
      ))}
    </select>
  );
}

function VideoControls({
  form,
  onChange,
  uploadingStart,
  uploadingEnd,
  uploadingRefImage,
  uploadingRefVideo,
  onUploadStart,
  onUploadEnd,
  onUploadRefImage,
  onUploadRefVideo,
}: {
  form: StandaloneFormState;
  onChange: (patch: Partial<StandaloneFormState>) => void;
  uploadingStart: boolean;
  uploadingEnd: boolean;
  uploadingRefImage: boolean;
  uploadingRefVideo: boolean;
  onUploadStart: () => void;
  onUploadEnd: () => void;
  onUploadRefImage: () => void;
  onUploadRefVideo: () => void;
}) {
  const { t } = useLanguage();
  const isSeedance = isSeedanceVideoModel(form.model);
  const isMotion = isKlingMotionVideoModel(form.model);
  const isVeo = isVeoVideoModel(form.model);
  const supportsAudioToggle =
    (isSeedance && seedanceVideoSupportsAudio(form.model)) ||
    isReplicateVeoVideoModel(form.model) ||
    (!isSeedance && !isVeo && !isMotion);
  const supportsStartEnd = videoSupportsStartEndFrames(form.model);
  const supportsRefImage = videoSupportsReferenceImage(form.model);
  const supportsRefVideo = videoSupportsReferenceVideo(form.model);
  const durations = videoDurationOptionsForSettings(
    form.model,
    form.videoResolution,
    Boolean(form.videoEnd),
  );

  useEffect(() => {
    if (!durations.includes(form.videoDuration)) {
      onChange({
        videoDuration: durations.includes(5) ? 5 : (durations[0] ?? 5),
      });
    }
  }, [durations, form.videoDuration, onChange]);

  const referenceSlots: Array<{
    key: string;
    label: string;
    refItem: UploadedRef | null;
    uploading: boolean;
    onUpload: () => void;
    onRemove: () => void;
  }> = [];
  if (supportsStartEnd) {
    referenceSlots.push(
      {
        key: "start",
        label: t("workspace.standalone.start_image"),
        refItem: form.videoStart,
        uploading: uploadingStart,
        onUpload: onUploadStart,
        onRemove: () => onChange({ videoStart: null }),
      },
      {
        key: "end",
        label: t("workspace.standalone.end_image"),
        refItem: form.videoEnd,
        uploading: uploadingEnd,
        onUpload: onUploadEnd,
        onRemove: () => onChange({ videoEnd: null }),
      },
    );
  }
  if (supportsRefImage) {
    referenceSlots.push({
      key: "ref-image",
      label: isMotion
        ? t("workspace.standalone.reference_image")
        : t("workspace.standalone.ref_image"),
      refItem: form.videoRefImage,
      uploading: uploadingRefImage,
      onUpload: onUploadRefImage,
      onRemove: () => onChange({ videoRefImage: null }),
    });
  }
  if (supportsRefVideo) {
    referenceSlots.push({
      key: "ref-video",
      label: isMotion
        ? t("workspace.standalone.motion_video")
        : t("workspace.standalone.ref_video"),
      refItem: form.videoRefVideo,
      uploading: uploadingRefVideo,
      onUpload: onUploadRefVideo,
      onRemove: () => onChange({ videoRefVideo: null }),
    });
  }
  return (
    <>
      {referenceSlots.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {referenceSlots.map((slot) => (
            <SingleReferenceButton
              key={slot.key}
              label={slot.label}
              refItem={slot.refItem}
              uploading={slot.uploading}
              onUpload={slot.onUpload}
              onRemove={slot.onRemove}
            />
          ))}
        </div>
      )}
      <PromptBox
        label={t("workspace.standalone.prompt")}
        placeholder={t("workspace.standalone.describe_video")}
        value={form.prompt}
        onChange={(prompt) => onChange({ prompt })}
      />
      {!isMotion ? (
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label={t("workspace.standalone.aspect")}
            value={form.videoRatio}
            options={videoRatioOptionsForModel(form.model)}
            onChange={(videoRatio) => onChange({ videoRatio })}
          />
          <SelectField
            label={t("workspace.standalone.duration")}
            value={String(form.videoDuration)}
            options={durations.map(String)}
            onChange={(videoDuration) =>
              onChange({ videoDuration: Number(videoDuration) || 5 })
            }
          />
          {videoResolutionOptionsForModel(form.model).length > 0 && (
            <SelectField
              label={t("workspace.standalone.resolution")}
              value={form.videoResolution}
              options={videoResolutionOptionsForModel(form.model)}
              onChange={(videoResolution) => onChange({ videoResolution })}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label={t("workspace.standalone.orientation")}
            value={form.videoCharacterOrientation}
            options={["image", "video"]}
            onChange={(videoCharacterOrientation) =>
              onChange({
                videoCharacterOrientation:
                  videoCharacterOrientation === "video" ? "video" : "image",
              })
            }
          />
        </div>
      )}
      {supportsAudioToggle && (
        <ToggleRow
          label={t("workspace.standalone.generate_audio")}
          checked={form.videoWithAudio}
          onChange={(videoWithAudio) => onChange({ videoWithAudio })}
        />
      )}
      {(isMotion || form.model === "kling-v3-omni" || form.model === "replicate-kling-v3-omni") && supportsRefVideo && (
        <ToggleRow
          label={t("workspace.standalone.keep_original_sound")}
          checked={form.videoKeepOriginalSound}
          onChange={(videoKeepOriginalSound) =>
            onChange({ videoKeepOriginalSound })
          }
        />
      )}
    </>
  );
}

/** Standalone tool voice panel — model-driven layout per Freepik /
 *  ElevenLabs studio convention.
 *
 *  Voice list and parameter widgets follow the SELECTED MODEL above
 *  (no separate provider tabs):
 *
 *    elevenlabs-multilingual-v2 / -turbo-v2-5
 *      → Voices fetched live from `voice-list` edge fn (the user's
 *        ElevenLabs account voices, real not sample)
 *      → Params: Voice Style chip (Expressive / Neutral / Consistent),
 *                Speed slider (0.7×–1.2×), Stability slider (0–100%),
 *                Similarity slider (0–100%), Style amount slider
 *
 *    gemini-2.5-pro-preview-tts
 *      → 30 official Gemini prebuilt voices (Achernar, Charon, …)
 *      → Params: free-form Voice instructions textarea
 *
 *    google-tts-studio
 *      → Google Cloud TTS Studio + Neural2 voices for English,
 *        Standard / WaveNet for Thai (Google's actual catalog)
 *      → Params: Voice instructions textarea (mapped to SSML
 *                <prosody> on the backend)
 */
type VoiceProviderKind = "elevenlabs" | "gemini" | "google";

interface VoiceTile {
  id: string;
  name: string;
  characteristic: string;
  tint: string;
}

function inferVoiceProvider(model: string): VoiceProviderKind {
  if (model.startsWith("elevenlabs-") || model.startsWith("eleven_")) {
    return "elevenlabs";
  }
  if (model.startsWith("gemini-")) return "gemini";
  return "google";
}

/** Tints for the dynamic-fetch ElevenLabs grid. The hardcoded
 *  catalog files are gone; we generate a colour from the voice name
 *  hash so each tile still gets a stable colour without needing to
 *  ship a static tint table. */
const TINT_PALETTE: Record<string, string> = {
  violet: "linear-gradient(135deg, hsl(64 100% 42%), hsl(72 100% 28%))",
  rose:   "linear-gradient(135deg, hsl(345 75% 50%), hsl(345 65% 32%))",
  amber:  "linear-gradient(135deg, hsl(35 80% 50%), hsl(35 70% 32%))",
  emerald:"linear-gradient(135deg, hsl(160 65% 38%), hsl(160 60% 22%))",
  sky:    "linear-gradient(135deg, hsl(205 75% 45%), hsl(205 65% 28%))",
  zinc:   "linear-gradient(135deg, hsl(0 0% 35%), hsl(0 0% 22%))",
};

function VoiceControls({
  form,
  onChange,
}: {
  form: StandaloneFormState;
  onChange: (patch: Partial<StandaloneFormState>) => void;
}) {
  const { t } = useLanguage();
  return (
    <>
      <PromptBox
        label={t("workspace.standalone.script")}
        placeholder={t("workspace.standalone.script_placeholder")}
        value={form.script}
        onChange={(script) => onChange({ script })}
        minRows={7}
        maxLength={5000}
      />
      <VoiceSettingsControls form={form} onChange={onChange} />
    </>
  );
}

function VoiceSettingsControls({
  form,
  onChange,
}: {
  form: StandaloneFormState;
  onChange: (patch: Partial<StandaloneFormState>) => void;
}) {
  const { t } = useLanguage();
  const provider = inferVoiceProvider(form.model);

  // ElevenLabs voice catalog — pulled live from the user's account
  // via the voice-list edge fn (no hardcoded preset list).
  const [elevenVoices, setElevenVoices] = useState<VoiceTile[] | null>(null);
  const [elevenLoading, setElevenLoading] = useState(false);
  const [elevenError, setElevenError] = useState<string | null>(null);

  useEffect(() => {
    if (provider !== "elevenlabs") return;
    if (elevenVoices !== null || elevenLoading) return;
    let cancelled = false;
    setElevenLoading(true);
    setElevenError(null);
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("voice-list", {
          body: { provider: "elevenlabs" },
        });
        if (cancelled) return;
        const payload = data as
          | { voices?: Array<{
              id: string;
              name: string;
              description?: string;
              accent?: string | null;
              category?: string;
            }>; error?: string }
          | null;
        if (error || payload?.error || !payload?.voices) {
          const msg =
            payload?.error ??
            (error as { message?: string } | null)?.message ??
            "Couldn't load ElevenLabs voices";
          setElevenError(msg);
          setElevenVoices([]);
          return;
        }
        const tiles: VoiceTile[] = payload.voices.map((v) => ({
          id: v.id,
          name: v.name,
          characteristic:
            (v.description || v.accent || v.category || "").slice(0, 90),
          tint: pickTintFromName(v.name),
        }));
        setElevenVoices(tiles);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setElevenError(msg);
        setElevenVoices([]);
      } finally {
        if (!cancelled) setElevenLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [provider, elevenVoices, elevenLoading]);

  // Reset voice id when switching providers so hidden/provider-specific
  // voice values never leak into another provider's request shape.
  useEffect(() => {
    onChange({ voice: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  return (
    <>
      {provider === "elevenlabs" && (
        // ElevenLabs: live grid of the user's account voices. No
        // hardcoded preset catalog — what's in the API is what we show.
        <div>
          <FieldLabel
            label={t("workspace.standalone.voice")}
            meta={
              elevenLoading
                ? t("workspace.standalone.loading")
                : elevenVoices?.length
                  ? t("workspace.standalone.from_account", {
                      count: elevenVoices.length,
                    })
                  : "ElevenLabs"
            }
          />
          {elevenError && (
            <div className="mt-2 rounded-md border border-red-400/20 bg-red-500/[0.06] px-2.5 py-2 text-[11px] text-red-300">
              {elevenError}
            </div>
          )}
          {elevenLoading && (
            <div className="mt-2 rounded-md bg-white/[0.04] px-2.5 py-2 text-[11px] text-zinc-500">
              {t("workspace.standalone.loading_elevenlabs")}
            </div>
          )}
          {!elevenLoading && elevenVoices && elevenVoices.length === 0 && !elevenError && (
            <div className="mt-2 rounded-md bg-white/[0.04] px-2.5 py-2 text-[11px] text-zinc-500">
              {t("workspace.standalone.no_elevenlabs_voices")}
            </div>
          )}
          {elevenVoices && elevenVoices.length > 0 && (
            <div className="standalone-voice-controls ws-scroll-hide mt-[6px] grid max-h-[184px] grid-cols-2 gap-[5px] overflow-y-auto pr-0.5">
              {elevenVoices.map((voice) => {
                const active = voice.id === form.voice;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => onChange({ voice: voice.id })}
                    className={cn(
                      "standalone-voice-card flex min-h-[50px] flex-col items-start justify-between rounded-lg border border-dashed px-[9px] py-[6px] text-left transition",
                      active
                        ? "border-amber-300/50 bg-amber-300/10"
                        : "border-white/[0.12] bg-[#242424] hover:bg-[#2d2d2d]",
                    )}
                  >
                    <span
                      className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                      style={{
                        background:
                          TINT_PALETTE[voice.tint] ?? TINT_PALETTE.zinc,
                      }}
                    >
                      {voice.name.charAt(0)}
                    </span>
                    <span className="min-w-0 w-full">
                      <span className="block truncate text-[12px] font-bold leading-[15px] text-white">
                        {voice.name}
                      </span>
                      <span className="block truncate text-[10.5px] leading-[13px] text-zinc-500">
                        {voice.characteristic}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Per-model parameter widgets ─────────────────────── */}
      {provider === "elevenlabs" && (
        <ElevenLabsVoiceParams form={form} onChange={onChange} />
      )}
      {provider === "gemini" && (
        <GeminiVoicePicker
          value={form.voice || DEFAULT_GEMINI_TTS_VOICE}
          modelId={form.model}
          onChange={(voice) => onChange({ voice })}
        />
      )}
      {provider === "gemini" && (
        <GeminiAudioTagsPanel
          emotion={form.audioTagsEmotion}
          personality={form.audioTagsPersonality}
          speed={form.audioSpeed}
          onChangeEmotion={(audioTagsEmotion) => onChange({ audioTagsEmotion })}
          onChangePersonality={(audioTagsPersonality) =>
            onChange({ audioTagsPersonality })
          }
          onChangeSpeed={(audioSpeed) => onChange({ audioSpeed })}
        />
      )}
      {provider !== "elevenlabs" && (
        <TextInputField
          label={t("workspace.standalone.voice_instructions")}
          value={form.voiceStyle}
          placeholder={
            provider === "gemini"
              ? t("workspace.standalone.voice_instructions_gemini_placeholder")
              : t("workspace.standalone.voice_instructions_google_placeholder")
          }
          onChange={(voiceStyle) => onChange({ voiceStyle })}
        />
      )}
    </>
  );
}

/** Gemini 3.1 / 2.5 Pro TTS voice picker — 30 official preset speakers
 *  shipped by Google. We keep the same compact grid feel as the
 *  ElevenLabs picker so the voice gen panel reads consistently. The
 *  voice list lives in `workspaceSchema.GEMINI_TTS_VOICES` and is
 *  validated server-side by `executeGeminiTts`.
 *
 *  Each card hosts a ▶ button that hits the `voice-preview` edge
 *  function for a 12-word sample of that speaker — cached per-voice
 *  in Storage so the second click is an instant CDN hit. */
function GeminiVoicePicker({
  value,
  modelId,
  onChange,
}: {
  value: string;
  modelId: string;
  onChange: (voiceName: string) => void;
}) {
  const { playingId, loadingId, play } = useVoicePreview("gemini");
  const handlePreview = async (event: React.MouseEvent, voiceName: string) => {
    event.stopPropagation();
    try {
      await play(voiceName, { modelId });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't play voice preview",
      );
    }
  };
  return (
    <div>
      <FieldLabel
        label="Voice"
        meta={`${GEMINI_TTS_VOICES.length} preset speakers`}
      />
      <div className="standalone-voice-controls ws-scroll-hide mt-[6px] grid max-h-[184px] grid-cols-3 gap-[5px] overflow-y-auto pr-0.5">
        {GEMINI_TTS_VOICES.map((voiceName) => {
          const active = value === voiceName;
          const isPlaying = playingId === voiceName;
          const isLoading = loadingId === voiceName;
          return (
            <button
              key={voiceName}
              type="button"
              onClick={() => onChange(voiceName)}
              className={cn(
                "standalone-voice-card relative flex min-h-[44px] flex-col items-start justify-center rounded-lg border border-dashed px-[9px] py-[5px] pr-[32px] text-left transition",
                active
                  ? "border-amber-300/50 bg-amber-300/10"
                  : "border-white/[0.12] bg-[#242424] hover:bg-[#2d2d2d]",
              )}
            >
              <span
                className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                style={{
                  background:
                    TINT_PALETTE[pickTintFromName(voiceName)] ?? TINT_PALETTE.zinc,
                }}
              >
                {voiceName.charAt(0)}
              </span>
              <span className="mt-[5px] block w-full truncate text-[12px] font-bold leading-[15px] text-white">
                {voiceName}
              </span>
              {/* Preview ▶ — sits in the top-right of the card. We
               *  render a real <span role="button"> instead of a nested
               *  <button> because nested buttons are invalid HTML and
               *  cause hydration warnings. The outer card click is
               *  stopped via the handler, so card selection only fires
               *  when the user clicks the body of the card, not the
               *  preview affordance. */}
              <span
                role="button"
                tabIndex={0}
                aria-label={isPlaying ? `Stop ${voiceName} preview` : `Play ${voiceName} preview`}
                onClick={(e) => void handlePreview(e, voiceName)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    void handlePreview(e as unknown as React.MouseEvent, voiceName);
                  }
                }}
                className={cn(
                  "absolute right-[7px] top-[7px] grid h-[25px] w-[25px] cursor-pointer place-items-center rounded-full transition",
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
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Gemini audio-tag picker — emotion + personality chips (multi-
 *  select) + a 3-stop speed segment. Selections compose a bracketed
 *  prefix that gets prepended to the script before the run request
 *  (see `composeGeminiAudioTagPrefix`). The user can still type
 *  inline `[whispers]` etc. directly in the script for finer control;
 *  this panel covers the common, "set the whole clip's vibe" case
 *  with no manual typing.
 *
 *  Live preview shows the exact bracket prefix that will be sent so
 *  there's no surprise about what tags reach Gemini. */
function GeminiAudioTagsPanel({
  emotion,
  personality,
  speed,
  onChangeEmotion,
  onChangePersonality,
  onChangeSpeed,
}: {
  emotion: string[];
  personality: string[];
  speed: "very_slow" | "normal" | "very_fast";
  onChangeEmotion: (next: string[]) => void;
  onChangePersonality: (next: string[]) => void;
  onChangeSpeed: (next: "very_slow" | "normal" | "very_fast") => void;
}) {
  const toggle = (
    list: string[],
    tag: string,
    onChange: (next: string[]) => void,
  ) => {
    onChange(list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);
  };
  const prefix = composeGeminiAudioTagPrefix({ emotion, personality, speed });
  return (
    <div className="standalone-voice-controls rounded-[12px] bg-white/[0.04] px-[10px] py-[8px]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        Audio tags
      </div>
      <p className="mt-[3px] text-[11.5px] leading-[14px] text-zinc-500">
        เลือกอารมณ์ / บุคลิก / ความเร็ว — Gemini จะใช้ tag ในวงเล็บเพื่อปรับการอ่าน
      </p>

      <TagChipRow
        title="อารมณ์ / Emotion"
        items={GEMINI_EMOTION_TAGS}
        selected={emotion}
        onToggle={(tag) => toggle(emotion, tag, onChangeEmotion)}
      />
      <TagChipRow
        title="บุคลิก / Personality"
        items={GEMINI_PERSONALITY_TAGS}
        selected={personality}
        onToggle={(tag) => toggle(personality, tag, onChangePersonality)}
      />

      <div className="mt-[7px]">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
          ความเร็ว / Speed
        </div>
        <div className="mt-[5px] inline-flex min-h-[32px] w-full items-center gap-1 rounded-lg bg-white/[0.04] p-0.5 text-[12px]">
          {GEMINI_SPEED_OPTIONS.map((opt) => {
            const active = speed === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeSpeed(opt.id)}
                className={cn(
                  "flex-1 rounded-md px-2 py-[5px] text-center leading-[13px] transition-colors",
                  active
                    ? "bg-white/[0.10] text-zinc-50"
                    : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {prefix ? (
        <div className="mt-[7px] rounded-md bg-black/35 px-2.5 py-1.5 font-mono text-[11px] leading-[13px] text-amber-200/90">
          {prefix} <span className="text-zinc-500">+ script</span>
        </div>
      ) : (
        <div className="mt-[7px] text-[11px] leading-[14px] italic text-zinc-600">
          (ยังไม่ได้เลือก audio tag — Gemini จะอ่านตาม voice ที่เลือกอย่างเดียว)
        </div>
      )}
    </div>
  );
}

function TagChipRow({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: Array<{ tag: string; label: string; sub: string }>;
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <div className="mt-[7px]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        {title}
      </div>
      <div className="mt-[5px] flex flex-wrap gap-[5px]">
        {items.map((item) => {
          const active = selected.includes(item.tag);
          return (
            <button
              key={item.tag}
              type="button"
              onClick={() => onToggle(item.tag)}
              title={item.sub}
              className={cn(
                "rounded-full px-[9px] py-[5px] text-[12px] font-medium leading-[13px] transition-colors",
                active
                  ? "bg-amber-300/20 text-amber-200 ring-1 ring-amber-300/30"
                  : "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.10] hover:text-white",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** ElevenLabs param panel — Style preset chip + 4 numeric sliders.
 *  Shape mirrors ElevenLabs' own studio UI so a Freepik / ElevenLabs
 *  user feels at home. Each slider's range is the documented API
 *  bound (0–1 for stability/similarity/style, 0.7–1.2 for speed). */
function ElevenLabsVoiceParams({
  form,
  onChange,
}: {
  form: StandaloneFormState;
  onChange: (patch: Partial<StandaloneFormState>) => void;
}) {
  const { t } = useLanguage();
  const presets: Array<{ id: StandaloneFormState["voiceStylePreset"]; label: string }> = [
    { id: "expressive", label: t("workspace.standalone.voice_style_expressive") },
    { id: "neutral", label: t("workspace.standalone.voice_style_neutral") },
    { id: "consistent", label: t("workspace.standalone.voice_style_consistent") },
  ];

  return (
    <div className="standalone-voice-controls rounded-[12px] bg-white/[0.04] px-[10px] py-[8px]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        {t("workspace.standalone.voice_style")}
      </div>
      <div className="mt-[5px] inline-flex min-h-[32px] w-full items-center gap-1 rounded-lg bg-white/[0.04] p-0.5 text-[12px]">
        {presets.map((p) => {
          const active = form.voiceStylePreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ voiceStylePreset: p.id })}
              className={cn(
                "flex-1 rounded-md px-2 py-[5px] text-center leading-[13px] transition-colors",
                active
                  ? "bg-white/[0.10] text-zinc-50"
                  : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <RangeSlider
        label={t("workspace.standalone.speed")}
        meta={`${form.voiceSpeed.toFixed(2)}×`}
        min={0.7}
        max={1.2}
        step={0.05}
        value={form.voiceSpeed}
        onChange={(voiceSpeed) => onChange({ voiceSpeed })}
      />
      <RangeSlider
        label={t("workspace.standalone.stability")}
        meta={`${Math.round(form.voiceStability * 100)}%`}
        min={0}
        max={1}
        step={0.05}
        value={form.voiceStability}
        onChange={(voiceStability) => onChange({ voiceStability })}
      />
      <RangeSlider
        label={t("workspace.standalone.similarity")}
        meta={`${Math.round(form.voiceSimilarity * 100)}%`}
        min={0}
        max={1}
        step={0.05}
        value={form.voiceSimilarity}
        onChange={(voiceSimilarity) => onChange({ voiceSimilarity })}
      />
      <RangeSlider
        label={t("workspace.standalone.style_amount")}
        meta={`${Math.round(form.voiceStyleAmount * 100)}%`}
        min={0}
        max={1}
        step={0.05}
        value={form.voiceStyleAmount}
        onChange={(voiceStyleAmount) => onChange({ voiceStyleAmount })}
      />
    </div>
  );
}

/** Pick a tint key from a voice name's first letter — keeps the
 *  ElevenLabs avatar circle from being a uniform grey when the API
 *  doesn't tell us anything about colour. Distribution is even
 *  enough across the alphabet for most catalogs. */
function pickTintFromName(name: string): string {
  const tints = ["violet", "rose", "amber", "emerald", "sky", "zinc"];
  const i = (name.charCodeAt(0) || 0) % tints.length;
  return tints[i];
}

function RangeSlider({
  label,
  meta,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  meta?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-[7px]">
      <div className="flex items-center justify-between text-[11px] font-medium leading-[13px] text-zinc-300">
        <span>{label}</span>
        {meta && <span className="text-zinc-500">{meta}</span>}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-[5px] h-1 w-full cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-amber-300 outline-none"
      />
    </div>
  );
}

function StandaloneMultiShotBuilder({
  scenes,
  onChange,
  mentionOptions,
}: {
  scenes: StandaloneSceneBlock[];
  onChange: (scenes: StandaloneSceneBlock[]) => void;
  mentionOptions: PanelReferenceAsset[];
}) {
  const { t } = useLanguage();
  const effectiveScenes =
    scenes.length > 0 ? scenes : [{ ...DEFAULT_STANDALONE_MULTISHOT_SCENE }];
  const totalDuration = effectiveScenes.reduce(
    (sum, scene) => sum + Number(scene.duration || 0),
    0,
  );

  const updateScene = (
    index: number,
    field: keyof StandaloneSceneBlock,
    value: string | number,
  ) => {
    onChange(
      effectiveScenes.map((scene, sceneIndex) =>
        sceneIndex === index ? { ...scene, [field]: value } : scene,
      ),
    );
  };

  const addScene = () => {
    if (effectiveScenes.length >= STANDALONE_MULTISHOT_MAX_SCENES) return;
    onChange([...effectiveScenes, { prompt: "", duration: 2 }]);
  };

  const removeScene = (index: number) => {
    if (effectiveScenes.length <= 1) return;
    onChange(effectiveScenes.filter((_, sceneIndex) => sceneIndex !== index));
  };

  return (
    <section className="shrink-0 rounded-[16px] border border-white/[0.025] bg-[#16181a] p-[9px] shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
      <div className="flex items-center justify-between rounded-[12px] border border-yellow-400/20 bg-[linear-gradient(90deg,rgba(238,255,0,.12),rgba(238,255,0,.035))] px-[10px] py-[8px]">
        <div className="flex min-w-0 items-center gap-[8px]">
          <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[8px] border border-yellow-300/30 bg-yellow-400/15 text-yellow-200">
            <Film className="h-[13px] w-[13px]" />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="text-[12px] font-semibold leading-[16px] text-white">
              {t("multiShot.directorMode")}
            </div>
            <div className="mt-[1px] text-[10px] font-mono leading-[13px] text-white/45">
              {t("multiShot.storyboardScenes", {
                count: effectiveScenes.length,
                max: STANDALONE_MULTISHOT_MAX_SCENES,
              })}
            </div>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-[4px] rounded-full bg-yellow-400/15 px-[8px] py-[3px] text-[10.5px] font-semibold leading-[14px] text-yellow-100">
          <Clock className="h-[12px] w-[12px]" />
          {t("multiShot.totalDuration", { seconds: totalDuration })}
        </span>
      </div>

      <div className="mt-[8px]">
        <div className="flex h-[5px] gap-[2px]">
          {effectiveScenes.map((scene, index) => (
            <span
              key={`${index}-${scene.duration}`}
              className="rounded-[2px] bg-yellow-400/80"
              style={{ flex: Math.max(Number(scene.duration) || 1, 0.5) }}
            />
          ))}
        </div>
      </div>

      <div className="mt-[9px] space-y-[8px]">
        {effectiveScenes.map((scene, index) => (
          <div
            key={index}
            className="relative overflow-hidden rounded-[12px] border border-white/[0.05] bg-[#121314] p-[8px] pl-[10px]"
          >
            <span className="absolute left-0 top-0 h-full w-[3px] bg-yellow-400/70" />
            <div className="flex items-start gap-[8px]">
              <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] border border-white/[0.08] bg-[linear-gradient(135deg,rgba(238,255,0,.75),rgba(244,255,0,.35))] text-[12px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.16)]">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-[6px] flex items-center justify-between gap-[8px]">
                  <div className="flex min-w-0 items-center gap-[5px]">
                    <GripVertical className="h-[12px] w-[12px] shrink-0 text-white/30" />
                    <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-yellow-200">
                      {t("multiShot.sceneNumber", {
                        number: String(index + 1).padStart(2, "0"),
                      })}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-[5px]">
                    <label className="inline-flex h-[24px] items-center gap-[4px] rounded-[7px] border border-white/[0.08] bg-white/[0.04] px-[6px] text-[10.5px] font-semibold leading-[14px] text-white/85">
                      <input
                        type="number"
                        min={STANDALONE_MULTISHOT_MIN_DURATION}
                        max={15}
                        step={1}
                        value={scene.duration}
                        onChange={(event) =>
                          updateScene(
                            index,
                            "duration",
                            Math.max(
                              STANDALONE_MULTISHOT_MIN_DURATION,
                              Math.min(15, Number(event.target.value) || 1),
                            ),
                          )
                        }
                        className="w-[24px] border-0 bg-transparent text-right font-mono text-[10.5px] text-white outline-none"
                      />
                      <span className="text-white/45">{t("multiShot.secondsSuffix")}</span>
                    </label>
                    {effectiveScenes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeScene(index)}
                        className="grid h-[24px] w-[24px] place-items-center rounded-[7px] text-white/35 transition hover:bg-red-500/10 hover:text-red-300"
                        title={t("multiShot.removeScene")}
                      >
                        <Trash2 className="h-[12px] w-[12px]" />
                      </button>
                    )}
                  </div>
                </div>
                <StandalonePromptMentionTextarea
                  value={scene.prompt}
                  onChange={(prompt) => updateScene(index, "prompt", prompt)}
                  placeholder={t("multiShot.scenePromptPlaceholder", {
                    scene: index + 1,
                  })}
                  mentionOptions={mentionOptions}
                  className="min-h-[46px] max-h-[136px] rounded-[9px] border-white/[0.06] bg-[#0f1011] px-[8px] py-[7px] text-[12px] leading-[18px] text-white placeholder:text-neutral-500 focus:border-yellow-400/50"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {effectiveScenes.length < STANDALONE_MULTISHOT_MAX_SCENES && (
        <button
          type="button"
          onClick={addScene}
          className="mt-[8px] flex h-[34px] w-full items-center justify-center gap-[6px] rounded-[10px] border border-dashed border-yellow-400/30 bg-yellow-500/[0.03] text-[12px] font-semibold text-yellow-200 transition hover:border-yellow-300/55 hover:bg-[#e7ff12]/[0.08]"
        >
          <Plus className="h-[14px] w-[14px]" />
          {t("multiShot.addScene", {
            count: effectiveScenes.length,
            max: STANDALONE_MULTISHOT_MAX_SCENES,
          })}
        </button>
      )}
    </section>
  );
}

function ThreeDControls({
  form,
  onChange,
  uploading,
  onUpload,
}: {
  form: StandaloneFormState;
  onChange: (patch: Partial<StandaloneFormState>) => void;
  uploading: boolean;
  onUpload: () => void;
}) {
  const { t } = useLanguage();
  return (
    <>
      <SingleReferenceButton
        label={t("workspace.standalone.reference_image")}
        refItem={form.modelImage}
        uploading={uploading}
        onUpload={onUpload}
        onRemove={() => onChange({ modelImage: null })}
        tall
      />
      <ToggleRow
        label={t("workspace.standalone.texture")}
        checked={form.texture}
        onChange={(texture) => onChange({ texture })}
      />
      <ToggleRow
        label={t("workspace.standalone.pbr_materials")}
        checked={form.pbr}
        onChange={(pbr) => onChange({ pbr })}
      />
    </>
  );
}

function PromptBox({
  label,
  value,
  placeholder,
  onChange,
  minRows = 6,
  maxLength,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  minRows?: number;
  maxLength?: number;
}) {
  return (
    <div>
      <FieldLabel
        label={label}
        meta={maxLength ? `${value.length} / ${maxLength}` : undefined}
      />
      <textarea
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        rows={minRows}
        placeholder={placeholder}
        className="mt-2 min-h-[126px] w-full resize-none rounded-2xl border border-[var(--border-faint)] bg-[var(--bg-panel)] px-3 py-3 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-[var(--text-tertiary)] transition focus:border-[var(--brand-primary)]/40 focus:bg-[var(--bg-surface-2)] focus:shadow-[0_0_0_1px_rgba(238,255,0,.18),0_8px_24px_-16px_rgba(238,255,0,.45)]"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <label className={cn("block", disabled && "opacity-50")}>
      <FieldLabel label={label} />
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-xl border border-[var(--border-faint)] bg-[var(--bg-panel)] px-3 text-[12px] font-semibold text-white outline-none transition hover:bg-[var(--bg-surface-2)] focus:border-[var(--brand-primary)]/40 disabled:cursor-not-allowed"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-zinc-950">
            {standaloneOptionLabel(option, t)}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextInputField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <FieldLabel label={label} />
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-xl border border-[var(--border-faint)] bg-[var(--bg-panel)] px-3 text-[12px] text-white outline-none placeholder:text-[var(--text-tertiary)] transition focus:border-[var(--brand-primary)]/40"
      />
    </label>
  );
}

function StyleReferenceTray({
  styleId,
  onStyleChange,
  refs,
  max,
  uploading,
  uploadingCharacter,
  onUpload,
  onUploadCharacter,
  onRemove,
}: {
  styleId: string;
  onStyleChange: (styleId: string) => void;
  refs: UploadedRef[];
  max: number;
  uploading: boolean;
  uploadingCharacter: boolean;
  onUpload: () => void;
  onUploadCharacter: () => void;
  onRemove: (id: string) => void;
}) {
  const { t, language } = useLanguage();
  const [styleOpen, setStyleOpen] = useState(false);
  const selectedStyle =
    IMAGE_STYLE_PRESETS.find((preset) => preset.id === styleId) ??
    IMAGE_STYLE_PRESETS[0];
  /* Character button toggles between "upload" (no active character)
   *  and "active / replace" — when a character ref already exists,
   *  the button shows the thumbnail with a violet ring so the user
   *  can see the model has an identity to lock onto. Clicking it
   *  again replaces the current character with a new upload. */
  const characterRef = refs.find((ref) => ref.role === "character");
  const characterActive = Boolean(characterRef);
  const optionalText = language === "th" ? "ไม่บังคับ" : "Optional";

  return (
    <div className="relative">
      <div className="mt-2 rounded-2xl bg-gradient-to-br from-[var(--brand-primary)]/30 via-[var(--brand-deep)]/20 to-transparent p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,.1),0_0_24px_-6px_rgba(238,255,0,.4)] ring-1 ring-[var(--brand-primary)]/50 transition-all duration-300 hover:ring-[var(--brand-soft)]/70">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">
                {t("workspace.standalone.references")}
              </span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-default)]">
                {optionalText}
              </span>
            </div>
            <span className="mt-0.5 text-xs text-[var(--text-default)]">
              JPEG/PNG/WEBP/GIF, 50 MB max
            </span>
          </div>
          <span className="text-xs text-[var(--text-default)]">{refs.length}/{max}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStyleOpen((open) => !open)}
          className={cn(
            "flex h-[58px] w-[72px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[12px] text-zinc-300 outline-none ring-1 ring-inset ring-[var(--brand-primary)]/10 transition-all duration-300 hover:bg-white/10 hover:text-white focus-visible:ring-[var(--brand-soft)]/60",
            selectedStyle.id !== "none"
              ? "bg-[radial-gradient(40%_21%_at_50%_0%,rgba(255,255,255,.37)_0%,rgba(238,255,0,0)_100%),radial-gradient(64%_127%_at_51%_189%,rgba(238,255,0,.85)_0%,rgba(238,255,0,.14)_75%,rgba(238,255,0,0)_100%),var(--bg-panel)] text-white shadow-[inset_0_0_0_1px_rgba(238,255,0,.35),0_6px_24px_-8px_rgba(238,255,0,.55)]"
              : "bg-white/[0.04]",
          )}
        >
          <Sparkles className="h-4 w-4" />
          <span className="max-w-full truncate px-1 text-[11px] font-medium">
            {selectedStyle.id === "none"
              ? t("workspace.standalone.style")
              : standaloneStyleLabel(selectedStyle.id, selectedStyle.label, t)}
          </span>
        </button>
        <button
          type="button"
          onClick={onUploadCharacter}
          disabled={uploadingCharacter || (refs.length >= max && !characterActive)}
          /* Active state: violet ring + thumb preview so the user
           *  visually confirms identity is locked. Replacing? Click
           *  the button again — the upload handler swaps the previous
           *  character ref out. */
          className={cn(
            "relative flex h-[58px] w-[72px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[12px] text-zinc-300 outline-none ring-1 ring-inset ring-[var(--brand-primary)]/10 transition-all duration-300 focus-visible:ring-[var(--brand-soft)]/60 disabled:opacity-60",
            characterActive
              ? "bg-[radial-gradient(40%_21%_at_50%_0%,rgba(255,255,255,.32)_0%,rgba(238,255,0,0)_100%),radial-gradient(62%_123%_at_56%_-62%,rgba(244,255,0,.65)_0%,rgba(244,255,0,.14)_75%,rgba(244,255,0,0)_100%),var(--bg-panel)] text-white shadow-[0_6px_24px_-8px_rgba(238,255,0,.55)]"
              : "bg-white/[0.04] hover:bg-white/10 hover:text-white",
          )}
          title={
            characterActive
              ? t("workspace.standalone.character_locked_title")
              : t("workspace.standalone.character_upload_title")
          }
        >
          {characterActive && characterRef && (
            <img
              src={characterRef.url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-30"
            />
          )}
          <span className="relative flex flex-col items-center gap-1.5">
            {uploadingCharacter ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserRound className="h-4 w-4" />
            )}
            <span className="text-[11px] font-medium">
              {t("workspace.standalone.character")}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onUpload}
          disabled={uploading || refs.length >= max}
          className="flex h-[58px] w-[72px] flex-col items-center justify-center gap-1.5 rounded-[12px] bg-white/[0.04] text-zinc-300 outline-none ring-1 ring-inset ring-[var(--brand-primary)]/10 transition-all duration-300 hover:bg-white/10 hover:text-white focus-visible:ring-[var(--brand-soft)]/60 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span className="text-[11px] font-medium">
            {t("workspace.standalone.add")}
          </span>
        </button>
        </div>
      {refs.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-2">
          {refs.slice(0, 8).map((ref) => {
            const isCharacter = ref.role === "character";
            return (
              <div
                key={ref.id}
                className={cn(
                  "group relative aspect-square overflow-hidden rounded-lg bg-black/30",
                  /* Visual thread: the badge on the thumbnail mirrors
                   *  the violet hue on the Character button so the
                   *  user can match thumb → role at a glance. */
                  isCharacter && "ring-2 ring-yellow-400/60",
                )}
              >
                <img src={ref.url} alt="" className="h-full w-full object-cover" />
                {isCharacter && (
                  <span
                    className="absolute left-1 top-1 flex items-center gap-0.5 rounded bg-[#f4ff00]/90 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black"
                    title={t("workspace.standalone.character_reference_title")}
                  >
                    <UserRound className="h-2.5 w-2.5" />
                    {t("workspace.standalone.character_badge")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(ref.id)}
                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded bg-black/70 text-zinc-200"
                  aria-label={t("workspace.standalone.remove_reference")}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      </div>
      {styleOpen && (
        <div className="absolute left-0 right-0 top-[154px] z-40 rounded-2xl border border-[var(--border-overlay)] bg-[var(--bg-overlay)] p-2 shadow-2xl shadow-black/70">
          {IMAGE_STYLE_PRESETS.map((style) => {
            const active = style.id === styleId;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => {
                  onStyleChange(style.id);
                  setStyleOpen(false);
                }}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl p-2 text-left transition",
                  active ? "bg-[var(--brand-primary)]/20" : "hover:bg-white/[0.05]",
                )}
              >
                <span
                  className="h-10 w-10 shrink-0 rounded-lg"
                  style={{ background: style.preview }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-bold text-white">
                    {standaloneStyleLabel(style.id, style.label, t)}
                  </span>
                  <span className="line-clamp-1 text-[11px] text-zinc-500">
                    {standaloneStyleDescription(style.id, style.description, t)}
                  </span>
                </span>
                <span className="ml-auto rounded bg-white/[0.08] px-1.5 py-0.5 text-[9px] font-bold uppercase text-zinc-400">
                  {standaloneStyleChip(style.id, style.chip, t)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex h-10 w-full items-center justify-between rounded-xl border border-[var(--border-faint)] bg-[var(--bg-panel)] px-3 transition hover:bg-[var(--bg-surface-2)]"
    >
      <span className="text-[12px] font-semibold text-zinc-200">{label}</span>
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition",
          checked ? "bg-[var(--brand-primary)] shadow-[0_0_18px_-8px_rgba(238,255,0,.8)]" : "bg-zinc-700",
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-3 w-3 rounded-full bg-white transition",
            checked ? "left-5" : "left-1",
          )}
        />
      </span>
    </button>
  );
}

function ReferenceTray({
  label,
  refs,
  max,
  uploading,
  onUpload,
  onRemove,
}: {
  label: string;
  refs: UploadedRef[];
  max: number;
  uploading: boolean;
  onUpload: () => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div>
      <FieldLabel label={label} meta={`${refs.length}/${max}`} />
      <div className="mt-2 grid grid-cols-3 gap-2">
        {refs.map((ref) => (
          <div
            key={ref.id}
            className="group relative aspect-square overflow-hidden rounded-xl bg-white/[0.06]"
          >
            <img src={ref.url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onRemove(ref.id)}
              className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-lg bg-black/70 text-zinc-200"
              aria-label={t("workspace.standalone.remove_reference")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {refs.length < max && (
          <button
            type="button"
            onClick={onUpload}
            disabled={uploading}
            className="grid aspect-square place-items-center rounded-xl border border-dashed border-white/15 bg-white/[0.03] text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ImagePlus className="h-5 w-5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function SingleReferenceButton({
  label,
  refItem,
  uploading,
  onUpload,
  onRemove,
  tall,
}: {
  label: string;
  refItem: UploadedRef | null;
  uploading: boolean;
  onUpload: () => void;
  onRemove: () => void;
  tall?: boolean;
}) {
  const isVideo = refItem?.mime.startsWith("video/");

  return (
    <div>
      <FieldLabel label={label} />
      <div
        className={cn(
          "mt-2 overflow-hidden rounded-2xl border border-[var(--brand-primary)]/30 bg-gradient-to-br from-[var(--brand-primary)]/18 via-[var(--brand-deep)]/12 to-transparent shadow-[inset_0_1px_0_0_rgba(255,255,255,.08),0_0_22px_-10px_rgba(238,255,0,.5)]",
          tall ? "aspect-square" : "h-16",
        )}
      >
        {refItem ? (
          <div className="relative h-full w-full">
            {isVideo ? (
              <video
                src={refItem.url}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
            ) : (
              <img
                src={refItem.url}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
            <button
              type="button"
              onClick={onRemove}
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-black/70 text-zinc-200"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onUpload}
            disabled={uploading}
            className="grid h-full w-full place-items-center text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function CreationFeed({
  jobs,
  loading,
  onDeleteJob,
}: {
  jobs: StandaloneJobRow[];
  loading: boolean;
  onDeleteJob: (job: StandaloneJobRow) => void;
}) {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [statusFilter, setStatusFilter] = useState<CreationStatusFilter>("all");
  const { language, t } = useLanguage();
  const onStandaloneCropConfirmed = (blob: Blob, filename: string) => {
    const cleanName = filename.replace(/\.[a-z0-9]{2,5}$/i, "") || "crop";
    triggerBlobDownload(blob, buildDownloadFilename(cleanName, "png"));
    toast.success(t("workspace.stock.download_started"));
  };
  const visibleJobs = useMemo(
    () => jobs.filter((job) => creationStatusMatches(job, statusFilter)),
    [jobs, statusFilter],
  );
  const statusFilters: Array<{ id: CreationStatusFilter; label: string }> = [
    { id: "all", label: language === "th" ? "ทั้งหมด" : "All" },
    { id: "completed", label: language === "th" ? "สำเร็จ" : "Done" },
    { id: "active", label: language === "th" ? "กำลังทำ" : "Active" },
    { id: "failed", label: language === "th" ? "ล้มเหลว" : "Failed" },
  ];

  return (
    <>
      <div className="mb-3 flex min-h-8 items-center justify-end gap-1.5">
        <div className="flex items-center gap-1 rounded-full bg-white/[0.035] p-1 text-[11px] text-zinc-400">
          <span className="grid h-6 w-6 place-items-center rounded-full text-zinc-500">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </span>
          {statusFilters.map((filter) => {
            const active = statusFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setStatusFilter(filter.id)}
                className={cn(
                  "h-6 rounded-full px-2 text-[11px] font-semibold transition",
                  active
                    ? "bg-white text-zinc-950"
                    : "text-zinc-400 hover:bg-white/[0.07] hover:text-white",
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="grid min-h-[420px] place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--brand-soft)]" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="grid min-h-[520px] place-items-center p-8 text-center">
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.04] text-zinc-200 ring-1 ring-white/10">
              <FolderOpen className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-[16px] font-bold text-white">
              {t("workspace.standalone.empty_title")}
            </h2>
            <p className="mt-2 text-[13px] text-zinc-400">
              {t("workspace.standalone.empty_body")}
            </p>
          </div>
        </div>
      ) : visibleJobs.length === 0 ? (
        <div className="grid min-h-[360px] place-items-center p-8 text-center">
          <div className="text-[13px] text-zinc-500">
            {language === "th" ? "ไม่มีผลลัพธ์ในตัวกรองนี้" : "No results for this filter"}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          {visibleJobs.map((job) => (
            <CreationTile
              key={job.id}
              job={job}
              onPreview={setPreview}
              onDelete={() => onDeleteJob(job)}
            />
          ))}
        </div>
      )}
      {preview && (
        <NodePreviewLightbox
          preview={preview}
          onClose={() => setPreview(null)}
          onCropConfirmed={preview.type === "image" ? onStandaloneCropConfirmed : undefined}
        />
      )}
    </>
  );
}

type CreationStatusFilter = "all" | "completed" | "active" | "failed";

function creationStatusMatches(job: StandaloneJobRow, filter: CreationStatusFilter) {
  if (filter === "all") return true;
  if (filter === "completed") return job.status === "completed";
  if (filter === "active") return job.status === "queued" || job.status === "running";
  return job.status === "failed" || job.status === "permanent_failed";
}

const MODEL_FILE_RE = /\.(glb|gltf|usdz|obj|fbx)(?:[?#].*)?$/i;
const REFERENCE_MEDIA_FILE_RE = /\.(png|jpe?g|webp|gif|mp4|mov|webm|m4v)(?:[?#].*)?$/i;

const firstText = (...values: Array<unknown>): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

const firstFiniteNumber = (...values: Array<unknown>): number | undefined => {
  for (const value of values) {
    const numeric =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Number(value)
          : Number.NaN;
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
};

function cleanReferenceFileName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .split(/[?#]/)[0]
    .split(/[\\/]/)
    .filter(Boolean)
    .pop()
    ?.replace(/^[0-9]{10,}[-_]/, "")
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function referenceFileNameFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return cleanReferenceFileName(decodeURIComponent(parsed.pathname));
  } catch {
    return cleanReferenceFileName(decodeURIComponent(url));
  }
}

function uploadedReferenceName(rawName: string | undefined, url: string, fallback: string): string {
  const explicit = cleanReferenceFileName(rawName);
  if (explicit && REFERENCE_MEDIA_FILE_RE.test(explicit)) return explicit;
  const fromUrl = referenceFileNameFromUrl(url);
  if (fromUrl && REFERENCE_MEDIA_FILE_RE.test(fromUrl)) return fromUrl;
  if (explicit && explicit.length <= 28) return explicit;
  return fromUrl ?? fallback;
}

function getStandaloneModelUrl(result: StandaloneResult | null | undefined) {
  if (!result) return undefined;
  const outputs = result.outputs ?? {};
  const direct = firstText(
    result.provider_meta?.model_url,
    outputs.model_url,
    outputs.glb_url,
    outputs.gltf_url,
    outputs.mesh_url,
    outputs.model,
  );
  if (direct) return direct;
  const assetUrl = firstText(outputs.asset_url, outputs.url, result.url);
  return assetUrl && MODEL_FILE_RE.test(assetUrl) ? assetUrl : undefined;
}

function getStandalonePosterUrl(
  result: StandaloneResult | null | undefined,
  modelUrl?: string,
) {
  if (!result) return undefined;
  const outputs = result.outputs ?? {};
  const poster = firstText(
    result.provider_meta?.rendered_image,
    outputs.rendered_image,
    outputs.preview_image,
    outputs.thumbnail_url,
    outputs.poster,
    result.url,
  );
  if (!poster || poster === modelUrl || MODEL_FILE_RE.test(poster)) {
    return undefined;
  }
  return poster;
}

function inferReferenceMime(url: string | undefined, fallback?: unknown): string {
  const value = typeof fallback === "string" ? fallback.toLowerCase() : "";
  if (value.startsWith("image/") || value.startsWith("video/")) return value;
  if (value.includes("video")) return "video/mp4";
  if (value.includes("image")) return "image/jpeg";
  const cleanUrl = (url ?? "").split("?")[0].toLowerCase();
  if (/\.(mp4|mov|webm|m4v)$/i.test(cleanUrl)) return "video/mp4";
  if (/\.(png)$/i.test(cleanUrl)) return "image/png";
  if (/\.(webp)$/i.test(cleanUrl)) return "image/webp";
  if (/\.(gif)$/i.test(cleanUrl)) return "image/gif";
  return "image/jpeg";
}

function referenceFromGenerationJob(job: StandaloneJobRow): UploadedRef | null {
  if (job.status !== "completed") return null;
  const result = job.result;
  if (!result) return null;
  const modelUrl = getStandaloneModelUrl(result);
  const outputs = result.outputs ?? {};
  const type = String(result.type ?? "");
  const videoUrl = firstText(
    type === "video" ? result.url : undefined,
    outputs.video_url,
    outputs.output_video,
  );
  const imageUrl = firstText(
    type === "image" ? result.url : undefined,
    outputs.image_url,
    outputs.output_image,
    outputs.rendered_image,
    outputs.preview_image,
    getStandalonePosterUrl(result, modelUrl),
  );
  const url = videoUrl ?? imageUrl;
  if (!url || MODEL_FILE_RE.test(url)) return null;
  const params = job.request?.params ?? {};
  return {
    id: `job-${job.id}`,
    source: "generation",
    assetId: job.id,
    name: uploadedReferenceName(
      firstText(outputs.file_name, outputs.filename, result.url),
      url,
      String(params.nodeName ?? job.model ?? "asset"),
    ),
    url,
    mime: videoUrl ? "video/mp4" : "image/jpeg",
  };
}

function storagePointerFromReferenceUrl(rawUrl: string): Pick<UploadedRef, "storageBucket" | "storagePath"> {
  const normalized = rawUrl.trim().replace(/^\/+/, "").split("?")[0];
  const direct = normalized.match(/^(ai-media|user_assets)\/(.+)$/i);
  if (direct?.[1] && direct[2]) {
    return {
      storageBucket: direct[1].toLowerCase() as "ai-media" | "user_assets",
      storagePath: decodeURIComponent(direct[2]),
    };
  }

  try {
    const parsed = new URL(rawUrl);
    const match = parsed.pathname.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/(.+)$/);
    if (match?.[1] && match[2] && /^(ai-media|user_assets)$/i.test(match[1])) {
      return {
        storageBucket: match[1].toLowerCase() as "ai-media" | "user_assets",
        storagePath: decodeURIComponent(match[2]),
      };
    }
  } catch {
    // Non-URL values can still be plain storage paths and are handled above.
  }

  return {};
}

function standaloneReferenceKey(
  reference: Pick<UploadedRef, "url" | "assetId" | "storageBucket" | "storagePath">,
): string {
  if (reference.assetId) return `asset:${reference.assetId}`;
  if (reference.storageBucket && reference.storagePath) {
    return `storage:${reference.storageBucket}/${reference.storagePath}`;
  }
  const storagePointer = storagePointerFromReferenceUrl(reference.url);
  if (storagePointer.storageBucket && storagePointer.storagePath) {
    return `storage:${storagePointer.storageBucket}/${storagePointer.storagePath}`;
  }
  return `url:${reference.url.split("?")[0]}`;
}

function standaloneReferencesMatch(
  a: Pick<UploadedRef, "url" | "assetId" | "storageBucket" | "storagePath">,
  b: Pick<UploadedRef, "url" | "assetId" | "storageBucket" | "storagePath">,
): boolean {
  return standaloneReferenceKey(a) === standaloneReferenceKey(b);
}

async function fetchProjectUserAssets(
  userId: string,
  projectId: string,
): Promise<ProjectReferenceAssetRow[]> {
  const select = "*";
  const base = () =>
    supabase
      .from("user_assets")
      .select(select)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(120);

  const scoped = await base().eq("project_id", projectId);
  if (!scoped.error) return (scoped.data ?? []) as ProjectReferenceAssetRow[];

  const message = String(scoped.error.message ?? "");
  const missingProjectColumn =
    scoped.error.code === "42703" || /project_id/i.test(message);
  if (!missingProjectColumn) {
    console.warn("[StandaloneGenerator] user_assets load failed:", message);
    return [];
  }

  const fallback = await base();
  if (fallback.error) {
    console.warn("[StandaloneGenerator] user_assets fallback failed:", fallback.error.message);
    return [];
  }
  return (fallback.data ?? []) as ProjectReferenceAssetRow[];
}

async function referenceFromUserAsset(
  row: ProjectReferenceAssetRow,
): Promise<UploadedRef | null> {
  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const rawUrl = firstText(
    row.file_url,
    row.url,
    row.public_url,
    row.thumbnail_url,
    metadata.file_url,
    metadata.url,
    metadata.storage_path,
  );
  if (!rawUrl || MODEL_FILE_RE.test(rawUrl)) return null;
  const storagePointer = storagePointerFromReferenceUrl(rawUrl);
  const mime = inferReferenceMime(
    rawUrl,
    firstText(row.file_type, row.mime_type, row.type, metadata.mime_type, metadata.content_type),
  );
  if (!mime.startsWith("image/") && !mime.startsWith("video/")) return null;
  const signedUrl = await getSignedUrl(rawUrl);
  return {
    id: `user-asset-${String(row.id ?? rawUrl)}`,
    source: "user_asset",
    assetId: row.id != null ? String(row.id) : undefined,
    ...storagePointer,
    name: uploadedReferenceName(
      firstText(
        row.file_name,
        row.filename,
        metadata.file_name,
        metadata.filename,
        row.name,
        metadata.name,
      ),
      rawUrl,
      "asset",
    ),
    url: signedUrl,
    mime,
  };
}

function mergeReferenceOptions(
  references: Array<UploadedRef | null | undefined>,
  limit = 120,
): UploadedRef[] {
  const seen = new Set<string>();
  const merged: UploadedRef[] = [];
  for (const ref of references) {
    if (!ref?.url) continue;
    const key = standaloneReferenceKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(ref);
    if (merged.length >= limit) break;
  }
  return merged;
}

function CreationTile({
  job,
  onPreview,
  onDelete,
}: {
  job: StandaloneJobRow;
  onPreview: (preview: PreviewPayload) => void;
  onDelete: () => void;
}) {
  const { language, t } = useLanguage();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const result = job.result;
  const params = job.request?.params ?? {};
  const prompt = String(params.prompt ?? "");
  const title =
    prompt.trim().slice(0, 90) ||
    String(
      params.nodeName ??
        params.model_name ??
        job.model ??
        t("workspace.standalone.generation_fallback"),
    );
  const url = result?.url;
  const modelUrl = getStandaloneModelUrl(result);
  const resultType = String(result?.type ?? "");
  const isModel3d = resultType === "model_3d" || resultType === "model3d" || !!modelUrl;
  const rawPreviewUrl = isModel3d ? getStandalonePosterUrl(result, modelUrl) : url;
  const mediaUrl = useFreshSignedUrl(url);
  const previewUrl = useFreshSignedUrl(rawPreviewUrl);
  const playbackUrl = mediaUrl ?? url;
  const displayPreviewUrl = previewUrl ?? rawPreviewUrl;
  const duration = String(params.duration ?? "");
  const durationLabel = duration
    ? `${duration}${duration.toLowerCase().endsWith("s") ? "" : ` ${t("workspace.standalone.sec")}`}`
    : "";
  const ratio = String(params.ratio ?? params.aspect_ratio ?? params.size ?? "");
  const modelName = String(params.model_name ?? job.model ?? "model");
  const generatedAtLabel = formatDate(job.completed_at ?? job.created_at, language);
  const downloadUrl = modelUrl ?? playbackUrl;
  const downloadBaseName =
    prompt.trim() ||
    String(params.nodeName ?? t("workspace.standalone.generation_fallback"));
  const downloadName =
    resultType === "audio" ? buildDownloadFilename(downloadBaseName, "mp3") : downloadBaseName;
  const isActive = job.status === "queued" || job.status === "running";
  const isFailed = job.status === "failed" || job.status === "permanent_failed";
  const canDelete = !isActive;
  const failureMessage = isFailed ? (job.error ?? job.last_error) : null;
  const canPreviewImage =
    resultType === "image" && !!displayPreviewUrl && !isActive && !isFailed;
  const canPreviewVideo =
    resultType === "video" && !!playbackUrl && !isActive && !isFailed;
  const canPreviewAudio =
    resultType === "audio" && !!playbackUrl && !isActive && !isFailed;
  const canOpenPreview =
    !!modelUrl || canPreviewImage || canPreviewVideo || canPreviewAudio;
  const previewSettings = [
    modelName ? { label: modelName } : null,
    ratio ? { label: ratio } : null,
    duration
      ? { label: language === "th" ? "ระยะเวลา" : "Duration", value: `${duration}s` }
      : null,
    {
      label: language === "th" ? "เวลาสร้าง" : "Creation time",
      value: formatDate(job.created_at, language),
    },
  ].filter(Boolean) as Array<{ label: string; value?: string }>;

  const openModelPreview = () => {
    if (!modelUrl) return;
    onPreview({
      type: "model3d",
      model_url: modelUrl,
        poster: displayPreviewUrl,
        label: modelName,
        caption: t("workspace.standalone.preview_3d_caption"),
        prompt: prompt.trim() || title,
        settings: previewSettings,
      });
  };
  const openMediaPreview = () => {
    if (modelUrl) {
      openModelPreview();
      return;
    }
    if (canPreviewImage && displayPreviewUrl) {
      onPreview({
        type: "image",
        url: displayPreviewUrl,
        label: title,
        caption: modelName,
        prompt: prompt.trim() || title,
        settings: previewSettings,
      });
      return;
    }
    if (canPreviewVideo && playbackUrl) {
      onPreview({
        type: "video",
        url: playbackUrl,
        label: title,
        caption: modelName,
        prompt: prompt.trim() || title,
        settings: previewSettings,
      });
      return;
    }
    if (canPreviewAudio && playbackUrl) {
      onPreview({
        type: "audio",
        url: playbackUrl,
        label: title,
        caption: modelName,
        prompt: prompt.trim() || title,
        settings: previewSettings,
      });
    }
  };
  const contextMenuItems: MediaContextMenuItem[] = [
    {
      key: "preview",
      label: "Preview",
      icon: Eye,
      disabled: !canOpenPreview,
      onSelect: openMediaPreview,
    },
    {
      key: "download",
      label: "Download",
      icon: Download,
      disabled: !downloadUrl,
      onSelect: () => {
        if (downloadUrl) void downloadFromUrl(downloadUrl, downloadName);
      },
    },
    {
      key: "duplicate",
      label: "Duplicate",
      icon: Copy,
      disabled: true,
      onSelect: () => undefined,
    },
    {
      key: "move-board",
      label: "Move to Board",
      icon: FolderOpen,
      separatorBefore: true,
      disabled: true,
      onSelect: () => undefined,
    },
    {
      key: "copy-board",
      label: "Copy to Board",
      icon: Copy,
      disabled: true,
      onSelect: () => undefined,
    },
    {
      key: "delete",
      label: "Delete",
      icon: Trash2,
      separatorBefore: true,
      danger: true,
      disabled: !canDelete,
      onSelect: onDelete,
    },
  ];
  return (
    <article className="group relative flex h-[230px] max-w-full overflow-hidden rounded-[10px] bg-black/40 shadow-[inset_0_0_0_1px_rgba(255,255,255,.04)]">
      <div
        className={cn(
          "relative flex h-full max-w-full items-center justify-center overflow-hidden",
          !displayPreviewUrl && !playbackUrl && !modelUrl && "w-[300px]",
          canOpenPreview && "cursor-zoom-in",
        )}
        role={canOpenPreview ? "button" : undefined}
        tabIndex={canOpenPreview ? 0 : undefined}
        onClick={canOpenPreview ? openMediaPreview : undefined}
        onContextMenu={
          canOpenPreview || downloadUrl || canDelete
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                setContextMenu({ x: event.clientX, y: event.clientY });
              }
            : undefined
        }
        onKeyDown={
          canOpenPreview
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openMediaPreview();
                }
              }
            : undefined
        }
        aria-label={
          modelUrl
            ? t("workspace.standalone.preview_3d_model")
            : canPreviewImage
              ? t("workspace.standalone.preview_image")
              : canPreviewVideo
                ? t("workspace.standalone.result.video")
                : canPreviewAudio
                  ? t("workspace.standalone.result.audio")
                  : undefined
        }
        data-testid={canOpenPreview ? "standalone-preview-tile" : undefined}
      >
        {(resultType === "image" || isModel3d) && displayPreviewUrl && (
          <img
            src={displayPreviewUrl}
            alt=""
            className="h-full w-auto max-w-full object-contain"
          />
        )}
        {resultType === "video" && playbackUrl && (
          <video
            src={playbackUrl}
            muted
            playsInline
            className="h-full w-auto max-w-full object-contain"
          />
        )}
        {resultType === "audio" && playbackUrl && (
          <div className="flex h-full w-[300px] items-center justify-center p-4">
            <AudioPlayButton
              src={playbackUrl}
              label={t("workspace.standalone.result.audio")}
              testId="standalone-audio-player"
            />
          </div>
        )}
        {modelUrl && !displayPreviewUrl && (
          <div className="grid h-full w-[300px] place-items-center text-zinc-500">
            <Box className="h-8 w-8" />
          </div>
        )}
        {!displayPreviewUrl && !playbackUrl && !modelUrl && (
          <div className="grid h-full w-[300px] place-items-center text-zinc-500">
            <FolderOpen className="h-8 w-8" />
          </div>
        )}
      </div>

      <div className="absolute right-1.5 top-1.5 z-20 flex translate-y-1 items-center gap-1 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
        {downloadUrl && (
          <button
            type="button"
            onClick={() => void downloadFromUrl(downloadUrl, downloadName)}
            data-testid="standalone-download"
            className="grid h-7 w-7 place-items-center rounded-full bg-black/62 text-white backdrop-blur transition hover:bg-white hover:text-zinc-950"
            aria-label={t("workspace.standalone.download")}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        )}
        {canPreviewImage && (
          <button
            type="button"
            onClick={openMediaPreview}
            className="grid h-7 w-7 place-items-center rounded-full bg-black/62 text-white backdrop-blur transition hover:bg-white hover:text-zinc-950"
            aria-label={t("workspace.standalone.preview_image")}
          >
            <Crop className="h-3.5 w-3.5" />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete();
            }}
            className="grid h-7 w-7 place-items-center rounded-full bg-black/62 text-white backdrop-blur transition hover:bg-red-500 hover:text-white"
            aria-label={language === "th" ? "ลบผลลัพธ์" : "Delete result"}
            title={language === "th" ? "ลบผลลัพธ์" : "Delete result"}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-black/58 via-black/16 to-transparent px-2 pb-1.5 pt-10 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
        <div className="flex max-w-full flex-wrap items-end gap-x-2 gap-y-0.5 text-[8px] font-semibold leading-[10px] text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,.85)]">
          <span className="max-w-[120px] truncate">
            {modelName}
          </span>
          {durationLabel && (
            <span className="shrink-0">
              {durationLabel}
            </span>
          )}
          <span className="shrink-0">
            {generatedAtLabel}
          </span>
        </div>
        {failureMessage && (
          <div className="mt-1 line-clamp-1 text-[10px] text-red-200">
            {failureMessage}
          </div>
        )}
      </div>

      {isActive && (
        <div className="absolute inset-0 grid place-items-center bg-black/20">
          <div className="flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-[12px] text-zinc-200 backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {standaloneStatusLabel(job.status, t)}
          </div>
        </div>
      )}
      {isFailed && (
        <div className="absolute inset-0 grid place-items-center bg-black/20">
          <div className="flex items-center gap-2 rounded-full bg-red-950/75 px-3 py-1.5 text-[12px] text-red-100 backdrop-blur">
            <AlertCircle className="h-3.5 w-3.5" />
            {t("workspace.standalone.status.failed")}
          </div>
        </div>
      )}
      {contextMenu && (
        <MediaContextMenu
          position={contextMenu}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </article>
  );
}

function CreationRow({
  job,
  onPreview,
}: {
  job: StandaloneJobRow;
  onPreview: (preview: PreviewPayload) => void;
}) {
  const { language, t } = useLanguage();
  const result = job.result;
  const params = job.request?.params ?? {};
  const prompt = String(params.prompt ?? "");
  const title =
    prompt.trim().slice(0, 90) ||
    String(
      params.nodeName ??
        params.model_name ??
        job.model ??
        t("workspace.standalone.generation_fallback"),
    );

  const statusTone =
    job.status === "completed"
      ? "text-emerald-300"
      : job.status === "failed" || job.status === "permanent_failed"
        ? "text-red-300"
        : "text-amber-300";
  const url = result?.url;
  const modelUrl = getStandaloneModelUrl(result);
  const resultType = String(result?.type ?? "");
  const isModel3d = resultType === "model_3d" || resultType === "model3d" || !!modelUrl;
  const rawPreviewUrl = isModel3d ? getStandalonePosterUrl(result, modelUrl) : url;
  const mediaUrl = useFreshSignedUrl(url);
  const previewUrl = useFreshSignedUrl(rawPreviewUrl);
  const duration = String(params.duration ?? "");
  const ratio = String(params.ratio ?? params.aspect_ratio ?? params.size ?? "");
  const modelName = String(params.model_name ?? job.model ?? "model");
  const playbackUrl = mediaUrl ?? url;
  const displayPreviewUrl = previewUrl ?? rawPreviewUrl;
  const downloadUrl = modelUrl ?? playbackUrl;
  const downloadBaseName =
    prompt.trim() ||
    String(params.nodeName ?? t("workspace.standalone.generation_fallback"));
  const downloadName =
    resultType === "audio" ? buildDownloadFilename(downloadBaseName, "mp3") : downloadBaseName;
  const externalUrl = isModel3d ? modelUrl : playbackUrl;
  const failureMessage =
    job.status === "failed" || job.status === "permanent_failed"
      ? (job.error ?? job.last_error)
      : null;
  const isActive = job.status === "queued" || job.status === "running";
  const isFailed = job.status === "failed" || job.status === "permanent_failed";
  const canPreviewImage =
    resultType === "image" && !!displayPreviewUrl && !isActive && !isFailed;
  const canPreviewVideo =
    resultType === "video" && !!playbackUrl && !isActive && !isFailed;
  const canPreviewAudio =
    resultType === "audio" && !!playbackUrl && !isActive && !isFailed;
  const openModelPreview = () => {
    if (!modelUrl) return;
    onPreview({
      type: "model3d",
      model_url: modelUrl,
      poster: displayPreviewUrl,
      label: modelName,
      caption: t("workspace.standalone.preview_3d_caption"),
    });
  };
  const openMediaPreview = () => {
    if (modelUrl) {
      openModelPreview();
      return;
    }
    if (canPreviewImage && displayPreviewUrl) {
      onPreview({
        type: "image",
        url: displayPreviewUrl,
        label: title,
        caption: modelName,
      });
      return;
    }
    if (canPreviewVideo && playbackUrl) {
      onPreview({
        type: "video",
        url: playbackUrl,
        label: title,
        caption: modelName,
      });
      return;
    }
    if (canPreviewAudio && playbackUrl) {
      onPreview({
        type: "audio",
        url: playbackUrl,
        label: title,
        caption: modelName,
      });
    }
  };
  const canOpenPreview =
    !!modelUrl || canPreviewImage || canPreviewVideo || canPreviewAudio;
  return (
    <article className="rounded-xl bg-[#222222] px-3 py-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="line-clamp-1 min-w-0 text-[12px] font-semibold text-zinc-100">
          {title}
        </h3>
        <div className="hidden shrink-0 flex-wrap justify-end gap-1 md:flex">
          <MiniMeta label={modelName} />
          {duration && (
            <MiniMeta label={`${duration} ${t("workspace.standalone.sec")}`} />
          )}
          {ratio && <MiniMeta label={ratio} />}
          <MiniMeta label={`+${job.attempts ?? 1}`} />
          <span className="flex h-5 items-center gap-1 rounded bg-white/[0.06] px-1.5 text-[10px] text-zinc-300">
            <span className="h-3 w-3 rounded-sm border border-zinc-600" />
            {formatDate(job.created_at, language)}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div
          className={cn(
            "relative aspect-video w-full overflow-hidden rounded-xl bg-black md:w-[265px]",
            canOpenPreview && "cursor-zoom-in",
          )}
          role={canOpenPreview ? "button" : undefined}
          tabIndex={canOpenPreview ? 0 : undefined}
          onClick={canOpenPreview ? openMediaPreview : undefined}
          onKeyDown={
            canOpenPreview
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openMediaPreview();
                  }
                }
              : undefined
          }
          aria-label={
            modelUrl
              ? t("workspace.standalone.preview_3d_model")
              : canPreviewImage
                ? t("workspace.standalone.preview_image")
                : canPreviewVideo
                  ? t("workspace.standalone.result.video")
                  : canPreviewAudio
                    ? t("workspace.standalone.result.audio")
                    : undefined
          }
          data-testid={canOpenPreview ? "standalone-preview-tile" : undefined}
        >
          {isActive && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[12px] text-zinc-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {standaloneStatusLabel(job.status, t)}
              </div>
            </div>
          )}
          {isFailed && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex items-center gap-2 rounded-full bg-red-950/70 px-3 py-1.5 text-[12px] text-red-100">
                <AlertCircle className="h-3.5 w-3.5" />
                {t("workspace.standalone.status.failed")}
              </div>
            </div>
          )}
          {(result?.type === "image" || isModel3d) && displayPreviewUrl && (
            <img src={displayPreviewUrl} alt="" className="h-full w-full object-cover" />
          )}
          {result?.type === "video" && playbackUrl && (
            <video
              src={playbackUrl}
              controls
              playsInline
              className="h-full w-full object-cover"
            />
          )}
          {result?.type === "audio" && playbackUrl && (
            <div className="flex h-full w-full items-center justify-center p-4">
              <AudioPlayButton
                src={playbackUrl}
                label={t("workspace.standalone.result.audio")}
                testId="standalone-audio-player"
              />
            </div>
          )}
          {modelUrl && !displayPreviewUrl && (
            <div className="grid h-full place-items-center text-zinc-500">
              <Box className="h-8 w-8" />
            </div>
          )}
          <div className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">
            {result?.type === "audio"
              ? t("workspace.standalone.result.audio")
              : result?.type === "video"
                ? t("workspace.standalone.result.video")
                : isModel3d
                  ? t("workspace.standalone.result.model_3d")
                  : t("workspace.standalone.result.image")}
          </div>
        </div>

        <div className="min-w-0 flex-1 md:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full bg-white/[0.06] px-2 py-1 text-[11px] font-bold uppercase tracking-wide",
                statusTone,
              )}
            >
              {standaloneStatusLabel(job.status, t)}
            </span>
            <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[11px] text-zinc-400">
              {job.model ?? params.model_name?.toString() ?? "model"}
            </span>
            {typeof job.credits_charged === "number" && (
              <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[11px] text-zinc-400">
                {job.credits_charged} {t("workspace.standalone.credits")}
              </span>
            )}
          </div>
          <h3 className="mt-3 line-clamp-2 text-[14px] font-bold leading-snug text-white md:text-[15px]">
            {title}
          </h3>
          <div className="mt-2 text-[11px] text-zinc-500">
            {formatDate(job.created_at, language)}
            {job.attempts
              ? ` · ${t("workspace.standalone.attempt")} ${job.attempts}`
              : ""}
          </div>
          {failureMessage && (
            <div className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
              {failureMessage}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 md:flex-col">
          {downloadUrl && (
            <>
              <button
                type="button"
                onClick={() => void downloadFromUrl(downloadUrl, downloadName)}
                data-testid="standalone-download"
                className="grid h-9 w-9 place-items-center rounded-lg bg-white text-zinc-950 hover:bg-zinc-200"
                aria-label={t("workspace.standalone.download")}
              >
                <Download className="h-4 w-4" />
              </button>
              {externalUrl && (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="grid h-9 w-9 place-items-center rounded-lg bg-[#2f2f2f] text-zinc-300 hover:bg-[#3a3a3a]"
                  aria-label={t("workspace.standalone.open_file")}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </>
          )}
          {modelUrl && (
            <button
              type="button"
              onClick={openModelPreview}
              data-testid="standalone-open-3d-preview"
              className="grid h-9 w-9 place-items-center rounded-lg bg-amber-300 text-zinc-950 hover:bg-amber-200"
              aria-label={t("workspace.standalone.preview_3d_model")}
              title={t("workspace.standalone.preview_3d_model")}
            >
              <Box className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function MiniMeta({ label }: { label: string }) {
  return (
    <span className="h-5 rounded bg-white/[0.06] bg-[#1a1a1a] px-2 text-[10px] font-semibold leading-5 text-zinc-100">
      {label}
    </span>
  );
}

function FieldLabel({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-default)]">
        {label}
      </span>
      {meta && <span className="text-[10px] text-[var(--text-tertiary)]">{meta}</span>}
    </div>
  );
}

function standaloneCanvasId(projectId: string): string {
  return `${STANDALONE_CANVAS_ID}:${projectId}`;
}

function uploadAcceptForSlot(slot: UploadSlot): string {
  return slot === "video-ref-video" ? "video/*" : "image/*";
}

function useStandaloneJobs(
  userId: string | undefined,
  projectId: string | undefined,
) {
  return useQuery<StandaloneJobRow[], Error>({
    queryKey: ["standalone-generation-jobs", userId, projectId],
    enabled: !!userId && !!projectId,
    refetchInterval: false,
    queryFn: async () => {
      if (!projectId) return [];
      const base = supabase
        .from("workspace_generation_jobs")
        .select(STANDALONE_JOB_SELECT)
        .eq("project_id", projectId)
        .eq("canvas_id", standaloneCanvasId(projectId));

      const [activeRes, recentRes] = await Promise.all([
        base
          .in("status", ["queued", "running"])
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("workspace_generation_jobs")
          .select(STANDALONE_JOB_SELECT)
          .eq("project_id", projectId)
          .eq("canvas_id", standaloneCanvasId(projectId))
          .in("status", ["completed", "failed", "permanent_failed"])
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (activeRes.error) throw new Error(activeRes.error.message);
      if (recentRes.error) throw new Error(recentRes.error.message);

      const byId = new Map<string, StandaloneJobRow>();
      for (const row of [...(activeRes.data ?? []), ...(recentRes.data ?? [])]) {
        byId.set(String(row.id), row as StandaloneJobRow);
      }
      return Array.from(byId.values()).sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    },
  });
}

function useProjectReferenceAssets(
  userId: string | undefined,
  projectId: string | undefined,
) {
  return useQuery<UploadedRef[], Error>({
    queryKey: ["standalone-project-reference-assets", userId, projectId],
    enabled: !!userId && !!projectId,
    staleTime: 20_000,
    queryFn: async () => {
      if (!userId || !projectId) return [];

      const jobRes = await supabase
        .from("workspace_generation_jobs")
        .select(STANDALONE_JOB_SELECT)
        .eq("user_id", userId)
        .eq("project_id", projectId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(100);

      if (jobRes.error) throw new Error(jobRes.error.message);

      const assetRes = await fetchProjectUserAssets(userId, projectId);
      const refs: UploadedRef[] = [];
      const seen = new Set<string>();

      const pushRef = async (ref: UploadedRef | null | undefined) => {
        if (!ref?.url) return;
        const key = standaloneReferenceKey(ref);
        if (seen.has(key)) return;
        seen.add(key);
        refs.push(ref);
      };

      for (const job of (jobRes.data ?? []) as StandaloneJobRow[]) {
        await pushRef(referenceFromGenerationJob(job));
      }
      for (const asset of assetRes) {
        await pushRef(await referenceFromUserAsset(asset));
      }

      return refs.slice(0, 120);
    },
  });
}

async function uploadReference(
  file: File,
  userId: string | undefined,
  projectId: string | undefined,
): Promise<UploadedRef> {
  if (!userId) throw new Error("Please sign in before uploading references.");
  if (!projectId) throw new Error("Create or select a project before uploading references.");
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    throw new Error("Only image or video references are supported on this surface.");
  }
  const uploadFile = await normalizeImageReferenceUpload(file);
  const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  // Storage RLS on `ai-media` requires the FIRST folder segment to
  // equal `auth.uid()`:
  //   policy: `(auth.uid())::text = (storage.foldername(name))[1]`
  // The previous path put `standalone/<userId>/...`, which made
  // `standalone` the first folder and the policy reject every
  // upload with "new row violates row-level security policy". Move
  // the userId to the front so the policy passes; the rest of the
  // hierarchy (per-project bucketing) is preserved.
  const storagePath = `${userId}/standalone/${projectId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, uploadFile, {
      contentType: uploadFile.type || "application/octet-stream",
      upsert: true,
    });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
  const { data, error: signError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
  if (signError || !data?.signedUrl) {
    throw new Error(`Could not create signed URL: ${signError?.message ?? ""}`);
  }
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
    source: "upload",
    storageBucket: STORAGE_BUCKET,
    storagePath,
    name: file.name,
    url: data.signedUrl,
    mime: uploadFile.type,
  };
}

interface StandaloneMentionedAsset {
  kind: "asset";
  label: string;
  nodeId: string;
  url: string | null;
  fieldType: "image" | "video" | "audio" | null;
  role: "general";
}

const STANDALONE_MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

function fieldTypeForReference(
  reference: Pick<UploadedRef, "mime">,
): StandaloneMentionedAsset["fieldType"] {
  if (reference.mime?.startsWith("video/")) return "video";
  if (reference.mime?.startsWith("audio/")) return "audio";
  return "image";
}

function standaloneAutoPromptTitle(language: string): string {
  return language === "th"
    ? "สร้างหรือปรับ prompt ให้พร้อมใช้กับ tool นี้"
    : "Create or improve a prompt for the current tool";
}

function autoPromptReferenceLabel(
  reference: Pick<PanelReferenceAsset, "name" | "id">,
  index: number,
): string {
  const raw = (reference.name || reference.id || `ref-${index + 1}`).trim();
  const withoutQuery = raw.split("?")[0] ?? raw;
  const parts = withoutQuery.split(/[\\/]/);
  const fileName = parts[parts.length - 1] || withoutQuery;
  return fileName.length > 28 ? `${fileName.slice(0, 25)}...` : fileName;
}

function autoPromptReferenceToken(
  reference: Pick<PanelReferenceAsset, "id" | "name">,
  index: number,
): string {
  return `@[${autoPromptReferenceLabel(reference, index)}](${reference.id})`;
}

function buildStandaloneAutoPromptUserMessage({
  prompt,
  tool,
  toolLabel,
  modelLabel,
  references,
  language,
}: {
  prompt: string;
  tool: StandaloneToolKey;
  toolLabel: string;
  modelLabel: string;
  references: PanelReferenceAsset[];
  language: string;
}): string {
  const referenceLines = references.length
    ? references
        .map((reference, index) => {
          const mediaKind = reference.mime?.startsWith("video/")
            ? "video"
            : reference.mime?.startsWith("audio/")
              ? "audio"
              : "image";
          return `- ${mediaKind} ${index + 1}: ${autoPromptReferenceToken(reference, index)}`;
        })
        .join("\n")
    : "- none";
  const toolInstruction =
    tool === "voice_gen"
      ? "For voice generation, write a clean speakable script and preserve the intended spoken language."
      : tool === "video_gen"
        ? "For video generation, include subject, action, scene, camera/motion, timing, lighting, and continuity when useful."
        : "For image generation or editing, include subject, action/edit intent, composition, lighting, style, and constraints when useful.";

  return [
    "The UI will paste your answer directly into the prompt box.",
    "Answer with the prompt text itself.",
    `Active tool: ${toolLabel} (${tool})`,
    `Active model: ${modelLabel}`,
    `User UI language: ${language}`,
    toolInstruction,
    "For image/video tools, write clear English unless the user explicitly requests another language.",
    "Keep every @mention token exactly as written. Do not change labels or ids inside mention tokens.",
    "If selected references should be passed into generation, include their exact @mention tokens in the prompt.",
    "",
    "Selected reference mention tokens:",
    referenceLines,
    "",
    "User draft:",
    prompt || "(empty)",
  ].join("\n");
}

function cleanStandaloneAutoPromptResponse(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:text|prompt)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/^(auto prompt|optimized prompt|final prompt|prompt)\s*:\s*/i, "")
    .trim();
}

function resolveStandaloneMentionedAssets(
  prompt: string,
  assets: Array<Pick<UploadedRef, "id" | "name" | "url" | "mime">>,
): StandaloneMentionedAsset[] {
  if (!prompt || assets.length === 0) return [];
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const seen = new Set<string>();
  const mentioned: StandaloneMentionedAsset[] = [];
  const regex = new RegExp(STANDALONE_MENTION_REGEX.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(prompt)) !== null) {
    const [, label, nodeId] = match;
    if (seen.has(nodeId)) continue;
    const asset = byId.get(nodeId);
    if (!asset) continue;
    seen.add(nodeId);
    mentioned.push({
      kind: "asset",
      label: label || asset.name || "asset",
      nodeId,
      url: asset.url,
      fieldType: fieldTypeForReference(asset),
      role: "general",
    });
  }

  return mentioned;
}

function appendUniqueInputUrls(
  inputs: Record<string, unknown>,
  key: string,
  urls: string[],
  maxCount: number,
) {
  const current = inputs[key];
  const existing = Array.isArray(current)
    ? current.filter((value): value is string => typeof value === "string" && !!value)
    : typeof current === "string" && current
      ? [current]
      : [];
  const merged: string[] = [];
  for (const url of [...existing, ...urls]) {
    if (!url || merged.includes(url)) continue;
    merged.push(url);
    if (merged.length >= maxCount) break;
  }
  if (merged.length === 0) return;
  inputs[key] = merged.length === 1 ? merged[0] : merged;
}

function mergeStandaloneMentionInputs(
  tool: StandaloneToolKey,
  form: StandaloneFormState,
  inputs: Record<string, unknown>,
  mentioned: StandaloneMentionedAsset[],
) {
  if (mentioned.length === 0) return inputs;
  const nextInputs = { ...inputs };
  const imageUrls = mentioned
    .filter((asset) => asset.fieldType === "image" && asset.url)
    .map((asset) => asset.url as string);
  const videoUrls = mentioned
    .filter((asset) => asset.fieldType === "video" && asset.url)
    .map((asset) => asset.url as string);

  if (tool === "image_gen") {
    appendUniqueInputUrls(
      nextInputs,
      "ref_image",
      imageUrls,
      maxImageRefsForModel(form.model),
    );
    return nextInputs;
  }

  if (tool === "video_gen") {
    const useReferenceMode =
      form.videoInputMode === "reference" &&
      (videoSupportsReferenceImage(form.model) || videoSupportsReferenceVideo(form.model));

    if (useReferenceMode) {
      if (videoSupportsReferenceImage(form.model) && imageUrls.length > 0) {
        const imageKey = isKlingMotionVideoModel(form.model)
          ? "start_frame"
          : isSeedanceVideoModel(form.model)
            ? "reference_image"
            : "ref_image";
        if (!nextInputs[imageKey]) {
          nextInputs[imageKey] = imageUrls[0];
        }
      }
      if (videoSupportsReferenceVideo(form.model) && videoUrls.length > 0 && !nextInputs.ref_video) {
        nextInputs.ref_video = videoUrls[0];
      }
      return nextInputs;
    }

    if (videoSupportsStartEndFrames(form.model) && imageUrls.length > 0) {
      if (!nextInputs.start_frame) nextInputs.start_frame = imageUrls[0];
      if (videoSupportsEndFrame(form.model) && !nextInputs.end_frame && imageUrls[1]) {
        nextInputs.end_frame = imageUrls[1];
      }
    }
  }

  return nextInputs;
}

function buildCurrentParams(
  tool: StandaloneToolKey,
  form: StandaloneFormState,
): Record<string, unknown> | null {
  if (tool === "image_gen") {
    /* Pass `hasCharacterRef` so the per-model prompt composer can
     *  prepend the right identity-preservation cue (Banana / GPT
     *  Image / SeedDream each phrase it slightly differently — see
     *  `characterCueForModel` in the catalog). */
    const hasCharacterRef = form.imageRefs.some((ref) => ref.role === "character");
    return buildImageParams({
      model: form.model,
      prompt: form.prompt,
      styleId: form.styleId,
      aspectRatio: form.aspectRatio,
      resolution: form.imageResolution,
      quality: form.quality,
      outputFormat: form.outputFormat,
      background: form.background,
      hasCharacterRef,
    });
  }
  if (tool === "video_gen") {
    const usesReferenceMode =
      form.videoInputMode === "reference" &&
      (videoSupportsReferenceImage(form.model) || videoSupportsReferenceVideo(form.model));
    return buildVideoParams({
      model: form.model,
      prompt: form.prompt,
      ratio: form.videoRatio,
      resolution: form.videoResolution,
      duration: isVeoVideoModel(form.model) && form.videoEnd ? 8 : form.videoDuration,
      withAudio: form.videoWithAudio,
      characterOrientation: form.videoCharacterOrientation,
      keepOriginalSound: form.videoKeepOriginalSound,
      hasReferenceVideo: usesReferenceMode && !!form.videoRefVideo,
      referenceVideoDurationSec: form.videoRefVideo?.durationSec ?? null,
      negativePrompt: form.videoNegativePrompt,
      personGeneration: form.videoPersonGeneration,
      returnLastFrame: form.videoReturnLastFrame,
      multiShot: form.videoMultiShot,
      multiPrompt: form.videoMultiPrompt,
    });
  }
  if (tool === "voice_gen") {
    // Prepend the picker-composed audio tag block to the user's
    // script for Gemini models. Other providers ignore the bracketed
    // tags (ElevenLabs interprets them differently and Google Cloud
    // TTS treats them as literal text), so we only inject for Gemini.
    const isGemini = form.model.startsWith("gemini-");
    const tagPrefix = isGemini
      ? composeGeminiAudioTagPrefix({
          emotion: form.audioTagsEmotion,
          personality: form.audioTagsPersonality,
          speed: form.audioSpeed,
        })
      : "";
    const composedScript = tagPrefix
      ? `${tagPrefix} ${form.script}`.trim()
      : form.script;
    return buildAudioParams({
      model: form.model,
      script: composedScript,
      voice: form.voice,
      stylePrompt: form.voiceStyle,
      voiceStylePreset: form.voiceStylePreset,
      voiceSpeed: form.voiceSpeed,
      voiceStability: form.voiceStability,
      voiceSimilarity: form.voiceSimilarity,
      voiceStyleAmount: form.voiceStyleAmount,
    });
  }
  if (tool === "image_to_3d") {
    return build3dParams({
      model: form.model,
      texture: form.texture,
      pbr: form.pbr,
    });
  }
  return null;
}

function buildCurrentInputs(
  tool: StandaloneToolKey,
  form: StandaloneFormState,
): Record<string, unknown> {
  if (tool === "image_gen") {
    if (form.imageRefs.length === 0) return {};
    /* Promote character refs to the front of the array so the
     *  provider sees them as Image 1 — the prompt cue
     *  ("Use the person in Image 1 as the main subject") relies on
     *  this ordering. Stable-sort: characters first, generals after,
     *  preserving relative order within each group. */
    const ordered = [
      ...form.imageRefs.filter((ref) => ref.role === "character"),
      ...form.imageRefs.filter((ref) => ref.role !== "character"),
    ];
    return {
      ref_image:
        ordered.length === 1
          ? ordered[0].url
          : ordered.map((ref) => ref.url),
    };
  }
  if (tool === "video_gen") {
    const inputs: Record<string, unknown> = {};
    const useReferenceMode =
      form.videoInputMode === "reference" &&
      (videoSupportsReferenceImage(form.model) || videoSupportsReferenceVideo(form.model));
    if (!useReferenceMode && videoSupportsStartEndFrames(form.model)) {
      if (form.videoStart) inputs.start_frame = form.videoStart.url;
      if (videoSupportsEndFrame(form.model) && form.videoEnd) {
        inputs.end_frame = form.videoEnd.url;
      }
    }
    if (useReferenceMode && isKlingMotionVideoModel(form.model)) {
      if (form.videoRefImage) inputs.start_frame = form.videoRefImage.url;
      if (form.videoRefVideo) inputs.ref_video = form.videoRefVideo.url;
      return inputs;
    }
    if (useReferenceMode && videoSupportsReferenceImage(form.model) && form.videoRefImage) {
      inputs[isSeedanceVideoModel(form.model) ? "reference_image" : "ref_image"] =
        form.videoRefImage.url;
    }
    if (useReferenceMode && videoSupportsReferenceVideo(form.model) && form.videoRefVideo) {
      inputs.ref_video = form.videoRefVideo.url;
    }
    return {
      ...inputs,
    };
  }
  if (tool === "image_to_3d") {
    const refs = threeDReferencesForForm(form).slice(0, max3dRefsForModel(form.model));
    if (refs.length === 0) return {};
    const imageUrls = refs.map((ref) => ref.url);
    return {
      image: imageUrls[0],
      ...(imageUrls.length > 1
        ? {
            image_urls: imageUrls,
            ref_image: imageUrls,
          }
        : {}),
    };
  }
  return {};
}

function validateForm(
  tool: StandaloneToolKey,
  form: StandaloneFormState,
  t: TranslationFn,
): string | null {
  if (tool === "image_gen" && !form.prompt.trim()) {
    return t("workspace.standalone.validation.image_prompt");
  }
  if (
    tool === "video_gen" &&
    isKlingMotionVideoModel(form.model) &&
    (!form.videoRefImage || !form.videoRefVideo)
  ) {
    return t("workspace.standalone.validation.motion_refs");
  }
  if (
    tool === "video_gen" &&
    form.videoInputMode === "frames" &&
    videoRequiresStartFrame(form.model) &&
    !form.videoStart
  ) {
    return t("workspace.standalone.validation.video_input");
  }
  if (
    tool === "video_gen" &&
    videoSupportsStartEndFrames(form.model) &&
    form.videoEnd &&
    !form.videoStart
  ) {
    return t("workspace.standalone.validation.end_needs_start");
  }
  if (
    tool === "video_gen" &&
    !form.prompt.trim() &&
    !form.videoStart &&
    !form.videoRefImage &&
    !form.videoRefVideo
  ) {
    return t("workspace.standalone.validation.video_input");
  }
  if (tool === "voice_gen" && !form.script.trim()) {
    return t("workspace.standalone.validation.voice_script");
  }
  if (tool === "voice_gen" && form.script.length > 5000) {
    return t("workspace.standalone.validation.script_too_long");
  }
  if (tool === "image_to_3d" && threeDReferencesForForm(form).length === 0) {
    return t("workspace.standalone.validation.model_image");
  }
  return null;
}

function maxImageRefsForModel(model: string): number {
  if (isSeedreamImageModel(model)) return 14;
  if (isGptImageModel(model)) return 16;
  return 14;
}

const TRIPO_MULTIVIEW_3D_MODELS = new Set([
  "tripo3d-v3.1",
  "tripo3d-v3.0",
  "tripo3d-v2.5",
]);

function max3dRefsForModel(model: string): number {
  return TRIPO_MULTIVIEW_3D_MODELS.has(model) ? 4 : 1;
}

function threeDReferencesForForm(form: StandaloneFormState): UploadedRef[] {
  if (form.modelImages?.length) return form.modelImages;
  return form.modelImage ? [form.modelImage] : [];
}

function videoRequiresStartFrame(model: string): boolean {
  return videoSupportsStartEndFrames(model) && !isVeoVideoModel(model);
}

function videoRatioOptionsForModel(model: string): string[] {
  if (isSeedanceVideoModel(model)) return seedanceRatioOptionsForModel(model);
  if (isVeoVideoModel(model)) return ["16:9", "9:16"];
  if (isKlingMotionVideoModel(model)) return [];
  return ["Auto", "16:9", "9:16", "1:1"];
}

function seedanceRatioOptionsForModel(_model: string): string[] {
  return ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"];
}

function videoSupportsMultiShot(model: string): boolean {
  return model === "kling-v3-pro" || model === "kling-v3-omni";
}

function videoResolutionOptionsForModel(model: string): string[] {
  if (isSeedanceVideoModel(model)) return seedanceResolutionOptionsForModel(model);
  if (isVeoVideoModel(model)) return ["720p", "1080p"];
  if (isKlingMotionVideoModel(model)) return ["720p", "1080p"];
  if (model === "replicate-kling-v3-pro" || model === "replicate-kling-v3-omni") {
    return ["720p", "1080p", "4K"];
  }
  if (model === "kling-v3-pro" || model === "kling-v3-omni") return ["720p", "1080p"];
  return [];
}

function videoDurationOptionsForSettings(
  model: string,
  resolution: string,
  hasEndFrame = false,
): number[] {
  if (isVeoVideoModel(model) && hasEndFrame) return [8];
  if (isVeoVideoModel(model) && resolution === "1080p") return [8];
  return videoDurationsForModel(model);
}

function compactRangeLabel(values: string[]): string | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  const first = values[0];
  const last = values[values.length - 1];
  const suffix = last.match(/[a-zA-Z]+$/)?.[0] ?? "";
  const firstPrefix = suffix && first.endsWith(suffix)
    ? first.slice(0, -suffix.length)
    : first;
  return `${firstPrefix}-${last}`;
}

function videoModelSettingTags(model: string, language: "en" | "th"): Array<{
  label: string;
  icon?: "reference" | "frames" | "audio" | "resolution" | "duration" | "multi";
}> {
  const tags: Array<{
    label: string;
    icon?: "reference" | "frames" | "audio" | "resolution" | "duration" | "multi";
  }> = [];
  const isMotion = isKlingMotionVideoModel(model);
  const isVeo = isVeoVideoModel(model);

  if (videoSupportsReferenceImage(model) || videoSupportsReferenceVideo(model)) {
    tags.push({
      label: standaloneInlineLabel("reference", language),
      icon: "reference",
    });
  }

  if (videoSupportsStartEndFrames(model)) {
    tags.push({
      label: videoSupportsEndFrame(model)
        ? standaloneInlineLabel("startEnd", language)
        : standaloneInlineLabel("startFrame", language),
      icon: "frames",
    });
  }

  if (videoSupportsMultiShot(model)) {
    tags.push({
      label: standaloneInlineLabel("multiShots", language),
      icon: "multi",
    });
  }

  if (
    isVeo ||
    (!isMotion &&
      (model.startsWith("kling") ||
        model.startsWith("replicate-kling") ||
        (isSeedanceVideoModel(model) && seedanceVideoSupportsAudio(model))))
  ) {
    tags.push({ label: standaloneInlineLabel("audio", language), icon: "audio" });
  }

  const resolution = compactRangeLabel(videoResolutionOptionsForModel(model));
  if (resolution) {
    tags.push({ label: resolution, icon: "resolution" });
  }

  const durations = videoDurationsForModel(model).map((duration) => `${duration}s`);
  const duration = compactRangeLabel(durations);
  if (duration) {
    tags.push({ label: duration, icon: "duration" });
  }

  return tags;
}

function buildVideoPanelSettings({
  form,
  ratioOptions,
  resolutionOptions,
  durationOptions,
  onChange,
  language,
}: {
  form: StandaloneFormState;
  ratioOptions: string[];
  resolutionOptions: string[];
  durationOptions: string[];
  onChange: (patch: Partial<StandaloneFormState>) => void;
  language: "en" | "th";
}) {
  const settings: Array<{
    id: string;
    label: string;
    value: string;
    kind?: "select" | "toggle" | "readonly";
    options?: Array<{ value: string; label: string }>;
    checked?: boolean;
    onChange?: (value: string) => void;
    onToggle?: (checked: boolean) => void;
  }> = [];
  const isSeedance = isSeedanceVideoModel(form.model);
  const isMotion = isKlingMotionVideoModel(form.model);
  const isVeo = isVeoVideoModel(form.model);
  const supportsAudioToggle =
    (isSeedance && seedanceVideoSupportsAudio(form.model)) ||
    isReplicateVeoVideoModel(form.model) ||
    (!isSeedance && !isVeo && !isMotion);

  if (isReplicateVeoVideoModel(form.model)) {
    settings.push({
      id: "audio",
      label: standaloneInlineLabel("audio", language),
      value: language === "th" ? "เปิดตลอด" : "Always on",
      kind: "readonly",
    });
  } else if (supportsAudioToggle) {
    settings.push({
      id: "audio",
      label: standaloneInlineLabel("audio", language),
      value: form.videoWithAudio
        ? standaloneInlineLabel("on", language)
        : standaloneInlineLabel("off", language),
      kind: "toggle",
      checked: form.videoWithAudio,
      onToggle: (videoWithAudio) => onChange({ videoWithAudio }),
    });
  }

  if (ratioOptions.length > 0) {
    settings.push({
      id: "ratio",
      label: standaloneInlineLabel("aspect", language),
      value: form.videoRatio,
      kind: "select",
      options: ratioOptions.map((value) => ({ value, label: value })),
      onChange: (videoRatio) => onChange({ videoRatio }),
    });
  }

  if (resolutionOptions.length > 0) {
    settings.push({
      id: "resolution",
      label: standaloneInlineLabel("resolution", language),
      value: form.videoResolution,
      kind: "select",
      options: resolutionOptions.map((value) => ({ value, label: value })),
      onChange: (videoResolution) => onChange({ videoResolution }),
    });
  }

  if (!isMotion && durationOptions.length > 0) {
    settings.push({
      id: "duration",
      label: standaloneInlineLabel("duration", language),
      value: String(form.videoDuration),
      kind: "select",
      options: durationOptions.map((value) => ({ value, label: `${value}s` })),
      onChange: (videoDuration) =>
        onChange({ videoDuration: Number(videoDuration) || 5 }),
    });
  }

  if (isMotion) {
    settings.push({
      id: "orientation",
      label: standaloneInlineLabel("orientation", language),
      value: form.videoCharacterOrientation,
      kind: "select",
      options: [
        { value: "image", label: standaloneInlineLabel("followImage", language) },
        { value: "video", label: standaloneInlineLabel("followVideo", language) },
      ],
      onChange: (videoCharacterOrientation) =>
        onChange({
          videoCharacterOrientation:
            videoCharacterOrientation === "video" ? "video" : "image",
        }),
    });
  }

  if (
    (isMotion || form.model === "kling-v3-omni" || form.model === "replicate-kling-v3-omni") &&
    videoSupportsReferenceVideo(form.model)
  ) {
    settings.push({
      id: "keep-sound",
      label: standaloneInlineLabel("originalSound", language),
      value: form.videoKeepOriginalSound
        ? standaloneInlineLabel("keep", language)
        : standaloneInlineLabel("mute", language),
      kind: "toggle",
      checked: form.videoKeepOriginalSound,
      onToggle: (videoKeepOriginalSound) =>
        onChange({ videoKeepOriginalSound }),
    });
  }

  if (isVeo) {
    settings.push({
      id: "people",
      label: standaloneInlineLabel("people", language),
      value: form.videoPersonGeneration,
      kind: "select",
      options: [
        { value: "allow_adult", label: standaloneInlineLabel("adultsOnly", language) },
        { value: "allow_all", label: standaloneInlineLabel("allowChildren", language) },
      ],
      onChange: (videoPersonGeneration) =>
        onChange({
          videoPersonGeneration:
            videoPersonGeneration === "allow_all" ? "allow_all" : "allow_adult",
        }),
    });
  }

  if (isSeedance) {
    settings.push({
      id: "last-frame",
      label: standaloneInlineLabel("lastFrame", language),
      value: form.videoReturnLastFrame
        ? standaloneInlineLabel("return", language)
        : standaloneInlineLabel("off", language),
      kind: "toggle",
      checked: form.videoReturnLastFrame,
      onToggle: (videoReturnLastFrame) =>
        onChange({ videoReturnLastFrame }),
    });
  }

  if (videoSupportsMultiShot(form.model)) {
    settings.push({
      id: "multi-shot",
      label: standaloneInlineLabel("multiShot", language),
      value: form.videoMultiShot
        ? standaloneInlineLabel("director", language)
        : standaloneInlineLabel("off", language),
      kind: "toggle",
      checked: form.videoMultiShot,
      onToggle: (videoMultiShot) => {
        if (!videoMultiShot) {
          onChange({ videoMultiShot });
          return;
        }
        const scenes = parseStandaloneMultiShotScenes(form.videoMultiPrompt);
        onChange({
          videoMultiShot,
          videoMultiPrompt: serializeStandaloneMultiShotScenes(scenes),
          videoDuration: standaloneMultiShotDuration(scenes),
        });
      },
    });
  }

  return settings;
}

function buildImagePanelSettings({
  form,
  resolutionOptions,
  onChange,
  t,
  language,
}: {
  form: StandaloneFormState;
  resolutionOptions: string[];
  onChange: (patch: Partial<StandaloneFormState>) => void;
  t: TranslationFn;
  language: "en" | "th";
}): CreateVideoPanelSetting[] {
  const isGpt = isGptImageModel(form.model);
  const isSeedream = isSeedreamImageModel(form.model);
  const aspectOptions = imageAspectOptionsForModel(form.model);
  const settings: CreateVideoPanelSetting[] = [];

  if (!isSeedream) {
    settings.push({
      id: "image-aspect",
      label: standaloneInlineLabel("aspect", language),
      value: form.aspectRatio,
      kind: "select",
      options: aspectOptions.map((value) => ({ value, label: value })),
      onChange: (aspectRatio) => {
        if (!isDirectGptImageModel(form.model)) {
          onChange({ aspectRatio });
          return;
        }
        const nextResolutions = gptImageResolutionsFor(aspectRatio);
        const imageResolution = nextResolutions.includes(form.imageResolution)
          ? form.imageResolution
          : (nextResolutions[0] ?? "1K");
        onChange({ aspectRatio, imageResolution });
      },
    });
  }

  if (resolutionOptions.length > 0) {
    settings.push({
      id: "image-resolution",
      label: standaloneInlineLabel("resolution", language),
      value: form.imageResolution,
      kind: "select",
      options: resolutionOptions.map((value) => ({ value, label: value })),
      onChange: (imageResolution) => onChange({ imageResolution }),
    });
  }

  if (isGpt) {
    settings.push(
      {
        id: "image-quality",
        label: standaloneInlineLabel("quality", language),
        value: form.quality,
        kind: "select",
        options: ["low", "medium", "high"].map((value) => ({
          value,
          label: standaloneOptionLabel(value, t),
        })),
        onChange: (quality) => onChange({ quality }),
      },
      {
        id: "image-format",
        label: standaloneInlineLabel("format", language),
        value: form.outputFormat,
        kind: "select",
        options: ["png", "jpeg", "webp"].map((value) => ({
          value,
          label: value.toUpperCase(),
        })),
        onChange: (outputFormat) =>
          onChange({
            outputFormat,
            ...(outputFormat === "jpeg" ? { background: "auto" } : {}),
          }),
      },
    );

    if (form.outputFormat !== "jpeg") {
      settings.push({
        id: "image-background",
        label: standaloneInlineLabel("background", language),
        value: form.background,
        kind: "select",
        options: ["auto", "transparent", "opaque"].map((value) => ({
          value,
          label: standaloneOptionLabel(value, t),
        })),
        onChange: (background) => onChange({ background }),
      });
    }
  }

  return settings;
}

function buildThreeDPanelSettings({
  form,
  onChange,
  t,
  language,
}: {
  form: StandaloneFormState;
  onChange: (patch: Partial<StandaloneFormState>) => void;
  t: TranslationFn;
  language: "en" | "th";
}): CreateVideoPanelSetting[] {
  return [
    {
      id: "texture",
      label: t("workspace.standalone.texture"),
      value: form.texture
        ? standaloneInlineLabel("on", language)
        : standaloneInlineLabel("off", language),
      kind: "toggle",
      checked: form.texture,
      onToggle: (texture) => onChange({ texture }),
    },
    {
      id: "pbr",
      label: t("workspace.standalone.pbr_materials"),
      value: form.pbr
        ? standaloneInlineLabel("on", language)
        : standaloneInlineLabel("off", language),
      kind: "toggle",
      checked: form.pbr,
      onToggle: (pbr) => onChange({ pbr }),
    },
  ];
}

function imageModelSettingTags(model: string, language: "en" | "th"): Array<{
  label: string;
  icon?: "reference" | "resolution";
}> {
  const maxRefs = isGptImageModel(model) ? 16 : 14;
  const referenceLabel = standaloneInlineLabel("reference", language);
  if (isGptImageModel(model)) {
    const tags: Array<{ label: string; icon?: "reference" | "resolution" }> = [
      { label: `${referenceLabel} ${maxRefs}`, icon: "reference" },
    ];
    if (isDirectGptImageModel(model)) {
      tags.push({ label: "1K-4K", icon: "resolution" });
    }
    return tags;
  }
  if (isSeedreamImageModel(model)) {
    return [
      { label: `${referenceLabel} ${maxRefs}`, icon: "reference" },
      { label: "2K-3K", icon: "resolution" },
    ];
  }
  if (isReplicateBanana2ImageModel(model)) {
    return [{ label: `${referenceLabel} ${maxRefs}`, icon: "reference" }];
  }
  return [
    { label: `${referenceLabel} ${maxRefs}`, icon: "reference" },
    {
      label: isBananaProImageModel(model) || isDirectBanana2ImageModel(model)
        ? "1K-4K"
        : "1K-2K",
      icon: "resolution",
    },
  ];
}

function threeDModelSettingTags(model: string, language: "en" | "th"): Array<{
  label: string;
  icon?: "reference" | "resolution";
}> {
  return [
    {
      label: `${standaloneInlineLabel("reference", language)} ${max3dRefsForModel(model)}`,
      icon: "reference",
    },
    { label: standaloneInlineLabel("texture", language), icon: "resolution" },
  ];
}

function audioModelSettingTags(model: string, language: "en" | "th"): Array<{
  label: string;
  icon?: "audio" | "multi";
}> {
  if (model.startsWith("elevenlabs-") || model.startsWith("eleven_")) {
    return [
      { label: standaloneInlineLabel("liveVoices", language), icon: "audio" },
      { label: standaloneInlineLabel("style", language), icon: "multi" },
    ];
  }
  return [
    { label: standaloneInlineLabel("instructions", language), icon: "multi" },
  ];
}

function filterJobsForTool(
  jobs: StandaloneJobRow[],
  tool: StandaloneToolKey,
): StandaloneJobRow[] {
  const nodeType = STANDALONE_TOOLS[tool].nodeType;
  return jobs.filter((job) => job.node_type === nodeType);
}

function formatDate(
  value: string,
  language: ReturnType<typeof useLanguage>["language"],
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(language === "th" ? "th-TH" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
