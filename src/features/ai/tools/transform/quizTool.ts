/**
 * StudyAI — Tool Engine (TE-4)
 * Ferramenta canônica de preparação de quiz, correção de resposta sem mutação
 * e persistência confirmada de banco de questões (`quiz@0.1.0`).
 *
 * Conforme STUDYAI_TOOL_ENGINE.md §3–§5:
 * - Classe oficial: `transform`.
 * - `mode: "prepare"`: valida questões, separa visão do aluno (`studentQuestions`, sem gabarito)
 *   do gabarito armazenado na proposta (nota explícita: ocultação lógica no cliente não substitui
 *   segurança de servidor), nunca cria tentativa (`QuizResult`) nem altera progresso.
 * - `mode: "correct_answer"`: diferencia correção determinística, feedback pedagógico, hipótese
 *   interpretativa e resposta não verificável; nunca inventa nota oficial nem muta histórico/erros.
 * - `mode: "commit"`: exige permissão `"write"` e confirmação verificada em `ToolConfirmationService`;
 *   persiste apenas questões autorizadas, mantendo `results` (tentativas/notas) intocados.
 */

import { AdaptiveAssessmentEngine } from "@/features/learning/adaptive/AdaptiveAssessmentEngine";
import { QuizService } from "@/features/quiz/QuizService";
import type { QuizDifficulty, QuizQuestion } from "@/types/quiz";
import { filterOwnedRecords } from "../read/AccountReadProvider";
import {
  PreconditionFailedError,
  type ToolConfirmationService,
  type ToolProposalRecord,
} from "../ToolConfirmationService";
import type { ToolExecutorFn, ToolSpec } from "../types";
import {
  findOwnedStudy,
  getToolAccountTransformProvider,
  normalizeDedupeKey,
  runWithVerifiedAccountSession,
} from "./AccountTransformProvider";

export const QUIZ_MAX_QUESTIONS_PER_BATCH = 10;

export type AnswerCorrectionClassification =
  | "deterministic_correction"
  | "pedagogical_feedback"
  | "interpretive_hypothesis"
  | "unverifiable_answer";

export interface StudentQuizQuestionPreview {
  readonly index: number;
  readonly question: string;
  readonly alternatives: readonly string[];
  readonly difficulty: QuizDifficulty;
}

export interface QuizCorrectionResult {
  readonly classification: AnswerCorrectionClassification;
  readonly isCorrect?: boolean;
  readonly expectedAlternativeIndex?: number;
  readonly officialGradeIssued: false;
  readonly feedback: string;
  readonly reference?: string;
  readonly matchedKeywordsCount?: number;
}

export interface QuizToolOutput {
  readonly mode: "prepare" | "commit" | "correct_answer";
  readonly status:
    | "proposal_ready"
    | "committed"
    | "corrected"
    | "no_valid_items"
    | "unauthorized_reference";
  readonly requiresConfirmation: boolean;
  readonly mutatedState: boolean;
  readonly studyId?: string;
  readonly destination?: string;
  readonly proposalId?: string;
  readonly previewHash?: string;
  readonly expiresAt?: string;
  readonly acceptedCount: number;
  readonly rejectedDuplicateCount: number;
  readonly persistedCount: number;
  readonly answerKeySeparated: boolean;
  readonly studentQuestions: readonly StudentQuizQuestionPreview[];
  readonly savedIds: readonly string[];
  readonly correction?: QuizCorrectionResult;
  readonly notice?: string;
}

interface QuizProposalPayload extends Record<string, unknown> {
  readonly studyId: string;
  readonly materialId?: string;
  readonly questions: readonly QuizQuestion[];
}

