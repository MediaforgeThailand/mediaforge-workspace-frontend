import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import OptimizedVideo from "@/components/ui/OptimizedVideo";

interface MediaThumbnailProps {
  url?: string | null;
  alt?: string;
  className?: string;
  /** Play video on hover only (default: true). If false, autoPlay immediately. */
  hoverPlay?: boolean;
  /** Fallback when no url */
  fallback?: React.ReactNode;
}

function isVideoUrl(url: string): boolean {
  // Strip query params for extension check
  const clean = url.split("?")[0].toLowerCase();
  return clean.endsWith(".mp4") || clean.endsWith(".webm");
}

const MediaThumbnail = ({
  url,
  alt = "",
  className,
  hoverPlay = true,
  fallback,
}: MediaThumbnailProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  if (!url) {
    return (
      <div className={cn("w-full h-full bg-gradient-to-br from-primary/10 via-accent/5 to-muted/5 flex items-center justify-center", className)}>
        {fallback ?? <Sparkles className="w-6 h-6 text-primary/20" />}
      </div>
    );
  }

  const isVideo = isVideoUrl(url);

  if (isVideo) {
    return (
      <OptimizedVideo
        src={url}
        hoverPlay={hoverPlay}
        className={cn("w-full h-full", className)}
      />
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={cn("w-full h-full object-cover", className)}
      loading="lazy"
    />
  );
};

export default MediaThumbnail;
export { isVideoUrl };
