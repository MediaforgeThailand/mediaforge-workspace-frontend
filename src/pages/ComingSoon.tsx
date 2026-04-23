import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Rocket } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const ComingSoon = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />

      <div className="relative z-10 text-center px-6 max-w-lg mx-auto">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-8">
          <Rocket className="w-10 h-10 text-primary" />
        </div>

        {/* Heading */}
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
          {t("comingSoon")}
        </h1>

        {/* Description */}
        <p className="text-lg text-muted-foreground mb-8 leading-relaxed whitespace-pre-line">
          {t("comingSoonDesc")}
        </p>

        {/* Back button */}
        <Link to="/">
          <Button variant="outline" size="lg" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t("comingSoonBack")}
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default ComingSoon;
