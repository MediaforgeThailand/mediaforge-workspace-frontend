import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

const MotionLink = motion.create(Link);
import { cn } from "@/lib/utils";
import { Zap, Play, Sparkles, Star, Video, Image } from "lucide-react";
import OptimizedVideo from "@/components/ui/OptimizedVideo";

export interface MarketFlowData {
  id: string;
  title: string;
  description: string;
  category: string;
  cost: number;
  creator: string;
  creatorAvatar?: string;
  image: string;
  outputType: "image" | "video";
  rating: number;
  isOfficial?: boolean;
}

interface FlowMarketCardProps {
  flow: MarketFlowData;
  index?: number;
  className?: string;
}

const FlowMarketCard = ({ flow, index = 0, className }: FlowMarketCardProps) => {
  const [hovered, setHovered] = useState(false);
  const { t } = useLanguage();

  return (
    <MotionLink
      to={`/play/${flow.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        "group relative block overflow-hidden rounded-3xl cursor-pointer",
        "border border-white/[0.08] bg-white/[0.04]",
        "backdrop-blur-md transition-all duration-500",
        "hover:border-white/20 hover:shadow-[0_0_40px_rgba(255,255,255,0.08)]",
        className
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Full-bleed media */}
      {flow.image.match(/\.(mp4|webm)/i) ? (
        <OptimizedVideo
          src={flow.image}
          className="absolute inset-0 w-full h-full"
          hoverScale={1.1}
        />
      ) : (
        <motion.img
          src={flow.image}
          alt={flow.title}
          className="absolute inset-0 w-full h-full object-cover"
          animate={{ scale: hovered ? 1.1 : 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          loading="lazy"
          decoding="async"
        />
      )}

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-[#0a0e1a]/60 to-transparent" />

      {/* Hover glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-t from-white/5 via-transparent to-transparent" />

      {/* Top badges */}
      <div className="absolute top-3.5 left-3.5 right-3.5 flex items-start justify-between z-10">
        <div className="flex items-center gap-1.5">
          {flow.isOfficial && (
            <div className="flex items-center gap-1 bg-white/10 backdrop-blur-xl border border-white/15 rounded-full px-2.5 py-1">
              <Sparkles className="w-3 h-3 text-white/80" />
              <span className="text-[10px] font-semibold text-white/90">{t("fmcCertifiedOfficial")}</span>
            </div>
          )}
          <div className="flex items-center gap-1 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full px-2.5 py-1">
            {flow.outputType === "video" ? <Video className="w-3 h-3 text-slate-300" /> : <Image className="w-3 h-3 text-slate-300" />}
            <span className="text-[10px] font-medium text-slate-200 capitalize">{flow.outputType}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full px-2.5 py-1">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span className="text-[10px] font-semibold text-white">{flow.rating.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full px-2.5 py-1">
            <Zap className="w-3 h-3 text-cyan-300" />
            <span className="text-[10px] font-bold text-white">{flow.cost}</span>
          </div>
        </div>
      </div>

      {/* Hover CTA */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center z-10"
        initial={false}
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <Button
          size="sm"
          className="gap-2 gradient-primary border-0 text-white shadow-2xl shadow-black/30 scale-90 group-hover:scale-100 transition-transform duration-300 rounded-xl"
        >
          <Play className="w-4 h-4" />
          {t("fmcRunFlow")}
        </Button>
      </motion.div>

      {/* Bottom content */}
      <div className="absolute bottom-0 inset-x-0 px-4 pb-4 pt-12 z-10">
        <span className="inline-block text-[10px] font-medium text-white/80 bg-white/10 border border-white/15 rounded-full px-2.5 py-0.5 mb-2">
          {flow.category}
        </span>
        <h3 className="text-base font-bold text-white tracking-tight line-clamp-2 mb-1.5">
          {flow.title}
        </h3>
        {flow.isOfficial ? (
          <span
            className="text-xs font-bold text-purple-300"
            style={{ textShadow: "0 0 10px rgba(168,85,247,0.8), 0 0 20px rgba(168,85,247,0.4), 0 0 30px rgba(168,85,247,0.2)" }}
          >
            {t("fmcOfficialFlow")}
          </span>
        ) : (
          <div className="flex items-center gap-2">
            {flow.creatorAvatar ? (
              <img src={flow.creatorAvatar} alt="" className="w-5 h-5 rounded-full object-cover ring-1 ring-white/20" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-white/20 ring-1 ring-white/10" />
            )}
            <span className="text-xs text-muted-foreground">{flow.creator}</span>
          </div>
        )}
      </div>
    </MotionLink>
  );
};

export default FlowMarketCard;
