/**
 * Inspector Section Components — V6 surface.
 *
 * Each export here renders something in `InspectorPanel.tsx` and writes to an
 * engine/store the renderer actually consumes. The V5 cleanup pass dropped
 * the deep/niche pieces (Color Grading wheels/curves/LUT, EQ/Compressor/
 * Reverb/Delay, 3D rotation, full keyframes editor, motion presets,
 * particles, emphasis loops, auto-reframe, silence-cut, beat-sync, voice
 * TTS, multi-cam, etc.) — see e2e/CLEANUP_AUDIT.md and CLEANUP_FINAL_V5.md.
 *
 * V6 further narrowed the video-clip surface to three working sections:
 * Crop, Blending and Entry/Exit Transitions. Background Removal, Alignment
 * and Video Effects were also pulled because they either duplicated the
 * Video tab controls or didn't drive a real engine end-to-end.
 */

export { CropSection } from "./CropSection";
export { SpeedSection } from "./SpeedSection";

// Text & Titles
export { TextClipInspector } from "./TextClipInspector";

// Graphics & Shapes
export { ShapeSection } from "./ShapeSection";
export { SVGSection } from "./SVGSection";

// Transitions
export { ClipTransitionSection } from "./ClipTransitionSection";

// Blending modes
export { BlendingSection } from "./BlendingSection";

// History panel (used by Toolbar)
export { HistoryPanel } from "./HistoryPanel";

// Top-level inspector tabs (Video / Audio / Speed) + the per-tab basic
// content. These are what render under the ClipTabs strip.
export { ClipTabs, type MainTabId, type MainTab, type SubTab } from "./ClipTabs";
export { VideoBasicTab } from "./VideoBasicTab";
export { AudioBasicTab } from "./AudioBasicTab";
export { SpeedTab } from "./SpeedTab";
