/**
 * Workspace Tab Bar — Photoshop / Figma-style document tabs.
 *
 * Each tab is one Canvas (existing concept in `useWorkspaceStore`):
 * the store's `canvases[]` list IS the tab list, and the active tab
 * is whatever `current.id` points at. Clicking a tab navigates to
 * `/app/workspace/:id` which Canvas.tsx wires through to
 * `openCanvas(id)` — no extra state to invalidate.
 *
 * Asset library + Element library are user-scoped (Supabase RLS, not
 * canvas-scoped) so they're shared across every tab automatically —
 * the user just sees the same assets in the right panel regardless
 * of which tab is active. Same goes for the AI assistant chat.
 *
 * Interactions:
 *   • Click tab        → switch
 *   • Double-click tab → rename inline (Enter saves, Esc cancels)
 *   • × on hover       → close tab (with confirm-on-dirty check)
 *   • + at end         → create new "Untitled" tab and switch to it
 *   • Drag to reorder  → MVP doesn't ship this; backlog.
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Plus, X, Check, CloudOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import type { SaveState } from "./useCanvasAutosave";

const TAB_MIN_W = 120;
const TAB_MAX_W = 200;

const WorkspaceTabBar = () => {
  // CRITICAL — `canvases` was the FLAT, top-level list (which surfaced
  // every tab as its own row on the dashboard, the bug the user
  // reported). After the v2 schema split, tabs live under workspaces;
  // this bar shows ONLY the tabs that belong to the workspace the
  // currently-open canvas is in. Switching workspaces happens via the
  // dashboard, not by clicking a tab.
  const allCanvases = useWorkspaceStore((s) => s.canvases);
  const currentWorkspaceId = useWorkspaceStore(
    (s) => s.current?.workspaceId ?? null,
  );
  const canvases = allCanvases.filter(
    (c) => c.workspaceId === currentWorkspaceId,
  );
  const currentId = useWorkspaceStore((s) => s.current?.id ?? null);
  const createCanvas = useWorkspaceStore((s) => s.createCanvas);
  const renameCanvas = useWorkspaceStore((s) => s.renameCanvas);
  const deleteCanvas = useWorkspaceStore((s) => s.deleteCanvas);
  const graphs = useWorkspaceStore((s) => s.graphs);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tabsScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active tab into view when switching tabs externally
  // (e.g. via URL navigation or keyboard shortcut).
  useEffect(() => {
    if (!currentId || !tabsScrollRef.current) return;
    const el = tabsScrollRef.current.querySelector<HTMLElement>(
      `[data-tab-id="${currentId}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [currentId]);

  /* ── Tab actions ────────────────────────────────────────────
   *
   * URL stays constant at `/app/workspace/:workspaceId` — the
   * active tab lives in the store as `current.id`, NOT in the URL.
   * Switching / creating / deleting tabs only nudges store state;
   * navigate() is reserved for actual workspace switches (which
   * the user does via the dashboard, not this bar). */
  const openCanvasAction = useWorkspaceStore((s) => s.openCanvas);
  const openTab = (id: string) => {
    if (id === currentId) return;
    openCanvasAction(id);
  };

  const newTab = () => {
    // Scope the new tab to the workspace this bar is currently
    // showing. Without an explicit workspaceId, createCanvas would
    // fall back to the most-recent workspace which usually matches
    // but isn't guaranteed when the user has many workspaces open.
    const id = createCanvas(currentWorkspaceId ?? undefined);
    openCanvasAction(id);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // Confirm-on-dirty: warn before discarding a tab that has nodes.
    // Empty tabs close silently. Keeps the keyboard-spam case fast
    // while protecting actual work.
    const graph = graphs[id];
    const hasContent = (graph?.nodes?.length ?? 0) > 0;
    if (hasContent) {
      const ok = confirm(
        `Close "${graph?.name ?? "tab"}"? ` +
          `It has ${graph?.nodes?.length} node(s) — they'll be deleted.`,
      );
      if (!ok) return;
    }

    // Where to land after deletion: the next tab to the right, else
    // the previous, else create a fresh "Untitled" so we never end
    // up in a no-tabs state (which would trigger a back-to-dashboard
    // bounce).
    const idx = canvases.findIndex((c) => c.id === id);
    let landingId: string | null = null;
    if (canvases.length > 1) {
      landingId = (canvases[idx + 1] ?? canvases[idx - 1])?.id ?? null;
    }

    deleteCanvas(id);

    if (id === currentId) {
      if (landingId) {
        openCanvasAction(landingId);
      } else {
        // Closing the LAST tab in this workspace — auto-spawn a fresh
        // tab in the SAME workspace so the bar isn't empty.
        const fresh = createCanvas(currentWorkspaceId ?? undefined);
        openCanvasAction(fresh);
      }
    }
  };

  const startRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditValue(currentName);
    // useEffect below focuses the input after it mounts.
  };

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const commitRename = (id: string) => {
    const trimmed = editValue.trim();
    if (trimmed) renameCanvas(id, trimmed);
    setEditingId(null);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditValue("");
  };

  /* ── Render ─────────────────────────────────────────────── */
  // Don't render the bar if the user only has one canvas AND that
  // canvas is empty — keeps the wireframe clean for first-time users.
  // Once they create a 2nd tab or start working, the bar appears.
  // Actually — always render so the "+ new tab" button is reachable;
  // the empty-state argument is weaker than the "always-discoverable"
  // argument. Leave the toggle out.

  return (
    // Header — minimal, cleaner. We dropped the heavy zinc-900 strip
    // for a transparent bar that lets the canvas tone show through;
    // the only visible separator is a hairline at the bottom. Tabs
    // are softer pills that don't try to look like document tabs
    // (the old "skeuomorphic" rounded-t-md card stack felt dated).
    <div
      className="flex h-11 shrink-0 items-center gap-1 bg-zinc-950/70 pl-2 pr-2 backdrop-blur-sm"
      style={{ fontFamily: "'Prompt', system-ui, sans-serif" }}
    >
      {/* Back to dashboard — minimal pill rather than a chrome-style
       *  link. */}
      <Link
        to="/app/workspace"
        className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11.5px] text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
        title="Back to workspaces"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back
      </Link>

      <div className="mx-1 h-4 w-px bg-white/10" />

      <div
        ref={tabsScrollRef}
        className="ws-tabs-scroll flex flex-1 items-end gap-0.5 overflow-x-auto pb-px"
      >
        {canvases.map((c) => {
          const isActive = c.id === currentId;
          const isEditing = editingId === c.id;
          const graph = graphs[c.id];
          const nodeCount = graph?.nodes?.length ?? 0;
          return (
            <div
              key={c.id}
              data-tab-id={c.id}
              onClick={() => openTab(c.id)}
              onDoubleClick={(e) => startRename(c.id, c.name, e)}
              className={cn(
                "group relative flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[11.5px] transition-colors",
                isActive
                  ? "bg-white/10 text-zinc-50 shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.05)]"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
              )}
              style={{ minWidth: TAB_MIN_W, maxWidth: TAB_MAX_W }}
              title={
                isEditing
                  ? undefined
                  : `${c.name}\nDouble-click to rename · ${nodeCount} node(s)`
              }
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => commitRename(c.id)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") commitRename(c.id);
                    else if (e.key === "Escape") cancelRename();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  className="min-w-0 flex-1 bg-transparent text-[11px] text-zinc-100 outline-none"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
              )}

              {nodeCount > 0 && !isEditing && (
                <span
                  className={cn(
                    "shrink-0 font-mono text-[9px] tabular-nums",
                    isActive ? "text-zinc-500" : "text-zinc-600",
                  )}
                >
                  {nodeCount}
                </span>
              )}

              {/* Close — show on hover OR when active. */}
              <button
                type="button"
                onClick={(e) => closeTab(c.id, e)}
                className={cn(
                  "shrink-0 rounded p-0.5 transition-opacity",
                  isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100",
                  "hover:bg-zinc-800 hover:text-rose-300",
                )}
                title="Close tab"
                aria-label="Close tab"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={newTab}
        className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11.5px] text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
        title="New tab (creates a new canvas)"
        aria-label="New tab"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      {/* Autosave indicator — small badge that flashes "Saving…" /
       *  "Saved" so the user has the same Figma-style confidence
       *  that nothing's lost on tab close. */}
      <SaveStateBadge />
    </div>
  );
};

