import React from "react";

interface ShineBorderProps {
  children: React.ReactNode;
  speed?: string;
  color?: string;
  thickness?: string;
  inset?: string;
  borderRadius?: string;
  className?: string;
}

const ShineBorder: React.FC<ShineBorderProps> = ({
  children,
  speed = "20s",
  color = "#6e60ee",
  thickness = "1px",
  inset = "1rem",
  borderRadius = "1.5rem",
  className = "",
}) => {
  const vars = {
    "--shine-speed": speed,
    "--shine-thickness": thickness,
    "--shine-inset": inset,
    "--shine-gradient": `radial-gradient(100% 100% at right, white 0%, white 5%, ${color} 35%, transparent 70%)`,
    "--shine-glow-gradient": `radial-gradient(circle, white 0%, ${color} 40%, transparent 70%)`,
  } as React.CSSProperties;

  const frameInset = `calc((var(--shine-inset) + var(--shine-thickness)) * -1)`;

  return (
    <div
      className={`shine-border-container ${className}`}
      style={{ ...vars, position: "relative", borderRadius }}
    >
      {/* Glow orbs */}
      <div
        className="shine-glow-orb shine-glow-orb--1"
        style={{
          position: "absolute",
          inset: frameInset,
          borderRadius: "inherit",
          mixBlendMode: "plus-lighter",
          pointerEvents: "none",
        }}
      />
      <div
        className="shine-glow-orb shine-glow-orb--2"
        style={{
          position: "absolute",
          inset: frameInset,
          borderRadius: "inherit",
          mixBlendMode: "plus-lighter",
          pointerEvents: "none",
        }}
      />

      {/* Frame (border-only glow) */}
      <div
        className="shine-frame"
        style={{
          position: "absolute",
          inset: frameInset,
          borderRadius: "inherit",
          padding: "var(--shine-thickness)",
          overflow: "hidden",
          pointerEvents: "none",
          mask: "linear-gradient(white, white) content-box exclude, linear-gradient(white, white)",
          WebkitMask:
            "linear-gradient(white, white) content-box exclude, linear-gradient(white, white)",
        }}
      >
        <div className="shine-light shine-light--1" />
        <div className="shine-light shine-light--2" />
      </div>

      {children}
    </div>
  );
};

export default ShineBorder;
