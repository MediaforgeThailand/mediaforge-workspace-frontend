import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import GlossyHeader from "@/components/GlossyHeader";
import logo from "@/assets/logo-white.png";
import HeroSection from "@/components/landing/HeroSection";
import DifferenceSection from "@/components/landing/DifferenceSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";

import ComparisonSection from "@/components/landing/ComparisonSection";
import CreatorsSection from "@/components/landing/CreatorsSection";
import StatsSection from "@/components/landing/StatsSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import PricingSection from "@/components/landing/PricingSection";
import CTASection from "@/components/landing/CTASection";
import LandingFooter from "@/components/landing/LandingFooter";

const Landing = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/app/home", { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen text-foreground" style={{ backgroundColor: '#020403' }}>
      <GlossyHeader
        logo={<img src={logo} alt="MediaForge" className="h-10 sm:h-12 w-auto object-contain" />}
        navItems={[
          { label: "Features", href: "#features" },
          { label: "How It Works", href: "#how-it-works" },
          { label: "Pricing", href: "#pricing" },
          { label: "Creators", href: "#creators" },
        ]}
      />
      <HeroSection />
      <DifferenceSection />
      <HowItWorksSection />
      
      <ComparisonSection />
      <CreatorsSection />
      <StatsSection />
      <TestimonialsSection />
      <PricingSection />
      <CTASection />
      <LandingFooter />
    </div>
  );
};

export default Landing;
