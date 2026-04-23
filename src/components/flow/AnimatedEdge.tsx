/**
 * AnimatedEdge — Test2 redesign.
 * Solid violet glow with subtle inner flow dash. No traveling dots.
 */
import { memo, useMemo } from "react";
import { getBezierPath, type EdgeProps } from "@xyflow/react";

const AnimatedEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) => {
  const horizontalDistance = Math.abs(targetX - sourceX);
  const verticalDistance = Math.abs(targetY - sourceY);
  const curveIntensity = Math.min(
    Math.max(horizontalDistance * 0.35 + verticalDistance * 0.18, 120),
    260,
  );

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: Math.min(curveIntensity / 400, 0.6),
  });

  const glowFilterId = `edge-glow-${id}`;

  // Single accent: violet (matches new design language)
  const colors = useMemo(() => {
    if (selected) {
      return {
        core: "rgba(167,139,250,0.95)", // violet bright
        glow: "rgba(167,139,250,0.45)",
        flow: "rgba(255,255,255,0.55)",
      };
    }
    return {
      core: "rgba(167,139,250,0.7)",
      glow: "rgba(167,139,250,0.22)",
      flow: "rgba(255,255,255,0.32)",
    };
  }, [selected]);

  return (
    <>
      <defs>
        <filter id={glowFilterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={selected ? 5 : 3.5} result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Wide invisible hit-target */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className="react-flow__edge-interaction"
      />

      {/* Outer glow halo */}
      <path
        d={edgePath}
        fill="none"
        stroke={colors.glow}
        strokeWidth={selected ? 10 : 7}
        strokeLinecap="round"
        filter={`url(#${glowFilterId})`}
        style={{ transition: "stroke-width 0.2s ease, opacity 0.2s ease" }}
      />

      {/* Core line */}
      <path
        d={edgePath}
        fill="none"
        stroke={colors.core}
        strokeWidth={selected ? 2.5 : 1.75}
        strokeLinecap="round"
        style={{ transition: "stroke-width 0.2s ease" }}
      />

      {/* Inner flow dash */}
      <path
        d={edgePath}
        fill="none"
        stroke={colors.flow}
        strokeWidth={selected ? 1.25 : 1}
        strokeLinecap="round"
        strokeDasharray="2 10"
        className="edge-flow"
      />
    </>
  );
});

AnimatedEdge.displayName = "AnimatedEdge";
export default AnimatedEdge;
