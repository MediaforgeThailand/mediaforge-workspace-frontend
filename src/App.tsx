/**
 * Workspace product — slim app shell.
 *
 * After the Wave 1 cleanup this repo is the workspace-only product
 * (companion to mediaforge-workspace-backend). The huge consumer
 * surface — flow studio, creator dashboard, partner / affiliate,
 * play-flow runner, admin pages, demo redemption, marketing landing
 * — was removed; what remains is the canvas editor + the auth shell
 * around it.
 *
 * Routes:
 *   /                          → redirect to /app/workspace
 *   /auth                      → sign-in / sign-up
 *   /reset-password            → password reset
 *   /privacy, /terms           → legal pages (still served at this
 *                                  domain so existing inbound links
 *                                  don't 404)
 *   /app/workspace             → spaces dashboard
 *   /app/workspace/:id         → full-screen canvas
 *   /app/settings              → user settings (workspace-shaped,
 *                                  Wave 2 will rebuild the inside)
 *   /app/usage                 → credit usage (formerly "Transactions")
 *   /app/pricing               → plan picker (full-width — uses
 *                                  WorkspacePageShell, not AccountShell)
 *   *                          → 404
 *
 * Anything that lazy-loaded a deleted page is gone. App.tsx is back
 * to ~80 lines from the consumer-app's ~400+.
 */

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { lazy, Suspense } from "react";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Refund from "./pages/Refund";
import AUP from "./pages/AUP";
import Cookies from "./pages/Cookies";
import CookieConsent from "./components/CookieConsent";
import ProtectedRoute from "./components/ProtectedRoute";
import OrgUserBlockGate from "./components/OrgUserBlockGate";
import AccountShell from "./components/workspace/AccountShell";
import WorkspacePageShell from "./components/workspace/WorkspacePageShell";
import MobileSpaceBlockGate from "./components/workspace/MobileSpaceBlockGate";
import PageLoadingAnim from "./components/ui/PageLoadingAnim";

/**
 * Wrap lazy imports so a stale-chunk 404 after deployment
 * automatically reloads the page once (instead of crashing).
 *
 * Failure modes:
 *   1. First miss   → set sentinel, full-reload the page. The reload
 *                     fetches the freshest index.html which references
 *                     the new chunk hashes — the import succeeds.
 *   2. Second miss  → reload didn't fix it (CDN propagation lag,
 *                     network down, ad-blocker eating the chunk, etc.).
 *                     Throwing here would bubble through Suspense with
 *                     no error boundary above it and give the user a
 *                     black screen. Instead, hard-redirect them to the
 *                     dashboard root — that path's chunk usually IS
 *                     loaded already in this session, and even if it
 *                     isn't, the browser does a full page-load so the
 *                     user lands on a real page rather than nothing.
 */
function lazyWithRetry(factory: () => Promise<{ default: React.ComponentType<any> }>) {
  return lazy(() =>
    factory().catch((err) => {
      const key = "chunk-reload";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        return new Promise(() => {}); // never resolves — page is reloading
      }
      sessionStorage.removeItem(key);
      // Second failure — bail out to the dashboard via a hard nav so
      // the user never sees a blank/black void from an unhandled
      // Suspense throw. Log so we can still see the original error.
      // eslint-disable-next-line no-console
      console.error("[lazyWithRetry] chunk load failed twice, redirecting:", err);
      window.location.href = "/app/workspace";
      return new Promise(() => {}); // never resolves — page is navigating
    })
  );
}

// ── Auth shell ────────────────────────────────────────────────
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));

// ── Workspace surfaces ────────────────────────────────────────
// Dashboard (list of spaces) lives inside DashboardLayout chrome.
// Canvas page is full-screen; mounted at top level so it claims the
// whole viewport without competing with sidebar/topbar.
const WorkspaceDashboard = lazyWithRetry(() => import("./pages/workspace"));
const WorkspaceCanvasPage = lazyWithRetry(() => import("./pages/workspace/Canvas"));

// ── Account surfaces — wrapped in AccountShell (workspace-shaped
//     chrome) instead of the legacy DashboardLayout. The pages
//     themselves were lightly-rewired in Wave 2 to drop consumer
//     concepts (brand context form, etc.). ────────────────────
const Settings = lazyWithRetry(() => import("./pages/dashboard/Settings"));
const Transactions = lazyWithRetry(() => import("./pages/dashboard/Transactions"));
const Pricing = lazyWithRetry(() => import("./pages/dashboard/Pricing"));
const TeamRegister = lazyWithRetry(() => import("./pages/dashboard/TeamRegister"));

