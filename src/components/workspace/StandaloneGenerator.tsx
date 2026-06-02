import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  Box,
  BookOpen,
  Captions,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Camera,
  Crop,
  Download,
  ExternalLink,
  Film,
  FolderOpen,
  GripVertical,
  ImagePlus,
  Languages,
  LayoutGrid,
  Loader2,
  Menu,
  Music,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  Rows3,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { friendlyError, functionErrorMessage } from "@/lib/friendlyError";
import { uploadSupabaseStorageFile } from "@/lib/supabase/resumableUpload";
import {
  CreateImagePanel,
  CreateVideoPanel,
  StandaloneToolHeaderCard,
  StandalonePromptMentionTextarea,
  type CreatePanelCostQuote,
  type CreateVideoPanelSetting,
} from "@/components/workspace/CreateImagePanel";
import { normalizeUrlAssetSource, validateUrlAssetSource } from "@/components/workspace/urlAssetValidation";
import InsufficientCreditsDialog from "@/components/InsufficientCreditsDialog";
import {
  applyNodeCostDiscount,
  applyPackageCostDiscount,
  calculateNodeCostQuote,
  effectiveNodeDiscountPercent,
} from "@/lib/nodeCostCalculator";
import {
  featureLabelForPlanLock,
  freePlanBlockedFeatureForStandaloneTool,
  isWorkspaceFreePlan,
  type WorkspacePaidFeature,
} from "@/lib/workspacePlanAccess";
import { useNodeCreditCosts } from "@/hooks/useNodeCreditCosts";
import { useCredits } from "@/hooks/useCredits";
import { useSignInModal } from "@/hooks/useSignInModal";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import NodePreviewLightbox, { type PreviewPayload } from "./NodePreviewLightbox";
import { useFreshSignedUrl } from "./useFreshSignedUrl";
import { useMirroredTripoUrl } from "./useMirroredTripoUrl";
import { getSignedUrl } from "@/hooks/useSignedUrl";
import { loadModelViewer } from "@/lib/loadModelViewer";
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
import {
  isSeedanceReferenceVideoDurationValid,
  isSeedanceReferenceVideoPixelCountValid,
  readVideoFileMetadata,
  readVideoUrlMetadata,
  SEEDANCE_REF_VIDEO_MAX_SEC,
  SEEDANCE_REF_VIDEO_MIN_SEC,
  seedanceReferenceVideoPixelMessage,
  type VideoMetadata,
} from "./videoMetadata";
import {
  composeGptImageSize,
  GEMINI_TTS_VOICES,
  DEFAULT_GEMINI_TTS_VOICE,
} from "./workspaceSchema";
import { useVoicePreview } from "@/hooks/useVoicePreview";
import {
  modelLogoFor,
  orderModelsByRecommendation,
  recommendedModelPreviewFor,
  type ModelPreviewMeta,
} from "./modelDisplay";
import { getProjectAvatar } from "./projectAvatars";
import MediaContextMenu from "./MediaContextMenu";
import { buildMediaMenuItems } from "./mediaMenuItems";
import { useMediaContextMenu } from "./useMediaContextMenu";
import {
  buildExtractedAudioFile,
  extractCompressedAudioBlobFromVideo,
  extractAudioBlobFromVideo,
} from "./videoAudioActions";
import {
  CAPTIONS_LANGUAGES,
  transcribeAudio,
} from "@/features/editor/services/captions-client";
import {
  AUTO_SUPTITLE_GROUP_PREFIX,
  AUTO_SUPTITLE_TRACK_NAME,
  algorithmFromCaptionSettings,
  buildAutoSuptitleCuesFromResponse,
  formatAutoSuptitleCueText,
  normalizeAutoSuptitleCuesForDuration,
  type AutoSuptitleAlgorithmSettings,
  type AutoSuptitleCue,
  type AutoSuptitleResult,
} from "@/features/editor/services/auto-suptitle";
import {
  applyCaptionCase,
  BUILTIN_CAPTION_PRESETS,
  CAPTION_TEXT_ANIMATION_OPTIONS,
  CAPTION_TRANSITION_OPTIONS,
  captionAccentColor,
  captionTextAnimationOptionFor,
  captionTransitionOptionFor,
  DEFAULT_CAPTION_SETTINGS,
  normalizeCaptionSettings,
  type CaptionAnimation,
  type CaptionStyleSettings,
  type CaptionTextAnimation,
} from "@/features/editor/services/caption-presets";
import {
  createAutoSubtitleEditorProject,
  loadAutoSubtitleHandoff,
  renderAutoSubtitleVideo,
  saveAutoSubtitleHandoff,
  type RenderAutoSubtitleVideoResult,
} from "./autoSubtitleStandalone";
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
const ELEVENLABS_DUBBING_EDGE_FUNCTION = "elevenlabs-dubbing";
const AUTO_PROMPT_MODEL = "gpt-5.5";
const AUTO_PROMPT_SYSTEM_PROMPT = `You help MediaForge users create production-ready prompts for the active generation tool.
Turn rough human language into a clear prompt that can be used immediately.
Preserve every @mention token exactly as provided, including label and id.
If selected references are listed, include the relevant @mention tokens when they should be passed into generation.
Use attached images and sampled video frames to understand the real visual content of the user's references.
Do not invent references, models, parameters, or provider capabilities.`;
const AUTO_PROMPT_VIDEO_FRAME_COUNT = 3;
const AUTO_PROMPT_VIDEO_FRAME_MAX_SIDE = 768;
const AUTO_PROMPT_VIDEO_FRAME_JPEG_QUALITY = 0.78;
const STANDALONE_CANVAS_ID = "standalone";
const STORAGE_BUCKET = "ai-media";
const AUTO_SUBTITLE_RESULT_SOURCE = "auto_subtitle";
const AUTO_SUBTITLE_RESULT_METADATA_TOOL = "auto_subtitle_result";
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 365;
const IMAGE_REFERENCE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_REFERENCE_UPLOAD_MAX_SIDE = 1600;
const IMAGE_REFERENCE_UPLOAD_JPEG_QUALITY = 0.88;
const TRANSLATE_VIDEO_UPLOAD_MAX_BYTES = 1024 * 1024 * 1024;
const TRANSLATE_VIDEO_UPLOAD_MAX_LABEL = "1 GB";
const TRANSLATE_MEDIA_ACCEPT = "video/*,audio/*,.mp3,.wav,.m4a,.aac";
const AUTO_SUBTITLE_MEDIA_ACCEPT = "video/*,.mp4,.mov,.webm,.m4v";
const AUTO_SUBTITLE_UPLOAD_MAX_BYTES = 1024 * 1024 * 1024;
const AUTO_SUBTITLE_UPLOAD_MAX_LABEL = "1 GB";
const AUTO_SUBTITLE_MAX_DURATION_SEC = 10 * 60;
const AUTO_SUBTITLE_MAX_DURATION_LABEL = "10 minutes";
const AUTO_SUBTITLE_MAX_DURATION_LABEL_TH = "10 นาที";
const AUTO_SUBTITLE_AUDIO_MAX_BYTES = 24 * 1024 * 1024;
const AUTO_SUBTITLE_FONT_OPTIONS = [
  "Inter",
  "Prompt",
  "Kanit",
  "Noto Sans Thai",
  "Arial",
  "Montserrat",
];
const AUTO_SUBTITLE_COLOR_OPTIONS = [
  "#ffffff",
  "#F4FF00",
  "#8CF7FF",
  "#7CFF8A",
  "#FF8FB3",
  "#FFB84D",
];
const AUTO_SUBTITLE_COLOR_SWATCHES = [
  "#FFFFFF", "#8CF7FF", "#E5E7EB", "#A3A3A3", "#525252", "#111827", "#F4FF00", "#FFB84D", "#FF4747", "#D946EF",
  "#38BDF8", "#22C55E", "#FBCFE8", "#F9A8D4", "#FB7185", "#E11D48", "#DB2777", "#F472B6", "#FCA5A5", "#FDBA74",
  "#FDA4AF", "#FB7185", "#EF4444", "#B91C1C", "#7F1D1D", "#FECACA", "#FED7AA", "#FDBA74", "#FB923C", "#F97316",
  "#FDE68A", "#FEF08A", "#D9F99D", "#A7F3D0", "#84CC16", "#65A30D", "#BEF264", "#86EFAC", "#22C55E", "#00FF5A",
];
const AUTO_SUBTITLE_MAX_WORD_SPLIT = 6;
const AUTO_SUBTITLE_WORD_SPLIT_OPTIONS = [1, 2, 3, 4, 5, 6];
const SHOW_LOCAL_VOICE_DUB_ENGINES = false;
const STANDALONE_JOB_SELECT =
  "id,node_type,provider,model,request,status,attempts,result,error,last_error,created_at,completed_at,run_after,deadline_at,locked_by,lock_expires_at,credits_charged,credits_refunded";
const DEFAULT_WORKSPACE_INFRASTRUCTURE_BUFFER_PERCENT = 40;
const FAILED_STANDALONE_HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
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
  return "Could not read the reference video metadata. Upload an MP4/MOV video between 2 and 15 seconds at 1080p or smaller.";
}

function isAutoSubtitleDurationValid(durationSec?: number | null): durationSec is number {
  return (
    typeof durationSec === "number" &&
    Number.isFinite(durationSec) &&
    durationSec > 0 &&
    durationSec <= AUTO_SUBTITLE_MAX_DURATION_SEC
  );
}

function autoSubtitleDurationMessage(durationSec?: number | null): string {
  const suffix =
    typeof durationSec === "number" && Number.isFinite(durationSec)
      ? ` (${durationSec.toFixed(1)}s)`
      : "";
  return `Auto Subtitle supports MP4/MOV/WebM videos up to ${AUTO_SUBTITLE_MAX_DURATION_LABEL}${suffix}.`;
}

function autoSubtitleUploadSizeMessage(): string {
  return `Auto Subtitle accepts videos up to ${AUTO_SUBTITLE_UPLOAD_MAX_LABEL}.`;
}

function autoSubtitleAudioBitrate(durationSec?: number | null): string {
  if (typeof durationSec === "number" && durationSec >= 8 * 60) return "64k";
  return "96k";
}

function translateVideoUploadSizeMessage(language: string): string {
  return language === "th"
    ? `ไฟล์ต้นฉบับต้องมีขนาดไม่เกิน ${TRANSLATE_VIDEO_UPLOAD_MAX_LABEL}`
    : `Source media must be ${TRANSLATE_VIDEO_UPLOAD_MAX_LABEL} or smaller.`;
}

function isTranslateVideoOverUploadLimit(slot: UploadSlot, file: File): boolean {
  return (
    (slot === "translate-video" || slot === "auto-subtitle-video") &&
    file.size > TRANSLATE_VIDEO_UPLOAD_MAX_BYTES
  );
}

function readVideoFileDuration(file: File): Promise<number | null> {
  return readVideoFileMetadata(file).then((metadata) => metadata?.durationSec ?? null);
}

async function resolveReadableMediaUrl(url: string): Promise<string> {
  return /^(blob:|data:)/i.test(url) ? url : await getSignedUrl(url);
}

// Inline a client-only blob: URL as a base64 data URL so the Auto Prompt edge
// function never has to fetch a URL it cannot reach from the server.
async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read image reference."));
    reader.onerror = () =>
      reject(new Error("Could not read image reference."));
    reader.readAsDataURL(blob);
  });
}

async function readVideoUrlDuration(url: string): Promise<number | null> {
  const readableUrl = await resolveReadableMediaUrl(url);
  return readVideoUrlMetadata(readableUrl).then((metadata) => metadata?.durationSec ?? null);
}

async function readSeedanceReferenceVideoUrlMetadata(url: string): Promise<VideoMetadata | null> {
  const readableUrl = await resolveReadableMediaUrl(url);
  return readVideoUrlMetadata(readableUrl);
}

function validateSeedanceReferenceVideoMetadata(metadata: VideoMetadata | null): string | null {
  if (!metadata) return unreadableSeedanceReferenceVideoMessage();
  if (!isSeedanceReferenceVideoDurationValid(metadata.durationSec)) {
    return seedanceReferenceVideoDurationMessage(metadata.durationSec);
  }
  if (!isSeedanceReferenceVideoPixelCountValid(metadata)) {
    return seedanceReferenceVideoPixelMessage(metadata);
  }
  return null;
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

async function readImageFileDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return null;
  try {
    const img = await loadImageElement(file);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (width > 0 && height > 0) return { width, height };
  } catch {
    // Dimension metadata is a hint for output-size selection only.
  }
  return null;
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
  | "translate-video"
  | "auto-subtitle-video"
  | "upscale-image"
  | "model-image"
  | "model-3d";

type StandaloneThreeDMode = "image_to_3d" | "auto_rig" | "animate";

const THREE_D_STANDALONE_NODE_TYPES = new Set<string>([
  "imageTo3dNode",
  "tripoImportModelNode",
  "tripoPreRigCheckNode",
  "tripoRigNode",
  "tripoAnimateNode",
  "tripoExportNode",
]);

const TRIPO_RIG_TYPES = [
  "biped",
  "quadruped",
  "hexapod",
  "octopod",
  "avian",
  "serpentine",
  "aquatic",
];

const TRIPO_RIG_TYPE_SET = new Set(TRIPO_RIG_TYPES);
const TRIPO_AUTO_RIG_TYPE = "auto";
const MODEL_3D_UPLOAD_ACCEPT = ".glb,.obj,.fbx,.stl,model/gltf-binary,model/obj,model/fbx,model/stl,application/octet-stream";
const MODEL_3D_IMPORT_MAX_BYTES = 20 * 1024 * 1024;

const TRIPO_ANIMATION_PRESETS = [
  "preset:idle",
  "preset:walk",
  "preset:run",
  "preset:dive",
  "preset:climb",
  "preset:jump",
  "preset:slash",
  "preset:shoot",
  "preset:hurt",
  "preset:fall",
  "preset:turn",
  "preset:quadruped:walk",
  "preset:hexapod:walk",
  "preset:octopod:walk",
  "preset:serpentine:march",
  "preset:aquatic:march",
];

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
  width?: number;
  height?: number;
  modelUrl?: string;
  previewUrl?: string;
  taskId?: string;
  tripoModelTaskId?: string;
  originalModelTaskId?: string;
  providerTaskId?: string;
  providerMeta?: Record<string, unknown>;
  nodeType?: string;
}

const TRANSLATE_VIDEO_EXTENSION_RE = /\.(mp4|mov|webm|m4v)(?:[?#].*)?$/i;
const TRANSLATE_AUDIO_EXTENSION_RE = /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|weba)(?:[?#].*)?$/i;

function translateOutputTypeForMedia(
  media: UploadedRef | null | undefined,
): "audio" | "video" {
  const mime = media?.mime?.trim().toLowerCase() ?? "";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const name = media?.name ?? "";
  const url = media?.url ?? "";
  if (TRANSLATE_VIDEO_EXTENSION_RE.test(name) || TRANSLATE_VIDEO_EXTENSION_RE.test(url)) {
    return "video";
  }
  if (TRANSLATE_AUDIO_EXTENSION_RE.test(name) || TRANSLATE_AUDIO_EXTENSION_RE.test(url)) {
    return "audio";
  }
  return "video";
}

function translateSourceContentTypeForMedia(
  media: UploadedRef | null | undefined,
): string | null {
  if (!media) return null;
  const mime = media?.mime?.trim();
  if (mime) return mime;
  return translateOutputTypeForMedia(media) === "video" ? "video/mp4" : "audio/mpeg";
}

function translateOutputFormatLabel(media: UploadedRef | null | undefined): string {
  return translateOutputTypeForMedia(media) === "video" ? "MP4 / video" : "MP3 / audio";
}

function translateOutputShortLabel(media: UploadedRef | null | undefined): string {
  return translateOutputTypeForMedia(media) === "video" ? "MP4" : "MP3";
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
  modelUrl?: string;
  previewUrl?: string;
  taskId?: string;
  tripoModelTaskId?: string;
  originalModelTaskId?: string;
  providerTaskId?: string;
  providerMeta?: Record<string, unknown>;
  nodeType?: string;
};

type StandaloneAutoPromptAttachment = {
  imageUrl?: string;
  dataUrl?: string;
  mime?: string;
  detail?: "low" | "high" | "auto";
  label?: string;
  sourceNodeId?: string;
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
  output_type?: string;
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

const STANDALONE_JOB_TERMINAL_STATUSES = new Set<StandaloneJobRow["status"]>([
  "completed",
  "failed",
  "permanent_failed",
]);

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizePreRigBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if (/not\s+riggable|cannot\s+be\s+rigged|can't\s+be\s+rigged|unsupported/.test(text)) {
    return false;
  }
  if (/riggable|passed|pass|true|yes/.test(text)) return true;
  if (/false|no|failed|fail/.test(text)) return false;
  return null;
}

function normalizeTripoRigType(value: unknown): string {
  const text = firstText(value)?.trim().toLowerCase();
  return text && TRIPO_RIG_TYPE_SET.has(text) ? text : "";
}

function tripoPreRigInfoFromJob(job: StandaloneJobRow): {
  riggable: boolean | null;
  rigType: string;
} {
  const result = job.result;
  const outputs = result?.outputs ?? {};
  const providerMeta = result?.provider_meta ?? {};
  const text = firstText(result?.text, outputs.text, outputs.message);
  const textRigType = text?.match(/\(([^)]+)\)/)?.[1];
  return {
    riggable: normalizePreRigBoolean(
      providerMeta.riggable ?? outputs.riggable ?? text,
    ),
    rigType: normalizeTripoRigType(
      providerMeta.rig_type ?? outputs.rig_type ?? textRigType,
    ),
  };
}

function standaloneJobFailureMessage(
  job: Pick<StandaloneJobRow, "error" | "last_error" | "result">,
  fallback: string,
): string {
  return (
    firstText(
      job.error,
      job.last_error,
      job.result?.text,
      job.result?.provider_meta?.message,
    ) ?? fallback
  );
}

function threeDRigTypeLabel(value: string | null | undefined): string {
  const normalized = String(value || TRIPO_AUTO_RIG_TYPE).trim().toLowerCase();
  if (!normalized || normalized === TRIPO_AUTO_RIG_TYPE) return "Auto from Rig Check";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isGenericThreeDFailureMessage(message: string): boolean {
  return /^(failed|error|something went wrong|try again|support|permanent failed)$/i.test(
    message.trim(),
  );
}

function threeDJobTypeLabel(job: Pick<StandaloneJobRow, "node_type">): string {
  switch (job.node_type) {
    case "tripoPreRigCheckNode":
      return "Rig Check";
    case "tripoRigNode":
      return "AI Rig Draft";
    case "tripoAnimateNode":
      return "Animate Preset";
    case "tripoImportModelNode":
      return "Import 3D";
    case "tripoExportNode":
      return "Export 3D";
    case "imageTo3dNode":
    default:
      return "Image to 3D";
  }
}

function threeDJobStatusLabel(status: StandaloneJobRow["status"]): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "completed":
      return "Ready";
    case "failed":
    case "permanent_failed":
      return "Failed";
    default:
      return status;
  }
}

function cleanThreeDJobFailureMessage(message: string): string {
  return message
    .replace(/^error:\s*/i, "")
    .replace(/\bpermanent_failed\b/gi, "failed")
    .replace(/\s+/g, " ")
    .trim();
}

function threeDJobFailureHint(job: StandaloneJobRow): string {
  const raw = cleanThreeDJobFailureMessage(standaloneJobFailureMessage(job, ""));
  if (raw && !isGenericThreeDFailureMessage(raw)) {
    if (job.node_type === "tripoRigNode") {
      return `${raw}. Treat the AI rig as a draft: run Rig Check, choose the closest rig type, or send the model to manual rigging.`;
    }
    if (job.node_type === "tripoPreRigCheckNode") {
      return `${raw}. Manual rigging is safer when the body shape is unclear, occluded, or not in a clean T/A-pose.`;
    }
    return raw;
  }
  switch (job.node_type) {
    case "tripoPreRigCheckNode":
      return "Tripo could not confirm that this model is riggable. Use a clearer body shape, less occlusion, or send it to manual rigging.";
    case "tripoRigNode":
      return "Tripo rejected this rig draft. Run Rig Check first, choose the closest type, or use a human rig pass for production work.";
    case "tripoAnimateNode":
      return "Animation preset needs a rigged model first. Run Rig Assistant successfully before animation.";
    case "tripoImportModelNode":
      return "The uploaded model could not be imported. Try GLB/OBJ/FBX/STL with a clean mesh and supported file size.";
    case "imageTo3dNode":
    default:
      return "Generation failed. Try a clearer front reference image or fewer/cleaner reference views.";
  }
}

function threeDJobTimelineSummary(job: StandaloneJobRow): string {
  if (job.status === "failed" || job.status === "permanent_failed") {
    return `Failed: ${threeDJobFailureHint(job)}`;
  }
  if (job.status === "queued") return "Waiting for the worker to start this run.";
  if (job.status === "running") return "Processing with Tripo. The output will appear here when ready.";
  switch (job.node_type) {
    case "tripoPreRigCheckNode": {
      const info = tripoPreRigInfoFromJob(job);
      if (info.riggable === false) return "Manual recommended: Rig Check says this model is not riggable yet.";
      return info.rigType
        ? `Rig Check passed. Suggested type: ${threeDRigTypeLabel(info.rigType)}.`
        : "Rig Check passed, but no safe rig type was returned. Choose one manually.";
    }
    case "tripoRigNode":
      return "AI rig draft is ready. Review motion, then export or refine manually.";
    case "tripoAnimateNode":
      return "Animated model is ready. Export GLB/FBX when you are happy with it.";
    case "tripoImportModelNode":
      return "External model is imported. Run Rig Check before drafting a rig.";
    case "tripoExportNode":
      return "Export package is ready to download.";
    case "imageTo3dNode":
    default:
      return "3D model is ready. Run Rig Check before rigging; export anytime.";
  }
}

interface VoiceTranslateTask {
  id: string;
  jobId?: string;
  status: "submitted" | "queued" | "pending" | "processing" | "running" | "completed" | "failed";
  outputLanguage: string;
  sourceName: string;
  engine?: VoiceTranslateEngine;
  stage?: "submitted" | "translating" | "synthesizing" | "merging" | "completed";
  outputType?: "video" | "audio";
  sourceStorageBucket?: string;
  sourceStoragePath?: string;
  outputUrl?: string;
  providerOutputUrl?: string;
  translatedScript?: string;
  error?: string;
}

interface AutoSubtitleResultItem {
  id: string;
  assetId?: string;
  sourceName: string;
  sourceUrl: string;
  sourceStorageBucket?: "ai-media" | "user_assets";
  sourceStoragePath?: string;
  outputUrl: string;
  outputName: string;
  outputMime: string;
  outputExtension: "mp4" | "webm";
  outputStorageBucket?: "ai-media" | "user_assets";
  outputStoragePath?: string;
  cueCount: number;
  transcriptText: string;
  handoffId: string;
  editorProjectId?: string;
  editorProjectError?: string;
  createdAt: number;
  duration: number;
}

function autoSubtitleResultMatchesMedia(
  result: AutoSubtitleResultItem,
  media: UploadedRef | null | undefined,
): boolean {
  if (!media) return false;
  const resultSourceKey =
    autoSubtitleStorageKey(result.sourceStorageBucket, result.sourceStoragePath) ||
    autoSubtitleStorageKeyFromUrl(result.sourceUrl);
  const mediaSourceKey =
    autoSubtitleStorageKey(media.storageBucket, media.storagePath) ||
    autoSubtitleStorageKeyFromUrl(media.url);
  if (resultSourceKey && mediaSourceKey && resultSourceKey === mediaSourceKey) {
    return true;
  }

  const resultUrl = autoSubtitleComparableUrl(result.sourceUrl);
  const mediaUrl = autoSubtitleComparableUrl(media.url);
  if (resultUrl && mediaUrl && resultUrl === mediaUrl) return true;

  const resultName = autoSubtitleComparableName(result.sourceName);
  const mediaName = autoSubtitleComparableName(media.name);
  return (
    resultName.length > 0 &&
    mediaName.length > 0 &&
    (resultName === mediaName ||
      resultName.includes(mediaName) ||
      mediaName.includes(resultName))
  );
}

interface AutoSubtitleProgress {
  progress: number;
  message: string;
}

type StandaloneVideoInputMode = "frames" | "reference";
type VoiceTranslateEngine =
  | "elevenlabs_dubbing_clone"
  | "elevenlabs_ivc_tts"
  | "local_gemini_tts"
  | "local_google_tts";
type AutoSubtitleSegmentationMode = "sentence" | "words";

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
  translateVideo: UploadedRef | null;
  translateEngine: VoiceTranslateEngine;
  translateSourceLanguage: string;
  translateOutputLanguage: string;
  translateMode: "fast" | "quality";
  translateSpeakerNum: number;
  translateConsent: boolean;
  autoSubtitleVideo: UploadedRef | null;
  autoSubtitleLanguage: string;
  autoSubtitlePresetId: string;
  autoSubtitleFont: string;
  autoSubtitleSize: number;
  autoSubtitleFill: string;
  autoSubtitleAccentColor: string;
  autoSubtitlePosition: "top" | "middle" | "bottom";
  autoSubtitlePositionX: number;
  autoSubtitlePositionY: number;
  autoSubtitleStroke: boolean;
  autoSubtitleStrokeWidth: number;
  autoSubtitleBackground: boolean;
  autoSubtitleTransition: CaptionAnimation;
  autoSubtitleOutTransition: CaptionAnimation;
  autoSubtitleTextAnimation: CaptionTextAnimation;
  autoSubtitleSegmentationMode: AutoSubtitleSegmentationMode;
  autoSubtitleWordsPerLine: number;
  upscaleImage: UploadedRef | null;
  upscalePreset: UpscalePreset;
  upscaleScale: string;
  upscaleFlavor: "photo" | "sublime" | "photo_denoiser";
  upscaleSharpen: string;
  upscaleSmartGrain: string;
  upscaleUltraDetail: string;
  upscaleFilterNsfw: boolean;
  upscaleVideoResolution: UpscaleVideoResolution;
  upscaleFpsBoost: boolean;
  modelImage: UploadedRef | null;
  modelImages: UploadedRef[];
  texture: boolean;
  pbr: boolean;
  threeDMode?: StandaloneThreeDMode;
  model3dSource?: UploadedRef | null;
  rigType?: string;
  rigSpec?: "tripo" | "mixamo";
  rigOutFormat?: "glb" | "fbx";
  animationPreset?: string;
  animationBatch?: string;
  animationOutFormat?: "glb" | "fbx";
  animationBake?: boolean;
  animationWithGeometry?: boolean;
  animationInPlace?: boolean;
  urlAssetSource?: string;
  urlAssetFileName?: string;
}

type UpscalePreset = "balanced" | "clean" | "detail" | "creative";
type UpscaleVideoResolution = "720p" | "1k" | "2k" | "4k";

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

const DEFAULT_TRANSLATE_PARAMS = {
  translateVideo: null as UploadedRef | null,
  translateEngine: "elevenlabs_dubbing_clone" as VoiceTranslateEngine,
  translateSourceLanguage: "Auto",
  translateOutputLanguage: "English",
  translateMode: "fast" as const,
  translateSpeakerNum: 1,
  translateConsent: false,
};

const DEFAULT_AUTO_SUBTITLE_PARAMS = {
  autoSubtitleVideo: null as UploadedRef | null,
  autoSubtitleLanguage: "auto",
  autoSubtitlePresetId: "tiktok-yellow",
  autoSubtitleFont: "Inter",
  autoSubtitleSize: 56,
  autoSubtitleFill: "#ffffff",
  autoSubtitleAccentColor: "#F4FF00",
  autoSubtitlePosition: "bottom" as const,
  autoSubtitlePositionX: 0.5,
  autoSubtitlePositionY: 0.84,
  autoSubtitleStroke: true,
  autoSubtitleStrokeWidth: 6,
  autoSubtitleBackground: false,
  autoSubtitleTransition: "fade" as const,
  autoSubtitleOutTransition: "fade" as const,
  autoSubtitleTextAnimation: "none" as const,
  autoSubtitleSegmentationMode: "sentence" as const,
  autoSubtitleWordsPerLine: 4,
};

const DEFAULT_UPSCALE_PARAMS = {
  upscaleImage: null as UploadedRef | null,
  upscalePreset: "balanced" as UpscalePreset,
  upscaleScale: "2",
  upscaleFlavor: "photo" as const,
  upscaleSharpen: "7",
  upscaleSmartGrain: "7",
  upscaleUltraDetail: "30",
  upscaleFilterNsfw: false,
  upscaleVideoResolution: "2k" as UpscaleVideoResolution,
  upscaleFpsBoost: false,
};

type VoiceTranslateEngineOption = {
  id: VoiceTranslateEngine;
  title: string;
  provider: string;
  badge: string;
  description: string;
  localOnly?: boolean;
};

const LOCAL_VOICE_DUB_ENGINES: VoiceTranslateEngine[] = [
  "local_gemini_tts",
  "local_google_tts",
];

function isLocalVoiceDubEngine(engine: VoiceTranslateEngine): boolean {
  return LOCAL_VOICE_DUB_ENGINES.includes(engine);
}

function isElevenLabsDubbingEngine(engine?: VoiceTranslateEngine): boolean {
  return engine === "elevenlabs_dubbing_clone";
}

const UPSCALE_VIDEO_EXTENSION_RE = /\.(mp4|mov|webm|m4v)(?:[?#].*)?$/i;

function isUpscaleVideoReference(
  ref: Pick<UploadedRef, "mime" | "name" | "url"> | null | undefined,
): boolean {
  if (!ref) return false;
  const mime = ref.mime.toLowerCase();
  if (mime.startsWith("video/")) return true;
  return UPSCALE_VIDEO_EXTENSION_RE.test(ref.name) || UPSCALE_VIDEO_EXTENSION_RE.test(ref.url);
}

function isUpscaleVideoSource(form: Pick<StandaloneFormState, "upscaleImage">): boolean {
  return isUpscaleVideoReference(form.upscaleImage);
}

function isVoiceTranslateProvider(provider: string | null | undefined): boolean {
  return provider === "elevenlabs_dubbing" || provider === "elevenlabs_ivc_tts";
}

function isVoiceTranslateStandaloneJob(job: StandaloneJobRow): boolean {
  return (
    (job.node_type === "voiceTranslateNode" && isVoiceTranslateProvider(job.provider)) ||
    ((job.node_type === "audioGenNode" || job.node_type === "mergeAudioNode") &&
      isLocalVoiceDubJob(job))
  );
}

function voiceDubModelForEngine(engine: VoiceTranslateEngine): string {
  switch (engine) {
    case "elevenlabs_dubbing_clone":
      return "elevenlabs-dubbing-voice-clone";
    case "elevenlabs_ivc_tts":
      return "elevenlabs-ivc-tts-demo";
    case "local_gemini_tts":
      return "gemini-3.1-flash-tts-preview";
    case "local_google_tts":
      return "google-tts-studio";
    default:
      return "elevenlabs-dubbing-voice-clone";
  }
}

function voiceDubProviderForEngine(engine: VoiceTranslateEngine): string {
  switch (engine) {
    case "elevenlabs_dubbing_clone":
      return "ElevenLabs Dubbing";
    case "elevenlabs_ivc_tts":
      return "ElevenLabs IVC TTS";
    case "local_gemini_tts":
      return "Gemini TTS";
    case "local_google_tts":
      return "Google TTS";
    default:
      return "ElevenLabs";
  }
}

function voiceTranslateEngineOptions(th: boolean): VoiceTranslateEngineOption[] {
  return [
    {
      id: "elevenlabs_dubbing_clone",
      title: th ? "แปลเสียง" : "Voice Translate",
      provider: "ElevenLabs",
      badge: th ? "Voice clone" : "Voice clone",
      description: th
        ? "แปลเสียงจาก MP4/MP3 และรักษาโทนเสียงผู้พูดเดิมด้วย ElevenLabs"
        : "Translate MP4/MP3 speech while preserving the original speaker tone with ElevenLabs.",
    },
  ];
}

function isLocalVoiceDubJob(job: StandaloneJobRow): boolean {
  const params = job.request?.params ?? {};
  return params.local_voice_translate === true || params.local_voice_translate === "true";
}

function localVoiceDubEngineFromJob(job: StandaloneJobRow): VoiceTranslateEngine | undefined {
  const params = job.request?.params ?? {};
  const engine = String(params.local_voice_translate_engine ?? "");
  return LOCAL_VOICE_DUB_ENGINES.includes(engine as VoiceTranslateEngine)
    ? (engine as VoiceTranslateEngine)
    : undefined;
}

function jobStatusForTranslateTask(job: StandaloneJobRow): VoiceTranslateTask["status"] {
  if (job.status === "completed") return "completed";
  if (job.status === "failed" || job.status === "permanent_failed") return "failed";
  return "running";
}

function outputUrlForLocalVoiceDubJob(job: StandaloneJobRow): {
  outputUrl?: string;
  outputType?: "video" | "audio";
} {
  const result = job.result;
  const resultRecord = result as (StandaloneResult & { result_url?: string }) | null;
  const outputs = result?.outputs ?? {};
  const videoUrl = firstText(
    result?.type === "video" ? result.url : undefined,
    outputs.video_url,
    outputs.output_video,
    resultRecord?.result_url,
  );
  if (videoUrl) return { outputUrl: videoUrl, outputType: "video" };
  const audioUrl = firstText(
    result?.type === "audio" ? result.url : undefined,
    outputs.audio_url,
    outputs.output_audio,
    resultRecord?.result_url,
    result?.url,
  );
  if (audioUrl) return { outputUrl: audioUrl, outputType: "audio" };
  return {};
}

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
    ...DEFAULT_TRANSLATE_PARAMS,
    ...DEFAULT_AUTO_SUBTITLE_PARAMS,
    ...DEFAULT_UPSCALE_PARAMS,
    modelImage: null,
    modelImages: [],
    texture: true,
    pbr: true,
  },
  image_upscale: {
    model: STANDALONE_TOOLS.image_upscale.defaultModel,
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
    ...DEFAULT_TRANSLATE_PARAMS,
    ...DEFAULT_AUTO_SUBTITLE_PARAMS,
    ...DEFAULT_UPSCALE_PARAMS,
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
    ...DEFAULT_TRANSLATE_PARAMS,
    ...DEFAULT_AUTO_SUBTITLE_PARAMS,
    ...DEFAULT_UPSCALE_PARAMS,
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
    ...DEFAULT_TRANSLATE_PARAMS,
    ...DEFAULT_AUTO_SUBTITLE_PARAMS,
    ...DEFAULT_UPSCALE_PARAMS,
    modelImage: null,
    modelImages: [],
    texture: true,
    pbr: true,
  },
  voice_translate: {
    model: STANDALONE_TOOLS.voice_translate.defaultModel,
    prompt: "",
    styleId: "none",
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
    ...DEFAULT_TRANSLATE_PARAMS,
    ...DEFAULT_AUTO_SUBTITLE_PARAMS,
    ...DEFAULT_UPSCALE_PARAMS,
    modelImage: null,
    modelImages: [],
    texture: true,
    pbr: true,
  },
  auto_subtitle: {
    model: STANDALONE_TOOLS.auto_subtitle.defaultModel,
    prompt: "",
    styleId: "none",
    aspectRatio: "16:9",
    imageResolution: "1K",
    quality: "medium",
    outputFormat: "mp4",
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
    ...DEFAULT_TRANSLATE_PARAMS,
    ...DEFAULT_AUTO_SUBTITLE_PARAMS,
    ...DEFAULT_UPSCALE_PARAMS,
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
    ...DEFAULT_TRANSLATE_PARAMS,
    ...DEFAULT_AUTO_SUBTITLE_PARAMS,
    ...DEFAULT_UPSCALE_PARAMS,
    modelImage: null,
    modelImages: [],
    texture: true,
    pbr: true,
    threeDMode: "image_to_3d",
    model3dSource: null,
    rigType: TRIPO_AUTO_RIG_TYPE,
    rigSpec: "tripo",
    rigOutFormat: "glb",
    animationPreset: "preset:walk",
    animationBatch: "",
    animationOutFormat: "glb",
    animationBake: true,
    animationWithGeometry: true,
    animationInPlace: false,
  },
  url_asset: {
    model: STANDALONE_TOOLS.url_asset.defaultModel,
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
    ...DEFAULT_TRANSLATE_PARAMS,
    ...DEFAULT_AUTO_SUBTITLE_PARAMS,
    ...DEFAULT_UPSCALE_PARAMS,
    modelImage: null,
    modelImages: [],
    texture: true,
    pbr: true,
    urlAssetSource: "",
    urlAssetFileName: "",
  },
};

type TranslationFn = ReturnType<typeof useLanguage>["t"];
type TranslationKey = Parameters<TranslationFn>[0];

const STANDALONE_TOOL_TITLE_KEYS = {
  image_gen: "workspace.standalone.tool.image_gen.title",
  image_upscale: "workspace.standalone.tool.image_upscale.title",
  video_gen: "workspace.standalone.tool.video_gen.title",
  voice_gen: "workspace.standalone.tool.voice_gen.title",
  voice_translate: "workspace.standalone.tool.voice_translate.title",
  auto_subtitle: "workspace.standalone.tool.auto_subtitle.title",
  image_to_3d: "workspace.standalone.tool.image_to_3d.title",
  url_asset: "workspace.standalone.tool.url_asset.title",
} as const satisfies Record<StandaloneToolKey, TranslationKey>;

const STANDALONE_TOOL_NAV_KEYS = {
  image_gen: "workspace.standalone.tool.image_gen.nav",
  image_upscale: "workspace.standalone.tool.image_upscale.nav",
  video_gen: "workspace.standalone.tool.video_gen.nav",
  voice_gen: "workspace.standalone.tool.voice_gen.nav",
  voice_translate: "workspace.standalone.tool.voice_translate.nav",
  auto_subtitle: "workspace.standalone.tool.auto_subtitle.nav",
  image_to_3d: "workspace.standalone.tool.image_to_3d.nav",
  url_asset: "workspace.standalone.tool.url_asset.nav",
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
  const key = STANDALONE_TOOL_TITLE_KEYS[tool];
  const translated = t(key);
  return translated === key ? STANDALONE_TOOLS[tool].title : translated;
}

function standaloneToolNav(tool: StandaloneToolKey, t: TranslationFn) {
  const key = STANDALONE_TOOL_NAV_KEYS[tool];
  const translated = t(key);
  return translated === key ? STANDALONE_TOOLS[tool].navLabel : translated;
}

function standaloneCreateActionTitle(
  tool: StandaloneToolKey,
  language: ReturnType<typeof useLanguage>["language"],
) {
  const labels: Record<StandaloneToolKey, { en: string; th: string }> = {
    image_gen: { en: "Create Image", th: "สร้างรูปภาพ" },
    image_upscale: { en: "Upscale Mediaforge", th: "เพิ่มความละเอียดภาพ" },
    video_gen: { en: "Create Video", th: "สร้างวิดีโอ" },
    voice_gen: { en: "Create Audio", th: "สร้างเสียง" },
    voice_translate: { en: "Translate Voice", th: "แปลเสียงวิดีโอ" },
    image_to_3d: { en: "Create 3D", th: "สร้าง 3D" },
    auto_subtitle: { en: "Auto Subtitle", th: "ซับอัตโนมัติ" },
    url_asset: { en: "URL to Asset", th: "URL แอสเซ็ต" },
  };
  const lang = language === "th" ? "th" : "en";
  return labels[tool][lang];
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
  if (tool === "voice_translate") {
    return language === "th" ? "เริ่มแปลเสียง" : "Translate Voice";
  }
  if (tool === "image_upscale") {
    return language === "th" ? "เพิ่มความละเอียด" : "Upscale";
  }
  if (tool === "url_asset") {
    return "Import";
  }
  return language === "th" ? "สร้าง" : "Generate";
}

function standaloneThreeDMode(form: StandaloneFormState): StandaloneThreeDMode {
  return form.threeDMode ?? "image_to_3d";
}

function standaloneNodeTypeForTool(
  tool: StandaloneToolKey,
  form: StandaloneFormState,
): string {
  if (tool !== "image_to_3d") return STANDALONE_TOOLS[tool].nodeType;
  switch (standaloneThreeDMode(form)) {
    case "auto_rig":
      return "tripoRigNode";
    case "animate":
      return "tripoAnimateNode";
    case "image_to_3d":
    default:
      return "imageTo3dNode";
  }
}

function standaloneCreateButtonLabelForForm(
  tool: StandaloneToolKey,
  form: StandaloneFormState,
  language: "en" | "th",
  estimatedCost?: number | null,
) {
  if (tool !== "image_to_3d") {
    return standaloneCreateButtonLabel(tool, language, estimatedCost);
  }
  if (
    estimatedCost != null &&
    Number.isFinite(estimatedCost) &&
    estimatedCost > 0
  ) {
    const action =
      standaloneThreeDMode(form) === "auto_rig"
        ? "Draft Rig"
        : standaloneThreeDMode(form) === "animate"
          ? "Animate"
          : "Generate";
    return `${action} ${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(Math.ceil(estimatedCost))}`;
  }
  switch (standaloneThreeDMode(form)) {
    case "auto_rig":
      return "Run Rig Assistant";
    case "animate":
      return "Animate 3D";
    case "image_to_3d":
    default:
      return "Create 3D";
  }
}

function workspaceCostMultiplierForTool(
  tool: StandaloneToolKey,
  model: string,
  workspaceMultiplier: number,
) {
  // Gemini TTS runs via the Gemini API directly inside workspace-run-node
  // (no separate edge function in between). It currently doesn't apply the
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

function isFailedStandaloneJob(job: StandaloneJobRow): boolean {
  return job.status === "failed" || job.status === "permanent_failed";
}

function standaloneJobTimeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isStandaloneJobVisibleInHistory(
  job: StandaloneJobRow,
  nowMs = Date.now(),
): boolean {
  if (!isFailedStandaloneJob(job)) return true;
  const failedAtMs =
    standaloneJobTimeMs(job.completed_at) ?? standaloneJobTimeMs(job.created_at);
  if (failedAtMs == null) return true;
  return nowMs - failedAtMs < FAILED_STANDALONE_HISTORY_TTL_MS;
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

function isGptImage2EnhanceModel(model: string) {
  return model === "gpt-image-2-enhance";
}

const UPSCALE_MEDIAFORGE_LABEL = "Upscale Mediaforge";

function isUpscaleStandaloneJob(job: Pick<StandaloneJobRow, "node_type">) {
  return job.node_type === "upscaleImageNode";
}

function standaloneJobModelLabel(
  job: Pick<StandaloneJobRow, "node_type" | "model">,
  params: Record<string, unknown> = {},
) {
  if (isUpscaleStandaloneJob(job)) return UPSCALE_MEDIAFORGE_LABEL;
  if (job.node_type === "voiceTranslateNode") return "Translate";
  return String(params.model_name ?? job.model ?? "model");
}

function nearestGptImageAspectRatio(
  ref: Pick<UploadedRef, "width" | "height"> | null | undefined,
  resolution: string,
): string {
  const supportsResolution = (id: string) =>
    gptImageResolutionsFor(id).includes(resolution) || resolution === "Auto";
  const fallback = supportsResolution("1:1")
    ? "1:1"
    : supportsResolution("16:9")
      ? "16:9"
      : "9:16";
  if (!ref?.width || !ref.height) return fallback;
  const ratio = ref.width / ref.height;
  const candidates = [
    { id: "1:1", ratio: 1 },
    { id: "16:9", ratio: 16 / 9 },
    { id: "9:16", ratio: 9 / 16 },
    { id: "3:2", ratio: 3 / 2 },
    { id: "2:3", ratio: 2 / 3 },
    { id: "5:4", ratio: 5 / 4 },
    { id: "4:5", ratio: 4 / 5 },
    { id: "3:4", ratio: 3 / 4 },
  ].filter((candidate) => supportsResolution(candidate.id));
  return candidates.reduce((best, candidate) => (
    Math.abs(candidate.ratio - ratio) < Math.abs(best.ratio - ratio)
      ? candidate
      : best
  )).id ?? fallback;
}

function gptImage2EnhanceSizeForForm(form: StandaloneFormState): string {
  const resolution = ["1K", "2K", "4K"].includes(form.imageResolution)
    ? form.imageResolution
    : "1K";
  return composeGptImageSize(nearestGptImageAspectRatio(form.upscaleImage, resolution), resolution);
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
  const { user, profile } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const openSignInModal = useSignInModal();
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
  const localVoiceDubMergeRequestedRef = useRef<Set<string>>(new Set());
  const [uploading, setUploading] = useState<UploadSlot | null>(null);
  const [uploadAccept, setUploadAccept] = useState("image/*");
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const [insufficientRequiredCredits, setInsufficientRequiredCredits] =
    useState<number | undefined>();
  const [insufficientReason, setInsufficientReason] =
    useState<"credits" | "feature_locked">("credits");
  const [insufficientFeature, setInsufficientFeature] =
    useState<WorkspacePaidFeature | null>(null);
  const [deleteReferenceTarget, setDeleteReferenceTarget] =
    useState<DeletableReference | null>(null);
  const [deletingReference, setDeletingReference] = useState(false);
  const [translateTask, setTranslateTask] = useState<VoiceTranslateTask | null>(null);
  const [autoSubtitleResults, setAutoSubtitleResults] = useState<AutoSubtitleResultItem[]>([]);
  const [autoSubtitleProgress, setAutoSubtitleProgress] =
    useState<AutoSubtitleProgress | null>(null);

  const activeDef = STANDALONE_TOOLS[activeTool];
  const form = forms[activeTool];
  const activeThreeDMode = standaloneThreeDMode(form);
  const activeStandaloneNodeType = standaloneNodeTypeForTool(activeTool, form);
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
  const autoSubtitleResultsQuery = useAutoSubtitleResultAssets(user?.id, activeProject?.id);
  const refetchJobs = jobsQuery.refetch;
  const refetchProjectReferences = projectReferencesQuery.refetch;
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
  const threeDModelSourceOptions = useMemo(() => {
    if (activeTool !== "image_to_3d") return [];
    return mergeReferenceOptions(
      [
        form.model3dSource,
        ...(jobsQuery.data ?? []).map(referenceFromGenerationJob),
        ...(projectReferencesQuery.data ?? []),
      ],
      80,
    ).filter((ref) => isStandaloneModel3dReference(ref));
  }, [activeTool, form.model3dSource, jobsQuery.data, projectReferencesQuery.data]);
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
    const nodeType = activeStandaloneNodeType;
    if (!nodeType) return 0;
    return activeJobs.filter((job) => {
      if (activeTool === "voice_translate") {
        return isVoiceTranslateStandaloneJob(job);
      }
      if (activeTool === "image_to_3d") {
        return THREE_D_STANDALONE_NODE_TYPES.has(job.node_type);
      }
      return job.node_type === nodeType;
    }).length;
  }, [activeJobs, activeStandaloneNodeType, activeTool]);

  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => {
      void refetchJobs();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs, refetchJobs]);

  useEffect(() => {
    setTranslateTask(null);
  }, [activeProject?.id]);

  useEffect(() => {
    if (!user?.id || !activeProject?.id) {
      setAutoSubtitleResults([]);
      return;
    }
    if (autoSubtitleResultsQuery.data) {
      setAutoSubtitleResults(autoSubtitleResultsQuery.data);
    }
  }, [activeProject?.id, autoSubtitleResultsQuery.data, user?.id]);

  useEffect(() => {
    if (activeTool !== "voice_translate") return;
    const jobs = jobsQuery.data ?? [];
    const translateJob = jobs.find(
      (job) =>
        isVoiceTranslateStandaloneJob(job) &&
        (job.status === "queued" || job.status === "running"),
    );
    if (!translateJob) {
      setTranslateTask((prev) =>
        prev?.status === "failed" || prev?.status === "completed" ? null : prev,
      );
      return;
    }
    if (
      (translateJob.node_type === "audioGenNode" || translateJob.node_type === "mergeAudioNode") &&
      isLocalVoiceDubJob(translateJob)
    ) {
      const localJob = translateJob;
      const result = localJob.result ?? {};
      const params = localJob.request?.params ?? {};
      const outputUrl = firstText(
        result.url,
        (result as StandaloneResult & { result_url?: unknown }).result_url,
        result.outputs?.output_video,
        result.outputs?.audio_url,
        result.outputs?.output_audio,
      );
      const status =
        localJob.status === "completed"
          ? "completed"
          : localJob.status === "failed" || localJob.status === "permanent_failed"
            ? "failed"
            : "running";
      const engine = localVoiceDubEngineFromJob(localJob) ?? "local_gemini_tts";
      const outputType =
        localJob.node_type === "mergeAudioNode" ||
        String(params.local_voice_translate_output_type ?? "") === "video"
          ? "video"
          : "audio";
      const localJobError = localJob.error || localJob.last_error || undefined;
      setTranslateTask({
        id: localJob.id,
        jobId: localJob.id,
        status,
        engine,
        stage: status === "completed" ? "completed" : "synthesizing",
        outputType,
        outputLanguage: firstText(params.output_language) ?? "",
        sourceName:
          firstText(params.local_voice_translate_source_name) ??
          voiceDubProviderForEngine(engine),
        outputUrl: outputUrl || undefined,
        providerOutputUrl: outputUrl || undefined,
        translatedScript: firstText(params.local_voice_translate_script, params.prompt) ?? "",
        error: localJobError
          ? friendlyError(localJobError, language === "th" ? "th" : "en")
          : undefined,
      });
      return;
    }
    const voiceJob = translateJob;
    const result = voiceJob.result ?? {};
    const providerMeta = result.provider_meta ?? {};
    const params = voiceJob.request?.params ?? {};
    const translateId =
      firstText(result.task_id, providerMeta.video_translate_id, providerMeta.dubbing_id) || voiceJob.id;
    const outputUrl = firstText(
      result.url,
      result.outputs?.video_url,
      result.outputs?.output_video,
      result.outputs?.audio_url,
      result.outputs?.output_audio,
    );
    const providerOutputUrl = firstText(
      result.outputs?.provider_video_url,
      result.outputs?.provider_audio_url,
      providerMeta.provider_video_url,
      providerMeta.provider_audio_url,
    );
    const status =
      voiceJob.status === "completed"
        ? "completed"
        : voiceJob.status === "failed" || voiceJob.status === "permanent_failed"
          ? "failed"
          : "running";
    const voiceJobError = voiceJob.error || voiceJob.last_error || undefined;
    setTranslateTask({
      id: translateId,
      jobId: voiceJob.id,
      status,
      engine: voiceJob.provider === "elevenlabs_ivc_tts" ? "elevenlabs_ivc_tts" : "elevenlabs_dubbing_clone",
      stage: status === "completed" ? "completed" : "submitted",
      outputType: String(result.type ?? "video") === "audio" ? "audio" : "video",
      outputLanguage: firstText(params.output_language, providerMeta.output_language) ?? "",
      sourceName: "Translate",
      sourceStorageBucket: firstText(
        params.source_storage_bucket,
        providerMeta.source_storage_bucket,
      ),
      sourceStoragePath: firstText(
        params.source_storage_path,
        providerMeta.source_storage_path,
      ),
      outputUrl: outputUrl || undefined,
      providerOutputUrl: providerOutputUrl || undefined,
      error: voiceJobError
        ? friendlyError(voiceJobError, language === "th" ? "th" : "en")
        : undefined,
    });
  }, [activeTool, jobsQuery.data, language]);

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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_assets",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["standalone-project-reference-assets", user.id, activeProject.id],
          });
          void queryClient.invalidateQueries({
            queryKey: ["standalone-auto-subtitle-results", user.id, activeProject.id],
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
          activeJobs.map((job) => {
            if (job.node_type === "voiceTranslateNode" && job.provider === "elevenlabs_dubbing") {
              return supabase.functions.invoke(ELEVENLABS_DUBBING_EDGE_FUNCTION, {
                body: { action: "status", job_id: job.id },
              });
            }
            if (job.node_type === "voiceTranslateNode" && job.provider === "elevenlabs_ivc_tts") {
              return Promise.resolve();
            }
            return supabase.functions.invoke(RUN_EDGE_FUNCTION, {
              body: { action: "poll_workspace_job", job_id: job.id },
            });
          }),
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

  useEffect(() => {
    if (
      !SHOW_LOCAL_VOICE_DUB_ENGINES ||
      activeTool !== "voice_translate" ||
      !user?.id ||
      !activeProject?.id
    ) {
      return;
    }
    const jobs = jobsQuery.data ?? [];
    const completedAudioJob = jobs.find(
      (job) =>
        job.node_type === "audioGenNode" &&
        job.status === "completed" &&
        isLocalVoiceDubJob(job),
    );
    if (!completedAudioJob) return;
    if (localVoiceDubMergeRequestedRef.current.has(completedAudioJob.id)) return;
    const completedAudioResult = completedAudioJob.result as
      | (StandaloneResult & { result_url?: string })
      | null;
    const audioUrl = firstText(
      completedAudioResult?.type === "audio" ? completedAudioResult.url : undefined,
      completedAudioResult?.outputs?.audio_url,
      completedAudioResult?.outputs?.output_audio,
      completedAudioResult?.result_url,
      completedAudioResult?.url,
    );
    const params = completedAudioJob.request?.params ?? {};
    const videoUrl = firstText(params.local_voice_translate_source_video_url);
    if (String(params.local_voice_translate_output_type ?? "") !== "video") return;
    if (!audioUrl || !videoUrl) return;
    const existingMerge = jobs.find((job) => {
      const mergeParams = job.request?.params ?? {};
      return (
        job.node_type === "mergeAudioNode" &&
        String(mergeParams.local_voice_translate_parent_audio_job_id ?? "") === completedAudioJob.id
      );
    });
    if (existingMerge) return;

    localVoiceDubMergeRequestedRef.current.add(completedAudioJob.id);
    const enqueueMerge = async () => {
      try {
        const engine = localVoiceDubEngineFromJob(completedAudioJob) ?? "local_gemini_tts";
        const { data, error } = await supabase.functions.invoke(RUN_EDGE_FUNCTION, {
          body: {
            action: "enqueue_workspace_job",
            node_type: "mergeAudioNode",
            params: {
              model_name: "shotstack",
              video_url: videoUrl,
              audio_url: audioUrl,
              audio_mode: "replace",
              audio_volume: 1,
              local_voice_translate: true,
              local_voice_translate_engine: engine,
              local_voice_translate_parent_audio_job_id: completedAudioJob.id,
              local_voice_translate_source_video_url: videoUrl,
              local_voice_translate_output_type: "video",
              local_voice_translate_source_name: firstText(
                params.local_voice_translate_source_name,
              ),
              local_voice_translate_script: firstText(
                params.local_voice_translate_script,
              ),
              output_language: firstText(params.output_language),
            },
            inputs: { video_url: videoUrl, audio_url: audioUrl },
            project_id: activeProject.id,
            workspace_id: null,
            canvas_id: standaloneCanvasId(activeProject.id),
            node_id: `standalone-${activeProject.id}-voice-dub-merge-${Date.now()}`,
          },
        });
        const resp = data as { job_id?: string; error?: string } | null;
        if (error || resp?.error || !resp?.job_id) {
          const serverMessage = error ? await functionErrorMessage(error) : undefined;
          throw new Error(resp?.error ?? serverMessage ?? "Could not queue local dub merge.");
        }
        void refetchJobs();
      } catch (err) {
        toast.error(friendlyError(err, language === "th" ? "th" : "en"));
      }
    };
    void enqueueMerge();
  }, [activeProject?.id, activeTool, jobsQuery.data, language, refetchJobs, user?.id]);

  useEffect(() => {
    if (!translateTask?.id) return;
    if (translateTask.status === "completed" || translateTask.status === "failed") return;
    let cancelled = false;
    let timer: number | undefined;

    const pollTranslateTask = async () => {
      if (cancelled || !translateTask?.id) return;
      if (isLocalVoiceDubEngine(translateTask.engine ?? "elevenlabs_dubbing_clone")) return;
      try {
        const { data, error } = await supabase.functions.invoke(
          ELEVENLABS_DUBBING_EDGE_FUNCTION,
          {
            body: {
              action: "status",
              job_id: translateTask.jobId,
              dubbing_id: translateTask.id,
              output_language: translateTask.outputLanguage,
            },
          },
        );
        if (error) throw new Error(await functionErrorMessage(error));
        const result = data as {
          status?: VoiceTranslateTask["status"];
          output_url?: string;
          provider_output_url?: string;
          output_type?: "audio" | "video";
          error?: string;
        } | null;
        const nextStatus = result?.status ?? "processing";
        const displayError = result?.error
          ? friendlyError(result.error, language === "th" ? "th" : "en")
          : undefined;
        setTranslateTask((prev) =>
          prev?.id === translateTask.id
            ? {
                ...prev,
                status: nextStatus,
                outputUrl: result?.output_url || prev.outputUrl,
                providerOutputUrl:
                  result?.provider_output_url || prev.providerOutputUrl,
                outputType: result?.output_type ?? prev.outputType,
                error: displayError || prev.error,
              }
            : prev,
        );
        if (nextStatus === "completed") {
          toast.success(
            language === "th"
              ? "แปลเสียงเสร็จแล้ว"
              : "Translation is ready.",
          );
          void refetchProjectReferences();
          return;
        }
        if (nextStatus === "failed") {
          toast.error(displayError || "Translation failed.");
          return;
        }
      } catch (err) {
        console.info(
          "[voice-translate] status poll skipped",
          err instanceof Error ? err.message : String(err),
        );
      }
      if (!cancelled) {
        timer = window.setTimeout(() => void pollTranslateTask(), 6000);
      }
    };

    timer = window.setTimeout(() => void pollTranslateTask(), 2500);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [
    activeProject?.id,
    language,
    refetchProjectReferences,
    translateTask?.id,
    translateTask?.engine,
    translateTask?.jobId,
    translateTask?.outputLanguage,
    translateTask?.sourceStorageBucket,
    translateTask?.sourceStoragePath,
    translateTask?.status,
  ]);

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
      if (activeTool === "image_upscale") {
        next.model = "gpt-image-2-enhance";
        if (next.upscaleImage && isUpscaleVideoReference(next.upscaleImage)) {
          next.upscaleImage = null;
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
    if (activeTool === "image_upscale") {
      nextPatch.imageResolution = ["1K", "2K", "4K"].includes(form.imageResolution)
        ? form.imageResolution
        : "1K";
      nextPatch.quality = ["low", "medium", "high"].includes(form.quality)
        ? form.quality
        : "medium";
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
    if (activeTool === "image_to_3d" && activeThreeDMode === "image_to_3d") {
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
    const runCount =
      activeTool === "image_gen"
        ? Math.min(4, Math.max(1, Number(form.imageCount) || 1))
        : activeTool === "video_gen"
          ? Math.min(4, Math.max(1, Number(form.videoCount) || 1))
        : 1;

    const quoteForNode = (
      schemaKey: string,
      quoteParams: Record<string, unknown>,
      quantity: number,
    ): CreatePanelCostQuote | null => {
      const quote = calculateNodeCostQuote({
        schemaKey,
        params: quoteParams,
        creditCosts,
      });
      if (!quote) return null;
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
        String(quoteParams.model_name ?? form.model),
        workspaceCreditMultiplier,
      );
      const fullRunCost = Math.max(1, Math.ceil(quote.baseCost * multiplier));
      const modelRunCost = applyNodeCostDiscount(fullRunCost, quote.discountPercent);
      const finalRunCost = applyPackageCostDiscount(modelRunCost, packageDiscountPercent);
      const fullCost = fullRunCost * quantity;
      const modelCost = modelRunCost * quantity;
      const finalCost = finalRunCost * quantity;
      return {
        fullCost,
        modelCost,
        finalCost,
        modelDiscountPercent: quote.discountPercent,
        packageDiscountPercent,
        packageDiscountLabel,
        totalDiscountPercent: effectiveNodeDiscountPercent(fullCost, finalCost),
      };
    };

    const mainQuote = quoteForNode(activeStandaloneNodeType, params, runCount);
    if (!mainQuote) return null;
    if (activeTool !== "image_to_3d" || standaloneThreeDMode(form) !== "auto_rig") {
      return mainQuote;
    }
    const importQuote =
      form.model3dSource && !tripoModelTaskIdFromReference(form.model3dSource)
        ? quoteForNode(
            "tripoImportModelNode",
            { model_name: "tripo3d-import" },
            1,
          )
        : null;
    const preflightQuote = quoteForNode(
      "tripoPreRigCheckNode",
      { model_name: "tripo3d-prerigcheck" },
      1,
    );
    if (!preflightQuote) return mainQuote;
    const fullCost = mainQuote.fullCost + preflightQuote.fullCost + (importQuote?.fullCost ?? 0);
    const modelCost = mainQuote.modelCost + preflightQuote.modelCost + (importQuote?.modelCost ?? 0);
    const finalCost = mainQuote.finalCost + preflightQuote.finalCost + (importQuote?.finalCost ?? 0);
    return {
      fullCost,
      modelCost,
      finalCost,
      modelDiscountPercent: effectiveNodeDiscountPercent(fullCost, modelCost),
      packageDiscountPercent,
      packageDiscountLabel,
      totalDiscountPercent: effectiveNodeDiscountPercent(fullCost, finalCost),
    };
  }, [
    activeStandaloneNodeType,
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
    if (!user?.id) {
      openSignInModal();
      return;
    }
    if (!activeProject?.id) {
      toast.error(t("workspace.toast.create_project_first_upload"));
      return;
    }
    pendingSlotRef.current = slot;
    const accept = uploadAcceptForSlot(slot, form.model);
    setUploadAccept(accept);
    if (fileInputRef.current) fileInputRef.current.accept = accept;
    fileInputRef.current?.click();
  };

  const rememberUploadedReference = (reference: UploadedRef) => {
    if (!user?.id || !activeProject?.id) return;
    queryClient.setQueryData<UploadedRef[]>(
      ["standalone-project-reference-assets", user.id, activeProject.id],
      (items) => mergeReferenceOptions([reference, ...(items ?? [])], 120),
    );
  };

  const panelBottom =
    activeTool === "video_gen"
      ? "video"
      : activeTool === "image_upscale"
        ? "upscale"
      : activeTool === "voice_translate"
        ? "translate"
      : activeTool === "auto_subtitle"
        ? "subtitle"
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

  const panelReferences = useMemo<UploadedRef[]>(() => {
    const compact = (items: Array<UploadedRef | null | undefined>) =>
      items.filter((item): item is UploadedRef => Boolean(item));
    if (activeTool === "image_gen") return form.imageRefs;
    if (activeTool === "image_upscale") return compact([form.upscaleImage]);
    if (activeTool === "video_gen") {
      return videoPanelMode === "reference"
        ? compact([form.videoRefImage, form.videoRefVideo])
        : compact([form.videoStart, videoSupportsEnd ? form.videoEnd : null]);
    }
    if (activeTool === "image_to_3d") {
      return activeThreeDMode === "image_to_3d"
        ? threeDReferencesForForm(form)
        : compact([form.model3dSource ?? null]);
    }
    if (activeTool === "voice_translate") return compact([form.translateVideo]);
    if (activeTool === "auto_subtitle") return compact([form.autoSubtitleVideo]);
    return [];
  }, [
    activeTool,
    activeThreeDMode,
    form,
    videoPanelMode,
    videoSupportsEnd,
  ]);

  const panelMaxReferences =
    activeTool === "image_gen"
      ? maxImageRefsForModel(form.model)
      : activeTool === "image_upscale"
        ? 1
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
          ? activeThreeDMode === "image_to_3d"
            ? max3dRefsForModel(form.model)
            : 1
        : activeTool === "voice_translate"
            ? 1
        : activeTool === "auto_subtitle"
            ? 1
          : 0;

  const getPanelReferenceSlot = (): UploadSlot | null => {
    if (activeTool === "image_gen") {
      return "image-ref";
    }
    if (activeTool === "image_to_3d") {
      return activeThreeDMode === "image_to_3d" ? "model-image" : "model-3d";
    }
    if (activeTool === "image_upscale") {
      return "upscale-image";
    }
    if (activeTool === "voice_translate") {
      return "translate-video";
    }
    if (activeTool === "auto_subtitle") {
      return "auto-subtitle-video";
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

  const getPanelReferenceSlotForMedia = (
    media?: Pick<UploadedRef, "mime" | "name" | "url"> | File | null,
  ): UploadSlot | null => {
    if (
      activeTool !== "video_gen" ||
      videoPanelMode !== "reference" ||
      !media
    ) {
      return getPanelReferenceSlot();
    }
    const mime =
      typeof File !== "undefined" && media instanceof File
        ? inferReferenceMime(media.name, media.type)
        : inferReferenceMime(
            firstText("url" in media ? media.url : "", "name" in media ? media.name : ""),
            "mime" in media ? media.mime : undefined,
          );
    if (mime.startsWith("video/")) {
      return videoSupportsReferenceVideo(form.model) ? "video-ref-video" : null;
    }
    if (mime.startsWith("audio/")) {
      return null;
    }
    if (mime.startsWith("image/")) {
      return videoSupportsReferenceImage(form.model) ? "video-ref-image" : null;
    }
    return getPanelReferenceSlot();
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
      } else if (slot === "translate-video") {
        patch.translateVideo = uploaded;
      } else if (slot === "auto-subtitle-video") {
        patch.autoSubtitleVideo = uploaded;
      } else if (slot === "upscale-image") {
        patch.upscaleImage = uploaded;
      } else if (slot === "model-3d") {
        patch.model3dSource = {
          ...uploaded,
          modelUrl: uploaded.modelUrl ?? uploaded.url,
          mime: uploaded.mime || inferModelMime(uploaded.url),
        };
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
    if (!user?.id) {
      openSignInModal();
      return;
    }
    if (!activeProject?.id) {
      toast.error(t("workspace.toast.create_project_first_upload"));
      return;
    }
    const slot = slotOverride ?? getPanelReferenceSlotForMedia(files[0]);
    if (!slot) return;
    const candidates =
      slot === "model-3d"
        ? files.slice(0, 1)
      : activeTool === "image_gen" || activeTool === "image_to_3d"
        ? files.slice(0, Math.max(0, panelMaxReferences - panelReferences.length))
        : files.slice(0, 1);
    if (candidates.length === 0) return;

    setUploading(slot);
    try {
      for (const file of candidates) {
        const needsVideo = slot === "video-ref-video";
        const needsTranslateMedia = slot === "translate-video";
        const needsAutoSubtitleMedia = slot === "auto-subtitle-video";
        const needsUpscaleMedia = slot === "upscale-image";
        const needsModel3d = slot === "model-3d";
        const isValidType = needsTranslateMedia
          ? isTranslateMediaFile(file)
          : needsAutoSubtitleMedia
            ? isAutoSubtitleMediaFile(file)
          : needsUpscaleMedia
            ? file.type.startsWith("image/")
          : needsModel3d
            ? isModel3dUploadFile(file)
          : needsVideo
            ? file.type.startsWith("video/")
            : file.type.startsWith("image/");
        if (!isValidType) {
          toast.error(
            needsTranslateMedia
              ? language === "th"
                ? "เลือกไฟล์ MP4 หรือ MP3 สำหรับ Translate"
                : "Choose an MP4 or MP3 file for Translate."
              : needsAutoSubtitleMedia
                ? "Choose an MP4 video for Auto Subtitle."
              : needsUpscaleMedia
                ? language === "th"
                  ? "เลือกไฟล์ภาพสำหรับ Upscale Mediaforge"
                  : "Choose an image for Upscale Mediaforge."
              : needsModel3d
                ? "Choose a GLB, OBJ, FBX, or STL model file."
              : needsVideo
                ? t("workspace.toast.upload_video_ref")
                : t("workspace.toast.upload_image_ref"),
          );
          continue;
        }
        if (needsModel3d && file.size > MODEL_3D_IMPORT_MAX_BYTES) {
          toast.error("Tripo OpenAPI model import supports GLB, OBJ, FBX, or STL files up to 20MB.");
          continue;
        }
        if (isTranslateVideoOverUploadLimit(slot, file)) {
          toast.error(translateVideoUploadSizeMessage(language));
          continue;
        }
        if (needsAutoSubtitleMedia && file.size > AUTO_SUBTITLE_UPLOAD_MAX_BYTES) {
          toast.error(autoSubtitleUploadSizeMessage());
          continue;
        }
        let durationSec: number | null = null;
        if (
          needsVideo &&
          activeTool === "video_gen" &&
          isSeedance20VideoModel(form.model)
        ) {
          const metadata = await readVideoFileMetadata(file);
          const metadataError = validateSeedanceReferenceVideoMetadata(metadata);
          if (metadataError) {
            toast.error(metadataError);
            continue;
          }
          durationSec = metadata?.durationSec ?? null;
        } else if (needsAutoSubtitleMedia) {
          durationSec = await readVideoFileDuration(file);
          if (durationSec == null) {
            toast.error("Could not read the video duration for Auto Subtitle.");
            continue;
          }
          if (!isAutoSubtitleDurationValid(durationSec)) {
            toast.error(autoSubtitleDurationMessage(durationSec));
            continue;
          }
        }
        const uploaded = await uploadReference(file, user?.id, activeProject.id);
        const uploadedReference = {
          ...uploaded,
          durationSec: durationSec ?? uploaded.durationSec,
        };
        rememberUploadedReference(uploadedReference);
        applyUploadedReference(slot, uploadedReference);
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
    const slot = slotOverride ?? getPanelReferenceSlotForMedia(reference);
    if (!slot) return;
    const referenceMime = inferReferenceMime(
      firstText(reference.url, reference.name),
      reference.mime,
    );
    const expectsVideo = slot === "video-ref-video";
    const expectsTranslateMedia = slot === "translate-video";
    const expectsAutoSubtitleMedia = slot === "auto-subtitle-video";
    const expectsUpscaleMedia = slot === "upscale-image";
    const expectsModel3d = slot === "model-3d";
    if (expectsAutoSubtitleMedia && !referenceMime.startsWith("video/")) {
      toast.error("Choose an MP4 video for Auto Subtitle.");
      return;
    }
    if (expectsTranslateMedia && !referenceMime.startsWith("video/") && !referenceMime.startsWith("audio/")) {
      toast.error(
        language === "th"
          ? "เลือกไฟล์ MP4 หรือ MP3 สำหรับ Translate"
          : "Choose an MP4 or MP3 file for Translate.",
      );
      return;
    }
    if (
      expectsUpscaleMedia &&
      !referenceMime.startsWith("image/")
    ) {
      toast.error(
        language === "th"
          ? "เลือกไฟล์ภาพสำหรับ Upscale Mediaforge"
          : "Choose an image for Upscale Mediaforge.",
      );
      return;
    }
    if (expectsVideo && !referenceMime.startsWith("video/")) {
      toast.error(t("workspace.toast.upload_video_ref"));
      return;
    }
    if (expectsModel3d && !isStandaloneModel3dReference(reference)) {
      toast.error("Choose a GLB, OBJ, FBX, or STL model file.");
      return;
    }
    if (
      !expectsVideo &&
      !expectsTranslateMedia &&
      !expectsAutoSubtitleMedia &&
      !expectsUpscaleMedia &&
      !expectsModel3d &&
      (referenceMime.startsWith("video/") || referenceMime.startsWith("audio/"))
    ) {
      toast.error(t("workspace.toast.upload_image_ref"));
      return;
    }
    let durationSec = reference.durationSec;
    if (
      slot === "video-ref-video" &&
      activeTool === "video_gen" &&
      isSeedance20VideoModel(form.model)
    ) {
      const metadata = await readSeedanceReferenceVideoUrlMetadata(reference.url);
      const metadataError = validateSeedanceReferenceVideoMetadata(metadata);
      if (metadataError) {
        toast.error(metadataError);
        return;
      }
      durationSec = metadata?.durationSec ?? undefined;
    }
    if (expectsAutoSubtitleMedia) {
      durationSec = durationSec ?? (await readVideoUrlDuration(reference.url)) ?? undefined;
      if (durationSec == null) {
        toast.error("Could not read the video duration for Auto Subtitle.");
        return;
      }
      if (!isAutoSubtitleDurationValid(durationSec)) {
        toast.error(autoSubtitleDurationMessage(durationSec));
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
      modelUrl: reference.modelUrl,
      previewUrl: reference.previewUrl,
      taskId: reference.taskId,
      tripoModelTaskId: reference.tripoModelTaskId,
      originalModelTaskId: reference.originalModelTaskId,
      providerTaskId: reference.providerTaskId,
      providerMeta: reference.providerMeta,
      nodeType: reference.nodeType,
    });
  };

  const uploadFrameHistoryFiles = async (
    slot: "video-start" | "video-end",
    files: File[],
  ) => {
    if (!user?.id) {
      openSignInModal();
      return;
    }
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
      rememberUploadedReference(uploaded);
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
    if (referenceMime.startsWith("video/") || referenceMime.startsWith("audio/")) {
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
        if (standaloneThreeDMode(current) === "image_to_3d") {
          const nextRefs = threeDReferencesForForm(current).filter((ref) => ref.id !== id);
          patch.modelImages = nextRefs;
          patch.modelImage = nextRefs[0] ?? null;
        } else if (current.model3dSource?.id === id) {
          patch.model3dSource = null;
        }
      } else if (activeTool === "voice_translate" && current.translateVideo?.id === id) {
        patch.translateVideo = null;
      } else if (activeTool === "auto_subtitle" && current.autoSubtitleVideo?.id === id) {
        patch.autoSubtitleVideo = null;
      } else if (activeTool === "image_upscale" && current.upscaleImage?.id === id) {
        patch.upscaleImage = null;
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
        : activeTool === "image_upscale"
          ? t("workspace.standalone.source_media")
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
          : activeTool === "image_upscale"
            ? t("workspace.standalone.validation.upscale_image")
          : t("workspace.standalone.describe_image");

  const panelReferenceTitle =
    activeTool === "image_upscale"
      ? t("workspace.standalone.source_file")
      : activeTool === "image_to_3d"
      ? activeThreeDMode === "image_to_3d"
        ? t("workspace.standalone.reference_image")
        : t("workspace.standalone.source_3d_model")
      : activeTool === "video_gen"
        ? t("workspace.standalone.reference_image")
        : t("workspace.standalone.references");

  const panelReferenceAssets = useMemo(() => {
    const usesDedicatedMotionSlots =
      activeTool === "video_gen" &&
      videoPanelMode === "reference" &&
      isKlingMotionVideoModel(form.model);
    const wantsVideoAssets =
      activeTool === "voice_translate" ||
      (activeTool === "video_gen" &&
        videoPanelMode === "reference" &&
        videoSupportsReferenceVideo(form.model));
    const wantsModelAssets =
      activeTool === "image_to_3d" && activeThreeDMode !== "image_to_3d";
    return mergeReferenceOptions([
      ...(wantsModelAssets ? [form.model3dSource] : []),
      ...(jobsQuery.data ?? []).map(referenceFromGenerationJob),
      ...(projectReferencesQuery.data ?? []),
    ])
      .filter((ref) => {
        const refMime = inferReferenceMime(firstText(ref.url, ref.name), ref.mime);
        if (usesDedicatedMotionSlots) {
          return refMime.startsWith("image/") || refMime.startsWith("video/");
        }
        if (activeTool === "image_upscale") {
          return refMime.startsWith("image/");
        }
        if (wantsModelAssets) {
          return isStandaloneModel3dReference(ref);
        }
        if (activeTool === "video_gen" && videoPanelMode === "reference") {
          if (
            videoSupportsReferenceImage(form.model) &&
            videoSupportsReferenceVideo(form.model)
          ) {
            return refMime.startsWith("image/") || refMime.startsWith("video/");
          }
          return wantsVideoAssets
            ? refMime.startsWith("video/")
            : refMime.startsWith("image/");
        }
        return wantsVideoAssets
          ? refMime.startsWith("video/") || refMime.startsWith("audio/")
          : refMime.startsWith("image/");
      })
      .slice(0, 120);
  }, [
    activeTool,
    form.model,
    jobsQuery.data,
    projectReferencesQuery.data,
    activeThreeDMode,
    form.model3dSource,
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
      const autoPromptAttachments =
        await buildStandaloneAutoPromptAttachments(referenceOptions);
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
            messages: [
              {
                role: "user",
                content: userMessage,
                attachments: autoPromptAttachments,
              },
            ],
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

  const translateLocalVoiceDubScript = async (
    sourceScript: string,
    outputLanguage: string,
  ) => {
    const { data: result, error } = await supabase.functions.invoke(
      AUTO_PROMPT_EDGE_FUNCTION,
      {
        body: {
          model: AUTO_PROMPT_MODEL,
          system_prompt:
            "You translate video dubbing scripts. Return only the translated spoken script. Do not add explanations, markdown, timestamps, labels, or quotation marks.",
          messages: [
            {
              role: "user",
              content: [
                `Target language: ${outputLanguage}`,
                "",
                "Source script:",
                sourceScript,
              ].join("\n"),
            },
          ],
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
    const translated = cleanStandaloneAutoPromptResponse(content);
    if (!translated) {
      throw new Error(
        language === "th"
          ? "AI ยังไม่ได้ส่งบทแปลกลับมา"
          : "AI did not return a translated script.",
      );
    }
    return translated;
  };

  const startLocalVoiceDub = async () => {
    const video = form.translateVideo;
    if (!video?.url) {
      toast.error(
        language === "th"
          ? "อัปโหลดวิดีโอ MP4 ก่อนเริ่มทดสอบ AI dub"
          : "Upload an MP4 video before testing AI dub.",
      );
      return;
    }
    if (!user?.id) {
      openSignInModal();
      return;
    }
    if (!activeProject?.id) {
      toast.error(t("workspace.toast.create_project_first_gen"));
      return;
    }
    const sourceScript = form.script.trim();
    if (!sourceScript) {
      toast.error(
        language === "th"
          ? "ใส่ transcript/script ก่อนทดสอบ AI dub"
          : "Add a transcript/script before testing AI dub.",
      );
      return;
    }
    const outputLanguage = form.translateOutputLanguage.trim();
    const engine = form.translateEngine;
    const translatedScript = await translateLocalVoiceDubScript(
      sourceScript,
      outputLanguage,
    );
    const modelName = voiceDubModelForEngine(engine);
    const params: Record<string, unknown> = {
      model_name: modelName,
      prompt: translatedScript,
      text: translatedScript,
      style_prompt: "",
      local_voice_translate: true,
      local_voice_translate_engine: engine,
      local_voice_translate_source_video_url: video.url,
      local_voice_translate_source_name: video.name,
      local_voice_translate_script: translatedScript,
      local_voice_translate_original_script: sourceScript,
      output_language: outputLanguage,
    };
    if (engine === "local_gemini_tts") {
      params.voice = DEFAULT_GEMINI_TTS_VOICE;
    }
    const { data, error } = await supabase.functions.invoke(RUN_EDGE_FUNCTION, {
      body: {
        action: "enqueue_workspace_job",
        node_type: "audioGenNode",
        params,
        inputs: { prompt: translatedScript },
        project_id: activeProject.id,
        workspace_id: null,
        canvas_id: standaloneCanvasId(activeProject.id),
        node_id: `standalone-${activeProject.id}-voice-dub-audio-${Date.now()}`,
      },
    });
    const resp = data as { job_id?: string; error?: string } | null;
    if (error || resp?.error || !resp?.job_id) {
      const serverMessage = error ? await functionErrorMessage(error) : undefined;
      throw new Error(resp?.error ?? serverMessage ?? "Could not queue local AI dub.");
    }
    setTranslateTask({
      id: resp.job_id,
      jobId: resp.job_id,
      status: "queued",
      outputLanguage,
      sourceName: video.name,
      engine,
      stage: "synthesizing",
      outputType: "audio",
      translatedScript,
    });
    void refetchJobs();
    toast.success(
      language === "th"
        ? `ส่งเข้า local AI dub แล้ว (${voiceDubProviderForEngine(engine)})`
        : `Local AI dub queued (${voiceDubProviderForEngine(engine)}).`,
    );
  };

  const startElevenLabsDubbing = async () => {
    const video = form.translateVideo;
    if (!video?.url) {
      toast.error(
        language === "th"
          ? "อัปโหลด MP4 หรือ MP3 ก่อนเริ่มแปลเสียง"
          : "Upload an MP4 or MP3 before translating.",
      );
      return;
    }
    if (!user?.id) {
      openSignInModal();
      return;
    }
    if (!activeProject?.id) {
      toast.error(t("workspace.toast.create_project_first_gen"));
      return;
    }
    const outputLanguage = form.translateOutputLanguage.trim();
    const sourceLanguage = form.translateSourceLanguage.trim();
    if (!isElevenLabsDubbingLanguage(outputLanguage)) {
      toast.error(unsupportedElevenLabsDubbingLanguageMessage(outputLanguage, language));
      return;
    }
    const outputType = translateOutputTypeForMedia(video);
    const toastId = toast.loading(
      language === "th"
        ? "กำลังส่งไฟล์เข้า ElevenLabs voice clone dubbing..."
        : "Submitting to ElevenLabs voice-clone dubbing...",
    );
    const providerMedia = video;
    const { data, error } = await supabase.functions.invoke(
      ELEVENLABS_DUBBING_EDGE_FUNCTION,
      {
        body: {
          action: "start",
          video_url: providerMedia.url,
          output_language: outputLanguage,
          output_type: outputType,
          source_language:
            sourceLanguage && sourceLanguage.toLowerCase() !== "auto"
              && isElevenLabsDubbingLanguage(sourceLanguage)
              ? sourceLanguage
              : undefined,
          speaker_num: form.translateSpeakerNum,
          project_id: activeProject.id,
          source_storage_bucket: providerMedia.storageBucket,
          source_storage_path: providerMedia.storagePath,
          source_content_type: translateSourceContentTypeForMedia(providerMedia),
          source_media_type: outputType,
          source_name: providerMedia.name,
          consent: form.translateConsent,
        },
      },
    );
    if (error) {
      toast.dismiss(toastId);
      throw new Error(await functionErrorMessage(error));
    }
    const result = data as {
      job_id?: string;
      dubbing_id?: string;
      status?: VoiceTranslateTask["status"];
      output_type?: "audio" | "video";
      error?: string;
    } | null;
    if (result?.error) {
      toast.dismiss(toastId);
      throw new Error(result.error);
    }
    if (!result?.dubbing_id) {
      toast.dismiss(toastId);
      throw new Error("ElevenLabs did not return a dubbing_id.");
    }
    const startedOutputType =
      result?.output_type === "video" || result?.output_type === "audio"
        ? result.output_type
        : outputType;
    setTranslateTask({
      id: result.dubbing_id,
      jobId: result.job_id,
      status: result.status ?? "submitted",
      outputLanguage,
      sourceName: video.name,
      engine: "elevenlabs_dubbing_clone",
      stage: "submitted",
      outputType: startedOutputType,
      sourceStorageBucket: providerMedia.storageBucket,
      sourceStoragePath: providerMedia.storagePath,
    });
    void refetchJobs();
    toast.success(
      `${startedOutputType === "video" ? "MP4" : "MP3"} dubbing queued. The result will appear on the right.`,
      { id: toastId },
    );
  };

  const startVoiceTranslate = async () => {
    await startElevenLabsDubbing();
  };

  const startAutoSubtitle = async () => {
    let source = form.autoSubtitleVideo;
    if (!source) {
      throw new Error("Upload an MP4 video before generating subtitles.");
    }
    if (!user?.id) {
      openSignInModal();
      return;
    }
    if (!activeProject?.id) {
      throw new Error("Create or select a project before generating subtitles.");
    }
    const settings = autoSubtitleStyleFromForm(form);
    const toastId = toast.loading("Generating subtitles...");
    setAutoSubtitleProgress({ progress: 8, message: "Preparing source video..." });
    try {
      const sourceDuration = source.durationSec ?? (await readVideoUrlDuration(source.url));
      if (sourceDuration == null) {
        throw new Error("Could not read the video duration for Auto Subtitle.");
      }
      if (!isAutoSubtitleDurationValid(sourceDuration)) {
        throw new Error(autoSubtitleDurationMessage(sourceDuration));
      }
      if (source.durationSec !== sourceDuration) {
        source = { ...source, durationSec: sourceDuration };
        updateForm({ autoSubtitleVideo: source });
      }

      setAutoSubtitleProgress({ progress: 12, message: "Compressing audio for transcription..." });
      let audio: Blob;
      try {
        audio = await extractCompressedAudioBlobFromVideo(source.url, {
          bitrate: autoSubtitleAudioBitrate(source.durationSec),
          sampleRate: 16000,
          channels: 1,
        });
      } catch (compressionErr) {
        console.warn("[AutoSubtitle] compressed audio extraction failed:", compressionErr);
        if ((source.durationSec ?? 0) > 120) {
          throw new Error(
            "Could not compress audio for a long Auto Subtitle video. Try a shorter clip or re-upload as MP4.",
          );
        }
        audio = await extractAudioBlobFromVideo(source.url);
      }
      if (audio.size > AUTO_SUBTITLE_AUDIO_MAX_BYTES) {
        const mb = (audio.size / (1024 * 1024)).toFixed(1);
        throw new Error(
          `Compressed audio is ${mb} MB. Trim the video or use a shorter clip for Auto Subtitle.`,
        );
      }

      setAutoSubtitleProgress({ progress: 22, message: "Transcribing speech..." });
      const whisperResponse = await transcribeAudio(audio, {
        language: form.autoSubtitleLanguage,
        granularity: "word",
        segmentationMode: form.autoSubtitleSegmentationMode,
      });
      const algorithm = autoSubtitleAlgorithmFromForm(form, settings);
      const rawCues = buildAutoSuptitleCuesFromResponse(
        whisperResponse,
        0,
        settings,
        algorithm,
        form.autoSubtitleLanguage,
      );
      if (rawCues.length === 0) {
        throw new Error("No speech was detected in this video.");
      }

      const provisionalCues =
        normalizeAutoSuptitleCuesForDuration(rawCues, source.durationSec);

      const rendered: RenderAutoSubtitleVideoResult = await renderAutoSubtitleVideo({
        sourceUrl: source.url,
        cues: provisionalCues.length > 0 ? provisionalCues : rawCues,
        settings,
        onProgress: (progress, message) => setAutoSubtitleProgress({ progress, message }),
      });
      const cues = normalizeAutoSuptitleCuesForDuration(rawCues, rendered.duration);
      if (cues.length === 0) {
        throw new Error("Subtitle timing did not overlap the source video.");
      }
      const result: AutoSuptitleResult = {
        whisperResponse,
        cues,
        algorithm,
        meta: {
          groupId: `${AUTO_SUPTITLE_GROUP_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          generatedAt: Date.now(),
          language: whisperResponse.language ?? form.autoSubtitleLanguage ?? "auto",
          sourceClipId: source.id,
          animation: settings.animation,
          accentColor: captionAccentColor(settings),
          highlightColor: captionAccentColor(settings),
        },
      };
      const outputName = autoSubtitleOutputName(source.name, rendered.extension);
      const outputMime = storageSafeAutoSubtitleMime(rendered.mime, rendered.extension);
      const handoff = {
        version: 1,
        feature: "auto-suptitle",
        source: {
          url: source.url,
          fileName: source.name,
          mime: source.mime || "video/mp4",
          duration: rendered.duration,
        },
        track: {
          name: AUTO_SUPTITLE_TRACK_NAME,
          cues: result.cues,
          meta: result.meta,
        },
        style: settings,
        transcriptText: whisperResponse.text ?? cues.map((cue) => cue.text).join(" "),
        createdAt: Date.now(),
      } as const;
      const handoffId = saveAutoSubtitleHandoff(handoff);
      setAutoSubtitleProgress({ progress: 97, message: "Creating editable project..." });
      let editorProjectId: string | undefined;
      let editorProjectError: string | undefined;
      try {
        editorProjectId = await createAutoSubtitleEditorProject(handoff);
      } catch (projectErr) {
        editorProjectError =
          projectErr instanceof Error ? projectErr.message : "Could not create the editable project.";
        console.warn("[AutoSubtitle] editor project creation failed:", projectErr);
      }

      setAutoSubtitleProgress({ progress: 99, message: "Saving result..." });
      const transcriptText = whisperResponse.text ?? cues.map((cue) => cue.text).join(" ");
      const createdAt = Date.now();
      let persistedResult: Awaited<ReturnType<typeof persistAutoSubtitleResultAsset>> | null = null;
      try {
        persistedResult = await persistAutoSubtitleResultAsset({
          blob: rendered.blob,
          userId: user.id,
          projectId: activeProject.id,
          source,
          outputName,
          outputMime,
          outputExtension: rendered.extension,
          cues,
          settings,
          trackMeta: result.meta,
          cueCount: cues.length,
          transcriptText,
          handoffId,
          editorProjectId,
          editorProjectError,
          duration: rendered.duration,
          createdAt,
        });
        void queryClient.invalidateQueries({
          queryKey: ["standalone-project-reference-assets", user.id, activeProject.id],
        });
        void queryClient.invalidateQueries({
          queryKey: ["standalone-auto-subtitle-results", user.id, activeProject.id],
        });
      } catch (saveErr) {
        console.warn("[AutoSubtitle] result persistence failed:", saveErr);
      }
      const outputUrl = persistedResult?.outputUrl ?? URL.createObjectURL(rendered.blob);

      setAutoSubtitleResults((items) => [
        {
          id: persistedResult?.assetId ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
          assetId: persistedResult?.assetId,
          sourceName: source.name,
          sourceUrl: source.url,
          sourceStorageBucket: source.storageBucket,
          sourceStoragePath: source.storagePath,
          outputUrl,
          outputName,
          outputMime,
          outputExtension: rendered.extension,
          outputStorageBucket: persistedResult?.storageBucket,
          outputStoragePath: persistedResult?.storagePath,
          cueCount: cues.length,
          transcriptText,
          handoffId,
          editorProjectId,
          editorProjectError,
          createdAt,
          duration: rendered.duration,
        },
        ...items,
      ]);
      if (persistedResult) {
        toast.success(
          editorProjectId
            ? "Subtitle video saved with an editable project."
            : "Subtitle video saved.",
          { id: toastId },
        );
      } else {
        toast.warning(
          "Subtitle video is ready, but it could not be saved. It may disappear after refresh.",
          { id: toastId },
        );
      }
    } catch (err) {
      toast.error(friendlyError(err, language === "th" ? "th" : "en"), { id: toastId });
    } finally {
      setAutoSubtitleProgress(null);
    }
  };

  const openAutoSubtitleEditor = (result: AutoSubtitleResultItem) => {
    if (result.editorProjectId) {
      navigate(`/app/editor/${result.editorProjectId}`);
      return;
    }
    navigate(`/app/editor?autoSubtitleHandoff=${encodeURIComponent(result.handoffId)}`);
  };

  const deleteAutoSubtitleResult = (id: string) => {
    const target = autoSubtitleResults.find((item) => item.id === id);
    if (!target) return;
    setAutoSubtitleResults((items) => items.filter((item) => item.id !== id));
    if (target.outputUrl.startsWith("blob:")) {
      URL.revokeObjectURL(target.outputUrl);
    }
    if (!target.assetId && !target.outputStoragePath) return;
    void deleteAutoSubtitleResultAsset(target)
      .then(() => {
        if (user?.id && activeProject?.id) {
          void queryClient.invalidateQueries({
            queryKey: ["standalone-project-reference-assets", user.id, activeProject.id],
          });
          void queryClient.invalidateQueries({
            queryKey: ["standalone-auto-subtitle-results", user.id, activeProject.id],
          });
        }
      })
      .catch((err) => {
        toast.error(friendlyError(err, language === "th" ? "th" : "en"));
      });
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
  const upscalePanelSettings =
    activeTool === "image_upscale"
      ? buildUpscalePanelSettings({ form, onChange: updateForm, language })
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
  const urlAssetTextControls =
    activeTool === "url_asset"
      ? [
          {
            id: "source-url",
            label: t("workspace.standalone.source_url"),
            value: form.urlAssetSource ?? "",
            placeholder:
              form.model === "url-to-mp3" || form.model === "url-to-mp4"
                ? "https://www.youtube.com/watch?v=..."
                : "https://example.com/file.png",
            rows: 1,
            onChange: (urlAssetSource: string) => updateForm({ urlAssetSource }),
          },
        ]
      : [];
  const urlAssetPanelSettings =
    activeTool === "url_asset"
      ? [
          {
            id: "url-output-format",
            label: t("workspace.standalone.output"),
            value: form.model,
            kind: "select" as const,
            options: [
              { value: "url-to-mp4", label: t("workspace.standalone.output.mp4_video") },
              { value: "url-to-mp3", label: t("workspace.standalone.output.mp3_audio") },
              { value: "url-to-png", label: t("workspace.standalone.output.png_image") },
            ],
            onChange: setToolModel,
          },
        ]
      : [];
  const videoPanelTitle = standaloneToolTitle("video_gen", t);

  const onFileSelected = async (file: File | undefined) => {
    if (!file) return;
    if (!user?.id) {
      openSignInModal();
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (!activeProject?.id) {
      toast.error(t("workspace.toast.create_project_first_upload"));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const slot = pendingSlotRef.current;
    const needsVideo = slot === "video-ref-video";
    const needsTranslateMedia = slot === "translate-video";
    const needsAutoSubtitleMedia = slot === "auto-subtitle-video";
    const needsUpscaleMedia = slot === "upscale-image";
    const needsModel3d = slot === "model-3d";
    const isValidType = needsTranslateMedia
      ? isTranslateMediaFile(file)
      : needsAutoSubtitleMedia
        ? isAutoSubtitleMediaFile(file)
      : needsUpscaleMedia
        ? file.type.startsWith("image/")
      : needsModel3d
        ? isModel3dUploadFile(file)
      : needsVideo
        ? file.type.startsWith("video/")
        : file.type.startsWith("image/");
    if (!isValidType) {
      toast.error(
        needsTranslateMedia
          ? language === "th"
            ? "เลือกไฟล์ MP4 หรือ MP3 สำหรับ Translate"
            : "Choose an MP4 or MP3 file for Translate."
          : needsAutoSubtitleMedia
            ? "Choose an MP4 video for Auto Subtitle."
          : needsUpscaleMedia
            ? language === "th"
              ? "เลือกไฟล์ภาพสำหรับ Upscale Mediaforge"
              : "Choose an image for Upscale Mediaforge."
          : needsModel3d
            ? "Choose a GLB, OBJ, FBX, or STL model file."
          : needsVideo
            ? t("workspace.toast.upload_video_ref")
            : t("workspace.toast.upload_image_ref"),
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (isTranslateVideoOverUploadLimit(slot, file)) {
      toast.error(translateVideoUploadSizeMessage(language));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (needsAutoSubtitleMedia && file.size > AUTO_SUBTITLE_UPLOAD_MAX_BYTES) {
      toast.error(autoSubtitleUploadSizeMessage());
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (needsModel3d && file.size > MODEL_3D_IMPORT_MAX_BYTES) {
      toast.error("Tripo OpenAPI model import supports GLB, OBJ, FBX, or STL files up to 20MB.");
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
        const metadata = await readVideoFileMetadata(file);
        const metadataError = validateSeedanceReferenceVideoMetadata(metadata);
        if (metadataError) {
          toast.error(metadataError);
          return;
        }
        durationSec = metadata?.durationSec ?? null;
      } else if (needsAutoSubtitleMedia) {
        durationSec = await readVideoFileDuration(file);
        if (durationSec == null) {
          toast.error("Could not read the video duration for Auto Subtitle.");
          return;
        }
        if (!isAutoSubtitleDurationValid(durationSec)) {
          toast.error(autoSubtitleDurationMessage(durationSec));
          return;
        }
      }
      const uploaded = await uploadReference(file, user?.id, activeProject.id);
      const uploadedReference = {
        ...uploaded,
        durationSec: durationSec ?? uploaded.durationSec,
      };
      rememberUploadedReference(uploadedReference);
      applyUploadedReference(slot, uploadedReference);
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
        openSignInModal();
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
      const lockedFeature = isWorkspaceFreePlan(profile)
        ? freePlanBlockedFeatureForStandaloneTool(activeTool)
        : null;
      if (lockedFeature) {
        setInsufficientReason("feature_locked");
        setInsufficientFeature(lockedFeature);
        setInsufficientRequiredCredits(undefined);
        setInsufficientOpen(true);
        return;
      }
      if (activeTool === "voice_translate") {
        try {
          await startVoiceTranslate();
        } catch (err) {
          toast.error(friendlyError(err, language === "th" ? "th" : "en"));
        }
        return;
      }
      if (activeTool === "auto_subtitle") {
        await startAutoSubtitle();
        return;
      }
      if (
        activeTool === "video_gen" &&
        form.videoInputMode === "reference" &&
        isSeedance20VideoModel(form.model) &&
        form.videoRefVideo
      ) {
        const metadata = await readSeedanceReferenceVideoUrlMetadata(form.videoRefVideo.url);
        const metadataError = validateSeedanceReferenceVideoMetadata(metadata);
        if (metadataError) {
          toast.error(metadataError);
          return;
        }
        const durationSec = metadata?.durationSec ?? null;
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
          setInsufficientReason("credits");
          setInsufficientFeature(null);
          setInsufficientRequiredCredits(estimatedCost);
          setInsufficientOpen(true);
          return;
        }
      }

      const mentionPrompt =
        activeTool === "url_asset"
          ? ""
          : activeTool === "voice_gen" ? form.script : form.prompt;
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
        const enqueueStandaloneJob = async (
          nodeType: string,
          jobParams: Record<string, unknown>,
          jobInputs: Record<string, unknown>,
          index: number | string,
        ): Promise<string> => {
          const { data, error } = await supabase.functions.invoke(
            RUN_EDGE_FUNCTION,
            {
              body: {
                action: "enqueue_workspace_job",
                node_type: nodeType,
                params: jobParams,
                inputs: jobInputs,
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
          return resp.job_id;
        };

        const waitForStandaloneJob = async (
          jobId: string,
          timeoutMs = 5 * 60 * 1000,
        ): Promise<StandaloneJobRow> => {
          const startedAt = Date.now();
          let lastWarning = "";
          while (Date.now() - startedAt < timeoutMs) {
            const { data, error } = await supabase.functions.invoke(
              RUN_EDGE_FUNCTION,
              {
                body: { action: "poll_workspace_job", job_id: jobId },
              },
            );
            if (error) throw new Error(await functionErrorMessage(error));
            const resp = data as {
              job?: StandaloneJobRow | null;
              error?: string;
              warning?: string;
            } | null;
            if (resp?.error) throw new Error(resp.error);
            if (resp?.warning) lastWarning = resp.warning;
            if (resp?.job && STANDALONE_JOB_TERMINAL_STATUSES.has(resp.job.status)) {
              return resp.job;
            }
            await refetchJobs();
            await waitMs(4000);
          }
          throw new Error(
            lastWarning ||
              "Rig Check is taking too long. Please try Rig Assistant again in a moment.",
          );
        };

        let preparedParams = params;
        let preparedInputs = inputs;
        if (activeTool === "image_to_3d" && activeThreeDMode === "auto_rig") {
          if (form.model3dSource && !tripoModelTaskIdFromReference(form.model3dSource)) {
            const importPayload = externalModel3dInputFromReference(form.model3dSource);
            if (!importPayload) {
              throw new Error("Upload a GLB, OBJ, FBX, or STL model before rigging.");
            }
            const importJobId = await enqueueStandaloneJob(
              "tripoImportModelNode",
              { model_name: "tripo3d-import" },
              { model3d: importPayload },
              "import-model",
            );
            toast.success(
              language === "th"
                ? "กำลัง import โมเดลเข้า Tripo ก่อน Auto Rig"
                : "Importing the model into Tripo before the rig draft.",
            );
            const importJob = await waitForStandaloneJob(importJobId);
            if (importJob.status !== "completed") {
              throw new Error(
                standaloneJobFailureMessage(importJob, "Tripo import failed before rigging."),
              );
            }
            const importedSource = referenceFromGenerationJob(importJob);
            const importedPayload = model3dInputFromReference(importedSource);
            if (!importedSource || !importedPayload) {
              throw new Error("Tripo import completed but did not return a riggable model task ID.");
            }
            preparedInputs = { model3d: importedPayload };
            updateForm({ model3dSource: importedSource });
            toast.success("Import complete. Running Rig Check.");
          }
          const preflightJobId = await enqueueStandaloneJob(
            "tripoPreRigCheckNode",
            { model_name: "tripo3d-prerigcheck" },
            preparedInputs,
            "rig-check",
          );
          toast.success(
            language === "th"
              ? "กำลังตรวจ Rig Check ก่อน Auto Rig"
              : "Running Rig Check before the rig draft.",
          );
          const preflightJob = await waitForStandaloneJob(preflightJobId);
          if (preflightJob.status !== "completed") {
            throw new Error(
              standaloneJobFailureMessage(preflightJob, "Rig Check failed before rigging."),
            );
          }
          const preflight = tripoPreRigInfoFromJob(preflightJob);
          if (preflight.riggable === false) {
            throw new Error(
              "Rig Check says this model is not safe for an AI rig draft yet. Use a clearer T/A-pose style model, choose manual rigging, or send it to a human rig pass.",
            );
          }
          if (preflight.rigType) {
            preparedParams = { ...preparedParams, rig_type: preflight.rigType };
            if (preflight.rigType !== form.rigType) {
              updateForm({ rigType: preflight.rigType });
            }
          } else if (!form.rigType || form.rigType === TRIPO_AUTO_RIG_TYPE) {
            throw new Error(
              "Rig Check passed but did not return a safe rig type. Choose biped, quadruped, or another matching type manually before drafting the rig.",
            );
          }
          toast.success(
            preflight.rigType
              ? `Rig Check passed (${threeDRigTypeLabel(preflight.rigType)}). Starting AI rig draft.`
              : "Rig Check passed. Starting AI rig draft with your selected type.",
          );
        }

        for (let index = 0; index < runCount; index += 1) {
          const batchParams =
            runCount > 1
              ? { ...preparedParams, batch_index: index + 1, batch_count: runCount }
              : preparedParams;
          await enqueueStandaloneJob(
            activeStandaloneNodeType,
            batchParams,
            preparedInputs,
            index,
          );
        }
        toast.success(t("workspace.toast.gen_queued"));
        // Await — `setRunning(false)` in finally below would otherwise
        // race the in-flight refetch and the button could re-enable for
        // a frame before `activeJobsForCurrentTool` reflects the new
        // queued row.
        await jobsQuery.refetch();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const featureLocked = /FEATURE_LOCKED_FREE_PLAN|requires Starter/i.test(message);
        if (featureLocked) {
          const lockedFeature = freePlanBlockedFeatureForStandaloneTool(activeTool);
          setInsufficientReason("feature_locked");
          setInsufficientFeature(lockedFeature);
          setInsufficientRequiredCredits(undefined);
          setInsufficientOpen(true);
        } else if (isInsufficientCreditsError(message)) {
          setInsufficientReason("credits");
          setInsufficientFeature(null);
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

      {onOpenSidebar && (
        <button
          type="button"
          onClick={onOpenSidebar}
          className="fixed left-2 top-2 z-[40] grid h-9 w-9 place-items-center rounded-[10px] border border-white/[0.08] bg-black/75 text-zinc-100 shadow-[0_12px_28px_-22px_rgba(0,0,0,.95)] backdrop-blur-md transition hover:border-[#eaff00]/45 hover:text-[#eaff00] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#eaff00]/70 md:hidden"
          aria-label={t("workspace.standalone.menu")}
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>
      )}

      <div className="ws-scroll-hide flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--bg-app)] lg:flex-row lg:overflow-hidden">
        <aside
          className={cn(
            "ws-scroll-hide mx-auto flex min-h-dvh w-full max-w-[480px] shrink-0 flex-col bg-transparent px-[12px] pb-[12px] pt-[4px] lg:mx-0 lg:h-full lg:min-h-0 lg:max-w-none lg:pb-0 lg:pl-2 lg:pr-0 lg:pt-4",
            activeTool === "image_to_3d"
              ? "lg:flex-1 lg:w-auto lg:max-w-none lg:p-0"
              : activeTool === "auto_subtitle"
                ? "lg:w-[376px] xl:w-[405px] 2xl:w-[442px]"
                : "lg:w-[364px] xl:w-[386px]",
          )}
        >
          {STANDALONE_TOOL_ORDER.includes(activeTool) ? (
            activeTool === "auto_subtitle" ? (
            <AutoSubtitlePanelV2
              form={form}
              uploading={uploading === "auto-subtitle-video"}
              running={running}
              progress={autoSubtitleProgress}
              language={language}
              onChange={updateForm}
              onUpload={() => openUpload("auto-subtitle-video")}
              onVideoFiles={(files) => void uploadPanelReferenceFiles(files, "auto-subtitle-video")}
              onRemoveVideo={() => updateForm({ autoSubtitleVideo: null })}
              onCreate={() => void run()}
              onToolChange={onToolChange}
            />
            ) : activeTool === "image_to_3d" ? (
            <ThreeDWorkshop
              mode={activeThreeDMode}
              form={form}
              jobs={filterJobsForTool(jobsQuery.data ?? [], activeTool)}
              jobsLoading={jobsQuery.isLoading}
              modelOptions={activeDef.models.filter((model) => model.id !== "google-tts-studio").map((model) => ({
                id: model.id,
                label: model.label,
                provider: model.provider,
              }))}
              sourceOptions={threeDModelSourceOptions}
              referenceAssets={panelReferenceAssets}
              uploading={uploading === (activeThreeDMode === "image_to_3d" ? "model-image" : "model-3d")}
              running={running}
              activeJobCount={activeJobsForCurrentTool}
              createLabel={standaloneCreateButtonLabelForForm(activeTool, form, language, estimatedCost)}
              costQuote={estimatedCostQuote}
              onChange={updateForm}
              onModelChange={setToolModel}
              onUploadClick={() => openUpload(activeThreeDMode === "image_to_3d" ? "model-image" : "model-3d")}
              onReferenceFiles={uploadPanelReferenceFiles}
              onSelectReferenceAsset={selectPanelReferenceAsset}
              onRemoveReference={removePanelReference}
              onCreate={() => void run()}
              onDeleteJob={deleteStandaloneResult}
              onToolChange={onToolChange}
              onOpenSidebar={onOpenSidebar}
            />
            ) : activeTool === "voice_translate" ? (
            <VoiceTranslatePanel
              form={form}
              uploading={uploading === "translate-video"}
              running={running}
              task={translateTask}
              language={language}
              onChange={updateForm}
              onUpload={() => openUpload("translate-video")}
              onVideoFiles={(files) => void uploadPanelReferenceFiles(files, "translate-video")}
              onRemoveVideo={() => updateForm({ translateVideo: null })}
              onCreate={() => void run()}
              onToolChange={onToolChange}
            />
            ) : activeTool === "video_gen" ? (
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
                if (tab === "upscale") onToolChange("image_upscale");
                if (tab === "translate") onToolChange("voice_translate");
                if (tab === "3d") onToolChange("image_to_3d");
                if (tab === "audio") onToolChange("voice_gen");
              }}
              density={activeTool === "voice_gen" ? "voice" : "default"}
            />
            ) : (
            <CreateImagePanel
              title={standaloneToolTitle(activeTool, t)}
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
              showPromptInput={
                activeTool !== "image_to_3d" &&
                activeTool !== "image_upscale" &&
                activeTool !== "url_asset"
              }
              modelLabel={selectedModel?.label ?? "Nano Banana Pro"}
              modelValue={form.model}
              modelOptions={activeDef.models.filter((model) => model.id !== "google-tts-studio").map((model) => ({
                id: model.id,
                label: model.label,
                provider: model.provider,
                settings:
                  activeTool === "image_gen"
                    ? imageModelSettingTags(model.id, language)
                    : activeTool === "image_upscale"
                      ? upscaleModelSettingTags(model.id, language)
                    : activeTool === "image_to_3d"
                      ? threeDModelSettingTags(model.id, language)
                      : activeTool === "voice_gen"
                        ? audioModelSettingTags(model.id, language)
                        : [],
              }))}
              onModelChange={setToolModel}
              showModelSelector={activeTool !== "url_asset"}
              references={panelReferences}
              maxReferences={panelMaxReferences}
              showReferences={activeTool !== "voice_gen" && activeTool !== "url_asset"}
              referenceTitle={panelReferenceTitle}
              referenceBadge={
                activeTool === "image_upscale"
                  ? undefined
                  : t("workspace.standalone.optional")
              }
              referenceHint={
                activeTool === "video_gen"
                  ? t("workspace.standalone.hint.video_visual_reference")
                  : activeTool === "image_upscale"
                    ? t("workspace.standalone.hint.model_image_reference")
                  : activeTool === "image_to_3d"
                    ? panelMaxReferences > 1
                      ? t("workspace.standalone.hint.model_multiview_reference")
                      : t("workspace.standalone.hint.model_image_reference")
                    : t("workspace.standalone.hint.image_reference")
              }
              referenceAccept={
                activeTool === "image_upscale"
                  ? "image/*"
                  : activeTool === "video_gen" ? "image/*,video/*" : "image/*"
              }
              compactReferenceInput={activeTool === "image_upscale"}
              referenceAssets={panelReferenceAssets}
              onAddReferences={
                activeTool === "voice_gen" || activeTool === "url_asset" ? undefined : openPanelReferenceUpload
              }
              onReferenceFiles={
                activeTool === "voice_gen" || activeTool === "url_asset" ? undefined : uploadPanelReferenceFiles
              }
              onSelectReferenceAsset={
                activeTool === "voice_gen" || activeTool === "url_asset" ? undefined : selectPanelReferenceAsset
              }
              onDeleteReferenceAsset={
                activeTool === "voice_gen" || activeTool === "url_asset" ? undefined : deletePanelReferenceAsset
              }
              onRemoveReference={removePanelReference}
              mentionOptions={panelMentionOptions}
              settings={
                activeTool === "image_gen"
                  ? imagePanelSettings
                  : activeTool === "image_upscale"
                    ? upscalePanelSettings
                  : activeTool === "image_to_3d"
                    ? threeDPanelSettings
                    : activeTool === "url_asset"
                      ? urlAssetPanelSettings
                    : []
              }
              textControls={activeTool === "url_asset" ? urlAssetTextControls : []}
              extraControls={
                activeTool === "image_upscale" ? (
                  <UpscaleGuide form={form} language={language} />
                ) : activeTool === "voice_gen" ? (
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
                if (tab === "upscale") onToolChange("image_upscale");
                if (tab === "translate") onToolChange("voice_translate");
                if (tab === "3d") onToolChange("image_to_3d");
                if (tab === "audio") onToolChange("voice_gen");
              }}
              density={activeTool === "voice_gen" ? "voice" : "default"}
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

        {activeTool !== "image_to_3d" && (
        <main className="ws-scroll-hide min-h-0 flex-1 overflow-visible bg-[var(--bg-app)] px-3 pb-3 pt-3 md:px-4 lg:overflow-hidden lg:pb-0 lg:pl-2 lg:pr-3 lg:pt-4">
          <section className="flex min-h-[560px] flex-1 flex-col overflow-hidden rounded-[20px] bg-[var(--bg-sidebar)] shadow-[inset_0_1px_0_rgba(255,255,255,.035),0_22px_50px_-38px_rgba(238,255,0,.45)] lg:h-full lg:min-h-0">
            <div className="ws-scroll-hide min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {activeTool === "auto_subtitle" ? (
                <AutoSubtitleMiniEditorPanel
                  form={form}
                  results={autoSubtitleResults}
                  running={running}
                  progress={autoSubtitleProgress}
                  onChange={updateForm}
                  onEdit={openAutoSubtitleEditor}
                  onDelete={deleteAutoSubtitleResult}
                />
              ) : (
                <CreationFeed
                  jobs={filterJobsForTool(jobsQuery.data ?? [], activeTool)}
                  loading={jobsQuery.isLoading}
                  onDeleteJob={deleteStandaloneResult}
                />
              )}
            </div>
          </section>
        </main>
        )}
      </div>
      <InsufficientCreditsDialog
        open={insufficientOpen}
        onOpenChange={setInsufficientOpen}
        requiredCredits={insufficientRequiredCredits}
        reason={insufficientReason}
        featureName={featureLabelForPlanLock(insufficientFeature)}
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
          : "items-center justify-around border-t border-white/[0.04] bg-[#17191b] px-[18px] py-[6px]",
        className,
      )}
    >
      {STANDALONE_TOOL_ORDER.map((key) => {
        const item = STANDALONE_TOOLS[key];
        const active = key === activeTool;
        const Icon = item.icon;
        const label = standaloneToolNav(item.key, t);
        return (
          <button
            key={key}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => onToolChange(key)}
            className={cn(
              "relative flex min-w-0 items-center justify-center overflow-hidden rounded-full font-semibold outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[var(--brand-soft)]/60",
              isMobile
                ? active
                  ? "h-[34px] min-w-[78px] px-[12px] text-[12px] bg-white text-black shadow-[0_0_18px_rgba(244,255,0,.5)]"
                  : "h-[34px] w-[34px] px-0 text-[var(--text-default)] hover:bg-white/10 hover:text-white"
                : cn(
                    "h-[34px] w-[34px] px-0",
                    active
                      ? "bg-white text-black shadow-[0_6px_18px_-10px_rgba(255,255,255,.75)]"
                      : "text-neutral-400 hover:bg-white/[0.06] hover:text-white",
                  ),
            )}
          >
            <Icon
              className={cn(
                "shrink-0 transition-transform duration-300",
                isMobile ? "h-[17px] w-[17px]" : "h-[18px] w-[18px]",
                active
                  ? "scale-105"
                  : "opacity-70",
              )}
            />
            {isMobile && active && (
              <span
                className={cn(
                  "ml-[6px] truncate leading-[14px]",
                  isMobile ? "max-w-[48px]" : "max-w-[72px]",
                )}
              >
                {label}
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
        <div className="h-8 min-w-[32px]" aria-hidden />
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
      <div aria-hidden />
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

const TRANSLATE_LANGUAGE_OPTIONS = [
  "English",
  "Hindi",
  "Portuguese",
  "Chinese",
  "Spanish",
  "French",
  "German",
  "Japanese",
  "Arabic",
  "Russian",
  "Korean",
  "Indonesian",
  "Italian",
  "Dutch",
  "Turkish",
  "Polish",
  "Swedish",
  "Filipino",
  "Malay",
  "Romanian",
  "Ukrainian",
  "Greek",
  "Czech",
  "Danish",
  "Finnish",
  "Bulgarian",
  "Croatian",
  "Slovak",
  "Tamil",
];

const ELEVENLABS_SOURCE_LANGUAGE_OPTIONS = [
  "Auto",
  ...TRANSLATE_LANGUAGE_OPTIONS,
];

const ELEVENLABS_DUBBING_LANGUAGE_SET = new Set(TRANSLATE_LANGUAGE_OPTIONS);

function isElevenLabsDubbingLanguage(value: string): boolean {
  return ELEVENLABS_DUBBING_LANGUAGE_SET.has(value.trim());
}

function unsupportedElevenLabsDubbingLanguageMessage(value: string, language: string): string {
  const label = value.trim() || "selected language";
  return language === "th"
    ? `ElevenLabs Translate ยังไม่รองรับ ${label} สำหรับการพากย์เสียง เลือกภาษาเป้าหมายอื่นก่อน`
    : `ElevenLabs Translate does not support ${label} for dubbing yet. Choose another target language.`;
}

function translateMediaFilesFromTransfer(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files: File[] = [];
  const seen = new Set<string>();
  const push = (file: File | null) => {
    const lowerName = file?.name?.toLowerCase() ?? "";
    const looksLikeMedia =
      file?.type.startsWith("video/") ||
      file?.type.startsWith("audio/") ||
      /\.(mp4|mov|webm|m4v|mp3|wav|m4a|aac)$/i.test(lowerName);
    if (!file || !looksLikeMedia) return;
    const key = `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push(file);
  };
  Array.from(data.items ?? []).forEach((item) => {
    if (item.kind === "file") push(item.getAsFile());
  });
  Array.from(data.files ?? []).forEach(push);
  return files;
}

function isTranslateMediaFile(file: File): boolean {
  return (
    file.type.startsWith("video/") ||
    file.type.startsWith("audio/") ||
    /\.(mp4|mov|webm|m4v|mp3|wav|m4a|aac)$/i.test(file.name)
  );
}

function isAutoSubtitleMediaFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
}

function autoSubtitleVideoFilesFromTransfer(data: DataTransfer | null): File[] {
  return translateMediaFilesFromTransfer(data).filter(isAutoSubtitleMediaFile);
}

function clampAutoSubtitlePosition(value: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0.06, Math.min(0.94, numeric));
}

function autoSubtitleVerticalFromY(
  y: number,
): StandaloneFormState["autoSubtitlePosition"] {
  if (y <= 0.34) return "top";
  if (y >= 0.66) return "bottom";
  return "middle";
}

function autoSubtitlePositionPercentFromVertical(
  position: StandaloneFormState["autoSubtitlePosition"],
): number {
  if (position === "top") return 0.18;
  if (position === "middle") return 0.5;
  return 0.84;
}

const AUTO_SUBTITLE_ACCENT_TEXT_ANIMATIONS = new Set<CaptionTextAnimation>([
  "hope-horizon",
  "big-echoes",
  "love-emphasis",
]);

function autoSubtitleUsesAccentColor(settings: CaptionStyleSettings): boolean {
  return (
    settings.animation === "wordHighlight" ||
    settings.outAnimation === "wordHighlight" ||
    AUTO_SUBTITLE_ACCENT_TEXT_ANIMATIONS.has(settings.textAnimation)
  );
}

function autoSubtitleStyleFromForm(form: StandaloneFormState): CaptionStyleSettings {
  const preset =
    BUILTIN_CAPTION_PRESETS.find((item) => item.id === form.autoSubtitlePresetId)?.settings ??
    DEFAULT_CAPTION_SETTINGS;
  const rawWordsPerLine = Number(form.autoSubtitleWordsPerLine);
  return {
    ...preset,
    font: form.autoSubtitleFont,
    size: Math.max(24, Math.min(96, Number(form.autoSubtitleSize) || preset.size)),
    fill: form.autoSubtitleFill || preset.fill,
    accentColor: form.autoSubtitleAccentColor || captionAccentColor(preset),
    highlightColor: form.autoSubtitleAccentColor || captionAccentColor(preset),
    stroke: {
      ...preset.stroke,
      enabled: form.autoSubtitleStroke,
      width: Math.max(0, Math.min(12, Number(form.autoSubtitleStrokeWidth) || 0)),
    },
    background: {
      ...preset.background,
      enabled: form.autoSubtitleBackground,
    },
    animation: form.autoSubtitleTransition || preset.animation,
    outAnimation:
      form.autoSubtitleOutTransition || preset.outAnimation || preset.animation,
    textAnimation:
      form.autoSubtitleTextAnimation || preset.textAnimation || "none",
    wordsPerLine:
      rawWordsPerLine <= 0
        ? AUTO_SUBTITLE_MAX_WORD_SPLIT
        : Math.max(1, Math.min(AUTO_SUBTITLE_MAX_WORD_SPLIT, rawWordsPerLine || preset.wordsPerLine)),
    positionV: form.autoSubtitlePosition,
    positionH: "center",
    positionX: clampAutoSubtitlePosition(form.autoSubtitlePositionX, 0.5),
    positionY: clampAutoSubtitlePosition(
      form.autoSubtitlePositionY,
      autoSubtitlePositionPercentFromVertical(form.autoSubtitlePosition),
    ),
  };
}

function autoSubtitleTransitionLabel(
  animation: CaptionAnimation,
  language: string,
): string {
  if (language !== "th") return captionTransitionOptionFor(animation).label;
  switch (animation) {
    case "none":
      return "ไม่มี";
    case "fade":
      return "ค่อยๆ จาง";
    case "slideIn":
    case "slideUp":
      return "เลื่อนขึ้น";
    case "slideDown":
      return "เลื่อนลง";
    case "scale":
      return "ซูม";
    case "pop":
      return "เด้ง";
    case "typewriter":
      return "พิมพ์ทีละตัว";
    case "wordHighlight":
    default:
      return captionTransitionOptionFor(animation).label;
  }
}

function autoSubtitleTextAnimationLabel(
  animation: CaptionTextAnimation,
  t: ReturnType<typeof useLanguage>["t"],
): string {
  if (animation === "none") return t("workspace.standalone.panel.text_animation_none");
  return captionTextAnimationOptionFor(animation).label;
}

function captionLanguageLabel(code: string, t: ReturnType<typeof useLanguage>["t"]): string {
  if (code === "auto") return t("workspace.standalone.panel.language_auto_detect");
  return CAPTIONS_LANGUAGES.find((item) => item.code === code)?.label ?? code;
}

function autoSubtitleAlgorithmFromForm(
  form: StandaloneFormState,
  settings: CaptionStyleSettings,
): AutoSuptitleAlgorithmSettings {
  const segmentationMode = form.autoSubtitleSegmentationMode ?? "sentence";
  if (segmentationMode === "sentence") {
    return algorithmFromCaptionSettings(settings, {
      segmentationMode,
      maxLineDuration: Math.min(Math.max(settings.maxLineDuration, 1.5), 2.4),
      maxCharsPerLine: 28,
      maxSilenceGap: 0.6,
      maxHoldAfterSpeech: 0.5,
      splitOnPunctuation: true,
    });
  }

  return algorithmFromCaptionSettings(settings, {
    segmentationMode,
  });
}

function autoSubtitleOutputName(sourceName: string, extension: string): string {
  const base = sourceName.replace(/\.[^.]+$/, "") || "auto-subtitle";
  return `${base}-auto-subtitle.${extension}`;
}

function storageSafeAutoSubtitleMime(mime: string | undefined, extension: "mp4" | "webm"): string {
  const base = mime?.split(";")[0]?.trim().toLowerCase();
  if (base === "video/mp4" || base === "video/webm") return base;
  return extension === "webm" ? "video/webm" : "video/mp4";
}

const AUTO_SUBTITLE_PREVIEW_WORDS_TH = [
  "อย่าลืม",
  "เข้ามา",
  "ทดลองใช้",
  "มีเดียร์ฟอร์จ",
  "สร้างงาน",
  "กันนะครับ",
] as const;

const AUTO_SUBTITLE_PREVIEW_WORDS_EN = [
  "Come",
  "try",
  "MediaForge",
  "and",
  "create",
  "faster",
] as const;

const AUTO_SUBTITLE_PREVIEW_SENTENCES_TH = [
  "อย่าลืมเข้ามา",
  "ทดลองใช้",
  "มีเดียร์ฟอร์จ",
  "กันนะครับ",
] as const;

const AUTO_SUBTITLE_PREVIEW_SENTENCES_EN = [
  "Come try MediaForge",
  "build faster",
  "edit the result",
  "and publish today",
] as const;

function autoSubtitlePreviewPhrases(
  language: ReturnType<typeof useLanguage>["language"],
  wordsPerLine: number,
  segmentationMode: AutoSubtitleSegmentationMode,
): readonly string[] {
  if (segmentationMode === "sentence") {
    return language === "th"
      ? AUTO_SUBTITLE_PREVIEW_SENTENCES_TH
      : AUTO_SUBTITLE_PREVIEW_SENTENCES_EN;
  }

  const words =
    language === "th" ? AUTO_SUBTITLE_PREVIEW_WORDS_TH : AUTO_SUBTITLE_PREVIEW_WORDS_EN;
  const chunkSize =
    wordsPerLine <= 0
      ? words.length
      : Math.max(1, Math.min(AUTO_SUBTITLE_MAX_WORD_SPLIT, Math.floor(wordsPerLine)));
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += chunkSize) {
    chunks.push(words.slice(index, index + chunkSize).join(" "));
  }
  return chunks;
}

function VoiceTranslatePanel({
  form,
  uploading,
  running,
  task,
  language,
  onChange,
  onUpload,
  onVideoFiles,
  onRemoveVideo,
  onCreate,
  onToolChange,
}: {
  form: StandaloneFormState;
  uploading: boolean;
  running: boolean;
  task: VoiceTranslateTask | null;
  language: ReturnType<typeof useLanguage>["language"];
  onChange: (patch: Partial<StandaloneFormState>) => void;
  onUpload: () => void;
  onVideoFiles: (files: File[]) => void;
  onRemoveVideo: () => void;
  onCreate: () => void;
  onToolChange: (tool: StandaloneToolKey) => void;
}) {
  const { t } = useLanguage();
  const copy = {
    title: t("workspace.standalone.panel.voice_translate.title"),
    subtitle: t("workspace.standalone.voice_translate.subtitle"),
    uploadTitle: t("workspace.standalone.voice_translate.upload_title"),
    uploadHint: t("workspace.standalone.voice_translate.upload_hint"),
    uploadLimit: t("workspace.standalone.voice_translate.upload_limit", { max: TRANSLATE_VIDEO_UPLOAD_MAX_LABEL }),
    source: t("workspace.standalone.voice_translate.source"),
    sourceAuto: t("workspace.standalone.voice_translate.source_auto"),
    sourceHint: t("workspace.standalone.voice_translate.source_hint"),
    target: t("workspace.standalone.voice_translate.target"),
    speakers: t("workspace.standalone.voice_translate.speakers"),
    consent: t("workspace.standalone.voice_translate.consent"),
    action: t("workspace.standalone.panel.voice_translate.action"),
    processing: t("workspace.standalone.voice_translate.processing"),
    ready: t("workspace.standalone.voice_translate.ready"),
    remove: t("workspace.standalone.voice_translate.remove"),
    videoInput: t("workspace.standalone.smart_frames.video_fallback"),
  };
  const media = form.translateVideo;
  const isAudio = translateOutputTypeForMedia(media) === "audio";

  const addFiles = (files: File[]) => {
    if (files.length > 0) onVideoFiles(files.slice(0, 1));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    addFiles(translateMediaFilesFromTransfer(event.dataTransfer));
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = translateMediaFilesFromTransfer(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    addFiles(files);
  };

  const isBusy =
    running ||
    uploading ||
    task?.status === "submitted" ||
    task?.status === "queued" ||
    task?.status === "pending" ||
    task?.status === "processing" ||
    task?.status === "running";

  return (
    <section className="standalone-create-panel standalone-translate-panel mf-clean-generator flex h-full w-full max-w-[480px] flex-col overflow-hidden rounded-[20px] border border-white/[0.02] bg-[#121314]">
      <div className="ws-scroll-hide flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto px-[12px] pb-[10px] pt-[12px]">
        <div className="space-y-[10px]">
          <StandaloneToolHeaderCard title={copy.title} />

          <div
            role={!media ? "button" : undefined}
            tabIndex={!media ? 0 : undefined}
            onClick={!media ? onUpload : undefined}
            onKeyDown={(event) => {
              if (!media && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onUpload();
              }
            }}
            onPaste={handlePaste}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={handleDrop}
            className={cn(
              "mf-clean-reference-dropzone mf-clean-translate-dropzone group relative flex w-full items-center overflow-hidden text-left outline-none transition",
              media
                ? "is-loaded cursor-default"
                : "cursor-pointer focus:ring-1 focus:ring-[#f4ff00]/60",
            )}
          >
            {media ? (
              <>
                {isAudio ? (
                  <div className="flex min-h-[94px] w-full flex-col justify-center gap-2 px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center text-cyan-200">
                        <Music className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold leading-[14px] text-white">{media.name}</p>
                        <p className="mt-0.5 text-[10px] font-semibold leading-[12px] text-zinc-500">MP3 / audio</p>
                      </div>
                    </div>
                    <audio src={media.url} controls className="w-full" />
                  </div>
                ) : (
                  <video
                    src={media.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-video max-h-[142px] w-full bg-black object-contain"
                  />
                )}
                {!isAudio && (
                  <span className="absolute left-3 top-3 max-w-[70%] truncate rounded-full border border-black/30 bg-black/70 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
                    {media.name}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveVideo();
                  }}
                  className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white transition hover:bg-white/15"
                  aria-label={copy.remove}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <div className="mf-translate-source-empty">
                <span className="mf-media-upload-tile mf-translate-source-tile" aria-hidden="true">
                  <span className="mf-media-upload-tile-icon">
                    {uploading ? (
                      <Loader2 className="h-[16px] w-[16px] animate-spin" />
                    ) : (
                      <Camera className="h-[16px] w-[16px]" />
                    )}
                  </span>
                  <span className="mf-translate-source-tile-label">{copy.videoInput}</span>
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <VoiceTranslateSelectCard
              label={copy.source}
              value={form.translateSourceLanguage}
              displayValue={
                form.translateSourceLanguage === "Auto"
                  ? copy.sourceAuto
                  : form.translateSourceLanguage
              }
              icon={<Languages className="h-4 w-4" />}
              options={ELEVENLABS_SOURCE_LANGUAGE_OPTIONS.map((option) => ({
                value: option,
                label: option === "Auto" ? copy.sourceAuto : option,
              }))}
              onChange={(value) => onChange({ translateSourceLanguage: value })}
            />
            <VoiceTranslateSelectCard
              label={copy.target}
              value={form.translateOutputLanguage}
              displayValue={form.translateOutputLanguage}
              icon={<Languages className="h-4 w-4" />}
              options={TRANSLATE_LANGUAGE_OPTIONS.map((option) => ({
                value: option,
                label: option,
              }))}
              onChange={(value) => onChange({ translateOutputLanguage: value })}
            />
            <VoiceTranslateSelectCard
              label={copy.speakers}
              value={String(form.translateSpeakerNum)}
              displayValue={String(form.translateSpeakerNum)}
              icon={<SlidersHorizontal className="h-[14px] w-[14px]" />}
              options={[1, 2, 3].map((value) => ({
                value: String(value),
                label: String(value),
              }))}
              onChange={(value) => onChange({ translateSpeakerNum: Number(value) || 1 })}
            />
            <div className="standalone-setting-card flex min-h-[38px] items-center gap-[6px] rounded-[10px] border border-[var(--border-faint)] bg-[var(--bg-panel)] px-[7px] py-[3px] text-white">
              <span className="grid h-[24px] w-[24px] shrink-0 place-items-center rounded-[7px] bg-white/[0.05] text-zinc-300">
                {translateOutputTypeForMedia(media) === "audio" ? (
                  <Music className="h-[14px] w-[14px]" />
                ) : (
                  <Film className="h-[14px] w-[14px]" />
                )}
              </span>
              <span className="min-w-0 text-left">
                <span className="block text-[13px] font-medium leading-[14px] text-[var(--text-tertiary)]">
                  {t("workspace.standalone.panel.format")}
                </span>
                <span className="block truncate text-[15px] font-bold leading-[16px] text-white">
                  {media ? translateOutputFormatLabel(media) : t("workspace.standalone.panel.format_auto")}
                </span>
              </span>
            </div>
          </div>

          <label className="flex min-h-[42px] items-center gap-2.5 rounded-[10px] border border-[var(--border-faint)] bg-[var(--bg-panel)] px-2.5 py-2">
            <span
              className={cn(
                "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition",
                form.translateConsent
                  ? "border-[#f4ff00] bg-[#f4ff00] text-black"
                  : "border-white/20 bg-black/30 text-transparent",
              )}
            >
              <Check className="h-[13px] w-[13px]" />
            </span>
            <input
              type="checkbox"
              checked={form.translateConsent}
              onChange={(event) => onChange({ translateConsent: event.target.checked })}
              className="sr-only"
            />
            <span className="text-[15px] font-semibold leading-[18px] text-zinc-200">{copy.consent}</span>
          </label>

          <p className="rounded-[10px] border border-white/[0.04] bg-black/20 px-2.5 py-2 text-[13px] font-medium leading-[18px] text-zinc-400">
            {copy.sourceHint}
          </p>

          {(task?.error || (task?.status && task.status !== "completed")) && (
            <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold leading-[16px] text-zinc-300">{copy.ready}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[12px] font-bold leading-[15px]",
                    task.status === "failed"
                      ? "bg-red-500/15 text-red-200"
                      : task.status === "completed"
                        ? "bg-emerald-400/15 text-emerald-200"
                        : "bg-cyan-300/10 text-cyan-100",
                  )}
                >
                  {task.status}
                </span>
              </div>
              {task.error && (
                <p className="mt-1.5 line-clamp-3 text-[13px] font-medium leading-[18px] text-red-200">
                  {task.error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mf-clean-footer flex w-full flex-col items-stretch gap-[10px] bg-[#121314] px-[12px] py-[10px]">
        <div className="mf-clean-translate-media-row flex h-[36px] w-full items-center gap-2 rounded-[14px] border border-white/[0.05] bg-[#16181a] px-[10px] text-[13px] font-semibold text-zinc-300">
          <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" />
          <span className="truncate">{media ? translateOutputShortLabel(media) : t("workspace.standalone.panel.media")}</span>
        </div>
        <div className="mf-clean-action-stack flex w-full min-w-0 flex-col gap-[4px]">
          <button
            type="button"
            onClick={onCreate}
            disabled={isBusy}
            className="standalone-generate-button ci-gloss-button group relative flex w-full items-center justify-center gap-[8px] overflow-hidden rounded-full border px-[14px] text-[15px] font-semibold leading-[20px] transition-all active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="pointer-events-none absolute inset-x-4 top-0 h-[16px] rounded-b-full bg-white/30 blur-[10px]" />
            <span className="pointer-events-none absolute -right-8 top-1/2 h-20 w-28 -translate-y-1/2 rounded-full bg-sky-200/25 blur-2xl" />
            {isBusy ? (
              <Loader2 className="relative h-4 w-4 animate-spin" />
            ) : (
              <GenerateIcon className="relative h-4 w-4" />
            )}
            <span className="relative truncate">{isBusy ? copy.processing : copy.action}</span>
          </button>
        </div>
      </div>
      <ToolTabs
        activeTool="voice_translate"
        onToolChange={onToolChange}
        className="hidden shrink-0 lg:flex"
      />
    </section>
  );
}

function AutoSubtitlePanelV2({
  form,
  uploading,
  running,
  progress,
  language,
  onChange,
  onUpload,
  onVideoFiles,
  onRemoveVideo,
  onCreate,
  onToolChange,
}: {
  form: StandaloneFormState;
  uploading: boolean;
  running: boolean;
  progress: AutoSubtitleProgress | null;
  language: ReturnType<typeof useLanguage>["language"];
  onChange: (patch: Partial<StandaloneFormState>) => void;
  onUpload: () => void;
  onVideoFiles: (files: File[]) => void;
  onRemoveVideo: () => void;
  onCreate: () => void;
  onToolChange: (tool: StandaloneToolKey) => void;
}) {
  const [showMoreStyles, setShowMoreStyles] = useState(false);
  const [subtitleDesignTab, setSubtitleDesignTab] = useState<
    "style" | "in" | "out" | "loop"
  >("style");
  const th = language === "th";
  const { t } = useLanguage();
  const media = form.autoSubtitleVideo;
  const selectedPreset =
    BUILTIN_CAPTION_PRESETS.find((preset) => preset.id === form.autoSubtitlePresetId) ??
    BUILTIN_CAPTION_PRESETS[0];
  const selectedSettings = autoSubtitleStyleFromForm(form);
  const visiblePresets = showMoreStyles
    ? BUILTIN_CAPTION_PRESETS
    : BUILTIN_CAPTION_PRESETS.slice(0, 5);

  const copy = {
    title: t("workspace.standalone.panel.auto_subtitle.title"),
    subtitle: t("workspace.standalone.auto_subtitle.subtitle"),
    tabSubtitle: "AI Subtitle",
    tabRepurpose: "AI Repurposing Video",
    settingsTitle: "AI SETTINGS",
    sourceVideo: t("workspace.standalone.auto_subtitle.upload_title"),
    uploadHint: t("workspace.standalone.auto_subtitle.upload_hint"),
    uploadLimit: t("workspace.standalone.auto_subtitle.upload_limit", {
      max: AUTO_SUBTITLE_UPLOAD_MAX_LABEL,
      duration: th ? AUTO_SUBTITLE_MAX_DURATION_LABEL_TH : AUTO_SUBTITLE_MAX_DURATION_LABEL,
    }),
    aspect: t("workspace.standalone.auto_subtitle.aspect"),
    keepSource: t("workspace.standalone.auto_subtitle.keep_source"),
    locked: t("workspace.standalone.auto_subtitle.locked"),
    style: t("workspace.standalone.auto_subtitle.style"),
    styleTab: t("workspace.standalone.auto_subtitle.style_tab"),
    inTab: "In",
    outTab: "Out",
    loopTab: "Loop",
    moreStyles: t("workspace.standalone.auto_subtitle.more_styles"),
    fewerStyles: t("workspace.standalone.auto_subtitle.fewer_styles"),
    advanced: t("workspace.standalone.auto_subtitle.advanced"),
    speech: t("workspace.standalone.auto_subtitle.speech"),
    font: t("workspace.standalone.auto_subtitle.font"),
    position: t("workspace.standalone.auto_subtitle.position"),
    size: t("workspace.standalone.auto_subtitle.size"),
    algorithm: t("workspace.standalone.auto_subtitle.algorithm"),
    sentenceMode: t("workspace.standalone.auto_subtitle.sentence_mode"),
    sentenceModeHint: t("workspace.standalone.auto_subtitle.sentence_mode_hint"),
    wordMode: t("workspace.standalone.auto_subtitle.word_mode"),
    wordModeHint: t("workspace.standalone.auto_subtitle.word_mode_hint"),
    words: t("workspace.standalone.auto_subtitle.words"),
    inAnimation: "In animation",
    outAnimation: "Out animation",
    loopAnimation: "Loop animation",
    textColor: t("workspace.standalone.auto_subtitle.text_color"),
    accentColor: t("workspace.standalone.auto_subtitle.accent_color"),
    stroke: t("workspace.standalone.auto_subtitle.stroke"),
    background: t("workspace.standalone.auto_subtitle.background"),
    translation: t("workspace.standalone.auto_subtitle.translation"),
    noTranslation: t("workspace.standalone.auto_subtitle.no_translation"),
    translateThai: t("workspace.standalone.auto_subtitle.translate_thai"),
    bilingual: "Bilingual",
    previewText: t("workspace.standalone.auto_subtitle.preview_text"),
    previewCardText: t("workspace.standalone.auto_subtitle.preview_card"),
    previewNextText: t("workspace.standalone.auto_subtitle.preview_next"),
    ready: t("workspace.standalone.auto_subtitle.ready"),
    action: t("workspace.standalone.panel.auto_subtitle.action"),
    processing: t("workspace.standalone.auto_subtitle.processing"),
    remove: t("workspace.standalone.auto_subtitle.remove"),
  };

  const addFiles = (files: File[]) => {
    if (files.length > 0) onVideoFiles(files.slice(0, 1));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    addFiles(autoSubtitleVideoFilesFromTransfer(event.dataTransfer));
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = autoSubtitleVideoFilesFromTransfer(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    addFiles(files);
  };

  const speechLabel = captionLanguageLabel(form.autoSubtitleLanguage, t);
  const aspectLabel =
    media?.width && media.height ? `${media.width}:${media.height}` : th ? "ต้นฉบับ" : "Source";
  const wordSplitLabel =
    th ? `${form.autoSubtitleWordsPerLine} คำ` : `${form.autoSubtitleWordsPerLine} words`;
  const segmentationLabel =
    form.autoSubtitleSegmentationMode === "sentence" ? copy.sentenceMode : copy.wordMode;
  const transitionLabel = autoSubtitleTransitionLabel(
    form.autoSubtitleTransition,
    language,
  );
  const outTransitionLabel = autoSubtitleTransitionLabel(
    form.autoSubtitleOutTransition || form.autoSubtitleTransition,
    language,
  );
  const textAnimationLabel = autoSubtitleTextAnimationLabel(
    form.autoSubtitleTextAnimation,
    t,
  );
  const transitionOptions = CAPTION_TRANSITION_OPTIONS.map((option) => ({
    value: option.id,
    label: autoSubtitleTransitionLabel(option.id, language),
  }));
  const textAnimationOptions = CAPTION_TEXT_ANIMATION_OPTIONS.map((option) => ({
    value: option.id,
    label: autoSubtitleTextAnimationLabel(option.id, t),
  }));
  const previewSamplePhrases = useMemo(
    () =>
      autoSubtitlePreviewPhrases(
        language,
        form.autoSubtitleWordsPerLine,
        form.autoSubtitleSegmentationMode,
      ),
    [form.autoSubtitleSegmentationMode, form.autoSubtitleWordsPerLine, language],
  );

  const applyPreset = (presetId: string) => {
    const preset = BUILTIN_CAPTION_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    onChange({
      autoSubtitlePresetId: presetId,
      autoSubtitleFont: preset.settings.font,
      autoSubtitleSize: preset.settings.size,
      autoSubtitleFill: preset.settings.fill,
      autoSubtitleAccentColor: captionAccentColor(preset.settings),
      autoSubtitleStroke: preset.settings.stroke.enabled,
      autoSubtitleStrokeWidth: preset.settings.stroke.width,
      autoSubtitleBackground: preset.settings.background.enabled,
      autoSubtitlePosition: preset.settings.positionV,
      autoSubtitlePositionX: preset.settings.positionX ?? 0.5,
      autoSubtitlePositionY:
        preset.settings.positionY ??
        autoSubtitlePositionPercentFromVertical(preset.settings.positionV),
      autoSubtitleWordsPerLine: Math.max(
        1,
        Math.min(AUTO_SUBTITLE_MAX_WORD_SPLIT, preset.settings.wordsPerLine),
      ),
    });
  };

  return (
    <section className="standalone-create-panel standalone-translate-panel flex h-full w-full max-w-none flex-col overflow-hidden rounded-[20px] border border-white/[0.02] bg-[#121314]">
      <AutoSubtitlePreviewKeyframes />
      <div className="mf-function-header flex h-[58px] shrink-0 items-center gap-[10px] border-b border-white/[0.035] px-[18px]">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--brand-primary)]/10 text-[var(--brand-soft)]">
          <Captions className="h-[16px] w-[16px]" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[18px] font-semibold leading-[22px] tracking-[-0.12px] text-white">{copy.title}</h2>
          <p className="mt-[2px] truncate text-[12px] leading-[15px] text-zinc-400">{copy.subtitle}</p>
        </div>
      </div>

      <div className="ws-scroll-hide min-h-0 flex-1 overflow-y-auto px-[12px] py-[10px]">
        <div className="space-y-[10px]">
          <div className="inline-flex gap-[6px] rounded-full bg-[#16181a] p-[3px]">
            <button
              type="button"
              className="h-[30px] rounded-full bg-white px-[14px] text-[12px] font-bold leading-[14px] text-black"
            >
              {copy.tabSubtitle}
            </button>
            <button
              type="button"
              disabled
              className="h-[30px] cursor-not-allowed rounded-full bg-white/[0.05] px-[14px] text-[12px] font-semibold leading-[14px] text-zinc-500"
            >
              {copy.tabRepurpose}
            </button>
          </div>

          <div
            role={!media ? "button" : undefined}
            tabIndex={!media ? 0 : undefined}
            onClick={!media ? onUpload : undefined}
            onKeyDown={(event) => {
              if (!media && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onUpload();
              }
            }}
            onPaste={handlePaste}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={handleDrop}
            className={cn(
              "group relative flex min-h-[92px] w-full overflow-hidden rounded-[14px] border text-left transition",
              media
                ? "border-white/[0.06] bg-black/35"
                : "border-dashed border-[var(--brand-primary)]/45 bg-[var(--brand-primary)]/[0.04] hover:border-[var(--brand-primary)]/80 hover:bg-[var(--brand-primary)]/[0.07]",
            )}
          >
            {media ? (
              <>
                <video
                  src={media.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-video max-h-[150px] w-full bg-black object-contain"
                />
                <span className="absolute left-[10px] top-[10px] max-w-[70%] truncate rounded-full border border-black/30 bg-black/70 px-[10px] py-[4px] text-[11px] font-semibold leading-[14px] text-white backdrop-blur">
                  {media.name}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveVideo();
                  }}
                  className="absolute right-[8px] top-[8px] grid h-[28px] w-[28px] place-items-center rounded-full bg-black/70 text-white transition hover:bg-white/15"
                  aria-label={copy.remove}
                >
                  <X className="h-[14px] w-[14px]" />
                </button>
              </>
            ) : (
              <div className="flex w-full items-center gap-[10px] px-[12px] py-[12px]">
                <span className="grid h-[36px] w-[36px] shrink-0 place-items-center rounded-[10px] bg-[var(--brand-primary)]/10 text-[var(--brand-soft)]">
                  {uploading ? (
                    <Loader2 className="h-[16px] w-[16px] animate-spin" />
                  ) : (
                    <UploadCloud className="h-[16px] w-[16px]" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold leading-[17px] text-white">{copy.sourceVideo}</p>
                  <p className="mt-[3px] truncate text-[12px] leading-[15px] text-zinc-400">{copy.uploadHint}</p>
                  <p className="mt-[3px] text-[11px] font-semibold leading-[14px] text-[var(--brand-soft)]/80">
                    {copy.uploadLimit}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-[16px] border border-white/[0.035] bg-[#151719] p-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
            <div className="mb-[10px] flex items-center gap-[8px] text-[15px] font-bold leading-[19px] tracking-[-0.08px] text-white">
              <Sparkles className="h-[15px] w-[15px] text-[var(--brand-soft)]" />
              {copy.settingsTitle}
            </div>

            <AutoSubtitleSectionTitle label={copy.aspect} />
            <div className="grid grid-cols-4 gap-[7px]">
              <AutoSubtitleChoiceButton active label={aspectLabel} subLabel={copy.keepSource} />
              {["9:16", "1:1", "16:9"].map((ratio) => (
                <AutoSubtitleChoiceButton key={ratio} disabled label={ratio} badge={copy.locked} />
              ))}
            </div>

            <div className="mt-[12px] rounded-[12px] border border-white/[0.05] bg-black/20 p-[7px]">
              <div className="mb-[7px] grid grid-cols-4 gap-[5px] border-b border-white/[0.06] pb-[6px]">
                {([
                  ["style", copy.styleTab],
                  ["in", copy.inTab],
                  ["out", copy.outTab],
                  ["loop", copy.loopTab],
                ] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSubtitleDesignTab(tab)}
                    className={cn(
                      "h-[28px] rounded-[8px] px-[6px] text-[11px] font-bold leading-[13px] transition",
                      subtitleDesignTab === tab
                        ? "bg-white text-black"
                        : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.07] hover:text-white",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {subtitleDesignTab === "style" && (
                <>
                  <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-3">
                    {visiblePresets.map((preset) => (
                      <AutoSubtitlePresetCard
                        key={preset.id}
                        preset={preset}
                        selected={preset.id === form.autoSubtitlePresetId}
                        sampleText={copy.previewCardText}
                        onSelect={() => applyPreset(preset.id)}
                      />
                    ))}
                  </div>
                    {BUILTIN_CAPTION_PRESETS.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowMoreStyles((value) => !value)}
                      className="mt-[7px] h-[28px] w-full rounded-[8px] border border-white/10 bg-white/[0.03] text-[11px] font-semibold leading-[13px] text-zinc-300 transition hover:border-[var(--brand-primary)]/45 hover:text-white"
                    >
                      {showMoreStyles ? copy.fewerStyles : copy.moreStyles}
                    </button>
                  )}
                </>
              )}

              {subtitleDesignTab === "in" && (
                <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-3">
                  {CAPTION_TRANSITION_OPTIONS.map((option) => (
                    <AutoSubtitleMotionCard
                      key={option.id}
                      label={autoSubtitleTransitionLabel(option.id, language)}
                      description={option.description}
                      selected={form.autoSubtitleTransition === option.id}
                      settings={{
                        ...selectedSettings,
                        animation: option.id,
                        outAnimation: form.autoSubtitleOutTransition || form.autoSubtitleTransition,
                        textAnimation: "none",
                      }}
                      phrases={[copy.previewCardText, copy.previewNextText]}
                      language={language}
                      onSelect={() => onChange({ autoSubtitleTransition: option.id })}
                    />
                  ))}
                </div>
              )}

              {subtitleDesignTab === "out" && (
                <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-3">
                  {CAPTION_TRANSITION_OPTIONS.map((option) => (
                    <AutoSubtitleMotionCard
                      key={option.id}
                      label={autoSubtitleTransitionLabel(option.id, language)}
                      description={option.description}
                      selected={(form.autoSubtitleOutTransition || form.autoSubtitleTransition) === option.id}
                      settings={{
                        ...selectedSettings,
                        outAnimation: option.id,
                        textAnimation: "none",
                      }}
                      phrases={[copy.previewCardText, copy.previewNextText]}
                      language={language}
                      onSelect={() => onChange({ autoSubtitleOutTransition: option.id })}
                    />
                  ))}
                </div>
              )}

              {subtitleDesignTab === "loop" && (
                <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-3">
                  {CAPTION_TEXT_ANIMATION_OPTIONS.map((option) => (
                    <AutoSubtitleTextAnimationCard
                      key={option.id}
                      label={autoSubtitleTextAnimationLabel(option.id, t)}
                      description={option.description}
                      selected={form.autoSubtitleTextAnimation === option.id}
                      settings={{
                        ...selectedSettings,
                        textAnimation: option.id,
                      }}
                      animation={option.id}
                      onSelect={() => onChange({ autoSubtitleTextAnimation: option.id })}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-[10px] space-y-[10px]">
                <div className="flex items-center gap-[7px] px-1 text-[12px] font-bold leading-[15px] text-zinc-300">
                  <SlidersHorizontal className="h-[14px] w-[14px]" />
                  {copy.advanced}
                </div>
                <div className="grid grid-cols-1 gap-[7px] sm:grid-cols-2">
                  <VoiceTranslateSelectCard
                    label={copy.speech}
                    value={form.autoSubtitleLanguage}
                    displayValue={speechLabel}
                    icon={<Languages className="h-4 w-4" />}
                    options={CAPTIONS_LANGUAGES.map((item) => ({ value: item.code, label: captionLanguageLabel(item.code, t) }))}
                    onChange={(value) => onChange({ autoSubtitleLanguage: value })}
                  />
                  <VoiceTranslateSelectCard
                    label={copy.style}
                    value={form.autoSubtitlePresetId}
                    displayValue={selectedPreset?.name ?? form.autoSubtitlePresetId}
                    icon={<Captions className="h-4 w-4" />}
                    options={BUILTIN_CAPTION_PRESETS.map((preset) => ({ value: preset.id, label: preset.name }))}
                    onChange={applyPreset}
                  />
                  <VoiceTranslateSelectCard
                    label={copy.algorithm}
                    value={form.autoSubtitleSegmentationMode}
                    displayValue={segmentationLabel}
                    icon={<SlidersHorizontal className="h-[14px] w-[14px]" />}
                    options={[
                      { value: "sentence", label: copy.sentenceMode },
                      { value: "words", label: copy.wordMode },
                    ]}
                    onChange={(value) =>
                      onChange({
                        autoSubtitleSegmentationMode: value as AutoSubtitleSegmentationMode,
                      })
                    }
                  />
                  <VoiceTranslateSelectCard
                    label={copy.inAnimation}
                    value={form.autoSubtitleTransition}
                    displayValue={transitionLabel}
                    icon={<Sparkles className="h-[14px] w-[14px]" />}
                    options={transitionOptions}
                    onChange={(value) =>
                      onChange({ autoSubtitleTransition: value as CaptionAnimation })
                    }
                  />
                  <VoiceTranslateSelectCard
                    label={copy.outAnimation}
                    value={form.autoSubtitleOutTransition || form.autoSubtitleTransition}
                    displayValue={outTransitionLabel}
                    icon={<Sparkles className="h-[14px] w-[14px]" />}
                    options={transitionOptions}
                    onChange={(value) =>
                      onChange({ autoSubtitleOutTransition: value as CaptionAnimation })
                    }
                  />
                  <VoiceTranslateSelectCard
                    label={copy.loopAnimation}
                    value={form.autoSubtitleTextAnimation}
                    displayValue={textAnimationLabel}
                    icon={<Sparkles className="h-[14px] w-[14px]" />}
                    options={textAnimationOptions}
                    onChange={(value) =>
                      onChange({ autoSubtitleTextAnimation: value as CaptionTextAnimation })
                    }
                  />
                  <VoiceTranslateSelectCard
                    label={copy.font}
                    value={form.autoSubtitleFont}
                    displayValue={form.autoSubtitleFont}
                    icon={<BookOpen className="h-4 w-4" />}
                    options={AUTO_SUBTITLE_FONT_OPTIONS.map((font) => ({ value: font, label: font }))}
                    onChange={(value) => onChange({ autoSubtitleFont: value })}
                  />
                  <div className="flex min-h-[52px] items-center gap-[8px] rounded-[10px] border border-white/[0.04] bg-white/[0.035] px-[9px] py-[7px]">
                    <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-white/[0.055] text-zinc-400">
                      <SlidersHorizontal className="h-[14px] w-[14px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[10px] font-semibold leading-[12px] text-zinc-500">
                        {copy.position}
                      </div>
                      <div className="mt-[2px] truncate text-[12px] font-bold leading-[15px] text-white">
                        X {Math.round(clampAutoSubtitlePosition(form.autoSubtitlePositionX, 0.5) * 100)}% / Y{" "}
                        {Math.round(
                          clampAutoSubtitlePosition(
                            form.autoSubtitlePositionY,
                            autoSubtitlePositionPercentFromVertical(form.autoSubtitlePosition),
                          ) * 100,
                        )}
                        %
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          autoSubtitlePosition: "bottom",
                          autoSubtitlePositionX: 0.5,
                          autoSubtitlePositionY: 0.84,
                        })
                      }
                      className="h-[28px] shrink-0 rounded-[8px] border border-white/10 px-[8px] text-[10px] font-bold text-zinc-300 transition hover:border-[var(--brand-primary)]/45 hover:text-white"
                    >
                      Reset
                    </button>
                  </div>
                  <VoiceTranslateSelectCard
                    label={copy.size}
                    value={String(form.autoSubtitleSize)}
                    displayValue={`${form.autoSubtitleSize}px`}
                    icon={<SlidersHorizontal className="h-[14px] w-[14px]" />}
                    options={[36, 44, 56, 68, 80, 92].map((size) => ({
                      value: String(size),
                      label: `${size}px`,
                    }))}
                    onChange={(value) => onChange({ autoSubtitleSize: Number(value) || 56 })}
                  />
                  {form.autoSubtitleSegmentationMode === "words" && (
                    <VoiceTranslateSelectCard
                      label={copy.words}
                      value={String(form.autoSubtitleWordsPerLine)}
                      displayValue={wordSplitLabel}
                      icon={<SlidersHorizontal className="h-[14px] w-[14px]" />}
                      options={AUTO_SUBTITLE_WORD_SPLIT_OPTIONS.map((count) => ({
                        value: String(count),
                        label: th ? `${count} คำ` : `${count} words`,
                      }))}
                      onChange={(value) => onChange({ autoSubtitleWordsPerLine: Number(value) || 4 })}
                    />
                  )}
                  <AutoSubtitleColorPicker
                    label={copy.textColor}
                    value={form.autoSubtitleFill}
                    onChange={(value) => onChange({ autoSubtitleFill: value })}
                    className="sm:col-span-2"
                  />
                  {autoSubtitleUsesAccentColor(selectedSettings) && (
                    <AutoSubtitleColorPicker
                      label={copy.accentColor}
                      value={form.autoSubtitleAccentColor}
                      onChange={(value) => onChange({ autoSubtitleAccentColor: value })}
                      className="sm:col-span-2"
                    />
                  )}
                  <AutoSubtitleToggle
                    label={copy.stroke}
                    checked={form.autoSubtitleStroke}
                    onChange={(checked) => onChange({ autoSubtitleStroke: checked })}
                  />
                  <AutoSubtitleToggle
                    label={copy.background}
                    checked={form.autoSubtitleBackground}
                    onChange={(checked) => onChange({ autoSubtitleBackground: checked })}
                  />
                </div>

                <div>
                  <AutoSubtitleSectionTitle label={copy.translation} />
                  <div className="grid grid-cols-3 gap-[7px]">
                    <AutoSubtitleChoiceButton active label={copy.noTranslation} />
                    <AutoSubtitleChoiceButton disabled label={copy.translateThai} badge={copy.locked} />
                    <AutoSubtitleChoiceButton disabled label={copy.bilingual} badge={copy.locked} />
                  </div>
                </div>

                <div>
                  <AutoSubtitleSectionTitle label={copy.algorithm} />
                  <div className="grid grid-cols-2 gap-[7px]">
                    <AutoSubtitleChoiceButton
                      active={form.autoSubtitleSegmentationMode === "sentence"}
                      label={copy.sentenceMode}
                      subLabel={copy.sentenceModeHint}
                      onClick={() => onChange({ autoSubtitleSegmentationMode: "sentence" })}
                    />
                    <AutoSubtitleChoiceButton
                      active={form.autoSubtitleSegmentationMode === "words"}
                      label={copy.wordMode}
                      subLabel={copy.wordModeHint}
                      onClick={() => onChange({ autoSubtitleSegmentationMode: "words" })}
                    />
                  </div>
                </div>

                {form.autoSubtitleSegmentationMode === "words" && (
                  <div>
                    <AutoSubtitleSectionTitle label={copy.words} />
                    <div className="grid grid-cols-6 gap-[7px]">
                      {AUTO_SUBTITLE_WORD_SPLIT_OPTIONS.map((count) => (
                        <AutoSubtitleChoiceButton
                          key={count}
                          active={form.autoSubtitleWordsPerLine === count}
                          label={th ? `${count} คำ` : String(count)}
                          onClick={() => onChange({ autoSubtitleWordsPerLine: count })}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="overflow-hidden rounded-[12px] border border-white/[0.06] bg-black">
                  <div className="relative h-[84px]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(255,255,255,.10),transparent_32%),linear-gradient(180deg,rgba(244,255,0,.08),rgba(0,0,0,0))]" />
                    <div
                      className={cn(
                        "absolute left-2.5 right-2.5 flex justify-center",
                        form.autoSubtitlePosition === "top" && "top-2.5",
                        form.autoSubtitlePosition === "middle" && "top-1/2 -translate-y-1/2",
                        form.autoSubtitlePosition === "bottom" && "bottom-2.5",
                      )}
                    >
                      <AutoSubtitleAnimatedPreview
                        settings={selectedSettings}
                        phrases={previewSamplePhrases}
                        language={th ? "th" : "en"}
                      />
                    </div>
                  </div>
                </div>
              </div>
          </div>

          <p className="rounded-[10px] border border-[var(--border-faint)] bg-black/20 px-2.5 py-2 text-[13px] font-medium leading-[18px] text-zinc-300">
            {copy.ready}
          </p>

          {progress && (
            <div className="rounded-[10px] border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/[0.045] px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-[12px] font-semibold text-[var(--brand-soft)]">
                <span>{progress.message}</span>
                <span>{Math.round(progress.progress)}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[var(--brand-soft)] transition-all"
                  style={{ width: `${Math.max(4, Math.min(100, progress.progress))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/[0.05] bg-[#121314] px-[12px] py-[8px]">
        <div className="grid grid-cols-2 gap-[8px]">
          <div className="flex h-[38px] items-center gap-2 rounded-[10px] border border-white/[0.06] bg-[#17191b] px-2.5 text-[13px] font-semibold text-zinc-300">
            <Film className="h-3.5 w-3.5 text-zinc-400" />
            <span className="truncate">{media ? "MP4" : t("workspace.standalone.panel.media")}</span>
          </div>
          <button
            type="button"
            onClick={onCreate}
            disabled={running || uploading || !media}
            className="btn-cta flex !h-[38px] w-full items-center justify-center gap-2 text-[13px] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300 disabled:shadow-none disabled:opacity-70"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GenerateIcon className="h-3.5 w-3.5" />
            )}
            {running ? copy.processing : copy.action}
          </button>
        </div>
      </div>
      <ToolTabs activeTool="auto_subtitle" onToolChange={onToolChange} className="hidden shrink-0 lg:flex" />
    </section>
  );
}

function AutoSubtitleSectionTitle({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-[6px] text-[13px] font-bold leading-[16px] text-zinc-200", className)}>
      {label}
    </div>
  );
}

function AutoSubtitleChoiceButton({
  label,
  subLabel,
  active,
  disabled,
  badge,
  onClick,
}: {
  label: string;
  subLabel?: string;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={Boolean(active)}
      onClick={onClick}
      className={cn(
        "relative min-h-[33px] rounded-[8px] border px-[8px] py-[5px] text-center transition",
        active
          ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/[0.08] text-white shadow-[0_0_16px_rgba(244,255,0,.16)]"
          : "border-white/[0.07] bg-white/[0.035] text-zinc-300 hover:border-[var(--brand-primary)]/45 hover:text-white",
        disabled && "cursor-not-allowed opacity-45 hover:border-white/[0.07] hover:text-zinc-300",
      )}
    >
      <span className="block truncate text-[13px] font-bold leading-[15px]">{label}</span>
      {subLabel && <span className="mt-[2px] block truncate text-[11px] font-semibold leading-[13px] opacity-60">{subLabel}</span>}
      {badge && (
        <span className="mt-[2px] block truncate text-[10px] font-semibold uppercase leading-[12px] tracking-wide opacity-60">
          {badge}
        </span>
      )}
    </button>
  );
}

function AutoSubtitlePresetCard({
  preset,
  selected,
  sampleText,
  onSelect,
}: {
  preset: (typeof BUILTIN_CAPTION_PRESETS)[number];
  selected: boolean;
  sampleText: string;
  onSelect: () => void;
}) {
  const previewText = autoSubtitlePreviewCardText(sampleText);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group overflow-hidden rounded-[8px] border bg-white/[0.035] p-[4px] text-left transition",
        selected
          ? "border-[var(--brand-primary)] shadow-[0_0_0_1px_rgba(244,255,0,.22)]"
          : "border-white/[0.07] hover:border-[var(--brand-primary)]/45",
      )}
    >
      <div className="relative grid h-[66px] place-items-center overflow-hidden rounded-[7px] bg-[#1f2937] px-[10px] pt-[16px]">
        <AutoSubtitleTextPreviewBadge />
        <AutoSubtitlePreviewText settings={preset.settings} text={previewText} compact activeWord />
      </div>
      <div className="mt-[5px] flex min-w-0 items-center justify-between gap-1">
        <span className="block min-h-[22px] min-w-0 overflow-hidden text-[10px] font-semibold leading-[11px] text-zinc-200" title={preset.name}>
          {preset.name}
        </span>
        {selected && <Check className="h-[13px] w-[13px] shrink-0 text-[var(--brand-soft)]" />}
      </div>
    </button>
  );
}

function AutoSubtitleMotionCard({
  label,
  description,
  selected,
  settings,
  phrases,
  language,
  onSelect,
}: {
  label: string;
  description: string;
  selected: boolean;
  settings: CaptionStyleSettings;
  phrases: readonly string[];
  language: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={description}
      className={cn(
        "group overflow-hidden rounded-[8px] border bg-white/[0.035] p-[4px] text-left transition",
        selected
          ? "border-[var(--brand-primary)] shadow-[0_0_0_1px_rgba(244,255,0,.22)]"
          : "border-white/[0.07] hover:border-[var(--brand-primary)]/45",
      )}
    >
      <div className="relative grid h-[66px] place-items-center overflow-hidden rounded-[7px] bg-[#1f2937] px-[10px] pt-[16px]">
        <AutoSubtitleTextPreviewBadge />
        <AutoSubtitleAnimatedPreview
          settings={settings}
          phrases={phrases}
          language={language}
          compact
        />
      </div>
      <div className="mt-[5px] flex min-w-0 items-center justify-between gap-1">
        <span className="block min-h-[22px] min-w-0 overflow-hidden text-[10px] font-semibold leading-[11px] text-zinc-200" title={label}>
          {label}
        </span>
        {selected && <Check className="h-[13px] w-[13px] shrink-0 text-[var(--brand-soft)]" />}
      </div>
    </button>
  );
}

function AutoSubtitleTextAnimationCard({
  label,
  description,
  selected,
  settings,
  animation,
  onSelect,
}: {
  label: string;
  description: string;
  selected: boolean;
  settings: CaptionStyleSettings;
  animation: CaptionTextAnimation;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={description}
      className={cn(
        "group overflow-hidden rounded-[8px] border bg-white/[0.035] p-[4px] text-left transition",
        selected
          ? "border-[var(--brand-primary)] shadow-[0_0_0_1px_rgba(244,255,0,.22)]"
          : "border-white/[0.07] hover:border-[var(--brand-primary)]/45",
      )}
    >
      <div className="relative grid h-[66px] place-items-center overflow-hidden rounded-[7px] bg-[#232b36] px-[10px] pt-[16px]">
        <AutoSubtitleTextPreviewBadge />
        <AutoSubtitleCapcutAnimationPreview settings={settings} animation={animation} />
      </div>
      <div className="mt-[5px] flex min-w-0 items-center justify-between gap-1">
        <span className="block min-h-[22px] min-w-0 overflow-hidden text-[10px] font-semibold leading-[11px] text-zinc-200" title={label}>
          {label}
        </span>
        {selected && <Check className="h-[13px] w-[13px] shrink-0 text-[var(--brand-soft)]" />}
      </div>
    </button>
  );
}

function AutoSubtitleTextPreviewBadge() {
  return (
    <span className="pointer-events-none absolute right-[6px] top-[5px] z-[2] rounded-full bg-black/55 px-[5px] py-[2px] text-[10.5px] font-bold uppercase leading-none tracking-[.06em] text-white/75">
      Text preview
    </span>
  );
}

function autoSubtitlePreviewCardText(sampleText: string): string {
  const clean = sampleText.trim();
  if (clean.split(/\s+/).filter(Boolean).length >= 3) return clean;
  return "Text preview sample";
}

function AutoSubtitleCapcutAnimationPreview({
  settings,
  animation,
}: {
  settings: CaptionStyleSettings;
  animation: CaptionTextAnimation;
}) {
  const sample = autoSubtitleAnimationCardText(animation);
  const renderChars =
    animation === "typing-cursor" ||
    animation === "text-sprout" ||
    animation === "sequence-reveal" ||
    animation === "quirky-spelling";
  const showParticles =
    animation === "spatter-stroke" ||
    animation === "pop-snow" ||
    animation === "bubble-sprite" ||
    animation === "blaze-shot" ||
    animation === "love-emphasis";
  const textStyle: React.CSSProperties = {
    fontFamily: `"${settings.font}", Inter, sans-serif`,
    fontWeight: settings.weight,
    color: settings.fill,
    WebkitTextStroke: settings.stroke.enabled
      ? `${Math.min(1.1, Math.max(0.45, settings.stroke.width / 7))}px ${settings.stroke.color}`
      : undefined,
    paintOrder: "stroke fill",
    textShadow: settings.shadow.enabled
      ? `${settings.shadow.offsetX}px ${settings.shadow.offsetY}px ${Math.max(2, settings.shadow.blur)}px ${settings.shadow.color}`
      : "0 1px 8px rgba(0,0,0,.55)",
    backgroundColor: settings.background.enabled ? settings.background.color : undefined,
    borderRadius: settings.background.enabled ? Math.max(4, settings.background.cornerRadius / 2) : undefined,
    padding: settings.background.enabled ? "2px 5px" : undefined,
  };

  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden">
      {animation === "in-scanner" && (
        <span className="autoSubtitleCapcutScanner absolute inset-y-0 w-[18px] rounded-full bg-white/35 blur-[2px]" />
      )}
      {animation === "hope-horizon" && (
        <span className="autoSubtitleCapcutHorizon absolute h-[4px] w-[76%] rounded-full bg-cyan-200/70 blur-[5px]" />
      )}
      {animation === "big-echoes" && (
        <>
          <span className="autoSubtitleCapcutEcho autoSubtitleCapcutEchoA absolute max-w-[92%] text-center text-[9px] font-black leading-[10px] tracking-[.01em] text-white/18">
            {sample}
          </span>
          <span className="autoSubtitleCapcutEcho autoSubtitleCapcutEchoB absolute max-w-[92%] text-center text-[9px] font-black leading-[10px] tracking-[.01em] text-white/12">
            {sample}
          </span>
        </>
      )}
      {animation === "blaze-shot" && (
        <span className="autoSubtitleCapcutBlaze absolute h-[44px] w-[8px] rotate-45 bg-yellow-200/70 blur-[3px]" />
      )}
      {showParticles && (
        <span className="pointer-events-none absolute inset-0">
          {Array.from({ length: 5 }).map((_, index) => (
            <span
              key={`particle-${index}`}
              className={cn(
                "autoSubtitleCapcutParticle absolute h-[3px] w-[3px] rounded-full",
                animation === "love-emphasis"
                  ? "bg-pink-300"
                  : animation === "bubble-sprite"
                    ? "border border-cyan-200/80 bg-transparent"
                    : "bg-[var(--brand-soft)]",
              )}
              style={{
                left: `${18 + index * 15}%`,
                top: `${22 + (index % 2) * 34}%`,
                animationDelay: `${index * 110}ms`,
              }}
            />
          ))}
        </span>
      )}
      <span
        className={cn(
          "autoSubtitleCapcutText relative z-[1] max-w-[94%] text-center text-[11px] font-black leading-[13px] tracking-[.01em]",
          `autoSubtitleCapcut-${animation}`,
        )}
        style={{ ...textStyle, whiteSpace: "normal" }}
      >
        {renderChars
          ? Array.from(sample).map((char, index) => (
              <span
                key={`${char}-${index}`}
                className="autoSubtitleCapcutChar inline-block"
                style={{ animationDelay: `${index * 58}ms` }}
              >
                {char}
              </span>
            ))
          : sample}
        {animation === "typing-cursor" && (
          <span className="autoSubtitleCapcutCursor ml-[2px] inline-block h-[11px] w-[1px] translate-y-[2px] bg-current" />
        )}
      </span>
    </div>
  );
}

function autoSubtitleAnimationCardText(animation: CaptionTextAnimation): string {
  switch (animation) {
    case "typing-cursor":
    case "in-scanner":
    case "text-sprout":
    case "sequence-reveal":
      return "Text preview sample";
    case "big-echoes":
    case "loud-emphasis":
    case "quirky-spelling":
      return "Text preview sample";
    case "none":
      return "Text preview sample";
    default:
      return "Text preview sample";
  }
}

function normalizeHexColor(value: string, fallback = "#FFFFFF"): string {
  const clean = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return `#${clean.split("").map((char) => char + char).join("")}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `#${clean}`.toUpperCase();
  }
  return fallback;
}

function hexToRgb(value: string): { r: number; g: number; b: number } {
  const hex = normalizeHexColor(value).slice(1);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function hexToHsv(value: string): { h: number; s: number; v: number } {
  const { r, g, b } = hexToRgb(value);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  return {
    h: Math.round(h),
    s: max === 0 ? 0 : Math.round((delta / max) * 100),
    v: Math.round(max * 100),
  };
}

function hsvToHex(h: number, s: number, v: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const val = Math.max(0, Math.min(100, v)) / 100;
  const chroma = val * sat;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - chroma;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) [r, g, b] = [chroma, x, 0];
  else if (hue < 120) [r, g, b] = [x, chroma, 0];
  else if (hue < 180) [r, g, b] = [0, chroma, x];
  else if (hue < 240) [r, g, b] = [0, x, chroma];
  else if (hue < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function AutoSubtitleColorPicker({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const safeValue = normalizeHexColor(value);
  const hsv = useMemo(() => hexToHsv(safeValue), [safeValue]);
  const hueColor = hsvToHex(hsv.h, 100, 100);

  useEffect(() => {
    if (!open) return;
    const handleDown = (event: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const pickFromPlane = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const s = (x / rect.width) * 100;
    const v = 100 - (y / rect.height) * 100;
    onChange(hsvToHex(hsv.h, s, v));
  };

  const pickHue = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    onChange(hsvToHex((x / rect.width) * 360, hsv.s, hsv.v));
  };

  return (
    <div ref={ref} className={cn("standalone-setting-card relative rounded-[10px] border border-white/[0.06] bg-[#16181a] px-[9px] py-[7px]", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-[34px] w-full items-center justify-between gap-3 rounded-[8px] px-[2px] text-left transition hover:bg-white/[0.035]"
        aria-expanded={open}
        aria-label={`${label} picker`}
      >
        <span className="text-[12px] font-bold leading-[15px] text-zinc-200">{label}</span>
        <span className="flex h-[26px] min-w-[98px] items-center justify-between rounded-[6px] border border-white/[0.12] bg-white/[0.06] px-[4px] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
          <span className="h-[18px] flex-1 rounded-[3px] border border-white/30" style={{ backgroundColor: safeValue }} />
          <ChevronDown className={cn("ml-[6px] h-3.5 w-3.5 text-zinc-300 transition", open && "rotate-180")} />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-[80] w-full max-w-[360px] rounded-[12px] border border-white/[0.10] bg-[#202123] p-[10px] shadow-[0_22px_52px_-18px_rgba(0,0,0,.85),0_0_0_1px_rgba(255,255,255,.03)]">
          <button
            type="button"
            onMouseDown={pickFromPlane}
            onClick={pickFromPlane}
            className="relative h-[132px] w-full overflow-hidden rounded-[8px] border border-white/[0.08]"
            style={{
              background:
                `linear-gradient(to top, #000 0%, transparent 100%), linear-gradient(to right, #fff 0%, ${hueColor} 100%)`,
            }}
            aria-label={`${label} color plane`}
          >
            <span
              className="pointer-events-none absolute h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_5px_rgba(0,0,0,.75)]"
              style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
            />
          </button>

          <div className="mt-[8px] flex items-center gap-2">
            <button
              type="button"
              onMouseDown={pickHue}
              onClick={pickHue}
              className="relative h-[15px] flex-1 rounded-full border border-white/[0.08]"
              style={{
                background:
                  "linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)",
              }}
              aria-label={`${label} hue`}
            >
              <span
                className="pointer-events-none absolute top-1/2 h-[19px] w-[8px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/35 shadow-[0_1px_5px_rgba(0,0,0,.7)]"
                style={{ left: `${(hsv.h / 360) * 100}%` }}
              />
            </button>
            <input
              value={safeValue.replace("#", "")}
              onChange={(event) => onChange(normalizeHexColor(event.target.value, safeValue))}
              className="h-[26px] w-[96px] rounded-[6px] border border-white/[0.08] bg-black/25 px-2 text-[11px] font-semibold uppercase text-zinc-100 outline-none focus:border-[var(--brand-primary)]/55"
              aria-label={`${label} hex`}
            />
          </div>

          <div className="mt-[9px] rounded-[9px] border border-white/[0.06] bg-black/20 p-[7px]">
            <div className="mb-[6px] flex items-center justify-between text-[11px] font-bold text-zinc-300">
              <span>My colors</span>
              <ChevronDown className="h-3 w-3" />
            </div>
            <div className="grid grid-cols-10 gap-[5px]">
              <button
                type="button"
                onClick={() => onChange("#FFFFFF")}
                className="grid h-[18px] w-[18px] place-items-center rounded-[4px] border border-white/15 bg-white/[0.05] text-[12px] text-zinc-300 hover:border-white/45"
                aria-label="Add color"
              >
                <Plus className="h-3 w-3" />
              </button>
              {AUTO_SUBTITLE_COLOR_SWATCHES.map((color, index) => (
            <button
              key={`${color}-${index}`}
              type="button"
              onClick={() => onChange(color)}
              className={cn(
                "h-[18px] w-[18px] rounded-[4px] border transition",
                safeValue === color
                  ? "border-black ring-2 ring-[var(--brand-primary)]/85"
                  : "border-white/10 hover:border-white/60",
              )}
              style={{ backgroundColor: color }}
              aria-label={`${label} ${color}`}
            />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AutoSubtitlePreviewKeyframes() {
  return (
    <style>
      {`
        @keyframes autoSubtitlePreviewFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes autoSubtitlePreviewFadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes autoSubtitlePreviewSlideUpIn {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes autoSubtitlePreviewSlideUpOut {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-8px); }
        }
        @keyframes autoSubtitlePreviewSlideDownIn {
          0% { opacity: 0; transform: translateY(-10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes autoSubtitlePreviewSlideDownOut {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(8px); }
        }
        @keyframes autoSubtitlePreviewScaleIn {
          0% { opacity: 0; transform: scale(.92); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes autoSubtitlePreviewScaleOut {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(.95); }
        }
        @keyframes autoSubtitlePreviewPopIn {
          0% { opacity: 0; transform: scale(.82); }
          70% { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes autoSubtitlePreviewPopOut {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(.9); }
        }
        @keyframes autoSubtitleCapcutTyping {
          0% { clip-path: inset(0 100% 0 0); opacity: .3; }
          72% { clip-path: inset(0 0 0 0); opacity: 1; }
          100% { clip-path: inset(0 0 0 0); opacity: 1; }
        }
        @keyframes autoSubtitleCapcutCursorBlink {
          0%, 42% { opacity: 1; }
          43%, 100% { opacity: 0; }
        }
        @keyframes autoSubtitleCapcutBounceLeft {
          0% { opacity: 0; transform: translateX(-18px) scale(.86); }
          58% { opacity: 1; transform: translateX(4px) scale(1.06); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes autoSubtitleCapcutScanner {
          0% { left: -24px; opacity: 0; }
          20% { opacity: 1; }
          100% { left: calc(100% + 24px); opacity: 0; }
        }
        @keyframes autoSubtitleCapcutScanText {
          0% { opacity: .2; filter: blur(1.4px) brightness(1.7); }
          45% { opacity: 1; filter: blur(0) brightness(1.25); }
          100% { opacity: 1; filter: blur(0) brightness(1); }
        }
        @keyframes autoSubtitleCapcutSprout {
          0% { opacity: 0; transform: translateY(9px) scaleY(.35); }
          64% { opacity: 1; transform: translateY(-2px) scaleY(1.12); }
          100% { opacity: 1; transform: translateY(0) scaleY(1); }
        }
        @keyframes autoSubtitleCapcutLeap {
          0% { opacity: 0; transform: translateY(15px) scale(.82); }
          56% { opacity: 1; transform: translateY(-5px) scale(1.05); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes autoSubtitleCapcutRebound {
          0% { opacity: 0; transform: scaleX(1.45) scaleY(.55); }
          52% { opacity: 1; transform: scaleX(.86) scaleY(1.16); }
          100% { opacity: 1; transform: scaleX(1) scaleY(1); }
        }
        @keyframes autoSubtitleCapcutLoud {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          35% { transform: scale(1.14); filter: brightness(1.35); }
          62% { transform: scale(.98); }
        }
        @keyframes autoSubtitleCapcutSpatter {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          20% { transform: translate(-2px, 1px) rotate(-2deg); }
          42% { transform: translate(2px, -1px) rotate(2deg); }
          66% { transform: translate(-1px, -1px) rotate(-1deg); }
        }
        @keyframes autoSubtitleCapcutOde {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          30% { transform: translateY(-4px) rotate(-2deg); }
          68% { transform: translateY(2px) rotate(2deg); }
        }
        @keyframes autoSubtitleCapcutParticle {
          0% { opacity: 0; transform: translateY(5px) scale(.5); }
          40% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-12px) scale(1.15); }
        }
        @keyframes autoSubtitleCapcutPopSnow {
          0% { opacity: 0; transform: scale(.72); }
          52% { opacity: 1; transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes autoSubtitleCapcutHorizon {
          0% { opacity: 0; transform: translateX(-36%) scaleX(.2); }
          42% { opacity: 1; transform: translateX(0) scaleX(1); }
          100% { opacity: .3; transform: translateX(28%) scaleX(.4); }
        }
        @keyframes autoSubtitleCapcutHope {
          0% { opacity: 0; filter: blur(2px) drop-shadow(0 0 0 rgba(125, 236, 255, 0)); }
          48% { opacity: 1; filter: blur(0) drop-shadow(0 0 8px rgba(125, 236, 255, .85)); }
          100% { opacity: 1; filter: blur(0) drop-shadow(0 0 2px rgba(125, 236, 255, .35)); }
        }
        @keyframes autoSubtitleCapcutEcho {
          0% { opacity: .75; transform: translate(0, 0) scale(1.02); }
          100% { opacity: 0; transform: translate(7px, 5px) scale(1.22); }
        }
        @keyframes autoSubtitleCapcutTension {
          0% { transform: scaleX(1.38) scaleY(.72); }
          48% { transform: scaleX(.88) scaleY(1.16); }
          100% { transform: scaleX(1) scaleY(1); }
        }
        @keyframes autoSubtitleCapcutSequence {
          0% { opacity: 0; transform: translateY(6px) scale(.88); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes autoSubtitleCapcutBubble {
          0%, 100% { transform: translateY(1px) scale(1); }
          50% { transform: translateY(-4px) scale(1.03); }
        }
        @keyframes autoSubtitleCapcutBlaze {
          0% { left: -18px; opacity: 0; }
          20% { opacity: 1; }
          100% { left: calc(100% + 18px); opacity: 0; }
        }
        @keyframes autoSubtitleCapcutBlazeText {
          0% { opacity: 0; transform: translateX(-10px); filter: brightness(1); }
          45% { opacity: 1; transform: translateX(2px); filter: brightness(1.55); }
          100% { opacity: 1; transform: translateX(0); filter: brightness(1); }
        }
        @keyframes autoSubtitleCapcutLove {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 2px rgba(255, 118, 188, .25)); }
          42% { transform: scale(1.08); filter: drop-shadow(0 0 9px rgba(255, 118, 188, .7)); }
        }
        @keyframes autoSubtitleCapcutWavyRoll {
          0% { opacity: 0; transform: translateY(8px) rotate(-7deg); }
          52% { opacity: 1; transform: translateY(-2px) rotate(4deg); }
          100% { opacity: 1; transform: translateY(0) rotate(0deg); }
        }
        @keyframes autoSubtitleCapcutQuirky {
          0% { opacity: 0; transform: translateY(-5px) rotate(-5deg) scale(.9); }
          70% { opacity: 1; transform: translateY(1px) rotate(3deg) scale(1.06); }
          100% { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
        }
        .autoSubtitleCapcut-none { animation: none; }
        .autoSubtitleCapcut-typing-cursor { display: inline-flex; overflow: hidden; animation: 1100ms autoSubtitleCapcutTyping steps(4, end) infinite; }
        .autoSubtitleCapcutCursor { animation: 560ms autoSubtitleCapcutCursorBlink steps(1, end) infinite; }
        .autoSubtitleCapcut-bounce-left { animation: 920ms autoSubtitleCapcutBounceLeft cubic-bezier(.2,1.45,.28,1) infinite; }
        .autoSubtitleCapcutScanner { animation: 1050ms autoSubtitleCapcutScanner ease-in-out infinite; }
        .autoSubtitleCapcut-in-scanner { animation: 1050ms autoSubtitleCapcutScanText ease-in-out infinite; }
        .autoSubtitleCapcut-text-sprout .autoSubtitleCapcutChar { transform-origin: bottom center; animation: 780ms autoSubtitleCapcutSprout cubic-bezier(.18,1.25,.3,1) infinite; }
        .autoSubtitleCapcut-leap-in { animation: 900ms autoSubtitleCapcutLeap cubic-bezier(.2,1.3,.3,1) infinite; }
        .autoSubtitleCapcut-rebound-in { animation: 950ms autoSubtitleCapcutRebound cubic-bezier(.2,1.18,.3,1) infinite; }
        .autoSubtitleCapcut-loud-emphasis { animation: 820ms autoSubtitleCapcutLoud ease-in-out infinite; }
        .autoSubtitleCapcut-spatter-stroke { animation: 680ms autoSubtitleCapcutSpatter steps(2, end) infinite; }
        .autoSubtitleCapcut-ode-to-joy { animation: 1050ms autoSubtitleCapcutOde ease-in-out infinite; }
        .autoSubtitleCapcutParticle { animation: 900ms autoSubtitleCapcutParticle ease-out infinite; }
        .autoSubtitleCapcut-pop-snow { animation: 900ms autoSubtitleCapcutPopSnow cubic-bezier(.2,1.25,.32,1) infinite; }
        .autoSubtitleCapcutHorizon { animation: 1150ms autoSubtitleCapcutHorizon ease-in-out infinite; }
        .autoSubtitleCapcut-hope-horizon { animation: 1150ms autoSubtitleCapcutHope ease-in-out infinite; }
        .autoSubtitleCapcutEcho { animation: 980ms autoSubtitleCapcutEcho ease-out infinite; }
        .autoSubtitleCapcutEchoA { transform: translate(3px, 2px); }
        .autoSubtitleCapcutEchoB { transform: translate(6px, 5px); animation-delay: 120ms; }
        .autoSubtitleCapcut-big-echoes { animation: 980ms autoSubtitleCapcutLoud ease-out infinite; }
        .autoSubtitleCapcut-tension-release { transform-origin: center; animation: 900ms autoSubtitleCapcutTension cubic-bezier(.18,1.2,.25,1) infinite; }
        .autoSubtitleCapcut-sequence-reveal .autoSubtitleCapcutChar { opacity: 0; animation: 760ms autoSubtitleCapcutSequence ease-out infinite; }
        .autoSubtitleCapcut-bubble-sprite { animation: 1200ms autoSubtitleCapcutBubble ease-in-out infinite; }
        .autoSubtitleCapcutBlaze { animation: 900ms autoSubtitleCapcutBlaze ease-in-out infinite; }
        .autoSubtitleCapcut-blaze-shot { animation: 900ms autoSubtitleCapcutBlazeText ease-out infinite; }
        .autoSubtitleCapcut-love-emphasis { animation: 980ms autoSubtitleCapcutLove ease-in-out infinite; }
        .autoSubtitleCapcut-wavy-roll { animation: 980ms autoSubtitleCapcutWavyRoll ease-in-out infinite; }
        .autoSubtitleCapcut-quirky-spelling .autoSubtitleCapcutChar { animation: 760ms autoSubtitleCapcutQuirky cubic-bezier(.2,1.25,.32,1) infinite; }
      `}
    </style>
  );
}

function AutoSubtitleAnimatedPreview({
  settings,
  phrases,
  language,
  compact,
}: {
  settings: CaptionStyleSettings;
  phrases: readonly string[];
  language?: string | null;
  compact?: boolean;
}) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [leavingPhrase, setLeavingPhrase] = useState<{
    key: number;
    text: string;
  } | null>(null);
  const leavingTimerRef = useRef<number | null>(null);
  const safePhrases = phrases.length > 0 ? phrases : AUTO_SUBTITLE_PREVIEW_WORDS_EN;

  useEffect(() => {
    setPhraseIndex(0);
    setLeavingPhrase(null);
    if (leavingTimerRef.current) {
      window.clearTimeout(leavingTimerRef.current);
      leavingTimerRef.current = null;
    }
    if (safePhrases.length <= 1) return;
    const timer = window.setInterval(() => {
      setPhraseIndex((index) => {
        const currentText = safePhrases[index % safePhrases.length] ?? "";
        setLeavingPhrase({ key: Date.now(), text: currentText });
        if (leavingTimerRef.current) {
          window.clearTimeout(leavingTimerRef.current);
        }
        leavingTimerRef.current = window.setTimeout(() => {
          setLeavingPhrase(null);
          leavingTimerRef.current = null;
        }, autoSubtitlePreviewTransitionMs(settings.outAnimation ?? settings.animation) + 40);
        return (index + 1) % safePhrases.length;
      });
    }, 1350);
    return () => {
      window.clearInterval(timer);
      if (leavingTimerRef.current) {
        window.clearTimeout(leavingTimerRef.current);
        leavingTimerRef.current = null;
      }
    };
  }, [safePhrases, settings.animation, settings.outAnimation]);

  const text = safePhrases[phraseIndex % safePhrases.length] ?? "";
  const inAnimationCss = autoSubtitlePreviewAnimationCss(settings.animation);
  const outAnimationCss = autoSubtitlePreviewAnimationCss(settings.outAnimation ?? settings.animation);
  const textMotionCss = autoSubtitlePreviewTextMotionCss(settings.textAnimation);

  return (
    <div className={cn("relative flex w-full items-center justify-center overflow-hidden px-2", compact ? "h-[40px]" : "h-[38px]")}>
      {leavingPhrase && (settings.outAnimation ?? settings.animation) !== "none" && (
        <div
          key={`out-${leavingPhrase.key}`}
          className="absolute inset-x-2 flex justify-center"
          style={{ animation: outAnimationCss.out }}
        >
          <AutoSubtitlePreviewText
            settings={settings}
            text={leavingPhrase.text}
            language={language}
            compact={compact}
            motionStyle={textMotionCss}
          />
        </div>
      )}
      <div
        key={`${phraseIndex}-${text}`}
        className="absolute inset-x-2 flex justify-center"
        style={{ animation: inAnimationCss.in }}
      >
        <AutoSubtitlePreviewText
          settings={settings}
          text={text}
          language={language}
          compact={compact}
          motionStyle={textMotionCss}
        />
      </div>
    </div>
  );
}

function autoSubtitlePreviewTransitionMs(animation: CaptionAnimation): number {
  switch (animation) {
    case "none":
      return 0;
    case "pop":
      return 360;
    default:
      return 260;
  }
}

function autoSubtitlePreviewAnimationCss(
  animation: CaptionAnimation,
): { in: string; out: string } {
  const duration = autoSubtitlePreviewTransitionMs(animation);
  if (animation === "none") {
    return { in: "none", out: "none" };
  }
  switch (animation) {
    case "slideIn":
    case "slideUp":
      return {
        in: `${duration}ms autoSubtitlePreviewSlideUpIn ease-out both`,
        out: `${Math.max(160, duration - 60)}ms autoSubtitlePreviewSlideUpOut ease-in both`,
      };
    case "slideDown":
      return {
        in: `${duration}ms autoSubtitlePreviewSlideDownIn ease-out both`,
        out: `${Math.max(160, duration - 60)}ms autoSubtitlePreviewSlideDownOut ease-in both`,
      };
    case "scale":
      return {
        in: `${duration}ms autoSubtitlePreviewScaleIn ease-out both`,
        out: `${Math.max(160, duration - 60)}ms autoSubtitlePreviewScaleOut ease-in both`,
      };
    case "pop":
      return {
        in: `${duration}ms autoSubtitlePreviewPopIn cubic-bezier(.2,1.35,.35,1) both`,
        out: "180ms autoSubtitlePreviewPopOut ease-in both",
      };
    case "fade":
    case "typewriter":
    case "wordHighlight":
    default:
      return {
        in: `${duration}ms autoSubtitlePreviewFadeIn ease-out both`,
        out: `${Math.max(160, duration - 60)}ms autoSubtitlePreviewFadeOut ease-in both`,
      };
  }
}

function autoSubtitlePreviewTextMotionCss(
  animation: CaptionTextAnimation | undefined,
): React.CSSProperties | undefined {
  switch (animation) {
    case "typing-cursor":
      return { animation: "1100ms autoSubtitleCapcutTyping steps(4, end) infinite" };
    case "bounce-left":
      return { animation: "920ms autoSubtitleCapcutBounceLeft cubic-bezier(.2,1.45,.28,1) infinite" };
    case "in-scanner":
      return { animation: "1050ms autoSubtitleCapcutScanText ease-in-out infinite" };
    case "text-sprout":
      return { animation: "780ms autoSubtitleCapcutSprout cubic-bezier(.18,1.25,.3,1) infinite" };
    case "leap-in":
      return { animation: "900ms autoSubtitleCapcutLeap cubic-bezier(.2,1.3,.3,1) infinite" };
    case "rebound-in":
      return { animation: "950ms autoSubtitleCapcutRebound cubic-bezier(.2,1.18,.3,1) infinite" };
    case "loud-emphasis":
      return { animation: "820ms autoSubtitleCapcutLoud ease-in-out infinite" };
    case "spatter-stroke":
      return { animation: "680ms autoSubtitleCapcutSpatter steps(2, jump-none) infinite" };
    case "ode-to-joy":
      return { animation: "1050ms autoSubtitleCapcutOde ease-in-out infinite" };
    case "pop-snow":
      return { animation: "900ms autoSubtitleCapcutPopSnow cubic-bezier(.2,1.25,.32,1) infinite" };
    case "hope-horizon":
      return { animation: "1150ms autoSubtitleCapcutHope ease-in-out infinite" };
    case "big-echoes":
      return { animation: "980ms autoSubtitleCapcutLoud ease-out infinite" };
    case "tension-release":
      return { animation: "900ms autoSubtitleCapcutTension cubic-bezier(.18,1.2,.25,1) infinite" };
    case "sequence-reveal":
      return { animation: "760ms autoSubtitleCapcutSequence ease-out infinite" };
    case "bubble-sprite":
      return { animation: "1200ms autoSubtitleCapcutBubble ease-in-out infinite" };
    case "blaze-shot":
      return { animation: "900ms autoSubtitleCapcutBlazeText ease-out infinite" };
    case "love-emphasis":
      return { animation: "980ms autoSubtitleCapcutLove ease-in-out infinite" };
    case "wavy-roll":
      return { animation: "980ms autoSubtitleCapcutWavyRoll ease-in-out infinite" };
    case "quirky-spelling":
      return { animation: "760ms autoSubtitleCapcutQuirky cubic-bezier(.2,1.25,.32,1) infinite" };
    case "none":
    default:
      return undefined;
  }
}

function AutoSubtitlePreviewText({
  settings,
  text,
  compact,
  activeWord,
  wordsPerLine,
  language,
  motionStyle,
}: {
  settings: CaptionStyleSettings;
  text: string;
  compact?: boolean;
  activeWord?: boolean;
  wordsPerLine?: number;
  language?: string | null;
  motionStyle?: React.CSSProperties;
}) {
  const transformed = applyCaptionCase(text, settings.case);
  const displayText = wordsPerLine
    ? formatAutoSuptitleCueText(transformed, wordsPerLine, language)
    : transformed;
  const firstTokenMatch = displayText.match(/\S+/);
  const highlightedWord = firstTokenMatch?.[0] ?? displayText;
  const restText = firstTokenMatch
    ? displayText.slice((firstTokenMatch.index ?? 0) + highlightedWord.length)
    : "";
  const previewStyle: React.CSSProperties = {
    fontFamily: `"${settings.font}", Inter, sans-serif`,
    fontSize: compact ? 10 : 18,
    fontWeight: settings.weight,
    fontStyle: settings.italic ? "italic" : "normal",
    color: settings.fill,
    WebkitTextStroke: settings.stroke.enabled
      ? `${compact ? Math.min(1.2, settings.stroke.width / 5) : Math.max(1, settings.stroke.width / 2)}px ${settings.stroke.color}`
      : undefined,
    paintOrder: "stroke fill",
    textShadow: settings.shadow.enabled
      ? `${settings.shadow.offsetX}px ${settings.shadow.offsetY}px ${settings.shadow.blur}px ${settings.shadow.color}`
      : "0 1px 8px rgba(0,0,0,.55)",
    backgroundColor: settings.background.enabled ? settings.background.color : undefined,
    borderRadius: settings.background.enabled ? Math.max(4, settings.background.cornerRadius / 2) : undefined,
    padding: settings.background.enabled ? (compact ? "2px 5px" : "4px 9px") : undefined,
    lineHeight: compact ? "12px" : "22px",
    letterSpacing: 0,
    whiteSpace: compact ? "normal" : "nowrap",
  };
  const compactClampStyle: React.CSSProperties | undefined = compact
    ? {
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: 2,
        overflow: "hidden",
      }
    : undefined;

  return (
    <div
      className={cn(
        "max-w-full text-center",
        compact ? "overflow-hidden" : "overflow-hidden text-ellipsis whitespace-nowrap uppercase",
        compact ? "px-1" : "px-2",
      )}
      style={{ ...previewStyle, ...compactClampStyle, ...motionStyle }}
    >
      {activeWord && settings.animation === "wordHighlight" && restText.trim().length > 0 ? (
        <span className={cn(compact ? "inline" : "inline-flex max-w-full items-baseline overflow-hidden whitespace-nowrap")}>
          <span style={{ color: captionAccentColor(settings) }}>{highlightedWord}</span>
          <span>{restText}</span>
        </span>
      ) : (
        displayText
      )}
    </div>
  );
}

function AutoSubtitlePanel({
  form,
  uploading,
  running,
  progress,
  language,
  onChange,
  onUpload,
  onVideoFiles,
  onRemoveVideo,
  onCreate,
  onToolChange,
}: {
  form: StandaloneFormState;
  uploading: boolean;
  running: boolean;
  progress: AutoSubtitleProgress | null;
  language: ReturnType<typeof useLanguage>["language"];
  onChange: (patch: Partial<StandaloneFormState>) => void;
  onUpload: () => void;
  onVideoFiles: (files: File[]) => void;
  onRemoveVideo: () => void;
  onCreate: () => void;
  onToolChange: (tool: StandaloneToolKey) => void;
}) {
  const th = language === "th";
  const { t } = useLanguage();
  const media = form.autoSubtitleVideo;
  const copy = {
    title: t("workspace.standalone.panel.auto_subtitle.title"),
    subtitle: t("workspace.standalone.auto_subtitle.subtitle"),
    uploadTitle: t("workspace.standalone.auto_subtitle.upload_title"),
    uploadHint: t("workspace.standalone.auto_subtitle.upload_hint"),
    uploadLimit: t("workspace.standalone.auto_subtitle.upload_limit", {
      max: AUTO_SUBTITLE_UPLOAD_MAX_LABEL,
      duration: th ? AUTO_SUBTITLE_MAX_DURATION_LABEL_TH : AUTO_SUBTITLE_MAX_DURATION_LABEL,
    }),
    speechLanguage: t("workspace.standalone.auto_subtitle.speech"),
    preset: t("workspace.standalone.auto_subtitle.preset"),
    font: t("workspace.standalone.auto_subtitle.font"),
    position: t("workspace.standalone.auto_subtitle.position"),
    size: t("workspace.standalone.auto_subtitle.size"),
    words: t("workspace.standalone.auto_subtitle.words_per_line"),
    stroke: t("workspace.standalone.auto_subtitle.stroke"),
    background: t("workspace.standalone.auto_subtitle.background"),
    ready: t("workspace.standalone.auto_subtitle.ready"),
    action: t("workspace.standalone.panel.auto_subtitle.action"),
    processing: t("workspace.standalone.auto_subtitle.processing"),
    remove: t("workspace.standalone.auto_subtitle.remove"),
  };

  const addFiles = (files: File[]) => {
    if (files.length > 0) onVideoFiles(files.slice(0, 1));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    addFiles(autoSubtitleVideoFilesFromTransfer(event.dataTransfer));
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = autoSubtitleVideoFilesFromTransfer(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    addFiles(files);
  };

  const selectedPreset =
    BUILTIN_CAPTION_PRESETS.find((preset) => preset.id === form.autoSubtitlePresetId)?.name ??
    form.autoSubtitlePresetId;
  const speechLabel = captionLanguageLabel(form.autoSubtitleLanguage, t);
  const positionLabel =
    form.autoSubtitlePosition === "top"
      ? t("workspace.standalone.auto_subtitle.position_top")
      : form.autoSubtitlePosition === "middle"
        ? t("workspace.standalone.auto_subtitle.position_middle")
        : t("workspace.standalone.auto_subtitle.position_bottom");

  return (
    <section className="standalone-translate-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-[var(--border-overlay)] bg-[var(--bg-sidebar)] shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
      <div className="mf-function-header flex h-[52px] shrink-0 items-center gap-2.5 border-b border-white/[0.05] px-3.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center text-cyan-200">
          <Captions className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold leading-[17px] text-white">{copy.title}</h2>
          <p className="mt-0.5 truncate text-[10px] leading-[13px] text-zinc-400">{copy.subtitle}</p>
        </div>
      </div>

      <div className="ws-scroll-hide min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        <div className="space-y-2.5">
          <div
            role={!media ? "button" : undefined}
            tabIndex={!media ? 0 : undefined}
            onClick={!media ? onUpload : undefined}
            onKeyDown={(event) => {
              if (!media && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onUpload();
              }
            }}
            onPaste={handlePaste}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={handleDrop}
            className={cn(
              "group relative flex min-h-[112px] w-full overflow-hidden rounded-[12px] border text-left transition",
              media
                ? "border-white/10 bg-black/30"
                : "border-dashed border-cyan-300/35 bg-cyan-300/[0.04] hover:border-cyan-200/70 hover:bg-cyan-300/[0.07]",
            )}
          >
            {media ? (
              <>
                <video
                  src={media.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-video max-h-[166px] w-full bg-black object-contain"
                />
                <span className="absolute left-3 top-3 max-w-[70%] truncate rounded-full border border-black/30 bg-black/70 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
                  {media.name}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveVideo();
                  }}
                  className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white transition hover:bg-white/15"
                  aria-label={copy.remove}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <div className="flex w-full items-center gap-2.5 px-3 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center text-cyan-200">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UploadCloud className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold leading-[15px] text-white">{copy.uploadTitle}</p>
                  <p className="mt-1 truncate text-[11px] leading-[14px] text-zinc-400">{copy.uploadHint}</p>
                  <p className="mt-1 text-[10px] font-semibold leading-[12px] text-cyan-100/70">
                    {copy.uploadLimit}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <VoiceTranslateSelectCard
              label={copy.speechLanguage}
              value={form.autoSubtitleLanguage}
              displayValue={speechLabel}
              icon={<Languages className="h-4 w-4" />}
              options={CAPTIONS_LANGUAGES.map((item) => ({ value: item.code, label: captionLanguageLabel(item.code, t) }))}
              onChange={(value) => onChange({ autoSubtitleLanguage: value })}
            />
            <VoiceTranslateSelectCard
              label={copy.preset}
              value={form.autoSubtitlePresetId}
              displayValue={selectedPreset}
              icon={<Captions className="h-4 w-4" />}
              options={BUILTIN_CAPTION_PRESETS.map((preset) => ({ value: preset.id, label: preset.name }))}
              onChange={(value) => {
                const preset = BUILTIN_CAPTION_PRESETS.find((item) => item.id === value);
                onChange({
                  autoSubtitlePresetId: value,
                  autoSubtitleFont: preset?.settings.font ?? form.autoSubtitleFont,
                  autoSubtitleSize: preset?.settings.size ?? form.autoSubtitleSize,
                  autoSubtitleStroke: preset?.settings.stroke.enabled ?? form.autoSubtitleStroke,
                  autoSubtitleStrokeWidth: preset?.settings.stroke.width ?? form.autoSubtitleStrokeWidth,
                  autoSubtitleBackground: preset?.settings.background.enabled ?? form.autoSubtitleBackground,
                  autoSubtitlePosition: preset?.settings.positionV ?? form.autoSubtitlePosition,
                  autoSubtitlePositionX: preset?.settings.positionX ?? form.autoSubtitlePositionX,
                  autoSubtitlePositionY:
                    preset?.settings.positionY ??
                    (preset
                      ? autoSubtitlePositionPercentFromVertical(preset.settings.positionV)
                      : form.autoSubtitlePositionY),
                  autoSubtitleWordsPerLine: Math.max(
                    1,
                    Math.min(
                      AUTO_SUBTITLE_MAX_WORD_SPLIT,
                      preset?.settings.wordsPerLine ?? form.autoSubtitleWordsPerLine,
                    ),
                  ),
                });
              }}
            />
            <VoiceTranslateSelectCard
              label={copy.font}
              value={form.autoSubtitleFont}
              displayValue={form.autoSubtitleFont}
              icon={<BookOpen className="h-4 w-4" />}
              options={AUTO_SUBTITLE_FONT_OPTIONS.map((font) => ({ value: font, label: font }))}
              onChange={(value) => onChange({ autoSubtitleFont: value })}
            />
            <VoiceTranslateSelectCard
              label={copy.position}
              value={form.autoSubtitlePosition}
              displayValue={positionLabel}
              icon={<SlidersHorizontal className="h-[14px] w-[14px]" />}
              options={[
                { value: "top", label: t("workspace.standalone.auto_subtitle.position_top") },
                { value: "middle", label: t("workspace.standalone.auto_subtitle.position_middle") },
                { value: "bottom", label: t("workspace.standalone.auto_subtitle.position_bottom") },
              ]}
              onChange={(value) => {
                const position = value as StandaloneFormState["autoSubtitlePosition"];
                onChange({
                  autoSubtitlePosition: position,
                  autoSubtitlePositionY: autoSubtitlePositionPercentFromVertical(position),
                });
              }}
            />
            <VoiceTranslateSelectCard
              label={copy.size}
              value={String(form.autoSubtitleSize)}
              displayValue={`${form.autoSubtitleSize}px`}
              icon={<SlidersHorizontal className="h-[14px] w-[14px]" />}
              options={[36, 44, 56, 68, 80, 92].map((size) => ({
                value: String(size),
                label: `${size}px`,
              }))}
              onChange={(value) => onChange({ autoSubtitleSize: Number(value) || 56 })}
            />
            <VoiceTranslateSelectCard
              label={copy.words}
              value={String(form.autoSubtitleWordsPerLine)}
              displayValue={String(form.autoSubtitleWordsPerLine)}
              icon={<SlidersHorizontal className="h-[14px] w-[14px]" />}
              options={[2, 3, 4, 5, 6].map((count) => ({ value: String(count), label: String(count) }))}
              onChange={(value) => onChange({ autoSubtitleWordsPerLine: Number(value) || 4 })}
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <AutoSubtitleToggle
              label={copy.stroke}
              checked={form.autoSubtitleStroke}
              onChange={(checked) => onChange({ autoSubtitleStroke: checked })}
            />
            <AutoSubtitleToggle
              label={copy.background}
              checked={form.autoSubtitleBackground}
              onChange={(checked) => onChange({ autoSubtitleBackground: checked })}
            />
          </div>

          <p className="rounded-[10px] border border-[var(--border-faint)] bg-black/20 px-2.5 py-2 text-[13px] font-medium leading-[18px] text-zinc-400">
            {copy.ready}
          </p>

          {progress && (
            <div className="rounded-[10px] border border-cyan-300/15 bg-cyan-300/[0.045] px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-[12px] font-semibold text-cyan-100">
                <span>{progress.message}</span>
                <span>{Math.round(progress.progress)}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-200 transition-all"
                  style={{ width: `${Math.max(4, Math.min(100, progress.progress))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/[0.05] bg-[var(--bg-sidebar)] px-3 py-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex h-[40px] items-center gap-2 rounded-[10px] border border-[var(--border-faint)] bg-[var(--bg-panel)] px-2.5 text-[13px] font-semibold text-zinc-300">
            <Film className="h-3.5 w-3.5 text-zinc-400" />
            <span className="truncate">{media ? "MP4" : t("workspace.standalone.panel.media")}</span>
          </div>
          <button
            type="button"
            onClick={onCreate}
            disabled={running || uploading || !media}
            className="btn-cta flex !h-10 w-full items-center justify-center gap-2 text-[13px] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300 disabled:shadow-none disabled:opacity-70"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GenerateIcon className="h-3.5 w-3.5" />
            )}
            {running ? copy.processing : copy.action}
          </button>
        </div>
      </div>
      <ToolTabs
        activeTool="auto_subtitle"
        onToolChange={onToolChange}
        className="hidden shrink-0 lg:flex"
      />
    </section>
  );
}

function AutoSubtitleToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="standalone-setting-card flex min-h-[34px] items-center justify-between gap-2 rounded-[10px] border border-white/[0.06] bg-[#16181a] px-[9px] py-[4px] text-left transition hover:border-[var(--brand-primary)]/35 hover:bg-white/[0.04]"
      aria-pressed={checked}
    >
      <span className="text-[12px] font-bold leading-[15px] text-zinc-200">{label}</span>
      <span
        className={cn(
          "flex h-[20px] w-[34px] items-center rounded-full p-[2px] transition",
          checked ? "bg-[var(--brand-primary)]" : "bg-white/12",
        )}
      >
        <span
          className={cn(
            "h-[16px] w-[16px] rounded-full bg-black transition-transform",
            checked ? "translate-x-[14px]" : "translate-x-0 bg-zinc-400",
          )}
        />
      </span>
    </button>
  );
}

function VoiceTranslateSelectCard({
  label,
  value,
  displayValue,
  icon,
  options,
  onChange,
}: {
  label: string;
  value: string;
  displayValue: string;
  icon: React.ReactNode;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className="standalone-setting-card h-auto min-h-[38px] rounded-[10px] border-white/[0.06] bg-[#16181a] px-[7px] py-[3px] text-white shadow-none ring-0 transition hover:border-[var(--brand-primary)]/35 hover:bg-white/[0.04] focus:ring-0 focus:ring-offset-0 data-[state=open]:border-[var(--brand-primary)]/55 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-zinc-500"
      >
        <div className="flex min-w-0 items-center gap-[6px]">
          <span className="grid h-[24px] w-[24px] shrink-0 place-items-center rounded-[7px] bg-white/[0.05] text-zinc-300">
            {icon}
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-[11px] font-semibold leading-[13px] text-zinc-500">
              {label}
            </span>
            <span className="block truncate text-[13px] font-bold leading-[15px] text-white">
              {displayValue}
            </span>
          </span>
        </div>
      </SelectTrigger>
      <SelectContent className="standalone-translate-menu z-[9999] max-h-[220px] overflow-hidden rounded-[10px] border border-white/10 bg-neutral-950 p-1 text-white shadow-2xl">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="standalone-translate-menu-item h-[30px] rounded-md py-[5px] pl-7 pr-2 text-[13px] font-semibold leading-[16px] text-zinc-200 focus:bg-white/10 focus:text-white data-[state=checked]:text-[var(--brand-primary)]"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
                <div className="ws-scroll-hide flex snap-x gap-3 overflow-x-auto">
                  {recommendedModels.map((model) => {
                    const active = model.id === value;
                    const visual = modelVisualFor(model);
                    const preview = recommendedModelPreviewFor(model);
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
                        {preview && <RecommendedModelPreview preview={preview} />}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/25 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 min-w-0 p-3">
                          <div className="line-clamp-2 text-[22px] font-semibold leading-[1.05] text-white">
                            {model.label}
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
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 max-w-[260px] truncate text-sm font-semibold leading-5 text-white">
                        {model.label}
                      </span>
                      <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] text-[var(--text-default)] ring-1 ring-white/10">
                        {model.provider}
                      </span>
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

function RecommendedModelPreview({ preview }: { preview: ModelPreviewMeta }) {
  if (preview.videoSrc) {
    return (
      <video
        src={preview.videoSrc}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  if (preview.imageSrc) {
    return (
      <img
        src={preview.imageSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
    );
  }

  return null;
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
  const hasImageLogo = Boolean(logo.imageSrc);
  const markLength = logo.mark.length;
  const markClass =
    markLength > 5
      ? "text-[10.5px]"
      : markLength > 4
        ? "text-[11px]"
        : markLength > 3
          ? "text-[12px]"
          : markLength > 2
            ? "text-[13px]"
            : "text-[16px]";

  return (
    <span
      aria-label={`${logo.label} logo`}
      title={logo.label}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden leading-none tracking-normal",
        hasImageLogo ? "border-0 bg-transparent shadow-none" : "border font-black uppercase",
        size === "xl"
          ? hasImageLogo ? "h-10 w-10 rounded-none" : "h-10 w-10 rounded-lg"
          : hasImageLogo ? "h-9 w-9 rounded-none" : "h-9 w-9 rounded-[10px]",
        className,
      )}
      style={hasImageLogo
        ? { color: logo.color }
        : {
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
          className="h-full w-full object-contain p-0"
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

function UpscaleGuide({
  form,
  language,
}: {
  form: StandaloneFormState;
  language: ReturnType<typeof useLanguage>["language"];
}) {
  const th = language === "th";
  const { t } = useLanguage();
  const mediaLabel = th ? "ภาพเท่านั้น" : "image only";
  const title = t("workspace.standalone.panel.upscale.settings_title");
  const summary = th
    ? "เลือกขนาด 1K, 2K, หรือ 4K และระดับคุณภาพสำหรับการเพิ่มความคมชัดของภาพ"
    : "Choose 1K, 2K, or 4K output and quality for image enhancement.";

  return (
    <div className="rounded-[10px] border border-white/[0.04] bg-[#101112] px-[11px] py-[8px] text-[12px] leading-[16px] text-neutral-300">
      <div className="mb-[4px] flex items-center gap-[8px]">
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-white/[0.045] text-neutral-200">
          <SlidersHorizontal className="h-[14px] w-[14px]" />
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold leading-[15px] text-white">{title}</div>
          <div className="text-[10px] font-medium leading-[13px] text-neutral-500">
            {th ? `ไฟล์ต้นฉบับ: ${mediaLabel}` : `Source media: ${mediaLabel}`}
          </div>
        </div>
      </div>
      <p>{summary}</p>
    </div>
  );
}

function VoiceControls({
  form,
  onChange,
}: {
  form: StandaloneFormState;
  onChange: (patch: Partial<StandaloneFormState>) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[7px]">
      <PromptBox
        label={t("workspace.standalone.script")}
        placeholder={t("workspace.standalone.script_placeholder")}
        value={form.script}
        onChange={(script) => onChange({ script })}
        minRows={5}
        maxLength={5000}
        compact
      />
      <VoiceSettingsControls form={form} onChange={onChange} />
    </div>
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
    <div className="standalone-voice-settings flex min-h-0 flex-1 flex-col gap-[4px] rounded-[13px] bg-white/[0.03] px-[8px] py-[6px] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
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
            <div className="standalone-voice-controls ws-scroll-hide mt-[3px] grid max-h-[172px] grid-cols-3 gap-[4px] overflow-y-auto pb-1 pr-0.5">
              {elevenVoices.map((voice) => {
                const active = voice.id === form.voice;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => onChange({ voice: voice.id })}
                    className={cn(
                      "standalone-voice-card flex min-h-[46px] flex-col items-start justify-between rounded-[10px] border px-[7px] py-[4px] text-left transition",
                      active
                        ? "border-[#EFFF00]/45 bg-[#EFFF00]/10 shadow-[0_0_14px_rgba(244,255,0,0.10)]"
                        : "border-transparent bg-white/[0.055] hover:border-[#EFFF00]/25 hover:bg-white/[0.08]",
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
                      <span className="block truncate text-[11.5px] font-bold leading-[14px] text-white">
                        {voice.name}
                      </span>
                      <span className="block truncate text-[10px] leading-[11px] text-zinc-500">
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
    </div>
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
    event.preventDefault();
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
      <div className="standalone-voice-controls ws-scroll-hide mt-[3px] grid max-h-[172px] grid-cols-3 gap-[4px] overflow-y-auto pb-1 pr-0.5">
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
                "standalone-voice-card relative flex min-h-[50px] flex-col items-start justify-center rounded-[10px] border px-[7px] py-[4px] pr-[40px] text-left transition",
                active
                  ? "border-[#EFFF00]/45 bg-[#EFFF00]/10 shadow-[0_0_14px_rgba(244,255,0,0.10)]"
                  : "border-transparent bg-white/[0.055] hover:border-[#EFFF00]/25 hover:bg-white/[0.08]",
              )}
            >
              <span
                className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                style={{
                  background:
                    TINT_PALETTE[pickTintFromName(voiceName)] ?? TINT_PALETTE.zinc,
                }}
              >
                {voiceName.charAt(0)}
              </span>
              <span className="mt-[2px] block w-full truncate text-[11.5px] font-bold leading-[14px] text-white">
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
                    e.preventDefault();
                    e.stopPropagation();
                    void handlePreview(e as unknown as React.MouseEvent, voiceName);
                  }
                }}
                className={cn(
                  "absolute right-[6px] top-1/2 grid h-[32px] w-[32px] -translate-y-1/2 cursor-pointer place-items-center rounded-full transition",
                  "bg-white/[0.12] text-zinc-100 hover:bg-white/[0.20] hover:text-white",
                  isPlaying && "bg-[#EFFF00]/25 text-[#F4FF33]",
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-[14px] w-[14px] animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-[14px] w-[14px]" />
                ) : (
                  <Play className="h-[14px] w-[14px]" />
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
    <div className="standalone-audio-tags-panel pt-[1px]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        Audio tags
      </div>
      <p className="mt-[1px] text-[10.5px] leading-[12px] text-zinc-500">
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

      <div className="mt-[4px]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
          ความเร็ว / Speed
        </div>
        <div className="mt-[2px] inline-flex min-h-[22px] w-full items-center gap-1 rounded-lg bg-white/[0.045] p-0.5 text-[11px]">
          {GEMINI_SPEED_OPTIONS.map((opt) => {
            const active = speed === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeSpeed(opt.id)}
                className={cn(
                  "flex-1 rounded-md px-2 py-[1px] text-center leading-[12px] transition-colors",
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
        <div className="mt-[4px] rounded-md bg-black/35 px-2 py-1 font-mono text-[10.5px] leading-[12px] text-amber-200/90">
          {prefix} <span className="text-zinc-500">+ script</span>
        </div>
      ) : (
        <div className="mt-[4px] text-[10.5px] leading-[13px] italic text-zinc-600">
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
    <div className="mt-[4px]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        {title}
      </div>
      <div className="mt-[2px] flex flex-wrap gap-[3px]">
        {items.map((item) => {
          const active = selected.includes(item.tag);
          return (
            <button
              key={item.tag}
              type="button"
              onClick={() => onToggle(item.tag)}
              title={item.sub}
              className={cn(
                "rounded-full px-[7px] py-[1px] text-[11px] font-medium leading-[12px] transition-colors",
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
    <div className="standalone-voice-controls pt-[1px]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        {t("workspace.standalone.voice_style")}
      </div>
      <div className="mt-[3px] inline-flex min-h-[24px] w-full items-center gap-1 rounded-lg bg-white/[0.04] p-0.5 text-[11.5px]">
        {presets.map((p) => {
          const active = form.voiceStylePreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ voiceStylePreset: p.id })}
              className={cn(
                "flex-1 rounded-md px-2 py-[2px] text-center leading-[12px] transition-colors",
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
    <div className="mt-[4px]">
      <div className="flex items-center justify-between text-[10.5px] font-medium leading-[12px] text-zinc-300">
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
        className="mt-[2px] h-1 w-full cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-amber-300 outline-none"
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

const THREE_D_MODE_ITEMS: Array<{
  id: StandaloneThreeDMode;
  title: string;
  shortTitle: string;
  caption: string;
  icon: typeof Box;
}> = [
  {
    id: "image_to_3d",
    title: "Image to 3D",
    shortTitle: "Model",
    caption: "Generate a textured GLB from image references.",
    icon: ImagePlus,
  },
  {
    id: "auto_rig",
    title: "Rig Assistant",
    shortTitle: "Rig",
    caption: "Rig Check first, draft with AI, finish manually when needed.",
    icon: SlidersHorizontal,
  },
  {
    id: "animate",
    title: "Animate 3D preset",
    shortTitle: "Animate",
    caption: "Apply Tripo preset motion to a rigged model.",
    icon: Play,
  },
];

function threeDModeMeta(mode: StandaloneThreeDMode) {
  return THREE_D_MODE_ITEMS.find((item) => item.id === mode) ?? THREE_D_MODE_ITEMS[0];
}

function ThreeDWorkshop({
  mode,
  form,
  jobs,
  jobsLoading,
  modelOptions,
  sourceOptions,
  referenceAssets,
  uploading,
  running,
  activeJobCount,
  createLabel,
  costQuote,
  onChange,
  onModelChange,
  onUploadClick,
  onReferenceFiles,
  onSelectReferenceAsset,
  onRemoveReference,
  onCreate,
  onDeleteJob,
  onToolChange,
  onOpenSidebar,
}: {
  mode: StandaloneThreeDMode;
  form: StandaloneFormState;
  jobs: StandaloneJobRow[];
  jobsLoading: boolean;
  modelOptions: Array<{ id: string; label: string; provider?: string }>;
  sourceOptions: UploadedRef[];
  referenceAssets: PanelReferenceAsset[];
  uploading: boolean;
  running: boolean;
  activeJobCount: number;
  createLabel: string;
  costQuote: CreatePanelCostQuote | null;
  onChange: (patch: Partial<StandaloneFormState>) => void;
  onModelChange: (model: string) => void;
  onUploadClick: () => void;
  onReferenceFiles: (files: File[], slotOverride?: UploadSlot) => Promise<void>;
  onSelectReferenceAsset: (reference: PanelReferenceAsset, slotOverride?: UploadSlot) => Promise<void>;
  onRemoveReference: (id: string) => void;
  onCreate: () => void;
  onDeleteJob: (job: StandaloneJobRow) => void;
  onToolChange: (tool: StandaloneToolKey) => void;
  onOpenSidebar: () => void;
}) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<"assets" | "properties">("assets");
  const imageRefs = threeDReferencesForForm(form);
  const modeMeta = threeDModeMeta(mode);
  const sourceOptionsWithCurrent = mergeReferenceOptions(
    [form.model3dSource, ...sourceOptions],
    120,
  );
  const visibleSourceOptions =
    mode === "animate" ? sourceOptionsWithCurrent.filter(isRiggedTripoSourceReference) : sourceOptionsWithCurrent;
  const selectedSource =
    form.model3dSource &&
    (mode !== "animate" || visibleSourceOptions.some((source) => source.id === form.model3dSource?.id))
      ? form.model3dSource
      : null;
  const activeJob = jobs.find((job) => job.status === "queued" || job.status === "running") ?? null;
  const selectedJob =
    jobs.find((job) => job.id === selectedJobId) ?? activeJob ?? jobs[0] ?? null;
  const selectedResult = selectedJob?.result ?? null;
  const selectedModelUrl = getStandaloneModelUrl(selectedResult);
  const selectedPosterUrl = getStandalonePosterUrl(selectedResult, selectedModelUrl);
  const selectedSourceModelUrl = modelUrlFromReference(selectedSource);
  const selectedSourcePosterUrl = selectedSource
    ? posterUrlFromReference(selectedSource)
    : undefined;
  const mainPreviewModelUrl =
    mode !== "image_to_3d" && selectedSourceModelUrl
      ? selectedSourceModelUrl
      : selectedModelUrl;
  const mainPreviewPosterUrl =
    mode !== "image_to_3d" && selectedSourceModelUrl
      ? selectedSourcePosterUrl
      : selectedPosterUrl;
  const mainPreviewTitle =
    mode !== "image_to_3d" && selectedSource
      ? selectedSource.name
      : selectedJob
        ? standaloneJobModelLabel(selectedJob)
        : "3D model";
  const mainPreviewSubtitle =
    mode !== "image_to_3d" && selectedSource
      ? tripoModelTaskIdFromReference(selectedSource).slice(0, 12) || "External model"
      : selectedJob
        ? `${selectedJob.status} / ${formatDate(selectedJob.created_at, "en")}`
        : "";
  const hasMainPreview = Boolean(mainPreviewModelUrl || mainPreviewPosterUrl);
  const disabled = running || uploading || activeJobCount > 0;
  const ModeIcon = modeMeta.icon;
  const compactModeCaption =
    mode === "image_to_3d"
      ? "Textured GLB from images."
      : mode === "auto_rig"
        ? "Check, draft rig, review."
        : "Apply motion presets to rigged models.";

  useEffect(() => {
    if (selectedJobId && jobs.some((job) => job.id === selectedJobId)) return;
    setSelectedJobId(jobs[0]?.id ?? null);
  }, [jobs, selectedJobId]);

  useEffect(() => {
    if (mode === "image_to_3d" || selectedSource || !visibleSourceOptions[0]) return;
    onChange({ model3dSource: visibleSourceOptions[0] });
  }, [mode, onChange, selectedSource, visibleSourceOptions]);

  const selectMode = (nextMode: StandaloneThreeDMode) => {
    const nextSourceOptions =
      nextMode === "animate" ? sourceOptions.filter(isRiggedTripoSourceReference) : sourceOptions;
    onChange({
      threeDMode: nextMode,
      ...(nextMode !== "image_to_3d" && !form.model3dSource && nextSourceOptions[0]
        ? { model3dSource: nextSourceOptions[0] }
        : {}),
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) {
      void onReferenceFiles(files, mode === "image_to_3d" ? "model-image" : "model-3d");
    }
  };

  const completedModels = visibleSourceOptions.slice(0, 18);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#191a1c] text-white lg:flex-row">
      <button
        type="button"
        onClick={onOpenSidebar}
        className="fixed left-2 top-2 z-[60] grid h-9 w-9 place-items-center rounded-[10px] border border-white/[0.08] bg-black/75 text-zinc-100 shadow-[0_12px_28px_-22px_rgba(0,0,0,.95)] backdrop-blur-md transition hover:border-[#eaff00]/45 hover:text-[#eaff00] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#eaff00]/70 md:hidden"
        aria-label="Open workspace menu"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <aside className="flex min-h-0 shrink-0 overflow-hidden border-b border-white/[0.06] bg-[#232527] lg:h-full lg:w-[360px] lg:border-b-0 lg:border-r">
        <div className="hidden w-[56px] shrink-0 flex-col items-center gap-2 border-r border-black/25 bg-[#141516] py-2.5 lg:flex">
          {THREE_D_MODE_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.id === mode;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectMode(item.id)}
                aria-label={item.title}
                title={item.title}
                className={cn(
                  "grid h-[46px] w-[46px] place-items-center rounded-[11px] text-[10px] font-bold transition",
                  active
                    ? "bg-[#f4ff00] text-zinc-950 shadow-[0_10px_24px_-18px_rgba(244,255,0,.8)]"
                    : "text-zinc-400 hover:bg-white/[0.06] hover:text-white",
                )}
              >
                <span className="grid place-items-center gap-0.5">
                  <Icon className="h-4 w-4" />
                  <span className="leading-none">{item.shortTitle}</span>
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onToolChange("image_gen")}
            className="mt-auto grid h-9 w-9 place-items-center rounded-[10px] text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
            aria-label="Back to image generator"
            title="Back to image generator"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
          </button>
        </div>

        <div className="flex min-w-0 min-h-0 flex-1 flex-col px-[12px] py-[12px]">
          <div className="mf-function-header mb-[12px] flex items-center justify-between gap-[8px] pl-12 lg:pl-0">
            <div className="min-w-0">
              <h1 className="[font-size:16px] font-bold [line-height:20px] text-white">3D Workshop</h1>
              <p className="[font-size:11px] font-medium [line-height:14px] text-zinc-500">
                Tripo model, rig, animate, export
              </p>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-1.5 lg:hidden">
            {THREE_D_MODE_ITEMS.map((item) => {
              const active = item.id === mode;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectMode(item.id)}
                  aria-pressed={active}
                  className={cn(
                    "min-h-[58px] rounded-[10px] border px-2 py-1.5 text-left transition",
                    active
                      ? "border-[#f4ff00]/55 bg-[#f4ff00]/10"
                      : "border-white/[0.06] bg-white/[0.035] hover:bg-white/[0.06]",
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", active ? "text-[#f4ff00]" : "text-zinc-400")} />
                  <span className="mt-1 block text-[11px] font-bold leading-[12px]">{item.shortTitle}</span>
                </button>
              );
            })}
          </div>

          <div className="ws-scroll-hide min-h-0 flex-1 overflow-y-auto">
            <div className="rounded-[14px] border border-white/[0.055] bg-[#1d1f21] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
            <div className="flex items-start gap-2">
              <span className="grid h-[32px] w-[32px] shrink-0 place-items-center rounded-[9px] bg-white/[0.06] text-[#f4ff00]">
                <ModeIcon className="h-[16px] w-[16px]" />
              </span>
              <div className="min-w-0">
                <h2 className="[font-size:14px] font-bold [line-height:17px] text-white">{modeMeta.title}</h2>
                <p className="mt-1 truncate [font-size:11px] [line-height:14px] text-zinc-400">{compactModeCaption}</p>
                {mode === "auto_rig" && (
                  <div className="mt-2 inline-flex max-w-full items-center rounded-full border border-emerald-300/15 bg-emerald-300/[0.055] px-2 py-[3px] [font-size:10px] font-semibold [line-height:12px] text-emerald-100/85">
                    Human review recommended
                  </div>
                )}
              </div>
            </div>

            {mode === "image_to_3d" ? (
              <div className="mt-2 space-y-2">
                <label className="block">
                  <FieldLabel label="Model" meta="Tripo" />
                  <select
                    value={form.model}
                    onChange={(event) => onModelChange(event.target.value)}
                    className="mt-1 h-8 w-full rounded-[9px] border border-white/[0.08] bg-[#101112] px-3 text-[12px] font-semibold text-white outline-none transition focus:border-[#f4ff00]/50"
                  >
                    {modelOptions.map((model) => (
                      <option key={model.id} value={model.id} className="bg-zinc-950">
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                  className="rounded-[12px] border border-dashed border-[#f4ff00]/35 bg-[#f4ff00]/[0.035] p-1.5"
                >
                  <button
                    type="button"
                    onClick={onUploadClick}
                    disabled={uploading}
                    className="grid min-h-[82px] w-full place-items-center rounded-[10px] bg-[linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.014))] text-center transition hover:bg-white/[0.065] disabled:opacity-60"
                  >
                    <span>
                      {uploading ? (
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#f4ff00]" />
                      ) : (
                        <UploadCloud className="mx-auto h-5 w-5 text-[#f4ff00]" />
                      )}
                      <span className="mt-1.5 block text-[12px] font-bold text-white">
                        Upload image references
                      </span>
                      <span className="mt-1 block text-[11px] text-zinc-500">
                        Front first. Up to {max3dRefsForModel(form.model)} views.
                      </span>
                    </span>
                  </button>
                  {imageRefs.length > 0 && (
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {imageRefs.map((ref, index) => (
                        <div key={ref.id} className="group relative aspect-square overflow-hidden rounded-[9px] bg-black">
                          <img src={ref.url} alt="" className="h-full w-full object-cover" />
                          <span className="absolute left-1 top-1 rounded bg-black/65 px-1 text-[9px] font-bold text-white">
                            {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => onRemoveReference(ref.id)}
                            className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
                            aria-label="Remove reference"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <ThreeDCompactToggle
                    label="Texture"
                    checked={form.texture}
                    onChange={(texture) => onChange({ texture })}
                  />
                  <ThreeDCompactToggle
                    label="PBR"
                    checked={form.pbr}
                    onChange={(pbr) => onChange({ pbr })}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <ThreeDSourcePicker
                  mode={mode}
                  sourceOptions={visibleSourceOptions}
                  selectedSource={selectedSource}
                  onUpload={onUploadClick}
                  onSelect={(model3dSource) => onChange({ model3dSource })}
                />

                {mode === "auto_rig" ? (
                  <>
                    <ThreeDRigAssistantGuide
                      hasSource={Boolean(selectedSource)}
                      rigType={form.rigType ?? TRIPO_AUTO_RIG_TYPE}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <SelectField
                          label="Rig type"
                          value={form.rigType ?? TRIPO_AUTO_RIG_TYPE}
                          options={[TRIPO_AUTO_RIG_TYPE, ...TRIPO_RIG_TYPES]}
                          onChange={(rigType) => onChange({ rigType })}
                        />
                      </div>
                      <SelectField
                        label="Spec"
                        value={form.rigSpec ?? "tripo"}
                        options={["tripo", "mixamo"]}
                        onChange={(rigSpec) => onChange({ rigSpec: rigSpec === "mixamo" ? "mixamo" : "tripo" })}
                      />
                      <SelectField
                        label="Output"
                        value={form.rigOutFormat ?? "glb"}
                        options={["glb", "fbx"]}
                        onChange={(rigOutFormat) => onChange({ rigOutFormat: rigOutFormat === "fbx" ? "fbx" : "glb" })}
                      />
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <SelectField
                      label="Preset"
                      value={form.animationPreset ?? "preset:walk"}
                      options={TRIPO_ANIMATION_PRESETS}
                      onChange={(animationPreset) => onChange({ animationPreset, animationBatch: "" })}
                    />
                    <SelectField
                      label="Output"
                      value={form.animationOutFormat ?? "glb"}
                      options={["glb", "fbx"]}
                      onChange={(animationOutFormat) => onChange({ animationOutFormat: animationOutFormat === "fbx" ? "fbx" : "glb" })}
                    />
                  </div>
                )}
              </div>
            )}
            </div>
          </div>

          <div className="mt-3 shrink-0 rounded-[14px] border border-white/[0.055] bg-[#1d1f21] p-3 shadow-[0_18px_48px_-38px_rgba(0,0,0,.95)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">Run</div>
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                {costQuote?.finalCost != null ? `${costQuote.finalCost.toLocaleString()} credits` : "Cost loading"}
              </span>
            </div>
            {costQuote && costQuote.fullCost > costQuote.finalCost && (
              <div className="mb-2 text-right text-[10px] font-medium text-emerald-200">
                {costQuote.fullCost.toLocaleString()} to {costQuote.finalCost.toLocaleString()} credits
              </div>
            )}
            <button
              type="button"
              onClick={onCreate}
              disabled={disabled}
              className="btn-cta flex h-[44px] w-full items-center justify-center gap-2 rounded-[12px] [font-size:13px] [line-height:16px] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300 disabled:shadow-none disabled:opacity-70"
            >
              {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <GenerateIcon className="h-4 w-4" />}
              {createLabel}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col bg-[#202123]">
        <div className="hidden h-[44px] shrink-0 items-center justify-between border-b border-white/[0.055] bg-[#151617] px-[16px] lg:flex">
          <div className="flex min-w-0 items-center gap-[8px]">
            <span className="truncate [font-size:13px] font-bold [line-height:16px] text-white">3D Workspace</span>
            <span className="rounded-full bg-white/[0.06] px-[8px] py-[2px] [font-size:10px] font-bold [line-height:12px] text-[#f4ff00]">
              Tripo v3.1
            </span>
            <span className="truncate [font-size:11px] font-semibold [line-height:14px] text-zinc-500">
              {modeMeta.title}
            </span>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-[#252729] bg-[linear-gradient(rgba(255,255,255,.028)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.028)_1px,transparent_1px)] bg-[size:48px_48px]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_78%,rgba(244,255,0,.065),transparent_32%)]" />
          <div className="absolute right-8 top-8 hidden gap-2 lg:flex">
            {["Z", "X", "Y"].map((axis, index) => (
              <span
                key={axis}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full text-[11px] font-black text-black",
                  index === 0 ? "bg-sky-400" : index === 1 ? "bg-rose-400" : "bg-lime-300",
                )}
              >
                {axis}
              </span>
            ))}
          </div>

          <div className="relative grid h-full place-items-center p-6">
            {hasMainPreview ? (
              <div className="w-full max-w-[720px]">
                <div className="mb-3 flex max-w-[300px] items-center gap-3 rounded-[12px] border border-white/[0.07] bg-[#18191b] p-3 shadow-[0_18px_48px_-36px_rgba(0,0,0,.9)]">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#f4ff00] text-zinc-950">
                    <Box className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-bold text-white">
                      {mainPreviewTitle}
                    </div>
                    {mainPreviewSubtitle && (
                      <div className="mt-1 truncate text-[11px] font-semibold text-zinc-400">
                        {mainPreviewSubtitle}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid aspect-[1.55] place-items-center overflow-hidden rounded-[16px] border border-white/[0.055] bg-[#151617] shadow-[0_36px_80px_-72px_rgba(244,255,0,.75)]">
                  {mainPreviewModelUrl ? (
                    <ThreeDModelPreviewFrame
                      modelUrl={mainPreviewModelUrl}
                      posterUrl={mainPreviewPosterUrl}
                      label={mainPreviewTitle}
                      variant="main"
                      interactive
                    />
                  ) : mainPreviewPosterUrl ? (
                    <img src={mainPreviewPosterUrl} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <div className="rounded-full bg-red-500/20 px-5 py-3 text-[13px] font-bold text-red-100">
                      {selectedJob?.status === "completed" ? "No preview available" : selectedJob?.status}
                    </div>
                  )}
                </div>
                {mainPreviewModelUrl && (
                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => downloadFromUrl(mainPreviewModelUrl, buildDownloadFilename(mainPreviewTitle || "mediaforge-3d-model", modelFileExtension(mainPreviewModelUrl, mainPreviewTitle)))}
                      className="btn-cta flex h-11 items-center justify-center gap-2 rounded-[12px] px-5 text-[13px]"
                    >
                      <Download className="h-4 w-4" />
                      Export 3D
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-[520px] text-center opacity-90">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-[16px] text-[#f4ff00]">
                  <Box className="h-10 w-10" />
                </div>
                <h2 className="mt-4 text-[20px] font-black text-zinc-300">
                  {mode === "image_to_3d" ? "Generate Topo-Ready Mesh in Seconds!" : "Prepare a Clean 3D Model"}
                </h2>
                <p className="mt-2 text-[12px] font-semibold leading-5 text-zinc-500">
                  {mode === "image_to_3d"
                    ? "Realtime Mesh Editing - Coming Soon"
                    : "Select or upload a model to rig, animate, and export."}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="h-[156px] shrink-0 border-t border-white/[0.06] bg-[#111213] px-[18px] py-[10px]">
          <div className="mb-[8px] flex items-end justify-between gap-4">
            <div>
              <div className="[font-size:12px] font-black uppercase tracking-[0.08em] [line-height:14px] text-zinc-200">
                Timeline
              </div>
              <div className="mt-[2px] [font-size:11px] font-medium [line-height:13px] text-zinc-500">
                Job history, output status, and the reason a run failed.
              </div>
            </div>
            <div className="shrink-0 rounded-full bg-white/[0.05] px-[9px] py-[3px] [font-size:11px] font-semibold [line-height:13px] text-zinc-400">
              {jobs.length} results
            </div>
          </div>
          <div className="ws-scroll-hide flex gap-[10px] overflow-x-auto pb-[2px]">
            {jobsLoading ? (
              <div className="grid h-[104px] w-[252px] shrink-0 place-items-center rounded-[12px] border border-white/[0.06] bg-white/[0.03]">
                <Loader2 className="h-4 w-4 animate-spin text-[#f4ff00]" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="grid h-[104px] flex-1 place-items-center rounded-[12px] border border-dashed border-white/[0.08] text-[12px] font-semibold text-zinc-600">
                No 3D output yet
              </div>
            ) : (
              jobs.map((job) => (
                <ThreeDJobTile
                  key={job.id}
                  job={job}
                  active={job.id === selectedJob?.id}
                  onSelect={() => setSelectedJobId(job.id)}
                  onDelete={() => onDeleteJob(job)}
                />
              ))
            )}
          </div>
        </div>
      </main>

      <aside className="hidden min-h-0 w-[252px] shrink-0 border-l border-white/[0.06] bg-[#151617] lg:flex lg:flex-col">
        <div className="grid h-10 shrink-0 grid-cols-2 border-b border-white/[0.06]">
          <button
            type="button"
            onClick={() => setSideTab("assets")}
            className={cn(
              "flex items-center justify-center gap-2 text-[12px] font-bold transition",
              sideTab === "assets" ? "bg-white text-black" : "text-zinc-400 hover:text-white",
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            Assets
          </button>
          <button
            type="button"
            onClick={() => setSideTab("properties")}
            className={cn(
              "flex items-center justify-center gap-2 text-[12px] font-bold transition",
              sideTab === "properties" ? "bg-white text-black" : "text-zinc-400 hover:text-white",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Property
          </button>
        </div>

        {sideTab === "assets" ? (
          <div className="ws-scroll-hide min-h-0 flex-1 overflow-y-auto p-3">
            <button
              type="button"
              onClick={onUploadClick}
              className="grid h-[104px] w-full place-items-center rounded-[12px] border border-dashed border-white/[0.11] bg-white/[0.025] text-center transition hover:border-[#f4ff00]/45 hover:bg-[#f4ff00]/[0.04]"
            >
              <span>
                <UploadCloud className="mx-auto h-6 w-6 text-[#f4ff00]" />
                <span className="mt-2 block text-[12px] font-bold text-white">
                  {mode === "image_to_3d" ? "Upload reference" : "Upload 3D model"}
                </span>
                <span className="mt-2 block text-[10px] text-zinc-400">
                  {mode === "image_to_3d" ? "PNG, JPG, WEBP" : "GLB, OBJ, FBX, STL"}
                </span>
              </span>
            </button>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-[11px] font-black uppercase tracking-[0.08em] text-zinc-300">
                {mode === "image_to_3d" ? "Image assets" : "Model assets"}
              </div>
              <div className="text-[11px] font-semibold text-zinc-600">{referenceAssets.length}</div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {referenceAssets.slice(0, 30).map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => void onSelectReferenceAsset(asset, mode === "image_to_3d" ? "model-image" : "model-3d")}
                  className="aspect-square overflow-hidden rounded-[9px] border border-white/[0.05] bg-black transition hover:border-[#f4ff00]/60"
                  title={asset.name ?? "asset"}
                >
                  {isStandaloneModel3dReference(asset) ? (
                    <ThreeDReferenceThumb reference={asset} compact />
                  ) : (
                    <ThreeDImageAssetThumb src={asset.url} />
                  )}
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div className="text-[11px] font-black uppercase tracking-[0.08em] text-zinc-300">Source models</div>
              <div className="text-[11px] font-semibold text-zinc-600">{completedModels.length}</div>
            </div>
            <div className="mt-2 space-y-2">
              {completedModels.slice(0, 8).map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => onChange({ model3dSource: model })}
                  className="flex w-full items-center gap-2 rounded-[10px] border border-white/[0.06] bg-white/[0.025] p-2 text-left transition hover:border-[#f4ff00]/45"
                >
                  <ThreeDReferenceThumb reference={model} />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-bold text-white">{model.name}</span>
                    <span className="block truncate text-[10px] text-zinc-500">
                      {tripoModelTaskIdFromReference(model).slice(0, 8) || "import needed"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-3">
            <PropertyRow label="Mode" value={modeMeta.title} />
            <PropertyRow label="Cost" value={costQuote?.finalCost != null ? `${costQuote.finalCost.toLocaleString()} credits` : "..."} />
            <PropertyRow label="Model" value={form.model} />
            <PropertyRow label="Source" value={selectedSource?.name ?? "None"} />
          </div>
        )}
      </aside>
    </div>
  );
}

function ThreeDReferenceThumb({
  reference,
  compact = false,
}: {
  reference: UploadedRef;
  compact?: boolean;
}) {
  const modelUrl = modelUrlFromReference(reference);
  const posterUrl = posterUrlFromReference(reference);
  const modelKey = modelUrl ? modelPreviewCacheKey(modelUrl) : "";
  const [capturedPoster, setCapturedPoster] = useState<string | undefined>(() =>
    modelKey ? MODEL_PREVIEW_THUMB_CACHE.get(modelKey) : undefined,
  );

  useEffect(() => {
    if (!modelKey) {
      setCapturedPoster(undefined);
      return;
    }
    setCapturedPoster(MODEL_PREVIEW_THUMB_CACHE.get(modelKey));
    const onThumbReady = (event: Event) => {
      const detail = (event as CustomEvent<ModelPreviewThumbEventDetail>).detail;
      if (detail?.key === modelKey) setCapturedPoster(detail.dataUrl);
    };
    window.addEventListener(MODEL_PREVIEW_THUMB_EVENT, onThumbReady);
    return () => window.removeEventListener(MODEL_PREVIEW_THUMB_EVENT, onThumbReady);
  }, [modelKey]);

  const src = capturedPoster ?? posterUrl ?? (!modelUrl && !MODEL_FILE_RE.test(reference.url) ? reference.url : "");
  return (
    <span className={cn(
      "grid shrink-0 place-items-center overflow-hidden rounded-[9px] bg-black",
      compact ? "h-full w-full" : "h-11 w-11",
    )}>
      {src ? (
        <span className="relative block h-full w-full">
          <ThreeDImageAssetThumb src={src} modelFallback={Boolean(modelUrl)} />
          {modelUrl && (
            <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/70 px-1 text-[10.5px] font-black text-[#f4ff00]">
              3D
            </span>
          )}
        </span>
      ) : modelUrl ? (
        <ThreeDStaticModelThumb modelUrl={modelUrl} label={reference.name} compact={compact} />
      ) : (
        <Box className="h-5 w-5 text-[#f4ff00]" />
      )}
    </span>
  );
}

function ThreeDImageAssetThumb({
  src,
  modelFallback = false,
}: {
  src?: string;
  modelFallback?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    const Icon = modelFallback ? Box : ImagePlus;
    return (
      <span className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_35%_25%,rgba(244,255,0,.18),transparent_30%),linear-gradient(145deg,#070809,#141618)] text-[#f4ff00]">
        <Icon className={cn(modelFallback ? "h-6 w-6" : "h-5 w-5")} />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function ThreeDStaticModelThumb({
  modelUrl,
  label,
  compact,
}: {
  modelUrl: string;
  label?: string;
  compact: boolean;
}) {
  return (
    <span className="relative grid h-full w-full place-items-center overflow-hidden bg-[radial-gradient(circle_at_35%_25%,rgba(244,255,0,.22),transparent_32%),linear-gradient(145deg,#090a0b,#17191c)] text-[#f4ff00]">
      <Box className={cn(compact ? "h-6 w-6" : "h-5 w-5")} />
      {!compact && (
        <span className="pointer-events-none absolute bottom-1 rounded bg-black/65 px-1 text-[10.5px] font-black uppercase leading-[12px] text-white/80">
          {modelFileExtension(modelUrl, label)}
        </span>
      )}
      <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/70 px-1 text-[10.5px] font-black text-[#f4ff00]">
        3D
      </span>
    </span>
  );
}

function ThreeDModelPreviewFrame({
  modelUrl,
  posterUrl,
  label,
  variant,
  interactive = false,
}: {
  modelUrl: string;
  posterUrl?: string;
  label?: string;
  variant: "main" | "thumb";
  interactive?: boolean;
}) {
  const viewerUrl = useMirroredTripoUrl(modelUrl);
  const viewerRef = useRef<ModelViewerElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const canRenderModel = canInlineModelViewer(modelUrl);
  const isMain = variant === "main";

  useEffect(() => {
    setLoaded(false);
    if (!canRenderModel) return;
    void loadModelViewer().catch((err) => {
      console.warn("[3DWorkshop] failed to load model-viewer:", err);
    });
  }, [canRenderModel, modelUrl]);

  useEffect(() => {
    if (!canRenderModel) return;
    const el = viewerRef.current;
    if (!el) return;
    const onLoad = () => setLoaded(true);
    el.addEventListener("load", onLoad);
    const fallback = window.setTimeout(() => setLoaded(true), isMain ? 15_000 : 8_000);
    return () => {
      el.removeEventListener("load", onLoad);
      window.clearTimeout(fallback);
    };
  }, [canRenderModel, isMain, modelUrl, viewerUrl]);

  useEffect(() => {
    if (!isMain || !loaded || !canRenderModel) return;
    const el = viewerRef.current;
    if (!el?.toDataURL) return;
    const key = modelPreviewCacheKey(modelUrl);
    if (MODEL_PREVIEW_THUMB_CACHE.has(key)) return;
    const capture = window.setTimeout(() => {
      try {
        const dataUrl = el.toDataURL?.("image/webp", 0.72);
        if (!dataUrl?.startsWith("data:image/")) return;
        MODEL_PREVIEW_THUMB_CACHE.set(key, dataUrl);
        window.dispatchEvent(
          new CustomEvent<ModelPreviewThumbEventDetail>(MODEL_PREVIEW_THUMB_EVENT, {
            detail: { key, dataUrl },
          }),
        );
      } catch (err) {
        console.info("[3DWorkshop] thumbnail capture skipped:", err);
      }
    }, 650);
    return () => window.clearTimeout(capture);
  }, [canRenderModel, isMain, loaded, modelUrl, viewerUrl]);

  if (!canRenderModel) {
    return (
      <span className={cn(
        "relative grid h-full w-full place-items-center overflow-hidden bg-black text-[#f4ff00]",
        isMain ? "min-h-[260px]" : "",
      )}>
        {posterUrl ? (
          <img src={posterUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="grid place-items-center gap-2 text-center">
            <Box className={cn(isMain ? "h-14 w-14" : "h-6 w-6")} />
            {isMain && (
              <span className="text-[12px] font-semibold text-zinc-400">
                {modelFileExtension(modelUrl, label).toUpperCase()} preview after import
              </span>
            )}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="relative block h-full w-full overflow-hidden bg-[#08090a]">
      <model-viewer
        ref={(el) => {
          viewerRef.current = el as ModelViewerElement | null;
        }}
        src={viewerUrl ?? modelUrl}
        poster={posterUrl}
        alt={label ?? "3D model"}
        {...(isMain ? { "auto-rotate": "" } : {})}
        {...(interactive ? { "camera-controls": "" } : { "disable-zoom": "" })}
        shadow-intensity={isMain ? "0.85" : "0"}
        shadow-softness={isMain ? "0.9" : "1"}
        exposure={isMain ? "1" : "0.9"}
        loading={isMain ? "eager" : "lazy"}
        interaction-prompt={interactive ? "auto" : "none"}
        style={{
          width: "100%",
          height: "100%",
          background: "transparent",
          cursor: interactive ? "grab" : "default",
          pointerEvents: interactive ? "auto" : "none",
        }}
      />
      {!loaded && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/55">
          <Loader2 className={cn("animate-spin text-[#f4ff00]", isMain ? "h-6 w-6" : "h-4 w-4")} />
        </span>
      )}
      {!isMain && (
        <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/70 px-1 text-[8px] font-black text-[#f4ff00]">
          3D
        </span>
      )}
    </span>
  );
}

function ThreeDCompactToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const displayLabel = label === "Texture" ? "Tex" : label;
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex h-9 min-w-0 items-center justify-between gap-1 rounded-[10px] border border-white/[0.055] bg-[#151617] px-1.5 text-left transition hover:border-[#f4ff00]/35 hover:bg-white/[0.035]"
      aria-pressed={checked}
      title={label}
    >
      <span className="min-w-0 truncate text-[10px] font-semibold text-zinc-200">{displayLabel}</span>
      <span
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full transition",
          checked ? "bg-[#f4ff00] shadow-[0_0_18px_-8px_rgba(244,255,0,.9)]" : "bg-zinc-700",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] h-2.5 w-2.5 rounded-full bg-white transition",
            checked ? "left-[15px]" : "left-[3px]",
          )}
        />
      </span>
    </button>
  );
}

function ThreeDRigAssistantGuide({
  hasSource,
  rigType,
}: {
  hasSource: boolean;
  rigType: string;
}) {
  const isAuto = !rigType || rigType === TRIPO_AUTO_RIG_TYPE;
  const statusTitle = !hasSource
    ? "Choose a model first"
    : isAuto
      ? "AI selects only after Rig Check"
      : `Manual type: ${threeDRigTypeLabel(rigType)}`;
  const statusCopy = !hasSource
    ? "Upload or select a model, then run the preflight before drafting a rig."
    : isAuto
      ? "If Rig Check cannot identify a safe type, we stop instead of forcing biped."
      : "This type is used after Rig Check. Review deformation before production export.";
  return (
    <div className="rounded-[12px] border border-emerald-300/15 bg-emerald-300/[0.035] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-[1px] grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-emerald-300/10 text-emerald-100">
          {hasSource ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate [font-size:11px] font-black [line-height:13px] text-emerald-50">
            {statusTitle}
          </span>
          <span className="mt-1 block [font-size:10px] font-semibold [line-height:13px] text-emerald-50/62">
            {statusCopy}
          </span>
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {[
          ["1", "Rig Check", "fit"],
          ["2", "AI draft", "fast"],
          ["3", "Human pass", "final"],
        ].map(([step, label, hint]) => (
          <div
            key={step}
            className="rounded-[9px] bg-black/18 px-2 py-[5px] text-center"
          >
            <div className="[font-size:9px] font-black [line-height:10px] text-[#f4ff00]">{step}</div>
            <div className="mt-[2px] truncate [font-size:9px] font-bold [line-height:10px] text-white/90">{label}</div>
            <div className="mt-[1px] truncate [font-size:8px] font-semibold [line-height:9px] text-zinc-500">{hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreeDSourcePicker({
  mode,
  sourceOptions,
  selectedSource,
  onUpload,
  onSelect,
}: {
  mode: StandaloneThreeDMode;
  sourceOptions: UploadedRef[];
  selectedSource: UploadedRef | null;
  onUpload: () => void;
  onSelect: (source: UploadedRef) => void;
}) {
  const pickerSourceOptions = mergeReferenceOptions([selectedSource, ...sourceOptions], 8);
  return (
    <div>
      <FieldLabel label="Source model" meta={pickerSourceOptions.length ? `${pickerSourceOptions.length} ready` : "Upload or Tripo"} />
      {pickerSourceOptions.length === 0 ? (
        <div className="mt-2 rounded-[12px] border border-dashed border-white/[0.10] bg-black/20 p-[10px] [font-size:11px] [line-height:15px] text-zinc-400">
          <p>
            {mode === "animate"
              ? "Run Rig Assistant first. Animate preset expects a rigged Tripo model."
              : "Upload a GLB/OBJ/FBX/STL model or create an Image to 3D result first."}
          </p>
          {mode === "auto_rig" && (
            <button
              type="button"
              onClick={onUpload}
              className="mt-3 inline-flex h-[32px] items-center gap-2 rounded-[9px] bg-[#f4ff00] px-3 [font-size:11px] font-black [line-height:13px] text-zinc-950 transition hover:bg-[#fbff69]"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              Upload 3D model
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {mode === "auto_rig" && (
            <button
              type="button"
              onClick={onUpload}
              className="flex h-[34px] w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[#f4ff00]/35 bg-[#f4ff00]/[0.04] [font-size:11px] font-black [line-height:13px] text-[#f4ff00] transition hover:bg-[#f4ff00]/[0.08]"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              Upload external 3D
            </button>
          )}
          {pickerSourceOptions.slice(0, 5).map((source) => {
            const active = selectedSource?.id === source.id;
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => onSelect(source)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[12px] border p-2 text-left transition",
                  active
                    ? "border-[#f4ff00]/60 bg-[#f4ff00]/10"
                    : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.16]",
                )}
              >
                <ThreeDReferenceThumb reference={source} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate [font-size:11px] font-bold [line-height:13px] text-white">{source.name}</span>
                  <span className="mt-1 block truncate [font-size:10px] font-semibold [line-height:12px] text-zinc-500">
                    {tripoModelTaskIdFromReference(source).slice(0, 12) || "Needs Tripo import"}
                  </span>
                </span>
                {active && <Check className="h-4 w-4 shrink-0 text-[#f4ff00]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ThreeDJobTile({
  job,
  active,
  onSelect,
  onDelete,
}: {
  job: StandaloneJobRow;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const result = job.result;
  const params = job.request?.params ?? {};
  const modelUrl = getStandaloneModelUrl(result);
  const posterUrl = getStandalonePosterUrl(result, modelUrl);
  const failed = job.status === "failed" || job.status === "permanent_failed";
  const running = job.status === "queued" || job.status === "running";
  const typeLabel = threeDJobTypeLabel(job);
  const statusLabel = threeDJobStatusLabel(job.status);
  const modelLabel = standaloneJobModelLabel(job, params);
  const summary = threeDJobTimelineSummary(job);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex h-[104px] w-[252px] shrink-0 items-stretch gap-[10px] overflow-hidden rounded-[12px] border bg-[#171819] p-[10px] text-left transition",
        active ? "border-[#f4ff00]/80 bg-[#20220f]" : "border-white/[0.07] hover:border-white/[0.18] hover:bg-[#1d1f21]",
      )}
    >
      <span className="relative grid h-[82px] w-[74px] shrink-0 place-items-center overflow-hidden rounded-[10px] bg-black">
        {posterUrl ? (
          <img src={posterUrl} alt="" className="h-full w-full object-cover opacity-90" />
        ) : (
          <Box className="h-8 w-8 text-zinc-700" />
        )}
        <span className="absolute left-[5px] top-[5px] rounded bg-black/75 px-[5px] py-[2px] [font-size:8px] font-black [line-height:10px] text-[#f4ff00]">
          3D
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate [font-size:12px] font-black [line-height:14px] text-white">
              {typeLabel}
            </span>
            <span className="mt-[3px] block truncate [font-size:10px] font-semibold [line-height:12px] text-zinc-400">
              {modelLabel}
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-[7px] py-[2px] [font-size:9px] font-black uppercase [line-height:11px]",
              failed
                ? "bg-red-500/15 text-red-200 ring-1 ring-red-300/20"
                : running
                  ? "bg-sky-400/15 text-sky-200 ring-1 ring-sky-300/20"
                  : "bg-emerald-300/12 text-emerald-100 ring-1 ring-emerald-200/20",
            )}
          >
            {statusLabel}
          </span>
        </span>
        <span
          className={cn(
            "mt-[8px] line-clamp-2 block [font-size:10px] font-semibold [line-height:13px]",
            failed ? "text-red-100/85" : "text-zinc-500",
          )}
          title={summary}
        >
          {summary}
        </span>
      </span>
      <span
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onDelete();
          }
        }}
        className="absolute right-1 top-1 z-20 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
        aria-label="Delete 3D job"
      >
        <Trash2 className="h-2.5 w-2.5" />
      </span>
    </button>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.025] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-[12px] font-semibold text-white">{value}</div>
    </div>
  );
}

function PromptBox({
  label,
  value,
  placeholder,
  onChange,
  minRows = 6,
  maxLength,
  compact = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  minRows?: number;
  maxLength?: number;
  compact?: boolean;
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
        className={cn(
          "w-full resize-none border border-[var(--border-faint)] bg-[var(--bg-panel)] text-zinc-100 outline-none placeholder:text-[var(--text-tertiary)] transition focus:border-[var(--brand-primary)]/40 focus:bg-[var(--bg-surface-2)] focus:shadow-[0_0_0_1px_rgba(238,255,0,.18),0_8px_24px_-16px_rgba(238,255,0,.45)]",
          compact
            ? "mt-[6px] min-h-[92px] rounded-[14px] px-[10px] py-[8px] text-[12.5px] leading-[18px]"
            : "mt-2 min-h-[126px] rounded-2xl px-3 py-3 text-[13px] leading-relaxed",
        )}
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
        className="mt-[6px] h-[34px] w-full rounded-[10px] border border-[var(--border-faint)] bg-[var(--bg-panel)] px-2 [font-size:11px] font-semibold [line-height:13px] text-white outline-none transition hover:bg-[var(--bg-surface-2)] focus:border-[var(--brand-primary)]/40 disabled:cursor-not-allowed"
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
  compact = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <FieldLabel label={label} />
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "w-full border border-[var(--border-faint)] bg-[var(--bg-panel)] text-white outline-none placeholder:text-[var(--text-tertiary)] transition focus:border-[var(--brand-primary)]/40",
          compact
            ? "mt-[4px] h-7 rounded-[9px] px-[9px] text-[11.5px]"
            : "mt-2 h-10 rounded-xl px-3 text-[12px]",
        )}
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

function AutoSubtitleResultFeed({
  results,
  running,
  progress,
  onEdit,
  onDelete,
}: {
  results: AutoSubtitleResultItem[];
  running: boolean;
  progress: AutoSubtitleProgress | null;
  onEdit: (result: AutoSubtitleResultItem) => void;
  onDelete: (id: string) => void;
}) {
  const { language, t } = useLanguage();
  const th = language === "th";

  const downloadResult = async (result: AutoSubtitleResultItem) => {
    try {
      const response = await fetch(result.outputUrl);
      if (!response.ok) throw new Error("Could not read the generated subtitle video.");
      const blob = await response.blob();
      triggerBlobDownload(blob, result.outputName);
      toast.success(t("workspace.stock.download_started"));
    } catch (err) {
      toast.error(friendlyError(err, th ? "th" : "en"));
    }
  };

  if (results.length === 0 && !running && !progress) {
    return (
      <div className="grid min-h-[520px] place-items-center p-8 text-center">
        <div>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.04] text-zinc-200 ring-1 ring-white/10">
            <Captions className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-[16px] font-bold text-white">
            {th ? "พร้อมสร้างซับอัตโนมัติ" : "Ready for Auto Subtitle"}
          </h2>
          <p className="mt-2 max-w-[320px] text-[13px] leading-[18px] text-zinc-400">
            {th
              ? "อัปโหลดวิดีโอ ตั้งค่าฟอนต์และตำแหน่ง แล้วผลลัพธ์จะแสดงที่นี่"
              : "Upload a video, choose subtitle styling, and the rendered result will appear here."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {(running || progress) && (
        <div className="rounded-[16px] border border-cyan-300/15 bg-cyan-300/[0.045] p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-100" />
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-white">
                {progress?.message ?? (th ? "กำลังสร้างซับ" : "Generating subtitles")}
              </div>
              <div className="mt-1 text-[12px] font-medium text-zinc-400">
                {th ? "กำลังเรนเดอร์ผลลัพธ์และสร้างโปรเจกต์แก้ไข" : "Rendering the video and preparing the editable project."}
              </div>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-200 transition-all"
              style={{ width: `${Math.max(4, Math.min(100, progress?.progress ?? 12))}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {results.map((result) => (
          <article
            key={result.id}
            className="overflow-hidden rounded-[16px] border border-white/[0.07] bg-[#101112] shadow-[0_18px_42px_-34px_rgba(0,0,0,.9)]"
          >
            <div className="relative aspect-video bg-black">
              <video
                src={result.outputUrl}
                controls
                playsInline
                preload="metadata"
                className="h-full w-full object-contain"
              />
              <button
                type="button"
                onClick={() => onDelete(result.id)}
                className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-zinc-200 transition hover:bg-red-500/25 hover:text-red-100"
                aria-label={th ? "ลบผลลัพธ์" : "Delete result"}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold text-white">{result.outputName}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <MiniMeta label={`${result.cueCount} cues`} />
                  <MiniMeta label={result.outputExtension.toUpperCase()} />
                  <MiniMeta label={`${Math.max(1, Math.round(result.duration))}s`} />
                </div>
                {result.editorProjectError && (
                  <p className="mt-2 line-clamp-2 text-[12px] font-medium leading-[16px] text-amber-200">
                    {th
                      ? "ยังสร้างโปรเจกต์แก้ไขไม่ได้ กดปรับแต่งเพื่อสร้างใหม่อีกครั้ง"
                      : "Editable project was not saved yet. Edit will rebuild it from the handoff."}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void downloadResult(result)}
                  className="flex h-9 items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.045] text-[12px] font-bold text-zinc-100 transition hover:bg-white/[0.08]"
                >
                  <Download className="h-3.5 w-3.5" />
                  {th ? "ดาวน์โหลด" : "Download"}
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(result)}
                  className="flex h-9 items-center justify-center gap-2 rounded-[10px] bg-cyan-200 text-[12px] font-bold text-black transition hover:bg-cyan-100"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {th ? "ปรับแต่งวิดีโอ" : "Edit video"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function AutoSubtitleMiniEditorPanel({
  form,
  results,
  running,
  progress,
  onChange,
  onEdit,
  onDelete,
}: {
  form: StandaloneFormState;
  results: AutoSubtitleResultItem[];
  running: boolean;
  progress: AutoSubtitleProgress | null;
  onChange: (patch: Partial<StandaloneFormState>) => void;
  onEdit: (result: AutoSubtitleResultItem) => void;
  onDelete: (id: string) => void;
}) {
  const { language, t } = useLanguage();
  const th = language === "th";
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"source" | "result">("source");
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const cueDragRef = useRef<AutoSubtitleMiniCueDrag | null>(null);
  const cueDragMovedRef = useRef(false);
  const pendingGeneratedResultPreviewRef = useRef(false);
  const pendingGeneratedResultStartedAtRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [cueTimingEdits, setCueTimingEdits] = useState<Record<string, AutoSubtitleMiniCueTiming>>({});
  const media = form.autoSubtitleVideo;
  const mediaIdentity = media ? `${media.id ?? ""}|${media.name}|${media.url}` : "empty";

  useEffect(() => {
    setPreviewMode("source");
    setSelectedResultId(null);
    setSelectedCueId(null);
    setCueTimingEdits({});
  }, [mediaIdentity]);

  useEffect(() => {
    if (running || progress) {
      pendingGeneratedResultPreviewRef.current = true;
      pendingGeneratedResultStartedAtRef.current = Date.now();
    }
  }, [progress, running]);

  useEffect(() => {
    setSelectedResultId((current) => {
      if (results.length === 0) return null;
      return current && results.some((result) => result.id === current)
        ? current
        : results[0]?.id ?? null;
    });
  }, [results]);

  useEffect(() => {
    if (!pendingGeneratedResultPreviewRef.current || running || progress || results.length === 0) {
      return;
    }
    const startedAt = pendingGeneratedResultStartedAtRef.current ?? 0;
    const recentResults =
      startedAt > 0
        ? results.filter((result) => result.createdAt >= startedAt - 1500)
        : results;
    const candidates = recentResults.length > 0 ? recentResults : [];
    const generatedResult = media
      ? candidates.find((result) => autoSubtitleResultMatchesMedia(result, media)) ??
        candidates[0] ??
        null
      : candidates[0] ?? null;
    if (!generatedResult) return;
    setSelectedResultId(generatedResult.id);
    setPreviewMode("result");
    pendingGeneratedResultPreviewRef.current = false;
    pendingGeneratedResultStartedAtRef.current = null;
  }, [media, progress, results, running]);

  const selectedResult =
    results.find((result) => result.id === selectedResultId) ?? null;
  const fallbackResult = results[0] ?? null;
  const activeResult = !media
    ? selectedResult ?? fallbackResult
    : previewMode === "result"
      ? selectedResult ?? fallbackResult
      : null;
  const isRenderedResultPreview = !!activeResult && (!media || previewMode === "result");
  const previewSourceUrl = isRenderedResultPreview
    ? activeResult.outputUrl
    : media?.url ?? null;
  const playbackUrl = useFreshSignedUrl(previewSourceUrl);
  const settings = autoSubtitleStyleFromForm(form);
  const handoff = useMemo(
    () => (activeResult?.handoffId ? loadAutoSubtitleHandoff(activeResult.handoffId) : null),
    [activeResult?.handoffId],
  );
  const positionX = clampAutoSubtitlePosition(form.autoSubtitlePositionX, 0.5);
  const positionY = clampAutoSubtitlePosition(
    form.autoSubtitlePositionY,
    autoSubtitlePositionPercentFromVertical(form.autoSubtitlePosition),
  );
  const sourceName =
    isRenderedResultPreview
      ? activeResult?.outputName ?? (th ? "ยังไม่มีวิดีโอ" : "No video yet")
      : media?.name ?? (th ? "ยังไม่มีวิดีโอ" : "No video yet");
  const durationSeconds = activeResult?.duration ?? media?.durationSec ?? handoff?.source.duration ?? 0;
  const activeSourceKey = isRenderedResultPreview
    ? activeResult?.id ?? previewSourceUrl ?? "empty"
    : media?.id ?? previewSourceUrl ?? "empty";

  useEffect(() => {
    setCurrentTime(0);
    setVideoDuration(0);
    setIsPlaying(false);
    setSelectedCueId(null);
    setCueTimingEdits({});
  }, [activeSourceKey]);

  const baseCues = useMemo(
    () =>
      activeResult
        ? autoSubtitleMiniCues({
            cues: handoff?.track.cues,
            text: activeResult.transcriptText,
            durationSeconds: durationSeconds || videoDuration,
            language,
            segmentationMode: form.autoSubtitleSegmentationMode,
            wordsPerLine: form.autoSubtitleWordsPerLine,
          })
        : [],
    [
      activeResult,
      durationSeconds,
      form.autoSubtitleSegmentationMode,
      form.autoSubtitleWordsPerLine,
      handoff?.track.cues,
      language,
      videoDuration,
    ],
  );
  const timelineCues = useMemo(
    () =>
      autoSubtitleApplyCueTimingEdits(
        baseCues,
        cueTimingEdits,
        Math.max(durationSeconds, videoDuration, autoSubtitleLastCueEnd(baseCues), 1),
      ),
    [baseCues, cueTimingEdits, durationSeconds, videoDuration],
  );
  const displayDuration = Math.max(durationSeconds, videoDuration, autoSubtitleLastCueEnd(timelineCues), 1);
  const activeCue = useMemo(
    () =>
      autoSubtitleMiniActiveCue(
        timelineCues,
        currentTime,
        selectedCueId,
        isPlaying,
      ),
    [currentTime, isPlaying, selectedCueId, timelineCues],
  );
  const previewPhrases = useMemo(
    () =>
      timelineCues.length > 0
        ? timelineCues.slice(0, 4).map((cue) => cue.text)
        : autoSubtitlePreviewPhrases(
            language,
            form.autoSubtitleWordsPerLine,
            form.autoSubtitleSegmentationMode,
          ),
    [
      form.autoSubtitleSegmentationMode,
      form.autoSubtitleWordsPerLine,
      language,
      timelineCues,
    ],
  );
  const overlayPhrases = isRenderedResultPreview
    ? []
    : timelineCues.length > 0
      ? activeCue
        ? [activeCue.text]
        : []
      : previewPhrases;
  const timelineTicks = useMemo(
    () => autoSubtitleMiniTimelineTicks(displayDuration),
    [displayDuration],
  );
  const progressPercent = Math.max(0, Math.min(100, (currentTime / displayDuration) * 100));
  const updateSubtitlePositionFromPoint = (clientX: number, clientY: number) => {
    const rect = previewFrameRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const nextX = clampAutoSubtitlePosition((clientX - rect.left) / rect.width, positionX);
    const nextY = clampAutoSubtitlePosition((clientY - rect.top) / rect.height, positionY);
    onChange({
      autoSubtitlePositionX: nextX,
      autoSubtitlePositionY: nextY,
      autoSubtitlePosition: autoSubtitleVerticalFromY(nextY),
    });
  };

  const handleSubtitlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateSubtitlePositionFromPoint(event.clientX, event.clientY);
  };

  const handleSubtitlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.buttons !== 1) return;
    event.preventDefault();
    updateSubtitlePositionFromPoint(event.clientX, event.clientY);
  };

  const handleSubtitlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const seekTo = (seconds: number) => {
    const video = videoRef.current;
    const nextTime = Math.max(0, Math.min(displayDuration, seconds));
    if (video && Number.isFinite(nextTime)) {
      video.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
    const cueAtTime = autoSubtitleMiniCueAtTime(timelineCues, nextTime);
    if (cueAtTime) setSelectedCueId(cueAtTime.id);
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (video.paused) {
        await video.play();
      } else {
        video.pause();
      }
    } catch (err) {
      toast.error(friendlyError(err, th ? "th" : "en"));
    }
  };

  const seekFromTimelinePoint = (clientX: number) => {
    const rect = timelineTrackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seekTo(ratio * displayDuration);
  };

  const handleTimelinePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seekFromTimelinePoint(event.clientX);
  };

  const handleTimelinePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 1 || cueDragRef.current) return;
    event.preventDefault();
    seekFromTimelinePoint(event.clientX);
  };

  const beginCueDrag = (
    event: PointerEvent<HTMLElement>,
    cue: AutoSubtitleMiniCue,
    mode: AutoSubtitleMiniCueDrag["mode"],
  ) => {
    const rect = timelineTrackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    cueDragMovedRef.current = false;
    cueDragRef.current = {
      id: cue.id,
      mode,
      startX: event.clientX,
      originalStart: cue.start,
      originalEnd: cue.end,
      trackWidth: rect.width,
      duration: displayDuration,
    };
    setSelectedCueId(cue.id);
    seekTo(cue.start);
  };

  const handleCueDragMove = (event: PointerEvent<HTMLElement>) => {
    const drag = cueDragRef.current;
    if (!drag || event.buttons !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaSeconds = ((event.clientX - drag.startX) / drag.trackWidth) * drag.duration;
    if (Math.abs(deltaSeconds) > 0.02) cueDragMovedRef.current = true;
    let nextStart = drag.originalStart;
    let nextEnd = drag.originalEnd;
    if (drag.mode === "move") {
      nextStart += deltaSeconds;
      nextEnd += deltaSeconds;
    } else if (drag.mode === "start") {
      nextStart += deltaSeconds;
    } else {
      nextEnd += deltaSeconds;
    }
    const nextTiming = autoSubtitleClampCueTiming(
      timelineCues,
      drag.id,
      nextStart,
      nextEnd,
      displayDuration,
    );
    setCueTimingEdits((current) => ({ ...current, [drag.id]: nextTiming }));
    setCurrentTime(nextTiming.start);
  };

  const handleCueDragEnd = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    cueDragRef.current = null;
  };

  const handleCueClick = (cue: AutoSubtitleMiniCue) => {
    if (cueDragMovedRef.current) {
      cueDragMovedRef.current = false;
      return;
    }
    setSelectedCueId(cue.id);
    seekTo(cue.start);
  };

  const downloadResult = async (result: AutoSubtitleResultItem) => {
    try {
      const response = await fetch(result.outputUrl);
      if (!response.ok) throw new Error("Could not read the generated subtitle video.");
      const blob = await response.blob();
      triggerBlobDownload(blob, result.outputName);
      toast.success(t("workspace.stock.download_started"));
    } catch (err) {
      toast.error(friendlyError(err, th ? "th" : "en"));
    }
  };
  const resultWithMiniEditorHandoff = (result: AutoSubtitleResultItem): AutoSubtitleResultItem => {
    if (!handoff || result.id !== activeResult?.id || timelineCues.length === 0) return result;
    const editedCues = timelineCues.map((cue, index) => {
      const original = handoff.track.cues[index];
      const words = (original?.words ?? [])
        .map((word) => ({
          ...word,
          start: Math.max(cue.start, Math.min(cue.end, word.start)),
          end: Math.max(cue.start, Math.min(cue.end, word.end)),
        }))
        .filter((word) => word.end > word.start);
      return {
        ...(original ?? { words: [] }),
        text: cue.text,
        startTime: cue.start,
        endTime: cue.end,
        words,
      };
    });
    const handoffId = saveAutoSubtitleHandoff({
      ...handoff,
      style: settings,
      track: {
        ...handoff.track,
        cues: editedCues,
        meta: {
          ...handoff.track.meta,
          animation: settings.animation,
          accentColor: captionAccentColor(settings),
          highlightColor: captionAccentColor(settings),
        },
      },
      createdAt: Date.now(),
    });
    return { ...result, handoffId };
  };

  return (
    <div className="flex h-full min-h-[620px] overflow-hidden rounded-[18px] border border-white/[0.035] bg-[#101112]">
      <AutoSubtitlePreviewKeyframes />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[46px] shrink-0 items-center justify-between gap-3 border-b border-white/[0.055] bg-[#18191a] px-3 pr-[74px] 2xl:pr-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-[24px] w-[24px] place-items-center rounded-[7px] bg-[var(--brand-primary)]/10 text-[var(--brand-soft)]">
              <Captions className="h-[13px] w-[13px]" />
            </span>
            <div className="min-w-0">
              <span className="block truncate text-[12px] font-bold text-white">
                {th ? "Mini subtitle editor" : "Mini subtitle editor"}
              </span>
              <span className="block truncate text-[10px] font-semibold text-zinc-500">
                {previewSourceUrl
                  ? th
                    ? "ลากซับบนวิดีโอเพื่อกำหนดตำแหน่ง"
                    : "Drag subtitle text on the video to set position"
                  : th
                    ? "อัปโหลดวิดีโอเพื่อเริ่ม preview"
                    : "Upload a video to start previewing"}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="hidden h-7 items-center rounded-[7px] bg-white/[0.055] px-2 text-[11px] font-semibold text-zinc-300 md:inline-flex">
              X {Math.round(positionX * 100)} / Y {Math.round(positionY * 100)}
            </span>
            {activeResult && (
              <>
                <button
                  type="button"
                  onClick={() => void downloadResult(activeResult)}
                  className="grid h-7 w-7 place-items-center rounded-[7px] bg-white/[0.065] text-zinc-200 transition hover:bg-white/[0.1] hover:text-white"
                  aria-label={th ? "ดาวน์โหลด" : "Download"}
                  title={th ? "ดาวน์โหลด" : "Download"}
                >
                  <Download className="h-[14px] w-[14px]" />
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(resultWithMiniEditorHandoff(activeResult))}
                  className="grid h-7 w-7 place-items-center rounded-[7px] bg-cyan-200 text-black transition hover:bg-cyan-100"
                  aria-label={th ? "เปิด editor เต็ม" : "Open full editor"}
                  title={th ? "เปิด editor เต็ม" : "Open full editor"}
                >
                  <ExternalLink className="h-[14px] w-[14px]" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(activeResult.id)}
                  className="grid h-7 w-7 place-items-center rounded-[7px] text-zinc-400 transition hover:bg-red-500/15 hover:text-red-200"
                  aria-label={th ? "ลบผลลัพธ์" : "Delete result"}
                  title={th ? "ลบผลลัพธ์" : "Delete result"}
                >
                  <Trash2 className="h-[14px] w-[14px]" />
                </button>
              </>
            )}
          </div>
        </div>

        <div ref={previewFrameRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#080808]">
          {playbackUrl ? (
            <video
              ref={videoRef}
              src={playbackUrl}
              controls
              playsInline
              preload="metadata"
              className="h-full w-full object-contain"
              onLoadedMetadata={(event) => {
                const duration = Number(event.currentTarget.duration);
                if (Number.isFinite(duration) && duration > 0) {
                  setVideoDuration(duration);
                }
              }}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
          ) : (
            <div className="h-full bg-black" aria-label={th ? "ยังไม่มีวิดีโอ" : "No video loaded"}>
              <div className="flex h-full items-center justify-center text-[12px] font-semibold text-zinc-700">
                {th ? "ยังไม่มีวิดีโอ" : "No video yet"}
              </div>
            </div>
          )}

          {previewSourceUrl && overlayPhrases.length > 0 && (
            <button
              type="button"
              onPointerDown={handleSubtitlePointerDown}
              onPointerMove={handleSubtitlePointerMove}
              onPointerUp={handleSubtitlePointerUp}
              style={{
                left: `${positionX * 100}%`,
                top: `${positionY * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
              className="group absolute z-20 flex min-w-[180px] cursor-grab touch-none items-center justify-center rounded-[12px] px-2 py-1 outline-none transition hover:bg-black/20 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-cyan-200/80"
              title={th ? "ลากเพื่อปรับตำแหน่ง subtitle" : "Drag to move subtitle"}
            >
              <span className="pointer-events-none">
                <AutoSubtitleAnimatedPreview
                  settings={settings}
                  phrases={overlayPhrases}
                  language={th ? "th" : "en"}
                />
              </span>
              <span className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full border border-white/15 bg-black/75 text-zinc-200 opacity-0 shadow transition group-hover:opacity-100">
                <GripVertical className="h-3 w-3" />
              </span>
            </button>
          )}

          {(running || progress) && (
            <div className="absolute inset-0 grid place-items-center bg-black/42 backdrop-blur-[1px]">
              <div className="min-w-[240px] rounded-[16px] border border-cyan-200/15 bg-black/75 p-4 text-center shadow-[0_18px_48px_-28px_rgba(103,232,249,.55)]">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan-100" />
                <p className="mt-3 text-[13px] font-bold text-white">
                  {progress?.message ?? (th ? "กำลังสร้างซับ" : "Generating subtitles")}
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-cyan-200 transition-all"
                    style={{ width: `${Math.max(4, Math.min(100, progress?.progress ?? 12))}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/[0.055] bg-[#151617] p-2.5">
          {results.length > 0 && (
            <div className="mb-2">
              <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">
                  {th ? "ผลลัพธ์ล่าสุด" : "Recent results"}
                </span>
                <span className="text-[10px] font-semibold text-zinc-600">
                  {results.length}
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {results.slice(0, 10).map((result) => {
                  const selected = isRenderedResultPreview && activeResult?.id === result.id;
                  return (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => {
                        setSelectedResultId(result.id);
                        setPreviewMode("result");
                      }}
                      className={cn(
                        "grid w-[86px] shrink-0 gap-1 rounded-[9px] border p-1 text-left transition",
                        selected
                          ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/12"
                          : "border-white/[0.065] bg-white/[0.035] hover:border-white/18 hover:bg-white/[0.055]",
                      )}
                      title={result.outputName}
                      aria-label={result.outputName}
                    >
                      <span className="relative h-[44px] overflow-hidden rounded-[7px] bg-black">
                        <video
                          src={result.outputUrl}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover opacity-90"
                        />
                        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[8px] font-bold text-white">
                          {result.outputExtension.toUpperCase()}
                        </span>
                      </span>
                      <span className={cn(
                        "block truncate text-[10px] font-bold",
                        selected ? "text-[var(--brand-primary)]" : "text-zinc-300",
                      )}>
                        {autoSubtitleShortFileName(result.outputName)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div
            ref={timelineRef}
            onPointerDown={handleTimelinePointerDown}
            onPointerMove={handleTimelinePointerMove}
            className="relative grid grid-cols-[132px_minmax(0,1fr)] gap-y-1.5 text-[11px]"
          >
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-[var(--brand-primary)]/95 shadow-[0_0_12px_rgba(244,255,0,.8)]"
              style={{ left: `calc(132px + (100% - 132px) * ${progressPercent / 100})` }}
            >
              <span className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rounded-[3px] bg-[var(--brand-primary)] shadow-[0_0_12px_rgba(244,255,0,.9)]" />
            </div>
            <div className="flex h-7 items-center gap-1.5 rounded-l-[8px] bg-[#121314] px-2 font-mono text-[10px] font-bold text-zinc-300">
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  void togglePlayback();
                }}
                disabled={!playbackUrl}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/[0.08] text-zinc-100 transition hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={isPlaying ? "Pause preview" : "Play preview"}
              >
                {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </button>
              <span className="min-w-[72px] shrink-0">{autoSubtitleMiniDuration(currentTime)}</span>
            </div>
            <div
              ref={timelineTrackRef}
              className="relative h-7 min-w-0 overflow-hidden rounded-r-[8px] border border-white/[0.055] bg-[#111214]"
            >
              {timelineTicks.map((tick) => {
                const left = Math.max(0, Math.min(100, (tick / displayDuration) * 100));
                const isFirst = tick <= 0.01;
                const isLast = Math.abs(tick - displayDuration) <= 0.01;
                return (
                  <span
                    key={`tick-${tick.toFixed(2)}`}
                    className="pointer-events-none absolute inset-y-0 flex items-start border-l border-white/[0.08] pt-1 font-mono text-[9px] font-bold text-zinc-500"
                    style={{
                      left: `${left}%`,
                      transform: isFirst ? "translateX(0)" : isLast ? "translateX(-100%)" : "translateX(-50%)",
                    }}
                  >
                    <span className={cn(
                      "whitespace-nowrap px-1",
                      isFirst ? "pl-0" : isLast ? "pr-0" : "",
                    )}>
                      {autoSubtitleMiniDuration(tick)}
                    </span>
                  </span>
                );
              })}
            </div>
            <div className="flex h-8 items-center rounded-l-[8px] bg-[#1b151f] px-2 font-bold text-purple-200">
              {th ? "Subtitle" : "Subtitle"}
            </div>
            <div className="relative h-8 min-w-0 overflow-hidden rounded-r-[8px] bg-[#120f16] px-1.5">
              {timelineCues.length > 0 ? (
                timelineCues.map((cue) => {
                  const left = Math.max(0, Math.min(100, (cue.start / displayDuration) * 100));
                  const width = Math.max(2.8, Math.min(100 - left, ((cue.end - cue.start) / displayDuration) * 100));
                  const active = activeCue?.id === cue.id || selectedCueId === cue.id;
                  return (
                    <button
                      key={cue.id}
                      type="button"
                      onClick={() => handleCueClick(cue)}
                      onPointerDown={(event) => beginCueDrag(event, cue, "move")}
                      onPointerMove={handleCueDragMove}
                      onPointerUp={handleCueDragEnd}
                      onPointerCancel={handleCueDragEnd}
                      className={cn(
                        "absolute top-1 flex h-6 min-w-[34px] cursor-grab touch-none items-center justify-center truncate rounded-[7px] border px-2 text-[10px] font-bold transition active:cursor-grabbing",
                        active
                          ? "border-purple-200 bg-purple-500/75 text-white shadow-[0_0_14px_rgba(216,180,254,.34)]"
                          : "border-purple-300/20 bg-purple-700/45 text-purple-50 hover:border-purple-200/55",
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={th ? "ลากเพื่อย้ายเวลา จับขอบเพื่อยืด/หดช่วง subtitle" : "Drag to move timing. Drag edges to resize."}
                    >
                      <span
                        role="presentation"
                        onPointerDown={(event) => beginCueDrag(event, cue, "start")}
                        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-[7px] bg-white/0 hover:bg-white/20"
                      />
                      <span className="truncate">{cue.text}</span>
                      <span
                        role="presentation"
                        onPointerDown={(event) => beginCueDrag(event, cue, "end")}
                        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-[7px] bg-white/0 hover:bg-white/20"
                      />
                    </button>
                  );
                })
              ) : (
                <div className="flex h-full items-center px-2 text-[10px] font-semibold text-zinc-600">
                  {th ? "ยังไม่มี subtitle track" : "No subtitle track yet"}
                </div>
              )}
            </div>
            <div className="flex h-7 items-center rounded-l-[8px] bg-[#101826] px-2 font-bold text-sky-200">
              {th ? "Media" : "Media"}
            </div>
            <div
              className="relative h-7 min-w-0 overflow-hidden rounded-r-[8px] bg-sky-500/25"
              onClick={() => seekTo(0)}
            >
              <div className="absolute inset-y-1 left-1 right-1 rounded-[6px] border border-sky-200/25 bg-sky-500/35" />
              <span className="absolute inset-y-0 left-3 flex max-w-[75%] items-center truncate text-[10px] font-semibold text-sky-50">
                {sourceName}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AutoSubtitleMiniCue {
  id: string;
  text: string;
  start: number;
  end: number;
}

interface AutoSubtitleMiniCueTiming {
  start: number;
  end: number;
}

interface AutoSubtitleMiniCueDrag {
  id: string;
  mode: "move" | "start" | "end";
  startX: number;
  originalStart: number;
  originalEnd: number;
  trackWidth: number;
  duration: number;
}

function autoSubtitleMiniCues({
  cues,
  text,
  language,
  segmentationMode,
  wordsPerLine,
  durationSeconds,
}: {
  cues?: AutoSuptitleCue[] | null;
  text?: string | null;
  language: ReturnType<typeof useLanguage>["language"];
  segmentationMode: AutoSubtitleSegmentationMode;
  wordsPerLine: number;
  durationSeconds: number;
}): AutoSubtitleMiniCue[] {
  if (Array.isArray(cues) && cues.length > 0) {
    return cues
      .map((cue, index) => {
        const start = Math.max(0, Number(cue.startTime) || 0);
        const end = Math.max(start + 0.12, Number(cue.endTime) || start + 0.8);
        const textValue = String(cue.text ?? "").replace(/\s+/g, " ").trim();
        if (!textValue) return null;
        return {
          id: `cue-${index}-${start.toFixed(2)}`,
          text: textValue,
          start,
          end,
        } satisfies AutoSubtitleMiniCue;
      })
      .filter((cue): cue is AutoSubtitleMiniCue => Boolean(cue))
      .sort((a, b) => a.start - b.start)
      .slice(0, 80);
  }

  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentenceParts = clean
    .split(/(?<=[.!?。！？])\s+|[|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  let parts: string[];
  if (segmentationMode === "sentence" && sentenceParts.length > 1) {
    parts = sentenceParts.slice(0, 24);
  } else {
    const tokens = clean.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?|[\u0E00-\u0E7F]+|[^\s]/g) ?? [];
    const groupSize = segmentationMode === "words"
      ? Math.max(1, Math.min(AUTO_SUBTITLE_MAX_WORD_SPLIT, wordsPerLine || 4))
      : 4;
    parts = [];
    for (let index = 0; index < tokens.length; index += groupSize) {
      parts.push(tokens.slice(index, index + groupSize).join(" "));
    }
  }
  const duration = Math.max(1, durationSeconds || parts.length * 1.25);
  const slot = duration / Math.max(1, parts.length);
  return parts.slice(0, 80).map((part, index) => ({
    id: `fallback-${index}`,
    text: part,
    start: index * slot,
    end: Math.min(duration, Math.max(index * slot + 0.6, (index + 1) * slot - 0.04)),
  }));
}

function autoSubtitleLastCueEnd(cues: readonly AutoSubtitleMiniCue[]): number {
  return cues.reduce((end, cue) => Math.max(end, cue.end), 0);
}

function autoSubtitleApplyCueTimingEdits(
  cues: readonly AutoSubtitleMiniCue[],
  edits: Record<string, AutoSubtitleMiniCueTiming>,
  duration: number,
): AutoSubtitleMiniCue[] {
  const safeDuration = Math.max(0.2, duration);
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const applied: AutoSubtitleMiniCue[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const cue = sorted[index];
    const edit = edits[cue.id];
    const minDuration = 0.16;
    const previousEnd = applied[applied.length - 1]?.end ?? 0;
    const nextStart = sorted[index + 1]?.start ?? safeDuration;
    const requestedStart = edit?.start ?? cue.start;
    const requestedEnd = edit?.end ?? cue.end;
    const start = Math.max(
      previousEnd,
      Math.min(requestedStart, Math.max(previousEnd, nextStart - minDuration)),
    );
    const end = Math.max(
      start + minDuration,
      Math.min(requestedEnd, safeDuration, nextStart),
    );
    applied.push({
      ...cue,
      start: Number(start.toFixed(3)),
      end: Number(Math.min(safeDuration, end).toFixed(3)),
    });
  }
  return applied;
}

function autoSubtitleClampCueTiming(
  cues: readonly AutoSubtitleMiniCue[],
  cueId: string,
  start: number,
  end: number,
  duration: number,
): AutoSubtitleMiniCueTiming {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const index = sorted.findIndex((cue) => cue.id === cueId);
  const minDuration = 0.16;
  const prevEnd = index > 0 ? sorted[index - 1].end : 0;
  const nextStart = index >= 0 && index < sorted.length - 1 ? sorted[index + 1].start : duration;
  const originalLength = Math.max(minDuration, end - start);
  let nextStartValue = Math.max(prevEnd, Math.min(start, duration - minDuration));
  let nextEndValue = Math.max(nextStartValue + minDuration, Math.min(end, duration));

  if (nextEndValue > nextStart) {
    nextEndValue = Math.max(prevEnd + minDuration, nextStart);
    if (nextStartValue + minDuration > nextEndValue) {
      nextStartValue = Math.max(prevEnd, nextEndValue - minDuration);
    }
  }
  if (nextStartValue < prevEnd) {
    nextStartValue = prevEnd;
    nextEndValue = Math.min(duration, nextStartValue + originalLength);
  }
  if (nextEndValue - nextStartValue < minDuration) {
    nextEndValue = Math.min(duration, nextStartValue + minDuration);
  }
  return {
    start: Number(nextStartValue.toFixed(3)),
    end: Number(nextEndValue.toFixed(3)),
  };
}

function autoSubtitleMiniCueAtTime(
  cues: readonly AutoSubtitleMiniCue[],
  time: number,
): AutoSubtitleMiniCue | null {
  return cues.find((cue) => time >= cue.start - 0.04 && time < cue.end) ?? null;
}

function autoSubtitleMiniActiveCue(
  cues: readonly AutoSubtitleMiniCue[],
  currentTime: number,
  selectedCueId: string | null,
  isPlaying: boolean,
): AutoSubtitleMiniCue | null {
  const currentCue = autoSubtitleMiniCueAtTime(cues, currentTime);
  if (currentCue) return currentCue;
  if (!isPlaying && selectedCueId) {
    return cues.find((cue) => cue.id === selectedCueId) ?? null;
  }
  return null;
}

function autoSubtitleMiniTimelineTicks(durationSeconds: number): number[] {
  const duration = Math.max(1, Number(durationSeconds) || 1);
  const niceIntervals = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const rawInterval = duration / 5;
  const interval =
    niceIntervals.find((candidate) => candidate >= rawInterval) ??
    niceIntervals[niceIntervals.length - 1];
  const ticks: number[] = [0];
  for (let tick = interval; tick < duration; tick += interval) {
    ticks.push(tick);
  }
  const last = ticks[ticks.length - 1] ?? 0;
  if (duration - last < interval * 0.35 && ticks.length > 1) {
    ticks[ticks.length - 1] = duration;
  } else if (Math.abs(duration - last) > 0.25) {
    ticks.push(duration);
  }
  return ticks;
}

function autoSubtitleShortFileName(name: string, maxLength = 24): string {
  const clean = name.replace(/[?#].*$/, "").split(/[\\/]/).pop()?.trim() || name;
  if (clean.length <= maxLength) return clean;
  const extensionMatch = clean.match(/(\.[a-z0-9]{2,5})$/i);
  const extension = extensionMatch?.[1] ?? "";
  const base = extension ? clean.slice(0, -extension.length) : clean;
  const keep = Math.max(8, maxLength - extension.length - 3);
  return `${base.slice(0, keep)}...${extension}`;
}

function autoSubtitleMiniDuration(seconds: number | null | undefined): string {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `00:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
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
  const [layoutMode, setLayoutMode] = useState<"grid" | "row">("grid");
  const { language, t } = useLanguage();
  const onStandaloneCropConfirmed = (blob: Blob, filename: string) => {
    const cleanName = filename.replace(/\.[a-z0-9]{2,5}$/i, "") || "crop";
    triggerBlobDownload(blob, buildDownloadFilename(cleanName, "png"));
    toast.success(t("workspace.stock.download_started"));
  };
  const viewModes: Array<{
    id: "grid" | "row";
    label: string;
    icon: typeof LayoutGrid;
  }> = [
    { id: "grid", label: language === "th" ? "กริด" : "Grid", icon: LayoutGrid },
    { id: "row", label: language === "th" ? "แถว" : "Row", icon: Rows3 },
  ];

  return (
    <>
      <div className="mb-2.5 flex min-h-0 items-center justify-start">
        <div className="inline-flex h-7 items-center gap-0.5 rounded-[8px] bg-[#1b1b1b]/95 p-[2px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]">
          {viewModes.map((mode) => {
            const active = layoutMode === mode.id;
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                type="button"
                aria-label={mode.label}
                aria-pressed={active}
                title={mode.label}
                onClick={() => setLayoutMode(mode.id)}
                className={cn(
                  "grid h-[22px] w-[24px] place-items-center rounded-[5px] text-zinc-400 transition",
                  active
                    ? "bg-white text-zinc-950 shadow-[0_8px_18px_rgba(0,0,0,0.24)]"
                    : "hover:bg-white/[0.07] hover:text-white",
                )}
              >
                <Icon className="h-[12px] w-[12px]" />
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
      ) : (
        <div
          className={cn(
            layoutMode === "grid"
              ? "flex flex-wrap items-start gap-2"
              : "flex flex-col gap-2",
          )}
        >
          {jobs.map((job) =>
            layoutMode === "grid" ? (
              <CreationTile
                key={job.id}
                job={job}
                onPreview={setPreview}
                onDelete={() => onDeleteJob(job)}
              />
            ) : (
              <CreationRow
                key={job.id}
                job={job}
                onPreview={setPreview}
                onDelete={() => onDeleteJob(job)}
              />
            ),
          )}
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

const MODEL_FILE_RE = /\.(glb|gltf|usdz|obj|fbx|stl|3mf)(?:[?#].*)?$/i;
const MODEL_VIEWER_FILE_RE = /\.(glb|gltf|usdz)(?:[?#].*)?$/i;
const REFERENCE_MEDIA_FILE_RE = /\.(png|jpe?g|webp|gif|mp4|mov|webm|m4v|mp3|wav|m4a|aac|glb|gltf|usdz|obj|fbx|stl|3mf)(?:[?#].*)?$/i;
const MODEL_PREVIEW_THUMB_EVENT = "mediaforge:3d-model-thumb-ready";
const MODEL_PREVIEW_THUMB_CACHE = new Map<string, string>();

type ModelPreviewThumbEventDetail = {
  key: string;
  dataUrl: string;
};

type ModelViewerElement = HTMLElement & {
  toDataURL?: (type?: string, encoderOptions?: number) => string;
};

const firstText = (...values: Array<unknown>): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

function modelUrlFromReference(
  reference: Pick<UploadedRef, "modelUrl" | "url"> | null | undefined,
): string | undefined {
  if (!reference) return undefined;
  return firstText(reference.modelUrl, MODEL_FILE_RE.test(reference.url) ? reference.url : "");
}

function posterUrlFromReference(
  reference: Pick<UploadedRef, "previewUrl" | "url" | "modelUrl"> | null | undefined,
): string | undefined {
  if (!reference) return undefined;
  return firstText(reference.previewUrl, !MODEL_FILE_RE.test(reference.url) ? reference.url : "");
}

function canInlineModelViewer(url: string | undefined): boolean {
  return MODEL_VIEWER_FILE_RE.test(url ?? "");
}

function modelFileExtension(url: string | undefined, name?: string): string {
  const source = firstText(name, url) ?? "";
  const match = source.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i);
  return (match?.[1]?.toLowerCase() || "glb").replace(/[^a-z0-9]/g, "") || "glb";
}

function modelPreviewCacheKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.split(/[?#]/)[0] || url;
  }
}

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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function storageBucketFromUnknown(value: unknown): "ai-media" | "user_assets" | undefined {
  const bucket = firstText(value);
  return bucket === "ai-media" || bucket === "user_assets" ? bucket : undefined;
}

function storedCaptionSettings(value: unknown): CaptionStyleSettings | null {
  if (!isPlainRecord(value)) return null;
  const stroke = isPlainRecord(value.stroke) ? value.stroke : {};
  const shadow = isPlainRecord(value.shadow) ? value.shadow : {};
  const background = isPlainRecord(value.background) ? value.background : {};
  return normalizeCaptionSettings({
    ...DEFAULT_CAPTION_SETTINGS,
    ...value,
    stroke: {
      ...DEFAULT_CAPTION_SETTINGS.stroke,
      ...stroke,
    },
    shadow: {
      ...DEFAULT_CAPTION_SETTINGS.shadow,
      ...shadow,
    },
    background: {
      ...DEFAULT_CAPTION_SETTINGS.background,
      ...background,
    },
  } as CaptionStyleSettings);
}

function storedAutoSubtitleCues(value: unknown): AutoSuptitleCue[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((rawCue) => {
      if (!isPlainRecord(rawCue)) return null;
      const startTime = firstFiniteNumber(rawCue.startTime, rawCue.start_time, rawCue.start);
      const endTime = firstFiniteNumber(rawCue.endTime, rawCue.end_time, rawCue.end);
      const text = firstText(rawCue.text, rawCue.word);
      if (startTime == null || endTime == null || !text || endTime <= startTime) {
        return null;
      }
      const rawWords = Array.isArray(rawCue.words) ? rawCue.words : [];
      const words = rawWords
        .map((rawWord) => {
          if (!isPlainRecord(rawWord)) return null;
          const wordText = firstText(rawWord.text, rawWord.word);
          const start = firstFiniteNumber(rawWord.start);
          const end = firstFiniteNumber(rawWord.end);
          if (!wordText || start == null || end == null || end < start) return null;
          return { text: wordText, start, end };
        })
        .filter((word): word is AutoSuptitleCue["words"][number] => Boolean(word));
      return {
        text,
        startTime,
        endTime,
        words: words.length > 0 ? words : [{ text, start: startTime, end: endTime }],
      } satisfies AutoSuptitleCue;
    })
    .filter((cue): cue is AutoSuptitleCue => Boolean(cue));
}

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

function getStandaloneMediaUrl(result: StandaloneResult | null | undefined): string | undefined {
  const outputs = result?.outputs ?? {};
  return firstText(
    result?.url,
    (result as (StandaloneResult & { result_url?: unknown }) | null | undefined)?.result_url,
    outputs.url,
    outputs.result_url,
    outputs.output_url,
    outputs.video_url,
    outputs.output_video,
    outputs.audio_url,
    outputs.output_audio,
    outputs.image_url,
    outputs.output_image,
    outputs.provider_video_url,
    outputs.provider_audio_url,
  );
}

function normalizeStandaloneResultType(
  result: StandaloneResult | null | undefined,
  url?: string,
  modelUrl?: string,
): string {
  const raw = String(result?.type ?? result?.output_type ?? "").toLowerCase();
  if (raw === "video_url") return "video";
  if (raw === "audio_url") return "audio";
  if (raw === "image_url") return "image";
  if (raw) return raw;
  if (modelUrl) return "model3d";
  const cleanUrl = (url ?? "").split(/[?#]/)[0].toLowerCase();
  if (/\.(mp4|mov|webm|m4v)$/.test(cleanUrl)) return "video";
  if (/\.(mp3|m4a|aac|wav)$/.test(cleanUrl)) return "audio";
  if (/\.(png|jpe?g|webp|gif)$/.test(cleanUrl)) return "image";
  return "";
}

function inferModelMime(url: string | undefined): string {
  const cleanUrl = (url ?? "").split(/[?#]/)[0].toLowerCase();
  if (cleanUrl.endsWith(".gltf")) return "model/gltf+json";
  if (cleanUrl.endsWith(".usdz")) return "model/vnd.usdz+zip";
  if (cleanUrl.endsWith(".obj")) return "model/obj";
  if (cleanUrl.endsWith(".fbx")) return "model/fbx";
  if (cleanUrl.endsWith(".stl")) return "model/stl";
  if (cleanUrl.endsWith(".3mf")) return "model/3mf";
  return "model/gltf-binary";
}

function referenceCategoryForUpload(contentType: string, isModelFile: boolean): string {
  if (isModelFile) return "model_3d";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("image/")) return "image";
  return "reference";
}

function isModel3dUploadFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (/\.(glb|obj|fbx|stl)$/i.test(name)) return true;
  return /^(model\/|application\/octet-stream$)/i.test(file.type) && /\.(glb|obj|fbx|stl)$/i.test(name);
}

function isStandaloneModel3dReference(
  reference: Pick<UploadedRef, "mime" | "url" | "modelUrl"> | null | undefined,
): boolean {
  if (!reference) return false;
  const mime = reference.mime?.toLowerCase() ?? "";
  if (mime.startsWith("model/")) return true;
  return MODEL_FILE_RE.test(reference.modelUrl ?? reference.url);
}

function firstUuidFromText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
}

function tripoModelTaskIdFromResult(result: StandaloneResult | null | undefined): string {
  if (!result) return "";
  const meta = result.provider_meta ?? {};
  const outputs = result.outputs ?? {};
  const modelUrl = getStandaloneModelUrl(result);
  return firstText(
    meta.tripo_model_task_id,
    meta.original_model_task_id,
    meta.source_model_task_id,
    meta.provider_task_id,
    meta.task_id,
    result.task_id,
    firstUuidFromText(modelUrl),
    firstUuidFromText(outputs.model_url),
  );
}

function tripoModelTaskIdFromReference(
  reference: Pick<UploadedRef, "tripoModelTaskId" | "originalModelTaskId" | "providerTaskId" | "taskId" | "providerMeta" | "modelUrl"> | null | undefined,
): string {
  if (!reference) return "";
  const meta = reference.providerMeta ?? {};
  return firstText(
    reference.tripoModelTaskId,
    reference.originalModelTaskId,
    reference.providerTaskId,
    reference.taskId,
    meta.tripo_model_task_id,
    meta.original_model_task_id,
    meta.source_model_task_id,
    meta.provider_task_id,
    meta.task_id,
    firstUuidFromText(reference.modelUrl),
  );
}

function isRiggedTripoSourceReference(reference: UploadedRef | null | undefined): boolean {
  if (!reference) return false;
  return (
    reference.nodeType === "tripoRigNode" ||
    reference.nodeType === "tripoAnimateNode" ||
    reference.providerMeta?.task_type === "animate_rig" ||
    reference.providerMeta?.task_type === "animate_retarget"
  );
}

function model3dInputFromReference(
  reference: UploadedRef | null | undefined,
): Record<string, unknown> | null {
  if (!reference) return null;
  const modelUrl = firstText(reference.modelUrl, MODEL_FILE_RE.test(reference.url) ? reference.url : "");
  const taskId = tripoModelTaskIdFromReference(reference);
  if (!taskId) return null;
  return {
    url: modelUrl || reference.url,
    model_url: modelUrl,
    source_model_url: modelUrl,
    preview_url: firstText(reference.previewUrl, !MODEL_FILE_RE.test(reference.url) ? reference.url : ""),
    task_id: taskId,
    tripo_model_task_id: taskId,
    original_model_task_id: taskId,
    provider_task_id: firstText(reference.providerTaskId, reference.taskId, taskId),
    provider_meta: reference.providerMeta ?? {},
  };
}

function externalModel3dInputFromReference(
  reference: UploadedRef | null | undefined,
): Record<string, unknown> | null {
  if (!reference) return null;
  const modelUrl = firstText(reference.modelUrl, MODEL_FILE_RE.test(reference.url) ? reference.url : "");
  if (!modelUrl) return null;
  const name = reference.name || "model.glb";
  const extension = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
    ?? modelUrl.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
    ?? "";
  return {
    url: modelUrl,
    model_url: modelUrl,
    source_model_url: modelUrl,
    file_name: name,
    format: extension,
    preview_url: firstText(reference.previewUrl, !MODEL_FILE_RE.test(reference.url) ? reference.url : ""),
    provider_meta: reference.providerMeta ?? {},
  };
}

function inferReferenceMime(url: string | undefined, fallback?: unknown): string {
  const value = typeof fallback === "string" ? fallback.toLowerCase() : "";
  if (value.startsWith("image/") || value.startsWith("video/") || value.startsWith("audio/")) return value;
  if (value.startsWith("model/")) return value;
  if (value.includes("video")) return "video/mp4";
  if (value.includes("audio")) return "audio/mpeg";
  if (value.includes("image")) return "image/jpeg";
  const cleanUrl = (url ?? "").split(/[?#]/)[0].toLowerCase();
  if (MODEL_FILE_RE.test(cleanUrl)) return inferModelMime(cleanUrl);
  if (/\.(mp4|mov|webm|m4v)$/i.test(cleanUrl)) return "video/mp4";
  if (/\.(mp3|m4a|aac)$/i.test(cleanUrl)) return "audio/mpeg";
  if (/\.(wav)$/i.test(cleanUrl)) return "audio/wav";
  if (/\.(png)$/i.test(cleanUrl)) return "image/png";
  if (/\.(webp)$/i.test(cleanUrl)) return "image/webp";
  if (/\.(gif)$/i.test(cleanUrl)) return "image/gif";
  return "image/jpeg";
}

function referenceFromGenerationJob(job: StandaloneJobRow): UploadedRef | null {
  if (job.node_type === "tripoPreRigCheckNode") return null;
  if (job.status !== "completed") return null;
  const result = job.result;
  if (!result) return null;
  const modelUrl = getStandaloneModelUrl(result);
  const posterUrl = getStandalonePosterUrl(result, modelUrl);
  const outputs = result.outputs ?? {};
  const type = String(result.type ?? "");
  if (modelUrl) {
    const params = job.request?.params ?? {};
    const providerMeta = result.provider_meta ?? {};
    const taskId = tripoModelTaskIdFromResult(result);
    return {
      id: `job-${job.id}`,
      source: "generation",
      assetId: job.id,
      name: uploadedReferenceName(
        firstText(outputs.file_name, outputs.filename, modelUrl),
        modelUrl,
        String(params.nodeName ?? params.model_name ?? job.model ?? "3d-model"),
      ),
      url: posterUrl ?? modelUrl,
      modelUrl,
      previewUrl: posterUrl,
      mime: inferModelMime(modelUrl),
      taskId: firstText(result.task_id, providerMeta.task_id),
      tripoModelTaskId: taskId,
      originalModelTaskId: firstText(
        providerMeta.original_model_task_id,
        providerMeta.source_model_task_id,
        taskId,
      ),
      providerTaskId: firstText(providerMeta.provider_task_id, result.task_id),
      providerMeta,
      nodeType: job.node_type,
    };
  }
  const videoUrl = firstText(
    type === "video" ? result.url : undefined,
    outputs.video_url,
    outputs.output_video,
  );
  const audioUrl = firstText(
    type === "audio" ? result.url : undefined,
    outputs.audio_url,
    outputs.output_audio,
    outputs.provider_audio_url,
  );
  const imageUrl = firstText(
    type === "image" ? result.url : undefined,
    outputs.image_url,
    outputs.output_image,
    outputs.rendered_image,
    outputs.preview_image,
    posterUrl,
  );
  const url = videoUrl ?? audioUrl ?? imageUrl;
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
    mime: videoUrl ? "video/mp4" : audioUrl ? "audio/mpeg" : "image/jpeg",
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

function autoSubtitleStorageKey(
  bucket?: "ai-media" | "user_assets" | null,
  path?: string | null,
): string {
  const cleanBucket = String(bucket ?? "").trim().toLowerCase();
  const cleanPath = String(path ?? "")
    .trim()
    .replace(/^\/+/, "")
    .split(/[?#]/)[0]
    .toLowerCase();
  if (!cleanBucket || !cleanPath) return "";
  return `${cleanBucket}/${cleanPath}`;
}

function autoSubtitleStorageKeyFromUrl(rawUrl?: string | null): string {
  if (!rawUrl) return "";
  const pointer = storagePointerFromReferenceUrl(rawUrl);
  return autoSubtitleStorageKey(pointer.storageBucket, pointer.storagePath);
}

function autoSubtitleComparableUrl(rawUrl?: string | null): string {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}${decodeURIComponent(parsed.pathname)}`.toLowerCase();
  } catch {
    return String(rawUrl).trim().replace(/^\/+/, "").split(/[?#]/)[0].toLowerCase();
  }
}

function autoSubtitleComparableName(rawName?: string | null): string {
  const fileName = String(rawName ?? "")
    .trim()
    .split(/[\\/]/)
    .pop()
    ?.split(/[?#]/)[0]
    .replace(/\.[^.]+$/, "") ?? "";
  return fileName
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, "");
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

function storageObjectUrl(bucket: "ai-media" | "user_assets", path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl ?? `${bucket}/${path}`;
}

async function createStorageSignedUrl(
  bucket: "ai-media" | "user_assets",
  path: string,
): Promise<string> {
  const signedUrl = await getSignedUrl(`${bucket}/${path.replace(/^\/+/, "")}`);
  if (!/^https?:\/\//i.test(signedUrl)) {
    throw new Error("Could not create signed URL: object not found");
  }
  return signedUrl;
}

function isMissingProjectIdColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  const message = String(error?.message ?? "");
  return error?.code === "42703" || error?.code === "PGRST204" || /project_id/i.test(message);
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

async function fetchProjectAutoSubtitleResultAssets(
  userId: string,
  projectId: string,
): Promise<ProjectReferenceAssetRow[]> {
  const select = "*";
  const base = () =>
    supabase
      .from("user_assets")
      .select(select)
      .eq("user_id", userId)
      .eq("source", AUTO_SUBTITLE_RESULT_SOURCE)
      .order("created_at", { ascending: false })
      .limit(30);

  const scoped = await base().eq("project_id", projectId);
  if (!scoped.error) return (scoped.data ?? []) as ProjectReferenceAssetRow[];

  if (!isMissingProjectIdColumn(scoped.error)) {
    console.warn("[AutoSubtitle] result load failed:", scoped.error.message);
    return [];
  }

  const fallback = await base();
  if (fallback.error) {
    console.warn("[AutoSubtitle] result load fallback failed:", fallback.error.message);
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
  if (!rawUrl) return null;
  const storagePointer = storagePointerFromReferenceUrl(rawUrl);
  const mime = inferReferenceMime(
    rawUrl,
    firstText(row.file_type, row.mime_type, row.type, metadata.mime_type, metadata.content_type),
  );
  const isModel = mime.startsWith("model/") || MODEL_FILE_RE.test(rawUrl);
  if (!mime.startsWith("image/") && !mime.startsWith("video/") && !mime.startsWith("audio/") && !isModel) return null;
  const signedUrl = await getSignedUrl(rawUrl);
  const taskId = firstText(
    metadata.tripo_model_task_id,
    metadata.original_model_task_id,
    metadata.provider_task_id,
    metadata.task_id,
  );
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
    modelUrl: isModel ? signedUrl : undefined,
    tripoModelTaskId: taskId,
    originalModelTaskId: taskId,
    providerTaskId: taskId,
    providerMeta: metadata.provider_meta && typeof metadata.provider_meta === "object"
      ? (metadata.provider_meta as Record<string, unknown>)
      : {},
  };
}

async function freshElevenLabsDubbingDownloadUrl(
  job: StandaloneJobRow,
): Promise<string | null> {
  if (job.node_type !== "voiceTranslateNode" || job.provider !== "elevenlabs_dubbing") {
    return null;
  }
  const result = job.result ?? {};
  const providerMeta = result.provider_meta ?? {};
  const params = job.request?.params ?? {};
  const dubbingId = firstText(result.task_id, providerMeta.dubbing_id);
  if (!dubbingId) return null;
  const { data, error } = await supabase.functions.invoke(
    ELEVENLABS_DUBBING_EDGE_FUNCTION,
    {
      body: {
        action: "status",
        job_id: job.id,
        dubbing_id: dubbingId,
        output_language: firstText(params.output_language, providerMeta.output_language),
      },
    },
  );
  if (error) throw new Error(await functionErrorMessage(error));
  const payload = data as {
    output_url?: string;
    error?: string;
  } | null;
  if (payload?.error) throw new Error(payload.error);
  return firstText(payload?.output_url, getStandaloneMediaUrl(result)) ?? null;
}

function withElevenLabsDownloadIntent(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.searchParams.get("action") === "download" &&
      parsed.pathname.includes("/elevenlabs-dubbing")
    ) {
      parsed.searchParams.set("download", "1");
      return parsed.toString();
    }
  } catch {
    // Keep the original URL if it is relative or otherwise unparsable.
  }
  return url;
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
  const ctxMenu = useMediaContextMenu();
  const result = job.result;
  const params = job.request?.params ?? {};
  const prompt = String(params.prompt ?? "");
  const title =
    prompt.trim().slice(0, 90) ||
    String(
      params.nodeName ??
        (isUpscaleStandaloneJob(job) ? UPSCALE_MEDIAFORGE_LABEL : params.model_name) ??
        job.model ??
        t("workspace.standalone.generation_fallback"),
    );
  const url = getStandaloneMediaUrl(result);
  const modelUrl = getStandaloneModelUrl(result);
  const resultType = normalizeStandaloneResultType(result, url, modelUrl);
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
  const modelName =
    isVoiceTranslateStandaloneJob(job)
      ? "Translate"
      : standaloneJobModelLabel(job, params);
  const generatedAtLabel = formatDate(job.completed_at ?? job.created_at, language);
  const downloadUrl = modelUrl ?? playbackUrl;
  const downloadBaseName =
    prompt.trim() ||
    String(params.nodeName ?? t("workspace.standalone.generation_fallback"));
  const downloadExt = isModel3d
    ? "glb"
    : resultType === "audio"
      ? "mp3"
      : resultType === "video"
        ? "mp4"
        : resultType === "image"
          ? "png"
          : undefined;
  const downloadName = downloadExt
    ? buildDownloadFilename(downloadBaseName, downloadExt)
    : downloadBaseName;
  const isActive = job.status === "queued" || job.status === "running";
  const isFailed = job.status === "failed" || job.status === "permanent_failed";
  const canDelete = !isActive;
  const failureMessage = isFailed ? (job.error ?? job.last_error) : null;
  const urlAssetFailureMessage =
    isFailed && job.node_type === "urlAssetNode" && failureMessage
      ? failureMessage.replace(/^Validation:\s*/i, "").trim()
      : null;
  if (isFailed) {
    const failedLabel = t("workspace.standalone.status.failed");
    return (
      <article
        className={cn(
          "group inline-flex w-fit max-w-[520px] items-center gap-2 bg-red-950/70 px-3 py-2 text-[12px] font-semibold text-red-100 shadow-[inset_0_0_0_1px_rgba(248,113,113,.22)]",
          urlAssetFailureMessage ? "rounded-[14px]" : "rounded-full leading-none",
        )}
        title={failureMessage ?? failedLabel}
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="min-w-0">
          <span className="block leading-none">{failedLabel}</span>
          {urlAssetFailureMessage && (
            <span className="mt-1 block max-w-[420px] whitespace-normal text-[11px] font-medium leading-snug text-red-100/80">
              {urlAssetFailureMessage}
            </span>
          )}
        </span>
        {canDelete && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete();
            }}
            className="ml-1 grid h-6 w-6 place-items-center rounded-full text-red-200/70 transition hover:bg-red-500/20 hover:text-red-50"
            aria-label={t("workspace.mediaMenu.delete")}
            title={t("workspace.mediaMenu.delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </article>
    );
  }
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
        downloadName,
        onDownload: handleDownload,
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
        downloadName,
        onDownload: handleDownload,
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
        downloadName,
        onDownload: handleDownload,
      });
    }
  };
  const handleDownload = async () => {
    if (!downloadUrl) return;
    try {
      const freshUrl = await freshElevenLabsDubbingDownloadUrl(job);
      await downloadFromUrl(withElevenLabsDownloadIntent(freshUrl || downloadUrl), downloadName);
    } catch (err) {
      toast.error(friendlyError(err, language === "th" ? "th" : "en"));
    }
  };
  const contextMenuItems = buildMediaMenuItems(t, {
    onPreview: canOpenPreview ? openMediaPreview : undefined,
    onDownload: downloadUrl ? () => void handleDownload() : undefined,
    onDelete: canDelete ? onDelete : undefined,
  });
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
          canOpenPreview || downloadUrl || canDelete ? ctxMenu.openAt : undefined
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
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void handleDownload();
            }}
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
          <div
            className="mt-1 line-clamp-3 break-words text-[10px] leading-[12px] text-red-200"
            title={failureMessage}
          >
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
      {ctxMenu.position && (
        <MediaContextMenu
          position={ctxMenu.position}
          items={contextMenuItems}
          onClose={ctxMenu.close}
        />
      )}
    </article>
  );
}

function CreationRow({
  job,
  onPreview,
  onDelete,
}: {
  job: StandaloneJobRow;
  onPreview: (preview: PreviewPayload) => void;
  onDelete: () => void;
}) {
  const { language, t } = useLanguage();
  const result = job.result;
  const params = job.request?.params ?? {};
  const prompt = String(params.prompt ?? "");
  const title =
    prompt.trim().slice(0, 90) ||
    String(
      params.nodeName ??
        (isUpscaleStandaloneJob(job) ? UPSCALE_MEDIAFORGE_LABEL : params.model_name) ??
        job.model ??
        t("workspace.standalone.generation_fallback"),
    );

  const statusTone =
    job.status === "completed"
      ? "text-emerald-300"
      : job.status === "failed" || job.status === "permanent_failed"
        ? "text-red-300"
        : "text-amber-300";
  const url = getStandaloneMediaUrl(result);
  const modelUrl = getStandaloneModelUrl(result);
  const resultType = normalizeStandaloneResultType(result, url, modelUrl);
  const isModel3d = resultType === "model_3d" || resultType === "model3d" || !!modelUrl;
  const rawPreviewUrl = isModel3d ? getStandalonePosterUrl(result, modelUrl) : url;
  const mediaUrl = useFreshSignedUrl(url);
  const previewUrl = useFreshSignedUrl(rawPreviewUrl);
  const duration = String(params.duration ?? "");
  const ratio = String(params.ratio ?? params.aspect_ratio ?? params.size ?? "");
  const modelName = standaloneJobModelLabel(job, params);
  const playbackUrl = mediaUrl ?? url;
  const displayPreviewUrl = previewUrl ?? rawPreviewUrl;
  const downloadUrl = modelUrl ?? playbackUrl;
  const downloadBaseName =
    prompt.trim() ||
    String(params.nodeName ?? t("workspace.standalone.generation_fallback"));
  const downloadExt = isModel3d
    ? "glb"
    : resultType === "audio"
      ? "mp3"
      : resultType === "video"
        ? "mp4"
        : resultType === "image"
          ? "png"
          : undefined;
  const downloadName = downloadExt
    ? buildDownloadFilename(downloadBaseName, downloadExt)
    : downloadBaseName;
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
        downloadName,
        onDownload: handleDownload,
      });
      return;
    }
    if (canPreviewVideo && playbackUrl) {
      onPreview({
        type: "video",
        url: playbackUrl,
        label: title,
        caption: modelName,
        downloadName,
        onDownload: handleDownload,
      });
      return;
    }
    if (canPreviewAudio && playbackUrl) {
      onPreview({
        type: "audio",
        url: playbackUrl,
        label: title,
        caption: modelName,
        downloadName,
        onDownload: handleDownload,
      });
    }
  };
  const handleDownload = async () => {
    if (!downloadUrl) return;
    try {
      const freshUrl = await freshElevenLabsDubbingDownloadUrl(job);
      await downloadFromUrl(withElevenLabsDownloadIntent(freshUrl || downloadUrl), downloadName);
    } catch (err) {
      toast.error(friendlyError(err, language === "th" ? "th" : "en"));
    }
  };
  const canOpenPreview =
    !!modelUrl || canPreviewImage || canPreviewVideo || canPreviewAudio;
  const canDelete = !isActive;
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
          {(resultType === "image" || isModel3d) && displayPreviewUrl && (
            <img src={displayPreviewUrl} alt="" className="h-full w-full object-cover" />
          )}
          {resultType === "video" && playbackUrl && (
            <video
              src={playbackUrl}
              controls
              playsInline
              className="h-full w-full object-cover"
            />
          )}
          {resultType === "audio" && playbackUrl && (
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
            {resultType === "audio"
              ? t("workspace.standalone.result.audio")
              : resultType === "video"
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
              {modelName}
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
            <div
              className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-red-500/10 px-3 py-2 text-[12px] leading-[16px] text-red-200"
              title={failureMessage}
            >
              {failureMessage}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-1.5 md:flex-col">
          {downloadUrl && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleDownload();
                }}
                data-testid="standalone-download"
                className="grid h-8 w-8 place-items-center rounded-[9px] bg-white text-zinc-950 hover:bg-zinc-200"
                aria-label={t("workspace.standalone.download")}
              >
                <Download className="h-[14px] w-[14px]" />
              </button>
              {externalUrl && (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#2f2f2f] text-zinc-300 hover:bg-[#3a3a3a]"
                  aria-label={t("workspace.standalone.open_file")}
                >
                  <ExternalLink className="h-[14px] w-[14px]" />
                </a>
              )}
            </>
          )}
          {modelUrl && (
            <button
              type="button"
              onClick={openModelPreview}
              data-testid="standalone-open-3d-preview"
              className="grid h-8 w-8 place-items-center rounded-[9px] bg-amber-300 text-zinc-950 hover:bg-amber-200"
              aria-label={t("workspace.standalone.preview_3d_model")}
              title={t("workspace.standalone.preview_3d_model")}
            >
              <Box className="h-[14px] w-[14px]" />
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
              className="grid h-8 w-8 place-items-center rounded-[9px] bg-white/[0.06] text-zinc-400 transition hover:bg-red-500/15 hover:text-red-200"
              aria-label={language === "th" ? "ลบรายการ" : "Delete result"}
              title={language === "th" ? "ลบรายการ" : "Delete result"}
            >
              <Trash2 className="h-[14px] w-[14px]" />
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
    <div className="flex items-center justify-between gap-2 [line-height:12px]">
      <span className="[font-size:10px] font-bold uppercase [line-height:12px] tracking-[0.08em] text-[var(--text-default)]">
        {label}
      </span>
      {meta && <span className="[font-size:10px] [line-height:12px] text-[var(--text-tertiary)]">{meta}</span>}
    </div>
  );
}

function standaloneCanvasId(projectId: string): string {
  return `${STANDALONE_CANVAS_ID}:${projectId}`;
}

function uploadAcceptForSlot(slot: UploadSlot, model?: string): string {
  if (slot === "translate-video") return TRANSLATE_MEDIA_ACCEPT;
  if (slot === "auto-subtitle-video") return AUTO_SUBTITLE_MEDIA_ACCEPT;
  if (slot === "upscale-image") {
    return "image/*";
  }
  if (slot === "model-3d") return MODEL_3D_UPLOAD_ACCEPT;
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
      const nowMs = Date.now();
      return Array.from(byId.values()).filter((job) => isStandaloneJobVisibleInHistory(job, nowMs)).sort(
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

function useAutoSubtitleResultAssets(
  userId: string | undefined,
  projectId: string | undefined,
) {
  return useQuery<AutoSubtitleResultItem[], Error>({
    queryKey: ["standalone-auto-subtitle-results", userId, projectId],
    enabled: !!userId && !!projectId,
    staleTime: 20_000,
    queryFn: async () => {
      if (!userId || !projectId) return [];
      const rows = await fetchProjectAutoSubtitleResultAssets(userId, projectId);
      const results: AutoSubtitleResultItem[] = [];
      for (const row of rows) {
        try {
          const result = await autoSubtitleResultFromUserAsset(row);
          if (result) results.push(result);
        } catch (err) {
          console.warn("[AutoSubtitle] could not load saved result:", err);
        }
      }
      return results.sort((a, b) => b.createdAt - a.createdAt);
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
  const inferredMime = inferReferenceMime(file.name, file.type);
  const isModelFile = isModel3dUploadFile(file) || MODEL_FILE_RE.test(file.name);
  if (
    !file.type.startsWith("image/") &&
    !file.type.startsWith("video/") &&
    !file.type.startsWith("audio/") &&
    !isModelFile &&
    !isTranslateMediaFile(file)
  ) {
    throw new Error("Only image, video, audio, or 3D model references are supported on this surface.");
  }
  const uploadFile = await normalizeImageReferenceUpload(file);
  const imageDimensions = await readImageFileDimensions(uploadFile);
  const uploadIsModelFile = isModelFile || MODEL_FILE_RE.test(uploadFile.name);
  const contentType = uploadIsModelFile
    ? inferModelMime(uploadFile.name || file.name)
    : uploadFile.type || inferredMime || "application/octet-stream";
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
  const { error: uploadError } = await uploadSupabaseStorageFile(
    STORAGE_BUCKET,
    storagePath,
    uploadFile,
    {
      contentType,
      upsert: true,
    },
  );
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
  const { data, error: signError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
  if (signError || !data?.signedUrl) {
    throw new Error(`Could not create signed URL: ${signError?.message ?? ""}`);
  }
  const storageUrl = storageObjectUrl(STORAGE_BUCKET, storagePath);
  const modelFormat =
    uploadIsModelFile
      ? (uploadFile.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? undefined)
      : undefined;
  const metadata = {
    source: "standalone_reference_upload",
    storage_bucket: STORAGE_BUCKET,
    storage_path: storagePath,
    file_name: file.name,
    original_file_name: file.name,
    mime_type: contentType,
    content_type: contentType,
    project_id: projectId,
    ...(imageDimensions ? imageDimensions : {}),
    ...(uploadIsModelFile
      ? {
          model_url: storageUrl,
          source_model_url: storageUrl,
          model_format: modelFormat,
        }
      : {}),
  };
  const assetPayload: Record<string, unknown> = {
    user_id: userId,
    project_id: projectId,
    name: file.name,
    file_url: storageUrl,
    file_type: contentType,
    source: "upload",
    category: referenceCategoryForUpload(contentType, uploadIsModelFile),
    metadata,
  };
  let assetId: string | undefined;
  try {
    let insert = await supabase
      .from("user_assets")
      .insert(assetPayload as never)
      .select("*")
      .single();
    if (insert.error && isMissingProjectIdColumn(insert.error)) {
      const { project_id: _projectId, ...fallbackPayload } = assetPayload;
      insert = await supabase
        .from("user_assets")
        .insert(fallbackPayload as never)
        .select("*")
        .single();
    }
    if (insert.error) {
      console.warn("[StandaloneGenerator] user_assets insert failed:", insert.error.message);
    } else if (insert.data) {
      const row = insert.data as ProjectReferenceAssetRow;
      assetId = row.id != null ? String(row.id) : undefined;
    }
  } catch (err) {
    console.warn("[StandaloneGenerator] user_assets insert failed:", err);
  }
  return {
    id: assetId ? `user-asset-${assetId}` : (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`),
    source: assetId ? "user_asset" : "upload",
    assetId,
    storageBucket: STORAGE_BUCKET,
    storagePath,
    name: file.name,
    url: data.signedUrl,
    mime: contentType,
    modelUrl: uploadIsModelFile ? data.signedUrl : undefined,
    width: imageDimensions?.width,
    height: imageDimensions?.height,
    providerMeta: uploadIsModelFile
      ? {
          source: "external_upload",
          storage_bucket: STORAGE_BUCKET,
          storage_path: storagePath,
          model_format: modelFormat,
        }
      : undefined,
  };
}

async function autoSubtitleResultFromUserAsset(
  row: ProjectReferenceAssetRow,
): Promise<AutoSubtitleResultItem | null> {
  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const tool = firstText(metadata.tool, metadata.feature, row.source);
  if (tool !== AUTO_SUBTITLE_RESULT_METADATA_TOOL && tool !== AUTO_SUBTITLE_RESULT_SOURCE) {
    return null;
  }
  const rawUrl = firstText(
    row.file_url,
    row.url,
    row.public_url,
    metadata.file_url,
    metadata.output_url,
    metadata.storage_url,
  );
  const storedBucket = firstText(
    metadata.storage_bucket,
    metadata.output_storage_bucket,
  ) as "ai-media" | "user_assets" | undefined;
  const storedPath = firstText(metadata.storage_path, metadata.output_storage_path);
  const pointer = rawUrl ? storagePointerFromReferenceUrl(rawUrl) : {};
  const outputStorageBucket =
    storedBucket === "ai-media" || storedBucket === "user_assets"
      ? storedBucket
      : pointer.storageBucket;
  const outputStoragePath = storedPath ?? pointer.storagePath;
  if (!rawUrl && (!outputStorageBucket || !outputStoragePath)) return null;

  let outputUrl: string;
  if (outputStorageBucket && outputStoragePath) {
    outputUrl = await createStorageSignedUrl(outputStorageBucket, outputStoragePath);
  } else {
    outputUrl = await getSignedUrl(rawUrl ?? "");
  }

  const outputName =
    firstText(metadata.output_name, row.name, metadata.name) ??
    autoSubtitleOutputName("auto-subtitle", "mp4");
  const extension =
    firstText(metadata.output_extension)?.toLowerCase() === "webm" ||
    /\.webm(?:$|\?)/i.test(outputName)
      ? "webm"
      : "mp4";
  const rawMime = firstText(metadata.output_mime, row.file_type, metadata.mime_type);
  const outputMime = storageSafeAutoSubtitleMime(rawMime, extension);
  const parsedCreatedAt = Date.parse(firstText(row.created_at) ?? "");
  const createdAt =
    firstFiniteNumber(metadata.created_at_ms) ??
    (Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : Date.now());
  const duration = firstFiniteNumber(metadata.duration) ?? 0;
  const sourceStorageBucket = storageBucketFromUnknown(metadata.source_storage_bucket);
  const sourceStoragePath = firstText(metadata.source_storage_path);
  let sourceUrl = firstText(metadata.source_url) ?? "";
  if (sourceStorageBucket && sourceStoragePath) {
    try {
      sourceUrl = await createStorageSignedUrl(sourceStorageBucket, sourceStoragePath);
    } catch (err) {
      console.warn("[AutoSubtitle] could not refresh saved source URL:", err);
    }
  }
  const storedCues = storedAutoSubtitleCues(metadata.subtitle_cues);
  const storedStyle = storedCaptionSettings(metadata.subtitle_style);
  const rawMeta = isPlainRecord(metadata.subtitle_meta) ? metadata.subtitle_meta : {};
  const handoffIdFromMetadata = firstText(metadata.handoff_id);
  let handoffId = handoffIdFromMetadata ?? "";
  const hasLocalHandoff = handoffId ? Boolean(loadAutoSubtitleHandoff(handoffId)) : false;
  if ((!handoffId || !hasLocalHandoff) && storedCues.length > 0 && storedStyle && sourceUrl) {
    handoffId = saveAutoSubtitleHandoff({
      version: 1,
      feature: "auto-suptitle",
      source: {
        url: sourceUrl,
        fileName: firstText(metadata.source_name, metadata.source_file_name) ?? "Source video",
        mime: firstText(metadata.source_mime) ?? "video/mp4",
        duration,
      },
      track: {
        name: AUTO_SUPTITLE_TRACK_NAME,
        cues: storedCues,
        meta: {
          groupId:
            firstText(rawMeta.groupId, rawMeta.group_id) ??
            `${AUTO_SUPTITLE_GROUP_PREFIX}-${createdAt}`,
          generatedAt: firstFiniteNumber(rawMeta.generatedAt, rawMeta.generated_at) ?? createdAt,
          language: firstText(rawMeta.language, metadata.language) ?? "auto",
          sourceClipId: firstText(rawMeta.sourceClipId, rawMeta.source_clip_id, metadata.source_clip_id),
          animation: firstText(rawMeta.animation, metadata.animation) as CaptionAnimation | undefined,
          accentColor:
            firstText(
              rawMeta.accentColor,
              rawMeta.accent_color,
              metadata.accent_color,
              rawMeta.highlightColor,
              rawMeta.highlight_color,
              metadata.highlight_color,
            ) ?? captionAccentColor(storedStyle),
          highlightColor:
            firstText(
              rawMeta.highlightColor,
              rawMeta.highlight_color,
              metadata.highlight_color,
              rawMeta.accentColor,
              rawMeta.accent_color,
              metadata.accent_color,
            ) ?? captionAccentColor(storedStyle),
        },
      },
      style: storedStyle,
      transcriptText: firstText(metadata.transcript_text) ?? storedCues.map((cue) => cue.text).join(" "),
      createdAt,
    });
  }

  return {
    id: String(row.id ?? outputStoragePath ?? rawUrl),
    assetId: row.id != null ? String(row.id) : undefined,
    sourceName: firstText(metadata.source_name, metadata.source_file_name) ?? "Source video",
    sourceUrl,
    sourceStorageBucket,
    sourceStoragePath,
    outputUrl,
    outputName,
    outputMime,
    outputExtension: extension,
    outputStorageBucket,
    outputStoragePath,
    cueCount: firstFiniteNumber(metadata.cue_count) ?? 0,
    transcriptText: firstText(metadata.transcript_text) ?? "",
    handoffId,
    editorProjectId: firstText(metadata.editor_project_id),
    editorProjectError: firstText(metadata.editor_project_error),
    createdAt,
    duration,
  };
}

async function persistAutoSubtitleResultAsset({
  blob,
  userId,
  projectId,
  source,
  outputName,
  outputMime,
  outputExtension,
  cues,
  settings,
  trackMeta,
  cueCount,
  transcriptText,
  handoffId,
  editorProjectId,
  editorProjectError,
  duration,
  createdAt,
}: {
  blob: Blob;
  userId: string;
  projectId: string;
  source: UploadedRef;
  outputName: string;
  outputMime: string;
  outputExtension: "mp4" | "webm";
  cues: AutoSuptitleCue[];
  settings: CaptionStyleSettings;
  trackMeta: AutoSuptitleResult["meta"];
  cueCount: number;
  transcriptText: string;
  handoffId: string;
  editorProjectId?: string;
  editorProjectError?: string;
  duration: number;
  createdAt: number;
}): Promise<{
  assetId: string;
  outputUrl: string;
  storageBucket: "ai-media";
  storagePath: string;
}> {
  const safeName =
    outputName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) ||
    `auto-subtitle.${outputExtension}`;
  const storagePath = `${userId}/standalone/${projectId}/auto-subtitle/${Date.now()}-${safeName}`;
  const { error: uploadError } = await uploadSupabaseStorageFile(
    STORAGE_BUCKET,
    storagePath,
    blob,
    {
      contentType: outputMime,
      upsert: true,
    },
  );
  if (uploadError) throw new Error(`Could not save subtitle result: ${uploadError.message}`);

  const storageUrl = storageObjectUrl(STORAGE_BUCKET, storagePath);
  const metadata = {
    tool: AUTO_SUBTITLE_RESULT_METADATA_TOOL,
    feature: AUTO_SUBTITLE_RESULT_SOURCE,
    storage_bucket: STORAGE_BUCKET,
    storage_path: storagePath,
    output_name: outputName,
    output_mime: outputMime,
    output_extension: outputExtension,
    source_name: source.name,
    source_url: source.url,
    source_storage_bucket: source.storageBucket,
    source_storage_path: source.storagePath,
    source_mime: source.mime,
    source_duration: source.durationSec,
    subtitle_cues: cues,
    subtitle_style: settings,
    subtitle_meta: trackMeta,
    cue_count: cueCount,
    transcript_text: transcriptText,
    handoff_id: handoffId,
    editor_project_id: editorProjectId,
    editor_project_error: editorProjectError,
    duration,
    created_at_ms: createdAt,
  };
  const payload: Record<string, unknown> = {
    user_id: userId,
    project_id: projectId,
    name: outputName,
    file_url: storageUrl,
    file_type: outputMime,
    source: AUTO_SUBTITLE_RESULT_SOURCE,
    category: "video",
    metadata,
  };

  let insert = await supabase
    .from("user_assets")
    .insert(payload as never)
    .select("*")
    .single();
  if (insert.error && isMissingProjectIdColumn(insert.error)) {
    const { project_id: _projectId, ...fallbackPayload } = payload;
    insert = await supabase
      .from("user_assets")
      .insert(fallbackPayload as never)
      .select("*")
      .single();
  }
  if (insert.error || !insert.data) {
    throw new Error(`Could not save subtitle asset: ${insert.error?.message ?? ""}`);
  }

  return {
    assetId: String((insert.data as ProjectReferenceAssetRow).id ?? storagePath),
    outputUrl: await createStorageSignedUrl(STORAGE_BUCKET, storagePath),
    storageBucket: STORAGE_BUCKET,
    storagePath,
  };
}

async function deleteAutoSubtitleResultAsset(result: AutoSubtitleResultItem): Promise<void> {
  if (result.assetId) {
    const { error } = await supabase.from("user_assets").delete().eq("id", result.assetId);
    if (error) throw new Error(error.message);
  }
  if (result.outputStorageBucket && result.outputStoragePath) {
    const { error } = await supabase.storage
      .from(result.outputStorageBucket)
      .remove([result.outputStoragePath]);
    if (error) throw new Error(error.message);
  }
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
  if (reference.mime?.startsWith("model/")) return null;
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

function autoPromptMediaKind(reference: Pick<PanelReferenceAsset, "url" | "mime" | "name">): "image" | "video" | "audio" {
  const mime = inferReferenceMime(firstText(reference.url, reference.name), reference.mime);
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "image";
}

function autoPromptVideoSampleTimes(durationSec: number | null): number[] {
  const duration = typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0
    ? durationSec
    : 1;
  if (duration <= 0.5) return [0];
  const guard = Math.min(0.25, duration / 8);
  const candidates = [
    guard,
    duration * 0.5,
    Math.max(guard, duration - guard),
  ];
  const seen = new Set<number>();
  return candidates
    .map((value) => Math.max(0, Math.min(duration - 0.05, value)))
    .map((value) => Math.round(value * 100) / 100)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, AUTO_PROMPT_VIDEO_FRAME_COUNT);
}

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not seek reference video."));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = timeSec;
  });
}

function loadVideoElement(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const onLoaded = () => finish(() => resolve(video));
    const onError = () => finish(() => reject(new Error("Could not load reference video.")));
    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
    window.setTimeout(() => finish(() => reject(new Error("Timed out loading reference video."))), 8000);
    video.src = src;
    video.load();
  });
}

function videoFrameDataUrl(video: HTMLVideoElement): string {
  const width = video.videoWidth || 1;
  const height = video.videoHeight || 1;
  const scale = Math.min(1, AUTO_PROMPT_VIDEO_FRAME_MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a canvas for reference video frames.");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", AUTO_PROMPT_VIDEO_FRAME_JPEG_QUALITY);
}

async function extractAutoPromptVideoFrameAttachments(
  reference: PanelReferenceAsset,
): Promise<StandaloneAutoPromptAttachment[]> {
  const signedUrl = await resolveReadableMediaUrl(reference.url);
  let video: HTMLVideoElement;
  try {
    video = await loadVideoElement(signedUrl);
  } catch {
    throw new Error(
      `Video reference "${autoPromptReferenceLabel(reference, 0)}" could not be opened for Auto Prompt. Re-upload the video or use a generated/uploaded MediaForge asset.`,
    );
  }
  try {
    const label = autoPromptReferenceLabel(reference, 0);
    const times = autoPromptVideoSampleTimes(
      Number.isFinite(video.duration) ? video.duration : null,
    );
    const attachments: StandaloneAutoPromptAttachment[] = [];
    for (let i = 0; i < times.length; i += 1) {
      await seekVideo(video, times[i]);
      let dataUrl = "";
      try {
        dataUrl = videoFrameDataUrl(video);
      } catch {
        throw new Error(
          `Video reference "${label}" could not be sampled for Auto Prompt. Re-upload the video or use a generated/uploaded MediaForge asset.`,
        );
      }
      attachments.push({
        dataUrl,
        mime: "image/jpeg",
        detail: "low",
        label: `${label} frame ${i + 1}`,
        sourceNodeId: reference.id,
      });
    }
    return attachments;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

async function buildStandaloneAutoPromptAttachments(
  references: PanelReferenceAsset[],
): Promise<StandaloneAutoPromptAttachment[]> {
  const attachments: StandaloneAutoPromptAttachment[] = [];
  const seen = new Set<string>();
  for (const reference of references) {
    const mediaKind = autoPromptMediaKind(reference);
    if (mediaKind === "audio") continue;
    if (mediaKind === "video") {
      const frames = await extractAutoPromptVideoFrameAttachments(reference);
      attachments.push(...frames);
      continue;
    }

    const signedUrl = await resolveReadableMediaUrl(reference.url);
    if (!signedUrl || !/^(https?:|data:|blob:)/i.test(signedUrl)) {
      throw new Error(`Image reference "${autoPromptReferenceLabel(reference, 0)}" could not be resolved to a readable URL.`);
    }
    const refMime = inferReferenceMime(
      firstText(reference.url, reference.name),
      reference.mime,
    );
    const refLabel = autoPromptReferenceLabel(reference, 0);
    // blob: URLs are client-only; the edge function cannot fetch them, so inline
    // the bytes as a base64 data URL (the same channel video frames already use).
    if (/^blob:/i.test(signedUrl)) {
      let dataUrl: string;
      try {
        dataUrl = await blobUrlToDataUrl(signedUrl);
      } catch {
        throw new Error(
          `Image reference "${refLabel}" could not be read for Auto Prompt. Re-upload the image or use a generated/uploaded MediaForge asset.`,
        );
      }
      if (seen.has(dataUrl)) continue;
      seen.add(dataUrl);
      attachments.push({
        dataUrl,
        mime: refMime,
        detail: "low",
        label: refLabel,
        sourceNodeId: reference.id,
      });
      continue;
    }
    if (seen.has(signedUrl)) continue;
    seen.add(signedUrl);
    const isInlineData = /^data:/i.test(signedUrl);
    attachments.push({
      ...(isInlineData ? { dataUrl: signedUrl } : { imageUrl: signedUrl }),
      mime: refMime,
      detail: "low",
      label: refLabel,
      sourceNodeId: reference.id,
    });
  }
  return attachments;
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
          const mediaKind = autoPromptMediaKind(reference);
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
    "Actual image references are attached. Video references are attached as sampled frames from the real clip.",
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
  if (tool === "image_upscale") {
    const quality = ["low", "medium", "high"].includes(form.quality)
      ? form.quality
      : "medium";
    return {
      model_name: "gpt-image-2-enhance",
      mode: "enhance",
      size: gptImage2EnhanceSizeForForm(form),
      quality,
      output_format: "png",
      moderation: "auto",
      source_content_type: form.upscaleImage?.mime ?? null,
    };
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
  if (tool === "voice_translate") {
    const outputType = translateOutputTypeForMedia(form.translateVideo);
    return {
      model_name: "elevenlabs-dubbing-voice-clone",
      translate_engine: "elevenlabs_dubbing_clone",
      source_language:
        form.translateSourceLanguage.trim().toLowerCase() !== "auto"
          && isElevenLabsDubbingLanguage(form.translateSourceLanguage)
          ? form.translateSourceLanguage.trim()
          : "auto",
      output_language: form.translateOutputLanguage.trim(),
      output_type: outputType,
      speaker_num: form.translateSpeakerNum,
      source_content_type: translateSourceContentTypeForMedia(form.translateVideo),
      source_media_type: outputType,
      source_name: form.translateVideo?.name ?? null,
      voice_cloning: true,
      disable_voice_cloning: false,
      source_duration_seconds: form.translateVideo?.durationSec ?? 60,
    };
  }
  if (tool === "auto_subtitle") {
    return {
      model_name: "auto-suptitle-whisper",
      language: form.autoSubtitleLanguage,
      preset: form.autoSubtitlePresetId,
      font: form.autoSubtitleFont,
      fill: form.autoSubtitleFill,
      highlight_enabled: false,
      accent_color: form.autoSubtitleAccentColor,
      highlight_color: form.autoSubtitleAccentColor,
      position: form.autoSubtitlePosition,
      position_x: clampAutoSubtitlePosition(form.autoSubtitlePositionX, 0.5),
      position_y: clampAutoSubtitlePosition(
        form.autoSubtitlePositionY,
        autoSubtitlePositionPercentFromVertical(form.autoSubtitlePosition),
      ),
      transition: form.autoSubtitleTransition,
      out_transition: form.autoSubtitleOutTransition,
      text_animation: form.autoSubtitleTextAnimation,
      segmentation_mode: form.autoSubtitleSegmentationMode,
      words_per_line: form.autoSubtitleWordsPerLine,
      source_duration_seconds:
        form.autoSubtitleVideo?.durationSec ?? AUTO_SUBTITLE_MAX_DURATION_SEC,
    };
  }
  if (tool === "image_to_3d") {
    const mode = standaloneThreeDMode(form);
    if (mode === "auto_rig") {
      return {
        model_name: "tripo3d-rig",
        rig_type: form.rigType && form.rigType !== TRIPO_AUTO_RIG_TYPE ? form.rigType : TRIPO_AUTO_RIG_TYPE,
        spec: form.rigSpec ?? "tripo",
        out_format: form.rigOutFormat ?? "glb",
      };
    }
    if (mode === "animate") {
      const batch = String(form.animationBatch ?? "").trim();
      return {
        model_name: "tripo3d-retarget",
        ...(batch ? { animations: batch } : { animation: form.animationPreset ?? "preset:walk" }),
        out_format: form.animationOutFormat ?? "glb",
        bake_animation: String(form.animationBake ?? true),
        export_with_geometry: String(form.animationWithGeometry ?? true),
        animate_in_place: String(form.animationInPlace ?? false),
      };
    }
    return build3dParams({
      model: form.model,
      texture: form.texture,
      pbr: form.pbr,
    });
  }
  if (tool === "url_asset") {
    return {
      model_name: form.model,
      output_format: form.model,
      source_url: normalizeUrlAssetSource(form.urlAssetSource ?? ""),
      file_name: (form.urlAssetFileName ?? "").trim(),
    };
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
  if (tool === "image_upscale") {
    if (!form.upscaleImage) return {};
    return { image: form.upscaleImage.url };
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
    const mode = standaloneThreeDMode(form);
    if (mode !== "image_to_3d") {
      const payload =
        model3dInputFromReference(form.model3dSource) ??
        externalModel3dInputFromReference(form.model3dSource);
      return payload ? { model3d: payload } : {};
    }
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
  if (tool === "voice_translate") {
    if (!form.translateVideo) return {};
    const outputType = translateOutputTypeForMedia(form.translateVideo);
    return {
      media_url: form.translateVideo.url,
      ...(outputType === "audio"
        ? { audio_url: form.translateVideo.url }
        : { video_url: form.translateVideo.url }),
    };
  }
  if (tool === "auto_subtitle") {
    return form.autoSubtitleVideo ? { video_url: form.autoSubtitleVideo.url } : {};
  }
  if (tool === "url_asset") {
    return {};
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
  if (tool === "image_upscale" && !form.upscaleImage) {
    return t("workspace.standalone.validation.upscale_image");
  }
  if (tool === "image_upscale" && isUpscaleVideoSource(form)) {
    return "Upscale Mediaforge supports image input only.";
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
  if (tool === "voice_translate") {
    if (!form.translateVideo) {
      return t("workspace.standalone.validation.translate_video");
    }
    if (!form.translateOutputLanguage.trim()) {
      return t("workspace.standalone.validation.translate_language");
    }
    if (!form.translateConsent) {
      return t("workspace.standalone.validation.translate_consent");
    }
  }
  if (tool === "auto_subtitle" && !form.autoSubtitleVideo) {
    return "Upload an MP4 video before generating subtitles.";
  }
  if (
    tool === "auto_subtitle" &&
    form.autoSubtitleVideo?.durationSec &&
    !isAutoSubtitleDurationValid(form.autoSubtitleVideo.durationSec)
  ) {
    return autoSubtitleDurationMessage(form.autoSubtitleVideo.durationSec);
  }
  if (tool === "image_to_3d") {
    const mode = standaloneThreeDMode(form);
    if (mode === "image_to_3d" && threeDReferencesForForm(form).length === 0) {
      return t("workspace.standalone.validation.model_image");
    }
    if (mode !== "image_to_3d") {
      if (!form.model3dSource) {
        return "Select a completed Tripo 3D model first.";
      }
      const hasTripoTaskId = !!tripoModelTaskIdFromReference(form.model3dSource);
      const canImportExternalModel = mode === "auto_rig" && isStandaloneModel3dReference(form.model3dSource);
      if (!hasTripoTaskId && !canImportExternalModel) {
        return "This model is missing a Tripo task ID. Use a model generated by Tripo in this project.";
      }
      if (mode === "animate" && (!hasTripoTaskId || !isRiggedTripoSourceReference(form.model3dSource))) {
        return "Run Rig Assistant first, then choose the rigged result for animation.";
      }
    }
  }
  if (tool === "url_asset") {
    const rawUrl = (form.urlAssetSource ?? "").trim();
    return validateUrlAssetSource(rawUrl, form.model);
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

function buildUpscalePanelSettings({
  form,
  onChange,
  language,
}: {
  form: StandaloneFormState;
  onChange: (patch: Partial<StandaloneFormState>) => void;
  language: "en" | "th";
}): CreateVideoPanelSetting[] {
  const th = language === "th";
  return [
    {
      id: "gpt-enhance-resolution",
      label: th ? "เป้าหมาย" : "Target",
      value: form.imageResolution,
      kind: "select",
      options: ["1K", "2K", "4K"].map((value) => ({ value, label: value })),
      onChange: (imageResolution) => onChange({ imageResolution }),
    },
    {
      id: "gpt-enhance-quality",
      label: th ? "คุณภาพ" : "Quality",
      value: form.quality,
      kind: "select",
      options: (["low", "medium", "high"] as const).map((value) => ({
        value,
        label: value === "low"
          ? (th ? "ต่ำ" : "Low")
          : value === "high"
            ? (th ? "สูง" : "High")
            : (th ? "กลาง" : "Medium"),
      })),
      onChange: (quality) => onChange({ quality }),
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

function upscaleModelSettingTags(model: string, language: "en" | "th"): Array<{
  label: string;
  icon?: "reference" | "resolution";
}> {
  if (isGptImage2EnhanceModel(model)) {
    return [
      { label: `${standaloneInlineLabel("reference", language)} 1`, icon: "reference" },
      { label: "1K-4K", icon: "resolution" },
    ];
  }
  return [
    { label: `${standaloneInlineLabel("reference", language)} 1`, icon: "reference" },
    { label: "Image/Video", icon: "resolution" },
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
  if (tool === "voice_translate") {
    return jobs.filter((job) => isVoiceTranslateStandaloneJob(job));
  }
  if (tool === "image_to_3d") {
    return jobs.filter((job) => THREE_D_STANDALONE_NODE_TYPES.has(job.node_type));
  }
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
