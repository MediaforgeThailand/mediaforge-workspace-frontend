import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
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
  selected?: boolean;
  onDelete?: () => void;
  nodeId?: string;
  mediaKind?: "image" | "video" | "audio" | "model3d" | "text" | null;
  mediaUrl?: string | null;
  mediaFileName?: string | null;
  mediaCreatedAt?: number | string | null;
  mediaSizeBytes?: number | null;
  className?: string;
  bodyTopOffsetPx?: number;
};

type MediaInfo = {
  format: string;
  size: string;
  dimensions: string;
  added: string;
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

const UNKNOWN_VALUE = "--";

function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return UNKNOWN_VALUE;
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatAddedDate(value: number | string | null | undefined): string {
  if (value == null) return UNKNOWN_VALUE;
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return UNKNOWN_VALUE;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getFormatFromSource(
  url: string | null | undefined,
  fileName: string | null | undefined,
  kind: NodeQuickActionRailProps["mediaKind"],
): string {
  const source = fileName || url || "";
  const withoutQuery = source.split("?")[0] ?? source;
  const match = withoutQuery.match(/\.([a-z0-9]{2,5})$/i);
  if (match?.[1]) return match[1].toUpperCase();
  if (kind === "model3d") return "3D";
  if (kind) return kind.toUpperCase();
  return UNKNOWN_VALUE;
}

async function readContentLength(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    const raw = response.headers.get("content-length");
    const bytes = raw ? Number(raw) : NaN;
    return Number.isFinite(bytes) && bytes > 0 ? bytes : null;
  } catch {
    return null;
  }
}

function readImageDimensions(url: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      finish(width && height ? `${width} x ${height}` : UNKNOWN_VALUE);
    };
    image.onerror = () => finish(UNKNOWN_VALUE);
    window.setTimeout(() => finish(UNKNOWN_VALUE), 6000);
    image.src = url;
  });
}

function readVideoDimensions(url: string): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      finish(width && height ? `${width} x ${height}` : UNKNOWN_VALUE);
    };
    video.onerror = () => finish(UNKNOWN_VALUE);
    window.setTimeout(() => finish(UNKNOWN_VALUE), 6000);
    video.src = url;
  });
}

export default function NodeQuickActionRail({
  visible,
  selected = false,
  onDelete,
  nodeId,
  mediaKind,
  mediaUrl,
  mediaFileName,
  mediaCreatedAt,
  mediaSizeBytes,
  className,
  bodyTopOffsetPx = 0,
}: NodeQuickActionRailProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [resolvedInfo, setResolvedInfo] = useState<MediaInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { t } = useLanguage();
  const canShowInfo =
    !!mediaUrl && (mediaKind === "image" || mediaKind === "video" || mediaKind === "model3d");

  useEffect(() => {
    if (!menuOpen && !infoOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as HTMLElement)) {
        setMenuOpen(false);
        setInfoOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen, infoOpen]);

  const baseInfo = useMemo<MediaInfo>(
    () => ({
      format: getFormatFromSource(mediaUrl, mediaFileName, mediaKind),
      size: formatBytes(mediaSizeBytes),
      dimensions: UNKNOWN_VALUE,
      added: formatAddedDate(mediaCreatedAt),
    }),
    [mediaCreatedAt, mediaFileName, mediaKind, mediaSizeBytes, mediaUrl],
  );

  useEffect(() => {
    setResolvedInfo(null);
    setInfoLoading(false);
  }, [mediaUrl, mediaKind, mediaFileName, mediaSizeBytes, mediaCreatedAt]);

  useEffect(() => {
    if (!infoOpen || !canShowInfo || !mediaUrl) return;
    let cancelled = false;
    setInfoLoading(true);
    const loadInfo = async () => {
      const [bytes, dimensions] = await Promise.all([
        mediaSizeBytes ? Promise.resolve(mediaSizeBytes) : readContentLength(mediaUrl),
        mediaKind === "video"
          ? readVideoDimensions(mediaUrl)
          : mediaKind === "image" || mediaKind === "model3d"
            ? readImageDimensions(mediaUrl)
            : Promise.resolve(UNKNOWN_VALUE),
      ]);
      if (cancelled) return;
      setResolvedInfo({
        ...baseInfo,
        size: formatBytes(bytes),
        dimensions,
      });
      setInfoLoading(false);
    };
    void loadInfo();
    return () => {
      cancelled = true;
    };
  }, [baseInfo, canShowInfo, infoOpen, mediaKind, mediaSizeBytes, mediaUrl]);

  const stopNodeGesture = (event: SyntheticEvent) => {
    event.stopPropagation();
  };
  const stopControlGesture = (event: SyntheticEvent) => {
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
        infoOpen && "is-visible",
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
          onPointerDown={stopControlGesture}
          onMouseDown={stopControlGesture}
          onClick={(event) => {
            stopControlGesture(event);
            setInfoOpen(false);
            setMenuOpen((open) => !open);
          }}
        >
          <MoreVertical className="h-[15px] w-[15px]" />
        </button>
        <button
          type="button"
          className={cn(
            "node-quick-action-button",
            (!selected || !canShowInfo) && "is-disabled",
          )}
          aria-label={t("workspace.nodeRail.nodeInfo")}
          aria-expanded={infoOpen}
          disabled={!selected || !canShowInfo}
          onPointerDown={stopControlGesture}
          onMouseDown={stopControlGesture}
          onClick={(event) => {
            stopControlGesture(event);
            setMenuOpen(false);
            setInfoOpen((open) => !open);
          }}
        >
          <Info className="h-[14px] w-[14px]" />
        </button>
        <button
          type="button"
          className="node-quick-action-button is-disabled"
          aria-label={t("workspace.nodeRail.focusNode")}
          disabled
          onPointerDown={stopControlGesture}
          onMouseDown={stopControlGesture}
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
          onPointerDown={stopControlGesture}
          onMouseDown={stopControlGesture}
          onClick={(event) => {
            stopControlGesture(event);
            onDelete?.();
          }}
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

      {infoOpen && canShowInfo && (
        <div className="node-media-info-card" role="status">
          {([
            ["FORMAT", (resolvedInfo ?? baseInfo).format],
            ["SIZE", infoLoading ? "..." : (resolvedInfo ?? baseInfo).size],
            ["DIMENSIONS", infoLoading ? "..." : (resolvedInfo ?? baseInfo).dimensions],
            ["ADDED", (resolvedInfo ?? baseInfo).added],
          ] as const).map(([label, value]) => (
            <div key={label} className="node-media-info-field">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
