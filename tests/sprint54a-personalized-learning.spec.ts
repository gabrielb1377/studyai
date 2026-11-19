import { expect, test, type Page } from "@playwright/test";
import { DifficultyMapEngine } from "../src/features/learning/errors/DifficultyMapEngine";
import { mergeErrorEntries } from "../src/features/learning/errors/ErrorNotebookStorage";
import { sanitizeErrorNotebookList } from "../src/features/learning/errors/ErrorNotebookValidation";
import { createEmptyLearningProfile } from "../src/features/learning/LearningStorage";
import { PlanningEngine } from "../src/features/planning/PlanningEngine";
import { STORAGE_DATABASE_VERSION } from "../src/lib/storage/StorageVersion";
import type { Flashcard } from "../src/types/flashcard";
import type { QuizResult } from "../src/types/quiz";
import type { StudyRecord } from "../src/types/study-engine";
import { readIndexedDBStore } from "./helpers/indexed-db";
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

async function deleteIndexedDBRecord(page: Page, storeName: string, key: string) {
  await page.evaluate(
    async ([name, targetKey, version]) =>
      new Promise<void>((resolve, reject) => {
        const scope = localStorage.getItem("studyai:storage-scope") || "guest";
        const databaseName = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
        const request = indexedDB.open(databaseName, version as number);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(name as string, "readwrite");
          transaction.objectStore(name as string).delete(targetKey as string);
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
    [storeName, key, STORAGE_DATABASE_VERSION] as [string, string, number],
  );
}

function makeStudy(overrides: Partial<StudyRecord> & Pick<StudyRecord, "studyId" | "title" | "subject">): StudyRecord {
  const now = "2026-11-10T10:00:00.000Z";
  return {
    materialIds: [],
    status: "in_progress",
    progress: 40,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
    ...overrides,
  };
}

test.describe("Sprint 54A — Aprendizagem Personalizada (Motor & Regras)", () => {
  test("sanitiza registros inválidos, deduplica erros repetidos e reabre itens resolvidos ao errar novamente", () => {
    const sanitized = sanitizeErrorNotebookList([
      null,
      { id: "bad-only-id" },
      {
        id: "err-1",
        dedupeKey: "s1:quiz:q1:questao",
        studyId: "s1",
        studyTitle: "Álgebra Linear",
        subject: "Matemática",
        topic: "Matrizes",
        source: "quiz",
        sourceId: "q1",
        questionPrompt: "Qual o determinante da identidade?",
        wrongAnswer: "0",
        correctAnswer: "1",
        occurrences: 2,
        status: "resolved",
        reviewCount: 1,
        createdAt: "2026-11-10T10:00:00.000Z",
        lastOccurredAt: "2026-11-11T10:00:00.000Z",
      },
    ]);

    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].status).toBe("resolved");
    expect(sanitized[0].occurrences).toBe(2);

    const merged = mergeErrorEntries(
      sanitized,
      [
        {
          dedupeKey: "s1:quiz:q1:questao",
          studyId: "s1",
          studyTitle: "Álgebra Linear",
          subject: "Matemática",
          topic: "Matrizes",
          source: "quiz",
          sourceId: "q1",
          questionPrompt: "Qual o determinante da identidade?",
          wrongAnswer: "2",
          correctAnswer: "1",
        },
      ],
      "2026-11-14T12:00:00.000Z",
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].occurrences).toBe(3);
    expect(merged[0].status).toBe("pending");
    expect(merged[0].wrongAnswer).toBe("2");
  });

  test("diferencia tema sem dados suficientes de tema com domínio ou dificuldade e calcula evolução real", () => {
    const now = new Date("2026-11-14T12:00:00.000Z");
    const profile = {
      ...createEmptyLearningProfile(),
      topics: {
        mastered: {
          studyId: "mastered",
          subject: "Computação",
          topic: "Lógica",
          timeMinutes: 120,
          flashcardsAnswered: 16,
          quizzesCompleted: 1,
          correctAnswers: 18,
          wrongAnswers: 0,
          accessDates: ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"],
          lastAccessedAt: "2026-11-14T10:00:00.000Z",
        },
      },
    };

    const untouchedStudy = makeStudy({ studyId: "untouched", title: "Tema Novo", subject: "Física", progress: 0 });
    const criticalStudy = makeStudy({ studyId: "critical", title: "Cálculo I", subject: "Matemática", progress: 70 });
    const masteredStudy = makeStudy({ studyId: "mastered", title: "Lógica", subject: "Computação", progress: 100 });

    const quizzes: QuizResult[] = [
      {
        id: "q-crit-1",
        studyId: "critical",
        questionIds: ["1", "2"],
        correctAnswers: 0,
        wrongAnswers: 2,
        score: 20,
        createdAt: "2026-11-12T10:00:00.000Z",
        completedAt: "2026-11-12T10:05:00.000Z",
      },
      {
        id: "q-crit-2",
        studyId: "critical",
        questionIds: ["1", "2"],
        correctAnswers: 1,
        wrongAnswers: 1,
        score: 50,
        createdAt: "2026-11-14T10:00:00.000Z",
        completedAt: "2026-11-14T10:05:00.000Z",
      },
      {
        id: "q-mast-1",
        studyId: "mastered",
        questionIds: ["3", "4"],
        correctAnswers: 2,
        wrongAnswers: 0,
        score: 95,
        createdAt: "2026-11-13T10:00:00.000Z",
        completedAt: "2026-11-13T10:05:00.000Z",
      },
    ];

    const flashcards: Flashcard[] = Array.from({ length: 4 }, (_, idx) => ({
      id: `fc-mast-${idx}`,
      studyId: "mastered",
      question: `Q${idx}`,
      answer: `A${idx}`,
      difficulty: "easy",
      createdAt: "2026-11-10T10:00:00.000Z",
      updatedAt: "2026-11-13T10:00:00.000Z",
      correctAnswers: 4,
      wrongAnswers: 0,
      reviewCount: 4,
      nextReviewAt: "2026-11-25T10:00:00.000Z",
    }));

    const errors = mergeErrorEntries(
      [],
      [
        { studyId: "critical", studyTitle: "Cálculo I", subject: "Matemática", source: "quiz", sourceId: "q1", questionPrompt: "Limite fundamental", wrongAnswer: "0", correctAnswer: "1" },
        { studyId: "critical", studyTitle: "Cálculo I", subject: "Matemática", source: "flashcard", sourceId: "fc1", questionPrompt: "Derivada de sen(x)", wrongAnswer: "Avaliado como Errei", correctAnswer: "cos(x)" },
      ],
      now.toISOString(),
    );

    const { items, recommendations } = DifficultyMapEngine.build({
      studies: [untouchedStudy, criticalStudy, masteredStudy],
      profile,
      flashcards,
      quizzes,
      topicReviews: [],
      errorEntries: errors,
      now,
    });

    const critItem = items.find((item) => item.study.studyId === "critical");
    const newItem = items.find((item) => item.study.studyId === "untouched");
    const mastItem = items.find((item) => item.study.studyId === "mastered");

    expect(critItem?.level).toBe("critical");
    expect(critItem?.evolution.hasTrendData).toBe(true);
    expect(critItem?.evolution.delta).toBe(30);
    expect(critItem?.evolution.label).toContain("+30 pts");

    expect(newItem?.level).toBe("insufficient_data");
    expect(newItem?.evolution.hasTrendData).toBe(false);
    expect(newItem?.evolution.label).toBe("Sem tentativas avaliadas");

    expect(mastItem?.level).toBe("mastered");
    expect(mastItem?.evolution.hasTrendData).toBe(false);
    expect(mastItem?.evolution.label).toContain("aguardando mais dados");

    expect(recommendations.some((rec) => rec.studyId === "critical")).toBe(true);
    expect(recommendations.some((rec) => rec.studyId === "untouched")).toBe(false);
  });

  test("integra erros pendentes ao PlanningEngine sem duplicar atividades e mantendo retrocompatibilidade", () => {
    const now = new Date("2026-11-14T12:00:00.000Z");
    const studyA = makeStudy({ studyId: "study-a", title: "Termodinâmica", subject: "Física", progress: 60 });
    const profile = createEmptyLearningProfile();
    const errors = mergeErrorEntries(
      [],
      [{ studyId: "study-a", studyTitle: "Termodinâmica", subject: "Física", source: "quiz", sourceId: "qa", questionPrompt: "Segunda lei", wrongAnswer: "Entropia cai", correctAnswer: "Entropia não diminui" }],
      now.toISOString(),
    );

    const withoutErrors = PlanningEngine.generate(
      { dailyMinutes: 60, horizonDays: 3 },
      { studies: [studyA], profile, flashcards: [], quizzes: [], topicReviews: [], exams: [], now },
    );
    expect(withoutErrors.items.some((item) => item.id.endsWith(":review:error_notebook"))).toBe(false);

    const withErrors = PlanningEngine.generate(
      { dailyMinutes: 60, horizonDays: 3 },
      { studies: [studyA], profile, flashcards: [], quizzes: [], topicReviews: [], exams: [], errorEntries: errors, now },
    );
    const errorReview = withErrors.items.find((item) => item.id === "study-a:review:error_notebook");
    expect(errorReview).toBeDefined();
    expect(errorReview?.targetHref).toContain("/aprendizagem?estudo=study-a");
    expect(new Set(withErrors.items.map((item) => item.id)).size).toBe(withErrors.items.length);
  });
});

