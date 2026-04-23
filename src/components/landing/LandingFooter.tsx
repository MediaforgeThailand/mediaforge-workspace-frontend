import { Link } from "react-router-dom";
import logo from "@/assets/logo-white.png";

const columns = [
  { title: "Product", links: [{ label: "Features", href: "#features" }, { label: "Pricing", href: "#pricing" }, { label: "API", href: "#" }, { label: "Changelog", href: "#" }] },
  { title: "Company", links: [{ label: "About", href: "#" }, { label: "Blog", href: "#" }, { label: "Careers", href: "#" }, { label: "Contact", href: "mailto:support@mediaforge.ai" }] },
  { title: "Resources", links: [{ label: "Documentation", href: "#" }, { label: "Help Center", href: "#" }, { label: "Community", href: "#" }, { label: "Status", href: "#" }] },
  { title: "Legal", links: [{ label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }, { label: "Security", href: "#" }, { label: "Cookies", href: "#" }] },
];

export default function LandingFooter() {
  return (
    <footer className="border-t border-border/50">
      <div className="mx-auto max-w-[1600px] px-8 py-16">
        <div className="mx-auto max-w-[1536px]">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
            <div className="col-span-2 sm:col-span-3 lg:col-span-1">
              <Link to="/" className="flex items-center">
                <img src={logo} alt="MediaForge" className="h-10 w-auto opacity-80" />
              </Link>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                AI Outcome Marketplace
              </p>
            </div>

            {columns.map((col) => (
              <div key={col.title}>
                <h4 className="mb-4 text-sm font-semibold text-foreground">{col.title}</h4>
                <div className="flex flex-col gap-2.5">
                  {col.links.map((link) =>
                    link.href.startsWith("/") ? (
                      <Link key={link.label} to={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                        {link.label}
                      </Link>
                    ) : (
                      <a key={link.label} href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                        {link.label}
                      </a>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-8 sm:flex-row">
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} MediaForge. All rights reserved.</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <Link to="/terms" className="hover:text-foreground">Terms</Link>
              <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
