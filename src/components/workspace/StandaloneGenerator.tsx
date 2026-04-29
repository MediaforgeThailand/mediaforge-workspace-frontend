import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
import { UserMenu } from "@/components/workspace/UserMenu";
import { calculateNodeCost } from "@/lib/nodeCostCalculator";
import { useNodeCreditCosts } from "@/hooks/useNodeCreditCosts";
import { downloadFromUrl } from "./downloadAsset";
import {
  build3dParams,
  buildAudioParams,
  buildImageParams,
  buildVideoParams,
  gptImageResolutionsFor,
  GPT_IMAGE_ASPECT_RATIOS,
  IMAGE_STYLE_PRESETS,
  STANDALONE_TOOL_ORDER,
  STANDALONE_TOOLS,
  type StandaloneToolKey,
} from "./standaloneGenerationCatalog";
import {
  DEFAULT_GOOGLE_VOICE_ID,
  findGoogleVoice,
  GOOGLE_VOICE_TINT_GRADIENT,
  GOOGLE_VOICES,
} from "./googleTtsVoices";

const RUN_EDGE_FUNCTION = "workspace-run-node";
const STANDALONE_CANVAS_ID = "standalone";
const STORAGE_BUCKET = "ai-media";
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 365;

type UploadSlot = "image-ref" | "video-start" | "video-end" | "model-image";

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
  credits_charged?: number | null;
  credits_refunded?: number | null;
}

