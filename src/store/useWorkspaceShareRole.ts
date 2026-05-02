/**
 * useWorkspaceShareRole — global "what role is the current user
 * playing on this workspace" store.
 *
 * Three values:
 *   - "owner"   default. The user owns the workspace they're viewing,
 *               or no share token was used. Full edit + run + persist.
 *   - "editor"  user landed via a ?share=<editor-token> link. They
 *               can run nodes (their own credits get deducted), but
 *               canvas mutations are LOCAL ONLY — autosave bails so
 *               their layout edits don't write back to the owner's
 *               canvas. We picked the stricter policy: collaborative
 *               persistent editing is its own feature with conflict
 *               resolution; not in scope here.
 *   - "viewer"  user landed via a ?share=<viewer-token> link. The
 *               canvas renders read-only — no input, no Run, no
 *               settings dropdowns, no node creation/deletion,
 *               no autosave.
 *
 * The role is NOT persisted. A page reload re-runs the share-token
 * resolution flow on Canvas.tsx, which is the only place that sets
 * the role to anything other than "owner". This avoids stale viewer
 * state lingering after the user revokes / leaves a share session.
 */

import { create } from "zustand";

export type WorkspaceShareRole = "owner" | "editor" | "viewer";

interface ShareRoleState {
  role: WorkspaceShareRole;
  /** Display name of the workspace's actual owner — used by the
   *  banner ("View only — owned by …"). Empty when role === "owner". */
  ownerLabel: string;
  /** The workspace_id the share was minted for. Lets us reset the
   *  role automatically when the user navigates to a different
   *  workspace without a token. */
  workspaceId: string | null;
  /** The share row id, used as a debug / audit handle. */
  shareId: string | null;
  setShare: (args: {
    role: Exclude<WorkspaceShareRole, "owner">;
    ownerLabel: string;
    workspaceId: string;
    shareId: string | null;
  }) => void;
  /** Clear back to owner mode. Called when the canvas unmounts or
   *  the user navigates to a non-share URL. */
  clear: () => void;
}

export const useWorkspaceShareRole = create<ShareRoleState>((set) => ({
  role: "owner",
  ownerLabel: "",
  workspaceId: null,
  shareId: null,
  setShare: ({ role, ownerLabel, workspaceId, shareId }) =>
    set({ role, ownerLabel, workspaceId, shareId }),
  clear: () =>
    set({ role: "owner", ownerLabel: "", workspaceId: null, shareId: null }),
}));

/** Convenience selectors — return scalars rather than the full state
 *  so consumers don't re-render on unrelated field changes. */
export const selectIsViewer = (s: ShareRoleState) => s.role === "viewer";
export const selectIsEditor = (s: ShareRoleState) => s.role === "editor";
export const selectCanMutate = (s: ShareRoleState) => s.role !== "viewer";
/** True when canvas state should be persisted to the server. Owner
 *  → yes. Editor → no (local-only edits, stricter policy). Viewer
 *  → no. */
export const selectCanPersist = (s: ShareRoleState) => s.role !== "viewer";
