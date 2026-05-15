import type { AutoSuptitleCue } from "./types";

function formatTimestamp(seconds: number, separator: "," | "."): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalMillis = Math.round(safe * 1000);
  const hours = Math.floor(totalMillis / 3_600_000);
  const minutes = Math.floor((totalMillis % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMillis % 60_000) / 1000);
  const millis = totalMillis % 1000;
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(wholeSeconds).padStart(2, "0"),
  ].join(":") + separator + String(millis).padStart(3, "0");
}

export function exportAutoSuptitleSRT(cues: readonly AutoSuptitleCue[]): string {
  return cues
    .map((cue, index) => {
      const start = formatTimestamp(cue.startTime, ",");
      const end = formatTimestamp(cue.endTime, ",");
      return `${index + 1}\n${start} --> ${end}\n${cue.text}`;
    })
    .join("\n\n");
}

export function exportAutoSuptitleVTT(cues: readonly AutoSuptitleCue[]): string {
  const body = cues
    .map((cue) => {
      const start = formatTimestamp(cue.startTime, ".");
      const end = formatTimestamp(cue.endTime, ".");
      return `${start} --> ${end}\n${cue.text}`;
    })
    .join("\n\n");
  return `WEBVTT\n\n${body}`;
}
