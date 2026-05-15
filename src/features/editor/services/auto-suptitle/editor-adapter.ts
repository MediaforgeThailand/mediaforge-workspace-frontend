import type { Track } from "@/lib/openreel-core";
import { useProjectStore } from "../../stores/project-store";
import { AUTO_SUPTITLE_TRACK_NAME, type AutoSuptitleMaterializeArgs, type AutoSuptitleMaterializeResult } from "./types";
import { buildAutoSuptitleStyle } from "./style";
import {
  formatAutoSuptitleCueText,
  normalizeAutoSuptitleCuesForDuration,
} from "./segmenter";

async function ensureAutoSuptitleTrack(trackName: string): Promise<Track | null> {
  const state = useProjectStore.getState();
  const existing = state.project.timeline.tracks.find(
    (track) => track.type === "text" && track.name === trackName,
  );
  if (existing) return existing;

  const existingIds = new Set(state.project.timeline.tracks.map((track) => track.id));
  const result = await state.addTrack("text");
  if (!result?.success) return null;

  const nextState = useProjectStore.getState();
  const created = nextState.project.timeline.tracks.find(
    (track) => track.type === "text" && !existingIds.has(track.id),
  );
  if (!created) return null;

  nextState.renameTrack(created.id, trackName);
  return useProjectStore
    .getState()
    .project.timeline.tracks.find((track) => track.id === created.id) ?? created;
}

export async function materializeAutoSuptitleTrack(
  args: AutoSuptitleMaterializeArgs,
): Promise<AutoSuptitleMaterializeResult | null> {
  const { result, settings, trackName = AUTO_SUPTITLE_TRACK_NAME, replaceExistingGroupId } = args;
  const store = useProjectStore.getState();

  if (replaceExistingGroupId) {
    const clips = store
      .getAllTextClips()
      .filter((clip) => clip.captionMeta?.groupId === replaceExistingGroupId);
    for (const clip of clips) {
      store.deleteTextClip(clip.id);
    }
  }

  const track = await ensureAutoSuptitleTrack(trackName);
  if (!track) return null;

  const project = useProjectStore.getState().project;
  const { style, transform } = buildAutoSuptitleStyle(
    settings,
    project.settings.height || 1080,
    project.settings.width || 1920,
  );

  const cues = normalizeAutoSuptitleCuesForDuration(
    result.cues,
    project.timeline.duration,
  );

  const created = [];
  for (const cue of cues) {
    const clip = useProjectStore.getState().createCaptionTextClip({
      trackId: track.id,
      startTime: cue.startTime,
      duration: Math.max(0.05, cue.endTime - cue.startTime),
      text: formatAutoSuptitleCueText(
        cue.text,
        settings.wordsPerLine,
        result.meta.language,
      ),
      style,
      transform,
      words: cue.words,
      captionMeta: result.meta,
    });
    if (clip) created.push(clip);
  }

  return { trackId: track.id, clips: created };
}
