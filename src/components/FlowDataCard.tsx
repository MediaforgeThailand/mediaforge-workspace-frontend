import { useState, useRef, memo } from "react";
import { motion } from "framer-motion";
import OptimizedVideo from "@/components/ui/OptimizedVideo";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const MotionLink = motion.create(Link);
import { Sparkles } from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";
import { useIsMobile } from "@/hooks/use-mobile";
import { DifficultyBadge, type DifficultyLevel } from "@/components/DifficultyBadge";

/* ─── Supabase image transform helper ─── */
function optimizedThumbUrl(url: string | null | undefined, width: number, quality = 60): string | null | undefined {
  if (!url) return url;
  // Only transform Supabase Storage public URLs
  if (!url.includes("/storage/v1/object/public/")) return url;
  const transformed = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  // Strip existing query params, then add transform params
  const base = transformed.split("?")[0];
  return `${base}?width=${width}&quality=${quality}`;
}

/* ─── Types ─── */
export interface FlowCardData {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  tags?: string[] | null;
  thumbnail_url?: string | null;
  model_badge?: string;
  estimated_credits?: number;
  output_type?: "image" | "video" | "text" | "unknown";
  rank?: number;
  creator_avatar?: string | null;
  creator_name?: string | null;
  final_price?: number;
  is_official?: boolean;
  avg_rating?: number | null;
  is_new?: boolean;
  difficulty?: DifficultyLevel;
}

type CardSpan = "normal" | "wide" | "tall";

interface FlowDataCardProps {
  flow: FlowCardData;
  span?: CardSpan;
  index?: number;
  gridMode?: boolean;
}

