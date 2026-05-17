/**
 * MediaForge Studio (video editor) mounted under `/app/editor`.
 *
 * `/app/editor` is the editor project hub.
 * `/app/editor/:projectId` opens a saved editor project.
 * Explicit query intents like `/app/editor?new=1` still create and open a
 * fresh project for deep-link compatibility.
 */
import { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Clapperboard,
  Clock,
  FolderOpen,
  Loader2,
  Plus,
} from "lucide-react";
import { ToastContainer } from "./components/Toast";
import { ScriptViewDialog } from "./components/ScriptViewDialog";
import { useUIStore } from "./stores/ui-store";
import { useProjectStore } from "./stores/project-store";
import { toast } from "./stores/notification-store";
import { createEmptyProject } from "./stores/project";
import { restoreFontsFromIndexedDB } from "./services/font-manager";
import {
  listUserProjects,
  loadProjectRowById,
  saveProject,
  setCloudSaveEnabled,
  flushCloudSave,
  type CloudProjectSummary,
} from "./services/project-cloud";
import { autoSaveManager } from "./services/auto-save";
import { loadProjectMedia, saveMediaBlob } from "./services/media-storage";
import { restoreMediaItem } from "./utils/media-recovery";
import { useAuth } from "@/contexts/AuthContext";
import {
  SOCIAL_MEDIA_PRESETS,
  type SocialMediaCategory,
  type Project,
} from "@/lib/openreel-core";
import { TooltipProvider } from "@/components/openreel-ui";
import {
  clearAutoSubtitleHandoff,
  createAutoSubtitleEditorProject,
  loadAutoSubtitleHandoff,
} from "@/components/workspace/autoSubtitleStandalone";

const EditorInterface = lazy(() =>
  import("./components/EditorInterface").then((m) => ({
    default: m.EditorInterface,
  })),
);

const LoadingSpinner: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex h-screen w-screen flex-col items-center justify-center bg-background">
    <div className="mb-3 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    <p className="text-sm text-text-secondary">{message}</p>
  </div>
);

function isRuntimeBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

async function hydrateProjectMedia(project: Project): Promise<Project> {
  const storedMedia = await loadProjectMedia(project.id).catch((error) => {
    console.warn("[EditorPage] local media lookup failed:", error);
    return [];
  });
  const blobMap = new Map(storedMedia.map((record) => [record.id, record.blob]));

  const restoredItems = await Promise.all(
    project.mediaLibrary.items.map(async (item) => {
      const itemWithValidBlob = isRuntimeBlob(item.blob)
        ? item
        : { ...item, blob: null };
      let storedBlob = blobMap.get(item.id);

      if (!storedBlob && itemWithValidBlob.originalUrl) {
        try {
          const response = await fetch(itemWithValidBlob.originalUrl);
          if (response.ok) {
            storedBlob = await response.blob();
            await saveMediaBlob(
              project.id,
              item.id,
              storedBlob,
              item.metadata,
            ).catch((error) => {
              console.warn("[EditorPage] local media cache failed:", error);
            });
          }
        } catch (error) {
          console.warn("[EditorPage] remote media restore failed:", error);
        }
      }

      return restoreMediaItem(itemWithValidBlob, storedBlob);
    }),
  );

  return {
    ...project,
    mediaLibrary: {
      ...project.mediaLibrary,
      items: restoredItems,
    },
  };
}

async function recoverNewerLocalProject(
  project: Project,
  cloudUpdatedAt?: string,
): Promise<Project> {
  try {
    const localSave = await autoSaveManager.getMostRecentSave(project.id);
    if (!localSave) {
      return project;
    }

    const cloudSavedAt = cloudUpdatedAt
      ? new Date(cloudUpdatedAt).getTime()
      : NaN;
    const baseline =
      Number.isFinite(cloudSavedAt) && cloudSavedAt > 0
        ? cloudSavedAt
        : typeof project.modifiedAt === "number"
          ? project.modifiedAt
          : 0;

    if (localSave.timestamp <= baseline + 1000) {
      return project;
    }

    const recoveredProject = await autoSaveManager.recover(localSave.id);
    if (!recoveredProject || recoveredProject.id !== project.id) {
      return project;
    }

    toast.info(
      "Recovered latest local edits",
      "Restored the newest autosave from this device.",
    );
    return recoveredProject;
  } catch (error) {
    console.warn("[EditorPage] Local autosave recovery failed:", error);
    return project;
  }
}

