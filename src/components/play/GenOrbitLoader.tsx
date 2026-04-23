/**
 * GenOrbitLoader — Floating logo with rising sparkles, used during PlayFlow generation.
 * Pure CSS animation: logo gently floats while purple sparkles rise from below.
 */
import logoIcon from "@/assets/logo-icon.png";

interface GenOrbitLoaderProps {
  /** Outer container size in px. Default 180 */
  size?: number;
  /** kept for backward compatibility; ignored */
  showIcon?: boolean;
}

export default function GenOrbitLoader({ size = 180 }: GenOrbitLoaderProps) {
  return (
    <div
      className="mf-spark"
      style={{ width: size, height: size }}
      aria-label="Generating"
      role="status"
    >
      <img className="mf-logo" src={logoIcon} alt="" draggable={false} />
      <span className="mf-sp s1" />
      <span className="mf-sp s2" />
      <span className="mf-sp s3" />
      <span className="mf-sp s4" />
      <span className="mf-sp s5" />
      <span className="mf-sp s6" />
    </div>
  );
}
