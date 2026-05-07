const MODEL_RECOMMENDATION_GROUPS = [
  ["gpt-image-2", "nano-banana-pro", "nano-banana-2"],
  ["seedance-2-0-pro", "kling-v3-omni", "kling-v3-pro"],
  ["tripo3d-v3.1", "tripo3d-v3.0"],
  ["gemini-3.1-flash-tts-preview", "gemini-2.5-pro-preview-tts"],
] as const;

export function cleanModelDisplayName(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/g, "").replace(/\s{2,}/g, " ").trim();
}

export function cleanModelLabelMap(
  labels: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!labels) return undefined;
  const cleaned = Object.fromEntries(
    Object.entries(labels).map(([key, label]) => [key, cleanModelDisplayName(label)]),
  );
  const counts = new Map<string, number>();
  for (const label of Object.values(cleaned)) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Object.fromEntries(
    Object.entries(labels).map(([key, label]) => {
      const cleanLabel = cleaned[key];
      return [key, counts.get(cleanLabel) && counts.get(cleanLabel)! > 1 ? label.trim() : cleanLabel];
    }),
  );
}

export function recommendationRankForModel(id: string): number | null {
  for (const group of MODEL_RECOMMENDATION_GROUPS) {
    const index = (group as readonly string[]).indexOf(id);
    if (index >= 0) return index;
  }
  return null;
}

export function preferredModelIdsFor(ids: string[]): string[] {
  const idSet = new Set(ids);
  const bestGroup = MODEL_RECOMMENDATION_GROUPS.find((group) =>
    group.some((id) => idSet.has(id)),
  );
  if (!bestGroup) return [];
  return bestGroup.filter((id) => idSet.has(id));
}

export function orderModelsByRecommendation<T extends { id: string }>(models: T[]): T[] {
  const preferred = preferredModelIdsFor(models.map((model) => model.id));
  if (preferred.length === 0) return models;
  const preferredSet = new Set(preferred);
  const byId = new Map(models.map((model) => [model.id, model] as const));
  return [
    ...preferred.flatMap((id) => {
      const model = byId.get(id);
      return model ? [model] : [];
    }),
    ...models.filter((model) => !preferredSet.has(model.id)),
  ];
}
