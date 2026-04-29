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
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { lazy, Suspense } from "react";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import CookieConsent from "./components/CookieConsent";
import ProtectedRoute from "./components/ProtectedRoute";
import AccountShell from "./components/workspace/AccountShell";
import WorkspacePageShell from "./components/workspace/WorkspacePageShell";
import PageLoadingAnim from "./components/ui/PageLoadingAnim";

/**
 * Wrap lazy imports so a stale-chunk 404 after deployment
 * automatically reloads the page once (instead of crashing).
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
      throw err;
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

const queryClient = new QueryClient();
const PageLoader = () => <PageLoadingAnim />;

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

                  {/* Workspace dashboard owns its own sidebar (Home /
                   *  Spaces / Community / Projects / All tools / Stock),
                   *  so it sits outside DashboardLayout — no chrome
                   *  competition with the legacy consumer sidebar. */}
                  <Route path="/app" element={<Navigate to="/app/workspace" replace />} />
                  <Route
                    path="/app/workspace"
                    element={
                      <ProtectedRoute>
                        <WorkspaceDashboard />
                      </ProtectedRoute>
                    }
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
                    path="/app/pricing"
                    element={
                      <ProtectedRoute>
                        <WorkspacePageShell>
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
                        <WorkspaceCanvasPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route path="*" element={<NotFound />} />
                </Routes>
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
