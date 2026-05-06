import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import {
  ChevronRight,
  Clock3,
  Crop,
  Info,
  Maximize2,
  Minimize2,
  MoreVertical,
  RefreshCw,
  Scissors,
  Shield,
  Sparkles,
  Volume2,
  VolumeX,
  Image as ImageIcon,
  ScanSearch,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

type NodeQuickActionRailProps = {
  visible: boolean;
  onDelete?: () => void;
  nodeId?: string;
  mediaKind?: "image" | "video" | "audio" | "model3d" | "text" | null;
  className?: string;
  bodyTopOffsetPx?: number;
};

type MenuItem = {
  label: string;
  icon: LucideIcon;
  action?: "crop" | "export-audio" | "remove-audio";
  chevron?: boolean;
  badgeIcon?: LucideIcon;
  disabled?: boolean;
  separatorBefore?: boolean;
};

const MENU_ITEMS: MenuItem[] = [
  { label: "Extend", icon: Maximize2, chevron: true, disabled: true },
  { label: "Crop", icon: Crop, action: "crop", chevron: true },
  { label: "Split to (5s)", icon: Scissors, badgeIcon: Clock3, disabled: true },
  { label: "Manual Split", icon: Scissors, disabled: true },
  { label: "Auto Split", icon: Sparkles, disabled: true },
  { label: "Compress", icon: Minimize2, disabled: true },
  { label: "Convert", icon: RefreshCw, chevron: true, disabled: true },
  { label: "Safe", icon: Shield, chevron: true, disabled: true },
  { label: "Export audio", icon: Volume2, action: "export-audio", separatorBefore: true },
  { label: "Remove audio", icon: VolumeX, action: "remove-audio" },
  { label: "Extract frame", icon: ImageIcon, disabled: true },
];

export default function NodeQuickActionRail({
  visible,
  onDelete,
  nodeId,
  mediaKind,
  className,
  bodyTopOffsetPx = 0,
}: NodeQuickActionRailProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as HTMLElement)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const stopNodeGesture = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  const isItemDisabled = (item: MenuItem) => {
    if (item.disabled) return true;
    if (!item.action || !nodeId) return true;
    if (item.action === "crop") return mediaKind !== "image";
    if (item.action === "export-audio" || item.action === "remove-audio") {
      return mediaKind !== "video";
    }
    return true;
  };

  const fireItem = (item: MenuItem) => {
    if (!item.action || !nodeId || isItemDisabled(item)) return;
    window.dispatchEvent(
      new CustomEvent("workspace-node-quick-action", {
        detail: { nodeId, action: item.action },
      }),
    );
    setMenuOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "node-quick-action-rail nodrag nopan",
        (visible || menuOpen) && "is-visible",
        className,
      )}
      style={bodyTopOffsetPx ? { top: bodyTopOffsetPx + 8 } : undefined}
      onMouseDown={stopNodeGesture}
      onPointerDown={stopNodeGesture}
      onClick={stopNodeGesture}
    >
      <div className="node-quick-action-stack">
        <button
          type="button"
          className="node-quick-action-button"
          aria-label={t("workspace.nodeRail.openTools")}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreVertical className="h-[15px] w-[15px]" />
        </button>
        <button
          type="button"
          className="node-quick-action-button is-disabled"
          aria-label={t("workspace.nodeRail.nodeInfo")}
          disabled
        >
          <Info className="h-[14px] w-[14px]" />
        </button>
        <button
          type="button"
          className="node-quick-action-button is-disabled"
          aria-label={t("workspace.nodeRail.focusNode")}
          disabled
        >
          <ScanSearch className="h-[14px] w-[14px]" />
        </button>
        <button
          type="button"
          className={cn(
            "node-quick-action-button is-danger",
            !onDelete && "is-disabled",
          )}
          aria-label={t("workspace.nodeRail.deleteNode")}
          disabled={!onDelete}
          onClick={() => onDelete?.()}
        >
          <X className="h-[14px] w-[14px]" />
        </button>
      </div>

      {menuOpen && (
        <div className="node-quick-menu" role="menu">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const BadgeIcon = item.badgeIcon;
            const disabled = isItemDisabled(item);
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => fireItem(item)}
                className={cn(
                  "node-quick-menu-item",
                  item.separatorBefore && "has-separator",
                  disabled && "is-disabled",
                )}
              >
                <Icon className="node-quick-menu-icon" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {BadgeIcon && (
                  <span className="node-quick-menu-badge">
                    <BadgeIcon className="h-3.5 w-3.5" />
                  </span>
                )}
                {item.chevron && <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