test.describe("Sprint 54A — Aprendizagem Personalizada (E2E no Navegador)", () => {
  test("captura automática de Flashcards/Quiz, deduplicação, registro manual, revisão direcionada e integração com Planejamento", async ({ page }) => {
    await page.goto("/aprendizagem");
    await expect(page.getByRole("heading", { name: "Dificuldades e Caderno de Erros" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Nenhum tema avaliado ainda")).toBeVisible();

    const studyId = await createRealStudy(
      page,
      "Estruturas de dados fundamentais: complexidade de busca em vetores e árvores balanceadas.",
    );

    await page.goto("/aprendizagem");
    await expect(page.getByText("Sem dados suficientes", { exact: true })).toBeVisible();
    await expect(page.getByText("Evolução: Sem tentativas avaliadas")).toBeVisible();

    const nowIso = new Date().toISOString();
    await putIndexedDBRecord(page, "flashcards", {
      id: "fc-err-1",
      studyId,
      question: "Qual a complexidade média da busca binária?",
      answer: "O(log n)",
      difficulty: "medium",
      createdAt: nowIso,
      updatedAt: nowIso,
      correctAnswers: 0,
      wrongAnswers: 0,
      reviewCount: 0,
    });
    await putIndexedDBRecord(page, "quizzes", {
      id: "quiz-err-1",
      kind: "question",
      studyId,
      question: "Qual estrutura segue a ordem LIFO?",
      alternatives: ["Fila", "Pilha", "Árvore", "Grafo"],
      correctAnswer: 1,
      explanation: "LIFO significa último a entrar, primeiro a sair (Pilha).",
      difficulty: "easy",
      createdAt: nowIso,
    });

    await page.goto(`/estudo?tema=${encodeURIComponent(studyId)}&aba=flashcards`);
    await page.getByRole("button", { name: "Mostrar resposta" }).click();
    await page.getByRole("button", { name: "Errei" }).click();

    await page.goto(`/estudo?tema=${encodeURIComponent(studyId)}&aba=quiz`);
    await page.getByRole("button", { name: /Fila/ }).click();
    await page.getByRole("button", { name: "Finalizar Simulado" }).click();
    await expect(page.getByText("Quiz concluído")).toBeVisible();

    await page.goto(`/estudo?tema=${encodeURIComponent(studyId)}&aba=flashcards`);
    await page.getByRole("button", { name: "Mostrar resposta" }).click();
    await page.getByRole("button", { name: "Errei" }).click();

    await page.goto("/aprendizagem");
    await expect(page.getByText("Dificuldade alta", { exact: true })).toBeVisible();
    await expect(page.getByText("2 erro(s) pendente(s)", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /Caderno de erros/ }).click();
    await expect(page.getByText("Qual a complexidade média da busca binária?")).toHaveCount(1);
    await expect(page.getByText("Reincidência · 2x")).toBeVisible();
    await expect(page.getByText("Qual estrutura segue a ordem LIFO?")).toBeVisible();

    await page.getByRole("button", { name: "Registrar erro manual" }).click();
    await page.getByLabel("Estudo relacionado").selectOption(studyId);
    await page.getByLabel("Tópico / assunto").fill("Recursão");
    await page.getByLabel("Questão ou conceito que gerou erro *").fill("Esqueci caso base na recursão");
    await page.getByLabel("Erro cometido / dúvida *").fill("Loop infinito em n == 0");
    await page.getByLabel("Resposta correta (opcional)").fill("Retornar antes da chamada recursiva");
    await page.getByRole("button", { name: "Salvar no Caderno de Erros" }).click();
    await expect(page.getByText("Esqueci caso base na recursão")).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: /Caderno de erros/ }).click();
    await expect(page.getByText("Esqueci caso base na recursão")).toBeVisible();
    await expect(page.getByText("Qual estrutura segue a ordem LIFO?")).toBeVisible();

    await page.getByRole("tab", { name: /Revisões direcionadas/ }).click();
    await expect(page.getByText("Urgência Alta")).toBeVisible();
    const reviewLink = page.getByRole("link", { name: "Revisar no Estudo" }).first();
    await expect(reviewLink).toHaveAttribute("href", new RegExp(`/estudo\\?tema=${encodeURIComponent(studyId)}`));

    await page.getByRole("button", { name: "Acertei na revisão" }).first().click();
    await expect(page.getByText(/registrada como acertada/i)).toBeVisible();

    const metadata = await readIndexedDBStore<{ key: string; value: Array<{ studyId: string; correct: number }> }>(page, "metadata");
    const topicReviews = metadata.find((record) => record.key === "topic-reviews-v1")?.value ?? [];
    expect(topicReviews.some((review) => review.studyId === studyId && review.correct >= 1)).toBe(true);

    const studies = await readIndexedDBStore<StudyRecord>(page, "studies");
    const currentStudy = studies.find((item) => item.studyId === studyId);
    expect(currentStudy?.progress).toBe(0);

    await page.goto("/aprendizagem");
    await page.getByRole("tab", { name: /Caderno de erros/ }).click();
    await page.getByRole("button", { name: "Reabrir" }).first().click();

    await page.goto("/planejamento");
    await page.getByRole("button", { name: "Gerar plano inteligente" }).click();
    await expect(page.getByText(/Revisar erros registrados ·/)).toBeVisible();
  });

  test("lida de forma recuperável quando o estudo vinculado é removido", async ({ page }) => {
    const studyId = await createRealStudy(page, "Conteúdo para validar remoção recuperável de erros.");

    await page.goto("/aprendizagem");
    await page.getByRole("button", { name: "Registrar erro manual" }).click();
    await page.getByLabel("Estudo relacionado").selectOption(studyId);
    await page.getByLabel("Questão ou conceito que gerou erro *").fill("Erro em estudo temporário");
    await page.getByLabel("Erro cometido / dúvida *").fill("Resposta incorreta");
    await page.getByRole("button", { name: "Salvar no Caderno de Erros" }).click();
    await expect(page.getByText("Erro em estudo temporário")).toBeVisible();

    await deleteIndexedDBRecord(page, "studies", studyId);
    await page.reload();

    await page.getByRole("tab", { name: /Caderno de erros/ }).click();
    await expect(page.getByText("Erro em estudo temporário")).toBeVisible();
    await expect(page.getByText("Estudo indisponível")).toBeVisible();
    await expect(page.getByRole("link", { name: "Abrir biblioteca" })).toBeVisible();
  });

  test("mantém isolamento entre contas no Caderno de Erros e layout responsivo mobile sem overflow", async ({ page }) => {
    const emailA = `learn-alpha-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
    const emailB = `learn-beta-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
    const password = "StudyAI2026secure";

    await page.goto("/conta");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await page.getByLabel("Nome").fill("Conta Alpha");
    await page.getByLabel("Email").fill(emailA);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });

    await page.goto("/aprendizagem");
    await page.getByRole("button", { name: "Registrar erro manual" }).click();
    await page.getByLabel("Questão ou conceito que gerou erro *").fill("Erro privado da conta Alpha");
    await page.getByLabel("Erro cometido / dúvida *").fill("Detalhe privado Alpha");
    await page.getByRole("button", { name: "Salvar no Caderno de Erros" }).click();
    await expect(page.getByText("Erro privado da conta Alpha")).toBeVisible();

    await page.goto("/conta");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Criar conta" }).click();
    await page.getByLabel("Nome").fill("Conta Beta");
    await page.getByLabel("Email").fill(emailB);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });

    await page.goto("/aprendizagem");
    await page.getByRole("tab", { name: /Caderno de erros/ }).click();
    await expect(page.getByText("Erro privado da conta Alpha")).toHaveCount(0);

    await page.goto("/conta");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Email").fill(emailA);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/aprendizagem");
    await page.getByRole("tab", { name: /Caderno de erros/ }).click();
    await expect(page.getByText("Erro privado da conta Alpha")).toBeVisible();
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBe(false);
  });
});
