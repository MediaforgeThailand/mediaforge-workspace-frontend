import { type ReactNode } from "react";
import {
  User,
  Download,
  Bookmark,
  UserPlus,
  Users,
  KeyRound,
  Settings as SettingsIcon,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Settings shell with a left-rail of grouped sections.
 *
 * The current `/app/settings` route is in-page state-driven (the
 * existing Settings.tsx already does this), so this layout takes a
 * `sections + activeKey + onChange` triple and renders the rail. The
 * page-level component owns the active state.
 *
 * Section keys are namespaced strings like "account.profile" — the
 * namespace doubles as the rail group header, which keeps the
 * "ACCOUNT" / "ORGANIZATION" capitalised dividers in lockstep with
 * the items underneath.
 */

export type SettingsSectionKey =
  | "account.profile"
  | "account.stock-downloads"
  | "account.stock-collections"
  | "account.following"
  | "organization.my-team"
  | "organization.people"
  | "organization.security-sso"
  | "organization.preferences"
  | "organization.plan-billing";

/** Translation keys for the rail labels. We carry the key (not the
 *  string) through the section list so a Thai-mode switch re-renders
 *  the rail without us threading t() into the static array. */
export type SettingsSectionLabelKey =
  | "workspace.settings.profile"
  | "workspace.settings.stock_downloads"
  | "workspace.settings.stock_collections"
  | "workspace.settings.following"
  | "workspace.settings.my_team"
  | "workspace.settings.people"
  | "workspace.settings.security_sso"
  | "workspace.settings.preferences"
  | "workspace.settings.plan_billing";

export interface SettingsSection {
  key: SettingsSectionKey;
  /** Translation key for the visible label. */
  labelKey: SettingsSectionLabelKey;
  icon: LucideIcon;
  /** When true, the rail item shows a "Soon" pill. */
  comingSoon?: boolean;
}

export const ACCOUNT_SECTIONS: SettingsSection[] = [
  { key: "account.profile", labelKey: "workspace.settings.profile", icon: User },
  { key: "account.stock-downloads", labelKey: "workspace.settings.stock_downloads", icon: Download, comingSoon: true },
  { key: "account.stock-collections", labelKey: "workspace.settings.stock_collections", icon: Bookmark, comingSoon: true },
  { key: "account.following", labelKey: "workspace.settings.following", icon: UserPlus, comingSoon: true },
];

export const ORG_SECTIONS: SettingsSection[] = [
  { key: "organization.my-team", labelKey: "workspace.settings.my_team", icon: Users },
  { key: "organization.people", labelKey: "workspace.settings.people", icon: Users, comingSoon: true },
  { key: "organization.security-sso", labelKey: "workspace.settings.security_sso", icon: KeyRound, comingSoon: true },
  { key: "organization.preferences", labelKey: "workspace.settings.preferences", icon: SettingsIcon },
  { key: "organization.plan-billing", labelKey: "workspace.settings.plan_billing", icon: CreditCard },
];

interface SettingsLayoutProps {
  activeKey: SettingsSectionKey;
  onChange: (key: SettingsSectionKey) => void;
  children: ReactNode;
}

const SettingsLayout = ({ activeKey, onChange, children }: SettingsLayoutProps) => {
  const { t } = useLanguage();

  const renderGroup = (heading: string, items: SettingsSection[]) => (
    <div className="space-y-1.5">
      <p className="mb-2.5 px-3 text-[13px] font-semibold uppercase leading-5 text-zinc-300">
        {heading}
      </p>
      {items.map((item) => {
        const active = activeKey === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              "group flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-[15.5px] font-medium leading-5 transition-colors",
              active
                ? "bg-white/[0.07] text-zinc-50"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]",
            )}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            <span className="flex-1 text-left">{t(item.labelKey)}</span>
            {item.comingSoon && (
              <span className="text-[12px] font-semibold uppercase leading-4 text-zinc-500 group-hover:text-zinc-400">
                {t("workspace.settings.coming_soon_pill")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  // Find current item label for mobile breadcrumb header
  const allSections = [...ACCOUNT_SECTIONS, ...ORG_SECTIONS];
  const currentSection = allSections.find((s) => s.key === activeKey);
  const currentLabel = currentSection
    ? t(currentSection.labelKey)
    : t("workspace.settings.fallback_title");

  return (
    <div className="min-h-full">
      {/* Mobile horizontal scroller — the rail collapses to a tab bar
          on narrow screens. */}
      <div className="md:hidden border-b border-white/5 bg-[hsl(0_0%_5%)] sticky top-0 z-10">
        <div className="flex gap-1 overflow-x-auto px-4 py-2 scrollbar-none">
          {allSections.map((s) => {
            const active = activeKey === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onChange(s.key)}
                className={cn(
                  "flex min-h-9 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[14px] transition-colors",
                  active
                    ? "bg-white/[0.08] text-zinc-50"
                    : "text-zinc-400 hover:text-zinc-100",
                )}
              >
                <s.icon className="h-4 w-4" />
                {t(s.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-full">
        {/* Desktop left rail */}
        <aside className="hidden min-h-[calc(100vh-3rem)] w-[320px] shrink-0 border-r border-white/5 bg-[hsl(0_0%_4%)] px-4 py-7 md:block">
          <div className="space-y-7">
          {renderGroup(t("workspace.settings.account"), ACCOUNT_SECTIONS)}
          {renderGroup(t("workspace.settings.organization"), ORG_SECTIONS)}
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1 px-6 py-8 md:px-12 md:py-12">
          <div className="mb-3 text-[14px] leading-5 text-zinc-400 md:hidden">{currentLabel}</div>
          {children}
        </div>
      </div>
    </div>
  );
};

export default SettingsLayout;
