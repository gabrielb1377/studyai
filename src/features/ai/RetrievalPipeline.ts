import { RetrievalService } from "@/features/retrieval/RetrievalService";

export const RetrievalPipeline = {
  forQuestion(question: string, studyId?: string) {
    return RetrievalService.retrieve(question, { studyId, limit: 3 });
  },

  forStudy(studyId: string, limit = 3) {
    return RetrievalService.forStudy(studyId, limit);
  },
};
