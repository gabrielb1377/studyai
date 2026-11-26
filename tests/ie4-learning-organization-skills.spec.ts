import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { AIResponseCache } from "../src/features/ai/AIResponseCache";
import {
  DOC_ANALYSIS_FIXTURES,
  FIXED_REFERENCE_DATE,
  PLAN_STUDY_FIXTURES,
  SPACED_REPETITION_FIXTURES,
  SkillRegistry,
  buildDeterministicPlanSnapshot,
  buildSpacedRepetitionSnapshot,
  isSkillsEnabled,
  validateDocAnalysisOutput,
  validatePlanStudyAgainstConstraints,
  validatePlanStudyOutput,
  validateSpacedRepetitionAgainstSnapshot,
  validateSpacedRepetitionOutput,
  type PlanStudyOutput,
  type SpacedRepetitionOutput,
} from "../src/features/ai/skills";
import {
  SkillBudgetExecutor,
  type SkillQuotaAdapter,
} from "../src/features/ai/skills/SkillBudgetExecutor";
import { ReviewScheduler } from "../src/features/learning/ReviewScheduler";
import type { TopicReview } from "../src/features/learning/TopicReview";
import type { RetrievedChunk } from "../src/features/retrieval/RetrievalTypes";
import type { Flashcard } from "../src/types/flashcard";
import type { StudyRecord } from "../src/types/study-engine";

function makeChunk(overrides: { id: string; text: string; sourceName: string; score?: number; pageStart?: number }): RetrievedChunk {
  return {
    id: overrides.id,
    studyId: "study-ie4b",
    fileId: `file-${overrides.id}`,
    chunkIndex: 0,
    text: overrides.text,
    score: overrides.score ?? 0.9,
    matchedTerms: ["sistemas"],
    metadata: {
      extractedContentId: `ext-${overrides.id}`,
      sourceName: overrides.sourceName,
      fileType: "pdf",
      mimeType: "application/pdf",
      size: 2048,
      pageStart: overrides.pageStart ?? 19,
    },
  };
}

function createTrackingQuota(): { adapter: SkillQuotaAdapter; reservedRequestIds: string[] } {
  const reservedRequestIds: string[] = [];
  const adapter: SkillQuotaAdapter = {
    reserveSharedBudget: async (_userId, opts) => {
      reservedRequestIds.push(opts.requestId ?? "");
      return {
        allowed: true,
        remaining: 499,
        limit: 500,
        resetAt: new Date(Date.now() + 60_000).toISOString(),
        reservationId: `res-${reservedRequestIds.length}-${randomUUID().slice(0, 4)}`,
        reservedTokens: opts.reserveTokens,
        quota: {
          daily: { used: reservedRequestIds.length, limit: 500, remaining: 500 - reservedRequestIds.length, resetAt: "" },
          minute: { used: reservedRequestIds.length, limit: 20, remaining: 20 - reservedRequestIds.length, resetAt: "" },
          sharedKeysUsed: true,
        },
      };
    },
    reconcileReservation: async (_id, settlement) => ({
      reconciled: true,
      chargedTokens: settlement.providerContacted ? (settlement.usage?.totalTokens ?? 180) : 0,
      releasedTokens: 100,
      usageSource: settlement.usage?.source ?? "estimated",
      status: settlement.outcome === "completed" ? "reconciled" : "failed",
    }),
  };
  return { adapter, reservedRequestIds };
}

test.describe("IE-4B: Registro, Imutabilidade, Budgets e Fallbacks (9/20 Catálogo)", () => {
  const batch2Ids = ["doc.analysis", "plan.study", "technique.spaced-repetition"] as const;

  test("as 3 skills do lote IE-4B estão registradas na versão 0.1.0, imutáveis e com budgets oficiais", () => {
    expect(isSkillsEnabled()).toBe(false);

    for (const id of batch2Ids) {
      expect(SkillRegistry.has(id, "0.1.0")).toBe(true);
      const spec = SkillRegistry.get(id)!;
      expect(spec.version).toBe("0.1.0");
      expect(Object.isFrozen(spec)).toBe(true);
      expect(Object.isFrozen(spec.tokenBudget)).toBe(true);
      expect(Object.isFrozen(spec.safety)).toBe(true);
    }

    expect(SkillRegistry.get("doc.analysis")?.tokenBudget).toEqual({ input: 4000, output: 800 });
    expect(SkillRegistry.get("plan.study")?.tokenBudget).toEqual({ input: 2000, output: 700 });
    expect(SkillRegistry.get("technique.spaced-repetition")?.tokenBudget).toEqual({ input: 1500, output: 400 });

    // 13 Teacher + 3 Piloto (IE-2) + 3 Fundação (IE-4A) + 3 Organização (IE-4B) = 22 registros
    expect(SkillRegistry.list().length).toBeGreaterThanOrEqual(22);

    // Fallbacks 100% válidos em JSON
    expect(validateDocAnalysisOutput(SkillRegistry.get("doc.analysis")!.fallback.content).valid).toBe(true);
    expect(validatePlanStudyOutput(SkillRegistry.get("plan.study")!.fallback.content).valid).toBe(true);
    expect(validateSpacedRepetitionOutput(SkillRegistry.get("technique.spaced-repetition")!.fallback.content).valid).toBe(true);
  });
});

