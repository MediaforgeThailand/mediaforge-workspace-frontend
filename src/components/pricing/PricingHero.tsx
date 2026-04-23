import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

export type BillingCycleView = "monthly" | "quarterly" | "semiannual" | "annual";

interface PricingHeroProps {
  language: string;
  view: BillingCycleView;
  onViewChange: (view: BillingCycleView) => void;
}

const SAVE_BADGE: Record<BillingCycleView, { en: string; th: string } | null> = {
  monthly: null,
  quarterly: { en: "Save 10%", th: "ลด 10%" },
  semiannual: { en: "Save 15%", th: "ลด 15%" },
  annual: { en: "Save 20%", th: "ลด 20%" },
};

const PricingHero = ({ language, view, onViewChange }: PricingHeroProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const segments: { key: BillingCycleView; label: string; badge: string | null }[] = [
    { key: "monthly", label: language === "th" ? "รายเดือน" : "Monthly", badge: null },
    { key: "quarterly", label: language === "th" ? "3 เดือน" : "3 Months", badge: language === "th" ? "ลด 10%" : "Save 10%" },
    { key: "semiannual", label: language === "th" ? "6 เดือน" : "6 Months", badge: language === "th" ? "ลด 15%" : "Save 15%" },
    { key: "annual", label: language === "th" ? "12 เดือน" : "12 Months", badge: language === "th" ? "ลด 20%" : "Save 20%" },
  ];

  const activeBadge = SAVE_BADGE[view];

  return (
    <section className="w-full py-12 md:py-16 text-center relative">
      <button
        onClick={() => navigate(-1)}
        className="absolute top-4 left-4 md:left-8 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
        aria-label="Back"
      >
        <ArrowLeft className="w-5 h-5 text-neutral-400" />
      </button>

      <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-white">
        {language === "th" ? "ปลดล็อกพลังของ MEDIAFORGE" : "UNLOCK THE POWER OF MEDIAFORGE"}
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
                        ? "bg-violet-500/20 text-violet-100 border-violet-300/60 shadow-lg shadow-violet-500/30 ring-1 ring-violet-300/40"
                        : "bg-violet-500/10 text-violet-200 border-violet-400/30"
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
      {activeBadge && (
        <p className="mt-3 text-xs text-violet-300">
          {language === "th"
            ? `ประหยัดสูงสุด ${activeBadge.th.replace("ลด ", "")} เมื่อชำระแบบ ${
                view === "quarterly" ? "3 เดือน" : view === "semiannual" ? "6 เดือน" : "12 เดือน"
              }`
            : `${activeBadge.en} when paying ${
                view === "quarterly" ? "quarterly" : view === "semiannual" ? "semi-annually" : "annually"
              }`}
        </p>
      )}
    </section>
  );
};

export default PricingHero;
