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
            // Taller window — was h-[min(640px,…)] which felt cramped
            // once the textarea + history got real use. 88vh leaves
            // ~6vh top + bottom on a tall screen, while the 820px cap
            // keeps it sane on a 4K display where 88vh would be huge.
            "pointer-events-auto flex h-[min(820px,88vh)] w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden",
            "rounded-2xl border border-zinc-800 bg-neutral-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
          )}
          aria-label="Prompt Assistant"
        >
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-800 px-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/12 text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            {/* Header text — model badge ("ChatGPT 5.5") removed
             *  because shipping the underlying model name to the user
             *  is implementation detail that creators don't care about
             *  and the visual sub-line crowded the title in compact
             *  mode. The model is still hard-coded inside the panel
             *  (CHAT_MODEL_SLUG) and configurable per code change. */}
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-zinc-100">Prompt Assistant</div>
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
