import { useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";
import FlowMarketCard, { type MarketFlowData } from "./FlowMarketCard";
import SectionTitle from "./SectionTitle";

interface PopularCarouselProps {
  flows: MarketFlowData[];
}

const PopularCarousel = ({ flows }: PopularCarouselProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "left" ? -340 : 340, behavior: "smooth" });
  };

  return (
    <section className="space-y-6">
      <div className="flex items-end justify-between">
        <SectionTitle icon={Flame} title="Popular This Week" subtitle="Most-used flows by the community" delay={0.2} />
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll("left")}
            className="w-9 h-9 rounded-full border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-white/20 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="w-9 h-9 rounded-full border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-white/20 transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
      >
        {flows.map((flow, i) => (
          <div key={flow.id} className="snap-start shrink-0 w-[300px] h-[380px]">
            <FlowMarketCard flow={flow} index={i} className="w-full h-full" />
          </div>
        ))}
      </div>
    </section>
  );
};

export default PopularCarousel;
