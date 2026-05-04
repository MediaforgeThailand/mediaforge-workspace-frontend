import { useLocation, useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Settings as SettingsIcon,
  Languages,
  LogOut,
  CreditCard,
  Sparkles,
  Building2,
  Crown,
  GraduationCap,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCredits } from "@/hooks/useCredits";
import { useEducationStudentLock, useIsClassTeacher, useIsOrgAdmin } from "@/hooks/useIsOrgUser";
import { supabase } from "@/integrations/supabase/client";

const numberCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function percentOf(used: number, total: number) {
  return total > 0 ? clampPercent((used / total) * 100) : 0;
}

function formatCompact(value: number | null | undefined) {
  return numberCompact.format(Math.max(0, Number(value ?? 0)));
}

function CreditAvatarRing({
  src,
  initial,
  personalPercent,
  sharedPercent,
  showShared,
  size = 40,
}: {
  src?: string | null;
  initial: string;
  personalPercent: number;
  sharedPercent: number;
  showShared: boolean;
  size?: number;
}) {
  const center = size / 2;
  const outerRadius = center - 3;
  const innerRadius = center - 7;
  const avatarInset = size <= 34 ? 6 : size >= 48 ? 9 : 8;
  const ring = (radius: number, percent: number) => {
    const circumference = 2 * Math.PI * radius;
    return {
      strokeDasharray: `${(circumference * clampPercent(percent)) / 100} ${circumference}`,
      strokeDashoffset: 0,
    };
  };

  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg className="absolute inset-0 -rotate-90" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {showShared && (
          <>
            <circle cx={center} cy={center} r={outerRadius} fill="none" stroke="rgba(250, 204, 21, 0.18)" strokeWidth="2.6" />
            <circle
              cx={center}
              cy={center}
              r={outerRadius}
              fill="none"
              stroke="#facc15"
              strokeLinecap="round"
              strokeWidth="2.6"
              style={ring(outerRadius, sharedPercent)}
            />
          </>
        )}
        <circle cx={center} cy={center} r={innerRadius} fill="none" stroke="rgba(56, 189, 248, 0.18)" strokeWidth="2.4" />
        <circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill="none"
          stroke="#38bdf8"
          strokeLinecap="round"
          strokeWidth="2.4"
          style={ring(innerRadius, personalPercent)}
        />
      </svg>
      <Avatar
        className="absolute rounded-full"
        style={{
          inset: avatarInset,
          width: size - avatarInset * 2,
          height: size - avatarInset * 2,
        }}
      >
        <AvatarImage src={src ?? undefined} alt="" />
        <AvatarFallback
          className="bg-emerald-600 font-semibold text-white"
          style={{ fontSize: size <= 34 ? 11.5 : 13.5 }}
        >
          {initial}
        </AvatarFallback>
      </Avatar>
    </span>
  );
}

function UsageRow({
  label,
  used,
  total,
  available,
  colorClass,
}: {
  label: string;
  used: number;
  total: number;
  available: number;
  colorClass: string;
}) {
  const pct = percentOf(used, total);
  return (
    <div className="space-y-[5px]">
      <div className="flex items-center justify-between gap-3 text-[12px] font-semibold leading-[15px] text-white">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-white/[0.78]">
          {formatCompact(used)} / {formatCompact(total)}
        </span>
      </div>
      <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.12]">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between gap-3 text-[10.5px] leading-[13px] text-white/[0.66]">
        <span>Spent {formatCompact(used)}</span>
        <span>Available {formatCompact(available)}</span>
      </div>
    </div>
  );
}

