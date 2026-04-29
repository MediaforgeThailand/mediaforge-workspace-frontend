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
import WorkspaceCanvasPagePill from "@/components/workspace/WorkspaceCanvasPagePill";
import CanvasHeader from "@/components/workspace/CanvasHeader";
// Tool palette is replaced by the in-canvas floating sidebar (see
// CanvasFloatingSidebar) + the right-click context menu (see
// CanvasContextMenu). Both live inside WorkspaceCanvas and don't
// need a slot in this layout.
import WorkspaceCanvas from "@/components/workspace/WorkspaceCanvas";
// React #185 root cause was traced to inline array / object props on
// the <ReactFlow /> component (panOnDrag, deleteKeyCode, etc.) —
// fixed in commit "fix(workspace): React #185 — unstable array
// props on <ReactFlow />". The bisect-disabled panels below were
// false suspects; safe to restore now.
//
// Right sidebar — Assets panel + AI assistant — temporarily hidden
// at the user's request (UI declutter). Code is intentionally KEPT
// so we can flip it back on with a one-line uncomment; do not
// delete the file or the import. The leading underscore silences
// the unused-import warning while the JSX is commented out.
import _WorkspaceRightSidebar from "@/components/workspace/WorkspaceRightSidebar";
import WorkspaceMascot from "@/components/workspace/WorkspaceMascot";
// DebugPanel still gated — its persisted Zustand store hasn't been
// audited end-to-end and we don't need it for the demo. Bring back
// in a follow-up commit after a focused review.
// import WorkspaceDebugPanel from "@/components/workspace/WorkspaceDebugPanel";
import WorkspaceErrorBoundary from "@/components/workspace/WorkspaceErrorBoundary";
import OrgCreditBadge from "@/components/OrgCreditBadge";
import {
  loadCanvasFromServer,
  loadCanvasesByWorkspaceFromServer,
} from "@/components/workspace/canvasPersistence";

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

    /* ── Workspace exists locally but no canvases yet ──────
     * Two reasons this could happen:
     *   a) The workspace was just synced from the server (cross-
     *      device dashboard hydration) but its canvases haven't
     *      been mirrored locally yet — they live in
     *      `workspace_canvases` server-side and we need to fetch
     *      them BEFORE auto-bootstrapping a Page 1 (otherwise we'd
     *      shadow the real canvases with an empty placeholder
     *      that then races to overwrite them via autosave).
     *   b) The workspace really is fresh / empty — created on
     *      this device, never had a canvas. In which case we
     *      bootstrap.
     *
     * Distinguish by asking the server first when the user is
     * signed in. */
    if (workspaceExists && targetCanvasId == null) {
      if (!authLoading && user?.id) {
        (async () => {
          try {
            const serverCanvases =
              await loadCanvasesByWorkspaceFromServer(routeId);
            if (cancelled) return;

            if (serverCanvases && serverCanvases.length > 0) {
              // Hydrate every canvas into the local store. The most-
              // recently-updated one becomes the active tab, matching
              // the dashboard's ordering. The rest populate the tab
              // bar so the user can switch between them.
              for (const g of serverCanvases) {
                replaceCanvasGraph(g);
              }
              openCanvas(serverCanvases[0].id);
              setHydrated(true);
              return;
            }

            // Server confirmed empty — bootstrap a Page 1 locally.
            const fresh = createCanvas(routeId);
            openCanvas(fresh);
            setHydrated(true);
          } catch (err) {
            console.warn(
              "[canvas-page] workspace canvases fetch failed:",
              err,
            );
            if (cancelled) return;
            // Last resort — bootstrap so the user isn't stuck on
            // the loading spinner. They'll see an empty Page 1
            // and can refresh once the network's back.
            const fresh = createCanvas(routeId);
            openCanvas(fresh);
            setHydrated(true);
          }
        })();
        return () => {
          cancelled = true;
        };
      }
      // Guest — no server to ask, just bootstrap.
      const fresh = createCanvas(routeId);
      openCanvas(fresh);
      setHydrated(true);
      return;
    }

    /* ── Already have a target canvas locally — render now ── */
    if (targetCanvasId) {
      openCanvas(targetCanvasId);
      setHydrated(true);
      // Refresh the WHOLE workspace from server in the background.
      // Was: refreshed only `targetCanvasId`. That caused a Device-A
      // user to never see canvases that exist on the server but
      // weren't in their localStorage — e.g. a 44-node canvas
      // created on Device B while Device A had only the local
      // empty Page 1 placeholder. Tab bar showed just the empty
      // placeholder; the real work appeared "lost" until the user
      // dug into the URL by hand.
      // Fetching the full workspace fixes that — every server canvas
      // gets merged into the local store via `replaceCanvasGraph`,
      // tab bar reflects the union. Most-recently-updated wins as
      // the active tab if our local pick is staler.
      if (!authLoading && user?.id) {
        loadCanvasesByWorkspaceFromServer(routeId).then((serverCanvases) => {
          if (cancelled || !serverCanvases) return;
          for (const g of serverCanvases) {
            replaceCanvasGraph(g);
          }
          // If the server has a fresher canvas than the one we
          // opened locally, switch to it so the user lands on the
          // newest work without a manual tab click.
          const freshest = serverCanvases[0]; // already sorted desc
          if (
            freshest &&
            freshest.id !== targetCanvasId &&
            freshest.updatedAt >
              (useWorkspaceStore
                .getState()
                .canvases.find((c) => c.id === targetCanvasId)?.updatedAt ?? 0)
          ) {
            openCanvas(freshest.id);
          }
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
      {/* Floating credit pill — top-right of the canvas, above tabs and
          toolbars. OrgCreditBadge returns null for consumer/guest users
          (no membership), so the consumer flow is unaffected. */}
      <div className="pointer-events-none fixed right-4 top-3 z-50">
        <div className="pointer-events-auto">
          <OrgCreditBadge variant="pill" />
        </div>
      </div>
      {/* Wrap the entire workspace in an error boundary so an uncaught
          render exception (model-viewer panic, third-party hook
          assertion, etc.) shows a recoverable error card instead of
          unmounting the React tree and leaving the user staring at a
          black void with no escape but F5. */}
      <WorkspaceErrorBoundary>
        <CanvasHeader />
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
          {/* Right sidebar (Assets panel + AI assistant) hidden per
           *  user request. Restore by uncommenting + renaming the
           *  import above back to `WorkspaceRightSidebar`. */}
          {/* <WorkspaceRightSidebar /> */}
        </div>
        {/* <WorkspaceDebugPanel /> — kept disabled until persist
         *   middleware is audited (not blocking demo). */}
        <WorkspaceMascot />
        {/* Floating page switcher — bottom-left of the canvas.
         *  Replaced the old WorkspaceTabBar (top-row strip) so the
         *  canvas gets a full row of vertical space back. The pill
         *  is fixed-positioned, so its JSX order doesn't matter — we
         *  keep it inside the error boundary so a render fault in
         *  the popover surfaces in the same recoverable card the
         *  rest of the workspace uses. */}
        {hydrated && <WorkspaceCanvasPagePill />}
      </WorkspaceErrorBoundary>
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
