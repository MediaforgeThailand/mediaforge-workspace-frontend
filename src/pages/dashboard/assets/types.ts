export interface Asset {
  id: string;
  name: string;
  file_url: string;
  file_type: string; // image | video | audio
  source: string;
  thumbnail_url: string | null;
  metadata: any;
  created_at: string;
  size_mb?: number;
  duration?: number | null;
  ratio?: number;
  flow_name?: string | null;
  /** Bundle this asset's run was generated from (resolved client-side via bundleRunRegistry). */
  bundle_id?: string | null;
  /** Display name of the bundle (fetched in AssetManager when bundle_id is present). */
  bundle_name?: string | null;
  _processing?: boolean;
}

export type ViewMode = "grid" | "list" | "masonry" | "kanban";
export type Density = "compact" | "comfortable" | "airy";
export type TypeFilter = "all" | "image" | "video" | "audio";
export type SourceFilter = "all" | "workflow" | "image" | "video";
export type TimeFilter = "all" | "today" | "week" | "month";

export const SOURCE_META: Record<string, { label: string; hue: number }> = {
  workflow: { label: "Workflow", hue: 262 },
  image: { label: "Image", hue: 300 },
  video: { label: "Video", hue: 38 },
  // Legacy / fallback labels for older asset rows
  ai_generated: { label: "AI Generated", hue: 300 },
  upload: { label: "Upload", hue: 38 },
  "freepik-stock": { label: "Stock", hue: 142 },
  "ai-chat": { label: "AI Chat", hue: 190 },
};

export const TYPE_HUE: Record<string, number> = {
  image: 300,
  video: 38,
  audio: 142,
};

export function formatDuration(s?: number | null): string {
  if (s == null) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
