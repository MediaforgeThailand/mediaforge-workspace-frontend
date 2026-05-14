/**
 * MediaForge Studio (video editor) — mounted at `/app/editor`.
 *
 * Integration entry point. Workspace's `ProtectedRoute` wrapper handles
 * the auth bounce, so by the time this component renders we already have
 * a signed-in user. The component:
 *
 *   - Initializes editor engines + bridges (deferred to EditorInterface
 *     itself, which guards its render on engine readiness).
 *   - Skips the editor's bundled welcome / templates / share screens —
 *     when launched from the workspace, the user already chose to open
 *     the editor and we go straight to a project.
 *   - Optionally accepts a `?preset=` or `?dimensions=` query param so
 *     deep links can request a fresh project at a specific aspect ratio.
 *   - Restores user-uploaded fonts from IndexedDB on first mount.
 *   - Surfaces the editor's existing IndexedDB project-recovery dialog
 *     when a previous session was interrupted.
 *
 * The editor's standalone App.tsx (now `EditorApp.tsx` in this tree) is
 * intentionally NOT used — it owns hash-based routing and a welcome
 * screen that don't fit the workspace's URL structure.
 */
import { useEffect, useRef, Suspense, lazy } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ToastContainer } from "./components/Toast";
import { ScriptViewDialog } from "./components/ScriptViewDialog";
import { SearchModal } from "./components/SearchModal";
import { RecoveryDialog } from "./components/welcome/RecoveryDialog";
import { useUIStore } from "./stores/ui-store";
import { useProjectStore } from "./stores/project-store";
import { useProjectRecovery } from "./hooks/useProjectRecovery";
import { restoreFontsFromIndexedDB } from "./services/font-manager";
import {
  loadMostRecentProject,
  loadProjectById,
  setCloudSaveEnabled,
  flushCloudSave,
} from "./services/project-cloud";
import { useAuth } from "@/contexts/AuthContext";
import {
  SOCIAL_MEDIA_PRESETS,
  type SocialMediaCategory,
  type Project,
} from "@/lib/openreel-core";
import { TooltipProvider } from "@/components/openreel-ui";

const EditorInterface = lazy(() =>
  import("./components/EditorInterface").then((m) => ({
    default: m.EditorInterface,
  })),
);

const LoadingSpinner: React.FC<{ message: string }> = ({ message }) => (
  <div className="h-screen w-screen bg-background flex flex-col items-center justify-center">
    <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
    <p className="text-sm text-text-secondary">{message}</p>
  </div>
);

const PRESET_DIMENSIONS: Record<string, SocialMediaCategory> = {
  "1080x1920": "tiktok",
  "1920x1080": "youtube-video",
  "1080x1080": "instagram-post",
  "720x1280": "instagram-stories",
  "1280x720": "youtube-video",
};

export default function EditorPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { activeModal, closeModal } = useUIStore();
  const createNewProject = useProjectStore((state) => state.createNewProject);
  const loadProject = useProjectStore((state) => state.loadProject);
  const { showDialog, availableSaves, recover, dismiss, clearAll } =
    useProjectRecovery();
  const hasBootstrapped = useRef(false);

  // Restore user-uploaded fonts (for AI Captions) on app boot. One-shot
  // effect — restoreFontsFromIndexedDB is idempotent so the no-op case is
  // cheap if no fonts were ever uploaded.
  useEffect(() => {
    void restoreFontsFromIndexedDB();
  }, []);

  // While the editor is mounted, prevent the surrounding page from
  // scrolling — the 3-column NLE layout owns the full viewport and
  // generates its own internal scrolling regions.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("editor-mounted");
    return () => {
      document.body.style.overflow = previous;
      document.documentElement.classList.remove("editor-mounted");
    };
  }, []);

  // Enable cloud save while the editor is mounted. Disable on unmount so
  // closing the editor route stops queueing background writes.
  useEffect(() => {
    if (!user) return;
    setCloudSaveEnabled(true);
    return () => {
      // Best-effort flush of any pending debounced save before tearing
      // down, then disable.
      void flushCloudSave().finally(() => setCloudSaveEnabled(false));
    };
  }, [user]);

  /**
   * First-paint project bootstrap. We need a project to render the
   * editor; pick the right one based on URL.
   *
   *   /app/editor                 → load user's most-recent project
   *                                  (or new 1080p if none)
   *   /app/editor?preset=tiktok   → new project from preset
   *   /app/editor?dimensions=…    → new project with custom dimensions
   *   /app/editor/:projectId      → load specific project
   */
  useEffect(() => {
    if (hasBootstrapped.current) return;
    if (!user) return; // wait for auth — ProtectedRoute will normally bounce, but be defensive
    hasBootstrapped.current = true;

    void (async () => {
      if (projectId) {
        const loaded = await loadProjectById(projectId);
        if (loaded) {
          loadProject(loaded as Project);
          return;
        }
        // Fall through to fresh-project if id wasn't found (e.g. shared
        // link from someone else, since RLS blocks cross-user reads).
      }

      const preset = searchParams.get("preset");
      const dimensions = searchParams.get("dimensions");
      const widthParam = searchParams.get("width");
      const heightParam = searchParams.get("height");
      const fpsParam = searchParams.get("fps");

      // No explicit "new" intent — try to resume the user's latest
      // project from the cloud. Only fall back to creating a fresh
      // project if there is nothing to resume.
      const hasNewIntent = !!(preset || dimensions || (widthParam && heightParam));
      if (!hasNewIntent) {
        const recent = await loadMostRecentProject();
        if (recent) {
          loadProject(recent as Project);
          return;
        }
      }

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
    })();
  }, [projectId, searchParams, createNewProject, loadProject, user]);

  return (
    <TooltipProvider>
      <div className="h-screen w-screen bg-background text-text-primary overflow-hidden">
        <main role="main" className="h-full w-full">
          <h1 className="sr-only">MediaForge Studio — video editor</h1>
          <Suspense fallback={<LoadingSpinner message="Loading editor..." />}>
            <EditorInterface />
          </Suspense>
        </main>
        <ToastContainer />
        <ScriptViewDialog
          isOpen={activeModal === "scriptView"}
          onClose={closeModal}
        />
        <SearchModal isOpen={activeModal === "search"} onClose={closeModal} />
        {showDialog && availableSaves.length > 0 && (
          <RecoveryDialog
            saves={availableSaves}
            onRecover={async (saveId) => {
              await recover(saveId);
            }}
            onDismiss={dismiss}
            onClearAll={clearAll}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
