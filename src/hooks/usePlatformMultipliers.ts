/**
 * usePlatformMultipliers — Fetches markup multipliers from subscription_settings.
 * Used for display-only price previews (admin / creator dashboards) so they
 * stay in sync with backend pricing in `_shared/pricing.ts`.
 *
 * Realtime subscription auto-invalidates when admin updates values.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformMultipliers {
  image: number;
  video: number;
  chat: number;
  /** Average across the three (used when feature is unknown) */
  default: number;
  revshare: number;
}

const DEFAULTS: PlatformMultipliers = {
  image: 4.0,
  video: 4.0,
  chat: 4.0,
  default: 4.0,
  revshare: 0.2,
};

const QUERY_KEY = ["platform-multipliers"] as const;

export function usePlatformMultipliers() {
  const queryClient = useQueryClient();

  const result = useQuery<PlatformMultipliers, Error>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_settings")
        .select("key, value")
        .in("key", [
          "markup_multiplier_image",
          "markup_multiplier_video",
          "markup_multiplier_chat",
          "creator_revshare_percent",
        ]);

      if (error) throw new Error(error.message);

      const map: Record<string, string> = {};
      (data ?? []).forEach((r: { key: string; value: string }) => {
        map[r.key] = r.value;
      });

      const image = parseFloat(map.markup_multiplier_image ?? "") || DEFAULTS.image;
      const video = parseFloat(map.markup_multiplier_video ?? "") || DEFAULTS.video;
      const chat = parseFloat(map.markup_multiplier_chat ?? "") || DEFAULTS.chat;
      const revsharePercent = parseFloat(map.creator_revshare_percent ?? "");
      const revshare = Number.isFinite(revsharePercent) && revsharePercent > 0
        ? revsharePercent / 100
        : DEFAULTS.revshare;

      return {
        image,
        video,
        chat,
        default: (image + video + chat) / 3,
        revshare,
      };
    },
    staleTime: 1000 * 60 * 5,
    placeholderData: DEFAULTS,
  });

  useEffect(() => {
    const topic = "platform-multipliers-rt";
    const alreadyOwned = supabase
      .getChannels()
      .some((c) => c.topic === `realtime:${topic}`);
    if (alreadyOwned) return;

    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscription_settings" },
        () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return result;
}
