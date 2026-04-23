import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Copy, Plus, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import type { ReferralCodeRow } from "@/hooks/usePartnerStats";
import { usePerCodeStats } from "@/hooks/usePartnerStats";

interface Props {
  codes: ReferralCodeRow[] | undefined;
  loading: boolean;
  partnerCode?: string; // base 'MF-XXXXXX' code
}

const SHARE_BASE = "https://mediaforge.co/?ref=";

const LinksManager = ({ codes, loading, partnerCode }: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  // Per-code clicks/signups/earnings over last 30 days
  const statsQ = usePerCodeStats(codes, 30);
  const stats = statsQ.data ?? new Map();

  const baseCode = useMemo(() => {
    if (partnerCode) return partnerCode.replace(/^MF-/, "");
    return "PARTNER";
  }, [partnerCode]);

  const handleCreate = async () => {
    if (!user) return;
    const cleanLabel = label.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cleanLabel.length < 2) {
      toast.error("Label ต้องมีอย่างน้อย 2 ตัวอักษร");
      return;
    }
    setCreating(true);
    const newCode = `MF-P-${baseCode}-${cleanLabel}`;
    const { error } = await supabase.from("referral_codes").insert({
      user_id: user.id,
      code: newCode,
      code_type: "partner_affiliate",
      campaign_label: label.trim(),
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Campaign link created");
    setLabel("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["partner-codes"] });
  };

  const handleCopy = (code: string, id: string) => {
    const url = `${SHARE_BASE}${code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success("Link copied");
    setTimeout(() => setCopiedId(null), 1500);
  };

  const startEdit = (row: ReferralCodeRow) => {
    setEditingId(row.id);
    setEditingLabel(row.campaign_label ?? "");
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase
      .from("referral_codes")
      .update({ campaign_label: editingLabel.trim() })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["partner-codes"] });
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold" style={{ letterSpacing: "-0.02em" }}>
          My links
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1.5" /> New campaign link
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create campaign link</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="campaign-label">Label</Label>
                <Input
                  id="campaign-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. YOUTUBE, IG-BIO"
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">
                  รหัสที่จะถูกสร้าง:{" "}
                  <code className="text-foreground">
                    MF-P-{baseCode}-{(label || "LABEL").toUpperCase().replace(/[^A-Z0-9]/g, "")}
                  </code>
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : !codes || codes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          ยังไม่มี campaign link สร้างอันแรกเพื่อเริ่มติดตามผล
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Label</TableHead>
                <TableHead className="text-right">Clicks (30d)</TableHead>
                <TableHead className="text-right">Signups (30d)</TableHead>
                <TableHead className="text-right">Conv. %</TableHead>
                <TableHead className="text-right">Earnings (30d)</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((c) => {
                const s = stats.get(c.id) ?? { clicks: 0, signups: 0, earnings_thb: 0 };
                const conv = s.clicks > 0 ? `${((s.signups / s.clicks) * 100).toFixed(1)}%` : "—";
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell>
                      {editingId === c.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editingLabel}
                            onChange={(e) => setEditingLabel(e.target.value)}
                            className="h-7 text-xs"
                          />
                          <Button size="sm" className="h-7 px-2" onClick={() => saveEdit(c.id)}>
                            Save
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(c)}
                          className="flex items-center gap-1.5 text-sm hover:text-primary"
                        >
                          {c.campaign_label || <span className="text-muted-foreground">—</span>}
                          <Pencil className="w-3 h-3 opacity-50" />
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.clicks}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.signups}</TableCell>
                    <TableCell className="text-right tabular-nums">{conv}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {s.earnings_thb > 0
                        ? `฿${s.earnings_thb.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => handleCopy(c.code, c.id)}
                      >
                        {copiedId === c.id ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
};

export default LinksManager;
