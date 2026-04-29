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

/** Friendly relative time for the share list ("Created 2m ago"). */
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const ShareDialog = ({ open, onOpenChange, workspaceId, workspaceName }: Props) => {
  const { toast } = useToast();
  const [role, setRole] = useState<ShareRole>("viewer");
  const [generating, setGenerating] = useState(false);
  const [latestUrl, setLatestUrl] = useState<string | null>(null);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  /** Refresh the active-shares list. */
  const refreshList = useCallback(async () => {
    if (!workspaceId) return;
    setLoadingList(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ shares: ShareRow[] }>(
        "workspace_share_list",
        { body: { workspace_id: workspaceId } },
      );
      if (error) throw error;
      setShares(data?.shares ?? []);
    } catch (err) {
      console.error("[ShareDialog] list failed:", err);
      toast({
        title: "Couldn't load share links",
        description: "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoadingList(false);
    }
  }, [workspaceId, toast]);

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
        body: { workspace_id: workspaceId, role },
      });
      if (error) throw error;
      if (!data) throw new Error("Empty response");
      setLatestUrl(data.share_url);
      toast({
        title: "Share link generated",
        description: `${role === "viewer" ? "Viewer" : "Editor"} link is ready to copy.`,
      });
      // Refresh the list so the new row appears below.
      refreshList();
    } catch (err: any) {
      console.error("[ShareDialog] generate failed:", err);
      toast({
        title: "Couldn't generate link",
        description: err?.message ?? "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied" });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the URL and copy manually.",
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
      toast({ title: "Link revoked" });
      // Remove locally; refresh too in case anything else changed.
      setShares((s) => s.filter((r) => r.id !== id));
      refreshList();
    } catch (err: any) {
      console.error("[ShareDialog] revoke failed:", err);
      toast({
        title: "Couldn't revoke link",
        description: err?.message ?? "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setRevokingId(null);
    }
  };

  const description =
    role === "viewer"
      ? "Anyone with the link can view this workspace. Sign-in required. They can't edit or run nodes."
      : "Anyone with the link can edit + run. Runs deduct from THEIR credit balance, not yours. Their layout changes don't save back to your workspace.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Share workspace</DialogTitle>
          <DialogDescription className="text-xs">
            Mint a link for "{workspaceName || "this workspace"}". Active links are listed below — revoke any time.
          </DialogDescription>
        </DialogHeader>

        {/* ─── Segmented Viewer / Editor toggle ─── */}
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setRole("viewer")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors",
              role === "viewer"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            Viewer
          </button>
          <button
            type="button"
            onClick={() => setRole("editor")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors",
              role === "editor"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Pencil className="h-3.5 w-3.5" />
            Editor
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>

        {/* ─── Generate link button ─── */}
        <Button onClick={handleGenerate} disabled={generating} className="w-full">
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            "Generate link"
          )}
        </Button>

        {/* ─── Last-generated URL ─── */}
        {latestUrl && (
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={latestUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleCopy(latestUrl)}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copy
            </Button>
          </div>
        )}

        <Separator />

        {/* ─── Active shares list ─── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-muted-foreground">
              Active links
            </h4>
            {loadingList && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>

          {!loadingList && shares.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              No active links yet.
            </p>
          )}

          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {shares.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-md border bg-card/50 px-2.5 py-2 text-xs"
              >
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    s.role === "viewer"
                      ? "bg-sky-500/15 text-sky-300"
                      : "bg-amber-500/15 text-amber-300",
                  )}
                >
                  {s.role}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {s.share_url}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground/70">
                    Created {timeAgo(s.created_at)}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Copy link"
                  onClick={() => handleCopy(s.share_url)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
                  title="Revoke link"
                  disabled={revokingId === s.id}
                  onClick={() => handleRevoke(s.id)}
                >
                  {revokingId === s.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
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
