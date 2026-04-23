import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import InteractiveBackground from "@/components/InteractiveBackground";
import PageTransition from "@/components/PageTransition";
import NotificationCenter from "@/components/NotificationCenter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  LogOut, Menu, X, LayoutDashboard, Workflow,
  Globe, ArrowLeftRight, FileStack, Settings, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";


import logoWhite from "@/assets/logo-white.png";

/* ─── Nav Structure ─── */
interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
}

const CREATOR_NAV: NavItem[] = [
  { href: "/creator", icon: LayoutDashboard, label: "creatorNavDashboard" },
  { href: "/creator/studio", icon: Workflow, label: "creatorNavStudio" },
  { href: "/creator/bundles", icon: Package, label: "creatorNavBundles" },
  { href: "/creator/published", icon: FileStack, label: "creatorNavPublished" },
];

const CREATOR_BOTTOM: NavItem[] = [
  { href: "/app/settings", icon: Settings, label: "navSettings" },
];

/* ─── Main Layout ─── */
const CreatorLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut, user } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const getInitials = () => {
    if (profile?.display_name) return profile.display_name.charAt(0).toUpperCase();
    return "U";
  };

  const isActive = (href: string) =>
    location.pathname === href ||
    (href !== "/creator" && location.pathname.startsWith(href));

  /* ─── Nav Link ─── */
  const NavLink = ({ item, onClick }: { item: NavItem; onClick?: () => void }) => {
    const active = isActive(item.href);
    return (
      <Link
        to={item.href}
        onClick={onClick}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 text-[13px] group",
          active
            ? "bg-accent/15 text-slate-100 font-medium"
            : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200",
        )}
      >
        <item.icon className={cn(
          "w-4 h-4 shrink-0 transition-colors",
          active ? "text-accent" : "text-slate-500 group-hover:text-slate-300",
        )} />
        <span className="truncate">{t(item.label as any)}</span>
      </Link>
    );
  };

  /* ─── Profile Dropdown ─── */
  const ProfileDropdown = ({ triggerClassName }: { triggerClassName?: string }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("rounded-full h-9 w-9 p-0", triggerClassName)}>
          <Avatar className="w-8 h-8 border border-white/10">
            <AvatarImage src={profile?.avatar_url || ""} />
            <AvatarFallback className="bg-accent/20 text-slate-200 text-xs font-semibold">{getInitials()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56 bg-popover border-border p-1">
        <div className="px-3 py-2">
          <p className="text-sm font-semibold text-slate-100 truncate">{profile?.display_name || "Creator"}</p>
          <p className="text-xs text-slate-400 truncate">{user?.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/app/settings")} className="px-3 py-2 cursor-pointer text-slate-300">
          <Settings className="mr-2 h-4 w-4 text-slate-400" />
          {t("navSettings")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLanguage(language === "en" ? "th" : "en")} className="px-3 py-2 cursor-pointer text-slate-300">
          <Globe className="mr-2 h-4 w-4 text-slate-400" />
          <span className="flex-1">{t("navLanguage")}</span>
          <span className="text-xs text-slate-500">{language === "en" ? "EN" : "TH"}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="px-3 py-2 cursor-pointer text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          {t("logOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      <div className="fixed inset-0 -z-10">
        <InteractiveBackground />
      </div>

      {/* ─── Desktop Sidebar (darker variant for Creator) ─── */}
      <aside className="hidden lg:flex flex-col fixed top-0 left-0 h-screen w-[260px] z-40 border-r border-white/[0.04] bg-[#060a12]/90 backdrop-blur-xl">
        {/* Logo */}
        <div className="px-4 py-3 border-b border-white/[0.04]">
          <div className="flex items-center justify-between gap-2">
            <Link to="/creator" className="flex items-center gap-2 min-w-0 shrink">
              <img src={logoWhite} alt="MediaForge" className="h-7 w-auto opacity-90" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-accent/80">{t("creatorBadge")}</span>
            </Link>
            <NotificationCenter />
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto px-3 pt-4 space-y-1">
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            {t("creatorWorkspace")}
          </p>
          {CREATOR_NAV.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>

        {/* Bottom */}
        <div className="px-3 py-3 border-t border-white/[0.04] space-y-1">
          {CREATOR_BOTTOM.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
          <button
            onClick={() => navigate("/app/home")}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 text-[13px] w-full text-primary hover:bg-primary/10 font-medium"
          >
            <ArrowLeftRight className="w-4 h-4 shrink-0" />
            <span>{t("creatorSwitchUser")}</span>
          </button>
        </div>
      </aside>

      {/* ─── Mobile Header ─── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 border-b border-white/[0.04] bg-[#060a12]/90 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/creator" className="flex items-center gap-2">
            <img src={logoWhite} alt="MediaForge" className="h-6 w-auto opacity-90" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-accent/80">{t("creatorBadge")}</span>
          </Link>
          <div className="flex items-center gap-1">
            <NotificationCenter />
            <ProfileDropdown />
            <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="h-8 w-8">
              {isMobileMenuOpen ? <X className="w-5 h-5 text-slate-200" /> : <Menu className="w-5 h-5 text-slate-200" />}
            </Button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <nav className="px-3 pb-3 border-t border-white/[0.04] bg-[#060a12]/95 backdrop-blur-xl max-h-[70vh] overflow-auto">
            {CREATOR_NAV.map((item) => (
              <NavLink key={item.href} item={item} onClick={() => setIsMobileMenuOpen(false)} />
            ))}
            <div className="pt-3 border-t border-white/[0.04] mt-2">
              <button
                onClick={() => { setIsMobileMenuOpen(false); navigate("/app/home"); }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] w-full text-primary font-medium"
              >
                <ArrowLeftRight className="w-4 h-4 shrink-0" />
                {t("creatorSwitchUser")}
              </button>
            </div>
          </nav>
        )}
      </div>

      {/* Desktop Top-Right */}
      <div className="hidden lg:flex fixed top-0 right-0 z-50 items-center gap-3 px-5 py-2.5">
        <ProfileDropdown />
      </div>

      {/* ─── Main Content ─── */}
      <main className="flex-1 lg:ml-[260px] lg:px-10 lg:py-6 px-4 py-4 pt-16 lg:pt-14 overflow-auto relative z-10">
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default CreatorLayout;
