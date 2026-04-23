import type { RunGroup, RunResultItem } from "@/components/play/ResultsView";

export type BundleVariant = "A" | "B" | "C" | "D";
export type FlowTabStyle = "card" | "pill" | "segmented";
export type BundleMobileTab = "config" | "preview" | "results";

export interface BundleFlow {
  id: string;
  name: string;
  description?: string | null;
  thumbnail_url?: string | null;
  status?: string;
  selling_price?: number;
  settings?: any;
  /** derived */
  emoji: string;
  /** derived hex color */
  color: string;
}

export interface DragPayload {
  item: RunResultItem;
  runId: string;
  x: number;
  y: number;
  update?: boolean;
}

export interface DragHandlers {
  onDragStart: (p: DragPayload) => void;
  onDragMove: (p: { x: number; y: number }) => void;
  onDragEnd: (p: { item: RunResultItem; x: number; y: number }) => void;
}

export type { RunGroup, RunResultItem };
