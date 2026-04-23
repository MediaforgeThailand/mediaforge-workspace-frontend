import { useState, useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import GlowButton from "@/components/GlowButton";

interface NavItem {
  label: string;
  href: string;
}

interface GlossyHeaderProps {
  logo?: ReactNode;
  navItems?: NavItem[];
  ctaText?: string;
  ctaHref?: string;
  secondaryCtaText?: string;
  secondaryCtaHref?: string;
}

export default function GlossyHeader({
  logo,
  navItems = [],
  ctaText = "Get Started",
  ctaHref = "/app/home",
  secondaryCtaText = "Log in",
  secondaryCtaHref = "/auth",
}: GlossyHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3 xl:px-10 xl:py-5">
      {/* Glossy Backdrop */}
      <div
        className={`absolute inset-0 bg-black/10 backdrop-blur-xl border-b border-white/5 transition-opacity duration-500 ${
          scrolled ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Content */}
      <div className="relative flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center">
          {logo ?? (
            <span className="text-white font-bold uppercase tracking-tight text-lg">
              YOUR LOGO
            </span>
          )}
        </Link>

        {/* Center Nav — hidden on mobile */}
        {navItems.length > 0 && (
          <nav className="hidden xl:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-sm font-medium text-white/70 hover:text-white transition-colors duration-300"
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link to={secondaryCtaHref}>
            <GlowButton variant="outline" glowColor="primary">{secondaryCtaText}</GlowButton>
          </Link>
          <Link to={ctaHref}>
            <GlowButton variant="solid">{ctaText}</GlowButton>
          </Link>
        </div>
      </div>
    </header>
  );
}
