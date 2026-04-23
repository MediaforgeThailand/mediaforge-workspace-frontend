import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, Play } from "lucide-react";
import OptimizedVideo from "@/components/ui/OptimizedVideo";
import { useMarketplaceFlows } from "@/hooks/useMarketplaceFlows";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";

const HeroPromo = () => {
  const navigate = useNavigate();
  const { data } = useMarketplaceFlows();
  const isMobile = useIsMobile();
  const { t } = useLanguage();

  const heroSection = data?.sections?.find((s) => s.section_type === "hero");
  const heroFlow = heroSection?.flows?.[0];

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm mx-auto">
      <div className="relative w-full h-[50vh] min-h-[320px] max-h-[480px]">
        <OptimizedVideo
          src={isMobile ? "/videos/mobile/hero_banner_new.mp4" : "/videos/hero_banner_new.webm"}
          fallbackSrc="/videos/hero_banner_new.mp4"
          className="absolute inset-0 w-full h-full"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        <div className="absolute inset-0 flex flex-col justify-end px-8 md:px-12 pb-10 md:pb-14 z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-4 max-w-2xl"
          >
            <div className="flex items-center gap-3">
              {heroFlow?.is_official && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.6, rotateY: 90 }}
                  animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                  transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ scale: 1.1, rotateY: -10, boxShadow: "0 0 24px rgba(168,85,247,0.4)" }}
                  className="inline-flex items-center gap-1.5 bg-primary/15 border border-primary/25 rounded-full px-3 py-1.5 backdrop-blur-sm cursor-default"
                  style={{ perspective: 600 }}
                >
                  <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary drop-shadow-[0_0_6px_rgba(168,85,247,0.6)]" />
                  </motion.div>
                  <span className="text-[11px] font-semibold text-white/80 tracking-wide">{t("heroOfficialBadge")}</span>
                </motion.div>
              )}
            </div>

            <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-foreground tracking-tight leading-[1.1]">
              {heroFlow?.name || t("heroFlowDefault")}
            </h1>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/30 ring-2 ring-primary/40 flex items-center justify-center overflow-hidden">
                {heroFlow?.creator_avatar ? (
                  <img src={heroFlow.creator_avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Sparkles className="w-4 h-4 text-primary" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground/90">
                  {heroFlow?.creator_name || "MediaForge"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {heroFlow?.is_official ? t("heroOfficialCreator") : t("heroCreator")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                asChild
                className="gap-2 gradient-primary border-0 text-primary-foreground shadow-xl shadow-primary/25 hover:shadow-primary/40 rounded-xl px-6 h-12 text-sm font-semibold transition-all duration-300 hover:scale-[1.02]"
              >
                <Link to={heroFlow ? `/play/${heroFlow.id}` : "/app/home"}>
                  <Play className="w-4 h-4" />
                  {heroFlow ? t("heroFlowUse") : t("heroFlowExplore")}
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/creator")}
                className="gap-2 border-white/10 bg-white/[0.04] text-foreground hover:bg-white/[0.08] hover:border-primary/30 rounded-xl px-6 h-12 text-sm font-semibold backdrop-blur-sm transition-all duration-300"
              >
                {t("heroBeCreator")}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroPromo;
