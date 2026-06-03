import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { getPickerOptions, portTypeOf } from "../CanvasNodePicker";
import { textNodeImageOutputHandle, textNodeVideoOutputHandle } from "../workspaceSchema";

const node = (type: string, handleData: Record<string, unknown> = {}): Node => ({
  id: `${type}-1`,
  type,
  position: { x: 0, y: 0 },
  data: handleData,
});

describe("CanvasNodePicker Text node wiring", () => {
  it("treats the Text node output as text and its ref input as image", () => {
    const text = node("textNode");
    expect(portTypeOf(text, "default", true)).toBe("text");
    expect(portTypeOf(text, textNodeImageOutputHandle("asset-1"), true)).toBe("image");
    expect(portTypeOf(text, textNodeVideoOutputHandle("asset-2"), true)).toBe("video");
    expect(portTypeOf(text, "ref_image", false)).toBe("image");
    expect(portTypeOf(text, "ref_video", false)).toBe("video");
  });

  it("treats uploaded video frame outputs as images", () => {
    const videoAsset = node("assetNode", { fieldType: "video" });
    expect(portTypeOf(videoAsset, "default", true)).toBe("video");
    expect(portTypeOf(videoAsset, "output_start_frame", true)).toBe("image");
    expect(portTypeOf(videoAsset, "output_end_frame", true)).toBe("image");
  });

  it("offers Text as an image-ref target when dragging from an image output", () => {
    const options = getPickerOptions({
      screen: { x: 0, y: 0 },
      flow: { x: 0, y: 0 },
      fromNode: node("imageGenNode"),
      fromHandleId: "image",
      fromIsOutput: true,
    });

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeType: "textNode",
          newNodeHandle: "ref_image",
        }),
      ]),
    );
  });

  it("offers the VFX source path when dragging from an uploaded video", () => {
    const options = getPickerOptions({
      screen: { x: 0, y: 0 },
      flow: { x: 0, y: 0 },
      fromNode: node("assetNode", { fieldType: "video" }),
      fromHandleId: "default",
      fromIsOutput: true,
    });

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeType: "vfxVariableNode",
          newNodeHandle: "input_video",
        }),
        expect.objectContaining({
          nodeType: "vfxMaskNode",
          newNodeHandle: "input_video",
        }),
        expect.objectContaining({
          nodeType: "vfxWanVaceNode",
          newNodeHandle: "input_video",
        }),
      ]),
    );
  });

  it("offers Wan VACE mask input when dragging from a VFX mask video output", () => {
    const options = getPickerOptions({
      screen: { x: 0, y: 0 },
      flow: { x: 0, y: 0 },
      fromNode: node("vfxMaskNode"),
      fromHandleId: "mask_video",
      fromIsOutput: true,
    });

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeType: "vfxWanVaceNode",
          newNodeHandle: "mask_video",
        }),
      ]),
    );
  });

  it("offers Wan VACE reference input when dragging from the Qwen VFX reference image", () => {
    const options = getPickerOptions({
      screen: { x: 0, y: 0 },
      flow: { x: 0, y: 0 },
      fromNode: node("vfxQwenImageNode"),
      fromHandleId: "image",
      fromIsOutput: true,
    });

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeType: "vfxWanVaceNode",
          newNodeHandle: "ref_image",
        }),
      ]),
    );
  });
});