const PRESET_DIMENSIONS: Record<string, SocialMediaCategory> = {
  "1080x1920": "tiktok",
  "1920x1080": "youtube-video",
  "1080x1080": "instagram-post",
  "720x1280": "instagram-stories",
  "1280x720": "youtube-video",
};

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatUpdatedAt(value: string): string {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "Recently edited";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

const EditorProjectsHome: React.FC<{
  userEmail?: string | null;
  onCreateProject: () => Promise<void>;
}> = ({ userEmail, onCreateProject }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<CloudProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    const rows = await listUserProjects(80);
    setProjects(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const handleCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      await onCreateProject();
    } catch (err) {
      console.error("[EditorProjectsHome] create failed:", err);
      setError("Could not create project. Please try again.");
      setCreating(false);
    }
  }, [creating, onCreateProject]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#060b0a] text-white">
      <div className="flex h-full">
        <aside className="hidden w-[224px] shrink-0 flex-col border-r border-white/[0.08] bg-[#0b1412] p-5 md:flex">
          <div className="mb-7 flex items-center gap-2">
            <img
              src="/mediaforge-logo.svg"
              alt=""
              className="h-7 w-7 rounded-md object-contain"
              draggable={false}
            />
            <span className="text-sm font-semibold tracking-tight">MediaForge</span>
          </div>

          <div className="mb-7 rounded-xl border border-white/[0.07] bg-white/[0.045] p-3">
            <div className="text-xs text-white/45">Signed in</div>
            <div className="mt-1 truncate text-[13px] font-medium text-white/90">
              {userEmail || "MediaForge user"}
            </div>
          </div>

          <div className="space-y-1">
            <div className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-white/35">
              Video editing
            </div>
            <button
              type="button"
              className="flex h-10 w-full items-center gap-3 rounded-lg bg-white/[0.08] px-3 text-left text-[13px] font-semibold text-white"
            >
              <Clapperboard size={16} />
              Home
            </button>
            <button
              type="button"
              onClick={() => navigate("/app/workspace")}
              className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium text-white/62 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <ArrowLeft size={16} />
              Workspace
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto px-5 py-5 md:px-10 md:py-9">
          <section className="mx-auto max-w-[1280px]">
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="ci-gloss-button group flex h-[132px] w-full items-center justify-center gap-4 rounded-lg border transition-transform hover:-translate-y-px disabled:cursor-wait disabled:opacity-75"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#070707] text-[color:var(--brand-primary)] transition-transform group-hover:scale-105">
                {creating ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Plus size={18} strokeWidth={2.6} />
                )}
              </span>
              <span className="text-[17px] font-bold">
                {creating ? "Creating project..." : "Create project"}
              </span>
            </button>

            {error && (
              <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}

            <div className="mt-10 flex items-center justify-between gap-4">
              <h2 className="text-[17px] font-semibold text-white">Projects</h2>
              <button
                type="button"
                onClick={() => void refreshProjects()}
                className="rounded-md border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.09] hover:text-white"
              >
                Refresh
              </button>
            </div>

            {loading ? (
              <div className="mt-8 flex items-center gap-3 text-sm text-white/55">
                <Loader2 size={18} className="animate-spin" />
                Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <div className="mt-8 rounded-lg border border-dashed border-white/[0.12] bg-white/[0.025] px-6 py-10 text-center">
                <FolderOpen className="mx-auto mb-3 text-white/35" size={28} />
                <div className="text-sm font-semibold text-white/82">No editor projects yet</div>
                <div className="mt-1 text-sm text-white/45">Create your first project to start editing.</div>
              </div>
            ) : (
              <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => navigate(`/app/editor/${project.id}`)}
                    className="group min-w-0 text-left"
                  >
                    <div className="aspect-video overflow-hidden rounded-md border border-white/[0.06] bg-black shadow-[0_14px_38px_-24px_rgba(0,0,0,.9)] transition-colors group-hover:border-cyan-300/50">
                      {project.thumbnail ? (
                        <img
                          src={project.thumbnail}
                          alt=""
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[#020404] text-white/22">
                          <Clapperboard size={24} />
                        </div>
                      )}
                    </div>
                    <div className="mt-2 truncate text-[13px] font-semibold text-white group-hover:text-cyan-100">
                      {project.name || "Untitled Project"}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-white/42">
                      <Clock size={12} />
                      <span>{formatDuration(project.duration_sec)}</span>
                      <span>·</span>
                      <span>{formatUpdatedAt(project.updated_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
};

export default function EditorPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeModal, closeModal } = useUIStore();
  const createNewProject = useProjectStore((state) => state.createNewProject);
  const loadProject = useProjectStore((state) => state.loadProject);
  const hasBootstrapped = useRef(false);
  const autoSubtitleHandoffId = searchParams.get("autoSubtitleHandoff");
  const hasNewIntent = useMemo(
    () =>
      searchParams.has("autoSubtitleHandoff") ||
      searchParams.has("new") ||
      searchParams.has("preset") ||
      searchParams.has("dimensions") ||
      (searchParams.has("width") && searchParams.has("height")),
    [searchParams],
  );
  const showProjectHub = !projectId && !hasNewIntent;

  const createAndOpenProject = useCallback(async () => {
    const project = createEmptyProject("New Project");
    loadProject(project);
    const saved = await saveProject(project);
    if (!saved) throw new Error("Project could not be saved");
    navigate(`/app/editor/${project.id}`);
  }, [loadProject, navigate]);

  useEffect(() => {
    void restoreFontsFromIndexedDB();
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("editor-mounted");
    return () => {
      document.body.style.overflow = previous;
      document.documentElement.classList.remove("editor-mounted");
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    setCloudSaveEnabled(true);
    return () => {
      void (async () => {
        try {
          await autoSaveManager.flush();
        } catch (error) {
          console.warn("[EditorPage] Auto-save unmount flush failed:", error);
        }

        try {
          await flushCloudSave();
        } finally {
          setCloudSaveEnabled(false);
        }
      })();
    };
  }, [user]);

  useEffect(() => {
    if (hasBootstrapped.current) return;
    if (!user) return;
    if (showProjectHub) return;
    hasBootstrapped.current = true;

    void (async () => {
      if (projectId) {
        const loaded = await loadProjectRowById(projectId);
        if (loaded) {
          const projectToLoad = await recoverNewerLocalProject(
            loaded.data as Project,
            loaded.updated_at,
          );
          const projectWithMedia = await hydrateProjectMedia(projectToLoad);
          loadProject(projectWithMedia);
          return;
        }
        navigate("/app/editor", { replace: true });
        return;
      }

      if (autoSubtitleHandoffId) {
        const handoff = loadAutoSubtitleHandoff(autoSubtitleHandoffId);
        if (!handoff) {
          navigate("/app/editor", { replace: true });
          return;
        }
        try {
          const nextProjectId = await createAutoSubtitleEditorProject(handoff);
          clearAutoSubtitleHandoff(autoSubtitleHandoffId);
          navigate(`/app/editor/${nextProjectId}`, { replace: true });
        } catch (err) {
          console.error("[EditorPage] Auto Subtitle handoff failed:", err);
          navigate("/app/editor", { replace: true });
        }
        return;
      }

      const preset = searchParams.get("preset");
      const dimensions = searchParams.get("dimensions");
      const widthParam = searchParams.get("width");
      const heightParam = searchParams.get("height");
      const fpsParam = searchParams.get("fps");

      let projectName = "New Project";
      let width = 1920;
      let height = 1080;
      let frameRate = fpsParam ? parseInt(fpsParam, 10) || 30 : 30;

      if (preset) {
        const presetKey = preset as SocialMediaCategory;
        const presetCfg = SOCIAL_MEDIA_PRESETS[presetKey];
        if (presetCfg) {
          width = presetCfg.width;
          height = presetCfg.height;
          frameRate = presetCfg.frameRate || frameRate;
          projectName = `New ${preset.charAt(0).toUpperCase() + preset.slice(1).replace(/-/g, " ")} Project`;
        }
      } else if (dimensions) {
        const match = dimensions.match(/^(\d+)x(\d+)$/i);
        if (match) {
          width = parseInt(match[1], 10);
          height = parseInt(match[2], 10);
          const aspectRatio = width / height;
          if (aspectRatio < 1) projectName = "New Vertical Video";
          else if (aspectRatio > 1) projectName = "New Horizontal Video";
          else projectName = "New Square Video";
          const dimensionKey = `${width}x${height}`;
          const matchingPreset = PRESET_DIMENSIONS[dimensionKey];
          if (matchingPreset) {
            const presetCfg = SOCIAL_MEDIA_PRESETS[matchingPreset];
            frameRate = presetCfg.frameRate || frameRate;
          }
        }
      } else if (widthParam && heightParam) {
        width = parseInt(widthParam, 10);
        height = parseInt(heightParam, 10);
      }

      createNewProject(projectName, { width, height, frameRate });
      const project = useProjectStore.getState().project;
      void saveProject(project);
      navigate(`/app/editor/${project.id}`, { replace: true });
    })();
  }, [
    projectId,
    searchParams,
    autoSubtitleHandoffId,
    createNewProject,
    loadProject,
    user,
    showProjectHub,
    navigate,
  ]);

  if (showProjectHub) {
    return (
      <TooltipProvider>
        <EditorProjectsHome
          userEmail={user?.email ?? null}
          onCreateProject={createAndOpenProject}
        />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="h-screen w-screen overflow-hidden bg-background text-text-primary">
        <main role="main" className="h-full w-full">
          <h1 className="sr-only">MediaForge Studio video editor</h1>
          <Suspense fallback={<LoadingSpinner message="Loading editor..." />}>
            <EditorInterface />
          </Suspense>
        </main>
        <ToastContainer />
        <ScriptViewDialog
          isOpen={activeModal === "scriptView"}
          onClose={closeModal}
        />
      </div>
    </TooltipProvider>
  );
}
