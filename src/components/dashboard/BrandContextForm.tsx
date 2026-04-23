import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, Building2, Target, Palette, Megaphone, Users, MapPin, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";

const PLATFORM_OPTIONS = ["TikTok", "Instagram", "YouTube", "Facebook", "X/Twitter", "LINE", "Website"];
const CONTENT_TYPE_OPTIONS = ["short_video", "long_video", "product_photo", "story", "banner", "animation", "voice_over"];
const TONE_OPTIONS = ["professional", "playful", "luxury", "casual", "bold", "minimal", "warm", "edgy"];

const BrandContextForm = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    business_name: "",
    industry: "",
    target_audience: "",
    brand_tone: "",
    brand_colors: "",
    logo_url: "",
    tagline: "",
    products_services: "",
    unique_selling_points: "",
    competitors: "",
    primary_platforms: [] as string[],
    content_goals: "",
    preferred_content_types: [] as string[],
    target_age_range: "",
    target_gender: "all",
    target_location: "",
    target_language: "th",
    additional_notes: "",
  });

  const isPro = profile?.subscription_status === "professional" || profile?.subscription_status === "agency";

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("brand_contexts")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setForm({
          business_name: data.business_name || "",
          industry: data.industry || "",
          target_audience: data.target_audience || "",
          brand_tone: data.brand_tone || "",
          brand_colors: data.brand_colors || "",
          logo_url: data.logo_url || "",
          tagline: data.tagline || "",
          products_services: data.products_services || "",
          unique_selling_points: data.unique_selling_points || "",
          competitors: data.competitors || "",
          primary_platforms: (data.primary_platforms as string[]) || [],
          content_goals: data.content_goals || "",
          preferred_content_types: (data.preferred_content_types as string[]) || [],
          target_age_range: data.target_age_range || "",
          target_gender: data.target_gender || "all",
          target_location: data.target_location || "",
          target_language: data.target_language || "th",
          additional_notes: data.additional_notes || "",
        });
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const payload = { ...form, user_id: user.id };
    const { error } = await supabase
      .from("brand_contexts")
      .upsert(payload, { onConflict: "user_id" });
    if (error) {
      toast({ title: t("genericError"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("brandContextSaved"), description: t("brandContextSavedDesc") });
    }
    setSaving(false);
  };

  const toggleArrayItem = (key: "primary_platforms" | "preferred_content_types", value: string) => {
    setForm(prev => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter(v => v !== value)
        : [...prev[key], value],
    }));
  };

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-primary/60" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {t("bcProFeature")}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {t("bcProDesc")}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          {t("bcTitle")}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t("bcDesc")}
        </p>
      </div>

      {/* Basic Info */}
      <div className="space-y-4 rounded-xl border border-border/50 p-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" />
          {t("bcBusinessInfo")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("bcBusinessName")}</Label>
            <Input value={form.business_name} onChange={e => setForm(p => ({ ...p, business_name: e.target.value }))} placeholder="MediaForge Studio" className="bg-muted/30 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("bcIndustry")}</Label>
            <Input value={form.industry} onChange={e => setForm(p => ({ ...p, industry: e.target.value }))} placeholder={t("bcIndustryPlaceholder")} className="bg-muted/30 text-sm" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("bcProducts")}</Label>
          <Textarea value={form.products_services} onChange={e => setForm(p => ({ ...p, products_services: e.target.value }))} placeholder={t("bcProductsPlaceholder")} rows={2} className="bg-muted/30 text-sm" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Tagline</Label>
            <Input value={form.tagline} onChange={e => setForm(p => ({ ...p, tagline: e.target.value }))} className="bg-muted/30 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">USP</Label>
            <Input value={form.unique_selling_points} onChange={e => setForm(p => ({ ...p, unique_selling_points: e.target.value }))} className="bg-muted/30 text-sm" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("bcCompetitors")}</Label>
          <Input value={form.competitors} onChange={e => setForm(p => ({ ...p, competitors: e.target.value }))} className="bg-muted/30 text-sm" />
        </div>
      </div>

      {/* Brand Identity */}
      <div className="space-y-4 rounded-xl border border-border/50 p-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5" />
          {t("bcBrandIdentity")}
        </p>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("bcBrandTone")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {TONE_OPTIONS.map(tone => (
              <button
                key={tone}
                onClick={() => setForm(p => ({ ...p, brand_tone: p.brand_tone === tone ? "" : tone }))}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors capitalize ${
                  form.brand_tone === tone
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "border-border/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {tone}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("bcBrandColors")}</Label>
          <Input value={form.brand_colors} onChange={e => setForm(p => ({ ...p, brand_colors: e.target.value }))} placeholder="#FF5733, #333333" className="bg-muted/30 text-sm" />
        </div>
      </div>

      {/* Content Strategy */}
      <div className="space-y-4 rounded-xl border border-border/50 p-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
          <Megaphone className="w-3.5 h-3.5" />
          {t("bcContentStrategy")}
        </p>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("bcPlatforms")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORM_OPTIONS.map(p => (
              <button
                key={p}
                onClick={() => toggleArrayItem("primary_platforms", p)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  form.primary_platforms.includes(p)
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "border-border/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("bcContentGoals")}</Label>
          <Input value={form.content_goals} onChange={e => setForm(p => ({ ...p, content_goals: e.target.value }))} placeholder={t("bcContentGoalsPlaceholder")} className="bg-muted/30 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("bcContentTypes")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {CONTENT_TYPE_OPTIONS.map(ct => (
              <button
                key={ct}
                onClick={() => toggleArrayItem("preferred_content_types", ct)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  form.preferred_content_types.includes(ct)
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "border-border/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {ct.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Target Audience */}
      <div className="space-y-4 rounded-xl border border-border/50 p-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {t("bcTargetAudience")}
        </p>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("bcTargetAudience")}</Label>
          <Textarea value={form.target_audience} onChange={e => setForm(p => ({ ...p, target_audience: e.target.value }))} placeholder={t("bcTargetPlaceholder")} rows={2} className="bg-muted/30 text-sm" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("bcAgeRange")}</Label>
            <Input value={form.target_age_range} onChange={e => setForm(p => ({ ...p, target_age_range: e.target.value }))} placeholder="18-35" className="bg-muted/30 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("bcGender")}</Label>
            <select value={form.target_gender} onChange={e => setForm(p => ({ ...p, target_gender: e.target.value }))} className="w-full text-sm bg-muted/30 border border-border rounded-md px-2 py-2 text-foreground">
              <option value="all">{t("bcGenderAll")}</option>
              <option value="female">{t("bcGenderFemale")}</option>
              <option value="male">{t("bcGenderMale")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("bcLocation")}</Label>
            <Input value={form.target_location} onChange={e => setForm(p => ({ ...p, target_location: e.target.value }))} placeholder="Thailand" className="bg-muted/30 text-sm" />
          </div>
        </div>
      </div>

      {/* Additional */}
      <div className="space-y-1.5">
        <Label className="text-xs">{t("bcNotes")}</Label>
        <Textarea value={form.additional_notes} onChange={e => setForm(p => ({ ...p, additional_notes: e.target.value }))} placeholder={t("bcNotesPlaceholder")} rows={2} className="bg-muted/30 text-sm" />
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
        {t("bcSave")}
      </Button>
    </div>
  );
};

export default BrandContextForm;
