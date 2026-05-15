import { type ReactNode } from "react";
import {
  User,
  Download,
  Bookmark,
  UserPlus,
  Users,
  KeyRound,
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
  | "workspace.settings.plan_billing";

export interface SettingsSection {
  key: SettingsSectionKey;
  /** Translation key for the visible label. */
  labelKey: SettingsSectionLabelKey;
  icon: LucideIcon;
}

export const ACCOUNT_SECTIONS: SettingsSection[] = [
  { key: "account.profile", labelKey: "workspace.settings.profile", icon: User },
  { key: "account.stock-downloads", labelKey: "workspace.settings.stock_downloads", icon: Download },
  { key: "account.stock-collections", labelKey: "workspace.settings.stock_collections", icon: Bookmark },
  { key: "account.following", labelKey: "workspace.settings.following", icon: UserPlus },
];

export const ORG_SECTIONS: SettingsSection[] = [
  { key: "organization.my-team", labelKey: "workspace.settings.my_team", icon: Users },
  { key: "organization.people", labelKey: "workspace.settings.people", icon: Users },
  { key: "organization.security-sso", labelKey: "workspace.settings.security_sso", icon: KeyRound },
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
      <p className="mb-[6px] px-[8px] text-[10.5px] font-medium uppercase tracking-[0.03em] leading-[14px] text-zinc-500">
        {heading}
      </p>
      {items.map((item) => {
        const active = activeKey === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            title={t(item.labelKey)}
            className={cn(
              "group flex h-[32px] w-full items-center gap-[8px] rounded-md px-[10px] text-[12.5px] font-semibold leading-none transition-colors",
              active
                ? "bg-white/[0.18] text-zinc-50"
                : "text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-50",
            )}
          >
            <item.icon className="h-[13px] w-[13px] flex-shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{t(item.labelKey)}</span>
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
    <div className="min-h-full bg-[#1a1a1a]">
      {/* Mobile horizontal scroller — the rail collapses to a tab bar
          on narrow screens. 2026-05: bg lifts to Layer 1, no hairline. */}
      <div className="sticky top-0 z-10 bg-[#151515] md:hidden">
        <div className="flex gap-1 overflow-x-auto px-4 py-2 scrollbar-none">
          {allSections.map((s) => {
            const active = activeKey === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onChange(s.key)}
                className={cn(
                  "flex h-[32px] flex-shrink-0 items-center gap-[6px] whitespace-nowrap rounded-md px-[10px] text-[12.5px] transition-colors",
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
        <aside className="hidden min-h-[calc(100vh-48px)] w-[200px] shrink-0 bg-[#151515] px-[14px] py-[22px] md:block">
          <div className="space-y-[18px]">
          {renderGroup(t("workspace.settings.account"), ACCOUNT_SECTIONS)}
          {renderGroup(t("workspace.settings.organization"), ORG_SECTIONS)}
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1 px-[24px] py-[28px] md:px-[28px] md:py-[28px]">
          <div className="mb-3 text-[14px] leading-5 text-zinc-400 md:hidden">{currentLabel}</div>
          {children}
        </div>
      </div>
    </div>
  );
};

export default SettingsLayout;
