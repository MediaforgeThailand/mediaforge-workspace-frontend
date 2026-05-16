import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseSourceWaveformBinCount,
  decodeWaveformPeaks,
  getWaveformDecodeCacheStats,
  resetWaveformDecodeCacheForTests,
} from "../waveform-extractor";
import {
  extractFrameStrip,
  setThumbnailExtractionPaused,
} from "../thumbnail-extractor";

describe("timeline performance guards", () => {
  afterEach(() => {
    resetWaveformDecodeCacheForTests();
    setThumbnailExtractionPaused(false);
    vi.restoreAllMocks();
    delete (window as unknown as { OfflineAudioContext?: unknown })
      .OfflineAudioContext;
    delete (window as unknown as { webkitOfflineAudioContext?: unknown })
      .webkitOfflineAudioContext;
  });

  it("reuses the same in-flight waveform decode for split clips from one blob", async () => {
    let arrayBufferCalls = 0;
    let decodeCalls = 0;
    const source = new Blob(["fake-audio"], { type: "audio/mpeg" });
    Object.defineProperty(source, "arrayBuffer", {
      value: async () => {
        arrayBufferCalls += 1;
        return new ArrayBuffer(8);
      },
    });

    const fakeBuffer = {
      length: 4,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array([0, 0.25, -0.5, 1]),
    } as unknown as AudioBuffer;

    (window as unknown as { OfflineAudioContext: unknown }).OfflineAudioContext =
      class {
        decodeAudioData() {
          decodeCalls += 1;
          return Promise.resolve(fakeBuffer);
        }
      };

    const [a, b, c] = await Promise.all([
      decodeWaveformPeaks(source, 64),
      decodeWaveformPeaks(source, 64),
      decodeWaveformPeaks(source, 64),
    ]);

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(arrayBufferCalls).toBe(1);
    expect(decodeCalls).toBe(1);
    expect(getWaveformDecodeCacheStats()).toEqual({ hits: 2, misses: 1 });
  });

  it("uses a stable source waveform bucket for duplicate clips at different widths", () => {
    expect(chooseSourceWaveformBinCount(10, 64)).toBe(512);
    expect(chooseSourceWaveformBinCount(10, 320)).toBe(512);
    expect(chooseSourceWaveformBinCount(90, 320)).toBe(3648);
    expect(chooseSourceWaveformBinCount(60 * 60, 320)).toBe(12000);
  });

  it("does not return a cacheable empty thumbnail strip while playback is active", async () => {
    setThumbnailExtractionPaused(true);

    await expect(
      extractFrameStrip(new Blob(["fake-video"], { type: "video/mp4" }), {
        count: 4,
        startTime: 0,
        endTime: 4,
      }),
    ).rejects.toMatchObject({ name: "ThumbnailExtractionPausedError" });
  });
});