export const quizToolSpec: ToolSpec = {
  id: "quiz",
  version: "0.1.0",
  class: "transform",
  description:
    "Prepara questões de quiz separando visão do aluno do gabarito, realiza correção classificada sem mutar progresso e persiste questões somente mediante confirmação explícita.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["mode"],
    properties: {
      mode: { type: "string", enum: ["prepare", "commit", "correct_answer"] },
      studyId: { type: "string", minLength: 1, maxLength: 128 },
      materialId: { type: "string", minLength: 1, maxLength: 128 },
      difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
      questions: {
        type: "array",
        maxItems: QUIZ_MAX_QUESTIONS_PER_BATCH,
        items: {
          type: "object",
          required: ["question", "alternatives", "correctAnswer", "explanation"],
          properties: {
            question: { type: "string", minLength: 5, maxLength: 400 },
            alternatives: {
              type: "array",
              maxItems: 4,
              items: { type: "string", minLength: 1, maxLength: 240 },
            },
            correctAnswer: { type: "number", min: 0, max: 3 },
            explanation: { type: "string", minLength: 3, maxLength: 600 },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          },
        },
      },
      proposalId: { type: "string", minLength: 1, maxLength: 128 },
      questionId: { type: "string", minLength: 1, maxLength: 128 },
      selectedAlternativeIndex: { type: "number", min: 0, max: 3 },
      studentAnswerText: { type: "string", minLength: 1, maxLength: 1000 },
      rubricKeywords: {
        type: "array",
        maxItems: 8,
        items: { type: "string", minLength: 1, maxLength: 80 },
      },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: [
      "mode",
      "status",
      "requiresConfirmation",
      "mutatedState",
      "acceptedCount",
      "rejectedDuplicateCount",
      "persistedCount",
      "answerKeySeparated",
      "studentQuestions",
      "savedIds",
    ],
    properties: {
      mode: { type: "string", enum: ["prepare", "commit", "correct_answer"] },
      status: {
        type: "string",
        enum: ["proposal_ready", "committed", "corrected", "no_valid_items", "unauthorized_reference"],
      },
      requiresConfirmation: { type: "boolean" },
      mutatedState: { type: "boolean" },
      studyId: { type: "string", maxLength: 128 },
      destination: { type: "string", maxLength: 180 },
      proposalId: { type: "string", maxLength: 128 },
      previewHash: { type: "string", maxLength: 64 },
      expiresAt: { type: "string", maxLength: 40 },
      acceptedCount: { type: "number", min: 0, max: QUIZ_MAX_QUESTIONS_PER_BATCH },
      rejectedDuplicateCount: { type: "number", min: 0, max: QUIZ_MAX_QUESTIONS_PER_BATCH },
      persistedCount: { type: "number", min: 0, max: QUIZ_MAX_QUESTIONS_PER_BATCH },
      answerKeySeparated: { type: "boolean" },
      studentQuestions: {
        type: "array",
        maxItems: QUIZ_MAX_QUESTIONS_PER_BATCH,
        items: {
          type: "object",
          required: ["index", "question", "alternatives", "difficulty"],
          properties: {
            index: { type: "number", min: 0, max: QUIZ_MAX_QUESTIONS_PER_BATCH },
            question: { type: "string", maxLength: 400 },
            alternatives: {
              type: "array",
              maxItems: 4,
              items: { type: "string", maxLength: 240 },
            },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          },
        },
      },
      savedIds: {
        type: "array",
        maxItems: QUIZ_MAX_QUESTIONS_PER_BATCH,
        items: { type: "string", maxLength: 128 },
      },
      correction: {
        type: "object",
        required: ["classification", "officialGradeIssued", "feedback"],
        properties: {
          classification: {
            type: "string",
            enum: [
              "deterministic_correction",
              "pedagogical_feedback",
              "interpretive_hypothesis",
              "unverifiable_answer",
            ],
          },
          isCorrect: { type: "boolean" },
          expectedAlternativeIndex: { type: "number", min: 0, max: 3 },
          officialGradeIssued: { type: "boolean", enum: [false] },
          feedback: { type: "string", maxLength: 700 },
          reference: { type: "string", maxLength: 200 },
          matchedKeywordsCount: { type: "number", min: 0, max: 8 },
        },
      },
      notice: { type: "string", maxLength: 360 },
    },
  },
  scope: {
    requiredScopes: ["account", "study"],
    crossAccountAllowed: false,
  },
  limits: {
    timeoutMs: 3000,
    maxInputBytes: 14336,
    maxOutputBytes: 15360,
    maxItems: QUIZ_MAX_QUESTIONS_PER_BATCH,
    maxDepth: 6,
    maxCallsPerTurn: 3,
  },
  requiresConfirmation: false,
  audit: {
    recordDuration: true,
    includeStudentContent: false,
    allowedMetadataFields: ["toolId", "toolVersion", "toolClass", "status", "denialReason", "durationMs"],
  },
  tests: {
    deterministicFixtures: true,
    description:
      "Valida preparação sem mutação de tentativas, separação lógica de gabarito, correção em 4 classes e isolamento A->B.",
  },
  available: true,
};