test.describe("IE-4B: doc.analysis (Proveniência, Compressão e Segurança)", () => {
  test("analisa documento fundamentado, rejeita material vazio como analyzed e neutraliza prompt injection", async () => {
    const chunk = makeChunk({
      id: "c-so-19",
      sourceName: "Sistemas Operacionais",
      pageStart: 19,
      text: "No escalonamento Round-Robin cada processo recebe um quantum fixo de CPU.",
    });

    // 1) Documento com conteúdo suficiente
    const okRes = await SkillBudgetExecutor.execute({
      skillId: "doc.analysis",
      userId: `u-doc-1-${randomUUID()}`,
      skipCache: true,
      inputs: DOC_ANALYSIS_FIXTURES.validAnalyzed.inputs,
      context: { chunks: [chunk] },
      provider: async (req) => {
        expect(req.maxOutputTokens).toBe(800);
        return {
          provider: "gemini",
          model: "gemini-2.5-flash",
          text: DOC_ANALYSIS_FIXTURES.validAnalyzed.simulatedOutput,
          usage: { inputTokens: 300, outputTokens: 160, totalTokens: 460, source: "provider" },
        };
      },
    });
    expect(okRes.success).toBe(true);
    expect(okRes.repaired).toBe(false);

    // 2) Documento vazio: rejeita status='analyzed', aceita reparo para insufficient_material
    const emptyRes = await SkillBudgetExecutor.execute({
      skillId: "doc.analysis",
      userId: `u-doc-2-${randomUUID()}`,
      skipCache: true,
      inputs: DOC_ANALYSIS_FIXTURES.insufficientMaterial.inputs,
      context: { chunks: [] },
      provider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: DOC_ANALYSIS_FIXTURES.validAnalyzed.simulatedOutput,
      }),
      repairProvider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: DOC_ANALYSIS_FIXTURES.insufficientMaterial.simulatedOutput,
      }),
    });
    expect(emptyRes.success).toBe(true);
    expect(emptyRes.repaired).toBe(true);

    // 3) Prompt injection neutralizado dentro de <UNTRUSTED_MATERIAL_DATA>
    let capturedMessage = "";
    const injRes = await SkillBudgetExecutor.execute({
      skillId: "doc.analysis",
      userId: `u-doc-3-${randomUUID()}`,
      skipCache: true,
      inputs: DOC_ANALYSIS_FIXTURES.promptInjectionAttempt.inputs,
      provider: async (req) => {
        capturedMessage = req.message;
        return {
          provider: "gemini",
          model: "gemini-2.5-flash",
          text: DOC_ANALYSIS_FIXTURES.promptInjectionAttempt.simulatedOutput,
        };
      },
    });
    expect(injRes.success).toBe(true);
    expect(capturedMessage).toContain("<UNTRUSTED_MATERIAL_DATA>");
    expect(capturedMessage).not.toContain("</UNTRUSTED_MATERIAL_DATA>\nSYSTEM:");
  });

  test("rejeita referência fabricada e referência a chunk descartado pela compressão (4000 tokens)", async () => {
    const keptChunk = makeChunk({
      id: "c-kept",
      sourceName: "Sistemas Operacionais",
      pageStart: 19,
      score: 0.99,
      text: "Round-Robin usa quantum fixo para escalonar processos na fila pronta. ".repeat(550),
    });
    const droppedChunk = makeChunk({
      id: "c-dropped",
      sourceName: "Anexo Descartado Memória Virtual",
      pageStart: 77,
      score: 0.05,
      text: "Paginação sob demanda carrega páginas apenas em page fault. ".repeat(550),
    });

    const citingDropped = JSON.stringify({
      status: "analyzed",
      summary: "Resumo citando anexo descartado.",
      keyConcepts: [
        {
          concept: "Page fault",
          explanation: "Ocorre quando a página não está na RAM.",
          sourceRef: "Anexo Descartado Memória Virtual · p. 77",
        },
      ],
      documentQuestions: ["O que é page fault?"],
      provenance: ["Anexo Descartado Memória Virtual · p. 77"],
    });

    const res = await SkillBudgetExecutor.execute({
      skillId: "doc.analysis",
      userId: `u-doc-drop-${randomUUID()}`,
      skipCache: true,
      inputs: DOC_ANALYSIS_FIXTURES.validAnalyzed.inputs,
      context: { chunks: [keptChunk, droppedChunk] },
      provider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: citingDropped,
      }),
      repairProvider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: DOC_ANALYSIS_FIXTURES.validAnalyzed.simulatedOutput,
      }),
    });

    expect(res.compression.chunks.some((c) => c.id === "c-dropped")).toBe(false);
    expect(res.success).toBe(true);
    expect(res.repaired).toBe(true);
  });
});

