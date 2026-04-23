import { useEffect, useRef } from "react";

export default function ExecutionGlowCard({ children }: { children: React.ReactNode }) {
  const borderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let angle = 0;
    let raf: number;
    const spin = () => {
      angle = (angle + 1.2) % 360;
      if (borderRef.current) borderRef.current.style.setProperty("--angle", `${angle}deg`);
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative rounded-xl overflow-hidden">
      <div
        ref={borderRef}
        className="pointer-events-none absolute -inset-[1.5px] rounded-xl z-[0]"
        style={{
          background: `conic-gradient(from var(--angle, 0deg), hsla(262, 83%, 58%, 0.03), hsla(262, 83%, 58%, 0.55), hsla(283, 55%, 60%, 0.35), hsla(262, 83%, 58%, 0.03))`,
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          padding: "1.5px",
        }}
      />
      <div className="relative rounded-xl bg-[#0b1326]/90 backdrop-blur-xl p-8 flex flex-col items-center gap-4 z-10">
        {children}
      </div>
    </div>
  );
}
