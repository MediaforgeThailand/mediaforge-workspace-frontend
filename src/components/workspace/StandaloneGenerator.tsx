import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Box,
  ChevronDown,
  Download,
  ExternalLink,
  FolderOpen,
  ImagePlus,
  Loader2,
  Menu,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { friendlyError } from "@/lib/friendlyError";
import { UserMenu } from "@/components/workspace/UserMenu";
import InsufficientCreditsDialog from "@/components/InsufficientCreditsDialog";
import { calculateNodeCost } from "@/lib/nodeCostCalculator";
import { useNodeCreditCosts } from "@/hooks/useNodeCreditCosts";
import { useCredits } from "@/hooks/useCredits";
import { DEFAULT_PROJECT_NAME } from "@/store/useWorkspaceStore";
import { downloadFromUrl } from "./downloadAsset";
import {
  build3dParams,
  buildAudioParams,
  buildImageParams,
  buildVideoParams,
  gptImageResolutionsFor,
  GPT_IMAGE_ASPECT_RATIOS,
  IMAGE_STYLE_PRESETS,
  isKlingMotionVideoModel,
  isSeedanceVideoModel,
  isSeedreamImageModel,
  STANDALONE_TOOL_ORDER,
  STANDALONE_TOOLS,
  type StandaloneToolKey,
  videoDurationsForModel,
  videoSupportsReferenceImage,
  videoSupportsReferenceVideo,
  videoSupportsStartEndFrames,
} from "./standaloneGenerationCatalog";
// Hardcoded voice catalogs (Gemini star names, Google Studio
// labels, ElevenLabs default presets) were deleted in the
// preset-purge cleanup. ElevenLabs voices come from a live
// /v1/voices fetch (account-bound, real); Gemini and Google use
// a single text input where the user types the voice id directly.

/** Empty default voice — backend executors carry their own
 *  per-provider fallback (`Charon` for Gemini, `en-US-Studio-O`
 *  for Google, first account voice for ElevenLabs) so an empty
 *  string is fine. */
const DEFAULT_VOICE_ID = "";

const RUN_EDGE_FUNCTION = "workspace-run-node";
const STANDALONE_CANVAS_ID = "standalone";
const STORAGE_BUCKET = "ai-media";
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 365;
const STANDALONE_JOB_SELECT =
  "id,node_type,provider,model,request,status,attempts,result,error,last_error,created_at,completed_at,run_after,deadline_at,locked_by,lock_expires_at,credits_charged,credits_refunded";

const isInsufficientCreditsError = (message: string) =>
  /insufficient|not enough|credit/i.test(message) &&
  !/api credit|provider credit/i.test(message);

type UploadSlot =
  | "image-ref"
  | "video-start"
  | "video-end"
  | "video-ref-image"
  | "video-ref-video"
  | "model-image";

interface UploadedRef {
  id: string;
  name: string;
  url: string;
  mime: string;
}

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
  };
  credits_spent?: number;
}

