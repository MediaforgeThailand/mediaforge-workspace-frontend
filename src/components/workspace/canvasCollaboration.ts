import { create } from "zustand";

export type CanvasCursor = {
  xPct: number;
  yPct: number;
  sentAt: number;
};

export type CanvasCollaborator = {
  clientId: string;
  userId: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  color: string;
  onlineAt: number;
  selectedNodeId?: string | null;
  cursorEnabled?: boolean;
  cursor?: CanvasCursor | null;
};

export type CursorBroadcast = CanvasCursor & {
  canvasId: string;
  cursorEnabled: boolean;
  selectedNodeId?: string | null;
};

type CollaborationSenders = {
  trackPresence?: () => void;
  sendCursor?: (message: CursorBroadcast) => void;
  sendSelection?: (nodeId: string | null) => void;
};

type CanvasCollaborationState = {
  localUser: CanvasCollaborator | null;
  members: Record<string, CanvasCollaborator>;
  status: "idle" | "connecting" | "connected" | "error";
  cursorEnabled: boolean;
  senders: CollaborationSenders;
  setLocalUser: (user: CanvasCollaborator | null) => void;
  setStatus: (status: CanvasCollaborationState["status"]) => void;
  setMembers: (members: CanvasCollaborator[]) => void;
  upsertMember: (member: CanvasCollaborator) => void;
  clearMembers: () => void;
  setCursorEnabled: (enabled: boolean) => void;
  setRealtimeSenders: (senders: CollaborationSenders) => void;
  publishCursor: (message: CursorBroadcast) => void;
  publishSelection: (nodeId: string | null) => void;
};

const COLOR_PALETTE = [
  "#38bdf8",
  "#facc15",
  "#f4ff00",
  "#34d399",
  "#fb7185",
  "#f97316",
  "#22d3ee",
  "#c084fc",
];

export function isCanvasCollaborationEnabled(): boolean {
  if (import.meta.env.VITE_CANVAS_COLLAB === "false") return false;
  try {
    return localStorage.getItem("workspace-canvas-collab") !== "off";
  } catch {
    return true;
  }
}

export function colorForCollaborator(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

function sameCursor(a?: CanvasCursor | null, b?: CanvasCursor | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.xPct === b.xPct && a.yPct === b.yPct && a.sentAt === b.sentAt;
}

function sameMember(a?: CanvasCollaborator, b?: CanvasCollaborator): boolean {
  if (!a || !b) return false;
  return (
    a.clientId === b.clientId &&
    a.userId === b.userId &&
    a.name === b.name &&
    a.email === b.email &&
    a.avatarUrl === b.avatarUrl &&
    a.color === b.color &&
    a.onlineAt === b.onlineAt &&
    a.selectedNodeId === b.selectedNodeId &&
    a.cursorEnabled === b.cursorEnabled &&
    sameCursor(a.cursor, b.cursor)
  );
}

function sameMembers(
  a: Record<string, CanvasCollaborator>,
  b: Record<string, CanvasCollaborator>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!sameMember(a[key], b[key])) return false;
  }
  return true;
}

export const useCanvasCollaborationStore = create<CanvasCollaborationState>((set, get) => ({
  localUser: null,
  members: {},
  status: "idle",
  cursorEnabled: true,
  senders: {},
  setLocalUser: (localUser) => {
    const current = get().localUser;
    if ((!current && !localUser) || (current && localUser && sameMember(current, localUser))) {
      return;
    }
    set({ localUser });
  },
  setStatus: (status) => {
    if (get().status === status) return;
    set({ status });
  },
  setMembers: (members) => {
    const next: Record<string, CanvasCollaborator> = {};
    for (const member of members) {
      next[member.clientId] = member;
    }
    if (sameMembers(get().members, next)) return;
    set({ members: next });
  },
  upsertMember: (member) => {
    const current = get().members[member.clientId];
    if (sameMember(current, member)) return;
    set((state) => ({
      members: {
        ...state.members,
        [member.clientId]: member,
      },
    }));
  },
  clearMembers: () => {
    if (Object.keys(get().members).length === 0 && get().status === "idle") return;
    set({ members: {}, status: "idle", senders: {} });
  },
  setCursorEnabled: (cursorEnabled) => {
    if (get().cursorEnabled === cursorEnabled) return;
    set({ cursorEnabled });
    get().senders.trackPresence?.();
  },
  setRealtimeSenders: (senders) => set({ senders }),
  publishCursor: (message) => {
    if (!isCanvasCollaborationEnabled()) return;
    get().senders.sendCursor?.(message);
  },
  publishSelection: (nodeId) => {
    if (!isCanvasCollaborationEnabled()) return;
    get().senders.sendSelection?.(nodeId);
  },
}));
