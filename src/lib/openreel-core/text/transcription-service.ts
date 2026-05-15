import type { Subtitle, SubtitleStyle, Clip } from "../types/timeline";
import type { MediaItem } from "../types/project";
import { getFFmpegFallback } from "../media/ffmpeg-fallback";

/**
 * Whisper word-level transcription record. Time fields are in seconds,
 * relative to the start of the audio that was uploaded (NOT clip-relative).
 */
export interface CloudflareWhisperWord {
  word: string;
  start: number;
  end: number;
}

export interface CloudflareWhisperResponse {
  text: string;
  language?: string;
  duration?: number;
  word_count?: number;
  words?: CloudflareWhisperWord[];
  segments?: Array<{ start: number; end: number; text: string }>;
  vtt?: string;
}

export interface WhisperTranscriptionProgress {
  phase:
    | "extracting"
    | "compressing"
    | "uploading"
    | "transcribing"
    | "processing"
    | "complete"
    | "error";
  progress: number;
  message: string;
}

/**
 * Adapter function: caller supplies the upload mechanism. The default
 * implementation does a plain `fetch(apiEndpoint, formData)` (legacy
 * Cloudflare worker style). The new OpenAI-Whisper-via-Supabase path
 * is wired up by the editor app and passes a Supabase-aware uploader
 * that sets the Authorization header.
 */
export type WhisperUploader = (
  audio: Blob,
  options: { language?: string; prompt?: string },
) => Promise<CloudflareWhisperResponse>;

export interface TranscriptionConfig {
  /** Legacy endpoint URL (used when no uploader is supplied). */
  apiEndpoint?: string;
  /** Custom uploader — overrides apiEndpoint. New code should use this. */
  uploader?: WhisperUploader;
  apiKey?: string;
  language?: string;
  prompt?: string;
  maxSegmentDuration?: number;
  maxWordsPerSegment?: number;
}

const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: "Inter",
  fontSize: 48,
  color: "#ffffff",
  backgroundColor: "rgba(0, 0, 0, 0.0)",
  position: "bottom",
};

export class TranscriptionService {
  private config: TranscriptionConfig;
  private audioContext: AudioContext | null = null;

  constructor(config: TranscriptionConfig) {
    this.config = {
      maxSegmentDuration: 5,
      maxWordsPerSegment: 10,
      ...config,
    };
  }

  async transcribeClip(
    clip: Clip,
    mediaItem: MediaItem,
    onProgress?: (progress: WhisperTranscriptionProgress) => void,
  ): Promise<Subtitle[]> {
    try {
      onProgress?.({
        phase: "extracting",
        progress: 0,
        message: "Extracting audio from video...",
      });

      const wavBlob = await this.extractAudioFromClip(clip, mediaItem);

      onProgress?.({
        phase: "compressing",
        progress: 15,
        message: "Compressing audio...",
      });

      const audioBlob = await this.compressToMp3(wavBlob);

      onProgress?.({
        phase: "uploading",
        progress: 25,
        message: "Uploading audio for transcription...",
      });

      const whisperResponse = await this.sendToWhisper(audioBlob, onProgress);

      onProgress?.({
        phase: "processing",
        progress: 90,
        message: "Processing transcription...",
      });

      const subtitles = this.convertToSubtitles(whisperResponse, clip);

      onProgress?.({
        phase: "complete",
        progress: 100,
        message: `Generated ${subtitles.length} subtitles`,
      });

      return subtitles;
    } catch (error) {
      onProgress?.({
        phase: "error",
        progress: 0,
        message:
          error instanceof Error ? error.message : "Transcription failed",
      });
      throw error;
    }
  }

  /**
   * Transcribe a raw Blob (typically a WAV produced by extractAudioFromClip
   * or a similar pipeline owned by the caller). Returns the raw Whisper
   * response — caller is responsible for converting to caption clips.
   */
  async transcribeBlob(
    audioBlob: Blob,
    onProgress?: (progress: WhisperTranscriptionProgress) => void,
  ): Promise<CloudflareWhisperResponse> {
    onProgress?.({
      phase: "uploading",
      progress: 10,
      message: "Uploading audio for transcription...",
    });
    const resp = await this.sendToWhisper(audioBlob, onProgress);
    onProgress?.({
      phase: "complete",
      progress: 100,
      message: `Transcribed ${resp.words?.length ?? 0} words`,
    });
    return resp;
  }

  /**
   * Extract audio from a clip on the user's filesystem. Public so callers
   * (the editor app) can extract audio without going through the full
   * transcribeClip flow.
   */
  async extractAudioFromClip(
    clip: Clip,
    mediaItem: MediaItem,
  ): Promise<Blob> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    let arrayBuffer: ArrayBuffer;

    if (mediaItem.blob) {
      arrayBuffer = await mediaItem.blob.arrayBuffer();
    } else if (mediaItem.fileHandle) {
      const file = await mediaItem.fileHandle.getFile();
      arrayBuffer = await file.arrayBuffer();
    } else {
      throw new Error("No media source available for audio extraction");
    }

    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    const inPoint = clip.inPoint || 0;
    const outPoint = clip.outPoint || audioBuffer.duration;
    const duration = Math.min(outPoint - inPoint, clip.duration);

    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(inPoint * sampleRate);
    const endSample = Math.floor((inPoint + duration) * sampleRate);
    const numSamples = endSample - startSample;

