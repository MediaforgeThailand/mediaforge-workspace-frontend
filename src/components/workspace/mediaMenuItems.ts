import { Copy, Download, Eye, FolderOpen, Trash2, type LucideIcon } from "lucide-react";

export interface MediaContextMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
}

/** Action callbacks for the standard 6-row media-asset context menu.
 *  Pass the callbacks the call site supports; omitted ones render as
 *  greyed-out (visible but non-interactive) so the menu has a stable
 *  shape across asset / generation / board surfaces. */
export interface MediaMenuActions {
  onPreview?: () => void;
  onDownload?: () => void;
  onDuplicate?: () => void;
  onMoveToBoard?: () => void;
  onCopyToBoard?: () => void;
  onDelete?: () => void;
}

/** Build the canonical 6-item media menu (preview / download / duplicate /
 *  move-to-board / copy-to-board / delete). Used by every surface that
 *  shows a right-click menu over a media asset or generation tile so
 *  the menu shape stays identical across the workspace. */
export function buildMediaMenuItems(
  t: (key: string) => string,
  actions: MediaMenuActions,
): MediaContextMenuItem[] {
  const noop = () => undefined;
  return [
    {
      key: "preview",
      label: t("workspace.mediaMenu.preview"),
      icon: Eye,
      disabled: !actions.onPreview,
      onSelect: actions.onPreview ?? noop,
    },
    {
      key: "download",
      label: t("workspace.mediaMenu.download"),
      icon: Download,
      disabled: !actions.onDownload,
      onSelect: actions.onDownload ?? noop,
    },
    {
      key: "duplicate",
      label: t("workspace.mediaMenu.duplicate"),
      icon: Copy,
      disabled: !actions.onDuplicate,
      onSelect: actions.onDuplicate ?? noop,
    },
    {
      key: "move-board",
      label: t("workspace.mediaMenu.moveToBoard"),
      icon: FolderOpen,
      separatorBefore: true,
      disabled: !actions.onMoveToBoard,
      onSelect: actions.onMoveToBoard ?? noop,
    },
    {
      key: "copy-board",
      label: t("workspace.mediaMenu.copyToBoard"),
      icon: Copy,
      disabled: !actions.onCopyToBoard,
      onSelect: actions.onCopyToBoard ?? noop,
    },
    {
      key: "delete",
      label: t("workspace.mediaMenu.delete"),
      icon: Trash2,
      separatorBefore: true,
      danger: true,
      disabled: !actions.onDelete,
      onSelect: actions.onDelete ?? noop,
    },
  ];
}
