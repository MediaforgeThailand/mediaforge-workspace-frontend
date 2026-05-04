import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";

const navLinks = [
  { label: "AI Tools", href: "/#one-click", dropdown: true },
  { label: "Features", href: "/#features", dropdown: true },
  { label: "Resources", href: "/blog", dropdown: true },
  { label: "Pricing", href: "/app/pricing" },
];

export function MarketingNavbar() {
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed left-1/2 top-4 z-50 flex h-[64px] w-[min(94vw,1200px)] -translate-x-1/2 items-center justify-between overflow-hidden rounded-full border px-4 text-[15px] text-white shadow-[0_24px_70px_-34px_rgba(199,125,255,.75),0_14px_34px_-22px_rgba(0,0,0,.75)] backdrop-blur-2xl transition-all duration-500 before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:bg-[radial-gradient(70%_180%_at_50%_-40%,rgba(255,255,255,.34),transparent_62%)] md:px-6 ${
        solid
          ? "border-white/18 bg-[rgba(13,7,22,.72)] ring-1 ring-white/10"
          : "border-white/20 bg-white/[.105] ring-1 ring-white/10"
      }`}
    >
      <Link to="/" className="relative z-10 flex min-w-0 items-center gap-2 font-bold text-white drop-shadow-[0_1px_12px_rgba(0,0,0,.65)]">
        <img src={logoIcon} alt="" className="h-8 w-8 shrink-0" />
        <span className="truncate text-[18px]">MediaForge</span>
      </Link>

      <div className="relative z-10 hidden items-center gap-7 font-medium md:flex">
        {navLinks.map((item) => (
          <Link key={item.label} to={item.href} className="flex items-center gap-1 text-white/86 drop-shadow-[0_1px_10px_rgba(0,0,0,.45)] transition hover:text-[var(--brand-soft)]">
            {item.label}
            {item.dropdown ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : null}
          </Link>
        ))}
      </div>

      <Link
        to="/auth"
        className="relative z-10 inline-flex h-[42px] shrink-0 items-center gap-2 rounded-full border border-white/16 bg-[linear-gradient(135deg,var(--brand-primary),var(--brand-hover))] px-4 text-[14px] font-semibold text-white shadow-[0_12px_28px_-10px_rgba(155,77,224,.95),inset_0_1px_0_rgba(255,255,255,.22)] transition hover:scale-[1.03] hover:bg-[var(--brand-hover)] sm:px-5"
      >
        <span className="hidden sm:inline">Start for Free</span>
        <span className="sm:hidden">Start</span>
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </nav>
  );
}

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden px-5 py-28">
      <div
        className="absolute inset-0 -z-10 opacity-80"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 50%, rgba(91,42,140,.78), transparent 70%), linear-gradient(180deg, transparent, rgba(199,125,255,.08))",
        }}
      />
      <div className="reveal-scale mx-auto max-w-4xl rounded-lg border border-white/10 bg-[linear-gradient(135deg,var(--brand-deep),#181022_50%,var(--bg-card))] p-8 text-center shadow-[0_40px_100px_-24px_rgba(155,77,224,.45)] md:p-14">
        <p className="mb-4 text-[13px] font-semibold uppercase tracking-[.22em] text-[var(--brand-soft)]">MediaForge Studio</p>
        <h2 className="text-[clamp(40px,6vw,76px)] font-bold leading-[.98] tracking-normal">
          Ready to make
          <br />
          <span className="text-[var(--brand-soft)]">visual stories?</span>
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-[18px] leading-7 text-white/70">
          Build campaigns, social posts, scenes, and product visuals from one creative workspace.
        </p>
        <Link
          to="/auth"
          className="mt-9 inline-flex h-[48px] items-center gap-2 rounded-full bg-[var(--brand-primary)] px-7 text-[15px] font-semibold text-white shadow-[0_10px_40px_-10px_rgba(155,77,224,.9)] transition hover:scale-[1.03] hover:bg-[var(--brand-hover)]"
        >
          Start for Free
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
