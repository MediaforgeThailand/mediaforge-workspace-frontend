import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
import { updateSchoolProfile } from "@/lib/orgAdminApi";

type StudentClassProfile = {
  class_id: string;
  class_name: string;
  class_code: string | null;
  student_code: string | null;
};

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
  const { profile, user, refreshProfile } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { toast } = useToast();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Honour `?tab=…` for deep-linking. Map URL slug → SettingsSectionKey.
  const tabParam = new URLSearchParams(location.search).get("tab");
  const initialKey: SettingsSectionKey =
    tabParam === "plan-billing"
      ? "organization.plan-billing"
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
  const [studentClassProfiles, setStudentClassProfiles] = useState<StudentClassProfile[]>([]);
  const [studentCodeDrafts, setStudentCodeDrafts] = useState<Record<string, string>>({});
  const [savingStudentClassId, setSavingStudentClassId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setStudentClassProfiles([]);
      setStudentCodeDrafts({});
      return;
    }

    let cancelled = false;
    const loadStudentProfiles = async () => {
      const { data, error } = await supabase
        .from("class_members" as any)
        .select("class_id, student_code, classes(id, name, code, status)")
        .eq("user_id", user.id)
        .eq("role", "student")
        .eq("status", "active");
      if (cancelled || error) return;

      const rows = ((data ?? []) as any[]).map((row) => {
        const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes;
        return {
          class_id: String(row.class_id),
          class_name: String(cls?.name ?? "Class"),
          class_code: cls?.code ? String(cls.code) : null,
          student_code: row.student_code ? String(row.student_code) : null,
        };
      });
      const drafts: Record<string, string> = {};
      for (const row of rows) drafts[row.class_id] = row.student_code ?? "";
      setStudentClassProfiles(rows);
      setStudentCodeDrafts(drafts);
    };

    void loadStudentProfiles();
    return () => {
      cancelled = true;
    };
  }, [user]);

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

  const handleStudentCodeSave = async (classId: string) => {
    const trimmed = (studentCodeDrafts[classId] ?? "").trim();
    if (!trimmed) {
      toast({ title: "Student ID is required", variant: "destructive" });
      return;
    }
    setSavingStudentClassId(classId);
    try {
      await updateSchoolProfile({ class_id: classId, student_code: trimmed });
      setStudentClassProfiles((rows) =>
        rows.map((row) => (row.class_id === classId ? { ...row, student_code: trimmed } : row)),
      );
      queryClient.invalidateQueries({ queryKey: ["class-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["mf-um-class-memberships"] });
      toast({ title: "Student ID saved" });
    } catch (error) {
      toast({
        title: "Could not save student ID",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingStudentClassId(null);
    }
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

      {studentClassProfiles.length > 0 && (
        <div className="max-w-xl space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Student profile</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Your class spaces are linked to this account. Update your student ID here if it was entered incorrectly.
            </p>
          </div>
          <div className="space-y-3">
            {studentClassProfiles.map((item) => (
              <div key={item.class_id} className="rounded-md border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-100">{item.class_name}</div>
                    {item.class_code && <div className="mt-0.5 font-mono text-xs text-zinc-500">{item.class_code}</div>}
                  </div>
                  {item.student_code ? (
                    <Badge variant="outline" className="border-emerald-400/25 bg-emerald-400/10 text-emerald-200">
                      Saved
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-400/25 bg-amber-400/10 text-amber-200">
                      Missing ID
                    </Badge>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={studentCodeDrafts[item.class_id] ?? ""}
                    onChange={(event) =>
                      setStudentCodeDrafts((drafts) => ({ ...drafts, [item.class_id]: event.target.value }))
                    }
                    placeholder="Student ID"
                    className="h-9 rounded-md border-white/10 bg-black/30 px-3 font-mono text-sm text-zinc-100"
                  />
                  <Button
                    onClick={() => handleStudentCodeSave(item.class_id)}
                    disabled={savingStudentClassId === item.class_id}
                    className="h-9 shrink-0 px-3 text-sm"
                  >
                    {savingStudentClassId === item.class_id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Save ID
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
    </div>
  );

  const renderPreferences = () => (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold text-zinc-50">Preferences</h2>
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

  const renderActiveSection = () => {
    switch (activeKey) {
      case "account.profile":
        return renderProfile();
      case "account.stock-downloads":
        return (
          <ComingSoon
            icon={Download}
            title="Stock downloads"
            description="Your downloaded stock assets will appear here once the stock library ships."
          />
        );
      case "account.stock-collections":
        return (
          <ComingSoon
            icon={Bookmark}
            title="Stock collections"
            description="Save and organise stock assets into shared collections in the next wave."
          />
        );
      case "account.following":
        return (
          <ComingSoon
            icon={UserPlus}
            title="Following"
            description="Follow creators and saved searches — coming with the community release."
          />
        );
      case "organization.my-team":
        return (
          <ComingSoon
            icon={Users}
            title="My Team"
            description="Manage shared workspaces and team members — ships with the team rollout."
          />
        );
      case "organization.people":
        return (
          <ComingSoon
            icon={Users}
            title="People"
            description="Invite collaborators and manage permissions — ships with the team rollout."
          />
        );
      case "organization.security-sso":
        return (
          <ComingSoon
            icon={KeyRound}
            title="Security SSO"
            description="SSO and enterprise security controls — coming with the team rollout."
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
    <SettingsLayout activeKey={activeKey} onChange={setActiveKey}>
      {renderActiveSection()}
    </SettingsLayout>
  );
};

export default Settings;
