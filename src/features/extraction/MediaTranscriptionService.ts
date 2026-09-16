import type {
  AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";
import { DocumentAnalyzer } from "./DocumentAnalyzer";
import { TextNormalizationService } from "./TextNormalizationService";
import type { MediaChapter, TranscriptionSegment } from "./ExtractionTypes";

export const TRANSCRIPTION_MODEL = "onnx-community/whisper-tiny";
const TARGET_SAMPLE_RATE = 16_000;

type TranscriptionProgress = (progress: number) => void;

export type MediaTranscriptionResult = {
  text: string;
  duration: number;
  model: typeof TRANSCRIPTION_MODEL;
  language?: string;
  confidence?: number;
  segments: TranscriptionSegment[];
  chapters: MediaChapter[];
};

type WhisperOutput = {
  text: string;
  chunks?: Array<{
    text?: string;
    timestamp?: [number | null, number | null];
    confidence?: number;
  }>;
};

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | undefined;
let currentProgress: TranscriptionProgress | undefined;

async function createTranscriber() {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  return pipeline("automatic-speech-recognition", TRANSCRIPTION_MODEL, {
    device: "wasm",
    dtype: "fp32",
    progress_callback: (progress) => {
      if (progress.status !== "progress") return;
      const normalized = progress.progress > 1
        ? progress.progress / 100
        : progress.progress;
      currentProgress?.(25 + normalized * 45);
    },
  });
}

async function decodeToMono(file: File, onProgress?: TranscriptionProgress) {
  onProgress?.(5);
  const audioContext = new AudioContext();
  try {
    const decoded = await audioContext.decodeAudioData(await file.arrayBuffer());
    onProgress?.(15);
    const frameCount = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
    const offlineContext = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
    const source = offlineContext.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineContext.destination);
    source.start();
    const rendered = await offlineContext.startRendering();
    onProgress?.(25);
    return {
      samples: rendered.getChannelData(0).slice(),
      duration: decoded.duration,
    };
  } catch (error) {
    throw new Error(
      `Não foi possível extrair o áudio de ${file.name}.`,
      { cause: error },
    );
  } finally {
    await audioContext.close();
  }
}

function normalizeSegments(output: WhisperOutput, duration: number): TranscriptionSegment[] {
  const source = output.chunks ?? [];
  if (source.length === 0) {
    const text = TextNormalizationService.normalizeSentence(output.text);
    return text ? [{ start: 0, end: duration, text }] : [];
  }
  return source.flatMap((chunk, index) => {
    const text = TextNormalizationService.normalizeSentence(chunk.text ?? "");
    if (!text) return [];
    const start = chunk.timestamp?.[0] ?? (index === 0 ? 0 : source[index - 1]?.timestamp?.[1] ?? 0);
    const end = chunk.timestamp?.[1] ?? Math.min(duration, start + 30);
    return [{ start, end, text, confidence: chunk.confidence }];
  });
}

function buildChapters(segments: readonly TranscriptionSegment[], duration: number) {
  if (segments.length === 0) return [];
  const chapterLength = 300;
  const chapters: MediaChapter[] = [];
  for (let start = 0; start < duration; start += chapterLength) {
    const end = Math.min(duration, start + chapterLength);
    const first = segments.find((segment) => segment.start >= start && segment.start < end);
    chapters.push({
      title: first?.text.replace(/[.!?].*$/, "").slice(0, 72) || `Capítulo ${chapters.length + 1}`,
      start,
      end,
    });
  }
  return chapters;
}

export const MediaTranscriptionService = {
  async transcribe(
    file: File,
    onProgress?: TranscriptionProgress,
  ): Promise<MediaTranscriptionResult> {
    const audio = await decodeToMono(file, onProgress);
    currentProgress = onProgress;
    try {
      transcriberPromise ??= createTranscriber().catch((error) => {
        transcriberPromise = undefined;
        throw error;
      });
      const transcriber = await transcriberPromise;
      onProgress?.(72);
      const output = await transcriber(audio.samples, {
        chunk_length_s: 30,
        stride_length_s: 5,
        task: "transcribe",
        return_timestamps: true,
      }) as WhisperOutput;
      onProgress?.(100);
      const segments = normalizeSegments(output, audio.duration);
      const text = segments.map((segment) => segment.text).join(" ").trim();
      const confidences = segments.flatMap((segment) => segment.confidence === undefined ? [] : [segment.confidence]);
      return {
        text,
        duration: audio.duration,
        model: TRANSCRIPTION_MODEL,
        language: DocumentAnalyzer.detectLanguage(text),
        confidence: confidences.length > 0
          ? confidences.reduce((total, value) => total + value, 0) / confidences.length
          : undefined,
        segments,
        chapters: buildChapters(segments, audio.duration),
      };
    } finally {
      currentProgress = undefined;
    }
  },
};
