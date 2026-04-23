export const OFFICIAL_CATEGORIES = [
  "General",
  "Marketing",
  "Video Production",
  "E-commerce",
  "Social Media",
  "Photography",
  "Utility",
  "Audio & Voice",
] as const;

export type FlowCategory = (typeof OFFICIAL_CATEGORIES)[number];

export const DEFAULT_CATEGORY: FlowCategory = "General";

/** Predefined options for the multi-category tagging system */
export const FLOW_TAG_CATEGORIES = [
  "Marketing",
  "Content Creation",
  "Image Generation",
  "Video Production",
  "E-commerce",
  "Social Media",
  "Photography",
  "Productivity",
  "Automation",
  "Audio & Voice",
  "Design",
  "Development",
] as const;
