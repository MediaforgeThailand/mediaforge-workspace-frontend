import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { posthog } from "@/lib/posthog";
import { getStoredCode, clearStoredCode } from "@/lib/tracking/referralCapture";
import { getVisitorId } from "@/lib/tracking/fingerprint";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useCanvasJobsRecovery } from "@/store/useCanvasJobsRecovery";

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  company: string | null;
  role: string | null;
  subscription_status: "free" | "professional" | "agency";
  created_at: string;
  updated_at: string;
  // Subscription fields
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_interval: string | null;
  current_period_end: string | null;
  current_plan_id: string | null;
  /** Resolved plan name from subscription_plans table */
  plan_name: string | null;
  // Org user fields — set by post_auth_assign_org trigger when the user's
  // email domain matches a verified org domain. NULL for users whose
  // domain isn't on file (they exist as consumers).
  account_type: "consumer" | "org_user" | null;
  organization_id: string | null;
  /** @deprecated Use `organization_id`. Kept as alias during migration. */
  org_id: string | null;
  /** True when the user has an `admin` row in `public.user_roles`. Staff
   *  accounts often live on the Free plan but must bypass paywall gates. */
  is_admin: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
// Demo bypass disabled: dmd@psc.com is a real Supabase user with credits,
// so it must receive a real session/JWT for autosave and generation.
const DEMO_EMAIL = "__demo_disabled__";
const DEMO_PASSWORD = "__demo_disabled__";
const DEMO_SESSION_KEY = "mf_psc_demo_session";