interface StandaloneFormState {
  model: string;
  prompt: string;
  styleId: string;
  aspectRatio: string;
  imageResolution: string;
  quality: string;
  outputFormat: string;
  background: string;
  imageRefs: UploadedRef[];
  videoRatio: string;
  videoResolution: string;
  videoDuration: number;
  videoWithAudio: boolean;
  videoStart: UploadedRef | null;
  videoEnd: UploadedRef | null;
  videoRefImage: UploadedRef | null;
  videoRefVideo: UploadedRef | null;
  videoCharacterOrientation: "image" | "video";
  videoKeepOriginalSound: boolean;
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
  modelImage: UploadedRef | null;
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
};

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
    imageRefs: [],
    videoRatio: "Auto",
    videoResolution: "720p",
    videoDuration: 5,
    videoWithAudio: false,
    videoStart: null,
    videoEnd: null,
    videoRefImage: null,
    videoRefVideo: null,
    videoCharacterOrientation: "image",
    videoKeepOriginalSound: false,
    script: "",
    ...DEFAULT_VOICE_PARAMS,
    modelImage: null,
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
    imageRefs: [],
    videoRatio: "Auto",
    videoResolution: "720p",
    videoDuration: 5,
    videoWithAudio: false,
    videoStart: null,
    videoEnd: null,
    videoRefImage: null,
    videoRefVideo: null,
    videoCharacterOrientation: "image",
    videoKeepOriginalSound: false,
    script: "",
    ...DEFAULT_VOICE_PARAMS,
    modelImage: null,
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
    imageRefs: [],
    videoRatio: "16:9",
    videoResolution: "720p",
    videoDuration: 5,
    videoWithAudio: false,
    videoStart: null,
    videoEnd: null,
    videoRefImage: null,
    videoRefVideo: null,
    videoCharacterOrientation: "image",
    videoKeepOriginalSound: false,
    script: "",
    ...DEFAULT_VOICE_PARAMS,
    modelImage: null,
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
    imageRefs: [],
    videoRatio: "16:9",
    videoResolution: "720p",
    videoDuration: 5,
    videoWithAudio: false,
    videoStart: null,
    videoEnd: null,
    videoRefImage: null,
    videoRefVideo: null,
    videoCharacterOrientation: "image",
    videoKeepOriginalSound: false,
    script: "",
    ...DEFAULT_VOICE_PARAMS,
    modelImage: null,
    texture: true,
    pbr: true,
  },
};

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
  const { credits } = useCredits();
  const { data: creditCosts = [], isLoading: creditCostsLoading } =
    useNodeCreditCosts();
  const [forms, setForms] =
    useState<Record<StandaloneToolKey, StandaloneFormState>>(INITIAL_FORMS);
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState<UploadSlot | null>(null);
  const [uploadAccept, setUploadAccept] = useState("image/*");
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const [insufficientRequiredCredits, setInsufficientRequiredCredits] =
    useState<number | undefined>();

  const activeDef = STANDALONE_TOOLS[activeTool];
  const form = forms[activeTool];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSlotRef = useRef<UploadSlot>("image-ref");
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ??
    projects[0] ??
    null;

  const jobsQuery = useStandaloneJobs(user?.id, activeProject?.id);
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
    setForms((prev) => ({
      ...prev,
      [activeTool]: { ...prev[activeTool], ...patch },
    }));
  };

  const setToolModel = (model: string) => {
    const nextPatch: Partial<StandaloneFormState> = { model };
    if (activeTool === "image_gen") {
      if (model === "gpt-image-2") {
        nextPatch.aspectRatio = GPT_IMAGE_ASPECT_RATIOS.includes(form.aspectRatio)
          ? form.aspectRatio
          : "1:1";
        const resolutions = gptImageResolutionsFor(
          String(nextPatch.aspectRatio ?? form.aspectRatio),
        );
        nextPatch.imageResolution = resolutions.includes(form.imageResolution)
          ? form.imageResolution
          : (resolutions[0] ?? "1K");
      } else if (isSeedreamImageModel(model)) {
        nextPatch.imageResolution = ["2K", "3K"].includes(form.imageResolution)
          ? form.imageResolution
          : "2K";
      } else {
        nextPatch.aspectRatio = form.aspectRatio || "Auto";
        nextPatch.imageResolution =
          model === "nano-banana-pro" ? "2K" : "1K";
      }
      nextPatch.imageRefs = form.imageRefs.slice(0, maxImageRefsForModel(model));
    }
    if (activeTool === "video_gen") {
      const isSeedance = isSeedanceVideoModel(model);
      if (isSeedance && form.videoRatio === "Auto") {
        nextPatch.videoRatio = "16:9";
      }
      if (!isSeedance && !["Auto", "16:9", "9:16", "1:1"].includes(form.videoRatio)) {
        nextPatch.videoRatio = "Auto";
      }
      const durations = videoDurationsForModel(model);
      if (!durations.includes(form.videoDuration)) {
        nextPatch.videoDuration = durations.includes(5)
          ? 5
          : (durations[0] ?? 5);
      }
      if (!videoSupportsStartEndFrames(model)) {
        nextPatch.videoStart = null;
        nextPatch.videoEnd = null;
      }
      if (!videoSupportsReferenceImage(model)) nextPatch.videoRefImage = null;
      if (!videoSupportsReferenceVideo(model)) nextPatch.videoRefVideo = null;
    }
    updateForm(nextPatch);
  };

  const estimatedCost = useMemo(() => {
    if (creditCostsLoading) return null;
    const params = buildCurrentParams(activeTool, form);
    if (!params) return null;
    return calculateNodeCost({
      schemaKey: activeDef.nodeType,
      params,
      creditCosts,
    });
  }, [activeDef.nodeType, activeTool, creditCosts, creditCostsLoading, form]);

  const openUpload = (slot: UploadSlot) => {
    pendingSlotRef.current = slot;
    const accept = uploadAcceptForSlot(slot);
    setUploadAccept(accept);
    if (fileInputRef.current) fileInputRef.current.accept = accept;
    fileInputRef.current?.click();
  };

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
      const uploaded = await uploadReference(file, user?.id, activeProject.id);
      if (slot === "image-ref") {
        const maxRefs = maxImageRefsForModel(form.model);
        updateForm({
          imageRefs: [...form.imageRefs, uploaded].slice(0, maxRefs),
        });
      } else if (slot === "video-start") {
        updateForm({ videoStart: uploaded });
      } else if (slot === "video-end") {
        updateForm({ videoEnd: uploaded });
      } else if (slot === "video-ref-image") {
        updateForm({ videoRefImage: uploaded });
      } else if (slot === "video-ref-video") {
        updateForm({ videoRefVideo: uploaded });
      } else {
        updateForm({ modelImage: uploaded });
      }
      toast.success(t("workspace.toast.reference_uploaded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const run = async () => {
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
    const validation = validateForm(activeTool, form);
    if (validation) {
      toast.error(validation);
      return;
    }
    if (
      estimatedCost != null &&
      credits &&
      Number(credits.balance ?? 0) < estimatedCost
    ) {
      setInsufficientRequiredCredits(estimatedCost);
      setInsufficientOpen(true);
      return;
    }

    const inputs = buildCurrentInputs(activeTool, form);
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        RUN_EDGE_FUNCTION,
        {
          body: {
            action: "enqueue_workspace_job",
            node_type: activeDef.nodeType,
            params,
            inputs,
            mentioned_assets: [],
            project_id: activeProject.id,
            workspace_id: null,
            canvas_id: standaloneCanvasId(activeProject.id),
            node_id: `standalone-${activeProject.id}-${activeTool}`,
          },
        },
      );
      const resp = data as { job_id?: string; error?: string } | null;
      if (error || resp?.error || !resp?.job_id) {
        throw new Error(
          resp?.error ??
            (error as { message?: string } | null)?.message ??
            "Failed to queue generation",
        );
      }
      toast.success(t("workspace.toast.gen_queued"));
      void jobsQuery.refetch();
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
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111111] text-zinc-100">
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
        onSelectProject={onSelectProject}
        onCreateProject={onCreateProject}
        onDeleteProject={onDeleteProject}
      />
      <DesktopTopBar
        projects={projects}
        activeProject={activeProject}
        onSelectProject={onSelectProject}
        onCreateProject={onCreateProject}
        onDeleteProject={onDeleteProject}
      />

      <div className="ws-scroll-hide flex min-h-0 flex-1 flex-col overflow-y-auto rounded-t-[22px] bg-[#191919] lg:flex-row lg:overflow-hidden lg:rounded-none">
        <aside className="ws-scroll-hide mx-auto min-h-[calc(100dvh-68px)] w-full max-w-[390px] shrink-0 overflow-visible bg-[#191919] px-4 pb-5 pt-4 lg:mx-0 lg:h-full lg:min-h-0 lg:w-[294px] lg:max-w-none lg:overflow-y-auto lg:border-r lg:border-white/[0.04] lg:bg-[#151515] lg:px-3 lg:pb-4 lg:pt-3">
          <ToolTabs
            activeTool={activeTool}
            onToolChange={onToolChange}
            className="hidden lg:flex"
          />

          <div
            className="mt-0 rounded-xl p-3.5 ring-1 ring-inset ring-white/[0.04] lg:mt-3"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--tool-accent) 16%, transparent), #202331)",
              ["--tool-accent" as string]: activeDef.accent,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1 text-[11px] font-medium text-zinc-400">
                  <ChevronDown className="h-3.5 w-3.5 rotate-90" />
                  Tools
                </div>
              <h2 className="mt-1 text-[14px] font-bold leading-tight text-white">
                  {activeDef.title}
                </h2>
              </div>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-zinc-300 ring-1 ring-inset ring-white/[0.04]">
                <activeDef.icon className="h-4 w-4" />
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-4">
            <ModelPicker
              models={activeDef.models}
              value={form.model}
              onChange={setToolModel}
            />

            {activeTool === "image_gen" && (
              <ImageControls
                form={form}
                onChange={updateForm}
                uploading={uploading === "image-ref"}
                onUpload={() => openUpload("image-ref")}
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

          <button
            type="button"
            onClick={() => void run()}
            disabled={running || !!uploading}
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-500 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(14,165,233,0.25)] transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300 disabled:shadow-none disabled:opacity-70"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Generate
            {estimatedCost != null && (
              <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-[10px] text-zinc-300">
                {estimatedCost} credits
              </span>
            )}
          </button>
        </aside>

        <main className="ws-scroll-hide min-h-0 flex-1 overflow-visible bg-[#1c1c1c] lg:overflow-y-auto">
          <div className="px-4 pb-20 pt-4 md:px-5 lg:px-4 lg:pb-10 lg:pt-3">
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <GenerationHistoryHeader onRefresh={() => void jobsQuery.refetch()} />
            </div>

            <CreationFeed
              jobs={filterJobsForTool(jobsQuery.data ?? [], activeTool)}
              loading={jobsQuery.isLoading}
            />
          </div>
        </main>
      </div>
      <InsufficientCreditsDialog
        open={insufficientOpen}
        onOpenChange={setInsufficientOpen}
        requiredCredits={insufficientRequiredCredits}
      />
    </div>
  );
}

