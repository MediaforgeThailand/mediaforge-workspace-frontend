import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import GlowButton from "@/components/GlowButton";
import { useIsMobile } from "@/hooks/use-mobile";
import { phLandingCtaClicked } from "@/lib/posthogEvents";

export default function HeroSection() {
  const isMobile = useIsMobile();
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-[25%] top-0 h-[500px] w-[500px] rounded-full bg-primary/10 blur-[100px]" />
      <div className="pointer-events-none absolute left-[28%] top-[312px] h-[600px] w-[600px] rounded-full bg-purple-900/5 blur-[120px]" />

      <div className="relative mx-auto flex max-w-[1600px] flex-col gap-10 px-8 pb-[128px] pt-[128px] lg:flex-row lg:items-center lg:gap-20">
        <div className="flex w-full flex-1 flex-col items-start gap-8">

          <h1 className="text-[48px] font-bold leading-[1.2] tracking-tight text-foreground lg:text-[56px]">
            From product photo to polished content.{" "}
            <br />
            <span className="text-foreground">
              In 60 seconds.
            </span>
          </h1>

          <p className="max-w-[600px] text-base leading-[28px] text-muted-foreground">
            Choose a MediaForge AI Flow, upload your asset, and get ready-to-use marketing creative without complex prompting or a production team.
          </p>

          <div className="flex items-center gap-4 pt-2">
            <Link to="/app/home" onClick={() => phLandingCtaClicked("hero_start_creating")}>
              <GlowButton variant="outline" glowColor="primary" className="h-[62px] px-8 text-base">
                Start Creating Free
              </GlowButton>
            </Link>
          </div>

          <div className="flex items-center gap-8 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Check size={16} className="text-green-500" /> 5 free generations
            </span>
          </div>
        </div>

        <div className="relative w-full flex-1">
          <div className="glass-border aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-card to-card/80 shadow-2xl shadow-primary/5">
            <video
              autoPlay
              loop
              muted
              playsInline
              poster="/videos/hero_poster.webp"
              className="h-full w-full object-cover"
            >
              {!isMobile && <source src="/videos/hero_new.webm" type="video/webm" />}
              <source src={isMobile ? "/videos/mobile/hero_new.mp4" : "/videos/hero_new.mp4"} type="video/mp4" />
            </video>
          </div>
        </div>
      </div>
    </section>
  );
}
