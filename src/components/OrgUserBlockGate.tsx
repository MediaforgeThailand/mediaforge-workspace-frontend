import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  children: React.ReactNode;
}

// Routes that org users CAN access. Anything else → redirected to workspace.
// Order matters: check most specific first if patterns overlap.
const ALLOWED_FOR_ORG_USER: RegExp[] = [
  /^\/$/,
  /^\/blog(\/|$)/,
  /^\/app\/workspace(\/|$)/,    // the only feature
  /^\/app\/org-admin(\/|$)/,    // org_admin panel (members + analytics)
  /^\/app\/settings(\/|$)/,     // logout / language / profile basics
  /^\/app\/pricing(\/|$)/,      // plan and billing page
  /^\/app\/team-register(\/|$)/,// team signup entry from Settings > Team
  /^\/auth(\/|$)/,              // login / SSO callback
  /^\/pricing(\/|$)/,           // public alias -> /app/pricing
  /^\/enroll-class\//,          // QR scan landing
  /^\/reset-password/,          // edge case — they shouldn't have a password
                                // but don't break the flow if they do
  /^\/terms$/,
  /^\/privacy$/,
];

/**
 * Top-level gate that runs on every navigation. If the signed-in user has
 * `profile.organization_id`/`profile.org_id` set (i.e. they are tied to an organization) and they
 * are visiting a non-workspace route, silently redirect them to
 * /app/workspace.
 *
 * Users without an org (profile.organization_id/org_id IS NULL) are unaffected — children
 * render as-is. Guests are also unaffected; ProtectedRoute handles the
 * guest → /auth bounce on routes that require auth.
 *
 * Wrap this around <Routes> in App.tsx.
 */
export default function OrgUserBlockGate({ children }: Props) {
  const { profile, loading } = useAuth();
  const { pathname } = useLocation();

  // While loading we don't know yet — render children. ProtectedRoute /
  // WorkspaceGate handle their own loading states.
  if (loading) return <>{children}</>;

  // Not an org user -> no gating.
  const orgId = (profile as any)?.organization_id ?? profile?.org_id;
  if (!orgId) return <>{children}</>;

  const allowed = ALLOWED_FOR_ORG_USER.some((rx) => rx.test(pathname));
  if (allowed) return <>{children}</>;

  return <Navigate to="/app/workspace" replace />;
}
