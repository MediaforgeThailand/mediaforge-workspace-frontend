import { CheckCircle2, Sparkles, Zap, Crown, Building2, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage, type Language } from "@/contexts/LanguageContext";

interface PlanData {
  id: string;
  name: string;
  target: string;
  billing_cycle: string;
  price_thb: number;
  upfront_credits: number;
  flow_quota: number | null;
  discount_official: number;
  discount_community: number;
}

interface PricingCardProps {
  plan: PlanData;
  features: string[];
  isPopular: boolean;
  isCurrent: boolean;
  billingCycle: "monthly" | "quarterly" | "semiannual" | "annual";
  monthlyPrice: number;
  language: Language;
  onSubscribe: () => void;
}

const TITLE_COLORS: Record<string, string> = {
  Starter: "#FAFAFA",
  Growth: "#F4FF00",
  Professional: "#F8FF66",
  Enterprise: "#FACC15",
};

const ICON_MAP: Record<string, React.ElementType> = {
  Starter: Sparkles,
  Growth: Zap,
  Professional: Crown,
  Enterprise: Building2,
};

const MONTHS_MAP: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

const PricingCard = ({
  plan,
  features,
  isPopular,
  isCurrent,
  billingCycle,
  monthlyPrice,
  onSubscribe,
}: PricingCardProps) => {
  const { t } = useLanguage();
  const Icon = ICON_MAP[plan.name] || Rocket;
  const titleColor = TITLE_COLORS[plan.name] || "#FAFAFA";
  const months = MONTHS_MAP[billingCycle] ?? 1;
  const isMultiMonth = months > 1;
  const monthlyEquivPrice =
    isMultiMonth && plan.price_thb > 0 ? Math.round(plan.price_thb / months) : plan.price_thb;
  const monthlyCreditsEquiv =
    isMultiMonth && plan.upfront_credits > 0
      ? Math.round(plan.upfront_credits / months)
      : plan.upfront_credits;

  const billedLabel = isMultiMonth
    ? t("pricingCard.billing.everyMonths", {
        price: plan.price_thb.toLocaleString(),
        months,
      })
    : t("pricingCard.billing.monthly", {
        price: plan.price_thb.toLocaleString(),
      });

  return (
    <div
      className={cn(
        "relative bg-[#171717] rounded-3xl px-5 pt-6 pb-5 w-[280px] xl:w-auto xl:flex-1 xl:max-w-[300px] flex flex-col gap-5 shrink-0 snap-center transition-all",
        isPopular
          ? "ring-2 ring-yellow-400 shadow-[0_0_20px_rgba(238,255,0,0.3)]"
          : isCurrent
            ? "ring-2 ring-yellow-400/60"
            : "ring-1 ring-white/10"
      )}
    >
      {isCurrent ? (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#f4ff00] text-black text-xs font-medium px-4 py-1 rounded-full whitespace-nowrap z-10">
          {t("pricingCurrentPlan")}
        </div>
      ) : isPopular ? (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#f4ff00] text-black text-xs font-medium px-4 py-1 rounded-full whitespace-nowrap z-10">
          {t("pricingBestOffer")}
        </div>
      ) : null}

      <h3 className="text-2xl font-black uppercase" style={{ color: titleColor }}>
        {plan.name}
      </h3>

      {/* Price block */}
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1.5">
          {isMultiMonth && monthlyPrice > 0 && (
            <span className="text-neutral-500 text-2xl line-through">
              ฿{monthlyPrice.toLocaleString()}
            </span>
          )}
          <span className="text-white text-4xl font-semibold">
            ฿{monthlyEquivPrice.toLocaleString()}
          </span>
          <span className="text-neutral-400 text-sm">/{t("pricingCard.monthAbbrev")}</span>
        </div>
        <p className="text-neutral-500 text-xs">{billedLabel}</p>
      </div>

      {/* Credits */}
      {plan.upfront_credits > 0 && (
        isMultiMonth ? (
          <div className="rounded-xl py-3 px-4 text-center bg-yellow-500/10 border border-yellow-400/30">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-yellow-300 mb-0.5">
              {t("pricingCard.receiveInstantly")}
            </div>
            <div className="text-yellow-200 font-black text-2xl tabular-nums leading-tight">
              {plan.upfront_credits.toLocaleString()}
            </div>
            <div className="text-yellow-300/80 text-[10px] font-medium">
              {t("pricingCard.creditsNoDrip")}
            </div>
            <div className="text-neutral-500 text-[10px] mt-1.5">
              ≈ {monthlyCreditsEquiv.toLocaleString()} {t("pricingCard.creditsPerMonthShort")}
            </div>
          </div>
        ) : (
          <div className="bg-neutral-800/80 rounded-xl py-3 px-4 text-center">
            <div className="text-white font-bold text-lg">
              {monthlyCreditsEquiv.toLocaleString()}
            </div>
            <div className="text-neutral-500 text-xs">{t("pricingCreditsPerMonth")}</div>
          </div>
        )
      )}

      {plan.discount_official > 0 && (
        <p className="text-sm font-medium text-yellow-200">
          {t("pricingCard.generationDiscount", {
            discount: plan.discount_official,
          })}
        </p>
      )}

      <ul className="flex flex-col gap-3 flex-1">
        {features.map((f) => (
          <li key={f} className="flex gap-2 items-start">
            <CheckCircle2 className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <span className="text-neutral-300 text-sm">{f}</span>
          </li>
        ))}
      </ul>

      <button
        className={cn(
          "w-full py-3 rounded-full border font-medium text-white transition-all",
          isCurrent
            ? "bg-neutral-700 cursor-default opacity-60"
            : isPopular
              ? "ci-gloss-button text-black"
              : "bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
        )}
        disabled={isCurrent}
        onClick={onSubscribe}
      >
        {isCurrent ? t("pricingCurrentPlan") : t("pricingSubscribe")}
      </button>
    </div>
  );
};

export default PricingCard;
