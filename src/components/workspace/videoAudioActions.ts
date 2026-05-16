import {
  buildDownloadFilename,
  fetchAsBlob,
} from "./downloadAsset";
import { getFFmpegFallback } from "@/lib/openreel-core/media/ffmpeg-fallback";

const AUDIO_WAV_MIME = "audio/wav";
const MUTED_VIDEO_MIME = "video/webm";

function getAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) throw new Error("Audio extraction is not supported in this browser.");
  return new Ctor();
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels || 1);
  const samples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = buffer.sampleRate * blockAlign;
  const dataSize = samples * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: channels }, (_, i) =>
    buffer.getChannelData(i),
  );
  let offset = 44;
  for (let i = 0; i < samples; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i] ?? 0));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );
      offset += bytesPerSample;
    }
  }

  return new Blob([out], { type: AUDIO_WAV_MIME });
}

export async function extractAudioBlobFromVideo(
  videoUrl: string,
): Promise<Blob> {
  const source = await fetchAsBlob(videoUrl);
  const arrayBuffer = await source.arrayBuffer();
  const ctx = getAudioContext();
  try {
    const audio = await ctx.decodeAudioData(arrayBuffer.slice(0));
    if (!audio.length || !audio.numberOfChannels) {
      throw new Error("This video does not contain an audio track.");
    }
    return audioBufferToWav(audio);
  } finally {
    void ctx.close();
  }
}

export async function extractCompressedAudioBlobFromVideo(
  videoUrl: string,
  options: {
    bitrate?: string;
    sampleRate?: number;
    channels?: number;
  } = {},
): Promise<Blob> {
  const source = await fetchAsBlob(videoUrl);
  const ffmpeg = getFFmpegFallback();
  return ffmpeg.convertAudio(source, "mp3", {
    bitrate: options.bitrate ?? "96k",
    sampleRate: options.sampleRate ?? 16000,
    channels: options.channels ?? 1,
  });
}

function canRecordWebm(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    (MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ||
      MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ||
      MediaRecorder.isTypeSupported("video/webm"))
  );
}

function webmMimeType(): string {
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    return "video/webm;codecs=vp9";
  }
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
    return "video/webm;codecs=vp8";
  }
  return "video/webm";
}

export async function removeAudioFromVideoBlob(
  videoUrl: string,
): Promise<Blob> {
  if (!canRecordWebm()) {
    throw new Error("Muted video export is not supported in this browser.");
  }

  const source = await fetchAsBlob(videoUrl);
  const objectUrl = URL.createObjectURL(source);
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  const chunks: Blob[] = [];

  try {
    video.src = objectUrl;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not load video."));
    });

    canvas.width = Math.max(2, video.videoWidth || 1280);
    canvas.height = Math.max(2, video.videoHeight || 720);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas rendering is not available.");

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: webmMimeType() });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    let raf = 0;
    const draw = () => {
      if (!video.paused && !video.ended) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        raf = requestAnimationFrame(draw);
      }
    };

    await new Promise<void>((resolve, reject) => {
      recorder.onerror = () => reject(new Error("Could not encode muted video."));
      recorder.onstop = () => resolve();
      video.onended = () => {
        cancelAnimationFrame(raf);
        if (recorder.state !== "inactive") recorder.stop();
      };
      video.onerror = () => reject(new Error("Could not play video."));
      recorder.start();
      video.currentTime = 0;
      video
        .play()
        .then(() => {
          draw();
        })
        .catch(reject);
    });

    if (chunks.length === 0) throw new Error("Muted video export produced no data.");
    return new Blob(chunks, { type: MUTED_VIDEO_MIME });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function buildExtractedAudioFile(blob: Blob, label: string): File {
  return new File([blob], buildDownloadFilename(`${label}-audio`, "wav"), {
    type: AUDIO_WAV_MIME,
  });
}

export function buildMutedVideoFile(blob: Blob, label: string): File {
  return new File([blob], buildDownloadFilename(`${label}-muted`, "webm"), {
    type: MUTED_VIDEO_MIME,
  });
}
