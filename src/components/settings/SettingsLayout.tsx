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
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-2 px-3">
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
              "flex items-center gap-2.5 w-full px-3 py-1.5 rounded-md text-[13px] transition-colors group",
              active
                ? "bg-white/[0.07] text-zinc-50"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]",
            )}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left">{t(item.labelKey)}</span>
            {item.comingSoon && (
              <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-600 group-hover:text-zinc-500">
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
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap transition-colors flex-shrink-0",
                  active
                    ? "bg-white/[0.08] text-zinc-50"
                    : "text-zinc-400 hover:text-zinc-100",
                )}
              >
                <s.icon className="w-3.5 h-3.5" />
                {t(s.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-full">
        {/* Desktop left rail */}
        <aside className="hidden min-h-[calc(100vh-3rem)] w-56 shrink-0 border-r border-white/5 bg-[hsl(0_0%_4%)] px-3 py-6 md:block">
          <div className="space-y-6">
          {renderGroup(t("workspace.settings.account"), ACCOUNT_SECTIONS)}
          {renderGroup(t("workspace.settings.organization"), ORG_SECTIONS)}
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1 px-6 py-8 md:px-10 md:py-10">
          <div className="md:hidden text-xs text-zinc-500 mb-3">{currentLabel}</div>
          {children}
        </div>
      </div>
    </div>
  );
};

export default SettingsLayout;
