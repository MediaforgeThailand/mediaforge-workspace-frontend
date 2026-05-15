import type { CaptionStyleSettings } from "../caption-presets";
import { AUTO_SUPTITLE_TRACK_NAME, type AutoSuptitleResult } from "./types";

export interface AutoSuptitleStudioHandoff {
  version: 1;
  feature: "auto-suptitle";
  source: {
    mediaId?: string;
    fileName?: string;
    duration?: number;
  };
  track: {
    name: string;
    cues: AutoSuptitleResult["cues"];
    meta: AutoSuptitleResult["meta"];
  };
  style: CaptionStyleSettings;
  transcriptText: string;
  createdAt: number;
}

export function createAutoSuptitleStudioHandoff(args: {
  result: AutoSuptitleResult;
  settings: CaptionStyleSettings;
  source?: AutoSuptitleStudioHandoff["source"];
  trackName?: string;
}): AutoSuptitleStudioHandoff {
  const { result, settings, source, trackName = AUTO_SUPTITLE_TRACK_NAME } = args;
  return {
    version: 1,
    feature: "auto-suptitle",
    source: source ?? {},
    track: {
      name: trackName,
      cues: result.cues,
      meta: result.meta,
    },
    style: settings,
    transcriptText: result.whisperResponse.text ?? result.cues.map((cue) => cue.text).join(" "),
    createdAt: Date.now(),
  };
}
