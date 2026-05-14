import React, { useCallback, useEffect, useRef } from "react";
import { Settings, Key, Gpu } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/openreel-ui";
import { useSettingsStore, type SettingsTab } from "../../stores/settings-store";
import { GeneralPanel } from "./GeneralPanel";
import { ApiKeysPanel } from "./ApiKeysPanel";
import { RenderingPanel } from "./RenderingPanel";

const TABS: readonly { id: SettingsTab; label: string; icon: typeof Settings }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "rendering", label: "Rendering & Performance", icon: Gpu },
  { id: "api-keys", label: "API Keys", icon: Key },
];

export const SettingsDialog: React.FC = () => {
  const { settingsOpen, settingsTab, closeSettings, openSettings } = useSettingsStore();
  // V4: capture the previously focused element so we can restore focus when
  // the dialog closes. Radix only auto-restores focus to a DialogTrigger,
  // but Settings is opened via Cmd+, with no trigger element. Without this,
  // focus collapses to <body> on Esc, breaking keyboard navigation.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (settingsOpen) {
      previouslyFocusedRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
  }, [settingsOpen]);

  const setTab = useCallback((tab: SettingsTab) => {
    openSettings(tab);
  }, [openSettings]);

  return (
    <Dialog open={settingsOpen} onOpenChange={(open) => !open && closeSettings()}>
      <DialogContent
        className="sm:max-w-2xl max-h-[85vh] bg-background flex flex-col overflow-y-auto"
        onCloseAutoFocus={(e) => {
          // Restore focus to whatever was focused before the dialog opened.
          // We must call preventDefault() to override Radix's default
          // "focus the trigger" behavior (no trigger exists here).
          if (previouslyFocusedRef.current && document.contains(previouslyFocusedRef.current)) {
            e.preventDefault();
            previouslyFocusedRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings size={18} className="text-primary" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure preferences and manage API keys for external services.
          </DialogDescription>
        </DialogHeader>

        <div role="tablist" aria-label="Settings" className="flex gap-1 p-1 bg-muted rounded-md">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={settingsTab === tab.id}
              aria-controls={`settings-tabpanel-${tab.id}`}
              id={`settings-tab-${tab.id}`}
              onClick={() => setTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-sm transition-colors ${
                settingsTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`settings-tabpanel-${settingsTab}`}
          aria-labelledby={`settings-tab-${settingsTab}`}
          className="flex-1 overflow-y-auto pr-1 mt-2"
        >
          {settingsTab === "general" && <GeneralPanel />}
          {settingsTab === "rendering" && <RenderingPanel />}
          {settingsTab === "api-keys" && <ApiKeysPanel />}
        </div>
      </DialogContent>
    </Dialog>
  );
};
