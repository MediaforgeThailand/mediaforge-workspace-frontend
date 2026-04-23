import { useLocation, useNavigate, Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import ShineBorder from "@/components/ShineBorder";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { useLanguage } from "@/contexts/LanguageContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import NotificationCenter from "@/components/NotificationCenter";
import {
  Home, Search, LayoutGrid, User, LogOut, Clock,
  CreditCard, BarChart3, Settings, Globe, Plus, Coins, LogIn, ArrowLeftRight,
} from "lucide-react";

const NAV_ITEMS = [
  { icon: Home, label: "Home", path: "/app/home" },
  { icon: LayoutGrid, label: "Library", path: "/app/assets" },
];

export default function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut, user } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { credits } = useCredits();
  const [profileOpen, setProfileOpen] = useState(false);

  const creditBalance = credits?.balance ?? 0;
  const creditUsed = credits?.total_used ?? 0;
  const creditLimit = credits?.total_purchased ?? 0;
  const creditPercent = creditLimit > 0 ? Math.min((creditUsed / creditLimit) * 100, 100) : 0;

  const isGuest = !user;
  const isActive = (path: string) => location.pathname === path;

  const getInitials = () => {
    if (profile?.display_name) return profile.display_name.charAt(0).toUpperCase();
    return "U";
  };

  const getSubscriptionLabel = () => {
    if (profile?.plan_name) return profile.plan_name;
    switch (profile?.subscription_status) {
      case "professional": return "Pro";
      case "agency": return "Agency";
      default: return "Free";
    }
  };

  const handleLogout = async () => {
    setProfileOpen(false);
    await signOut();
    navigate("/");
  };

  const navTo = (path: string) => {
    setProfileOpen(false);
    navigate(path);
  };

  return (
    <>
      {/* Bottom Nav Bar */}
      <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden safe-area-bottom px-2 pb-2">
        <ShineBorder speed="12s" thickness="1.5px" inset="0rem" borderRadius="1rem">
          <div
            className="glass-border rounded-2xl"
            style={{ background: "rgba(8,12,20,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
          >
        <div className="flex items-center justify-around h-[60px] px-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                  active ? "text-white" : "text-white/50"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}

          {/* Profile / Login button */}
          {isGuest ? (
            <Link
              to="/auth"
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-white/50"
            >
              <LogIn className="w-5 h-5" />
              <span className="text-[10px] font-medium">Login</span>
            </Link>
          ) : (
            <button
              onClick={() => setProfileOpen(true)}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-white/50"
            >
              <Avatar className="w-6 h-6 border border-white/20">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/20 text-[9px] font-semibold text-white">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <span className="text-[10px] font-medium">Profile</span>
            </button>
          )}
        </div>
          </div>
        </ShineBorder>
      </nav>

      {/* Profile Sheet */}
      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent side="bottom" className="rounded-t-[20px] bg-[#0d1321] border-white/10 px-5 pb-8 pt-4 max-h-[85vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="sr-only">Profile Menu</SheetTitle>
          </SheetHeader>

          {/* User info */}
          <div className="flex items-center gap-3 mb-4">
            <Avatar className="w-12 h-12 border border-white/15">
              <AvatarImage src={profile?.avatar_url || ""} />
              <AvatarFallback className="bg-primary/20 text-foreground font-semibold">{getInitials()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{profile?.display_name || "User"}</p>
              <p className="text-xs text-white/50 truncate">{user?.email}</p>
            </div>
            <span className="text-[10px] font-medium text-accent-foreground bg-accent/20 px-2 py-0.5 rounded-full">
              {getSubscriptionLabel()}
            </span>
          </div>

          {/* Credit bar */}
          <div className="rounded-xl bg-white/5 p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-[#d4ff00]" />
                <span className="text-sm font-semibold text-[#d4ff00]">{creditBalance.toLocaleString()}</span>
                <span className="text-xs text-white/50">credits</span>
              </div>
              <Button
                variant="ghost" size="sm"
                className="h-6 px-2 text-[10px] text-accent-foreground bg-accent/80 hover:bg-accent font-medium"
                onClick={() => navTo("/app/pricing#topup")}
              >
                <Plus className="w-3 h-3 mr-1" />Top-up
              </Button>
            </div>
            <Progress value={creditPercent} className="h-1.5" />
            <p className="text-[10px] text-white/40 mt-1">Spent {creditUsed.toLocaleString()}</p>
          </div>

          {/* Menu items */}
          <div className="space-y-1">
            {[
              { icon: Clock, label: "My Runs", path: "/app/assets" },
              { icon: CreditCard, label: "Plan & Billing", path: "/app/pricing" },
              { icon: BarChart3, label: "Transactions", path: "/app/transactions" },
              { icon: ArrowLeftRight, label: "Refer & Earn", path: "/app/settings/refer" },
              { icon: Settings, label: "Settings", path: "/app/settings" },
            ].map(({ icon: Icon, label, path }) => (
              <button
                key={path}
                onClick={() => navTo(path)}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm text-white/80 hover:bg-white/5 transition-colors"
              >
                <Icon className="w-4 h-4 text-white/50" />
                {label}
              </button>
            ))}

            {/* Language */}
            <button
              onClick={() => setLanguage(language === "en" ? "th" : "en")}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm text-white/80 hover:bg-white/5 transition-colors"
            >
              <Globe className="w-4 h-4 text-white/50" />
              <span className="flex-1 text-left">Language</span>
              <span className="text-xs text-white/40">{language === "en" ? "English" : "ไทย"}</span>
            </button>
          </div>

          {/* Logout */}
          <div className="mt-4 pt-3 border-t border-white/10">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {t("logOut")}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
