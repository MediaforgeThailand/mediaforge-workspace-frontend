import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { useEducationStudentLock } from "@/hooks/useIsOrgUser";

interface Props {
  children: React.ReactNode;
}

// Routes that org users CAN access. Anything else redirects to workspace.
// Order matters: check most specific first if patterns overlap.
const ALLOWED_FOR_ORG_USER: RegExp[] = [
  /^\/$/,
  /^\/blog(\/|$)/,
  /^\/app\/workspace(\/|$)/,
  /^\/app\/editor(\/|$)/,
  /^\/app\/org-admin(\/|$)/,
  /^\/app\/settings(\/|$)/,
  /^\/app\/pricing(\/|$)/,
  /^\/app\/team-register(\/|$)/,
  /^\/auth(\/|$)/,
  /^\/pricing(\/|$)/,
  /^\/enroll-class\//,
  /^\/reset-password/,
  /^\/terms$/,
  /^\/privacy$/,
];

const EDUCATION_BILLING_ROUTES: RegExp[] = [
  /^\/app\/pricing(\/|$)/,
  /^\/pricing(\/|$)/,
  /^\/app\/team-register(\/|$)/,
];

/**
 * Top-level gate that runs on every navigation. If the signed-in user has
 * `profile.organization_id`/`profile.org_id` set and is visiting a non-workspace
 * route, silently redirect them to /app/workspace.
 */
export default function OrgUserBlockGate({ children }: Props) {
  const { user, profile, loading } = useAuth();
  const { credits, loading: creditsLoading } = useCredits();
  const educationStudentLock = useEducationStudentLock();
  const { pathname, search } = useLocation();
  const settingsTab = new URLSearchParams(search).get("tab") ?? "";
  const planBillingSettingsRoute =
    /^\/app\/settings(\/|$)/.test(pathname) &&
    (settingsTab === "plan-billing" || settingsTab === "organization.plan-billing");
  const educationBillingRoute =
    EDUCATION_BILLING_ROUTES.some((rx) => rx.test(pathname)) ||
    planBillingSettingsRoute;

  if (loading && educationBillingRoute) return null;
  if (loading) return <>{children}</>;
  if (user && educationBillingRoute && !profile) return null;

  const orgId = (profile as any)?.organization_id ?? profile?.org_id;
  if (!orgId && educationBillingRoute && educationStudentLock.loading) return null;
  if (!orgId && educationBillingRoute && educationStudentLock.locked) {
    return <Navigate to="/app/workspace" replace />;
  }
  if (!orgId) return <>{children}</>;

  if (planBillingSettingsRoute) {
    return <Navigate to="/app/workspace" replace />;
  }

  const isEducationOrg =
    credits?.credit_scope === "education_space" ||
    credits?.organization_type === "school" ||
    credits?.organization_type === "university";
  if (educationBillingRoute && creditsLoading) return null;
  if (educationBillingRoute && isEducationOrg) {
    return <Navigate to="/app/workspace" replace />;
  }

  const allowed = ALLOWED_FOR_ORG_USER.some((rx) => rx.test(pathname));
  if (allowed) return <>{children}</>;

  return <Navigate to="/app/workspace" replace />;
}
