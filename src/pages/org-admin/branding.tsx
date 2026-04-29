/**
 * Org branding admin — upload logo, set short name, manage subdomain
 * mappings. Lives at /app/org-admin/branding.
 *
 * Auth gate matches the rest of org-admin: signed-in + has an org
 * affiliation. We let the existing isOrgAdmin check decide who can
 * actually see the page; the underlying writes are guarded by
 * service-role on the backend so a curious user opening the page
 * directly can read but not mutate anything they shouldn't.
 *
 * The page is wired against the workspace DB tables created in
 * 20260429220000_org_domains_branding.sql:
 *   - sso_organizations (display_name_short, logo_url, brand_color)
 *   - org_domains       (hostname, is_primary)
 *   - storage bucket    org-branding (public read)
 */
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useIsOrgAdmin } from "@/hooks/useIsOrgUser";
import { useOrgBranding } from "@/hooks/useOrgBranding";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Upload, Trash2, Plus, Star, Globe, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_BRAND_LOGO,
  DEFAULT_BRAND_NAME,
} from "@/components/workspace/WorkspaceSidebar";

interface OrgRow {
  id: string;
  display_name: string;
  display_name_short: string | null;
  logo_url: string | null;
  brand_color: string | null;
  primary_domain: string;
}

interface DomainRow {
  id: string;
  hostname: string;
  is_primary: boolean;
}

export default function OrgBrandingPanel() {
  const { user, profile } = useAuth();
  const isOrgAdmin = useIsOrgAdmin();
  const navigate = useNavigate();

  // Auth gate — same shape as org-admin/index.tsx so behaviour is
  // predictable across the section.
  if (!user) return <Navigate to="/auth" replace />;
  if (!profile?.org_id && !isOrgAdmin) {
    return <Navigate to="/app/workspace" replace />;
  }

  // The org id lives on profile.org_id (legacy) OR is resolvable via
  // the current host's branding. We try profile first, then host.
  const branding = useOrgBranding();
  const orgId = (profile?.org_id ?? branding?.orgId) ?? null;

  if (!orgId) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10 max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/app/workspace")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Workspace
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
            <CardDescription>
              No organisation is linked to your account yet. Ask an admin
              to add you to an org, then come back to manage branding.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return <BrandingForm orgId={orgId} />;
}

