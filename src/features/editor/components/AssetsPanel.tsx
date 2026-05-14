import React, { useCallback, useRef, useState, Suspense } from "react";
import {
  Search,
  Maximize2,
  X,
  Image as ImageIcon,
  Film,
  Music,
  Plus,
  Upload,
  Trash2,
  AlertTriangle,
  RefreshCw,
  LayoutGrid,
  Grid2x2,
  List,
  Sparkles,
  ArrowLeftRight,
  Type,
  Captions as CaptionsIcon,
} from "lucide-react";
import { useI18n } from "../services/i18n";
import { getTransitionBridge } from "../bridges/transition-bridge";
import { toast as notify, toast } from "../stores/notification-store";
import { useProjectStore } from "../stores/project-store";
import { useUIStore } from "../stores/ui-store";
import type { MediaItem } from "@/lib/openreel-core";
import { AspectRatioMatchDialog } from "./dialogs/AspectRatioMatchDialog";
import { saveFileHandle, saveDirectoryHandle } from "../services/media-storage";
import {
  IconButton,
  Input,
  ScrollArea,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/openreel-ui";
import { KieAIImageDialog } from "./kieai/KieAIImageDialog";
import { loadMediaBlob } from "../services/media-storage";
import { useKieAIStore } from "../stores/kieai-store";
// Lazy-load MediaForgeBrowser and CaptionsPanel to keep the supabase-js
// client + whisper/captions pipeline out of the initial EditorInterface
// chunk. They open only when the user clicks Media tab cloud-section or
// Captions tab — at that point the import resolves and renders.
const MediaForgeBrowser = React.lazy(() =>
  import("./MediaForgeBrowser").then((m) => ({ default: m.MediaForgeBrowser })),
);
const CaptionsPanel = React.lazy(() =>
  import("./captions/CaptionsPanel").then((m) => ({ default: m.CaptionsPanel })),
);

const LazyPanelFallback = (
  <div className="flex h-full items-center justify-center p-6 text-xs text-text-muted">
    Loading…
  </div>
);

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
};

/**
 * Transition thumbnail — mini SVG visualization showing the actual transition
 * effect with two abstract clip slabs (A = magenta, B = cyan) joined by a
 * graphical hint specific to each transition kind. We use animated SVG via
 * the `animateTransform` / `animate` elements so the card loops the effect
 * continuously when hovered (CSS group-hover triggers `data-running="true"`).
 *
 * This replaces the prior generic gradient + ArrowLeftRight icon which did
 * not communicate what each transition actually does.
 */
type TransitionKind = "fade" | "dipBlack" | "dipWhite" | "slide" | "zoom";

const TransitionThumbnail: React.FC<{ kind: TransitionKind }> = ({ kind }) => {
  const aColor = "#A855F7"; // outgoing clip color
  const bColor = "#06B6D4"; // incoming clip color

  if (kind === "fade") {
    // Two halves with a soft gradient between, plus a fading center band.
    return (
      <svg viewBox="0 0 100 60" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="fade-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={aColor} />
            <stop offset="50%" stopColor={aColor} />
            <stop offset="50%" stopColor={bColor} />
            <stop offset="100%" stopColor={bColor} />
          </linearGradient>
          <linearGradient id="fade-blend" x1="0" y1="0" x2="1" y2="0">
            <stop offset="35%" stopColor={aColor} stopOpacity="1" />
            <stop offset="50%" stopColor={aColor} stopOpacity="0" />
            <stop offset="50%" stopColor={bColor} stopOpacity="0" />
            <stop offset="65%" stopColor={bColor} stopOpacity="1" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="60" fill="url(#fade-grad)" />
        <rect x="0" y="0" width="100" height="60" fill="url(#fade-blend)" />
        <text x="50" y="35" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="700" opacity="0.85">FADE</text>
      </svg>
    );
  }

  if (kind === "dipBlack" || kind === "dipWhite") {
    const mid = kind === "dipBlack" ? "#000000" : "#FFFFFF";
    const textColor = kind === "dipBlack" ? "#fff" : "#000";
    return (
      <svg viewBox="0 0 100 60" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
        <rect x="0" y="0" width="40" height="60" fill={aColor} />
        <rect x="40" y="0" width="20" height="60" fill={mid} />
        <rect x="60" y="0" width="40" height="60" fill={bColor} />
        <text x="50" y="35" textAnchor="middle" fontSize="8" fill={textColor} fontWeight="700">
          DIP
        </text>
      </svg>
    );
  }

  if (kind === "slide") {
    // Show A sliding off to the left while B comes in from the right.
    return (
      <svg viewBox="0 0 100 60" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
        <rect x="0" y="0" width="50" height="60" fill={aColor} />
        <rect x="50" y="0" width="50" height="60" fill={bColor} />
        {/* Arrow showing slide direction */}
        <g transform="translate(50,30)">
          <line x1="-14" y1="0" x2="14" y2="0" stroke="#F4FF00" strokeWidth="3" />
          <polygon points="14,0 8,-6 8,6" fill="#F4FF00" />
        </g>
        <text x="50" y="55" textAnchor="middle" fontSize="7" fill="#fff" fontWeight="700" opacity="0.85">SLIDE</text>
      </svg>
    );
  }

  // zoom
  return (
    <svg viewBox="0 0 100 60" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="100" height="60" fill={aColor} />
      {/* Concentric "zoom" hint */}
      <circle cx="50" cy="30" r="6" fill="none" stroke={bColor} strokeWidth="1.5" opacity="0.95" />
      <circle cx="50" cy="30" r="13" fill="none" stroke={bColor} strokeWidth="1.5" opacity="0.7" />
      <circle cx="50" cy="30" r="20" fill="none" stroke={bColor} strokeWidth="1.5" opacity="0.45" />
      <circle cx="50" cy="30" r="27" fill="none" stroke={bColor} strokeWidth="1.5" opacity="0.25" />
      <text x="50" y="55" textAnchor="middle" fontSize="7" fill="#fff" fontWeight="700" opacity="0.85">ZOOM</text>
    </svg>
  );
};

/**
 * Media Item Thumbnail Component
 * Shows thumbnail with metadata below (not overlaid)
 */
type MediaViewMode = "large" | "small" | "list";

