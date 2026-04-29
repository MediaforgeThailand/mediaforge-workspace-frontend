/**
 * useTeacherData — data hooks for the Teacher Command Center.
 *
 * One file gathers ALL queries needed by the page so the page component
 * can import what it needs without scattering Supabase calls. Each hook
 * is a thin react-query wrapper on the workspace project's tables/views.
 *
 * RLS notes:
 *   • Teachers see only their own class's rows (workspace_activity policy
 *     filters by class_members.role='teacher')
 *   • Org admins can see ALL classes in their org (we add an org-wide
 *     fetch as `useOrgClasses` for the org_admin variant)
 *   • Both roles render the SAME UI; the data scope just differs
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface TeacherClass {
  id: string;
  name: string;
  code: string;
  status: string;
  credit_policy: "manual" | "monthly_reset" | "weekly_drip";
  credit_amount: number;
  credit_pool: number;
  credit_pool_consumed: number;
  primary_instructor_id: string | null;
  organization_id: string;
  end_date: string | null;
}

export interface ClassMember {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  status: string;
  joined_at: string;
  credits_balance: number;
  credits_lifetime_received: number;
  credits_lifetime_used: number;
}

export interface ModelUsageRow {
  model_id: string;
  uses: number;
  total_credits: number;
  unique_users: number;
}

export interface ActivityEvent {
  id: string;
  user_id: string;
  user_display_name?: string | null;
  activity_type: string;
  model_id: string | null;
  credits_used: number;
  created_at: string;
  metadata: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────────────
// Class list — different scope for teacher vs org_admin
// ─────────────────────────────────────────────────────────────────────

/**
 * Returns classes the current user can manage:
 *   - Teacher: classes where they're listed in class_members.role='teacher'
 *     OR classes.primary_instructor_id matches them
 *   - Org admin: ALL active classes in their org (fall-through)
 */
export function useManageableClasses() {
  const { user, profile } = useAuth();
  const orgId = (profile as any)?.organization_id ?? null;

  return useQuery<TeacherClass[]>({
    queryKey: ["teacher-classes", user?.id, orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      if (!user || !orgId) return [];

      // Try teacher-scoped first
      const { data: teacherRows } = await supabase
        .from("class_members" as any)
        .select(`
          classes:class_id (
            id, name, code, status, credit_policy, credit_amount,
            credit_pool, credit_pool_consumed, primary_instructor_id,
            organization_id, end_date
          )
        `)
        .eq("user_id", user.id)
        .eq("role", "teacher")
        .eq("status", "active");

      const teacherClasses: TeacherClass[] = ((teacherRows ?? []) as unknown as any[])
        .map((r) => r.classes)
        .filter(Boolean);

      // Plus classes where they are primary_instructor (legacy fallback)
      const { data: primaryRows } = await supabase
        .from("classes" as any)
        .select("id, name, code, status, credit_policy, credit_amount, " +
                "credit_pool, credit_pool_consumed, primary_instructor_id, organization_id, end_date")
        .eq("primary_instructor_id", user.id)
        .is("deleted_at", null);

      // Merge + dedupe
      const byId = new Map<string, TeacherClass>();
      const primaryList = (primaryRows ?? []) as unknown as TeacherClass[];
      [...teacherClasses, ...primaryList].forEach((c) => {
        if (c?.id) byId.set(c.id, c);
      });

      // If user is org_admin AND they didn't show up as teacher of anything,
      // fall back to all org classes (so org_admin without classes can still
      // navigate). We detect "is org admin" via a quick membership check.
      if (byId.size === 0) {
        const { data: orgAdminRow } = await supabase
          .from("organization_memberships" as any)
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "org_admin")
          .eq("status", "active")
          .limit(1);
        if ((orgAdminRow ?? []).length > 0) {
          const { data: allOrgClasses } = await supabase
            .from("classes" as any)
            .select("id, name, code, status, credit_policy, credit_amount, " +
                    "credit_pool, credit_pool_consumed, primary_instructor_id, organization_id, end_date")
            .eq("organization_id", orgId)
            .is("deleted_at", null);
          ((allOrgClasses ?? []) as unknown as TeacherClass[]).forEach((c) => byId.set(c.id, c));
        }
      }

      return Array.from(byId.values()).sort((a, b) =>
        a.name.localeCompare(b.name, "th"),
      );
    },
    staleTime: 30_000,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Class detail data (members, activity, model usage)
// ─────────────────────────────────────────────────────────────────────

export function useClassMembers(classId: string | null | undefined) {
  return useQuery<ClassMember[]>({
    queryKey: ["class-members-detailed", classId],
    enabled: !!classId,
    queryFn: async () => {
      if (!classId) return [];
      // Get class_members + join with profiles
      const { data: rows } = await supabase
        .from("class_members" as any)
        .select(`
          user_id, status, joined_at,
          credits_balance, credits_lifetime_received, credits_lifetime_used,
          profiles:user_id (display_name, avatar_url)
        `)
        .eq("class_id", classId)
        .eq("role", "student")
        .order("joined_at", { ascending: false });

      // Email comes from auth.users — we'd need an edge fn for that.
      // For demo, leave email null and surface display_name only.
      return ((rows ?? []) as any[]).map((r) => ({
        user_id: r.user_id,
        display_name: r.profiles?.display_name ?? null,
        avatar_url: r.profiles?.avatar_url ?? null,
        email: null,
        status: r.status,
        joined_at: r.joined_at,
        credits_balance: r.credits_balance ?? 0,
        credits_lifetime_received: r.credits_lifetime_received ?? 0,
        credits_lifetime_used: r.credits_lifetime_used ?? 0,
      }));
    },
    staleTime: 30_000,
  });
}

/**
 * Aggregate model usage from workspace_activity rows scoped to the class.
 * Returns ranked list (most credits used first).
 */
export function useClassModelUsage(classId: string | null | undefined, days = 30) {
  return useQuery<ModelUsageRow[]>({
    queryKey: ["class-model-usage", classId, days],
    enabled: !!classId,
    queryFn: async () => {
      if (!classId) return [];
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("workspace_activity" as any)
        .select("model_id, credits_used, user_id")
        .eq("class_id", classId)
        .eq("activity_type", "model_use")
        .gte("created_at", since);

      const byModel = new Map<string, ModelUsageRow>();
      ((data ?? []) as any[]).forEach((r) => {
        if (!r.model_id) return;
        const cur = byModel.get(r.model_id) ?? {
          model_id: r.model_id, uses: 0, total_credits: 0, unique_users: 0,
        };
        cur.uses += 1;
        cur.total_credits += r.credits_used ?? 0;
        byModel.set(r.model_id, cur);
      });

      // Compute unique_users separately (Set per model)
      const userSets = new Map<string, Set<string>>();
      ((data ?? []) as any[]).forEach((r) => {
        if (!r.model_id) return;
        if (!userSets.has(r.model_id)) userSets.set(r.model_id, new Set());
        userSets.get(r.model_id)!.add(r.user_id);
      });
      byModel.forEach((row, key) => {
        row.unique_users = userSets.get(key)?.size ?? 0;
      });

      return Array.from(byModel.values()).sort(
        (a, b) => b.total_credits - a.total_credits,
      );
    },
    staleTime: 30_000,
  });
}

/**
 * Recent activity feed for a class.
 */
export function useClassActivity(classId: string | null | undefined, limit = 50) {
  return useQuery<ActivityEvent[]>({
    queryKey: ["class-activity", classId, limit],
    enabled: !!classId,
    queryFn: async () => {
      if (!classId) return [];
      const { data } = await supabase
        .from("workspace_activity" as any)
        .select(`
          id, user_id, activity_type, model_id, credits_used, created_at, metadata,
          profiles:user_id (display_name)
        `)
        .eq("class_id", classId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        user_display_name: r.profiles?.display_name ?? null,
        activity_type: r.activity_type,
        model_id: r.model_id,
        credits_used: r.credits_used ?? 0,
        created_at: r.created_at,
        metadata: r.metadata ?? {},
      }));
    },
    staleTime: 15_000,
  });
}

