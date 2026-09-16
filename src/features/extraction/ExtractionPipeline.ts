import { MaterialService } from "@/services/material-service";
import { StudyEngine } from "@/features/study/services/StudyEngine";
import { ChunkService } from "@/features/retrieval/ChunkService";
import { ChunkStorage } from "@/features/retrieval/ChunkStorage";
import { EmbeddingStorage } from "@/features/retrieval/EmbeddingStorage";
import { ContentExtractionService } from "./ContentExtractionService";
import { ContentStorage } from "./ContentStorage";
import { DocumentAnalyzer } from "./DocumentAnalyzer";
import {
  createExtractionError,
  createIngestionLog,
  createIngestionStages,
  updateIngestionStage,
} from "./IngestionState";
import { MediaExtractionPipeline } from "./MediaExtractionPipeline";
import { TextNormalizationService } from "./TextNormalizationService";
import type {
  ExtractedContent,
  ExtractionFileType,
  ExtractionInput,
  ExtractionProgress,
  IngestionStageId,
  IngestionStageStatus,
} from "./ExtractionTypes";

type PipelineOptions = {
  onProgress?: (progress: ExtractionProgress) => void;
};

function createRecord(
  input: ExtractionInput,
  studyId: string,
  fileType: ExtractionFileType,
  createdAt: string,
): ExtractedContent {
  const stages = updateIngestionStage(
    createIngestionStages(),
    "document",
    "completed",
    "Arquivo carregado e validado.",
    createdAt,
  );
  return {
    id: `extraction-${input.id}`,
    studyId,
    fileId: input.id,
    fileType,
    extractedText: "",
    metadata: ContentExtractionService.createBaseMetadata(input.file),
    stages,
    logs: [createIngestionLog("document", "completed", "Arquivo carregado e validado.")],
    status: "processing",
    createdAt,
  };
}

function setStage(
  record: ExtractedContent,
  stage: IngestionStageId,
  status: IngestionStageStatus,
  message: string,
) {
  const next = {
    ...record,
    stages: updateIngestionStage(record.stages ?? createIngestionStages(), stage, status, message),
    logs: status === "pending"
      ? record.logs
      : [...(record.logs ?? []), createIngestionLog(stage, status, message)],
  };
  ContentStorage.upsert(next);
  return next;
}

function updateStudy(record: ExtractedContent) {
  StudyEngine.save(StudyEngine.enrichDocument(StudyEngine.load(), record.studyId, {
    initialSummary: record.metadata.summaryPreview,
    detectedTitle: record.metadata.title,
    detectedSubject: record.metadata.subject,
    detectedTopic: record.metadata.topic,
    keywords: record.metadata.keywords,
    language: record.metadata.language,
  }));
}

