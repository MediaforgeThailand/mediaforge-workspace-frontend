/**
 * SaveStateBadge — tiny autosave indicator.
 *
 * Listens for the global `workspace-save-state` window event that
 * `useCanvasAutosave` dispatches whenever the canvas's persistence
 * state changes. Renders nothing for "idle" / "guest" so the badge
 * stays out of sight when there's no relevant news to convey.
 *
 * Extracted from the (now deprecated) WorkspaceTabBar so the new
 * floating page pill can render the same indicator without
 * duplicating the listener logic.
 */

import { useEffect, useState } from "react";
import { Check, CloudOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SaveState } from "./useCanvasAutosave";
import { useLanguage } from "@/contexts/LanguageContext";

type Variant = "inline" | "block";

interface Props {
  /** "inline" — small text + icon, suitable for embedding inside the
   *  page pill. "block" — original tab-bar style with side padding. */
  variant?: Variant;
  className?: string;
}

const SaveStateBadge = ({ variant = "block", className }: Props) => {
  const [state, setState] = useState<SaveState>("idle");
  const { t } = useLanguage();
  useEffect(() => {
    const onState = (e: Event) => {
      const detail = (e as CustomEvent<{ state: SaveState }>).detail;
      if (detail?.state) setState(detail.state);
    };
    window.addEventListener("workspace-save-state", onState as EventListener);
    return () =>
      window.removeEventListener(
        "workspace-save-state",
        onState as EventListener,
      );
  }, []);

  const config: Record<
    SaveState,
    {
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      color: string;
    } | null
  > = {
    idle: null,
    guest: null,
    // Viewer & editor-readonly states are surfaced via the
    // ShareModeBanner across the top of the canvas, so the badge
    // itself stays silent — no need to double up.
    viewer: null,
    "editor-readonly": null,
    saving: {
      label: t("workspace.save.saving"),
      icon: Loader2,
      color: "text-amber-300",
    },
    saved: {
      label: t("workspace.save.saved"),
      icon: Check,
      color: "text-emerald-300",
    },
    error: {
      label: t("workspace.save.error_msg"),
      icon: CloudOff,
      color: "text-rose-300",
    },
    tableMissing: {
      label: t("workspace.save.table_missing"),
      icon: CloudOff,
      color: "text-amber-300/80",
    },
  };
  const c = config[state];
  if (!c) return null;
  const Icon = c.icon;

  if (variant === "inline") {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center gap-1 text-[10px]",
          c.color,
          className,
        )}
        title={c.label}
        aria-label={c.label}
      >
        <Icon
          className={cn(
            "h-3 w-3",
            state === "saving" && "animate-spin",
          )}
        />
        {/* Compact label — only show short status words inline.
         *  Long error strings stay as the tooltip. */}
        <span className="truncate">
          {state === "saving" ? t("workspace.save.saving_short") : state === "saved" ? t("workspace.save.saved") : t("workspace.save.offline")}
        </span>
      </span>
    );
  }

  return (
    <div
      className={cn(
        "ml-2 mb-1 flex h-6 shrink-0 items-center gap-1 rounded px-2 text-[10.5px]",
        c.color,
        className,
      )}
      title={c.label}
    >
      <Icon
        className={cn(
          "h-3 w-3",
          state === "saving" && "animate-spin",
        )}
      />
      {c.label}
    </div>
  );
};

export default SaveStateBadge;
