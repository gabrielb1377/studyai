import { ContentExtractionService } from "./ContentExtractionService";
import { ContentStorage } from "./ContentStorage";
import { MediaExtractionPipeline } from "./MediaExtractionPipeline";
import { ChunkService } from "@/features/retrieval/ChunkService";
import { ChunkStorage } from "@/features/retrieval/ChunkStorage";
import { EmbeddingStorage } from "@/features/retrieval/EmbeddingStorage";
import type {
  ExtractedContent,
  ExtractionFileType,
  ExtractionInput,
  ExtractionProgress,
} from "./ExtractionTypes";

type PipelineOptions = {
  onProgress?: (progress: ExtractionProgress) => void;
};

function synchronizeEmbeddings() {
  try {
    EmbeddingStorage.synchronize(ChunkStorage.load().chunks);
  } catch {
    return;
  }
}

function createRecord(
  input: ExtractionInput,
  studyId: string,
  fileType: ExtractionFileType,
  createdAt: string,
): ExtractedContent {
  return {
    id: `extraction-${input.id}`,
    studyId,
    fileId: input.id,
    fileType,
    extractedText: "",
    metadata: ContentExtractionService.createBaseMetadata(input.file),
    status: "processing",
    createdAt,
  };
}

export const ExtractionPipeline = {
  async run(inputs: readonly ExtractionInput[], options: PipelineOptions = {}) {
    const results: ExtractedContent[] = [];

    for (const input of inputs) {
      const studyId = input.studyId;
      const fileType = input.file.name.split(".").pop()?.toLowerCase() as ExtractionFileType;
      const processingRecord = createRecord(
        input,
        studyId,
        fileType,
        new Date().toISOString(),
      );
      ContentStorage.upsert(processingRecord);
      ChunkStorage.replaceForContent(processingRecord.id, []);
      synchronizeEmbeddings();
      options.onProgress?.({ fileId: input.id, status: "processing", progress: 15 });

      try {
        const extraction = await MediaExtractionPipeline.extract(input.file, fileType, {
          onProgress: (progress) => options.onProgress?.({
            fileId: input.id,
            status: "processing",
            progress: Math.min(95, Math.max(15, Math.round(progress))),
          }),
        });
        const extractedRecord: ExtractedContent = {
          ...processingRecord,
          ...extraction,
          status: "extracted",
        };
        ContentStorage.upsert(extractedRecord);
        ChunkStorage.replaceForContent(
          extractedRecord.id,
          ChunkService.createChunks(extractedRecord),
        );
        synchronizeEmbeddings();
        options.onProgress?.({ fileId: input.id, status: "extracted", progress: 100 });
        results.push(extractedRecord);
      } catch (error) {
        const errorRecord: ExtractedContent = {
          ...processingRecord,
          status: "error",
          error: error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Erro inesperado na extração.",
        };
        ContentStorage.upsert(errorRecord);
        options.onProgress?.({ fileId: input.id, status: "error", progress: 100 });
        results.push(errorRecord);
      }
    }

    return results;
  },
};
