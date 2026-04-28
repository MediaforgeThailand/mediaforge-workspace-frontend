/**
 * Bundle enrichment helpers.
 *
 * Bundles do not own their own category or pricing — those are derived from
 * the flows they contain. These helpers centralize that derivation so every
 * discovery surface (Explore, CommunityFlows, hybridSearch) stays consistent.
 */
import { supabase } from "@/integrations/supabase/client";

export interface BundleBaseRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  is_official: boolean;
  tags: string[] | null;
  keywords: string[] | null;
}

export interface BundleEnriched extends BundleBaseRow {
  /** Unique category strings aggregated from constituent published flows */
  categories: string[];
  /** Lowest selling_price (or base_cost * markup) across constituent flows, 0 if none */
  min_price: number;
  /** Highest selling_price across constituent flows */
  max_price: number;
  /** Number of published flows inside this bundle */
  flow_count: number;
}

function effectiveFlowPrice(f: {
  selling_price?: number | null;
  base_cost?: number | null;
  markup_multiplier?: number | null;
}): number {
  if (f.selling_price && f.selling_price > 0) return f.selling_price;
  if (f.base_cost && f.base_cost > 0) return Math.round(f.base_cost * (f.markup_multiplier || 4));
  return 0;
}

/**
 * Given a list of bundle base rows, fetch constituent flow data and return
 * each bundle annotated with derived categories and min/max pricing.
 *
 * Only counts *published* flows — draft/rejected flows inside a bundle are
 * ignored for category and price aggregation.
 */
export async function enrichBundlesWithFlows(
  bundles: BundleBaseRow[],
): Promise<BundleEnriched[]> {
  if (bundles.length === 0) return [];

  const bundleIds = bundles.map((b) => b.id);

  const { data: links } = await supabase
    .from("bundle_flows" as any)
    .select("bundle_id, flow_id")
    .in("bundle_id", bundleIds);

  const linkRows = (links as unknown as Array<{ bundle_id: string; flow_id: string }>) ?? [];
  const flowIds = [...new Set(linkRows.map((l) => l.flow_id))];

  if (flowIds.length === 0) {
    return bundles.map((b) => ({
      ...b,
      categories: [],
      min_price: 0,
      max_price: 0,
      flow_count: 0,
    }));
  }

  const { data: flows } = await supabase
    .from("flows")
    .select("id, category, selling_price, base_cost, markup_multiplier, status")
    .in("id", flowIds)
    .eq("status", "published");

  const flowMap = new Map(
    ((flows ?? []) as Array<{
      id: string;
      category: string | null;
      selling_price: number | null;
      base_cost: number | null;
      markup_multiplier: number | null;
    }>).map((f) => [f.id, f]),
  );

  const linksByBundle = new Map<string, string[]>();
  linkRows.forEach((l) => {
    if (!linksByBundle.has(l.bundle_id)) linksByBundle.set(l.bundle_id, []);
    linksByBundle.get(l.bundle_id)!.push(l.flow_id);
  });

  return bundles.map((b) => {
    const fIds = linksByBundle.get(b.id) ?? [];
    const fs = fIds.map((id) => flowMap.get(id)).filter(Boolean) as Array<{
      category: string | null;
      selling_price: number | null;
      base_cost: number | null;
      markup_multiplier: number | null;
    }>;

    const cats = [...new Set(fs.map((f) => f.category).filter((c): c is string => !!c))];
    const prices = fs.map((f) => effectiveFlowPrice(f)).filter((p) => p > 0);

    return {
      ...b,
      categories: cats,
      min_price: prices.length ? Math.min(...prices) : 0,
      max_price: prices.length ? Math.max(...prices) : 0,
      flow_count: fs.length,
    };
  });
}

/**
 * Find bundle IDs that contain at least one of the given flow IDs.
 * Used for semantic search: match_flows returns matched flow IDs, and we
 * surface the bundles containing those flows as additional search hits.
 */
export async function findBundlesContainingFlows(
  flowIds: string[],
): Promise<string[]> {
  if (flowIds.length === 0) return [];
  const { data } = await supabase
    .from("bundle_flows" as any)
    .select("bundle_id")
    .in("flow_id", flowIds);
  return [
    ...new Set(((data as unknown as Array<{ bundle_id: string }>) ?? []).map((r) => r.bundle_id)),
  ];
}

/**
 * Find bundle IDs whose constituent flows match the given category IDs
 * (via `flow_category_mappings`). Used for browse-time category filtering —
 * bundles don't have their own category_mappings, so we derive membership
 * from the flows they contain.
 */
export async function findBundlesByCategoryIds(categoryIds: string[]): Promise<string[]> {
  if (categoryIds.length === 0) return [];
  const { data: mappings } = await supabase
    .from("flow_category_mappings")
    .select("flow_id")
    .in("category_id", categoryIds);
  const flowIds = [...new Set((mappings ?? []).map((m) => m.flow_id))];
  return findBundlesContainingFlows(flowIds);
}

/**
 * Human-readable price text for a bundle. "2,000 – 15,000" for a range,
 * "2,000" when there's only one distinct price, empty string when free/unknown.
 */
export function formatBundlePriceRange(min: number, max: number): string {
  if (max <= 0) return "";
  const fmt = (n: number) => n.toLocaleString("en-US");
  if (min === max || min <= 0) return fmt(max);
  return `${fmt(min)} – ${fmt(max)}`;
}
