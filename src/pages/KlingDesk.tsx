import { ExternalLink, RefreshCw, ServerOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const OPEN_GENERATIVE_AI_URL = "https://muapi.ai/open-generative-ai";

export default function KlingDesk() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!frameLoaded) setShowFallback(true);
    }, 6000);

    return () => window.clearTimeout(timeout);
  }, [frameLoaded]);

  const reloadFrame = () => {
    setFrameLoaded(false);
    setShowFallback(false);
    if (iframeRef.current) {
      iframeRef.current.src = OPEN_GENERATIVE_AI_URL;
    }
  };

  return (
    <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-[#09090b] text-zinc-50">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-[#0d0d10] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-400 text-[11px] font-semibold text-black">
            MF
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-4">Kling Desk</h1>
            <p className="truncate text-[11px] leading-3 text-zinc-400">Open Generative AI</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={reloadFrame}
            className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Reload
          </button>
          <a
            href={OPEN_GENERATIVE_AI_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center justify-center rounded-md bg-cyan-300 px-2.5 text-xs font-semibold text-black transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Open
          </a>
        </div>
      </header>

      <section className="relative min-h-0 flex-1">
        {!frameLoaded && (
          <div className="absolute inset-0 grid place-items-center bg-[#09090b] text-sm text-zinc-400">
            Loading Kling Desk...
          </div>
        )}

        {showFallback && (
          <div className="absolute left-1/2 top-4 z-10 flex w-[min(520px,calc(100%-24px))] -translate-x-1/2 items-center gap-3 rounded-md border border-amber-300/30 bg-[#18140a] px-3 py-2 text-sm text-amber-50 shadow-2xl shadow-black/30">
            <ServerOff className="h-4 w-4 shrink-0 text-amber-300" />
            <p className="min-w-0 flex-1 text-xs leading-5 text-amber-100/90">
              Embedded app is still loading. Use Open if the browser blocks the frame.
            </p>
            <a
              href={OPEN_GENERATIVE_AI_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 shrink-0 items-center rounded-md bg-amber-300 px-2.5 text-xs font-semibold text-black"
            >
              Open
            </a>
          </div>
        )}

        <iframe
          ref={iframeRef}
          title="Open Generative AI"
          src={OPEN_GENERATIVE_AI_URL}
          className="h-full w-full border-0 bg-[#09090b]"
          allow="clipboard-read; clipboard-write; fullscreen"
          onLoad={() => {
            setFrameLoaded(true);
            setShowFallback(false);
          }}
        />
      </section>
    </main>
  );
}
