/**
 * TeacherCenter — Variant A "Command Center" UI.
 *
 * Replaces the stacked-card OrgAdminPanel with a sidebar + tabs layout.
 * Same page works for both `class teacher` (their classes only) and
 * `org_admin` (all org classes — auto-fallback in useManageableClasses).
 *
 * Tab structure:
 *   • Overview     — stat strip + 7-day chart + AI model ranking + top spenders
 *   • Members      — sortable roster with per-student model breakdown
 *   • AI Usage     — deep-dive analytics on model_use events
 *   • Codes        — QR enrollment management (placeholder reuses existing)
 *   • Activity     — event feed (model_use / enrollment / credits_granted)
 *
 * The Live Class CTA in the header opens the existing QR modal (or jumps
 * to a future LiveClassroom page).
 */

import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useIsOrgAdmin } from "@/hooks/useIsOrgUser";
import {
  consumerOrgAdminApi,
  type ClassEnrollmentCode,
  type ClassStudentSpace,
} from "@/lib/orgAdminApi";
import {
  useManageableClasses,
  useClassMembers,
  useClassMemberSummary,
  useClassModelUsage,
  useClassActivity,
  useClassDailyUsage,
  useClassTopSpenders,
  useMemberModelBreakdown,
  type TeacherClass,
  type ClassMember,
  type ClassMemberSummary,
} from "./useTeacherData";
import { getModelMeta, getCategoryColor, type ModelCategory } from "./modelMeta";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

import {
  Users, Coins, Activity, AlertCircle, ChevronRight, Crown,
  GraduationCap, BookOpen, Sparkles, ArrowLeft,
  PlayCircle, QrCode, BarChart3, Plus, RefreshCw,
  Copy, Trash2, Loader2, CheckCircle2, Ban,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip,
} from "recharts";

import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────

