import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X as XIcon } from "lucide-react";
import logo from "@/assets/logo-white.png";

const links = ["Features", "How It Works", "Pricing", "Creators"];

export default function LandingNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1600px] items-center justify-between px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logo} alt="MediaForge" className="h-10 sm:h-12 w-auto object-contain" />
        </Link>

        <div className="hidden items-center gap-10 lg:flex">
          {links.map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/ /g, "-")}`}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <Link to="/auth">
            <Button variant="ghost" size="sm" className="glass-border rounded-lg text-muted-foreground hover:text-foreground">
              Log in
            </Button>
          </Link>
          <Link to="/app/home">
            <Button size="sm" className="glass-border rounded-lg bg-primary px-5 text-primary-foreground hover:bg-primary/90">
              Get Started Free
            </Button>
          </Link>
        </div>

        <button className="text-foreground lg:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <XIcon size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/40 bg-background px-8 py-4 lg:hidden">
          <div className="flex flex-col gap-4">
            {links.map((item) => (
              <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-")}`} className="text-sm text-muted-foreground">
                {item}
              </a>
            ))}
            <Link to="/app/home">
              <Button size="sm" className="w-full bg-primary text-primary-foreground">
                Get Started Free
              </Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
