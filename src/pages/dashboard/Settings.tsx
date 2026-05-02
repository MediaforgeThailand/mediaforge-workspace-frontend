import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Camera,
  Save,
  Loader2,
  Globe,
  Download,
  Bookmark,
  UserPlus,
  Users,
  Activity,
  Building2,
  Clock3,
  ExternalLink,
  KeyRound,
  CreditCard,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import SettingsLayout, { type SettingsSectionKey } from "@/components/settings/SettingsLayout";
import ComingSoon from "@/components/settings/ComingSoon";
import PlanBilling from "@/components/settings/PlanBilling";
import { DeleteAccountDialog } from "@/components/settings/DeleteAccountDialog";
import useDocumentTitle from "@/hooks/useDocumentTitle";

/**
 * Settings — multi-section surface backed by an in-page state-driven
 * left rail. Routes other than `/app/settings` are not introduced;
 * `?tab=plan-billing` is honoured as a deep-link from external CTAs
 * (e.g. UserMenu's Plan & billing link, "Buy credits" upsells).
 *
 * Sections live in `src/components/settings/`:
 *   - Profile           — display name + company + avatar (existing)
 *   - Stock downloads / collections / Following — placeholders
 *   - My Team / People / Security SSO            — placeholders
 *   - Preferences       — language toggle (existing)
 *   - Plan & billing    — NEW (subscriptions, credits, payments)
 *
 * The previous "Usage" tab is gone from the rail (it lives at
 * /app/usage as its own route, surfaced from the workspace sidebar).
 */

