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
  ExternalLink,
  KeyRound,
  CreditCard,
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
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-zinc-50">{t("profile")}</h2>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-zinc-200">{t("Avatar")}</Label>
        <div className="relative group w-16 h-16">
          <Avatar className="w-16 h-16 border-2 border-white/10">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="bg-primary/20 text-primary text-xl">
              {displayName?.charAt(0)?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Camera className="w-4 h-4 text-white" />}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </label>
        </div>
      </div>

      <div className="max-w-md space-y-1.5">
        <Label htmlFor="displayName" className="text-sm font-medium text-zinc-200">{t("displayName")}</Label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("displayName")}
          className="bg-black/30 border-white/10 text-zinc-100"
        />
      </div>

      <div className="max-w-md space-y-1.5">
        <Label htmlFor="company" className="text-sm font-medium text-zinc-200">{t("company")}</Label>
        <Input
          id="company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder={t("companyPlaceholder")}
          className="bg-black/30 border-white/10 text-zinc-100"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-zinc-200">{t("authEmailLabel")}</Label>
        <p className="text-sm text-zinc-400">{user?.email}</p>
      </div>

      <Separator className="bg-white/5" />

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-300">{t("currentPlan")}</span>
          {getPlanBadge()}
        </div>
        {profile?.current_period_end && profile?.subscription_status !== "free" && (
          <div className="flex items-center gap-2 text-sm">
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
                <span className="ml-1.5 text-xs">({t("expired")})</span>
              )}
            </span>
          </div>
        )}
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
        {t("saveChanges")}
      </Button>

      {/* ── Danger Zone ─────────────────────────────────────────
       * PDPA right-of-erasure surface. The audit found we promise
       * "request deletion of your data" in Privacy Policy but had
       * no actual UI — non-compliance the moment any user files
       * a request. This block is the user-facing entry point. */}
      <Separator className="bg-white/5" />
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-5">
        <h3 className="text-[14px] font-semibold text-red-200">
          {language === "th" ? "พื้นที่อันตราย" : "Danger zone"}
        </h3>
        <p className="mt-1 text-[12px] text-zinc-400">
          {language === "th"
            ? "การลบบัญชีจะเอาข้อมูล โปรเจค ผลงาน เครดิต และประวัติการชำระทั้งหมดออกถาวร — กู้คืนไม่ได้"
            : "Deleting your account permanently removes all data, projects, generations, credits, and billing history — this cannot be undone."}
        </p>
        <button
          type="button"
          onClick={() => setDeleteDialogOpen(true)}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 text-[12.5px] font-medium text-red-200 transition-colors hover:bg-red-500/20"
        >
          {language === "th" ? "ลบบัญชีถาวร" : "Delete account"}
        </button>
      </div>
    </div>
  );

  const renderPreferences = () => (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold text-zinc-50">{t("workspace.settings.preferences")}</h2>
      <div className="space-y-1 max-w-lg">
        <div className="flex items-center justify-between py-3">
          <span className="text-sm text-zinc-300 flex items-center gap-2.5">
            <Globe className="w-4 h-4 text-zinc-500" />
            {t("language")}
          </span>
          <button
            onClick={toggleLanguage}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.05] text-zinc-300 hover:text-zinc-100 font-medium transition-colors"
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
  } | null;
}

function TeamSettingsPanel({ onRegister }: { onRegister: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<TeamStatusMembership[]>([]);
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
      toast({
        title: "Could not load team status",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }
    const payload = (data?.data ?? data) as {
      memberships?: TeamStatusMembership[];
      can_open_admin_console?: boolean;
    };
    setMemberships(payload.memberships ?? []);
    setCanOpenConsole(Boolean(payload.can_open_admin_console));
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
      toast({
        title: "Could not open Admin Console",
        description: error.message,
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

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!active && pending) {
    return (
      <div className="max-w-2xl rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-6">
        <h2 className="text-xl font-semibold text-zinc-50">Team request pending</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Your company domain matched an organization, but an admin needs to approve your access before you can use the team dashboard or shared credit pool.
        </p>
        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
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
      <div className="max-w-2xl rounded-xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-xl font-semibold text-zinc-50">Create a team workspace</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Team accounts include a company Admin Console, member approvals, shared team credits, and seat billing at $5 per active seat. Credits are topped up separately based on real usage.
        </p>
        <Button className="mt-5" onClick={onRegister}>
          <Users className="mr-2 h-4 w-4" />
          Start team registration
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-zinc-50">Team</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Your account is connected to {active.organization?.display_name || active.organization?.name || "your organization"}.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs text-zinc-500">Status</div>
          <div className="mt-1 text-lg font-semibold text-zinc-50">{active.status}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs text-zinc-500">Role</div>
          <div className="mt-1 text-lg font-semibold text-zinc-50">
            {active.role === "org_admin" ? "Admin" : "Member"}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs text-zinc-500">Seat price</div>
          <div className="mt-1 text-lg font-semibold text-zinc-50">$5 / seat</div>
        </div>
      </div>

      {canOpenConsole ? (
        <Button onClick={openAdminConsole} disabled={openingConsole}>
          {openingConsole ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="mr-2 h-4 w-4" />
          )}
          Open Admin Console
        </Button>
      ) : (
        <p className="text-sm text-zinc-500">
          Member accounts can use the team workspace after approval. Admin Console access is available only to organization admins.
        </p>
      )}
    </div>
  );
}

export default Settings;
