/**
 * ShineBorderV2 — animated conic-gradient border light (Play Flow CI Aether spec).
 *
 * Distinct from the legacy default-export <ShineBorder> (which wraps children).
 * This variant is an absolute-positioned overlay used INSIDE a `position:relative`
 * container with matching `border-radius`. Required CSS (in index.css):
 *   - @property --shine-angle
 *   - @keyframes shine-spin
 *
 * Usage:
 *   <div className="relative rounded-3xl overflow-hidden">
 *     <ShineBorderV2 className="rounded-3xl" />
 *     ...content...
 *   </div>
 */

import { CSSProperties } from "react";

export interface ShineBorderV2Props {
  /** Tailwind classes for border radius (must match parent, e.g. "rounded-3xl") */
  className?: string;
  /** Thickness of the light line in px. Default 1.5 */
  thickness?: number;
  /** Seconds per full rotation. Default 18 (slow, ambient) */
  duration?: number;
  /** Head color (usually white for bright tip) */
  headColor?: string;
  /** Trail color (brand accent) */
  trailColor?: string;
}

export function ShineBorderV2({
  className = "",
  thickness = 1.5,
  duration = 18,
  headColor = "#ffffff",
  trailColor = "#a78bfa",
}: ShineBorderV2Props) {
  const style: CSSProperties = {
    position: "absolute",
    inset: 0,
    padding: `${thickness}px`,
    pointerEvents: "none",
    zIndex: 50,
    background: `conic-gradient(from var(--shine-angle),
      transparent 0deg,
      transparent 220deg,
      rgba(110,96,238,0.15) 255deg,
      rgba(110,96,238,0.55) 300deg,
      ${trailColor} 335deg,
      ${headColor} 357deg,
      transparent 360deg)`,
    WebkitMask:
      "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    WebkitMaskComposite: "xor",
    maskComposite: "exclude",
    mixBlendMode: "plus-lighter",
    animation: `shine-spin ${duration}s linear infinite`,
  };

  return <div aria-hidden className={className} style={style} />;
}

export default ShineBorderV2;
