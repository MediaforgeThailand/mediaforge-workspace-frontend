import type { BundleFlow } from "./types";

const PALETTE = ["#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#fb7185"];
const EMOJI_FALLBACK = ["🍜", "📋", "🎨", "✨", "🎬", "📸"];

function stableHash(id: string): number {
  return id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

export function deriveFlowMeta(flow: any, _index = 0): BundleFlow {
  const meta = flow?.settings?.meta ?? {};
  const hash = stableHash(String(flow?.id ?? ""));
  return {
    id: flow.id,
    name: flow.name ?? "Untitled",
    description: flow.description ?? null,
    thumbnail_url: flow.thumbnail_url ?? null,
    status: flow.status,
    selling_price: flow.selling_price,
    settings: flow.settings,
    emoji: typeof meta.emoji === "string" ? meta.emoji : EMOJI_FALLBACK[hash % EMOJI_FALLBACK.length],
    color: typeof meta.color === "string" ? meta.color : PALETTE[hash % PALETTE.length],
  };
}