function BrandingForm({ orgId }: { orgId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const orgQ = useQuery<OrgRow | null>({
    queryKey: ["org-branding-row", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sso_organizations" as any)
        .select("id, display_name, display_name_short, logo_url, brand_color, primary_domain")
        .eq("id", orgId)
        .maybeSingle();
      return (data as any) ?? null;
    },
  });

  const domainsQ = useQuery<DomainRow[]>({
    queryKey: ["org-branding-domains", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("org_domains" as any)
        .select("id, hostname, is_primary")
        .eq("org_id", orgId)
        .order("is_primary", { ascending: false });
      return ((data as any) ?? []) as DomainRow[];
    },
  });

  // Local form state — populated from the query then edited freely.
  const [shortName, setShortName] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [newHostname, setNewHostname] = useState("");

  useEffect(() => {
    if (orgQ.data) {
      setShortName(orgQ.data.display_name_short ?? "");
      setBrandColor(orgQ.data.brand_color ?? "");
    }
  }, [orgQ.data?.id]);

  const saveOrgMut = useMutation({
    mutationFn: async (patch: Partial<OrgRow>) => {
      const { error } = await supabase
        .from("sso_organizations" as any)
        .update(patch)
        .eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-branding-row", orgId] });
      qc.invalidateQueries({ queryKey: ["org-branding"] });
      toast.success("Branding saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const uploadLogoMut = useMutation({
    mutationFn: async (file: File) => {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${orgId}/logo.${ext}`;
      // upsert so re-uploads cleanly replace the old logo without
      // leaving orphaned objects under different extensions.
      const { error: upErr } = await supabase.storage
        .from("org-branding")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from("org-branding")
        .getPublicUrl(path);
      // Cache-bust on the URL so the chrome refreshes immediately.
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const { error: updErr } = await supabase
        .from("sso_organizations" as any)
        .update({ logo_url: url })
        .eq("id", orgId);
      if (updErr) throw updErr;
      return url;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-branding-row", orgId] });
      qc.invalidateQueries({ queryKey: ["org-branding"] });
      toast.success("Logo uploaded");
    },
    onError: (e: any) => toast.error(e?.message ?? "Upload failed"),
  });

  const addDomainMut = useMutation({
    mutationFn: async (host: string) => {
      const lower = host.trim().toLowerCase();
      if (!lower) throw new Error("Hostname is required");
      // Reject obvious bad input client-side; the unique index does the
      // last-mile dedupe across orgs.
      if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(lower)) {
        throw new Error("Hostname must be a valid DNS name");
      }
      const isFirst = (domainsQ.data ?? []).length === 0;
      const { error } = await supabase
        .from("org_domains" as any)
        .insert({
          org_id: orgId,
          hostname: lower,
          is_primary: isFirst, // first domain is auto-primary
        });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewHostname("");
      qc.invalidateQueries({ queryKey: ["org-branding-domains", orgId] });
      toast.success("Domain added");
    },
    onError: (e: any) => toast.error(e?.message ?? "Add failed"),
  });

  const removeDomainMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("org_domains" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-branding-domains", orgId] });
      toast.success("Domain removed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Remove failed"),
  });

  const setPrimaryMut = useMutation({
    mutationFn: async (id: string) => {
      // The unique partial index forbids two primaries — clear all
      // first, then set the chosen one. Two round-trips, but this
      // page mutates rarely enough that batching isn't worth a stored
      // procedure.
      const { error: clearErr } = await supabase
        .from("org_domains" as any)
        .update({ is_primary: false })
        .eq("org_id", orgId);
      if (clearErr) throw clearErr;
      const { error: setErr } = await supabase
        .from("org_domains" as any)
        .update({ is_primary: true })
        .eq("id", id);
      if (setErr) throw setErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-branding-domains", orgId] });
      toast.success("Primary domain updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const previewLogo = orgQ.data?.logo_url ?? DEFAULT_BRAND_LOGO;
  const previewName = shortName || orgQ.data?.display_name_short || orgQ.data?.display_name || DEFAULT_BRAND_NAME;

  if (orgQ.isLoading) {
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
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Workspace
        </Button>
        <h1 className="text-3xl font-bold">Org Branding</h1>
        <p className="text-sm text-muted-foreground">
          Logo, short name, and subdomains for {orgQ.data?.display_name ?? "your organisation"}.
        </p>
      </div>

      {/* Logo + short name */}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Shown in the sidebar and on the login screen.</CardDescription>
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
                  Upload logo
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
              <p className="text-xs text-muted-foreground">PNG / JPG / SVG / WEBP, up to 2 MB.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="short-name">Short name (2–8 chars, e.g. &quot;DMD&quot;)</Label>
            <Input
              id="short-name"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              maxLength={8}
              placeholder="DMD"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="brand-color">Brand colour (optional)</Label>
            <Input
              id="brand-color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              placeholder="#FF3D8E"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() =>
                saveOrgMut.mutate({
                  display_name_short: shortName.trim() || null,
                  brand_color: brandColor.trim() || null,
                } as any)
              }
              disabled={saveOrgMut.isPending}
            >
              {saveOrgMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card>
        <CardHeader>
          <CardTitle>Sidebar preview</CardTitle>
          <CardDescription>How the brand row renders for tenants on this org.</CardDescription>
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

      {/* Domain manager */}
      <Card>
        <CardHeader>
          <CardTitle>Subdomains</CardTitle>
          <CardDescription>
            Hostnames that should show this org&rsquo;s branding (e.g. <code>dmd.mediaforge.co</code>).
            DNS still has to point at the workspace app — adding it here only registers the brand swap.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newHostname}
              onChange={(e) => setNewHostname(e.target.value)}
              placeholder="dmd.mediaforge.co"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newHostname.trim()) addDomainMut.mutate(newHostname);
              }}
            />
            <Button
              onClick={() => addDomainMut.mutate(newHostname)}
              disabled={addDomainMut.isPending || !newHostname.trim()}
            >
              {addDomainMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add
            </Button>
          </div>

          <div className="rounded-md border divide-y">
            {(domainsQ.data ?? []).length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                No subdomains registered yet.
              </div>
            ) : (
              (domainsQ.data ?? []).map((d) => (
                <div key={d.id} className="flex items-center gap-3 p-3">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-sm flex-1">{d.hostname}</span>
                  {d.is_primary ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                      <Star className="h-3 w-3" /> Primary
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPrimaryMut.mutate(d.id)}
                      disabled={setPrimaryMut.isPending}
                    >
                      Set primary
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeDomainMut.mutate(d.id)}
                    disabled={removeDomainMut.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
