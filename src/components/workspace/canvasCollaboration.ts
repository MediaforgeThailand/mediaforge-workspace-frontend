import { create } from "zustand";

export const NODE_LOCK_TTL_MS = 28_000;

const CURSOR_ENABLED_KEY = "workspace-collab-cursors-enabled";

export interface CanvasCursorPoint {
  xPct: number;
  yPct: number;
  sentAt: number;
}

export interface CanvasCollaborator {
  clientId: string;
  userId: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  color: string;
  onlineAt: number;
  selectedNodeId?: string | null;
  cursor?: CanvasCursorPoint | null;
  cursorEnabled?: boolean;
}

export interface CanvasNodeLock {
  nodeId: string;
  clientId: string;
  userId: string;
  name: string;
  color: string;
  updatedAt: number;
  expiresAt: number;
}

export type NodeLockMessage =
  | {
      kind: "acquire" | "heartbeat";
      nodeId: string;
      expiresAt: number;
      updatedAt: number;
    }
  | {
      kind: "release";
      nodeId: string;
      updatedAt: number;
    };

export type CursorMessage = {
  xPct: number | null;
  yPct: number | null;
  cursorEnabled: boolean;
  sentAt: number;
};

interface CanvasCollaborationState {
  clientId: string | null;
  localUser: CanvasCollaborator | null;
  members: Record<string, CanvasCollaborator>;
  nodeLocks: Record<string, CanvasNodeLock>;
  cursorEnabled: boolean;
  selectedNodeId: string | null;
  sendNodeLock: ((message: NodeLockMessage) => void) | null;
  sendCursor: ((message: CursorMessage) => void) | null;
  trackPresence: (() => void) | null;

  setLocalUser: (user: CanvasCollaborator | null) => void;
  setRealtimeSenders: (senders: {
    sendNodeLock?: ((message: NodeLockMessage) => void) | null;
    sendCursor?: ((message: CursorMessage) => void) | null;
    trackPresence?: (() => void) | null;
  }) => void;
  setMembers: (members: CanvasCollaborator[]) => void;
  upsertCursor: (cursor: CanvasCollaborator & { cursor?: CanvasCursorPoint | null }) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setCursorEnabled: (enabled: boolean) => void;
  publishCursor: (xPct: number, yPct: number) => void;
  applyRemoteNodeLock: (lock: CanvasNodeLock) => void;
  releaseRemoteNodeLock: (nodeId: string, clientId: string, updatedAt: number) => void;
  claimNodeLock: (nodeId: string) => boolean;
  releaseNodeLock: (nodeId: string) => void;
  releaseOwnedNodeLocks: () => void;
  refreshOwnedNodeLocks: () => void;
  cleanupExpiredLocks: () => void;
  clearCanvasCollaboration: () => void;
}

export function colorForCollaborator(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const palette = [
    "hsl(199 89% 62%)",
    "hsl(152 72% 48%)",
    "hsl(38 92% 56%)",
    "hsl(330 84% 66%)",
    "hsl(258 86% 68%)",
    "hsl(16 88% 62%)",
    "hsl(188 84% 52%)",
  ];
  return palette[hash % palette.length];
}

