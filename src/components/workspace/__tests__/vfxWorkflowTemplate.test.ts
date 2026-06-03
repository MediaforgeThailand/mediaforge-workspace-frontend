import { describe, expect, it } from "vitest";
import { createVfxWorkflowTemplate } from "../vfxWorkflowTemplate";

describe("createVfxWorkflowTemplate", () => {
  it("wires the green-screen VFX path as source video, mask, reference image, then Wan VACE", () => {
    let nextId = 0;
    const template = createVfxWorkflowTemplate({
      origin: { x: 0, y: 0 },
      createId: () => String(nextId += 1),
    });

    const nodesByLabel = new Map(
      template.nodes.map((node) => [String(node.data?.label ?? ""), node]),
    );
    const source = nodesByLabel.get("Source Clip + Sync");
    const start = nodesByLabel.get("Trim / Extract Frame");
    const mask = nodesByLabel.get("Video Matte");
    const reference = nodesByLabel.get("Reference Plate");
    const wan = nodesByLabel.get("Wan VACE Final Edit");

    expect(source?.type).toBe("vfxVariableNode");
    expect(start?.type).toBe("vfxStartFrameNode");
    expect(mask?.type).toBe("vfxMaskNode");
    expect(reference?.type).toBe("vfxQwenImageNode");
    expect(wan?.type).toBe("vfxWanVaceNode");

    expect(reference?.data?.params).toMatchObject({
      workflow_preset: "masked_edit",
      protect_original: "on",
      lightning_lora: "on",
    });
    expect(wan?.data?.params).toMatchObject({
      workflow_preset: "source_mask_ref_edit",
      mask_polarity: "white_edits",
      vace_strength: 0.35,
    });

    expect(template.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: source?.id,
          sourceHandle: "input_video",
          target: start?.id,
          targetHandle: "input_video",
        }),
        expect.objectContaining({
          source: source?.id,
          sourceHandle: "input_video",
          target: mask?.id,
          targetHandle: "input_video",
        }),
        expect.objectContaining({
          source: start?.id,
          sourceHandle: "start_image",
          target: reference?.id,
          targetHandle: "ref_image",
        }),
        expect.objectContaining({
          source: mask?.id,
          sourceHandle: "mask_image",
          target: reference?.id,
          targetHandle: "mask_image",
        }),
        expect.objectContaining({
          source: source?.id,
          sourceHandle: "input_video",
          target: wan?.id,
          targetHandle: "input_video",
        }),
        expect.objectContaining({
          source: mask?.id,
          sourceHandle: "mask_video",
          target: wan?.id,
          targetHandle: "mask_video",
        }),
        expect.objectContaining({
          source: reference?.id,
          sourceHandle: "image",
          target: wan?.id,
          targetHandle: "ref_image",
        }),
      ]),
    );
  });
});
