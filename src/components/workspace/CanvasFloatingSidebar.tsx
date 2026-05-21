import { useEffect, useState } from "react";
import {
  Hand,
  Images,
  Languages,
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
import { useLanguage, type Language } from "@/contexts/LanguageContext";
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
  const { language, setLanguage } = useLanguage();

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
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-40 w-[min(calc(100vw-28px),760px)] -translate-x-1/2">
      <div
        data-testid="board-toolbar"
        className="pointer-events-auto mx-auto flex w-max max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/[0.09] bg-[#0f1010]/92 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.42),0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl"
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
        <LanguageToggleButton
          language={language}
          onToggle={() => setLanguage(language === "th" ? "en" : "th")}
        />
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
    <div className="relative flex items-center">
      {button.divider && !isFirst && <div className="mx-1 h-6 w-px bg-white/10" />}
      <button
        type="button"
        data-testid={`board-tool-${button.id}`}
        onClick={onClick}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        aria-label={label}
        aria-pressed={button.isMode ? isActive : undefined}
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors",
          isActive
            ? "bg-[#e5ff1c] text-zinc-950 shadow-[0_10px_24px_rgba(218,255,34,0.2)]"
            : "text-zinc-300 hover:bg-white/10 hover:text-zinc-50",
        )}
      >
        <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} />
      </button>
      {showTip && (
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-950/95 px-2.5 py-1.5 text-[12px] font-medium text-zinc-100 shadow-lg">
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

function LanguageToggleButton({
  language,
  onToggle,
}: {
  language: Language;
  onToggle: () => void;
}) {
  const [showTip, setShowTip] = useState(false);
  const targetLabel = language === "th" ? "English" : "ภาษาไทย";
  return (
    <div className="relative flex items-center">
      <button
        type="button"
        data-testid="board-tool-language"
        onClick={onToggle}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        aria-label={targetLabel}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-zinc-50"
      >
        <Languages className="h-[17px] w-[17px]" strokeWidth={2.2} />
      </button>
      {showTip && (
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-950/95 px-2.5 py-1.5 text-[12px] font-medium text-zinc-100 shadow-lg">
          {targetLabel}
        </div>
      )}
    </div>
  );
}

export default CanvasFloatingSidebar;