const MediaThumbnail: React.FC<{
  item: MediaItem;
  isSelected: boolean;
  viewMode: MediaViewMode;
  onSelect: () => void;
  onDelete: () => void;
  onReplace: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onAddToTimeline: () => void;
  onKieAI?: () => void;
  onRetryKieAI?: () => void;
}> = ({
  item,
  isSelected,
  viewMode,
  onSelect,
  onDelete,
  onReplace,
  onDragStart,
  onAddToTimeline,
  onKieAI,
  onRetryKieAI,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const getIcon = () => {
    switch (item.type) {
      case "video":
        return Film;
      case "audio":
        return Music;
      case "image":
        return ImageIcon;
      default:
        return Film;
    }
  };

  const Icon = getIcon();

  const formatResolution = () => {
    if (item.metadata?.width && item.metadata?.height) {
      return `${item.metadata.width}×${item.metadata.height}`;
    }
    return null;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const iconColor = item.type === "audio"
    ? "text-primary/50"
    : item.type === "image"
      ? "text-primary/50"
      : "text-status-info/50";

  const borderClass = item.kieaiError
    ? "border-red-500 ring-1 ring-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
    : item.isPending
    ? "border-purple-500 ring-1 ring-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)]"
    : item.isPlaceholder
      ? "border-yellow-500 ring-1 ring-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.3)]"
      : isSelected
        ? "border-primary ring-1 ring-primary/50 shadow-[0_0_10px_rgba(255,181,51,0.25)]"
        : "border-border hover:border-text-secondary";

  const hoverOverlay = (
    <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center gap-2 animate-in fade-in duration-200">
      {item.kieaiError ? (
        <button
          onClick={(e) => { e.stopPropagation(); onRetryKieAI?.(); }}
          title="Generation failed — click to retry"
          className="p-2 bg-red-500/20 rounded-full hover:bg-red-500/40 backdrop-blur-sm transition-colors"
        >
          <RefreshCw size={14} className="text-red-400" />
        </button>
      ) : item.isPending ? (
        <div title="KieAI generation in progress…" className="p-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
        </div>
      ) : item.isPlaceholder ? (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onReplace(); }}
            title="Replace asset"
            className="p-2 bg-yellow-500/20 rounded-full hover:bg-yellow-500/40 backdrop-blur-sm transition-colors"
          >
            <RefreshCw size={14} className="text-yellow-500" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete"
            className="p-2 bg-red-500/20 rounded-full hover:bg-red-500/40 backdrop-blur-sm transition-colors"
          >
            <Trash2 size={14} className="text-red-400" />
          </button>
        </>
      ) : (
        <>
          {item.type === "image" && onKieAI && (
            <button
              onClick={(e) => { e.stopPropagation(); onKieAI(); }}
              title="Create with KieAI"
              className="p-2 bg-purple-500/20 rounded-full hover:bg-purple-500/40 backdrop-blur-sm transition-colors"
            >
              <Sparkles size={14} className="text-purple-300" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onAddToTimeline(); }}
            title="Add to timeline"
            className="p-2 bg-primary/20 rounded-full hover:bg-primary/40 backdrop-blur-sm transition-colors"
          >
            <Plus size={14} className="text-primary" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete"
            className="p-2 bg-red-500/20 rounded-full hover:bg-red-500/40 backdrop-blur-sm transition-colors"
          >
            <Trash2 size={14} className="text-red-400" />
          </button>
        </>
      )}
    </div>
  );

  // --- List view ---
  if (viewMode === "list") {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
      <div
        draggable
        onDragStart={onDragStart}
        onClick={onSelect}
        onDoubleClick={(e) => { e.stopPropagation(); onAddToTimeline(); }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`flex items-center gap-3 px-2 py-1.5 rounded-lg border-2 cursor-pointer transition-all group ${borderClass}`}
      >
        {/* Small thumbnail */}
        <div className="w-12 h-8 rounded bg-background-tertiary relative overflow-hidden flex-shrink-0">
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon size={14} className={iconColor} />
            </div>
          )}
          {item.kieaiError && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-500/10">
              <AlertTriangle size={12} className="text-red-400" />
            </div>
          )}
          {!item.kieaiError && item.isPending && (
            <div className="absolute inset-0 flex items-center justify-center bg-purple-500/10">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
            </div>
          )}
          {!item.kieaiError && !item.isPending && item.isPlaceholder && (
            <div className="absolute inset-0 flex items-center justify-center bg-yellow-500/10">
              <AlertTriangle size={12} className="text-yellow-500/70" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div
            className={`text-[11px] truncate font-medium ${isSelected ? "text-primary" : "text-text-primary"}`}
            title={item.name}
          >
            {item.name}
          </div>
          <div className="flex items-center gap-1.5 text-[9px] text-text-muted">
            {item.metadata?.duration && <span>{formatDuration(item.metadata.duration)}</span>}
            {item.metadata?.duration && formatResolution() && <span>•</span>}
            {formatResolution() && <span>{formatResolution()}</span>}
            {(item.metadata?.duration || formatResolution()) && formatFileSize(item.metadata?.fileSize) && <span>•</span>}
            {formatFileSize(item.metadata?.fileSize) && <span>{formatFileSize(item.metadata?.fileSize)}</span>}
          </div>
        </div>

        {/* Hover actions */}
        {isHovered && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {item.kieaiError ? (
              <button
                onClick={(e) => { e.stopPropagation(); onRetryKieAI?.(); }}
                title="Retry generation"
                className="p-1 bg-red-500/20 rounded hover:bg-red-500/40 transition-colors"
              >
                <RefreshCw size={12} className="text-red-400" />
              </button>
            ) : item.isPending ? (
              <div className="p-1" title="Generating…">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
              </div>
            ) : item.isPlaceholder ? (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onReplace(); }}
                  title="Replace asset"
                  className="p-1 bg-yellow-500/20 rounded hover:bg-yellow-500/40 transition-colors"
                >
                  <RefreshCw size={12} className="text-yellow-500" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  title="Delete"
                  className="p-1 bg-red-500/20 rounded hover:bg-red-500/40 transition-colors"
                >
                  <Trash2 size={12} className="text-red-400" />
                </button>
              </>
            ) : (
              <>
                {item.type === "image" && onKieAI && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onKieAI(); }}
                    title="Create with KieAI"
                    className="p-1 bg-purple-500/20 rounded hover:bg-purple-500/40 transition-colors"
                  >
                    <Sparkles size={12} className="text-purple-300" />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onAddToTimeline(); }}
                  title="Add to timeline"
                  className="p-1 bg-primary/20 rounded hover:bg-primary/40 transition-colors"
                >
                  <Plus size={12} className="text-primary" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  title="Delete"
                  className="p-1 bg-red-500/20 rounded hover:bg-red-500/40 transition-colors"
                >
                  <Trash2 size={12} className="text-red-400" />
                </button>
              </>
            )}
          </div>
        )}

        {isSelected && (
          <div className="w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_#ffb533] flex-shrink-0" />
        )}
      </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {item.type === "image" && onKieAI && (
            <ContextMenuItem onClick={onKieAI}>
              <Sparkles size={13} className="mr-2 text-primary" />
              Create with KieAI
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={(e) => { (e as React.MouseEvent).stopPropagation?.(); onAddToTimeline(); }}>
            <Plus size={13} className="mr-2" />
            Add to Timeline
          </ContextMenuItem>
          <ContextMenuItem onClick={(e) => { (e as React.MouseEvent).stopPropagation?.(); onDelete(); }} className="text-red-400 focus:text-red-400">
            <Trash2 size={13} className="mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  // --- Grid view (large & small) ---
  const thumbnailIconSize = viewMode === "small" ? 16 : 24;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
    <div className="flex flex-col">
      {/* Thumbnail container */}
      <div
        draggable
        onDragStart={onDragStart}
        onClick={onSelect}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onAddToTimeline();
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`aspect-video bg-background-tertiary rounded-lg border-2 relative group cursor-pointer transition-all overflow-hidden shadow-sm ${borderClass}`}
      >
        {/* Thumbnail or placeholder */}
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-background-tertiary">
            <Icon size={thumbnailIconSize} className={iconColor} />
          </div>
        )}

        {/* Audio waveform placeholder */}
        {item.type === "audio" && (
          <div className="absolute top-1/2 left-0 right-0 h-4 flex items-center gap-px px-2 -translate-y-1/2">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="flex-1 bg-primary/30 rounded-full"
                style={{ height: `${Math.random() * 100}%` }}
              />
            ))}
          </div>
        )}

        {/* KieAI Error Badge */}
        {item.kieaiError && (
          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-red-500 rounded text-[8px] text-white font-bold flex items-center gap-1">
            <AlertTriangle size={8} />
            Failed
          </div>
        )}

        {/* Pending KieAI Badge */}
        {!item.kieaiError && item.isPending && (
          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-purple-500 rounded text-[8px] text-white font-bold flex items-center gap-1">
            <div className="h-2 w-2 animate-spin rounded-full border border-white border-t-transparent" />
            AI
          </div>
        )}

        {/* Missing Asset Badge */}
        {!item.kieaiError && !item.isPending && item.isPlaceholder && (
          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-yellow-500 rounded text-[8px] text-black font-bold flex items-center gap-1">
            <AlertTriangle size={10} />
            Missing
          </div>
        )}

        {/* Duration badge on thumbnail */}
        {item.metadata?.duration && (
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-[9px] text-white font-mono">
            {formatDuration(item.metadata.duration)}
          </div>
        )}

        {/* Error overlay */}
        {item.kieaiError && !isHovered && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/10">
            <AlertTriangle size={viewMode === "small" ? 20 : 32} className="text-red-400/60" />
          </div>
        )}

        {/* Pending overlay */}
        {!item.kieaiError && item.isPending && !isHovered && (
          <div className="absolute inset-0 flex items-center justify-center bg-purple-500/10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-400 border-t-transparent" />
          </div>
        )}

        {/* Warning icon overlay for placeholders */}
        {!item.kieaiError && !item.isPending && item.isPlaceholder && !isHovered && (
          <div className="absolute inset-0 flex items-center justify-center bg-yellow-500/10">
            <AlertTriangle size={viewMode === "small" ? 20 : 32} className="text-yellow-500/50" />
          </div>
        )}

        {/* Hover overlay with actions */}
        {isHovered && hoverOverlay}

        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_#ffb533]" />
        )}
      </div>

      {/* Metadata below thumbnail */}
      <div className="mt-1.5 px-0.5">
        <div
          className={`text-[10px] truncate font-medium ${
            isSelected ? "text-primary" : "text-text-primary"
          }`}
          title={item.name}
        >
          {item.name}
        </div>
        {viewMode === "large" && (
          <div className="flex items-center gap-1.5 text-[9px] text-text-muted mt-0.5">
            {formatResolution() && <span>{formatResolution()}</span>}
            {formatResolution() && formatFileSize(item.metadata?.fileSize) && (
              <span>•</span>
            )}
            {formatFileSize(item.metadata?.fileSize) && (
              <span>{formatFileSize(item.metadata?.fileSize)}</span>
            )}
          </div>
        )}
      </div>
    </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {item.type === "image" && onKieAI && (
          <ContextMenuItem onClick={onKieAI}>
            <Sparkles size={13} className="mr-2 text-primary" />
            Create with KieAI
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => onAddToTimeline()}>
          <Plus size={13} className="mr-2" />
          Add to Timeline
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onDelete()} className="text-red-400 focus:text-red-400">
          <Trash2 size={13} className="mr-2" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

