import { supabase } from "@/integrations/supabase/client";

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

  // Step B: if no embedding, use fast keyword fallback instead of RPC
  if (!queryEmbedding) {
    return keywordFallbackSearch(trimmed, matchCount, matchOffset);
  }

  // Step C: call match_flows RPC with both vector + keyword
  const { data, error } = await supabase.rpc("match_flows", {
    query_embedding: JSON.stringify(queryEmbedding),
    search_query: trimmed,
    match_threshold: matchThreshold,
    match_count: matchCount,
    match_offset: matchOffset,
  } as any);

  if (error) {
    console.error("match_flows RPC error:", error);
    // Fallback to keyword search on RPC failure
    return keywordFallbackSearch(trimmed, matchCount, matchOffset);
  }

  return (data ?? []) as HybridSearchResult[];
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
