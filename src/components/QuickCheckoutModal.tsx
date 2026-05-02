import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, Loader2, Sparkles, Crown } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { phCreditsPurchased, phSubscriptionStarted, phCheckoutAbandoned } from "@/lib/posthogEvents";
import EmbeddedCheckoutModal from "./EmbeddedCheckoutModal";

interface QuickCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: number;
  requiredCredits?: number;
}

/* ─── Real package / plan IDs from the database ─── */
const HERO_TOPUP = {
  id: "7b77c102-fc79-46f8-80eb-03ee206a242d", // Top-up M
  name: "Quick Starter Pack",
  credits: 2_500,
  originalPrice: 199,
  promoPrice: 99,
  stripePriceId: "price_1T1kdm97qpzc2aQtQr8WyfMK",
};

const STANDARD_TOPUP = {
  id: "bc959c8b-9507-4d1a-89ad-b4babf05643e", // Top-up L
  name: "Standard Refill",
  credits: 5_000,
  price: 250,
  stripePriceId: "price_1T1kdn97qpzc2aQtsFP4blEn",
};

const PRO_SUB = {
  id: "e5971003-150e-4140-a5c3-5dfb4c61595e", // Professional monthly
  name: "Professional",
  credits: 248_750,
  price: 1_990,
  stripePriceId: "price_1TKKj797qpzc2aQtTzwdcU0E",
};

const QuickCheckoutModal = ({
  open,
  onOpenChange,
  currentBalance,
  requiredCredits,
}: QuickCheckoutModalProps) => {
  const { language, t } = useLanguage();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedPkgId, setSelectedPkgId] = useState("");
  const [checkoutMode, setCheckoutMode] = useState<"subscription" | "topup">("topup");
  const [proPlan, setProPlan] = useState(PRO_SUB);

  useEffect(() => {
    let mounted = true;

    const loadProPlan = async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("id, name, upfront_credits, price_thb, stripe_price_id")
        .eq("is_active", true)
        .eq("billing_cycle", "monthly")
        .eq("name", "Professional")
        .maybeSingle();

      if (!mounted || !data?.id) return;

      setProPlan({
        id: data.id,
        name: data.name,
        credits: Number(data.upfront_credits ?? PRO_SUB.credits),
        price: Number(data.price_thb ?? PRO_SUB.price),
        stripePriceId: data.stripe_price_id ?? PRO_SUB.stripePriceId,
      });
    };

    void loadProPlan();

    return () => {
      mounted = false;
    };
  }, []);

  const shortage = requiredCredits ? requiredCredits - currentBalance : 0;

  const handlePurchase = (pkgId: string, mode: "topup" | "subscription") => {
    setLoadingId(pkgId);
    setSelectedPkgId(pkgId);
    setCheckoutMode(mode === "subscription" ? "subscription" : "topup");
    setCheckoutOpen(true);

    // Track checkout initiated
    const pkg = pkgId === HERO_TOPUP.id ? HERO_TOPUP : pkgId === STANDARD_TOPUP.id ? STANDARD_TOPUP : proPlan;
    if (mode === "subscription") {
      phSubscriptionStarted({ plan: pkg.name, interval: "monthly" });
    } else {
      phCreditsPurchased({ amount_thb: "price" in pkg ? pkg.price : (pkg as typeof HERO_TOPUP).promoPrice, credits: pkg.credits, payment_method: "stripe" });
    }

    // Reset loading after a moment — the embedded checkout will take over
    setTimeout(() => setLoadingId(null), 1200);
  };

  return (
    <>
      <Dialog open={open && !checkoutOpen} onOpenChange={(v) => { if (!v) phCheckoutAbandoned({ source: "quick_checkout" }); onOpenChange(v); }}>
        <DialogContent className="max-w-[420px] p-0 overflow-hidden bg-[#0c1020] border-white/[0.08] rounded-2xl gap-0">
          {/* ── Header ── */}
          <div className="px-5 pt-5 pb-3">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                {t("qcTitle")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {requiredCredits ? t("qcBalanceNeed", { balance: currentBalance.toLocaleString(), required: requiredCredits.toLocaleString() }) : t("qcBalance", { balance: currentBalance.toLocaleString() })}
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* ── Hero Promo Offer ── */}
          <div className="mx-4 mb-3 rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/[0.08] to-pink-500/[0.06] p-4 shadow-[0_0_24px_rgba(245,158,11,0.1)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                    {t("qcSpecialOff")}
                  </span>
                </div>
                <p className="text-sm font-bold text-white leading-tight">
                  {HERO_TOPUP.name}
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-lg font-extrabold text-white">
                    ฿{HERO_TOPUP.promoPrice}
                  </span>
                  <span className="text-xs text-slate-500 line-through">
                    ฿{HERO_TOPUP.originalPrice}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {HERO_TOPUP.credits.toLocaleString()} credits · {t("qcInstant")}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => handlePurchase(HERO_TOPUP.id, "topup")}
                disabled={loadingId === HERO_TOPUP.id}
                className="bg-gradient-to-r from-amber-500 to-pink-500 text-white font-bold text-xs px-4 h-9 rounded-lg shadow-[0_0_16px_rgba(245,158,11,0.3)] hover:shadow-[0_0_24px_rgba(245,158,11,0.45)] hover:scale-[1.03] transition-all border-0"
              >
                {loadingId === HERO_TOPUP.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  t("qcGrabDeal")
                )}
              </Button>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="flex items-center gap-2 px-5 mb-3">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              {t("qcOtherOptions")}
            </span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          {/* ── Standard Options ── */}
          <div className="px-4 pb-5 space-y-2">
            {/* Standard Refill */}
            <button
              onClick={() => handlePurchase(STANDARD_TOPUP.id, "topup")}
              disabled={!!loadingId}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors group"
            >
              <div className="flex items-center gap-2.5 text-left">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {STANDARD_TOPUP.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {STANDARD_TOPUP.credits.toLocaleString()} credits
                  </p>
                </div>
              </div>
              <div className="text-right flex items-center gap-2">
                <span className="text-sm font-bold text-white">
                  ฿{STANDARD_TOPUP.price}
                </span>
                {loadingId === STANDARD_TOPUP.id && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                )}
              </div>
            </button>

            {/* Pro Plan */}
            <button
              onClick={() => handlePurchase(proPlan.id, "subscription")}
              disabled={!!loadingId}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors group"
            >
              <div className="flex items-center gap-2.5 text-left">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <Crown className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                    {proPlan.name}
                    <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full uppercase">
                      {t("qcBestValue")}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {proPlan.credits.toLocaleString()} credits
                  </p>
                </div>
              </div>
              <div className="text-right flex items-center gap-2">
                <span className="text-sm font-bold text-white">
                    ฿{proPlan.price}
                </span>
                {loadingId === PRO_SUB.id && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                )}
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Embedded Stripe Checkout ── */}
      <EmbeddedCheckoutModal
        open={checkoutOpen}
        onOpenChange={(v) => {
          setCheckoutOpen(v);
          if (!v) onOpenChange(false);
        }}
        mode={checkoutMode}
        packageId={selectedPkgId}
      />
    </>
  );
};

export default QuickCheckoutModal;
