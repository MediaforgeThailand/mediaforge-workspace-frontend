import { MousePointer2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  initialsForName,
  useCanvasCollaborationStore,
} from "./canvasCollaboration";

export default function CanvasPresenceBar() {
  const members = useCanvasCollaborationStore((state) =>
    Object.values(state.members).sort((a, b) => a.name.localeCompare(b.name)),
  );
  const cursorEnabled = useCanvasCollaborationStore((state) => state.cursorEnabled);
  const setCursorEnabled = useCanvasCollaborationStore((state) => state.setCursorEnabled);

  if (members.length === 0) {
    return (
      <div className="pointer-events-auto flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-2 text-zinc-400 shadow-lg shadow-black/30 backdrop-blur-md">
        <Users className="h-3.5 w-3.5" />
        <button
          type="button"
          onClick={() => setCursorEnabled(!cursorEnabled)}
          title={cursorEnabled ? "Hide live cursors" : "Show live cursors"}
          className={cn(
            "grid h-6 w-6 place-items-center rounded-full transition-colors",
            cursorEnabled
              ? "bg-sky-400 text-zinc-950"
              : "bg-white/[0.06] text-zinc-400 hover:bg-white/[0.10] hover:text-white",
          )}
        >
          <MousePointer2 className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const visible = members.slice(0, 4);
  const extra = Math.max(0, members.length - visible.length);

  return (
    <div className="pointer-events-auto flex h-9 items-center gap-2 rounded-full border border-white/10 bg-black/55 px-2 shadow-lg shadow-black/30 backdrop-blur-md">
      <div className="flex -space-x-2">
        {visible.map((member) => (
          <div
            key={member.clientId}
            title={member.name}
            className="grid h-6 w-6 place-items-center rounded-full border border-black/80 text-[10px] font-bold text-zinc-950 shadow-sm"
            style={{ background: member.color }}
          >
            {member.avatarUrl ? (
              <img
                src={member.avatarUrl}
                alt={member.name}
                className="h-full w-full rounded-full object-cover"
                draggable={false}
              />
            ) : (
              initialsForName(member.name)
            )}
          </div>
        ))}
        {extra > 0 && (
          <div className="grid h-6 w-6 place-items-center rounded-full border border-black/80 bg-zinc-800 text-[10px] font-bold text-zinc-200">
            +{extra}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setCursorEnabled(!cursorEnabled)}
        title={cursorEnabled ? "Hide live cursors" : "Show live cursors"}
        className={cn(
          "grid h-6 w-6 place-items-center rounded-full transition-colors",
          cursorEnabled
            ? "bg-sky-400 text-zinc-950"
            : "bg-white/[0.06] text-zinc-400 hover:bg-white/[0.10] hover:text-white",
        )}
      >
        <MousePointer2 className="h-3 w-3" />
      </button>
    </div>
  );
}
