/** 3-tier categorization system for flows */

export const FORMAT_OPTIONS = ["Image", "Video"] as const;

export const BUSINESS_OPTIONS = [
  "Food & Beverage",
  "Fashion",
  "Beauty",
  "E-commerce",
  "Real Estate",
  "Agency",
  "Health & Wellness",
] as const;

export const USE_CASE_OPTIONS = [
  "Packshot",
  "Video Preview",
  "Before/After",
] as const;

export type FormatTag = (typeof FORMAT_OPTIONS)[number];
export type BusinessTag = (typeof BUSINESS_OPTIONS)[number];
export type UseCaseTag = (typeof USE_CASE_OPTIONS)[number];
