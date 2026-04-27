/**
 * Workspace Canvas page — full-screen, three-column layout.
 *
 * Routed at /app/workspace/:canvasId (outside DashboardLayout — like
 * the legacy Flow Studio editor — so the user has the full viewport).
 */

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import WorkspaceTabBar from "@/components/workspace/WorkspaceTabBar";
import WorkspaceToolPalette from "@/components/workspace/WorkspaceToolPalette";
import WorkspaceCanvas from "@/components/workspace/WorkspaceCanvas";
import WorkspaceRightSidebar from "@/components/workspace/WorkspaceRightSidebar";
import WorkspaceDebugPanel from "@/components/workspace/WorkspaceDebugPanel";
import WorkspaceMascot from "@/components/workspace/WorkspaceMascot";

const WorkspaceCanvasPage = () => {
  const { canvasId } = useParams<{ canvasId: string }>();
  const navigate = useNavigate();
  const openCanvas = useWorkspaceStore((s) => s.openCanvas);

  // CRITICAL: do NOT subscribe to `canvases` here — every workspace
  // mutation (delete a node, move a node, run a step…) re-creates
  // the canvases array in withCurrent, which would re-fire this
  // effect and call `openCanvas(canvasId)` again, which RESETS the
  // undo / redo history. That's the long-standing reason why Ctrl+Z
  // appeared to "do nothing" — every snapshot was being wiped on the
  // next render. Read canvases once via getState() inside the effect
  // body and depend only on the id (which is what actually changes
  // when the user navigates between tabs).
  useEffect(() => {
    if (!canvasId) return;
    const state = useWorkspaceStore.getState();
    const exists = state.canvases.some((c) => c.id === canvasId);
    if (!exists) {
      // Local-state-only at wireframe stage — if the canvas isn't in the
      // store (e.g. after a hard refresh), bounce back to the dashboard.
      navigate("/app/workspace", { replace: true });
      return;
    }
    openCanvas(canvasId);
  }, [canvasId, openCanvas, navigate]);

  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Top header removed — Back / canvas-name / Save / Run buttons
       *  now live inside the tab bar itself for a tighter chrome. */}
      <WorkspaceTabBar />
      <div className="flex flex-1 overflow-hidden">
        <WorkspaceToolPalette />
        <main className="flex-1">
          <WorkspaceCanvas />
        </main>
        <WorkspaceRightSidebar />
      </div>
      <WorkspaceDebugPanel />
      <WorkspaceMascot />
    </div>
  );
};

export default WorkspaceCanvasPage;