export const ExtractionPipeline = {
  async run(inputs: readonly ExtractionInput[], options: PipelineOptions = {}) {
    const results: ExtractedContent[] = [];

    for (const input of inputs) {
      const studyId = input.studyId;
      const fileType = input.file.name.split(".").pop()?.toLowerCase() as ExtractionFileType;
      let currentStage: IngestionStageId = "extraction";
      let record = createRecord(input, studyId, fileType, new Date().toISOString());
      ContentStorage.upsert(record);
      ChunkStorage.replaceForContent(record.id, []);
      record = setStage(record, "extraction", "processing", "Lendo conteúdo e metadados do arquivo.");
      options.onProgress?.({
        fileId: input.id,
        status: "processing",
        progress: 10,
        stage: "extraction",
        message: "Lendo o arquivo.",
      });

      try {
        const extraction = await MediaExtractionPipeline.extract(input.file, fileType, {
          onProgress: (progress) => options.onProgress?.({
            fileId: input.id,
            status: "processing",
            progress: Math.min(65, Math.max(10, Math.round(progress * 0.6))),
            stage: currentStage,
          }),
          onStage: (stage, status, message) => {
            currentStage = stage;
            record = setStage(record, stage, status, message);
          },
        });

        currentStage = "normalization";
        record = setStage(record, "normalization", "processing", "Corrigindo Unicode, espaços e quebras de linha.");
        const normalizedText = TextNormalizationService.normalize(extraction.extractedText);
        const normalizedSections = extraction.sections?.map((section) => ({
          ...section,
          text: TextNormalizationService.normalize(section.text),
        })).filter((section) => section.text.length > 0);
        record = setStage(record, "normalization", "completed", "Texto normalizado antes da indexação.");
        options.onProgress?.({ fileId: input.id, status: "processing", progress: 70, stage: "normalization" });

        currentStage = "analysis";
        record = setStage(record, "analysis", "processing", "Identificando título, tema, idioma e palavras-chave.");
        const material = MaterialService.findById(input.id);
        const analysis = DocumentAnalyzer.analyze({
          fileName: input.file.name,
          text: normalizedText,
          sections: normalizedSections,
          metadata: extraction.metadata,
          fallbackSubject: material?.subject,
        });
        record = {
          ...record,
          ...extraction,
          extractedText: normalizedText,
          sections: normalizedSections,
          metadata: {
            ...extraction.metadata,
            ...analysis,
            processingTimeMs: extraction.metadata.processingTimeMs,
          },
          status: "extracted",
        };
        record = setStage(record, "analysis", "completed", "Metadados inteligentes gerados localmente.");
        ContentStorage.upsert(record);
        updateStudy(record);
        options.onProgress?.({ fileId: input.id, status: "processing", progress: 78, stage: "analysis" });

        currentStage = "chunks";
        record = setStage(record, "chunks", "processing", "Dividindo apenas o texto normalizado.");
        const chunks = ChunkService.createChunks(record);
        ChunkStorage.replaceForContent(record.id, chunks);
        record = setStage(
          record,
          "chunks",
          chunks.length > 0 ? "completed" : "skipped",
          chunks.length > 0 ? `${chunks.length} chunks gerados.` : "Nenhum texto disponível para gerar chunks.",
        );
        options.onProgress?.({ fileId: input.id, status: "processing", progress: 88, stage: "chunks" });

        if (chunks.length > 0) {
          currentStage = "embeddings";
          record = setStage(record, "embeddings", "processing", "Gerando índice semântico após a normalização.");
          try {
            EmbeddingStorage.synchronize(ChunkStorage.load().chunks);
            record = setStage(record, "embeddings", "completed", "Embeddings locais gerados.");
            record = setStage(record, "indexed", "completed", "Documento disponível para busca e Tutor IA.");
          } catch (embeddingError) {
            const details = createExtractionError(embeddingError, input.file.name, "embeddings");
            record = {
              ...setStage(record, "embeddings", "error", details.reason),
              errorDetails: details,
            };
            record = setStage(record, "indexed", "error", "Busca lexical disponível; índice semântico indisponível.");
          }
        } else {
          record = setStage(record, "embeddings", "skipped", "Embeddings ignorados porque não há texto.");
          record = setStage(record, "indexed", "skipped", "Documento salvo somente com metadados.");
        }

        ContentStorage.upsert(record);
        options.onProgress?.({
          fileId: input.id,
          status: "extracted",
          progress: 100,
          stage: "indexed",
          message: record.errorDetails ? "Extraído com aviso de indexação." : "Pipeline concluído.",
          errorDetails: record.errorDetails,
        });
        results.push(record);
      } catch (error) {
        const errorDetails = createExtractionError(error, input.file.name, currentStage);
        const errorRecord: ExtractedContent = {
          ...setStage(record, currentStage, "error", errorDetails.reason),
          status: "error",
          error: errorDetails.reason,
          errorDetails,
        };
        ContentStorage.upsert(errorRecord);
        options.onProgress?.({
          fileId: input.id,
          status: "error",
          progress: 100,
          stage: currentStage,
          message: errorDetails.reason,
          errorDetails,
        });
        results.push(errorRecord);
      }
    }

    return results;
  },
};
