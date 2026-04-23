import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Layers, Package, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BundleMarketData {
  id: string;
  name: string;
  description?: string | null;
  thumbnail_url?: string | null;
  thumbnail_type?: "image" | "video";
  flow_count: number;
  is_official?: boolean;
  creator_name?: string;
  creator_avatar?: string;
}

interface Props {
  bundle: BundleMarketData;
  index?: number;
  className?: string;
}

const BundleMarketCard = ({ bundle, index = 0, className }: Props) => {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        "group relative overflow-hidden rounded-3xl cursor-pointer",
        "border border-rose-500/15 bg-white/[0.04]",
        "backdrop-blur-md transition-all duration-500",
        "hover:border-rose-500/40 hover:shadow-[0_0_40px_rgba(244,63,94,0.18)]",
        className
      )}
      onClick={() => navigate(`/play/bundle/${bundle.id}`)}
    >
      {/* ─── Bundle badge (top-right) — premium glass + shimmer ─── */}
      <div className="absolute top-3 right-3 z-20 pointer-events-none">
        <div className="relative group/badge">
          {/* Glow halo */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-rose-500/40 via-fuchsia-500/40 to-rose-500/40 blur-md opacity-60 group-hover:opacity-100 transition-opacity duration-500" />

          {/* Badge body — glassmorphism pill */}
          <div
            className={cn(
              "relative flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full",
              "bg-gradient-to-r from-rose-500/95 via-pink-500/95 to-rose-500/95",
              "backdrop-blur-xl border border-white/30",
              "shadow-[0_4px_20px_-4px_rgba(244,63,94,0.55),inset_0_1px_0_0_rgba(255,255,255,0.4)]",
              "overflow-hidden"
            )}
          >
            {/* Animated shimmer sweep */}
            <div
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none"
              style={{
                background:
                  "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)",
              }}
            />

            {/* Icon dot with subtle inner glow */}
            <div className="relative flex items-center justify-center w-4 h-4 rounded-full bg-white/25 ring-1 ring-white/40">
              <Package className="w-2.5 h-2.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]" />
            </div>

            <span className="relative text-[10px] font-bold tracking-[0.08em] uppercase text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]">
              Bundle
            </span>
          </div>
        </div>
      </div>

      {/* Media */}
      {bundle.thumbnail_url ? (
        bundle.thumbnail_type === "video" ? (
          <video
            src={bundle.thumbnail_url}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            loop
            autoPlay
            playsInline
          />
        ) : (
          <img
            src={bundle.thumbnail_url}
            alt={bundle.name}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        )
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-rose-500/20 via-purple-600/15 to-blue-500/10 flex items-center justify-center">
          <Layers className="w-14 h-14 text-white/20" />
        </div>
      )}

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-[#0a0e1a]/55 to-transparent" />

      {/* Top-left flow count */}
      <div className="absolute top-3.5 left-3.5 flex items-center gap-1 bg-black/45 backdrop-blur-xl border border-white/10 rounded-full px-2.5 py-1 z-10">
        <Layers className="w-3 h-3 text-rose-300" />
        <span className="text-[10px] font-bold text-white">
          {bundle.flow_count} flow{bundle.flow_count !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Hover CTA */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        initial={false}
      >
        <Button size="sm" className="gap-2 bg-gradient-to-r from-rose-500 to-red-600 border-0 text-white shadow-2xl shadow-rose-500/40 scale-90 group-hover:scale-100 transition-transform duration-300 rounded-xl">
          <Play className="w-4 h-4" />
          Open Bundle
        </Button>
      </motion.div>

      {/* Bottom content */}
      <div className="absolute bottom-0 inset-x-0 px-4 pb-4 pt-12 z-10">
        <h3 className="text-base font-bold text-white tracking-tight line-clamp-2 mb-1.5">
          {bundle.name}
        </h3>
        <div className="flex items-center gap-2">
          {bundle.creator_avatar ? (
            <img src={bundle.creator_avatar} alt="" className="w-5 h-5 rounded-full object-cover ring-1 ring-white/20" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-white/20 ring-1 ring-white/10" />
          )}
          <span className="text-xs text-muted-foreground truncate">{bundle.creator_name ?? "Creator"}</span>
        </div>
      </div>
    </motion.div>
  );
};

export default BundleMarketCard;
