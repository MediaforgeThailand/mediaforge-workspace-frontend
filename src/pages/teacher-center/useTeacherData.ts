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

export interface PaginatedClassMembers {
  items: ClassMember[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ClassMemberSummary {
  totalStudents: number;
  inactiveStudents: number;
}

export interface ActivityEvent {
  id: string;
  user_id: string;
  user_display_name?: string | null;
  activity_type: string;
  model_id: string | null;
  credits_used: number;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface RpcResultRow {
  [key: string]: unknown;
}

interface SupabaseQueryResult<T> {
  data: T[] | null;
  count: number | null;
  error: { message: string } | null;
}

interface SupabaseQueryBuilder<T> extends PromiseLike<SupabaseQueryResult<T>> {
  select: (columns: string, options?: { count?: "exact"; head?: boolean }) => SupabaseQueryBuilder<T>;
  eq: (column: string, value: unknown) => SupabaseQueryBuilder<T>;
  is: (column: string, value: unknown) => SupabaseQueryBuilder<T>;
  gte: (column: string, value: unknown) => SupabaseQueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseQueryBuilder<T>;
  limit: (count: number) => SupabaseQueryBuilder<T>;
  range: (from: number, to: number) => SupabaseQueryBuilder<T>;
}

interface ClassMemberRow {
  user_id: string;
  status: string;
  joined_at: string;
  credits_balance: number | null;
  credits_lifetime_received: number | null;
  credits_lifetime_used: number | null;
  profiles?: {
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

interface TeacherClassJoinRow {
  classes?: TeacherClass | null;
}

interface OrganizationMembershipRow {
  role: string;
}

interface ActivityRow {
  id: string;
  user_id: string;
  activity_type: string;
  model_id: string | null;
  credits_used: number | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  profiles?: {
    display_name?: string | null;
  } | null;
}

type RpcCaller = (
  fn: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;

const callRpc = supabase.rpc.bind(supabase) as RpcCaller;
const fromTable = supabase.from.bind(supabase) as unknown as <T>(
  table: string,
) => SupabaseQueryBuilder<T>;
const MAX_MANAGEABLE_CLASSES = 200;

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
  const orgId = (profile as { organization_id?: string | null } | null)?.organization_id ?? null;

  return useQuery<TeacherClass[]>({
    queryKey: ["teacher-classes", user?.id, orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      if (!user || !orgId) return [];

      // Try teacher-scoped first
      const { data: teacherRows } = await fromTable<TeacherClassJoinRow>("class_members")
        .select(`
          classes:class_id (
            id, name, code, status, credit_policy, credit_amount,
            credit_pool, credit_pool_consumed, primary_instructor_id,
            organization_id, end_date
          )
        `)
        .eq("user_id", user.id)
        .eq("role", "teacher")
        .eq("status", "active")
        .limit(MAX_MANAGEABLE_CLASSES);

      const teacherClasses: TeacherClass[] = (teacherRows ?? [])
        .map((r) => r.classes)
        .filter(Boolean);

      // Plus classes where they are primary_instructor (legacy fallback)
      const { data: primaryRows } = await fromTable<TeacherClass>("classes")
        .select("id, name, code, status, credit_policy, credit_amount, " +
                "credit_pool, credit_pool_consumed, primary_instructor_id, organization_id, end_date")
        .eq("primary_instructor_id", user.id)
        .is("deleted_at", null)
        .limit(MAX_MANAGEABLE_CLASSES);

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
        const { data: orgAdminRow } = await fromTable<OrganizationMembershipRow>("organization_memberships")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "org_admin")
          .eq("status", "active")
          .limit(1);
        if ((orgAdminRow ?? []).length > 0) {
          const { data: allOrgClasses } = await fromTable<TeacherClass>("classes")
            .select("id, name, code, status, credit_policy, credit_amount, " +
                    "credit_pool, credit_pool_consumed, primary_instructor_id, organization_id, end_date")
            .eq("organization_id", orgId)
            .is("deleted_at", null)
            .limit(MAX_MANAGEABLE_CLASSES);
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

export function useClassMembers(
  classId: string | null | undefined,
  page = 1,
  pageSize = 25,
) {
  return useQuery<PaginatedClassMembers>({
    queryKey: ["class-members-detailed", classId, page, pageSize],
    enabled: !!classId,
    queryFn: async () => {
      if (!classId) {
        return {
          items: [],
          total: 0,
          page,
          pageSize,
          hasMore: false,
        };
      }

      const safePage = Math.max(1, page);
      const safePageSize = Math.min(Math.max(1, pageSize), 100);
      const start = (safePage - 1) * safePageSize;
      const end = start + safePageSize - 1;

      const { data: rows, count } = await fromTable<ClassMemberRow>("class_members")
        .select(`
          user_id, status, joined_at,
          credits_balance, credits_lifetime_received, credits_lifetime_used,
          profiles:user_id (display_name, avatar_url)
        `, { count: "exact" })
        .eq("class_id", classId)
        .eq("role", "student")
        .order("joined_at", { ascending: false })
        .range(start, end);

      const items = (rows ?? []).map((r) => ({
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

      return {
        items,
        total: count ?? 0,
        page: safePage,
        pageSize: safePageSize,
        hasMore: start + items.length < (count ?? 0),
      };
    },
    staleTime: 30_000,
  });
}

export function useClassMemberSummary(classId: string | null | undefined) {
  return useQuery<ClassMemberSummary>({
    queryKey: ["class-member-summary", classId],
    enabled: !!classId,
    queryFn: async () => {
      if (!classId) {
        return { totalStudents: 0, inactiveStudents: 0 };
      }

      const [totalResult, inactiveResult] = await Promise.all([
        fromTable<ClassMemberRow>("class_members")
          .select("user_id", { count: "exact", head: true })
          .eq("class_id", classId)
          .eq("role", "student"),
        fromTable<ClassMemberRow>("class_members")
          .select("user_id", { count: "exact", head: true })
          .eq("class_id", classId)
          .eq("role", "student")
          .eq("status", "active")
          .eq("credits_lifetime_used", 0),
      ]);

      return {
        totalStudents: totalResult.count ?? 0,
        inactiveStudents: inactiveResult.count ?? 0,
      };
    },
    staleTime: 30_000,
  });
}

export function useClassTopSpenders(classId: string | null | undefined, limit = 5) {
  return useQuery<ClassMember[]>({
    queryKey: ["class-top-spenders", classId, limit],
    enabled: !!classId,
    queryFn: async () => {
      if (!classId) return [];
      const { data: rows } = await fromTable<ClassMemberRow>("class_members")
        .select(`
          user_id, status, joined_at,
          credits_balance, credits_lifetime_received, credits_lifetime_used,
          profiles:user_id (display_name, avatar_url)
        `)
        .eq("class_id", classId)
        .eq("role", "student")
        .eq("status", "active")
        .order("credits_lifetime_used", { ascending: false })
        .limit(limit);

      return (rows ?? []).map((r) => ({
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
      const { data, error } = await callRpc("teacher_class_model_usage", {
        p_class_id: classId,
        p_since: since,
      });
      if (error) throw error;

      return ((data ?? []) as RpcResultRow[]).map((row) => ({
        model_id: String(row.model_id ?? ""),
        uses: Number(row.uses ?? 0),
        total_credits: Number(row.total_credits ?? 0),
        unique_users: Number(row.unique_users ?? 0),
      }));
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
      const { data } = await fromTable<ActivityRow>("workspace_activity")
        .select(`
          id, user_id, activity_type, model_id, credits_used, created_at, metadata,
          profiles:user_id (display_name)
        `)
        .eq("class_id", classId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data ?? []).map((r) => ({
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
      const until = new Date().toISOString();
      const { data, error } = await callRpc("teacher_class_daily_usage", {
        p_class_id: classId,
        p_since: since,
        p_until: until,
      });
      if (error) throw error;

      return ((data ?? []) as RpcResultRow[]).map((row) => ({
        day: String(row.day ?? ""),
        credits: Number(row.credits ?? 0),
      }));
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
      const { data, error } = await callRpc("teacher_member_model_breakdown", {
        p_class_id: classId,
        p_user_id: userId,
        p_since: since,
      });
      if (error) throw error;

      return ((data ?? []) as RpcResultRow[]).map((row) => ({
        model_id: String(row.model_id ?? ""),
        uses: Number(row.uses ?? 0),
        total_credits: Number(row.total_credits ?? 0),
        unique_users: Number(row.unique_users ?? 1),
      }));
    },
    staleTime: 30_000,
  });
}
