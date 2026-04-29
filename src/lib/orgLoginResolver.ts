// Calls the mf-um-resolve-login edge function before login. Given an email,
// returns whether the domain belongs to an org and which SSO providers to
// show. Used by Auth.tsx to render either the consumer login flow or the
// org-locked SSO panel.
//
// Caches successful lookups for 5 minutes per email — domain → org rarely
// changes mid-session, and we don't want to spam the function while the
// user is typing. Errors are NOT cached.

import { supabase } from "@/integrations/supabase/client";

export type OrgLoginProvider = {
  provider: "google_workspace" | "microsoft_entra" | "email_otp";
  is_primary: boolean;
  config: Record<string, unknown>;
};

export type OrgLoginResolution =
  | { is_org: false }
  | {
      is_org: true;
      org: { id: string; name: string; slug: string; logo_url: string | null };
      providers: OrgLoginProvider[];
      blocked_methods: string[];
    };

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: OrgLoginResolution; expiresAt: number }>();

export function clearOrgLoginCache() {
  cache.clear();
}

export async function resolveOrgLogin(email: string): Promise<OrgLoginResolution> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@")) return { is_org: false };

  const cached = cache.get(trimmed);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const { data, error } = await supabase.functions.invoke("mf-um-resolve-login", {
    body: { email: trimmed },
  });

  if (error || !data) {
    // On failure, default to consumer flow rather than blocking login.
    return { is_org: false };
  }

  const value = data as OrgLoginResolution;
  cache.set(trimmed, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}
