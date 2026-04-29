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

export interface SettingsSection {
  key: SettingsSectionKey;
  label: string;
  icon: LucideIcon;
  /** When true, the rail item shows a "Soon" pill. */
  comingSoon?: boolean;
}

export const ACCOUNT_SECTIONS: SettingsSection[] = [
  { key: "account.profile", label: "Profile", icon: User },
  { key: "account.stock-downloads", label: "Stock downloads", icon: Download, comingSoon: true },
  { key: "account.stock-collections", label: "Stock collections", icon: Bookmark, comingSoon: true },
  { key: "account.following", label: "Following", icon: UserPlus, comingSoon: true },
];

export const ORG_SECTIONS: SettingsSection[] = [
  { key: "organization.my-team", label: "My Team", icon: Users, comingSoon: true },
  { key: "organization.people", label: "People", icon: Users, comingSoon: true },
  { key: "organization.security-sso", label: "Security SSO", icon: KeyRound, comingSoon: true },
  { key: "organization.preferences", label: "Preferences", icon: SettingsIcon },
  { key: "organization.plan-billing", label: "Plan & billing", icon: CreditCard },
];

interface SettingsLayoutProps {
  activeKey: SettingsSectionKey;
  onChange: (key: SettingsSectionKey) => void;
  children: ReactNode;
}

const SettingsLayout = ({ activeKey, onChange, children }: SettingsLayoutProps) => {
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
            <span className="flex-1 text-left">{item.label}</span>
            {item.comingSoon && (
              <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-600 group-hover:text-zinc-500">
                Soon
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  // Find current item label for mobile breadcrumb header
  const allSections = [...ACCOUNT_SECTIONS, ...ORG_SECTIONS];
  const currentLabel = allSections.find((s) => s.key === activeKey)?.label ?? "Settings";

  return (
    <div className="-mx-6 -my-8">
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
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex">
        {/* Desktop left rail */}
        <aside className="hidden md:block w-56 shrink-0 border-r border-white/5 bg-[hsl(0_0%_4%)] min-h-[calc(100vh-3rem)] py-6 px-3 space-y-6">
          {renderGroup("Account", ACCOUNT_SECTIONS)}
          {renderGroup("Organization", ORG_SECTIONS)}
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0 px-6 py-8 md:px-10 md:py-10">
          <div className="md:hidden text-xs text-zinc-500 mb-3">{currentLabel}</div>
          {children}
        </div>
      </div>
    </div>
  );
};

export default SettingsLayout;