test.describe("IE-4B: plan.study (Reuso de PlanningEngine, Restrições e Sem Efeitos Colaterais)", () => {
  const sampleStudies: StudyRecord[] = [
    {
      studyId: "study-grafos",
      title: "Grafos",
      subject: "Algoritmos",
      detectedTopic: "BFS e DFS",
      status: "in_progress",
      progress: 45,
      materialIds: [],
      createdAt: "2026-11-01T10:00:00.000Z",
      updatedAt: "2026-11-20T10:00:00.000Z",
      lastAccessedAt: "2026-11-25T10:00:00.000Z",
    },
    {
      studyId: "study-recursao",
      title: "Recursão",
      subject: "Algoritmos",
      detectedTopic: "Caso Base",
      status: "in_progress",
      progress: 30,
      materialIds: [],
      createdAt: "2026-11-02T10:00:00.000Z",
      updatedAt: "2026-11-21T10:00:00.000Z",
      lastAccessedAt: "2026-11-24T10:00:00.000Z",
    },
  ];

  test("reutiliza PlanningEngine sem efeitos colaterais, valida limites diários e repara plano excedente", async () => {
    const frozenStudiesBefore = JSON.stringify(sampleStudies);
    const snapshot = buildDeterministicPlanSnapshot(
      { goal: "Consolidar Grafos", dailyMinutes: 60, horizonDays: 3 },
      {
        studies: sampleStudies,
        profile: {
          id: "local-user",
          totalStudyMinutes: 120,
          timeBySubject: { Algoritmos: 120 },
          topics: {},
          flashcardsAnswered: 5,
          quizzesCompleted: 1,
          correctAnswers: 7,
          wrongAnswers: 3,
          averageScore: 70,
          activeDates: ["2026-11-24", "2026-11-25", "2026-11-26"],
          streak: 3,
          activities: [],
          createdAt: "2026-11-01T10:00:00.000Z",
          updatedAt: FIXED_REFERENCE_DATE,
        },
        flashcards: [],
        quizzes: [],
        topicReviews: [],
        exams: [],
        now: new Date(FIXED_REFERENCE_DATE),
      },
    );

    expect(snapshot.plan.dailyMinutes).toBe(60);
    expect(snapshot.plan.horizonDays).toBe(3);
    expect(JSON.stringify(sampleStudies)).toBe(frozenStudiesBefore); // zero mutação

    // 1) Plano válido dentro das restrições explícitas
    const okRes = await SkillBudgetExecutor.execute({
      skillId: "plan.study",
      userId: `u-plan-1-${randomUUID()}`,
      skipCache: true,
      inputs: PLAN_STUDY_FIXTURES.validWithinConstraints.inputs,
      context: { profileContextText: snapshot.contextSummary },
      provider: async (req) => {
        expect(req.maxOutputTokens).toBe(700);
        expect(req.message).toContain("Plano determinístico (PlanningEngine)");
        return {
          provider: "gemini",
          model: "gemini-2.5-flash",
          text: PLAN_STUDY_FIXTURES.validWithinConstraints.simulatedOutput,
        };
      },
    });
    expect(okRes.success).toBe(true);
    const constraintCheck = validatePlanStudyAgainstConstraints(okRes.parsed as PlanStudyOutput, {
      dailyMinutes: 60,
      horizonDays: 3,
      allowedStudyIds: ["study-grafos", "study-recursao"],
    });
    expect(constraintCheck.valid).toBe(true);

    // 2) Dados obrigatórios ausentes rejeitados
    await expect(
      SkillBudgetExecutor.execute({
        skillId: "plan.study",
        userId: "u-plan-missing",
        inputs: { goal: "Só meta" },
        provider: async () => ({ provider: "gemini", model: "mock", text: "{}" }),
      }),
    ).rejects.toThrow(/Parâmetro de entrada obrigatório ausente/);

    // 3) Plano excedendo 45 min/dia -> rejeitado e reparado com reserva independente
    const { adapter, reservedRequestIds } = createTrackingQuota();
    const reqId = `req-plan-${randomUUID()}`;
    const repRes = await SkillBudgetExecutor.execute({
      skillId: "plan.study",
      userId: `u-plan-2-${randomUUID()}`,
      requestId: reqId,
      useSharedKeys: true,
      emailVerified: true,
      skipCache: true,
      quotaAdapter: adapter,
      inputs: PLAN_STUDY_FIXTURES.exceedsDailyAvailability.inputs,
      provider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: PLAN_STUDY_FIXTURES.exceedsDailyAvailability.rawInvalid,
        usage: { inputTokens: 150, outputTokens: 90, totalTokens: 240, source: "provider" },
      }),
      repairProvider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: PLAN_STUDY_FIXTURES.exceedsDailyAvailability.repairedOutput,
        usage: { inputTokens: 160, outputTokens: 100, totalTokens: 260, source: "provider" },
      }),
    });
    expect(repRes.success).toBe(true);
    expect(repRes.repaired).toBe(true);
    expect(reservedRequestIds).toEqual([reqId, `${reqId}:repair:1`]);
    expect(repRes.totalChargedTokens).toBe(500);
  });
});

