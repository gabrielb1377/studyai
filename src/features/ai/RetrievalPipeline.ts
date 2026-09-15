import { RetrievalService } from "@/features/retrieval/RetrievalService";

export const RetrievalPipeline = {
  forQuestion(question: string, studyId?: string) {
    return RetrievalService.retrieve(question, { studyId });
  },

  forStudy(studyId: string, limit = 12) {
    return RetrievalService.forStudy(studyId, limit);
  },
};
