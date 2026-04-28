import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { lazy, Suspense, useEffect } from "react";
import { captureFromUrl } from "@/lib/tracking/referralCapture";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import CookieConsent from "./components/CookieConsent";
import DemoAutoRedeemer from "./components/DemoAutoRedeemer";
import GlobalExecutionWatcher from "./components/GlobalExecutionWatcher";
import { usePresenceTracker } from "./hooks/useOnlinePresence";
import ProtectedRoute from "./components/ProtectedRoute";
import CreatorRoute from "./components/CreatorRoute";
import DashboardLayout from "./components/DashboardLayout";
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
      throw err; // second failure → let it crash normally
    })
  );
}

// Lazy-loaded pages
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const PlayFlow = lazyWithRetry(() => import("./pages/play-flow"));
// Explore page hidden — redirects to Home
const PartnerProgram = lazyWithRetry(() => import("./pages/PartnerProgram"));
const RedeemCode = lazyWithRetry(() => import("./pages/RedeemCode"));
const DemoLanding = lazyWithRetry(() => import("./pages/DemoLanding"));

// Dashboard pages
const DashboardHome = lazy(() => import("./pages/dashboard/Home"));
const AssetManager = lazy(() => import("./pages/dashboard/AssetManager"));
const FlowAssetDetail = lazy(() => import("./pages/dashboard/FlowAssetDetail"));
const FlowStudioDashboard = lazy(() => import("./pages/dashboard/FlowStudioDashboard"));
const FlowStudio = lazy(() => import("./pages/dashboard/FlowStudio"));
const FlowSettings = lazy(() => import("./pages/dashboard/FlowSettings"));
const Pricing = lazy(() => import("./pages/dashboard/Pricing"));
const Settings = lazy(() => import("./pages/dashboard/Settings"));
const Transactions = lazy(() => import("./pages/dashboard/Transactions"));
const History = lazy(() => import("./pages/dashboard/History"));
const Analytics = lazy(() => import("./pages/dashboard/Analytics"));

// Workspace V2 — node-based canvas editor (this repo's primary product
// once the workspace.mediaforge.co subdomain ships). Dashboard at
// /app/workspace lists all spaces; canvas page at
// /app/workspace/:workspaceId is full-screen (no DashboardLayout
// chrome). The active canvas tab inside is tracked in store state,
// not the URL — one workspace = one URL = one tab bar.
const WorkspaceDashboard = lazy(() => import("./pages/workspace"));
const WorkspaceCanvasPage = lazy(() => import("./pages/workspace/Canvas"));
const ReferEarn = lazy(() => import("./pages/settings/ReferEarn"));
const PartnerApply = lazy(() => import("./pages/partner/Apply"));
const PartnerStatus = lazy(() => import("./pages/partner/Status"));
const PartnerDashboard = lazy(() => import("./pages/partner/Dashboard"));

// Admin pages
const DevDebug = lazyWithRetry(() => import("./pages/DevDebug"));

// Creator pages
const CreatorLayout = lazyWithRetry(() => import("./components/CreatorLayout"));
const CreatorHome = lazyWithRetry(() => import("./pages/creator/CreatorHome"));
const CreatorStudio = lazyWithRetry(() => import("./pages/creator/CreatorStudio"));
const PublishedFlows = lazyWithRetry(() => import("./pages/creator/PublishedFlows"));

const CreatorFlowStatus = lazyWithRetry(() => import("./pages/creator/CreatorFlowStatus"));
const BundleStudio = lazyWithRetry(() => import("./pages/creator/BundleStudio"));
const BundleEditor = lazyWithRetry(() => import("./pages/creator/BundleEditor"));
const PlayBundle = lazyWithRetry(() => import("./pages/play-flow/PlayBundle"));

