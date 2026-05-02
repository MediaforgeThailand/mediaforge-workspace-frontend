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
import { useLanguage } from "@/contexts/LanguageContext";

type ScLabelKey =
  | "workspace.shortcuts.select"
  | "workspace.shortcuts.hand_momentary"
  | "workspace.shortcuts.cut_connector"
  | "workspace.shortcuts.sticky"
  | "workspace.shortcuts.add_node_picker"
  | "workspace.shortcuts.right_click_menu"
  | "workspace.shortcuts.multi_select"
  | "workspace.shortcuts.add_to_selection"
  | "workspace.shortcuts.pan"
  | "workspace.shortcuts.zoom"
  | "workspace.shortcuts.undo"
  | "workspace.shortcuts.redo"
  | "workspace.shortcuts.copy"
  | "workspace.shortcuts.cut"
  | "workspace.shortcuts.paste"
  | "workspace.shortcuts.duplicate"
  | "workspace.shortcuts.delete"
  | "workspace.shortcuts.select_all"
  | "workspace.shortcuts.run_node"
  | "workspace.shortcuts.open_lightbox"
  | "workspace.shortcuts.flip_gen"
  | "workspace.shortcuts.close_dialog";

type ScKeyKey =
  | "workspace.shortcuts.key_hold_space"
  | "workspace.shortcuts.key_right_click"
  | "workspace.shortcuts.key_drag"
  | "workspace.shortcuts.key_click"
  | "workspace.shortcuts.key_wheel";

/** Each "key" entry is either a literal string (rendered as-is) or a
 *  translation key — we discriminate at render time. */
type Key = string | { tk: ScKeyKey };

interface ShortcutSpec {
  labelKey: ScLabelKey;
  keys: Key[];
}
interface ShortcutGroup {
  titleKey:
    | "workspace.shortcuts.group_tools"
    | "workspace.shortcuts.group_canvas"
    | "workspace.shortcuts.group_edit"
    | "workspace.shortcuts.group_run_inspect";
  items: ShortcutSpec[];
}

const GROUPS: ShortcutGroup[] = [
  {
    titleKey: "workspace.shortcuts.group_tools",
    items: [
      { labelKey: "workspace.shortcuts.select", keys: ["V"] },
      { labelKey: "workspace.shortcuts.hand_momentary", keys: [{ tk: "workspace.shortcuts.key_hold_space" }] },
      { labelKey: "workspace.shortcuts.cut_connector", keys: ["C"] },
      { labelKey: "workspace.shortcuts.sticky", keys: ["S"] },
      { labelKey: "workspace.shortcuts.add_node_picker", keys: ["N"] },
    ],
  },
  {
    titleKey: "workspace.shortcuts.group_canvas",
    items: [
      { labelKey: "workspace.shortcuts.right_click_menu", keys: [{ tk: "workspace.shortcuts.key_right_click" }] },
      { labelKey: "workspace.shortcuts.multi_select", keys: [{ tk: "workspace.shortcuts.key_drag" }] },
      { labelKey: "workspace.shortcuts.add_to_selection", keys: ["Shift", { tk: "workspace.shortcuts.key_click" }] },
      { labelKey: "workspace.shortcuts.pan", keys: [{ tk: "workspace.shortcuts.key_drag" }] },
      { labelKey: "workspace.shortcuts.zoom", keys: ["Ctrl", { tk: "workspace.shortcuts.key_wheel" }] },
    ],
  },
  {
    titleKey: "workspace.shortcuts.group_edit",
    items: [
      { labelKey: "workspace.shortcuts.undo", keys: ["Ctrl", "Z"] },
      { labelKey: "workspace.shortcuts.redo", keys: ["Ctrl", "Shift", "Z"] },
      { labelKey: "workspace.shortcuts.copy", keys: ["Ctrl", "C"] },
      { labelKey: "workspace.shortcuts.cut", keys: ["Ctrl", "X"] },
      { labelKey: "workspace.shortcuts.paste", keys: ["Ctrl", "V"] },
      { labelKey: "workspace.shortcuts.duplicate", keys: ["Ctrl", "D"] },
      { labelKey: "workspace.shortcuts.delete", keys: ["Del"] },
      { labelKey: "workspace.shortcuts.select_all", keys: ["Ctrl", "A"] },
    ],
  },
  {
    titleKey: "workspace.shortcuts.group_run_inspect",
    items: [
      { labelKey: "workspace.shortcuts.run_node", keys: ["Ctrl", "Enter"] },
      { labelKey: "workspace.shortcuts.open_lightbox", keys: ["A"] },
      { labelKey: "workspace.shortcuts.flip_gen", keys: ["←", "→"] },
      { labelKey: "workspace.shortcuts.close_dialog", keys: ["Esc"] },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

const ShortcutsDialog = ({ open, onClose }: Props) => {
  const { t } = useLanguage();
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
        className="relative flex max-h-[86vh] w-[min(720px,90vw)] flex-col overflow-hidden rounded-xl bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3">
          <Keyboard className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-100">
            {t("workspace.shortcuts.heading")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            title={t("workspace.assets_dialog.close_esc")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — two-column grid on wide, stacks on narrow. */}
        <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-4 overflow-y-auto p-5 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.titleKey}>
              <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
                {t(g.titleKey)}
              </h3>
              <ul className="space-y-1.5">
                {g.items.map((it) => (
                  <li
                    key={it.labelKey}
                    className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-[12.5px] text-zinc-200 odd:bg-zinc-900/40"
                  >
                    <span className="truncate">{t(it.labelKey)}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {it.keys.map((k, i) => {
                        const display = typeof k === "string" ? k : t(k.tk);
                        return (
                          <span key={i} className="flex items-center gap-1">
                            <Kbd k={display} />
                            {i < it.keys.length - 1 && (
                              <span className="text-zinc-600">+</span>
                            )}
                          </span>
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="border-t border-zinc-800 px-4 py-2 text-[11px] text-zinc-500">
          {t("workspace.shortcuts.tip")}
        </div>
      </div>
    </div>,
    document.body,
  );
};

const Kbd = ({ k }: { k: string }) => (
  <kbd
    className={cn(
      "inline-flex min-w-[1.5rem] items-center justify-center rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-zinc-200 shadow-[inset_0_-1px_0_hsl(0_0%_0%/0.4)]",
    )}
  >
    {k}
  </kbd>
);

export default ShortcutsDialog;
