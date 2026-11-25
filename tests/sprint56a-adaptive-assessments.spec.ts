import { expect, test, type Page } from "@playwright/test";
import { AdaptiveAssessmentEngine } from "../src/features/learning/adaptive/AdaptiveAssessmentEngine";
import type { ErrorNotebookEntry } from "../src/features/learning/errors/types";
import { STORAGE_DATABASE_VERSION } from "../src/lib/storage/StorageVersion";
import type { Exam, MaterialExamQuestion } from "../src/types/exam";
import type { Flashcard } from "../src/types/flashcard";
import type { QuizQuestion, QuizResult } from "../src/types/quiz";
import type { StudyRecord } from "../src/types/study-engine";
import { createRealStudy } from "./helpers/real-study";

async function putIndexedDBRecord(page: Page, storeName: string, record: unknown) {
  await page.evaluate(
    async ([name, value, version]) =>
      new Promise<void>((resolve, reject) => {
        const scope = localStorage.getItem("studyai:storage-scope") || "guest";
        const databaseName = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
        const request = indexedDB.open(databaseName, version as number);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(name as string, "readwrite");
          transaction.objectStore(name as string).put(value);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    [storeName, record, STORAGE_DATABASE_VERSION] as [string, unknown, number],
  );
}

test.describe("Sprint 56A — Avaliações Adaptativas (Motor & API)", () => {
  test("seleciona questões adaptativas priorizando erros pendentes, nível e diagnóstico de banco", () => {
    const questions: QuizQuestion[] = [
      {
        id: "q-easy-old",
        studyId: "study-1",
        question: "Qual a definição básica de vetor?",
        alternatives: ["Grandeza com módulo, direção e sentido", "Apenas número", "Apenas ângulo", "Nenhuma"],
        correctAnswer: 0,
        explanation: "Vetor possui módulo, direção e sentido.",
        difficulty: "easy",
        createdAt: "2026-11-10T10:00:00.000Z",
      },
      {
        id: "q-medium-err",
        studyId: "study-1",
        question: "Como calcular o produto escalar entre vetores ortogonais?",
        alternatives: ["Zero", "Um", "Infinito", "Negativo"],
        correctAnswer: 0,
        explanation: "Vetores ortogonais têm cosseno de 90° igual a zero.",
        difficulty: "medium",
        createdAt: "2026-11-11T10:00:00.000Z",
      },
      {
        id: "q-hard-recent",
        studyId: "study-1",
        question: "Qual o determinante da matriz jacobiana inversa?",
        alternatives: ["1 / det(J)", "det(J)", "0", "-det(J)"],
        correctAnswer: 0,
        explanation: "Pelo teorema da função inversa.",
        difficulty: "hard",
        createdAt: "2026-11-12T10:00:00.000Z",
      },
    ];

    const errorEntries: ErrorNotebookEntry[] = [
      {
        id: "err-1",
        dedupeKey: "quiz:q-medium-err",
        studyId: "study-1",
        studyTitle: "Álgebra Linear",
        subject: "Matemática",
        topic: "Vetores",
        source: "quiz",
        sourceId: "q-medium-err",
        questionPrompt: "Como calcular o produto escalar entre vetores ortogonais?",
        wrongAnswer: "Um",
        correctAnswer: "Zero",
        status: "pending",
        occurrences: 2,
        reviewCount: 0,
        createdAt: "2026-11-12T10:00:00.000Z",
        lastOccurredAt: "2026-11-13T10:00:00.000Z",
      },
    ];

    const lastResult: QuizResult[] = [
      {
        id: "res-1",
        studyId: "study-1",
        questionIds: ["q-hard-recent"],
        correctAnswers: 1,
        wrongAnswers: 0,
        score: 100,
        createdAt: "2026-11-13T10:00:00.000Z",
        completedAt: "2026-11-13T10:00:00.000Z",
      },
    ];

    const selection = AdaptiveAssessmentEngine.selectAdaptiveQuizQuestions({
      questions,
      results: lastResult,
      errorEntries,
      count: 5,
      mode: "adaptive",
    });

    expect(selection.selectedQuestions.length).toBe(3);
    expect(selection.insufficientBank).toBe(true);
    expect(selection.prioritizedErrorCount).toBe(1);
    expect(selection.selectedQuestions[0].id).toBe("q-medium-err");
    expect(selection.reasonsByQuestionId["q-medium-err"].errorMatched).toBe(true);

    expect(AdaptiveAssessmentEngine.recommendTargetDifficulty(82, [{ ...lastResult[0], score: 40 }])).toBe("medium");
    expect(AdaptiveAssessmentEngine.recommendTargetDifficulty(35, [])).toBe("easy");
  });

  test("prioriza questões de materiais com erros pendentes e calcula confiabilidade transparente", () => {
    const catalog: MaterialExamQuestion[] = [
      {
        id: "mat-q1",
        materialId: "mat-1",
        materialName: "Apostila.pdf",
        studyId: "study-1",
        statement: "Questão já dominada sobre derivada simples",
        alternatives: ["A", "B", "C", "D"],
      },
      {
        id: "mat-q2",
        materialId: "mat-1",
        materialName: "Apostila.pdf",
        studyId: "study-1",
        statement: "Questão difícil de integração por partes",
        alternatives: ["A", "B", "C", "D"],
      },
    ];
    const errors: ErrorNotebookEntry[] = [
      {
        id: "err-mat-1",
        dedupeKey: "exam_material:mat-q2",
        studyId: "study-1",
        studyTitle: "Cálculo",
        subject: "Matemática",
        topic: "Apostila.pdf",
        source: "exam_material",
        sourceId: "mat-q2",
        questionPrompt: "Questão difícil de integração por partes",
        wrongAnswer: "B",
        status: "pending",
        occurrences: 1,
        reviewCount: 0,
        createdAt: "2026-11-14T10:00:00.000Z",
        lastOccurredAt: "2026-11-14T10:00:00.000Z",
      },
    ];
    const previousAttempt = {
      id: "att-1",
      examId: "ex-1",
      disciplineKey: "mat",
      source: "material" as const,
      startedAt: "2026-11-14T09:00:00.000Z",
      questions: [catalog[0]],
      answers: { "mat-q1": { choice: 0 } },
      confirmedKeys: {
        "mat-q1": {
          choice: 0,
          source: "student-document" as const,
          confirmedAt: "2026-11-14T09:05:00.000Z",
          revision: "1",
        },
      },
    } satisfies Exam["materialAttempts"] extends Array<infer T> | undefined ? T : never;

    const matSelection = AdaptiveAssessmentEngine.selectAdaptiveMaterialQuestions({
      questions: catalog,
      errorEntries: errors,
      attempts: [previousAttempt],
      count: 1,
    });
    expect(matSelection.selectedQuestions[0].id).toBe("mat-q2");
    expect(matSelection.prioritizedErrorCount).toBe(1);

    const study = {
      studyId: "study-1",
      title: "Cálculo I",
      subject: "Matemática",
    } as StudyRecord;
    const flashcards: Flashcard[] = [
      {
        id: "fc-due",
        studyId: "study-1",
        question: "Integral de cos(x)?",
        answer: "sen(x)",
        difficulty: "medium",
        createdAt: "2026-11-01T10:00:00.000Z",
        updatedAt: "2026-11-01T10:00:00.000Z",
        correctAnswers: 1,
        wrongAnswers: 0,
        nextReviewAt: "2026-11-10T10:00:00.000Z",
      },
    ];

    const emptyInd = AdaptiveAssessmentEngine.computeReliableIndicators({
      study,
      quizzes: [],
      flashcards,
      errorEntries: errors,
      now: new Date("2026-11-15T12:00:00.000Z"),
    });
    expect(emptyInd.reliability).toBe("insufficient");
    expect(emptyInd.accuracyPercent).toBeNull();
    expect(emptyInd.dueFlashcardsCount).toBe(1);

    const reliableInd = AdaptiveAssessmentEngine.computeReliableIndicators({
      study,
      quizzes: [
        {
          id: "r1",
          studyId: "study-1",
          questionIds: ["1", "2", "3", "4"],
          correctAnswers: 3,
          wrongAnswers: 1,
          score: 75,
          createdAt: "2026-11-12T10:00:00.000Z",
          completedAt: "2026-11-12T10:00:00.000Z",
        },
        {
          id: "r2",
          studyId: "study-1",
          questionIds: ["5", "6", "7", "8"],
          correctAnswers: 4,
          wrongAnswers: 0,
          score: 100,
          createdAt: "2026-11-14T10:00:00.000Z",
          completedAt: "2026-11-14T10:00:00.000Z",
        },
      ],
      flashcards,
      errorEntries: errors,
      now: new Date("2026-11-15T12:00:00.000Z"),
    });
    expect(reliableInd.reliability).toBe("reliable");
    expect(reliableInd.accuracyPercent).toBe(88);
    expect(reliableInd.evolutionDelta).toBe(25);
    expect(reliableInd.nextReviewSteps.some((step) => step.kind === "error_notebook")).toBe(true);
  });

  test("endpoint /api/tutor/quiz rejeita count e difficulty inválidos", async ({ request }) => {
    const response = await request.post("/api/tutor/quiz", {
      data: {
        studyId: "study-1",
        title: "Cálculo",
        subject: "Matemática",
        count: 99,
        difficulty: "impossible",
        chunks: [
          {
            id: "c1",
            studyId: "study-1",
            fileId: "f1",
            fileName: "doc.pdf",
            text: "Derivada mede taxa de variação.",
            score: 1,
            metadata: {},
          },
        ],
      },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe("Sprint 56A — Avaliações Adaptativas (E2E no Navegador)", () => {
  test("executa simulado adaptativo priorizando erro pendente, exibe indicador confiável, plano pós-avaliação e /aprendizagem mobile", async ({ page }) => {
    const studyId = await createRealStudy(
      page,
      "Primeira lei de Newton trata da inércia. Segunda lei: F = m * a.",
    );

    await putIndexedDBRecord(page, "quizzes", {
      id: "quiz-q-base",
      kind: "question",
      studyId,
      question: "O que afirma a Primeira Lei de Newton?",
      alternatives: ["Princípio da inércia", "Ação e reação", "Gravitação", "Entropia"],
      correctAnswer: 0,
      explanation: "Corpos mantêm seu estado de repouso ou MRU sem força resultante.",
      difficulty: "easy",
      createdAt: "2026-11-10T10:00:00.000Z",
      _storageOrder: 0,
    });
    await putIndexedDBRecord(page, "quizzes", {
      id: "quiz-q-erro",
      kind: "question",
      studyId,
      question: "Qual a fórmula da Segunda Lei de Newton?",
      alternatives: ["E = mc^2", "F = m * a", "V = R * I", "P = F / A"],
      correctAnswer: 1,
      explanation: "Força resultante é massa vezes aceleração.",
      difficulty: "medium",
      createdAt: "2026-11-11T10:00:00.000Z",
      _storageOrder: 1,
    });
    await putIndexedDBRecord(page, "metadata", {
      key: "error-notebook-v1",
      updatedAt: "2026-11-14T10:00:00.000Z",
      value: [
        {
          id: "err-newton-2",
          dedupeKey: `quiz:quiz-q-erro:qual a formula da segunda lei de newton`,
          studyId,
          studyTitle: "Física Mecânica",
          subject: "Física",
          topic: "Dinâmica",
          source: "quiz",
          sourceId: "quiz-q-erro",
          questionPrompt: "Qual a fórmula da Segunda Lei de Newton?",
          wrongAnswer: "E = mc^2",
          correctAnswer: "F = m * a",
          status: "pending",
          occurrences: 1,
          reviewCount: 0,
          createdAt: "2026-11-14T10:00:00.000Z",
          lastOccurredAt: "2026-11-14T10:00:00.000Z",
        },
      ],
    });

    await page.goto(`/estudo?tema=${encodeURIComponent(studyId)}&aba=quiz`);
    await expect(page.getByRole("heading", { name: "Simulado & Quiz Explicado" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Amostra insuficiente · 0 q.")).toBeVisible();

    await page.getByRole("button", { name: "Simulado adaptativo" }).click();
    await expect(page.getByText("Erro pendente no Caderno de Erros")).toBeVisible();
    await expect(page.getByText("Qual a fórmula da Segunda Lei de Newton?")).toBeVisible();

    await page.getByRole("button", { name: /F = m \* a/ }).click();
    await page.getByRole("button", { name: "Próxima" }).click();
    await expect(page.getByRole("button", { name: /Princípio da inércia/ })).toBeVisible();
    await page.getByRole("button", { name: /Princípio da inércia/ }).click();
    await page.getByRole("button", { name: "Finalizar Simulado" }).click();

    await expect(page.getByRole("heading", { name: "Quiz concluído" })).toBeVisible();
    await expect(page.getByText("Indicador confiável & Revisão inteligente")).toBeVisible();
    await expect(page.getByText("Revisar 1 erro(s) no Caderno")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/aprendizagem");
    await expect(page.getByRole("heading", { name: "Dificuldades e Caderno de Erros" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Indicadores confiáveis de avaliação")).toBeVisible();
    await expect(page.getByText("Acurácia média:")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
