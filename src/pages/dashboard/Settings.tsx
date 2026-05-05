import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
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
  ExternalLink,
  KeyRound,
  CreditCard,
  ReceiptText,
  Wallet,
  Mail,
  Plus,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { SUPPORTED_LANGUAGES, getLanguageLocale, getLanguageNativeLabel, useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import SettingsLayout, { type SettingsSectionKey } from "@/components/settings/SettingsLayout";
import ComingSoon from "@/components/settings/ComingSoon";
import PlanBilling from "@/components/settings/PlanBilling";
import { DeleteAccountDialog } from "@/components/settings/DeleteAccountDialog";
import useDocumentTitle from "@/hooks/useDocumentTitle";

const TEAM_SEAT_PRICE_THB = 1600;
const TEAM_SEAT_PLATFORM_FEE_THB = 300;
const TEAM_BASE_CREDITS_PER_SEAT_MONTH = (TEAM_SEAT_PRICE_THB - TEAM_SEAT_PLATFORM_FEE_THB) * 50;
const TEAM_PROMO_CREDITS_PER_SEAT_MONTH = 25_000;
const TEAM_CREDITS_PER_SEAT_MONTH = TEAM_BASE_CREDITS_PER_SEAT_MONTH + TEAM_PROMO_CREDITS_PER_SEAT_MONTH;

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
              {new Date(profile.current_period_end).toLocaleDateString(getLanguageLocale(language), {
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
          {i18n("settings.team.dangerZone")}
        </h3>
        <p className="mt-1.5 text-[14px] leading-[22px] text-zinc-300">
          {i18n("settings.account.dangerDescription")}
        </p>
        <button
          type="button"
          onClick={() => setDeleteDialogOpen(true)}
          className="mt-[12px] inline-flex h-[36px] items-center gap-[6px] rounded-md border border-red-500/30 bg-red-500/10 px-[12px] text-[14px] font-medium text-red-200 transition-colors hover:bg-red-500/20"
        >
          {i18n("settings.team.deleteAccount")}
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
          <div className="flex items-center gap-1 rounded-md bg-white/[0.05] p-1">
            {SUPPORTED_LANGUAGES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLanguage(option)}
                className={cn(
                  "rounded px-[10px] py-[5px] text-[13px] font-medium transition-colors",
                  language === option
                    ? "bg-white text-zinc-950"
                    : "text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100",
                )}
              >
                {getLanguageNativeLabel(option)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderTeamSettings = () => (
    <TeamSettingsPanel />
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
    settings?: Record<string, unknown> | null;
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
  seat_price_thb?: number;
  seat_platform_fee_thb?: number;
  team_base_credits_per_seat_month?: number;
  team_promo_credits_per_seat_month?: number;
  team_credits_per_seat_month?: number;
  team_seats_purchased?: number;
  team_seats_used?: number;
  team_seats_reserved?: number;
  team_seats_available?: number;
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

function TeamSettingsPanel() {
  const { user, refreshProfile } = useAuth();
  const { language, t: i18n } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<TeamStatusMembership[]>([]);
  const [overview, setOverview] = useState<TeamConsoleOverview | null>(null);
  const [canOpenConsole, setCanOpenConsole] = useState(false);
  const [openingConsole, setOpeningConsole] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
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
        title: i18n("settings.team.couldNotLoadTeamStatus"),
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
          title: i18n("settings.team.couldNotLoadTeamDashboard"),
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
        title: i18n("settings.team.couldNotOpenAdminConsole"),
        description,
        variant: "destructive",
      });
      setOpeningConsole(false);
      return;
    }
    const payload = (data?.data ?? data) as { url?: string };
    if (!payload?.url) {
      toast({
        title: i18n("settings.team.couldNotOpenAdminConsole"),
        description: i18n("settings.team.theSignInHandoffDidNotReturn"),
        variant: "destructive",
      });
      setOpeningConsole(false);
      return;
    }
    window.location.assign(payload.url);
  };

  const createSubTeam = async () => {
    const name = newTeamName.trim();
    if (!name) {
      toast({ title: i18n("settings.team.teamNameIsRequired"), variant: "destructive" });
      return;
    }
    setCreatingTeam(true);
    const { error } = await supabase.functions.invoke("workspace_org_console", {
      body: { action: "create_team", name },
    });
    if (error) {
      const description = await functionErrorMessage(error);
      toast({ title: i18n("settings.team.couldNotCreateTeam"), description, variant: "destructive" });
    } else {
      setNewTeamName("");
      toast({ title: i18n("settings.team.teamCreated") });
      await loadStatus();
    }
    setCreatingTeam(false);
  };

  const inviteTeamMember = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast({ title: i18n("settings.team.enterValidEmail"), variant: "destructive" });
      return;
    }
    setInviting(true);
    const { error } = await supabase.functions.invoke("workspace_org_console", {
      body: {
        action: "invite_member",
        email,
        role: "member",
        team_id: inviteTeamId || null,
      },
    });
    if (error) {
      const description = await functionErrorMessage(error);
      toast({ title: i18n("settings.team.couldNotInviteMember"), description, variant: "destructive" });
    } else {
      setInviteEmail("");
      toast({ title: i18n("settings.team.invitationReady"), description: i18n("settings.team.canJoinThisTeamWorkspace", { email }) });
      await loadStatus();
    }
    setInviting(false);
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
  const seatPriceThb = overview?.seat_price_thb ?? TEAM_SEAT_PRICE_THB;
  const seatBaseCredits = overview?.team_base_credits_per_seat_month ?? TEAM_BASE_CREDITS_PER_SEAT_MONTH;
  const seatPromoCredits = overview?.team_promo_credits_per_seat_month ?? TEAM_PROMO_CREDITS_PER_SEAT_MONTH;
  const seatTotalCredits = overview?.team_credits_per_seat_month ?? TEAM_CREDITS_PER_SEAT_MONTH;
  const orgType = overview?.organization?.type || active?.organization?.type || "";
  const isSelfServeTeam = orgType === "team";
  const seatsPurchased = overview?.team_seats_purchased ?? Number(active?.organization?.settings?.team_seats_purchased ?? 0);
  const seatsUsed = overview?.team_seats_used ?? activeMembers.length;
  const seatsReserved = overview?.team_seats_reserved ?? 0;
  const seatsAvailable = overview?.team_seats_available ?? Math.max(0, seatsPurchased - seatsUsed - seatsReserved);
  const seatPriceLabel = `${Number(seatPriceThb).toLocaleString()} THB / seat / month`;
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
      <div className="max-w-2xl rounded-[16px] bg-amber-400/[0.08] p-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <h2 className="text-[20px] font-semibold leading-[26px] text-zinc-50">{i18n("settings.team.teamRequestPending")}</h2>
        <p className="mt-[8px] text-[14px] leading-[22px] text-zinc-400">
          {i18n("settings.team.pendingApprovalDescription")}
        </p>
        <div className="mt-[16px] rounded-[12px] bg-black/30 p-[12px] text-[14px] leading-[20px]">
          <div className="text-zinc-500">{i18n("settings.team.organization")}</div>
          <div className="font-medium text-zinc-100">
            {pending.organization?.display_name || pending.organization?.name || pending.organization_id}
          </div>
        </div>
      </div>
    );
  }

  if (!active) {
    return (
      <div className="max-w-2xl rounded-[16px] bg-zinc-900/60 p-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <h2 className="text-[20px] font-semibold leading-[26px] text-zinc-50">{i18n("settings.team.createTeamWorkspace")}</h2>
        <p className="mt-[8px] text-[14px] leading-[22px] text-zinc-400">
          {i18n("settings.team.teamStartsAt2SeatsEachSeat", {
            seatPrice: seatPriceLabel,
            credits: seatTotalCredits.toLocaleString(),
            promo: seatPromoCredits.toLocaleString(),
          })}
        </p>
        <Button className="mt-[20px] h-[36px] px-[14px] text-[14px]" onClick={() => navigate("/app/pricing")}>
          <Users className="mr-[8px] h-[16px] w-[16px]" />
          {i18n("common.buyTeamSeats")}
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      className="w-full max-w-[1420px] space-y-[16px] pr-[24px]"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <div className="flex flex-col gap-[12px] lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{i18n("settings.team.team")}</p>
          <h2 className="mt-[4px] text-[28px] font-semibold leading-[34px] text-zinc-50">{orgName}</h2>
        </div>
        {canOpenConsole && !isSelfServeTeam ? (
          <Button className="h-[38px] w-fit rounded-full bg-white/[0.08] px-[14px] text-[14px] hover:bg-white/[0.14]" onClick={openAdminConsole} disabled={openingConsole}>
            {openingConsole ? (
              <Loader2 className="mr-[8px] h-[16px] w-[16px] animate-spin" />
            ) : (
              <ExternalLink className="mr-[8px] h-[16px] w-[16px]" />
            )}
            {i18n("common.adminConsole")}
          </Button>
        ) : null}
      </div>

      {isSelfServeTeam ? (
        <section className="grid gap-[10px] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <div className="rounded-[16px] bg-zinc-900/55 p-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            <div className="flex items-center justify-between gap-[12px]">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{i18n("settings.team.seatPlan")}</p>
                <h3 className="mt-[3px] text-[18px] font-semibold leading-[23px] text-zinc-50">
                  {i18n("settings.team.valueActiveSeats", { used: seatsUsed, purchased: seatsPurchased })}
                </h3>
              </div>
              <Button className="h-[34px] rounded-full bg-purple-500 px-[12px] text-[13px] hover:bg-purple-400" onClick={() => navigate("/app/pricing")}>
                <Plus className="mr-[6px] h-[14px] w-[14px]" />
                {i18n("settings.team.buySeats")}
              </Button>
            </div>
            <div className="mt-[10px] h-[6px] overflow-hidden rounded-full bg-zinc-800">
              <motion.div
                className="h-full rounded-full bg-purple-400"
                initial={{ width: 0 }}
                animate={{ width: `${seatsPurchased > 0 ? Math.min(100, Math.round((seatsUsed / seatsPurchased) * 100)) : 0}%` }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              />
            </div>
            <div className="mt-[10px] grid grid-cols-3 gap-[7px] text-[12px] leading-[16px]">
              <div className="rounded-[10px] bg-black/22 p-[8px]">
                <div className="text-zinc-500">{i18n("common.available2")}</div>
                <div className="mt-[3px] font-semibold text-zinc-50">{seatsAvailable}</div>
                {seatsReserved > 0 ? <div className="mt-[2px] text-[11px] text-zinc-500">{i18n("settings.team.reserved", { count: seatsReserved })}</div> : null}
              </div>
              <div className="rounded-[10px] bg-black/22 p-[8px]">
                <div className="text-zinc-500">{i18n("settings.team.creditsSeat")}</div>
                <div className="mt-[3px] font-semibold text-zinc-50">{seatBaseCredits.toLocaleString()}</div>
              </div>
              <div className="rounded-[10px] bg-black/22 p-[8px]">
                <div className="text-zinc-500">{i18n("settings.team.promoSeat")}</div>
                <div className="mt-[3px] font-semibold text-emerald-300">+{seatPromoCredits.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[16px] bg-zinc-900/55 p-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            <div className="grid gap-[10px] lg:grid-cols-[minmax(0,1.45fr)_minmax(220px,0.9fr)]">
              <div>
                <div className="mb-[7px] flex items-center gap-[7px] text-[13px] font-semibold text-zinc-200">
                  <Mail className="h-[15px] w-[15px] text-purple-300" />
                  {i18n("settings.team.inviteMember")}
                </div>
                <div className="flex flex-col gap-[8px] sm:flex-row">
                  <Input
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="member@company.com"
                    className="h-[36px] bg-black/28 text-[13px]"
                    disabled={seatsAvailable <= 0 || inviting}
                  />
                  <select
                    value={inviteTeamId}
                    onChange={(event) => setInviteTeamId(event.target.value)}
                    className="h-[36px] rounded-[10px] bg-black/28 px-[10px] text-[13px] text-zinc-100 outline-none"
                    disabled={inviting}
                  >
                    <option value="">{i18n("common.companyPool")}</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                  <Button className="h-[36px] px-[12px] text-[13px]" onClick={inviteTeamMember} disabled={seatsAvailable <= 0 || inviting}>
                    {inviting ? <Loader2 className="mr-[7px] h-[14px] w-[14px] animate-spin" /> : <UserPlus className="mr-[7px] h-[14px] w-[14px]" />}
                    {i18n("settings.team.invite")}
                  </Button>
                </div>
                {seatsAvailable <= 0 ? (
                  <p className="mt-[6px] text-[12px] text-amber-300">{i18n("settings.team.noEmptySeatsBuyMoreSeatsBefore")}</p>
                ) : null}
              </div>

              <div>
                <div className="mb-[7px] flex items-center gap-[7px] text-[13px] font-semibold text-zinc-200">
                  <Users className="h-[15px] w-[15px] text-sky-300" />
                  {i18n("settings.team.addSubTeam")}
                </div>
                <div className="flex gap-[8px]">
                  <Input
                    value={newTeamName}
                    onChange={(event) => setNewTeamName(event.target.value)}
                    placeholder="Marketing"
                    className="h-[36px] bg-black/28 text-[13px]"
                    disabled={creatingTeam}
                  />
                  <Button className="h-[36px] px-[12px] text-[13px]" onClick={createSubTeam} disabled={creatingTeam}>
                    {creatingTeam ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Plus className="h-[14px] w-[14px]" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-[10px] md:grid-cols-2 xl:grid-cols-4">
        <motion.div className="relative overflow-hidden rounded-[14px] bg-zinc-900/70 px-[14px] py-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-sky-400/16 to-transparent" />
          <div className="relative flex items-center justify-between gap-[12px]">
            <div>
          <div className="flex items-center gap-[8px] text-[14px] font-medium leading-[18px] text-zinc-200">
            <Wallet className="h-[17px] w-[17px] text-sky-300" />
            {i18n("settings.team.shared")}
          </div>
          <div className="mt-[7px] text-[24px] font-semibold leading-[28px] text-zinc-50">
            {formatCredits(organizationCredits)}
          </div>
            </div>
            <span className="rounded-full bg-black/30 px-[9px] py-[5px] text-[12px] leading-[15px] text-zinc-400">{i18n("common.available")}</span>
          </div>
        </motion.div>
        <motion.div className="relative overflow-hidden rounded-[14px] bg-zinc-900/70 px-[14px] py-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: 0.03 }}>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-violet-400/16 to-transparent" />
          <div className="relative flex items-center justify-between gap-[12px]">
            <div>
          <div className="flex items-center gap-[8px] text-[14px] font-medium leading-[18px] text-zinc-200">
            <Building2 className="h-[17px] w-[17px] text-violet-300" />
            {i18n("settings.team.teams")}
          </div>
          <div className="mt-[7px] text-[24px] font-semibold leading-[28px] text-zinc-50">
            {formatCredits(Math.max(1, teams.length || (active.team ? 1 : 0)))}
          </div>
            </div>
            <span className="rounded-full bg-black/30 px-[9px] py-[5px] text-[12px] leading-[15px] text-zinc-400">{i18n("settings.team.inclPool")}</span>
          </div>
        </motion.div>
        <motion.div className="relative overflow-hidden rounded-[14px] bg-zinc-900/70 px-[14px] py-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: 0.06 }}>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-emerald-400/16 to-transparent" />
          <div className="relative flex items-center justify-between gap-[12px]">
            <div>
          <div className="flex items-center gap-[8px] text-[14px] font-medium leading-[18px] text-zinc-200">
            <Activity className="h-[17px] w-[17px] text-emerald-300" />
            {i18n("settings.team.online")}
          </div>
          <div className="mt-[7px] text-[24px] font-semibold leading-[28px] text-zinc-50">
            {formatCredits(onlineMembers.length)}
          </div>
            </div>
            <span className="rounded-full bg-black/30 px-[9px] py-[5px] text-[12px] leading-[15px] text-zinc-400">{formatCredits(activeMembers.length)} {i18n("settings.team.seats")}</span>
          </div>
        </motion.div>
        <motion.div className="relative overflow-hidden rounded-[14px] bg-zinc-900/70 px-[14px] py-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: 0.09 }}>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-amber-400/16 to-transparent" />
          <div className="relative flex items-center justify-between gap-[12px]">
            <div>
          <div className="flex items-center gap-[8px] text-[14px] font-medium leading-[18px] text-zinc-200">
            <ReceiptText className="h-[17px] w-[17px] text-amber-300" />
            {i18n("settings.team.used30d")}
          </div>
          <div className="mt-[7px] text-[24px] font-semibold leading-[28px] text-zinc-50">
            {formatCredits(generationCredits30d)}
          </div>
            </div>
            <span className="rounded-full bg-black/30 px-[9px] py-[5px] text-[12px] leading-[15px] text-zinc-400">
              {formatCredits(overview?.usage_summary?.generation_count_30d ?? 0)} {i18n("settings.team.runs")}
            </span>
          </div>
        </motion.div>
      </div>

      {overview ? (
        <>
          <section className="rounded-[16px] bg-zinc-900/55 p-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            <div className="flex items-center justify-between">
              <h3 className="text-[17px] font-semibold leading-[22px] text-zinc-50">{i18n("settings.team.creditPools")}</h3>
              <p className="text-[12.5px] leading-[18px] text-zinc-500">{orgName}</p>
            </div>
            <div className="mt-[10px] space-y-[8px]">
              <div className="rounded-[12px] bg-black/22 p-[12px]">
                <div className="flex items-start justify-between gap-[12px]">
                  <div>
                    <h4 className="text-[15px] font-semibold leading-[20px] text-zinc-50">{i18n("common.companyPool")}</h4>
                    <p className="mt-[2px] text-[12.5px] leading-[17px] text-zinc-500">{orgName}</p>
                  </div>
                  <Badge className="bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/15">{i18n("settings.team.active")}</Badge>
                </div>
                <div className="mt-[10px] grid grid-cols-2 gap-[8px]">
                  <div className="rounded-[10px] bg-black/25 p-[9px]">
                    <div className="text-[12.5px] text-zinc-500">{i18n("common.available2")}</div>
                    <div className="mt-[4px] text-[18px] font-semibold text-zinc-50">{formatCredits(overview.organization?.credit_available ?? 0)}</div>
                  </div>
                  <div className="rounded-[10px] bg-black/25 p-[9px]">
                    <div className="text-[12.5px] text-zinc-500">{i18n("settings.team.allocated")}</div>
                    <div className="mt-[4px] text-[18px] font-semibold text-zinc-50">{formatCredits(overview.organization?.credit_pool_allocated ?? 0)}</div>
                  </div>
                </div>
              </div>
              {teams.map((team) => {
                const pool = Number(team.credit_pool ?? 0);
                const used = Number(team.credit_pool_consumed ?? 0);
                const percent = pool > 0 ? Math.min(100, Math.round((used / pool) * 100)) : 0;
                return (
                  <motion.div key={team.id} className="rounded-[12px] bg-black/22 p-[12px]" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
                    <div className="flex items-center justify-between gap-[12px]">
                      <div>
                        <h4 className="text-[15px] font-semibold leading-[20px] text-zinc-50">{team.name}</h4>
                        <p className="mt-[2px] text-[12.5px] uppercase leading-[17px] text-zinc-500">{team.code || "team"}</p>
                      </div>
                      <span className="text-[12.5px] text-zinc-400">{formatCredits(team.member_count ?? 0)} {i18n("settings.team.members2")}</span>
                    </div>
                    <div className="mt-[9px] h-[6px] overflow-hidden rounded-full bg-zinc-800">
                      <motion.div className="h-full rounded-full bg-sky-400" initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
                    </div>
                    <div className="mt-[6px] text-[12.5px] leading-[17px] text-zinc-400">
                      {formatCredits(used)} / {formatCredits(pool)}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>

          <section className="grid gap-[12px] xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)]">
            <div className="rounded-[16px] bg-zinc-900/55 p-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <div className="mb-[10px] flex items-center justify-between px-[2px]">
                <div>
                  <h3 className="text-[17px] font-semibold leading-[22px] text-zinc-50">{i18n("settings.team.members")}</h3>
                </div>
                <span className="rounded-full bg-white/[0.07] px-[10px] py-[5px] text-[12px] text-zinc-300">{formatCredits(members.length)} {i18n("settings.team.accounts")}</span>
              </div>
              <div className="space-y-[7px]">
                {members.slice(0, 10).map((member) => {
                  const last = member.last_active_at ?? member.last_sign_in_at ?? member.updated_at;
                  const lastTime = last ? new Date(last).getTime() : 0;
                  const isOnline = Number.isFinite(lastTime) && Date.now() - lastTime <= onlineWindowMs;
                  const team = member.team_id ? teamById.get(member.team_id) : null;
                  return (
                    <motion.div key={member.id} className="grid gap-[10px] rounded-[12px] bg-black/20 px-[12px] py-[10px] md:grid-cols-[minmax(220px,1fr)_150px_116px_150px] md:items-center" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                      <div>
                        <div className="truncate text-[14.5px] font-semibold leading-[20px] text-zinc-50">
                          {member.display_name || member.email || member.user_id}
                        </div>
                        <div className="truncate text-[12.5px] leading-[18px] text-zinc-500">{member.email || "No email"}</div>
                      </div>
                      <div>
                        <div className="truncate text-[13.5px] font-medium text-zinc-200">{team?.name || i18n("common.companyPool")}</div>
                        <div className="text-[12px] text-zinc-500">{member.role === "org_admin" ? i18n("settings.team.admin") : i18n("settings.team.member")}</div>
                      </div>
                      <div>
                        <Badge className={cn(
                          "gap-[6px] hover:bg-transparent",
                          isOnline ? "bg-emerald-400/12 text-emerald-200" : "bg-zinc-800 text-zinc-300",
                        )}>
                          <span className={cn("h-[7px] w-[7px] rounded-full", isOnline ? "bg-emerald-300" : "bg-zinc-500")} />
                          {isOnline ? i18n("settings.team.active") : i18n("settings.team.offline")}
                        </Badge>
                      </div>
                      <div className="text-[12.5px] leading-[18px] text-zinc-400">
                        <div className="flex items-center gap-[6px]">
                          {formatRelative(last)}
                        </div>
                        <div className="text-zinc-600">{formatDateTime(last)}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[16px] bg-zinc-900/55 p-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <div className="mb-[10px] flex items-center justify-between px-[2px]">
                <h3 className="text-[17px] font-semibold leading-[22px] text-zinc-50">{i18n("settings.team.creditFlow")}</h3>
                <span className="text-[12.5px] text-zinc-500">{i18n("common.latest3")}</span>
              </div>
              <div className="space-y-[8px]">
                {allocationTransactions.length > 0 ? allocationTransactions.map((transaction) => {
                  const team = transaction.class_id ? teamById.get(transaction.class_id) : null;
                  const isPositive = Number(transaction.amount ?? 0) >= 0;
                  return (
                    <motion.div key={transaction.id} className="rounded-[12px] bg-black/22 p-[11px]" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}>
                      <div className="flex items-start justify-between gap-[10px]">
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-semibold leading-[19px] text-zinc-50">
                            {team?.name || (transaction.organization_id ? i18n("settings.team.organizationPool") : i18n("settings.team.memberCredit"))}
                          </div>
                          <div className="mt-[3px] line-clamp-2 text-[12.5px] leading-[17px] text-zinc-500">
                            {transaction.description || transaction.reason || i18n("settings.team.creditMovement")}
                          </div>
                        </div>
                        <div className={cn("rounded-full px-[9px] py-[5px] text-[13px] font-semibold", isPositive ? "bg-emerald-400/12 text-emerald-200" : "bg-amber-400/12 text-amber-200")}>
                          {isPositive ? "+" : ""}{formatCredits(transaction.amount ?? 0)}
                        </div>
                      </div>
                      <div className="mt-[8px] flex items-center justify-between gap-[10px] text-[12px] text-zinc-600">
                        <span className="truncate">{transaction.actor_display_name || transaction.actor_email || i18n("settings.team.system")}</span>
                        <span>{formatRelative(transaction.created_at)}</span>
                      </div>
                    </motion.div>
                  );
                }) : (
                  <div className="rounded-[12px] bg-black/22 p-[14px] text-[13.5px] leading-[20px] text-zinc-500">
                    {i18n("settings.team.noTeamAllocationYet")}
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      ) : (
        <p className="max-w-4xl text-[16px] leading-[24px] text-zinc-200">
          {i18n("settings.team.yourAccountUsesInFull", {
            team: active.team?.name || i18n("settings.team.theCompanyPool"),
            org: orgName,
          })}
        </p>
      )}
    </motion.div>
  );
}

export default Settings;