test.describe("IE-4B: technique.spaced-repetition (SM-2/TopicReview, Data Fixa e Cache)", () => {
  const sampleTopicReviews: TopicReview[] = [
    {
      discipline: "Estruturas de Dados",
      studyId: "study-ed",
      topic: "Árvores AVL",
      attempts: 2,
      correct: 1,
      wrong: 1,
      streak: 0,
      result: "wrong",
      difficulty: "hard",
      lastReviewAt: "2026-11-23T12:00:00.000Z",
      nextReviewAt: "2026-11-24T12:00:00.000Z", // late
    },
    {
      discipline: "Estruturas de Dados",
      studyId: "study-ed",
      topic: "Tabelas Hash",
      attempts: 1,
      correct: 1,
      wrong: 0,
      streak: 1,
      result: "correct",
      difficulty: "normal",
      lastReviewAt: "2026-11-25T12:00:00.000Z",
      nextReviewAt: "2026-11-26T15:00:00.000Z", // today
    },
    {
      discipline: "Estruturas de Dados",
      studyId: "study-ed",
      topic: "Grafos Ponderados",
      attempts: 3,
      correct: 3,
      wrong: 0,
      streak: 3,
      result: "correct",
      difficulty: "normal",
      lastReviewAt: "2026-11-20T12:00:00.000Z",
      nextReviewAt: "2026-12-02T12:00:00.000Z", // upcoming
    },
  ];

  const sampleFlashcards: Flashcard[] = [
    {
      id: "fc-sm2-1",
      studyId: "study-ed",
      question: "Qual a complexidade de rotação simples em AVL?",
      answer: "O(1).",
      difficulty: "medium",
      correctAnswers: 1,
      wrongAnswers: 1,
      createdAt: "2026-11-10T10:00:00.000Z",
      updatedAt: "2026-11-22T10:00:00.000Z",
      nextReviewAt: "2026-11-25T10:00:00.000Z",
      lastReviewedAt: "2026-11-22T10:00:00.000Z",
    },
  ];

  test("preserva resultados de ReviewScheduler/TopicReview com data fixa, rejeita tópico inventado e invalida cache por data", async () => {
    const beforeReviews = JSON.stringify(sampleTopicReviews);
    const beforeCards = JSON.stringify(sampleFlashcards);

    // Verifica paridade com ReviewScheduler.isDue
    expect(ReviewScheduler.isDue(sampleFlashcards[0], new Date(FIXED_REFERENCE_DATE))).toBe(true);

    const snapshot = buildSpacedRepetitionSnapshot(sampleTopicReviews, sampleFlashcards, FIXED_REFERENCE_DATE);
    expect(snapshot.hasHistory).toBe(true);
    expect(snapshot.items.find((i) => i.topicId === "study-ed:Árvores AVL")?.period).toBe("late");
    expect(snapshot.items.find((i) => i.topicId === "study-ed:Tabelas Hash")?.period).toBe("today");
    expect(snapshot.items.find((i) => i.topicId === "study-ed:Grafos Ponderados")?.period).toBe("upcoming");
    expect(snapshot.items.find((i) => i.topicId === "card:fc-sm2-1")?.period).toBe("late");

    // 1) Execução válida preservando o snapshot determinístico
    const okRes = await SkillBudgetExecutor.execute({
      skillId: "technique.spaced-repetition",
      userId: `u-sr-1-${randomUUID()}`,
      inputs: SPACED_REPETITION_FIXTURES.validMixedQueue.inputs,
      context: { profileContextText: snapshot.contextSummary },
      provider: async (req) => {
        expect(req.maxOutputTokens).toBe(400);
        return {
          provider: "gemini",
          model: "gemini-2.5-flash",
          text: SPACED_REPETITION_FIXTURES.validMixedQueue.simulatedOutput,
        };
      },
    });
    expect(okRes.success).toBe(true);
    const snapCheck = validateSpacedRepetitionAgainstSnapshot(okRes.parsed as SpacedRepetitionOutput, snapshot);
    expect(snapCheck.valid).toBe(true);

    // 2) Mudança de data de referência invalida naturalmente a chave de cache
    const nextDayRes = await SkillBudgetExecutor.execute({
      skillId: "technique.spaced-repetition",
      userId: `u-sr-1-${randomUUID()}`,
      inputs: { referenceDate: "2026-11-27T12:00:00.000Z" },
      context: { profileContextText: snapshot.contextSummary },
      provider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: SPACED_REPETITION_FIXTURES.validMixedQueue.simulatedOutput,
      }),
    });
    expect(nextDayRes.cacheKey).not.toBe(okRes.cacheKey);

    // 3) Estudante sem histórico
    const emptySnapshot = buildSpacedRepetitionSnapshot([], [], FIXED_REFERENCE_DATE);
    expect(emptySnapshot.hasHistory).toBe(false);
    const emptyOut = JSON.parse(SPACED_REPETITION_FIXTURES.noHistoryInitial.simulatedOutput) as SpacedRepetitionOutput;
    expect(validateSpacedRepetitionAgainstSnapshot(emptyOut, emptySnapshot).valid).toBe(true);

    // 4) Resposta contendo tópico inventado é rejeitada contra o snapshot determinístico
    const inventedOut = JSON.parse(SPACED_REPETITION_FIXTURES.inventedTopicViolation.rawInvented) as SpacedRepetitionOutput;
    const inventedCheck = validateSpacedRepetitionAgainstSnapshot(inventedOut, snapshot);
    expect(inventedCheck.valid).toBe(false);
    expect(inventedCheck.errors.some((e) => e.includes("topicId inventado"))).toBe(true);

    // 5) Nenhuma revisão foi modificada ou marcada como concluída
    expect(JSON.stringify(sampleTopicReviews)).toBe(beforeReviews);
    expect(JSON.stringify(sampleFlashcards)).toBe(beforeCards);

    // 6) Fallback após falha dupla preserva consumo anterior e não grava em cache
    const { adapter } = createTrackingQuota();
    const failRes = await SkillBudgetExecutor.execute({
      skillId: "technique.spaced-repetition",
      userId: `u-sr-fail-${randomUUID()}`,
      useSharedKeys: true,
      emailVerified: true,
      skipCache: true,
      quotaAdapter: adapter,
      inputs: SPACED_REPETITION_FIXTURES.validMixedQueue.inputs,
      provider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: "INVALIDO",
        usage: { inputTokens: 80, outputTokens: 40, totalTokens: 120, source: "provider" },
      }),
      repairProvider: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: "AINDA_INVALIDO",
        usage: { inputTokens: 80, outputTokens: 40, totalTokens: 120, source: "provider" },
      }),
    });
    expect(failRes.fallbackUsed).toBe(true);
    expect(failRes.totalChargedTokens).toBe(240);
    expect(validateSpacedRepetitionOutput(failRes.output).valid).toBe(true);
    expect(AIResponseCache.get(failRes.cacheKey)).toBeNull();
  });
});
