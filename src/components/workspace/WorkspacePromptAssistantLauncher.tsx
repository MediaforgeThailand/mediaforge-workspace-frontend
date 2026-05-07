import { useState } from "react";
import { MessageCircle, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import WorkspaceAIAssistantPanel from "./WorkspaceAIAssistantPanel";

const WorkspacePromptAssistantLauncher = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <section
          className={cn(
            "pointer-events-auto flex h-[min(640px,calc(100vh-96px))] w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden",
            "rounded-2xl border border-zinc-800 bg-neutral-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
          )}
          aria-label="Prompt Assistant"
        >
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-800 px-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/12 text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-zinc-100">Prompt Assistant</div>
              <div className="truncate text-[10px] text-zinc-500">ChatGPT 5.5</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
              aria-label="Close prompt assistant"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <WorkspaceAIAssistantPanel showHeader={false} />
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/20",
          "bg-neutral-950 text-emerald-200 shadow-[0_16px_44px_rgba(0,0,0,0.48)] transition",
          "hover:-translate-y-0.5 hover:bg-neutral-900 hover:text-emerald-100",
          open && "bg-neutral-900 text-emerald-100",
        )}
        aria-label={open ? "Close prompt assistant" : "Open prompt assistant"}
        title={open ? "Close prompt assistant" : "Open prompt assistant"}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </div>
  );
};

export default WorkspacePromptAssistantLauncher;