function ToolTabs({
  activeTool,
  onToolChange,
  className,
}: {
  activeTool: StandaloneToolKey;
  onToolChange: (tool: StandaloneToolKey) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex rounded-2xl bg-transparent p-1 lg:rounded-none lg:p-0",
        className,
      )}
    >
      {STANDALONE_TOOL_ORDER.map((key) => {
        const item = STANDALONE_TOOLS[key];
        const active = key === activeTool;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToolChange(key)}
            className={cn(
              "min-h-10 flex-1 rounded-full px-3 text-[12px] font-semibold outline-none transition focus-visible:ring-1 focus-visible:ring-white/20 lg:min-h-8 lg:rounded-lg lg:text-[11px]",
              active
                ? "bg-[#2b2b2b] text-white"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
            )}
          >
            {item.navLabel}
          </button>
        );
      })}
    </div>
  );
}

function MobileHeader({
  activeTool,
  onToolChange,
  onOpenSidebar,
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}: {
  activeTool: StandaloneToolKey;
  onToolChange: (tool: StandaloneToolKey) => void;
  onOpenSidebar: () => void;
  projects: StandaloneProjectOption[];
  activeProject: StandaloneProjectOption | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onDeleteProject?: (projectId: string) => void;
}) {
  return (
    <header className="shrink-0 bg-[#0c0c0d] px-4 pb-0 pt-4 lg:hidden">
      <div className="mx-auto mb-4 flex max-w-[390px] items-center justify-between">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="grid h-8 w-8 place-items-center rounded-md text-zinc-200"
          aria-label="Menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <ProjectPicker
          projects={projects}
          activeProject={activeProject}
          onSelectProject={onSelectProject}
          onCreateProject={onCreateProject}
          onDeleteProject={onDeleteProject}
          compact
        />
        <UserMenu />
      </div>
      <div className="mx-auto max-w-[390px] rounded-t-[22px] bg-[#191919] px-3 pt-4">
        <ToolTabs activeTool={activeTool} onToolChange={onToolChange} />
      </div>
    </header>
  );
}

function DesktopTopBar({
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}: {
  projects: StandaloneProjectOption[];
  activeProject: StandaloneProjectOption | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onDeleteProject?: (projectId: string) => void;
}) {
  return (
    <div className="hidden h-[66px] shrink-0 items-center justify-between bg-[#111111] px-5 lg:flex">
      <ProjectPicker
        projects={projects}
        activeProject={activeProject}
        onSelectProject={onSelectProject}
        onCreateProject={onCreateProject}
        onDeleteProject={onDeleteProject}
      />
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
  const projectName = activeProject?.name?.trim() || "Create project";

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
          "flex h-9 min-w-0 items-center gap-2 rounded-lg px-2 text-[12px] font-semibold text-zinc-100 outline-none transition hover:bg-white/[0.05] focus-visible:ring-1 focus-visible:ring-white/20",
          compact ? "max-w-[190px]" : "max-w-[320px]",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="h-3 w-3 shrink-0 rounded bg-amber-400" />
        <span className="truncate">{projectName}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute left-0 top-11 z-50 w-[260px] rounded-xl border border-white/[0.07] bg-[#111111] p-2 shadow-2xl shadow-black/70",
            compact && "left-1/2 -translate-x-1/2",
          )}
          role="menu"
        >
          <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">
            Projects
          </div>
          <div className="max-h-[260px] space-y-1 overflow-y-auto">
            {projects.map((project) => {
              const active = project.id === activeProject?.id;
              const canDelete =
                Boolean(onDeleteProject) &&
                projects.length > 1 &&
                project.name !== DEFAULT_PROJECT_NAME;
              return (
                <div
                  key={project.id}
                  className={cn(
                    "flex h-10 w-full items-center gap-1 rounded-lg px-2 text-left text-[12px] font-semibold transition",
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
                    <span className="h-2.5 w-2.5 shrink-0 rounded bg-amber-400" />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {active && (
                      <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[9px] uppercase text-zinc-400">
                        Active
                      </span>
                    )}
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!window.confirm(`Delete project "${project.name}"?`)) return;
                        onDeleteProject?.(project.id);
                        setOpen(false);
                      }}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-zinc-500 transition hover:bg-red-500/10 hover:text-red-300"
                      aria-label={`Delete ${project.name}`}
                      title="Delete project"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white text-[12px] font-bold text-zinc-950 transition hover:bg-zinc-200"
            role="menuitem"
          >
            <Plus className="h-3.5 w-3.5" />
            New project
          </button>
        </div>
      )}
    </div>
  );
}

