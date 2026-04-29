// Multi-tenant branding hook.
//
// At app boot we read window.location.hostname and look it up in
// public.org_domains. If we find a row, the workspace chrome (sidebar
// brand row, login screen logo) swaps to that org's logo + short name.
// Otherwise we fall back to the default PSC brand.
//
// The query is read-public — it works for unauthenticated visitors
// landing on /auth, which is the whole point: the user has to see
// "DMD" branding BEFORE they sign in.
//
// We use react-query so the lookup is cached process-wide and shared
// between the sidebar, the login screen, and any other surface that
// asks. Hostname doesn't change inside a tab session, so we set
// staleTime to Infinity — invalidation happens on hard reload, which
// is exactly what we want.
//
// Localhost and IP-only hosts skip the network call entirely.

import { useQuery } from "@tanstack/react-query";
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

async function fetchOrgBranding(): Promise<OrgBranding | null> {
  const host = window.location.hostname.toLowerCase();
  if (isDevOrIpHost(host)) return null;

  const { data: domainRow } = await supabase
    .from("org_domains" as any)
    .select("org_id, hostname")
    .eq("hostname", host)
    .maybeSingle();

  if (!domainRow) return null;

  const orgId = (domainRow as any).org_id as string;
  const { data: orgRow } = await supabase
    .from("sso_organizations" as any)
    .select("id, display_name, display_name_short, logo_url, brand_color, status")
    .eq("id", orgId)
    .maybeSingle();

  if (!orgRow) return null;
  // Suspended orgs lose their branding so a hostile host can't keep
  // showing the brand to phish users after access is revoked.
  if ((orgRow as any).status === "suspended") return null;

  const displayName = (orgRow as any).display_name as string;
  const shortName = ((orgRow as any).display_name_short as string | null) ?? displayName;

  return {
    orgId,
    shortName,
    displayName,
    logoUrl: ((orgRow as any).logo_url as string | null) ?? null,
    brandColor: ((orgRow as any).brand_color as string | null) ?? null,
    hostname: (domainRow as any).hostname as string,
  };
}

/**
 * Returns the branding bundle for the current host, or null if the
 * host doesn't belong to any tenant (use the default PSC branding
 * in that case). Loading is treated as "no branding yet" — callers
 * render the default until the lookup resolves so the chrome doesn't
 * flicker an empty row for unauthenticated visitors.
 */
export function useOrgBranding(): OrgBranding | null {
  const { data } = useQuery({
    queryKey: ["org-branding", window.location.hostname.toLowerCase()],
    queryFn: fetchOrgBranding,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
  return data ?? null;
}