export function initialsForName(name: string | null | undefined): string {
  const clean = (name ?? "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function readCursorEnabled(): boolean {
  try {
    return localStorage.getItem(CURSOR_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCursorEnabled(enabled: boolean) {
  try {
    localStorage.setItem(CURSOR_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function isActive(lock: CanvasNodeLock | undefined, nowMs = Date.now()): lock is CanvasNodeLock {
  return Boolean(lock && lock.expiresAt > nowMs);
}

export const useCanvasCollaborationStore = create<CanvasCollaborationState>()(
  (set, get) => ({
    clientId: null,
    localUser: null,
    members: {},
    nodeLocks: {},
    cursorEnabled: readCursorEnabled(),
    selectedNodeId: null,
    sendNodeLock: null,
    sendCursor: null,
    trackPresence: null,

    setLocalUser: (user) =>
      set({
        clientId: user?.clientId ?? null,
        localUser: user,
      }),

    setRealtimeSenders: (senders) =>
      set((state) => ({
        sendNodeLock:
          senders.sendNodeLock === undefined
            ? state.sendNodeLock
            : senders.sendNodeLock,
        sendCursor:
          senders.sendCursor === undefined ? state.sendCursor : senders.sendCursor,
        trackPresence:
          senders.trackPresence === undefined
            ? state.trackPresence
            : senders.trackPresence,
      })),

    setMembers: (members) =>
      set((state) => {
        const next: Record<string, CanvasCollaborator> = {};
        for (const member of members) {
          if (!member.clientId || member.clientId === state.clientId) continue;
          next[member.clientId] = {
            ...state.members[member.clientId],
            ...member,
            onlineAt: member.onlineAt || Date.now(),
          };
        }
        return { members: next };
      }),

    upsertCursor: (member) =>
      set((state) => {
        if (!member.clientId || member.clientId === state.clientId) return {};
        const existing = state.members[member.clientId];
        return {
          members: {
            ...state.members,
            [member.clientId]: {
              ...existing,
              ...member,
              onlineAt: Date.now(),
            },
          },
        };
      }),

    setSelectedNode: (nodeId) => {
      const state = get();
      set({ selectedNodeId: nodeId });
      state.trackPresence?.();
    },

    setCursorEnabled: (enabled) => {
      writeCursorEnabled(enabled);
      const state = get();
      set({ cursorEnabled: enabled });
      state.trackPresence?.();
      if (!enabled) {
        state.sendCursor?.({
          xPct: null,
          yPct: null,
          cursorEnabled: false,
          sentAt: Date.now(),
        });
      }
    },

    publishCursor: (xPct, yPct) => {
      const state = get();
      if (!state.cursorEnabled || !state.localUser) return;
      state.sendCursor?.({
        xPct,
        yPct,
        cursorEnabled: true,
        sentAt: Date.now(),
      });
    },

    applyRemoteNodeLock: (lock) =>
      set((state) => {
        if (lock.clientId === state.clientId) return {};
        if (lock.expiresAt <= Date.now()) return {};
        const existing = state.nodeLocks[lock.nodeId];
        if (existing && existing.updatedAt > lock.updatedAt) return {};
        return {
          nodeLocks: {
            ...state.nodeLocks,
            [lock.nodeId]: lock,
          },
        };
      }),

    releaseRemoteNodeLock: (nodeId, clientId, updatedAt) =>
      set((state) => {
        const existing = state.nodeLocks[nodeId];
        if (!existing || existing.clientId !== clientId || existing.updatedAt > updatedAt) {
          return {};
        }
        const next = { ...state.nodeLocks };
        delete next[nodeId];
        return { nodeLocks: next };
      }),

    claimNodeLock: (nodeId) => {
      const state = get();
      const user = state.localUser;
      if (!user || !state.clientId) return false;
      const existing = state.nodeLocks[nodeId];
      if (isActive(existing) && existing.clientId !== state.clientId) return false;
      const updatedAt = Date.now();
      const lock: CanvasNodeLock = {
        nodeId,
        clientId: state.clientId,
        userId: user.userId,
        name: user.name,
        color: user.color,
        updatedAt,
        expiresAt: updatedAt + NODE_LOCK_TTL_MS,
      };
      set((current) => ({
        nodeLocks: {
          ...current.nodeLocks,
          [nodeId]: lock,
        },
      }));
      state.sendNodeLock?.({
        kind: "acquire",
        nodeId,
        expiresAt: lock.expiresAt,
        updatedAt,
      });
      return true;
    },

    releaseNodeLock: (nodeId) => {
      const state = get();
      const existing = state.nodeLocks[nodeId];
      if (!existing || existing.clientId !== state.clientId) return;
      const updatedAt = Date.now();
      set((current) => {
        const next = { ...current.nodeLocks };
        delete next[nodeId];
        return { nodeLocks: next };
      });
      state.sendNodeLock?.({ kind: "release", nodeId, updatedAt });
    },

    releaseOwnedNodeLocks: () => {
      const state = get();
      const owned = Object.values(state.nodeLocks).filter(
        (lock) => lock.clientId === state.clientId,
      );
      if (owned.length === 0) return;
      const updatedAt = Date.now();
      set((current) => {
        const next = { ...current.nodeLocks };
        for (const lock of owned) delete next[lock.nodeId];
        return { nodeLocks: next };
      });
      for (const lock of owned) {
        state.sendNodeLock?.({ kind: "release", nodeId: lock.nodeId, updatedAt });
      }
    },

    refreshOwnedNodeLocks: () => {
      const state = get();
      const updatedAt = Date.now();
      const owned = Object.values(state.nodeLocks).filter(
        (lock) => lock.clientId === state.clientId,
      );
      if (owned.length === 0) return;
      set((current) => {
        const next = { ...current.nodeLocks };
        for (const lock of owned) {
          const refreshed: CanvasNodeLock = {
            ...lock,
            updatedAt,
            expiresAt: updatedAt + NODE_LOCK_TTL_MS,
          };
          next[lock.nodeId] = refreshed;
          state.sendNodeLock?.({
            kind: "heartbeat",
            nodeId: lock.nodeId,
            expiresAt: refreshed.expiresAt,
            updatedAt,
          });
        }
        return { nodeLocks: next };
      });
    },

    cleanupExpiredLocks: () =>
      set((state) => {
        const nowMs = Date.now();
        let changed = false;
        const next: Record<string, CanvasNodeLock> = {};
        for (const [nodeId, lock] of Object.entries(state.nodeLocks)) {
          if (lock.expiresAt > nowMs) {
            next[nodeId] = lock;
          } else {
            changed = true;
          }
        }
        return changed ? { nodeLocks: next } : {};
      }),

    clearCanvasCollaboration: () =>
      set({
        members: {},
        nodeLocks: {},
        sendNodeLock: null,
        sendCursor: null,
        trackPresence: null,
        selectedNodeId: null,
      }),
  }),
);

export function getRemoteNodeLock(nodeId: string): CanvasNodeLock | null {
  const state = useCanvasCollaborationStore.getState();
  const lock = state.nodeLocks[nodeId];
  if (!isActive(lock)) return null;
  return lock.clientId !== state.clientId ? lock : null;
}

export function isNodeLockedByOther(nodeId: string): boolean {
  return getRemoteNodeLock(nodeId) !== null;
}
