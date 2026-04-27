/**
 * Workspace Canvas page — full-screen, three-column layout.
 *
 * Routed at `/app/workspace/:workspaceId` (the URL is the WORKSPACE,
 * not a specific canvas/tab). The active tab lives in the store as
 * `current.id`; switching tabs only nudges store state, never the
 * URL. This matches the user's mental model — one workspace = one
 * URL, tabs are sub-views.
 *
 * Hydration order:
 *
 *   1. **Resolve the workspace from the URL.** If `:workspaceId`
 *      doesn't match any local workspace AND the user is signed in,
 *      we still allow the canvas page to load — the canvas list will
 *      come from the server below.
 *
 *   2. **Pick (or bootstrap) a canvas.** Most-recently-updated wins.
 *      If the workspace has zero canvases, auto-create one so the
 *      tab bar is never empty.
 *
 *   3. **Local cache first** for that canvas → instant render.
 *      **Server in the background** to overwrite with canonical state.
 *
 *   4. **Bounce only when nothing exists** — no local + no server +
 *      no auth → redirect to the dashboard so the user picks again.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useAuth } from "@/contexts/AuthContext";
import WorkspaceTabBar from "@/components/workspace/WorkspaceTabBar";
// Tool palette is replaced by the in-canvas floating sidebar (see
// CanvasFloatingSidebar) + the right-click context menu (see
// CanvasContextMenu). Both live inside WorkspaceCanvas and don't
// need a slot in this layout.
import WorkspaceCanvas from "@/components/workspace/WorkspaceCanvas";
import WorkspaceRightSidebar from "@/components/workspace/WorkspaceRightSidebar";
import WorkspaceDebugPanel from "@/components/workspace/WorkspaceDebugPanel";
import WorkspaceMascot from "@/components/workspace/WorkspaceMascot";
import { loadCanvasFromServer } from "@/components/workspace/canvasPersistence";

const WorkspaceCanvasPage = () => {
  // Route param is now `workspaceId` (was `canvasId`). React Router
  // doesn't care about the param name on its own — the route still
  // matches `/app/workspace/:workspaceId` either way — so existing
  // bookmarks pointing at canvas IDs will fall through the
  // workspace-lookup miss and bounce to the dashboard. That's fine
  // for dev where users can re-open from there.
  const { workspaceId: routeId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const openCanvas = useWorkspaceStore((s) => s.openCanvas);
  const replaceCanvasGraph = useWorkspaceStore((s) => s.replaceCanvasGraph);
  const createCanvas = useWorkspaceStore((s) => s.createCanvas);
  const { user, loading: authLoading } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [bounced, setBounced] = useState(false);

  // Resolve `:routeId` → most-recent canvas in that workspace. If
  // the workspace has no canvases yet, return null so we can
  // auto-create one inside the effect.
  //
  // Backward-compat: if the URL is actually a CANVAS id (old
  // bookmark or direct paste from the brief period when URLs were
  // canvas-scoped), still try to open it. We detect this by
  // looking up the id in `canvases[]` and if found, open it
  // directly without touching the URL.
  const targetCanvasId = useMemo(() => {
    if (!routeId) return null;
    const state = useWorkspaceStore.getState();
    // Workspace match — pick most recent canvas inside.
    const tabs = state.canvases
      .filter((c) => c.workspaceId === routeId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (tabs.length > 0) return tabs[0].id;
    // Direct canvas-id match (legacy URL).
    if (state.canvases.some((c) => c.id === routeId)) return routeId;
    return null;
  }, [routeId]);

  useEffect(() => {
    if (!routeId) return;
    if (bounced) return;
    let cancelled = false;

    const state = useWorkspaceStore.getState();
    const workspaceExists = state.workspaces.some((w) => w.id === routeId);

    /* ── Auto-bootstrap an empty workspace ─────────────────
     * Workspace exists locally but has zero canvases — spin one up
     * so the tab bar isn't empty. Picks up the workspace's id and
     * inherits its name implicitly. */
    if (workspaceExists && targetCanvasId == null) {
      const fresh = createCanvas(routeId);
      openCanvas(fresh);
      setHydrated(true);
      return;
    }

    /* ── Already have a target canvas locally — render now ── */
    if (targetCanvasId) {
      openCanvas(targetCanvasId);
      setHydrated(true);
      // Refresh the active canvas from server in the background
      // when signed in, so the user gets the latest snapshot
      // without a load spinner.
      if (!authLoading && user?.id) {
        loadCanvasFromServer(targetCanvasId).then((g) => {
          if (cancelled || !g) return;
          replaceCanvasGraph(g);
        }).catch(() => {
          /* offline / table missing — local cache stays */
        });
      }
      return () => {
        cancelled = true;
      };
    }

    /* ── No local match — wait for auth before hitting server ── */
    if (authLoading) return;

    if (!user?.id) {
      // Guest with no local data → dashboard so they can sign in
      // / pick another workspace.
      setBounced(true);
      navigate("/app/workspace", { replace: true });
      return;
    }

    /* ── Signed in. Try the server: maybe `routeId` is a canvas
     *  on another device that hasn't been mirrored locally yet. */
    (async () => {
      try {
        const g = await loadCanvasFromServer(routeId);
        if (cancelled) return;
        if (g) {
          replaceCanvasGraph(g);
          openCanvas(routeId);
          setHydrated(true);
        } else {
          setBounced(true);
          navigate("/app/workspace", { replace: true });
        }
      } catch (err) {
        console.warn("[canvas-page] server resolve failed:", err);
        setBounced(true);
        navigate("/app/workspace", { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    routeId,
    targetCanvasId,
    user?.id,
    authLoading,
    bounced,
    openCanvas,
    replaceCanvasGraph,
    createCanvas,
    navigate,
  ]);

  return (
    // Workspace UI uses 'Prompt' as its primary typeface — same family
    // the marketing site renders Thai + Latin in, so the dashboard
    // and the canvas read as one product. Falls through to system
    // sans-serif for any environment that hasn't loaded the Google
    // Font yet (gives the layout a stable measurement during cold
    // load instead of a FOUT punch).
    <div
      className="flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100"
      style={{
        fontFamily: "'Prompt', system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <WorkspaceTabBar />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1">
          {hydrated ? (
            <WorkspaceCanvas />
          ) : (
            <CanvasHydrationStatus
              authLoading={authLoading}
              hasUser={!!user?.id}
            />
          )}
        </main>
        <WorkspaceRightSidebar />
      </div>
      <WorkspaceDebugPanel />
      <WorkspaceMascot />
    </div>
  );
};

export default WorkspaceCanvasPage;

/* ── Hydration placeholder ───────────────────────────────────
 * Renders BEFORE the canvas appears. Loud spinner + status text
 * + escape hatch back to the dashboard so the user is never
 * stuck staring at an unexplained black void. */
function CanvasHydrationStatus({
  authLoading,
  hasUser,
}: {
  authLoading: boolean;
  hasUser: boolean;
}) {
  const status = authLoading
    ? "Checking sign-in…"
    : hasUser
      ? "Loading canvas from server…"
      : "Looking up canvas…";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-300">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-200" />
      <div className="text-sm">{status}</div>
      <a
        href="/app/workspace"
        className="text-[11px] text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline"
      >
        ← Back to workspaces
      </a>
    </div>
  );
}
