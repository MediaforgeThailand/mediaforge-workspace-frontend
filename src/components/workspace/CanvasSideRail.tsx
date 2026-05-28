import { Link } from "react-router-dom";
import { FolderOpen, Home, UserRound } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { DEFAULT_BRAND_LOGO, DEFAULT_BRAND_NAME } from "@/components/workspace/brandAssets";
import { UserMenu } from "@/components/workspace/UserMenu";

const CanvasSideRail = () => {
  const { t } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const location = useLocation();

  const openLogin = () => {
    openAuthModal({
      initialTab: "login",
      redirectPath: `${location.pathname}${location.search}${location.hash}`,
    });
  };

  return (
    <aside
      className="z-[85] flex h-screen w-[44px] shrink-0 flex-col items-center border-r border-white/[0.07] bg-[#050606] py-[9px] text-zinc-400"
      style={{ fontFamily: "var(--font-sans)" }}
      aria-label="Canvas navigation"
    >
      <Link
        to="/app/workspace"
        title={t("workspace.sidebar.home")}
        aria-label={t("workspace.sidebar.home")}
        className="mb-[16px] grid h-[24px] w-[30px] place-items-center rounded-[6px] transition-colors hover:bg-white/[0.07]"
      >
        <img
          src={DEFAULT_BRAND_LOGO}
          alt={DEFAULT_BRAND_NAME}
          className="h-full w-full select-none object-contain"
          draggable={false}
        />
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-[7px]">
        <Link
          to="/app/workspace"
          title={t("workspace.canvas.back_dashboard")}
          aria-label={t("workspace.canvas.back_dashboard")}
          className="grid h-[30px] w-[30px] place-items-center rounded-[8px] transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <Home className="h-[16px] w-[16px]" strokeWidth={2.1} />
        </Link>

        <button
          type="button"
          title={t("workspace.tools.assets")}
          aria-label={t("workspace.tools.assets")}
          onClick={() => window.dispatchEvent(new CustomEvent("workspace-open-all-assets"))}
          className="grid h-[30px] w-[30px] place-items-center rounded-[8px] transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <FolderOpen className="h-[16px] w-[16px]" strokeWidth={2.1} />
        </button>
      </nav>

      <div className="grid h-[40px] w-[40px] place-items-center">
        {authLoading ? (
          <span className="h-[30px] w-[30px] rounded-full border border-white/[0.08] bg-white/[0.06]" aria-hidden="true" />
        ) : user ? (
          <UserMenu compact />
        ) : (
          <button
            type="button"
            title={t("authSignInButton")}
            aria-label={t("authSignInButton")}
            onClick={openLogin}
            className="grid h-[30px] w-[30px] place-items-center rounded-full border border-white/[0.1] bg-white/[0.04] text-zinc-300 transition-colors hover:bg-white/[0.1] hover:text-white"
          >
            <UserRound className="h-[15px] w-[15px]" strokeWidth={2.1} />
          </button>
        )}
      </div>
    </aside>
  );
};

export default CanvasSideRail;
