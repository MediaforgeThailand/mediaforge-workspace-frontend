// Multi-tenant branding hook.
//
// At app boot we first use the signed-in user's profile.organization_id when
// available, then fall back to window.location.hostname -> public.org_domains
// for public/custom-domain visits. If we find an org, the workspace chrome
// swaps to that org's logo + short name. Otherwise we fall back to the
// default workspace brand.
//
// The query is read-public — it works for unauthenticated visitors
// Domain fallback is read-public, so unauthenticated visitors landing on
// /auth can still see tenant branding BEFORE they sign in.
//
// We use react-query so the lookup is cached process-wide and shared
// between the sidebar, the login screen, and any other surface that
// asks. Hostname doesn't change inside a tab session, so we set
// staleTime to Infinity — invalidation happens on hard reload, which
// is exactly what we want.
//
// Localhost and IP-only hosts skip the network call entirely.

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

/** Hostnames that should never hit the network — they can't possibly
 *  be tenant subdomains. */
function isDevOrIpHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  // Bare IPv4 (e.g. 192.168.1.5) — no tenant routing.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true;
  return false;
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

async function fetchOrgBranding(profileOrgId?: string | null): Promise<OrgBranding | null> {
  const host = window.location.hostname.toLowerCase();

  // Logged-in org users should see their organization branding even on
  // workspace.mediaforge.co or localhost. Domain branding is only the public
  // fallback for unauthenticated / custom-host visits.
  if (profileOrgId) {
    const orgBranding = await readOrgBrandingById(profileOrgId, host);
    if (orgBranding) return orgBranding;
  }

  if (isDevOrIpHost(host)) return null;

  const { data: domainRow } = await supabase
    .from("org_domains" as any)
    .select("org_id, hostname")
    .eq("hostname", host)
    .maybeSingle();

  if (!domainRow) return null;

  const orgId = (domainRow as any).org_id as string;
  return readOrgBrandingById(orgId, (domainRow as any).hostname as string);
}

/**
 * Returns the branding bundle for the current host, or null if the
 * host doesn't belong to any tenant (use the default PSC branding
 * in that case). Loading is treated as "no branding yet" — callers
 * render the default until the lookup resolves so the chrome doesn't
 * flicker an empty row for unauthenticated visitors.
 */
export function useOrgBranding(): OrgBranding | null {
  const { profile } = useAuth();
  const profileOrgId = ((profile as any)?.organization_id ?? (profile as any)?.org_id ?? null) as string | null;

  const { data } = useQuery({
    queryKey: ["org-branding", window.location.hostname.toLowerCase(), profileOrgId],
    queryFn: () => fetchOrgBranding(profileOrgId),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
  return data ?? null;
}
