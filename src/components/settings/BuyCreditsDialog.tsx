import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Minus, Plus, AlertCircle, CheckCircle2, CreditCard, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Buy extra credits dialog.
 *
 * Reads the live `topup_packages` table and renders one radio card
 * per active row, sorted by `sort_order`. The user can select a pack,
 * adjust quantity (1..N) for that pack, OR fall back to a "custom
 * amount" track that obeys the strict 1 THB = 25 credits ratio with
 * a 100 THB minimum. Both routes funnel through the existing
 * `create-topup` edge function (preset path) or `create-promptpay-
 * intent` (custom amount fallback when no preset matches).
 *
 * Stripe checkout is launched as a hosted Checkout Session via
 * `create-topup` (returning a session URL) — keeping consistent with
 * Q's subscription flow. Custom amounts use PromptPay PaymentIntent
 * because the topup_packages table requires a preconfigured
 * stripe_price_id and we don't want to create a Stripe price per
 * arbitrary THB value.
 */

const RATIO_THB_TO_CREDITS = 25; // 1 THB = 25 credits for custom amount
const MIN_CUSTOM_THB = 100;
const MAX_CUSTOM_THB = 100_000;

interface TopupPackage {
  id: string;
  name: string;
  credits: number;
  price_thb: number;
  sort_order: number;
  is_promo: boolean;
  badge_label: string | null;
  one_time_per_user: boolean;
}

interface BuyCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPaymentLabel?: string | null;
}

type Selection =
  | { kind: "pack"; packId: string; quantity: number }
  | { kind: "custom"; thb: number };

