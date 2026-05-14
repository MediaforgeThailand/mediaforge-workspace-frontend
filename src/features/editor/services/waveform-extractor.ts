/**
 * Per-clip waveform peaks extractor.
 *
 * Two modes:
 *  1. **Re-bin existing peaks** — when a MediaItem already has `waveformData`
 *     (Float32Array of mono peaks over the whole media), we just slice and
 *     re-bin into the requested bin count for the clip's visible range. Cheap
 *     and synchronous-ish — runs in microseconds.
 *  2. **Decode from blob** — when no upstream waveform is available, decode
 *     the audio track with `OfflineAudioContext.decodeAudioData` and compute
 *     peaks. This is heavier (~150ms for a 30s clip on a modern laptop).
 */

/**
 * Decode audio from a blob and return normalized [0..1] peaks.
 *
 * Two-stage strategy:
 *   1. Try the cheap path first — `OfflineAudioContext.decodeAudioData`. Works
 *      for plain audio blobs (mp3, wav, m4a, ogg) and most browser-friendly
 *      audio-only containers.
 *   2. If that fails (commonly for video containers with audio: mp4 / mkv /
 *      webm where the browser refuses to decode the container as raw audio),
 *      fall back to mediabunny's container-aware AudioSampleSink which reads
 *      the audio track frame-by-frame and gives us a sample buffer we can
 *      bin. This is the same path the audio-engine uses for playback so it
 *      handles everything mediabunny supports.
 *
 * If both fail, returns a zero-filled Float32Array (the waveform band will
 * render the dark teal backdrop with no bars — same as a silent clip).
 */
export async function decodeWaveformPeaks(
  source: Blob,
  binCount: number,
): Promise<Float32Array> {
  // Path 1: native OfflineAudioContext.
  try {
    const arrayBuffer = await source.arrayBuffer();
    const ctx = new (window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
        .webkitOfflineAudioContext)(1, 44100, 44100);
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return computePeaksFromBuffer(audioBuffer, binCount);
  } catch (nativeErr) {
    if (typeof console !== "undefined") {
      console.warn(
        "[waveform] native decode failed; falling back to mediabunny:",
        nativeErr instanceof Error ? nativeErr.message : nativeErr,
      );
    }
  }

  // Path 2: mediabunny fallback.
  try {
    return await decodeWaveformPeaksViaMediabunny(source, binCount);
  } catch (mbErr) {
    if (typeof console !== "undefined") {
      console.warn(
        "[waveform] mediabunny decode failed:",
        mbErr instanceof Error ? mbErr.message : mbErr,
      );
    }
    return new Float32Array(binCount);
  }
}

/**
 * Decode the primary audio track of a media blob via mediabunny and bin it
 * into N peaks. Used as a fallback when the browser refuses to decode a
 * container as raw audio (typical for video files).
 */
async function decodeWaveformPeaksViaMediabunny(
  source: Blob,
  binCount: number,
): Promise<Float32Array> {
  const mediabunny = await import("mediabunny");
  const { Input, ALL_FORMATS, BlobSource, AudioSampleSink } = mediabunny;

  const input = new Input({
    source: new BlobSource(source),
    formats: ALL_FORMATS,
  });

  const audioTrack = await input.getPrimaryAudioTrack();
  if (!audioTrack) {
    throw new Error("No audio track found in source");
  }

  const sink = new AudioSampleSink(audioTrack);
  const duration = await input.computeDuration();

  // Collect peak per bin: iterate small time windows across the clip.
  const bins = Math.max(1, Math.floor(binCount));
  const peaks = new Float32Array(bins);

  // Cap samples-per-bin work: 0.05s buffers are precise enough at the
  // typical 64-bin resolution and avoid full-decode cost on long clips.
  const sampleDuration = Math.max(0.02, duration / bins);
  let globalMax = 0;

  for (let i = 0; i < bins; i++) {
    const t = (i + 0.5) * (duration / bins);
    try {
      const wrappedSample = await sink.getSample(t);
      if (!wrappedSample) continue;
      // wrappedSample is an AudioSample. Read its data.
      const data = wrappedSample.toAudioBuffer
        ? wrappedSample.toAudioBuffer()
        : null;
      let peak = 0;
      if (data) {
        for (let c = 0; c < data.numberOfChannels; c++) {
          const ch = data.getChannelData(c);
          // Sub-sample for speed: read every 8th sample.
          for (let s = 0; s < ch.length; s += 8) {
            const v = ch[s] >= 0 ? ch[s] : -ch[s];
            if (v > peak) peak = v;
          }
        }
      }
      peaks[i] = peak;
      if (peak > globalMax) globalMax = peak;
    } catch {
      // Single-sample failure — leave bin at 0, continue.
    }
    void sampleDuration;
  }

  if (globalMax > 0.05) {
    const scale = 0.95 / globalMax;
    for (let i = 0; i < bins; i++) {
      peaks[i] = Math.min(1, peaks[i] * scale);
    }
  }

  return peaks;
}