function clearWorkspaceLocalState() {
  try {
    useWorkspaceStore.getState().resetWorkspaceState();
  } catch {
    // ignore
  }

  // In-memory store, no localStorage — but its cached jobs are still
  // scoped to the signed-out user's RLS view. Reset here so all three
  // sign-out paths (explicit signOut, expired refresh token, missing
  // session) drop it together with the workspace store.
  try {
    useCanvasJobsRecovery.getState().reset();
  } catch {
    // ignore
  }

  const keysToClear = [DEMO_SESSION_KEY, "mf-workspace-v1"];
  for (const key of keysToClear) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  try {
    const prefixPatterns = [/^workspace-viewport-/, /^mf-workspace-/];
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (prefixPatterns.some((pattern) => pattern.test(key))) toDelete.push(key);
    }
    for (const key of toDelete) localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const [{ data, error }, rolesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, user_id, display_name, avatar_url, company, role, subscription_status, created_at, updated_at, billing_interval, current_period_end, current_plan_id, subscription_plan_id, organization_id, account_type, subscription_plans(name)")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId),
      ]);

      if (error) {
        console.error("Error fetching profile:", error);
        return null;
      }
      if (!data) return null;
      // Resolve plan name from the joined subscription_plans
      const planRow = (data as any).subscription_plans as { name: string } | null;
      const isAdmin = !rolesResult.error
        && (rolesResult.data ?? []).some((r) => r.role === "admin");
      const profile: Profile = {
        ...(data as any),
        plan_name: planRow?.name ?? null,
        // Schema C: organization_id (was org_id in older schema). Mirror to
        // both keys so older UI references keep working until rewritten.
        organization_id: (data as any).organization_id ?? null,
        org_id: (data as any).organization_id ?? null,
        is_admin: isAdmin,
      };
      delete (profile as any).subscription_plans;
      return profile;
    } catch (error) {
      console.error("Error fetching profile:", error);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  };

  const identifyUser = (u: User, p: Profile | null) => {
    /* PDPA + GDPR-friendly identify: pseudonymise to user_id only.
     *
     * Background: PostHog is hosted in the US (us.i.posthog.com).
     * Sending raw email + company + display_name across borders
     * without an explicit DPA + consent banner is a Thai PDPA
     * violation per Section 28 (cross-border transfer) — and once
     * those PII fields land in PostHog they can't be cleanly
     * deleted on user request.
     *
     * Strip every PII field. The opaque user_id (a uuid) is enough
     * for funnel / cohort analytics; for support workflows the
     * team can still resolve the uuid → email via the Supabase
     * dashboard with an audit log behind it. */
    posthog.identify(u.id, {
      role: p?.role ?? "consumer",
      subscription_tier: p?.subscription_status ?? "free",
    });
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(async () => {
            const profileData = await fetchProfile(session.user.id);
            setProfile(profileData);
            identifyUser(session.user, profileData);
            if (event === "SIGNED_IN") {
              posthog.capture("login", { method: session.user.app_metadata?.provider ?? "email" });
            }
          }, 0);
        } else {
          setProfile(null);
          clearWorkspaceLocalState();
        }

        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      // Clear any old local demo flag so it cannot resurrect a fake user
      // without a Supabase JWT.
      try {
        localStorage.removeItem(DEMO_SESSION_KEY);
      } catch {
        // ignore
      }

      // Handle expired/revoked refresh tokens gracefully
      if (error && (error.message?.includes("refresh_token_not_found") || error.message?.includes("Invalid Refresh Token"))) {
        console.info("Session expired, clearing auth state");
        setSession(null);
        setUser(null);
        setProfile(null);
        clearWorkspaceLocalState();
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchProfile(session.user.id).then((p) => {
          setProfile(p);
          identifyUser(session.user, p);
        });
      } else {
        clearWorkspaceLocalState();
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
      try {
        localStorage.setItem(DEMO_SESSION_KEY, "1");
      } catch {
        // The in-memory demo session still works when storage is unavailable.
      }
      const demoUser = createDemoUser();
      setSession(null);
      setUser(demoUser);
      setProfile(createDemoProfile());
      setLoading(false);
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error && email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
      try {
        localStorage.setItem(DEMO_SESSION_KEY, "1");
      } catch {
        // The in-memory demo session still works when storage is unavailable.
      }
      const demoUser = createDemoUser();
      setSession(null);
      setUser(demoUser);
      setProfile(createDemoProfile());
      setLoading(false);
      return { error: null };
    }
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    // Capture referral attribution before auth call
    const refCode = getStoredCode();
    let visitorId: string | undefined;
    try {
      visitorId = await getVisitorId();
    } catch {
      visitorId = undefined;
    }

    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: {
          full_name: fullName,
          referral_code_used: refCode ?? null,
          device_fingerprint: visitorId ?? null,
          signup_source: typeof document !== "undefined" ? document.referrer || null : null,
        },
      },
    });
    if (error) {
      return { error: error as Error | null };
    }
    // Supabase returns user with empty identities when email already exists
    // (to prevent email enumeration). Detect this and return a user-friendly error.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return { error: new Error("This email is already registered. Please sign in instead.") as Error };
    }
    if (data.user) {
      posthog.alias(data.user.id);
      posthog.capture("signup_completed", { method: "email", referral_code: refCode ?? undefined });
      clearStoredCode();
    }
    return { error: null };
  };

  const signOut = async () => {
    posthog.capture("logout");
    posthog.reset();
    await supabase.auth.signOut();
    clearWorkspaceLocalState();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const value = { user, session, profile, loading, signIn, signUp, signOut, refreshProfile };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

function createDemoUser(): User {
  return {
    id: "psc-dmd-demo-user",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: "DMD PSC Demo" },
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: DEMO_EMAIL,
    role: "authenticated",
  } as User;
}

function createDemoProfile(): Profile {
  const now = new Date().toISOString();
  return {
    id: "psc-dmd-demo-profile",
    user_id: "psc-dmd-demo-user",
    display_name: "DMD PSC Demo",
    avatar_url: "/dmd-logo-placeholder.svg",
    company: "PSC College",
    role: "college_admin",
    subscription_status: "professional",
    created_at: now,
    updated_at: now,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    billing_interval: null,
    current_period_end: null,
    current_plan_id: null,
    plan_name: "Education Demo",
    account_type: "consumer",
    organization_id: null,
    org_id: null,
    is_admin: false,
  };
}
