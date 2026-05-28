import { useEffect, useState } from "react";
import {
  Hand,
  Images,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Scissors,
  Settings,
  StickyNote,
  Type,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useCanvasToolStore, type CanvasTool } from "./useCanvasToolStore";

interface Props {
  onAddNode: (anchor: { x: number; y: number }) => void;
  onOpenSettings: () => void;
}

type ToolBtnLabelKey =
  | "workspace.tools.add_node"
  | "workspace.tools.assets"
  | "workspace.tools.select"
  | "workspace.tools.hand"
  | "workspace.tools.pen"
  | "workspace.tools.text_note"
  | "workspace.tools.cut_connector"
  | "workspace.tools.sticky_note"
  | "workspace.tools.undo"
  | "workspace.tools.redo"
  | "workspace.tools.settings_shortcuts";

interface ToolButton {
  id: CanvasTool | "add" | "assets" | "undo" | "redo" | "settings";
  labelKey: ToolBtnLabelKey;
  shortcut?: string;
  icon: LucideIcon;
  divider?: boolean;
  isMode?: boolean;
}

const BUTTONS: ToolButton[] = [
  { id: "assets", labelKey: "workspace.tools.assets", icon: Images },
  { id: "add", labelKey: "workspace.tools.add_node", shortcut: "N", icon: Plus },
  { id: "select", labelKey: "workspace.tools.select", shortcut: "V", icon: MousePointer2, isMode: true, divider: true },
  { id: "hand", labelKey: "workspace.tools.hand", shortcut: "Space", icon: Hand, isMode: true },
  { id: "pen", labelKey: "workspace.tools.pen", shortcut: "P", icon: Pencil, isMode: true },
  { id: "text", labelKey: "workspace.tools.text_note", shortcut: "T", icon: Type, isMode: true },
  { id: "sticky", labelKey: "workspace.tools.sticky_note", shortcut: "S", icon: StickyNote, isMode: true },
  { id: "cut", labelKey: "workspace.tools.cut_connector", shortcut: "C", icon: Scissors, isMode: true },
  { id: "undo", labelKey: "workspace.tools.undo", shortcut: "Ctrl+Z", icon: Undo2, divider: true },
  { id: "redo", labelKey: "workspace.tools.redo", shortcut: "Ctrl+Shift+Z", icon: Redo2 },
  { id: "settings", labelKey: "workspace.tools.settings_shortcuts", icon: Settings, divider: true },
];

const CanvasFloatingSidebar = ({ onAddNode, onOpenSettings }: Props) => {
  const tool = useCanvasToolStore((s) => s.tool);
  const setTool = useCanvasToolStore((s) => s.setTool);
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (event.repeat) return;
      event.preventDefault();
      useCanvasToolStore.getState().pushTool("hand");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      useCanvasToolStore.getState().popTool();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "v") setTool("select");
      else if (key === "c") setTool("cut");
      else if (key === "p") setTool("pen");
      else if (key === "t") setTool("text");
      else if (key === "s") setTool("sticky");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTool]);

  const onClick = (button: ToolButton, event: React.MouseEvent<HTMLButtonElement>) => {
    if (button.id === "add") {
      const rect = event.currentTarget.getBoundingClientRect();
      onAddNode({ x: rect.left, y: rect.top - 10 });
      return;
    }
    if (button.id === "assets") {
      window.dispatchEvent(new CustomEvent("workspace-open-all-assets"));
      return;
    }
    if (button.id === "undo") return undo();
    if (button.id === "redo") return redo();
    if (button.id === "settings") return onOpenSettings();
    setTool(button.id);
  };

  return (
    <div className="pointer-events-none fixed left-[58px] top-1/2 z-40 -translate-y-1/2">
      <div
        data-testid="board-toolbar"
        className="pointer-events-auto flex max-h-[calc(100vh-32px)] w-[38px] flex-col items-center gap-[3px] overflow-y-auto rounded-[15px] border border-white/[0.11] bg-[#2a2b2c]/94 p-[5px] shadow-[0_14px_32px_rgba(0,0,0,0.34),0_0_0_1px_rgba(255,255,255,0.035)] backdrop-blur-xl"
      >
        {BUTTONS.map((button, index) => (
          <ToolbarButton
            key={button.id}
            button={button}
            isActive={button.isMode && tool === (button.id as CanvasTool)}
            isFirst={index === 0}
            onClick={(event) => onClick(button, event)}
          />
        ))}
      </div>
    </div>
  );
};

function ToolbarButton({
  button,
  isActive,
  isFirst,
  onClick,
}: {
  button: ToolButton;
  isActive: boolean;
  isFirst: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const [showTip, setShowTip] = useState(false);
  const { t } = useLanguage();
  const Icon = button.icon;
  const label = t(button.labelKey);
  return (
    <div className="relative flex flex-col items-center">
      {button.divider && !isFirst && <div className="my-[3px] h-px w-[24px] bg-white/[0.14]" />}
      <button
        type="button"
        data-testid={`board-tool-${button.id}`}
        onClick={onClick}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        aria-label={label}
        aria-pressed={button.isMode ? isActive : undefined}
        className={cn(
          "grid h-[28px] w-[28px] shrink-0 place-items-center rounded-[7px] transition-colors",
          isActive
            ? "bg-[#e8ff12] text-zinc-950 shadow-[0_0_16px_rgba(232,255,18,0.22)]"
            : "text-zinc-300 hover:bg-white/[0.12] hover:text-zinc-50",
        )}
      >
        <Icon className="h-[15px] w-[15px]" strokeWidth={2.15} />
      </button>
      {showTip && (
        <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-[7px] border border-white/[0.08] bg-zinc-950/95 px-2.5 py-1.5 text-[12px] font-medium text-zinc-100 shadow-lg">
          <span>{label}</span>
          {button.shortcut && (
            <span className="ml-2 font-mono text-[10px] text-zinc-500">
              {button.shortcut}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default CanvasFloatingSidebar;
