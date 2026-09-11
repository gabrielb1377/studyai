import { ContentExtractionService } from "./ContentExtractionService";
import { OCRService } from "./OCRService";
import {
  MediaTranscriptionService,
  TRANSCRIPTION_MODEL,
} from "./MediaTranscriptionService";
import type { ExtractionFileType, ExtractionResult } from "./ExtractionTypes";

const IMAGE_TYPES = new Set<ExtractionFileType>(["png", "jpg", "jpeg", "webp"]);
const AUDIO_TYPES = new Set<ExtractionFileType>(["mp3", "wav", "m4a"]);

type PipelineOptions = {
  onProgress?: (progress: number) => void;
};

function elapsedSince(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

export const MediaExtractionPipeline = {
  async extract(
    file: File,
    fileType: ExtractionFileType,
    options: PipelineOptions = {},
  ): Promise<ExtractionResult> {
    const startedAt = performance.now();
    options.onProgress?.(5);
    const baseResult = await ContentExtractionService.extract(file, fileType);
    options.onProgress?.(15);

    if (IMAGE_TYPES.has(fileType)) {
      const ocr = await OCRService.recognizeImage(file, (progress) => {
        options.onProgress?.(15 + progress * 80);
      });
      return {
        extractedText: ocr.text,
        metadata: {
          ...baseResult.metadata,
          ocrPerformed: true,
          ocrConfidence: ocr.confidence,
          processingTimeMs: elapsedSince(startedAt),
        },
      };
    }

    if (fileType === "pdf" && !baseResult.extractedText.trim()) {
      const ocr = await OCRService.recognizePdf(file, (progress) => {
        options.onProgress?.(15 + progress * 80);
      });
      return {
        extractedText: ocr.text,
        metadata: {
          ...baseResult.metadata,
          pageCount: ocr.pageCount,
          ocrPerformed: true,
          ocrConfidence: ocr.confidence,
          processingTimeMs: elapsedSince(startedAt),
        },
      };
    }

    if (AUDIO_TYPES.has(fileType) || fileType === "mp4") {
      const transcription = await MediaTranscriptionService.transcribe(file, (progress) => {
        options.onProgress?.(15 + progress * 0.8);
      });
      return {
        extractedText: transcription.text,
        metadata: {
          ...baseResult.metadata,
          duration: baseResult.metadata.duration ?? transcription.duration,
          transcriptionPerformed: true,
          transcriptionModel: TRANSCRIPTION_MODEL,
          processingTimeMs: elapsedSince(startedAt),
        },
      };
    }

    return {
      ...baseResult,
      metadata: {
        ...baseResult.metadata,
        processingTimeMs: elapsedSince(startedAt),
      },
    };
  },
};
