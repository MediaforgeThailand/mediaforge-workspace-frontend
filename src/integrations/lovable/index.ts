import { supabase } from "../supabase/client";

const USE_LOVABLE_AUTH = import.meta.env.VITE_AUTH_PROVIDER !== "supabase";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type OAuthResult = {
  redirected?: boolean;
  error?: Error | null;
  tokens?: { access_token: string; refresh_token: string };
};

// Supabase-native OAuth: uses supabase.auth.signInWithOAuth directly
async function supabaseOAuth(
  provider: "google" | "apple",
  opts?: SignInOptions,
): Promise<OAuthResult> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: opts?.redirect_uri,
      queryParams: opts?.extraParams,
    },
  });
  if (error) return { error };
  // signInWithOAuth triggers a redirect, so we won't reach here on success
  return { redirected: true };
}

// Lovable-specific OAuth: uses @lovable.dev/cloud-auth-js
async function lovableOAuth(
  provider: "google" | "apple",
  opts?: SignInOptions,
): Promise<OAuthResult> {
  const { createLovableAuth } = await import("@lovable.dev/cloud-auth-js");
  const lovableAuth = createLovableAuth({});

  const result = await lovableAuth.signInWithOAuth(provider, {
    redirect_uri: opts?.redirect_uri,
    extraParams: { ...opts?.extraParams },
  });

  if (result.redirected) return result;
  if (result.error) return result;

  try {
    await supabase.auth.setSession(result.tokens);
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
  return result;
}

export const lovable = {
  auth: {
    signInWithOAuth: (provider: "google" | "apple", opts?: SignInOptions) =>
      USE_LOVABLE_AUTH ? lovableOAuth(provider, opts) : supabaseOAuth(provider, opts),
  },
};