export const executeQuizTool: ToolExecutorFn = async (args, context) => {
  const mode =
    args.mode === "commit"
      ? "commit"
      : args.mode === "correct_answer"
        ? "correct_answer"
        : "prepare";
  const confirmationService = context.confirmationService as ToolConfirmationService | undefined;

  if (mode === "commit") {
    const approved = context.approvedProposal as unknown as
      | ToolProposalRecord<Record<string, unknown>, QuizProposalPayload>
      | undefined;
    if (!approved || approved.toolId !== "quiz") {
      throw new PreconditionFailedError("Proposta confirmada ausente para persistência de quiz.");
    }

    const payload = approved.payload;
    return runWithVerifiedAccountSession(context.userId, async (operation) => {
      const provider = getToolAccountTransformProvider();
      const dataset = await provider.loadQuizContext(context.userId, operation.signal);
      operation.assertCurrent();

      const ownedStudy = findOwnedStudy(
        dataset.studies,
        context.userId,
        payload.studyId,
        payload.materialId,
      );
      if (!ownedStudy) {
        throw new PreconditionFailedError(
          "O estudo ou material de destino não pertence mais à conta ativa.",
        );
      }

      const persisted = await provider.persistQuizQuestions(
        context.userId,
        payload.studyId,
        payload.questions,
        operation.signal,
      );
      operation.assertCurrent();

      return {
        mode: "commit",
        status: "committed",
        requiresConfirmation: true,
        mutatedState: persisted.persistedIds.length > 0,
        studyId: payload.studyId,
        destination: approved.destination,
        proposalId: approved.proposalId,
        previewHash: approved.previewHash,
        acceptedCount: payload.questions.length,
        rejectedDuplicateCount: persisted.skippedDuplicates,
        persistedCount: persisted.persistedIds.length,
        answerKeySeparated: true,
        studentQuestions: payload.questions.map((q, index) => ({
          index,
          question: q.question,
          alternatives: [...q.alternatives],
          difficulty: q.difficulty,
        })),
        savedIds: [...persisted.persistedIds],
        notice:
          "Questões persistidas no banco do estudo sem criar tentativas nem alterar notas/progresso.",
      } satisfies QuizToolOutput as unknown as Record<string, unknown>;
    });
  }

  if (mode === "correct_answer") {
    const studyId = typeof args.studyId === "string" ? args.studyId.trim() : "";
    const questionId = typeof args.questionId === "string" ? args.questionId.trim() : undefined;
    const selectedIndex =
      typeof args.selectedAlternativeIndex === "number" ? args.selectedAlternativeIndex : undefined;
    const studentAnswerText =
      typeof args.studentAnswerText === "string" ? args.studentAnswerText.trim() : undefined;
    const rubricKeywords = Array.isArray(args.rubricKeywords)
      ? args.rubricKeywords
          .filter((kw): kw is string => typeof kw === "string" && kw.trim().length > 0)
          .slice(0, 8)
      : [];

    if (!studyId) {
      throw new Error("Modo correct_answer exige studyId.");
    }

    return runWithVerifiedAccountSession(context.userId, async (operation) => {
      const provider = getToolAccountTransformProvider();
      const dataset = await provider.loadQuizContext(context.userId, operation.signal);
      operation.assertCurrent();

      const ownedStudy = findOwnedStudy(dataset.studies, context.userId, studyId);
      if (!ownedStudy) {
        return {
          mode: "correct_answer",
          status: "unauthorized_reference",
          requiresConfirmation: false,
          mutatedState: false,
          acceptedCount: 0,
          rejectedDuplicateCount: 0,
          persistedCount: 0,
          answerKeySeparated: true,
          studentQuestions: [],
          savedIds: [],
          correction: {
            classification: "unverifiable_answer",
            officialGradeIssued: false,
            feedback:
              "Estudo não encontrado na conta ativa; não é possível verificar a resposta nem atribuir nota.",
          },
        } satisfies QuizToolOutput as unknown as Record<string, unknown>;
      }

      const ownedQuestions = filterOwnedRecords(dataset.questions, context.userId).filter(
        (q) => q.studyId === studyId,
      );
      const matchedQuestion = questionId
        ? ownedQuestions.find((q) => q.id === questionId)
        : undefined;

      // 1. Correção determinística: questão autorizada + índice objetivo válido (0..3)
      if (
        matchedQuestion &&
        selectedIndex !== undefined &&
        Number.isInteger(selectedIndex) &&
        selectedIndex >= 0 &&
        selectedIndex < matchedQuestion.alternatives.length
      ) {
        const isCorrect = selectedIndex === matchedQuestion.correctAnswer;
        return {
          mode: "correct_answer",
          status: "corrected",
          requiresConfirmation: false,
          mutatedState: false,
          studyId,
          acceptedCount: 0,
          rejectedDuplicateCount: 0,
          persistedCount: 0,
          answerKeySeparated: true,
          studentQuestions: [],
          savedIds: [],
          correction: {
            classification: "deterministic_correction",
            isCorrect,
            expectedAlternativeIndex: matchedQuestion.correctAnswer,
            officialGradeIssued: false,
            feedback: `${isCorrect ? "Alternativa correta." : "Alternativa incorreta."} ${matchedQuestion.explanation}`.slice(
              0,
              700,
            ),
            reference: `studyId=${studyId} · questionId=${matchedQuestion.id}`.slice(0, 200),
          },
          notice:
            "Correção determinística sem criação de tentativa, sem alteração de desempenho e sem gravação no Caderno de Erros.",
        } satisfies QuizToolOutput as unknown as Record<string, unknown>;
      }

      // 2. Hipótese interpretativa: resposta aberta comparada a rubrica/explicação da questão autorizada
      if (matchedQuestion && studentAnswerText) {
        const normalizedAnswer = normalizeDedupeKey(studentAnswerText);
        const keywords =
          rubricKeywords.length > 0
            ? rubricKeywords
            : matchedQuestion.explanation
                .split(/[^a-zA-ZÀ-ÿ0-9]+/)
                .filter((token) => token.length >= 5)
                .slice(0, 6);
        const matchedCount = keywords.filter((kw) =>
          normalizedAnswer.includes(normalizeDedupeKey(kw)),
        ).length;
        return {
          mode: "correct_answer",
          status: "corrected",
          requiresConfirmation: false,
          mutatedState: false,
          studyId,
          acceptedCount: 0,
          rejectedDuplicateCount: 0,
          persistedCount: 0,
          answerKeySeparated: true,
          studentQuestions: [],
          savedIds: [],
          correction: {
            classification: "interpretive_hypothesis",
            officialGradeIssued: false,
            matchedKeywordsCount: matchedCount,
            feedback:
              `Hipótese interpretativa (não constitui nota oficial): identificados ${matchedCount}/${keywords.length} termos alinhados à referência. Gabarito conceitual: ${matchedQuestion.explanation}`.slice(
                0,
                700,
              ),
            reference: `studyId=${studyId} · questionId=${matchedQuestion.id}`.slice(0, 200),
          },
          notice: "Análise interpretativa sem nota oficial e sem alteração de histórico.",
        } satisfies QuizToolOutput as unknown as Record<string, unknown>;
      }

      // 3. Feedback pedagógico: resposta textual sem questionId verificável (sem inventar nota/critério oficial)
      if (!questionId && studentAnswerText) {
        return {
          mode: "correct_answer",
          status: "corrected",
          requiresConfirmation: false,
          mutatedState: false,
          studyId,
          acceptedCount: 0,
          rejectedDuplicateCount: 0,
          persistedCount: 0,
          answerKeySeparated: true,
          studentQuestions: [],
          savedIds: [],
          correction: {
            classification: "pedagogical_feedback",
            officialGradeIssued: false,
            feedback:
              "Feedback pedagógico sem gabarito oficial vinculado: verifique se a resposta define o conceito central, justifica a relação com o material do estudo e cita um contraexemplo ou condição de contorno.",
            reference: `studyId=${studyId} · ${ownedStudy.title}`.slice(0, 200),
          },
          notice: "Feedback orientativo apenas; nenhuma nota oficial foi atribuída e nenhum dado foi salvo.",
        } satisfies QuizToolOutput as unknown as Record<string, unknown>;
      }

      // 4. Resposta não verificável (questionId inexistente/de outra conta ou entrada insuficiente)
      return {
        mode: "correct_answer",
        status: "corrected",
        requiresConfirmation: false,
        mutatedState: false,
        studyId,
        acceptedCount: 0,
        rejectedDuplicateCount: 0,
        persistedCount: 0,
        answerKeySeparated: true,
        studentQuestions: [],
        savedIds: [],
        correction: {
          classification: "unverifiable_answer",
          officialGradeIssued: false,
          feedback:
            "Resposta não verificável: questão ou referência oficial não encontrada na conta ativa. Nenhum critério ou nota oficial foi inventado.",
        },
      } satisfies QuizToolOutput as unknown as Record<string, unknown>;
    });
  }

  // Modo `prepare`: preparação pura de questões (ZERO escrita persistente, ZERO tentativa)
  const studyId = typeof args.studyId === "string" ? args.studyId.trim() : "";
  const materialId = typeof args.materialId === "string" ? args.materialId.trim() : undefined;
  const rawQuestions = Array.isArray(args.questions) ? args.questions : [];

  if (!studyId || rawQuestions.length === 0) {
    throw new Error("Modo prepare de quiz exige studyId e ao menos uma questão.");
  }
  if (!confirmationService) {
    throw new Error("Serviço de confirmação indisponível para registrar proposta de quiz.");
  }

  return runWithVerifiedAccountSession(context.userId, async (operation) => {
    const provider = getToolAccountTransformProvider();
    const dataset = await provider.loadQuizContext(context.userId, operation.signal);
    operation.assertCurrent();

    const ownedStudy = findOwnedStudy(dataset.studies, context.userId, studyId, materialId);
    if (!ownedStudy) {
      return {
        mode: "prepare",
        status: "unauthorized_reference",
        requiresConfirmation: true,
        mutatedState: false,
        acceptedCount: 0,
        rejectedDuplicateCount: 0,
        persistedCount: 0,
        answerKeySeparated: true,
        studentQuestions: [],
        savedIds: [],
        notice: "Estudo ou material de referência não encontrado na conta ativa.",
      } satisfies QuizToolOutput as unknown as Record<string, unknown>;
    }

    const ownedResults = filterOwnedRecords(dataset.results, context.userId).filter(
      (r) => r.studyId === studyId,
    );
    const defaultDifficulty: QuizDifficulty =
      args.difficulty === "easy" || args.difficulty === "medium" || args.difficulty === "hard"
        ? args.difficulty
        : AdaptiveAssessmentEngine.recommendTargetDifficulty(undefined, ownedResults);

    const existingOwnedQuestions = filterOwnedRecords(dataset.questions, context.userId).filter(
      (q) => q.studyId === studyId,
    );
    const seenKeys = new Set(existingOwnedQuestions.map((q) => normalizeDedupeKey(q.question)));

    const validatedInput: Array<
      Pick<QuizQuestion, "question" | "alternatives" | "correctAnswer" | "explanation" | "difficulty">
    > = [];
    let rejectedDuplicateCount = 0;

    for (const raw of rawQuestions.slice(0, QUIZ_MAX_QUESTIONS_PER_BATCH)) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const question = typeof item.question === "string" ? item.question.trim() : "";
      const alternatives = Array.isArray(item.alternatives)
        ? item.alternatives
            .filter((alt): alt is string => typeof alt === "string" && alt.trim().length > 0)
            .map((alt) => alt.trim())
        : [];
      const uniqueAlts = new Set(alternatives.map((alt) => normalizeDedupeKey(alt)));
      const correctAnswer = typeof item.correctAnswer === "number" ? item.correctAnswer : -1;
      const explanation = typeof item.explanation === "string" ? item.explanation.trim() : "";
      const difficulty: QuizDifficulty =
        item.difficulty === "easy" || item.difficulty === "medium" || item.difficulty === "hard"
          ? item.difficulty
          : defaultDifficulty;

      if (
        question.length < 5 ||
        alternatives.length !== 4 ||
        uniqueAlts.size !== 4 ||
        !Number.isInteger(correctAnswer) ||
        correctAnswer < 0 ||
        correctAnswer >= 4 ||
        explanation.length < 3
      ) {
        continue;
      }

      const key = normalizeDedupeKey(question);
      if (seenKeys.has(key)) {
        rejectedDuplicateCount += 1;
        continue;
      }
      seenKeys.add(key);

      validatedInput.push({
        question,
        alternatives,
        correctAnswer,
        explanation,
        difficulty,
      });
    }

    if (validatedInput.length === 0) {
      return {
        mode: "prepare",
        status: "no_valid_items",
        requiresConfirmation: true,
        mutatedState: false,
        studyId,
        acceptedCount: 0,
        rejectedDuplicateCount,
        persistedCount: 0,
        answerKeySeparated: true,
        studentQuestions: [],
        savedIds: [],
        notice: "Nenhuma questão válida e única disponível após validação de alternativas e duplicatas.",
      } satisfies QuizToolOutput as unknown as Record<string, unknown>;
    }

    const createdQuestions = QuizService.createQuestions(studyId, validatedInput);
    const studentQuestions: StudentQuizQuestionPreview[] = createdQuestions.map((q, index) => ({
      index,
      question: q.question,
      alternatives: [...q.alternatives],
      difficulty: q.difficulty,
    }));

    const destination = `quizzes:${studyId}`;
    const proposal = confirmationService.createProposal({
      toolId: "quiz",
      toolVersion: quizToolSpec.version,
      userId: context.userId,
      sessionId: context.sessionId,
      turnId: context.turnId,
      destination,
      canonicalArgs: args,
      preview: {
        studyId,
        ...(materialId ? { materialId } : {}),
        studentQuestions,
        questionCount: createdQuestions.length,
        answerKeySeparated: true,
      },
      payload: {
        studyId,
        ...(materialId ? { materialId } : {}),
        questions: createdQuestions,
      } satisfies QuizProposalPayload,
    });

    return {
      mode: "prepare",
      status: "proposal_ready",
      requiresConfirmation: true,
      mutatedState: false,
      studyId,
      destination,
      proposalId: proposal.proposalId,
      previewHash: proposal.previewHash,
      expiresAt: proposal.expiresAt,
      acceptedCount: createdQuestions.length,
      rejectedDuplicateCount,
      persistedCount: 0,
      answerKeySeparated: true,
      studentQuestions,
      savedIds: [],
      notice:
        "Pré-visualização pronta sem gabarito na visão do aluno (separação lógica no cliente, não segurança de servidor). Nenhuma tentativa ou questão foi persistida.",
    } satisfies QuizToolOutput as unknown as Record<string, unknown>;
  });
};
