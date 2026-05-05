import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage, type Language, type TranslationKey } from "@/contexts/LanguageContext";

interface PricingCompareProps {
  language: Language;
}

type CellValue = string | boolean | null;

interface CompareRow {
  featureKey: TranslationKey;
  starter: CellValue;
  growth: CellValue;
  professional: CellValue;
  enterprise: CellValue;
}

interface CompareSection {
  titleKey: TranslationKey;
  rows: CompareRow[];
}

const SECTIONS: CompareSection[] = [
  {
    titleKey: "pricingCompare.sections.creditsUsage",
    rows: [
      { featureKey: "pricingCompare.features.creditsMonth", starter: "67,500", growth: "161,250", professional: "248,750", enterprise: "373,750" },
      { featureKey: "pricingCompare.features.estImagesMonth", starter: "33", growth: "80", professional: "124", enterprise: "186" },
      { featureKey: "pricingCompare.features.estVideosMonth", starter: "27", growth: "64", professional: "99", enterprise: "149" },
      { featureKey: "pricingCompare.features.flowExecutions", starter: "Unlimited", growth: "Unlimited", professional: "Unlimited", enterprise: "Unlimited" },
      { featureKey: "pricingCompare.features.accessToFlows", starter: "All", growth: "All", professional: "All", enterprise: "All" },
    ],
  },
  {
    titleKey: "pricingCompare.sections.discountsBenefits",
    rows: [
      { featureKey: "pricingCompare.features.officialFlowDiscount", starter: null, growth: "5%", professional: "10%", enterprise: "20%" },
      { featureKey: "pricingCompare.features.flowRequest", starter: null, growth: true, professional: true, enterprise: true },
    ],
  },
  {
    titleKey: "pricingCompare.sections.support",
    rows: [
      { featureKey: "pricingCompare.features.supportLevel", starter: "Standard", growth: "Priority", professional: "Priority", enterprise: "Priority" },
    ],
  },
];

const PLAN_NAMES = ["starter", "growth", "professional", "enterprise"] as const;
const PLAN_LABELS = { starter: "Starter", growth: "Growth", professional: "Professional", enterprise: "Enterprise" };
const CELL_LABELS: Record<string, TranslationKey> = {
  Unlimited: "pricingCompare.cell.unlimited",
  All: "pricingCompare.cell.all",
  Standard: "pricingCompare.cell.standard",
  Priority: "pricingCompare.cell.priority",
};

const CellContent = ({ value }: { value: CellValue }) => {
  const { t } = useLanguage();
  if (value === null) return <Minus className="w-4 h-4 text-neutral-600 mx-auto" />;
  if (value === true) return <Check className="w-4 h-4 text-green-400 mx-auto" />;
  return <span>{CELL_LABELS[value] ? t(CELL_LABELS[value]) : value}</span>;
};

const PricingCompare = (_props: PricingCompareProps) => {
  const { t } = useLanguage();
  return (
    <section className="mt-16 px-4">
      <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-8">
        {t("pricingCompareAll")}
      </h2>

      {/* ─── Desktop / Tablet: full table ─── */}
      <div className="hidden md:block border border-neutral-800 rounded-2xl overflow-hidden max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="grid grid-cols-5 bg-neutral-900/80 border-b border-neutral-800">
          <div className="py-4 px-6 text-sm font-medium text-neutral-400">
            {t("pricingFeature")}
          </div>
          {PLAN_NAMES.map((p) => (
            <div
              key={p}
              className={cn(
                "py-4 px-4 text-sm font-semibold text-center",
                p === "growth"
                  ? "text-purple-400 bg-purple-500/5 border-t-2 border-purple-500"
                  : "text-neutral-300"
              )}
            >
              {PLAN_LABELS[p]}
            </div>
          ))}
        </div>

        {/* Sections */}
        {SECTIONS.map((section) => (
          <div key={section.titleKey}>
            <div className="bg-neutral-900/50 py-3 px-6 border-b border-neutral-800">
              <span className="text-white font-medium text-sm">
                {t(section.titleKey)}
              </span>
            </div>
            {section.rows.map((row) => (
              <div key={row.featureKey} className="grid grid-cols-5 border-b border-neutral-800">
                <div className="py-3 px-6 text-sm text-neutral-300">
                  {t(row.featureKey)}
                </div>
                {PLAN_NAMES.map((p) => (
                  <div
                    key={p}
                    className={cn(
                      "py-3 px-4 text-sm text-neutral-400 text-center",
                      p === "growth" && "bg-purple-500/5"
                    )}
                  >
                    <CellContent value={row[p]} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ─── Mobile: stacked cards per plan ─── */}
      <div className="md:hidden space-y-4 max-w-md mx-auto">
        {PLAN_NAMES.map((p) => {
          const isGrowth = p === "growth";
          return (
            <div
              key={p}
              className={cn(
                "rounded-2xl border overflow-hidden",
                isGrowth ? "border-purple-500/50 bg-purple-500/5" : "border-neutral-800 bg-neutral-900/40"
              )}
            >
              <div
                className={cn(
                  "px-5 py-3 font-bold text-base flex items-center justify-between",
                  isGrowth ? "text-purple-300 bg-purple-500/10" : "text-white bg-neutral-900/60"
                )}
              >
                <span>{PLAN_LABELS[p]}</span>
                {isGrowth && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-600 text-white">
                    {t("pricingCompare.popular")}
                  </span>
                )}
              </div>
              {SECTIONS.map((section) => (
                <div key={section.titleKey}>
                  <div className="px-5 py-2 bg-neutral-900/60 border-y border-neutral-800/60">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                      {t(section.titleKey)}
                    </span>
                  </div>
                  <ul className="divide-y divide-neutral-800/60">
                    {section.rows.map((row) => (
                      <li
                        key={row.featureKey}
                        className="px-5 py-3 flex items-center justify-between gap-3"
                      >
                        <span className="text-sm text-neutral-400 flex-1">
                          {t(row.featureKey)}
                        </span>
                        <span className="text-sm font-medium text-neutral-200 text-right">
                          {row[p] === null ? (
                            <Minus className="w-4 h-4 text-neutral-600" />
                          ) : row[p] === true ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <CellContent value={row[p]} />
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default PricingCompare;
