import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { getPickerOptions, portTypeOf } from "../CanvasNodePicker";

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
    expect(portTypeOf(text, "ref_image", false)).toBe("image");
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
});
