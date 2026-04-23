import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, DollarSign, CreditCard, Users, Activity, Flame, Play } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";

/* ─── Metric Card ─── */
const MetricCard = ({
  label, value, sub, icon: Icon, accent = "primary",
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent?: string;
}) => (
  <div className="rounded-2xl border border-border bg-card p-5 flex flex-col justify-between gap-3">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{label}</span>
      <div className={`w-8 h-8 rounded-lg bg-${accent}/10 flex items-center justify-center`}>
        <Icon className={`w-4 h-4 text-${accent}`} />
      </div>
    </div>
    <div>
      <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  </div>
);

/* ─── Custom Tooltip ─── */
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-xl">
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs font-semibold text-foreground">
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
};

/* ─── Data Fetchers ─── */
const fetchRevenueStats = async () => {
  const { data, error } = await supabase
    .from("payment_transactions")
    .select("amount_thb, credits_added, created_at, status")
    .eq("status", "completed");
  if (error) throw error;

  let totalRevenue = 0;
  let totalCredits = 0;
  const monthlyMap: Record<string, { revenue: number; credits: number }> = {};

  (data || []).forEach((t) => {
    totalRevenue += Number(t.amount_thb);
    totalCredits += t.credits_added;
    const month = t.created_at.slice(0, 7); // YYYY-MM
    if (!monthlyMap[month]) monthlyMap[month] = { revenue: 0, credits: 0 };
    monthlyMap[month].revenue += Number(t.amount_thb);
    monthlyMap[month].credits += t.credits_added;
  });

  const monthlyChart = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, d]) => ({ month, revenue: d.revenue, credits: d.credits }));

  return { totalRevenue, totalCredits, monthlyChart };
};

const fetchUserActivity = async () => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data, error } = await supabase
    .from("flow_runs")
    .select("user_id, started_at")
    .gte("started_at", sevenDaysAgo);
  if (error) throw error;

  const dailyMap: Record<string, Set<string>> = {};
  const allUsers = new Set<string>();

  (data || []).forEach((e) => {
    const day = e.started_at.slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = new Set();
    dailyMap[day].add(e.user_id);
    allUsers.add(e.user_id);
  });

  const today = new Date().toISOString().slice(0, 10);
  const dau = dailyMap[today]?.size || 0;
  const mau = allUsers.size; // approximate from 7-day window

  const dailyChart = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, users]) => ({
      date: new Date(date).toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
      users: users.size,
    }));

  return { dau, mau, dailyChart };
};

const fetchCreditBurn = async () => {
  const { data: runs, error: runsErr } = await supabase
    .from("flow_runs")
    .select("id, credits_used, status");
  if (runsErr) throw runsErr;

  const totalRuns = runs?.length || 0;
  const successRuns = runs?.filter((r) => r.status === "completed").length || 0;

  const { data: txns, error: txnErr } = await supabase
    .from("credit_transactions")
    .select("amount, created_at")
    .eq("type", "usage");
  if (txnErr) throw txnErr;

  let totalBurned = 0;
  const burnMap: Record<string, number> = {};

  (txns || []).forEach((t) => {
    totalBurned += Math.abs(t.amount);
    const day = t.created_at.slice(0, 10);
    burnMap[day] = (burnMap[day] || 0) + Math.abs(t.amount);
  });

  const burnChart = Object.entries(burnMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, credits]) => ({
      date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      credits,
    }));

  return { totalRuns, successRuns, totalBurned, burnChart };
};

/* ─── Main Dashboard ─── */
export default function AdminDashboard() {
  const { t } = useLanguage();
  const revenue = useQuery({ queryKey: ["admin-revenue"], queryFn: fetchRevenueStats, staleTime: 60_000 });
  const activity = useQuery({ queryKey: ["admin-activity"], queryFn: fetchUserActivity, staleTime: 60_000 });
  const credits = useQuery({ queryKey: ["admin-credits"], queryFn: fetchCreditBurn, staleTime: 60_000 });

  const isLoading = revenue.isLoading || activity.isLoading || credits.isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const r = revenue.data;
  const a = activity.data;
  const c = credits.data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{t("adminBusinessAnalytics")}</h1>
        <p className="text-sm text-muted-foreground">{t("adminPlatformOverview")}</p>
      </div>

      {/* ── Top Metric Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricCard label={t("adminRevenue")} value={`฿${(r?.totalRevenue || 0).toLocaleString()}`} icon={DollarSign} accent="primary" />
        <MetricCard label={t("adminCreditsSold")} value={(r?.totalCredits || 0).toLocaleString()} icon={CreditCard} accent="primary" />
        <MetricCard label={t("adminDauToday")} value={(a?.dau || 0).toString()} icon={Users} accent="accent" />
        <MetricCard label={t("adminWau7d")} value={(a?.mau || 0).toString()} icon={Activity} accent="accent" />
        <MetricCard label={t("adminTotalRuns")} value={(c?.totalRuns || 0).toLocaleString()} icon={Play} accent="primary" />
        <MetricCard label={t("adminCreditsBurned")} value={(c?.totalBurned || 0).toLocaleString()} icon={Flame} accent="destructive" />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">{t("adminMonthlyRevenue")}</h2>
          <p className="text-[11px] text-muted-foreground mb-4">{t("adminLast6Months")}</p>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r?.monthlyChart || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="revenue" name="Revenue (฿)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* DAU Chart */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">{t("adminDailyActiveUsers")}</h2>
          <p className="text-[11px] text-muted-foreground mb-4">{t("adminLast7Days")}</p>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={a?.dailyChart || []}>
                <defs>
                  <linearGradient id="dauGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="users" name="Users" stroke="hsl(var(--accent))" fill="url(#dauGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Credit Burn Chart */}
        <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground mb-1">{t("adminCreditBurnRate")}</h2>
          <p className="text-[11px] text-muted-foreground mb-4">{t("adminCreditBurnDesc")}</p>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={c?.burnChart || []}>
                <defs>
                  <linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="credits" name="Credits Burned" stroke="hsl(var(--destructive))" fill="url(#burnGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Quick Stats Footer ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card/50 p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t("adminSuccessRate")}</p>
          <p className="text-lg font-bold text-foreground">
            {c?.totalRuns ? `${Math.round((c.successRuns / c.totalRuns) * 100)}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t("adminAvgCreditsPerRun")}</p>
          <p className="text-lg font-bold text-foreground">
            {c?.totalRuns ? Math.round(c.totalBurned / c.totalRuns).toLocaleString() : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t("adminAvgRevenuePerUser")}</p>
          <p className="text-lg font-bold text-foreground">
            {a?.mau && r?.totalRevenue ? `฿${Math.round(r.totalRevenue / a.mau).toLocaleString()}` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t("adminCompletedRuns")}</p>
          <p className="text-lg font-bold text-foreground">{(c?.successRuns || 0).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