    const offlineContext = new OfflineAudioContext(1, numSamples, sampleRate);
    const source = offlineContext.createBufferSource();

    const trimmedBuffer = offlineContext.createBuffer(
      1,
      numSamples,
      sampleRate,
    );
    const channelData = trimmedBuffer.getChannelData(0);
    const sourceData = audioBuffer.getChannelData(0);

    for (let i = 0; i < numSamples; i++) {
      channelData[i] = sourceData[startSample + i] || 0;
    }

    source.buffer = trimmedBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    return this.audioBufferToWav(renderedBuffer);
  }

  private audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = buffer.length * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, totalSize - 8, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    const channelData = buffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
  }

  private async compressToMp3(wavBlob: Blob): Promise<Blob> {
    const ffmpeg = getFFmpegFallback();
    return ffmpeg.convertAudio(wavBlob, "mp3", {
      bitrate: "128k",
      channels: 1,
    });
  }

  private async sendToWhisper(
    audioBlob: Blob,
    onProgress?: (progress: WhisperTranscriptionProgress) => void,
  ): Promise<CloudflareWhisperResponse> {
    onProgress?.({
      phase: "transcribing",
      progress: 50,
      message: "Transcribing audio...",
    });

    // Prefer the custom uploader (new path: Supabase function + OpenAI Whisper).
    if (this.config.uploader) {
      return this.config.uploader(audioBlob, {
        language: this.config.language,
        prompt: this.config.prompt,
      });
    }

    // Legacy fallback — direct POST to a configured endpoint.
    if (!this.config.apiEndpoint) {
      throw new Error(
        "TranscriptionService requires either a uploader function or an apiEndpoint",
      );
    }

    const formData = new FormData();
    formData.append("audio", audioBlob, "audio.mp3");

    const response = await fetch(this.config.apiEndpoint, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(
          "Rate limit reached. Please wait a moment before trying again.",
        );
      }
      const errorText = await response.text();
      throw new Error(
        `Transcription failed: ${response.status} - ${errorText}`,
      );
    }

    return response.json();
  }

  private convertToSubtitles(
    response: CloudflareWhisperResponse,
    clip: Clip,
  ): Subtitle[] {
    if (!response.words || response.words.length === 0) {
      if (!response.text) return [];

      return [
        {
          id: this.generateId(),
          text: response.text.trim(),
          startTime: clip.startTime,
          endTime: clip.startTime + clip.duration,
          style: DEFAULT_SUBTITLE_STYLE,
          words: undefined,
          animationStyle: "none",
        },
      ];
    }

    return this.groupWordsIntoSubtitles(response.words, clip.startTime);
  }

  private groupWordsIntoSubtitles(
    words: CloudflareWhisperWord[],
    clipStartTime: number,
  ): Subtitle[] {
    const subtitles: Subtitle[] = [];
    const maxWords = this.config.maxWordsPerSegment || 10;
    const maxDuration = this.config.maxSegmentDuration || 5;

    let currentWords: CloudflareWhisperWord[] = [];
    let groupStart = 0;

    for (const word of words) {
      if (currentWords.length === 0) {
        groupStart = word.start;
      }

      const wouldExceedWords = currentWords.length >= maxWords;
      const wouldExceedDuration = word.end - groupStart > maxDuration;
      const isPunctuation = /[.!?]$/.test(word.word);

      if (
        (wouldExceedWords || wouldExceedDuration) &&
        currentWords.length > 0
      ) {
        subtitles.push(
          this.createSubtitleFromWords(currentWords, clipStartTime),
        );
        currentWords = [word];
        groupStart = word.start;
      } else {
        currentWords.push(word);

        if (isPunctuation && currentWords.length >= 3) {
          subtitles.push(
            this.createSubtitleFromWords(currentWords, clipStartTime),
          );
          currentWords = [];
        }
      }
    }

    if (currentWords.length > 0) {
      subtitles.push(this.createSubtitleFromWords(currentWords, clipStartTime));
    }

    return subtitles;
  }

  private createSubtitleFromWords(
    words: CloudflareWhisperWord[],
    clipStartTime: number,
  ): Subtitle {
    const text = words
      .map((w) => w.word)
      .join(" ")
      .trim();
    const startTime = clipStartTime + words[0].start;
    const endTime = clipStartTime + words[words.length - 1].end;

    return {
      id: this.generateId(),
      text,
      startTime,
      endTime,
      style: DEFAULT_SUBTITLE_STYLE,
      words: words.map((w) => ({
        text: w.word,
        startTime: clipStartTime + w.start,
        endTime: clipStartTime + w.end,
      })),
      animationStyle: "none",
    };
  }

  private generateId(): string {
    return `sub-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

let transcriptionServiceInstance: TranscriptionService | null = null;

export function getTranscriptionService(): TranscriptionService | null {
  return transcriptionServiceInstance;
}

export function initializeTranscriptionService(
  config: TranscriptionConfig,
): TranscriptionService {
  if (transcriptionServiceInstance) {
    transcriptionServiceInstance.dispose();
  }
  transcriptionServiceInstance = new TranscriptionService(config);
  return transcriptionServiceInstance;
}

export function disposeTranscriptionService(): void {
  if (transcriptionServiceInstance) {
    transcriptionServiceInstance.dispose();
    transcriptionServiceInstance = null;
  }
}
