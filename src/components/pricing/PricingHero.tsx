import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useLanguage, type Language } from "@/contexts/LanguageContext";

export type BillingCycleView = "monthly" | "quarterly" | "semiannual" | "annual";

interface PricingHeroProps {
  language: Language;
  view: BillingCycleView;
  onViewChange: (view: BillingCycleView) => void;
}

const PricingHero = ({ view, onViewChange }: PricingHeroProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const segments: { key: BillingCycleView; label: string; badge: string | null }[] = [
    { key: "monthly", label: t("pricingHero.cycle.monthly"), badge: null },
    { key: "quarterly", label: t("pricingHero.cycle.quarterly"), badge: t("pricingHero.save.quarterly") },
    { key: "semiannual", label: t("pricingHero.cycle.semiannual"), badge: t("pricingHero.save.semiannual") },
    { key: "annual", label: t("pricingHero.cycle.annual"), badge: t("pricingHero.save.annual") },
  ];

  const activeSaveBannerKey =
    view === "monthly" ? null : (`pricingHero.saveBanner.${view}` as const);

  return (
    <section className="w-full py-12 md:py-16 text-center relative">
      <button
        onClick={() => navigate(-1)}
        className="absolute top-4 left-4 md:left-8 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
        aria-label={t("pricingHero.back")}
      >
        <ArrowLeft className="w-5 h-5 text-neutral-400" />
      </button>

      <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-white">
        {t("pricingHero.title")}
      </h1>

      <p className="text-neutral-400 mt-4 text-base md:text-lg max-w-2xl mx-auto px-4">
        {t("pricingSubtitle")}
      </p>

      {/* 4-cycle billing pill */}
      <div className="mt-8 px-4">
        <div className="inline-grid grid-cols-2 sm:inline-flex sm:items-center gap-1 bg-white/10 rounded-3xl sm:rounded-full p-1 max-w-full">
          {segments.map((seg) => {
            const active = view === seg.key;
            return (
              <button
                key={seg.key}
                onClick={() => onViewChange(seg.key)}
                className={cn(
                  "px-3 md:px-5 py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all inline-flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap",
                  active
                    ? "bg-white/15 text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                {seg.label}
                {seg.badge && (
                  <span
                    className={cn(
                      "text-xs sm:text-sm font-extrabold rounded-full px-2.5 sm:px-3 py-1 backdrop-blur-sm transition-all border",
                      active
                        ? "bg-yellow-500/20 text-yellow-100 border-yellow-300/60 shadow-lg shadow-yellow-500/30 ring-1 ring-yellow-300/40"
                        : "bg-yellow-500/10 text-yellow-200 border-yellow-400/30"
                    )}
                  >
                    {seg.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active save banner */}
      {activeSaveBannerKey && (
        <p className="mt-3 text-xs text-yellow-300">
          {t(activeSaveBannerKey)}
        </p>
      )}
    </section>
  );
};

export default PricingHero;
