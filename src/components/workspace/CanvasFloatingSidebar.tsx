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
  Images,
  MousePointer2,
  Hand,
  Scissors,
  StickyNote,
  Undo2,
  Redo2,
  Settings,
  Languages,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasToolStore, type CanvasTool } from "./useCanvasToolStore";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useLanguage } from "@/contexts/LanguageContext";

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

type ToolBtnLabelKey =
  | "workspace.tools.add_node"
  | "workspace.tools.assets"
  | "workspace.tools.select"
  | "workspace.tools.hand"
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
  /** Style flag — solid divider above this button. Used to break the
   *  sidebar into "tools / history / settings" sections. */
  divider?: boolean;
  /** True when the button represents a mode (pressed-state). The
   *  button highlights whenever `tool === id`. */
  isMode?: boolean;
}

const BUTTONS: ToolButton[] = [
  /* Asset library shortcut — sits above the "+" button so it reads
   *  as a one-click way into the user's existing media (uploaded
   *  images, generated outputs, stock). The dialog is owned by
   *  WorkspaceCanvasMediaBridges; we just dispatch the existing
   *  `workspace-open-all-assets` window event the right-click
   *  Media menu already uses. */
  { id: "assets", labelKey: "workspace.tools.assets", icon: Images },
  { id: "add", labelKey: "workspace.tools.add_node", shortcut: "N", icon: Plus },
  { id: "select", labelKey: "workspace.tools.select", shortcut: "V", icon: MousePointer2, isMode: true, divider: true },
  { id: "hand", labelKey: "workspace.tools.hand", shortcut: "H", icon: Hand, isMode: true },
  { id: "cut", labelKey: "workspace.tools.cut_connector", shortcut: "C", icon: Scissors, isMode: true },
  { id: "sticky", labelKey: "workspace.tools.sticky_note", shortcut: "S", icon: StickyNote, isMode: true },
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
    if (b.id === "assets") {
      /* Asset library uses the same window-event bridge as the
       *  right-click Media menu — `WorkspaceCanvasMediaBridges`
       *  listens for `workspace-open-all-assets` and pops the
       *  AllAssetsDialog. Going through the event keeps the dialog
       *  state in one place and avoids prop-drilling another open
       *  callback through Canvas.tsx → CanvasFloatingSidebar. */
      window.dispatchEvent(new CustomEvent("workspace-open-all-assets"));
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
      className="pointer-events-none fixed left-2 top-1/2 z-40 -translate-y-1/2 lg:left-1.5"
    >
      <div className="pointer-events-auto flex flex-col items-center gap-[3px] rounded-full border border-white/[0.08] bg-[#101010]/95 p-[3px] shadow-[0_18px_46px_rgba(0,0,0,0.38),0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-xl">
        {BUTTONS.map((b, i) => (
          <SidebarButton
            key={b.id}
            button={b}
            isActive={b.isMode && tool === (b.id as CanvasTool)}
            isFirst={i === 0}
            onClick={(e) => onClick(b, e)}
          />
        ))}
        {/* Language toggle — sits next to Settings (no divider so the
         *  two icons read as a paired "preferences" cluster). Label
         *  shows the TARGET language in its own script, mirroring how
         *  OS-level language switchers read ("English" while you're
         *  in Thai → tap to go English). */}
        <LanguageToggleButton
          language={language}
          onToggle={() => setLanguage(language === "th" ? "en" : "th")}
        />
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
  const { t } = useLanguage();
  const Icon = button.icon;
  const label = t(button.labelKey);
  return (
    <div className="group relative">
      {button.divider && !isFirst && (
        <div className="my-px h-px w-[24px] self-center bg-white/10" />
      )}
      <button
        type="button"
        onClick={(e) => onClick(e)}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        aria-label={label}
        aria-pressed={button.isMode ? isActive : undefined}
        className={cn(
          "flex h-[43px] w-[43px] items-center justify-center rounded-full transition-colors lg:h-[38px] lg:w-[38px]",
          isActive
            ? "bg-zinc-200 text-zinc-900 shadow-[0_10px_24px_rgba(0,0,0,0.26)]"
            : "text-zinc-300 hover:bg-white/10 hover:text-zinc-50",
        )}
      >
        <Icon className="h-[14.5px] w-[14.5px]" />
      </button>
      {showTip && (
        <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-zinc-900/95 px-2.5 py-1.5 text-[14.5px] text-zinc-200 shadow-lg backdrop-blur">
          <span>{label}</span>
          {button.shortcut && (
            <span className="ml-2 font-mono text-[12.5px] text-zinc-500">
              {button.shortcut}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * LanguageToggleButton — flips between English and Thai.
 *
 * Mirrors the SidebarButton visual but renders a literal target-language
 * label in the tooltip ("English" / "ภาษาไทย") instead of going through
 * t(). That way the user sees the destination language in its own script,
 * which is the universal convention for language switchers.
 */
function LanguageToggleButton({
  language,
  onToggle,
}: {
  language: "en" | "th";
  onToggle: () => void;
}) {
  const [showTip, setShowTip] = useState(false);
  const targetLabel = language === "th" ? "English" : "ภาษาไทย";
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        aria-label={targetLabel}
        className="flex h-[43px] w-[43px] items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-zinc-50 lg:h-[38px] lg:w-[38px]"
      >
        <Languages className="h-[14.5px] w-[14.5px]" />
      </button>
      {showTip && (
        <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-zinc-900/95 px-2.5 py-1.5 text-[14.5px] text-zinc-200 shadow-lg backdrop-blur">
          <span>{targetLabel}</span>
        </div>
      )}
    </div>
  );
}

export default CanvasFloatingSidebar;
