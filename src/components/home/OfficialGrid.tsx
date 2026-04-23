import { Award } from "lucide-react";
import FlowMarketCard, { type MarketFlowData } from "./FlowMarketCard";
import SectionTitle from "./SectionTitle";

interface OfficialGridProps {
  flows: MarketFlowData[];
}

const OfficialGrid = ({ flows }: OfficialGridProps) => {
  const official = flows.filter((f) => f.isOfficial);
  if (official.length === 0) return null;

  return (
    <section className="space-y-6">
      <SectionTitle icon={Award} title="Official MediaForge Automations" subtitle="Premium, curated workflows by our team" delay={0.25} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 auto-rows-[340px]">
        {official.map((flow, i) => (
          <FlowMarketCard key={flow.id} flow={flow} index={i} className="w-full h-full" />
        ))}
      </div>
    </section>
  );
};

export default OfficialGrid;
