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
    <div className="space-y-[4px]">
      <p className="mb-[6px] px-[8px] text-[12.75px] font-semibold uppercase leading-[16px] text-zinc-300">
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
              "group flex h-[32px] w-full items-center gap-[8px] rounded-md px-[8px] text-[14px] font-medium leading-[18px] transition-colors",
              active
                ? "bg-white/[0.07] text-zinc-50"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]",
            )}
          >
            <item.icon className="h-[15px] w-[15px] flex-shrink-0" />
            <span className="flex-1 text-left">{t(item.labelKey)}</span>
            {item.comingSoon && (
              <span className="text-[11.75px] font-semibold uppercase leading-[14px] text-zinc-500 group-hover:text-zinc-400">
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
          on narrow screens. 2026-05: bg lifts to Layer 1, no hairline. */}
      <div className="md:hidden bg-[hsl(var(--surface-1))] sticky top-0 z-10">
        <div className="flex gap-1 overflow-x-auto px-4 py-2 scrollbar-none">
          {allSections.map((s) => {
            const active = activeKey === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onChange(s.key)}
                className={cn(
                  "flex min-h-[36px] flex-shrink-0 items-center gap-[6px] whitespace-nowrap rounded-md px-[12px] py-[6px] text-[14px] transition-colors",
                  active
                    ? "bg-white/[0.08] text-zinc-50"
                    : "text-zinc-400 hover:text-zinc-100",
                )}
              >
                <s.icon className="h-[16px] w-[16px]" />
                {t(s.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-full">
        {/* Desktop left rail. 2026-05: rail = Layer 1 panel, no hairline.
         *  Width tightened 206→200 to align with the workspace sidebar. */}
        <aside className="hidden min-h-[calc(100vh-48px)] w-[200px] shrink-0 bg-[hsl(var(--surface-1))] px-[12px] py-[20px] md:block">
          <div className="space-y-[20px]">
          {renderGroup(t("workspace.settings.account"), ACCOUNT_SECTIONS)}
          {renderGroup(t("workspace.settings.organization"), ORG_SECTIONS)}
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1 px-[24px] py-[32px] md:px-[32px] md:py-[32px]">
          <div className="mb-3 text-[14px] leading-5 text-zinc-400 md:hidden">{currentLabel}</div>
          {children}
        </div>
      </div>
    </div>
  );
};

export default SettingsLayout;