/* ── Atom: autosave indicator ──────────────────────────────────
 *
 * `useCanvasAutosave` lives inside the React Flow tree (canvas
 * surface) but the badge belongs up here. We bridge the two with
 * a window event ("workspace-save-state") so the canvas hook can
 * push state without forcing the tab bar to mount inside a flow
 * provider. */
function SaveStateBadge() {
  const [state, setState] = useState<SaveState>("idle");
  useEffect(() => {
    const onState = (e: Event) => {
      const detail = (e as CustomEvent<{ state: SaveState }>).detail;
      if (detail?.state) setState(detail.state);
    };
    window.addEventListener("workspace-save-state", onState as EventListener);
    return () =>
      window.removeEventListener(
        "workspace-save-state",
        onState as EventListener,
      );
  }, []);

  const config: Record<
    SaveState,
    { label: string; icon: React.ComponentType<{ className?: string }>; color: string } | null
  > = {
    idle: null,
    guest: null,
    saving: {
      label: "Saving…",
      icon: Loader2,
      color: "text-amber-300",
    },
    saved: {
      label: "Saved",
      icon: Check,
      color: "text-emerald-300",
    },
    error: {
      label: "Save failed — retry on next change",
      icon: CloudOff,
      color: "text-rose-300",
    },
    tableMissing: {
      label: "Local-only (apply migration to enable cloud autosave)",
      icon: CloudOff,
      color: "text-amber-300/80",
    },
  };
  const c = config[state];
  if (!c) return null;
  const Icon = c.icon;
  return (
    <div
      className={cn(
        "ml-2 mb-1 flex h-6 shrink-0 items-center gap-1 rounded px-2 text-[10.5px]",
        c.color,
      )}
      title={c.label}
    >
      <Icon
        className={cn(
          "h-3 w-3",
          state === "saving" && "animate-spin",
        )}
      />
      {c.label}
    </div>
  );
}

export default WorkspaceTabBar;