const EmptyState: React.FC<{ onImport: () => void }> = ({ onImport }) => {
  const t = useI18n();
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-background-tertiary border border-border flex items-center justify-center mb-4 shadow-inner">
        <Upload size={24} className="text-text-muted" />
      </div>
      <p className="text-sm text-text-secondary mb-2 font-medium">
        {t("no_media")}
      </p>
      <p className="text-xs text-text-muted mb-6">
        {t("drag_or_click_import")}
      </p>
      <button
        onClick={onImport}
        className="px-4 py-2 bg-background-elevated hover:bg-background-tertiary border border-border text-text-primary text-xs font-medium rounded-lg transition-all hover:border-primary/50"
      >
        {t("import_media")}
      </button>
    </div>
  );
};

const LoadingIndicator: React.FC<{ message: string }> = ({ message }) => (
  <div className="absolute inset-0 bg-background-secondary/90 backdrop-blur-sm flex flex-col items-center justify-center z-50">
    <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
    <p className="text-sm text-text-secondary">{message}</p>
  </div>
);

export const AssetsPanel: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // AssetsPanel top tabs — only those wired to real functionality remain.
  // V5 cleanup pass removed the "ai" tab (TTS / multicam / filter presets /
  // templates / music library — most either mockup-tier or out-of-scope for a
  // basic editor; the one keeper, Auto Captions, lives in the Inspector).
  // Earlier passes removed "effects" / "filters" / "captions" / "adjustment" /
  // "templates" / "avatar".
  // Mega-fix pass removed "stickers" / "graphics" tab — Backgrounds, Shapes,
  // and Emoji stickers were not working end-to-end for the user. The actual
  // graphics-layer feature stays accessible via Inspector once shape/sticker
  // clips exist; the picker UI was the dead path.
  type AssetsTab =
    | "media"
    | "audio"
    | "text"
    | "transitions"
    | "captions";
  const [activeTab, setActiveTab] = useState<AssetsTab>("media");
  const t = useI18n();

  const [isDragOver, setIsDragOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const [showAspectRatioDialog, setShowAspectRatioDialog] = useState(false);
  const [aspectRatioDialogData, setAspectRatioDialogData] = useState<{
    videoWidth: number;
    videoHeight: number;
    itemToAdd: MediaItem;
  } | null>(null);
  // Default view = "small" (compact grid). Most users have many assets and
  // the small-icon grid shows ~2× as many thumbnails per scroll. Users can
  // still switch to "large" or "list" via the view toggle next to the search bar.
  const [mediaViewMode, setMediaViewMode] = useState<MediaViewMode>("small");

  // KieAI image generation dialog
  const [kieaiDialog, setKieaiDialog] = useState<{ file: File; previewUrl: string | null } | null>(null);

  // Project store
  const {
    project,
    importMedia,
    deleteMedia,
    replaceMediaAsset,
    updateSettings,
    setKieAIItemState,
  } = useProjectStore();
  const mediaItems = project.mediaLibrary.items;

  // KieAI store
  const { retryTask } = useKieAIStore();

  // UI store
  const { select, isSelected, startDrag } = useUIStore();

  // Count missing assets
  const missingAssetsCount = mediaItems.filter(
    (item) => item.isPlaceholder,
  ).length;

  // Sub-nav state. Tabs that have sub-categories use this as the active chip.
  // - media: "all" | "video" | "image" | "audio"
  // - audio: "all" | "music" | "sfx" | "voiceover" (filters audio sub-types)
  // The text sub-nav chips ("Yours / Effects / Template") were removed in the
  // V5 cleanup — Effects/Template didn't filter anything real.
  type MediaSubNav = "all" | "video" | "image" | "audio";
  type AudioSubNav = "all" | "music" | "sfx" | "voiceover";
  const [mediaSubNav, setMediaSubNav] = useState<MediaSubNav>("all");
  const [audioSubNav, setAudioSubNav] = useState<AudioSubNav>("all");

  // Filter media items by search query, missing assets toggle, current tab,
  // and the active sub-nav chip. The "audio" tab is a filtered-by-type view
  // of the same media library.
  const filteredItems = mediaItems.filter((item) => {
    const matchesSearch = item.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesFilter = showOnlyMissing ? item.isPlaceholder : true;
    let matchesTab = true;
    if (activeTab === "audio") {
      matchesTab = item.type === "audio";
    } else if (activeTab === "media") {
      // Apply media sub-nav filter when not on "all"
      if (mediaSubNav === "video") matchesTab = item.type === "video";
      else if (mediaSubNav === "image") matchesTab = item.type === "image";
      else if (mediaSubNav === "audio") matchesTab = item.type === "audio";
    }
    return matchesSearch && matchesFilter && matchesTab;
  });

  // Handle file import with loading state
  const handleFileImport = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      // Filter out non-media files up-front so we give the user immediate,
      // honest feedback instead of trying to decode (e.g.) a .zip or .txt
      // through mediabunny and silently failing.
      const fileArray = Array.from(files);
      const isMedia = (f: File) => {
        const t = (f.type || "").toLowerCase();
        if (t.startsWith("video/") || t.startsWith("audio/") || t.startsWith("image/"))
          return true;
        // Some OS drag flavours (especially from older browsers) deliver an
        // empty MIME type — fall back to extension sniffing for safety.
        const name = (f.name || "").toLowerCase();
        return /\.(mp4|mov|m4v|webm|mkv|avi|mp3|wav|m4a|aac|flac|ogg|opus|jpg|jpeg|png|gif|webp|bmp|svg|avif)$/.test(
          name,
        );
      };
      const accepted: File[] = [];
      const rejected: File[] = [];
      for (const f of fileArray) {
        if (isMedia(f)) accepted.push(f);
        else rejected.push(f);
      }

      if (rejected.length > 0) {
        if (rejected.length === 1) {
          toast.error(
            `Can't import ${rejected[0].name}`,
            "Only video, audio, and image files are supported.",
          );
        } else {
          toast.error(
            `Skipped ${rejected.length} unsupported files`,
            rejected.map((f) => f.name).join(", "),
          );
        }
      }
      if (accepted.length === 0) return;

      setIsImporting(true);
      const failed: { name: string; reason: string }[] = [];

      try {
        for (let i = 0; i < accepted.length; i++) {
          const file = accepted[i];
          setImportProgress(
            `Importing ${file.name} (${i + 1}/${accepted.length})...`,
          );

          const result = await importMedia(file);

          if (!result.success) {
            failed.push({
              name: file.name,
              reason: result.error?.message || "Unknown error",
            });
            continue;
          }

          // If it's a video with audio, extract audio to separate track
          if (file.type.startsWith("video/")) {
            setImportProgress(`Extracting audio from ${file.name}...`);
            // Audio extraction is handled by the importMedia function
            // The audio track is created automatically when adding to timeline
          }
        }
      } catch (error) {
        console.error("Import failed:", error);
        toast.error(
          "Import failed",
          error instanceof Error ? error.message : "Unknown error",
        );
      } finally {
        setIsImporting(false);
        setImportProgress("");
        if (failed.length === 1) {
          toast.error(`Could not import ${failed[0].name}`, failed[0].reason);
        } else if (failed.length > 1) {
          toast.error(
            `Could not import ${failed.length} files`,
            failed.map((f) => f.name).join(", "),
          );
        }
      }
    },
    [importMedia],
  );

  // Helper — only OS-file drags carry the "Files" type. Clip drags within
  // the app set custom MIME types only, so we ignore them here. This guards
  // against the panel "lighting up" when the user is just shuffling clips
  // around the timeline.
  const isFileDrag = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (!types) return false;
    // DataTransferItemList implements contains(); fall through to Array.
    return Array.from(types).includes("Files");
  }, []);

  // Handle drag and drop import — capture FileSystemFileHandle for each dropped file
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      // Try to capture handles before files are consumed
      if ("getAsFileSystemHandle" in DataTransferItem.prototype) {
        const handlePromises = Array.from(e.dataTransfer.items)
          .filter((item) => item.kind === "file")
          .map(async (item) => {
            try {
              const handle = await (item as DataTransferItem & { getAsFileSystemHandle(): Promise<FileSystemHandle> }).getAsFileSystemHandle();
              if (handle.kind === "file") {
                const fileHandle = handle as FileSystemFileHandle;
                const file = await fileHandle.getFile();
                await saveFileHandle(file.name, file.size, fileHandle);
              }
            } catch {
              // Ignore — handle capture is best-effort
            }
          });
        await Promise.all(handlePromises);
      }

      handleFileImport(e.dataTransfer.files);
    },
    [handleFileImport, isFileDrag],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      // The browser default for a file drag-over is "no-drop" — preventDefault
      // is required to let drop fire. Skip non-file drags entirely so timeline
      // clip drags don't trigger the overlay.
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setIsDragOver(true);
    },
    [isFileDrag],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setIsDragOver(true);
    },
    [isFileDrag],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear when the cursor actually leaves the panel — not when crossing
    // child boundaries. We compare against `currentTarget` (the <aside>): if
    // the relatedTarget is still inside it, ignore.
    const next = e.relatedTarget as Node | null;
    if (next && (e.currentTarget as Node).contains(next)) return;
    setIsDragOver(false);
  }, []);

  // Handle media item selection
  const handleSelectItem = useCallback(
    (itemId: string) => {
      select({ type: "clip", id: itemId });
    },
    [select],
  );

  // Handle media item deletion
  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      await deleteMedia(itemId);
    },
    [deleteMedia],
  );

  // Handle asset replacement
  const handleReplaceAsset = useCallback(
    async (itemId: string) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*,audio/*,image/*";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          setIsImporting(true);
          setImportProgress(`Replacing asset...`);
          try {
            await replaceMediaAsset(itemId, file);
          } catch (error) {
            console.error("Asset replacement failed:", error);
          } finally {
            setIsImporting(false);
            setImportProgress("");
          }
        }
      };
      input.click();
    },
    [replaceMediaAsset],
  );

  const handleRelinkFromFolder = useCallback(async () => {
    if (!("showDirectoryPicker" in window)) {
      toast.error("Folder picker not supported", "Please relink assets individually using the refresh button on each missing asset.");
      return;
    }
    let dirHandle: FileSystemDirectoryHandle;
    try {
      dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    } catch {
      return; // user cancelled
    }

    const { project } = useProjectStore.getState();
    const placeholders = project.mediaLibrary.items.filter((item) => item.isPlaceholder);
    if (placeholders.length === 0) return;

    // Persist the directory handle for future auto-restore
    try { await saveDirectoryHandle(project.id, dirHandle); } catch { /* best-effort */ }

    // Build a name:size → {File, handle} map for reliable matching
    const fileMap = new Map<string, { file: File; handle: FileSystemFileHandle }>();
    const entries = (dirHandle as unknown as { entries: () => AsyncIterableIterator<[string, FileSystemHandle]> }).entries();
    for await (const [, fh] of entries) {
      if ((fh as FileSystemHandle).kind === "file") {
        const fileHandle = fh as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        fileMap.set(`${file.name.toLowerCase()}:${file.size}`, { file, handle: fileHandle });
      }
    }

    setIsImporting(true);
    let linked = 0;
    for (const item of placeholders) {
      // Match on original source file name + size (same strategy as auto-restore)
      const key = item.sourceFile
        ? `${item.sourceFile.name.toLowerCase()}:${item.sourceFile.size}`
        : null;
      const entry = key ? fileMap.get(key) : null;
      if (entry) {
        setImportProgress(`Relinking ${item.name}…`);
        try {
          // Save individual file handle for future auto-restore
          try { await saveFileHandle(entry.file.name, entry.file.size, entry.handle); } catch { /* best-effort */ }
          await replaceMediaAsset(item.id, entry.file, dirHandle.name);
          linked++;
        } catch (err) {
          console.error(`[AssetsPanel] Failed to relink ${item.name}:`, err);
        }
      }
    }
    setIsImporting(false);
    setImportProgress("");

    if (linked > 0) {
      toast.success(`Relinked ${linked} of ${placeholders.length} asset${placeholders.length !== 1 ? "s" : ""}`);
    } else {
      toast.error("No matches found", "None of the files in the selected folder matched the missing assets by filename.");
    }
  }, [replaceMediaAsset]);

  // Handle drag start for timeline placement
  const handleItemDragStart = useCallback(
    (e: React.DragEvent, item: MediaItem) => {
      e.dataTransfer.setData(
        "application/json",
        JSON.stringify({ mediaId: item.id }),
      );
      e.dataTransfer.effectAllowed = "copy";
      startDrag("media", { mediaId: item.id, mediaType: item.type });
    },
    [startDrag],
  );

  const addMediaToTimeline = useCallback(async (item: MediaItem) => {
    const { addClipToNewTrack } = useProjectStore.getState();
    await addClipToNewTrack(item.id);
  }, []);

  const handleConfirmAspectRatioMatch = useCallback(async () => {
    if (!aspectRatioDialogData) return;

    await updateSettings({
      width: aspectRatioDialogData.videoWidth,
      height: aspectRatioDialogData.videoHeight,
    });

    const itemToAdd = aspectRatioDialogData.itemToAdd;
    setShowAspectRatioDialog(false);
    setAspectRatioDialogData(null);

    await addMediaToTimeline(itemToAdd);
  }, [aspectRatioDialogData, updateSettings, addMediaToTimeline]);

  const handleCancelAspectRatioMatch = useCallback(async () => {
    if (!aspectRatioDialogData) return;

    const itemToAdd = aspectRatioDialogData.itemToAdd;
    setShowAspectRatioDialog(false);
    setAspectRatioDialogData(null);

    await addMediaToTimeline(itemToAdd);
  }, [aspectRatioDialogData, addMediaToTimeline]);

  const handleAddToTimeline = useCallback(
    async (item: MediaItem) => {
      const { project: currentProject } = useProjectStore.getState();
      const tracks = currentProject.timeline.tracks;
      const hasClips = tracks.some((track) => track.clips.length > 0);

      if (
        !hasClips &&
        item.type === "video" &&
        item.metadata?.width &&
        item.metadata?.height
      ) {
        const videoWidth = item.metadata.width;
        const videoHeight = item.metadata.height;
        const projectWidth = currentProject.settings.width;
        const projectHeight = currentProject.settings.height;

        if (videoWidth !== projectWidth || videoHeight !== projectHeight) {
          setAspectRatioDialogData({ videoWidth, videoHeight, itemToAdd: item });
          setShowAspectRatioDialog(true);
          return;
        }
      }

      await addMediaToTimeline(item);
    },
    [addMediaToTimeline],
  );

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Open KieAI dialog for an image asset
  const handleOpenKieAI = useCallback(async (item: MediaItem) => {
    try {
      const blob = await loadMediaBlob(item.id);
      if (!blob) {
        toast.error("Asset not found", "Cannot load the image data for this asset.");
        return;
      }
      const mimeType = blob.type || (item.name.match(/\.png$/i) ? "image/png" : "image/jpeg");
      const file = new File([blob], item.name, { type: mimeType as string });
      setKieaiDialog({ file, previewUrl: item.thumbnailUrl });
    } catch (err) {
      console.error("[KieAI] Failed to load media blob:", err);
      toast.error("Failed to open KieAI", err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  const handleRetryKieAI = useCallback((item: MediaItem) => {
    if (!item.kieaiTaskId) return;
    // Reset error state and re-activate polling
    setKieAIItemState(item.id, true, false);
    retryTask(item.kieaiTaskId);
  }, [retryTask, setKieAIItemState]);

  // 3-column NLE convention: horizontal tab row at top of library panel
  // (Premiere / Final Cut / Resolve style). Each tab shows an icon + label
  // inline, ~80px wide, ~36px tall. Active tab uses MediaForge brand yellow
  // accent with a bottom border underline. The panel is a single 300px column
  // (vs the legacy 64+280 = 344px icon-strip + content split).
  // Compact labels — long t() values like "Transitions" don't fit comfortably
  // in a 300px panel alongside 5 other tabs. We fall back to a shorter form
  // when the full label would otherwise overflow.
  const compactLabel = (id: AssetsTab, full: string): string => {
    if (id === "transitions") return "Transit.";
    if (id === "captions") return t("captions");
    return full;
  };

  const tabDefs = ([
    { id: "media", icon: Film, label: t("media") },
    { id: "audio", icon: Music, label: "Audio" },
    { id: "text", icon: Type, label: t("text") },
    { id: "transitions", icon: ArrowLeftRight, label: t("transitions") },
    { id: "captions", icon: CaptionsIcon, label: t("captions"), accent: true },
  ] as Array<{
    id: AssetsTab;
    icon: typeof Film;
    label: string;
    accent?: boolean;
  }>);

  // Sub-nav chip definitions per tab. Tabs without entries here skip the
  // sub-nav row entirely.
  const mediaSubNavDefs: Array<{ id: MediaSubNav; label: string }> = [
    { id: "all", label: "All" },
    { id: "video", label: "Videos" },
    { id: "image", label: "Images" },
    { id: "audio", label: "Audio" },
  ];
  const audioSubNavDefs: Array<{ id: AudioSubNav; label: string }> = [
    { id: "all", label: "All" },
    { id: "music", label: "Music" },
    { id: "sfx", label: "SFX" },
    { id: "voiceover", label: "Voiceover" },
  ];

  return (
    <aside
      data-tour="assets"
      aria-labelledby="library-panel-heading"
      className="w-full h-full min-w-0 flex flex-col bg-background-secondary border-r border-border relative overflow-hidden"
      // Drag-drop is wired here at the panel root (not on the ScrollArea
      // viewport) so files can be dropped anywhere in the library — over the
      // empty state, the search bar, the tab strip, or the asset grid.
      // Radix ScrollArea wraps its content in nested viewports that don't
      // reliably forward DOM drag events, which is why the earlier ScrollArea-
      // level handlers silently failed.
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* sr-only region heading satisfies the heading-order rule for any
          h3/h4 inside the library tabs. Visible UI is the tablist below. */}
      <h2 id="library-panel-heading" className="sr-only">
        Asset library
      </h2>
      {/* Loading overlay */}
      {isImporting && (
        <LoadingIndicator message={importProgress || "Importing media..."} />
      )}
      {/* Drag-and-drop visual overlay. Covers the entire panel (excluding
          parent chrome) and gives explicit "drop here" feedback while a file
          is hovered. `pointer-events-none` so the overlay never intercepts
          the underlying dragover/dragleave/drop events — those continue to
          fire on the <aside> as expected. */}
      {isDragOver && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-primary/10 backdrop-blur-[1px]"
        >
          <div className="rounded-lg border-2 border-dashed border-primary bg-background-secondary/90 px-6 py-4 shadow-lg">
            <div className="flex items-center gap-2 text-primary">
              <Plus size={18} />
              <span className="text-sm font-semibold tracking-tight">
                Drop files here to import
              </span>
            </div>
            <div className="mt-1 text-[11px] text-text-secondary">
              Video, audio, or image files
            </div>
          </div>
        </div>
      )}

      {/* Horizontal tab row — NLE convention. Icon + label inline, ~36px
          tall, scrollable if it overflows. Active tab gets brand yellow text
          plus a 2px bottom border. We wrap in a `relative` container so a
          right-edge fade gradient can hint that more tabs are scrollable into
          view when the library panel is sized to its minimum width (~240px). */}
      <div className="relative shrink-0">
        <div
          className="h-9 flex items-stretch border-b border-border/40 overflow-x-auto custom-scrollbar"
          role="tablist"
          aria-label="Library tabs"
        >
          {tabDefs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                title={tab.label}
                data-testid={`assets-tab-${tab.id}`}
                className={`shrink-0 px-2 flex items-center gap-1 text-[11px] font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-primary text-primary bg-primary/[0.06]"
                    : tab.accent
                      ? "border-transparent text-primary/70 hover:text-primary hover:bg-background-elevated/40"
                      : "border-transparent text-text-secondary hover:text-text-primary hover:bg-background-elevated/40"
                }`}
              >
                <Icon size={12} />
                <span className="leading-none whitespace-nowrap">
                  {compactLabel(tab.id, tab.label)}
                </span>
              </button>
            );
          })}
        </div>
        {/* Right-edge fade hint — visible only when the tab row actually
            overflows (any reasonable panel min size below ~365px shows it). */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 h-9 w-8 bg-gradient-to-l from-background-secondary to-transparent"
        />
      </div>

      {/* Sub-nav chip row — only rendered for tabs that need sub-filtering
          (Media / Audio). 28px tall, 11px text, rounded-full chips. */}
      {(activeTab === "media" || activeTab === "audio") && (
        <div className="px-3 py-1.5 shrink-0 flex items-center gap-1.5 overflow-x-auto border-b border-border/30">
          {activeTab === "media" && mediaSubNavDefs.map((chip) => {
            const isActive = mediaSubNav === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => setMediaSubNav(chip.id)}
                className={`shrink-0 px-3 h-6 rounded-full text-[11px] font-medium transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "bg-background-tertiary text-text-secondary hover:text-text-primary"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
          {activeTab === "audio" && audioSubNavDefs.map((chip) => {
            const isActive = audioSubNav === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => setAudioSubNav(chip.id)}
                className={`shrink-0 px-3 h-6 rounded-full text-[11px] font-medium transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "bg-background-tertiary text-text-secondary hover:text-text-primary"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Panel action header — title + action buttons. Compact, sits between
          the sub-nav and search/content. The title repeats the active tab
          label as a redundant cue for users coming from non-NLE editors.
          The Captions tab owns its own header so we hide this one for it. */}
      {activeTab !== "captions" && (
        <div className="px-3 h-8 shrink-0 flex items-center justify-between border-b border-border/30">
          <span className="text-[12px] font-semibold text-text-primary tracking-tight">
            {tabDefs.find((tab) => tab.id === activeTab)?.label || t("assets")}
          </span>
          <div className="flex gap-0.5">
            <IconButton
              icon={Plus}
              onClick={triggerFileInput}
              title={t("import")}
            />
            <IconButton icon={Maximize2} title="Maximize panel" />
            <IconButton icon={X} title="Close panel" />
          </div>
        </div>
      )}

      {/* Search & view toggle - only show for media tab */}
      {(activeTab === "media" || activeTab === "audio") && (
        <div className="px-3 py-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted z-10" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("search_media")}
              className="pl-9 text-xs bg-background-tertiary border-border text-text-primary h-8"
            />
          </div>
          <div className="flex items-center bg-background-tertiary border border-border rounded-md p-0.5">
            {([
              { mode: "large" as const, icon: LayoutGrid, title: "Large icons" },
              { mode: "small" as const, icon: Grid2x2, title: "Small icons" },
              { mode: "list" as const, icon: List, title: "List view" },
            ]).map(({ mode, icon: ViewIcon, title }) => (
              <button
                key={mode}
                onClick={() => setMediaViewMode(mode)}
                title={title}
                className={`p-1 rounded transition-colors ${
                  mediaViewMode === mode
                    ? "bg-background-elevated text-text-primary"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <ViewIcon size={12} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Missing Assets Filter and Badge */}
      {activeTab === "media" && missingAssetsCount > 0 && (
        <div className="px-3 mb-3 space-y-2">
          <button
            onClick={() => setShowOnlyMissing(!showOnlyMissing)}
            className={`w-full px-3 py-2 rounded-lg border text-xs font-medium transition-all flex items-center justify-between ${
              showOnlyMissing
                ? "bg-yellow-500/10 border-yellow-500 text-yellow-500"
                : "bg-background-tertiary border-border text-text-secondary hover:border-yellow-500/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} />
              <span>Show Only Missing Assets</span>
            </div>
            <div className="px-2 py-0.5 rounded-full bg-yellow-500 text-black text-[10px] font-bold">
              {missingAssetsCount}
            </div>
          </button>
          <button
            onClick={handleRelinkFromFolder}
            className="w-full px-3 py-2 rounded-lg border border-yellow-500/40 bg-yellow-500/5 text-yellow-500 text-xs font-medium transition-all hover:bg-yellow-500/15 flex items-center gap-2"
          >
            <RefreshCw size={14} />
            <span>Relink from Folder…</span>
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/*"
        onChange={(e) => handleFileImport(e.target.files)}
        className="hidden"
      />

      {/* Content based on active tab */}
      {(activeTab === "media" || activeTab === "audio") && (
        <ScrollArea
          className="flex-1"
        >
          {/* MediaForge cloud asset browser (collapsible) — lazy-loaded */}
          <Suspense fallback={LazyPanelFallback}>
            <MediaForgeBrowser />
          </Suspense>

          <div className="px-3 pb-3">
            {filteredItems.length === 0 ? (
              <EmptyState onImport={triggerFileInput} />
            ) : (
              <div className={
                mediaViewMode === "list"
                  ? "flex flex-col gap-1.5"
                  : mediaViewMode === "small"
                    ? "grid grid-cols-3 gap-2"
                    : "grid grid-cols-2 gap-3"
              }>
                {filteredItems.map((item) => (
                  <MediaThumbnail
                    key={item.id}
                    item={item}
                    isSelected={isSelected(item.id)}
                    viewMode={mediaViewMode}
                    onSelect={() => handleSelectItem(item.id)}
                    onDelete={() => handleDeleteItem(item.id)}
                    onReplace={() => handleReplaceAsset(item.id)}
                    onDragStart={(e) => handleItemDragStart(e, item)}
                    onAddToTimeline={() => handleAddToTimeline(item)}
                    onKieAI={item.type === "image" && !item.isPending && !item.kieaiError ? () => handleOpenKieAI(item) : undefined}
                    onRetryKieAI={item.kieaiError && item.kieaiTaskId ? () => handleRetryKieAI(item) : undefined}
                  />
                ))}
                {/* Add more media tile */}
                {mediaViewMode === "list" ? (
                  <button
                    onClick={triggerFileInput}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-lg border-2 border-dashed border-border hover:border-text-secondary cursor-pointer transition-all group"
                  >
                    <div className="w-12 h-8 rounded bg-background-tertiary flex items-center justify-center flex-shrink-0">
                      <Upload size={14} className="text-text-muted group-hover:text-text-secondary transition-colors" />
                    </div>
                    <span className="text-[11px] text-text-muted group-hover:text-text-secondary transition-colors font-medium">Add media</span>
                  </button>
                ) : (
                  <div className="flex flex-col">
                    <button
                      onClick={triggerFileInput}
                      className="aspect-video bg-background-tertiary rounded-lg border-2 border-dashed border-border hover:border-text-secondary relative flex items-center justify-center cursor-pointer transition-all overflow-hidden shadow-sm group"
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <Upload size={mediaViewMode === "small" ? 16 : 20} className="text-text-muted group-hover:text-text-secondary transition-colors" />
                        <span className="text-[10px] text-text-muted group-hover:text-text-secondary transition-colors">Add media</span>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Drop zone indicator */}
            {isDragOver && (
              <div className="absolute inset-4 border-2 border-dashed border-primary rounded-xl flex items-center justify-center bg-primary/5 pointer-events-none z-50 backdrop-blur-sm">
                <div className="text-primary text-sm font-bold bg-background-secondary px-4 py-2 rounded-full shadow-lg">
                  {t("drop_files")}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Text Tab Content */}
      {activeTab === "text" && (
        <ScrollArea className="flex-1">
          <div className="px-3 pt-2 pb-3 space-y-2">
            <button
              onClick={async () => {
                const state = useProjectStore.getState();
                const { createTextClip, addTrack } = state;
                const tracksBefore = state.project.timeline.tracks;
                await addTrack("text", 0);
                const tracksAfter =
                  useProjectStore.getState().project.timeline.tracks;
                const newTextTrack = tracksAfter.find(
                  (t) =>
                    t.type === "text" &&
                    !tracksBefore.some((bt) => bt.id === t.id),
                );
                if (newTextTrack) {
                  createTextClip(newTextTrack.id, 0, "New Title");
                }
              }}
              className="w-full py-4 bg-background-tertiary rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-center"
            >
              <span className="text-lg font-bold text-text-primary">
                Add Title
              </span>
              <p className="text-xs text-text-muted mt-1">
                Click to add text to timeline
              </p>
            </button>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  name: "Heading",
                  text: "Heading",
                  style: {
                    fontSize: 72,
                    fontWeight: 700 as const,
                    textAlign: "center" as const,
                    verticalAlign: "middle" as const,
                  },
                },
                {
                  name: "Subtitle",
                  text: "Subtitle text",
                  style: {
                    fontSize: 36,
                    fontWeight: 400 as const,
                    textAlign: "center" as const,
                    verticalAlign: "middle" as const,
                  },
                },
                {
                  name: "Lower Third",
                  text: "Name Here",
                  style: {
                    fontSize: 32,
                    fontWeight: 600 as const,
                    textAlign: "left" as const,
                    verticalAlign: "bottom" as const,
                    backgroundColor: "rgba(0, 0, 0, 0.7)",
                  },
                },
                {
                  name: "Caption",
                  text: "Caption text here",
                  style: {
                    fontSize: 24,
                    fontWeight: 400 as const,
                    textAlign: "center" as const,
                    verticalAlign: "bottom" as const,
                    shadowColor: "rgba(0, 0, 0, 0.8)",
                    shadowBlur: 4,
                    shadowOffsetX: 1,
                    shadowOffsetY: 1,
                  },
                },
              ].map((preset) => (
                <button
                  key={preset.name}
                  onClick={async () => {
                    const state = useProjectStore.getState();
                    const { createTextClip, addTrack } = state;
                    const tracksBefore = state.project.timeline.tracks;
                    await addTrack("text", 0);
                    const tracksAfter =
                      useProjectStore.getState().project.timeline.tracks;
                    const newTextTrack = tracksAfter.find(
                      (t) =>
                        t.type === "text" &&
                        !tracksBefore.some((bt) => bt.id === t.id),
                    );
                    if (newTextTrack) {
                      createTextClip(
                        newTextTrack.id,
                        0,
                        preset.text,
                        5,
                        preset.style,
                      );
                    }
                  }}
                  className="py-3 bg-background-tertiary rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-xs text-text-secondary hover:text-text-primary"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        </ScrollArea>
      )}

      {/* Transitions Tab Content (CapCut-style) */}
      {activeTab === "transitions" && (
        <ScrollArea className="flex-1">
          <div className="px-3 pb-3">
            <p className="text-[10px] text-text-muted mb-3">
              {t("drag_to_clip_boundary")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {/* V5 cleanup: trimmed to a basic set of 5 universally popular
                  NLE transitions. Wipe & Push were the least-used outliers
                  and went with the V5 trim — Fade / Dip Black / Dip White /
                  Slide / Zoom cover the standard cross-clip transition needs.
                  Each card uses a custom SVG thumbnail showing the actual
                  effect (3 frames: before / mid / after) plus a CSS
                  @keyframes loop on hover so the visualization animates. */}
              {[
                { id: "crossfade", name: "Fade", svg: "fade" as const },
                { id: "dipToBlack", name: "Dip Black", svg: "dipBlack" as const },
                { id: "dipToWhite", name: "Dip White", svg: "dipWhite" as const },
                { id: "slide", name: "Slide", svg: "slide" as const },
                { id: "zoom", name: "Zoom", svg: "zoom" as const },
              ].map((tx) => (
                <button
                  key={tx.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/x-openreel-transition",
                      JSON.stringify({ type: tx.id, duration: 1.0 }),
                    );
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => {
                    // Best-effort apply: select the next pair of clips & apply
                    const selectedIds = useUIStore.getState().getSelectedClipIds();
                    const stateAll = useProjectStore.getState();
                    if (selectedIds.length === 0) {
                      notify.warning(t("no_clips_selected"), t("select_two_adjacent_clips"));
                      return;
                    }
                    // Find selected clip & its next neighbor on same track
                    const targetClip = stateAll.project.timeline.tracks
                      .flatMap((tr) => tr.clips.map((c) => ({ c, trackId: tr.id })))
                      .find((x) => x.c.id === selectedIds[0]);
                    if (!targetClip) return;
                    const trackClips = stateAll.project.timeline.tracks
                      .find((tr) => tr.id === targetClip.trackId)?.clips || [];
                    const sorted = [...trackClips].sort((a, b) => a.startTime - b.startTime);
                    const idx = sorted.findIndex((c) => c.id === targetClip.c.id);
                    const next = sorted[idx + 1];
                    if (!next) {
                      notify.warning(t("no_clips_selected"), t("select_two_adjacent_clips"));
                      return;
                    }
                    const bridge = getTransitionBridge();
                    const result = bridge.createTransition(
                      targetClip.c as never,
                      next as never,
                      tx.id as never,
                      1.0,
                    );
                    if (result.success) notify.success(t("applied_transition"), tx.name);
                    else notify.error("Failed", result.error || "");
                  }}
                  className="group flex flex-col rounded-lg overflow-hidden border border-border hover:border-primary transition-all cursor-pointer"
                  title={`${tx.name} — click to apply between the selected clip and its next neighbor, or drag onto a clip boundary in the timeline`}
                  data-testid={`transition-card-${tx.id}`}
                >
                  <div className="aspect-video bg-background-tertiary relative overflow-hidden">
                    <TransitionThumbnail kind={tx.svg} />
                  </div>
                  <div className="px-2 py-1.5 bg-background-tertiary">
                    <div className="text-[11px] text-text-primary font-medium truncate">
                      {tx.name}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </ScrollArea>
      )}

      {/* Captions Tab Content — AI auto-captioning panel */}
      {activeTab === "captions" && (
        <Suspense fallback={LazyPanelFallback}>
          <CaptionsPanel />
        </Suspense>
      )}

      {aspectRatioDialogData && (
        <AspectRatioMatchDialog
          isOpen={showAspectRatioDialog}
          videoWidth={aspectRatioDialogData.videoWidth}
          videoHeight={aspectRatioDialogData.videoHeight}
          currentWidth={project.settings.width}
          currentHeight={project.settings.height}
          onConfirm={handleConfirmAspectRatioMatch}
          onCancel={handleCancelAspectRatioMatch}
        />
      )}

      {kieaiDialog && (
        <KieAIImageDialog
          open={true}
          onClose={() => setKieaiDialog(null)}
          sourceFile={kieaiDialog.file}
          previewUrl={kieaiDialog.previewUrl}
        />
      )}
    </aside>
  );
};

export default AssetsPanel;
