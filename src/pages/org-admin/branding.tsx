/**
 * Org branding admin — upload logo and set the short name shown in the
 * workspace chrome. Lives at /app/org-admin/branding.
 *
 * Auth gate matches the rest of org-admin: signed-in + has an org
 * affiliation. We let the existing isOrgAdmin check decide who can
 * actually see the page; the underlying writes are guarded by
 * service-role on the backend so a curious user opening the page
 * directly can read but not mutate anything they shouldn't.
 *
 * Writes go through workspace_org_console so the browser never needs direct
 * table/storage write access. That keeps the branding bucket public-read but
 * admin-write only.
 */
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsOrgAdmin } from "@/hooks/useIsOrgUser";
import { useOrgBranding } from "@/hooks/useOrgBranding";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Upload, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_BRAND_LOGO,
  DEFAULT_BRAND_NAME,
} from "@/components/workspace/WorkspaceSidebar";

interface OrgRow {
  id: string;
  name?: string | null;
  display_name: string | null;
  display_name_short: string | null;
  logo_url: string | null;
  brand_color: string | null;
  settings?: Record<string, unknown> | null;
}

interface BrandingPayload {
  org: OrgRow | null;
}

async function orgConsole<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("workspace_org_console", { body });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return ((data as any)?.data ?? data) as T;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read logo file"));
    reader.readAsDataURL(file);
  });
}

export default function OrgBrandingPanel() {
  const { t: i18n } = useLanguage();
  const { user, profile } = useAuth();
  const isOrgAdmin = useIsOrgAdmin();
  const navigate = useNavigate();

  // Auth gate — same shape as org-admin/index.tsx so behaviour is
  // predictable across the section.
  if (!user) return <Navigate to="/auth" replace />;
  const profileOrgId = ((profile as any)?.organization_id ?? (profile as any)?.org_id ?? null) as string | null;

  if (!profileOrgId && !isOrgAdmin) {
    return <Navigate to="/app/workspace" replace />;
  }

  // The org id lives on profile.org_id (legacy) OR is resolvable via
  // the current host's branding. We try profile first, then host.
  const branding = useOrgBranding();
  const orgId = (profileOrgId ?? branding?.orgId) ?? null;

  if (!orgId) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10 max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/app/workspace")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> {i18n("common.backToWorkspace")}
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>{i18n("orgBranding.branding")}</CardTitle>
            <CardDescription>
              {i18n("orgBranding.noOrganizationDescription")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return <BrandingForm orgId={orgId} />;
}

function BrandingForm({ orgId }: { orgId: string }) {
  const { t: i18n } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const brandingQ = useQuery<BrandingPayload>({
    queryKey: ["org-branding-admin", orgId],
    queryFn: async () => orgConsole<BrandingPayload>({ action: "get_org_branding", organization_id: orgId }),
  });

  const org = brandingQ.data?.org ?? null;

  // Local form state — populated from the query then edited freely.
  const [shortName, setShortName] = useState("");
  const [brandColor, setBrandColor] = useState("");

  useEffect(() => {
    if (org) {
      setShortName(org.display_name_short ?? "");
      setBrandColor(org.brand_color ?? "");
    }
  }, [org?.id]);

  const saveOrgMut = useMutation({
    mutationFn: async () => {
      await orgConsole<BrandingPayload>({
        action: "save_org_branding",
        organization_id: orgId,
        display_name_short: shortName.trim() || null,
        brand_color: brandColor.trim() || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-branding-admin", orgId] });
      qc.invalidateQueries({ queryKey: ["org-branding"] });
      toast.success(i18n("orgBranding.brandingSaved"));
    },
    onError: (e: any) => toast.error(e?.message ?? i18n("orgBranding.saveFailed")),
  });

  const uploadLogoMut = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 2 * 1024 * 1024) throw new Error(i18n("orgBranding.logoFileMustBe2MbOr"));
      const logoDataUrl = await fileToDataUrl(file);
      await orgConsole<BrandingPayload>({
        action: "save_org_branding",
        organization_id: orgId,
        logo_data_url: logoDataUrl,
        logo_filename: file.name,
        logo_content_type: file.type,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-branding-admin", orgId] });
      qc.invalidateQueries({ queryKey: ["org-branding"] });
      toast.success(i18n("orgBranding.logoUploaded"));
    },
    onError: (e: any) => toast.error(e?.message ?? i18n("orgBranding.uploadFailed")),
  });

  const previewLogo = org?.logo_url ?? DEFAULT_BRAND_LOGO;
  const previewName = shortName || org?.display_name_short || org?.display_name || org?.name || DEFAULT_BRAND_NAME;

  if (brandingQ.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/app/workspace")} className="-ml-2 mb-2">
          <ArrowLeft className="h-4 w-4 mr-2" /> {i18n("common.backToWorkspace")}
        </Button>
        <h1 className="text-3xl font-bold">{i18n("orgBranding.orgBranding")}</h1>
        <p className="text-sm text-muted-foreground">
          {i18n("orgBranding.logoAndShortNameFor")} {org?.display_name ?? org?.name ?? i18n("orgBranding.yourOrganisation")}.
        </p>
      </div>

      {/* Logo + short name */}
      <Card>
        <CardHeader>
          <CardTitle>{i18n("orgBranding.identity")}</CardTitle>
          <CardDescription>{i18n("orgBranding.shownInSidebarAndOn")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-lg border bg-muted/40 flex items-center justify-center overflow-hidden">
              {previewLogo ? (
                <img src={previewLogo} alt="" className="h-full w-full object-contain" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo-file" className="cursor-pointer">
                <span
                  className={
                    "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/40 " +
                    (uploadLogoMut.isPending ? "opacity-60 pointer-events-none" : "")
                  }
                >
                  {uploadLogoMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {i18n("orgBranding.uploadLogo")}
                </span>
              </Label>
              <input
                id="logo-file"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadLogoMut.mutate(f);
                  // Allow re-selecting the same file later.
                  e.target.value = "";
                }}
              />
              <p className="text-xs text-muted-foreground">{i18n("orgBranding.pngJpgSvgWebpUpTo2")}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="short-name">{i18n("orgBranding.shortName28CharsEG")}</Label>
            <Input
              id="short-name"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              maxLength={8}
              placeholder="DMD"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="brand-color">{i18n("orgBranding.brandColourOptional")}</Label>
            <Input
              id="brand-color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              placeholder="#FF3D8E"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => saveOrgMut.mutate()}
              disabled={saveOrgMut.isPending}
            >
              {saveOrgMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {i18n("orgBranding.saveChanges")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card>
        <CardHeader>
          <CardTitle>{i18n("orgBranding.sidebarPreview")}</CardTitle>
          <CardDescription>{i18n("orgBranding.howBrandRowRendersForTenants")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-[260px] rounded-lg border bg-[hsl(0_0%_4%)] p-3">
            <div className="flex h-12 items-center px-1">
              <div className="flex items-center gap-2 text-[13.5px] font-semibold tracking-tight text-zinc-50">
                <img
                  src={previewLogo}
                  alt=""
                  className="h-[34px] w-[34px] shrink-0 select-none object-contain"
                />
                {previewName}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