function GenerationHistoryHeader({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex h-8 items-center gap-1.5 rounded-full bg-[#2b2b2b] px-3 text-[12px] font-semibold text-white">
        <Sparkles className="h-3.5 w-3.5" />
        Creations
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="grid h-8 w-8 place-items-center rounded-lg bg-[#252525] text-zinc-400 transition hover:bg-[#303030] hover:text-zinc-100"
        aria-label="Refresh"
        title="Refresh"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
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
  const selected = models.find((model) => model.id === value) ?? models[0];
  return (
    <div className="relative">
      <FieldLabel label="Model" />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 flex h-9 w-full items-center justify-between gap-3 rounded-lg bg-[#2a2a2a] px-3 text-left ring-1 ring-inset ring-white/[0.03] transition hover:bg-[#333333]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/[0.08] text-[11px] font-black text-white">
            {selected.provider.charAt(0)}
          </span>
          <span className="block truncate text-[12px] font-bold text-white">
            {selected.label}
          </span>
        </span>
        <span className="flex items-center gap-2 text-zinc-400">
          <Settings className="h-3.5 w-3.5" />
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[58px] z-40 rounded-2xl border border-white/[0.06] bg-[#111111] p-2 shadow-2xl shadow-black/70">
          {models.map((model) => {
            const active = model.id === value;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => {
                  onChange(model.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start justify-between gap-3 rounded-xl p-3 text-left transition",
                  active
                    ? "bg-[#3d3d3d] text-white"
                    : "text-zinc-300 hover:bg-white/[0.05]",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold">
                    {model.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-zinc-400">
                    {model.description}
                  </span>
                </span>
                {model.badge && (
                  <span className="rounded-md bg-white/[0.08] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-300">
                    {model.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ImageControls({
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
  const isGpt = form.model === "gpt-image-2";
  const isSeedream = isSeedreamImageModel(form.model);
  const resolutionOptions = isGpt
    ? gptImageResolutionsFor(form.aspectRatio)
    : isSeedream
      ? ["2K", "3K"]
      : form.model === "nano-banana-pro"
        ? ["1K", "2K", "4K"]
        : ["1K", "2K"];
  const maxRefs = maxImageRefsForModel(form.model);

  useEffect(() => {
    if (!resolutionOptions.includes(form.imageResolution)) {
      onChange({ imageResolution: resolutionOptions[0] ?? "1K" });
    }
  }, [form.imageResolution, onChange, resolutionOptions]);

  return (
    <>
      <StyleReferenceTray
        styleId={form.styleId}
        onStyleChange={(styleId) => onChange({ styleId })}
        refs={form.imageRefs}
        max={maxRefs}
        uploading={uploading}
        onUpload={onUpload}
        onRemove={(id) =>
          onChange({ imageRefs: form.imageRefs.filter((ref) => ref.id !== id) })
        }
      />

      <PromptBox
        label="Prompt"
        placeholder="Describe the image you want to create"
        value={form.prompt}
        onChange={(prompt) => onChange({ prompt })}
      />

      <div className={cn("grid gap-2", isSeedream ? "grid-cols-1" : "grid-cols-2")}>
        {!isSeedream && (
          <SelectField
            label="Aspect"
            value={form.aspectRatio}
            options={isGpt ? GPT_IMAGE_ASPECT_RATIOS : ["Auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]}
            onChange={(aspectRatio) => onChange({ aspectRatio })}
          />
        )}
        <SelectField
          label="Resolution"
          value={form.imageResolution}
          options={resolutionOptions}
          onChange={(imageResolution) => onChange({ imageResolution })}
        />
      </div>

      {isGpt && (
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="Quality"
            value={form.quality}
            options={["low", "medium", "high"]}
            onChange={(quality) => onChange({ quality })}
          />
          <SelectField
            label="Format"
            value={form.outputFormat}
            options={["png", "jpeg", "webp"]}
            onChange={(outputFormat) => onChange({ outputFormat })}
          />
          <SelectField
            label="Background"
            value={form.background}
            options={["auto", "transparent", "opaque"]}
            onChange={(background) => onChange({ background })}
            disabled={form.outputFormat === "jpeg"}
          />
        </div>
      )}

    </>
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
  const isSeedance = isSeedanceVideoModel(form.model);
  const isMotion = isKlingMotionVideoModel(form.model);
  const supportsStartEnd = videoSupportsStartEndFrames(form.model);
  const supportsRefImage = videoSupportsReferenceImage(form.model);
  const supportsRefVideo = videoSupportsReferenceVideo(form.model);
  const durations = videoDurationsForModel(form.model);

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
        label: "Start image",
        refItem: form.videoStart,
        uploading: uploadingStart,
        onUpload: onUploadStart,
        onRemove: () => onChange({ videoStart: null }),
      },
      {
        key: "end",
        label: "End image",
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
      label: isMotion ? "Reference image" : "Ref image",
      refItem: form.videoRefImage,
      uploading: uploadingRefImage,
      onUpload: onUploadRefImage,
      onRemove: () => onChange({ videoRefImage: null }),
    });
  }
  if (supportsRefVideo) {
    referenceSlots.push({
      key: "ref-video",
      label: isMotion ? "Motion video" : "Ref video",
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
        label="Prompt"
        placeholder="Describe camera movement, subject, scene, and mood"
        value={form.prompt}
        onChange={(prompt) => onChange({ prompt })}
      />
      {!isMotion ? (
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="Aspect"
            value={form.videoRatio}
            options={isSeedance ? ["16:9", "9:16", "1:1", "4:3"] : ["Auto", "16:9", "9:16", "1:1"]}
            onChange={(videoRatio) => onChange({ videoRatio })}
          />
          <SelectField
            label="Duration"
            value={String(form.videoDuration)}
            options={durations.map(String)}
            onChange={(videoDuration) =>
              onChange({ videoDuration: Number(videoDuration) || 5 })
            }
          />
          {isSeedance && (
            <SelectField
              label="Resolution"
              value={form.videoResolution}
              options={["480p", "720p", "1080p"]}
              onChange={(videoResolution) => onChange({ videoResolution })}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="Orientation"
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
      {!isMotion && (
        <ToggleRow
          label="Generate audio"
          checked={form.videoWithAudio}
          onChange={(videoWithAudio) => onChange({ videoWithAudio })}
        />
      )}
      {(isMotion || form.model === "kling-v3-omni") && supportsRefVideo && (
        <ToggleRow
          label="Keep original sound"
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
  violet: "linear-gradient(135deg, hsl(258 75% 45%), hsl(258 65% 28%))",
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

  // Reset voice id when switching providers — a Gemini text-input
  // value can't satisfy the ElevenLabs UUID contract and vice versa.
  useEffect(() => {
    onChange({ voice: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  return (
    <>
      <PromptBox
        label="Script"
        placeholder="Paste the script you want to turn into speech"
        value={form.script}
        onChange={(script) => onChange({ script })}
        minRows={7}
        maxLength={5000}
      />

      {provider === "elevenlabs" ? (
        // ElevenLabs: live grid of the user's account voices. No
        // hardcoded preset catalog — what's in the API is what we show.
        <div>
          <FieldLabel
            label="Voice"
            meta={
              elevenLoading
                ? "Loading…"
                : elevenVoices?.length
                  ? `${elevenVoices.length} from your account`
                  : "ElevenLabs"
            }
          />
          {elevenError && (
            <div className="mt-2 rounded-md border border-red-400/20 bg-red-500/[0.06] px-2.5 py-2 text-[11px] text-red-300">
              {elevenError}
            </div>
          )}
          {elevenLoading && (
            <div className="mt-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[11px] text-zinc-500">
              Loading ElevenLabs voices from your account…
            </div>
          )}
          {!elevenLoading && elevenVoices && elevenVoices.length === 0 && !elevenError && (
            <div className="mt-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[11px] text-zinc-500">
              No voices in this ElevenLabs account.
            </div>
          )}
          {elevenVoices && elevenVoices.length > 0 && (
            <div className="ws-scroll-hide mt-2 grid max-h-[270px] grid-cols-2 gap-2 overflow-y-auto pr-0.5">
              {elevenVoices.map((voice) => {
                const active = voice.id === form.voice;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => onChange({ voice: voice.id })}
                    className={cn(
                      "flex min-h-[72px] flex-col items-start justify-between rounded-lg border border-dashed px-3 py-3 text-left transition",
                      active
                        ? "border-amber-300/50 bg-amber-300/10"
                        : "border-white/[0.12] bg-[#242424] hover:bg-[#2d2d2d]",
                    )}
                  >
                    <span
                      className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                      style={{
                        background:
                          TINT_PALETTE[voice.tint] ?? TINT_PALETTE.zinc,
                      }}
                    >
                      {voice.name.charAt(0)}
                    </span>
                    <span className="min-w-0 w-full">
                      <span className="block truncate text-[11px] font-bold text-white">
                        {voice.name}
                      </span>
                      <span className="block truncate text-[10px] text-zinc-500">
                        {voice.characteristic}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        // Gemini / Google: no preset catalog — let the user paste a
        // voice id directly. Empty string is fine; the backend
        // executor falls back to its provider default
        // (`Charon` for Gemini, `en-US-Studio-O` for Google).
        <TextInputField
          label="Voice ID"
          value={form.voice}
          placeholder={
            provider === "gemini"
              ? "Optional · e.g. Charon, Aoede (defaults to Charon)"
              : "Optional · e.g. en-US-Studio-O (defaults to Studio-O)"
          }
          onChange={(voice) => onChange({ voice })}
        />
      )}

      {/* ── Per-model parameter widgets ─────────────────────── */}
      {provider === "elevenlabs" && (
        <ElevenLabsVoiceParams form={form} onChange={onChange} />
      )}
      {provider !== "elevenlabs" && (
        <TextInputField
          label="Voice instructions"
          value={form.voiceStyle}
          placeholder={
            provider === "gemini"
              ? "e.g. Calmly, with a warm tone"
              : "e.g. Calm, confident, slightly slower pace"
          }
          onChange={(voiceStyle) => onChange({ voiceStyle })}
        />
      )}
    </>
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
  const presets: Array<{ id: StandaloneFormState["voiceStylePreset"]; label: string }> = [
    { id: "expressive", label: "Expressive" },
    { id: "neutral",    label: "Neutral" },
    { id: "consistent", label: "Consistent" },
  ];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        Voice style
      </div>
      <div className="mt-2 inline-flex w-full items-center gap-1 rounded-lg bg-white/[0.04] p-0.5 text-[11px]">
        {presets.map((p) => {
          const active = form.voiceStylePreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ voiceStylePreset: p.id })}
              className={cn(
                "flex-1 rounded-md px-2 py-1 text-center transition-colors",
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
        label="Speed"
        meta={`${form.voiceSpeed.toFixed(2)}×`}
        min={0.7}
        max={1.2}
        step={0.05}
        value={form.voiceSpeed}
        onChange={(voiceSpeed) => onChange({ voiceSpeed })}
      />
      <RangeSlider
        label="Stability"
        meta={`${Math.round(form.voiceStability * 100)}%`}
        min={0}
        max={1}
        step={0.05}
        value={form.voiceStability}
        onChange={(voiceStability) => onChange({ voiceStability })}
      />
      <RangeSlider
        label="Similarity"
        meta={`${Math.round(form.voiceSimilarity * 100)}%`}
        min={0}
        max={1}
        step={0.05}
        value={form.voiceSimilarity}
        onChange={(voiceSimilarity) => onChange({ voiceSimilarity })}
      />
      <RangeSlider
        label="Style amount"
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
    <div className="mt-3">
      <div className="flex items-center justify-between text-[10.5px] font-medium text-zinc-300">
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
        className="mt-1.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-amber-300 outline-none"
      />
    </div>
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
  return (
    <>
      <SingleReferenceButton
        label="Reference image"
        refItem={form.modelImage}
        uploading={uploading}
        onUpload={onUpload}
        onRemove={() => onChange({ modelImage: null })}
        tall
      />
      <ToggleRow
        label="Texture"
        checked={form.texture}
        onChange={(texture) => onChange({ texture })}
      />
      <ToggleRow
        label="PBR materials"
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
        className="mt-2 min-h-[126px] w-full resize-none rounded-lg border border-white/[0.08] bg-[#171717] px-3 py-3 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/[0.16] focus:bg-[#141414]"
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
  return (
    <label className={cn("block", disabled && "opacity-50")}>
      <FieldLabel label={label} />
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-9 w-full rounded-lg border border-white/[0.05] bg-[#252525] px-2 text-[11px] font-semibold text-white outline-none focus:border-white/[0.16] disabled:cursor-not-allowed"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-zinc-950">
            {option}
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
        className="mt-2 h-9 w-full rounded-lg border border-white/[0.08] bg-[#171717] px-3 text-[12px] text-white outline-none placeholder:text-zinc-500 focus:border-white/[0.16]"
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
  onUpload,
  onRemove,
}: {
  styleId: string;
  onStyleChange: (styleId: string) => void;
  refs: UploadedRef[];
  max: number;
  uploading: boolean;
  onUpload: () => void;
  onRemove: (id: string) => void;
}) {
  const [styleOpen, setStyleOpen] = useState(false);
  const selectedStyle =
    IMAGE_STYLE_PRESETS.find((preset) => preset.id === styleId) ??
    IMAGE_STYLE_PRESETS[0];

  return (
    <div className="relative">
      <FieldLabel label="References" meta={`${refs.length}/${max}`} />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStyleOpen((open) => !open)}
          className="flex h-[58px] w-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/[0.12] bg-[#242424] text-zinc-300 outline-none transition hover:bg-[#2d2d2d] hover:text-white focus-visible:border-white/25"
        >
          <Sparkles className="h-4 w-4" />
          <span className="max-w-full truncate px-1 text-[11px] font-medium">
            {selectedStyle.id === "none" ? "Style" : selectedStyle.label}
          </span>
        </button>
        <button
          type="button"
          onClick={onUpload}
          disabled={uploading || refs.length >= max}
          className="flex h-[58px] w-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/[0.12] bg-[#242424] text-zinc-300 outline-none transition hover:bg-[#2d2d2d] hover:text-white focus-visible:border-white/25 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserRound className="h-4 w-4" />
          )}
          <span className="text-[11px] font-medium">Character</span>
        </button>
        <button
          type="button"
          onClick={onUpload}
          disabled={uploading || refs.length >= max}
          className="flex h-[58px] w-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/[0.12] bg-[#242424] text-zinc-300 outline-none transition hover:bg-[#2d2d2d] hover:text-white focus-visible:border-white/25 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span className="text-[11px] font-medium">Add</span>
        </button>
      </div>
      {refs.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-2">
          {refs.slice(0, 8).map((ref) => (
            <div
              key={ref.id}
              className="group relative aspect-square overflow-hidden rounded-lg bg-black/30 ring-1 ring-white/[0.08]"
            >
              <img src={ref.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(ref.id)}
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded bg-black/70 text-zinc-200"
                aria-label="Remove reference"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {styleOpen && (
        <div className="absolute left-0 right-0 top-[102px] z-40 rounded-2xl border border-white/[0.06] bg-[#111111] p-2 shadow-2xl shadow-black/70">
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
                  active ? "bg-[#3d3d3d]" : "hover:bg-white/[0.05]",
                )}
              >
                <span
                  className="h-10 w-10 shrink-0 rounded-lg"
                  style={{ background: style.preview }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-bold text-white">
                    {style.label}
                  </span>
                  <span className="line-clamp-1 text-[11px] text-zinc-500">
                    {style.description}
                  </span>
                </span>
                <span className="ml-auto rounded bg-white/[0.08] px-1.5 py-0.5 text-[9px] font-bold uppercase text-zinc-400">
                  {style.chip}
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
      className="flex h-9 w-full items-center justify-between rounded-lg bg-[#252525] px-3 ring-1 ring-inset ring-white/[0.04]"
    >
      <span className="text-[12px] font-semibold text-zinc-200">{label}</span>
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition",
          checked ? "bg-emerald-400" : "bg-zinc-700",
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
  return (
    <div>
      <FieldLabel label={label} meta={`${refs.length}/${max}`} />
      <div className="mt-2 grid grid-cols-3 gap-2">
        {refs.map((ref) => (
          <div
            key={ref.id}
            className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
          >
            <img src={ref.url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onRemove(ref.id)}
              className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-lg bg-black/70 text-zinc-200"
              aria-label="Remove reference"
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
          "mt-2 overflow-hidden rounded-lg border border-dashed border-white/[0.12] bg-[#242424]",
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
            className="grid h-full w-full place-items-center text-zinc-400 transition hover:bg-[#2d2d2d] hover:text-white disabled:opacity-60"
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
}: {
  jobs: StandaloneJobRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-xl bg-[#1f1f1f]">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }
  if (jobs.length === 0) {
    return (
      <div className="grid min-h-[520px] place-items-center rounded-xl bg-[#1b1b1b] p-8 text-center">
        <div>
          <div className="mx-auto grid h-10 w-10 place-items-center text-zinc-200">
            <FolderOpen className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-[16px] font-bold text-white">
            Ready to create something?
          </h2>
          <p className="mt-2 text-[13px] text-zinc-400">
            Start generating to see your creations here.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <CreationRow key={job.id} job={job} />
      ))}
    </div>
  );
}

function CreationRow({ job }: { job: StandaloneJobRow }) {
  const [cancelling, setCancelling] = useState(false);
  const result = job.result;
  const params = job.request?.params ?? {};
  const prompt = String(params.prompt ?? "");
  const title =
    prompt.trim().slice(0, 90) ||
    String(params.nodeName ?? params.model_name ?? job.model ?? "Generation");

  /* User-initiated cancel for an in-flight standalone gen.
   *
   * The audit flagged this gap explicitly: the canvas had cancel
   * but the standalone tool didn't, so a user who started a 5-min
   * Kling Motion Pro and changed their mind had to wait it out
   * (or close the tab and lose visibility on the credits).
   *
   * Same RPC the canvas uses (`cancel_workspace_job`) — marks the
   * row failed, refunds unused credits, the polling loop in the
   * parent will pick up the new status on the next tick. */
  const handleCancel = async () => {
    if (!job.id || cancelling) return;
    setCancelling(true);
    try {
      const { error } = await supabase.rpc("cancel_workspace_job", { p_job_id: job.id });
      if (error) {
        toast.error(`ยกเลิกไม่สำเร็จ / Cancel failed: ${error.message}`);
        return;
      }
      toast.success("ยกเลิกแล้ว — คืนเครดิตให้แล้ว / Cancelled — credits refunded");
    } catch (err) {
      toast.error(
        `ยกเลิกไม่สำเร็จ / Cancel failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setCancelling(false);
    }
  };
  const statusTone =
    job.status === "completed"
      ? "text-emerald-300"
      : job.status === "failed" || job.status === "permanent_failed"
        ? "text-red-300"
        : "text-amber-300";
  const url = result?.url;
  const modelUrl = result?.provider_meta?.model_url;
  const isModel3d = result?.type === "model_3d" || !!modelUrl;
  const previewUrl = isModel3d
    ? (result?.provider_meta?.rendered_image ?? url)
    : url;
  const duration = String(params.duration ?? "");
  const ratio = String(params.ratio ?? params.aspect_ratio ?? params.size ?? "");
  const modelName = String(params.model_name ?? job.model ?? "model");
  const failureMessage =
    job.status === "failed" || job.status === "permanent_failed"
      ? (job.error ?? job.last_error)
      : null;
  const isActive = job.status === "queued" || job.status === "running";
  const isFailed = job.status === "failed" || job.status === "permanent_failed";
  return (
    <article className="rounded-xl bg-[#222222] px-3 py-3 ring-1 ring-inset ring-white/[0.02]">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="line-clamp-1 min-w-0 text-[12px] font-semibold text-zinc-100">
          {title}
        </h3>
        <div className="hidden shrink-0 flex-wrap justify-end gap-1 md:flex">
          <MiniMeta label={modelName} />
          {duration && <MiniMeta label={`${duration} sec`} />}
          {ratio && <MiniMeta label={ratio} />}
          <MiniMeta label={`+${job.attempts ?? 1}`} />
          <span className="flex h-5 items-center gap-1 rounded border border-white/[0.08] px-1.5 text-[10px] text-zinc-300">
            <span className="h-3 w-3 rounded-sm border border-zinc-600" />
            {formatDate(job.created_at)}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black md:w-[265px]">
          {isActive && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[12px] text-zinc-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {job.status}
              </div>
            </div>
          )}
          {isFailed && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex items-center gap-2 rounded-full bg-red-950/70 px-3 py-1.5 text-[12px] text-red-100">
                <AlertCircle className="h-3.5 w-3.5" />
                failed
              </div>
            </div>
          )}
          {(result?.type === "image" || result?.type === "model_3d") && previewUrl && (
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          )}
          {result?.type === "video" && url && (
            <video
              src={url}
              controls
              playsInline
              className="h-full w-full object-cover"
            />
          )}
          {result?.type === "audio" && url && (
            <div className="flex h-full w-full items-center justify-center p-4">
              <audio src={url} controls className="w-full" />
            </div>
          )}
          {modelUrl && !url && (
            <div className="grid h-full place-items-center text-zinc-500">
              <Box className="h-8 w-8" />
            </div>
          )}
          <div className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">
            {result?.type === "audio"
              ? "audio"
              : result?.type === "video"
                ? "0:06"
                : isModel3d
                  ? "3d"
                  : "image"}
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
              {job.status}
            </span>
            <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[11px] text-zinc-400">
              {job.model ?? params.model_name?.toString() ?? "model"}
            </span>
            {typeof job.credits_charged === "number" && (
              <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[11px] text-zinc-400">
                {job.credits_charged} credits
              </span>
            )}
          </div>
          <h3 className="mt-3 line-clamp-2 text-[14px] font-bold leading-snug text-white md:text-[15px]">
            {title}
          </h3>
          <div className="mt-2 text-[11px] text-zinc-500">
            {formatDate(job.created_at)}
            {job.attempts ? ` · attempt ${job.attempts}` : ""}
          </div>
          {failureMessage && (
            <div className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
              {failureMessage}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 md:flex-col">
          {/* Cancel button — visible only when the job is in-flight.
           *  Confirmation is implicit (one tap = real cancel) because
           *  the in-flight state is short-lived and credits are
           *  auto-refunded; no destructive ambiguity. */}
          {isActive && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="grid h-9 w-9 place-items-center rounded-lg bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Cancel generation"
              title="ยกเลิก / Cancel"
            >
              {cancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
            </button>
          )}
          {url && (
            <>
              <button
                type="button"
                onClick={() => void downloadFromUrl(url, title)}
                className="grid h-9 w-9 place-items-center rounded-lg bg-white text-zinc-950 hover:bg-zinc-200"
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
              </button>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="grid h-9 w-9 place-items-center rounded-lg bg-[#2f2f2f] text-zinc-300 ring-1 ring-inset ring-white/[0.04] hover:bg-[#3a3a3a]"
                aria-label="Open"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </>
          )}
          {modelUrl && (
            <a
              href={modelUrl}
              target="_blank"
              rel="noreferrer"
              className="grid h-9 w-9 place-items-center rounded-lg bg-amber-300 text-zinc-950 hover:bg-amber-200"
              aria-label="Open 3D model"
            >
              <Box className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function MiniMeta({ label }: { label: string }) {
  return (
    <span className="h-5 rounded border border-white/[0.08] bg-[#1a1a1a] px-2 text-[10px] font-semibold leading-5 text-zinc-100">
      {label}
    </span>
  );
}

function FieldLabel({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-400">
        {label}
      </span>
      {meta && <span className="text-[10px] text-zinc-500">{meta}</span>}
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
      const base = (supabase as any)
        .from("workspace_generation_jobs")
        .select(STANDALONE_JOB_SELECT)
        .eq("project_id", projectId)
        .eq("canvas_id", standaloneCanvasId(projectId));

      const [activeRes, recentRes] = await Promise.all([
        base
          .in("status", ["queued", "running"])
          .order("created_at", { ascending: false })
          .limit(100),
        (supabase as any)
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
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
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
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
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
    name: file.name,
    url: data.signedUrl,
    mime: file.type,
  };
}

function buildCurrentParams(
  tool: StandaloneToolKey,
  form: StandaloneFormState,
): Record<string, unknown> | null {
  if (tool === "image_gen") {
    return buildImageParams({
      model: form.model,
      prompt: form.prompt,
      styleId: form.styleId,
      aspectRatio: form.aspectRatio,
      resolution: form.imageResolution,
      quality: form.quality,
      outputFormat: form.outputFormat,
      background: form.background,
    });
  }
  if (tool === "video_gen") {
    return buildVideoParams({
      model: form.model,
      prompt: form.prompt,
      ratio: form.videoRatio,
      resolution: form.videoResolution,
      duration: form.videoDuration,
      withAudio: form.videoWithAudio,
      characterOrientation: form.videoCharacterOrientation,
      keepOriginalSound: form.videoKeepOriginalSound,
      hasReferenceVideo: !!form.videoRefVideo,
    });
  }
  if (tool === "voice_gen") {
    return buildAudioParams({
      model: form.model,
      script: form.script,
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
    return {
      ref_image:
        form.imageRefs.length === 1
          ? form.imageRefs[0].url
          : form.imageRefs.map((ref) => ref.url),
    };
  }
  if (tool === "video_gen") {
    const inputs: Record<string, unknown> = {};
    if (videoSupportsStartEndFrames(form.model)) {
      if (form.videoStart) inputs.start_frame = form.videoStart.url;
      if (form.videoEnd) inputs.end_frame = form.videoEnd.url;
    }
    if (videoSupportsReferenceImage(form.model) && form.videoRefImage) {
      inputs.ref_image = form.videoRefImage.url;
    }
    if (videoSupportsReferenceVideo(form.model) && form.videoRefVideo) {
      inputs.ref_video = form.videoRefVideo.url;
    }
    return {
      ...inputs,
    };
  }
  if (tool === "image_to_3d") {
    return form.modelImage ? { image: form.modelImage.url } : {};
  }
  return {};
}

function validateForm(
  tool: StandaloneToolKey,
  form: StandaloneFormState,
): string | null {
  if (tool === "image_gen" && !form.prompt.trim()) {
    return "Image generation needs a prompt.";
  }
  if (
    tool === "video_gen" &&
    isKlingMotionVideoModel(form.model) &&
    (!form.videoRefImage || !form.videoRefVideo)
  ) {
    return "Motion video needs a reference image and a motion video.";
  }
  if (
    tool === "video_gen" &&
    videoSupportsStartEndFrames(form.model) &&
    form.videoEnd &&
    !form.videoStart
  ) {
    return "End image needs a start image too.";
  }
  if (
    tool === "video_gen" &&
    !form.prompt.trim() &&
    !form.videoStart &&
    !form.videoRefImage &&
    !form.videoRefVideo
  ) {
    return "Video generation needs a prompt or start image.";
  }
  if (tool === "voice_gen" && !form.script.trim()) {
    return "Voice generation needs a script.";
  }
  if (tool === "voice_gen" && form.script.length > 5000) {
    return "Script is too long. Maximum is 5,000 characters.";
  }
  if (tool === "image_to_3d" && !form.modelImage) {
    return "3D generation needs a reference image.";
  }
  return null;
}

function maxImageRefsForModel(model: string): number {
  if (isSeedreamImageModel(model)) return 1;
  if (model === "gpt-image-2") return 16;
  return 14;
}

function filterJobsForTool(
  jobs: StandaloneJobRow[],
  tool: StandaloneToolKey,
): StandaloneJobRow[] {
  const nodeType = STANDALONE_TOOLS[tool].nodeType;
  return jobs.filter((job) => job.node_type === nodeType);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