// ── Org/workspace surfaces ────────────────────────────────────
// TeacherCenter — Variant A "Command Center" for teachers + org_admins.
// Replaces the older OrgAdminPanel. Sidebar lists classes the user can
// manage; main area shows tabs (Overview / Members / AI Usage / Codes /
// Activity) with AI model ranking + analytics for the demo.
// ClassEnroll — public landing page where students arrive after
// scanning a teacher's QR. Page handles its own guest → /auth bounce.
const TeacherCenter = lazyWithRetry(() => import("./pages/teacher-center"));
const ClassEnroll = lazyWithRetry(() => import("./pages/ClassEnroll"));
const OrgBranding = lazyWithRetry(() => import("./pages/org-admin/branding"));

const queryClient = new QueryClient();
const PageLoader = () => <PageLoadingAnim />;
const PricingAliasRedirect = () => {
  const location = useLocation();
  return <Navigate to={{ pathname: "/app/pricing", search: location.search }} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={<PageLoader />}>
                {/* OrgUserBlockGate is a no-op for non-org users; for org
                 *  users (profile.org_id != null) it gates routes via an
                 *  allow-list, redirecting any other path → /app/workspace. */}
                <OrgUserBlockGate>
                <Routes>
                  {/* Root → redirect to workspace dashboard. The
                   *  consumer landing page was removed in Wave 1
                   *  (this repo is now workspace-only). */}
                  <Route path="/" element={<Navigate to="/app/workspace" replace />} />

                  {/* Auth + legal — public */}
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/refund" element={<Refund />} />
                  <Route path="/aup" element={<AUP />} />
                  <Route path="/cookies" element={<Cookies />} />
                  <Route path="/pricing" element={<PricingAliasRedirect />} />

                  {/* Workspace dashboard owns its own sidebar (Home /
                   *  Spaces / Community / Projects / All tools / Stock),
                   *  so it sits outside DashboardLayout — no chrome
                   *  competition with the legacy consumer sidebar. */}
                  <Route path="/app" element={<Navigate to="/app/workspace" replace />} />
                  {/* Dashboard ("Home", Spaces grid, Tools, Stock) is
                   *  PUBLIC. Guests can browse the surface and the tool
                   *  catalogue without logging in. Auth-only actions
                   *  (opening a Space canvas, creating a project, etc.)
                   *  bounce to /auth via their own ProtectedRoute or via
                   *  inline guards inside the dashboard's interactive
                   *  surfaces. */}
                  <Route path="/app/workspace" element={<WorkspaceDashboard />} />

                  {/* Org-admin panel — DEFINED BEFORE the AccountShell outlet
                      below because the outlet's `*` catch-all otherwise
                      swallows /app/<anything> and redirects back to workspace.
                      Must come before /app/<sub> outlet routes. */}
                  <Route
                    path="/app/org-admin"
                    element={
                      <ProtectedRoute>
                        <TeacherCenter />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/app/org-admin/branding"
                    element={
                      <ProtectedRoute>
                        <OrgBranding />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/app/university"
                    element={<Navigate to="/app/workspace" replace />}
                  />

                  {/* Account pages — same workspace sidebar as the
                   *  dashboard, but content area shows Settings /
                   *  Usage tab content. Sidebar items navigate back
                   *  to /app/workspace?section=…. */}
                  <Route
                    path="/app"
                    element={
                      <ProtectedRoute>
                        <AccountShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="settings" element={<Settings />} />
                    <Route path="usage" element={<Transactions />} />
                    {/* Unknown /app/<x> sub-route → bounce back to the
                     *  dashboard. Without this AccountShell would
                     *  render with an empty content area. */}
                    <Route path="*" element={<Navigate to="/app/workspace" replace />} />
                  </Route>

                  {/* Pricing page — workspace sidebar but no Account
                   *  breadcrumb header / max-width wrapper. The page
                   *  owns its full content area (hero + plan cards +
                   *  comparison table) and reads better edge-to-edge
                   *  on wide screens. */}
                  <Route
                    path="/app/team-register"
                    element={
                      <ProtectedRoute>
                        <WorkspacePageShell hideSidebarBelowLg>
                          <TeamRegister />
                        </WorkspacePageShell>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/app/pricing"
                    element={
                      <ProtectedRoute>
                        <WorkspacePageShell hideSidebarBelowLg>
                          <Pricing />
                        </WorkspacePageShell>
                      </ProtectedRoute>
                    }
                  />

                  {/* Canvas page — top-level so it gets the full
                   *  viewport without DashboardLayout chrome */}
                  <Route
                    path="/app/workspace/:workspaceId"
                    element={
                      <ProtectedRoute>
                        <MobileSpaceBlockGate>
                          <WorkspaceCanvasPage />
                        </MobileSpaceBlockGate>
                      </ProtectedRoute>
                    }
                  />

                  {/* Class enrolment landing — students arrive here after
                      scanning a teacher's QR. Public route (the page
                      handles its own guest → /auth bounce so we preserve
                      the redirect target). */}
                  <Route path="/enroll-class/:code" element={<ClassEnroll />} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
                </OrgUserBlockGate>
              </Suspense>
              <CookieConsent />
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
