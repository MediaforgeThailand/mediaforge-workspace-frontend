import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import NotificationCenter from "@/components/NotificationCenter";
import LoginRequiredDialog from "@/components/LoginRequiredDialog";
import {
  LogOut, Clock, Zap, Settings, BarChart3, Globe,
  ArrowLeftRight, Crown, CreditCard, Plus, Search, LogIn,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCredits } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";

const TopNavbar = () => {
  const navigate = useNavigate();
  const { profile, signOut, user } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { credits } = useCredits();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPartner, setIsPartner] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  useEffect(() => {
    if (user) {
      supabase.rpc("has_role", { _user_id: user.id, _role: "admin" as any }).then(({ data }) => setIsAdmin(!!data));
      supabase
        .from("partners")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => setIsPartner(!!data));
    }
  }, [user]);

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

  const creditBalance = credits?.balance ?? 0;
  const creditUsed = credits?.total_used ?? 0;
  const creditLimit = credits?.total_purchased ?? 0;
  const creditPercent = creditLimit > 0 ? Math.min((creditUsed / creditLimit) * 100, 100) : 0;

  const isGuest = !user;

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-transparent" style={{ background: "rgba(0, 0, 0, 0.65)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
        <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-4 px-4 md:px-8 h-[80px]">
          {/* Left — Logo */}
          <Link to="/app/home" className="flex items-center gap-1.5 shrink-0">
            <img src="/favicon.png" alt="MediaForge" className="h-8 w-auto" />
            <span className="text-[9px] font-semibold tracking-wider uppercase text-muted-foreground/60 border border-border/30 rounded px-1.5 py-0.5 leading-none">Beta 0.2</span>
          </Link>

          {/* Center — Search (hidden on mobile) */}
          <div className="hidden md:flex flex-1 max-w-md mx-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search flows..."
              className="pl-9 h-9 bg-muted/30 border-border/50 rounded-full text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/30"
            />
          </div>

          {/* Right — Actions */}
          <div className="flex items-center gap-2">
            {isGuest ? (
              /* ─── Guest Actions ─── */
              <>
                <button
                  onClick={() => setLanguage(language === "en" ? "th" : "en")}
                  className="flex items-center gap-1 rounded-full border border-border/40 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Globe className="h-3.5 w-3.5" />
                  {language === "en" ? "TH" : "EN"}
                </button>
                <Link to="/auth">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-xs h-8">
                    <LogIn className="w-3.5 h-3.5 mr-1.5" />
                    Login
                  </Button>
                </Link>
                <Button variant="gradient" size="sm" className="h-8 text-xs" onClick={() => setShowLoginDialog(true)}>
                  Sign Up Free
                </Button>
              </>
            ) : (
              /* ─── Authenticated Actions ─── */
              <>
                <NotificationCenter />

                {/* Switch to Creator — desktop */}
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden lg:flex items-center gap-1.5 text-xs h-8 border-accent/30 text-accent-foreground hover:bg-accent/10"
                  onClick={() => navigate("/partner-program")}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>Partner</span>
                </Button>

                {/* Avatar Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 p-0">
                      <Avatar className="w-8 h-8 border border-border">
                        <AvatarImage src={profile?.avatar_url || ""} />
                        <AvatarFallback className="bg-primary/20 text-foreground text-xs font-semibold">{getInitials()}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={8} className="w-72 bg-popover border-border p-0">
                    {/* User info */}
                    <div className="px-4 pt-4 pb-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10 border border-border">
                          <AvatarImage src={profile?.avatar_url || ""} />
                          <AvatarFallback className="bg-primary/20 text-foreground text-sm font-semibold">{getInitials()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-foreground truncate">{profile?.display_name || "User"}</p>
                            {isPartner && (
                              <span className="text-[9px] font-bold tracking-[0.12em] uppercase bg-primary/15 text-primary border border-primary/30 rounded px-1.5 py-0.5 leading-none">
                                Partner
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                        </div>
                      </div>
                      {profile?.subscription_status === "free" && (
                        <Button className="w-full mt-3 gradient-primary text-primary-foreground font-medium text-sm" size="sm" onClick={() => navigate("/app/pricing")}>
                          Upgrade
                        </Button>
                      )}
                    </div>
                    <DropdownMenuSeparator />
                    {/* Credit usage */}
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <BarChart3 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-foreground font-medium">{t("navCreditUsage")}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                        <span>{t("navSpent", { amount: creditUsed.toLocaleString() })}</span>
                      </div>
                      <Progress value={creditPercent} className="h-2" />
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-xs text-muted-foreground">{t("navCreditsRemaining", { amount: creditBalance.toLocaleString() })}</p>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-accent-foreground bg-accent/80 hover:bg-accent font-medium" onClick={() => navigate("/app/pricing#topup")}>
                          <Plus className="w-3 h-3 mr-1" />{t("navTopUp")}
                        </Button>
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <div className="py-1">
                      <DropdownMenuItem onClick={() => navigate("/app/history")} className="px-4 py-2.5 cursor-pointer">
                        <Clock className="mr-3 h-4 w-4 text-muted-foreground" />
                        <span className="text-popover-foreground">{t("navMyRuns")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/app/pricing")} className="px-4 py-2.5 cursor-pointer">
                        <CreditCard className="mr-3 h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 text-popover-foreground">{t("navPlanBilling")}</span>
                        <span className="text-xs text-accent-foreground bg-accent/20 px-1.5 py-0.5 rounded font-medium">{getSubscriptionLabel()}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/app/settings")} className="px-4 py-2.5 cursor-pointer">
                        <Settings className="mr-3 h-4 w-4 text-muted-foreground" />
                        <span className="text-popover-foreground">{t("navSettings")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/app/transactions")} className="px-4 py-2.5 cursor-pointer">
                        <BarChart3 className="mr-3 h-4 w-4 text-muted-foreground" />
                        <span className="text-popover-foreground">{t("navTransactions")}</span>
                      </DropdownMenuItem>
                      {isAdmin && (
                        <DropdownMenuItem onClick={() => navigate("/app/admin")} className="px-4 py-2.5 cursor-pointer">
                          <Crown className="mr-3 h-4 w-4 text-muted-foreground" />
                          <span className="text-popover-foreground">{t("navAdmin")}</span>
                        </DropdownMenuItem>
                      )}
                      {isPartner && (
                        <DropdownMenuItem onClick={() => navigate("/app/partner/dashboard")} className="px-4 py-2.5 cursor-pointer">
                          <ArrowLeftRight className="mr-3 h-4 w-4 text-muted-foreground" />
                          <span className="text-popover-foreground">Partner dashboard</span>
                        </DropdownMenuItem>
                      )}
                    </div>
                    <DropdownMenuSeparator />
                    <div className="py-1">
                      <DropdownMenuItem onClick={() => setLanguage(language === "en" ? "th" : "en")} className="px-4 py-2.5 cursor-pointer">
                        <Globe className="mr-3 h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 text-popover-foreground">{t("navLanguage")}</span>
                        <span className="text-xs text-muted-foreground">{language === "en" ? "English" : "ไทย"}</span>
                      </DropdownMenuItem>
                    </div>
                    <DropdownMenuSeparator />
                    {/* Mobile-only: Creator switch */}
                    <div className="py-1 lg:hidden">
                      <DropdownMenuItem onClick={() => navigate("/partner-program")} className="px-4 py-2.5 cursor-pointer">
                        <ArrowLeftRight className="mr-3 h-4 w-4 text-muted-foreground" />
                        <span className="text-popover-foreground">Partner Program</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </div>
                    <div className="py-1">
                      <DropdownMenuItem onClick={handleLogout} className="px-4 py-2.5 cursor-pointer text-destructive">
                        <LogOut className="mr-3 h-4 w-4" />
                        {t("logOut")}
                      </DropdownMenuItem>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Login Dialog for guests */}
      <LoginRequiredDialog open={showLoginDialog} onOpenChange={setShowLoginDialog} />
    </>
  );
};

export default TopNavbar;
