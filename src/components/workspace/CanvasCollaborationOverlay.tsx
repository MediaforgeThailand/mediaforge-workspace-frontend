import { useMemo } from "react";
import { MousePointer2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isCanvasCollaborationEnabled,
  useCanvasCollaborationStore,
  type CanvasCollaborator,
} from "./canvasCollaboration";

const MEMBER_STALE_MS = 35_000;
const CURSOR_STALE_MS = 9_000;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "M";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function memberSort(a: CanvasCollaborator, b: CanvasCollaborator): number {
  return a.name.localeCompare(b.name) || a.clientId.localeCompare(b.clientId);
}

export default function CanvasCollaborationOverlay() {
  const localClientId = useCanvasCollaborationStore((state) => state.localUser?.clientId ?? null);
  const membersByClientId = useCanvasCollaborationStore((state) => state.members);

  const now = Date.now();
  const members = useMemo(
    () =>
      Object.values(membersByClientId)
        .filter(
          (member) =>
            member.clientId !== localClientId &&
            now - member.onlineAt < MEMBER_STALE_MS,
        )
        .sort(memberSort),
    [localClientId, membersByClientId, now],
  );

  const cursors = useMemo(
    () =>
      members.filter(
        (member) =>
          member.cursorEnabled &&
          member.cursor &&
          now - member.cursor.sentAt < CURSOR_STALE_MS,
      ),
    [members, now],
  );

  if (!isCanvasCollaborationEnabled()) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[24]">
      {cursors.map((member) => {
        const cursor = member.cursor;
        if (!cursor) return null;
        return (
          <div
            key={member.clientId}
            data-collab-cursor={member.clientId}
            className="absolute flex translate-x-1 translate-y-1 items-start gap-1.5"
            style={{
              left: `${Math.max(0, Math.min(1, cursor.xPct)) * 100}%`,
              top: `${Math.max(0, Math.min(1, cursor.yPct)) * 100}%`,
            }}
          >
            <MousePointer2
              className="h-4 w-4 drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]"
              fill={member.color}
              style={{ color: member.color }}
            />
            <span
              className="mt-3 max-w-[150px] truncate rounded-full px-2 py-1 text-[11px] font-semibold leading-none text-zinc-950 shadow-lg"
              style={{ backgroundColor: member.color }}
            >
              {member.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function CollaborationPresencePill() {
  const localClientId = useCanvasCollaborationStore((state) => state.localUser?.clientId ?? null);
  const membersByClientId = useCanvasCollaborationStore((state) => state.members);
  const status = useCanvasCollaborationStore((state) => state.status);
  const cursorEnabled = useCanvasCollaborationStore((state) => state.cursorEnabled);
  const setCursorEnabled = useCanvasCollaborationStore((state) => state.setCursorEnabled);

  const now = Date.now();
  const members = useMemo(
    () =>
      Object.values(membersByClientId)
        .filter(
          (member) =>
            member.clientId !== localClientId &&
            now - member.onlineAt < MEMBER_STALE_MS,
        )
        .sort(memberSort),
    [localClientId, membersByClientId, now],
  );

  if (!isCanvasCollaborationEnabled()) return null;
  if (members.length === 0 && status !== "connected") return null;

  return (
    <div
      data-collab-presence
      className="pointer-events-auto flex h-[37px] items-center gap-[6px] rounded-full bg-zinc-950/85 px-[6px] py-[5px] text-white shadow-lg backdrop-blur-xl"
    >
      <button
        type="button"
        onClick={() => setCursorEnabled(!cursorEnabled)}
        className={cn(
          "grid h-[27px] w-[27px] place-items-center rounded-full transition-colors",
          cursorEnabled
            ? "bg-sky-400/16 text-sky-100"
            : "bg-white/[0.05] text-zinc-500",
        )}
        title={cursorEnabled ? "Hide your live cursor" : "Show your live cursor"}
      >
        <MousePointer2 className="h-[16px] w-[16px]" />
      </button>
      {members.length > 0 && (
        <div className="flex -space-x-1">
          {members.slice(0, 4).map((member) => (
            <div
              key={member.clientId}
              className="grid h-[27px] w-[27px] place-items-center rounded-full border border-zinc-950 text-[11.5px] font-black text-zinc-950"
              style={{ backgroundColor: member.color }}
              title={`${member.name}${member.selectedNodeId ? " is selecting a node" : ""}`}
            >
              {member.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                initials(member.name)
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-[6px] px-1 text-[13px] font-semibold leading-none text-zinc-300">
        {members.length > 0 ? (
          <>
            <Users className="h-[16px] w-[16px] text-zinc-500" />
            {members.length}
          </>
        ) : (
          <>
            <span
              className={cn(
                "h-[8px] w-[8px] rounded-full",
                status === "connected" ? "bg-emerald-400" : "bg-zinc-500",
              )}
            />
            {status === "connected" ? "Live" : status === "error" ? "Retry" : "..."}
          </>
        )}
      </div>
    </div>
  );
}
