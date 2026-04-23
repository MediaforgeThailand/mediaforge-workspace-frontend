import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FlowCardData } from "@/components/FlowDataCard";
import { getDifficultyFromGraph } from "@/components/DifficultyBadge";

/* ─── Thumbnail fallback: DB path stub → local asset ─── */
import mockPackshotSkincare from "@/assets/mock-packshot-skincare.jpg";
import mockStudioClothing from "@/assets/mock-studio-clothing.jpg";
import mockArtworkText from "@/assets/mock-artwork-text.jpg";
import mockPackshotPerfume from "@/assets/mock-packshot-perfume.jpg";
import mockStudioDress from "@/assets/mock-studio-dress.jpg";
import mockArtworkFuture from "@/assets/mock-artwork-future.jpg";
import mockPackshotSneaker from "@/assets/mock-packshot-sneaker.jpg";
import mockPackshotWatch from "@/assets/mock-packshot-watch.jpg";
import mockArtworkCreate from "@/assets/mock-artwork-create.jpg";

const THUMB_MAP: Record<string, string> = {
  "/mock-packshot-skincare": mockPackshotSkincare,
  "/mock-studio-clothing": mockStudioClothing,
  "/mock-artwork-text": mockArtworkText,
  "/mock-packshot-perfume": mockPackshotPerfume,
  "/mock-studio-dress": mockStudioDress,
  "/mock-artwork-future": mockArtworkFuture,
  "/mock-packshot-sneaker": mockPackshotSneaker,
  "/mock-packshot-watch": mockPackshotWatch,
  "/mock-artwork-create": mockArtworkCreate,
};

const resolveThumb = (url: string | null): string | null => {
  if (!url) return null;
  return THUMB_MAP[url] ?? url;
};

export interface HomepageSectionData {
  id: string;
  title: string;
  subtitle: string | null;
  icon: string;
  section_type: string;
  max_items: number;
  auto_fill_strategy: string;
  sort_order: number;
  flows: FlowCardData[];
}

export const useMarketplaceFlows = () => {
  return useQuery({
    queryKey: ["marketplace-flows"],
    queryFn: async () => {
      // 1. Fetch active sections
      const { data: sections, error: secErr } = await supabase
        .from("homepage_sections")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (secErr) throw secErr;
      if (!sections?.length) return { sections: [] as HomepageSectionData[] };

      // 2. Fetch curated featured flows
      const sectionIds = sections.map((s: any) => s.id);
      const { data: featured } = await supabase
        .from("homepage_featured")
        .select("flow_id, section_id, sort_order")
        .in("section_id", sectionIds)
        .eq("is_active", true)
        .order("sort_order");

      const featuredFlowIds = [...new Set((featured || []).map((f: any) => f.flow_id))];

      // 3. Fetch all published flows (for curated + auto-fill)
      const { data: allFlows } = await supabase
        .from("flows")
        .select(`
          id, user_id, name, description, category, thumbnail_url, selling_price,
          is_official, tags, settings,
          flow_metrics ( avg_rating, total_runs )
        `)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(50);

      // 4. Fetch profiles
      const userIds = [...new Set((allFlows || []).map((f: any) => f.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles_public").select("user_id, display_name, avatar_url").in("user_id", userIds)
        : { data: [] };

      const profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.user_id, p]));

      const mapFlow = (f: any): FlowCardData => {
        const profile = profileMap[f.user_id];
        const metrics = Array.isArray(f.flow_metrics) ? f.flow_metrics[0] : f.flow_metrics;
        const graph = (f.settings as Record<string, unknown>)?.graph ?? null;
        return {
          id: f.id,
          name: f.name,
          description: f.description,
          category: f.category,
          thumbnail_url: resolveThumb(f.thumbnail_url),
          estimated_credits: f.selling_price,
          output_type: "image" as const,
          creator_name: profile?.display_name ?? (f.is_official ? "MediaForge" : "Creator"),
          creator_avatar: profile?.avatar_url,
          is_official: f.is_official,
          avg_rating: (metrics as any)?.avg_rating ?? null,
          difficulty: getDifficultyFromGraph(graph as any),
        };
      };

      const flowMap = Object.fromEntries((allFlows || []).map((f: any) => [f.id, f]));
      const featuredBySection: Record<string, string[]> = {};
      (featured || []).forEach((f: any) => {
        if (!featuredBySection[f.section_id]) featuredBySection[f.section_id] = [];
        featuredBySection[f.section_id].push(f.flow_id);
      });

      // 5. Build sections with flows
      const result: HomepageSectionData[] = sections.map((sec: any) => {
        const curatedIds = featuredBySection[sec.id] || [];
        // Only include curated flows that are still published
        const curatedFlows = curatedIds
          .map((id: string) => flowMap[id])
          .filter((f: any) => f && f.status !== undefined)
          .map(mapFlow);

        // Auto-fill remaining slots
        let autoFilled: FlowCardData[] = [];
        const remaining = sec.max_items - curatedFlows.length;
        if (remaining > 0 && sec.auto_fill_strategy !== "none" && allFlows) {
          const usedIds = new Set(curatedIds);
          const candidates = allFlows.filter((f: any) => !usedIds.has(f.id));

          let sorted: any[];
          switch (sec.auto_fill_strategy) {
            case "trending": {
              sorted = [...candidates].sort((a: any, b: any) => {
                const aR = (Array.isArray(a.flow_metrics) ? a.flow_metrics[0] : a.flow_metrics)?.total_runs ?? 0;
                const bR = (Array.isArray(b.flow_metrics) ? b.flow_metrics[0] : b.flow_metrics)?.total_runs ?? 0;
                return bR - aR;
              });
              break;
            }
            case "popular": {
              sorted = [...candidates].sort((a: any, b: any) => {
                const aR = (Array.isArray(a.flow_metrics) ? a.flow_metrics[0] : a.flow_metrics)?.avg_rating ?? 0;
                const bR = (Array.isArray(b.flow_metrics) ? b.flow_metrics[0] : b.flow_metrics)?.avg_rating ?? 0;
                return bR - aR;
              });
              break;
            }
            case "newest":
              sorted = candidates; // already ordered by created_at desc
              break;
            case "official":
              sorted = candidates.filter((f: any) => f.is_official);
              break;
            default:
              sorted = candidates;
          }

          autoFilled = sorted.slice(0, remaining).map(mapFlow);
        }

        return {
          id: sec.id,
          title: sec.title,
          subtitle: sec.subtitle,
          icon: sec.icon,
          section_type: sec.section_type,
          max_items: sec.max_items,
          auto_fill_strategy: sec.auto_fill_strategy,
          sort_order: sec.sort_order,
          flows: [...curatedFlows, ...autoFilled],
        };
      });

      return { sections: result };
    },
  });
};
