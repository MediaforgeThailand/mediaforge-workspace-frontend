/**
 * In-app shortcut reference dialog.
 *
 * Pops over the canvas (full-screen modal) without navigating away.
 * Lists every keybind the workspace responds to, grouped so the user
 * doesn't have to scan a flat list of 30 entries. Activation comes
 * from the floating sidebar's Settings button.
 *
 * Authoring rule: keep this list in sync with the actual handlers in
 * `useWorkspaceShortcuts`, `CanvasFloatingSidebar`, and the canvas's
 * native React-Flow shortcuts. If a binding changes, edit it here too
 * — the dialog is the user-facing source of truth.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShortcutSpec {
  /** Human-readable description. */
  label: string;
  /** Keys, in display order. Use "+" to combine. */
  keys: string[];
}
interface ShortcutGroup {
  title: string;
  items: ShortcutSpec[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: "Tools",
    items: [
      { label: "Select / cursor", keys: ["V"] },
      { label: "Hand (pan canvas) — momentary", keys: ["Hold Space"] },
      { label: "Cut connector", keys: ["C"] },
      { label: "Sticky note", keys: ["S"] },
      { label: "Add node picker", keys: ["N"] },
    ],
  },
  {
    title: "Canvas",
    items: [
      { label: "Open right-click tool menu", keys: ["Right-click"] },
      { label: "Multi-select with box drag", keys: ["Drag"] },
      { label: "Add to selection", keys: ["Shift", "Click"] },
      { label: "Pan with middle / right mouse drag", keys: ["Drag"] },
      { label: "Zoom", keys: ["Ctrl", "Wheel"] },
    ],
  },
  {
    title: "Edit",
    items: [
      { label: "Undo", keys: ["Ctrl", "Z"] },
      { label: "Redo", keys: ["Ctrl", "Shift", "Z"] },
      { label: "Copy", keys: ["Ctrl", "C"] },
      { label: "Cut", keys: ["Ctrl", "X"] },
      { label: "Paste", keys: ["Ctrl", "V"] },
      { label: "Duplicate", keys: ["Ctrl", "D"] },
      { label: "Delete selected", keys: ["Del"] },
      { label: "Select all", keys: ["Ctrl", "A"] },
    ],
  },
  {
    title: "Run & inspect",
    items: [
      { label: "Run selected node", keys: ["Ctrl", "Enter"] },
      { label: "Open preview lightbox", keys: ["A"] },
      { label: "Flip to next / previous generation", keys: ["←", "→"] },
      { label: "Close dialog / cancel", keys: ["Esc"] },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

const ShortcutsDialog = ({ open, onClose }: Props) => {
  // Esc closes (capture so the canvas's own Esc binding doesn't
  // race us).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex max-h-[86vh] w-[min(720px,90vw)] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <Keyboard className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-100">
            Settings · Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — two-column grid on wide, stacks on narrow. */}
        <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-4 overflow-y-auto p-5 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
                {g.title}
              </h3>
              <ul className="space-y-1.5">
                {g.items.map((it) => (
                  <li
                    key={it.label}
                    className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-[12.5px] text-zinc-200 odd:bg-zinc-900/40"
                  >
                    <span className="truncate">{it.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {it.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <Kbd k={k} />
                          {i < it.keys.length - 1 && (
                            <span className="text-zinc-600">+</span>
                          )}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="border-t border-zinc-800 px-4 py-2 text-[11px] text-zinc-500">
          Tip: shortcuts only fire while the canvas has focus — clicks
          on a text input release the bindings until you click back on
          the canvas.
        </div>
      </div>
    </div>,
    document.body,
  );
};

const Kbd = ({ k }: { k: string }) => (
  <kbd
    className={cn(
      "inline-flex min-w-[1.5rem] items-center justify-center rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-zinc-200 shadow-[inset_0_-1px_0_hsl(0_0%_0%/0.4)]",
    )}
  >
    {k}
  </kbd>
);

export default ShortcutsDialog;
