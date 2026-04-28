import { useLocation, useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import NotificationCenter from "@/components/NotificationCenter";
import LoginRequiredDialog from "@/components/LoginRequiredDialog";
import {
  Home, Search, LayoutGrid, Maximize2, Settings, Coins,
  Bell, ArrowLeftRight, LogOut, Clock, CreditCard, BarChart3,
  Crown, Globe, Plus, LogIn, Zap, Gift, Sparkles, Layers,
} from "lucide-react";

interface SidebarItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

const NAV_ITEMS: SidebarItem[] = [
  { icon: Home, label: "navHome", path: "/app/home" },
  { icon: LayoutGrid, label: "navLibrary", path: "/app/assets" },
  { icon: Layers, label: "Workspace", path: "/app/workspace" },
];

const BOTTOM_ITEMS: SidebarItem[] = [
  { icon: Gift, label: "Refer", path: "/app/settings/refer" },
  { icon: Settings, label: "Settings", path: "/app/settings" },
];

const DashboardSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut, user } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { credits } = useCredits();
  const creditBalance = credits?.balance ?? 0;
  const creditUsed = credits?.total_used ?? 0;
  const creditLimit = credits?.total_purchased ?? 0;
  const creditPercent = creditLimit > 0 ? Math.min((creditUsed / creditLimit) * 100, 100) : 0;
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPlanName, setCurrentPlanName] = useState<string | null>(null);
  const isGuest = !user;

  useEffect(() => {
    if (user) {
      supabase.rpc("has_role", { _user_id: user.id, _role: "admin" as any }).then(({ data }) => setIsAdmin(!!data));
      supabase.rpc("has_role", { _user_id: user.id, _role: "creator" as any }).then(({ data }) => setIsCreator(!!data));
    }
  }, [user]);

  // Fetch current subscription plan name
  useEffect(() => {
    const planId = (profile as any)?.subscription_plan_id || (profile as any)?.current_plan_id;
    if (planId) {
      supabase
        .from("subscription_plans")
        .select("name")
        .eq("id", planId)
        .single()
        .then(({ data }) => {
          if (data?.name) setCurrentPlanName(data.name);
        });
    } else {
      setCurrentPlanName(null);
    }
  }, [profile]);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

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

  const isActive = (path: string) => location.pathname === path;

  const handleSearch = () => {
    if (searchQuery.trim()) navigate(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  return (
    <>
      <aside className="fixed left-3 top-3 bottom-3 z-40 hidden md:flex w-[74px] flex-col items-center rounded-[22px] px-1.5 py-4 sidebar-glass">

        {/* ─── Top: Logo ─── */}
        <Link to="/app/home" className="mb-3 flex flex-col items-center gap-1 shrink-0">
          <img src="/favicon.png" alt="MediaForge" className="h-7 w-auto" />
          <span
            className="text-[9px] font-bold tracking-wide rounded px-1.5 py-[2px] leading-none"
            style={{ background: "#90D5FF", color: "#0a0a0a" }}
            title={`commit ${__APP_COMMIT__}`}
          >
            v {__APP_VERSION__}
          </span>
        </Link>

        {/* Divider */}
        <div className="mb-2 h-px w-10 bg-white/10" />

        {/* ─── Middle: Nav items ─── */}
        <div className="flex flex-1 flex-col items-center gap-2 w-full overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center gap-[3px] w-full h-[60px] rounded-[18px] transition-all",
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
                style={{ transition: "all 120ms cubic-bezier(0.4, 0, 0.2, 1)" }}
              >
                <Icon className="w-[22px] h-[22px]" />
                <span className="text-[13px] font-medium leading-tight text-white">{t(item.label as any)}</span>
              </button>
            );
          })}

          {/* Creator Studio — only for creators/admins */}
          {(isCreator || isAdmin) && (
            <button
              onClick={() => navigate("/creator/studio")}
              className={cn(
                "flex flex-col items-center justify-center gap-[3px] w-full h-[60px] rounded-[18px] transition-all",
                isActive("/creator/studio")
                  ? "bg-white/10 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
              style={{ transition: "all 120ms cubic-bezier(0.4, 0, 0.2, 1)" }}
              title="Creator Studio"
            >
              <Sparkles className="w-[22px] h-[22px]" />
              <span className="text-[13px] font-medium leading-tight text-white">Studio</span>
            </button>
          )}
        </div>

        {/* ─── Bottom Section ─── */}
        <div className="mt-2 flex flex-col items-center gap-2 w-full">
          {/* Divider */}
          <div className="h-px w-10 bg-white/10" />

          {/* Settings */}
          {BOTTOM_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center gap-[3px] w-full h-[60px] rounded-[18px] transition-all",
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
                style={{ transition: "all 120ms cubic-bezier(0.4, 0, 0.2, 1)" }}
              >
                <Icon className="w-[22px] h-[22px]" />
                <span className="text-[13px] font-medium leading-tight text-white">{t(item.label as any)}</span>
              </button>
            );
          })}

          {/* Notifications */}
          {!isGuest && <NotificationCenter />}

          {/* Credits */}
          <button
            onClick={() => navigate("/app/pricing")}
            className="flex items-center gap-1"
          >
            <Coins className="w-[15px] h-[15px] text-[#d4ff00]" />
            <span className="text-[14px] font-semibold text-[#d4ff00]">
              {creditBalance.toLocaleString()}
            </span>
          </button>

          {/* Upgrade button */}
          <button
            onClick={() => navigate("/app/pricing")}
            className={cn(
              "rounded-full px-[7px] py-[4px] text-[11.5px] font-medium text-white hover:opacity-90 glass-border",
              currentPlanName ? "bg-white/10" : ""
            )}
            style={currentPlanName ? {} : { background: "rgb(110,96,238)", transition: "all 120ms cubic-bezier(0.4, 0, 0.2, 1)" }}
          >
            {currentPlanName || "Upgrade"}
          </button>

          {/* User Avatar / Auth */}
          {isGuest ? (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => setLanguage(language === "en" ? "th" : "en")}
                className="flex items-center gap-1 rounded-full border border-border/40 px-2 py-0.5 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Globe className="h-3 w-3" />
                {language === "en" ? "TH" : "EN"}
              </button>
              <Link to="/auth">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-[10px] h-7 px-2">
                  <LogIn className="w-3 h-3 mr-1" />
                  Login
                </Button>
              </Link>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <Avatar className="w-9 h-9 border border-border">
                    <AvatarImage src={profile?.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/20 text-foreground text-xs font-semibold">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" sideOffset={12} className="w-56 bg-popover border-border p-0">
                {/* User info */}
                <div className="px-4 pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 border border-border">
                      <AvatarImage src={profile?.avatar_url || ""} />
                      <AvatarFallback className="bg-primary/20 text-foreground text-sm font-semibold">{getInitials()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{profile?.display_name || "User"}</p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    </div>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <div className="py-1">
                  <DropdownMenuItem onClick={() => navigate("/app/settings")} className="px-4 py-2.5 cursor-pointer">
                    <Settings className="mr-3 h-4 w-4 text-muted-foreground" />
                    <span className="text-popover-foreground">{t("navSettings")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/redeem")} className="px-4 py-2.5 cursor-pointer">
                    <Gift className="mr-3 h-4 w-4 text-muted-foreground" />
                    <span className="text-popover-foreground">{t("navRedeemCode")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLanguage(language === "en" ? "th" : "en")} className="px-4 py-2.5 cursor-pointer">
                    <Globe className="mr-3 h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 text-popover-foreground">{t("navLanguage")}</span>
                    <span className="text-xs text-muted-foreground">{language === "en" ? "English" : "ไทย"}</span>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigate("/admin")} className="px-4 py-2.5 cursor-pointer">
                      <Crown className="mr-3 h-4 w-4 text-muted-foreground" />
                      <span className="text-popover-foreground">{t("navAdmin")}</span>
                    </DropdownMenuItem>
                  )}
                </div>
                <DropdownMenuSeparator />
                <div className="py-1">
                  <DropdownMenuItem onClick={handleLogout} className="px-4 py-2.5 cursor-pointer text-destructive">
                    <LogOut className="mr-3 h-4 w-4" />
                    {t("logOut")}
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </aside>

      <LoginRequiredDialog open={showLoginDialog} onOpenChange={setShowLoginDialog} />
    </>
  );
};

export default DashboardSidebar;
