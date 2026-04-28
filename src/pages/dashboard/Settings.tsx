import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { User, Camera, Save, Loader2, Globe, Shield, BarChart3, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Workspace-shaped Settings page.
 *
 * Wave 2 cleanup removed the consumer-only "Brand context" tab
 * (consumer brand kit) and the inline Transactions / Pricing sub-
 * tabs. Usage / Pricing now live as siblings under AccountShell
 * (top-bar account sub-nav), so this page focuses on PROFILE +
 * PREFERENCES + a small CREDIT-USAGE strip.
 */

type SettingsTab = "profile" | "preferences" | "usage";

const Settings = () => {
  const { profile, user, refreshProfile } = useAuth();
  const { credits } = useCredits();
  const { t, language, setLanguage } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [company, setCompany] = useState(profile?.company || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [uploading, setUploading] = useState(false);

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
    if (profile?.plan_name) {
      return <Badge className="bg-primary/20 text-primary border-primary/30">{profile.plan_name}</Badge>;
    }
    if (profile?.subscription_status && profile.subscription_status !== "free") {
      return <Badge className="bg-primary/20 text-primary border-primary/30">{profile.subscription_status === "agency" ? t("planAgency") : t("planPro")}</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground">{t("planFree")}</Badge>;
  };

  const toggleLanguage = () => setLanguage(language === "en" ? "th" : "en");

  const sidebarItems: { key: SettingsTab; icon: React.ElementType; label: string }[] = [
    { key: "profile", icon: User, label: t("profile") },
    { key: "preferences", icon: Shield, label: t("settings") },
    { key: "usage", icon: BarChart3, label: t("usage") },
  ];

  return (
    <div className="max-w-5xl mx-auto pb-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-6">
        <span className="text-foreground font-semibold">{t("settings")}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">
          {sidebarItems.find(i => i.key === activeTab)?.label}
        </span>
      </div>

      {/* Mobile Tab Selector */}
      <div className="flex md:hidden gap-2 mb-4 overflow-x-auto pb-2 w-full">
        {sidebarItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveTab(item.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors",
              activeTab === item.key
                ? "bg-secondary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <item.icon className="w-3.5 h-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <nav className="w-48 shrink-0 hidden md:block space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {t("account")}
          </p>
          {sidebarItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={cn(
                "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors",
                activeTab === item.key
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* ── Profile Tab ── */}
          {activeTab === "profile" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-bold text-foreground">{t("profile")}</h2>
              </div>

              {/* Avatar */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">{t("Avatar")}</Label>
                <div className="relative group w-16 h-16">
                  <Avatar className="w-16 h-16 border-2 border-border">
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

              {/* Name */}
              <div className="max-w-md space-y-1.5">
                <Label htmlFor="displayName" className="text-sm font-medium text-foreground">{t("displayName")}</Label>
                <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("displayName")} className="bg-muted/30 border-border" />
              </div>

              {/* Company */}
              <div className="max-w-md space-y-1.5">
                <Label htmlFor="company" className="text-sm font-medium text-foreground">
                  {t("company")}
                </Label>
                <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder={t("companyPlaceholder")} className="bg-muted/30 border-border" />
              </div>

              {/* Email (read-only) */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground">{t("authEmailLabel")}</Label>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>

              <Separator />

              {/* Plan badge + expiration */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-foreground">{t("currentPlan")}</span>
                  {getPlanBadge()}
                </div>
                {profile?.current_period_end && profile?.subscription_status !== "free" && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {t("expires")}:
                    </span>
                    <span className={cn(
                      "font-medium",
                      new Date(profile.current_period_end) < new Date()
                        ? "text-destructive"
                        : new Date(profile.current_period_end) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                          ? "text-amber-400"
                          : "text-foreground"
                    )}>
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
          )}

          {/* ── Preferences Tab ── */}
          {activeTab === "preferences" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-foreground">{t("settings")}</h2>

              <div className="space-y-1 max-w-lg">
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm text-foreground flex items-center gap-2.5">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    {t("language")}
                  </span>
                  <button
                    onClick={toggleLanguage}
                    className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground font-medium transition-colors"
                  >
                    {language === "en" ? "EN → TH" : "TH → EN"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Usage Tab ── */}
          {activeTab === "usage" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-foreground">{t("usage")}</h2>

              {/* Credit usage bar - like profile dropdown */}
              <div className="rounded-xl bg-secondary/60 border border-border p-5 max-w-md space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-foreground" />
                  <span className="text-sm text-foreground font-medium">{t("creditUsage")}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("totalUsed")} {(credits?.total_used ?? 0).toLocaleString()}</span>
                  <span>{t("totalPurchased")} {(credits?.total_purchased ?? 0).toLocaleString()}</span>
                </div>
                <Progress value={(() => { const limit = credits?.total_purchased ?? 0; return limit > 0 ? Math.min(((credits?.total_used ?? 0) / limit) * 100, 100) : 0; })()} className="h-2.5" />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {(credits?.balance ?? 0).toLocaleString()} {t("creditsRemaining")}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-accent-foreground bg-accent/80 hover:bg-accent font-medium"
                    onClick={() => navigate("/app/pricing#topup")}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    {t("topUp")}
                  </Button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Settings;
