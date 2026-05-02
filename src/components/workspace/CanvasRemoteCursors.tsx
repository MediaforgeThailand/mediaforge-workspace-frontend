import { MousePointer2 } from "lucide-react";
import { useCanvasCollaborationStore } from "./canvasCollaboration";

const CURSOR_STALE_MS = 8_000;

export default function CanvasRemoteCursors() {
  const cursorEnabled = useCanvasCollaborationStore((state) => state.cursorEnabled);
  const members = useCanvasCollaborationStore((state) => Object.values(state.members));

  if (!cursorEnabled) return null;

  const now = Date.now();
  const cursors = members.filter(
    (member) =>
      member.cursorEnabled &&
      member.cursor &&
      now - member.cursor.sentAt < CURSOR_STALE_MS,
  );
  if (cursors.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {cursors.map((member) => (
        <div
          key={member.clientId}
          className="absolute flex items-center gap-1"
          style={{
            left: `${member.cursor?.xPct ?? 0}%`,
            top: `${member.cursor?.yPct ?? 0}%`,
            transform: "translate(2px, 2px)",
          }}
        >
          <MousePointer2
            className="h-4 w-4 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
            style={{ color: member.color }}
            fill={member.color}
          />
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-zinc-950 shadow-lg shadow-black/35"
            style={{ background: member.color }}
          >
            {member.name}
          </span>
        </div>
      ))}
    </div>
  );
}
