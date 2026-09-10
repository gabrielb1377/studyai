import { ContentExtractionService } from "./ContentExtractionService";
import { ContentStorage } from "./ContentStorage";
import type {
  ExtractedContent,
  ExtractionFileType,
  ExtractionInput,
  ExtractionProgress,
} from "./ExtractionTypes";

export const UNASSIGNED_STUDY_ID = "unassigned";

type PipelineOptions = {
  studyId?: string;
  onProgress?: (progress: ExtractionProgress) => void;
};

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
    const studyId = options.studyId ?? UNASSIGNED_STUDY_ID;
    const results: ExtractedContent[] = [];

    for (const input of inputs) {
      const fileType = input.file.name.split(".").pop()?.toLowerCase() as ExtractionFileType;
      const processingRecord = createRecord(
        input,
        studyId,
        fileType,
        new Date().toISOString(),
      );
      ContentStorage.upsert(processingRecord);
      options.onProgress?.({ fileId: input.id, status: "processing", progress: 15 });

      try {
        const extraction = await ContentExtractionService.extract(input.file, fileType);
        const extractedRecord: ExtractedContent = {
          ...processingRecord,
          ...extraction,
          status: "extracted",
        };
        ContentStorage.upsert(extractedRecord);
        options.onProgress?.({ fileId: input.id, status: "extracted", progress: 100 });
        results.push(extractedRecord);
      } catch (error) {
        const errorRecord: ExtractedContent = {
          ...processingRecord,
          status: "error",
          error: error instanceof Error ? error.message : "Erro inesperado na extração.",
        };
        ContentStorage.upsert(errorRecord);
        options.onProgress?.({ fileId: input.id, status: "error", progress: 100 });
        results.push(errorRecord);
      }
    }

    return results;
  },
};
