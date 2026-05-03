// Multi-tenant branding hook.
//
// At app boot we use the signed-in user's profile.organization_id or active
// organization membership. If we find an org, the workspace chrome swaps to
// that org's logo + short name. Otherwise we fall back to the default
// workspace brand.
//
// We use react-query so the lookup is cached process-wide and shared
// between the sidebar, the login screen, and any other surface that asks.

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export interface OrgBranding {
  /** sso_organizations.id */
  orgId: string;
  /** Display short acronym, e.g. "DMD". May fall back to display_name. */
  shortName: string;
  /** Full display name, e.g. "Digital Media Design". */
  displayName: string;
  /** Public URL of the logo. May be a Storage URL or a /public/* path. */
  logoUrl: string | null;
  /** Optional brand colour for accent surfaces. */
  brandColor: string | null;
  /** The hostname that resolved to this org. */
  hostname: string;
}

async function readOrgBrandingById(orgId: string, hostname: string): Promise<OrgBranding | null> {
  const { data: directOrg } = await supabase
    .from("organizations" as any)
    .select("id, name, display_name, logo_url, brand_color, settings, status")
    .eq("id", orgId)
    .maybeSingle();

  if (directOrg) {
    if ((directOrg as any).status === "suspended") return null;

    const settings = ((directOrg as any).settings && typeof (directOrg as any).settings === "object")
      ? ((directOrg as any).settings as Record<string, unknown>)
      : {};
    const displayName =
      ((directOrg as any).display_name as string | null) ??
      ((directOrg as any).name as string | null) ??
      "Workspace";
    const shortName =
      (settings.display_name_short as string | undefined) ||
      (settings.brand_short_name as string | undefined) ||
      displayName;

    return {
      orgId,
      shortName,
      displayName,
      logoUrl: ((directOrg as any).logo_url as string | null) ?? null,
      brandColor: ((directOrg as any).brand_color as string | null) ?? null,
      hostname,
    };
  }

  let { data: orgRow, error: orgError } = await supabase
    .from("sso_organizations" as any)
    .select("id, display_name, display_name_short, logo_url, brand_color, status")
    .eq("id", orgId)
    .maybeSingle();

  // Some live databases expose sso_organizations as a Schema-C compatibility
  // view that does not include display_name_short yet. Fall back without that
  // optional field so tenant logo/colour still load instead of losing all
  // branding.
  if (orgError) {
    const fallback = await supabase
      .from("sso_organizations" as any)
      .select("id, display_name, logo_url, brand_color, status")
      .eq("id", orgId)
      .maybeSingle();
    orgRow = fallback.data;
  }

  if (!orgRow) return null;
  // Suspended orgs lose their branding so a hostile host can't keep
  // showing the brand to phish users after access is revoked.
  if ((orgRow as any).status === "suspended") return null;

  const displayName = ((orgRow as any).display_name as string | null) ?? "Workspace";
  const shortName = ((orgRow as any).display_name_short as string | null) ?? displayName;

  return {
    orgId,
    shortName,
    displayName,
    logoUrl: ((orgRow as any).logo_url as string | null) ?? null,
    brandColor: ((orgRow as any).brand_color as string | null) ?? null,
    hostname,
  };
}

async function resolveMembershipOrgId(userId?: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("organization_memberships" as any)
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("role", { ascending: true })
    .limit(1)
    .maybeSingle();
  return ((data as any)?.organization_id as string | undefined) ?? null;
}

async function fetchOrgBranding(profileOrgId?: string | null, userId?: string | null): Promise<OrgBranding | null> {
  const host = window.location.hostname.toLowerCase();

  // Logged-in org users should see their organization branding even on
  // workspace.mediaforge.co or localhost.
  const signedInOrgId = profileOrgId || await resolveMembershipOrgId(userId);
  if (signedInOrgId) {
    const orgBranding = await readOrgBrandingById(signedInOrgId, host);
    if (orgBranding) return orgBranding;
  }

  return null;
}

/**
 * Returns the branding bundle for the current host, or null if the
 * host doesn't belong to any tenant (use the default PSC branding
 * in that case). Loading is treated as "no branding yet" — callers
 * render the default until the lookup resolves so the chrome doesn't
 * flicker an empty row for unauthenticated visitors.
 */
export function useOrgBranding(): OrgBranding | null {
  const { profile, user } = useAuth();
  const profileOrgId = ((profile as any)?.organization_id ?? (profile as any)?.org_id ?? null) as string | null;

  const { data } = useQuery({
    queryKey: ["org-branding", window.location.hostname.toLowerCase(), profileOrgId, user?.id ?? null],
    queryFn: () => fetchOrgBranding(profileOrgId, user?.id ?? null),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
  return data ?? null;
}
