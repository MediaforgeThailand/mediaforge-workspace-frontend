/**
 * WorkspaceCanvasPagePill — floating bottom-left page switcher.
 *
 * Replaces the old top-row WorkspaceTabBar. The pill shows the
 * active page's name + autosave state; clicking it opens a popover
 * (anchored ABOVE the pill) that lists every page in the current
 * workspace with the same rename / delete / new-page affordances
 * the tab bar had.
 *
 * Layout:
 *   - Fixed at bottom-left of the viewport.
 *   - The Compact Tool Palette sits at the LEFT EDGE, vertically
 *     centred, so it doesn't conflict here.
 *   - The mascot lives tucked into `bottom-2 left-2` at 92px wide.
 *     The pill sits just to its right so bottom-left chrome stays
 *     compact instead of spanning a large dead zone.
 *
 * Store wiring is identical to the tab bar — this is a pure visual
 * relocation, not a behaviour change.
 */

import { useEffect, useRef, useState } from "react";
import {
  ChevronUp,
  FolderOpen,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { deleteCanvasFromServer } from "./canvasPersistence";
import SaveStateBadge from "./SaveStateBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import { selectCanMutate, useWorkspaceShareRole } from "@/store/useWorkspaceShareRole";

const WorkspaceCanvasPagePill = () => {
  const { t } = useLanguage();
  /* ── Store wiring (mirrors WorkspaceTabBar) ───────────────── */
  const allCanvases = useWorkspaceStore((s) => s.canvases);
  const currentWorkspaceId = useWorkspaceStore(
    (s) => s.current?.workspaceId ?? null,
  );
  const canvases = allCanvases.filter(
    (c) => c.workspaceId === currentWorkspaceId,
  );
  const currentId = useWorkspaceStore((s) => s.current?.id ?? null);
  const currentMeta = canvases.find((c) => c.id === currentId) ?? null;
  const createCanvas = useWorkspaceStore((s) => s.createCanvas);
  const renameCanvas = useWorkspaceStore((s) => s.renameCanvas);
  const deleteCanvas = useWorkspaceStore((s) => s.deleteCanvas);
  const openCanvasAction = useWorkspaceStore((s) => s.openCanvas);
  const graphs = useWorkspaceStore((s) => s.graphs);
  const canMutate = useWorkspaceShareRole(selectCanMutate);

  /* ── Local UI state ───────────────────────────────────────── */
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  /* ── Actions (verbatim copy of WorkspaceTabBar handlers) ─── */
  const openTab = (id: string) => {
    if (id !== currentId) openCanvasAction(id);
    setOpen(false);
  };

  const newTab = () => {
    if (!canMutate) return;
    const id = createCanvas(currentWorkspaceId ?? undefined);
    openCanvasAction(id);
    setOpen(false);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!canMutate) return;

    // Confirm-on-dirty: warn before discarding a tab that has nodes.
    const graph = graphs[id];
    const hasContent = (graph?.nodes?.length ?? 0) > 0;
    if (hasContent) {
      const ok = confirm(
        t("workspace.pill.close_prompt", {
          name: graph?.name ?? t("workspace.pill.tab_fallback"),
          count: graph?.nodes?.length ?? 0,
        }),
      );
      if (!ok) return;
    }

    // Where to land after deletion: the next page to the right, else
    // the previous, else create a fresh one so we never end up in a
    // no-pages state.
    const idx = canvases.findIndex((c) => c.id === id);
    let landingId: string | null = null;
    if (canvases.length > 1) {
      landingId = (canvases[idx + 1] ?? canvases[idx - 1])?.id ?? null;
    }

    deleteCanvas(id);
    void deleteCanvasFromServer(id);

    if (id === currentId) {
      if (landingId) {
        openCanvasAction(landingId);
      } else {
        const fresh = createCanvas(currentWorkspaceId ?? undefined);
        openCanvasAction(fresh);
      }
    }
  };

  const startRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canMutate) return;
    setEditingId(id);
    setEditValue(currentName);
  };

  const commitRename = (id: string) => {
    const trimmed = editValue.trim();
    if (trimmed) renameCanvas(id, trimmed);
    setEditingId(null);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditValue("");
  };

  /* ── Render ───────────────────────────────────────────────── */
  const activeName = currentMeta?.name ?? t("workspace.pill.untitled");
  const totalPages = canvases.length;

  return (
    <div
      className="fixed bottom-4 left-[116px] z-50"
      style={{
        fontFamily: "var(--font-sans)",
      }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("workspace.pill.aria_switch", { name: activeName })}
            className={cn(
              "group flex h-11 items-center gap-2 rounded-full bg-zinc-900/85 px-4 text-[12px] text-zinc-100 shadow-lg shadow-black/40 backdrop-blur transition-all lg:h-9 lg:px-3",
              "hover:-translate-y-0.5 hover:bg-zinc-800/90 hover:shadow-xl",
              open &&
                "bg-zinc-800/90 -translate-y-0.5 shadow-xl",
            )}
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
            <span className="max-w-[140px] truncate">{activeName}</span>

            {/* Page-count hint when there's more than one page so the
             *  user knows there's something to open. */}
            {totalPages > 1 && (
              <span
                className={cn(
                  "shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-zinc-300",
                )}
                aria-label={t("workspace.pill.aria_count", { count: totalPages })}
              >
                {totalPages}
              </span>
            )}

            {/* Autosave status — slipped INSIDE the pill at the
             *  right edge so the user always sees the status at a
             *  glance without it competing for attention. */}
            <SaveStateBadge variant="inline" className="ml-1" />

            <ChevronUp
              className={cn(
                "h-3 w-3 shrink-0 text-zinc-400 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className={cn(
            "w-72 border-zinc-800 bg-zinc-950/95 p-1 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur lg:w-64",
            "animate-in fade-in-0 slide-in-from-bottom-2 duration-150",
          )}
        >
          <div className="px-2 pb-1 pt-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
            {t("workspace.pill.pages_in_workspace")}
          </div>

          {/* Page list — scrolls if there are many pages. */}
          <div className="max-h-[min(320px,calc(100vh-9rem))] overflow-y-auto lg:max-h-[240px]">
            {canvases.map((c) => {
              const isActive = c.id === currentId;
              const isEditing = editingId === c.id;
              const graph = graphs[c.id];
              const nodeCount = graph?.nodes?.length ?? 0;
              return (
                <div
                  key={c.id}
                  data-tab-id={c.id}
                  onClick={() => !isEditing && openTab(c.id)}
                  onDoubleClick={(e) => canMutate && startRename(c.id, c.name, e)}
                  className={cn(
                    "group relative flex min-h-11 cursor-pointer items-center gap-1.5 rounded px-2 text-[12px] transition-colors lg:min-h-8",
                    isActive
                      ? "bg-white/10 text-zinc-50"
                      : "text-zinc-300 hover:bg-white/5 hover:text-zinc-100",
                  )}
                  title={
                    isEditing
                      ? undefined
                      : t("workspace.pill.item_title", { name: c.name, count: nodeCount })
                  }
                >
                  <FolderOpen
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      isActive ? "text-zinc-200" : "text-zinc-500",
                    )}
                  />

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
                      className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-100 outline-none"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  )}

                  {/* Node count badge — always visible, dimmed. */}
                  {nodeCount > 0 && !isEditing && (
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[9px] tabular-nums",
                        isActive ? "text-zinc-400" : "text-zinc-600",
                      )}
                      title={t("workspace.pill.node_count", { count: nodeCount })}
                    >
                      {nodeCount}
                    </span>
                  )}

                  {/* Hover affordances — rename + close. */}
                  {!isEditing && canMutate && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => startRename(c.id, c.name, e)}
                        className="flex h-9 w-9 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 lg:h-auto lg:w-auto lg:p-1"
                        title={t("workspace.pill.rename")}
                        aria-label={t("workspace.pill.rename")}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => closeTab(c.id, e)}
                        className="flex h-9 w-9 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-rose-300 lg:h-auto lg:w-auto lg:p-1"
                        title={t("workspace.pill.delete")}
                        aria-label={t("workspace.pill.delete")}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer — new page button. */}
          {canMutate && <div className="mt-1 pt-1">
            <button
              type="button"
              onClick={newTab}
              className="flex h-11 w-full items-center gap-1.5 rounded px-2 text-[12px] text-zinc-300 transition-colors hover:bg-white/5 hover:text-zinc-100 lg:h-8"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("workspace.pill.new_page")}
            </button>
          </div>}
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default WorkspaceCanvasPagePill;
