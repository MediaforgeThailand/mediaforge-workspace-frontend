/**
 * ShareDialog — the actual "Share workspace" modal.
 *
 * Triggered by the Share button on CanvasHeader. Provides:
 *   • Segmented Viewer / Editor toggle (default Viewer — the safer
 *     default; you can mint a viewer link without worrying it'll
 *     accidentally let someone burn the recipient's credits).
 *   • One-line description per role so the owner knows what the
 *     other side will be able to do.
 *   • "Generate link" button — calls workspace_share_create. On
 *     success, shows the URL in a read-only input + Copy button.
 *   • A list of currently-active (non-revoked) shares with role
 *     pill, "Created X ago", Copy and Revoke buttons.
 *
 * No react-query in this codebase — uses plain useState + manual
 * fetch via supabase.functions.invoke for symmetry with the rest of
 * the workspace code.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Eye, Pencil, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { friendlyError } from "@/lib/friendlyError";

type ShareRole = "viewer" | "editor";

interface ShareRow {
  id: string;
  role: ShareRole;
  token: string;
  share_url: string;
  created_at: string;
  expires_at: string | null;
  revoked: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceName: string;
}

const ShareDialog = ({ open, onOpenChange, workspaceId, workspaceName }: Props) => {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  /** Friendly relative time for the share list ("Created 2m ago"). */
  const timeAgo = (iso: string): string => {
    const ts = new Date(iso).getTime();
    const diff = Date.now() - ts;
    if (diff < 60_000) return t("workspace.share.relative_just_now");
    if (diff < 3_600_000) return t("workspace.share.relative_minutes_ago", { n: Math.floor(diff / 60_000) });
    if (diff < 86_400_000) return t("workspace.share.relative_hours_ago", { n: Math.floor(diff / 3_600_000) });
    return t("workspace.share.relative_days_ago", { n: Math.floor(diff / 86_400_000) });
  };
  const [role, setRole] = useState<ShareRole>("viewer");
  const [generating, setGenerating] = useState(false);
  const [latestUrl, setLatestUrl] = useState<string | null>(null);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const appOrigin = () => {
    const configured =
      (import.meta.env.VITE_WORKSPACE_PUBLIC_URL as string | undefined) ||
      (import.meta.env.VITE_PUBLIC_WORKSPACE_URL as string | undefined) ||
      "https://workspace.mediaforge.co";
    const host = window.location.hostname.toLowerCase();
    const isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("127.");
    return (isLocal ? configured : window.location.origin).replace(/\/+$/, "");
  };

  /** Refresh the active-shares list. */
  const refreshList = useCallback(async () => {
    if (!workspaceId) return;
    setLoadingList(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ shares: ShareRow[] }>(
        "workspace_share_list",
        { body: { workspace_id: workspaceId, app_origin: appOrigin() } },
      );
      if (error) throw error;
      setShares(data?.shares ?? []);
    } catch (err) {
      console.error("[ShareDialog] list failed:", err);
      toast({
        title: t("workspace.share.couldnt_load"),
        description: t("workspace.share.try_again"),
        variant: "destructive",
      });
    } finally {
      setLoadingList(false);
    }
  }, [workspaceId, toast, t]);

  // Refresh whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setLatestUrl(null);
      refreshList();
    }
  }, [open, refreshList]);

  const handleGenerate = async () => {
    if (!workspaceId) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        id: string;
        token: string;
        role: ShareRole;
        expires_at: string | null;
        created_at: string;
        share_url: string;
      }>("workspace_share_create", {
        body: { workspace_id: workspaceId, role, app_origin: appOrigin() },
      });
      if (error) throw error;
      if (!data) throw new Error("Empty response");
      setLatestUrl(data.share_url);
      toast({
        title: t("workspace.share.link_generated"),
        description: t("workspace.share.link_ready", {
          role: role === "viewer" ? t("workspace.share.viewer") : t("workspace.share.editor"),
        }),
      });
      // Refresh the list so the new row appears below.
      refreshList();
    } catch (err: any) {
      console.error("[ShareDialog] generate failed:", err);
      toast({
        title: t("workspace.share.couldnt_generate"),
        description: err
          ? friendlyError(err, language === "th" ? "th" : "en")
          : t("workspace.share.try_again"),
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t("workspace.share.link_copied") });
    } catch {
      toast({
        title: t("workspace.share.copy_failed"),
        description: t("workspace.share.copy_manually"),
        variant: "destructive",
      });
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      const { error } = await supabase.functions.invoke("workspace_share_revoke", {
        body: { id },
      });
      if (error) throw error;
      toast({ title: t("workspace.share.link_revoked") });
      // Remove locally; refresh too in case anything else changed.
      setShares((s) => s.filter((r) => r.id !== id));
      refreshList();
    } catch (err: any) {
      console.error("[ShareDialog] revoke failed:", err);
      toast({
        title: t("workspace.share.couldnt_revoke"),
        description: err
          ? friendlyError(err, language === "th" ? "th" : "en")
          : t("workspace.share.try_again"),
        variant: "destructive",
      });
    } finally {
      setRevokingId(null);
    }
  };

  const description =
    role === "viewer"
      ? t("workspace.share.viewer_desc")
      : t("workspace.share.editor_desc");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[min(calc(100vw-24px),360px)] !max-w-[360px] gap-2 overflow-hidden rounded-[14px] p-3 shadow-xl shadow-black/40 [&>button.absolute]:right-3 [&>button.absolute]:top-3 [&>button.absolute_svg]:h-3.5 [&>button.absolute_svg]:w-3.5">
        <DialogHeader className="space-y-0.5 pr-5">
          <DialogTitle className="text-[15px] leading-5">{t("workspace.share.title")}</DialogTitle>
          <DialogDescription className="text-[11px] leading-4">
            {t("workspace.share.description", {
              name: workspaceName || t("workspace.share.this_workspace_fallback"),
            })}
          </DialogDescription>
        </DialogHeader>

        {/* ─── Segmented Viewer / Editor toggle ─── */}
        <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setRole("viewer")}
            className={cn(
              "flex h-7 items-center justify-center gap-1 rounded-md px-2 text-[12px] leading-none transition-colors",
              role === "viewer"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Eye className="h-3 w-3" />
            {t("workspace.share.viewer")}
          </button>
          <button
            type="button"
            onClick={() => setRole("editor")}
            className={cn(
              "flex h-7 items-center justify-center gap-1 rounded-md px-2 text-[12px] leading-none transition-colors",
              role === "editor"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Pencil className="h-3 w-3" />
            {t("workspace.share.editor")}
          </button>
        </div>

        <p className="text-[11px] leading-4 text-muted-foreground">{description}</p>

        {/* ─── Generate link button ─── */}
        <Button onClick={handleGenerate} disabled={generating} className="h-7 w-full rounded-lg text-[12px] leading-none">
          {generating ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              {t("workspace.share.generating")}
            </>
          ) : (
            t("workspace.share.generate")
          )}
        </Button>

        {/* ─── Last-generated URL ─── */}
        {latestUrl && (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <Input
              readOnly
              value={latestUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="h-7 min-w-0 truncate font-mono text-[11px]"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => handleCopy(latestUrl)}
            >
              <Copy className="mr-1 h-3 w-3" />
              {t("workspace.share.copy")}
            </Button>
          </div>
        )}

        <Separator />

        {/* ─── Active shares list ─── */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-medium text-muted-foreground">
              {t("workspace.share.active_links")}
            </h4>
            {loadingList && (
              <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
            )}
          </div>

          {!loadingList && shares.length === 0 && (
            <p className="text-[11px] italic text-muted-foreground">
              {t("workspace.share.no_active_links")}
            </p>
          )}

          <div className="max-h-40 min-w-0 space-y-1 overflow-y-auto overflow-x-hidden">
            {shares.map((s) => (
              <div
                key={s.id}
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 rounded-md border bg-card/50 px-1.5 py-1 text-[11px]"
              >
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide",
                    s.role === "viewer"
                      ? "bg-sky-500/15 text-sky-300"
                      : "bg-amber-500/15 text-amber-300",
                  )}
                >
                  {s.role}
                </span>
                <div className="min-w-0 overflow-hidden">
                  <div className="truncate font-mono text-[10.5px] text-muted-foreground">
                    {s.share_url}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70">
                    {t("workspace.share.created_relative", { time: timeAgo(s.created_at) })}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={t("workspace.share.copy_link")}
                  onClick={() => handleCopy(s.share_url)}
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
                  title={t("workspace.share.revoke_link")}
                  disabled={revokingId === s.id}
                  onClick={() => handleRevoke(s.id)}
                >
                  {revokingId === s.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareDialog;