/**
 * 7-day daily usage histogram (for the small chart on Overview).
 */
export function useClassDailyUsage(classId: string | null | undefined, days = 7) {
  return useQuery<{ day: string; credits: number }[]>({
    queryKey: ["class-daily-usage", classId, days],
    enabled: !!classId,
    queryFn: async () => {
      if (!classId) return [];
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("workspace_activity" as any)
        .select("credits_used, created_at")
        .eq("class_id", classId)
        .eq("activity_type", "model_use")
        .gte("created_at", since);

      // Bucket by day in local time
      const buckets = new Map<string, number>();
      ((data ?? []) as any[]).forEach((r) => {
        const d = new Date(r.created_at);
        const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,"0")}-${d.getDate().toString().padStart(2,"0")}`;
        buckets.set(key, (buckets.get(key) ?? 0) + (r.credits_used ?? 0));
      });

      // Fill missing days with 0
      const out: { day: string; credits: number }[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 3600 * 1000);
        const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,"0")}-${d.getDate().toString().padStart(2,"0")}`;
        out.push({ day: key.slice(5), credits: buckets.get(key) ?? 0 });
      }
      return out;
    },
    staleTime: 60_000,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Per-member model breakdown (for member detail drilldown)
// ─────────────────────────────────────────────────────────────────────

export function useMemberModelBreakdown(
  classId: string | null | undefined,
  userId: string | null | undefined,
  days = 30,
) {
  return useQuery<ModelUsageRow[]>({
    queryKey: ["member-model-breakdown", classId, userId, days],
    enabled: !!classId && !!userId,
    queryFn: async () => {
      if (!classId || !userId) return [];
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("workspace_activity" as any)
        .select("model_id, credits_used")
        .eq("class_id", classId)
        .eq("user_id", userId)
        .eq("activity_type", "model_use")
        .gte("created_at", since);

      const byModel = new Map<string, ModelUsageRow>();
      ((data ?? []) as any[]).forEach((r) => {
        if (!r.model_id) return;
        const cur = byModel.get(r.model_id) ?? {
          model_id: r.model_id, uses: 0, total_credits: 0, unique_users: 1,
        };
        cur.uses += 1;
        cur.total_credits += r.credits_used ?? 0;
        byModel.set(r.model_id, cur);
      });
      return Array.from(byModel.values()).sort(
        (a, b) => b.total_credits - a.total_credits,
      );
    },
    staleTime: 30_000,
  });
}
