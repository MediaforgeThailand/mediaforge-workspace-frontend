// Re-export for transition period — will be removed when admin/ folder is deleted in Phase 3
export type { FlowStatus, FlowTier } from "./flow";
export { TIER_CONFIG } from "./flow";

export interface AdminAccount {
  id: string;
  email: string;
  admin_role: AdminRole;
  display_name: string;
}

export interface AdminJWTPayload {
  sub: string;
  email: string;
  role: AdminRole;
  display_name: string;
  type: "admin";
  exp: number;
  iat: number;
}

export interface FlowReviewData {
  id: string;
  flow_id: string;
  reviewer_id: string;
  output_quality: number;
  consistency: number;
  commercial_usability: number;
  originality: number;
  efficiency: number;
  workflow_clarity: number;
  safety: number;
  total_score: number;
  decision: ReviewDecision;
  reviewer_notes: string | null;
  created_at: string;
}

export type AdminRole = "super_admin" | "review_admin" | "finance_admin" | "ops_admin";
export type ReviewDecision = "pending" | "approved" | "rejected" | "changes_requested";

export const RUBRIC_FIELDS = [
  { key: "output_quality", label: "Output Quality", description: "Visual/audio quality of generated outputs" },
  { key: "consistency", label: "Consistency", description: "Reliability across multiple runs" },
  { key: "commercial_usability", label: "Commercial Usability", description: "Suitability for business use" },
  { key: "originality", label: "Originality", description: "Uniqueness of the workflow approach" },
  { key: "efficiency", label: "Efficiency", description: "Credit cost vs. output value" },
  { key: "workflow_clarity", label: "Workflow Clarity", description: "How well-structured the flow is" },
  { key: "safety", label: "Safety", description: "Content safety and compliance" },
] as const;