/** Compute peaks across all channels (max abs) into N bins. */
export function computePeaksFromBuffer(
  audioBuffer: AudioBuffer,
  binCount: number,
): Float32Array {
  const bins = Math.max(1, Math.floor(binCount));
  const peaks = new Float32Array(bins);
  const length = audioBuffer.length;
  if (length === 0) return peaks;
  const samplesPerBin = length / bins;

  // Combine all channels — take max abs.
  const channels: Float32Array[] = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }

  let globalMax = 0;
  for (let i = 0; i < bins; i++) {
    const start = Math.floor(i * samplesPerBin);
    const end = Math.min(length, Math.floor((i + 1) * samplesPerBin));
    let binPeak = 0;
    for (const ch of channels) {
      for (let s = start; s < end; s++) {
        const v = ch[s] >= 0 ? ch[s] : -ch[s];
        if (v > binPeak) binPeak = v;
      }
    }
    peaks[i] = binPeak;
    if (binPeak > globalMax) globalMax = binPeak;
  }

  // Light normalization — push the loudest peak to ~0.95 so quiet clips
  // remain visible. Skip if signal is essentially silent.
  if (globalMax > 0.05) {
    const scale = 0.95 / globalMax;
    for (let i = 0; i < bins; i++) {
      peaks[i] = Math.min(1, peaks[i] * scale);
    }
  }

  return peaks;
}

/**
 * Re-bin a pre-computed Float32 peak array (over the whole media) to a
 * clip's visible range and target bin count.
 */
export function rebinPeaks(
  sourcePeaks: Float32Array | number[],
  sourceDuration: number,
  clipStart: number,
  clipEnd: number,
  binCount: number,
): Float32Array {
  const bins = Math.max(1, Math.floor(binCount));
  const out = new Float32Array(bins);
  if (!sourcePeaks || sourcePeaks.length === 0 || sourceDuration <= 0)
    return out;

  const startRatio = Math.max(0, Math.min(1, clipStart / sourceDuration));
  const endRatio = Math.max(startRatio, Math.min(1, clipEnd / sourceDuration));

  const startSample = Math.floor(startRatio * sourcePeaks.length);
  const endSample = Math.max(
    startSample + 1,
    Math.floor(endRatio * sourcePeaks.length),
  );
  const span = endSample - startSample;
  if (span <= 0) return out;
  const samplesPerBin = span / bins;

  let globalMax = 0;
  for (let i = 0; i < bins; i++) {
    const s0 = startSample + Math.floor(i * samplesPerBin);
    const s1 = Math.min(
      endSample,
      startSample + Math.floor((i + 1) * samplesPerBin),
    );
    let binPeak = 0;
    for (let j = s0; j < s1; j++) {
      const raw = sourcePeaks[j];
      const v = raw >= 0 ? raw : -raw;
      if (v > binPeak) binPeak = v;
    }
    out[i] = binPeak;
    if (binPeak > globalMax) globalMax = binPeak;
  }

  if (globalMax > 0.05) {
    const scale = 0.95 / globalMax;
    for (let i = 0; i < bins; i++) {
      out[i] = Math.min(1, out[i] * scale);
    }
  }

  return out;
}

/** Render peaks to a canvas. Centred bars with optional MediaForge yellow fill. */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: Float32Array,
  options: {
    fillStyle?: string;
    bgStyle?: string;
    barGap?: number;
  } = {},
): void {
  const {
    fillStyle = "#F4FF00",
    bgStyle = "rgba(14, 61, 61, 0.7)",
    barGap = 1,
  } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = bgStyle;
  ctx.fillRect(0, 0, w, h);

  if (!peaks || peaks.length === 0) return;

  const mid = h / 2;
  const barWidth = Math.max(1, w / peaks.length);
  ctx.fillStyle = fillStyle;

  for (let i = 0; i < peaks.length; i++) {
    const v = Math.max(0, Math.min(1, peaks[i]));
    const barHeight = Math.max(1, v * (h - 4));
    const x = i * barWidth;
    ctx.fillRect(
      Math.floor(x),
      Math.floor(mid - barHeight / 2),
      Math.max(1, Math.floor(barWidth - barGap)),
      Math.ceil(barHeight),
    );
  }
}
