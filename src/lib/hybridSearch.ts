import { supabase } from "@/integrations/supabase/client";
import { enrichBundlesWithFlows, findBundlesContainingFlows, type BundleBaseRow } from "@/lib/bundleEnrichment";

export interface HybridSearchResult {
  id: string;
  name: string;
  description: string | null;
  category: string;
  thumbnail_url: string | null;
  tags: string[] | null;
  keywords: string[] | null;
  base_cost: number;
  selling_price: number;
  is_official: boolean;
  user_id: string;
  status: string;
  similarity: number;
  keyword_score: number;
  combined_score: number;
  is_bundle?: boolean;
  /** For bundles: derived from constituent flows' selling_price */
  price_range_max?: number | null;
}

/**
 * Shape a bundle+derived row into the HybridSearchResult/FlowCardData pipeline.
 * selling_price carries min_price; price_range_max carries max_price.
 */
function bundleToSearchResult(
  b: BundleBaseRow & { categories: string[]; min_price: number; max_price: number },
  keyword_score = 1,
  similarity = 0,
): HybridSearchResult {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    category: b.categories[0] ?? "Bundle",
    thumbnail_url: b.thumbnail_url,
    tags: b.tags,
    keywords: b.keywords,
    base_cost: 0,
    selling_price: b.min_price,
    is_official: b.is_official,
    user_id: b.user_id,
    status: "published",
    similarity,
    keyword_score,
    combined_score: Math.max(keyword_score, similarity),
    is_bundle: true,
    price_range_max: b.max_price,
  };
}

/**
 * Keyword search over published bundles. Derives category + price range from
 * the flows inside each bundle (bundles have no category/price columns of
 * their own).
 */