export default function TeacherCenter() {
  const { user, profile } = useAuth();
  const isOrgAdmin = useIsOrgAdmin();
  const { data: classes, isLoading: loadingClasses } = useManageableClasses();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedClassId = searchParams.get("class");

  // Auto-select first class on mount when none chosen
  const effectiveClassId =
    selectedClassId ?? (classes && classes.length > 0 ? classes[0].id : null);

  if (!user) return <Navigate to="/auth" replace />;
  // Note: we DON'T block on role here. useManageableClasses returns []
  // for users with no role — we render the empty-state below.

  return (
    <div className="min-h-screen bg-background flex">
      {/* ─── Left Sidebar ───────────────────────────────────────────── */}
      <Sidebar
        classes={classes ?? []}
        loading={loadingClasses}
        activeId={effectiveClassId}
        onSelect={(id) => setSearchParams({ class: id })}
        isOrgAdmin={isOrgAdmin}
        userName={profile?.display_name || "Teacher"}
      />

      {/* ─── Main ───────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {effectiveClassId ? (
          <ClassDetail classId={effectiveClassId} classes={classes ?? []} />
        ) : (
          <EmptyState isOrgAdmin={isOrgAdmin} />
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────────────

function Sidebar(props: {
  classes: TeacherClass[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  isOrgAdmin: boolean;
  userName: string;
}) {
  const navigate = useNavigate();
  return (
    <aside className="w-[260px] shrink-0 border-r border-border bg-card/40 flex flex-col">
      {/* Brand row */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <Crown className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Teacher Center
          </span>
        </div>
        <div className="text-sm font-medium truncate">{props.userName}</div>
        {props.isOrgAdmin && (
          <Badge variant="outline" className="mt-1.5 text-[10px] gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300">
            <Sparkles className="h-2.5 w-2.5" /> Org Admin
          </Badge>
        )}
      </div>

      {/* Class list */}
      <div className="px-3 py-3 flex-1 overflow-y-auto">
        <div className="px-2 py-1.5 flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            {props.isOrgAdmin ? "Classes (org-wide)" : "My Classes"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {props.classes.length}
          </span>
        </div>

        {props.loading ? (
          <div className="px-2 py-4 text-xs text-muted-foreground">Loading…</div>
        ) : props.classes.length === 0 ? (
          <div className="px-2 py-4 text-xs text-muted-foreground">
            No classes yet.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {props.classes.map((c) => {
              const remaining = Math.max(c.credit_pool - c.credit_pool_consumed, 0);
              const percent = c.credit_pool > 0
                ? Math.round((c.credit_pool_consumed / c.credit_pool) * 100)
                : 0;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => props.onSelect(c.id)}
                    className={cn(
                      "w-full text-left px-2.5 py-2 rounded-md transition-colors",
                      "hover:bg-accent/60",
                      props.activeId === c.id && "bg-accent",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen
                        className={cn(
                          "h-3.5 w-3.5",
                          props.activeId === c.id ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <span className="text-[13px] font-medium truncate flex-1 min-w-0">
                        {c.name}
                      </span>
                    </div>
                    <div className="mt-1 ml-5 flex items-center gap-1.5">
                      <div className="flex-1 h-0.5 rounded-full bg-muted">
                        <div
                          className="h-0.5 rounded-full bg-primary"
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {remaining.toLocaleString()}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => navigate("/app/workspace")}
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-2" />
          Back to workspace
        </Button>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Class detail (right side)
// ─────────────────────────────────────────────────────────────────────

function ClassDetail({ classId, classes }: { classId: string; classes: TeacherClass[] }) {
  const cls = classes.find((c) => c.id === classId);
  const [membersPage, setMembersPage] = useState(1);
  const membersPageSize = 25;
  const { data: membersData } = useClassMembers(classId, membersPage, membersPageSize);
  const { data: memberSummary } = useClassMemberSummary(classId);
  const { data: topSpenders } = useClassTopSpenders(classId, 5);
  const { data: modelUsage } = useClassModelUsage(classId, 30);
  const { data: dailyUsage } = useClassDailyUsage(classId, 7);
  const { data: activity } = useClassActivity(classId, 30);

  const members = membersData?.items ?? [];
  const studentCount = memberSummary?.totalStudents ?? membersData?.total ?? 0;

  const totalCredits = cls ? cls.credit_pool : 0;
  const usedCredits = cls ? cls.credit_pool_consumed : 0;
  const remaining = Math.max(totalCredits - usedCredits, 0);
  const usedPercent = totalCredits > 0 ? Math.round((usedCredits / totalCredits) * 100) : 0;
  const usageThisMonth = (modelUsage ?? []).reduce((sum, m) => sum + m.total_credits, 0);
  const totalRuns = (modelUsage ?? []).reduce((sum, m) => sum + m.uses, 0);
  const distinctModels = (modelUsage ?? []).length;

  useEffect(() => {
    setMembersPage(1);
  }, [classId]);

  if (!cls) {
    return <div className="p-10 text-muted-foreground">Class not found.</div>;
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-card/30 backdrop-blur sticky top-0 z-10">
        <div className="px-7 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                <GraduationCap className="h-3 w-3" />
                {cls.code}
                <span>·</span>
                <span className="capitalize">{cls.credit_policy.replace("_", " ")}</span>
              </div>
              <h1 className="text-2xl font-bold truncate">{cls.name}</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add student
              </Button>
              <Button size="sm" className="bg-primary">
                <PlayCircle className="h-4 w-4 mr-1.5" />
                Live class
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs container */}
      <Tabs defaultValue="overview" className="flex-1 flex flex-col">
        <div className="border-b border-border bg-background sticky top-[73px] z-10">
          <TabsList className="px-7 h-11 bg-transparent border-0 rounded-none gap-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-accent text-sm">
              Overview
            </TabsTrigger>
            <TabsTrigger value="members" className="data-[state=active]:bg-accent text-sm">
              Members
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 h-4">
                {studentCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="ai" className="data-[state=active]:bg-accent text-sm">
              AI Usage
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 h-4">
                {distinctModels}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="codes" className="data-[state=active]:bg-accent text-sm">
              QR Codes
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-accent text-sm">
              Activity
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex-1 m-0 p-7 space-y-6">
          {/* Stat strip */}
          <StatStrip
            studentCount={studentCount}
            remaining={remaining}
            totalCredits={totalCredits}
            usedThisMonth={usageThisMonth}
            distinctModels={distinctModels}
            totalRuns={totalRuns}
            usedPercent={usedPercent}
          />

          {/* Daily usage chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" />
                7-day usage trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyUsage ?? []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <RTooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelFormatter={(d) => `Day ${d}`}
                    />
                    <Bar dataKey="credits" fill="var(--primary, #3a2bff)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* AI Models ranking + Top spenders side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ModelRankingCard models={modelUsage ?? []} />
            <TopSpendersCard members={topSpenders ?? []} />
          </div>

          {/* Insights */}
          <InsightsCard
            models={modelUsage ?? []}
            memberSummary={memberSummary}
            totalCredits={totalCredits}
            usedCredits={usedCredits}
          />
        </TabsContent>

        <TabsContent value="members" className="flex-1 m-0 p-7">
          <MembersPanel
            members={members}
            classId={classId}
            currentPage={membersData?.page ?? membersPage}
            pageSize={membersData?.pageSize ?? membersPageSize}
            totalStudents={studentCount}
            hasMore={membersData?.hasMore ?? false}
            onPageChange={setMembersPage}
          />
        </TabsContent>

        <TabsContent value="ai" className="flex-1 m-0 p-7">
          <AIUsagePanel models={modelUsage ?? []} totalRuns={totalRuns} totalCredits={usageThisMonth} />
        </TabsContent>

        <TabsContent value="codes" className="flex-1 m-0 p-7">
          <CodesPanel classId={classId} creditPoolRemaining={remaining} />
        </TabsContent>

        <TabsContent value="activity" className="flex-1 m-0 p-7">
          <ActivityPanel events={activity ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Stat strip
// ─────────────────────────────────────────────────────────────────────

function StatStrip(props: {
  studentCount: number;
  remaining: number;
  totalCredits: number;
  usedThisMonth: number;
  distinctModels: number;
  totalRuns: number;
  usedPercent: number;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        label="Students"
        value={props.studentCount.toString()}
        sub={`active in class`}
        icon={<Users className="h-3.5 w-3.5" />}
        accent="primary"
      />
      <StatCard
        label="Credits remaining"
        value={props.remaining.toLocaleString()}
        sub={`of ${props.totalCredits.toLocaleString()} pool`}
        icon={<Coins className="h-3.5 w-3.5" />}
        accent="emerald"
        progress={props.usedPercent}
      />
      <StatCard
        label="Used (30d)"
        value={props.usedThisMonth.toLocaleString()}
        sub={`${props.totalRuns.toLocaleString()} runs`}
        icon={<Activity className="h-3.5 w-3.5" />}
        accent="violet"
      />
      <StatCard
        label="AI Models"
        value={props.distinctModels.toString()}
        sub="in use this month"
        icon={<Sparkles className="h-3.5 w-3.5" />}
        accent="amber"
      />
    </div>
  );
}

function StatCard({
  label, value, sub, icon, accent, progress,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  accent: "primary" | "emerald" | "violet" | "amber";
  progress?: number;
}) {
  const accentClass = {
    primary: "text-primary",
    emerald: "text-emerald-600 dark:text-emerald-400",
    violet: "text-violet-600 dark:text-violet-400",
    amber: "text-amber-600 dark:text-amber-400",
  }[accent];

  return (
    <Card>
      <CardContent className="p-4">
        <div className={cn("flex items-center gap-1.5 text-xs uppercase tracking-wide", accentClass)}>
          {icon}
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
        {progress !== undefined && (
          <div className="mt-2.5 h-1 rounded-full bg-muted">
            <div
              className={cn("h-1 rounded-full", {
                "bg-primary":  accent === "primary",
                "bg-emerald-500": accent === "emerald",
                "bg-violet-500":  accent === "violet",
                "bg-amber-500":   accent === "amber",
              })}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// AI Model Ranking (Overview card — compact)
// ─────────────────────────────────────────────────────────────────────

function ModelRankingCard({ models }: { models: import("./useTeacherData").ModelUsageRow[] }) {
  const totalCredits = models.reduce((s, m) => s + m.total_credits, 0);
  const top = models.slice(0, 5);
  const rest = models.slice(5);
  const restCredits = rest.reduce((s, m) => s + m.total_credits, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5" />
          AI Models · ranked by usage (30 days)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {top.map((m, i) => {
          const meta = getModelMeta(m.model_id);
          const percent = totalCredits > 0 ? Math.round((m.total_credits / totalCredits) * 100) : 0;
          return (
            <div key={m.model_id} className="flex items-center gap-3">
              <div className="text-xs font-mono w-4 text-muted-foreground tabular-nums">
                {i + 1}
              </div>
              <div className="text-base">{meta.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{meta.display}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {m.uses} runs · {m.unique_users} users
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: `${percent}%`,
                      backgroundColor: getCategoryColor(meta.category),
                    }}
                  />
                </div>
              </div>
              <div className="text-right shrink-0 w-20">
                <div className="text-sm font-semibold tabular-nums">
                  {m.total_credits.toLocaleString()}
                </div>
                <div className="text-[10px] text-muted-foreground">{percent}%</div>
              </div>
            </div>
          );
        })}
        {rest.length > 0 && (
          <div className="pt-1 mt-1 border-t border-border/60">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="w-4" />
              <div>+ {rest.length} more</div>
              <div className="flex-1" />
              <div className="tabular-nums">{restCredits.toLocaleString()}</div>
            </div>
          </div>
        )}
        {models.length === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No model usage yet — students haven't run any AI tools this period.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Top spenders card
// ─────────────────────────────────────────────────────────────────────

function TopSpendersCard({ members }: { members: ClassMember[] }) {
  const sorted = [...members]
    .filter((m) => m.status === "active")
    .sort((a, b) => b.credits_lifetime_used - a.credits_lifetime_used)
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          Top spenders
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {sorted.length === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No students yet.
          </div>
        )}
        {sorted.map((m, i) => {
          const cap = m.credits_lifetime_received || 200;
          const percent = cap > 0 ? Math.min(Math.round((m.credits_lifetime_used / cap) * 100), 100) : 0;
          return (
            <div key={m.user_id} className="flex items-center gap-3">
              <div className="text-xs font-mono w-4 text-muted-foreground tabular-nums">
                {i + 1}
              </div>
              <Avatar className="h-7 w-7">
                <AvatarImage src={m.avatar_url ?? undefined} />
                <AvatarFallback className="text-[10px]">
                  {(m.display_name ?? "??").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {m.display_name ?? "Unnamed"}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono truncate">
                  {m.student_code ? `ID ${m.student_code}` : m.email ?? m.user_id.slice(0, 8)}
                </div>
                <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-1 rounded-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums">
                  {m.credits_balance}/{cap}
                </div>
                <div className="text-[10px] text-muted-foreground">used {m.credits_lifetime_used}</div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Insights — auto-generated tips
// ─────────────────────────────────────────────────────────────────────

function InsightsCard(props: {
  models: import("./useTeacherData").ModelUsageRow[];
  memberSummary?: ClassMemberSummary;
  totalCredits: number;
  usedCredits: number;
}) {
  const insights: { tone: "info" | "warn" | "ok"; text: string }[] = [];

  // 1) Most-used model
  if (props.models.length > 0) {
    const top = props.models[0];
    const meta = getModelMeta(top.model_id);
    insights.push({
      tone: "info",
      text: `${meta.emoji} ${meta.display} ใช้มากที่สุด (${top.total_credits.toLocaleString()} เครดิต) — แนะนำเตรียมตัวอย่างให้นักเรียนเพิ่ม`,
    });
  }

  // 2) Inactive students
  const inactiveCount = props.memberSummary?.inactiveStudents ?? 0;
  if (inactiveCount > 0) {
    insights.push({
      tone: "warn",
      text: `🔔 มี ${inactiveCount} คนที่ยังไม่เคยใช้เครดิต — ส่ง notification เตือน?`,
    });
  }

  // 3) Pool depletion warning
  const remaining = props.totalCredits - props.usedCredits;
  if (props.totalCredits > 0 && remaining / props.totalCredits < 0.2) {
    insights.push({
      tone: "warn",
      text: `⚠️ เครดิตคลาสเหลือต่ำกว่า 20% — ขออนุมัติเพิ่มจาก org admin`,
    });
  }

  // 4) Underused model (last in list with > 0)
  if (props.models.length >= 3) {
    const last = props.models[props.models.length - 1];
    const meta = getModelMeta(last.model_id);
    insights.push({
      tone: "info",
      text: `💭 ${meta.display} ใช้น้อยกว่าคาด (${last.total_credits} เครดิต) — อาจต้องสาธิตการใช้งานเพิ่ม`,
    });
  }

  if (insights.length === 0) {
    insights.push({ tone: "ok", text: "✅ ทุกอย่างดูปกติดี ไม่มี alert ในช่วงนี้" });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {insights.map((it, i) => (
          <div
            key={i}
            className={cn(
              "text-sm px-3 py-2 rounded-md border",
              it.tone === "warn" && "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200",
              it.tone === "info" && "border-border bg-accent/30",
              it.tone === "ok"   && "border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200",
            )}
          >
            {it.text}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// AI Usage Panel (deep dive — separate tab)
// ─────────────────────────────────────────────────────────────────────

function AIUsagePanel({
  models, totalRuns, totalCredits,
}: {
  models: import("./useTeacherData").ModelUsageRow[];
  totalRuns: number;
  totalCredits: number;
}) {
  const grouped = useMemo(() => {
    const cats: Record<string, typeof models> = {};
    models.forEach((m) => {
      const cat = getModelMeta(m.model_id).category;
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(m);
    });
    return cats;
  }, [models]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label="Total runs (30d)"
          value={totalRuns.toLocaleString()}
          sub="across all models"
          icon={<Activity className="h-3.5 w-3.5" />}
          accent="primary"
        />
        <StatCard
          label="Credits spent"
          value={totalCredits.toLocaleString()}
          sub={`avg ${totalRuns > 0 ? (totalCredits / totalRuns).toFixed(1) : "0"} per run`}
          icon={<Coins className="h-3.5 w-3.5" />}
          accent="emerald"
        />
        <StatCard
          label="Distinct models"
          value={models.length.toString()}
          sub="in use"
          icon={<Sparkles className="h-3.5 w-3.5" />}
          accent="violet"
        />
      </div>

      {/* Bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Credits per model</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={models.map((m) => ({
                  ...m,
                  display: getModelMeta(m.model_id).display,
                  fill:    getCategoryColor(getModelMeta(m.model_id).category),
                }))}
                layout="vertical"
                margin={{ top: 5, right: 16, left: 16, bottom: 5 }}
              >
                <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  dataKey="display"
                  type="category"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={150}
                />
                <RTooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="total_credits" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Detailed table grouped by category */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Detailed breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: getCategoryColor(cat as ModelCategory) }}
                />
                <span className="text-xs uppercase tracking-wider text-muted-foreground capitalize font-semibold">
                  {cat}
                </span>
                <Separator className="flex-1" />
                <span className="text-[10px] text-muted-foreground">
                  {list.length} {list.length === 1 ? "model" : "models"}
                </span>
              </div>
              <div className="space-y-1.5">
                {list.map((m) => {
                  const meta = getModelMeta(m.model_id);
                  return (
                    <div key={m.model_id} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/40 transition-colors">
                      <div className="text-base">{meta.emoji}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{meta.display}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {m.model_id}{meta.vendor ? ` · ${meta.vendor}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold tabular-nums">{m.uses}</div>
                        <div className="text-[10px] text-muted-foreground">runs</div>
                      </div>
                      <div className="text-right shrink-0 w-20">
                        <div className="text-sm font-semibold tabular-nums">
                          {m.total_credits.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-muted-foreground">credits</div>
                      </div>
                      <div className="text-right shrink-0 w-12">
                        <div className="text-xs tabular-nums text-muted-foreground">
                          {m.unique_users}
                        </div>
                        <div className="text-[10px] text-muted-foreground">users</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {models.length === 0 && (
            <div className="text-sm text-muted-foreground py-10 text-center">
              No model usage in the last 30 days.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Members panel (table + drill-down sheet)
// ─────────────────────────────────────────────────────────────────────

function getPrimaryStudentSpace(member: ClassMember): ClassStudentSpace | null {
  const spaces = member.spaces ?? [];
  return (
    spaces.find((space) => space.status === "active") ??
    spaces.find((space) => space.status === "submitted") ??
    spaces[0] ??
    null
  );
}

function MembersPanel({
  members,
  classId,
  currentPage,
  pageSize,
  totalStudents,
  hasMore,
  onPageChange,
}: {
  members: ClassMember[];
  classId: string;
  currentPage: number;
  pageSize: number;
  totalStudents: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
}) {
  const [selected, setSelected] = useState<ClassMember | null>(null);
  const startRow = totalStudents === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = totalStudents === 0 ? 0 : startRow + members.length - 1;

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Class roster
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                {totalStudents} students
              </span>
            </CardTitle>
            <Button size="sm" variant="outline">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Invite
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left font-medium px-4 py-2.5">Student</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-left font-medium px-4 py-2.5">Space</th>
                <th className="text-right font-medium px-4 py-2.5">Balance</th>
                <th className="text-right font-medium px-4 py-2.5">Used</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const space = getPrimaryStudentSpace(m);
                const cap = m.credits_lifetime_received || space?.credits_lifetime_received || 200;
                const percent = cap > 0 ? Math.min(Math.round((m.credits_balance / cap) * 100), 100) : 0;
                return (
                  <tr
                    key={m.user_id}
                    className="border-b border-border/40 hover:bg-accent/40 cursor-pointer"
                    onClick={() => setSelected(m)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={m.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[10px]">
                            {(m.display_name ?? "??").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {m.display_name ?? "Unnamed"}
                          </div>
                          <div className="max-w-[220px] truncate text-[11px] text-muted-foreground">
                            {m.email ?? "No email"}
                          </div>
                          <div className="max-w-[220px] truncate text-[11px] text-muted-foreground font-mono">
                            {m.student_code ? `ID ${m.student_code}` : `${m.user_id.slice(0, 8)}...`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={m.status === "active" ? "default" : "secondary"} className="text-[10px]">
                        {m.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {space ? (
                        <div className="space-y-1">
                          <Badge variant={space.status === "active" ? "outline" : "secondary"} className="text-[10px]">
                            {space.status}
                          </Badge>
                          <div className="max-w-[180px] truncate text-[11px] text-muted-foreground">
                            {space.workspace_name ?? space.workspace_id}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No class space</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-semibold tabular-nums">
                        {m.credits_balance}/{cap}
                      </div>
                      <Progress value={percent} className="h-1 mt-1 ml-auto w-20" />
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">
                      {m.credits_lifetime_used}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No students yet. Generate a QR code to invite the class.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>
            {totalStudents === 0
              ? "No students"
              : `Showing ${startRow}-${endRow} of ${totalStudents}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasMore}
              onClick={() => onPageChange(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Member detail drill-down */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <MemberDetail member={selected} classId={classId} />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function MemberDetail({ member, classId }: { member: ClassMember; classId: string }) {
  const { data: breakdown } = useMemberModelBreakdown(classId, member.user_id, 30);
  const queryClient = useQueryClient();
  const activeSpace = getPrimaryStudentSpace(member);
  const [creditAmount, setCreditAmount] = useState("250");
  const [creditReason, setCreditReason] = useState("");
  const cap = member.credits_lifetime_received || activeSpace?.credits_lifetime_received || 200;
  const percent = cap > 0 ? Math.min(Math.round((member.credits_balance / cap) * 100), 100) : 0;
  const refreshMemberData = () => {
    queryClient.invalidateQueries({ queryKey: ["class-members-detailed", classId] });
    queryClient.invalidateQueries({ queryKey: ["class-member-summary", classId] });
    queryClient.invalidateQueries({ queryKey: ["class-top-spenders", classId] });
    queryClient.invalidateQueries({ queryKey: ["teacher-classes"] });
    queryClient.invalidateQueries({ queryKey: ["class-activity", classId] });
  };
  const grantCredits = useMutation({
    mutationFn: async () => {
      const amount = parseInt(creditAmount, 10);
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("amount_must_be_positive");
      }
      if (activeSpace?.workspace_id) {
        return consumerOrgAdminApi.grantCredits(
          classId,
          member.user_id,
          activeSpace.workspace_id,
          amount,
          creditReason || "teacher_center_space_grant",
        );
      }
      return consumerOrgAdminApi.ensureStudentSpace(
        classId,
        member.user_id,
        amount,
        creditReason || "teacher_center_space_create_and_grant",
      );
    },
    onSuccess: () => {
      toast.success("Space credits updated");
      setCreditAmount("250");
      setCreditReason("");
      refreshMemberData();
    },
    onError: (error: any) => {
      toast.error(error?.message === "class_budget_exhausted"
        ? "Class credit pool is not enough"
        : error?.message ?? "Could not update credits");
    },
  });
  const setSpaceStatus = useMutation({
    mutationFn: async (status: "active" | "submitted" | "passed" | "ended") => {
      if (!activeSpace?.workspace_id) throw new Error("student_space_not_found");
      return consumerOrgAdminApi.setSpaceStatus(classId, activeSpace.workspace_id, status);
    },
    onSuccess: (_, status) => {
      toast.success(status === "passed" ? "Space marked as passed" : `Space status set to ${status}`);
      refreshMemberData();
    },
    onError: (error: any) => toast.error(error?.message ?? "Could not update space"),
  });

  return (
    <div className="space-y-5">
      <SheetHeader>
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={member.avatar_url ?? undefined} />
            <AvatarFallback>{(member.display_name ?? "??").slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div>
            <SheetTitle className="text-left">{member.display_name ?? "Unnamed"}</SheetTitle>
            <SheetDescription className="text-left">
              <span className="block text-xs text-muted-foreground">
                {member.email ?? "No email"}
              </span>
              <span className="block font-mono text-[11px] text-muted-foreground">
                {member.student_code ? `Student ID ${member.student_code}` : member.user_id}
              </span>
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      {/* Credit summary */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Class space</span>
            <Badge variant={activeSpace?.status === "active" ? "outline" : "secondary"} className="text-[10px]">
              {activeSpace?.status ?? "not created"}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Student ID</span>
            <span className="max-w-[220px] truncate font-mono text-xs">
              {member.student_code ?? "not set"}
            </span>
          </div>
          {activeSpace && (
            <div className="text-xs text-muted-foreground break-all">
              {activeSpace.workspace_name ?? activeSpace.workspace_id}
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Current balance</span>
            <span className="font-semibold tabular-nums">{member.credits_balance}/{cap}</span>
          </div>
          <Progress value={percent} className="h-1.5" />
          <div className="grid grid-cols-2 gap-3 pt-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Lifetime received</div>
              <div className="font-semibold tabular-nums">{member.credits_lifetime_received}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Lifetime used</div>
              <div className="font-semibold tabular-nums">{member.credits_lifetime_used}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Space management</CardTitle>
          <CardDescription>
            Credits apply only to this student's class space.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <div>
              <Label className="text-xs">Credits</Label>
              <Input
                type="number"
                min="1"
                value={creditAmount}
                onChange={(event) => setCreditAmount(event.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Reason</Label>
              <Input
                value={creditReason}
                onChange={(event) => setCreditReason(event.target.value)}
                placeholder="Manual class-space grant"
              />
            </div>
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={grantCredits.isPending}
            onClick={() => grantCredits.mutate()}
          >
            {grantCredits.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5 mr-1.5" />
            )}
            Add credits to space
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!activeSpace || setSpaceStatus.isPending}
              onClick={() => setSpaceStatus.mutate("passed")}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Mark passed
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!activeSpace || setSpaceStatus.isPending}
              onClick={() => setSpaceStatus.mutate("ended")}
            >
              <Ban className="h-3.5 w-3.5 mr-1.5" />
              End space
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-model breakdown */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Model usage (30 days)
        </div>
        {(breakdown ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">
            No model usage yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {(breakdown ?? []).map((m) => {
              const meta = getModelMeta(m.model_id);
              return (
                <div key={m.model_id} className="flex items-center gap-3 p-2 rounded-md border">
                  <div className="text-base">{meta.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{meta.display}</div>
                    <div className="text-[10px] text-muted-foreground">{m.uses} runs</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">{m.total_credits}</div>
                    <div className="text-[10px] text-muted-foreground">credits</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Activity panel (event feed)
// ─────────────────────────────────────────────────────────────────────

function CodesPanel({
  classId,
  creditPoolRemaining,
}: {
  classId: string;
  creditPoolRemaining: number;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [showQR, setShowQR] = useState<ClassEnrollmentCode | null>(null);
  const codesQuery = useQuery({
    queryKey: ["teacher-enrollment-codes", classId],
    enabled: !!classId,
    queryFn: () => consumerOrgAdminApi.listCodes(classId),
  });
  const revokeCode = useMutation({
    mutationFn: (codeId: string) => consumerOrgAdminApi.revokeCode(classId, codeId),
    onSuccess: () => {
      toast.success("QR code revoked");
      codesQuery.refetch();
    },
    onError: (error: any) => toast.error(error?.message ?? "Could not revoke code"),
  });
  const codes = codesQuery.data?.codes ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-4 w-4" />
            Enrollment QR codes
          </CardTitle>
          <CardDescription>
            Each scan creates a student class space and grants credits only to that space.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => codesQuery.refetch()} disabled={codesQuery.isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", codesQuery.isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New QR
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {codesQuery.isLoading ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : codes.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No active QR codes yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left font-medium px-4 py-2.5">Code</th>
                <th className="text-right font-medium px-4 py-2.5">Credits</th>
                <th className="text-right font-medium px-4 py-2.5">Uses</th>
                <th className="text-left font-medium px-4 py-2.5">Expires</th>
                <th className="text-left font-medium px-4 py-2.5">Description</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id} className="border-b border-border/40 hover:bg-accent/40">
                  <td className="px-4 py-3 font-mono">{code.code}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(code.credit_amount ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {code.uses_count}{code.max_uses ? ` / ${code.max_uses}` : " / unlimited"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {code.expires_at ? new Date(code.expires_at).toLocaleString() : "No expiry"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {code.description ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => setShowQR(code)}>
                      <QrCode className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={revokeCode.isPending}
                      onClick={() => revokeCode.mutate(code.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>

      <CreateCodeDialog
        open={createOpen}
        classId={classId}
        creditPoolRemaining={creditPoolRemaining}
        onOpenChange={setCreateOpen}
        onCreated={(code) => {
          setCreateOpen(false);
          codesQuery.refetch();
          setShowQR(code);
        }}
      />
      <QRDialog code={showQR} onClose={() => setShowQR(null)} />
    </Card>
  );
}

function CreateCodeDialog({
  open,
  classId,
  creditPoolRemaining,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  classId: string;
  creditPoolRemaining: number;
  onOpenChange: (open: boolean) => void;
  onCreated: (code: ClassEnrollmentCode) => void;
}) {
  const [creditAmount, setCreditAmount] = useState("250");
  const [maxUses, setMaxUses] = useState("");
  const [expiresMinutes, setExpiresMinutes] = useState("");
  const [description, setDescription] = useState("");
  const parsedCredits = Math.max(0, parseInt(creditAmount, 10) || 0);
  const tooMuch = parsedCredits > creditPoolRemaining;
  const createCode = useMutation({
    mutationFn: () => consumerOrgAdminApi.createCode(classId, {
      credit_amount: parsedCredits,
      max_uses: maxUses ? Math.max(1, parseInt(maxUses, 10) || 1) : null,
      expires_at: expiresMinutes
        ? new Date(Date.now() + (parseInt(expiresMinutes, 10) || 0) * 60_000).toISOString()
        : null,
      description: description || undefined,
    }),
    onSuccess: ({ code }) => {
      toast.success("QR code created");
      setCreditAmount("250");
      setMaxUses("");
      setExpiresMinutes("");
      setDescription("");
      onCreated(code);
    },
    onError: (error: any) => toast.error(error?.message ?? "Could not create QR code"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create enrollment QR</DialogTitle>
          <DialogDescription>
            Students receive these credits in a new class space after scanning.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Credits per student space</Label>
            <Input
              type="number"
              min="0"
              value={creditAmount}
              onChange={(event) => setCreditAmount(event.target.value)}
            />
            <div className={cn("mt-1 text-xs", tooMuch ? "text-destructive" : "text-muted-foreground")}>
              {creditPoolRemaining.toLocaleString()} credits remaining in this class pool.
            </div>
          </div>
          <div>
            <Label>Max scans</Label>
            <Input
              type="number"
              min="1"
              value={maxUses}
              onChange={(event) => setMaxUses(event.target.value)}
              placeholder="Blank = unlimited"
            />
          </div>
          <div>
            <Label>Expires after</Label>
            <select
              value={expiresMinutes}
              onChange={(event) => setExpiresMinutes(event.target.value)}
              className="flex h-9 w-full rounded-md bg-muted px-3 py-2 text-sm"
            >
              <option value="">No expiry</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="1440">1 day</option>
            </select>
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Week 1 class entry"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => createCode.mutate()} disabled={createCode.isPending || tooMuch}>
            {createCode.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Generate QR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QRDialog({ code, onClose }: { code: ClassEnrollmentCode | null; onClose: () => void }) {
  if (!code) return null;
  const url = `${window.location.origin}/enroll-class/${code.code}`;
  const copyLink = () => {
    navigator.clipboard.writeText(url);
    toast.success("Enrollment link copied");
  };

  return (
    <Dialog open={!!code} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project this QR for students</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{code.code}</span>
            {code.max_uses ? ` - ${Math.max(code.max_uses - code.uses_count, 0)} scans left` : " - unlimited"}
            {` - ${Number(code.credit_amount ?? 0).toLocaleString()} credits / space`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="rounded-lg bg-white p-4">
            <QRCodeSVG value={url} size={240} level="M" />
          </div>
          <p className="max-w-full break-all text-center text-xs text-muted-foreground">{url}</p>
          <Button size="sm" variant="outline" onClick={copyLink}>
            <Copy className="h-4 w-4 mr-2" />
            Copy link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActivityPanel({ events }: { events: import("./useTeacherData").ActivityEvent[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {events.length === 0 && (
          <div className="text-sm text-muted-foreground py-10 text-center">
            No activity yet.
          </div>
        )}
        {events.map((e) => {
          const meta = e.model_id ? getModelMeta(e.model_id) : null;
          return (
            <div key={e.id} className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-accent/40">
              <div className="text-base">{meta?.emoji ?? "📍"}</div>
              <div className="flex-1 min-w-0 text-sm">
                <span className="font-medium">{e.user_display_name ?? "User"}</span>
                <span className="text-muted-foreground"> · </span>
                <span>
                  {e.activity_type === "model_use" && meta && (
                    <>used <span className="font-medium">{meta.display}</span></>
                  )}
                  {e.activity_type === "enrollment" && "joined the class"}
                  {e.activity_type === "credits_granted" && (
                    <>received <span className="font-medium">{e.credits_used} credits</span></>
                  )}
                  {e.activity_type === "credits_revoked" && (
                    <>had <span className="font-medium">{e.credits_used} credits</span> revoked</>
                  )}
                </span>
              </div>
              {e.credits_used > 0 && e.activity_type === "model_use" && (
                <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                  -{e.credits_used} cr
                </div>
              )}
              <div className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-20 text-right">
                {formatRelative(e.created_at)}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}

// ─────────────────────────────────────────────────────────────────────
// Empty state (user has no classes)
// ─────────────────────────────────────────────────────────────────────

function EmptyState({ isOrgAdmin }: { isOrgAdmin: boolean }) {
  return (
    <div className="flex items-center justify-center min-h-screen p-10">
      <div className="text-center max-w-md">
        <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
        <h2 className="text-xl font-semibold mb-2">No classes yet</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {isOrgAdmin
            ? "Create the first class for your organization to start managing students and credits."
            : "You're not assigned to any classes yet. Ask an org admin to add you, or wait for an enrollment QR code."}
        </p>
        {isOrgAdmin && (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create first class
          </Button>
        )}
      </div>
    </div>
  );
}
