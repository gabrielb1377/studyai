import type { ExamAttemptRecord, ExamAttemptResult } from "@/types/exam";
import type { StudyRecord } from "@/types/study-engine";
import { AuthClient } from "@/features/account/AuthClient";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { AISettings } from "@/features/ai/AISettings";
import { RetrievalPipeline } from "@/features/ai/RetrievalPipeline";

export type SecureExamConfig = {
  count: 5 | 10 | 20;
  difficulty: "easy" | "medium" | "hard";
};

function messageFrom(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
  if (message.includes("POSTGRES_UNAVAILABLE")) return "O serviço de provas está indisponível. Tente novamente mais tarde.";
  if (message.includes("AUTH_REQUIRED") || message.includes("SESSION_CHANGED")) return "Sua sessão expirou. Entre novamente para continuar a prova.";
  if (message.includes("EXAM_CONTENT_INSUFFICIENT")) return "Não há conteúdo suficiente nos materiais para gerar esta prova.";
  if (message.includes("EXAM_GENERATION_INVALID") || message.includes("EXAM_QUESTION_COUNT_INVALID")) return "A IA não retornou questões válidas. Tente regenerar.";
  return message;
}

async function withSessionOperation<T>(userId: string, operation: (sessionOperation: ReturnType<typeof SessionOperationManager.start>) => Promise<T>) {
  const sessionOperation = SessionOperationManager.start(userId);
  try {
    return await operation(sessionOperation);
  } finally {
    sessionOperation.release();
  }
}

export const SecureExamClient = {
  async create(study: Pick<StudyRecord, "studyId" | "title" | "subject">, config: SecureExamConfig, userId: string) {
    const chunks = (await RetrievalPipeline.forStudy(study.studyId)).chunks;
    if (chunks.length === 0) {
      throw new Error("Não há conteúdo suficiente nos materiais para gerar esta prova.");
    }
    const settings = AISettings.load();

    return withSessionOperation(userId, (sessionOperation) =>
      AuthClient.request<ExamAttemptRecord>("/api/exam/attempt", {
        method: "POST",
        operation: sessionOperation,
        body: JSON.stringify({
          studyId: study.studyId,
          title: study.title,
          subject: study.subject,
          chunks,
          count: config.count,
          difficulty: config.difficulty,
          mode: settings.mode,
          provider: settings.provider,
          model: settings.models[settings.provider],
          models: settings.models,
        }),
      }),
    );
  },

  async resume(attemptId: string, userId: string) {
    return withSessionOperation(userId, (sessionOperation) =>
      AuthClient.request<ExamAttemptRecord>(`/api/exam/attempt?id=${encodeURIComponent(attemptId)}`, {
        operation: sessionOperation,
      }),
    );
  },

  async grade(attemptId: string, answers: ReadonlyArray<number | null>, userId: string) {
    return withSessionOperation(userId, (sessionOperation) =>
      AuthClient.request<ExamAttemptResult>("/api/exam/grade", {
        method: "POST",
        operation: sessionOperation,
        body: JSON.stringify({ attemptId, answers: answers.map((answer) => answer ?? -1) }),
      }),
    );
  },

  message: messageFrom,
};
