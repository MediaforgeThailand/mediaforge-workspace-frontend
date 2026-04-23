export type FlowTier = "standard" | "pro" | "masterpiece";

export type FlowStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "changes_requested"
  | "rejected"
  | "published"
  | "archived";

export const TIER_CONFIG: Record<FlowTier, {
  label: string;
  multiplier: number;
  revshare: number;
  color: string;
}> = {
  standard:    { label: "Standard",     multiplier: 2.5, revshare: 0.2,  color: "blue" },
  pro:         { label: "Pro",          multiplier: 3.0, revshare: 0.25, color: "gold" },
  masterpiece: { label: "Master Piece", multiplier: 3.5, revshare: 0.3,  color: "mystic" },
};
