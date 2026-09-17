import { ContentExtractionService } from "./ContentExtractionService";
import { OCRService } from "./OCRService";
import {
  MediaTranscriptionService,
  TRANSCRIPTION_MODEL,
} from "./MediaTranscriptionService";
import { TextNormalizationService } from "./TextNormalizationService";
import type { ExtractionFileType, ExtractionResult } from "./ExtractionTypes";
import type { IngestionStageId, IngestionStageStatus } from "./ExtractionTypes";

const IMAGE_TYPES = new Set<ExtractionFileType>(["png", "jpg", "jpeg", "webp"]);
const AUDIO_TYPES = new Set<ExtractionFileType>(["mp3", "wav", "m4a"]);

type PipelineOptions = {
  onProgress?: (progress: number) => void;
  onStage?: (stage: IngestionStageId, status: IngestionStageStatus, message: string) => void | Promise<void>;
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
    await options.onStage?.("extraction", "completed", "Conteúdo e metadados básicos extraídos.");
    options.onProgress?.(15);

    if (IMAGE_TYPES.has(fileType)) {
      await options.onStage?.("ocr", "processing", "Executando OCR na imagem.");
      const ocr = await OCRService.recognizeImage(file, (progress) => {
        options.onProgress?.(15 + progress * 80);
      });
      await options.onStage?.("ocr", "completed", "Texto reconhecido na imagem.");
      return {
        extractedText: ocr.text,
        sections: TextNormalizationService.toSections(ocr.text),
        metadata: {
          ...baseResult.metadata,
          ocrPerformed: true,
          ocrConfidence: ocr.confidence,
          processingTimeMs: elapsedSince(startedAt),
        },
      };
    }

    if (fileType === "pdf" && !baseResult.metadata.hasTextLayer) {
      await options.onStage?.("ocr", "processing", "PDF sem texto: executando OCR.");
      const ocr = await OCRService.recognizePdf(file, (progress) => {
        options.onProgress?.(15 + progress * 80);
      });
      await options.onStage?.("ocr", "completed", "OCR concluído no PDF sem camada de texto.");
      return {
        extractedText: ocr.text,
        sections: TextNormalizationService.toSections(ocr.text),
        metadata: {
          ...baseResult.metadata,
          pageCount: ocr.pageCount,
          ocrPerformed: true,
          ocrConfidence: ocr.confidence,
          processingTimeMs: elapsedSince(startedAt),
        },
      };
    }

    if (fileType === "pdf") {
      await options.onStage?.("ocr", "skipped", "OCR ignorado: o PDF possui camada de texto.");
    } else if (!IMAGE_TYPES.has(fileType)) {
      await options.onStage?.("ocr", "skipped", "OCR não é necessário para este formato.");
    }

    if (AUDIO_TYPES.has(fileType) || fileType === "mp4") {
      await options.onStage?.("extraction", "processing", fileType === "mp4"
        ? "Extraindo áudio do vídeo e transcrevendo localmente."
        : "Transcrevendo o áudio localmente.");
      const transcription = await MediaTranscriptionService.transcribe(file, (progress) => {
        options.onProgress?.(15 + progress * 0.8);
      });
      await options.onStage?.("extraction", "completed", "Transcrição dividida em blocos com timestamps.");
      return {
        extractedText: transcription.text,
        sections: transcription.chapters.map((chapter) => ({
          type: "heading" as const,
          text: chapter.title,
        })),
        transcription: {
          segments: transcription.segments,
          chapters: transcription.chapters,
        },
        metadata: {
          ...baseResult.metadata,
          duration: baseResult.metadata.duration ?? transcription.duration,
          transcriptionPerformed: true,
          transcriptionModel: TRANSCRIPTION_MODEL,
          transcriptionConfidence: transcription.confidence,
          language: transcription.language,
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
