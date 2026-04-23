import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Home, Clock, CreditCard, Sparkles, Settings, LogOut, MessageSquare } from "lucide-react";

export default function UserAvatarMenu() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const initials = profile?.display_name
    ? profile.display_name.slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "U";

  if (!user) return null;

  const openFeedback = () => {
    // Open mailto for feedback. Replace with in-app feedback modal if available.
    window.location.href = "mailto:support@mediaforge.co?subject=PlayFlow%20Feedback";
  };

  return (
    <div className="ml-auto flex items-center gap-2">
      {/* Feedback button (CI Aether spec) */}
      <button
        onClick={openFeedback}
        className="hidden md:flex h-8 px-3 rounded-[10px] items-center gap-1.5 text-[11.5px] font-semibold text-white/75 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-colors"
      >
        <MessageSquare className="w-3 h-3" />
        Feedback
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-8 h-8 rounded-[10px] overflow-hidden flex items-center justify-center text-[11px] font-bold text-white bg-gradient-to-br from-[#c15173] to-[#a855f7] hover:opacity-90 transition-opacity focus:outline-none shrink-0">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-[#141220] border-white/[0.08] text-white/90">
          <DropdownMenuItem onClick={() => navigate("/app/home")} className="gap-2 cursor-pointer hover:bg-white/[0.06] focus:bg-white/[0.06]">
            <Home className="w-4 h-4" /> {t("pfHome")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/app/history")} className="gap-2 cursor-pointer hover:bg-white/[0.06] focus:bg-white/[0.06]">
            <Clock className="w-4 h-4" /> {t("pfHistory")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/app/pricing")} className="gap-2 cursor-pointer hover:bg-white/[0.06] focus:bg-white/[0.06]">
            <CreditCard className="w-4 h-4" /> {t("pfCreditsNav")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/creator")} className="gap-2 cursor-pointer hover:bg-white/[0.06] focus:bg-white/[0.06]">
            <Sparkles className="w-4 h-4" /> {t("pfCreatorStudio")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-white/[0.08]" />
          <DropdownMenuItem onClick={() => navigate("/app/settings")} className="gap-2 cursor-pointer hover:bg-white/[0.06] focus:bg-white/[0.06]">
            <Settings className="w-4 h-4" /> {t("pfSettings")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOut()} className="gap-2 cursor-pointer hover:bg-white/[0.06] focus:bg-white/[0.06] text-rose-300 focus:text-rose-300">
            <LogOut className="w-4 h-4" /> {t("pfSignOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
