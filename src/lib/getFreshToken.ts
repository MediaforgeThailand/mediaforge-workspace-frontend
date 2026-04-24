import { supabase } from "@/integrations/supabase/client";

/**
 * Get a valid access token, proactively refreshing if it expires within 60s.
 * Returns null if the user is not authenticated.
 */
export async function getFreshToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;

  const session = data?.session;
  if (!session?.access_token) return null;

  // Proactively refresh if token expires within 60 seconds
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed?.session?.access_token ?? session.access_token;
  }

  return session.access_token;
}
