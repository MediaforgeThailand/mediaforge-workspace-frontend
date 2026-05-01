import { useNavigate } from "react-router-dom";
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
  Gauge,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCredits } from "@/hooks/useCredits";

const numberCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const numberFull = new Intl.NumberFormat("en-US");

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
  const avatarInset = size >= 48 ? 9 : 8;
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
        <AvatarFallback className="bg-emerald-600 text-[12px] font-semibold text-white">
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
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-[11.5px] font-medium leading-4 text-white">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-white/[0.85]">
          {formatCompact(used)} / {formatCompact(total)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.12]">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between gap-3 text-[10.5px] leading-3 text-white/[0.68]">
        <span>Spent {formatCompact(used)}</span>
        <span>Available {formatCompact(available)}</span>
      </div>
    </div>
  );
}

export function UserMenu() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { credits, loading: creditsLoading } = useCredits();
  const adminConsoleUrl =
    (import.meta.env.VITE_ADMIN_CONSOLE_URL as string | undefined) ||
    "https://mediaforge-admin-hub.vercel.app/org/console";
  const hasTeamContext = Boolean(credits?.is_shared_pool || profile?.organization_id);

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
  const displayBalance = credits?.is_shared_pool ? sharedBalance : personalBalance;
  const formattedCredits = creditsLoading && !credits ? t("workspace.usermenu.loading") : numberFull.format(displayBalance);
  const personalPercent = percentOf(personalUsed, personalTotal);
  const sharedPercent = percentOf(sharedUsed, sharedTotal);
  const creditScopeLabel =
    credits?.credit_scope === "team" && credits.team_name
      ? `${t("workspace.usermenu.shared_pool")} - ${credits.team_name}`
      : credits?.is_shared_pool
      ? `${t("workspace.usermenu.shared_pool")} - ${credits.organization_name ?? credits.pool_domain}`
      : t("workspace.usermenu.available_balance");
  const sharedUsageLabel =
    credits?.credit_scope === "team" && credits.team_name
      ? credits.team_name
      : credits?.organization_name || credits?.pool_domain || "Company pool";

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-11 w-11 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 lg:h-10 lg:w-10"
        aria-label={t("workspace.usermenu.account")}
      >
        <CreditAvatarRing
          src={profile?.avatar_url}
          initial={initial}
          personalPercent={personalPercent}
          sharedPercent={sharedPercent}
          showShared={Boolean(credits?.is_shared_pool)}
          size={42}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="max-h-[calc(100vh-72px)] w-[292px] overflow-y-auto rounded-lg border-white/[0.10] bg-[#121212] p-0 text-white shadow-2xl"
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="p-3 pb-2.5">
            <div className="flex items-center gap-2.5">
              <CreditAvatarRing
                src={profile?.avatar_url}
                initial={initial}
                personalPercent={personalPercent}
                sharedPercent={sharedPercent}
                showShared={Boolean(credits?.is_shared_pool)}
                size={48}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="truncate text-[12.5px] font-semibold leading-4 text-white">
                    {profile?.display_name || t("workspace.usermenu.member_fallback")}
                  </div>
                  {hasTeamContext && <Crown className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400" />}
                </div>
                <div className="mt-0.5 truncate text-[11px] leading-4 text-white/70">
                  {user?.email}
                </div>
              </div>
            </div>

            <div className="mt-2.5 space-y-1.5">
              <button
                type="button"
                onClick={() => navigate("/app/pricing")}
                className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[#5367f5] px-3 text-[12px] font-semibold leading-4 text-white transition-colors hover:bg-[#6274ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
              >
                <Sparkles className="h-3.5 w-3.5" />
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
                className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-white/[0.16] bg-transparent px-3 text-[12px] font-semibold leading-4 text-white transition-colors hover:bg-white/[0.06]"
              >
                {hasTeamContext ? <Building2 className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                {hasTeamContext ? "Admin Console" : "Create your team"}
              </button>
            </div>
          </div>
        </DropdownMenuLabel>

        <div className="border-t border-white/[0.08] px-3 py-3">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Gauge className="h-4 w-4 shrink-0 text-white" />
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold leading-4 text-white">Credit usage</div>
                <div className="truncate text-[10.5px] leading-3 text-white/[0.64]">{creditScopeLabel}</div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[14px] font-bold leading-4 tabular-nums text-white">{formattedCredits}</div>
              <div className="text-[10px] leading-3 text-white/[0.64]">available</div>
            </div>
          </div>

          <div className="space-y-2.5">
            <UsageRow
              label="Personal"
              used={personalUsed}
              total={personalTotal}
              available={personalBalance}
              colorClass="bg-sky-400"
            />
            {credits?.is_shared_pool && (
              <UsageRow
                label={sharedUsageLabel}
                used={sharedUsed}
                total={sharedTotal}
                available={sharedBalance}
                colorClass="bg-yellow-400"
              />
            )}
          </div>
        </div>

        <DropdownMenuSeparator className="bg-white/[0.08]" />

        <DropdownMenuItem
          disabled
          className="mx-2 my-0.5 h-8 gap-2.5 rounded-md px-3 text-[12px] font-medium leading-4 text-white/55 data-[disabled]:opacity-100"
        >
          <CreditCard className="h-3.5 w-3.5 text-white/55" />
          <span className="flex-1">{t("workspace.usermenu.plan_billing")}</span>
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-white/55">
            {t("workspace.settings.coming_soon_pill")}
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={() => navigate("/app/settings")}
          className="mx-2 my-0.5 h-8 cursor-pointer gap-2.5 rounded-md px-3 text-[12px] font-medium leading-4 text-white focus:bg-white/[0.06] focus:text-white"
        >
          <SettingsIcon className="h-3.5 w-3.5 text-white/[0.82]" />
          {t("workspace.usermenu.settings")}
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setLanguage(language === "th" ? "en" : "th");
          }}
          className="mx-2 my-0.5 h-8 cursor-pointer gap-2.5 rounded-md px-3 text-[12px] font-medium leading-4 text-white focus:bg-white/[0.06] focus:text-white"
        >
          <Languages className="h-3.5 w-3.5 text-white/[0.82]" />
          <span className="flex-1">Language</span>
          <span className="rounded-md border border-white/[0.10] bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-white">
            {language === "th" ? "English" : "Thai"}
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="mt-1 bg-white/[0.08]" />

        <DropdownMenuItem
          onSelect={handleSignOut}
          className="mx-2 my-1.5 h-8 cursor-pointer gap-2.5 rounded-md px-3 text-[12px] font-medium leading-4 text-red-200 focus:bg-red-500/10 focus:text-red-100"
        >
          <LogOut className="h-3.5 w-3.5" />
          {t("workspace.usermenu.sign_out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
