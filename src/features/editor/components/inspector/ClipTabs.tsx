import React from "react";

/**
 * Top-level inspector tabs.
 *
 * Renders the Video / Audio / Speed row at the top of the inspector when a
 * clip is selected. Each tab's content lives in its own component
 * (VideoBasicTab, AudioBasicTab, SpeedTab). The earlier Animation / Tracking
 * / Adjustment tabs were removed because they had no engine backing — see the
 * mockup removal commit for the audit trail.
 */
export type MainTabId =
  | "video"
  | "audio"
  | "speed";

export interface MainTab {
  id: MainTabId;
  label: string;
  // When false, render tab as disabled. Lets us greenlight tabs only when
  // they apply to the current selection (audio clip → hide Video tab, etc.).
  enabled: boolean;
}

export interface SubTab {
  id: string;
  label: string;
  badge?: string; // small number badge like "(2 uses)" on Curve sub-tab
}

interface ClipTabsProps {
  mainTabs: MainTab[];
  activeMainTab: MainTabId;
  onMainTabChange: (id: MainTabId) => void;
  subTabs?: SubTab[];
  activeSubTab?: string;
  onSubTabChange?: (id: string) => void;
}

export const ClipTabs: React.FC<ClipTabsProps> = ({
  mainTabs,
  activeMainTab,
  onMainTabChange,
  subTabs,
  activeSubTab,
  onSubTabChange,
}) => {
  return (
    <div className="mb-3">
      <div
        data-testid="inspector-main-tabs"
        className="flex border-b border-border overflow-x-auto no-scrollbar"
      >
        {mainTabs.map((tab) => {
          const isActive = activeMainTab === tab.id;
          return (
            <button
              key={tab.id}
              data-testid={`inspector-tab-${tab.id}`}
              onClick={() => tab.enabled && onMainTabChange(tab.id)}
              disabled={!tab.enabled}
              className={`relative px-3 py-2 text-[11px] font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "text-text-primary"
                  : tab.enabled
                    ? "text-text-secondary hover:text-text-primary"
                    : "text-text-muted opacity-40 cursor-not-allowed"
              }`}
            >
              {tab.label}
              {isActive && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>

      {subTabs && subTabs.length > 0 && (
        <div
          data-testid="inspector-sub-tabs"
          className="flex gap-1 px-1 pt-2 overflow-x-auto no-scrollbar"
        >
          {subTabs.map((sub) => {
            const isActive = activeSubTab === sub.id;
            return (
              <button
                key={sub.id}
                data-testid={`inspector-subtab-${sub.id}`}
                onClick={() => onSubTabChange?.(sub.id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
                }`}
              >
                {sub.label}
                {sub.badge && (
                  <span className="text-[9px] opacity-60">({sub.badge})</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ClipTabs;