interface StandaloneResult {
  type?: "image" | "video" | "audio" | "text";
  url?: string;
  text?: string;
  prompt_used?: string;
  provider_meta?: {
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
  script: string;
  voice: string;
  voiceStyle: string;
  modelImage: UploadedRef | null;
  texture: boolean;
  pbr: boolean;
}

export interface StandaloneProjectOption {
  id: string;
  name: string;
  updatedAt: number;
}

const INITIAL_FORMS: Record<StandaloneToolKey, StandaloneFormState> = {
  image_gen: {
    model: STANDALONE_TOOLS.image_gen.defaultModel,
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
    script: "",
    voice: DEFAULT_GOOGLE_VOICE_ID,
    voiceStyle: "Neutral, clear, natural pace",
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
    videoRatio: "16:9",
    videoResolution: "720p",
    videoDuration: 5,
    videoWithAudio: false,
    videoStart: null,
    videoEnd: null,
    script: "",
    voice: DEFAULT_GOOGLE_VOICE_ID,
    voiceStyle: "Neutral, clear, natural pace",
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
    script: "",
    voice: DEFAULT_GOOGLE_VOICE_ID,
    voiceStyle: "Warm, confident, natural pace",
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
    script: "",
    voice: DEFAULT_GOOGLE_VOICE_ID,
    voiceStyle: "Neutral",
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
}: {
  activeTool: StandaloneToolKey;
  onToolChange: (tool: StandaloneToolKey) => void;
  onOpenSidebar: () => void;
  projects: StandaloneProjectOption[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: creditCosts = [], isLoading: creditCostsLoading } =
    useNodeCreditCosts();
  const [forms, setForms] =
    useState<Record<StandaloneToolKey, StandaloneFormState>>(INITIAL_FORMS);
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState<UploadSlot | null>(null);

  const activeDef = STANDALONE_TOOLS[activeTool];
  const form = forms[activeTool];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSlotRef = useRef<UploadSlot>("image-ref");
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ??
    projects[0] ??
    null;

  const jobsQuery = useStandaloneJobs(user?.id, activeProject?.id);
  const hasActiveJobs = (jobsQuery.data ?? []).some((job) =>
    ["queued", "running"].includes(job.status),
  );

  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => {
      void jobsQuery.refetch();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs, jobsQuery]);

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

  const updateForm = (patch: Partial<StandaloneFormState>) => {
    setForms((prev) => ({
      ...prev,
      [activeTool]: { ...prev[activeTool], ...patch },
    }));
  };

  const setToolModel = (model: string) => {
    const nextPatch: Partial<StandaloneFormState> = { model };
    if (activeTool === "image_gen" && model !== "gpt-image-2") {
      nextPatch.aspectRatio =
        form.aspectRatio === "Auto" ? "1:1" : form.aspectRatio;
      nextPatch.imageResolution =
        model === "nano-banana-pro" ? "2K" : "1K";
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
    fileInputRef.current?.click();
  };

  const onFileSelected = async (file: File | undefined) => {
    if (!file) return;
    if (!activeProject?.id) {
      toast.error("Create or select a project before uploading references.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const slot = pendingSlotRef.current;
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
      } else {
        updateForm({ modelImage: uploaded });
      }
      toast.success("Reference uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const run = async () => {
    if (!user?.id) {
      toast.error("Please sign in before generating.");
      return;
    }
    if (!activeProject?.id) {
      toast.error("Create or select a project before generating.");
      return;
    }
    const params = buildCurrentParams(activeTool, form);
    if (!params) {
      toast.error("This tool is not ready yet.");
      return;
    }
    const validation = validateForm(activeTool, form);
    if (validation) {
      toast.error(validation);
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
      toast.success("Generation queued");
      void jobsQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
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
        accept="image/*"
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
      />
      <DesktopTopBar
        projects={projects}
        activeProject={activeProject}
        onSelectProject={onSelectProject}
        onCreateProject={onCreateProject}
      />

      <div className="ws-scroll-hide flex min-h-0 flex-1 flex-col overflow-y-auto rounded-t-[22px] bg-[#191919] lg:flex-row lg:overflow-hidden lg:rounded-none">
        <aside className="mx-auto min-h-[calc(100dvh-68px)] w-full max-w-[390px] shrink-0 overflow-visible bg-[#191919] px-4 pb-5 pt-4 lg:mx-0 lg:h-full lg:min-h-0 lg:w-[294px] lg:max-w-none lg:overflow-y-auto lg:border-r lg:border-white/[0.04] lg:bg-[#151515] lg:px-3 lg:pb-4 lg:pt-3">
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
                onUploadStart={() => openUpload("video-start")}
                onUploadEnd={() => openUpload("video-end")}
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
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#3a3a3a] text-[13px] font-semibold text-zinc-200 transition hover:bg-[#474747] disabled:cursor-not-allowed disabled:opacity-60"
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

        <main className="min-h-0 flex-1 overflow-visible bg-[#1c1c1c] lg:overflow-y-auto">
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
}: {
  activeTool: StandaloneToolKey;
  onToolChange: (tool: StandaloneToolKey) => void;
  onOpenSidebar: () => void;
  projects: StandaloneProjectOption[];
  activeProject: StandaloneProjectOption | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
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
}: {
  projects: StandaloneProjectOption[];
  activeProject: StandaloneProjectOption | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
}) {
  return (
    <div className="hidden h-[66px] shrink-0 items-center justify-between bg-[#111111] px-5 lg:flex">
      <ProjectPicker
        projects={projects}
        activeProject={activeProject}
        onSelectProject={onSelectProject}
        onCreateProject={onCreateProject}
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
  compact,
}: {
  projects: StandaloneProjectOption[];
  activeProject: StandaloneProjectOption | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
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
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    onSelectProject(project.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-[12px] font-semibold transition",
                    active
                      ? "bg-white/[0.09] text-white"
                      : "text-zinc-300 hover:bg-white/[0.05] hover:text-white",
                  )}
                  role="menuitem"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded bg-amber-400" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  {active && (
                    <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[9px] uppercase text-zinc-400">
                      Active
                    </span>
                  )}
                </button>
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
  const resolutionOptions = isGpt
    ? gptImageResolutionsFor(form.aspectRatio)
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

      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Aspect"
          value={form.aspectRatio}
          options={isGpt ? GPT_IMAGE_ASPECT_RATIOS : ["1:1", "16:9", "9:16", "4:3", "3:4", "Auto"]}
          onChange={(aspectRatio) => onChange({ aspectRatio })}
        />
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
  onUploadStart,
  onUploadEnd,
}: {
  form: StandaloneFormState;
  onChange: (patch: Partial<StandaloneFormState>) => void;
  uploadingStart: boolean;
  uploadingEnd: boolean;
  onUploadStart: () => void;
  onUploadEnd: () => void;
}) {
  const isSeedance = form.model.startsWith("seedance");
  const durations = isSeedance ? [2, 3, 4, 5, 6, 8, 10, 12] : [5, 10];
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <SingleReferenceButton
          label="Start image"
          refItem={form.videoStart}
          uploading={uploadingStart}
          onUpload={onUploadStart}
          onRemove={() => onChange({ videoStart: null })}
        />
        <SingleReferenceButton
          label="End image"
          refItem={form.videoEnd}
          uploading={uploadingEnd}
          onUpload={onUploadEnd}
          onRemove={() => onChange({ videoEnd: null })}
        />
      </div>
      <PromptBox
        label="Prompt"
        placeholder="Describe camera movement, subject, scene, and mood"
        value={form.prompt}
        onChange={(prompt) => onChange({ prompt })}
      />
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Aspect"
          value={form.videoRatio}
          options={isSeedance ? ["16:9", "9:16", "1:1", "4:3"] : ["16:9", "9:16", "1:1"]}
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
      <ToggleRow
        label="Generate audio"
        checked={form.videoWithAudio}
        onChange={(videoWithAudio) => onChange({ videoWithAudio })}
      />
    </>
  );
}

function VoiceControls({
  form,
  onChange,
}: {
  form: StandaloneFormState;
  onChange: (patch: Partial<StandaloneFormState>) => void;
}) {
  const selectedVoice = findGoogleVoice(form.voice);
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
      <div>
        <FieldLabel label="Voice" meta={selectedVoice.family} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          {GOOGLE_VOICES.slice(0, 2).map((voice) => {
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
                  style={{ background: GOOGLE_VOICE_TINT_GRADIENT[voice.tint] }}
                >
                  {voice.name.charAt(0)}
                </span>
                <span className="min-w-0">
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
      </div>
      <TextInputField
        label="Voice instructions"
        value={form.voiceStyle}
        placeholder="e.g. Calm, confident, slightly slower pace"
        onChange={(voiceStyle) => onChange({ voiceStyle })}
      />
    </>
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
            <img
              src={refItem.url}
              alt=""
              className="h-full w-full object-cover"
            />
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
  const result = job.result;
  const params = job.request?.params ?? {};
  const prompt = String(params.prompt ?? "");
  const title =
    prompt.trim().slice(0, 90) ||
    String(params.nodeName ?? params.model_name ?? job.model ?? "Generation");
  const statusTone =
    job.status === "completed"
      ? "text-emerald-300"
      : job.status === "failed" || job.status === "permanent_failed"
        ? "text-red-300"
        : "text-amber-300";
  const url = result?.url;
  const modelUrl = result?.provider_meta?.model_url;
  const duration = String(params.duration ?? "");
  const ratio = String(params.ratio ?? params.aspect_ratio ?? params.size ?? "");
  const modelName = String(params.model_name ?? job.model ?? "model");
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
          {job.status !== "completed" && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[12px] text-zinc-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {job.status}
              </div>
            </div>
          )}
          {result?.type === "image" && url && (
            <img src={url} alt="" className="h-full w-full object-cover" />
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
          {(job.error || job.last_error) && (
            <div className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
              {job.error ?? job.last_error}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 md:flex-col">
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
      const { data, error } = await (supabase as any)
        .from("workspace_generation_jobs")
        .select(
          "id,node_type,provider,model,request,status,attempts,result,error,last_error,created_at,completed_at,credits_charged,credits_refunded",
        )
        .eq("project_id", projectId)
        .eq("canvas_id", standaloneCanvasId(projectId))
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as StandaloneJobRow[];
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
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image references are supported on this surface.");
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  const storagePath = `standalone/${userId}/${projectId}/${Date.now()}-${safeName}`;
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
    });
  }
  if (tool === "voice_gen") {
    return buildAudioParams({
      model: form.model,
      script: form.script,
      voice: form.voice,
      stylePrompt: form.voiceStyle,
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
    return {
      ...(form.videoStart ? { start_frame: form.videoStart.url } : {}),
      ...(form.videoEnd ? { end_frame: form.videoEnd.url } : {}),
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
  if (tool === "video_gen" && !form.prompt.trim() && !form.videoStart) {
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