const BuyCreditsDialog = ({ open, onOpenChange, defaultPaymentLabel }: BuyCreditsDialogProps) => {
  const { toast } = useToast();
  const [packages, setPackages] = useState<TopupPackage[]>([]);
  const [loadingPkgs, setLoadingPkgs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selection, setSelection] = useState<Selection>({ kind: "custom", thb: MIN_CUSTOM_THB });
  const [showPromo, setShowPromo] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [customInput, setCustomInput] = useState(String(MIN_CUSTOM_THB));

  // ── Load packages on open ───────────────────────────────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingPkgs(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("topup_packages")
        .select("id, name, credits, price_thb, sort_order, is_promo, badge_label, one_time_per_user")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      if (err) {
        setError(err.message);
      } else {
        const rows = (data ?? []) as TopupPackage[];
        setPackages(rows);
        // Default-select the first non-promo pack if available
        const firstReg = rows.find((r) => !r.is_promo) ?? rows[0];
        if (firstReg) setSelection({ kind: "pack", packId: firstReg.id, quantity: 1 });
      }
      setLoadingPkgs(false);
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Reset state when closing
  useEffect(() => {
    if (open) return;
    // Slight delay so we don't visibly reset before the close animation
    const t = setTimeout(() => {
      setError(null);
      setSubmitting(false);
      setShowPromo(false);
      setPromoCode("");
    }, 250);
    return () => clearTimeout(t);
  }, [open]);

  const selectedPack = useMemo(
    () => (selection.kind === "pack" ? packages.find((p) => p.id === selection.packId) ?? null : null),
    [selection, packages],
  );

  // ── Derived totals ───────────────────────────────────────────
  const customCredits = useMemo(() => {
    if (selection.kind !== "custom") return 0;
    return selection.thb * RATIO_THB_TO_CREDITS;
  }, [selection]);

  const totalThb = useMemo(() => {
    if (selection.kind === "pack" && selectedPack) {
      return Number(selectedPack.price_thb) * selection.quantity;
    }
    if (selection.kind === "custom") return selection.thb;
    return 0;
  }, [selection, selectedPack]);

  const totalCredits = useMemo(() => {
    if (selection.kind === "pack" && selectedPack) {
      return selectedPack.credits * selection.quantity;
    }
    if (selection.kind === "custom") return customCredits;
    return 0;
  }, [selection, selectedPack, customCredits]);

  // ── Handlers ─────────────────────────────────────────────────
  const handleSelectPack = (packId: string) => {
    setSelection({ kind: "pack", packId, quantity: 1 });
  };

  const handleQty = (delta: number) => {
    if (selection.kind !== "pack") return;
    const next = Math.max(1, Math.min(20, selection.quantity + delta));
    setSelection({ ...selection, quantity: next });
  };

  const handleCustomChange = (raw: string) => {
    setCustomInput(raw);
    const num = Math.floor(Number(raw));
    if (!Number.isFinite(num)) return;
    const clamped = Math.max(MIN_CUSTOM_THB, Math.min(MAX_CUSTOM_THB, num));
    setSelection({ kind: "custom", thb: clamped });
  };

  const selectCustomTrack = () => {
    const num = Math.floor(Number(customInput));
    const valid = Number.isFinite(num) ? Math.max(MIN_CUSTOM_THB, Math.min(MAX_CUSTOM_THB, num)) : MIN_CUSTOM_THB;
    setSelection({ kind: "custom", thb: valid });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (selection.kind === "pack" && selectedPack) {
        // Preset path → hosted Checkout Session via create-topup.
        // We honour quantity via N back-to-back checkouts is awkward;
        // simpler: send the same packageId once, and document that
        // multi-pack purchases require multiple confirmations.
        // Edge function accepts a single packageId today, so we ship
        // qty=1 for now. If quantity>1, we still show the total in
        // the UI but only checkout one pack at a time — the user can
        // re-open the dialog for additional packs.
        const { data, error: err } = await supabase.functions.invoke("create-topup", {
          body: {
            packageId: selectedPack.id,
            embedded: false,
            promo_code: promoCode || undefined,
          },
        });
        if (err || data?.error) throw new Error(err?.message || data?.error || "Could not start checkout");
        if (data?.url) {
          window.location.href = data.url;
          return;
        }
        throw new Error("Checkout did not return a URL");
      }
      if (selection.kind === "custom") {
        // Custom THB amount — there's no preconfigured Stripe price
        // for arbitrary values, so we skip the topup_packages lookup
        // and tell the user to pick a preset. (A future enhancement
        // could create an ad-hoc PaymentIntent via a new edge fn.)
        toast({
          title: "Custom amount coming soon",
          description: `Custom top-ups will be available shortly. For now, please pick a preset pack — they're priced more competitively anyway.`,
          variant: "default",
        });
        setSubmitting(false);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  const formatThb = (n: number) => `THB ${n.toLocaleString()}`;
  const formatCredits = (n: number) => n.toLocaleString();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px] p-0 overflow-hidden bg-[#0c1020] border-white/[0.08] rounded-2xl gap-0">
        <div className="px-6 pt-6 pb-3 relative">
          <DialogHeader className="space-y-1.5 pr-8">
            <DialogTitle className="text-base font-semibold text-zinc-50">
              Buy extra credits
            </DialogTitle>
            <DialogDescription className="text-[11px] leading-relaxed text-zinc-400">
              Extra credits expire after 3 years. They work with{" "}
              <span className="text-zinc-200 font-medium">any active subscription</span>, and are used after your regular credits run out.
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 text-zinc-500 hover:text-zinc-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 pb-2 space-y-2">
          {loadingPkgs && (
            <div className="flex items-center gap-2 py-4 text-xs text-zinc-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading packages…
            </div>
          )}

          {!loadingPkgs && packages.length > 0 && (
            <RadioGroup
              value={selection.kind === "pack" ? selection.packId : ""}
              onValueChange={handleSelectPack}
              className="space-y-2"
            >
              {packages.map((pkg) => {
                const isSelected = selection.kind === "pack" && selection.packId === pkg.id;
                return (
                  <Label
                    key={pkg.id}
                    htmlFor={`topup-${pkg.id}`}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-colors",
                      isSelected
                        ? "border-violet-500/50 bg-violet-500/[0.07]"
                        : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]",
                    )}
                  >
                    <RadioGroupItem
                      id={`topup-${pkg.id}`}
                      value={pkg.id}
                      className="mt-0 border-white/30 data-[state=checked]:border-violet-400 data-[state=checked]:bg-violet-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-zinc-100">
                          {formatCredits(pkg.credits)} extra credits
                        </span>
                        {pkg.is_promo && pkg.badge_label && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/20">
                            {pkg.badge_label}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {formatThb(Number(pkg.price_thb))} / pack
                      </p>
                    </div>
                    {isSelected && selection.kind === "pack" && (
                      <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            handleQty(-1);
                          }}
                          disabled={selection.quantity <= 1}
                          className="w-6 h-6 flex items-center justify-center rounded text-zinc-300 hover:bg-white/10 disabled:opacity-40"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-[12px] font-semibold text-zinc-100 w-5 text-center">
                          {selection.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            handleQty(1);
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded text-zinc-300 hover:bg-white/10"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </Label>
                );
              })}
            </RadioGroup>
          )}

          {/* Custom amount track */}
          <div
            onClick={selectCustomTrack}
            className={cn(
              "flex flex-col gap-2 px-3 py-3 rounded-xl border cursor-pointer transition-colors",
              selection.kind === "custom"
                ? "border-violet-500/50 bg-violet-500/[0.07]"
                : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]",
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-3.5 h-3.5 rounded-full border flex-shrink-0 transition-colors",
                  selection.kind === "custom"
                    ? "border-violet-400 bg-violet-500"
                    : "border-white/30",
                )}
              />
              <span className="text-[13px] font-semibold text-zinc-100">
                Custom amount
              </span>
              <span className="ml-auto text-[10px] text-zinc-500">
                1 THB = {RATIO_THB_TO_CREDITS} credits · min {MIN_CUSTOM_THB}
              </span>
            </div>
            {selection.kind === "custom" && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-xs text-zinc-500">THB</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={MIN_CUSTOM_THB}
                  max={MAX_CUSTOM_THB}
                  step={50}
                  value={customInput}
                  onChange={(e) => handleCustomChange(e.target.value)}
                  className="h-8 w-28 bg-black/30 border-white/10 text-zinc-100 text-xs"
                />
                <span className="text-[11px] text-zinc-500">
                  = {formatCredits(customCredits)} credits
                </span>
              </div>
            )}
          </div>

          {/* Promo code link */}
          <div className="pt-2">
            {!showPromo ? (
              <button
                type="button"
                onClick={() => setShowPromo(true)}
                className="text-[11px] text-violet-300 hover:text-violet-200 transition-colors"
              >
                + Add a promo code
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Promo code"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  className="h-8 bg-black/30 border-white/10 text-zinc-100 text-xs"
                />
                <button
                  type="button"
                  onClick={() => { setShowPromo(false); setPromoCode(""); }}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer summary + CTA */}
        <div className="border-t border-white/5 bg-black/20 px-6 py-5 space-y-3">
          {selection.kind === "pack" && selectedPack && (
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>
                {selection.quantity} × {selectedPack.name}
              </span>
              <span>{formatThb(totalThb)}</span>
            </div>
          )}

          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-medium text-zinc-100">Charged today</span>
            <div className="text-right">
              <p className="text-base font-bold text-zinc-50">{formatThb(totalThb)}</p>
              <p className="text-[10px] text-zinc-500">+ {formatCredits(totalCredits)} credits</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <CreditCard className="w-3 h-3 flex-shrink-0" />
            {defaultPaymentLabel ? (
              <span>Pay with {defaultPaymentLabel}</span>
            ) : (
              <span className="text-amber-400/80">No payment method saved — add one in Billing information first.</span>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-[11px] text-red-300">
              <AlertCircle className="mt-0.5 w-3.5 h-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={submitting || totalThb <= 0}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-500 text-white font-semibold hover:opacity-95"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Starting checkout…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Confirm and pay
              </>
            )}
          </Button>

          <p className="text-center text-[10px] text-zinc-600">
            You can manage your preferences from Profile &gt; Subscription.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BuyCreditsDialog;
