import type {
  AutomaticSpeechRecognitionOutput,
  AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";

export const TRANSCRIPTION_MODEL = "onnx-community/whisper-tiny";
const TARGET_SAMPLE_RATE = 16_000;

type TranscriptionProgress = (progress: number) => void;

export type MediaTranscriptionResult = {
  text: string;
  duration: number;
  model: typeof TRANSCRIPTION_MODEL;
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
      }) as AutomaticSpeechRecognitionOutput;
      onProgress?.(100);
      return {
        text: output.text.replace(/\s+/g, " ").trim(),
        duration: audio.duration,
        model: TRANSCRIPTION_MODEL,
      };
    } finally {
      currentProgress = undefined;
    }
  },
};
