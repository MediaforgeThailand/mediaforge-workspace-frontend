import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface BundleRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  thumbnail_type: "image" | "video";
  status: "draft" | "submitted" | "in_review" | "published" | "rejected";
  is_official: boolean;
  keywords: string[] | null;
  tags: string[] | null;
  categories: string[] | null;
  industry_tags: string[] | null;
  use_case_tags: string[] | null;
  format_tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface BundleFlowRow {
  id: string;
  bundle_id: string;
  flow_id: string;
  sort_order: number;
  created_at: string;
}

export interface BundleWithFlows extends BundleRow {
  flow_count: number;
}

/* ─── List bundles for current creator ─── */
export const useMyBundles = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-bundles", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<BundleWithFlows[]> => {
      const { data, error } = await supabase
        .from("bundles" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const rows = (data as unknown as BundleRow[]) ?? [];
      if (!rows.length) return [];

      const ids = rows.map((b) => b.id);
      const { data: links } = await supabase
        .from("bundle_flows" as any)
        .select("bundle_id")
        .in("bundle_id", ids);
      const counts: Record<string, number> = {};
      ((links as unknown as { bundle_id: string }[]) ?? []).forEach((l) => {
        counts[l.bundle_id] = (counts[l.bundle_id] ?? 0) + 1;
      });

      return rows.map((b) => ({ ...b, flow_count: counts[b.id] ?? 0 }));
    },
  });
};

/* ─── Single bundle + linked flow IDs ─── */
export const useBundle = (bundleId: string | undefined) =>
  useQuery({
    queryKey: ["bundle", bundleId],
    enabled: !!bundleId,
    queryFn: async () => {
      const { data: bundle, error } = await supabase
        .from("bundles" as any)
        .select("*")
        .eq("id", bundleId!)
        .maybeSingle();
      if (error) throw error;
      if (!bundle) return null;

      const { data: links } = await supabase
        .from("bundle_flows" as any)
        .select("flow_id, sort_order")
        .eq("bundle_id", bundleId!)
        .order("sort_order");

      return {
        bundle: bundle as unknown as BundleRow,
        flowIds: ((links as unknown as { flow_id: string; sort_order: number }[]) ?? []).map((l) => l.flow_id),
      };
    },
  });

/* ─── Create new draft bundle ─── */
export const useCreateBundle = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation<BundleRow, Error, string | undefined>({
    mutationFn: async (name) => {
      const finalName = name ?? "Untitled Bundle";
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("bundles" as any)
        .insert({ user_id: user.id, name: finalName } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as BundleRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bundles"] });
      toast.success("Bundle created");
    },
    onError: (err: any) => toast.error(err.message ?? "Failed to create bundle"),
  });
};

/* ─── Update bundle metadata ─── */
export const useUpdateBundle = (bundleId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<BundleRow>) => {
      if (!bundleId) throw new Error("No bundle id");
      const { error } = await supabase
        .from("bundles" as any)
        .update(patch as any)
        .eq("id", bundleId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bundle", bundleId] });
      qc.invalidateQueries({ queryKey: ["my-bundles"] });
    },
  });
};

/* ─── Replace bundle's flow links ─── */
export const useSetBundleFlows = (bundleId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (flowIds: string[]) => {
      if (!bundleId) throw new Error("No bundle id");
      // delete all then insert in order
      const delRes = await supabase.from("bundle_flows" as any).delete().eq("bundle_id", bundleId);
      if (delRes.error) throw delRes.error;
      if (flowIds.length === 0) return;
      const rows = flowIds.map((flow_id, i) => ({
        bundle_id: bundleId,
        flow_id,
        sort_order: i,
      }));
      const insRes = await supabase.from("bundle_flows" as any).insert(rows as any);
      if (insRes.error) throw insRes.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bundle", bundleId] });
      qc.invalidateQueries({ queryKey: ["my-bundles"] });
    },
  });
};

/* ─── Delete bundle ─── */
export const useDeleteBundle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bundleId: string) => {
      const { error } = await supabase.from("bundles" as any).delete().eq("id", bundleId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bundles"] });
      toast.success("Bundle deleted");
    },
    onError: (err: any) => toast.error(err.message ?? "Failed to delete"),
  });
};

/* ─── Public fetch: bundle for /play/bundle/:id (with full flow rows) ─── */
export const usePlayBundle = (bundleId: string | undefined) =>
  useQuery({
    queryKey: ["play-bundle", bundleId],
    enabled: !!bundleId,
    queryFn: async () => {
      const { data: bundle, error } = await supabase
        .from("bundles" as any)
        .select("*")
        .eq("id", bundleId!)
        .maybeSingle();
      if (error) throw error;
      if (!bundle) return null;

      const { data: links } = await supabase
        .from("bundle_flows" as any)
        .select("flow_id, sort_order")
        .eq("bundle_id", bundleId!)
        .order("sort_order");

      const ids = ((links as unknown as { flow_id: string; sort_order: number }[]) ?? []).map((l) => l.flow_id);
      if (!ids.length) {
        return { bundle: bundle as unknown as BundleRow, flows: [] };
      }

      const { data: flows } = await supabase
        .from("flows")
        .select("id, name, description, thumbnail_url, selling_price, settings, status")
        .in("id", ids);

      // preserve sort order
      const flowMap = new Map((flows ?? []).map((f) => [f.id, f]));
      const ordered = ids.map((id) => flowMap.get(id)).filter(Boolean);

      return { bundle: bundle as unknown as BundleRow, flows: ordered as any[] };
    },
  });

/* ─── Marketplace: published bundles for Home grid ─── */
export const useMarketplaceBundles = () =>
  useQuery({
    queryKey: ["marketplace-bundles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bundles" as any)
        .select("id, user_id, name, description, thumbnail_url, thumbnail_type, is_official, categories, tags")
        .eq("status", "published")
        .order("updated_at", { ascending: false })
        .limit(30);
      if (error) throw error;

      const rows = (data as unknown as BundleRow[]) ?? [];
      if (!rows.length) return [];

      const ids = rows.map((b) => b.id);
      const { data: links } = await supabase
        .from("bundle_flows" as any)
        .select("bundle_id")
        .in("bundle_id", ids);
      const counts: Record<string, number> = {};
      ((links as unknown as { bundle_id: string }[]) ?? []).forEach((l) => {
        counts[l.bundle_id] = (counts[l.bundle_id] ?? 0) + 1;
      });

      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles_public").select("user_id, display_name, avatar_url").in("user_id", userIds)
        : { data: [] };
      const profMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.user_id, p]));

      return rows.map((b) => ({
        ...b,
        flow_count: counts[b.id] ?? 0,
        creator_name: profMap[b.user_id]?.display_name ?? (b.is_official ? "MediaForge" : "Creator"),
        creator_avatar: profMap[b.user_id]?.avatar_url,
      }));
    },
  });
