import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

const rows = [
  { feature: "Cost per asset", trad: "$50 – $500", diy: "$5 – $20", mf: "From ฿15" },
  { feature: "Turnaround time", trad: "3–7 days", diy: "1–2 hours", mf: "< 60 seconds" },
  { feature: "Skill required", trad: "Hire experts", diy: "Learn AI tools", mf: "Zero" },
  { feature: "Consistency", trad: "Depends on team", diy: "Varies wildly", mf: "100% automated" },
  { feature: "Scalability", trad: "Linear cost", diy: "Time-limited", mf: "Unlimited" },
];

export default function ComparisonSection() {
  const borderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let angle = 0;
    let raf: number;
    const spin = () => {
      angle = (angle + 0.8) % 360;
      if (borderRef.current) borderRef.current.style.setProperty("--angle", `${angle}deg`);
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="mx-auto max-w-[1600px] px-8 py-24">
      <div className="mx-auto max-w-[1536px]">
        <div className="mb-14 text-center">
          <h2 className="mb-4 text-[40px] font-bold leading-tight text-foreground">
            Why Businesses Switch to MediaForge
          </h2>
        </div>

        {/* Animated glow border wrapper */}
        <div className="relative rounded-2xl">
          {/* Spinning conic-gradient border */}
          <div
            ref={borderRef}
            className="pointer-events-none absolute -inset-[2px] rounded-2xl z-[0]"
            style={{
              background: `conic-gradient(from var(--angle, 0deg), hsla(262, 83%, 58%, 0.02), hsla(262, 83%, 58%, 0.7), hsla(283, 55%, 60%, 0.45), hsla(262, 83%, 58%, 0.02))`,
              mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              maskComposite: "exclude",
              WebkitMaskComposite: "xor",
              padding: "2px",
            }}
          />

          {/* Outer glow */}
          <div
            className="pointer-events-none absolute -inset-[1px] rounded-2xl z-[0]"
            style={{
              boxShadow: "0 0 30px hsla(262, 83%, 58%, 0.15), 0 0 60px hsla(262, 83%, 58%, 0.08)",
            }}
          />

          <div className="glass-border relative z-10 rounded-2xl bg-card/60 backdrop-blur-2xl border-0 overflow-x-auto shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
            {/* Header */}
            <div className="grid min-w-[600px] grid-cols-4 border-b border-border/50">
              <div className="p-5 text-sm font-medium text-muted-foreground" />
              <div className="p-5 text-center text-sm font-medium text-muted-foreground">Traditional Studio</div>
              <div className="p-5 text-center text-sm font-medium text-muted-foreground">DIY AI Tools</div>
              <div className="relative p-5 text-center">
                <div className="absolute inset-0 bg-gradient-to-b from-[hsla(262,83%,58%,0.15)] to-transparent" />
                <span className="relative text-sm font-bold text-foreground">MediaForge</span>
              </div>
            </div>

            {rows.map((row, i) => (
              <div
                key={i}
                className={`grid min-w-[600px] grid-cols-4 ${i < rows.length - 1 ? "border-b border-border/50" : ""}`}
              >
                <div className="p-5 text-sm font-medium text-foreground">{row.feature}</div>
                <div className="flex items-center justify-center p-5 text-sm text-muted-foreground">{row.trad}</div>
                <div className="flex items-center justify-center p-5 text-sm text-muted-foreground">{row.diy}</div>
                <div className="relative flex items-center justify-center p-5">
                  <div className="absolute inset-0 bg-[hsla(262,83%,58%,0.06)]" />
                  <span className="relative text-sm font-semibold text-foreground">{row.mf}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
