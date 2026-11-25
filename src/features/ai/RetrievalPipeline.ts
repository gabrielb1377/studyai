import { RetrievalService } from "@/features/retrieval/RetrievalService";
import { ContentStorage } from "@/features/extraction/ContentStorage";
import { contentNeedsTutorReview } from "@/features/ocr/exercise-review";
import type { RetrievalResult } from "@/features/retrieval/RetrievalTypes";

async function reviewedContext(result: Promise<RetrievalResult>): Promise<RetrievalResult> {
  const [retrieved, contents] = await Promise.all([result, ContentStorage.load()]);
  const pending = new Set(contents.records.filter(contentNeedsTutorReview).map((record) => record.fileId));
  if (!pending.size) return retrieved;
  const chunks = retrieved.chunks.filter((chunk) => !pending.has(chunk.fileId));
  const knowledge = retrieved.knowledge;
  if (!knowledge) return { ...retrieved, chunks, hasContext: chunks.length > 0 };
  const concepts = knowledge.concepts.filter(({ concept }) => !pending.has(concept.fileId))
    .map((match) => ({ ...match, related: match.related.filter((concept) => !pending.has(concept.fileId)) }));
  return {
    ...retrieved, chunks, hasContext: chunks.length > 0,
    knowledge: { ...knowledge, concepts, expandedQuery: retrieved.question, relationCount: 0, hasContext: concepts.length > 0 },
  };
}

export const RetrievalPipeline = {
  forQuestion(question: string, studyId?: string) {
    return reviewedContext(RetrievalService.retrieve(question, { studyId, limit: 3 }));
  },

  forStudy(studyId: string, limit = 3) {
    return reviewedContext(RetrievalService.forStudy(studyId, limit));
  },
};