const Settings = () => {
  useDocumentTitle("Settings — MediaForge");
  const { profile, user, refreshProfile } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  // Honour `?tab=…` for deep-linking. Map URL slug → SettingsSectionKey.
  const tabParam = new URLSearchParams(location.search).get("tab");
  const initialKey: SettingsSectionKey =
    tabParam === "plan-billing"
      ? "organization.plan-billing"
      : tabParam === "team"
      ? "organization.my-team"
      : tabParam === "preferences"
      ? "organization.preferences"
      : "account.profile";

  const [activeKey, setActiveKey] = useState<SettingsSectionKey>(initialKey);

  // ── Profile-tab state (untouched from the previous Settings.tsx) ──
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [company, setCompany] = useState(profile?.company || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [uploading, setUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, company, avatar_url: avatarUrl })
      .eq("user_id", user.id);
    if (error) {
      toast({ title: t("genericError"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: `✅ ${t("saved")}`, description: t("profileUpdated") });
      await refreshProfile();
    }
    setSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from("user_assets").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: t("uploadFailed"), description: error.message, variant: "destructive" });
    } else {
      const { data: urlData } = supabase.storage.from("user_assets").getPublicUrl(path);
      setAvatarUrl(urlData.publicUrl);
    }
    setUploading(false);
  };

  const getPlanBadge = () => {
    if ((profile as { plan_name?: string | null } | null)?.plan_name) {
      return (
        <Badge className="bg-primary/20 text-primary border-primary/30">
          {(profile as { plan_name?: string }).plan_name}
        </Badge>
      );
    }
    if (profile?.subscription_status && profile.subscription_status !== "free") {
      return (
        <Badge className="bg-primary/20 text-primary border-primary/30">
          {profile.subscription_status === "agency" ? t("planAgency") : t("planPro")}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("planFree")}
      </Badge>
    );
  };

  const toggleLanguage = () => setLanguage(language === "en" ? "th" : "en");

  // ── Section dispatch ────────────────────────────────────────
  const renderProfile = () => (
    <div className="max-w-4xl space-y-[24px]">
      <div>
        <h2 className="text-[23px] font-semibold leading-[28px] text-zinc-50">{t("profile")}</h2>
      </div>

      <div className="space-y-[8px]">
        <Label className="text-[14px] font-medium leading-[18px] text-zinc-100">{t("Avatar")}</Label>
        <div className="relative group h-[56px] w-[56px]">
          <Avatar className="h-[56px] w-[56px] border border-white/10">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="bg-primary/20 text-primary text-[23px]">
              {displayName?.charAt(0)?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
            {uploading ? <Loader2 className="h-[16px] w-[16px] animate-spin text-white" /> : <Camera className="h-[16px] w-[16px] text-white" />}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </label>
        </div>
      </div>

      <div className="max-w-[330px] space-y-[6px]">
        <Label htmlFor="displayName" className="text-[14px] font-medium leading-[18px] text-zinc-100">{t("displayName")}</Label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("displayName")}
          className="h-[36px] rounded-md border-white/10 bg-black/30 px-[12px] text-[14px] text-zinc-100"
        />
      </div>

      <div className="max-w-[330px] space-y-[6px]">
        <Label htmlFor="company" className="text-[14px] font-medium leading-[18px] text-zinc-100">{t("company")}</Label>
        <Input
          id="company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder={t("companyPlaceholder")}
          className="h-[36px] rounded-md border-white/10 bg-black/30 px-[12px] text-[14px] text-zinc-100"
        />
      </div>

      <div className="space-y-[6px]">
        <Label className="text-[14px] font-medium leading-[18px] text-zinc-100">{t("authEmailLabel")}</Label>
        <p className="text-[14px] leading-[20px] text-zinc-200">{user?.email}</p>
      </div>

      <Separator className="bg-white/5" />

      <div className="space-y-[8px]">
        <div className="flex items-center gap-[12px]">
          <span className="text-[14px] leading-[20px] text-zinc-200">{t("currentPlan")}</span>
          {getPlanBadge()}
        </div>
        {profile?.current_period_end && profile?.subscription_status !== "free" && (
          <div className="flex items-center gap-2 text-[15px] leading-6">
            <span className="text-zinc-500">{t("expires")}:</span>
            <span
              className={cn(
                "font-medium",
                new Date(profile.current_period_end) < new Date()
                  ? "text-red-400"
                  : new Date(profile.current_period_end) <
                    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                  ? "text-amber-400"
                  : "text-zinc-200",
              )}
            >
              {new Date(profile.current_period_end).toLocaleDateString(t("switchLang"), {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              {new Date(profile.current_period_end) < new Date() && (
                <span className="ml-1.5 text-[13px]">({t("expired")})</span>
              )}
            </span>
          </div>
        )}
      </div>

      <Button onClick={handleSave} disabled={saving} className="h-[36px] px-[14px] text-[14px]">
        {saving ? <Loader2 className="mr-[6px] h-[14px] w-[14px] animate-spin" /> : <Save className="mr-[6px] h-[14px] w-[14px]" />}
        {t("saveChanges")}
      </Button>

      {/* ── Danger Zone ─────────────────────────────────────────
       * PDPA right-of-erasure surface. The audit found we promise
       * "request deletion of your data" in Privacy Policy but had
       * no actual UI — non-compliance the moment any user files
       * a request. This block is the user-facing entry point. */}
      <Separator className="bg-white/5" />
      <div className="max-w-xl rounded-lg border border-red-500/20 bg-red-500/[0.04] p-[16px]">
        <h3 className="text-[15px] font-semibold leading-[20px] text-red-200">
          {language === "th" ? "พื้นที่อันตราย" : "Danger zone"}
        </h3>
        <p className="mt-1.5 text-[14px] leading-[22px] text-zinc-300">
          {language === "th"
            ? "การลบบัญชีจะเอาข้อมูล โปรเจค ผลงาน เครดิต และประวัติการชำระทั้งหมดออกถาวร — กู้คืนไม่ได้"
            : "Deleting your account permanently removes all data, projects, generations, credits, and billing history — this cannot be undone."}
        </p>
        <button
          type="button"
          onClick={() => setDeleteDialogOpen(true)}
          className="mt-[12px] inline-flex h-[36px] items-center gap-[6px] rounded-md border border-red-500/30 bg-red-500/10 px-[12px] text-[14px] font-medium text-red-200 transition-colors hover:bg-red-500/20"
        >
          {language === "th" ? "ลบบัญชีถาวร" : "Delete account"}
        </button>
      </div>
    </div>
  );

  const renderPreferences = () => (
    <div className="max-w-2xl space-y-[20px]">
      <h2 className="text-[23px] font-semibold leading-[28px] text-zinc-50">{t("workspace.settings.preferences")}</h2>
      <div className="max-w-lg space-y-[4px]">
        <div className="flex items-center justify-between py-[8px]">
          <span className="flex items-center gap-[8px] text-[14px] leading-[20px] text-zinc-100">
            <Globe className="h-[16px] w-[16px] text-zinc-500" />
            {t("language")}
          </span>
          <button
            onClick={toggleLanguage}
            className="rounded-md bg-white/[0.05] px-[12px] py-[6px] text-[14px] font-medium text-zinc-200 transition-colors hover:text-zinc-100"
          >
            {language === "en" ? "EN → TH" : "TH → EN"}
          </button>
        </div>
      </div>
    </div>
  );

  const renderTeamSettings = () => (
    <TeamSettingsPanel
      onRegister={() => navigate("/app/team-register")}
    />
  );

  const renderActiveSection = () => {
    switch (activeKey) {
      case "account.profile":
        return renderProfile();
      case "account.stock-downloads":
        return (
          <ComingSoon
            icon={Download}
            title={t("workspace.settings.stock_downloads")}
            description={t("workspace.settings.stock_downloads_desc")}
          />
        );
      case "account.stock-collections":
        return (
          <ComingSoon
            icon={Bookmark}
            title={t("workspace.settings.stock_collections")}
            description={t("workspace.settings.stock_collections_desc")}
          />
        );
      case "account.following":
        return (
          <ComingSoon
            icon={UserPlus}
            title={t("workspace.settings.following")}
            description={t("workspace.settings.following_desc")}
          />
        );
      case "organization.my-team":
        return renderTeamSettings();
      case "organization.people":
        return (
          <ComingSoon
            icon={Users}
            title={t("workspace.settings.people")}
            description={t("workspace.settings.people_desc")}
          />
        );
      case "organization.security-sso":
        return (
          <ComingSoon
            icon={KeyRound}
            title={t("workspace.settings.security_sso")}
            description={t("workspace.settings.security_sso_desc")}
          />
        );
      case "organization.preferences":
        return renderPreferences();
      case "organization.plan-billing":
        return <PlanBilling />;
      default:
        return null;
    }
  };

  return (
    <>
      <SettingsLayout activeKey={activeKey} onChange={setActiveKey}>
        {renderActiveSection()}
      </SettingsLayout>
      {/* Mounted at the page level so Profile section's button can
       *  trigger it; keeps the dialog DOM out of the section render
       *  function which gets recreated on every state change. */}
      <DeleteAccountDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
};

interface TeamStatusMembership {
  id: string;
  organization_id: string;
  team_id?: string | null;
  role: "org_admin" | "member";
  status: "active" | "pending" | "invited" | "rejected" | "suspended";
  source: string | null;
  organization?: {
    id: string;
    name: string;
    display_name: string | null;
    type: string;
    status: string;
    credit_pool: number;
    credit_pool_allocated: number;
    credit_available?: number;
  } | null;
  team?: {
    id: string;
    name: string;
    code: string | null;
    status: string;
    credit_pool: number;
    credit_pool_consumed: number;
    credit_available?: number;
  } | null;
}

interface TeamConsoleOverview {
  organization?: TeamStatusMembership["organization"] & {
    slug?: string | null;
    type?: string | null;
    created_at?: string | null;
  };
  members?: Array<TeamStatusMembership & {
    user_id: string;
    email?: string | null;
    display_name?: string | null;
    last_active_at?: string | null;
    last_sign_in_at?: string | null;
    last_activity_type?: string | null;
  }>;
  teams?: Array<NonNullable<TeamStatusMembership["team"]> & {
    member_count?: number;
    credit_policy?: string | null;
    credit_amount?: number | null;
    created_at?: string | null;
  }>;
  payments?: Array<{
    id: string;
    user_id?: string | null;
    email?: string | null;
    display_name?: string | null;
    amount_thb?: number | null;
    credits_added?: number | null;
    status?: string | null;
    payment_method?: string | null;
    created_at?: string | null;
  }>;
  generations?: Array<{
    id: string;
    user_id?: string | null;
    class_id?: string | null;
    email?: string | null;
    display_name?: string | null;
    feature?: string | null;
    model?: string | null;
    provider?: string | null;
    credits_spent?: number | null;
    status?: string | null;
    created_at?: string | null;
  }>;
  pool_transactions?: Array<{
    id: string;
    user_id?: string | null;
    class_id?: string | null;
    organization_id?: string | null;
    triggered_by?: string | null;
    actor_email?: string | null;
    actor_display_name?: string | null;
    amount?: number | null;
    reason?: string | null;
    description?: string | null;
    created_at?: string | null;
  }>;
  usage_summary?: {
    payment_count?: number;
    topup_amount_thb_total?: number;
    topup_credits_total?: number;
    generation_count?: number;
    generation_count_30d?: number;
    generation_credits_total?: number;
    generation_credits_30d?: number;
  };
  seat_price_usd?: number;
}

async function functionErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : String(error || "Request failed");
  const response = (error as { context?: Response } | null)?.context;
  if (!response || typeof response.clone !== "function") return fallback;
  try {
    const body = (await response.clone().json()) as { error?: unknown; message?: unknown };
    return String(body?.error || body?.message || fallback);
  } catch {
    return fallback;
  }
}

function TeamSettingsPanel({ onRegister }: { onRegister: () => void }) {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<TeamStatusMembership[]>([]);
  const [overview, setOverview] = useState<TeamConsoleOverview | null>(null);
  const [canOpenConsole, setCanOpenConsole] = useState(false);
  const [openingConsole, setOpeningConsole] = useState(false);
  const adminConsoleUrl =
    (import.meta.env.VITE_ADMIN_CONSOLE_URL as string | undefined) ||
    "https://mediaforge-admin-hub.vercel.app/org/console";

  const loadStatus = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("workspace_org_console", {
      body: { action: "get_team_status" },
    });
    if (error) {
      const description = await functionErrorMessage(error);
      toast({
        title: "Could not load team status",
        description,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }
    await refreshProfile();
    const payload = (data?.data ?? data) as {
      memberships?: TeamStatusMembership[];
      can_open_admin_console?: boolean;
    };
    setMemberships(payload.memberships ?? []);
    setCanOpenConsole(Boolean(payload.can_open_admin_console));
    if (payload.can_open_admin_console) {
      const { data: overviewData, error: overviewError } = await supabase.functions.invoke("workspace_org_console", {
        body: { action: "get_console_overview" },
      });
      if (overviewError) {
        const description = await functionErrorMessage(overviewError);
        toast({
          title: "Could not load team dashboard",
          description,
          variant: "destructive",
        });
        setOverview(null);
      } else {
        setOverview((overviewData?.data ?? overviewData) as TeamConsoleOverview);
      }
    } else {
      setOverview(null);
    }
    setLoading(false);
  };

  const openAdminConsole = async () => {
    if (!user) return;
    setOpeningConsole(true);
    const { data, error } = await supabase.functions.invoke("workspace_org_console", {
      body: {
        action: "create_console_login_link",
        redirect_to: adminConsoleUrl,
      },
    });
    if (error) {
      const description = await functionErrorMessage(error);
      toast({
        title: "Could not open Admin Console",
        description,
        variant: "destructive",
      });
      setOpeningConsole(false);
      return;
    }
    const payload = (data?.data ?? data) as { url?: string };
    if (!payload?.url) {
      toast({
        title: "Could not open Admin Console",
        description: "The sign-in handoff did not return a redirect URL.",
        variant: "destructive",
      });
      setOpeningConsole(false);
      return;
    }
    window.location.assign(payload.url);
  };

  useEffect(() => {
    void loadStatus();
  }, [user?.id]);

  const active = memberships.find((m) => m.status === "active");
  const pending = memberships.find((m) => m.status === "pending" || m.status === "invited");
  const formatCredits = (value: unknown) => new Intl.NumberFormat("en-US").format(Number(value ?? 0));
  const formatDateTime = (value?: string | null) => {
    if (!value) return "No activity yet";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "No activity yet";
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };
  const formatRelative = (value?: string | null) => {
    if (!value) return "never";
    const then = new Date(value).getTime();
    if (!Number.isFinite(then)) return "never";
    const diff = Date.now() - then;
    const minutes = Math.max(0, Math.floor(diff / 60000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };
  const onlineWindowMs = 10 * 60 * 1000;
  const teamById = new Map((overview?.teams ?? []).map((team) => [team.id, team]));
  const orgName = overview?.organization?.display_name || overview?.organization?.name || active?.organization?.display_name || active?.organization?.name || "your organization";
  const members = overview?.members ?? [];
  const teams = overview?.teams ?? [];
  const activeMembers = members.filter((member) => member.status === "active");
  const onlineMembers = activeMembers.filter((member) => {
    const t = new Date(member.last_active_at ?? member.last_sign_in_at ?? "").getTime();
    return Number.isFinite(t) && Date.now() - t <= onlineWindowMs;
  });
  const organizationCredits = overview?.organization?.credit_available ?? active?.organization?.credit_available ?? active?.organization?.credit_pool ?? 0;
  const generationCredits30d = overview?.usage_summary?.generation_credits_30d ?? 0;
  const allocationTransactions = (overview?.pool_transactions ?? [])
    .filter((tx) => ["class_pool_allocation", "class_pool_revoked", "org_pool_allocation", "org_pool_revoked", "org_pool_topup"].includes(String(tx.reason ?? "")))
    .slice(0, 8);

  if (loading) {
    return (
      <div className="flex min-h-[256px] items-center justify-center">
        <Loader2 className="h-[20px] w-[20px] animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!active && pending) {
    return (
      <div className="max-w-2xl rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-[20px]">
        <h2 className="text-[20px] font-semibold leading-[26px] text-zinc-50">Team request pending</h2>
        <p className="mt-[8px] text-[14px] leading-[22px] text-zinc-400">
          Your company domain matched an organization, but an admin needs to approve your access before you can use the team dashboard or shared credit pool.
        </p>
        <div className="mt-[16px] rounded-lg border border-white/10 bg-black/20 p-[12px] text-[14px] leading-[20px]">
          <div className="text-zinc-500">Organization</div>
          <div className="font-medium text-zinc-100">
            {pending.organization?.display_name || pending.organization?.name || pending.organization_id}
          </div>
        </div>
      </div>
    );
  }

  if (!active) {
    return (
      <div className="max-w-2xl rounded-lg border border-white/10 bg-white/[0.03] p-[20px]">
        <h2 className="text-[20px] font-semibold leading-[26px] text-zinc-50">Create a team workspace</h2>
        <p className="mt-[8px] text-[14px] leading-[22px] text-zinc-400">
          Team accounts include a company Admin Console, member approvals, shared team credits, and seat billing at $5 per active seat. Credits are topped up separately based on real usage.
        </p>
        <Button className="mt-[20px] h-[36px] px-[14px] text-[14px]" onClick={onRegister}>
          <Users className="mr-[8px] h-[16px] w-[16px]" />
          Start team registration
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1480px] space-y-[22px] pr-[24px]">
      <div className="flex flex-col gap-[12px] lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Team dashboard</p>
          <h2 className="mt-[6px] text-[27px] font-semibold leading-[34px] text-zinc-50">{orgName}</h2>
          <p className="mt-[8px] text-[16px] leading-[24px] text-zinc-300">
            Shared credits, team pools, member presence, and recent credit movements for this organization.
          </p>
        </div>
        {canOpenConsole ? (
          <Button className="h-[40px] w-fit px-[15px] text-[14px]" onClick={openAdminConsole} disabled={openingConsole}>
            {openingConsole ? (
              <Loader2 className="mr-[8px] h-[16px] w-[16px] animate-spin" />
            ) : (
              <ExternalLink className="mr-[8px] h-[16px] w-[16px]" />
            )}
            Open Admin Console
          </Button>
        ) : null}
      </div>

      <div className="grid gap-[14px] md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-[16px]">
          <div className="flex items-center gap-[8px] text-[14px] font-medium leading-[18px] text-zinc-200">
            <Wallet className="h-[17px] w-[17px] text-sky-300" />
            Shared credits
          </div>
          <div className="mt-[10px] text-[27px] font-semibold leading-[34px] text-zinc-50">
            {formatCredits(organizationCredits)}
          </div>
          <div className="mt-[6px] text-[14px] leading-[19px] text-zinc-300">Available in organization pool</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-[16px]">
          <div className="flex items-center gap-[8px] text-[14px] font-medium leading-[18px] text-zinc-200">
            <Building2 className="h-[17px] w-[17px] text-violet-300" />
            Teams
          </div>
          <div className="mt-[10px] text-[27px] font-semibold leading-[34px] text-zinc-50">
            {formatCredits(Math.max(1, teams.length || (active.team ? 1 : 0)))}
          </div>
          <div className="mt-[6px] text-[14px] leading-[19px] text-zinc-300">Includes the company pool</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-[16px]">
          <div className="flex items-center gap-[8px] text-[14px] font-medium leading-[18px] text-zinc-200">
            <Activity className="h-[17px] w-[17px] text-emerald-300" />
            Online now
          </div>
          <div className="mt-[10px] text-[27px] font-semibold leading-[34px] text-zinc-50">
            {formatCredits(onlineMembers.length)}
          </div>
          <div className="mt-[6px] text-[14px] leading-[19px] text-zinc-300">{formatCredits(activeMembers.length)} active seats</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-[16px]">
          <div className="flex items-center gap-[8px] text-[14px] font-medium leading-[18px] text-zinc-200">
            <ReceiptText className="h-[17px] w-[17px] text-amber-300" />
            Credits used 30d
          </div>
          <div className="mt-[10px] text-[27px] font-semibold leading-[34px] text-zinc-50">
            {formatCredits(generationCredits30d)}
          </div>
          <div className="mt-[6px] text-[14px] leading-[19px] text-zinc-300">
            {formatCredits(overview?.usage_summary?.generation_count_30d ?? 0)} generations
          </div>
        </div>
      </div>

      {overview ? (
        <>
          <section className="space-y-[12px]">
            <div className="flex items-center justify-between">
              <h3 className="text-[18px] font-semibold leading-[24px] text-zinc-50">Teams and credit pools</h3>
              <p className="text-[14px] leading-[20px] text-zinc-500">Organization: {orgName}</p>
            </div>
            <div className="grid gap-[14px] lg:grid-cols-2 2xl:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-[16px]">
                <div className="flex items-start justify-between gap-[12px]">
                  <div>
                    <h4 className="text-[17px] font-semibold leading-[23px] text-zinc-50">Company pool</h4>
                    <p className="mt-[4px] text-[14px] leading-[20px] text-zinc-400">{orgName}</p>
                  </div>
                  <Badge className="bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/15">active</Badge>
                </div>
                <div className="mt-[16px] grid grid-cols-2 gap-[10px]">
                  <div className="rounded-md bg-black/25 p-[10px]">
                    <div className="text-[12.5px] text-zinc-500">Available</div>
                    <div className="mt-[4px] text-[18px] font-semibold text-zinc-50">{formatCredits(overview.organization?.credit_available ?? 0)}</div>
                  </div>
                  <div className="rounded-md bg-black/25 p-[10px]">
                    <div className="text-[12.5px] text-zinc-500">Allocated</div>
                    <div className="mt-[4px] text-[18px] font-semibold text-zinc-50">{formatCredits(overview.organization?.credit_pool_allocated ?? 0)}</div>
                  </div>
                </div>
              </div>
              {teams.map((team) => {
                const pool = Number(team.credit_pool ?? 0);
                const used = Number(team.credit_pool_consumed ?? 0);
                const percent = pool > 0 ? Math.min(100, Math.round((used / pool) * 100)) : 0;
                return (
                  <div key={team.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-[16px]">
                    <div className="flex items-start justify-between gap-[12px]">
                      <div>
                        <h4 className="text-[17px] font-semibold leading-[23px] text-zinc-50">{team.name}</h4>
                        <p className="mt-[4px] text-[14px] leading-[20px] text-zinc-400">{team.code || orgName}</p>
                      </div>
                      <Badge className="bg-zinc-800 text-zinc-200 hover:bg-zinc-800">{team.status}</Badge>
                    </div>
                    <div className="mt-[16px] h-[8px] overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full rounded-full bg-sky-400" style={{ width: `${percent}%` }} />
                    </div>
                    <div className="mt-[10px] flex flex-wrap items-center justify-between gap-[8px] text-[13.5px] leading-[18px] text-zinc-300">
                      <span>{formatCredits(used)} used / {formatCredits(pool)}</span>
                      <span>{formatCredits(team.member_count ?? 0)} members</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid gap-[14px] xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
            <div className="rounded-lg border border-white/10 bg-white/[0.03]">
              <div className="flex items-center justify-between border-b border-white/10 p-[16px]">
                <div>
                  <h3 className="text-[18px] font-semibold leading-[24px] text-zinc-50">Members</h3>
                  <p className="mt-[3px] text-[14px] text-zinc-400">Status, team, access level, and latest activity.</p>
                </div>
                <Badge className="bg-white/10 text-zinc-200 hover:bg-white/10">{formatCredits(members.length)} accounts</Badge>
              </div>
              <div className="divide-y divide-white/10">
                {members.slice(0, 10).map((member) => {
                  const last = member.last_active_at ?? member.last_sign_in_at ?? member.updated_at;
                  const lastTime = last ? new Date(last).getTime() : 0;
                  const isOnline = Number.isFinite(lastTime) && Date.now() - lastTime <= onlineWindowMs;
                  const team = member.team_id ? teamById.get(member.team_id) : null;
                  return (
                    <div key={member.id} className="grid gap-[12px] p-[14px] md:grid-cols-[minmax(220px,1.2fr)_minmax(160px,0.8fr)_minmax(120px,0.5fr)_minmax(180px,0.8fr)] md:items-center">
                      <div>
                        <div className="text-[15px] font-semibold leading-[21px] text-zinc-50">
                          {member.display_name || member.email || member.user_id}
                        </div>
                        <div className="text-[13.5px] leading-[19px] text-zinc-400">{member.email || "No email"}</div>
                      </div>
                      <div className="text-[14px] leading-[20px] text-zinc-300">
                        <span className="text-zinc-500">Team</span>
                        <div className="font-medium text-zinc-100">{team?.name || "Company pool"}</div>
                      </div>
                      <div>
                        <Badge className={cn(
                          "gap-[6px] hover:bg-transparent",
                          isOnline ? "bg-emerald-400/12 text-emerald-200" : "bg-zinc-800 text-zinc-300",
                        )}>
                          <span className={cn("h-[7px] w-[7px] rounded-full", isOnline ? "bg-emerald-300" : "bg-zinc-500")} />
                          {isOnline ? "active" : "offline"}
                        </Badge>
                        <div className="mt-[6px] text-[12.5px] text-zinc-500">{member.role === "org_admin" ? "Admin" : "Member"}</div>
                      </div>
                      <div className="text-[13.5px] leading-[19px] text-zinc-300">
                        <div className="flex items-center gap-[6px]">
                          <Clock3 className="h-[14px] w-[14px] text-zinc-500" />
                          {formatRelative(last)}
                        </div>
                        <div className="mt-[3px] text-zinc-500">{formatDateTime(last)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03]">
              <div className="border-b border-white/10 p-[16px]">
                <h3 className="text-[18px] font-semibold leading-[24px] text-zinc-50">Credit movements</h3>
                <p className="mt-[3px] text-[14px] text-zinc-400">Top-ups and org-to-team allocations.</p>
              </div>
              <div className="divide-y divide-white/10">
                {allocationTransactions.length > 0 ? allocationTransactions.map((tx) => {
                  const team = tx.class_id ? teamById.get(tx.class_id) : null;
                  const isPositive = Number(tx.amount ?? 0) >= 0;
                  return (
                    <div key={tx.id} className="p-[14px]">
                      <div className="flex items-start justify-between gap-[10px]">
                        <div>
                          <div className="text-[14.5px] font-semibold leading-[20px] text-zinc-50">
                            {team?.name || (tx.organization_id ? "Organization pool" : "Member credit")}
                          </div>
                          <div className="mt-[3px] text-[13px] leading-[18px] text-zinc-400">
                            {tx.description || tx.reason || "Credit movement"}
                          </div>
                        </div>
                        <div className={cn("text-right text-[15px] font-semibold", isPositive ? "text-emerald-200" : "text-amber-200")}>
                          {isPositive ? "+" : ""}{formatCredits(tx.amount ?? 0)}
                        </div>
                      </div>
                      <div className="mt-[8px] flex items-center justify-between gap-[10px] text-[12.5px] text-zinc-500">
                        <span>{tx.actor_display_name || tx.actor_email || "System"}</span>
                        <span>{formatDateTime(tx.created_at)}</span>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="p-[16px] text-[14px] leading-[20px] text-zinc-400">
                    No team credit allocation transactions yet.
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      ) : (
        <p className="max-w-4xl text-[16px] leading-[24px] text-zinc-200">
          Your account uses {active.team?.name || "the company pool"} in {orgName}. Full team analytics, member status, and credit transfer logs are available to organization admins.
        </p>
      )}
    </div>
  );
}

export default Settings;
