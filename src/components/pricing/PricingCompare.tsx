import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocalizedText, useLanguage, type Language } from "@/contexts/LanguageContext";

interface PricingCompareProps {
  language: Language;
}

type CellValue = string | boolean | null;

interface CompareRow {
  feature: string;
  feature_th: string;
  feature_es: string;
  feature_ja: string;
  starter: CellValue;
  growth: CellValue;
  professional: CellValue;
  enterprise: CellValue;
}

interface CompareSection {
  title: string;
  title_th: string;
  title_es: string;
  title_ja: string;
  rows: CompareRow[];
}

const SECTIONS: CompareSection[] = [
  {
    title: "Credits & Usage",
    title_th: "เครดิตและการใช้งาน",
    title_es: "Créditos y uso",
    title_ja: "クレジットと利用状況",
    rows: [
      { feature: "Credits/month", feature_th: "เครดิต/เดือน", feature_es: "Créditos/mes", feature_ja: "クレジット/月", starter: "67,500", growth: "161,250", professional: "248,750", enterprise: "373,750" },
      { feature: "Est. images/month", feature_th: "รูปได้ประมาณ/เดือน", feature_es: "Imágenes estimadas/mes", feature_ja: "画像の目安/月", starter: "33", growth: "80", professional: "124", enterprise: "186" },
      { feature: "Est. videos/month", feature_th: "VDO ได้ประมาณ/เดือน", feature_es: "Videos estimados/mes", feature_ja: "動画の目安/月", starter: "27", growth: "64", professional: "99", enterprise: "149" },
      { feature: "Flow Executions", feature_th: "Flow Executions", feature_es: "Ejecuciones de Flow", feature_ja: "Flow 実行", starter: "Unlimited", growth: "Unlimited", professional: "Unlimited", enterprise: "Unlimited" },
      { feature: "Access to Flows", feature_th: "เข้าถึง Flows", feature_es: "Acceso a Flows", feature_ja: "Flow へのアクセス", starter: "All", growth: "All", professional: "All", enterprise: "All" },
    ],
  },
  {
    title: "Discounts & Benefits",
    title_th: "ส่วนลดและสิทธิพิเศษ",
    title_es: "Descuentos y beneficios",
    title_ja: "割引と特典",
    rows: [
      { feature: "Official Flow discount", feature_th: "Official Flow ลด", feature_es: "Descuento de Official Flow", feature_ja: "Official Flow 割引", starter: null, growth: "5%", professional: "10%", enterprise: "20%" },
      { feature: "Flow Request", feature_th: "Flow Request", feature_es: "Solicitud de Flow", feature_ja: "Flow リクエスト", starter: null, growth: true, professional: true, enterprise: true },
    ],
  },
  {
    title: "Support",
    title_th: "การสนับสนุน",
    title_es: "Soporte",
    title_ja: "サポート",
    rows: [
      { feature: "Support Level", feature_th: "ระดับการสนับสนุน", feature_es: "Nivel de soporte", feature_ja: "サポートレベル", starter: "Standard", growth: "Priority", professional: "Priority", enterprise: "Priority" },
    ],
  },
];

const PLAN_NAMES = ["starter", "growth", "professional", "enterprise"] as const;
const PLAN_LABELS = { starter: "Starter", growth: "Growth", professional: "Professional", enterprise: "Enterprise" };
const CELL_LABELS: Record<string, Partial<Record<Language, string>> & { en: string }> = {
  Unlimited: { en: "Unlimited", th: "ไม่จำกัด", es: "Ilimitado", ja: "無制限" },
  All: { en: "All", th: "ทั้งหมด", es: "Todos", ja: "すべて" },
  Standard: { en: "Standard", th: "มาตรฐาน", es: "Estándar", ja: "標準" },
  Priority: { en: "Priority", th: "Priority", es: "Prioritario", ja: "優先" },
};

const CellContent = ({ value, language }: { value: CellValue; language: Language }) => {
  if (value === null) return <Minus className="w-4 h-4 text-neutral-600 mx-auto" />;
  if (value === true) return <Check className="w-4 h-4 text-green-400 mx-auto" />;
  return <span>{CELL_LABELS[value] ? getLocalizedText(language, CELL_LABELS[value]) : value}</span>;
};

const sectionTitle = (section: CompareSection, language: Language) =>
  getLocalizedText(language, {
    en: section.title,
    th: section.title_th,
    es: section.title_es,
    ja: section.title_ja,
  });

const rowFeature = (row: CompareRow, language: Language) =>
  getLocalizedText(language, {
    en: row.feature,
    th: row.feature_th,
    es: row.feature_es,
    ja: row.feature_ja,
  });

const PricingCompare = ({ language }: PricingCompareProps) => {
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
          <div key={section.title}>
            <div className="bg-neutral-900/50 py-3 px-6 border-b border-neutral-800">
              <span className="text-white font-medium text-sm">
                {sectionTitle(section, language)}
              </span>
            </div>
            {section.rows.map((row) => (
              <div key={row.feature} className="grid grid-cols-5 border-b border-neutral-800">
                <div className="py-3 px-6 text-sm text-neutral-300">
                  {rowFeature(row, language)}
                </div>
                {PLAN_NAMES.map((p) => (
                  <div
                    key={p}
                    className={cn(
                      "py-3 px-4 text-sm text-neutral-400 text-center",
                      p === "growth" && "bg-purple-500/5"
                    )}
                  >
                    <CellContent value={row[p]} language={language} />
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
                    {getLocalizedText(language, { en: "Popular", th: "ยอดนิยม", es: "Popular", ja: "人気" })}
                  </span>
                )}
              </div>
              {SECTIONS.map((section) => (
                <div key={section.title}>
                  <div className="px-5 py-2 bg-neutral-900/60 border-y border-neutral-800/60">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                      {sectionTitle(section, language)}
                    </span>
                  </div>
                  <ul className="divide-y divide-neutral-800/60">
                    {section.rows.map((row) => (
                      <li
                        key={row.feature}
                        className="px-5 py-3 flex items-center justify-between gap-3"
                      >
                        <span className="text-sm text-neutral-400 flex-1">
                          {rowFeature(row, language)}
                        </span>
                        <span className="text-sm font-medium text-neutral-200 text-right">
                          {row[p] === null ? (
                            <Minus className="w-4 h-4 text-neutral-600" />
                          ) : row[p] === true ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <CellContent value={row[p]} language={language} />
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
