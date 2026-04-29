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

import { useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsOrgAdmin } from "@/hooks/useIsOrgUser";
import {
  useManageableClasses,
  useClassMembers,
  useClassModelUsage,
  useClassActivity,
  useClassDailyUsage,
  useMemberModelBreakdown,
  type TeacherClass,
  type ClassMember,
} from "./useTeacherData";
import { getModelMeta, getCategoryColor } from "./modelMeta";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

import {
  Users, Coins, Activity, AlertCircle, ChevronRight, Crown,
  GraduationCap, BookOpen, Sparkles, ArrowLeft,
  PlayCircle, QrCode, BarChart3, Plus, RefreshCw,
} from "lucide-react";

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
  const { data: members } = useClassMembers(classId);
  const { data: modelUsage } = useClassModelUsage(classId, 30);
  const { data: dailyUsage } = useClassDailyUsage(classId, 7);
  const { data: activity } = useClassActivity(classId, 30);

  const totalCredits = cls ? cls.credit_pool : 0;
  const usedCredits = cls ? cls.credit_pool_consumed : 0;
  const remaining = Math.max(totalCredits - usedCredits, 0);
  const usedPercent = totalCredits > 0 ? Math.round((usedCredits / totalCredits) * 100) : 0;

  const studentCount = (members ?? []).length;
  const usageThisMonth = (modelUsage ?? []).reduce((sum, m) => sum + m.total_credits, 0);
  const totalRuns = (modelUsage ?? []).reduce((sum, m) => sum + m.uses, 0);
  const distinctModels = (modelUsage ?? []).length;

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
            <TopSpendersCard members={members ?? []} />
          </div>

          {/* Insights */}
          <InsightsCard
            models={modelUsage ?? []}
            members={members ?? []}
            totalCredits={totalCredits}
            usedCredits={usedCredits}
          />
        </TabsContent>

        <TabsContent value="members" className="flex-1 m-0 p-7">
          <MembersPanel members={members ?? []} classId={classId} />
        </TabsContent>

        <TabsContent value="ai" className="flex-1 m-0 p-7">
          <AIUsagePanel models={modelUsage ?? []} totalRuns={totalRuns} totalCredits={usageThisMonth} />
        </TabsContent>

        <TabsContent value="codes" className="flex-1 m-0 p-7">
          <Card>
            <CardContent className="p-10 text-center">
              <QrCode className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <div className="text-sm text-muted-foreground">
                QR Code management coming soon — for the demo, use the existing org-admin panel.
              </div>
            </CardContent>
          </Card>
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
  members: ClassMember[];
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
  const inactive = props.members.filter(
    (m) => m.status === "active" && m.credits_lifetime_used === 0,
  );
  if (inactive.length > 0) {
    insights.push({
      tone: "warn",
      text: `🔔 มี ${inactive.length} คนที่ยังไม่เคยใช้เครดิต — ส่ง notification เตือน?`,
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
                  style={{ backgroundColor: getCategoryColor(cat as any) }}
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

function MembersPanel({
  members, classId,
}: {
  members: ClassMember[];
  classId: string;
}) {
  const [selected, setSelected] = useState<ClassMember | null>(null);

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Class roster
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                {members.length} students
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
                <th className="text-right font-medium px-4 py-2.5">Balance</th>
                <th className="text-right font-medium px-4 py-2.5">Used</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const cap = m.credits_lifetime_received || 200;
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
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {m.user_id.slice(0, 8)}…
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={m.status === "active" ? "default" : "secondary"} className="text-[10px]">
                        {m.status}
                      </Badge>
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
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No students yet. Generate a QR code to invite the class.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
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
  const cap = member.credits_lifetime_received || 200;
  const percent = cap > 0 ? Math.min(Math.round((member.credits_balance / cap) * 100), 100) : 0;

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
            <SheetDescription className="text-left font-mono text-[11px]">
              {member.user_id}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      {/* Credit summary */}
      <Card>
        <CardContent className="p-4 space-y-2">
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

      <div className="flex gap-2 pt-3">
        <Button size="sm" className="flex-1">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Grant credits
        </Button>
        <Button size="sm" variant="outline">
          Suspend
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Activity panel (event feed)
// ─────────────────────────────────────────────────────────────────────

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
