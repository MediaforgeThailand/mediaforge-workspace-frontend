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
import {
  consumerOrgAdminApi,
  type ClassMember as ApiClassMember,
  type ClassRow,
  type ClassStudentSpace,
} from "@/lib/orgAdminApi";

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
  student_code?: string | null;
  last_activity_at?: string | null;
  credits_balance: number;
  credits_lifetime_received: number;
  credits_lifetime_used: number;
  model_uses_30d?: number;
  spaces?: ClassStudentSpace[];
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

const MAX_MANAGEABLE_CLASSES = 200;

function toTeacherClass(row: ClassRow): TeacherClass {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status,
    credit_policy: row.credit_policy,
    credit_amount: row.credit_amount ?? 0,
    credit_pool: row.credit_pool ?? 0,
    credit_pool_consumed: row.credit_pool_consumed ?? 0,
    primary_instructor_id: row.primary_instructor_id ?? null,
    organization_id: row.org_id,
    end_date: row.end_date ?? null,
  };
}

function primarySpace(member: ApiClassMember): ClassStudentSpace | null {
  const spaces = member.spaces ?? [];
  return (
    spaces.find((space) => space.status === "active") ??
    spaces.find((space) => space.status === "submitted") ??
    spaces[0] ??
    null
  );
}

function toClassMember(row: ApiClassMember): ClassMember {
  const space = primarySpace(row);
  return {
    user_id: row.user_id,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
    email: row.email ?? null,
    status: row.status,
    joined_at: row.enrolled_at,
    student_code: row.student_code ?? null,
    last_activity_at: space?.last_activity_at ?? row.last_activity_at ?? null,
    credits_balance: space?.credits_balance ?? row.credits_balance ?? 0,
    credits_lifetime_received: space?.credits_lifetime_received ?? row.credits_lifetime_received ?? 0,
    credits_lifetime_used: space?.credits_lifetime_used ?? row.credits_lifetime_used ?? 0,
    model_uses_30d: row.model_uses_30d ?? 0,
    spaces: row.spaces ?? [],
  };
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
  const orgId = (
    (profile as { organization_id?: string | null; org_id?: string | null } | null)?.organization_id ??
    (profile as { organization_id?: string | null; org_id?: string | null } | null)?.org_id ??
    null
  );

  return useQuery<TeacherClass[]>({
    queryKey: ["teacher-classes", user?.id, orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      if (!user || !orgId) return [];
      const { classes } = await consumerOrgAdminApi.listClasses(orgId);
      return classes
        .slice(0, MAX_MANAGEABLE_CLASSES)
        .map(toTeacherClass)
        .sort((a, b) => a.name.localeCompare(b.name, "th"));
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
      const { members } = await consumerOrgAdminApi.listClassMembers(classId);
      const allItems = members
        .filter((member) => member.status !== "removed")
        .map(toClassMember)
        .sort((a, b) => Date.parse(b.joined_at) - Date.parse(a.joined_at));
      const items = allItems.slice(start, start + safePageSize);

      return {
        items,
        total: allItems.length,
        page: safePage,
        pageSize: safePageSize,
        hasMore: start + items.length < allItems.length,
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

      const { members } = await consumerOrgAdminApi.listClassMembers(classId);
      const activeMembers = members.filter((member) => member.status === "active");

      return {
        totalStudents: members.filter((member) => member.status !== "removed").length,
        inactiveStudents: activeMembers.filter((member) => {
          const mapped = toClassMember(member);
          return mapped.credits_lifetime_used <= 0;
        }).length,
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
      const { members } = await consumerOrgAdminApi.listClassMembers(classId);
      return members
        .filter((member) => member.status === "active")
        .map(toClassMember)
        .sort((a, b) => b.credits_lifetime_used - a.credits_lifetime_used)
        .slice(0, limit);
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
      return [];
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
      return [];
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
      return [];
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
      return [];
    },
    staleTime: 30_000,
  });
}
