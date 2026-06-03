import type { Edge, Node, XYPosition } from "@xyflow/react";
import { getWorkspaceSchema } from "./workspaceSchema";

type TemplateNode = Node<Record<string, unknown>>;

interface CreateVfxWorkflowTemplateOptions {
  origin: XYPosition;
  createId: () => string;
}

const NODE_W = 250;

function defaultParamsFor(nodeType: string): Record<string, unknown> {
  const schema = getWorkspaceSchema(nodeType);
  if (!schema) return {};
  const params: Record<string, unknown> = {};
  for (const param of schema.params) {
    const supported = param.supportedModels;
    if (supported && !supported.includes(schema.defaultModel)) continue;
    params[param.key] = param.default;
  }
  return params;
}

function toolNode(
  id: string,
  type: string,
  label: string,
  position: XYPosition,
  params: Record<string, unknown> = {},
): TemplateNode {
  return {
    id,
    type,
    position,
    data: {
      label,
      compactWidth: NODE_W,
      params: {
        ...defaultParamsFor(type),
        nodeName: label,
        ...params,
      },
      exposed: {},
    },
  };
}

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): Edge {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
    type: "default",
  };
}

export function createVfxWorkflowTemplate({
  origin,
  createId,
}: CreateVfxWorkflowTemplateOptions): { nodes: TemplateNode[]; edges: Edge[] } {
  const id = (prefix: string) => `${prefix}_${createId()}`;

  const source = id("vfx_source");
  const start = id("vfx_start_frame");
  const mask = id("vfx_matte");
  const track = id("vfx_track");
  const background = id("vfx_background");
  const depth = id("vfx_depth");
  const canny = id("vfx_canny");
  const pose = id("vfx_pose");
  const reference = id("vfx_reference");
  const wan = id("vfx_wan_vace");

  const x = origin.x;
  const y = origin.y;

  const nodes: TemplateNode[] = [
    toolNode(source, "vfxVariableNode", "Source Clip + Sync", { x, y: y + 170 }, {
      variable_scope: "video_setup",
      frame_sync: "match_source",
      resolution: "720p",
      aspect_ratio: "16:9",
      custom_width: 896,
      custom_height: 512,
      fps: 24,
      select_every_nth: 1,
    }),
    toolNode(start, "vfxStartFrameNode", "Trim / Extract Frame", { x: x + 430, y: y + 170 }, {
      frame_sync: "match_source",
      frame_index: 0,
      frame_load_cap: 1,
      output_prefix: "AIVFX-PREPROCESS/STARTIMG",
    }),
    toolNode(mask, "vfxMaskNode", "Video Matte", { x: x + 430, y: y + 540 }, {
      frame_sync: "match_source",
      mask_mode: "green_screen_key",
      segment_prompt: "person",
      confidence_threshold: 0.35,
      fps: 24,
      frame_load_cap: 240,
      green_min: 72,
      green_dominance: 1.18,
      spill_tolerance: 18,
      mask_expand: -35,
      mask_blur: 4,
      plate_mask_expand: -15,
    }),
    toolNode(track, "vfxTrackNode", "Camera Track", { x: x + 860, y: y + 20 }, {
      frame_sync: "match_source",
      points: 50,
      track_length: 200,
      track_step: 12,
      confidence_threshold: 0.04,
      mask_expand: -15,
      subject_mask_expand: -35,
    }),
    toolNode(background, "vfxBackgroundNode", "01 Background Pass", { x, y: y + 890 }, {
      frame_sync: "match_source",
      background_mode: "grey_50",
      output_prefix: "AIVFX-PREPROCESS/BACKGROUND",
    }),
    toolNode(depth, "vfxDepthNode", "02 Depth Pass", { x: x + 430, y: y + 890 }, {
      frame_sync: "match_source",
      num_inference_steps: 5,
      guidance_scale: 1,
      window_size: 81,
      overlap: 14,
      output_prefix: "AIVFX-PREPROCESS/DEPTH",
    }),
    toolNode(canny, "vfxCannyNode", "03 Canny Pass", { x: x + 860, y: y + 890 }, {
      frame_sync: "match_source",
      low_threshold: 0.4,
      high_threshold: 0.8,
      output_prefix: "AIVFX-PREPROCESS/CANNY",
    }),
    toolNode(pose, "vfxPoseNode", "04 Pose Pass", { x: x + 1290, y: y + 890 }, {
      frame_sync: "match_source",
      detect_body: "on",
      detect_hand: "on",
      detect_face: "on",
      pose_resolution: 768,
      output_prefix: "AIVFX-PREPROCESS/POSE",
    }),
    toolNode(reference, "vfxQwenImageNode", "Reference Plate", { x: x + 1720, y: y + 170 }, {
      workflow_preset: "masked_edit",
      prompt: "using the first frame as reference, replace only the green screen background with a cinematic warehouse interior, keep the actor framing, camera perspective, suit details, and realistic studio lighting",
      aspect_ratio: "16:9",
      steps: 40,
      cfg: 4,
      protect_original: "on",
    }),
    toolNode(wan, "vfxWanVaceNode", "Wan VACE Final Edit", { x: x + 2150, y: y + 360 }, {
      prompt: "change the green screen background into a cinematic warehouse interior, preserve the actor motion, spacesuit details, camera motion, lighting continuity, and realistic shadows",
      resolution: "480p",
      width: 832,
      height: 480,
      fps: 24,
      frame_load_cap: 240,
      chunk_frames: 49,
      mask_polarity: "white_edits",
      steps: 20,
      cfg: 4,
      shift: 8,
    }),
  ];

  const edges: Edge[] = [
    edge(id("e"), source, "input_video", start, "input_video"),
    edge(id("e"), source, "input_video", mask, "input_video"),
    edge(id("e"), start, "start_image", mask, "start_image"),
    edge(id("e"), source, "input_video", track, "input_video"),
    edge(id("e"), mask, "mask_image", track, "mask_image"),
    edge(id("e"), source, "input_video", background, "input_video"),
    edge(id("e"), start, "start_image", background, "start_image"),
    edge(id("e"), source, "input_video", depth, "input_video"),
    edge(id("e"), source, "input_video", canny, "input_video"),
    edge(id("e"), source, "input_video", pose, "input_video"),
    edge(id("e"), start, "start_image", reference, "ref_image"),
    edge(id("e"), mask, "mask_image", reference, "mask_image"),
    edge(id("e"), source, "input_video", wan, "input_video"),
    edge(id("e"), mask, "mask_video", wan, "mask_video"),
    edge(id("e"), reference, "image", wan, "ref_image"),
  ];

  return { nodes, edges };
}
