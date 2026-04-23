import { type LucideIcon, Flame, TrendingUp, Sparkles, Star, Layout, Image } from "lucide-react";
import FlowDataCard, { getBentoSpan, FlowDataCardSkeleton } from "@/components/FlowDataCard";
import SectionTitle from "./SectionTitle";
import { useMarketplaceFlows, type HomepageSectionData } from "@/hooks/useMarketplaceFlows";
import { useLanguage } from "@/contexts/LanguageContext";

const ICON_MAP: Record<string, LucideIcon> = {
  star: Star, flame: Flame, "trending-up": TrendingUp, sparkles: Sparkles,
  layout: Layout, image: Image,
};

const MarketplaceGrid = () => {
  const { data, isLoading, error } = useMarketplaceFlows();
  const { t } = useLanguage();

  if (isLoading) {
    return (
      <div className="space-y-10 px-2">
        <section className="space-y-5">
          <SectionTitle icon={Flame} title="Trending Flows" subtitle={t("marketplaceLoading")} delay={0.1} />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <FlowDataCardSkeleton key={i} />
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-2 py-10 text-center text-muted-foreground">
        {t("marketplaceError")}
      </div>
    );
  }

  const nonHeroSections = data.sections.filter((s) => s.section_type !== "hero");

  return (
    <div className="space-y-10 px-2">
      {nonHeroSections.map((section, sIdx) => {
        if (section.flows.length === 0) return null;
        const IconComp = ICON_MAP[section.icon] || Sparkles;
        const useBento = section.max_items <= 4;

        return (
          <section key={section.id} className="space-y-5">
            <SectionTitle
              icon={IconComp}
              title={section.title}
              subtitle={section.subtitle || undefined}
              delay={0.1 * (sIdx + 1)}
            />
            <div className={
              useBento
                ? "grid grid-cols-2 md:grid-cols-3 gap-3"
                : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3"
            }>
              {section.flows.map((flow, i) => (
                <FlowDataCard
                  key={flow.id}
                  flow={flow}
                  span={useBento ? getBentoSpan(i) : undefined}
                  index={i}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default MarketplaceGrid;
