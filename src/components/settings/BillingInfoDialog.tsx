import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

/**
 * "Change billing information" dialog.
 *
 * Persists to `profiles.billing_address` (jsonb) so we don't have to
 * spin up a new table for what is mostly free-form merchant-of-record
 * data. Only `name` and `email` are required; address fields are
 * optional but useful for VAT-compliant invoicing later.
 *
 * No Stripe sync here — the existing customer is updated lazily next
 * time the user starts a checkout (Q's create-checkout reads the
 * profile and forwards billing details to Stripe). Keeping this
 * dialog self-contained avoids a round-trip on save.
 */

interface BillingAddress {
  name?: string;
  email?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  tax_id?: string;
}

interface BillingInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: BillingAddress | null;
  defaultName?: string | null;
  defaultEmail?: string | null;
  onSaved?: (next: BillingAddress) => void;
}

const BillingInfoDialog = ({
  open,
  onOpenChange,
  initial,
  defaultName,
  defaultEmail,
  onSaved,
}: BillingInfoDialogProps) => {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<BillingAddress>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: initial?.name ?? defaultName ?? "",
      email: initial?.email ?? defaultEmail ?? "",
      line1: initial?.line1 ?? "",
      line2: initial?.line2 ?? "",
      city: initial?.city ?? "",
      state: initial?.state ?? "",
      postal_code: initial?.postal_code ?? "",
      country: initial?.country ?? "TH",
      tax_id: initial?.tax_id ?? "",
    });
    setError(null);
  }, [open, initial, defaultName, defaultEmail]);

  const handleChange = (key: keyof BillingAddress) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.name?.trim() || !form.email?.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);
    setError(null);

    // Strip empty strings so the jsonb stays compact.
    const next: BillingAddress = {};
    Object.entries(form).forEach(([k, v]) => {
      if (typeof v === "string" && v.trim()) {
        (next as Record<string, string>)[k] = v.trim();
      }
    });

    const { error: err } = await supabase
      .from("profiles")
      // billing_address column was added in 20260429190000_profiles_billing_settings_columns
      .update({ billing_address: next as unknown as never })
      .eq("user_id", user.id);

    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

    toast({ title: "Billing information saved" });
    await refreshProfile();
    onSaved?.(next);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] p-0 overflow-hidden bg-[#0c1020] border-white/[0.08] rounded-2xl gap-0">
        <div className="px-6 pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-zinc-50">
              Change billing information
            </DialogTitle>
            <DialogDescription className="text-[11px] text-zinc-400">
              Used on receipts and invoices. Tax ID is optional but required for B2B VAT-compliant invoicing.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px] text-zinc-400">Name</Label>
              <Input
                value={form.name ?? ""}
                onChange={handleChange("name")}
                className="h-9 bg-black/30 border-white/10 text-zinc-100"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px] text-zinc-400">Email</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={handleChange("email")}
                className="h-9 bg-black/30 border-white/10 text-zinc-100"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px] text-zinc-400">Address line 1</Label>
              <Input
                value={form.line1 ?? ""}
                onChange={handleChange("line1")}
                className="h-9 bg-black/30 border-white/10 text-zinc-100"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px] text-zinc-400">Address line 2 (optional)</Label>
              <Input
                value={form.line2 ?? ""}
                onChange={handleChange("line2")}
                className="h-9 bg-black/30 border-white/10 text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-zinc-400">City</Label>
              <Input
                value={form.city ?? ""}
                onChange={handleChange("city")}
                className="h-9 bg-black/30 border-white/10 text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-zinc-400">Postal code</Label>
              <Input
                value={form.postal_code ?? ""}
                onChange={handleChange("postal_code")}
                className="h-9 bg-black/30 border-white/10 text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-zinc-400">State / Province</Label>
              <Input
                value={form.state ?? ""}
                onChange={handleChange("state")}
                className="h-9 bg-black/30 border-white/10 text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-zinc-400">Country (ISO 2)</Label>
              <Input
                value={form.country ?? ""}
                onChange={handleChange("country")}
                maxLength={2}
                className="h-9 bg-black/30 border-white/10 text-zinc-100 uppercase"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px] text-zinc-400">Tax ID (optional)</Label>
              <Input
                value={form.tax_id ?? ""}
                onChange={handleChange("tax_id")}
                placeholder="e.g. 0123456789012"
                className="h-9 bg-black/30 border-white/10 text-zinc-100"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-[11px] text-red-300">
              <AlertCircle className="mt-0.5 w-3.5 h-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="border-t border-white/5 px-6 py-3 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-zinc-400"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-violet-600 hover:bg-violet-500 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 mr-1.5" />
                Save
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BillingInfoDialog;
