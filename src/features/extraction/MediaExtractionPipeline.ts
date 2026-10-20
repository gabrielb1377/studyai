import { ContentExtractionService } from "./ContentExtractionService";
import {
  MediaTranscriptionService,
  TRANSCRIPTION_MODEL,
} from "./MediaTranscriptionService";
import { DocumentOcrEngine } from "../ocr/engine";
import type { ExtractionFileType, ExtractionResult, OcrMode } from "./ExtractionTypes";
import type { IngestionStageId, IngestionStageStatus } from "./ExtractionTypes";

const IMAGE_TYPES = new Set<ExtractionFileType>(["png", "jpg", "jpeg", "webp"]);
const AUDIO_TYPES = new Set<ExtractionFileType>(["mp3", "wav", "m4a"]);

type PipelineOptions = {
  onProgress?: (progress: number) => void;
  onStage?: (stage: IngestionStageId, status: IngestionStageStatus, message: string) => void | Promise<void>;
  onPage?: (page: number, pages: number) => void;
  ocrMode?: OcrMode;
  signal?: AbortSignal;
};

function elapsedSince(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function ocrStageMessage(ocrPages: number, nativePages: number, failedPages: number, cancelled: boolean) {
  if (cancelled) {
    return `Processamento cancelado pelo usuário. ${ocrPages} página(s) reconhecida(s) antes do cancelamento.`;
  }
  const details = [
    ocrPages > 0 ? `${ocrPages} página(s) com OCR` : "",
    nativePages > 0 ? `${nativePages} página(s) com texto nativo` : "",
    failedPages > 0 ? `${failedPages} página(s) com erro` : "",
  ].filter(Boolean).join(" · ");
  if (ocrPages === 0) return "OCR não foi necessário: o documento possui texto utilizável.";
  return `Extração concluída: ${details}.`;
}

export const MediaExtractionPipeline = {
  async extract(
    file: File,
    fileType: ExtractionFileType,
    options: PipelineOptions = {},
  ): Promise<ExtractionResult> {
    const startedAt = performance.now();
    options.onProgress?.(5);
    const baseMetadata = ContentExtractionService.createBaseMetadata(file);
    const mode = options.ocrMode ?? "auto";

    if (fileType === "pdf" || IMAGE_TYPES.has(fileType)) {
      await options.onStage?.(
        "ocr",
        "processing",
        fileType === "pdf"
          ? "Avaliando páginas, camada de texto e necessidade de OCR."
          : "Executando OCR local na imagem.",
      );
      const result = fileType === "pdf"
        ? await DocumentOcrEngine.processPdf(file, {
            mode,
            signal: options.signal,
            onProgress: (event) => {
              options.onProgress?.(15 + event.progress * 0.8);
              if (event.page) options.onPage?.(event.page, event.pages ?? 0);
            },
          })
        : await DocumentOcrEngine.processImage(file, {
            mode,
            signal: options.signal,
            onProgress: (event) => {
              options.onProgress?.(15 + event.progress * 0.8);
              if (event.page) options.onPage?.(event.page, event.pages ?? 0);
            },
          });

      await options.onStage?.(
        "ocr",
        result.pipeline.cancelled ? "skipped" : result.pipeline.ocrPages > 0 ? "completed" : "skipped",
        ocrStageMessage(
          result.pipeline.ocrPages,
          result.pipeline.nativePages,
          result.pipeline.failedPages,
          result.pipeline.cancelled,
        ),
      );
      options.onProgress?.(95);

      return {
        extractedText: result.extractedText,
        sections: result.sections,
        pages: result.pages,
        pipeline: result.pipeline,
        metadata: {
          ...baseMetadata,
          ...result.metadata,
          processingTimeMs: elapsedSince(startedAt),
        },
      };
    }

    const baseResult = await ContentExtractionService.extract(file, fileType);
    await options.onStage?.("extraction", "completed", "Conteúdo e metadados básicos extraídos.");
    options.onProgress?.(15);

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

    await options.onStage?.("ocr", "skipped", "OCR não é necessário para este formato.");
    return {
      ...baseResult,
      metadata: {
        ...baseResult.metadata,
        processingTimeMs: elapsedSince(startedAt),
      },
    };
  },
};
