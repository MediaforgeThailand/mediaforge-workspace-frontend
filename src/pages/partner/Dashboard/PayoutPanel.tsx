import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import type { CommissionEvent, PayoutRequestRow } from "@/hooks/usePartnerStats";

interface PayoutLineItem {
  id: string;
  created_at: string;
  commission_amount_thb: number;
  gross_amount_thb: number;
  billing_cycle: string | null;
}

interface Props {
  commissions: CommissionEvent[] | undefined;
  payouts: PayoutRequestRow[] | undefined;
  loading: boolean;
}

const STATUS_TONE: Record<PayoutRequestRow["status"], string> = {
  pending: "bg-muted text-muted-foreground",
  processing: "bg-primary/15 text-primary border-primary/30",
  paid: "bg-primary/15 text-primary border-primary/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground",
};

const fmt = (v: number) =>
  `฿ ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PayoutPanel = ({ commissions, payouts, loading }: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [details, setDetails] = useState<PayoutRequestRow | null>(null);
  const [lineItems, setLineItems] = useState<PayoutLineItem[] | null>(null);
  const [lineItemsLoading, setLineItemsLoading] = useState(false);

  // Load line items when opening details dialog
  useEffect(() => {
    if (!details?.commission_ids?.length) {
      setLineItems(null);
      return;
    }
    let cancelled = false;
    setLineItemsLoading(true);
    supabase
      .from("commission_events")
      .select("id, created_at, commission_amount_thb, gross_amount_thb, billing_cycle")
      .in("id", details.commission_ids)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLineItemsLoading(false);
        if (error) {
          toast.error("ไม่สามารถโหลดรายละเอียด commission");
          return;
        }
        setLineItems((data ?? []) as PayoutLineItem[]);
      });
    return () => {
      cancelled = true;
    };
  }, [details?.id]);

  const availableEvents = useMemo(
    () => (commissions ?? []).filter((c) => c.status === "available"),
    [commissions],
  );
  const available = availableEvents.reduce(
    (s, c) => s + Number(c.commission_amount_thb),
    0,
  );

  const canRequest = available >= 500;

  const openDialog = () => {
    setAmount(available.toFixed(2));
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!user) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 500) {
      toast.error("จำนวนเงินขั้นต่ำคือ 500 บาท");
      return;
    }
    if (amt > available) {
      toast.error("จำนวนเงินเกิน available balance");
      return;
    }
    setSubmitting(true);

    // Fetch bank info from partner_applications
    const { data: app } = await supabase
      .from("partner_applications")
      .select("bank_name, bank_account_no, bank_account_name")
      .eq("user_id", user.id)
      .maybeSingle();

    // Pick commission_ids in FIFO until amount covered
    let remaining = amt;
    const ids: string[] = [];
    for (const c of [...availableEvents].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )) {
      if (remaining <= 0) break;
      ids.push(c.id);
      remaining -= Number(c.commission_amount_thb);
    }

    const { error } = await supabase.from("payout_requests").insert({
      partner_user_id: user.id,
      amount_thb: amt,
      commission_ids: ids,
      bank_snapshot: app ?? {},
      status: "pending",
    });

    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Payout request submitted");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["payout-requests"] });
  };

  return (
    <div className="space-y-4">
      <Card className="p-6 border-primary/30 border-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                Available for payout
              </p>
              {loading ? (
                <Skeleton className="h-8 w-32 mt-1" />
              ) : (
                <p
                  className="text-3xl font-bold tabular-nums"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  {fmt(available)}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                ขั้นต่ำการถอน 500 บาท
              </p>
            </div>
          </div>
          <Button onClick={openDialog} disabled={!canRequest} size="lg">
            Request payout
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-base font-semibold" style={{ letterSpacing: "-0.02em" }}>
          Payout history
        </h2>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : !payouts || payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            ยังไม่มีการถอนเงิน
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">
                      {new Date(p.requested_at).toLocaleDateString("th-TH")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {fmt(Number(p.amount_thb))}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_TONE[p.status]} variant="outline">
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setDetails(p)}
                      >
                        View details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Request dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request payout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Available</span>
                <span className="tabular-nums font-medium">{fmt(available)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Commissions</span>
                <span className="tabular-nums">{availableEvents.length} events</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (THB)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="500"
                max={available}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                เงินจะถูกโอนเข้าบัญชีธนาคารที่ลงทะเบียนใน Partner application
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details dialog */}
      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payout details</DialogTitle>
          </DialogHeader>
          {details && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Requested</span>
                  <span>{new Date(details.requested_at).toLocaleString("th-TH")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium tabular-nums">
                    {fmt(Number(details.amount_thb))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className={STATUS_TONE[details.status]} variant="outline">
                    {details.status}
                  </Badge>
                </div>
                {details.processed_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processed</span>
                    <span>{new Date(details.processed_at).toLocaleString("th-TH")}</span>
                  </div>
                )}
              </div>

              {details.failure_reason && (
                <div className="rounded border-l-2 border-destructive bg-destructive/5 p-2">
                  <p className="font-semibold text-destructive">Failure reason</p>
                  <p className="text-muted-foreground mt-0.5">{details.failure_reason}</p>
                </div>
              )}

              {/* Bank snapshot */}
              {details.bank_snapshot && Object.keys(details.bank_snapshot).length > 0 && (
                <div className="rounded-md border p-3 space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                    โอนเข้าบัญชี
                  </p>
                  {(details.bank_snapshot as any).bank_name && (
                    <p className="text-sm">
                      {(details.bank_snapshot as any).bank_name}
                    </p>
                  )}
                  {(details.bank_snapshot as any).bank_account_name && (
                    <p className="text-xs text-muted-foreground">
                      {(details.bank_snapshot as any).bank_account_name}
                    </p>
                  )}
                  {(details.bank_snapshot as any).bank_account_no && (
                    <p className="font-mono text-xs text-muted-foreground">
                      {(details.bank_snapshot as any).bank_account_no}
                    </p>
                  )}
                </div>
              )}

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                    Line items ({details.commission_ids?.length ?? 0})
                  </p>
                </div>
                {lineItemsLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : lineItems && lineItems.length > 0 ? (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-xs">Date</TableHead>
                          <TableHead className="h-8 text-xs">Cycle</TableHead>
                          <TableHead className="h-8 text-xs text-right">Gross</TableHead>
                          <TableHead className="h-8 text-xs text-right">Commission</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineItems.map((li) => (
                          <TableRow key={li.id}>
                            <TableCell className="text-xs py-1.5">
                              {new Date(li.created_at).toLocaleDateString("th-TH")}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground py-1.5">
                              {li.billing_cycle ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums text-right py-1.5">
                              {fmt(Number(li.gross_amount_thb))}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums font-medium text-right py-1.5">
                              {fmt(Number(li.commission_amount_thb))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    ไม่มีรายละเอียด line items
                  </p>
                )}
              </div>

              {details.proof_url && (
                <a
                  href={details.proof_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline text-sm inline-block"
                >
                  View proof of payment
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PayoutPanel;
