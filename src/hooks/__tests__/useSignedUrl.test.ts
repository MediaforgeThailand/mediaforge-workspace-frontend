import { describe, expect, it } from "vitest";
import {
  extractStorageRef,
  isStorageObjectMissingError,
} from "../useSignedUrl";

describe("useSignedUrl storage helpers", () => {
  it("extracts bucket paths from signed storage URLs", () => {
    expect(
      extractStorageRef(
        "https://example.supabase.co/storage/v1/object/sign/ai-media/pipeline/mediaforge_123.png?token=abc",
      ),
    ).toEqual({
      bucket: "ai-media",
      path: "pipeline/mediaforge_123.png",
    });
  });

  it("extracts raw bucket-prefixed paths without defaulting to user_assets", () => {
    expect(extractStorageRef("ai-media/pipeline/mediaforge_123.png")).toEqual({
      bucket: "ai-media",
      path: "pipeline/mediaforge_123.png",
    });
    expect(extractStorageRef("/user_assets/tts/user/file.wav")).toEqual({
      bucket: "user_assets",
      path: "tts/user/file.wav",
    });
  });

  it("recognizes Supabase Storage missing-object errors", () => {
    expect(isStorageObjectMissingError({ message: "Object not found" })).toBe(true);
    expect(isStorageObjectMissingError({ code: "NoSuchKey" })).toBe(true);
    expect(isStorageObjectMissingError({ statusCode: 404 })).toBe(true);
    expect(isStorageObjectMissingError({ message: "JWT expired" })).toBe(false);
  });
});
