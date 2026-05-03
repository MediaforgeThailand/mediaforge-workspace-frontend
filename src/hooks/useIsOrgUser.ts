// Org-user / class-membership hooks. Backed by react-query so multiple
// callers cheaply share the cache.

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * True for any user whose profile.org_id is set (i.e. the post_auth trigger
 * matched their email domain to a verified org, or they were enrolled in
 * a class). Drives top-level gates, sidebar trim, and edge-fn guards.
 *
 * In the edu DB the legacy account_type column was dropped — org membership
 * is now the single source of truth for "is this user org-scoped".
 */
export function useIsOrgUser(): boolean {
  const { profile } = useAuth();
  return !!((profile as any)?.organization_id ?? profile?.org_id);
}

export function useOrgId(): string | null {
  const { profile } = useAuth();
  return ((profile as any)?.organization_id ?? profile?.org_id ?? null) as string | null;
}

export interface ClassMembershipInfo {
  class_id: string;
  class_name: string;
  class_code: string;
  class_status: "active" | "scheduled" | "ended" | "archived";
  org_id: string;
  role: "primary" | "co" | "member"; // teacher? student?
  student_code: string | null;
  credits_balance: number;
  credits_lifetime_received: number;
  credits_lifetime_used: number;
  status: "active" | "suspended" | "removed";
  enrolled_at: string;
}

/**
 * Loads ALL class memberships for the current user (Schema C).
 *
 * Schema C unified the old `class_memberships` (students) and
 * `class_teachers` (teachers) into a single `class_members` table with
 * `role IN ('teacher', 'student')`. Plus `classes.primary_instructor_id`
 * is still authoritative for the lead instructor — we fall back to
 * scanning that for legacy/just-created classes whose instructor hasn't
 * been mirrored into class_members yet.
 *
 * Role translation:
 *   class_members.role='student' → ClassMembershipInfo.role='member'
 *   class_members.role='teacher' AND user is primary_instructor → 'primary'
 *   class_members.role='teacher' AND not primary → 'co'
 */
export function useUserClassMemberships() {
  const { user, profile } = useAuth();
  // Schema C uses profile.organization_id (was profile.org_id in v2)
  const enabled = !!user && !!((profile as any)?.organization_id ?? profile?.org_id);
  return useQuery<ClassMembershipInfo[]>({
    queryKey: ["class-memberships", user?.id],
    enabled,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.rpc("workspace_education_credit_scope" as any, {
        p_user_id: user.id,
      });
      if (error) return [];
      return ((data ?? []) as any[]).map((row) => ({
        class_id: row.class_id,
        class_name: row.class_name,
        class_code: row.class_code,
        class_status: "active",
        org_id: row.organization_id,
        role: row.class_role === "student" ? "member" : "co",
        student_code: null,
        credits_balance: row.credit_balance ?? 0,
        credits_lifetime_received: row.credits_lifetime_received ?? 0,
        credits_lifetime_used: row.credits_lifetime_used ?? 0,
        status: "active",
        enrolled_at: "",
      }));
    },
    staleTime: 30_000,
  });
}

/** Convenience: class memberships only where user is teacher (primary or co). */
export function useTeachingClasses(): ClassMembershipInfo[] {
  const { data } = useUserClassMemberships();
  return (data ?? []).filter((m) => m.role === "primary" || m.role === "co");
}

/** Convenience: any classes the user is teaching → they are an org_admin-equivalent
 *  for the workspace UI ("Manage Org" button). */
export function useIsClassTeacher(): boolean {
  return useTeachingClasses().length > 0;
}

/**
 * Returns true if the user has any "Manage Org" surface to access:
 *   - active class teacher (any class)
 *   - org_admin role on organization_memberships
 *
 * Used by sidebar OrgAdminLink to decide whether to show the
 * "Manage Org" button.
 */
export function useIsOrgAdmin(): boolean {
  const { user } = useAuth();

  const { data: isOrgAdminRow } = useQuery<boolean>({
    queryKey: ["org-admin-membership", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("organization_memberships" as any)
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "org_admin")
        .eq("status", "active")
        .limit(1);
      return (data ?? []).length > 0;
    },
    staleTime: 30_000,
  });

  return !!isOrgAdminRow;
}

// ─── Active class selection (persisted in localStorage) ──────────────────
// Key kept as `mf_um_active_class_id` for back-compat — wiping it would
// log out everyone's active-class selection on the first deploy. The
// custom event name follows the same rule.
const ACTIVE_CLASS_KEY = "mf_um_active_class_id";
const ACTIVE_CLASS_EVENT = "mf_um_active_class_changed";

export function getActiveClassId(): string | null {
  try { return localStorage.getItem(ACTIVE_CLASS_KEY); } catch { return null; }
}
export function setActiveClassId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_CLASS_KEY, id);
    else    localStorage.removeItem(ACTIVE_CLASS_KEY);
  } catch { /* ignore */ }
  // Notify same-tab listeners (storage event only fires on OTHER tabs)
  window.dispatchEvent(new Event(ACTIVE_CLASS_EVENT));
}

/**
 * Returns the user's current active class membership. Auto-selects the
 * first active student membership if no choice is stored. Updates when
 * setActiveClassId() is called.
 */
export function useActiveClass(): ClassMembershipInfo | null {
  const { data: memberships } = useUserClassMemberships();
  const activeId = useActiveClassIdReactive();

  if (!memberships) return null;
  const studentMemberships = memberships.filter(
    (m) => m.role === "member" && m.status === "active" && m.class_status === "active"
  );
  if (studentMemberships.length === 0) return null;

  const found = activeId
    ? studentMemberships.find((m) => m.class_id === activeId)
    : null;
  if (found) return found;

  // Auto-select first one if no valid choice yet
  const first = studentMemberships[0];
  if (first && (!activeId || activeId !== first.class_id)) {
    setActiveClassId(first.class_id);
  }
  return first ?? null;
}

/** Reactively reads the localStorage-backed active class id. */
function useActiveClassIdReactive(): string | null {
  const [id, setId] = useState<string | null>(() => getActiveClassId());
  useEffect(() => {
    const handler = () => setId(getActiveClassId());
    window.addEventListener(ACTIVE_CLASS_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(ACTIVE_CLASS_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return id;
}
