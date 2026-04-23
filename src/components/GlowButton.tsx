import React, { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface GlowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "solid" | "outline";
  glowColor?: "white" | "primary";
  children: React.ReactNode;
  asChild?: boolean;
}

const GlowButton = React.forwardRef<HTMLButtonElement, GlowButtonProps>(
  ({ variant = "solid", glowColor = "white", className, children, ...props }, ref) => {
    const borderRef = useRef<HTMLDivElement>(null);
    const [hovered, setHovered] = useState(false);

    useEffect(() => {
      let angle = 0;
      let raf: number;
      const spin = () => {
        angle = (angle + 0.8) % 360;
        if (borderRef.current) {
          borderRef.current.style.setProperty("--angle", `${angle}deg`);
        }
        raf = requestAnimationFrame(spin);
      };
      raf = requestAnimationFrame(spin);
      return () => cancelAnimationFrame(raf);
    }, []);

    const isSolid = variant === "solid";
    const isPrimary = glowColor === "primary";

    const gradientBg = isPrimary
      ? `conic-gradient(from var(--angle, 0deg), hsla(262, 83%, 58%, 0.05), hsla(262, 83%, 58%, 0.5), hsla(262, 83%, 58%, 0.05))`
      : `conic-gradient(from var(--angle, 0deg), rgba(255,255,255,0.05), rgba(255,255,255,0.35), rgba(255,255,255,0.05))`;

    return (
      <button
        ref={ref}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "glass-border relative isolate rounded-lg px-5 py-2 text-sm font-semibold transition-transform duration-150 active:scale-95 cursor-pointer",
          isSolid ? "bg-white text-black" : "bg-transparent text-white",
          className
        )}
        {...props}
      >
        {/* Animated conic-gradient border */}
        <div
          ref={borderRef}
          className="pointer-events-none absolute -inset-[1.5px] rounded-[9px] z-[-1]"
          style={{
            background: gradientBg,
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            padding: "1.5px",
          }}
        />

        {/* Outline variant hover overlay */}
        {!isSolid && (
          <div
            className={cn(
              "absolute inset-0 rounded-lg bg-white/10 transition-opacity duration-300",
              hovered ? "opacity-100" : "opacity-0"
            )}
          />
        )}

        {/* Glow blob on hover */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 rounded-lg blur-xl transition-opacity duration-500 z-[-2]",
            hovered ? "opacity-100" : "opacity-0",
            isSolid ? (isPrimary ? "bg-primary/20" : "bg-white/20") : (isPrimary ? "bg-primary/10" : "bg-white/10")
          )}
        />

        <span className="relative z-10">{children}</span>
      </button>
    );
  }
);

GlowButton.displayName = "GlowButton";
export default GlowButton;
