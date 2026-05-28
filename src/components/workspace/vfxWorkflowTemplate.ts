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
  const qwenPlate = id("vfx_plate");
  const qwenStart = id("vfx_start_image");
  const qwenMask = id("vfx_mask_edit");

  const x = origin.x;
  const y = origin.y;

  const nodes: TemplateNode[] = [
    toolNode(source, "vfxVariableNode", "Load Source Video", { x, y: y + 170 }, {
      variable_scope: "video_setup",
      resolution: "720p",
      aspect_ratio: "16:9",
      custom_width: 896,
      custom_height: 512,
      fps: 24,
      select_every_nth: 1,
    }),
    toolNode(start, "vfxStartFrameNode", "Trim / Extract Frame", { x: x + 430, y: y + 170 }, {
      frame_index: 0,
      frame_load_cap: 1,
      output_prefix: "AIVFX-PREPROCESS/STARTIMG",
    }),
    toolNode(mask, "vfxMaskNode", "Video Matte", { x: x + 430, y: y + 540 }, {
      segment_prompt: "person",
      confidence_threshold: 0.35,
      mask_expand: -35,
      mask_blur: 4,
      plate_mask_expand: -15,
    }),
    toolNode(track, "vfxTrackNode", "Camera Track", { x: x + 860, y: y + 20 }, {
      points: 50,
      track_length: 200,
      track_step: 12,
      confidence_threshold: 0.04,
      mask_expand: -15,
      subject_mask_expand: -35,
    }),
    toolNode(qwenStart, "vfxQwenImageNode", "Start Image Design", { x: x + 860, y: y + 430 }, {
      workflow_preset: "start_image",
      model_name: "qwen-image-edit-2511-runpod",
      steps: 4,
      cfg: 1,
      denoise: 1,
      lightning_lora: "on",
      protect_original: "off",
      prompt:
        "Create a cinematic VFX start frame from the source frame. Preserve subject identity, camera perspective, and lighting direction.",
    }),
    toolNode(qwenPlate, "vfxQwenImageNode", "Plate Generator", { x: x + 1290, y: y + 170 }, {
      workflow_preset: "plate_generate",
      model_name: "qwen-image-runpod",
      aspect_ratio: "16:9",
      width: 1664,
      height: 928,
      steps: 20,
      cfg: 4,
      denoise: 1,
      protect_original: "off",
      prompt:
        "Replace the original green screen or temporary background with a clean cinematic VFX plate. Preserve camera perspective, lens feel, lighting direction, and subject scale.",
    }),
    toolNode(qwenMask, "vfxQwenImageNode", "Final Mask Edit", { x: x + 1720, y: y + 430 }, {
      workflow_preset: "masked_edit",
      model_name: "qwen-image-edit-2511-runpod",
      protect_original: "on",
      mask_expand: 4,
      mask_feather: 12,
      steps: 4,
      prompt:
        "Edit only the masked area. Match original lighting, perspective, texture, grain, and edge continuity.",
    }),
    toolNode(background, "vfxBackgroundNode", "01 Background Pass", { x, y: y + 890 }, {
      background_mode: "grey_50",
      output_prefix: "AIVFX-PREPROCESS/BACKGROUND",
    }),
    toolNode(depth, "vfxDepthNode", "02 Depth Pass", { x: x + 430, y: y + 890 }, {
      num_inference_steps: 5,
      guidance_scale: 1,
      window_size: 81,
      overlap: 14,
      output_prefix: "AIVFX-PREPROCESS/DEPTH",
    }),
    toolNode(canny, "vfxCannyNode", "03 Canny Pass", { x: x + 860, y: y + 890 }, {
      low_threshold: 0.4,
      high_threshold: 0.8,
      output_prefix: "AIVFX-PREPROCESS/CANNY",
    }),
    toolNode(pose, "vfxPoseNode", "04 Pose Pass", { x: x + 1290, y: y + 890 }, {
      detect_body: "on",
      detect_hand: "on",
      detect_face: "on",
      pose_resolution: 768,
      output_prefix: "AIVFX-PREPROCESS/POSE",
    }),
  ];

  const edges: Edge[] = [
    edge(id("e"), source, "input_video", start, "input_video"),
    edge(id("e"), source, "input_video", mask, "input_video"),
    edge(id("e"), start, "start_image", mask, "start_image"),
    edge(id("e"), source, "input_video", track, "input_video"),
    edge(id("e"), mask, "mask_image", track, "mask_image"),
    edge(id("e"), start, "start_image", qwenStart, "ref_image"),
    edge(id("e"), source, "input_video", background, "input_video"),
    edge(id("e"), start, "start_image", background, "start_image"),
    edge(id("e"), source, "input_video", depth, "input_video"),
    edge(id("e"), source, "input_video", canny, "input_video"),
    edge(id("e"), source, "input_video", pose, "input_video"),
    edge(id("e"), qwenStart, "image", qwenMask, "ref_image"),
    edge(id("e"), qwenPlate, "image", qwenMask, "ref_image"),
    edge(id("e"), mask, "mask_image", qwenMask, "mask_image"),
  ];

  return { nodes, edges };
}