async function keywordSearchBundles(
  searchQuery: string,
  matchCount: number,
): Promise<HybridSearchResult[]> {
  const term = searchQuery.trim();
  const { data, error } = await supabase
    .from("bundles" as any)
    .select("id, user_id, name, description, thumbnail_url, tags, keywords, is_official, status")
    .eq("status", "published")
    .or(
      `name.ilike.%${term}%,description.ilike.%${term}%,keywords.cs.{"${term.toLowerCase()}"}`,
    )
    .order("is_official", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(matchCount);

  if (error) {
    console.warn("Bundle keyword search error (non-fatal):", error);
    return [];
  }

  const rows = (data as unknown as BundleBaseRow[]) ?? [];
  const enriched = await enrichBundlesWithFlows(rows);
  return enriched.map((b) => bundleToSearchResult(b));
}

/**
 * Fetch bundles that contain any of the given flow IDs, enriched with
 * derived categories + price range. Used to surface bundles through the
 * semantic (vector) search path — bundles "inherit" their flows' embeddings.
 */
async function bundlesFromMatchedFlows(
  flowIds: string[],
  flowScores: Map<string, number>,
  limit = 20,
): Promise<HybridSearchResult[]> {
  const bundleIds = await findBundlesContainingFlows(flowIds);
  if (bundleIds.length === 0) return [];

  const { data } = await supabase
    .from("bundles" as any)
    .select("id, user_id, name, description, thumbnail_url, tags, keywords, is_official")
    .in("id", bundleIds.slice(0, limit))
    .eq("status", "published");

  const baseRows = (data as unknown as BundleBaseRow[]) ?? [];
  if (baseRows.length === 0) return [];

  const enriched = await enrichBundlesWithFlows(baseRows);

  // Best constituent-flow similarity becomes the bundle's similarity.
  const { data: links } = await supabase
    .from("bundle_flows" as any)
    .select("bundle_id, flow_id")
    .in("bundle_id", enriched.map((b) => b.id));

  const bestByBundle = new Map<string, number>();
  ((links as unknown as Array<{ bundle_id: string; flow_id: string }>) ?? []).forEach((l) => {
    const s = flowScores.get(l.flow_id) ?? 0;
    const prev = bestByBundle.get(l.bundle_id) ?? 0;
    if (s > prev) bestByBundle.set(l.bundle_id, s);
  });

  return enriched.map((b) => bundleToSearchResult(b, 0, bestByBundle.get(b.id) ?? 0));
}

/**
 * Dedupe bundles by id, preferring the entry with the higher combined_score.
 */
function mergeUniqueById(...groups: HybridSearchResult[][]): HybridSearchResult[] {
  const map = new Map<string, HybridSearchResult>();
  for (const group of groups) {
    for (const row of group) {
      const existing = map.get(row.id);
      if (!existing || row.combined_score > existing.combined_score) {
        map.set(row.id, row);
      }
    }
  }
  return [...map.values()];
}

/**
 * Boost combined_score based on WHERE the term matched. Industry-standard
 * field weighting: name > exact keyword > partial keyword > description.
 *
 * Even when a row also came from the semantic vector search, an exact
 * surface-form match should pull it up — semantic alone can drown clear
 * literal hits under near-misses.
 */
function applyFieldBoosts(rows: HybridSearchResult[], term: string): HybridSearchResult[] {
  const t = term.toLowerCase();
  if (!t) return rows;

  return rows
    .map((r) => {
      let bonus = 0;
      const name = (r.name ?? "").toLowerCase();
      const desc = (r.description ?? "").toLowerCase();
      const keywords = (r.keywords ?? []).map((k) => k.toLowerCase());

      if (name === t) bonus += 0.6;            // exact name match
      else if (name.includes(t)) bonus += 0.5; // substring in name

      if (keywords.includes(t)) bonus += 0.3;             // keyword exact
      else if (keywords.some((k) => k.includes(t))) bonus += 0.2; // keyword partial

      if (desc.includes(t)) bonus += 0.1;

      return { ...r, combined_score: r.combined_score + bonus };
    })
    .sort((a, b) => b.combined_score - a.combined_score);
}

const EMBEDDING_TIMEOUT_MS = 2000;

/**
 * Try to get an embedding vector within 2 seconds.
 * Returns null on timeout or error.
 */
async function getEmbeddingWithTimeout(text: string): Promise<number[] | null> {
  try {
    const result = await Promise.race([
      supabase.functions.invoke("generate-embedding", { body: { text } }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Embedding timeout")), EMBEDDING_TIMEOUT_MS)
      ),
    ]);
    if (!result.error && result.data?.embedding) {
      return result.data.embedding;
    }
    return null;
  } catch {
    console.warn("Embedding generation failed or timed out, falling back to keyword search");
    return null;
  }
}

/**
 * Keyword-only fallback using standard Supabase ilike queries.
 */
async function keywordFallbackSearch(
  searchQuery: string,
  matchCount: number,
  matchOffset: number = 0
): Promise<HybridSearchResult[]> {
  const term = searchQuery.trim();
  const { data, error } = await supabase
    .from("flows")
    .select("id, name, description, category, thumbnail_url, tags, keywords, base_cost, selling_price, is_official, user_id, status")
    .eq("status", "published")
    .or(
      `name.ilike.%${term}%,description.ilike.%${term}%,keywords.cs.{"${term.toLowerCase()}"}`
    )
    .order("is_official", { ascending: false })
    .order("updated_at", { ascending: false })
    .range(matchOffset, matchOffset + matchCount - 1);

  if (error) {
    console.error("Keyword fallback error:", error);
    throw error;
  }

  return (data ?? []).map((f) => ({
    ...f,
    similarity: 0,
    keyword_score: 1,
    combined_score: 1,
  })) as HybridSearchResult[];
}

/**
 * 2-step Hybrid Search:
 * A) Generate embedding vector (with 2s timeout)
 * B) Call match_flows RPC — or fallback to keyword search if embedding unavailable
 */
export async function hybridSearchFlows(
  searchQuery: string,
  opts: { matchThreshold?: number; matchCount?: number; matchOffset?: number } = {}
): Promise<HybridSearchResult[]> {
  const { matchThreshold = 0.15, matchCount = 20, matchOffset = 0 } = opts;
  const trimmed = searchQuery.trim();
  if (!trimmed) return [];

  // Step A: try embedding with timeout
  const queryEmbedding = await getEmbeddingWithTimeout(trimmed);

  // Step B: if no embedding, run keyword-only path. Bundles surface from
  // their own keyword match AND via constituent flows that keyword-matched.
  if (!queryEmbedding) {
    const [flows, bundlesByKeyword] = await Promise.all([
      keywordFallbackSearch(trimmed, matchCount, matchOffset),
      keywordSearchBundles(trimmed, matchCount),
    ]);
    const flowScores = new Map<string, number>(flows.map((f) => [f.id, f.combined_score]));
    const bundlesByFlow = await bundlesFromMatchedFlows(flows.map((f) => f.id), flowScores, matchCount);
    return applyFieldBoosts(mergeUniqueById(flows, bundlesByKeyword, bundlesByFlow), trimmed);
  }

  // Step C: ALWAYS run semantic + keyword in parallel and merge.
  // Semantic catches conceptual matches ("food" → "กะเพรา"); keyword
  // catches surface hits the embedding may miss ("Kling v2" → exact name).
  // Field boosts push name/keyword matches above pure semantic neighbours.
  //
  // Bundles surface three ways:
  //  (a) keyword match on the bundle itself
  //  (b) keyword match via a constituent flow
  //  (c) semantic match via a constituent flow's embedding
  const [rpcRes, flowsByKeyword, bundlesByKeyword] = await Promise.all([
    supabase.rpc("match_flows", {
      query_embedding: JSON.stringify(queryEmbedding),
      search_query: trimmed,
      match_threshold: matchThreshold,
      match_count: matchCount,
      match_offset: matchOffset,
    } as any),
    keywordFallbackSearch(trimmed, matchCount, matchOffset),
    keywordSearchBundles(trimmed, matchCount),
  ]);

  const flowsBySemantic = rpcRes.error
    ? []
    : ((rpcRes.data ?? []) as HybridSearchResult[]);
  if (rpcRes.error) {
    console.error("match_flows RPC error (continuing with keyword only):", rpcRes.error);
  }

  // Bundle-from-flow uses the union of flow IDs that matched either way.
  const allFlows = [...flowsBySemantic, ...flowsByKeyword];
  const flowScores = new Map<string, number>();
  for (const f of allFlows) {
    const s = f.combined_score ?? f.similarity ?? 0;
    if ((flowScores.get(f.id) ?? 0) < s) flowScores.set(f.id, s);
  }
  const bundlesByFlow = await bundlesFromMatchedFlows(
    [...flowScores.keys()],
    flowScores,
    matchCount,
  );

  return applyFieldBoosts(
    mergeUniqueById(flowsBySemantic, flowsByKeyword, bundlesByKeyword, bundlesByFlow),
    trimmed,
  );
}

/**
 * Fire-and-forget: generate embedding for a flow after save/publish.
 * Does not block the caller.
 */
export function generateFlowEmbedding(flowId: string, name: string, description?: string | null, keywords?: string[], formatTags?: string[]) {
  const embeddingText = [name, description || "", ...(keywords || []), ...(formatTags || [])].join(" ").trim();
  if (!embeddingText) return;

  supabase.functions
    .invoke("generate-embedding", {
      body: { text: embeddingText, flow_id: flowId },
    })
    .then(({ error }) => {
      if (error) console.warn("Background embedding generation failed:", error);
      else console.log("Embedding generated for flow", flowId);
    });
}