/* ─── Card ─── */
const FlowDataCard = memo(({ flow, index = 0, gridMode }: FlowDataCardProps) => {
  const [hovered, setHovered] = useState(false);
  const isMobile = useIsMobile();
  const isVideoThumb = flow.thumbnail_url?.match(/\.(mp4|webm)/i);
  const thumbSrc = isVideoThumb ? flow.thumbnail_url : optimizedThumbUrl(flow.thumbnail_url, isMobile ? 400 : 800);
  const showNewBadge = flow.is_new || flow.is_official;

  // Only animate on first mount — skip animation on re-render to prevent image re-downloads
  const hasAnimated = useRef(false);
  const shouldAnimate = !hasAnimated.current;
  if (shouldAnimate) hasAnimated.current = true;

  return (
    <MotionLink
      to={`/play/${flow.id}`}
      initial={shouldAnimate ? { opacity: 0, y: 16 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: shouldAnimate ? 0.03 * index : 0, duration: shouldAnimate ? 0.45 : 0, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        "group relative block rounded-[10px] overflow-hidden cursor-pointer",
        gridMode ? "w-full" : "w-[260px] shrink-0 aspect-[5/7]"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Media Background ── */}
      {thumbSrc && !isVideoThumb && (
        <motion.img
          src={thumbSrc}
          alt={flow.name}
          className={cn(
            "w-full object-cover",
            gridMode ? "block" : "absolute inset-0 h-full"
          )}
          animate={{ scale: hovered ? 1.05 : 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          loading="lazy"
          decoding="async"
        />
      )}
      {isVideoThumb && thumbSrc && (
        <OptimizedVideo
          src={thumbSrc}
          className={cn(
            "w-full",
            gridMode ? "block" : "absolute inset-0 h-full"
          )}
          hoverScale={1.05}
        />
      )}
      {!thumbSrc && (
        <div className={cn(
          "w-full bg-gradient-to-br from-primary/10 via-accent/5 to-muted/5 flex items-center justify-center",
          gridMode ? "aspect-[5/7]" : "absolute inset-0 h-full"
        )}>
          <Sparkles className="w-8 h-8 text-primary/20" />
        </div>
      )}

      {/* ── Gradient overlay ── */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-t transition-all duration-200",
        isMobile
          ? "from-black/60 via-transparent to-transparent"
          : "from-black/75 via-transparent to-transparent group-hover:from-black/75 group-hover:via-black/30 group-hover:to-transparent"
      )} />

      {/* ── Top-left badges (creator/new + difficulty) ── */}
      {(showNewBadge || flow.difficulty) && (
        <div className={cn("absolute z-10 flex items-center gap-1.5", isMobile ? "top-2 left-2" : "top-4 left-4")}>
          {showNewBadge && (
            flow.is_official ? (
              <motion.img
                src={logoIcon}
                alt="Official"
                className={cn("drop-shadow-[0_0_8px_rgba(110,96,238,0.9)]", isMobile ? "w-5 h-5" : "w-6 h-6")}
                animate={{
                  filter: [
                    "drop-shadow(0 0 4px rgba(110,96,238,0.5))",
                    "drop-shadow(0 0 12px rgba(110,96,238,1))",
                    "drop-shadow(0 0 4px rgba(110,96,238,0.5))",
                  ],
                }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : (
              <span className={cn("inline-block font-medium rounded-[4px] px-1.5 py-0.5", isMobile ? "text-[10px]" : "text-[12px]")} style={{ background: "#90D5FF", color: "#0a0a0a" }}>
                New
              </span>
            )
          )}
          {flow.difficulty && (
            <DifficultyBadge level={flow.difficulty} size="sm" />
          )}
        </div>
      )}

      {/* ── Bottom content ── */}
      <div className={cn("absolute bottom-0 inset-x-0 z-10", isMobile ? "px-2 pb-1.5 pt-6" : "p-4")}>
        {/* Creator info (desktop only, hide for official) */}
        {!isMobile && !flow.is_official && (
          <div className="flex items-center gap-1.5 mb-1.5">
            {flow.creator_avatar ? (
              <img src={flow.creator_avatar} alt="" className="w-4 h-4 rounded-full object-cover ring-1 ring-white/20 shrink-0" />
            ) : (
              <div className="w-4 h-4 rounded-full bg-white/20 shrink-0" />
            )}
            <span className="text-[10px] text-white/70 truncate">
              {flow.creator_name || "Creator"}
            </span>
            {flow.avg_rating != null && flow.avg_rating > 0 && (
              <span className="text-[10px] text-accent font-medium ml-auto shrink-0">★ {flow.avg_rating.toFixed(1)}</span>
            )}
          </div>
        )}

        {/* Title — 10% smaller text */}
        <h3 className={cn(
          "font-semibold text-white leading-snug line-clamp-2 transition-all duration-200",
          isMobile ? "text-[10px] leading-tight" : "text-[14px] group-hover:mb-1"
        )}>
          {flow.name}
        </h3>

        {/* Description — slides in on hover (desktop only) */}
        {!isMobile && (
          <div className="max-h-0 overflow-hidden transition-all duration-200 group-hover:max-h-32">
            {flow.description && (
              <p className="text-[11px] text-white/90 line-clamp-4 drop-shadow-md">
                {flow.description}
              </p>
            )}
          </div>
        )}
      </div>
    </MotionLink>
  );
});

FlowDataCard.displayName = "FlowDataCard";

/* ─── Skeleton ─── */
export const FlowDataCardSkeleton = ({ span = "normal", gridMode }: { span?: CardSpan; gridMode?: boolean }) => (
  <div className={cn(
    "rounded-[10px] overflow-hidden bg-muted/10 animate-pulse",
    gridMode ? "w-full aspect-[5/7]" : "w-[260px] shrink-0 aspect-[5/7]"
  )} />
);

/* ─── Bento Grid ─── */
const BENTO_PATTERN: CardSpan[] = [
  "wide", "normal", "normal",
  "normal", "normal", "wide",
  "normal", "wide", "normal",
];

export const getBentoSpan = (index: number): CardSpan =>
  BENTO_PATTERN[index % BENTO_PATTERN.length];

export default FlowDataCard;
