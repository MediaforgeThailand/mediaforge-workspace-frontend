/**
 * Workspace dashboard — top-level Workspaces.
 *
 * Each "workspace" is a project that owns 1+ canvas tabs. Clicking
 * "Open" navigates to the most-recently-updated canvas in that
 * workspace; from there the tab bar handles intra-workspace nav.
 *
 * Wireframe: local Zustand only, no backend list query yet.
 * "+ New workspace" creates a workspace seeded with one empty
 * canvas and routes to the editor. Refreshing the page persists
 * via Zustand's localStorage middleware (key `mf-workspace-v1`).
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Layers, Trash2 } from "lucide-react";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

const WorkspaceDashboard = () => {
  const navigate = useNavigate();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const canvases = useWorkspaceStore((s) => s.canvases);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
  const [name, setName] = useState("");

  const handleCreate = () => {
    const { canvasId } = createWorkspace(name.trim() || "Untitled workspace");
    setName("");
    navigate(`/app/workspace/${canvasId}`);
  };

  /** "Open" — pick the most recent canvas in the workspace. If for
   *  some reason it has no canvases (shouldn't happen but be defensive),
   *  spin one up first. */
  const handleOpen = (workspaceId: string) => {
    const tabs = canvases
      .filter((c) => c.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (tabs.length === 0) {
      // Workspace exists but no canvases — bootstrap one.
      const newCanvasId = useWorkspaceStore
        .getState()
        .createCanvas(workspaceId);
      navigate(`/app/workspace/${newCanvasId}`);
      return;
    }
    navigate(`/app/workspace/${tabs[0].id}`);
  };

  const handleDelete = (workspaceId: string, displayName: string) => {
    const tabCount = canvases.filter((c) => c.workspaceId === workspaceId)
      .length;
    const ok = confirm(
      tabCount > 0
        ? `Delete "${displayName}" and its ${tabCount} canvas tab${tabCount === 1 ? "" : "s"}? This can't be undone.`
        : `Delete "${displayName}"?`,
    );
    if (!ok) return;
    deleteWorkspace(workspaceId);
  };

  // Most-recently-updated first.
  const sortedWorkspaces = [...workspaces].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 text-zinc-100">
      <div className="mb-6 flex items-center gap-2">
        <Layers className="h-6 w-6 text-zinc-300" />
        <h1 className="text-2xl font-semibold">Workspace</h1>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-zinc-400">
        A sandbox for chaining AI tools together. Each workspace can hold
        multiple canvas tabs that share the same asset library — drag
        tools from the palette, connect them, and run.
      </p>

      {/* Create */}
      <div className="mb-6 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New workspace name…"
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
        />
        <button
          type="button"
          onClick={handleCreate}
          className="flex items-center gap-1 rounded bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
        >
          <Plus className="h-4 w-4" /> New workspace
        </button>
      </div>

      {/* List */}
      {sortedWorkspaces.length === 0 ? (
        <div className="rounded border border-dashed border-zinc-800 bg-zinc-950 px-6 py-12 text-center text-sm text-zinc-500">
          No workspaces yet. Create your first one above.
        </div>
      ) : (
        <ul className="space-y-2">
          {sortedWorkspaces.map((ws) => {
            const tabs = canvases.filter((c) => c.workspaceId === ws.id);
            return (
              <li
                key={ws.id}
                className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900 px-3 py-2 hover:border-zinc-600"
              >
                <button
                  type="button"
                  onClick={() => handleOpen(ws.id)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <Layers className="h-4 w-4 shrink-0 text-zinc-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {ws.name}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {tabs.length} tab{tabs.length === 1 ? "" : "s"} ·
                      Updated {new Date(ws.updatedAt).toLocaleString()}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newName = prompt(
                      "Rename workspace:",
                      ws.name,
                    );
                    if (newName?.trim() && newName.trim() !== ws.name) {
                      renameWorkspace(ws.id, newName.trim());
                    }
                  }}
                  className="rounded px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  title="Rename"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(ws.id, ws.name)}
                  className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                  title="Delete workspace + all its tabs"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default WorkspaceDashboard;
