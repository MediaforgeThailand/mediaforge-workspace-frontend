export const NODE_PROVIDER_MAP: Record<string, { provider: string; is_async: boolean; output_type: "video_url" | "image_url" | "text" }> = {
  klingVideoNode:        { provider: "kling",     is_async: true,  output_type: "video_url" },
  klingExtensionNode:    { provider: "kling",     is_async: true,  output_type: "video_url" },
  motionControlNode:     { provider: "kling",     is_async: true,  output_type: "video_url" },
  bananaProNode:         { provider: "banana",    is_async: false, output_type: "image_url" },
  chatAiNode:            { provider: "chat_ai",   is_async: false, output_type: "text" },
  removeBackgroundNode:  { provider: "remove_bg", is_async: false, output_type: "image_url" },
  // merge_audio is synchronous from the dispatcher's POV: the merge-audio-video edge fn
  // polls Shotstack internally and returns the final video URL within the same request.
  mergeAudioNode:        { provider: "merge_audio", is_async: false, output_type: "video_url" },
};

export const POLL_INTERVAL_MS = 7000;
export const MAX_POLL_DURATION_MS = 10 * 60 * 1000;
