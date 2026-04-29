import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, Receipt, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Billing history dialog.
 *
 * Pulls a unified invoice + one-off payment list from the
 * `stripe-list-invoices` edge function. Each row shows the date,
 * description, amount, and a link to the hosted invoice or charge
 * receipt. Free users (no stripe_customer_id) get an empty state.
 */

interface BillingRow {
  id: string;
  type: "invoice" | "payment_intent";
  description: string;
  amount_thb: number;
  currency: string;
  status: string;
  created_at: string;
  invoice_pdf_url: string | null;
  hosted_invoice_url: string | null;
  receipt_url: string | null;
}

interface BillingHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const STATUS_COLOR: Record<string, string> = {
  paid: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  succeeded: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  open: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  uncollectible: "text-red-400 bg-red-500/10 border-red-500/20",
};

const BillingHistoryDialog = ({ open, onOpenChange }: BillingHistoryDialogProps) => {
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase.functions.invoke("stripe-list-invoices");
        if (cancelled) return;
        if (err) throw new Error(err.message);
        if (data?.error) throw new Error(data.error);
        setRows(((data?.rows ?? []) as BillingRow[]));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load billing history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] p-0 overflow-hidden bg-[#0c1020] border-white/[0.08] rounded-2xl gap-0">
        <div className="px-6 pt-6 pb-3">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-zinc-50 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-violet-300" />
              Billing history
            </DialogTitle>
            <DialogDescription className="text-[11px] text-zinc-400">
              Subscription invoices and one-off top-up receipts from your Stripe account.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 pb-5">
          {loading && (
            <div className="flex items-center gap-2 py-8 justify-center text-xs text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <AlertCircle className="mt-0.5 w-3.5 h-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div className="text-center py-12">
              <Receipt className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-300 font-medium">No billing history yet</p>
              <p className="text-[11px] text-zinc-500 mt-1">
                Once you make your first payment, invoices and receipts will show up here.
              </p>
            </div>
          )}

          {!loading && !error && rows.length > 0 && (
            <div className="divide-y divide-white/5">
              {rows.map((row) => {
                const link = row.hosted_invoice_url || row.invoice_pdf_url || row.receipt_url || null;
                const statusClass = STATUS_COLOR[row.status] ?? "text-zinc-400 bg-white/5 border-white/10";
                return (
                  <div key={row.id} className="flex items-center gap-3 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-zinc-100 truncate">
                        {row.description}
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {formatDate(row.created_at)} · {row.id.slice(0, 18)}…
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border",
                        statusClass,
                      )}
                    >
                      {row.status}
                    </span>
                    <div className="text-right tabular-nums">
                      <p className="text-[13px] font-semibold text-zinc-100">
                        {row.currency} {row.amount_thb.toLocaleString()}
                      </p>
                    </div>
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-500 hover:text-zinc-100 transition-colors p-1"
                        aria-label="Open invoice"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-white/5 px-6 py-3 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-zinc-300 hover:text-zinc-50"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BillingHistoryDialog;