export function UserMenu({ compact = false }: { compact?: boolean } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, signOut, loading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { t, language, setLanguage } = useLanguage();
  const { credits } = useCredits();
  const isOrgAdmin = useIsOrgAdmin();
  const isClassTeacher = useIsClassTeacher();
  const educationStudentLock = useEducationStudentLock();

  // While auth is still resolving, render an invisible placeholder so
  // we don't show the guest Sign-in pill and then snap to the avatar
  // (or vice-versa). The placeholder reserves the trigger's pixel
  // footprint so the header doesn't reflow either way.
  if (authLoading) {
    return <div className="h-[32px] w-[32px]" aria-hidden />;
  }

  // Guest fallback — when no user is signed in (the dashboard / home
  // is public per Workspace V2), render a compact "Sign in" pill in
  // place of the credit-ring avatar. Clicking it opens the shared auth
  // modal with the current path remembered so the user lands back here
  // after authenticating.
  if (!user) {
    // Pin to absolute pixel values rather than `h-8` / `text-sm` —
    // the workspace shell scales the document root font-size to
    // ~23px for the global "+10% UI" theme, which would inflate any
    // rem-based size to ~47px tall. Avoid `text-[13px]` /
    // `text-[12.5px]` etc — those are caught by the `.mf-readable`
    // Thai-readability bump in index.css and forced up to 17.25px,
    // which breaks the proportions of a small pill button.
    const handleSignInClick = async () => {
      // Some users see Auth.tsx auto-redirect them BACK to the
      // dashboard the instant they land on /auth. That happens when
      // a stale Supabase session is sitting in localStorage but
      // hasn't propagated into AuthContext at the moment UserMenu
      // first rendered (so we showed the guest pill), then becomes
      // visible by the time /auth's `if (user) navigate(home)`
      // effect fires. Defensive `signOut()` clears any such ghost
      // before we navigate — guests are unaffected (signOut is a
      // no-op without a session).
      try {
        await supabase.auth.signOut();
      } catch {
        // best effort — proceed to /auth either way
      }
      openAuthModal({
        redirectPath: `${location.pathname}${location.search}`,
      });
    };
    return (
      <button
        type="button"
        onClick={handleSignInClick}
        className="inline-flex h-[32px] items-center rounded-full bg-white px-[14px] text-[14px] font-semibold leading-none text-zinc-950 transition hover:bg-zinc-200"
      >
        {t("authSignInButton")}
      </button>
    );
  }
  const adminConsoleUrl =
    (import.meta.env.VITE_ADMIN_CONSOLE_URL as string | undefined) ||
    "https://mediaforge-admin-hub.vercel.app/org/console";
  const hasTeamContext = Boolean(credits?.is_shared_pool || credits?.organization_id);
  const isEducationOrg =
    credits?.credit_scope === "education_space" ||
    credits?.organization_type === "school" ||
    credits?.organization_type === "university" ||
    educationStudentLock.locked ||
    educationStudentLock.loading;
  const canManageEducation = isEducationOrg && (isOrgAdmin || isClassTeacher);

  const initial =
    (profile?.display_name?.[0] ?? user?.email?.[0] ?? "U").toUpperCase();
  const personalBalance = Number(credits?.personal_balance ?? credits?.balance ?? 0);
  const personalUsed = Number(credits?.personal_total_used ?? credits?.total_used ?? 0);
  const personalTotal = Math.max(
    Number(credits?.personal_total_purchased ?? credits?.total_purchased ?? 0),
    personalBalance + personalUsed,
  );
  const sharedBalance = Number(credits?.shared_balance ?? (credits?.is_shared_pool ? credits.balance : 0) ?? 0);
  const sharedUsed = Number(credits?.shared_used ?? (credits?.is_shared_pool ? credits.total_used : 0) ?? 0);
  const sharedTotal = Math.max(
    Number(credits?.shared_total ?? (credits?.is_shared_pool ? credits.total_purchased : 0) ?? 0),
    sharedBalance + sharedUsed,
  );
  const personalPercent = percentOf(personalUsed, personalTotal);
  const sharedPercent = percentOf(sharedUsed, sharedTotal);
  const triggerSize = compact ? 43 : 40;
  const ringSize = compact ? 43 : 42;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
        style={{ width: triggerSize, height: triggerSize }}
        aria-label={t("workspace.usermenu.account")}
      >
        <CreditAvatarRing
          src={profile?.avatar_url}
          initial={initial}
          personalPercent={personalPercent}
          sharedPercent={sharedPercent}
          showShared={Boolean(credits?.is_shared_pool)}
          size={ringSize}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="max-h-[calc(100vh-48px)] w-[288px] overflow-y-auto rounded-[14px] border-white/[0.10] bg-[#121212] p-0 text-white shadow-2xl"
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="p-[12px] pb-[10px]">
            <div className="flex items-center gap-[10px]">
              <CreditAvatarRing
                src={profile?.avatar_url}
                initial={initial}
                personalPercent={personalPercent}
                sharedPercent={sharedPercent}
                showShared={Boolean(credits?.is_shared_pool)}
                size={38}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-[6px]">
                  <div className="truncate text-[12.5px] font-semibold leading-[16px] text-white">
                    {profile?.display_name || t("workspace.usermenu.member_fallback")}
                  </div>
                  {hasTeamContext && (
                    isEducationOrg
                      ? <GraduationCap className="h-[13px] w-[13px] shrink-0 text-emerald-300" />
                      : <Crown className="h-[13px] w-[13px] shrink-0 fill-yellow-400 text-yellow-400" />
                  )}
                </div>
                <div className="truncate text-[11px] leading-[15px] text-white/65">
                  {user?.email}
                </div>
              </div>
            </div>

            {isEducationOrg ? (
              canManageEducation && (
                <div className="mt-2.5 space-y-1.5">
                  <button
                    type="button"
                    onClick={() => navigate("/app/org-admin")}
                    className="flex h-[30px] w-full items-center justify-center gap-[7px] rounded-[8px] bg-emerald-500 px-[10px] text-[12px] font-semibold leading-none text-white transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70"
                  >
                    <GraduationCap className="h-[13px] w-[13px]" />
                    University admin
                  </button>
                </div>
              )
            ) : (
              <div className="mt-[10px] space-y-[6px]">
                <button
                  type="button"
                  onClick={() => navigate("/app/pricing")}
                  className="flex h-[30px] w-full items-center justify-center gap-[7px] rounded-[8px] bg-[#5367f5] px-[10px] text-[12px] font-semibold leading-none text-white transition-colors hover:bg-[#6274ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                >
                  <Sparkles className="h-[13px] w-[13px]" />
                  {t("workspace.usermenu.upgrade")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (hasTeamContext) {
                      window.location.href = adminConsoleUrl;
                    } else {
                      navigate("/app/team-register");
                    }
                  }}
                  className="flex h-[28px] w-full items-center justify-center gap-[7px] rounded-[8px] bg-white/[0.055] px-[10px] text-[12px] font-semibold leading-none text-white transition-colors hover:bg-white/[0.10]"
                >
                  {hasTeamContext ? <Building2 className="h-[13px] w-[13px]" /> : <UserPlus className="h-[13px] w-[13px]" />}
                  {hasTeamContext ? "Admin Console" : "Create your team"}
                </button>
              </div>
            )}
          </div>
        </DropdownMenuLabel>

        <div className="bg-white/[0.02] px-[12px] py-[10px]">
          <UsageRow
            label="Personal"
            used={personalUsed}
            total={personalTotal}
            available={personalBalance}
            colorClass="bg-sky-400"
          />
        </div>

        <DropdownMenuSeparator className="bg-white/[0.08]" />

        {!hasTeamContext && !isEducationOrg && (
          <DropdownMenuItem
            onSelect={() => navigate("/app/settings?tab=plan-billing")}
            className="mx-[7px] my-[3px] h-[30px] cursor-pointer gap-[10px] rounded-[8px] px-[10px] text-[12px] font-medium leading-none text-white focus:bg-white/[0.06] focus:text-white"
          >
            <CreditCard className="h-[14px] w-[14px] text-white/[0.82]" />
            {t("workspace.usermenu.plan_billing")}
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          onSelect={() => navigate("/app/settings")}
          className="mx-[7px] my-[3px] h-[30px] cursor-pointer gap-[10px] rounded-[8px] px-[10px] text-[12px] font-medium leading-none text-white focus:bg-white/[0.06] focus:text-white"
        >
          <SettingsIcon className="h-[14px] w-[14px] text-white/[0.82]" />
          {t("workspace.usermenu.settings")}
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setLanguage(language === "th" ? "en" : "th");
          }}
          className="mx-[7px] my-[3px] h-[30px] cursor-pointer gap-[10px] rounded-[8px] px-[10px] text-[12px] font-medium leading-none text-white focus:bg-white/[0.06] focus:text-white"
        >
          <Languages className="h-[14px] w-[14px] text-white/[0.82]" />
          <span className="flex-1">Language</span>
          <span className="rounded-[7px] bg-white/[0.08] px-[7px] py-[3px] text-[11px] leading-none text-white">
            {language === "th" ? "English" : "Thai"}
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="mt-1 bg-white/[0.08]" />

        <DropdownMenuItem
          onSelect={handleSignOut}
          className="mx-[7px] my-[5px] h-[30px] cursor-pointer gap-[10px] rounded-[8px] px-[10px] text-[12px] font-medium leading-none text-red-200 focus:bg-red-500/10 focus:text-red-100"
        >
          <LogOut className="h-[14px] w-[14px]" />
          {t("workspace.usermenu.sign_out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
