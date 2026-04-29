/**
 * Floating tool sidebar — left edge, vertical pill of mode buttons.
 *
 * Replaces the old icon-only ToolPalette rail. The new picker for
 * spawning nodes is the right-click context menu (see
 * `CanvasContextMenu`); this sidebar is for *meta* tools — the
 * cursor mode, panning, edge cutting, sticky notes, undo/redo, and
 * settings.
 *
 * Each button toggles `useCanvasToolStore.tool` (or fires a one-off
 * action like undo). The active mode shows a filled background so
 * users can tell at a glance whether their click will select a node
 * or cut a wire.
 *
 * Bar floats absolute over the canvas — `pointer-events-auto` on the
 * pill itself, the surrounding wrapper is transparent so right-click
 * still hits the canvas through the gaps.
 */

import { useEffect, useState } from "react";
import {
  Plus,
  MousePointer2,
  Hand,
  Scissors,
  StickyNote,
  Undo2,
  Redo2,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasToolStore, type CanvasTool } from "./useCanvasToolStore";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

interface Props {
  /** Open the categorised tool picker. Receives the screen position
   *  of the trigger button so the canvas can anchor the picker
   *  directly next to it (Figma's "+" behaviour). The canvas owns
   *  the menu state so we just hand it a callback. */
  onAddNode: (anchor: { x: number; y: number }) => void;
  /** Pop the in-app shortcut help. Same reason — owned by the canvas
   *  / page so this component stays pure. */
  onOpenSettings: () => void;
}

interface ToolButton {
  id: CanvasTool | "add" | "undo" | "redo" | "settings";
  label: string;
  shortcut?: string;
  icon: LucideIcon;
  /** Style flag — solid divider above this button. Used to break the
   *  sidebar into "tools / history / settings" sections. */
  divider?: boolean;
  /** True when the button represents a mode (pressed-state). The
   *  button highlights whenever `tool === id`. */
  isMode?: boolean;
}

const BUTTONS: ToolButton[] = [
  { id: "add", label: "Add node", shortcut: "N", icon: Plus },
  { id: "select", label: "Select", shortcut: "V", icon: MousePointer2, isMode: true, divider: true },
  { id: "hand", label: "Hand (hold Space)", shortcut: "H", icon: Hand, isMode: true },
  { id: "cut", label: "Cut connector", shortcut: "C", icon: Scissors, isMode: true },
  { id: "sticky", label: "Sticky note", shortcut: "S", icon: StickyNote, isMode: true },
  { id: "undo", label: "Undo", shortcut: "Ctrl+Z", icon: Undo2, divider: true },
  { id: "redo", label: "Redo", shortcut: "Ctrl+Shift+Z", icon: Redo2 },
  { id: "settings", label: "Settings & shortcuts", icon: Settings, divider: true },
];

const CanvasFloatingSidebar = ({ onAddNode, onOpenSettings }: Props) => {
  const tool = useCanvasToolStore((s) => s.tool);
  const setTool = useCanvasToolStore((s) => s.setTool);
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);

  /* Spacebar = momentary hand tool.
   *
   * Hold spacebar → push "hand" mode, drag canvas, release → pop
   * back to whatever was active before. This is what every Figma /
   * Krea user expects. We listen at window level with `capture` so
   * the keyup gets through even when an input has focus (otherwise
   * the user would get stuck on hand tool after typing a space in a
   * prompt textarea — frustrating). The `repeat` guard keeps the
   * push from firing every keyboard tick, which would clobber
   * `prevTool`. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      // Don't hijack space when the user is typing into an input,
      // textarea, or contenteditable element — that's text entry,
      // not the canvas hand tool.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable === true
      ) {
        return;
      }
      if (e.repeat) return;
      e.preventDefault();
      useCanvasToolStore.getState().pushTool("hand");
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      useCanvasToolStore.getState().popTool();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, []);

  /* Single-letter mode hotkeys: V / H / C / S.
   *
   * Same input-guard as space — never steal a keystroke from a text
   * field. The hotkeys complement the visible icons; they're not
   * essential, but power users expect them. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable === true
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "v") setTool("select");
      else if (k === "c") setTool("cut");
      else if (k === "s") setTool("sticky");
      // "H" is intentionally omitted — `H` is already the heading
      // shortcut in some textareas; users hold Space for hand-mode.
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTool]);

  const onClick = (b: ToolButton, e: React.MouseEvent<HTMLButtonElement>) => {
    if (b.id === "add") {
      // Anchor the picker JUST to the right of the "+" so it reads
      // as a popover off the trigger, not a free-floating overlay.
      // The picker's own clamping will pull it back if the click
      // happened near the right edge of the viewport.
      const rect = e.currentTarget.getBoundingClientRect();
      onAddNode({ x: rect.right + 8, y: rect.top });
      return;
    }
    if (b.id === "undo") return undo();
    if (b.id === "redo") return redo();
    if (b.id === "settings") return onOpenSettings();
    setTool(b.id);
  };

  return (
    // Wrapper is fixed but transparent — only the pill catches
    // pointer events. Lets right-click pass through to the canvas
    // when the user aims at the gap above/below the pill.
    //
    <div
      className="pointer-events-none fixed left-4 top-1/2 z-40 -translate-y-1/2 lg:left-3"
    >
      <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950/85 p-1 shadow-xl shadow-black/40 backdrop-blur">
        {BUTTONS.map((b, i) => (
          <SidebarButton
            key={b.id}
            button={b}
            isActive={b.isMode && tool === (b.id as CanvasTool)}
            isFirst={i === 0}
            onClick={(e) => onClick(b, e)}
          />
        ))}
      </div>
    </div>
  );
};

/* ── atom ────────────────────────────────────────────────── */

function SidebarButton({
  button,
  isActive,
  isFirst,
  onClick,
}: {
  button: ToolButton;
  isActive: boolean;
  isFirst: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const [showTip, setShowTip] = useState(false);
  const Icon = button.icon;
  return (
    <div className="group relative">
      {button.divider && !isFirst && (
        <div className="my-1 h-px w-6 self-center bg-zinc-800" />
      )}
      <button
        type="button"
        onClick={(e) => onClick(e)}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        aria-label={button.label}
        aria-pressed={button.isMode ? isActive : undefined}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full transition-colors lg:h-9 lg:w-9",
          isActive
            ? "bg-zinc-200 text-zinc-900"
            : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
        )}
      >
        <Icon className="h-4 w-4" />
      </button>
      {showTip && (
        <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded border border-zinc-700 bg-zinc-900/95 px-2 py-1 text-[11px] text-zinc-200 shadow-lg backdrop-blur">
          <span>{button.label}</span>
          {button.shortcut && (
            <span className="ml-2 font-mono text-[9.5px] text-zinc-500">
              {button.shortcut}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default CanvasFloatingSidebar;
