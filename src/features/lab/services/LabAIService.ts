import { AIClient } from "@/features/ai/AIClient";
import { RetrievalPipeline } from "@/features/ai/RetrievalPipeline";
import type { AIResponse } from "@/features/ai/AIProvider";
import { LabFeedbackParser } from "./LabFeedbackParser";
import type { LabProject, LabReviewRequest } from "../types";

export const LabAIService = {
  async review(project: LabProject) {
    const retrieval = project.studyId
      ? await RetrievalPipeline.forQuestion(project.exercise.statement, project.studyId)
      : undefined;
    const request: LabReviewRequest = {
      projectId: project.id,
      studyId: project.studyId,
      subject: project.subject,
      topic: project.topic,
      language: project.language,
      statement: project.exercise.statement,
      answer: project.files[project.language] ?? "",
      expectedResult: project.exercise.expectedResult,
      errors: project.lastResult?.error ? [project.lastResult.error] : [],
      context: (retrieval?.chunks ?? []).slice(0, 3).map((chunk) => ({ sourceName: chunk.metadata.sourceName, text: chunk.text })),
    };
    const response = await AIClient.request<AIResponse>("/api/lab/review", { request }, "Não foi possível corrigir o exercício.");
    return LabFeedbackParser.parse(response.text, response);
  },
};