// Admin pages
const AdminLogin = lazyWithRetry(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazyWithRetry(() => import("./pages/admin/AdminDashboard"));
const ReviewQueue = lazyWithRetry(() => import("./pages/admin/ReviewQueue"));
const FlowReview = lazyWithRetry(() => import("./pages/admin/FlowReview"));
const FlowActive = lazyWithRetry(() => import("./pages/admin/FlowActive"));

const AdminLayout = lazyWithRetry(() => import("./components/admin/AdminLayout"));
const AdminProtectedRoute = lazyWithRetry(() => import("./components/admin/AdminProtectedRoute"));

const AdminWrapper = () => (
  <AdminAuthProvider>
    <Outlet />
  </AdminAuthProvider>
);

const queryClient = new QueryClient();

const PageLoader = () => <PageLoadingAnim />;

const AnalyticsTracker = () => {
  usePresenceTracker();
  useEffect(() => {
    captureFromUrl();
  }, []);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false}>
      <AuthProvider>
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AnalyticsTracker />
              <DemoAutoRedeemer />
              <GlobalExecutionWatcher />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Navigate to="/app/home" replace />} />

                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />

                  {/* Consumer app routes — open to guests */}
                  <Route path="/app" element={<DashboardLayout />}>
                    <Route path="home" element={<DashboardHome />} />
                    <Route path="assets" element={<AssetManager />} />
                    <Route
                      path="assets/flow/:flowId"
                      element={
                        <ProtectedRoute>
                          <FlowAssetDetail />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="flow-studio" element={<FlowStudioDashboard />} />
                    <Route
                      path="flow-studio/:flowId"
                      element={
                        <ProtectedRoute>
                          <FlowSettings />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="pricing" element={<Pricing />} />
                    <Route path="settings" element={<Settings />} />
                    <Route
                      path="settings/refer"
                      element={
                        <ProtectedRoute>
                          <ReferEarn />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="transactions" element={<Transactions />} />
                    <Route
                      path="history"
                      element={
                        <ProtectedRoute>
                          <History />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="analytics" element={<Analytics />} />
                    {/* Workspace V2 — dashboard list of spaces. The
                     *  full-screen canvas page is registered as a
                     *  top-level route below (outside this
                     *  DashboardLayout) so the chrome doesn't sit on
                     *  top of the canvas. Once this app moves to
                     *  workspace.mediaforge.co we may collapse
                     *  /app/workspace → / for cleaner URLs; keeping
                     *  the consumer-app path for now so existing
                     *  bookmarks survive the migration. */}
                    <Route
                      path="workspace"
                      element={<WorkspaceDashboard />}
                    />
                    <Route
                      path="partner/apply"
                      element={
                        <ProtectedRoute>
                          <PartnerApply />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="partner/status"
                      element={
                        <ProtectedRoute>
                          <PartnerStatus />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="partner/dashboard"
                      element={
                        <ProtectedRoute>
                          <PartnerDashboard />
                        </ProtectedRoute>
                      }
                    />
                  </Route>

                  {/* Explore redirects to Home */}
                  <Route element={<DashboardLayout />}>
                    <Route path="/explore" element={<DashboardHome />} />
                  </Route>

                  {/* Play flow — no sidebar, has its own config panel */}
                  <Route
                    path="/play/bundle/:bundleId"
                    element={
                      <ProtectedRoute>
                        <PlayBundle />
                      </ProtectedRoute>
                    }
                  />
                  {/* Play flow — open to guests; Generate gates auth + credits */}
                  <Route path="/play/:flowId" element={<PlayFlow />} />

                  <Route path="/demo" element={<DemoLanding />} />
                  <Route path="/partner-program" element={<PartnerProgram />} />
                  <Route
                    path="/redeem"
                    element={
                      <ProtectedRoute>
                        <RedeemCode />
                      </ProtectedRoute>
                    }
                  />

                  {/* Creator workspace routes */}
                  <Route
                    path="/creator"
                    element={
                      <CreatorRoute>
                        <CreatorLayout />
                      </CreatorRoute>
                    }
                  >
                    <Route index element={<CreatorHome />} />
                    <Route path="studio" element={<CreatorStudio />} />
                    <Route path="published" element={<PublishedFlows />} />
                    <Route path="flows" element={<CreatorFlowStatus />} />
                    <Route path="bundles" element={<BundleStudio />} />
                    <Route path="bundles/:bundleId" element={<BundleEditor />} />
                    
                  </Route>

                  {/* Admin routes — isolated auth */}
                  <Route element={<AdminWrapper />}>
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route
                      path="/admin"
                      element={
                        <AdminProtectedRoute>
                          <AdminLayout />
                        </AdminProtectedRoute>
                      }
                    >
                      <Route index element={<AdminDashboard />} />

                      <Route path="review-queue" element={<ReviewQueue />} />
                      <Route path="review/:flowId" element={<FlowReview />} />
                      <Route path="flow-active" element={<FlowActive />} />
                    </Route>
                  </Route>

                  {/* Flow Studio node editor — full-screen, outside layouts */}
                  <Route
                    path="/app/flow-studio/:flowId/editor"
                    element={
                      <ProtectedRoute>
                        <FlowStudio />
                      </ProtectedRoute>
                    }
                  />

                  {/* Workspace canvas editor — full-screen, outside layouts.
                   *  URL is the WORKSPACE id; tabs (canvases) are tracked
                   *  in store state, not the URL. */}
                  <Route path="/app/workspace/:workspaceId" element={<WorkspaceCanvasPage />} />

                  {/* Dev debug route */}
                  <Route
                    path="/dev/debug"
                    element={
                      <ProtectedRoute>
                        <DevDebug />
                      </ProtectedRoute>
                    }
                  />

                  {/* Workspace V2 — full-screen canvas page. URL is the
                   *  WORKSPACE id; the tabs (canvases) inside it are
                   *  tracked in store state, not the URL. The
                   *  /app/workspace dashboard route (in DashboardLayout
                   *  above) shows the list of workspaces. Lives at
                   *  TOP-level (outside DashboardLayout) so the canvas
                   *  fills the viewport with no sidebar / top-bar
                   *  chrome competing for space. */}
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
        </LanguageProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
