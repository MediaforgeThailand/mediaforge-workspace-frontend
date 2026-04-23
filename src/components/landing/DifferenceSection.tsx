import { Heart, Play, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";

const VIDEO_EXTS = /\.(mp4|webm|mov|m4v)(\?|$)/i;

function isVideoUrl(url: string | null): boolean {
  if (!url) return false;
  return VIDEO_EXTS.test(url);
}

interface TrendingFlow {
  id: string;
  name: string;
  thumbnail_url: string | null;
  category: string;
  selling_price: number;
  total_runs: number;
}

function TrendingCard({ flow }: { flow: TrendingFlow }) {
  const isVideo = isVideoUrl(flow.thumbnail_url);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [imgError, setImgError] = useState(false);
  const { t } = useLanguage();

  const resolvedUrl = flow.thumbnail_url || "";

  return (
    <Link
      to={`/play/${flow.id}`}
      className="glass-border group relative block mb-3 sm:mb-4 break-inside-avoid overflow-hidden rounded-xl cursor-pointer"
    >
      {isVideo ? (
        <video
          ref={videoRef}
          src={resolvedUrl}
          autoPlay
          loop
          muted
          playsInline
          className="block w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : imgError || !resolvedUrl ? (
        <div className="w-full aspect-square bg-secondary/50 flex items-center justify-center">
          <Play className="w-8 h-8 text-muted-foreground/30" />
        </div>
      ) : (
        <img
          src={resolvedUrl}
          alt={flow.name}
          loading="lazy"
          onError={() => setImgError(true)}
          className="block w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}

      {/* Overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      {/* Flow name + runs */}
      <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <p className="text-xs font-medium text-white truncate">{flow.name}</p>
        <div className="flex items-center gap-1 mt-1 text-[10px] text-white/70">
          <Play size={10} className="fill-current" />
          <span>{flow.total_runs.toLocaleString()} {t("trendingRuns")}</span>
        </div>
      </div>
    </Link>
  );
}

export default function DifferenceSection() {
  const { t } = useLanguage();
  const { data: flows, isLoading } = useQuery({
    queryKey: ["trending-creatives-landing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flows")
        .select("id, name, thumbnail_url, category, selling_price, flow_metrics(total_runs)")
        .eq("status", "published")
        .limit(20);

      if (error) throw error;

      // Sort client-side since left join can't use referencedTable order reliably
      const mapped = (data || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        thumbnail_url: f.thumbnail_url,
        category: f.category,
        selling_price: f.selling_price,
        total_runs: f.flow_metrics?.total_runs ?? 0,
      })) as TrendingFlow[];

      return mapped.sort((a, b) => b.total_runs - a.total_runs).slice(0, 12);
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <section id="features" className="mx-auto max-w-[1600px] px-4 sm:px-8 py-20">
      <div className="mb-10 text-center">
        <h2 className="mb-3 text-3xl sm:text-[40px] font-bold leading-tight text-foreground">
          {t("trendingTitle")}
        </h2>
        <p className="mx-auto max-w-[520px] text-sm sm:text-base text-muted-foreground">
          {t("trendingSubtitle")}
        </p>
      </div>

      {isLoading ? (
        <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="mb-3 sm:mb-4 break-inside-avoid rounded-xl h-48 sm:h-56" />
          ))}
        </div>
      ) : flows && flows.length > 0 ? (
        <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3 sm:gap-4">
          {flows.map((flow) => (
            <TrendingCard key={flow.id} flow={flow} />
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground text-sm py-12">{t("trendingEmpty")}</p>
      )}
    </section>
  );
}
