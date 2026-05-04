// Wrapper for the mf-um-org-admin-api edge function — used from the
// consumer app's class-admin / student panels. Endpoints are class-scoped
// in v3.011+ (see migrations 011-016 + edge fn refactor).

import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const FN_BASE = `${SUPABASE_URL}/functions/v1/mf-um-org-admin-api`;

async function call<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const url = `${FN_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    throw new Error(data?.error ?? data?.message ?? `HTTP ${res.status}`);
  }
  return data as T;
}

// ─── Types ──────────────────────────────────────────────────────────────

export interface ClassRow {
  id: string;
  org_id: string;
  name: string;
  code: string;
  term: string | null;
  year: number | null;
  status: "active" | "scheduled" | "ended" | "archived";
  max_students: number | null;
  primary_instructor_id: string | null;
  credit_policy: "manual" | "monthly_reset" | "weekly_drip";
  credit_amount: number;
  reset_day_of_month: number;
  reset_day_of_week: number;
  credit_pool: number;
  credit_pool_consumed: number;
  start_date: string | null;
  end_date: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ClassMember {
  id: string;
  user_id: string;
  status: "active" | "suspended" | "removed";
  enrolled_at: string;
  enrolled_via: string;
  student_code: string | null;
  credits_balance: number;
  credits_lifetime_received: number;
  credits_lifetime_used: number;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  last_activity_at: string | null;
  model_uses_30d: number;
  spaces?: ClassStudentSpace[];
}

export interface ClassStudentSpace {
  id: string;
  class_id: string;
  user_id: string;
  project_id?: string | null;
  workspace_id: string;
  workspace_name?: string | null;
  status: "active" | "submitted" | "passed" | "ended" | string;
  credits_balance: number;
  credits_lifetime_received: number;
  credits_lifetime_used: number;
  generation_count_30d?: number;
  credits_used_30d?: number;
  last_activity_at?: string | null;
  display_name?: string | null;
  email?: string | null;
  is_online?: boolean;
  is_locked?: boolean;
}

export interface ClassEnrollmentCode {
  id: string;
  class_id: string;
  code: string;
  max_uses: number | null;
  uses_count: number;
  credit_amount?: number | null;
  expires_at: string | null;
  description: string | null;
  created_at: string;
}

export interface CreditRequest {
  id: string;
  class_id: string;
  user_id: string;
  amount_requested: number;
  reason: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  amount_granted: number | null;
  created_at: string;
}

// ─── Class API (org-admin / teacher facing) ─────────────────────────────

export const consumerOrgAdminApi = {
  // List classes in an org (org_admin / super-admin)
  listClasses: (orgId: string) =>
    call<{ classes: ClassRow[] }>("GET", `/orgs/${orgId}/classes`),

  // Create class
  createClass: (orgId: string, input: Partial<ClassRow> & { name: string }) =>
    call<{ class: ClassRow }>("POST", `/orgs/${orgId}/classes`, input),

  // Class detail
  getClass: (classId: string) =>
    call<{
      class: ClassRow;
      active_member_count: number;
      enrollment_codes: ClassEnrollmentCode[];
      pending_credit_requests: number;
      teachers: Array<{ user_id: string; role: "primary" | "co" }>;
      credit_pool_remaining: number;
    }>("GET", `/classes/${classId}`),

  updateClass: (classId: string, patch: Partial<ClassRow>) =>
    call<{ class: ClassRow }>("PATCH", `/classes/${classId}`, patch),

  endClass: (classId: string) =>
    call<{ ok: boolean }>("DELETE", `/classes/${classId}`),

  // Teachers (M:N — primary + co)
  listTeachers: (classId: string) =>
    call<{ teachers: Array<{ user_id: string; role: "primary" | "co" }> }>(
      "GET", `/classes/${classId}/teachers`,
    ),
  addTeacherByEmail: (classId: string, email: string, role: "primary" | "co" = "co") =>
    call<{ teacher: any }>("POST", `/classes/${classId}/teachers`,
      { user_email: email, role }),
  removeTeacher: (classId: string, userId: string) =>
    call<{ ok: boolean }>("DELETE", `/classes/${classId}/teachers/${userId}`),

  // Members
  listClassMembers: (classId: string) =>
    call<{ members: ClassMember[] }>("GET", `/classes/${classId}/members`),

  updateMember: (classId: string, userId: string,
    patch: { status?: ClassMember["status"]; student_code?: string }) =>
    call<{ member: ClassMember }>("PATCH", `/classes/${classId}/members/${userId}`, patch),

  removeMember: (classId: string, userId: string) =>
    call<{ ok: boolean }>("DELETE", `/classes/${classId}/members/${userId}`),

  grantCredits: (classId: string, userId: string, workspaceId: string, amount: number, reason?: string) =>
    call<{ new_balance: number; granted?: number; revoked?: number }>(
      "POST",
      `/classes/${classId}/members/${userId}/credits`,
      { workspace_id: workspaceId, amount, reason },
    ),

  ensureStudentSpace: (classId: string, userId: string, initialCredits = 0, reason?: string) =>
    call<{ space: unknown; new_balance: number }>(
      "POST",
      `/classes/${classId}/members/${userId}/space`,
      { initial_credits: initialCredits, reason },
    ),

  listSpaces: (classId: string) =>
    call<{ spaces: ClassStudentSpace[] }>("GET", `/classes/${classId}/spaces`),

  adjustSpaceCredits: (classId: string, workspaceId: string, amount: number, reason?: string) =>
    call<{ new_balance: number; granted?: number; revoked?: number; workspace_id: string }>(
      "POST",
      `/classes/${classId}/spaces/${encodeURIComponent(workspaceId)}/credits`,
      { amount, reason },
    ),

  setSpaceStatus: (classId: string, workspaceId: string, status: "active" | "submitted" | "passed" | "ended") =>
    call<{ space: ClassStudentSpace; workspace_id: string; status: string }>(
      "POST",
      `/classes/${classId}/spaces/${encodeURIComponent(workspaceId)}/status`,
      { status },
    ),

  // Enrollment codes
  listCodes: (classId: string) =>
    call<{ codes: ClassEnrollmentCode[] }>("GET", `/classes/${classId}/codes`),

  createCode: (classId: string, input: {
    max_uses?: number | null;
    credit_amount?: number | null;
    expires_at?: string | null;
    description?: string;
  }) => call<{ code: ClassEnrollmentCode }>("POST", `/classes/${classId}/codes`, input),

  revokeCode: (classId: string, codeId: string) =>
    call<{ ok: boolean }>("DELETE", `/classes/${classId}/codes/${codeId}`),

  // Credit allocation (super-admin only — moves credits org→class)
  allocateToClass: (classId: string, delta: number, reason?: string) =>
    call<{
      ok: boolean;
      class_pool: number;
      class_pool_remaining: number;
      org_pool_allocated_to_classes: number;
      delta: number;
    }>("POST", `/classes/${classId}/allocate`, { delta, reason }),

  // Credit requests
  listCreditRequests: (classId: string) =>
    call<{ requests: CreditRequest[] }>("GET", `/classes/${classId}/credit-requests`),

  createCreditRequest: (classId: string, amount: number, reason?: string) =>
    call<{ request: CreditRequest }>("POST", `/classes/${classId}/credit-requests`,
      { amount_requested: amount, reason }),

  reviewCreditRequest: (requestId: string, approve: boolean, opts?: {
    amount_granted?: number;
    review_note?: string;
  }) => call<any>("POST", `/credit-requests/${requestId}/review`,
      { approve, amount_granted: opts?.amount_granted, review_note: opts?.review_note }),
};

// ─── Class enrolment (student-facing QR scan) ───────────────────────────
export async function enrollInClass(code: string, studentCode: string): Promise<{
  ok: boolean;
  error?: string;
  class_id?: string;
  class_name?: string;
  credit_policy?: string;
  starting_balance?: number;
  org_id?: string;
  workspace_id?: string;
  project_id?: string;
  canvas_id?: string;
}> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) return { ok: false, error: "not_signed_in" };

  const url = `${SUPABASE_URL}/functions/v1/mf-um-class-enroll`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code, student_code: studentCode }),
  });
  try {
    return await res.json();
  } catch {
    return { ok: false, error: `http_${res.status}` };
  }
}
