import { motion } from "framer-motion";
import { Users, Crown } from "lucide-react";
import FlowMarketCard, { type MarketFlowData } from "./FlowMarketCard";
import SectionTitle from "./SectionTitle";

interface Creator {
  name: string;
  avatar: string;
  sales: number;
}

const MOCK_CREATORS: Creator[] = [
  { name: "PixelForge Studio", avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&q=80", sales: 1243 },
  { name: "DesignBolt", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64&q=80", sales: 987 },
  { name: "MarketingPro", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&q=80", sales: 856 },
  { name: "FoodieAI", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&q=80", sales: 721 },
  { name: "StudioX", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=64&q=80", sales: 654 },
];

interface TopCreatorsProps {
  communityFlows: MarketFlowData[];
}

const TopCreators = ({ communityFlows }: TopCreatorsProps) => (
  <section className="space-y-8">
    {/* Creators strip */}
    <div className="space-y-6">
      <SectionTitle icon={Users} title="Top Community Creators" subtitle="The best independent flow builders" delay={0.3} />

      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
        {MOCK_CREATORS.map((c, i) => (
          <motion.div
            key={c.name}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i + 0.3, duration: 0.4 }}
            className="shrink-0 flex items-center gap-3 bg-white/[0.04] backdrop-blur-md border border-white/[0.08] rounded-2xl px-5 py-3.5 hover:border-white/20 transition-all duration-300 cursor-pointer group"
          >
            {i === 0 && <Crown className="w-4 h-4 text-yellow-500 shrink-0" />}
            <img src={c.avatar} alt={c.name} className="w-10 h-10 rounded-full object-cover ring-2 ring-white/10 group-hover:ring-white/25 transition-all" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.sales.toLocaleString()} uses</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>

    {/* Community flows grid */}
    {communityFlows.length > 0 && (
      <div className="space-y-5">
        <h3 className="text-lg font-semibold text-white pl-11">Trending Community Flows</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[300px]">
          {communityFlows.map((flow, i) => (
            <FlowMarketCard key={flow.id} flow={flow} index={i} className="w-full h-full" />
          ))}
        </div>
      </div>
    )}
  </section>
);

export default TopCreators;
