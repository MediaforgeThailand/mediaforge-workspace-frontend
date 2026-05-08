import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioPlayButtonProps {
  src: string;
  label?: string;
  className?: string;
  buttonClassName?: string;
  autoPlay?: boolean;
  testId?: string;
}

export function AudioPlayButton({
  src,
  label = "Play audio",
  className,
  buttonClassName,
  autoPlay = false,
  testId,
}: AudioPlayButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(autoPlay);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !autoPlay) return;
    audio.play().catch(() => setPlaying(false));
  }, [autoPlay, src]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
      return;
    }
    audio.pause();
    setPlaying(false);
  };

  const Icon = playing ? Pause : Play;

  return (
    <div
      className={cn("inline-grid place-items-center", className)}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button
        type="button"
        onClick={toggle}
        data-testid={testId}
        aria-label={label}
        title={label}
        className={cn(
          "grid h-12 w-12 place-items-center rounded-full bg-white text-zinc-950 shadow-[0_12px_30px_-14px_rgba(255,255,255,.85),0_0_24px_rgba(238,255,0,.28)] transition hover:scale-105 hover:bg-zinc-100 active:scale-95",
          buttonClassName,
        )}
      >
        <Icon className={cn("h-5 w-5", !playing && "translate-x-[1px]")} />
      </button>
    </div>
  );
}
