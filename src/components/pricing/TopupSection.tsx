import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, QrCode, Sparkles, Check, Gift } from "lucide-react";
import QuickTopUpModal from "@/components/QuickTopUpModal";
import { useLanguage, type Language } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface TopupPackage {
  id: string;
  name: string;
  credits: number;
  price_thb: number;
  stripe_price_id: string | null;
  is_active: boolean;
  sort_order: number;
  // Promo fields (optional — present on promo packages)
  is_promo?: boolean;
  bonus_percent?: number | null;
  original_credits?: number | null;
  one_time_per_user?: boolean;
  badge_label?: string | null;
}

interface TopupSectionProps {
  topupPackages: TopupPackage[];
  language: Language;
  onTopup: (pkg: TopupPackage) => void;
  currentBalance?: number;
}

const TopupSection = ({ topupPackages, onTopup, currentBalance = 0 }: TopupSectionProps) => {
  const [promptPayOpen, setPromptPayOpen] = useState(false);
  const [redeemedIds, setRedeemedIds] = useState<Set<string>>(new Set());
  const { t } = useLanguage();
  const { user } = useAuth();

  // Split promo vs standard
  const promoPackages = topupPackages.filter((p) => p.is_promo);
  const standardPackages = topupPackages.filter((p) => !p.is_promo);

  // Fetch redeemed one-time promos for current user
  useEffect(() => {
    if (!user) return;
    const oneTimeIds = topupPackages.filter((p) => p.one_time_per_user).map((p) => p.id);
    if (oneTimeIds.length === 0) return;
    supabase
      .from("topup_redemptions" as any)
      .select("topup_package_id")
      .eq("user_id", user.id)
      .in("topup_package_id", oneTimeIds)
      .then(({ data }) => {
        if (data) setRedeemedIds(new Set((data as any[]).map((r) => r.topup_package_id)));
      });
  }, [user, topupPackages]);

  if (topupPackages.length === 0) return null;

  return (
    <div className="space-y-6 pt-4">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">
          <Plus className="inline w-5 h-5 mr-2 text-foreground" />
          {t("topupSection.title")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("topupDesc")}</p>
      </div>

      {/* PromptPay Quick Button */}
      <div className="flex justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPromptPayOpen(true)}
          className="gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
        >
          <QrCode className="w-4 h-4" />
          {t("topupQuickPromptPay")}
        </Button>
      </div>

      {/* ─── Promo Hero Cards ─── */}
      {promoPackages.length > 0 && (
        <div className={`grid gap-4 mx-auto ${promoPackages.length === 1 ? "max-w-md" : "md:grid-cols-2 max-w-3xl"} place-items-stretch justify-center`}>
          {promoPackages.map((pkg) => {
            const isRedeemed = pkg.one_time_per_user && redeemedIds.has(pkg.id);
            const bonus = pkg.bonus_percent ?? 0;
            return (
              <div
                key={pkg.id}
                className="relative overflow-hidden rounded-3xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/[0.12] via-yellow-500/[0.08] to-yellow-500/[0.10] p-6 shadow-[0_0_40px_rgba(245,158,11,0.15)]"
              >
                {/* Glow accents */}
                <div className="absolute -top-12 -right-12 w-40 h-40 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-yellow-500/20 rounded-full blur-3xl pointer-events-none" />

                <div className="relative">
                  {/* Top row: badge + bonus */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <Badge className="bg-gradient-to-r from-[#f4ff00] to-[#d7e600] text-black border-0 font-bold text-[10px] px-2.5 py-1 uppercase tracking-wider shadow-lg">
                      <Sparkles className="w-3 h-3 mr-1" />
                      {pkg.badge_label || t("topupSection.specialOffer")}
                    </Badge>
                    {bonus > 0 && (
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40">
                        <Gift className="w-3 h-3 text-emerald-400" />
                        <span className="text-[11px] font-bold text-emerald-400">
                          +{bonus}% {t("topupSection.bonus")}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="text-xl font-extrabold text-foreground mb-1">{pkg.name}</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    {pkg.one_time_per_user
                      ? t("topupSection.oneTimePurchase")
                      : t("topupSection.limitedTimeOffer")}
                  </p>

                  {/* Credits — big number with strikethrough original */}
                  <div className="flex items-end gap-3 mb-1">
                    <span className="text-4xl font-black bg-gradient-to-r from-amber-400 via-yellow-400 to-yellow-400 bg-clip-text text-transparent leading-none">
                      {pkg.credits.toLocaleString()}
                    </span>
                    <span className="text-sm font-semibold text-muted-foreground pb-1">
                      {t("credits")}
                    </span>
                  </div>
                  {pkg.original_credits && pkg.original_credits < pkg.credits && (
                    <p className="text-xs text-muted-foreground mb-4">
                      <span className="line-through">{pkg.original_credits.toLocaleString()}</span>
                      <span className="ml-2 text-emerald-400 font-semibold">
                        +{(pkg.credits - pkg.original_credits).toLocaleString()}{" "}
                        {t("topupSection.freeCredits")}
                      </span>
                    </p>
                  )}

                  {/* Price */}
                  <div className="flex items-baseline gap-2 mb-5">
                    <span className="text-3xl font-extrabold text-foreground">
                      ฿{Number(pkg.price_thb).toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("topupSection.oneTime")}
                    </span>
                  </div>

                  {/* CTA */}
                  <Button
                    onClick={() => !isRedeemed && onTopup(pkg)}
                    disabled={isRedeemed}
                    className="w-full bg-gradient-to-r from-[#f4ff00] to-[#b7d400] hover:from-[#f8ff66] hover:to-[#e7ff12] text-black font-bold border-0 shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_28px_rgba(245,158,11,0.5)] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:from-emerald-600 disabled:to-emerald-600"
                  >
                    {isRedeemed ? (
                      <>
                        <Check className="w-4 h-4 mr-1.5" />
                        {t("topupSection.alreadyRedeemed")}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-1.5" />
                        {t("topupSection.grabDeal")}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Standard Top-ups ─── */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {standardPackages.map((pkg) => (
          <div
            key={pkg.id}
            className="bg-card/60 border border-border backdrop-blur-xl rounded-2xl p-5 flex flex-col items-center tech-card"
          >
            <p className="text-xs text-muted-foreground font-medium mb-1">{pkg.name}</p>
            <p className="text-2xl font-bold text-foreground">{pkg.credits.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mb-3">{t("credits")}</p>
            <p className="text-lg font-bold text-foreground mb-3">
              ฿{Number(pkg.price_thb).toLocaleString()}
            </p>
            <Badge variant="outline" className="text-[10px] mb-3 border-border text-muted-foreground">
              {t("topupValid12")}
            </Badge>
            <Button variant="outline" size="sm" className="w-full" onClick={() => onTopup(pkg)}>
              {t("topupButton")}
            </Button>
          </div>
        ))}
      </div>

      {/* PromptPay Modal */}
      <QuickTopUpModal
        open={promptPayOpen}
        onOpenChange={setPromptPayOpen}
        packages={standardPackages.map((p) => ({
          id: p.id,
          name: p.name,
          credits: p.credits,
          price_thb: p.price_thb,
        }))}
        currentBalance={currentBalance}
      />
    </div>
  );
};

export default TopupSection;
