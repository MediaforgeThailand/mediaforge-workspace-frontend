/**
 * Shared accent color tokens for flow node primitives.
 * Mirror BaseNodeWrapper ACCENT to keep visual consistency.
 */
export interface AccentTone {
  c: string;
  glow: string;
  bg: string;
  bd: string;
}

export const ACCENT: Record<string, AccentTone> = {
  violet:  { c: "#f4ff00", glow: "rgba(238,255,0,0.35)", bg: "rgba(244,255,0,0.12)", bd: "rgba(244,255,0,0.30)" },
  sky:     { c: "#7dd3fc", glow: "rgba(125,211,252,0.32)", bg: "rgba(125,211,252,0.10)", bd: "rgba(125,211,252,0.28)" },
  amber:   { c: "#fbbf24", glow: "rgba(251,191,36,0.35)",  bg: "rgba(251,191,36,0.10)",  bd: "rgba(251,191,36,0.28)" },
  cyan:    { c: "#67e8f9", glow: "rgba(103,232,249,0.32)", bg: "rgba(103,232,249,0.10)", bd: "rgba(103,232,249,0.28)" },
  emerald: { c: "#6ee7b7", glow: "rgba(110,231,183,0.32)", bg: "rgba(110,231,183,0.10)", bd: "rgba(110,231,183,0.28)" },
  blue:    { c: "#93c5fd", glow: "rgba(147,197,253,0.32)", bg: "rgba(147,197,253,0.10)", bd: "rgba(147,197,253,0.28)" },
  green:   { c: "#86efac", glow: "rgba(134,239,172,0.32)", bg: "rgba(134,239,172,0.10)", bd: "rgba(134,239,172,0.28)" },
  orange:  { c: "#fb923c", glow: "rgba(251,146,60,0.32)",  bg: "rgba(251,146,60,0.10)",  bd: "rgba(251,146,60,0.28)" },
  rose:    { c: "#fda4af", glow: "rgba(253,164,175,0.32)", bg: "rgba(253,164,175,0.10)", bd: "rgba(253,164,175,0.28)" },
};

export const getTone = (accent: string): AccentTone => ACCENT[accent] ?? ACCENT.violet;
