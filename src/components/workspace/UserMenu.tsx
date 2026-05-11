import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Settings as SettingsIcon,
  Check,
  ChevronDown,
  Languages,
  LogOut,
  CreditCard,
  Sparkles,
  Building2,
  Crown,
  GraduationCap,
  Search,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { getLanguageNativeLabel, SUPPORTED_LANGUAGES, useLanguage, type Language } from "@/contexts/LanguageContext";
import { useCredits } from "@/hooks/useCredits";
import { useEducationStudentLock, useIsClassTeacher, useIsOrgAdmin } from "@/hooks/useIsOrgUser";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const numberCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const LANGUAGE_SEARCH_ALIASES: Record<Language, string> = {
  en: "english en",
  th: "thai thailand ภาษาไทย th",
  es: "spanish espanol español es",
  ja: "japanese 日本語 ja",
  hi: "hindi हिन्दी hi india",
};

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
  const { t } = useLanguage();
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
        <span>{t("workspace.userMenu.spent")} {formatCompact(used)}</span>
        <span>{t("common.available2")} {formatCompact(available)}</span>
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
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");
  const { credits } = useCredits();
  const isOrgAdmin = useIsOrgAdmin();
  const isClassTeacher = useIsClassTeacher();
  const educationStudentLock = useEducationStudentLock();
  const filteredLanguageOptions = useMemo(() => {
    const query = languageQuery.trim().toLowerCase();
    if (!query) return [...SUPPORTED_LANGUAGES];

    return SUPPORTED_LANGUAGES.filter((option) => {
      const nativeLabel = getLanguageNativeLabel(option).toLowerCase();
      return (
        option.includes(query) ||
        nativeLabel.includes(query) ||
        LANGUAGE_SEARCH_ALIASES[option].toLowerCase().includes(query)
      );
    });
  }, [languageQuery]);

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
  const showSharedUsage = Boolean(credits?.is_shared_pool);
  const sharedUsageLabel =
    credits?.credit_scope === "education_space"
      ? credits.team_name || t("workspace.userMenu.classSpace")
      : credits?.team_name
        ? credits.team_name
        : isEducationOrg
          ? credits?.organization_name || t("workspace.userMenu.sharedCredits")
          : t("common.companyPool");
  const triggerSize = compact ? 43 : 40;
  const ringSize = compact ? 43 : 42;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <DropdownMenu
      open={profileMenuOpen}
      onOpenChange={(open) => {
        setProfileMenuOpen(open);
        if (!open) {
          setLanguageMenuOpen(false);
          setLanguageQuery("");
        }
      }}
    >
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
          showShared={showSharedUsage}
          size={ringSize}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="max-h-[calc(100vh-48px)] w-[288px] overflow-y-auto rounded-[14px] border-white/[0.10] bg-[#121212] p-0 text-white shadow-2xl"
        onInteractOutside={(event) => {
          const target = event.target;
          if (target instanceof HTMLElement && target.closest("[data-language-popover]")) {
            event.preventDefault();
          }
        }}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="p-[12px] pb-[10px]">
            <div className="flex items-center gap-[10px]">
              <CreditAvatarRing
                src={profile?.avatar_url}
                initial={initial}
                personalPercent={personalPercent}
                sharedPercent={sharedPercent}
                showShared={showSharedUsage}
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
                    {t("workspace.userMenu.universityAdmin")}
                  </button>
                </div>
              )
            ) : (
              <div className="mt-[10px] space-y-[6px]">
                <button
                  type="button"
                  onClick={() => navigate("/app/pricing")}
                  className="ci-gloss-button flex h-[30px] w-full items-center justify-center gap-[7px] rounded-full px-[10px] text-[12px] font-semibold leading-none transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/80"
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
                  {hasTeamContext ? t("common.adminConsole") : t("common.createYourTeam")}
                </button>
              </div>
            )}
          </div>
        </DropdownMenuLabel>

        <div className="space-y-[10px] bg-white/[0.02] px-[12px] py-[10px]">
          {showSharedUsage && (
            <UsageRow
              label={sharedUsageLabel}
              used={sharedUsed}
              total={sharedTotal}
              available={sharedBalance}
              colorClass="bg-yellow-400"
            />
          )}
          <UsageRow
            label={t("workspace.userMenu.personal")}
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

        <div className="mx-[7px] my-[3px] rounded-[8px] px-[10px] py-[7px]">
          <div className="flex items-center gap-[10px]">
            <Languages className="h-[14px] w-[14px] shrink-0 text-white/[0.82]" />
            <span className="flex-1 text-[12px] font-medium leading-none text-white">
              {t("workspace.userMenu.language")}
            </span>
            <Popover
              open={languageMenuOpen}
              onOpenChange={(open) => {
                setLanguageMenuOpen(open);
                if (!open) setLanguageQuery("");
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                  className="flex h-[30px] min-w-[116px] items-center justify-between gap-2 rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-[9px] text-[12px] font-semibold leading-none text-white transition hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200/70"
                  aria-expanded={languageMenuOpen}
                  aria-haspopup="listbox"
                >
                  <span className="truncate">{getLanguageNativeLabel(language)}</span>
                  <ChevronDown
                    className={cn(
                      "h-[13px] w-[13px] shrink-0 text-white/70 transition-transform",
                      languageMenuOpen && "rotate-180",
                    )}
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent
                data-language-popover
                align="end"
                side="bottom"
                sideOffset={8}
                collisionPadding={12}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                className="z-[70] w-[256px] rounded-[10px] border border-white/[0.10] bg-[#1b1b1b] p-2 text-white shadow-2xl"
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-white/55" />
                  <input
                    value={languageQuery}
                    onChange={(event) => setLanguageQuery(event.target.value)}
                    onKeyDown={(event) => event.stopPropagation()}
                    placeholder={t("workspace.userMenu.languageSearch")}
                    className="h-[34px] w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] pl-8 pr-2.5 text-[12px] text-white outline-none placeholder:text-white/45 focus:border-yellow-200/60"
                  />
                </div>
                <div className="mt-2 max-h-[156px] overflow-y-auto overscroll-contain pr-1" role="listbox">
                  {filteredLanguageOptions.length === 0 ? (
                    <div className="px-2 py-2 text-[12px] text-white/55">
                      {t("workspace.userMenu.languageNoResults")}
                    </div>
                  ) : (
                    filteredLanguageOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="option"
                        aria-selected={option === language}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setLanguage(option);
                          setLanguageMenuOpen(false);
                          setLanguageQuery("");
                        }}
                        className={cn(
                          "flex h-[34px] w-full items-center justify-between rounded-[8px] px-2 text-left text-[12px] font-medium text-white/85 transition hover:bg-white/[0.06]",
                          option === language && "text-[#f4ff00]",
                        )}
                      >
                        <span>{getLanguageNativeLabel(option)}</span>
                        {option === language && <Check className="h-[14px] w-[14px] text-[#f4ff00]" />}
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

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
